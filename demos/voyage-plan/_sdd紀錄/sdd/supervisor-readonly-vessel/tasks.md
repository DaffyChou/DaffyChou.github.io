# tasks：supervisor-readonly-vessel

- [x] 1. 權限碼與 `canEditVessel／canClearVessel`：主管對任一船一律唯讀（系統管理員例外）
- [x] 2. 單船設定頁主管唯讀：輸入、儲存列、限期表單、圍籬單船層、錨泊確認／調整、漂航圈／錨位視窗改查看
- [x] 3. 集體設定移除主管的「依監管人員的船隊」；覆寫總覽每筆可跳轉
- [x] 4. 關注船舶：資料層＋★ 切換（船隊監控、單船頁）＋「我的關注」篩選與置頂＋船舶下拉分組＋事件通知收件人含關注者＋紀錄
- [x] 5. 測試更新＋回歸＋final 建置＋提交
- [x] 6. 文件同步（規範頁 §3／§6、流程頁、Q&A Q2–Q4、確認表第 13 項）

## 實作備註（2026-09-17）
- 權限：`PERMS_SUPERVISOR` 移除 `threshold.vessel.edit.any／threshold.temporal.edit.any`（移到 `PERMS_ADMIN`）；新增 `canViewVesselThresholds(v)`（主管可看全部、組員可看＝可改）。
- 單船頁：`roView = !canEditVessel(v)` → `.th-vessel-view.is-readonly`：輸入以純文字呈現、儲存列隱藏、限期／圍籬限期表單隱藏、圍籬單船層控制與全選隱藏、錨泊切換停用、無「確認／調整」、漂航圈／錨位按鈕改「查看」→ `applyModalReadOnly`（欄位鎖、儲存／還原／用目前船位隱藏、忽略地圖點擊、動態座標列也鎖）。標頭「唯讀 · 由 ○○ 設定」ⓘ。
- 集體設定：主管只剩「全船隊預設」（系統管理員仍有「依監管人員的船隊」）。
- 關注船舶：`_watchList`（key `slab_va_watch_v1`）、`isWatching／watchersOf／toggleWatch／watchBtnHTML`；船隊監控列與卡片 ☆／★、「★ 我的關注」篩選、關注置頂；單船頁船舶下拉「★ 關注」群組與標頭 ★；事件詳情與錨泊待確認提示列出關注者管道；寫 layer=watch 紀錄。
- 驗證：t_superro.js（主管唯讀、寫入函式被擋、系統管理員與組員不受影響、代理授權仍可建）、t_watch.js（切換、篩選、置頂、下拉分組、事件收件人、紀錄、每人獨立）、ux3（主管單船頁四航段皆唯讀、無 scope 單選）、final 建置。

## 補充（2026-09-18）
- 列標頭徽章（來源、★ 已調整、復原）一律靠左緊接名稱，只有「限期」與 🔔 靠右。
- 持續時間開放單船層（使用者確認，原「請使用者確認」第 5 項）：單船頁與集體「我的全部船」的持續輸入框可填本船值（`th-dur-vessel`，走標髒→套用流程，寫入 `_vesselOverrides…seg[sg].warningDuration/criticalDuration`），留空沿用全船隊；全船隊層持續（`th-dur-fleet`）仍由主管 blur 即存；解析 `getEffectiveThreshold` 原本就逐欄位往下找，無需改；「★ 已調整」與復原涵蓋持續時間。主管單船頁仍唯讀。
- 輸入框稽核 t_inputs.js：三角色 × 集體／單船 × 四航段共 24 組畫面，所有可用輸入皆可填值並正確標髒，停用者皆為預期（提醒未勾的距離欄、組員的錨泊全船隊預設、主管單船頁）。
