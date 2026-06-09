#!/usr/bin/env python3
"""
外來船 MMSI 批次查詢工具
=========================
從 data/_top60_external_mmsi.json 讀 MMSI 清單，
逐一查 VesselFinder.com，把結果累積到 data/external_vessels.json。

Usage:
  python lookup_external_vessels.py              # 跑所有未查過的
  python lookup_external_vessels.py --limit 10   # 只跑 10 個
  python lookup_external_vessels.py --mmsi 210646000  # 查單一 MMSI

需求:
  pip install requests beautifulsoup4

注意:
  VesselFinder 對連續請求有節流，每次查詢間隔 5–10 秒比較安全。
  如果遇到太多 timeout，建議分批跑（每天跑 30 個）。
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("請先安裝套件：pip install requests beautifulsoup4")
    sys.exit(1)

# ─── 路徑 ───
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"
EXTERNAL_FILE = DATA_DIR / "external_vessels.json"
TOP_MMSI_FILE = DATA_DIR / "_top60_external_mmsi.json"

# ─── MMSI 國家前綴 → 國旗對照 ───
MID_PREFIX = {
    "210": "🇨🇾 賽普勒斯", "211": "🇩🇪 德國", "215": "🇲🇹 馬爾他",
    "219": "🇩🇰 丹麥", "224": "🇪🇸 西班牙", "227": "🇫🇷 法國",
    "232": "🇬🇧 英國", "235": "🇬🇧 英國", "236": "🇬🇮 直布羅陀",
    "247": "🇮🇹 義大利", "248": "🇲🇹 馬爾他", "249": "🇲🇹 馬爾他",
    "256": "🇲🇹 馬爾他", "261": "🇵🇱 波蘭", "265": "🇸🇪 瑞典",
    "270": "🇱🇹 立陶宛", "273": "🇷🇺 俄羅斯", "303": "🇺🇸 阿拉斯加",
    "311": "🇧🇸 巴哈馬", "316": "🇨🇦 加拿大", "338": "🇺🇸 美國",
    "352": "🇵🇦 巴拿馬", "353": "🇵🇦 巴拿馬", "355": "🇵🇦 巴拿馬",
    "356": "🇵🇦 巴拿馬", "357": "🇵🇦 巴拿馬", "366": "🇺🇸 美國",
    "367": "🇺🇸 美國", "368": "🇺🇸 美國", "369": "🇺🇸 美國",
    "370": "🇵🇦 巴拿馬", "371": "🇵🇦 巴拿馬", "412": "🇨🇳 中國",
    "413": "🇨🇳 中國", "414": "🇨🇳 中國", "416": "🇹🇼 台灣",
    "440": "🇰🇷 韓國", "441": "🇰🇷 韓國", "457": "🇲🇲 緬甸",
    "477": "🇭🇰 香港", "503": "🇦🇺 澳洲", "525": "🇮🇩 印尼",
    "538": "🇲🇭 馬紹爾群島", "563": "🇸🇬 新加坡", "567": "🇹🇭 泰國",
    "577": "🇻🇺 萬那杜", "636": "🇱🇷 賴比瑞亞", "657": "🇳🇬 奈及利亞",
    "664": "🇸🇿 史瓦帝尼", "999": "📍 AtoN (AIS 浮標/燈塔)",
    "992": "📍 AtoN (虛擬導航標)",
}

# ─── 已知操作員規則 (從船名 prefix 推導) ───
NAME_TO_OPERATOR = {
    "MSC ": ("MSC", "Mediterranean Shipping Company", "🇨🇭 瑞士"),
    "MAERSK ": ("Maersk", "A.P. Moller-Maersk", "🇩🇰 丹麥"),
    "EVER ": ("Evergreen", "長榮海運", "🇹🇼 台灣"),
    "CMA CGM ": ("CMA CGM", "CMA CGM Group", "🇫🇷 法國"),
    "COSCO ": ("COSCO", "中遠海運集團", "🇨🇳 中國"),
    "OOCL ": ("OOCL", "東方海外", "🇭🇰 香港"),
    "HMM ": ("HMM", "現代商船", "🇰🇷 韓國"),
    "ONE ": ("ONE", "海洋網聯船務", "🇯🇵 日本"),
    "WAN HAI ": ("Wan Hai", "萬海航運", "🇹🇼 台灣"),
    "ZIM ": ("ZIM", "ZIM Integrated Shipping", "🇮🇱 以色列"),
    "YM ": ("Yang Ming", "陽明海運", "🇹🇼 台灣"),
    "HAPAG ": ("Hapag-Lloyd", "Hapag-Lloyd AG", "🇩🇪 德國"),
}


def get_flag_by_mmsi(mmsi: str) -> str:
    prefix = mmsi[:3]
    return MID_PREFIX.get(prefix, f"❓ ({prefix})")


def infer_operator(name: str):
    name_upper = name.upper()
    for prefix, (op, full, flag) in NAME_TO_OPERATOR.items():
        if name_upper.startswith(prefix):
            return op, full, flag
    return "Unknown", "Unknown Operator", "❓"


def fetch_vessel(mmsi: str, timeout: int = 30):
    """查 VesselFinder by MMSI，回傳 dict 或 None"""
    url = f"https://www.vesselfinder.com/vessels?name={mmsi}"
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; SDataPro Demo Lookup)"}
        r = requests.get(url, headers=headers, timeout=timeout)
        r.raise_for_status()
    except Exception as e:
        return None, str(e)

    soup = BeautifulSoup(r.text, "html.parser")

    if "No results" in r.text:
        return None, "no_results"

    # 找船舶 row
    rows = soup.select("table tr")
    for row in rows:
        a = row.select_one("a[href*='/vessels/details/']")
        if not a:
            continue
        cells = row.select("td")
        if len(cells) < 5:
            continue
        # 解析 IMO
        href = a.get("href", "")
        m = re.search(r"/vessels/details/(\d+)", href)
        imo = m.group(1) if m else None
        # 解析船名（標題中含船型，挑頭部分）
        raw_text = a.get_text(strip=True)
        # 形如 "MSC-RANIA-VIII MSC RANIA VIIIContainer Ship"
        # 取「Container Ship」之前的部分
        match = re.match(r"([\w\s\-]+?)(Container Ship|Bulk|Tanker|General|Tug|Reefer|Ro-Ro|LNG|LPG|Chemical|Oil|Vehicles|Fishing|Yacht|Passenger|Crude)", raw_text)
        if match:
            name_part, type_part = match.groups()
            # 名字會重複: "MSC-RANIA-VIII MSC RANIA VIII"，取後半
            parts = name_part.strip().split()
            half = len(parts) // 2
            if half > 0 and parts[:half] == [p.replace("-"," ") for p in parts[half:]] or len(set(parts[:half])) == len(parts[:half]):
                name = " ".join(parts[half:]) if half > 0 else " ".join(parts)
            else:
                name = " ".join(parts)
            type_name = type_part.strip()
        else:
            name = raw_text
            type_name = "?"

        # 解析 built, GT, DWT, Size
        try:
            built = int(cells[1].get_text(strip=True))
        except (ValueError, IndexError):
            built = None
        try:
            gt_raw = cells[2].get_text(strip=True).replace(",", "")
            gt = int(gt_raw) if gt_raw.isdigit() else None
        except (ValueError, IndexError):
            gt = None
        try:
            dwt_raw = cells[3].get_text(strip=True).replace(",", "")
            dwt = int(dwt_raw) if dwt_raw.isdigit() else None
        except (ValueError, IndexError):
            dwt = None
        size = cells[4].get_text(strip=True) if len(cells) > 4 else "-"
        length_m, beam_m = None, None
        m2 = re.match(r"(\d+)\s*/\s*(\d+)", size)
        if m2:
            length_m = int(m2.group(1))
            beam_m = int(m2.group(2))

        op_short, op_full, op_flag = infer_operator(name)
        flag_label = get_flag_by_mmsi(mmsi)
        return {
            "name": name.strip(),
            "operator": op_short,
            "operator_full": op_full,
            "operator_flag": op_flag,
            "type": type_name,
            "imo": imo,
            "flag": mmsi[:3],
            "flag_label": flag_label,
            "built": built,
            "gt": gt,
            "dwt": dwt,
            "length_m": length_m,
            "beam_m": beam_m,
        }, None
    return None, "no_match_in_html"


def load_existing():
    if not EXTERNAL_FILE.exists():
        return {
            "description": "外來船 (非陽明) 識別資料庫",
            "source": "VesselFinder.com",
            "vessel_count": 0,
            "by_operator": {},
            "vessels": {},
        }
    return json.loads(EXTERNAL_FILE.read_text(encoding="utf-8"))


def save(data):
    # 更新統計
    data["vessel_count"] = len(data["vessels"])
    op_count = {}
    for v in data["vessels"].values():
        op = v.get("operator", "Unknown")
        op_count[op] = op_count.get(op, 0) + 1
    data["by_operator"] = op_count
    EXTERNAL_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mmsi", help="只查單一 MMSI")
    parser.add_argument("--limit", type=int, default=0, help="最多查幾個 (0 = 全部)")
    parser.add_argument("--delay", type=int, default=8, help="每筆間隔秒數")
    args = parser.parse_args()

    existing = load_existing()
    already_known = set(existing["vessels"].keys())

    if args.mmsi:
        targets = [args.mmsi]
    else:
        if not TOP_MMSI_FILE.exists():
            print(f"找不到 {TOP_MMSI_FILE}，請先跑 preprocess_ais.py 產出 top MMSI 清單")
            sys.exit(1)
        all_mmsi = json.loads(TOP_MMSI_FILE.read_text())
        targets = [m for m in all_mmsi if m not in already_known]
        if args.limit > 0:
            targets = targets[: args.limit]

    print(f"待查 MMSI: {len(targets)} 個 (已知 {len(already_known)} 個略過)")
    print(f"預估耗時: {len(targets) * args.delay // 60} 分鐘")

    for i, mmsi in enumerate(targets, 1):
        print(f"\n[{i}/{len(targets)}] {mmsi} ", end="", flush=True)
        # 判斷 AtoN
        if mmsi.startswith("99") and len(mmsi) >= 9:
            existing["vessels"][mmsi] = {
                "name": f"AtoN {mmsi[-4:]}",
                "operator": "Aids to Navigation",
                "operator_full": "AIS 浮標 / 燈塔",
                "operator_flag": "📍",
                "type": "AtoN",
                "flag_label": "📍 導航標",
                "note": "AIS Aid to Navigation (非船舶)",
            }
            print("→ AtoN 浮標")
            save(existing)
            continue

        result, err = fetch_vessel(mmsi)
        if result:
            existing["vessels"][mmsi] = result
            print(f"→ {result['name']} ({result['operator']})")
        else:
            existing["vessels"][mmsi] = {
                "name": f"Unknown ({get_flag_by_mmsi(mmsi)})",
                "operator": "Unknown",
                "flag": mmsi[:3],
                "flag_label": get_flag_by_mmsi(mmsi),
                "lookup_error": err,
            }
            print(f"→ 查無結果 ({err})")

        save(existing)
        if i < len(targets):
            time.sleep(args.delay)

    print(f"\n✅ 完成。external_vessels.json 共 {existing['vessel_count']} 艘")
    print(f"By Operator:")
    for op, n in sorted(existing["by_operator"].items(), key=lambda x: -x[1]):
        print(f"  {op}: {n}")


if __name__ == "__main__":
    main()
