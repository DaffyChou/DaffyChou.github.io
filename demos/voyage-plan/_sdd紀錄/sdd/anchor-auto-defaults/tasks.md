# tasks：anchor-auto-defaults（Demo merged／final 版）

- [x] 1. 全船隊錨泊預設資料：`_anchorFleetDefault { mode, anchorW, anchorC, driftW, driftC, duration, centerMethod, autoApply }`，key `slab_va_anchor_fleet_default_v1`；系統預設值與依據文字
- [x] 2. 自動快照：偵測 nav_status 切入 1 → 記錄 `_anchorAutoSnapshot[vid] { center, at, mode }`；離開錨泊清除；寫 system 紀錄
- [x] 3. `computeAlerts` 錨泊／漂航分支：未設定時用快照＋全船隊預設監控；待辦事件改「待確認」，依錨泊維度的通知方式發 Mail／LINE（確認後不重發）
- [x] 4. 集體設定「錨泊／漂流」分頁改為全船隊預設面板（主管可改、組員唯讀）
- [x] 5. 單船設定錨泊面板：顯示自動套用資訊＋「確認」「調整」；地圖虛線圈
- [x] 6. 文件同步（規範頁 §1／§4、流程頁、Q&A）＋ UX 複審／回歸

## 實作備註（2026-09-17）
- 資料：`ANCHOR_FLEET_SYSTEM_DEFAULT`、`getAnchorFleetDefault/setAnchorFleetDefault`（key `slab_va_anchor_fleet_default_v1`）；快照 `_anchorAutoSnapshot`（key `slab_va_anchor_auto_v1`）由 `sweepAnchorAutoSnapshots()` 於每輪 `syncEventsFromAlerts` 維護。
- `anchorAutoEffective(vid)` 供 `computeAlerts` 使用（auto 旗標、地圖虛線圈）；`confirmAnchorAuto(vid)` 寫 L2 並留紀錄「確認自動套用預設」。
- 待確認提醒管道依收件人的「我的通知方式」（personal-notify），單船面板顯示「待確認提醒已通知 ＜監管人＞：Mail／LINE」。
- 待客戶訪談：預設模式取錨泊、圈心取切入時刻。
- 驗證：t_anch.js、ux3.js（桌機／手機 console 乾淨）、客戶版 build_final.py + ux3f.js。
- 2026-09-17 補充（使用者回饋：樣式要統一）：集體設定「錨泊／漂流」分頁改用與其他維度相同的 `.th-dim-row` 版型——「自動套用」列（開關／預設模式／圈心）、「錨泊圈」列（W／C／持續／我的通知）、「漂航圈」列（W／C／我的通知）；移除獨立「儲存全船隊預設」按鈕，改走頁尾「放棄／套用變更」與確認框（`applyAnchorFleetChanges`）；套用對象鎖定「全船隊預設」；影響預覽顯示自動監控中的船數。
