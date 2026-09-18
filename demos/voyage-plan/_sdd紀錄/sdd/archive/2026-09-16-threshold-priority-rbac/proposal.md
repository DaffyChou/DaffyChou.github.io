# 提案：閾值分層優先權與角色權限規範（threshold-priority-rbac）

- 類型：新功能（規則規範 + 權限模型；Demo 端同步反映）
- 建立日期：2026-09-09
- 對象：陽明「航行監控與警示」系統 SA／工程團隊
- 依據：voyage-alert-rwd-merged.html 現況（getEffectiveThreshold、applyBatchSegment、SEGMENT_META、_zoneIoFenceConfig）

## 為什麼做

使用單位是船舶管理部門，有主管與組員；每位組員管理的船數不同，主管可查看所有組員的設定。
閾值有三種性質並存：全船隊通用的、只在某段時間才需要的、只針對單一船舶的。
目前 Demo 只實作「單船 → 區域 → 全船隊」一個軸向，「航段」只存欄位未參與判斷，也沒有時效性設定與角色權限，
工程師無法從現況推出明確規則。本提案把「哪一層優先、誰能改哪一層、改了影響誰」一次定清楚，作為正式系統與 Demo 的共同依據。

## 要改什麼

### A. 閾值層級（由高到低，命中即停、不疊加）

| 層級 | 名稱 | 說明 | 生命週期 |
|---|---|---|---|
| L1 | 時效性單船覆寫 | 針對單一船、有「有效起迄」的設定（例：軍演期間、颱風期間、本航次） | 到期自動失效，回到下一層 |
| L2 | 單船常設覆寫 | 針對單一船、無期限 | 手動清除才失效 |
| L3 | 區域覆寫 | 船「當下位置」命中的可編輯風險區（RISK_ZONES）所掛的閾值 | 船離開區域即不適用 |
| L4 | 全船隊預設 | 所有船的基準線，也是最後保底值 | 常設，必有值 |

每一層內部再分「航段專屬 ＞ 全航段通用」：
- 航段由狀態機判定（海上／錨泊漂流／進出港），先找該航段專屬設定，找不到才用「全航段通用」。
- 「全航段通用」的角色是 fallback，不是加成。

完整查找順序（先看層級、再看航段）：
1. L1 時效單船 × 該航段
2. L1 時效單船 × 全航段通用
3. L2 單船 × 該航段
4. L2 單船 × 全航段通用
5. L3 區域 × 該航段
6. L3 區域 × 全航段通用
7. L4 全船隊 × 該航段
8. L4 全船隊 × 全航段通用

規則補充：
- 欄位獨立補齊：Warning、Critical、持續時間 各自沿上述順序往下找，覆寫可只填其中一項，未填欄位由下層補上。
- 同一維度同一時間只產生一則事件；等級取「實際值」對「生效閾值」的比較結果。
- 多個區域同時命中時取風險等級最高者的區域覆寫（維持現行 zoneHits 排序）。
- 全球唯讀風險區（GLOBAL_RISK_ZONES）不參與 L3，僅顯示。
- 通知方式（mail／LINE）與「是否啟用偵測」比照同樣層級查找；「啟用偵測」為新增欄位（現況缺此開關）。
- 到離區域圍籬（zone_io）：圍籬本體屬船隊層（L4）資產；單船層只能「停用此船」或覆寫提醒距離／船速，不能刪除圍籬。

### B. 角色與權限

船舶指派（誰管哪些船）來自既有系統，本系統只讀取、不維護。功能權限另以「權限碼」管理，與指派解耦。

| 角色 | 可見範圍 | L4 全船隊 | L3 區域 | L2 單船常設 | L1 時效單船 | 圍籬本體 | 事件結案 | 變更紀錄 |
|---|---|---|---|---|---|---|---|---|
| 系統管理員 | 全部 | 編輯 | 編輯 | 編輯 | 編輯 | 增刪改 | 可 | 全部 |
| 主管 | 全部船、全部組員設定 | 編輯 | 編輯 | 編輯（任一船） | 編輯（任一船） | 增刪改 | 可 | 全部 |
| 組員 | 指派給自己的船 | 唯讀 | 唯讀 | 編輯（自己的船） | 編輯（自己的船） | 唯讀（可停用此船） | 自己的船 | 自己的操作 |

權限碼建議（role → permission 對照表，允許對個人加減）：
`threshold.fleet.edit`、`threshold.region.edit`、`threshold.vessel.edit.own`、`threshold.vessel.edit.any`、
`threshold.temporal.edit.own`、`threshold.temporal.edit.any`、`fence.fleet.manage`、`fence.vessel.toggle`、
`event.resolve.own`、`event.resolve.any`、`audit.view.own`、`audit.view.all`、`vessel.view.all`。

判斷順序：先看功能權限碼 → 再看船舶指派（own／any）→ 才允許寫入對應層級。

### C. 寫入與影響規則

- 所有寫入需明確「儲存／套用」並二次確認（不採自動儲存）；確認框顯示：影響船數、其中因上層覆寫而「不受影響」的船數、生效航段。
- 修改 L4 不動 L1～L3 已存在的設定；主管若要讓全船隊統一，需另執行「清除覆寫」。
- 集體設定選「我的全部船／個別船舶」時，實際是逐船寫入 L2，須在 UI 明示「這將成為單船覆寫，之後不隨全船隊預設變動」。
- 時效覆寫（L1）必填有效起迄與事由；到期由系統自動失效並寫入變更紀錄（by system）。
- 同一船若被指派給多位組員，後寫者覆蓋，變更紀錄保留前值。
- 變更紀錄欄位：who、when、layer、scope（fleet／region id／vessel id）、segment、dimension、field、old、new、reason（時效必填）。
- 閾值變更不觸發全船即時重算；由下一個資料輪詢週期套用（Demo 端重繪僅為畫面即時反映）。

### D. 資料模型（供工程參考）

threshold_setting：
id、scope_type(fleet|region|vessel)、scope_id、segment(all|sea|anchor|port)、dimension、
enabled、warning、critical、warning_duration、critical_duration、notify_mail、notify_line、
valid_from、valid_to（皆 null＝常設；有值＝L1）、reason、created_by、updated_by、updated_at、version

解析虛擬碼：
```
resolve(vessel, dim, field, now):
  seg = stateMachine.segment(vessel)
  for layer in [temporalVessel, vessel, region(vessel.position), fleet]:
    for s in [seg, 'all']:
      row = find(layer, s, dim, validAt=now)
      if row and row[field] != null: return { value: row[field], source: layer, segment: s }
  return systemDefault[dim][field]
```

## 影響範圍

正式系統（工程）：
- 閾值設定表新增 scope_type／segment／valid_from／valid_to／enabled／reason 欄位
- 閾值解析服務改為八層查找、欄位獨立補齊
- 權限服務：role–permission 對照 + 船舶指派 own/any 判斷
- 變更紀錄表與查詢 API
- 時效設定到期排程

Demo（只改 merged 版；final 版不動）：
- `voyage-alert-rwd-merged.html`：getEffectiveThreshold（加 segment 與時效層）、applyBatchSegment／單船設定的權限 gating、confirm 影響提示、設定來源標示、變更紀錄面板、圍籬單船層改為停用／覆寫
- 不新增外部檔案；資料仍以 localStorage 模擬

## 待使用者確認的假設

1. 「某時間才設定」解讀為「有效起迄的時效性單船覆寫（L1）」，且 L1 高於常設單船（L2）。
2. 區域覆寫（L3）視為船隊資產，組員唯讀。
3. 通知方式、啟用偵測比照閾值分層，不做「對人」的個人訂閱（若需要可另提案）。
4. 主管與系統管理員在閾值功能上差異僅在帳號／權限碼管理，本提案不展開。

## E. final 版示意介面對照（2026-09-09 檢視 voyage-alert-rwd-final.html，唯讀，不修改）

| 需求 | final 現況 | 符合度 |
|---|---|---|
| 主管／組員角色，組員只看自己的船 | 有：帳號切換器分「監管 A/B/C」與「主管」；`vesselVisible()` 依 `vessel.manager` 過濾；主管一律全部 | ✅ 符合 |
| 主管可看所有組員設定 | 部分：主管在集體設定可選「全船隊預設」或「依監管人員的船隊」；單船設定可選任一船。但沒有「依組員篩選＋顯示設定者／時間」的檢視 | ⚠️ 部分 |
| 組員不能改全船隊預設 | 有：非主管在集體設定被強制鎖定「我的全部船」，看不到全船隊預設選項 | ✅ 符合 |
| 全船隊通用 vs 單船設定分層 | 有：單船覆寫 ＞ 區域覆寫 ＞ 全船隊預設（`getEffectiveThreshold`），僅 route／speed 可覆寫 | ✅ 兩層有；其餘維度無單船層 |
| 航段專屬 ＞ 全航段通用 | 無：航段只存欄位，`computeAlerts` 未依航段判斷；「海上航段」與「全航段通用」在全船隊層寫同一值 | ❌ 未實作 |
| 某時間才需要的設定（時效性） | 無：沒有有效起迄欄位，只能手動設、手動清 | ❌ 未實作 |
| 明確儲存＋影響提示 | 部分：集體設定有「套用」與 confirm（顯示維度數／船數）；單船設定為 blur 即存；持續時間／通知勾選即存全域。confirm 未顯示「因覆寫不受影響」船數 | ⚠️ 部分 |
| 變更紀錄 | 無：事件有 history，閾值設定沒有 | ❌ 未實作 |
| 啟用／關閉偵測 | 無：只有 Mail／LINE 通知勾選 | ❌ 未實作 |
| 圍籬船隊層／單船層區分 | 無：圍籬設定為單一份（依區域），單船頁可直接刪除，影響全船隊 | ❌ 未實作 |
| 權限與船舶指派解耦（功能權限碼） | 無：只有 isAdmin 二分；「代理檢視」勾選後監管可編輯他人船舶的單船設定，無權限控管 | ❌ 未實作 |

### final 版發現的既有問題（僅回報，不修改 final）
1. **高**：主管在集體設定選「依監管人員的船隊」後按套用，`applyBatchSegment()` 沒有 `byMgr` 分支（只有 global／my／single），什麼都不會寫入且無任何提示，畫面看起來像成功。`resetBatchSegment()` 反而有 byMgr。merged 版同樣情況，列入本提案 task。
2. **中**：監管勾「代理檢視」後可在單船設定頁修改其他監管的船舶閾值，與「組員只能改自己的船」衝突；正式規則應把代理視為一個可授權的權限，而非勾選即得。
3. **低**：`renderQuickThresholdSetup`／`renderRegionOverridesBlock`／`renderVesselOverridesBlock`／`renderDriftOverridesBlock` 為未被呼叫的殘留碼（舊版快速設定與地區覆寫面板），不影響功能，但工程師讀碼時易誤以為區域覆寫有 UI 入口——實際上 final 沒有任何介面可以編輯區域覆寫（L3），只有 demo 預載資料。
