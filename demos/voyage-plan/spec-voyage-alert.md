# 航行監控與警示系統 規格書
**Voyage Monitoring & Alert System — Specification**

---

## 文件資訊

| 項目 | 內容 |
|---|---|
| 文件名稱 | 航行監控與警示系統規格書（綜合版） |
| 對應 Demo | `demos/voyage-plan/voyage-alert-rwd.html` |
| 對應資料 | `mockup-data.js`、`risk-zones.js` |
| 版本 | v0.1（草案） |
| 製作日期 | 2026-05-27 |
| 撰寫者 | 摯陞數位科技（SLAB） |
| 文件性質 | 功能說明 + 系統規格 + 畫面流程 + 資料欄位 綜合版 |

### 變更紀錄
| 日期 | 版本 | 摘要 |
|---|---|---|
| 2026-05-27 | v0.1 | 由 demo `voyage-alert-rwd.html` 反向整理出第一版規格書 |

---

## 目次

1. 系統概述
2. 整體架構
3. 共用設計規範
4. 功能模組
5. 警示計算邏輯
6. 資料模型
7. 互動與狀態管理
8. RWD / 行動裝置
9. 地圖規範
10. 非功能性需求
11. 後續擴充
- 附錄 A：路由清單
- 附錄 B：儲存鍵清單
- 附錄 C：警示維度對照表
- 附錄 D：畫面預覽（圖位）

---

## 1. 系統概述

### 1.1 系統目的

針對船東 / 船公司營運中心（OCC）日常需要監控的「船隊航行安全」場景，提供一個單一介面：

- 在地圖上即時看到整支船隊的位置、風險等級、目前是否落入高風險區域
- 從九個獨立維度（航線偏移、速度、海況、警示郵件、AIS 訊號、進行中事件、進出港、主機異常、區域警示）量化每艘船的安全狀態
- 把每一筆 Warning / Critical 自動立案為「事件」，由值班人員以新立案 → 認可 → 處理中 → 已解決的流程處理
- 提供操作員自訂各維度警示觸發閾值，調整後立即重評估全船隊

### 1.2 使用情境

| 角色 | 主要使用情境 |
|---|---|
| 值班操作員 (Operator) | 開啟「船隊監控」總覽，掃描 Critical 船舶 → 點船進單船 detail 查看 XTD、各維度警示 → 切到「事件處理」做立案流轉 |
| 船長 / 海務 (Captain / Maritime) | 從「事件處理」中接案，新增備註紀錄處理過程 → 查看「警示時間線」回顧近期事件 |
| 系統管理員 / Supervisor | 進入「閾值設定」依公司風險偏好調整 Warning / Critical 觸發點，存檔後系統立即重評估 |

### 1.3 系統範圍（Demo 階段）

本 Demo 為**前端介面原型**，目標在於：

- 凍結 UX / 互動 / 資料呈現方式
- 凍結警示判斷規則與閾值設計
- 凍結資料欄位與資料模型（給後續後端 API 對接）

範圍**不**包含：
- 任何後端 API（資料為 mockup-data.js 寫死）
- 使用者登入、權限、稽核
- 真實 AIS / 氣象 / IoT 對接
- 推播 / Email / SMS 通知通路

### 1.4 名詞定義

| 縮寫 / 名詞 | 全稱 | 說明 |
|---|---|---|
| AIS | Automatic Identification System | 船舶自動識別系統 |
| IMO | International Maritime Organization No. | 船舶國際識別碼 |
| MMSI | Maritime Mobile Service Identity | AIS 通訊識別碼 |
| SOG | Speed Over Ground | 對地航速（節 kn） |
| COG | Course Over Ground | 對地航向（0–359°） |
| XTD | Cross-Track Distance | 偏離計畫航線的垂直距離（海浬 NM） |
| Safety Frame | 安全框寬度 | 計畫航線兩側允許偏移的安全寬度（NM） |
| Waypoint | 計畫航點 | 計畫航線上的轉向點 |
| ETA | Estimated Time of Arrival | 預計抵港時間 |
| ECA | Emission Control Area | 環保排放管制區 |
| StormGeo | — | 提供航行計畫與 Warning Mail 的第三方氣象 / 航線服務商 |
| WNI | Weathernews Inc. | 預計接入的第二家航線服務商 |
| BMP / IRTC / HRA | Best Management Practices / Internationally Recommended Transit Corridor / High Risk Area | 海盜風險區相關 |
| OCC | Operation Control Center | 營運控制中心 / 值班室 |

---

## 2. 整體架構

### 2.1 技術堆疊

| 層級 | 技術 / 依賴 |
|---|---|
| 前端框架 | 純 Vanilla JavaScript（無框架） |
| 地圖 | Leaflet 1.9.4 + CARTO Dark Basemap (`basemaps.cartocdn.com/dark_all`) |
| 樣式 | CSS3（無 preprocessor），深色主題 token |
| 字體 | 系統字體 (`-apple-system, "Segoe UI", "Noto Sans TC"`) |
| 路由 | URL Hash routing（`location.hash` + `hashchange`） |
| 狀態 | 純記憶體變數 + `localStorage` / `sessionStorage` 持久化 |
| 資料來源 | 靜態 `window.MOCK_DATA`、`window.RISK_ZONES`、`window.RISK_ZONE_CATEGORIES` |

> **正式版需替換**：mockup-data.js → REST API；risk-zones.js → 後端定期同步 IMB / JWLA / OFAC / NOTMAR / IMO MEPC 等資料源。

### 2.2 系統頁面架構

```
┌─────────────────────────────────────────────────────────┐
│ Sidebar（桌面左側 50px → hover 220px / pin 220px）       │
│ ├ 船隊監控   #/fleet                                    │
│ ├ 事件處理   #/events                                   │
│ ├ 警示時間線 #/timeline                                 │
│ ├ 閾值設定   #/thresholds                               │
│ └ v1 原型    index.html（外連）                          │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
                  <main id="main">
                       │
   ┌───────────────────┼───────────────────────────────┐
   ▼                   ▼                               ▼
 Fleet Page         Events Page                     Timeline / Thresholds
 ├ 浮動 toolbar     ├ 統計 pill                       ├ Timeline DESC list
 ├ Critical Banner  ├ 篩選 toolbar                    └ Thresholds form
 ├ Risk Zone Panel  ├ 事件表 / 卡片                       └ 6 個維度 W/C 閾值
 ├ Fleet Map        └ Event Modal                          + 觸發邏輯說明
 │  └ Ship markers
 ├ List Handle
 └ Alert Table / Cards
```

### 2.3 資料流

```
mockup-data.js   →  window.MOCK_DATA = { vessels, mails }
risk-zones.js    →  window.RISK_ZONES + RISK_ZONE_CATEGORIES
                                │
                                ▼
                computeAlerts(vessel) 每艘船算 9 維度 → risk
                                │
                                ▼
         syncEventsFromAlerts() 比對既有事件，新增 / 標記 cleared
                                │
                                ▼
            localStorage: slab_va_events_v1（事件處理流程）
            localStorage: slab_va_thresholds_v1（閾值）
```

### 2.4 路由設計

詳見附錄 A。重點：
- `route()` 函式由 `hashchange` 觸發
- 切換 fleet 頁時把 `<main>` 加上 `.fleet-mode`（影響 overflow 行為）
- 切換 thresholds 頁時加上 `.th-mode`（影響底部 sticky）

### 2.5 儲存策略

| 範圍 | 用途 | 鍵 |
|---|---|---|
| `localStorage` | 跨會期保留：閾值、事件、側邊欄 pin 狀態 | `slab_va_thresholds_v1` / `slab_va_events_v1` / `slab_va_sidebar_pinned_v1` |
| `sessionStorage` | 單一會期保留：UI 狀態、篩選展開、Banner 消音、檢視模式 | 詳見附錄 B |

---

## 3. 共用設計規範

### 3.1 色彩 Token

**底色**

| Token | 值 | 用途 |
|---|---|---|
| Page bg | `#000` | 整頁 body |
| Surface 1 | `#0d0d0d` | Sidebar、Banner、tooltip |
| Surface 2 | `#141414` | 卡片、Modal、面板 |
| Surface 3 | `#1a1a1a` | row hover、輸入框底 |
| Border | `#2a2a2a` | 一般邊框 |
| Divider | `#333333` | 較深分隔線 |

**文字**

| Token | 值 | 用途 |
|---|---|---|
| Primary | `#e4eaf2` | 標題、主要數值 |
| Body | `#d8dee9` | 一般內文 |
| Secondary | `#c4cdda` | 次要說明 |
| Muted | `#9aa5b8` | 標籤、icon 預設色 |
| Subtle | `#7c8a9e` | 英文補語、灰提示 |
| Disabled | `#5e6b80` | 弱化提示、`disabled` |

**強調**

| Token | 值 | 用途 |
|---|---|---|
| Accent / Link | `#9ec5ff` | 連結、focus 邊框 |
| Primary CTA | `#2c6cdb` → `#3d7eed`(hover) | 主按鈕 |
| Secondary CTA bg | `rgba(44,108,219,0.18)` | pill 底 |

### 3.2 警示等級色彩

| 等級 | 主色 | 文字色 | 半透明底 | 使用情境 |
|---|---|---|---|---|
| Critical | `#ff4d4f` | `#ff8a8a` | `rgba(255,77,79,0.15)` | 任一維度達 critical 閾值 |
| Warning | `#f5a623` | `#f5b753` | `rgba(245,166,35,0.15)` | 達 warning 閾值 |
| Normal | `#4cd97a` (船舶) / `#6ee094` (event) | `#aab4c4` | `rgba(108,122,145,0.15)` | 全部正常 |
| N/A | dashed | `#7c8a9e` | `rgba(108,122,145,0.10)` | 僅 `alert` 維度，無郵件資料 |

### 3.3 字級

| 用途 | 大小 |
|---|---|
| Page title `<h2>` | 18 px / 行動 16 px |
| Section header `<h3>` | 14 px UPPERCASE letter-spacing 0.5 |
| 表頭 | 14 px UPPERCASE letter-spacing 0.3 |
| 內文 | 14 px |
| 表內主數值 | 16–24 px tabular-nums |
| 雙語英文補語 | 12 px |

### 3.4 圖示集 (DIM_META icons)

9 個警示維度對應 9 個 inline SVG（24×24 viewBox）：

| Key | 中文 | 英文 | Icon 形狀 |
|---|---|---|---|
| `route` | 航線偏移 | Route Dev | V 形折線 + 兩端圓點 |
| `speed` | 速度異常 | Speed | 半圓 + 指針 |
| `sea` | 海況/天候 | Sea State | 雙波浪 |
| `port` | 到港/離港 | Port Ops | 錨形 |
| `engine` | 主機異常 | Main Engine | 齒輪 |
| `alert` | Warning Mail | Mail | 三角形 + 驚嘆號 |
| `comm` | AIS 訊號 | Comms | 雲形 + 上箭頭 |
| `event` | 進行中事件 | Open Deviation | 菱形 + 中心點 |
| `zone` | 區域警示 | Zone Alert | 盾形 + 中央驚嘆號 |

### 3.5 RWD 斷點

| 斷點 | 適用 | 主要差異 |
|---|---|---|
| `≥ 1025 px` | 桌面 | 側邊欄左側、地圖 overlay 浮動、表格完整顯示 |
| `600 – 1024 px` | 平板（含 iPad Pro portrait） | 卡片化、底部 tab bar、卡片排 2 欄、地圖固定高 320 px |
| `≤ 599 px` | 手機 | 卡片排 1 欄、地圖固定高 240 px |

JS 端以 `matchMedia("(max-width: 1024px)")` 判斷 `IS_MOBILE`，斷點切換時自動重繪當前路由。

---

## 4. 功能模組

### 4.1 側邊欄 Sidebar

**行為（桌面 ≥ 1025 px）**

- 預設**收合**寬 50 px，僅顯示 icon
- Hover 時暫時展開到 220 px（CSS transition 0.22s）
- 點 brand 右側的 **Pin 按鈕** 切換鎖定狀態，鎖定時即使滑開仍保持 220 px
- Pin 狀態存 `localStorage.slab_va_sidebar_pinned_v1`，跨會期保留
- Pin 開啟後按鈕背景變藍、icon 旋轉 -45°

**行為（行動 ≤ 1024 px）**

- 變為**底部 tab bar**（`flex-direction: column-reverse` 在 body）
- 5 個項目改為水平等分，icon 在上、文字在下
- 「v1 原型」連結在行動版隱藏
- Active tab 上方加 2 px 藍色指示條

**導覽項目**

| 順序 | 標籤 | hash | 路由處理 |
|---|---|---|---|
| 1 | 船隊監控 / Fleet | `#/fleet`（預設） | `renderFleet()` |
| 2 | 事件處理 / Events | `#/events` | `renderEvents()` |
| 3 | 警示時間線 / Timeline | `#/timeline` | `renderTimeline()` |
| 4 | 閾值設定 / Thresholds | `#/thresholds` | `renderThresholds()` |
| 5 | v1 原型 | `index.html` | 外連，行動版隱藏 |

---

### 4.2 船隊監控 Fleet Monitoring (`#/fleet`)

**佈局**（總覽模式，`_selectedVessel === null`）

```
┌──────────────────────────────────────────────────────────────────┐
│ 船隊監控 / Fleet Monitoring                                       │
│ 共 N 艘 · M 艘需關注 (N vessels · M need attention)               │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ 70% │
│ │  [Toolbar 浮動]   篩選 ▾  搜尋  C·X W·Y N·Z              │     │
│ │                                                          │     │
│ │              Leaflet 地圖（CARTO Dark）                  │     │
│ │      Ship markers（顏色＝風險、旋轉＝COG、Critical 脈動）│     │
│ │                                                          │     │
│ │      [⚠ Risk Zones ▾] ← 左下浮動                         │     │
│ │                                       [Critical Banner] → │     │
│ └──────────────────────────────────────────────────────────┘     │
│ ┌──────── handle ────────┐                                       │
│ ├──────────────────────────────────────────────────────────┐ 30% │
│ │  船舶列表（表格）/ Mobile：卡片                          │     │
│ │  船舶 | Risk | 9 維度 dot | 計畫來源 | ... | Lat / Lon  │     │
│ └──────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

點擊 handle 在 70/30 ↔ 50/50 間切換（CSS flex transition 0.28s）。

#### 4.2.1 浮動 Toolbar

注入到地圖容器內，`position: absolute; top:10px; left:10px; z-index:600`。

| 控制 | 行為 |
|---|---|
| 篩選下拉 | `_fleetFilter`：全部 / 需關注 / 僅 Critical / 僅 Warning / 僅 Normal |
| 搜尋輸入 | `_fleetKeyword`：船名 / IMO / vessel_id 不分大小寫 |
| 計數 | `列表/地圖：filtered / total`；有條件時變藍 |
| Summary pills | `C·n` `W·n` `N·n` 三色點 |
| **篩選 toggle** | 僅手機可見；點擊收合 / 展開 toolbar；存 `sessionStorage.slab_va_filter_open`；有條件時邊框變藍 `dirty` |
| **檢視模式 toggle** | 僅手機可見；list / split / map 三段；存 `sessionStorage.slab_va_mobile_view` |

#### 4.2.2 Critical Banner（右上）

- 條件：`counts.critical > 0`
- 顯示 `⚠ <N> 艘 Critical，請優先檢視 / N in Critical` + × 關閉
- × 後存 `sessionStorage.slab_va_banner_dismissed_critical_count = N`，同 N 數量不再出現
- × 後右上角出現脈動小 ⚠ icon（紅色徽章帶數字），點擊重新展開 Banner
- Mobile 模式下 banner 改為 inline strip（順序 2），不顯示 reopen icon

#### 4.2.3 Risk Zone Panel（左下）

- 標題：⚠ 全球風險區 / Risk Zones
- 預設**桌面展開、手機收合**；切換狀態存 `sessionStorage.slab_va_risk_panel_open`
- 內含「全開 / 全關」兩鍵
- 8 個類別 checkbox，每列：色塊 + 中文 + 英文 + 計數
- 個別與整體切換都會即時呼叫 `setRiskLayer(key, enabled)`，並寫入 `sessionStorage.slab_va_risk_layers`
- 預設開啟：海盜 / 戰爭 / 軍演 / 壅塞；預設關閉：制裁、氣象、ECA、保護區

#### 4.2.4 船舶列表 / 卡片

桌面為表格，欄位（13 欄 + 9 個維度 icon = 22 欄）：

| 欄位 | 內容 |
|---|---|
| 船舶 / Vessel | IMO pill + 船名（sticky-left 230 px） |
| 整體風險 / Risk | 大號圓點（lg） |
| **9 個維度 icon 欄** | 小圓點，hover tooltip 顯示等級 |
| 計畫來源 / Plan Source | `plan-source` pill：StormGeo（藍）/ WNI（綠） |
| 計畫/AIS 點數 / Plan/AIS Pts | `planned.length / ais.length`，偏移點外加 `Dev N` 標籤 |
| 航行進度 / Progress | 進度條 + %，顏色依 route 等級（藍 / 橘 / 紅） |
| 偏移量 NM / Dev / Max (Safety) | `XTD / maxDev (SafetyFrame)`；超閾值變紅 / 橘 |
| 最近 AIS 時間 (UTC+8) | `fmtAisTimeUtc8()`：原始 UTC → 台北時間 |
| AIS 狀態 / AIS Status | 中文簡稱 + 英文縮寫雙行顯示（90 px 固定寬） |
| 速度 / SOG | tabular-nums，1 位小數 |
| 航向 / HDG | tabular-nums，整數 |
| 緯度 / Lat | DMS 格式 |
| 經度 / Lon | DMS 格式 |

點擊船名 → `selectVessel(vessel_id)` 進入單船 detail 模式（替換上方地圖）。

排序：critical > warning > normal > na（後續以開立時間倒序）。

行動裝置改用 `renderMatrixCards`：

- 卡片左邊框依等級上色
- 標題：IMO pill + 船名 + 等級徽章
- 維度晶片：只顯示有 critical / warning 的維度
- meta：SOG / COG / XTD / AIS / 計畫 5 欄 grid
- 進度條（若有 progress_pct）

#### 4.2.5 表頭 Tooltip

每個表頭採用 `<span class="bi-th-tip" data-tip="...">`。

- 中文 + i 小圓圈組成第一行，英文補語在第二行
- Mouseover 時透過 JS portal 將 `<div class="icon-tip-portal">` 動態 append 到 `<body>`，避免被 `.alert-table-wrap` 的 `overflow: auto` 裁掉
- Tooltip 結構：`.tip-title`（粗體 / 14 px）+ `.tip-body`（一般 / 12 px / `white-space: pre-line`）
- 上方空間不夠時 fallback 到下方

---

### 4.3 單船 Detail 模式（船隊頁內）

點擊船舶或地圖 marker 後，上方地圖區替換為：

```
┌──────────────── 70% ──────────────┬──── 30% ─────┐
│ [← 返回船隊 / Back to fleet]       │ Detail Panel  │
│                                    │               │
│       Leaflet 單船地圖              │ 船名/AIS狀態  │
│                                    │ XTD 即時讀值  │
│   ┌──────────────────────┐        │  ├ progress  │
│   │ 圖層 / Layers ☑×5    │ 右上    │  └ 70% 標記  │
│   └──────────────────────┘        │ 各維度警示    │
│                                    │ 進行中事件    │
│                                    │ 當前 AIS 位置 │
│                                    │ 計畫航線      │
│                                    │ Open Event   │
└────────────────────────────────────┴───────────────┘
```

#### 4.3.1 地圖內容

5 個圖層（checkbox 控制，狀態存於 `_layerState`）：

| Key | 顏色 | 內容 |
|---|---|---|
| `planned` | 藍 `#4a9eff` dashed | 計畫航線 polyline + waypoint 小圈 |
| `corridor` | 藍 fill 10 % | Safety Frame 走廊 polygon |
| `ais` | 綠 `#4cd97a` / 紅 `#ff6b6b` | AIS 軌跡，依 `is_deviated` 分段；偏移點半徑加大 |
| `ship` | 依風險等級 | 船舶 SVG icon（三角形按 COG 旋轉，critical/warning 帶脈動光環） |
| `mails` | 紅 / 藍水滴 | Warning Mail markers，點擊 popup |

跨換日線：每條 polyline / polygon / marker 都以 `splitAtAntimeridian + addWrappedPolyline + ±360 平移`三個 world copy 繪製，避免縮小到全球時兩側脫節。

點擊 mail marker 開 popup（最大寬 360 px / 行動 280 px，maxHeight 380 / 180），內容：
- 事件時間（粗體 + 等級徽章 + warning_code）
- warning_description 全文
- 若有 `matched_port_code`：📍 計畫航線匹配（position_type、port_code / port_name、matched_event_date、match_method）
- IMO + received_time

#### 4.3.2 Detail Panel 內容

依序顯示以下區塊：

| Section | 內容 |
|---|---|
| 船名 + AIS 狀態徽章 + IMO | header |
| **XTD 即時讀值** | 數值 + 進度條（左到右），閾值刻度線在 70 %；顏色依 `xtd / sf`：藍 / 橘 / 紅 |
| **各維度警示** | 9 列 alert-row：icon + 中文+英文 short + 量化說明（中英雙行）+ 等級徽章 |
| **進行中事件** | 該船 `eventsForVessel()` 前 6 件，列出維度 + 等級 + 狀態 + 開立時間 + 指派；超過 6 件顯示「查看全部 →」連往 `#/events` |
| **當前 AIS 位置** | KV 表：MMSI / Lat / Lon / SOG / COG / Status / Time (UTC+8) |
| **計畫航線** | Plan ID / 來源 / 計畫點數 / 航行進度 % / 匯入時間 |
| **Open Event**（若存在） | Event ID / 等級 / 開始時間 / 最後偵測 / 最大偏移 |

#### 4.3.3 行動裝置調整

`detail-mode` 下將 `[← Back] [圖層 ▾] [≡⊟⊞]` 包成 `.detail-header-row`，固定 38 px 高：

- ← back 文字隱藏，只剩箭頭
- 圖層改為「文字 ▾」chip，點擊往下展開 5 個 checkbox
- view-toggle 在最右側，list / split / map 三段

---

### 4.4 事件處理 Events (`#/events`)

#### 4.4.1 事件自動立案

`renderEvents()` 進場時呼叫 `syncEventsFromAlerts()`：

1. 逐船 `computeAlerts()` 取 9 維度結果
2. 對每個 `critical` / `warning` 維度，組 `id = vessel_id-dimension-YYYYMM`（同船同維度當月只立一案）
3. 若 id 不存在 → push 新事件（status = new、history = [system create]）
4. 若 id 存在 → 更新 level，刪除 cleared 標記
5. 若 id 在資料中已不存在於本次警示 → 標記 `cleared: true`（**已解決的事件不再標 cleared**）

#### 4.4.2 統計 Pill Bar

四色：New（紅）/ Ack（橘）/ In Progress（藍）/ Resolved（綠），每色顯示「圓點 + 標籤 + 大數字」。

#### 4.4.3 篩選 Toolbar

四個下拉（共用 `_eventFilter`）：

| 維度 | 選項 |
|---|---|
| 狀態 / Status | ALL / new / ack / in_progress / resolved |
| 等級 / Level | ALL / critical / warning |
| 維度 / Dimension | ALL + 9 個維度 |
| 船舶 / Vessel | ALL + 9 艘船 |

手機同樣支援 filter toggle 收合（`sessionStorage.slab_va_ev_filter_open`）。

#### 4.4.4 事件列表

桌面為表格 9 欄：

| 欄位 | 說明 |
|---|---|
| 事件 ID | `{vessel_id}-{dimension}-{YYYYMM}` mono font |
| 船舶 | IMO pill + 船名 |
| 維度 | dim.icon + 中文 + 英文 short |
| 等級 | Critical / Warning 徽章 |
| 開立時間 | mono |
| 狀態 | statusBadge(status)：中文 + 英文 |
| 指派 | 操作員名或「未指派 / Unassigned」 |
| 備註 | `💬 N` 或 `-` |
| (cleared) | 條件已消失時顯示 |

排序：
1. 狀態 rank：new < ack < in_progress < resolved
2. 等級 rank：critical < warning
3. 開立時間 DESC

點擊任一列 → `openEventModal(id)`。

#### 4.4.5 Event Modal

固定寬 640 px（行動裝置變 bottom sheet：全寬、上圓角、最大 92 vh），由 `<div id="ev-modal" class="modal-mask">` 包裹。

內容（自上而下）：

1. **標題列**：維度 icon + 中文 + 英文 short
2. **副標**：`event_id · 船名 (IMO)`，若 cleared 加註「· 條件已消失 / cleared」
3. **當前狀態**：狀態徽章 + 等級徽章 + 開立時間
4. **警示內容**：呼叫 `dimDescription(v, dim, alerts)` 取中英雙語量化說明（彩底框）
5. **通知信件**（僅 `alert` 維度）：呼叫 `renderEventMailList(vesselName)`
   - 列出該船所有 mail，依 `warning_event_time` DESC
   - Warning / Information 兩種等級用左邊框紅 / 藍色區分
   - 顯示徽章、warning_code、event_time、description
   - 若 `raw_body_excerpt` 含 `Comment: ...` 抽出來作為 callout
   - 列出 received_time、matched_port_name；標記 Departure / Arrival
6. **狀態轉換按鈕**：依 `EVENT_TRANSITIONS[currentStatus]` 動態產生
7. **指派下拉**：未指派 + 5 個操作員；onchange 即存，顯示「已儲存：X」2 秒提示
8. **新增備註**：textarea + 送出按鈕；提交後 `addEventNote` + 重整 modal
9. **備註紀錄列表**：依時間累積，每筆「時間 · 操作員 / 內容」
10. **狀態歷程**：每次轉換一行「時間 · 操作員 · 前狀態 → 後狀態」

關閉行為：
- 點右上 × 或點 mask 空白處關閉
- 若 URL 是 `#/event/{id}`，關閉時 `replaceState` 回 `#/events`

#### 4.4.6 狀態機

```
   ┌─────┐  Acknowledge   ┌─────┐  Start    ┌──────────────┐  Resolve   ┌──────────┐
   │ New │ ─────────────► │ Ack │ ────────► │ In Progress  │ ─────────► │ Resolved │
   └──┬──┘  ◄─── Reset ─── └──┬──┘  ◄─Back── └──────┬───────┘  ◄─Reopen ─└──────────┘
      │                       │                      │
      └───────────────────────┴──────────────────────┘
```

**轉換表（`EVENT_TRANSITIONS`）**

| 從 | 可至 | 標籤 |
|---|---|---|
| new | ack | 認可 / Acknowledge |
| ack | in_progress | 開始處理 / Start |
| ack | new | 退回 / Reset |
| in_progress | resolved | 標記解決 / Resolve |
| in_progress | ack | 退回 / Back |
| resolved | in_progress | 重新開啟 / Reopen |

#### 4.4.7 操作員清單

寫死於 JS：`OPERATORS = ["Op-Alice", "Op-Bob", "Op-Carol", "Capt-Lee", "Capt-Chen"]`。

> 正式版需替換為**登入帳號 / RBAC**整合。

---

### 4.5 警示時間線 Timeline (`#/timeline`)

混合來源的單欄時間軸：

| 來源 | 取值 | 樣式 |
|---|---|---|
| `MAILS` | warning_event_time (or received_time) | Warning → 紅、Information → 藍 |
| `vessels[].open_event`（若存在） | start_time | Warning → 紅、Advice → 橘 |

排序：時間 DESC。每筆顯示：

- 左側時間點 + 圓點（依等級上色）
- 標題：警示類型 + warning_code，右側 `vessel-pill`
- 時間：右上 mono
- 內文：description 截 200 字

無資料時顯示「無警示紀錄」。

---

### 4.6 閾值設定 Thresholds (`#/thresholds`)

#### 4.6.1 6 個可調維度

| Key | 顯示名 | 單位 / 範圍 | 預設 W | 預設 C | 步進 |
|---|---|---|---|---|---|
| route | 航線偏移 / Route Dev | × Safety Frame（0–5） | 0.70 | 1.00 | 0.05 |
| speed | 速度異常 / Speed Anom | × 計畫平均速度（0–2） | 0.20 | 0.40 | 0.05 |
| sea | 海況/天候 / Sea State | 海況指數（0–1） | 0.65 | 0.85 | 0.05 |
| comm | AIS 訊號 / AIS Comm | 通訊延遲分數（0–100） | 75 | 92 | 1 |
| port | 到港/離港 / Port Phase | 進出港敏感分數（0–100） | 65 | 88 | 1 |
| engine | 主機異常 / Engine | 主機異常分數（0–100） | 78 | 93 | 1 |

> `alert` / `event` / `zone` 維度由其他規則判定（信件等級、open_event 等級、區域分級對應），不在閾值頁調整。

#### 4.6.2 表格欄位

| 欄位 | 內容 |
|---|---|
| 維度 / Dimension | dim.icon + 標題 + 「short · unit (range)」 |
| Warning ≥ | `th-input-wrap`：number input + 自訂上下 stepper + 單位 pill |
| Critical ≥ | 同上，顏色紅 |
| 修改標記 | 與預設值不同時顯示橘色 ● |

#### 4.6.3 操作

| 按鈕 | 行為 |
|---|---|
| **Save & Re-evaluate** | 從所有 input 讀回值 → `saveThresholds()` → `syncEventsFromAlerts()` → `renderThresholds()`；顯示「已儲存 / Saved at HH:MM:SS」綠字提示 2.5 秒 |
| **Reset** | 還原為 `DEFAULT_THRESHOLDS` → 同樣 sync + render |

#### 4.6.4 觸發邏輯說明卡

底部固定卡片：

- **route**：`max(目前 XTD, 歷史最大偏移) ≥ Safety Frame × 閾值`
- **speed**：`|SOG − 計畫平均| / 計畫平均 > 閾值`（另：航行中近乎停止永遠 warning）
- **sea / comm / port / engine**：對應的偵測分數 > 閾值
- 頁面載入時 `syncEventsFromAlerts()` 會根據新閾值自動立案；既有事件不會被刪除，但「條件已消失 / cleared」標記會更新

#### 4.6.5 行動裝置

改用卡片：每張卡片標題（icon + 中文 + 「已修改」橘籤）→ 副標（short / unit / range / 預設值）→ 2 欄 grid：Warning ＋ Critical。

底部 `th-actions` 變 sticky bottom + safe-area inset。

---

### 4.7 全球風險區圖層（共用）

#### 4.7.1 8 個類別

| Key | 中文 | 英文 | 顏色 | demo 區數 |
|---|---|---|---|---|
| piracy | 海盜 / 武裝搶劫高風險區 | Piracy / Armed Robbery | `#ff4d4f` | 5 |
| war | 戰爭 / 武裝衝突區 | War / Armed Conflict | `#a02030` | 4 |
| sanction | 制裁 / 禁運 / 敏感港口 | Sanctions / Embargo | `#ff8c00` | 6 |
| military | 軍演 / 臨時禁航區 | Military Exercise / NOTAM | `#b069ff` | 5 |
| weather | 氣象與海況高風險區 | Weather / Heavy Seas | `#1e90ff` | 6 |
| eca | 環保排放管制區 (ECA) | Emission Control Area | `#2ecc71` | 5 |
| protected | 保護區 / 鯨豚限速區 | Protected / Whale Speed Limit | `#1abc9c` | 6 |
| congestion | 航道壅塞 / 避碰熱區 | Congested Traffic Lane | `#f5d04a` | 7 |

合計 **44 個 demo 區**。

#### 4.7.2 區域 Polygon

`fillOpacity` 依 level：

| level | fillOpacity |
|---|---|
| critical | 0.28 |
| high | 0.22 |
| medium | 0.16 |
| low / info | 0.12 |

`eca` 與 `protected` 採 dashed border（`dashArray: "4 3"`）以視覺區分。

#### 4.7.3 Popup 內容

點擊任一 zone polygon 開 popup（260–320 px 寬，maxHeight 桌面 360 / 手機 180）：

- 類別徽章（彩色背景）
- 中文 zone name（粗體）+ 英文 name
- type 徽章
- 中文 description + 英文 description
- KV meta：
  - 區域類型 Type
  - 生效 Effective（from – to）
  - 邊界 Bounds（自動算 bbox `min/max lat-lon`）
  - 來源 Source（含外連 ↗）
  - 代碼 ID · Lv. level

#### 4.7.4 區域判斷

`vesselZoneAlert(v)` 對每艘船：

1. 用 `pointInPolygon(lat, lon, z.coords)` 逐區判斷
2. 取所有命中區，依 `level rank` 由高至低排序
3. Top 區的 level：critical/high → 維度 `zone = critical`；medium/low/info → `warning`；未命中 → `normal`
4. 結果同時保留所有命中區（供 detail panel 顯示「另含 N 區」）

---

## 5. 警示計算邏輯

### 5.1 九大維度總覽

| Key | 監測目的 | 資料來源 | 可調閾值 | N/A 可能 |
|---|---|---|---|---|
| route | 是否偏離計畫航線 | `cross_track_distance_nm` + `ais_track[].deviation_nm` | ✅ | ✘ |
| speed | 速度是否與計畫平均嚴重不符 | `sog` + `planned_track[].sog` | ✅ | ✘ |
| sea | 海況風險 | 暫以 vessel_id 雜湊（demo） | ✅ | ✘ |
| port | 進出港敏感期判斷 | `progress_pct` + 雜湊 | ✅ | ✘ |
| engine | 主機 RPM / 排氣溫 / 油壓 異常 | 雜湊（demo） | ✅ | ✘ |
| alert | StormGeo 通知郵件 | `MAILS` 比對 vessel_name | ✘ | ✅ |
| comm | AIS 訊號新鮮度 | `ais_timestamp` 是否存在 + 雜湊 | ✅ | ✘ |
| event | 是否存在進行中事件 | `vessel.open_event` | ✘ | ✘ |
| zone | 當前位置是否在風險區 | `RISK_ZONES` polygon | ✘ | ✘ |

> 設計原則：只有 `alert` 維度允許 N/A；其他維度沒資料時一律視為 normal，避免「全 N/A」的不可判讀狀況。

### 5.2 各維度演算法

#### 5.2.1 route

```
xtd     = parseFloat(v.cross_track_distance_nm)
sf      = v.safety_frame_nm || 1.0
maxDev  = max(ais_track[i].deviation_nm)
worst   = max(xtd, maxDev)

if worst >= sf × T.route.critical → critical
elif worst >= sf × T.route.warning → warning
else → normal
```

#### 5.2.2 speed

```
planAvg = avg(planned_track[i].sog | sog > 0)
delta   = |sog - planAvg| / planAvg

if sog === null || planAvg === 0 → normal
if sog < 0.5 && planAvg > 5 → warning  (停車但應航行)
elif delta > T.speed.critical → critical
elif delta > T.speed.warning  → warning
else → normal
```

#### 5.2.3 sea

```
seaHash  = (vessel_id × 9301 + 49297) mod 233280
seaLevel = seaHash / 233280   ∈ [0, 1)

if seaLevel > T.sea.critical → critical
elif seaLevel > T.sea.warning → warning
else → normal
```

> 正式版接 NOAA / WMO / JMA / 商業氣象服務 API。

#### 5.2.4 alert

```
vmails = MAILS.filter(m => m.vessel_name === v.vessel_name)

if vmails.length === 0   → na
elif vmails has Warning  → critical
elif vmails has Information → warning
else → normal   // 例如全為 Advice 等級
```

> Demo 資料中 `warning_level` 可能值有 `Warning` / `Information` / `Advice` 三種；目前演算法僅對前兩種升級，`Advice` 等級不觸發。

#### 5.2.5 comm

```
if !ais_timestamp → critical
tsHash = (vessel_id × 7321 + 12345) mod 100

if tsHash > T.comm.critical → critical
elif tsHash > T.comm.warning → warning
else → normal
```

> 正式版用 `now() - ais_timestamp` 的分鐘數作為分數。

#### 5.2.6 event

```
if !v.open_event → normal
elif open_event.event_level === "Warning" → critical  (StormGeo Warning Mail 等級)
else → warning
```

#### 5.2.7 port

```
pct = v.progress_pct
portHash = (vessel_id × 5779 + 38461) mod 100

if pct === null → normal
elif pct > 92 || pct < 5  (進出港敏感期)
   if portHash > T.port.critical → critical
   elif portHash > T.port.warning → warning
   else → normal
else (航行中)
   if portHash > 95 → warning
   else → normal
```

#### 5.2.8 engine

```
engHash = (vessel_id × 8419 + 7919) mod 100

if engHash > T.engine.critical → critical
elif engHash > T.engine.warning → warning
else → normal
```

> 正式版接 IoT 主機監測訊號（RPM / 排氣溫 / 油壓 / 振動）。

#### 5.2.9 zone

`vesselZoneAlert(v)` 已於 4.7.4 描述。

### 5.3 整體風險判定

```
levels = [9 個維度的 level]

if any level === "critical" → risk = critical
elif any level === "warning" → risk = warning
else → risk = normal
```

僅 alert 可 N/A，因此整體一定有 normal/warning/critical 結果（不會出現整體 N/A）。

---

## 6. 資料模型

### 6.1 Vessel（船舶）

```ts
{
  vessel_id:                 number,    // 主鍵
  vessel_name:               string,    // 船名（如 "YM TROPHY"）
  imo:                       string,    // IMO 號（7 位數）
  mmsi:                      string,    // MMSI（9 位數）
  latitude:                  number | null,
  longitude:                 number | null,
  sog:                       number | null,    // knots
  cog:                       number | null,    // degree 0-359
  ais_timestamp:             string | null,    // "YYYY-MM-DD HH:mm:ss" (UTC)
  nav_status:                number | null,    // 可選；ITU-R M.1371 navigation status code
  cross_track_distance_nm:   number | string,  // 當前 XTD（海浬）
  safety_frame_nm:           number,           // 安全框寬度（海浬）
  progress_pct:              number,           // 0-100
  status:                    "Normal" | string,
  calculated_at:             string,           // 系統判斷的時間戳
  plan_id:                   number,           // 對應航行計畫
  plan_source:               "StormGeo" | "WNI" | string,
  plan_imported_at:          string,
  open_event:                OpenEvent | null,
  planned_track:             PlannedTrackPoint[],
  ais_track:                 AISTrackPoint[],
}
```

### 6.2 Planned Track Point

```ts
{
  index:           number,
  latitude:        number,
  longitude:       number,
  safety_frame_nm: number,
  date:            string,    // ISO "YYYY-MM-DDTHH:mm:ssZ"
  position_type:   "Departure" | "Waypoint" | "Arrival" | string,
  port_unlocode:   string | null,    // UN/LOCODE，如 "BEANR"
  port_name:       string | null,
  sog:             number,           // 計畫航速（節）
  heading:         number,
}
```

### 6.3 AIS Track Point

```ts
{
  index:          number,
  latitude:       number,
  longitude:      number,
  sog:            number,
  cog:            number,
  ais_timestamp:  string,    // UTC
  deviation_nm:   number,    // 該點離計畫航線的垂直距離
  is_deviated:    boolean,   // 是否視為偏移點
}
```

### 6.4 Open Event（船舶層級的進行中事件）

```ts
{
  id:                          number,
  event_level:                 "Warning" | "Information" | "Advice",
  start_time:                  string,    // "YYYY-MM-DD HH:mm:ss"
  last_detected_time:          string,
  max_deviation_distance_nm:   number,
}
```

> 注意：這是 StormGeo / 計畫服務商上游推來的「船舶級事件」，與本系統「事件處理」流程中的 Event 不同（後者是系統自動立案 + 操作員處理流程）。

### 6.5 Warning Mail（StormGeo 通知信）

```ts
{
  id:                       number,
  subject:                  string,
  received_time:            string,
  vessel_name:              string,
  imo:                      string,
  warning_event_time:       string,
  warning_code:             string,    // "D02" / "E70" / "T10" / "D16" ...
  warning_level:            "Warning" | "Information" | "Advice",   // Advice 在目前判定中不升級
  warning_description:      string,
  raw_body_excerpt:         string,    // 原始信件節錄；含 "Comment: ..." 時抽出
  mentioned_locodes:        string[],
  is_departure_event:       boolean,
  is_arrival_event:         boolean,
  latitude:                 number | null,
  longitude:                number | null,
  matched_position_type:    "Departure" | "Arrival" | "Waypoint" | null,
  matched_port_code:        string | null,
  matched_port_name:        string | null,
  matched_event_date:       string | null,
  match_method:             string,    // "no-planned" / "port-departure:BEANR" / "time-match (~93.9h)" ...
  parsed_status:            "Parsed" | string,
}
```

### 6.6 Risk Zone

```ts
{
  cat:             "piracy"|"war"|"sanction"|"military"|"weather"|"eca"|"protected"|"congestion",
  id:              string,    // 區域代碼，如 "PIR-GOG"
  level:           "critical" | "high" | "medium" | "low" | "info",
  name:            string,    // 中文名
  name_en:         string,
  type:            string,    // 中文次分類
  type_en:         string,
  desc:            string,    // 中文說明
  desc_en:         string,
  source:          string,    // 出處（IMB / OFAC / JWLA-027 ...）
  source_url:      string | null,
  effective_from:  string,    // 日期 or "全年" / "依公告"
  effective_to:    string,    // 日期 or "進行中"
  coords:          [number, number][],    // [[lat, lon], ...] 邊界
}
```

### 6.7 Risk Zone Category

```ts
{
  key:       string,
  label:     string,    // 中文
  label_en:  string,
  color:     string,    // 顯示色
}
```

### 6.8 Event（系統自動立案的處理流程事件）

```ts
{
  id:           string,     // "{vessel_id}-{dimension}-{YYYYMM}"
  vessel_id:    number,
  vessel_name:  string,
  dimension:    "route"|"speed"|...|"zone",    // 9 個維度之一
  level:        "critical" | "warning",
  opened_at:    string,
  status:       "new" | "ack" | "in_progress" | "resolved",
  assignee:     string | null,
  notes:        { at: string, by: string, text: string }[],
  history:      { from: string|null, to: string, at: string, by: string }[],
  cleared?:     boolean,    // 條件已消失但事件尚未結案
}
```

### 6.9 Threshold（閾值設定）

```ts
{
  route:  { warning: number, critical: number },  // × Safety Frame
  speed:  { warning: number, critical: number },  // × 計畫平均速度
  sea:    { warning: number, critical: number },  // 0-1 score
  comm:   { warning: number, critical: number },  // 0-100 score
  port:   { warning: number, critical: number },  // 0-100 score
  engine: { warning: number, critical: number },  // 0-100 score
}
```

---

## 7. 互動與狀態管理

### 7.1 路由切換

由 `route()` 函式統一處理，於 hashchange 時呼叫：

```
#/fleet           → setMainMode("fleet-mode")  → renderFleet()
#/vessel/:id      → setMainMode("")            → renderDetail(id)
#/events          → setMainMode("")            → renderEvents()
#/event/:id       → setMainMode("")            → renderEvents() + openEventModal(id)
#/timeline        → setMainMode("")            → renderTimeline()
#/thresholds      → setMainMode("th-mode")     → renderThresholds()
其他              → 預設 fleet
```

`setMainMode()` 控制 `<main>` 的 className，影響 overflow 與 padding。

### 7.2 篩選 / 搜尋

- 篩選 / 關鍵字皆是「整頁重繪」，但 input 重生後會用 `setSelectionRange` 還原游標位置，避免打字游標跳掉
- 篩選後**地圖與列表同步**：`drawFleetMap(filtered)` 與 `renderMatrixTable(filtered)` 接相同 array

### 7.3 列表展開比例

- 預設 70 / 30；點 list-handle 切到 50 / 50
- `_listExpanded` 跨 overview ↔ detail 重繪保留（但不存 sessionStorage，重新整理會回 70/30）
- 動畫由 CSS flex-grow transition 控制（0.28 s cubic-bezier）
- 透過 ResizeObserver 對地圖呼叫 `invalidateSize()`，避免動畫期間圖磚錯位

### 7.4 圖層切換

- 單船 detail 的 5 個圖層狀態存於 JS 全域 `_layerState`（不持久化）
- 全球風險區 8 類別狀態存於 `_riskLayerState` + `sessionStorage.slab_va_risk_layers`
- Popup 開啟時自動把絕對定位的浮動 overlay（toolbar / banner / risk-toggle / layer-toggle）淡化到 0.15 opacity + `pointer-events: none`，避免 z-index 衝突遮住 popup；popup 關閉時還原

### 7.5 持久化

詳見附錄 B。

### 7.6 跨組件溝通

無事件匯流排，全靠：

- 直接呼叫 render 函式（`renderFleet` / `renderEvents` ...）
- 全域 window 函式：`selectVessel`、`clearSelectedVessel`、`openEventModal`、`doTransition`、`doAssign`、`submitNote`、`resetThresholdsAndRefresh`

---

## 8. RWD / 行動裝置

### 8.1 斷點策略

| Breakpoint | Trigger | 主要變化 |
|---|---|---|
| ≤ 1024 px | `IS_MOBILE = true` | `body` 改 `column-reverse`、sidebar 變底部 tab、表格變卡片、地圖 overlay 改 static strip |
| 600–1024 px | Tablet portrait | 卡片排 2 欄、地圖固定高 320 px、KV key 欄寬 130 px |
| ≤ 599 px | Phone | 卡片排 1 欄、地圖固定高 240 px |

### 8.2 共通設計

- Modal 變底部 sheet（圓角頂、padding 含 `env(safe-area-inset-bottom)`）
- threshold 頁底部按鈕列 sticky + safe-area
- 漏斗 chip 收合篩選，dirty 狀態用藍框提示
- Toast 出現在 tab bar 上方 76 px

### 8.3 卡片渲染分支

| 渲染函式 | 取代 | 備註 |
|---|---|---|
| `renderMatrixCards(filtered)` | `renderMatrixTable` | 船隊頁 |
| `renderEventsCards(filtered)` | events 表格 | 事件處理頁 |
| `renderThresholdsCards()` | th-table | 閾值設定頁 |

---

## 9. 地圖規範

### 9.1 圖磚

```
https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
subdomains: "abcd"
maxZoom: 19
attribution: '© OpenStreetMap © CARTO'
```

### 9.2 地圖配置

| 場景 | 中心 | 縮放 | zoomControl | minZoom |
|---|---|---|---|---|
| Fleet overview | `[20, 60]` | 2 | bottom-right | – |
| 單船 (Fleet detail mode) | `[22.3, 118.5]` | 4 | bottom-right | 2 |
| 完整 `#/vessel/:id` 頁 | `[22.3, 118.5]` | 4 | bottom-right | 2 |

`worldCopyJump: true` 僅用於 Fleet overview，讓拖到極端經度時自動跳回主世界副本。

### 9.3 自訂 Pane（疊放順序）

| Pane | z-index | 內容 |
|---|---|---|
| `corridorPane` | 400 | Safety Frame 走廊 |
| `plannedPane` | 410 | 計畫航線 polyline + waypoint dots |
| `aisPane` | 420 | AIS 軌跡 polyline + dots |
| (Risk zones) | 預設 ~ 400 | polygon |
| (Markers) | Leaflet 預設 600 | ships / mails |
| Popup | Leaflet 預設 700+ | popups |

### 9.4 跨換日線

由 `unwrapLongitudes` / `splitAtAntimeridian` / `shiftLatLngs` / `addWrappedPolyline` / `addWrappedPolygon` / `addWrappedCircleMarker` 五個共用工具函式處理：

- **unwrap**：把跨日線後的後續點 lon 加 ±360°，給 fitBounds 用
- **split**：在跨日線處內插 ±180 點，把 polyline 切兩段
- **wrapped × 3 copies**：每段在 `-360 / 0 / +360` 三份 world copy 各畫一條
- **noClip: true**：避免 Leaflet 在低 zoom 級別把 polyline 切掉

### 9.5 船舶 Marker

- DivIcon，內含 SVG 三角形（路線箭頭）
- 顏色：critical 紅 / warning 橘 / normal 綠
- `transform: rotate(${cog}deg)` 依 COG 旋轉
- critical / warning 額外附 `<div class="fleet-marker-pulse">` 脈動光環

### 9.6 Mail Marker

- DivIcon，水滴形（`border-radius: 50% 50% 50% 0; transform: rotate(-45deg)`）
- 顏色：Warning 紅 `#c0392b`、Information 藍 `#1c5a96`
- 中央 ! 符號

---

## 10. 非功能性需求

### 10.1 效能

- 9 艘船 × 9 維度 ≈ 81 次計算，目前直接 inline 在 render 函式內，可接受
- 列表變更後**整頁重繪**：input 重生時用 `setSelectionRange` 還原游標
- `ResizeObserver` 用 `requestAnimationFrame` 節流，避免 invalidateSize 連續觸發

### 10.2 瀏覽器相容

| 瀏覽器 | 版本 |
|---|---|
| Chrome / Edge | 最近 2 大版 |
| Safari | 14+（含 iOS） |
| Firefox | ESR + 最近 2 版 |

CSS 已 fallback 處理 `backdrop-filter`（含 `-webkit-`）。

### 10.3 可用性

- 鍵盤：tabindex 已加在 icon-header / bi-th-tip / list-handle（支援 Enter / Space）
- ARIA：篩選 / 檢視 toggle 有 `aria-label`
- Focus 樣式：`outline` 配深色主題、focus-within 變藍框
- **目前未做完整無障礙稽核**，正式版需 WCAG 2.1 AA 級檢測

### 10.4 國際化

- 全介面採中英雙語顯示（中文主、英文輔）：
  - 標題 `中文 / English`
  - 表頭 `<div class="bi-th"> 中 + <span class="en">英`
  - 等級徽章內含中英文：`新立案 / New`
- 目前以**寫死字串**呈現，正式版可抽出 i18n 字典
- 時間顯示：原始 UTC，介面層轉 UTC+8（台北）

---

## 11. 後續擴充

### 11.1 已知未實作

| 項目 | 現況 | 備註 |
|---|---|---|
| 真實 AIS 對接 | 用 mockup 資料 | 預期接 AIS 服務商 API（每 1–5 分鐘輪詢） |
| 真實計畫航線 | 寫死於 mockup | StormGeo / WNI API 對接 |
| 氣象資料 | vessel_id 雜湊產生海況 | NOAA / WMO / 商業氣象 API |
| 主機 IoT | 雜湊 | 對接 ShipManager / IoT 平台 |
| Warning Mail 解析 | 由後端解析後存入 | 已有 raw_body_excerpt、parsed_status 欄位 |
| 使用者登入 | 無 | RBAC：Operator / Captain / Supervisor |
| 通知通路 | 無 | Email / Slack / 推播 / Webhook |
| 稽核 log | 僅有事件 history | 全操作 audit log |
| 報表匯出 | 無 | Excel / PDF 匯出（事件、時間線） |
| 多語系 | 寫死 中英 | i18n 字典 |

### 11.2 待擴充維度

- `bunker` 燃油 / 排放異常
- `cargo` 載貨狀態
- `crew` 船員值班 / 工時
- `cyber` 網路安全（GPS 偽訊、AIS spoofing）

### 11.3 待整合資料源

- IMB / ReCAAP（海盜）
- JWC / Lloyd's JWLA（戰爭）
- OFAC / EU / UN SDN（制裁）
- 各國 NAVAREA / NOTMAR（軍演）
- WMO / JMA / NOAA NHC（氣象）
- MARPOL Annex VI / IMO MEPC（ECA）
- NOAA Fisheries / IMO MEPC（保護區）
- IMO Traffic Separation Schemes（壅塞）

---

## 附錄 A：路由清單

| Hash | 處理函式 | main 模式 | 對應導覽 |
|---|---|---|---|
| `#/fleet`（預設） | `renderFleet()` | `fleet-mode` | 船隊監控 |
| `#/vessel/:id` | `renderDetail(id)` | 預設 | 船隊監控 active |
| `#/events` | `renderEvents()` | 預設 | 事件處理 |
| `#/event/:id` | `renderEvents() + openEventModal(id)` | 預設 | 事件處理 |
| `#/timeline` | `renderTimeline()` | 預設 | 警示時間線 |
| `#/thresholds` | `renderThresholds()` | `th-mode` | 閾值設定 |

---

## 附錄 B：儲存鍵清單

### localStorage

| Key | 內容 | 預設 |
|---|---|---|
| `slab_va_thresholds_v1` | 6 維度的 {warning, critical} 物件 | DEFAULT_THRESHOLDS |
| `slab_va_events_v1` | Event[] 陣列 | `[]` |
| `slab_va_sidebar_pinned_v1` | "1" / "0" | "0" |

### sessionStorage

| Key | 內容 | 預設 |
|---|---|---|
| `slab_va_banner_dismissed_critical_count` | 最後一次按 × 時的 critical 數量 | `-1` |
| `slab_va_mobile_view` | "split" / "list" / "map" | "split" |
| `slab_va_filter_open` | "1" / "0"（船隊頁 toolbar 篩選展開） | "0" |
| `slab_va_ev_filter_open` | "1" / "0"（事件頁 toolbar 篩選展開） | "0" |
| `slab_va_risk_layers` | { piracy:bool, war:bool, ... } | 預設 4 開 |
| `slab_va_risk_panel_open` | "1" / "0" | 桌面 "1"、手機 "0" |

---

## 附錄 C：警示維度對照表

| Key | 中文 | 英文 short | Icon | 觸發來源 | 閾值可調 |
|---|---|---|---|---|---|
| route | 航線偏移 | Route Dev | V 折線 + 點 | XTD vs Safety Frame | ✅ |
| speed | 速度異常 | Speed | 半圓指針 | SOG vs plan avg | ✅ |
| sea | 海況/天候 | Sea State | 雙波浪 | 海況指數 0–1 | ✅ |
| port | 到港/離港 | Port Ops | 錨形 | progress + 雜湊 | ✅ |
| engine | 主機異常 | Main Engine | 齒輪 | 雜湊 0–100 | ✅ |
| alert | Warning Mail | Mail | 三角形 + ! | StormGeo Warning/Information | ✘ |
| comm | AIS 訊號 | Comms | 雲 + 箭頭 | AIS 時間戳 + 雜湊 | ✅ |
| event | 進行中事件 | Open Deviation | 菱形 + 點 | vessel.open_event 等級 | ✘ |
| zone | 區域警示 | Zone Alert | 盾 + ! | 8 類 risk zone polygon | ✘ |

---

## 附錄 D：畫面預覽（圖位）

> 本附錄保留 8 個截圖位置；驗收 / 文件定稿時再以人工或自動方式補上。

### D.1 [圖位] 船隊監控 — 桌面總覽
- 主畫面：上方地圖 + 9 維度列表 + 浮動 toolbar + Critical Banner + Risk Zones panel
- 路徑：`#/fleet`，瀏覽器寬度 1920×1080

### D.2 [圖位] 船隊監控 — 單船 detail 模式
- 路徑：`#/fleet` 點任一船舶
- 畫面：左單船地圖（含 5 個圖層）+ 右 detail panel（XTD / 9 維度 / 進行中事件 / KV 群組）

### D.3 [圖位] 完整單船頁
- 路徑：`#/vessel/9789996`（YM TROPHY）

### D.4 [圖位] 事件處理
- 路徑：`#/events`
- 含統計 pill bar + 篩選 toolbar + 事件列表

### D.5 [圖位] 事件 Modal — `alert` 維度
- 含 Warning Mail 列表 + 狀態轉換按鈕 + 備註與歷程
- 觸發：點 `alert` 維度的任一事件

### D.6 [圖位] 警示時間線
- 路徑：`#/timeline`

### D.7 [圖位] 閾值設定
- 路徑：`#/thresholds`
- 6 個維度的 Warning / Critical 輸入

### D.8 [圖位] 行動裝置（≤ 599 px）
- 同時展示船隊卡片 + 底部 tab bar + 行動專屬 toolbar
- 視窗：375×812 (iPhone 13)

---

*本規格書依 Demo `voyage-alert-rwd.html` 反向整理，所有規則皆可在 demo 原始碼中找到對應實作。後續若 demo 變更，本文件需同步更新。*
