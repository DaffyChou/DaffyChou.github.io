# SDataPro Development

船東公司岸端 OCC 系統 Demo · v0.1 開發包

| 項目 | 內容 |
|---|---|
| 整理日期 | 2026-06-03 |
| 整理者 | 摯陞數位科技 SLAB |
| 範圍 | 規格書 / 流程圖 / 預處理 script / Demo 真實資料 / HTML 原型 |

---

## 快速開始（給前端工程師 / Demo 演示）

### 1. 用 VSCode + Live Server 開啟 Demo 原型

1. VSCode 開啟此 `SDataPro_Development` 資料夾
2. 安裝擴充套件「Live Server」（Ritwick Dey）
3. 雙擊 `index.html` 開啟
4. 右下角點「Go Live」→ 瀏覽器自動開啟（網址 `http://127.0.0.1:5500/`）

### 2. 用 Python 啟動本機 server

```bash
cd D:\公司內部\DaffyChou.github.io\SDataPro_Development
python -m http.server 8000
# 瀏覽器開啟 http://localhost:8000/
```

### 3. 直接 file:// 開啟（不可用）

⚠ Chrome 從 file:// 無法 fetch JSON，必須走本機 server。

---

## 目錄結構

```
SDataPro_Development/
│
├── README.md                              ← 本檔案
├── index.html                             ← 船隊監控 HTML 原型（首頁，需透過 server 開啟）
│
├── docs/                                  ← 規格書與分析報告
│   ├── SDataPro_提案Demo規格書_v1.0.md     ← ⭐ 給前端的可執行規格（22 章）
│   ├── SDataPro_產品分析報告_v0.1.md       ← 產品需求 / 模組差異 / 開發順序
│   ├── SDataPro_真實AIS資料分析_v0.1.md    ← 20 艘船資料分析結果
│   └── SDataPro_選單架構_v0.2.html         ← Sidebar 9 項分 4 群（最終版）
│
├── diagrams/                              ← 設計流程圖（按時間先後）
│   ├── SDataPro_流程圖_v0.1.html           ← 資料流主軸 + 岸端營運 + 角色 × Demo
│   ├── SDataPro_情境流程圖_v0.1.html        ← 5 個典型操作情境
│   ├── SDataPro_資料視角圖_v0.2.html        ← 同源資料 × 多視角（核心觀念）
│   ├── SDataPro_UI整合設計選項_v0.1.html    ← 圖層 toggle vs 視角分頁
│   └── SDataPro_選單架構_v0.1.html          ← 11 項版（舊，已被 v0.2 取代）
│
├── preprocess/                            ← AIS 真實資料預處理
│   └── preprocess_ais.py                   ← 將 1.2 GB CSV → 32 MB JSON
│
└── data/                                  ← 已預處理的真實資料（HTML 原型用）
    ├── vessels.json                        ← 20 艘船總表 + meta（11 KB）
    ├── tracks/
    │   └── {source_id}.json × 20           ← 每艘船 8 天軌跡（每 5 分鐘 1 點，4.6 MB）
    └── surroundings/
        └── {source_id}.json × 20           ← 每艘船周邊快照（每 30 分鐘，26.8 MB）
```

---

## 文件閱讀順序建議

### 對前端工程師

1. 先讀 `docs/SDataPro_提案Demo規格書_v1.0.md`（最完整）
2. 開 `docs/SDataPro_選單架構_v0.2.html` 看 sidebar 結構
3. 跑 `index.html` 看現有原型
4. 閱讀 `docs/SDataPro_真實AIS資料分析_v0.1.md` 理解資料結構
5. 看 `data/vessels.json` 與 `data/tracks/12.json` 範例了解 JSON schema

### 對 PM / 業務

1. 先看 `docs/SDataPro_產品分析報告_v0.1.md` 第 1–3 節（產品定位 + 模組總覽）
2. 開 `diagrams/SDataPro_資料視角圖_v0.2.html` 理解「6 個視角＝同一份資料的不同加工」
3. 看 `docs/SDataPro_提案Demo規格書_v1.0.md` §19「Demo 故事劇本」4 場景
4. 跑 `index.html` 體驗實際操作

### 對客戶（提案演示）

直接跑 `index.html`，依規格書 §19 故事劇本演示。

---

## 重點規格摘要

### 系統定位

| 項目 | 說明 |
|---|---|
| 對象 | 船東公司岸端 OCC（運營中心）|
| 船隊規模 | 20 艘自家船（目前真實資料）→ 規格支援 50+ 艘 |
| 資料來源 | 自船 SDataPro 收集器 + 5 海哩內周邊 AIS 觀測 |
| 系統定位 | **岸端事後分析 / 紀錄 / 營運優化**，非船端即時避碰 |
| 資料延遲 | 5–60 分鐘（介面必標示「最後更新」）|

### Sidebar 架構（9 項 / 4 群）

| 群組 | 項目 |
|---|---|
| 即時監看 | 船隊監控 / **船舶詳情（5 分頁：態勢/歷史/ETA/計畫/智慧航線）** |
| 港口營運 | 港口擁塞看板 / 港口情資 SitRep |
| 事件管理 | 事件處理 / 警示時間線 |
| 系統管理 | 閾值設定 / 稽核紀錄 / 報表匯出 |

### 真實資料規模

| 項目 | 真實資料 |
|---|---|
| 自家船 | **20 艘 全部為陽明海運貨櫃船**（全船名 X 明輪 / YM-系列） |
| 時間範圍 | 2026-05-25 ~ 2026-06-02（8 天） |
| 船隊組成 | 陽明海運（Yang Ming Marine Transport）20 艘貨櫃船 |
| 船型分類 | 169–334 m，5,167 ~ 118,524 GT；最大旗艦：納明輪 YM TROPHY 與賢明輪 YM TOGETHER（334×48m，136,900 DWT）|
| 註冊國 | 🇹🇼 台灣 6 / 🇨🇳 中國 1 / 🇱🇷 賴比瑞亞 10 / 🇰🇷 韓國 1 / 🇸🇬 新加坡 2（**陽明旗下**含子公司）|
| 觀測海域 | 亞太為主（台海、東海、南海、馬六甲、巴士海峽、太平洋橫渡）|
| 周邊船密度 | 平均 4.5 ~ 63 艘 / 船 / 5 NM |
| 船隊總噸位 | DWT **1,092,901 t** · GT 935,522 |
| 原始 CSV | 1.2 GB / ~1500 萬筆 AIS 訊息 |
| 預處理後 | 32 MB JSON（壓縮率 38×） |

### Demo 故事推薦船

| Demo 場景 | 推薦使用船 | 理由 |
|---|---|---|
| 船隊全景 | 全 20 艘陽明海運貨櫃船 | — |
| 旗艦展示 | **src 53 納明輪 YM TROPHY**（廣東外海，334×48m, 2022 新造旗艦）| 視覺最佳 |
| CPA 高密度查證 | **src 13 營明輪 YM UNICORN**（東海/長江口 63 艘）或 **src 53 納明輪 YM TROPHY**（廣東外海 41.9 艘）| 大船多周邊密 |
| 港口接近 | **src 49 展明輪 YM ETERNITY**（巴士海峽→高雄）| 距台灣港近 |
| 跨洋孤立 | **src 9 續明輪 YM UNANIMITY**（太平洋橫渡）| 周邊最稀疏 4.5 艘 |
| 馬六甲擁擠 | **src 28 近明輪 / src 34 威明輪 / src 45 盛明輪** | 真實船流密集 |
| 沿海雙旗艦 | **src 53 納明輪 + src 54 賢明輪 YM TOGETHER**（334×48m 雙姊妹船，2022/2021 新造）| 同型船比對 |

---

## 待確認事項（與 PM / 客戶）

1. **20 艘船是否為提案範圍？** 客戶實際船隊可能更多
2. **真實 MMSI 是否可在 Demo 展示？**（目前保留真實，公開 AIS 資料）
3. **化名規則是否需要？** 若需要，需建立化名 × 真名對應表
4. **正式版的 145 港口主檔由誰提供？**
5. **Demo 演示設備？**（投影 / 螢幕 / 平板）

---

## 後續開發路徑

| Sprint | 期間 | 內容 |
|---|---|---|
| Sprint 0（已完成）| - | 規格凍結 + 真實資料預處理 + 原型驗證 |
| Sprint 1 | 2 週 | 完整船隊監控 + 船舶詳情「📍 態勢」分頁 |
| Sprint 2 | 2 週 | 船舶詳情其餘 4 分頁（歷史 / ETA / 計畫 / 智慧） |
| Sprint 3 | 2 週 | 港口擁塞看板 + SitRep |
| Sprint 4 | 2 週 | 事件處理 + 時間線 + 閾值 + 稽核 + 報表 + Demo 故事整合 |

預估 **8 週**後可進客戶提案演示。

---

## 維運說明

### 重跑預處理

當有新的 AIS 資料夾時：

```bash
# 1. 編輯 preprocess/preprocess_ais.py 中的 INPUT_DIR 與 SOURCE_MAP
# 2. 在資料夾中跑：
cd preprocess
python preprocess_ais.py all     # 處理全部 source
python preprocess_ais.py 13      # 只處理 src 13
python preprocess_ais.py meta    # 重建 vessels.json
```

### 版本紀錄

| 日期 | 版本 | 摘要 |
|---|---|---|
| 2026-06-03 | v0.1 | 初始整理：規格 / 流程圖 / 20 艘真實資料 / HTML 原型 |

---

*摯陞數位科技 SLAB · 2026-06-03*
