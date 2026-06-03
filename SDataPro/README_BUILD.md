# SDataPro 報告產生流程

## 一行指令更新（最常用）

```bash
python rebuild.py <新的xlsx檔案>
```

**自動完成**：
1. xlsx → JSON（記錄在 `data/latest.json`）
2. JSON → HTML（覆寫 `SDataPro_Customer_Briefing.html` 與 `SDataPro_Full_Report.html`）
3. `git add . && git commit -m '...' && git push` → 網頁立即更新

### 範例

```bash
# 5/26 新資料來了，跑一行
python rebuild.py 船訊網_SDataPro_AIS資料比較_20260526.xlsx

# 想保留歷史 JSON 快照
python rebuild.py 船訊網_SDataPro_AIS資料比較_20260526.xlsx --archive
```

`--archive` 會把當次 JSON 也以日期存到 `data/20260526.json` 並更新 `data/index.json`。

---

## 進階：拆步驟執行

### Step 1：xlsx → JSON

```bash
python convert_xlsx_to_json.py <input.xlsx> data/<date>.json
```

支援兩種 xlsx 格式（自動偵測）：
- **v1**（舊版）：`source` + `mmsi與船名一覽` 兩個工作表
- **v2**（新版含 AI 補點）：含 `狀態`、`資料缺失統計`、`AIS資料差異` 等 8 個工作表

### Step 2：JSON → HTML

```bash
# 單一檔案（覆寫，不留日期後綴）
python build_reports.py data/latest.json --no-suffix

# 帶日期後綴（多版並存）
python build_reports.py data/20260519.json

# 重建 data/ 下所有 JSON（依 index.json）
python build_reports.py --rebuild-all
```

---

## 目錄結構

```
SDataPro/
├── rebuild.py                          ⭐ 主要工具（一條龍）
├── convert_xlsx_to_json.py             # xlsx → JSON
├── build_reports.py                    # JSON → HTML
├── README_BUILD.md                     # 本文件
├── data/
│   ├── index.json                      # 資料集清單（archive 模式自動更新）
│   ├── latest.json                     # 最新一份資料（總是覆寫）
│   └── YYYYMMDD.json                   # 歷史快照（--archive 時保留）
├── templates/
│   ├── SDataPro_Customer_Briefing.template.html
│   └── SDataPro_Full_Report.template.html
├── SDataPro_Customer_Briefing.html     ⭐ 最終產出（單一檔，覆寫）
└── SDataPro_Full_Report.html           ⭐ 最終產出（單一檔，覆寫）
```

---

## 完整工作流程

```
┌─────────────┐
│ 新 xlsx 到手 │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────┐
│ python rebuild.py 新檔.xlsx           │  ← 一行指令
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ SDataPro_Customer_Briefing.html 已更新 │
│ SDataPro_Full_Report.html 已更新       │
│ data/latest.json 已更新                │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ git add . && git commit && git push   │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ GitHub Pages 自動發布，網頁立即顯示新資料 │
└──────────────────────────────────────┘
```

---

## 依賴

```bash
pip install openpyxl
```

---

## 注意事項

1. **xlsx 欄位需符合既定格式**：見 `convert_xlsx_to_json.py` 中 `process_v1` / `process_v2` 函數
2. **AI 補點**：v2 格式才有，狀態欄 `1` = 兩家都正常，`2` = SD 由 AI 補點
3. **模板修改**：要改 HTML 樣式 / 區塊，編輯 `templates/*.template.html`，再跑 `python rebuild.py 同一個xlsx`
4. **歷史資料保留**：用 `--archive` 旗標
