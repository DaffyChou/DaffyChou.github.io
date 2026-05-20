# SDataPro 報告產生流程

## 工作流程

```
xlsx → JSON → HTML
```

### 步驟 1：xlsx 轉 JSON

```bash
python convert_xlsx_to_json.py <input.xlsx> data/<date>.json
```

範例：
```bash
python convert_xlsx_to_json.py \
    "C:\路徑\船訊網_SDataPro_AIS資料比較_20260519.xlsx" \
    data/20260519.json
```

支援兩種 xlsx 格式：
- **v1**（舊版）：`source` + `mmsi與船名一覽` 兩個工作表
- **v2**（新版）：含 `狀態`、`資料缺失統計`、`AIS資料差異` 等 8 個工作表（含 AI 補點 status）

腳本自動偵測格式並對應處理。

### 步驟 2：JSON 轉 HTML

```bash
# 單一日期
python build_reports.py data/20260519.json

# 自訂日期後綴
python build_reports.py data/20260519.json --suffix 20260519

# 重建所有（依 data/index.json）
python build_reports.py --rebuild-all
```

每次會產出 2 個 HTML：
- `SDataPro_Customer_Briefing_{suffix}.html`
- `SDataPro_Full_Report_{suffix}.html`

### 步驟 3：手動同步 index.json（新增日期時）

新增資料集時，編輯 `data/index.json`：

```json
{
  "datasets": [
    {"file": "20260515.json", "label": "2026-05-15 (7 天)", "date": "2026/5/15"},
    {"file": "20260519.json", "label": "2026-05-19 (10 天，含 AI 補點)", "date": "2026/5/19"}
  ],
  "default": "20260519.json",
  "schema_version": "1.0"
}
```

## 目錄結構

```
SDataPro/
├── convert_xlsx_to_json.py             # xlsx → JSON 轉換器
├── build_reports.py                    # JSON → HTML 建構器
├── README_BUILD.md                     # 本文件
├── data/
│   ├── index.json                      # 資料集清單
│   ├── 20260515.json                   # 5/15 資料
│   └── 20260519.json                   # 5/19 資料
├── templates/
│   ├── SDataPro_Customer_Briefing.template.html
│   └── SDataPro_Full_Report.template.html
├── SDataPro_Customer_Briefing_20260515.html   # 產出
├── SDataPro_Customer_Briefing_20260519.html
├── SDataPro_Full_Report_20260515.html
└── SDataPro_Full_Report_20260519.html
```

## 依賴

```bash
pip install openpyxl
```

## 注意事項

1. **xlsx 格式必須一致**：v1/v2 兩種格式有差異，腳本自動偵測但若是其他格式請先轉換
2. **AI 補點**：v2 格式才有 status 欄位區分原始 vs AI 補點
3. **模板更新**：若需修改 HTML 樣式或結構，編輯 `templates/*.template.html`，再重新 build
4. **JSON 結構**：見 `convert_xlsx_to_json.py` 中的 `main()` 函數，定義了 vessels/tracks/global/categories 等鍵
