# SDataPro 提案 Demo 規格書 v1.0

**SDataPro Fleet OCC — Proposal Demo Specification**

| 項目 | 內容 |
|---|---|
| 文件名稱 | SDataPro 提案 Demo HTML 規格書 |
| 版本 | v1.0 |
| 日期 | 2026-05-29 |
| 撰寫 | 摯陞數位科技 SLAB |
| 對象 | 前端工程師（產出提案 Demo HTML 用） |
| 用途 | 商務提案展示、客戶情境演示 |
| 不含 | 後端 API、登入驗證、真實資料對接 |

---

## 目次

1. 任務說明與 Demo 目標
2. 技術選型與專案結構
3. 設計系統（色票、字級、間距、圖示）
4. 共用元件規範
5. 全域佈局（Sidebar / Header）
6. 路由與狀態管理
7. RWD 規格
8. 假資料規範（50 艘船 / 港口 / 事件）
9. 頁面規格 — 船隊監控
10. 頁面規格 — 船舶詳情（5 分頁）
11. 頁面規格 — 港口擁塞看板
12. 頁面規格 — 港口情資 SitRep
13. 頁面規格 — 事件處理
14. 頁面規格 — 警示時間線
15. 頁面規格 — 閾值設定
16. 頁面規格 — 稽核紀錄
17. 頁面規格 — 報表匯出
18. 跨頁共用機制（資料延遲、5 NM 提醒、Land mask、告警）
19. Demo 故事劇本（給客戶演示的 4 個情境）
20. 驗收標準與待確認事項
21. 附錄 A：假資料 mockup 範本
22. 附錄 B：圖示 SVG inline 程式碼

---

## 1. 任務說明與 Demo 目標

### 1.1 任務

依本規格書產出**一套可在 Chrome 直接開啟的 SDataPro 系統 Demo**，用於商務提案、客戶情境演示、內部需求確認。

### 1.2 Demo 目標

- 展示「船東公司岸端 OCC」如何使用 SDataPro 監看 50+ 艘船
- 展示 5 海哩 AIS 觀測 → 多視角分析的產品價值
- 演示 4 個典型營運情境（每日監看、CPA 查證、港口擁塞應對、計畫版本管理）
- 看起來專業、深色科技感、貼近企業 OCC 戰情室

### 1.3 Demo 受眾

- **客戶決策者**：船東公司營運主管、海務主管、資訊主管
- **內部 PM / 業務**：提案過程中講解產品概念
- **前端工程師**：理解 UI 設計方向

### 1.4 展示環境

- Chrome 最新版（不需相容舊瀏覽器）
- 1920×1080 投影為主視覺基準（但**仍需 RWD**，因為客戶可能在筆電 / 平板看）
- 雙擊檔案開啟即可，無需 server
- 無網路也能跑（除 Leaflet CDN）

### 1.5 Demo 範圍

包含 9 個 sidebar 項目的完整介面 + 互動 + 假資料；**不**包含：
- 真實 AIS / 氣象 / IoT 對接
- 後端 API
- 登入 / 權限
- 推播 / Email 通路
- 使用者管理

---

## 2. 技術選型與專案結構

### 2.1 技術選型

| 層級 | 採用 | 理由 |
|---|---|---|
| 前端框架 | **Vanilla JavaScript** | 不引入 React/Vue/Angular，與 voyage-alert-rwd.html 一致 |
| 地圖 | **Leaflet 1.9.4** + CARTO Dark Matter basemap | 同 voyage-alert |
| 字體 | 系統字體堆疊 | `-apple-system, "Segoe UI", "Noto Sans TC", sans-serif` |
| 路由 | URL Hash routing（`location.hash` + `hashchange`） | 同 voyage-alert，可深連結 |
| 狀態 | 記憶體變數 + `localStorage` / `sessionStorage` | 同 voyage-alert |
| 圖表 | **Inline SVG** 手繪（折線、進度條）+ 必要時 Chart.js CDN | 避免外部依賴 |
| Land mask | Natural Earth Land Polygons (1:50m) GeoJSON 預載 | 處理航線不穿陸 |

### 2.2 專案目錄結構

```
sdatapro-demo/
├── index.html                  ← 入口
├── styles/
│   └── main.css                ← 全域樣式（色票、字級、共用元件）
├── scripts/
│   ├── app.js                  ← 主程式（路由、初始化）
│   ├── router.js               ← Hash routing
│   ├── state.js                ← 全域狀態（含 localStorage 持久化）
│   ├── components/
│   │   ├── sidebar.js
│   │   ├── header.js
│   │   ├── modal.js
│   │   ├── drawer.js
│   │   ├── toast.js
│   │   └── alert-banner.js
│   ├── pages/
│   │   ├── fleet-monitor.js
│   │   ├── vessel-detail.js   ← 含 5 個子分頁
│   │   ├── port-congestion.js
│   │   ├── port-sitrep.js
│   │   ├── events.js
│   │   ├── timeline.js
│   │   ├── thresholds.js
│   │   ├── audit-log.js
│   │   └── reports.js
│   ├── map/
│   │   ├── leaflet-setup.js
│   │   ├── layers.js          ← CPA / 歷史 / 計畫 / 風險區 / AIS 品質
│   │   ├── land-mask.js       ← Natural Earth GeoJSON 預載
│   │   └── antimeridian.js    ← 跨換日線處理（沿用 voyage-alert）
│   └── mock/
│       ├── vessels.js          ← 50 艘自家船 + 化名
│       ├── ports.js            ← 145 重點商港
│       ├── ais-observations.js ← 5 NM 內外來船觀測
│       ├── events.js           ← 9 維度告警事件
│       ├── plans.js            ← 航行計畫 + 版本
│       ├── sitreps.js          ← 港口情資報告
│       └── audit-logs.js       ← 稽核紀錄
└── assets/
    ├── icons/                  ← SVG 圖示
    └── land-polygons.geojson   ← 陸地遮罩
```

### 2.3 共用工具函式

| 函式 | 用途 |
|---|---|
| `fmtTimeUtc8(utc)` | UTC → 台北時間，格式 `YYYY-MM-DD HH:mm` |
| `fmtRelTime(ts)` | 「X 分鐘前」「X 小時前」 |
| `fmtDMS(deg, type)` | 經緯度 → DMS 格式 `22°34'12.3" N` |
| `formatNM(nm)` | `0.38 nm` 統一小數位 |
| `getDataDelay(ts)` | 計算「資料延遲 X 分鐘」 |
| `writeAuditLog(action, before, after, comment)` | 寫入 localStorage 稽核 |
| `showToast(type, msg)` | 顯示右上角 Toast |
| `showAlertBanner(level, msg)` | 顯示左上角 Banner |
| `clipToSea(latlngs)` | 軌跡點陸地裁切（land mask） |
| `splitAtAntimeridian(latlngs)` | 跨換日線分段（沿用 voyage-alert） |

---

## 3. 設計系統

### 3.1 色票（與 voyage-alert-rwd.html 完全一致）

#### 底色

| Token | 值 | 用途 |
|---|---|---|
| Page bg | `#000000` | body 底 |
| Surface 1 | `#0d0d0d` | Sidebar、Header、Tooltip |
| Surface 2 | `#141414` | 卡片、Modal、Panel |
| Surface 3 | `#1a1a1a` | hover、輸入框底 |
| Border | `#2a2a2a` | 一般邊框 |
| Divider | `#333333` | 較深分隔線 |

#### 文字

| Token | 值 | 用途 |
|---|---|---|
| Primary | `#e4eaf2` | 標題、主要數值 |
| Body | `#d8dee9` | 一般內文 |
| Secondary | `#c4cdda` | 次要說明 |
| Muted | `#9aa5b8` | 標籤、icon 預設色 |
| Subtle | `#7c8a9e` | 英文補語、灰提示 |
| Disabled | `#5e6b80` | 弱化提示 |

#### 強調

| Token | 值 | 用途 |
|---|---|---|
| Accent / Link | `#9ec5ff` | 連結、focus 邊框 |
| Primary CTA | `#2c6cdb` → `#3d7eed`(hover) | 主按鈕 |
| Secondary CTA bg | `rgba(44,108,219,0.18)` | pill 底 |

#### 警示等級

| 等級 | 主色 | 文字色 | 半透明底 |
|---|---|---|---|
| Critical | `#ff4d4f` | `#ff8a8a` | `rgba(255,77,79,0.15)` |
| Warning | `#f5a623` | `#f5b753` | `rgba(245,166,35,0.15)` |
| Normal | `#4cd97a` | `#6ee094` | `rgba(76,217,122,0.15)` |
| Info | `#9ec5ff` | `#9ec5ff` | `rgba(44,108,219,0.18)` |
| N/A | dashed | `#7c8a9e` | `rgba(108,122,145,0.10)` |

#### 維度色（CPA / SitRep / AIS 等使用）

| 維度 | 色票 |
|---|---|
| CPA / 風險 | `#ff4d4f` 紅 |
| 港口 / 擁塞 | `#f5a623` 橘 |
| ETA / 營運 | `#4cd97a` 綠 |
| SitRep / 情資 | `#9b59b6` 紫 |
| AIS 品質 | `#9aa5b8` 灰 |
| 周圍監控 / 主視角 | `#2c6cdb` 藍 |

### 3.2 字級

| 用途 | 大小 | weight |
|---|---|---|
| Page title `<h2>` | 18 px / 行動 16 px | 600 |
| Section header `<h3>` | 14 px UPPERCASE letter-spacing 0.5 | 600 |
| 表頭 | 12 px UPPERCASE letter-spacing 0.3 | 600 |
| 內文 | 14 px | 400 |
| 表內主數值 | 16–24 px tabular-nums | 600 |
| 大型 KPI | 28–36 px tabular-nums | 600 |
| 雙語英文補語 | 12 px | 400 |

### 3.3 間距

| Token | 值 | 用途 |
|---|---|---|
| `--sp-1` | 4 px | 細微 |
| `--sp-2` | 8 px | 元件內間距 |
| `--sp-3` | 12 px | 卡片內間距 |
| `--sp-4` | 16 px | 區塊間距 |
| `--sp-5` | 24 px | 大區塊間距 |
| `--sp-6` | 32 px | Section 間距 |

### 3.4 圓角

| Token | 值 | 用途 |
|---|---|---|
| Sm | 3 px | Badge / pill |
| Base | 4 px | Button / input |
| Md | 6 px | Card / Modal |
| Lg | 8 px | 大區塊 |
| Full | 50 % | dot / 圓點 |

### 3.5 圖示

採用 **inline SVG** 統一管理。9 維度 icon 已於 voyage-alert-rwd.html 定義（24×24 viewBox）：

| Key | 中文 | 英文 |
|---|---|---|
| `route` | 航線偏移 | Route Dev |
| `speed` | 速度異常 | Speed |
| `sea` | 海況/天候 | Sea State |
| `port` | 到港/離港 | Port Ops |
| `engine` | 主機異常 | Main Engine |
| `alert` | Warning Mail | Mail |
| `comm` | AIS 訊號 | Comms |
| `event` | 進行中事件 | Open Deviation |
| `zone` | 區域警示 | Zone Alert |

新增（提案 Demo 用）：

| Key | 用途 |
|---|---|
| `cpa` | CPA 預警（雙船軌跡 + 交點） |
| `eta` | ETA 預測（時鐘 + 進度） |
| `sitrep` | SitRep 報告（文件 + 訊號波） |
| `audit` | 稽核（盾牌 + 勾選） |
| `report` | 報表（圖表 + 下載） |
| `vessel` | 船舶（船型側視） |
| `layer` | 圖層（疊圖） |
| `replay` | 回放（播放鍵） |

詳細 SVG 程式碼見**附錄 B**。

---

## 4. 共用元件規範

### 4.1 Button

```css
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 4px;
  font-family: inherit; font-size: 13px; font-weight: 500;
  border: 1px solid transparent; cursor: pointer;
  transition: all 0.15s ease;
}
.btn-primary {
  background: #2c6cdb; color: #fff;
}
.btn-primary:hover { background: #3d7eed; }
.btn-secondary {
  background: rgba(44,108,219,0.10); color: #9ec5ff;
  border-color: #2c6cdb;
}
.btn-secondary:hover { background: rgba(44,108,219,0.20); }
.btn-ghost {
  background: transparent; color: #c4cdda;
  border-color: #2a2a2a;
}
.btn-ghost:hover { background: #1a1a1a; }
.btn-danger {
  background: rgba(255,77,79,0.20); color: #ff8a8a;
  border-color: #ff4d4f;
}
```

### 4.2 Badge / Pill

```css
.badge {
  display: inline-block; padding: 2px 8px;
  border-radius: 3px; font-size: 11px; font-weight: 600;
  letter-spacing: 0.3px;
}
.badge-critical { background: rgba(255,77,79,0.15); color: #ff8a8a; }
.badge-warning  { background: rgba(245,166,35,0.15); color: #f5b753; }
.badge-normal   { background: rgba(76,217,122,0.15); color: #6ee094; }
.badge-info     { background: rgba(44,108,219,0.18); color: #9ec5ff; }
.badge-na       { border: 1px dashed #7c8a9e; color: #7c8a9e; }
```

### 4.3 Card

```css
.card {
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 16px 20px;
}
.card-title {
  font-size: 13px; font-weight: 600;
  color: #e4eaf2; margin-bottom: 4px;
}
.card-subtitle {
  font-size: 11px; color: #9aa5b8;
  text-transform: uppercase; letter-spacing: 0.3px;
  margin-bottom: 12px;
}
```

### 4.4 Modal

```
ID: ev-modal / common-modal
寬度: 桌面 640 px / 平板 90vw / 手機 bottom sheet 100vw
最大高度: 92 vh
背景遮罩: rgba(0,0,0,0.6) + backdrop-filter: blur(2px)
```

行為：
- 點外圍空白處關閉
- ESC 關閉
- 帶 URL fragment 時可深連結（如 `#/event/123` 自動開）

### 4.5 Drawer（右側滑出）

```
寬度: 380 px / 行動 100vw
位置: fixed right 0
動畫: transform: translateX(100%) → 0, transition 0.22s
```

### 4.6 Toast

```
位置: 桌面右上 (16px, 16px) / 行動 tab bar 上方 76px
寬度: 320 px / 行動 calc(100vw - 32px)
持續時間: 3s 自動關閉 / 可手動 ×
動畫: slide-in-right
```

### 4.7 Alert Banner

```
位置: 地圖左上 absolute (16px, 16px), z-index 600
寬度: 380 px / 行動 100% inline
背景: 依等級半透明 + 1 px solid 邊框
可 × 關閉，關閉後改成右上 pulse icon
```

### 4.8 Tooltip / icon-tip-portal

沿用 voyage-alert-rwd.html 的 `.bi-th-tip` + portal 機制（避免被 overflow 裁掉）。

---

## 5. 全域佈局（Sidebar / Header）

### 5.1 Sidebar

```
┌─────────────────────────────────────┐
│ SDataPro                            │  ← 品牌 + pin button
│ FLEET OCC                           │
├─────────────────────────────────────┤
│ 即時監看                            │  ← group title
│ 📊 船隊監控          [8]            │  ← active = 左邊藍 2px border
│ 🚢 船舶詳情          5 分頁          │
├─────────────────────────────────────┤
│ 港口營運                            │
│ ⚓ 港口擁塞看板                     │
│ 📋 港口情資 SitRep                  │
├─────────────────────────────────────┤
│ 事件管理                            │
│ ⚠ 事件處理          [3]            │
│ 🕐 警示時間線                       │
├─────────────────────────────────────┤
│ 系統管理                            │
│ ⚙ 閾值設定                          │
│ 📄 稽核紀錄                         │
│ ⬇ 報表匯出                          │
└─────────────────────────────────────┘
```

#### 行為

- **桌面 ≥ 1025 px**：預設收合 60 px（只顯示 icon）；hover 展開 220 px；右上 pin button 鎖定
- **行動 ≤ 1024 px**：變底部 tab bar；只顯示 5 個常用（船隊監控 / 船舶詳情 / 港口擁塞 / 事件處理 / 更多）；其餘進「更多 ▾」展開
- Pin 狀態存 `localStorage.slab_sidebar_pinned_v2`

#### 分組

| 順序 | Group | 項目數 |
|---|---|---|
| 1 | 即時監看 | 2 |
| 2 | 港口營運 | 2 |
| 3 | 事件管理 | 2 |
| 4 | 系統管理 | 3 |

### 5.2 Header

桌面 Header 結構：

```
┌────────────────────────────────────────────────────────────────┐
│ [Page Title 18px]    最後更新 X 分鐘前 ⓘ   [User]  [⚙]  [⬇]  │
│ 副標 / breadcrumb 12px                                          │
└────────────────────────────────────────────────────────────────┘
```

- 高度：60 px
- 背景：`#0d0d0d`
- `最後更新` 必含（所有頁面），點 ⓘ 開「資料延遲說明」Drawer

---

## 6. 路由與狀態管理

### 6.1 Hash Routing

| Hash | 對應頁面 |
|---|---|
| `#/fleet` | 船隊監控（預設首頁） |
| `#/vessel/:id` | 船舶詳情（預設 tab=態勢） |
| `#/vessel/:id/awareness` | 船舶詳情 - 態勢 |
| `#/vessel/:id/history` | 船舶詳情 - 歷史回放 |
| `#/vessel/:id/eta` | 船舶詳情 - ETA 預測 |
| `#/vessel/:id/plans` | 船舶詳情 - 計畫版本管理 |
| `#/vessel/:id/smart` | 船舶詳情 - 智慧航線建議 |
| `#/ports` | 港口擁塞看板 |
| `#/port/:locode` | 單一港口詳情 |
| `#/sitrep` | 港口情資 SitRep 總覽 |
| `#/sitrep/:vesselId/:locode` | 單筆 SitRep（船 × 目的港） |
| `#/events` | 事件處理 |
| `#/event/:id` | 事件詳情 Modal |
| `#/timeline` | 警示時間線 |
| `#/thresholds` | 閾值設定 |
| `#/audit` | 稽核紀錄 |
| `#/reports` | 報表匯出 |

### 6.2 全域狀態

```js
window.AppState = {
  // 持久化
  thresholds: { ... },             // localStorage
  events: [ ... ],                 // localStorage
  auditLogs: [ ... ],              // localStorage
  sidebarPinned: bool,             // localStorage

  // 會期
  selectedVesselId: null,
  selectedPortLocode: null,
  fleetFilter: { ... },            // sessionStorage
  layerToggles: { cpa, history, plan, zones, aisQuality }, // sessionStorage
  bannerDismissed: bool,           // sessionStorage
};
```

### 6.3 localStorage 鍵清單

| Key | 內容 |
|---|---|
| `slab_thresholds_v2` | 6+ 維度閾值 |
| `slab_events_v2` | 事件清單 + 處理狀態 |
| `slab_audit_logs_v2` | 全系統 audit log（最多保留最近 200 筆） |
| `slab_sidebar_pinned_v2` | "1" / "0" |

### 6.4 sessionStorage 鍵清單

| Key | 內容 |
|---|---|
| `slab_fleet_filter` | 篩選條件 |
| `slab_layer_toggles` | 圖層 on/off |
| `slab_banner_dismissed` | banner 是否關閉 |
| `slab_mobile_view` | 行動裝置檢視模式（list/split/map）|

---

## 7. RWD 規格

| Breakpoint | 適用 | 主要差異 |
|---|---|---|
| **≥ 1025 px** | 桌面 / 大平板橫 | Sidebar 左側 + 完整表格 + 浮動 toolbar |
| **600 – 1024 px** | 平板 / 小筆電 | Sidebar 變底部 tab；卡片化；地圖固定高 320 px |
| **≤ 599 px** | 手機 | 卡片排 1 欄；地圖固定高 240 px |

JS 端：`window.matchMedia("(max-width: 1024px)").matches → IS_MOBILE = true`

斷點切換時自動 `route()` 重繪當前頁。

---

## 8. 假資料規範

### 8.1 命名原則

| 類別 | 規則 |
|---|---|
| 船名 | 化名（**禁用真實船公司船名**），含中英對照 |
| MMSI | `416XXXXXX`（416 是台灣前綴），9 位數 |
| IMO | `97XXXXX`（7 位數），符合 IMO checksum |
| 港口 | 採用真實 UN/LOCODE，但港名顯示用中英並陳（如「上海 / Shanghai」） |
| 公司 | 不顯示（Demo 假設「我們的船東公司」單一視角） |
| 操作員 | 化名（Op-Alice / Op-Bob / Capt-Lee / Capt-Chen 等） |

### 8.2 50 艘船命名（推薦命名規則）

採 5 個系列 × 每系列 10 艘：

```
遠洋系列  YUAN YANG    遠洋探索 / 遠洋啟航 / 遠洋之星 / 遠洋勝利 / 遠洋翱翔 …
海洋系列  HAI YANG     海洋先鋒 / 海洋勇者 / 海洋使者 / 海洋傳奇 / 海洋探險 …
福星系列  FU XING      福星貨運一號 / 福星貨運二號 …（編號 1–10）
明德系列  MING DE      明德輪 / 明德進取 / 明德開拓 / 明德昌盛 …
海運系列  HAI YUN      海運興隆 / 海運鼎盛 / 海運共榮 / 海運合作 …
```

MMSI 分配：
- 遠洋 416001001 ~ 416001010
- 海洋 416002001 ~ 416002010
- 福星 416003001 ~ 416003010
- 明德 416004001 ~ 416004010
- 海運 416005001 ~ 416005010

完整 50 艘清單見**附錄 A.1**。

### 8.3 船隊風險分布（Demo 假設）

| 風險等級 | 數量 | 用途 |
|---|---|---|
| Critical | 3 艘 | 引人注目、用於 Demo 故事 |
| Warning | 5 艘 | 中等關注 |
| Normal | 42 艘 | 大多數 |

### 8.4 港口主檔

- 主檔：145 個重點商港（覆蓋 SLAB 服務範圍）
- 預設顯示：145 個
- 可 toggle 切到「全球 UN/LOCODE 完整清單」（Demo 用 mock，提示「Demo 階段顯示 145 個」）

重點商港至少包含以下，作為 Demo 必備：

| LOCODE | 中文 / English | 狀態 |
|---|---|---|
| TWKHH | 高雄 / Kaohsiung | 正常 |
| TWTPE | 台北 / Taipei | 正常 |
| TWKEL | 基隆 / Keelung | 正常 |
| TWTXG | 台中 / Taichung | 正常 |
| CNSHA | 上海 / Shanghai | **高度壅塞**（Demo 主角）|
| CNNGB | 寧波 / Ningbo | 中度壅塞 |
| HKHKG | 香港 / Hong Kong | 輕度壅塞 |
| SGSIN | 新加坡 / Singapore | 正常 |
| KRBUS | 釜山 / Busan | 中度壅塞 |
| JPYOK | 橫濱 / Yokohama | 正常 |
| NLRTM | 鹿特丹 / Rotterdam | 輕度壅塞 |
| DEHAM | 漢堡 / Hamburg | 正常 |
| USLAX | 洛杉磯 / Los Angeles | **高度壅塞** |
| USNYC | 紐約 / New York | 中度壅塞 |
| BEANR | 安特衛普 / Antwerp | 輕度壅塞 |

完整 145 港清單見**附錄 A.2**。

### 8.5 假事件（用於 Demo 故事）

預先寫死 8 筆事件，狀態分布：

| 等級 | 數量 |
|---|---|
| Critical / New | 3 筆（首頁紅點顯示）|
| Warning / Ack | 2 筆 |
| In Progress | 2 筆 |
| Resolved | 1 筆 |

Demo 故事用的主要事件 ID：
- `1004-cpa-202605` 明德輪 CPA Critical（情境 2 用）
- `1001-route-202606` 遠洋探索號 航線偏移（情境 4 用）
- `1011-port-202605` 海洋先鋒 進港中（情境 3 用）

### 8.6 假航行計畫（版本管理用）

至少 3 艘船有完整 v1/v2/v3 版本歷史：
- 遠洋探索號（KHH-SHA-042）：3 版，v3 為避颱新增
- 海洋先鋒（KEE-SHA-019）：2 版
- 福星貨運一號（TPE-SHA-105）：1 版

---

## 9. 頁面規格 — 船隊監控（#/fleet）

### 9.1 用途

50 艘船的全局俯瞰，每日進系統第一站。

### 9.2 佈局

```
┌──────────────────────────────────────────────────────────────────┐
│ 船隊監控 / Fleet Monitoring                                       │
│ 共 50 艘 · 8 艘需關注（3 Critical / 5 Warning）                   │
│                                          最後更新 2 分鐘前 ⓘ      │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ 65% │
│ │  [Toolbar 浮動]  篩選 ▾  搜尋  C·3 W·5 N·42              │     │
│ │                                                          │     │
│ │            Leaflet 全球地圖（CARTO Dark）                │     │
│ │     50 艘船 marker（cluster 在 zoom < 5 時聚合）         │     │
│ │     顏色＝風險等級，旋轉＝COG，Critical 脈動            │     │
│ │                                                          │     │
│ │     ⚠ Risk Zones ▾ ← 左下         Critical Banner → 右上 │     │
│ └──────────────────────────────────────────────────────────┘     │
│ ┌──────── handle 拖曳 ────────┐                                  │
│ ├──────────────────────────────────────────────────────────┐ 35% │
│ │  船隊列表（表格，含虛擬滾動）                            │     │
│ │  船舶 | Risk | 9 維度 dot | 狀態 | 目的港 | 動態 ETA |  │     │
│ │  AIS 品質 | XTD | SOG | COG | Lat | Lon | 最後更新     │     │
│ └──────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### 9.3 浮動 Toolbar

| 控制 | 行為 |
|---|---|
| 篩選 ▾ | 全部 / 需關注 / 僅 Critical / 僅 Warning / 僅 Normal |
| 船舶狀態 ▾ | 航行中 / 在錨等候 / 進港中 / 靠泊中 / 離港中 / AIS 異常 / 資料不足 |
| 系列 ▾ | 全部 / 遠洋 / 海洋 / 福星 / 明德 / 海運 |
| 搜尋 | 船名 / IMO / MMSI 不分大小寫 |
| 計數 | `列表/地圖：filtered / total` |
| Summary pills | `C·n` `W·n` `N·n` 三色點 |

### 9.4 表格欄位（共 14 欄）

| 欄位 | 內容 | 寬度 |
|---|---|---|
| 船舶 / Vessel | IMO pill + 船名（sticky-left） | 200 |
| 風險 / Risk | 大號圓點 + 等級徽章 | 100 |
| 9 維度 dot | 9 個小圓點，hover tooltip | 240 |
| 船舶狀態 / Status | 中英雙語徽章 | 110 |
| 目的港 / Destination | UN/LOCODE pill + 中文名 | 140 |
| 動態 ETA / Dynamic ETA | mono font + ETA 差異徽章 | 160 |
| AIS 品質 / AIS Quality | 0–100 分數 + 色塊 | 100 |
| XTD / Max | `0.42 / 1.85 (5.0)` | 130 |
| SOG / kn | tabular-nums | 70 |
| COG / ° | tabular-nums | 60 |
| Lat / Lon | DMS 格式（兩欄） | 200 |
| 最後更新 / Last Update | 相對時間 | 110 |

### 9.5 互動

- 點船名 / 點任一 9 維度 dot → 跳 `#/vessel/:id`（dot 點擊預設帶該維度 focus）
- 點地圖 marker → 同上
- 點計數 pills（C·3 等）→ 篩選只看該等級
- 行動裝置改用 `renderMatrixCards`（沿用 voyage-alert）

### 9.6 50 船效能處理

- 地圖 marker：zoom < 5 時 cluster（用 Leaflet.markercluster CDN）
- 表格：虛擬滾動（visible row only）
- 排序：critical > warning > normal（內部按 vessel_id ASC）

### 9.7 Critical Banner

當 `critical 數 > 0` 顯示右上 banner：「⚠ 3 艘 Critical，請優先檢視」，可 × 關閉、× 後改 pulse icon 可重開。

### 9.8 Risk Zone Panel（左下）

沿用 voyage-alert 的 8 類風險區 panel + 全開/全關按鈕。

---

## 10. 頁面規格 — 船舶詳情（#/vessel/:id）

### 10.1 進入方式

- 從船隊監控點船 / 點 dot
- 從事件處理 Modal 點「跳到船舶詳情」
- 從 sidebar 切（自動帶最近檢視的船 ID）

### 10.2 佈局

```
┌──────────────────────────────────────────────────────────────────┐
│ ← 返回船隊  /  遠洋探索號 (IMO 9700101) · MMSI 416001001        │
│ KHH → SHA 航次 042 · 最後更新 2 分鐘前 ⓘ                         │
├──────────────────────────────────────────────────────────────────┤
│ [📍 態勢] [🕐 歷史回放] [⏱ ETA] [🗺 計畫] [💡 智慧]                 │  ← 5 分頁
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│                       對應分頁內容                                  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 10.3 分頁 1：📍 態勢（預設）

#### 10.3.1 結構

```
┌──────────────────────────────────────────────────────────────────┐
│ [圖層 toggles]  ☑ CPA 警示  ☑ 歷史軌跡  ☐ 計畫航線  ☐ 風險區  │
│                  ☐ AIS 品質                                        │
├──────────────────────────────────┬───────────────────────────────┤
│                                  │  本船資訊                     │
│      Leaflet 地圖（700 高）       │  ├ 名稱 / IMO / MMSI         │
│   本船 + 5 NM 圓 + 周邊他船       │  ├ SOG / COG / Lat / Lon     │
│   圖層 toggle 控制疊圖             │  ├ 狀態 / 目的港 / ETA       │
│                                  │  └ AIS 品質摘要              │
│                                  │  ─────────────               │
│                                  │  周邊船清單（5 NM 內）        │
│   ⚠ Banner: 1 RED · 1 AMBER      │  ▸ 明德輪 0.38nm CPA RED    │
│                                  │  ▸ 海洋先鋒 0.72nm CPA AMBER │
│                                  │  ▸ 台灣海峰 1.45nm Normal    │
│                                  │  ▸ KH-BUOY-01 浮標 0.85nm    │
│                                  │                              │
│                                  │  點任一筆 → 展開詳情          │
└──────────────────────────────────┴───────────────────────────────┘
```

#### 10.3.2 圖層 Toggle

| Key | 預設 | 顯示內容 |
|---|---|---|
| `cpa` | ON | 預測向量線 + CPA 點標記 + RED/AMBER pulse |
| `history` | ON | 本船最近 24 hr 軌跡 polyline（藍）|
| `plan` | OFF | 計畫航線 polyline（dashed）+ waypoint dot |
| `zones` | OFF | 8 類風險區 polygon |
| `ais_quality` | OFF | 船 marker 加 quality badge 色塊 |

#### 10.3.3 5 NM 圓

- Leaflet Circle，radius 9260 m
- fillColor `#4a9eff`，fillOpacity 0.06
- 沿岸 / 港口時用 land mask 剪裁（不要壓陸地）

#### 10.3.4 周邊船清單卡片

```
┌─────────────────────────────────┐
│ ⚠ 明德輪                         │  ← 名稱 + 風險 icon
│ MMSI 416004001                  │  ← mono
│ 距離 0.38 nm · 14.1 kn · 035°   │
│ CPA RED · TCPA 18 min           │  ← 若 CPA layer 開啟
│ AIS 品質 0.61 (重複 MMSI 0.82)   │  ← 若 AIS quality layer 開啟
│ [查歷史] [立案告警]              │
└─────────────────────────────────┘
```

點「查歷史」→ 跳本船詳情的 `🕐 歷史回放` 分頁，預設時段為與該他船的共同觀測時段。
點「立案告警」→ 開事件處理 Modal。

#### 10.3.5 Land mask 處理

- 5 NM 圓不可壓在陸地上
- 預測向量線不可穿陸
- 計畫航線不可穿陸
- 實作方式：圖層加 `clipToSea(polygon)` 預處理

### 10.4 分頁 2：🕐 歷史回放

#### 10.4.1 結構

```
┌──────────────────────────────────────────────────────────────────┐
│ 時段：[2026/05/27 14:00] – [2026/05/28 14:00]   倍速 [1x ▾]      │
│                                                                    │
├──────────────────────────────────┬───────────────────────────────┤
│      Leaflet 地圖                 │  時段內事件                   │
│   本船軌跡 polyline               │  ▸ 14:23 進入新觀測 (海洋先鋒) │
│   同時段周邊他船軌跡              │  ▸ 15:08 CPA RED (明德輪)     │
│   游標 = 當前播放時間              │  ▸ 18:42 接近港口            │
│                                  │                              │
├──────────────────────────────────┴───────────────────────────────┤
│ ⏮ ◀ [▶ 播放] ▶ ⏭   ━━━━━━●━━━━━━━━━━━━  15:08:32              │
└──────────────────────────────────────────────────────────────────┘
```

#### 10.4.2 時間軸

- 拖曳即時更新地圖 / 事件清單 focus
- 倍速：0.5x / 1x / 2x / 5x / 10x
- 鍵盤：空白鍵播放/暫停、左右方向鍵 step

#### 10.4.3 軌跡呈現

- 本船 polyline：藍 `#4a9eff`，weight 3，stroke-opacity 依時間漸層
- 他船 polyline：白色 `#fff` opacity 0.6
- 偏移點：紅色加大 marker

### 10.5 分頁 3：⏱ ETA 預測

#### 10.5.1 結構

```
┌──────────────────────────────────────────────────────────────────┐
│ 遠洋探索號 → 上海 / Shanghai (CNSHA)                              │
│ 距港預估：14.3 hr   原始 ETA：06/15 21:00                         │
├──────────────────────────────────────────────────────────────────┤
│ 四段預測：                                                         │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ ███████ T1 8.5h ████ T2 6.2h ██ T3 2.1h █ T4 4.3h         │  │
│ │ 航行段          錨地等候        進港走廊  碼頭作業         │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ 動態 ETA：                                                          │
│   P25 (樂觀)  06/15 19:30  ─┐                                     │
│   P50 (中位)  06/15 21:00  ─┼─ 範圍 3.75 hr                        │
│   P75 (保守)  06/15 23:15  ─┘                                     │
│                                                                    │
│ ⚠ Demurrage 風險：估超出免費靠泊 1.8 hr，約 USD 12,000             │
│                                                                    │
│ 模型輸入因子：                                                      │
│ ┌──────────────────┬──────────────────┐                          │
│ │ 當前 CI_anchor    │ 走廊流量 CI_flow │                          │
│ │ 0.67 ↑           │ 1.05 →            │                          │
│ ├──────────────────┼──────────────────┤                          │
│ │ 錨地等候船數      │ 泊位使用率         │                          │
│ │ 8 艘 ↑           │ 75% ↓             │                          │
│ └──────────────────┴──────────────────┘                          │
└──────────────────────────────────────────────────────────────────┘
```

#### 10.5.2 互動

- [採納降速建議] 按鈕：彈出 Modal「已通知船長，動態 ETA 將重算」+ 寫 audit log
- [查目的港 SitRep] 按鈕：跳 `#/sitrep/:vesselId/:locode`

### 10.6 分頁 4：🗺 計畫版本管理

#### 10.6.1 結構

```
┌──────────────────────────────────────────────────────────────────┐
│ 遠洋探索號 航行計畫                                                │
│ 目前 Active：v3 (StormGeo · 2026/06/13 08:00)                     │
├──────────────────────────────────────────────────────────────────┤
│ 版本歷史：                                                          │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │ ● v3  Active        StormGeo  06/13 08:00  [查看] [比對 v2] ││
│ │   颱風路徑修正                                                ││
│ │ ─ v2  Superseded   StormGeo  06/12 16:00  [查看] [比對 v1]  ││
│ │   航線最佳化                                                  ││
│ │ ─ v1  Archived     StormGeo  06/11 02:00  [查看]            ││
│ │   初始計畫                                                    ││
│ └──────────────────────────────────────────────────────────────┘│
│                                                                    │
│ Waypoints (v3, Active)：                                           │
│ Seq | Lat | Lon | ETA | Speed | XTD Limit | Source Updated        │
│ 1  | 22.62 | 120.38 | 06/13 10:00 | 12.5 | 5.0 | 06/13 08:00      │
│ 2  | 23.10 | 120.45 | 06/13 14:30 | 12.0 | 5.0 | 06/13 08:00      │
│ ...                                                                │
├──────────────────────────────────────────────────────────────────┤
│ 差異比對地圖（點 [比對 v2] 後顯示）：                              │
│ ━━━ v3 (Active 藍實線)   ┄┄┄ v2 (灰虛線)                          │
└──────────────────────────────────────────────────────────────────┘
```

### 10.7 分頁 5：💡 智慧航線建議

#### 10.7.1 結構

```
┌──────────────────────────────────────────────────────────────────┐
│ 遠洋探索號 智慧航線建議（Phase A 歷史推薦）                        │
│ KHH → SHA · 同港口對歷史 312 趟                                    │
├──────────────────────────────────────────────────────────────────┤
│ 季節：[2026/05 春末 ▾]                                              │
│                                                                    │
│ 建議航線地圖：                                                      │
│   ━━━ 系統建議航線（藍）                                            │
│   ┄┄┄ 目前 Active Plan (v3, 比較)                                  │
│   ▒▒▒ 歷史軌跡熱點（漸層密度）                                      │
│                                                                    │
│ 統計：                                                              │
│   平均航行時間：18.5 hr ± 2.1 hr                                    │
│   平均航速：12.3 kn                                                 │
│   常見偏移區：彭佳嶼東北 5 NM（避碰）                                │
│                                                                    │
│ ⚠ Demo 階段不含氣象輔助（Phase B）與動態優化（Phase C）             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 11. 頁面規格 — 港口擁塞看板（#/ports）

### 11.1 結構

```
┌──────────────────────────────────────────────────────────────────┐
│ 港口擁塞看板 / Port Congestion Dashboard                          │
│ 145 重點商港 ⓘ  [全球 UN/LOCODE 完整清單 toggle]                  │
│                                          最後更新 8 分鐘前        │
├──────────────────────────────────────────────────────────────────┤
│ [全球熱點地圖] [區域 ▾] [國家 ▾] [壅塞等級 ▾] [搜尋]               │
├──────────────────────────────────────────────────────────────────┤
│ KPI: 高度壅塞 4 港 | 中度 12 港 | 輕度 38 港 | 正常 78 港 | 資料不足 13 │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────── 全球地圖 ─────────────┐ ┌────── 港口列表 ──────┐   │
│ │                                 │ │ 上海 (CNSHA)  ⚠ 高度  │   │
│ │  港口 marker：圓圈              │ │   8 自家 / 24 外來    │   │
│ │  顏色＝壅塞等級                  │ │   等候 14.5 hr        │   │
│ │  大小＝船數                     │ │                       │   │
│ │  zoom < 4 時 cluster            │ │ 寧波 (CNNGB)  ⚠ 中度  │   │
│ │                                 │ │   3 自家 / 15 外來    │   │
│ │                                 │ │   ...                │   │
│ │                                 │ │                       │   │
│ │  [點任一港口進詳情]              │ │ ... (虛擬滾動)        │   │
│ └─────────────────────────────────┘ └───────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 11.2 列表欄位

| 欄位 | 內容 |
|---|---|
| 港口 | UN/LOCODE pill + 中英港名 |
| 壅塞等級 | 五色徽章（高 / 中 / 輕 / 正常 / 資料不足） |
| 資料可信度 | High / Med / Low chip |
| 自家船 | 數字（可點，彈 Modal 列船清單）|
| 外來船觀測 | 數字（可點） |
| 平均等待 | hr，與歷史比較箭頭 |
| ETA 影響 | 是否影響自家船 ETA |
| 最近更新 | 相對時間 |

### 11.3 單港口詳情頁（#/port/:locode）

```
1. 港區海圖（最上方）—— 推估錨地 / 走廊 / 泊區 polygon
2. 港口壅塞 KPI
3. 港口船舶狀態統計
4. 自有船 ETA 清單
5. 外來船觀測清單
6. 港口壅塞原因與資料可信度說明
```

---

## 12. 頁面規格 — 港口情資 SitRep（#/sitrep）

### 12.1 SitRep 總覽

```
┌──────────────────────────────────────────────────────────────────┐
│ 港口情資 SitRep                                                    │
│ 距港 24 / 12 / 6 hr 自動觸發；目前待閱 5 筆                        │
├──────────────────────────────────────────────────────────────────┤
│ [距港 24 hr ▾] [所有自家船 ▾] [所有目的港 ▾]                       │
├──────────────────────────────────────────────────────────────────┤
│ ┌──── 遠洋探索號 → 上海港 ────┐ ┌── 海洋先鋒 → 釜山 ─────┐      │
│ │ 距港 12 hr · 即時現場 ⚪      │ │ 距港 24 hr · 歷史模型 ⚫ │      │
│ │ 高度壅塞 · 等候 P50 6.2 hr   │ │ 中度壅塞 · 等候 P50 3 hr │      │
│ │ Demurrage 風險 USD 12,000    │ │ 無 Demurrage 風險       │      │
│ │ [查看完整 SitRep →]          │ │ [查看完整 SitRep →]     │      │
│ └──────────────────────────────┘ └──────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 12.2 單筆 SitRep 詳情（#/sitrep/:vesselId/:locode）

三欄佈局：

```
[280 左] 在場情資來源        [中央] SitRep 主報告卡片     [320 右] 港口事件時間線
```

詳細欄位見 AIS_Demo 說明書 §7。

---

## 13. 頁面規格 — 事件處理（#/events）

### 13.1 結構（沿用 voyage-alert 強化）

```
統計 Pill Bar: [New 3] [Ack 2] [In Progress 2] [Resolved 1]
篩選 Toolbar: 狀態 / 等級 / 維度 / 船舶 / 系列
事件列表（虛擬滾動，450 監控點聚合）
```

### 13.2 50 船 × 9 維度 聚合策略

- 同船同維度同月：1 個事件（沿用既有）
- 同船多維度同時 critical：可選「展開所有」或「視為一個風險群」
- 50 船全部展開：使用虛擬滾動 + 篩選

### 13.3 Event Modal

沿用 voyage-alert §4.4.5；補上：
- 「跳到該船詳情」按鈕 → `#/vessel/:id` 帶事件 focus
- 全部狀態轉換寫 audit log

---

## 14. 頁面規格 — 警示時間線（#/timeline）

沿用 voyage-alert 設計，補上：
- 50 船 × 多事件源（Warning Mail / Open Event / CPA / AIS 異常）混合 DESC
- 時段篩選：24 hr / 72 hr / 7 days

---

## 15. 頁面規格 — 閾值設定（#/thresholds）

### 15.1 沿用 voyage-alert 6 維度 + 擴增

新增的可調維度：

| Key | 顯示名 | 單位 | 預設 W | 預設 C |
|---|---|---|---|---|
| `cpa_dist` | CPA 距離 / CPA Distance | nm | 1.0 | 0.5 |
| `cpa_time` | TCPA 時間 / TCPA | min | 30 | 20 |
| `ais_quality` | AIS 完整性 / AIS Quality | 分數 0–1 | 0.3 | 0.6 |
| `port_ci` | 港口擁塞 CI | 0–1 | 0.5 | 0.7 |

### 15.2 行為

- Save & Re-evaluate：立即重算全船隊 → 顯示「已重評估 X 艘船的告警」
- 寫 audit log

---

## 16. 頁面規格 — 稽核紀錄（#/audit）

### 16.1 結構

```
┌──────────────────────────────────────────────────────────────────┐
│ 稽核紀錄 / Audit Log                                               │
│ 共 N 筆紀錄                          [匯出 ▾] [篩選 ▾]            │
├──────────────────────────────────────────────────────────────────┤
│ 時間 (UTC+8) | 操作者 | 角色 | 動作 | 對象 | 前→後 | 備註          │
│ 15:08:32 | 系統 | — | 自動立案 | 1004-cpa | — → New | CPA 0.38   │
│ 15:10:05 | Op-Alice | Operator | Acknowledge | 1004-cpa | New→Ack │
│ 15:11:22 | Op-Alice | Operator | 指派 | 1004-cpa | Capt-Lee     │
│ 15:42:08 | Capt-Lee | Captain | Resolve | 1004-cpa | InProg→Resolved │
│ ...                                                                │
└──────────────────────────────────────────────────────────────────┘
```

### 16.2 寫入時機

| 動作 | 觸發者 |
|---|---|
| 事件狀態轉換 | 任何使用者 |
| 事件指派 | 任何使用者 |
| 閾值變更 | Supervisor |
| 計畫版本切換 Active | 系統（自動）/ Marine Manager |
| 採納降速建議 | Marine Manager |
| 篩選 / 檢視紀錄（重要的） | 任何使用者 |

### 16.3 假資料

預先寫死 30+ 筆 audit log（含 Demo 故事用的 4 個情境的所有操作）。

---

## 17. 頁面規格 — 報表匯出（#/reports）

### 17.1 報表類型

| 類型 | 內容 |
|---|---|
| 事件統計報表 | 月度事件數、等級分布、處理時效 |
| CPA 熱點分析 | 高風險海域 / 航段統計 |
| ETA 準確率回顧 | MAE / 月度趨勢 |
| 港口擁塞趨勢 | 145 重點港的 30 天 CI 變化 |
| 稽核總表 | 月度全系統操作清單 |

### 17.2 互動

- 點任一報表 → 預覽（模擬 PDF view）
- [下載 Excel] / [下載 PDF] 按鈕（Demo 階段可只彈 Toast「已下載至 Downloads」）

---

## 18. 跨頁共用機制

### 18.1 資料延遲標示

**全系統規則**：所有時間戳必含「最後更新 / 資料延遲」資訊。

| 位置 | 呈現方式 |
|---|---|
| Header 右側 | 「最後更新 X 分鐘前 ⓘ」+ tooltip 開「資料延遲說明」Drawer |
| 列表內 | 每筆有 `最後更新` 欄位（相對時間 + 絕對時間 tooltip） |
| 卡片 / Modal | footer 顯示「資料延遲 X 分鐘」 |

### 18.2 5 NM 提醒 Tooltip

**全系統規則**：周圍 AIS 觀測限制只在**一處**呈現——Header 右側 Info icon。

點 ⓘ 開 Drawer，內容：

```
SDataPro 周邊 AIS 觀測限制 / Surrounding AIS Observation Limit

周邊 AIS 船舶為自家船在約 5 海哩範圍內觀測到的資料。
- 外來船可能與自家船同向、反向或交叉航行
- 隨時間推移可能離開觀測範圍
- 系統僅呈現其觀測期間與最後觀測狀態，非完整持續追蹤
- 港口擁塞、CPA、SitRep 都基於這個限制下的觀測資料

⚠ 本系統定位為岸端事後分析 / 紀錄 / 營運優化工具，
   非船端即時避碰、非即時導航。
```

### 18.3 Land Mask 處理

**全系統規則**：所有航線、5 NM 圓、CPA 預測向量都不可穿陸地。

實作：
- 預載 Natural Earth Land Polygons (1:50m) GeoJSON
- Leaflet 加 utility `clipToSea(latlngs)`：對任何 polyline / polygon / circle 預處理
- Demo 階段：手動驗證 mock 資料的航線都不穿陸（不依賴自動化）

### 18.4 即時告警機制（Toast / Banner / Icon）

**三段告警**：

| 嚴重度 | 機制 | 持續時間 |
|---|---|---|
| Critical | Toast + Banner + Icon 紅點 | Toast 5s / Banner 持續 / Icon 持續 |
| Warning | Toast + Icon 紅點 | Toast 3s |
| Info | Toast | Toast 3s |

**Banner**：
- 位置：地圖左上 absolute (16,16)
- 顯示內容例：「⚠ 3 艘船 Critical · 1 件待認可 · 1 件 CPA RED」
- × 可關閉，關閉後改成右上 pulse icon（脈動），點擊可重開

**Toast**：
- 位置：右上角
- 例：「新事件：明德輪 CPA Critical」+ [查看] 按鈕

**Sidebar Alert Icon**：
- Sidebar 上的徽章數字（事件處理項目右側「[3]」）
- 即時更新

### 18.5 Audit Log 寫入機制

每筆操作自動寫入 `localStorage.slab_audit_logs_v2`：

```js
writeAuditLog({
  at: new Date().toISOString(),
  actor: 'Op-Alice',
  role: 'Operator',
  action: 'event.acknowledge',
  targetId: '1004-cpa-202605',
  before: { status: 'new' },
  after: { status: 'ack' },
  comment: '已查 AIS 完整性確認'
});
```

最多保留 200 筆，超過時 FIFO 移除最舊的。

---

## 19. Demo 故事劇本

> 給銷售 / 業務 / PM 用：演示時依此流程展示，每段 2–3 分鐘。

### 19.1 場景一：每日監看 → 發現高風險船（3 分鐘）

**演示者話術**：
> 「我們上班第一件事就是打開船隊監控，看 50 艘船的整體狀況。」

**操作步驟**：
1. 開啟系統，看到船隊監控頁
2. 指出 KPI Pills：「Critical 3 艘 / Warning 5 艘」
3. 點 `C·3` 篩選 → 列表只剩 3 艘
4. 指 9 維度 dot：「明德輪的 route 紅、海洋先鋒的 cpa 紅、福星貨運的 port 紅」
5. 點明德輪船名 → 進船舶詳情頁

**話術收尾**：
> 「整個船隊一眼看清楚，紅點代表要先處理的。我們不需要逐艘船看，只看有狀況的。」

### 19.2 場景二：CPA 事件查證流程（4 分鐘）

**演示者話術**：
> 「點進去某艘船，這是核心介面 —— 船舶詳情。」

**操作步驟**：
1. 在 📍 態勢分頁，看 5 NM 圓 + 周邊他船
2. 指出右上圖層 toggle：「我可以開 CPA 警示看風險」→ 開啟 CPA toggle
3. 地圖出現紅色預測向量 + CPA 點
4. 指右側周邊船清單：「明德輪 CPA 0.38 nm RED」
5. 點明德輪卡片 → 展開詳情 → 看 AIS 品質 0.61
6. 「可信度中等，要查證」→ 開 AIS 品質 toggle
7. 看明德輪 quality badge：「重複 MMSI 異常 0.82」
8. 點 [立案告警] → 開 Event Modal
9. 在 Modal 寫備註「信心降級，CPA 應視為 AMBER」
10. 點 [Acknowledge] → [指派 Capt-Lee] → 關 Modal

**話術收尾**：
> 「整個流程 30 秒，所有操作自動寫稽核紀錄。岸端不下指令給船，只做紀錄與營運分析。」

### 19.3 場景三：港口擁塞 → ETA → SitRep（5 分鐘）

**演示者話術**：
> 「另一個情境：我們在管 145 個重點商港。」

**操作步驟**：
1. 切到「港口擁塞看板」
2. 全球地圖看到上海港紅色 marker（高度壅塞）
3. 點上海港 → 進單港口頁
4. 看港區海圖：錨地 18 艘船等候
5. 點「自家船 3 艘」→ Modal 列出 3 艘船
6. 點「遠洋探索號」→ 跳船舶詳情的 ⏱ ETA 分頁
7. 看四段預測：T1 8.5h + T2 6.2h + T3 2.1h + T4 4.3h
8. 看 Demurrage 風險 USD 12,000
9. 點 [查目的港 SitRep] → 跳 SitRep 詳情
10. 看在場情資來源（有 3 艘自家船在現場回報）
11. 看航速建議「降速至 10 kn」
12. 點 [採納建議] → Toast「已通知船長」+ 寫 audit log

**話術收尾**：
> 「港口塞不塞、我船什麼時候會到、有沒有 Demurrage 風險、要不要降速 —— 一條動線走完。」

### 19.4 場景四：航線版本變更（3 分鐘）

**演示者話術**：
> 「最後一個情境：StormGeo 更新了航線，但船端還沒收到 → 系統會誤判偏移。」

**操作步驟**：
1. 在船舶詳情，看到 route 維度紅色告警
2. 切到 🗺 計畫分頁
3. 看版本歷史：v3 Active (06/13 08:00) / v2 Superseded (06/12 16:00)
4. 點 [比對 v2] → 地圖出現新舊兩版航線疊圖
5. 看出 v3 是颱風路徑修正
6. 切回 📍 態勢分頁 → 開歷史軌跡 toggle
7. 看出船端實際航行接近 v3，但系統還用 v2 算 XTD → 誤判
8. 回到事件處理頁 → 找 route 告警 → Modal 寫「計畫版本切換造成的合理偏移」
9. 標 cleared → Resolve

**話術收尾**：
> 「岸端隨時看得到計畫變更脈絡，不會冤枉船端，也不會放過真正的偏移。」

---

## 20. 驗收標準與待確認事項

### 20.1 驗收項目

| 項目 | 標準 |
|---|---|
| 單一 HTML 入口 | `index.html` Chrome 雙擊可開 |
| 9 個 sidebar 項目 | 全部可進入，無 404 |
| 船隊監控可呈現 50 船 | 列表 + 地圖同步 |
| 船舶詳情 5 分頁 | 全部可切換，狀態保留 |
| 港口擁塞看板 | 145 港 + 5 個重點壅塞港有 mock |
| Demo 故事 4 場景 | 全部可走完，操作流暢 |
| 圖層 toggle | 至少 5 個圖層可開關 |
| 即時告警三段 | Toast / Banner / Icon 都有 |
| 資料延遲標示 | 每頁都有 |
| Audit log 寫入 | 每個操作都寫，可在 #/audit 看到 |
| RWD | 桌面 + 平板 + 手機都不破版 |
| 化名規範 | 無真實船公司船名 / IMO / MMSI |
| 視覺一致 | 沿用 voyage-alert 色票 / 字級 / 間距 |
| 性能 | 50 船同時呈現不卡頓（< 1s 重繪）|

### 20.2 待確認事項

| ID | 待確認 | 影響 |
|---|---|---|
| Q1 | 50 艘船的化名是否需 SLAB 內部審過？ | 影響交付前最後檢查 |
| Q2 | 145 港口清單是否要由 SLAB 提供 final 版？ | Demo 可先用本規格附錄 A.2 |
| Q3 | Demo 是否要支援多語言切換？或維持中英並陳即可？ | 影響額外開發 i18n |
| Q4 | 客戶端會用什麼設備演示（投影 / 螢幕 / 平板）？ | 影響 RWD 測試重點 |
| Q5 | 是否需要 Demo 模式「自動播放」功能？（不需操作員手動）| 影響 Demo 互動設計 |
| Q6 | 假資料中是否需呈現「網路斷線 / 重連」情境？ | 影響資料延遲提示設計 |

---

## 21. 附錄 A：假資料 mockup 範本

### A.1 50 艘船完整清單

```js
const VESSELS = [
  // 遠洋系列
  { id: 1001, name: "遠洋探索號", name_en: "YUAN YANG EXPLORER", imo: "9700101", mmsi: "416001001", series: "遠洋", risk: "warning" },
  { id: 1002, name: "遠洋啟航號", name_en: "YUAN YANG VOYAGE", imo: "9700102", mmsi: "416001002", series: "遠洋", risk: "normal" },
  { id: 1003, name: "遠洋之星", name_en: "YUAN YANG STAR", imo: "9700103", mmsi: "416001003", series: "遠洋", risk: "normal" },
  // ... 10 艘
  // 海洋系列
  { id: 2001, name: "海洋先鋒", name_en: "OCEAN VANGUARD", imo: "9700201", mmsi: "416002001", series: "海洋", risk: "warning" },
  // ... 10 艘
  // 福星系列
  { id: 3001, name: "福星貨運一號", name_en: "FUXING CARGO 1", imo: "9700301", mmsi: "416003001", series: "福星", risk: "warning" },
  // ... 10 艘
  // 明德系列
  { id: 4001, name: "明德輪", name_en: "MING DE", imo: "9700401", mmsi: "416004001", series: "明德", risk: "critical" },
  // ... 10 艘
  // 海運系列
  { id: 5001, name: "海運興隆", name_en: "HAIYUN XINGLONG", imo: "9700501", mmsi: "416005001", series: "海運", risk: "warning" },
  // ... 10 艘
];
```

完整 50 艘的位置 / 速度 / 航向分布應該散布在「台灣周邊」「東亞航道」「東南亞」「歐美航道」，符合船東公司全球航線真實感。

### A.2 145 重點商港清單

至少包含以下亞太、歐洲、美洲主要港口（提案 Demo 用）：

```
亞太 (60 港):
TWKHH, TWTPE, TWKEL, TWTXG, TWMLI,
CNSHA, CNNGB, CNQIN, CNTAO, CNXMN, CNSZX, CNCAN, CNTSN, CNDLC, CNCKG,
HKHKG, MOMFM,
JPYOK, JPKOB, JPOSA, JPNGO, JPCHB, JPHKG, JPTYO,
KRBUS, KRINC, KRGUS, KRGMP,
SGSIN, MYPKG, MYJHB, MYPEN, IDJKT, IDSUB, IDKAO,
PHMNL, PHCEB, VNSGN, VNHPH, THBKK, THLCH, THSGZ,
INMAA, INBOM, INCOK, INNSA, INMUN,
AUMEL, AUSYD, AUBNE, AUPER, NZAKL, NZLYT,
SAJED, SAJBI, AEDXB, AEAJM, QADOH, KWKWI, BHBAH, OMSLL,

歐洲 (40 港):
NLRTM, NLAMS, DEHAM, DEHEM, BEANR, BEZEE, FRLEH, FRMRS, FRBOD, FRDKK,
GBLON, GBFXT, GBSOU, GBLIV, IEDUB,
ESBCN, ESVLC, ESALG, ESLPA, PTLIS, PTSIN, ITGIO, ITGOA, ITCIV, ITTPS,
RUTAU, RULED, GRPIR, TRIST, TRMER, EGALY, EGPSD, MAJEN, ESCEU, EHAIO,
SEGOT, FIHEL, DKCPH, NOOSL, POGDN,

美洲 (30 港):
USLAX, USOAK, USSEA, USLGB, USNYC, USBOS, USCHS, USHOU, USJAX, USMIA,
USPNS, USPDX, USSAV, CAYVR, CAMTL,
MXMZT, MXLZC, BRSSZ, BRRIO, BRSVO, BRBSB, ARBUE, CLVAP, COCTG, ECGYE,
PEEMA, PECLL, PAMCM, PABLB, JMMBJ,

其他 (15 港):
ZADUR, ZACPT, NGAPN, EGSUE, MTMLA, CYLMS, ILASH, JOAQB, LBBEY, SYLTK,
KEKEN, TZDAR, GHTKD, SNDKR, MULUM,
```

(完整 145 港，含中英對照、座標、預設壅塞狀態，由前端工程師依此 LOCODE 清單建立 mock。)

### A.3 假事件範本

```js
const EVENTS = [
  {
    id: "1004-cpa-202605",
    vessel_id: 4001,
    vessel_name: "明德輪",
    dimension: "cpa",
    level: "critical",
    opened_at: "2026-05-27 15:08:32",
    status: "new",
    assignee: null,
    notes: [],
    history: [
      { from: null, to: "new", at: "2026-05-27 15:08:32", by: "system" }
    ],
    cpa_data: {
      target_mmsi: "416001001",  // 遠洋探索號
      cpa_nm: 0.38,
      tcpa_min: 18,
      relative_sog: 12.4,
      encounter: "Crossing",
      confidence: "MED"
    }
  },
  // ... 7 筆更多事件
];
```

---

## 22. 附錄 B：圖示 SVG inline 程式碼

> 此處列出新增 8 個 icon 的 SVG；既有 9 維度 icon 直接從 voyage-alert-rwd.html 複製。

### B.1 CPA icon

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 18 L10 11 L15 14 L21 6" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <path d="M3 6 L10 11" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" fill="none"/>
  <circle cx="10" cy="11" r="2.5" fill="currentColor"/>
</svg>
```

### B.2 ETA icon

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
  <path d="M12 7 L12 12 L15.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M19 12 L21 12 M12 19 L12 21" stroke="currentColor" stroke-width="1.5"/>
</svg>
```

### B.3 SitRep / Report

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <rect x="5" y="3" width="14" height="18" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
  <line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" stroke-width="1.5"/>
  <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.5"/>
  <line x1="8" y1="16" x2="13" y2="16" stroke="currentColor" stroke-width="1.5"/>
</svg>
```

### B.4 Audit / 稽核

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M12 3 L20 6 V12 C20 17 16 20.5 12 21.5 C8 20.5 4 17 4 12 V6 Z" stroke="currentColor" stroke-width="1.5"/>
  <path d="M9 12 L11.5 14.5 L16 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### B.5 Vessel / 船舶

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M3 14 L21 14 L18 19 L6 19 Z" stroke="currentColor" stroke-width="1.5"/>
  <path d="M12 4 L12 14" stroke="currentColor" stroke-width="1.5"/>
  <path d="M8 8 L16 8 L15 14 L9 14 Z" stroke="currentColor" stroke-width="1.5"/>
</svg>
```

### B.6 Layer / 圖層

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" stroke-width="1.5"/>
  <path d="M3 12 L12 17 L21 12" stroke="currentColor" stroke-width="1.5"/>
  <path d="M3 16 L12 21 L21 16" stroke="currentColor" stroke-width="1.5"/>
</svg>
```

### B.7 Replay / 回放

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
  <path d="M10 8 L16 12 L10 16 Z" fill="currentColor"/>
</svg>
```

### B.8 Report / 報表匯出

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <rect x="4" y="4" width="16" height="16" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
  <line x1="8" y1="10" x2="8" y2="16" stroke="currentColor" stroke-width="2"/>
  <line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="2"/>
  <line x1="16" y1="12" x2="16" y2="16" stroke="currentColor" stroke-width="2"/>
</svg>
```

---

## 文件結束

本規格書為**前端工程師可執行的版本**。如有需要進一步細節（例如各頁面的逐欄位 mock data、特定互動的動畫時間、特定按鈕的彈出順序），請參照 voyage-alert-rwd.html 的對應實作或回頭與 PM 確認。

**下一步**：前端工程師依此規格開始開發，建議 Sprint 順序：
1. Sprint 1（2 週）：佈局 + 路由 + Sidebar + 船隊監控 + 船舶詳情「📍 態勢」分頁
2. Sprint 2（2 週）：船舶詳情其餘 4 分頁（歷史 / ETA / 計畫 / 智慧）
3. Sprint 3（2 週）：港口擁塞看板 + SitRep
4. Sprint 4（2 週）：事件處理 + 時間線 + 閾值 + 稽核 + 報表 + Demo 故事最終整合

完成後即可進入客戶提案演示階段。

---

*文件版本 v1.0 · 2026-05-29 · 摯陞數位科技 SLAB*
