#!/usr/bin/env python3
"""
下載 Natural Earth 陸地多邊形到本地檔案
=========================================
解決問題：CDN 載入 NE 10m 太慢 (~6MB) 或 timeout

執行：
  cd preprocess
  pip install requests
  python download_land_polygons.py

會下載到 ../data/land_polygons.json，HTML 自動偵測本地檔優先使用。
"""

import json
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("請先安裝套件：pip install requests")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT = SCRIPT_DIR.parent / "data" / "land_polygons.json"

# 多個 CDN 來源，從高解析到低解析
SOURCES = [
    {
        "name": "Natural Earth 10m (含舟山、澎湖、香港小島；最詳細)",
        "url": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/physical/ne_10m_land.json",
        "size_mb": 6,
    },
    {
        "name": "Natural Earth 10m (jsdelivr mirror)",
        "url": "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/10m/physical/ne_10m_land.json",
        "size_mb": 6,
    },
    {
        "name": "Natural Earth 10m (nvkelso 原始倉庫)",
        "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson",
        "size_mb": 6,
    },
    {
        "name": "Natural Earth 50m (備援，含主要大島)",
        "url": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/physical/ne_50m_land.json",
        "size_mb": 0.2,
    },
]

def download():
    for src in SOURCES:
        print(f"\n⏳ 嘗試下載 {src['name']} (~{src['size_mb']} MB)...")
        print(f"   URL: {src['url']}")
        try:
            r = requests.get(src["url"], timeout=60, stream=True)
            if r.status_code != 200:
                print(f"   ❌ HTTP {r.status_code}")
                continue

            # 邊下載邊顯示進度
            total = int(r.headers.get("content-length", 0))
            buf = bytearray()
            downloaded = 0
            for chunk in r.iter_content(chunk_size=64 * 1024):
                buf.extend(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded / total * 100
                    print(f"\r   下載中... {downloaded/1024/1024:.1f} / {total/1024/1024:.1f} MB ({pct:.0f}%)", end="", flush=True)
                else:
                    print(f"\r   下載中... {downloaded/1024/1024:.1f} MB", end="", flush=True)
            print()

            # 解析 JSON 確認格式正確
            data = json.loads(buf.decode("utf-8"))
            if "features" not in data:
                print("   ❌ 格式錯誤，跳過")
                continue

            # 統計
            poly_count = 0
            for feat in data["features"]:
                g = feat["geometry"]
                if g["type"] == "Polygon":
                    poly_count += 1
                elif g["type"] == "MultiPolygon":
                    poly_count += len(g["coordinates"])

            # 寫入
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
            file_size = OUTPUT.stat().st_size / 1024 / 1024
            print(f"   ✅ 已存到 {OUTPUT}")
            print(f"   📦 多邊形數: {poly_count}, 檔案大小: {file_size:.1f} MB")
            return True

        except Exception as e:
            print(f"\n   ❌ 失敗：{e}")
            continue

    print("\n❌ 所有來源都失敗。可能需要手動下載：")
    print("   https://www.naturalearthdata.com/downloads/10m-physical-vectors/")
    print(f"   下載後存成 {OUTPUT}")
    return False


if __name__ == "__main__":
    ok = download()
    if ok:
        print("\n✅ 完成。重新整理瀏覽器，Console 會顯示「✅ 載入陸地多邊形（本地檔）」")
    sys.exit(0 if ok else 1)
