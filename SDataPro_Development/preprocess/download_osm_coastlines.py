#!/usr/bin/env python3
"""
下載 OpenStreetMap 海岸線到本機
===================================
比 Natural Earth 10m 更精準 ──含：
  - 港口填海擴建區（岱山港、寧波港、上海港、高雄港、釜山港等）
  - 防波堤、碼頭、棧橋
  - 所有小島礁石

策略：
  1. 用 Overpass API 查 YM 主要作業海域的 OSM coastline ways
  2. 採線段（LineString）而非多邊形 ──HTML 用 line-line 交叉判定
  3. 用 Douglas-Peucker 簡化算法降低檔案大小（精度 0.0001° ≈ 11m）
  4. 輸出 data/osm_coastlines.json （壓縮 JSON）

執行：
  cd preprocess
  pip install requests
  python download_osm_coastlines.py

執行時間：5–15 分鐘（依 Overpass 伺服器負載）
輸出大小：~5–20 MB
"""

import json
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("請先安裝套件：pip install requests")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT = SCRIPT_DIR.parent / "data" / "osm_coastlines.json"

# Overpass API 端點（多個備援）
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# YM 海運主要作業海域（south, west, north, east）
# 較小 bbox → 較快查詢 + 較不會 timeout
REGIONS = {
    # 中國沿岸
    "上海-舟山":      (29.5, 121.0, 31.5, 123.5),
    "杭州灣":         (30.0, 120.5, 31.0, 122.0),
    "寧波-台州":      (28.0, 121.0, 30.0, 123.0),
    "溫州-福州":      (25.5, 119.0, 28.0, 121.0),
    "廈門-汕頭":      (23.0, 117.0, 25.5, 119.5),
    "深圳-香港":      (22.0, 113.5, 23.5, 115.0),
    "珠海-澳門":      (21.5, 112.5, 22.5, 114.0),

    # 台灣
    "基隆-台北":      (24.5, 121.0, 25.5, 122.5),
    "台中-高雄":      (22.0, 119.5, 24.5, 121.0),
    "巴士海峽":       (21.0, 120.0, 22.5, 122.0),

    # 日韓
    "釜山-濟州":      (33.0, 125.0, 36.0, 130.0),
    "九州-下關":      (32.0, 128.5, 35.0, 132.0),
    "東京灣":         (34.5, 138.5, 36.0, 141.0),

    # 東南亞
    "新加坡":         (1.0, 103.0, 1.6, 104.5),
    "馬六甲":         (1.5, 100.5, 4.0, 103.0),
    "蘇門答臘北":     (3.5, 95.0, 6.0, 99.0),
    "胡志明":         (10.0, 106.0, 11.5, 107.5),
    "海防":           (20.5, 106.0, 21.5, 107.5),
    "海南島":         (18.0, 108.0, 20.5, 111.0),
    "三亞-海口":      (17.5, 108.5, 20.5, 111.0),
    "湄公河口":       (10.0, 105.5, 11.5, 106.5),
}


def fetch_region(name, bbox, max_retries=3):
    """查 Overpass API 取得某 bbox 內所有 natural=coastline 的 ways"""
    s, w, n, e = bbox
    # 同時抓 coastline (海岸) + man_made=pier (棧橋) + man_made=breakwater (防波堤)
    query = f"""
    [out:json][timeout:90];
    (
      way["natural"="coastline"]({s},{w},{n},{e});
      way["man_made"="pier"]({s},{w},{n},{e});
      way["man_made"="breakwater"]({s},{w},{n},{e});
    );
    (._;>;);
    out body;
    """
    for endpoint in OVERPASS_ENDPOINTS:
        for attempt in range(max_retries):
            try:
                print(f"   ⏳ 查詢 {name} ({endpoint.split('//')[1].split('/')[0]})...", end=" ", flush=True)
                r = requests.post(endpoint, data={"data": query}, timeout=120)
                if r.status_code == 429:
                    print("rate limit, wait 30s")
                    time.sleep(30)
                    continue
                if r.status_code == 504:
                    print("gateway timeout, try next")
                    break
                r.raise_for_status()
                data = r.json()
                ways_count = len([e for e in data.get("elements", []) if e["type"] == "way"])
                nodes_count = len([e for e in data.get("elements", []) if e["type"] == "node"])
                print(f"✅ {ways_count} ways / {nodes_count} nodes")
                return data
            except requests.exceptions.Timeout:
                print(f"timeout (重試 {attempt+1}/{max_retries})")
            except Exception as ex:
                print(f"❌ {ex}")
                break
            time.sleep(2)
    print(f"   ⚠ {name} 全部端點都失敗，跳過")
    return None


def douglas_peucker(points, epsilon):
    """Ramer-Douglas-Peucker 簡化線段（去掉冗餘節點）"""
    if len(points) <= 2:
        return points

    def perpendicular_distance(point, line_start, line_end):
        if line_start == line_end:
            return ((point[0] - line_start[0]) ** 2 + (point[1] - line_start[1]) ** 2) ** 0.5
        x0, y0 = point
        x1, y1 = line_start
        x2, y2 = line_end
        num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
        den = ((y2 - y1) ** 2 + (x2 - x1) ** 2) ** 0.5
        return num / den if den > 0 else 0

    max_dist = 0
    index = 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > max_dist:
            max_dist = d
            index = i

    if max_dist > epsilon:
        left = douglas_peucker(points[:index + 1], epsilon)
        right = douglas_peucker(points[index:], epsilon)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]


def process_data(all_data, simplify_epsilon=0.0001):
    """將多個 Overpass 結果合併、簡化、轉成 GeoJSON LineString"""
    all_lines = []
    total_nodes_before = 0
    total_nodes_after = 0
    for region_name, data in all_data.items():
        if not data:
            continue
        nodes = {}
        for elem in data["elements"]:
            if elem["type"] == "node":
                nodes[elem["id"]] = [elem["lon"], elem["lat"]]
        for elem in data["elements"]:
            if elem["type"] == "way" and "nodes" in elem:
                coords = [nodes[n] for n in elem["nodes"] if n in nodes]
                if len(coords) < 2:
                    continue
                total_nodes_before += len(coords)
                # 簡化
                simplified = douglas_peucker(coords, simplify_epsilon)
                total_nodes_after += len(simplified)
                all_lines.append(simplified)

    print(f"\n📊 統計:")
    print(f"   線段數: {len(all_lines):,}")
    print(f"   節點數: {total_nodes_before:,} → 簡化後 {total_nodes_after:,} "
          f"({total_nodes_after / max(total_nodes_before, 1) * 100:.1f}%)")

    gj = {
        "type": "FeatureCollection",
        "source": "OpenStreetMap (via Overpass API)",
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "regions_queried": list(REGIONS.keys()),
        "simplify_epsilon_deg": simplify_epsilon,
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": line},
                "properties": {}
            }
            for line in all_lines
        ]
    }
    return gj


def main():
    print(f"🌐 OSM 海岸線下載 (Overpass API)")
    print(f"📍 共 {len(REGIONS)} 個區域")
    print(f"💾 輸出: {OUTPUT}\n")

    all_data = {}
    for i, (name, bbox) in enumerate(REGIONS.items(), 1):
        print(f"[{i}/{len(REGIONS)}] {name} (bbox {bbox})")
        data = fetch_region(name, bbox)
        all_data[name] = data
        if i < len(REGIONS):
            time.sleep(3)  # 禮貌間隔

    print("\n🔧 處理中（簡化線段）...")
    gj = process_data(all_data)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(gj, separators=(",", ":")), encoding="utf-8")
    size_mb = OUTPUT.stat().st_size / 1024 / 1024
    print(f"\n✅ 已存到 {OUTPUT}")
    print(f"   檔案大小: {size_mb:.2f} MB")
    print(f"\n🔄 重新整理瀏覽器，Console 會顯示「✅ 載入 OSM 海岸線」")


if __name__ == "__main__":
    main()
