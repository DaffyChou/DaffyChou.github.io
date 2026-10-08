# tasks：demo-defaults-reset

- [x] 1. 備份 final 目前狀態（git diff 已有未提交修改，複製一份到 _backup/）
- [x] 2. preloadSampleOverrides：移除 YM TROPHY 航線偏移單船覆寫
- [x] 3. preloadSampleAnchorDrift：依 Q1 結論移除 HAWK 自訂漂航圈、WILLPOWER 手動錨位（保留在錨狀態與待設定船）
- [x] 4. 新增一次性重置旗標（例 slab_va_reset_done_20261008），保留 slab_va_theme、slab_va_sidebar_pinned_v1；並讓範例旗標 slab_va_demo_ad 同步重置
- [x] 5. 檢查全船隊預設（DEFAULT_THRESHOLDS）與 resetThresholds 一致，數值不更動
- [x] 6. 瀏覽器驗證：清 localStorage 後開啟，各航段頁所有維度徽章皆為「系統預設」、頁首「全部為預設」
- [x] 7. 瀏覽器驗證：單船頁（YM TROPHY 等）無單船覆寫；錨泊待確認橫幅與自動套用仍正常；console 無錯誤
- [x] 8. 驗證客戶版限制未被破壞（無 sea／engine、無風險區清單入口）

## 驗收條件
- 情境：用全新（或已清過）瀏覽器開啟 final，閾值設定頁每個維度都顯示「系統預設」來源，沒有任何「單船」「區域」徽章
- 情境：先前測試殘留過資料的瀏覽器，開啟後自動被清乾淨一次，之後使用者再改的設定不會被重置
- 情境：變更閾值並套用，仍可看到影響摘要與生效來源變化（功能未壞）
- 情境：只有 final 檔案有 diff 變動，merged 與其他檔案不變
