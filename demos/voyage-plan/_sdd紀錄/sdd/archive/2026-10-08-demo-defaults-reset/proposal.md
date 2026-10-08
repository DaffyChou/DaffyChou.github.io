# proposal：demo-defaults-reset（客戶 Demo 前：閾值設定全部回到預設值）

日期：2026-10-08　類型：調整（Demo 資料）　狀態：待確認
對應檔案：voyage-alert-rwd-final.html（客戶版；只動此檔，merged 不動）
需求依據：陽明_航行警報系統_需求訪談說明與確認單_v1.4.docx

## 為什麼做
即將對客戶做需求訪談 Demo。目前 final 一開啟就預載「示範覆寫」（單船航線偏移、漂航自訂圈、錨位…），
且本機 localStorage 可能殘留先前測試的全船隊預設／單船／區域／限期／變更紀錄。
訪談確認單 v1.4 第四章規則是「所有船預設用全船隊設定、系統預設 → 全船隊 → 單船逐層覆蓋，
每個維度旁顯示生效來源徽章」，Demo 應從「全部為預設」的乾淨狀態開始，會議中才現場示範變更。

## 要改什麼
1. 移除開機預載的「單船閾值覆寫」（YM TROPHY 航線偏移 1.0／2.0 NM）。
2. 移除（或不再預載）漂航／錨泊的示範覆寫（YM HAWK 自訂漂航圈、YM WILLPOWER 手動錨位）——**待確認，見下方問題**。
3. 加一個新的「一次性重置旗標」（比照既有 slab_va_reset_done_20260916），客戶用過的瀏覽器開啟時
   一次清掉 slab_va_* 的閾值／覆寫／限期／紀錄，保留主題與側欄釘選。
4. 確認 DEFAULT_THRESHOLDS 各維度數值不變；頁首顯示「共 N 個維度 · 全部為預設」、各列徽章為「系統預設」。
5. 不改 DEFAULT_THRESHOLDS 數值、不改規則與 UI、不新增功能。

## 影響範圍
- 修改：voyage-alert-rwd-final.html（preloadSampleOverrides、preloadSampleAnchorDrift、一次性重置區塊）
- 不動：voyage-alert-rwd-merged.html（內部版）、build_final.py、mockup-data.js
- 注意：final 由 merged 經 build_final.py 產出，之後若重新 build 會覆蓋本次修改（使用者已要求只改 final）。

## 待確認問題
Q1 漂航／錨泊示範船（YM HAWK／YM WILLPOWER／YM TROPHY 待設定）是否也要清掉？
   建議：保留「YM TROPHY 待設定」與「在錨」狀態（屬資料狀態，用來示範 C 組錨泊自動套用），
   但移除 HAWK 自訂圈與 WILLPOWER 手動錨位，讓它們走「全船隊預設自動套用 + 待確認」流程。
Q2 「預設值」數值是否就維持現有 DEFAULT_THRESHOLDS（航線 1.5/3.0 NM、速度 20%/40%、到離港 5/0.5、到離區域 5/1.0、持續 60/3 分）？
   確認單 G-2 寫明正式預設由陽明提供，Demo 先沿用現值。
