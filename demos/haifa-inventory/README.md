# 海發進銷存 Demo

> 對齊截圖風格、覆蓋 21 模組的可點擊原型；含請購→詢價→送修流程、4 步驟 wizard、權限控管。

## 檔案結構

```
haifa-inventory/
├── index.html      # HTML 骨架 + CSS（單檔）
├── app.js          # 主程式（路由、wizard、權限、RFQ/RMA 邏輯）
├── data.js         # 假資料種子（9 使用者 / 4 船舶 / 15 PR / 7 RFQ）
└── README.md
```

> 資料完全自帶（embedded in `data.js`），無需外部資料庫或 API。狀態變更存在 `localStorage`。

## 啟動方式（任選）

### 方式 1：直接雙擊 `index.html`（最快）

瀏覽器以 `file://` 開啟即可使用。所有功能都不依賴 server。

### 方式 2：VSCode + Live Server（推薦開發）

1. VSCode 開啟 `..\haifa-inventory.code-workspace`（已包含 OneDrive 來源資料夾）
2. 安裝擴充套件：`ritwickdey.LiveServer`
3. 右鍵 `index.html` → **Open with Live Server**
4. 自動於 `http://127.0.0.1:5500/haifa-inventory/` 啟動，含熱重載

### 方式 3：Python 簡易 server

```bash
cd haifa-inventory
python -m http.server 5500
# 瀏覽器開 http://localhost:5500
```

---

## 與 OneDrive 來源資料的關係

工作流：

| 位置 | 用途 |
|---|---|
| `D:\公司內部\DaffyChou.github.io\demos\haifa-inventory\` | 程式碼（VSCode 編輯、git push 到 GitHub Pages） |
| `C:\Users\SLAB\OneDrive\海發\進銷存\Claude\` | 設計來源資料：操作手冊、截圖、市場分析、dbml schema、原始假資料 xlsx |
| `C:\Users\SLAB\OneDrive\海發\進銷存\Claude\demo\` | Claude 工作目錄的同步副本（保留作為備援） |

`.code-workspace` 已預先設定，VSCode 開啟時兩個資料夾會並存於檔案總管，
編輯 demo 程式時可直接打開 OneDrive 內的截圖、操作手冊、dbml 對照。

---

## 若要讓 D:\ 的 demo 能即時讀取 OneDrive 內最新版 `data.js`

兩種做法（任選一種）：

### A. 手動同步（最簡單）

每次 OneDrive 內 `data.js` 更新，手動覆蓋：

```powershell
Copy-Item "C:\Users\SLAB\OneDrive\海發\進銷存\Claude\demo\data.js" "D:\公司內部\DaffyChou.github.io\demos\haifa-inventory\data.js"
```

可寫成 PowerShell script 或 VSCode tasks 一鍵執行。

### B. 建立 Junction（軟連結）— 一勞永逸

以管理員身分開 PowerShell：

```powershell
# 先刪掉 D:\ 的 data.js
Remove-Item "D:\公司內部\DaffyChou.github.io\demos\haifa-inventory\data.js" -Force

# 建立檔案級連結（指向 OneDrive 內的 data.js）
New-Item -ItemType SymbolicLink `
  -Path "D:\公司內部\DaffyChou.github.io\demos\haifa-inventory\data.js" `
  -Value "C:\Users\SLAB\OneDrive\海發\進銷存\Claude\demo\data.js"
```

之後 OneDrive 內 `data.js` 一改，D:\ 看到的就是最新版。

> ⚠️ 若要 git push 到 GitHub Pages，需先 `Remove-Item` 連結再 copy 真檔，否則 git 不認得 symlink。

---

## 部署到 GitHub Pages

```bash
cd D:\公司內部\DaffyChou.github.io
git add demos/haifa-inventory/
git commit -m "Add haifa inventory demo"
git push
```

部署後線上路徑：`https://daffychou.github.io/demos/haifa-inventory/`

---

## Demo 主要功能

- **首頁總覽**：6 個 KPI、21 模組分組、最近操作紀錄
- **請購單**：4 步驟 wizard（基本資訊 / 請購項目 / 補充資訊 / 確認送出）
  - 物料 / 配件 / 維修三類型動態切換 schema
  - 維修類含設備 datalist、拍照上傳、症狀圖文編輯
  - 多份草稿管理（暫存 / 編輯 / 刪除）
- **詢價單**：自動從通過的 PR 帶入項目；可選廠商主檔；報價單上傳；4 種狀態
- **送修單 (RMA)**：8 階段狀態機；異動歷程；件號送修中標記
- **使用者切換**：右上角頭像可切換 9 種角色（岸端 5 / 船端 3 / 停用 1）
  - 船端只看自船、金額遮蔽
  - 岸端可審核（5 動作：直接派工 / 場勘 / 詢價 / 送修 / 退回）
- **完整異動紀錄**：所有操作寫入 `STATE.activityLog`，可在「操作紀錄」頁查看與匯出 CSV

## 重置 demo 狀態

頂部 → 操作紀錄 → 「重置 demo 狀態」按鈕，或瀏覽器主控台執行：

```javascript
localStorage.clear(); location.reload();
```
