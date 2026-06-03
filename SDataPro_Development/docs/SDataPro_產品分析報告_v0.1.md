# SDataPro 產品分析報告（v0.1）

| 項目 | 內容 |
|---|---|
| 文件名稱 | SDataPro 產品需求 / 既有 Demo / 後續 HTML Demo 規劃 綜合分析報告 |
| 版本 | v0.1（草案） |
| 製作日期 | 2026-05-29 |
| 撰寫者 | 摯陞數位科技（SLAB） |
| 分析對象 | `voyage-alert-rwd.html`（既有 RWD Demo）+ 專案資料夾 BRD/TechSpec、Fleet War Room 優化說明、戰情室任務說明 |
| 報告性質 | 現況分析 + 差異盤點 + 後續 Demo 規劃 + 待確認事項 |

---

## 0. 報告閱讀指引

本報告**不重新發明**既有 Demo，而是以下列三組來源做交叉比對：

1. 既有 Demo：`voyage-alert-rwd.html` + 同目錄已存在的反向規格書 `spec-voyage-alert.md`（4 頁面、9 維度、224 KB 單檔）
2. 已書面化的需求：`BRD_AIS_Platform_v1.0`、`TechSpec_AIS_Platform_v1.0`、`Fleet_War_Room_Demo_優化調整_Agent開發說明`、`戰情室_AIS港口壅塞CPA智慧航行計畫_Agent任務說明`
3. 既有舊 Demo / API 雛形：`功能開發/route-deviation-demo`（JSP + Python Flask + MySQL MVP）、`demos/voyage-plan/index.html`、`demos/ais-platform`、`demos/alert-management.html` 等

---

## 1. 既有 HTML Demo 風格與功能分析

### 1.1 對象

- 主對象：`D:\公司內部\DaffyChou.github.io\demos\voyage-plan\voyage-alert-rwd.html`（4853 行、225 KB 單檔）
- 對應資料：同目錄下 `mockup-data.js`（277 KB）、`risk-zones.js`（32 KB）
- 對應規格：同目錄下 `spec-voyage-alert.md`（1285 行，已是反向整理之第一版規格書）

### 1.2 技術風格

| 層級 | 採用技術 |
|---|---|
| 前端 | Vanilla JS（無框架）+ CSS3，單一 HTML 檔即可執行 |
| 地圖 | Leaflet 1.9.4 + CARTO Dark basemap |
| 字體 | 系統字體 `-apple-system, "Segoe UI", "Noto Sans TC"` |
| 路由 | URL Hash routing（`location.hash` + `hashchange`） |
| 狀態 | 記憶體變數 + `localStorage` / `sessionStorage` 持久化 |
| 假資料 | 全部寫死於 `window.MOCK_DATA`、`window.RISK_ZONES` |

### 1.3 視覺風格

- **深色科技感戰情室主題**：底色 `#000` / Surface `#0d0d0d` ~ `#1a1a1a` / 文字 `#e4eaf2` ~ `#7c8a9e`
- **三色告警語意**：Critical `#ff4d4f` / Warning `#f5a623` / Normal `#4cd97a`，半透明底 0.15 ~ 0.28
- **中英雙語並陳**：所有標題、表頭、徽章、Tooltip 都採「中文（主）/ English（副）」
- **資訊密度高**：船隊列表表格有 13 主欄 + 9 個維度 icon = 22 欄；表頭 14 px UPPERCASE letter-spacing 0.3
- **9 維度 inline SVG**：route / speed / sea / port / engine / alert / comm / event / zone 各自有專屬 24×24 icon

### 1.4 頁面結構（既有 4 頁）

```
Sidebar (50px → hover 220px / pin 220px；行動版變底部 tab bar)
├ #/fleet        船隊監控（總覽 + 單船 detail 切換）
├ #/events       事件處理（自動立案 + 操作員流程）
├ #/timeline     警示時間線（Mail + open_event 混合 DESC list）
└ #/thresholds   閾值設定（6 維度可調 W/C）
```

### 1.5 功能互動深度

| 互動類別 | 既有 Demo 支援度 |
|---|---|
| 篩選 / 搜尋 / 排序 | ✅ 船隊與事件頁都有 toolbar；篩選後地圖與列表同步 |
| 地圖圖層切換 | ✅ 單船 5 圖層 + 全球 8 類風險區（共 44 polygon），均可開關 |
| Popup 互動 | ✅ Warning Mail / Risk Zone 雙語 popup，含 KV meta |
| 事件狀態機 | ✅ new → ack → in_progress → resolved，含 Reset / Back / Reopen |
| 備註 / 指派 / 歷程 | ✅ Event Modal 內可加備註、指派操作員、記錄狀態歷程 |
| 閾值即時重評估 | ✅ Save → `syncEventsFromAlerts()` 立即重算 9 維度 |
| RWD 卡片 / 表格切換 | ✅ ≤1024 px 變卡片，含三段檢視（list / split / map） |
| 持久化 | ✅ 閾值 / 事件 / 側邊欄 pin 存 `localStorage`；篩選展開 / Banner 消音 / 風險區圖層存 `sessionStorage` |
| 跨換日線地圖繪製 | ✅ `splitAtAntimeridian` + ±360 三份 world copy |

### 1.6 RWD 設計

- **斷點**：`≥1025` 桌面 / `600–1024` 平板 / `≤599` 手機；JS 端以 `matchMedia("(max-width:1024px)")` 判 `IS_MOBILE`
- **桌面**：左側 sidebar、地圖 70% / 列表 30%（可拖到 50/50）、浮動 toolbar 與 Critical Banner
- **行動**：sidebar 變底部 tab bar；表格改卡片；地圖固定高 320 px（平板）/ 240 px（手機）；Modal 變 bottom sheet
- **行動專屬控制**：篩選 chip 收合（dirty 狀態藍框）、view-toggle（list / split / map 三段）

### 1.7 可沿用的 UI 元件清單

| 元件 | 來源檔案位置 / 名稱 | 後續可再利用 |
|---|---|---|
| 雙語表頭 + Tooltip portal | `.bi-th-tip` + JS portal 機制 | ✅ 任何資料列表 |
| 9 維度 dot + 風險徽章 | `dimDot` / `riskBadge()` | ✅ CPA、AIS 品質、港口壅塞列表 |
| Critical Banner + 脈動 reopen icon | `.critical-banner` + sessionStorage 消音 | ✅ 全系統共用告警橫幅 |
| 浮動 Toolbar（地圖 overlay） | `.fleet-toolbar` absolute + popup 開時自動淡化 | ✅ 港口壅塞地圖、CPA 風險地圖 |
| Risk Zone Panel（左下開闔） | `.risk-toggle` + 8 類別 checkbox | ✅ 港口壅塞圖層、AIS 品質圖層 |
| Sidebar pin / hover 展開 | `.sidebar` + `localStorage` | ✅ 全系統共用 |
| 事件狀態機 + 備註 + 歷程 | `EVENT_TRANSITIONS` + Event Modal | ✅ CPA 事件、稽核紀錄 |
| 閾值表 + stepper + 修改標記 | `.th-input-wrap` | ✅ CPA 門檻、港口壅塞門檻、AIS 品質門檻 |
| 卡片化分支 | `renderMatrixCards` / `renderEventsCards` / `renderThresholdsCards` | ✅ 任何列表頁的行動版 |
| 跨換日線繪製工具 | `splitAtAntimeridian` 等 5 個工具函式 | ✅ 任何全球地圖 |
| 雙語 popup | mail popup / zone popup 模板 | ✅ 港口、CPA、AIS 異常 popup |

---

## 2. 目前產品需求彙整

依專案資料夾文件，SDataPro 整體產品涵蓋 **5 大模組**，目前各文件已交付的需求對應如下：

### 2.1 模組總表

| # | 模組 | 主要需求來源文件 | 階段 |
|---|---|---|---|
| M1 | **航行監控與警示**（9 維度 + 事件處理） | `spec-voyage-alert.md`、`voyage-alert-rwd.html` | ✅ Demo 已凍結 |
| M2 | **AIS 訊號完整性與周邊觀測品質** | `戰情室任務說明 §1`、`Fleet War Room §2`、`BRD §3.6`、`TechSpec §5` | 📋 需求書面化、無 Demo |
| M3 | **港口壅塞分析與港口看板**（UN/LOCODE 主檔 + SLAB 重點商港清單） | `戰情室任務說明 §2`、`Fleet War Room §3`、`BRD §3.3 §3.4`、`TechSpec §4` | 📋 需求書面化、無 Demo |
| M4 | **船隊級 CPA 避碰預警**（含事件回放、稽核紀錄） | `戰情室任務說明 §3`、`Fleet War Room §4`、`BRD §3.2`、`TechSpec §3` | 📋 需求書面化、無 Demo |
| M5 | **航線偏移 + 多船航行計畫版本管理 + 智慧航行計畫** | `戰情室任務說明 §4 §5`、`Fleet War Room §5`、`route-deviation-demo` MVP | ⚠ 部分（既有 Demo 只做單版 Active Plan） |

### 2.1.1 M1（航行監控與警示）vs M5（航行計畫管理與智慧航線）邊界釐清

M1 與 M5 都會處理「航線偏移」，但**層級與目的完全不同**，不會互相取代：

| 面向 | M1 航行監控與警示（既有 Demo） | M5 多船航行計畫 + 智慧航行計畫（新規劃） |
|---|---|---|
| **層級** | 監控與告警層（reactive） | 計畫管理與優化層（proactive） |
| **核心問題** | 「現在這艘船有沒有偏離？要不要告警？」 | 「這艘船的計畫從哪來？有沒有更好的計畫？變過幾次？」 |
| **航行計畫處理** | 只看**單一 Active Plan**，用來算當下 XTD | 管理**多版本**（Active / Superseded / Archived）+ 比較 + 來源 / 時間追蹤 |
| **route 維度功能** | 9 維度之一：`max(現 XTD, 歷史最大偏移) vs Safety Frame × 閾值` 即時判 critical / warning / normal | 跨多船總覽 + 單船航線地圖（疊歷史航跡 / 偏移點 / 新舊版差異） |
| **航線來源** | 被動接收 StormGeo / WNI 推進來的 planned_track | 主動管理 API 同步、版本生命週期、新舊版差異比對 |
| **是否產生新航線** | 不會，只判斷有沒有偏離既定計畫 | 會（Phase A 歷史 AIS 推薦 / Phase B 氣象輔助 / Phase C 動態優化） |
| **時間觀點** | 即時（現在這一刻有沒有警示） | 歷史 + 即時 + 未來建議 |
| **主要使用者** | Operator（值班看告警） | Captain / Maritime（規劃航線、海務分析） |
| **主要頁面** | `#/fleet`、`#/events`、`#/timeline` | `#/voyage-plans`、`#/voyage-plan/:vessel`、`#/smart-route/:vessel` |
| **資料寫入** | 事件 store（`localStorage.slab_va_events_v1`） | Voyage Plan store（多版本、含 effective_time、status、change_summary） |

**簡化比喻**：M1 是「警報器」——既定路徑偏了就響；M5 是「路徑大腦」——管理路徑版本、比對歷史、給更好建議。M5 不取代 M1 的 `route` 維度告警，而是補上 M1 沒做的「計畫從哪來、計畫好不好、計畫變過幾次」。兩者透過「**M5 提供 Active Plan → M1 拿來算 route 維度告警**」單向銜接。

### 2.2 跨模組共用需求

| 共用需求 | 來源 | 既有 Demo 對應 |
|---|---|---|
| 5 海浬 AIS 觀測限制（單點提醒，非處處） | Fleet War Room §1.1、BRD §6.1 | ❌ 既有 Demo 無此提醒 |
| 自家船 vs 外來船介面區分 | 戰情室任務 §2.8、Fleet War Room §1.5 | ❌ 既有 Demo 所有船一視同仁 |
| 船舶狀態欄位（航行中 / 在錨 / 進港 / 靠泊 / 離港 / AIS 異常 / 資料不足） | Fleet War Room §1.3 | ⚠ 既有 Demo 僅顯示 nav_status 與 ais_status 雙行 |
| 雙語 UI + UTC+8 時間 | spec-voyage-alert §10.4 | ✅ 已實作 |
| RBAC：Operator / Captain / Supervisor | spec-voyage-alert §11.1、Fleet War Room §4.3 | ❌ 既有 Demo 操作員寫死 5 人，無登入 |
| 稽核紀錄（全操作 audit log） | Fleet War Room §4.3 | ⚠ 既有 Demo 僅事件 history，非全系統 audit |
| 報表匯出（Excel / PDF） | spec-voyage-alert §11.1 | ❌ 無 |
| 通知通路（Email / LINE / Webhook） | BRD §3.7、TechSpec §8 | ❌ 既有 Demo 無 |

### 2.3 角色與權限（既有資料整合後）

| 角色 | 主要動作 | 對應頁面 |
|---|---|---|
| Operator（值班操作員） | 即時掃描 Critical、認可事件、新增備註 | Fleet、Events、Alert Center |
| Captain / Maritime（船長 / 海務） | 接案、處理、查看時間線、查看船舶詳細 | Events、Vessel Detail、Timeline |
| Supervisor / Admin（系統管理員 / 主管） | 閾值設定、稽核紀錄、報表匯出、權限管理 | Thresholds、Audit Log、Reports、Admin |
| Marine Manager（海務主管，CPA 來源） | CPA 事件決策、回放查證 | CPA Risk Center、Event Replay |

> **待確認**：Yang Ming 客戶實際角色清單是否與上述對應；岸端 OCC 是否還有「夜間值班」「Watch Officer」等子角色。

### 2.4 資料來源（已彙整）

| 資料類 | 來源 | 對應模組 |
|---|---|---|
| 自船 AIS（VDO） | SDataPro 收集器 NMEA | M2, M4 |
| 周邊 AIS（VDM，5 NM） | SDataPro 收集器 NMEA | M2, M3, M4 |
| 航行計畫（Waypoints） | StormGeo API、WNI API（規劃中） | M1, M5 |
| Warning Mail | StormGeo Daily Alerts 郵件解析（已有 18 種 type） | M1 |
| 風險區 polygon | IMB / JWLA / OFAC / NOTMAR / IMO MEPC | M1 |
| 港口基本資料 | **UN/LOCODE 主檔（全球 10 萬+ 港口 / 地點）** + SLAB 服務中商港 / 主要積匯港重點清單（約 145 個，可擴增） | M3 |
| 氣象 / 海況 | NOAA / WMO / JMA / 商業氣象 API（規劃中） | M1 (sea 維度), M5 |
| 主機 IoT | ShipManager / 自建 IoT 平台（規劃中） | M1 (engine 維度) |
| 歷史 AIS（1–2 年） | 自建資料倉儲 | M3（港口區域推估）、M5（智慧航線） |

---

## 3. 既有 Demo 已涵蓋與尚未涵蓋的功能差異

### 3.1 已涵蓋（✅ 可直接 Demo）

| 需求 | 對應 Demo 功能 |
|---|---|
| 9 維度警示彙總 | `computeAlerts(vessel)` 已完成；route/speed 用真實算式，其餘 4 維度（sea/port/engine/comm）用雜湊模擬 |
| 航線偏移（XTD vs Safety Frame） | `route` 維度 + 單船 detail XTD 進度條 + planned/corridor/ais 圖層 |
| StormGeo Warning Mail 顯示 | `alert` 維度 + Event Modal 的 mail 列表（含 Comment 抽取、port 匹配） |
| 全球風險區 8 類 44 區 | Risk Zone Panel 完整實作 |
| 事件自動立案 + 操作員流程 | `syncEventsFromAlerts()` + 6 種狀態轉換 |
| 警示時間線 | `#/timeline` DESC 混合 mail + open_event |
| 閾值即時重評估 | `#/thresholds` Save 後立即 sync |
| RWD（桌面 / 平板 / 手機） | 三斷點完整、卡片化、底部 tab bar |
| 跨換日線地圖繪製 | 5 個工具函式完整實作 |

### 3.2 部分涵蓋（⚠ 需強化）

| 需求 | 目前狀況 | 缺口 |
|---|---|---|
| 速度異常 | `speed` 維度有公式（\|SOG−planAvg\|/planAvg） | 未顯示停車原因、未連動港口/錨地狀態 |
| 主機異常 | `engine` 維度用雜湊 | 待接 IoT；UI 無展開趨勢 |
| AIS 訊號 | `comm` 維度只判 `!ais_timestamp` + 雜湊 | 缺自船 vs 周邊區分、缺 6 項異常分數細分（gap/kinematic/duplicate/static/destination/behavioral） |
| 進出港 | `port` 維度用 progress_pct + 雜湊 | 缺實際抵港 / 靠泊 / 離港狀態分類、缺 ETA 動態更新 |
| 海況/天候 | `sea` 維度用 vessel_id 雜湊 | 待接氣象 API；UI 無風浪、海流圖層 |
| 風險區 | 44 區寫死於 `risk-zones.js` | 缺後端定期同步、缺類別搜尋、缺自訂使用者圖層 |
| 多船航行計畫 | 每船 1 個 Active Plan | 缺版本管理（v1/v2/v3）、缺與舊版比較、缺更新來源追蹤 |
| 稽核紀錄 | 事件層級 history | 缺全系統 audit log、缺 actor role 欄位 |
| 操作員 / 權限 | 寫死 5 人 | 缺登入、缺 RBAC、缺稽核連動 |

### 3.3 完全未涵蓋（❌ 需新建 Demo 頁）

| 需求 | 建議新增頁面 |
|---|---|
| **5 海浬 AIS 觀測限制提醒** | 全系統共用 Info Tooltip / 抽屜（單點呈現） |
| **自家船 vs 外來船介面區分** | 船隊監控頁需新增 own/observed 切換、外來船以灰階呈現 |
| **自船 AIS 完整性頁籤** | 新增 `#/ais-quality/own` |
| **周邊 AIS 觀測品質頁籤**（含 FLAG） | 新增 `#/ais-quality/surrounding` |
| **AIS 趨勢按鈕** | Drawer / Modal：AIS 品質時間序列折線圖 |
| **港口壅塞看板（145 港口總覽）** | 新增 `#/ports` |
| **單一港口詳情** | 新增 `#/port/:locode`，地圖最上方、KPI、自家船 ETA、外來船觀測 |
| **港口船舶數量點擊展開** | Modal / Drawer 列出該分類船舶清單 |
| **CPA 風險中心** | 新增 `#/cpa`，含 CPA / TCPA / 相對速度 / 相對航向 / 資料可信度 |
| **CPA 事件詳情 + 跳轉** | 新增 `#/cpa/event/:id` |
| **CPA 事件回放** | 新增 `#/cpa/event/:id/replay`，含時間軸 / Play / Pause / Step |
| **稽核紀錄頁** | 新增 `#/audit` |
| **多船航行計畫版本管理** | 新增 `#/voyage-plan/:vessel`，含版本切換、差異比對 |
| **智慧航行計畫建議** | 新增 `#/smart-route/:vessel`（Phase A/B/C 對應） |
| **動態 ETA** | 嵌入船隊監控與港口看板，雙欄「原始 ETA / 動態 ETA / 差異」 |
| **即時告警 Toast / Banner / Alert Icon 切換** | 全系統共用通知元件 |
| **報表匯出** | 事件 / 時間線 / 港口 / CPA 可匯出 Excel / PDF |

---

## 4. 後續可 Demo 的 HTML 頁面規劃

依「先補強 → 再擴張」原則，建議分 **4 個 Demo 批次**：

### 4.1 Batch A：強化既有 Demo（最小變動，1–2 頁）

**目標**：在不破壞既有 4 頁面前提下，補上 5 海浬提醒、自家船/外來船切換、AIS 完整性入口。

| 頁面 | hash | 主要新增 |
|---|---|---|
| Fleet Monitoring（強化） | `#/fleet` | 5 NM 提醒 Tooltip、自家船 / 外來船切換、自有船清單加 IMO/航次/原始ETA/動態ETA/CPA風險/船舶狀態欄、Info Drawer 顯示船隊概況 |
| AIS 資料品質（新） | `#/ais-quality` | 兩個頁籤：「自船完整性」+「周邊觀測品質」；趨勢按鈕開 Drawer；FLAG 欄位若無資料顯示「資料不足」 |

### 4.2 Batch B：港口壅塞模組（2–3 頁）

| 頁面 | hash | 主要區塊 |
|---|---|---|
| 港口壅塞總覽 | `#/ports` | 港口列表（區域 / 國家 / 港口 / 壅塞等級 / ETA 影響 / 資料可信度），含篩選排序 + 全球熱點地圖；預設只顯示 SLAB 服務中重點商港（約 145 個），可切換「全球 UN/LOCODE」完整檢視 |
| 單港口詳情 | `#/port/:locode` | 1) 港區海圖（最上方）2) 港口壅塞 KPI 3) 自家船 ETA 清單 4) 外來船觀測樣本清單 5) 壅塞原因與資料可信度說明 |
| 港口船舶清單 Modal | （子元件） | 點擊「自家船 3 艘」「等候 12 艘」即彈出對應船舶清單 |

### 4.3 Batch C：CPA 風險中心（3 頁）

| 頁面 | hash | 主要區塊 |
|---|---|---|
| CPA 風險中心 | `#/cpa` | 船隊即時 CPA 風險總覽（卡片 + 地圖）、KPI（High / Medium / Low / Data Insufficient）、可點擊 KPI 跳轉、碰撞風險計算公式說明卡 |
| CPA 事件詳情 | `#/cpa/event/:id` | 自船 + 目標船基本資訊、CPA / TCPA / 相對速度 / 相對航向 / 資料可信度、狀態機（New → Notified → Ack → Monitoring → Resolved → Closed）、稽核紀錄、回放按鈕 |
| CPA 事件回放 | `#/cpa/event/:id/replay` | 海圖 + 雙船航跡 + CPA 最近點標記 + 時間軸（Play / Pause / Step）+ 數值面板（CPA / TCPA / 距離 / 相對速度）+ 風險等級變化 |

### 4.4 Batch D：航行計畫版本管理 + 智慧航線（2–3 頁）

| 頁面 | hash | 主要區塊 |
|---|---|---|
| 多船航行計畫總覽 | `#/voyage-plans` | 多船列表（船名 / IMO / 航次 / Active Plan 版本 / 目的港 / 偏移狀態 / 最後更新） |
| 單船航行計畫版本管理 | `#/voyage-plan/:vessel` | 版本列表（Active / Superseded / Archived）、版本差異比對地圖（新版 vs 舊版航線疊圖）、變更摘要、來源（StormGeo / WNI） |
| 智慧航線建議（Phase A） | `#/smart-route/:vessel` | 依歷史 AIS 找出常見航路、平均航速、平均航行時間、季節差異；地圖疊計畫航線 vs 歷史熱點 |

### 4.5 跨頁共用元件 / Modal（隨頁面開發補強）

| 共用元件 | 影響頁面 |
|---|---|
| 5 NM AIS 提醒 Info Tooltip | Fleet、AIS Quality、Ports、CPA |
| 自家船 / 外來船 toggle | Fleet、Ports、CPA |
| Toast / Banner / Alert Icon 切換式即時告警 | 全系統 |
| 稽核紀錄 panel | Events、CPA、Voyage Plan |
| 報表匯出按鈕（CSV / Excel / PDF） | Events、Timeline、Ports、CPA、Audit |

---

## 5. 功能規格清單

> 本節以 ID 化方式列出後續 Demo 可凍結的功能規格，每筆對應一個可驗收的行為。

### 5.1 通用 / 跨頁（COMMON）

| ID | 名稱 | 說明 |
|---|---|---|
| C-01 | 5 NM 觀測限制單點提醒 | 在頁面右上 Info icon 或左側 Help 抽屜呈現一段固定文字（見 Fleet War Room §1.1） |
| C-02 | 自家船 / 外來船切換 | 船隊監控、港口、CPA 三頁共用 toggle；外來船以灰階 + 「觀測樣本」標籤 |
| C-03 | 即時告警 UI | Toast → Banner → Alert Icon 三段；可關閉、可重開、可點擊跳轉事件 |
| C-04 | 雙語顯示 | 所有 UI 中文（主）/ English（副）並陳 |
| C-05 | UTC+8 時間 | 原始 UTC 儲存，介面層轉台北時間，含 tooltip 顯示原 UTC |
| C-06 | 資料可信度標籤 | Critical / High / Medium / Low / Data Insufficient 五級徽章 |
| C-07 | 報表匯出 | 列表頁右上「匯出 ↓」按鈕，CSV / Excel / PDF |
| C-08 | 全系統稽核紀錄 | 紀錄 actor + role + action + before/after + comment + timestamp |

### 5.2 Fleet Monitoring 強化（FLEET）

| ID | 名稱 | 說明 |
|---|---|---|
| F-01 | 船隊概況收斂 KPI | 4 個小卡：自有船隊 N / 外來觀測 M / 監控區域 X / 高風險事件 Y；點擊展開明細 Drawer |
| F-02 | 船舶狀態欄位 + 篩選 | 航行中 / 在錨等候 / 進港中 / 靠泊中 / 離港中 / AIS 異常 / 資料不足；列表可依狀態篩選 |
| F-03 | 自有船清單欄位擴增 | 船名 + IMO + MMSI + 航次 + 船舶狀態 + 目的港 + 原始 ETA + 動態 ETA + ETA 差異 + AIS 狀態 + CPA 風險 + 最後更新 |
| F-04 | 船舶資訊卡 | 點船後右側 Drawer：基本資訊 / 即時位置 / 航行狀態 / ETA / AIS 品質 / 周邊觀測 / 風險摘要 |
| F-05 | 外來船觀測標示 | 灰階 marker + 「觀測起訖時間」+「最後觀測狀態」+「資料可信度」 |

### 5.3 AIS Quality（AISQ）

| ID | 名稱 | 說明 |
|---|---|---|
| A-01 | 自船 AIS 完整性列表 | 船名 / IMO / MMSI / 完整性 / 位置連續性 / 更新頻率 / 最後更新 / 異常類型 / 趨勢按鈕 |
| A-02 | AIS 趨勢 Drawer | 折線圖：更新頻率、缺漏次數、位置跳點、SOG/COG 異常、完整性分數；時間範圍 1 / 6 / 24 hr |
| A-03 | 周邊 AIS 觀測列表 | MMSI / 船名（或 Unknown） / FLAG（若無顯「資料不足」）/ 觀測來源（哪艘自家船）/ 首次 / 最後觀測時間 / 觀測期間 / 最後距離 / 行為狀態 / 可信度 |
| A-04 | FLAG 不推測原則 | 系統若未收集到 FLAG，欄位顯示「資料不足」，不可推測 |

### 5.4 Ports（PORT）

| ID | 名稱 | 說明 |
|---|---|---|
| P-01 | 港口總覽列表 | 港名（UN/LOCODE）/ 國家 / 區域 / 壅塞等級 / 資料可信度 / 自家船數 / 外來船觀測數 / 平均等待時間 / ETA 影響 / 最近更新；預設過濾「SLAB 重點商港」（~145），含 toggle 切到「全球 UN/LOCODE 完整清單」 |
| P-02 | 篩選與排序 | 區域 / 國家 / 港口名 / 自家船 / 壅塞等級 / ETA 影響 / 可信度 / 抵港時間 / 是否有觀測樣本 |
| P-03 | 港口熱點地圖 | 全球地圖 + 港口圓圈 marker（顏色＝壅塞等級、大小＝船數）；點擊跳單港口。地圖在 zoom 較小時自動 cluster，避免 UN/LOCODE 10 萬+ 標點同時呈現造成效能 / 視覺爆炸 |
| P-04 | 單港口頁面排序 | 1)港區海圖 2)壅塞 KPI 3)港口船舶狀態統計 4)自有船 ETA 5)外來船觀測 6)壅塞原因與可信度說明 |
| P-05 | 船舶數量可點擊 | 任一「N 艘」字樣皆可點擊，彈出對應分類船舶清單 |
| P-06 | ETA 明確命名 | 欄位命名統一「自有船原始 ETA / 自有船動態 ETA / ETA 差異 / 預估等待時間」 |
| P-07 | 外來船不做 ETA 管理 | UI 提示文字：「港口 ETA 分析僅針對自有船隊」 |
| P-08 | 壅塞等級五級 | 資料不足 / 正常 / 輕度 / 中度 / 高度，分別五色徽章 |
| P-09 | 港口區域推估展示 | 單港口頁 Demo 階段可顯示推估錨地 / 進港走廊 / 靠泊區（mock polygon） |

### 5.5 CPA Risk Center（CPA）

| ID | 名稱 | 說明 |
|---|---|---|
| K-01 | 船隊即時 CPA 風險總覽 | 卡片：每艘高風險自家船 + 目標船 + CPA / TCPA / 風險等級 |
| K-02 | KPI 點擊跳轉 | CPA High Risk / Medium 點擊顯示對應事件清單；港口/海域點擊顯示該區事件 |
| K-03 | 碰撞風險計算說明卡 | 公式：CPA / TCPA / 相對速度 / 相對航向 / 資料可信度；含五級風險分級表 |
| K-04 | CPA 事件詳情 | 自船 + 目標船基本資訊、CPA/TCPA/相對速度/相對航向/可信度、狀態機、稽核紀錄、回放按鈕 |
| K-05 | 事件狀態機 | New → Notified → Acknowledged → Monitoring → Resolved → Closed |
| K-06 | 稽核紀錄列表 | Audit ID / Event ID / Vessel / Target / Action Time / Action Type / Operator / Role / Comment / Status Before / Status After |
| K-07 | 事件回放 | 海圖 + 雙船航跡 + CPA 最近點 + 時間軸 + Play/Pause/Step + 數值面板（CPA/TCPA/距離/相對速度）+ 風險等級變化 |
| K-08 | 資料可信度提醒 | 警報含「資料品質 + 最後更新時間」；CPA 警報不可作為船端避碰唯一依據（顯示免責提示） |

### 5.6 Voyage Plan Versioning（VP）

| ID | 名稱 | 說明 |
|---|---|---|
| V-01 | 多船航行計畫總覽 | 多船列表（船名 / IMO / 航次 / Active 版本 / 目的港 / 偏移狀態 / 最後更新） |
| V-02 | 版本列表 | Plan ID / Vessel / IMO / Voyage No. / Version / Source / Created / Updated / Effective / Status / Waypoint Count / Change Summary |
| V-03 | 版本差異地圖 | 新版 vs 舊版航線疊圖；Waypoint 增 / 刪 / 改色標 |
| V-04 | Waypoint 列表 | Seq / Lat / Lon / ETA / Planned Speed / XTD Limit / Source Updated Time；無航段名稱顯「N/A」 |
| V-05 | 航線偏移多船總覽 | 船名 / IMO / 航次 / Active Plan Version / Destination / Current Deviation / XTD Limit / Status / Last Updated / Action |
| V-06 | 單船航線地圖 | Current Position / Active Route / Previous Route Version（可選顯示） / Waypoints / Route Segment / XTD Corridor / Actual Track / Deviation Point / Deviation Alert |

### 5.7 Smart Route（SR）— Phase A Only

| ID | 名稱 | 說明 |
|---|---|---|
| S-01 | 歷史航線建議 | 同港口對 + 同季節最常見航行路徑（mock data） |
| S-02 | 平均航速 / 時間 | 各航段平均速度、港口 A→B 平均時間 |
| S-03 | 常見偏移區標示 | 歷史經常繞航 / 偏移位置疊圖 |
| S-04 | 季節差異切換 | 不同月份 / 季節航線比較（mock） |

> Phase B（氣象輔助）/ Phase C（動態智慧航線）暫不納入首版 Demo，待 Phase A 客戶確認後再擴。

---

## 6. 警報與通知規格

### 6.1 警報等級（既有 + 新增整合）

| 等級 | 既有 9 維度判定 | CPA 風險判定（新） | 港口壅塞判定（新） | AIS 觀測品質（新） |
|---|---|---|---|---|
| Critical | 任一維度達 critical 閾值 | CPA < 0.5 NM 且 TCPA < 20 min | 高度壅塞 | 自船 AIS 中斷 > 15 min |
| Warning / High | 任一維度達 warning 閾值 | CPA < 1.0 NM 且 TCPA < 30 min | 中度壅塞 | 自船跳點 / 欄位缺漏 |
| Medium | — | CPA < 2.0 NM 且 TCPA < 60 min | 輕度壅塞 | 周邊 AIS 短暫觀測 |
| Low / Info | — | 接近趨勢 | 正常但需追蹤 | 周邊 AIS 連續觀測 |
| Normal | 全部 normal | 無接近 | 正常 | 完整 |
| N/A | 僅 alert 維度可 N/A | Data Insufficient | 資料不足 | 資料不足 |

### 6.2 警報觸發來源（建議統一事件 Pipeline）

```
資料源 → 偵測引擎 → 判定等級 → 立案（auto） → 通知（依嚴重度）
                                          ├ Toast / Banner（in-app）
                                          ├ Sidebar Alert Icon 徽章
                                          ├ Email
                                          ├ LINE / Telegram Bot
                                          └ Webhook
```

### 6.3 通知通路（依文件整合）

| 通路 | 來源 | 用途 | 觸發等級 |
|---|---|---|---|
| In-app Toast | Fleet War Room §1.4 | 即時提示 | Critical / Warning |
| In-app Banner | spec-voyage-alert §4.2.2 | 持續提醒（可消音、可重開） | Critical only |
| Sidebar Alert Icon | Fleet War Room §1.4 | 紅點徽章 + 點擊開告警中心 | 全部 |
| Email | BRD §3.7 | 分級收件（值班員 / 主管 / 管理層） | Critical / Warning |
| LINE / Telegram Bot | BRD §3.7 | 行動端推播 | Critical |
| Webhook | BRD §3.7 | 第三方系統整合 | 可設定 |
| 聲響告警 | BRD §3.7 | 岸端介面 RED + AMBER | Critical / Warning |

### 6.4 告警去重 / 抑制（取自 TechSpec §8.2）

| 規則 | 設定 |
|---|---|
| 同船對 cooldown | 同 own_mmsi + target_mmsi 在 10 min 內不重複推播 |
| 已 ack 停止推播 | 操作員確認後即停 |
| 信心降級 | 信心 < 30% 的 RED 自動降為 AMBER，加警示說明 |
| 夜間模式 | 可設定時段，僅推 RED |
| 同月同船同維度 1 事件 | spec-voyage-alert §4.4.1 自動立案規則 |

### 6.5 警報必含欄位

- 事件 ID
- 觸發時間（UTC + UTC+8）
- 船名 / IMO / MMSI / 航次
- 維度（route / speed / sea / port / engine / alert / comm / event / zone / cpa / ais_quality / port_congestion）
- 等級徽章
- 量化說明（中英雙語）
- **資料品質指標**（信心百分比 / 最後 AIS 更新時間）
- **建議處置方式**（含 SOP 連結）

---

## 7. UI / UX 設計建議

### 7.1 沿用既有設計語言（重要原則）

既有 `voyage-alert-rwd.html` 已凍結完整的設計 token、間距、字級與互動模式，**後續所有新頁面應 100% 沿用**，避免風格分裂：

| 沿用項目 | 來源 |
|---|---|
| 色彩 token（深色 6 層 + 文字 6 級 + 三色告警） | spec-voyage-alert §3.1 §3.2 |
| 字級與表頭規範 | §3.3 |
| 9 維度 inline SVG icon | §3.4 |
| RWD 三斷點 | §3.5 |
| Sidebar 行為（pin / 底部 tab） | §4.1 |
| Modal / Bottom Sheet 行為 | §4.4.5 §8.2 |
| 雙語顯示模板 | 全文 |

### 7.2 跨頁面導覽結構建議

```
Sidebar（垂直群組分層）
├ 即時監控
│  ├ 船隊監控        #/fleet
│  └ 港口壅塞        #/ports
├ 風險管理
│  ├ CPA 風險中心    #/cpa
│  ├ 事件處理        #/events
│  └ 警示時間線      #/timeline
├ 資料品質
│  └ AIS 品質        #/ais-quality
├ 航行計畫
│  ├ 多船航行計畫    #/voyage-plans
│  └ 智慧航線        #/smart-route
└ 系統管理
   ├ 閾值設定        #/thresholds
   ├ 稽核紀錄        #/audit
   └ 報表匯出        #/reports
```

### 7.3 設計建議重點

1. **單點告警提醒**：5 NM 限制只放右上 Info icon + Help Drawer，**禁止**在每張卡片重複呈現
2. **自家船 vs 外來船視覺差**：自家船主色（藍 `#2c6cdb`），外來船灰階 + 虛線邊框 + 「Observed」標籤
3. **資料可信度永遠可見**：列表 / 卡片 / Modal 必含「資料可信度」chip（5 級顏色）
4. **可點擊數字統一視覺**：所有 KPI / 統計數字下方加細虛線底、hover 變藍，提示「可點擊」
5. **Modal 與 Drawer 區分**：詳情用 Drawer（右側 380 px），表單 / 確認用 Modal（中央 640 px）
6. **時間軸元件統一**：Timeline 頁、CPA 回放、AIS 趨勢、版本歷程都用同一 timeline component
7. **地圖優先頁面**：港口詳情、CPA 事件、單船航線、CPA 回放 → 地圖永遠置頂，下方再放資訊卡

### 7.4 行動裝置（≤599 px）建議

- 沿用既有底部 tab bar 模式，但 8 個主功能放不下 → 改 5 個常用 + 「更多 ▾」展開
- 港口列表 / CPA 列表行動版採卡片 + 折疊（dimension chips 只顯示警示中的）
- CPA 回放在行動版改用「時間滑桿 + 大型 Play 按鈕」，數值面板浮在地圖上方半透明
- 報表匯出在行動版改為「分享」按鈕，呼叫系統分享 sheet

### 7.5 無障礙與專業度

- 補完 ARIA label、tabindex、Focus outline 樣式（既有已部分支援）
- WCAG 2.1 AA 級稽核（驗收前）
- 鍵盤捷徑：`?` 開快捷鍵說明、`f` 聚焦搜尋、`Esc` 關 Modal、方向鍵切船舶
- 文字一律「中文 主 / English 副」，不可只英文或只中文

---

## 8. 待確認事項

> 以下事項建議在正式進入 Batch B / C / D Demo 前先與 PM / 客戶確認，避免做完才打掉。

### 8.1 業務層面

| ID | 待確認事項 | 風險 / 影響 |
|---|---|---|
| Q1 | Yang Ming 實際 OCC 角色清單與 RBAC 設計 | 影響事件指派下拉、稽核紀錄 actor 欄位 |
| Q2 | 港口主檔已確認：UN/LOCODE 10 萬+ 為基底，SLAB 服務中的重點商港 / 主要積匯港（約 145 個）為預設過濾子集。待確認：145 重點清單是否會隨客戶 / 航線增加？是否需在 Admin 頁可維護？ | 影響港口主檔結構、過濾預設值、Admin 編輯介面 |
| Q3 | CPA 警報是否要送至船端？或僅岸端？ | BRD 與戰情室任務說明傾向「僅岸端」，需客戶確認 |
| Q4 | 智慧航行計畫 Phase A 是否需在首批 Demo？ | 若否，可延至 Batch E |
| Q5 | 報表匯出格式優先序（Excel vs PDF vs CSV） | 影響 Demo 是否要 mock 三種匯出 |
| Q6 | 通知通路優先序（Email / LINE / Webhook / 聲響） | 影響 Demo 通知中心展示哪幾種 |

### 8.2 技術層面

| ID | 待確認事項 | 風險 / 影響 |
|---|---|---|
| T1 | 既有 `route-deviation-demo` (JSP+Python+MySQL MVP) 是否會被併入新版？ | 影響 API 接口與 schema 對齊 |
| T2 | 港口區域是否真的「全部自動推估」？或可允許客戶 / SLAB 補建部分 polygon？ | 戰情室任務說明明文「不可人工定義」，但驗收上需要過渡方案 |
| T3 | StormGeo / WNI 雙來源切換時的優先順序與衝突解決 | 影響 Voyage Plan 版本管理 UI |
| T4 | 自船 AIS 完整性的「閾值」由 SLAB 制定還是客戶可調？ | 影響 Threshold 頁是否要再加 4 個 AIS 維度 |
| T5 | 氣象資料源確認（NOAA / WMO / JMA / StormGeo 內含 / 商業 API） | 影響 sea 維度真實算法與 Phase B 智慧航線 |
| T6 | 主機 IoT 資料源確認（ShipManager API 還是 SLAB 自建） | 影響 engine 維度真實算法 |
| T7 | 跨換日線港口（如太平洋小港）的港口判定邏輯 | 既有換日線繪製已 OK，但港口邏輯需驗證 |

### 8.3 介面層面

| ID | 待確認事項 | 風險 / 影響 |
|---|---|---|
| U1 | 客戶是否提供既有系統截圖作為自有船清單與資訊卡參考？ | Fleet War Room §1.5 提到「請參考使用者提供的現有系統畫面」 |
| U2 | UN/LOCODE 10 萬+ 港口在地圖上的呈現策略（cluster？分區？只顯示 145 重點？縮放分層）| 影響全球熱點地圖實作策略；建議預設只顯示 145 重點 + 縮放後 cluster |
| U3 | CPA 回放是否需要錄影 / 截圖匯出？ | 影響回放工具列設計 |
| U4 | 行動裝置使用情境（船上 / 通勤 / 家中）影響哪些功能必須行動可操作 | 影響 RWD 取捨：哪些頁面行動版只讀、哪些可寫 |
| U5 | 中英文之外，是否需要日文（Yang Ming 國外分公司）？ | 影響 i18n 結構 |

### 8.4 既有 Demo 內部待確認（保留原規格 §11 已列出，這裡標註優先補）

| ID | 既有未實作 | 建議優先序 |
|---|---|---|
| E1 | 真實 AIS 對接（取代 mockup） | 高 |
| E2 | 真實計畫航線 API（StormGeo / WNI） | 高 |
| E3 | 氣象資料對接 | 中 |
| E4 | 主機 IoT 對接 | 中 |
| E5 | 使用者登入 + RBAC | 高（與 Batch C 稽核紀錄連動） |
| E6 | 通知通路（Email / LINE） | 高（與 Batch C 同步） |
| E7 | 全系統 audit log | 高 |
| E8 | 報表匯出 | 中 |
| E9 | i18n 抽字典 | 低 |

---

## 9. 後續 HTML Demo 建議開發順序

依「**先補既有缺口 → 再做最常被客戶問到的功能 → 最後做研究型功能**」原則：

### Sprint 1（2 週）— Batch A：強化既有 Demo

- F-01 ~ F-05（Fleet 強化）
- A-01 ~ A-04（AIS Quality 兩頁籤）
- C-01 ~ C-04（共用 5 NM 提醒、自家船/外來船切換、Toast/Banner、雙語）

**驗收**：可向客戶展示「自家船 vs 外來船清楚區分、AIS 觀測品質有獨立頁籤、5 NM 限制只提醒一次」。

### Sprint 2（2–3 週）— Batch B：港口壅塞

- P-01 ~ P-09（總覽、單港口、船舶清單 Modal、ETA 命名）
- C-06（資料可信度標籤）

**驗收**：可向客戶展示「145 港口可篩選、單港口頁地圖在上方、船舶數字可點擊、ETA 只算自家船」。

### Sprint 3（3–4 週）— Batch C：CPA 風險中心

- K-01 ~ K-08（總覽 / 詳情 / 回放 / 稽核 / 計算說明）
- C-08（全系統稽核紀錄基礎）
- C-03（即時告警 Toast / Banner / Alert Icon 完整切換）

**驗收**：可向客戶展示「即時 CPA 風險總覽、事件中心可指派 + 備註 + 解除、事件回放可拖時間軸、稽核紀錄完整」。

### Sprint 4（2–3 週）— Batch D：航行計畫版本管理 + 智慧航線 Phase A

- V-01 ~ V-06（航行計畫版本管理）
- S-01 ~ S-04（智慧航線 Phase A，mock data）

**驗收**：可向客戶展示「同一艘船可看到多版航線歷史、可疊圖比較、單船 detail 可疊歷史熱點」。

### Sprint 5（1–2 週）— 收斂、通知、報表

- C-05（UTC+8 補完）
- C-07（報表匯出 CSV / Excel / PDF）
- E5 / E6 / E7（登入 + RBAC + 通知 + audit log）整合

**驗收**：可向客戶展示「全功能可驗收 Demo」，含登入流程與通知中心。

### 估時總覽

| Sprint | 期間 | 累計頁面數 | 累計可 Demo 功能 |
|---|---|---|---|
| S1 | 2 週 | 6 頁（4 舊 + 2 新） | 既有 + AIS 品質 + 自家船/外來船區分 |
| S2 | 2–3 週 | 9 頁 | + 港口壅塞 |
| S3 | 3–4 週 | 12 頁 | + CPA 風險中心 + 回放 + 稽核 |
| S4 | 2–3 週 | 15 頁 | + 多船航行計畫版本 + 智慧航線 |
| S5 | 1–2 週 | 16 頁 | + 通知 + 報表 + 登入 |

**總計約 10–14 週**，可依 PM 排程拆 1–2 人並行開發（Batch B/C 可同時，因頁面獨立）。

---

## 附錄 A：本次分析未直接讀取但已涵蓋的資料

| 檔案 | 處理方式 |
|---|---|
| `voyage-alert-rwd.html` (4853 行) | 已透過同目錄反向規格書 `spec-voyage-alert.md` 完整理解，並交叉驗證 `index.html` 與 `mockup-data.js` 結構 |
| `mockup-data.js` (277 KB) | 結構由規格書 §6 完整定義（Vessel / Planned Track / AIS Track / Mail / Open Event 等 9 個 type） |
| `risk-zones.js` (32 KB) | 結構由規格書 §6.6 §6.7 與 §4.7 完整定義（8 類別 44 區） |
| `BRD_AIS_Platform_v1.0.docx` | 已讀取前段（背景 / 範圍 / 功能需求 §3.1–§3.7 / 限制） |
| `TechSpec_AIS_Platform_v1.0.docx` | 已讀取目次（§1–§9，含時間校正、CPA、港口擁塞、AIS 完整性、Schema、API、推播） |
| `ProductBrochure_AIS_Platform_v1.0.docx` | 已讀取（行銷文案） |
| `route-deviation-demo/` (JSP+Python MVP) | README + API.md 已讀；確認與 voyage-alert-rwd.html 為兩個獨立分支，未來需決定併入策略 |

## 附錄 B：本報告**未涵蓋**的事項

1. **既有 demo 真實截圖**：本報告未實際截圖既有 demo，僅依規格書描述；驗收前建議補 D.1–D.8 截圖（規格書附錄 D 已預留圖位）
2. **客戶端使用情境訪談**：尚未取得 Yang Ming OCC 實際操作流程，部分角色與情境為推論
3. **既有 `route-deviation-demo` 程式碼細節**：未深入閱讀 Java/Python 程式碼，僅依 README + API.md
4. **`demos/ais-platform/index.html`、`alert-management.html` 等姊妹 demo**：本次未深入分析，建議下一輪 review

---

*本分析報告依現有資料整理。Demo 階段任何規格凍結建議都需經 PM / 客戶確認後再開發。後續若 voyage-alert-rwd.html 或專案文件變更，本報告需同步更新。*
