# 預約系統 — Booking System

一個基於 GitHub Pages + Google Apps Script 的輕量預約系統。  
朋友輸入通關密語 → 填寫預約時間 → 你審核確認 → 自動加入 Google 行事曆。

## 功能

- 通關密語驗證（個人密語自動帶入資料、通用密語需手填）
- 管理後台：預約審核、朋友管理、關鍵字搜尋、分頁
- 審核確認後自動建立 Google 行事曆事件
- 收到預約通知 Email，一鍵確認或婉拒

---

## 安裝步驟

### 第一步：建立 Google 試算表與 Apps Script

1. 開啟 [Google 試算表](https://sheets.new) 建立新試算表
2. 上方選單：**擴充功能 → Apps Script**
3. 將 `booking-gas.js` 的**全部內容**貼入 `Code.gs`，覆蓋原有內容
4. 修改 `Code.gs` 頂部的設定區：

```js
const CONFIG = {
  OWNER_EMAIL:    'your@gmail.com',      // 你的 Gmail（收通知用）
  OWNER_NAME:     '你的名字',
  ADMIN_PASSWORD: 'your_admin_password', // 管理後台登入密碼
  DURATION_MIN:   60,                    // 預設會議時長（分鐘）
  ...
};

const GUEST_PASSPHRASE = 'your_guest_pass'; // 通用密語
```

5. **Ctrl+S** 儲存
6. 點右上角「**部署**」→「**新增部署作業**」
   - 類型：**網頁應用程式**
   - 執行身分：**我**
   - 存取權：**所有人**
7. 點「**部署**」，首次會要求授權 → 依提示允許
8. 複製部署完成後的網址（格式：`https://script.google.com/macros/s/XXXXXX/exec`）

### 第二步：設定 config.js

開啟 `config.js`，填入所有設定：

```js
const APP_CONFIG = {
  SCRIPT_URL:       'https://script.google.com/macros/s/XXXXXX/exec', // 第一步複製的網址
  ADMIN_PASSWORD:   'your_admin_password',  // 與 GAS 裡的 ADMIN_PASSWORD 相同
  OWNER_NAME:       '你的名字',
  OWNER_EMAIL:      'your@gmail.com',
  GUEST_PASSPHRASE: 'your_guest_pass',      // 與 GAS 裡的 GUEST_PASSPHRASE 相同
  DURATION_MIN:     60,
};
```

### 第三步：部署到 GitHub Pages

1. 將這個 repo 的所有檔案推送到你的 GitHub
2. 到 repo 的 **Settings → Pages**
3. Source 選 **Deploy from a branch**，Branch 選 **main**，Folder 選 **/ (root)**
4. 儲存後等 1–2 分鐘

完成！你的預約頁面網址為：
```
https://你的帳號.github.io/repo名稱/booking.html
```
管理後台：
```
https://你的帳號.github.io/repo名稱/booking-admin.html
```

---

## 更新 GAS 後要重新部署

每次修改 `Code.gs` 後：  
**部署 → 管理部署作業 → 鉛筆 → 建立新版本 → 部署**

---

## 新增朋友

登入管理後台 → 「朋友管理」頁籤 → 填入姓名與通關密語新增即可。

---

## 檔案說明

| 檔案 | 說明 |
|------|------|
| `config.js` | **唯一需要修改的設定檔** |
| `booking.html` | 預約頁面（朋友看到的） |
| `booking-admin.html` | 管理後台（你用的） |
| `booking-gas.js` | 貼到 Google Apps Script 的後端程式碼 |

---

## 系統架構

```
朋友         →  booking.html  →  Google Apps Script  →  Google 試算表
                                        ↓
你的 Gmail  ←  通知 Email    ←  Google Apps Script
                                        ↓
確認審核    →  booking-admin.html  →  Google 行事曆
```
