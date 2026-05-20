#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rebuild.py — 一條龍：xlsx → JSON → HTML

用法：
  python rebuild.py <input.xlsx>            # 產出單一 HTML（覆寫前一版）
  python rebuild.py <input.xlsx> --archive  # 同時保留歷史 JSON 在 data/ 下

範例：
  python rebuild.py "船訊網_SDataPro_AIS資料比較_20260526.xlsx"
  → 產出：
    SDataPro_Customer_Briefing.html
    SDataPro_Full_Report.html
    data/latest.json           （永遠是最新）
    data/20260526.json         （若加 --archive）
    更新 data/index.json

只要 push 到 GitHub，網頁就會立即顯示新資料。
"""

import argparse, json, os, sys, shutil

# 把同目錄的兩個工具當模組匯入
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

try:
    import openpyxl  # noqa
except ImportError:
    print("錯誤：缺少 openpyxl 套件。請執行 `pip install openpyxl`")
    sys.exit(1)


def xlsx_to_data_dict(xlsx_path):
    """從 xlsx 產生 data dict（套用 convert_xlsx_to_json.py 的邏輯）"""
    import subprocess, tempfile
    convert_script = os.path.join(SCRIPT_DIR, 'convert_xlsx_to_json.py')
    
    with tempfile.NamedTemporaryFile(mode='r', suffix='.json', delete=False, encoding='utf-8') as f:
        tmp_json = f.name
    
    try:
        result = subprocess.run(
            ['python3', convert_script, xlsx_path, tmp_json],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(result.stdout)
            print(result.stderr)
            raise RuntimeError("convert_xlsx_to_json.py 執行失敗")
        print(result.stdout)
        
        with open(tmp_json, 'r', encoding='utf-8') as f:
            return json.load(f)
    finally:
        if os.path.exists(tmp_json):
            os.unlink(tmp_json)


def main():
    ap = argparse.ArgumentParser(description='Rebuild reports from xlsx (one-step)')
    ap.add_argument('xlsx', help='Input xlsx file')
    ap.add_argument('--archive', action='store_true', help='Keep dated JSON snapshot in data/')
    ap.add_argument('--output-dir', default=SCRIPT_DIR, help='Output dir (default: script dir)')
    args = ap.parse_args()
    
    if not os.path.exists(args.xlsx):
        print(f"錯誤：找不到 {args.xlsx}")
        sys.exit(1)
    
    print(f"🔄 Step 1/2: 轉換 {args.xlsx} → JSON")
    data = xlsx_to_data_dict(args.xlsx)
    
    # 儲存為 latest.json
    data_dir = os.path.join(args.output_dir, 'data')
    os.makedirs(data_dir, exist_ok=True)
    latest_json = os.path.join(data_dir, 'latest.json')
    with open(latest_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f"  ✓ {latest_json}")
    
    # 歷史快照（選用）
    if args.archive:
        date_label = data['meta'].get('date_label', '').replace('-', '')
        if not date_label:
            date_label = data['meta'].get('report_date', '').replace('/', '')
        dated_json = os.path.join(data_dir, f'{date_label}.json')
        shutil.copy(latest_json, dated_json)
        print(f"  ✓ {dated_json} (archive)")
        
        # 更新 index.json
        index_path = os.path.join(data_dir, 'index.json')
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                idx = json.load(f)
        else:
            idx = {'datasets': [], 'default': '', 'schema_version': '1.0'}
        
        # 移除同日期既有條目（如果有）後再加入
        new_file = f'{date_label}.json'
        idx['datasets'] = [d for d in idx['datasets'] if d.get('file') != new_file]
        idx['datasets'].append({
            'file': new_file,
            'label': f"{data['meta'].get('date_label','?')} ({data['meta'].get('period_days','?')} 天{', 含 AI 補點' if data['meta'].get('has_ai_fill') else ''})",
            'date': data['meta'].get('report_date', '?'),
        })
        idx['default'] = new_file
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(idx, f, ensure_ascii=False, indent=2)
        print(f"  ✓ {index_path} (updated)")
    
    print(f"\n🔄 Step 2/2: 由 JSON 產出 HTML（單一檔案，無日期後綴）")
    import subprocess
    build_script = os.path.join(SCRIPT_DIR, 'build_reports.py')
    result = subprocess.run(
        ['python3', build_script, latest_json, '--no-suffix', '--output-dir', args.output_dir],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        sys.exit(1)
    
    print(f"\n✅ 完成！單一檔案輸出：")
    print(f"   {os.path.join(args.output_dir, 'SDataPro_Customer_Briefing.html')}")
    print(f"   {os.path.join(args.output_dir, 'SDataPro_Full_Report.html')}")
    print(f"\n下一步：git add . && git commit -m 'Update reports' && git push")


if __name__ == '__main__':
    main()
