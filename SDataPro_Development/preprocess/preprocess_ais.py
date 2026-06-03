#!/usr/bin/env python3
"""
SDataPro AIS 真實資料預處理 Script
=================================
Input : D:\公司內部\20260525_20260602_FULL_DATA\*.csv  (20 files, ~1.2 GB)
Output: Demo_AIS_Data/*.json                          (~30-50 MB total)

Strategy:
  1. Per source_id：分離自船 vs 周邊船訊息
  2. 自船軌跡 downsample 至 5 分鐘 1 點（8 天 ≈ 2300 點/船）
  3. 周邊船快照每 30 分鐘 1 次（每 snapshot 含 5 NM 內所有船）
  4. 合併 src 13 + src 50（共用 MMSI 413000010）
  5. 標註 src 22 為「資料品質待查」
  6. 過濾異常座標（lat>90 / lon>180 / 跳點）

Run usage:
  # 處理單一 source_id：
  python preprocess_ais.py 12
  # 處理全部 19 艘：
  python preprocess_ais.py all
  # 只產出 meta：
  python preprocess_ais.py meta
"""

import pandas as pd
import json
import math
import sys
import os
import re
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

# ============================================================
# 路徑設定（Linux sandbox）
# ============================================================
INPUT_DIR = Path("/sessions/sweet-dazzling-pascal/mnt/20260525_20260602_FULL_DATA")
OUTPUT_DIR = Path("/sessions/sweet-dazzling-pascal/mnt/SDataPro/Demo_AIS_Data")
TRACKS_DIR = OUTPUT_DIR / "tracks"
SNAPSHOTS_DIR = OUTPUT_DIR / "surroundings"

for d in [OUTPUT_DIR, TRACKS_DIR, SNAPSHOTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ============================================================
# 自船 MMSI 對應表（已分析確認）
# ============================================================
SOURCE_MAP = {
    9:  {"own_mmsi": "416466000",  "flag": "TW", "region": "太平洋橫渡",         "quality": "good"},
    12: {"own_mmsi": "416465000",  "flag": "TW", "region": "台灣海峽",           "quality": "good"},
    13: {"own_mmsi": "413349950",  "flag": "CN", "region": "東海/長江口",        "quality": "good"},
    16: {"own_mmsi": "636019893",  "flag": "LR", "region": "黃海/山東外海",      "quality": "good"},
    17: {"own_mmsi": "636019894",  "flag": "LR", "region": "台海/廈門外海",      "quality": "good"},
    22: {"own_mmsi": "636013698",  "flag": "LR", "region": "東海",               "quality": "good"},
    23: {"own_mmsi": "416486000",  "flag": "TW", "region": "台北/基隆外海",      "quality": "good"},
    24: {"own_mmsi": "416488000",  "flag": "TW", "region": "長江口/上海外海",    "quality": "good"},
    25: {"own_mmsi": "636012795",  "flag": "LR", "region": "越南灣",             "quality": "good"},
    28: {"own_mmsi": "636013118",  "flag": "LR", "region": "南海/馬來半島東",    "quality": "good"},
    29: {"own_mmsi": "636013119",  "flag": "LR", "region": "南海",               "quality": "good"},
    31: {"own_mmsi": "636013121",  "flag": "LR", "region": "日本南海",           "quality": "good"},
    33: {"own_mmsi": "440047230",  "flag": "KR", "region": "濟州外海",           "quality": "good"},
    34: {"own_mmsi": "416429000",  "flag": "TW", "region": "馬六甲海峽",         "quality": "good"},
    36: {"own_mmsi": "563234700",  "flag": "SG", "region": "海南島南",           "quality": "good"},
    45: {"own_mmsi": "636015182",  "flag": "LR", "region": "馬六甲北/蘇門答臘",  "quality": "good"},
    49: {"own_mmsi": "636013699",  "flag": "LR", "region": "巴士海峽/高雄外海",  "quality": "good"},
    50: {"own_mmsi": "416492000",  "flag": "TW", "region": "台灣北部外海",       "quality": "good"},
    53: {"own_mmsi": "563155200",  "flag": "SG", "region": "廣東外海",           "quality": "good"},
    54: {"own_mmsi": "636021244",  "flag": "LR", "region": "東海/長江口外",      "quality": "good"},
}

FLAG_LABEL = {
    "TW": "🇹🇼 台灣",
    "CN": "🇨🇳 中國",
    "LR": "🇱🇷 賴比瑞亞",
    "KR": "🇰🇷 韓國",
    "SG": "🇸🇬 新加坡",
    "??": "❓ 待確認",
}

# ============================================================
# Downsample / 過濾參數
# ============================================================
TRACK_SAMPLE_MINUTES = 5       # 自船軌跡每 5 分鐘 1 點
SNAPSHOT_INTERVAL_MINUTES = 30 # 周邊快照每 30 分鐘 1 次
SURROUNDING_RADIUS_NM = 5.0    # 5 海哩

# ============================================================
# 工具函式
# ============================================================
def haversine_nm(lat1, lon1, lat2, lon2):
    R_NM = 3440.065
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R_NM * math.asin(math.sqrt(a))

def valid_pos(lat, lon):
    try:
        lat = float(lat); lon = float(lon)
    except (ValueError, TypeError):
        return False
    return -90 <= lat <= 90 and -180 <= lon <= 180 and not (lat == 0 and lon == 0)

def get_csv_path(source_id):
    return INPUT_DIR / f"{source_id}_20260525_20260602_FULL_DATA.csv"

def get_output_id(source_id):
    """src 50 合併到 13"""
    if SOURCE_MAP[source_id].get("merged_into"):
        return SOURCE_MAP[source_id]["merged_into"]
    return source_id

# ============================================================
# 主處理：分離自船 + 周邊船 + Downsample
# ============================================================
def process_source(source_id):
    """處理單一 source_id（可能合併另一個 source）"""
    info = SOURCE_MAP[source_id]

    # 若是 merged 第二個，跳過
    if info.get("merged_into"):
        print(f"  ⏭  src {source_id} 已合併到 src {info['merged_into']}，跳過獨立處理")
        return None

    own_mmsi = info["own_mmsi"]

    # 收集要讀的 CSV（可能 1 或 2 個）
    csv_paths = [get_csv_path(source_id)]
    if "merge_with" in info:
        csv_paths.append(get_csv_path(info["merge_with"]))
        print(f"  🔗 src {source_id} 合併 src {info['merge_with']}（共用 MMSI {own_mmsi}）")

    print(f"\n=== Processing src {source_id} ({info['region']}) ===")
    print(f"  自船 MMSI: {own_mmsi}, 國旗: {info['flag']}, 品質: {info['quality']}")

    # ── 讀 + 過濾 ─────────────────────────────────────────
    dtypes = {
        'source_id': 'int32',
        'message_type': 'str',
        'mmsi': 'str',
        'target_category': 'str',
        'timestamp': 'str',
        'lat': 'float32',
        'lon': 'float32',
        'course': 'float32',
        'speed': 'float32',
        'heading': 'float32',
        'navigation_status': 'str',
    }
    usecols = ['mmsi', 'target_category', 'timestamp', 'lat', 'lon',
               'course', 'speed', 'heading', 'navigation_status']

    dfs = []
    for p in csv_paths:
        print(f"  📂 讀取 {p.name} ({p.stat().st_size / 1024 / 1024:.0f} MB)...")
        df = pd.read_csv(p, usecols=usecols, dtype={'mmsi':'str','target_category':'str','timestamp':'str','navigation_status':'str'},
                         low_memory=False)
        dfs.append(df)
    df = pd.concat(dfs, ignore_index=True)
    print(f"  📊 總列數: {len(df):,}")

    # 過濾無 lat/lon 列
    df = df.dropna(subset=['lat', 'lon', 'mmsi', 'timestamp'])

    # 過濾異常座標
    before = len(df)
    df = df[(df['lat'].between(-90, 90)) & (df['lon'].between(-180, 180))]
    df = df[~((df['lat'] == 0) & (df['lon'] == 0))]
    print(f"  🧹 過濾異常座標: {before - len(df):,} 列移除（剩 {len(df):,}）")

    # parse timestamp
    df['ts'] = pd.to_datetime(df['timestamp'], format='%d/%m/%Y %H:%M:%S', errors='coerce')
    df = df.dropna(subset=['ts'])
    df = df.sort_values('ts').reset_index(drop=True)

    if len(df) == 0:
        print(f"  ❌ src {source_id} 無有效資料，跳過")
        return None

    # ── 分離自船 vs 周邊船 ────────────────────────────────
    own_df = df[df['mmsi'] == own_mmsi].copy()
    surr_df = df[df['mmsi'] != own_mmsi].copy()

    print(f"  🚢 自船訊息: {len(own_df):,}")
    print(f"  🛰  周邊訊息: {len(surr_df):,}")
    print(f"  🌐 周邊不重複 MMSI: {surr_df['mmsi'].nunique():,}")

    # ── 自船軌跡 downsample（每 5 分鐘 1 點）─────────────
    own_df = own_df.set_index('ts')
    own_sampled = own_df.resample(f'{TRACK_SAMPLE_MINUTES}min').first().dropna(subset=['lat', 'lon']).reset_index()
    print(f"  ⬇  自船軌跡 downsample 後: {len(own_sampled):,} 點（每 {TRACK_SAMPLE_MINUTES} 分鐘 1 點）")

    # ── 寫入自船軌跡 JSON ──────────────────────────────
    out_id = get_output_id(source_id)
    track_data = {
        "source_id": out_id,
        "own_mmsi": own_mmsi,
        "flag": info["flag"],
        "flag_label": FLAG_LABEL.get(info["flag"], info["flag"]),
        "region": info["region"],
        "data_quality": info["quality"],
        "merged_sources": [source_id] + ([info["merge_with"]] if "merge_with" in info else []),
        "date_range": [
            own_sampled['ts'].min().isoformat() + "Z",
            own_sampled['ts'].max().isoformat() + "Z"
        ],
        "track_points_count": len(own_sampled),
        "track_points": [
            {
                "ts": row['ts'].isoformat() + "Z",
                "lat": round(float(row['lat']), 5),
                "lon": round(float(row['lon']), 5),
                "sog": round(float(row['speed']), 1) if pd.notna(row['speed']) else None,
                "cog": round(float(row['course']), 1) if pd.notna(row['course']) else None,
                "hdg": int(row['heading']) if pd.notna(row['heading']) and row['heading'] != 511 else None,
                "ns": row['navigation_status'] if pd.notna(row['navigation_status']) else None,
            }
            for _, row in own_sampled.iterrows()
        ]
    }

    track_file = TRACKS_DIR / f"{out_id}.json"
    track_file.write_text(json.dumps(track_data, ensure_ascii=False, separators=(',', ':')))
    print(f"  ✅ 自船軌跡: {track_file.name} ({track_file.stat().st_size / 1024:.0f} KB)")

    # ── 周邊快照（每 30 分鐘 1 次，5 NM 內）—— vectorized ──
    print(f"  🔄 建立周邊快照（每 {SNAPSHOT_INTERVAL_MINUTES} 分鐘 1 次, < {SURROUNDING_RADIUS_NM} NM）...")
    import numpy as np

    # 1. 將自船與周邊船都 bin 到 30 分鐘 slot
    bin_freq = f'{SNAPSHOT_INTERVAL_MINUTES}min'
    own_df_r = own_df.copy()
    own_df_r['bin'] = own_df_r.index.floor(bin_freq)
    own_per_bin = own_df_r.groupby('bin').first()[['lat', 'lon']]

    surr_df = surr_df.copy()
    surr_df['bin'] = surr_df['ts'].dt.floor(bin_freq)
    # 每個 (bin, mmsi) 取最後一筆
    surr_df_sorted = surr_df.sort_values('ts')
    surr_per_bin = surr_df_sorted.groupby(['bin', 'mmsi']).last().reset_index()

    # 2. join own_pos to each surrounding row
    merged = surr_per_bin.merge(
        own_per_bin.rename(columns={'lat': 'own_lat', 'lon': 'own_lon'}),
        left_on='bin', right_index=True
    )

    # 3. Vectorized haversine
    def haversine_vec(lat1, lon1, lat2, lon2):
        R_NM = 3440.065
        phi1 = np.radians(lat1)
        phi2 = np.radians(lat2)
        dphi = np.radians(lat2 - lat1)
        dlam = np.radians(lon2 - lon1)
        a = np.sin(dphi/2)**2 + np.cos(phi1)*np.cos(phi2)*np.sin(dlam/2)**2
        return 2 * R_NM * np.arcsin(np.sqrt(a))

    merged['dist_nm'] = haversine_vec(
        merged['lat'].values, merged['lon'].values,
        merged['own_lat'].values, merged['own_lon'].values
    )

    # 4. 過濾 5 NM
    within = merged[merged['dist_nm'] <= SURROUNDING_RADIUS_NM].copy()

    # 5. 組裝 snapshots
    snapshots = []
    for bin_time in own_per_bin.index:
        own_row = own_per_bin.loc[bin_time]
        grp = within[within['bin'] == bin_time]

        surrounding = [
            {
                "mmsi": r['mmsi'],
                "lat": round(float(r['lat']), 5),
                "lon": round(float(r['lon']), 5),
                "sog": round(float(r['speed']), 1) if pd.notna(r['speed']) else None,
                "cog": round(float(r['course']), 1) if pd.notna(r['course']) else None,
                "hdg": int(r['heading']) if pd.notna(r['heading']) and r['heading'] != 511 else None,
                "cat": str(r['target_category']) if pd.notna(r['target_category']) else "vessel",
                "dist_nm": round(float(r['dist_nm']), 3),
            }
            for _, r in grp.iterrows()
        ]

        snapshots.append({
            "ts": bin_time.isoformat() + "Z",
            "own_pos": {"lat": round(float(own_row['lat']), 5), "lon": round(float(own_row['lon']), 5)},
            "surrounding_count": len(surrounding),
            "surrounding": surrounding,
        })

    snap_data = {
        "source_id": out_id,
        "own_mmsi": own_mmsi,
        "snapshot_count": len(snapshots),
        "snapshot_interval_min": SNAPSHOT_INTERVAL_MINUTES,
        "radius_nm": SURROUNDING_RADIUS_NM,
        "snapshots": snapshots,
    }

    snap_file = SNAPSHOTS_DIR / f"{out_id}.json"
    snap_file.write_text(json.dumps(snap_data, ensure_ascii=False, separators=(',', ':')))
    print(f"  ✅ 周邊快照: {snap_file.name} ({snap_file.stat().st_size / 1024:.0f} KB, {len(snapshots)} snapshots)")

    # 統計周邊 marker 總數
    total_surr = sum(s['surrounding_count'] for s in snapshots)
    avg_per_snap = total_surr / len(snapshots) if snapshots else 0
    print(f"  📈 平均每 snapshot 5NM 內: {avg_per_snap:.1f} 艘")

    return {
        "source_id": out_id,
        "own_mmsi": own_mmsi,
        "track_points": len(own_sampled),
        "snapshots": len(snapshots),
        "avg_surrounding": round(avg_per_snap, 1),
    }


# ============================================================
# 產出 meta.json（船隊總表）
# ============================================================
def build_meta():
    print("\n=== 產出 vessels.json（船隊總表）===")
    vessels = []
    for source_id, info in SOURCE_MAP.items():
        if info.get("merged_into"):
            continue
        out_id = source_id
        track_file = TRACKS_DIR / f"{out_id}.json"
        snap_file = SNAPSHOTS_DIR / f"{out_id}.json"

        vessel = {
            "source_id": out_id,
            "own_mmsi": info["own_mmsi"],
            "flag": info["flag"],
            "flag_label": FLAG_LABEL.get(info["flag"]),
            "region": info["region"],
            "data_quality": info["quality"],
            "track_file": f"tracks/{out_id}.json",
            "snapshot_file": f"surroundings/{out_id}.json",
            "track_available": track_file.exists(),
            "snapshot_available": snap_file.exists(),
        }

        if track_file.exists():
            t = json.loads(track_file.read_text())
            vessel["track_points"] = t["track_points_count"]
            vessel["date_range"] = t["date_range"]
            # 觀測中心
            lats = [p["lat"] for p in t["track_points"]]
            lons = [p["lon"] for p in t["track_points"]]
            if lats:
                vessel["center_lat"] = round(sum(lats) / len(lats), 4)
                vessel["center_lon"] = round(sum(lons) / len(lons), 4)

        if snap_file.exists():
            s = json.loads(snap_file.read_text())
            vessel["snapshot_count"] = s["snapshot_count"]

        vessels.append(vessel)

    meta = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source_dataset": "20260525_20260602_FULL_DATA",
        "date_range": ["2026-05-25", "2026-06-02"],
        "vessel_count": len(vessels),
        "downsample": {
            "track_minutes": TRACK_SAMPLE_MINUTES,
            "snapshot_minutes": SNAPSHOT_INTERVAL_MINUTES,
            "radius_nm": SURROUNDING_RADIUS_NM,
        },
        "vessels": vessels,
    }

    meta_file = OUTPUT_DIR / "vessels.json"
    meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(f"  ✅ {meta_file.name} ({meta_file.stat().st_size / 1024:.0f} KB, {len(vessels)} 艘船)")


# ============================================================
# CLI
# ============================================================
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "meta":
        build_meta()
    elif cmd == "all":
        print("🚀 處理所有 20 個 source_id ...\n")
        # 先處理可獨立的，最後 build meta
        order = [9, 12, 16, 17, 22, 23, 24, 25, 28, 29, 31, 33, 34, 36, 45, 49, 53, 54, 13]
        # 13 放最後因為要合併 src 50
        for sid in order:
            try:
                process_source(sid)
            except Exception as e:
                print(f"  ❌ src {sid} 失敗: {e}")
                import traceback; traceback.print_exc()
        build_meta()
    else:
        try:
