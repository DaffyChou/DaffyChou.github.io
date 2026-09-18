# 紀錄：客戶版由內部版產出（customer-build）— 已完成並歸檔

- 建立／完成日期：2026-09-17
- 來源：使用者確認（2026-09-17）——final 是給客戶的、監控功能較少；merged 是內部版。9/16 曾把 final 覆寫成 merged，需追溯並建立產出機制。

## 追溯
- 9/1 原始 final：8 個維度（航線偏移、速度異常、漂航圈、錨泊、警示信件、到離港、到離區域、目的港）；海氣象預警／主機異常未啟用；無全球風險區唯讀圖層。原檔備份於 `_backup/voyage-alert-rwd-final_2026-09-01_before-merge.html`。
- merged 額外項目：內部監控擴充（海氣象預警、主機異常、全球風險區唯讀層）＋客戶確認後的規則與介面（分層查找、權限、限期、代理授權、圍籬分組／停用、變更紀錄、系統預設、對話框…）。

## 決議（使用者確認）
- 內部才有的項目：**海氣象預警、主機異常、全球風險區唯讀圖層** 三項。
- final 不退回 9/1 版；改為**從 merged 產出客戶版**，其餘規則兩版共用；日後只維護 merged，再產出 final。

## 作法
- merged 頂端旗標 `window.CUSTOMER_BUILD`（內部 false）與 `INTERNAL_ONLY_DIMS = ["sea","engine"]`；程式依旗標：`DIM_KEYS`／各航段 dims 濾掉內部維度、`computeAlerts` 不評估、全球風險區不併入、頁首維度說明不列、統一通知與未設定提示不計。
- `voyage-plan/build_final.py`：讀 merged → 旗標改 true、移除 `risk-zones-global.js` 標籤 → 寫出 final。
  用法：`python3 build_final.py`（同目錄）。
- 驗證：客戶版 DIM_KEYS 8 個、風險區 4 個／1 類、閾值頁與船隊表無海氣象／主機欄；桌面／手機、三角色、深淺色、五頁 console 無錯誤。

## 專案規則更新
- 改動一律做在 merged；final 由 `build_final.py` 產出，不手改。
