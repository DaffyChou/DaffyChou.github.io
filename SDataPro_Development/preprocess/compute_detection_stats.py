#!/usr/bin/env python3
"""
外來 AIS 偵測起迄時間統計
==========================
掃描 data/surroundings/*.json，對每個被觀測過的 MMSI（不論船 / 浮標 / 基地台），
計算：
  - first_ts:  全船隊範圍內首次偵測時間
  - last_ts:   末次偵測時間
  - total_obs: 總觀測快照次數
  - duration_h: 偵測時長（小時）
  - observed_by: 被哪幾艘自船 (source_id) 偵測到
  - per_source: 各自船的首/末時間、次數
  - cat:       AIS 類別 (vessel/aton/base_station/...)

輸出: data/external_detection_stats.json
（HTML 載入後，在右側周邊船卡片顯示「觀測 首→末 (N 次)」）

執行：
  cd preprocess
  python compute_detection_stats.py
"""

import json
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"
SURR_DIR = DATA_DIR / "surroundings"
OUTPUT = DATA_DIR / "external_detection_stats.json"


def main():
    files = sorted(SURR_DIR.glob("*.json"))
    print(f"📂 找到 {len(files)} 個自船 surroundings 檔案")

    # mmsi -> dict
    stats = {}

    for f in files:
        src_id = f.stem  # e.g. "9"
        try:
            with f.open(encoding="utf-8") as fp:
                data = json.load(fp)
        except Exception as e:
            print(f"  ⚠ {f.name} 讀取失敗：{e}")
            continue

        snapshots = data.get("snapshots", [])
        print(f"  src {src_id}: {len(snapshots)} snapshots", end=" ")

        # 收集這艘船看到的 MMSI → 觀測 timestamp 列表
        local_obs = {}  # mmsi -> {ts_list, cat}
        for snap in snapshots:
            ts = snap["ts"]
            for surr in snap.get("surrounding", []):
                m = surr["mmsi"]
                cat = surr.get("cat", "vessel")
                if m not in local_obs:
                    local_obs[m] = {"ts_list": [], "cat": cat}
                local_obs[m]["ts_list"].append(ts)

        print(f"→ 看到 {len(local_obs)} 個獨立 MMSI")

        # 合併到全域 stats
        for m, info in local_obs.items():
            ts_list = info["ts_list"]
            first_ts = min(ts_list)
            last_ts = max(ts_list)
            count = len(ts_list)

            if m not in stats:
                stats[m] = {
                    "cat": info["cat"],
                    "first_ts": first_ts,
                    "last_ts": last_ts,
                    "total_obs": 0,
                    "observed_by": [],
                    "per_source": {},
                }

            entry = stats[m]
            entry["total_obs"] += count
            if first_ts < entry["first_ts"]:
                entry["first_ts"] = first_ts
            if last_ts > entry["last_ts"]:
                entry["last_ts"] = last_ts
            if src_id not in entry["observed_by"]:
                entry["observed_by"].append(src_id)
            entry["per_source"][src_id] = {
                "first_ts": first_ts,
                "last_ts": last_ts,
                "count": count,
            }

    # 計算 duration_h
    for m, entry in stats.items():
        try:
            t0 = datetime.fromisoformat(entry["first_ts"].replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(entry["last_ts"].replace("Z", "+00:00"))
            entry["duration_h"] = round((t1 - t0).total_seconds() / 3600, 2)
        except Exception:
            entry["duration_h"] = None
        entry["observed_by"].sort(key=lambda x: int(x))

    # 統計分類
    by_cat = {}
    for entry in stats.values():
        by_cat[entry["cat"]] = by_cat.get(entry["cat"], 0) + 1

    # 精簡版 (給前端用) — 不含 per_source 明細，縮減 key 名稱
    compact = {}
    for m, e in stats.items():
        compact[m] = {
            "c": e["cat"],          # cat
            "f": e["first_ts"],     # first_ts
            "l": e["last_ts"],      # last_ts
            "n": e["total_obs"],    # total_obs
            "d": e["duration_h"],   # duration_h
            "b": e["observed_by"],  # observed_by (source_id list)
        }

    output = {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "description": "外來 AIS 偵測起迄時間統計（跨 20 艘自船）",
        "total_unique_mmsi": len(stats),
        "by_cat": by_cat,
        "source_files": [f.name for f in files],
        "schema": {
            "c": "cat (vessel/aton/base_station/...)",
            "f": "first_ts (UTC ISO)",
            "l": "last_ts (UTC ISO)",
            "n": "total observations across fleet",
            "d": "duration in hours",
            "b": "list of observing source_id",
        },
        "stats": compact,
    }

    # 額外另存一份完整版（含 per_source）給未來分析用
    full_output = {
        "generated_at": output["generated_at"],
        "stats_full": stats,
    }
    full_path = OUTPUT.parent / "external_detection_stats_full.json"
    full_path.write_text(
        json.dumps(full_output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\n✅ 已輸出 {OUTPUT}")
    print(f"   檔案大小: {size_kb:.1f} KB")
    print(f"   獨立 MMSI 數: {len(stats):,}")
    print(f"   按類別: {by_cat}")

    # 列出 Top 10 最常被偵測 MMSI
    top10 = sorted(stats.items(), key=lambda kv: -kv[1]["total_obs"])[:10]
    print(f"\n📊 Top 10 最常被偵測 MMSI:")
    print(f"   {'MMSI':<12} {'類別':<14} {'次數':>6} {'時長(h)':>8}  首次 → 末次")
    for m, e in top10:
        print(
            f"   {m:<12} {e['cat']:<14} {e['total_obs']:>6} "
            f"{e['duration_h'] or 0:>8.1f}  {e['first_ts'][:16]} → {e['last_ts'][:16]}"
        )


if __name__ == "__main__":
    main()
