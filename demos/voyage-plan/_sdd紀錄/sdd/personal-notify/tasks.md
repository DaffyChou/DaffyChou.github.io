# tasks：personal-notify

- [x] 1. 資料層 `_userNotify`（預設 Mail＋LINE 全開）、`effectiveNotifyFor(user, dim)`、寫紀錄；停用全船隊層通知的讀取
- [x] 2. 集體設定頁首改為「我的通知方式 · 統一設定」（所有角色）；移除全船隊統一列
- [x] 3. 維度列通知區塊：所有角色改自己的個別設定；「已自訂／沿用統一」；單船頁同步
- [x] 4. 事件／通知橫幅顯示收件人有效管道；代理人期間用自己的設定
- [x] 5. 文件同步（規範頁、流程頁、截圖版、Q&A）＋ UX 複審／回歸

## 實作備註（2026-09-17）
- 資料：`_userNotify[user] = {all:{mail,line}, dims:{}}`（key `slab_va_user_notify_v1`），`effectiveNotifyFor(user, dim)` 預設全開；`setUserNotifyAll / setUserNotifyDim`（與統一相同時自動移除個別項）。
- 介面：集體設定頁首「我的通知方式 · 統一設定」（所有角色）；各維度列「我的通知」＋「已自訂／沿用統一」；至少保留一種管道；事件詳情顯示「通知 ＜監管人＞：Mail／LINE」。
- 修正：`[data-tip]` 點擊說明的全域攔截會吃掉容器內的 checkbox 點擊 → 改為只在 ⓘ 上掛 data-tip，且攔截器略過表單控制項。
- 驗證：t_notify.js、ux3.js、客戶版 ux3f.js。
