/**
 * =====================================================
 *  預約系統設定檔 — 只需要修改這一個檔案！
 * =====================================================
 *
 * 步驟：
 *  1. 部署 GAS（詳見 README.md），取得網址填入 SCRIPT_URL
 *  2. 修改下方所有設定
 *  3. 把三個 HTML 上傳到你的 GitHub Pages
 *  4. 把 booking-gas.js 的內容貼到 Google Apps Script
 */

const APP_CONFIG = {

  // ── GAS 部署網址（必填）────────────────────────────────
  // 格式：https://script.google.com/macros/s/XXXXXX/exec
  SCRIPT_URL: 'YOUR_GAS_SCRIPT_URL',

  // ── 管理員設定（必填）────────────────────────────────
  ADMIN_PASSWORD: 'YOUR_ADMIN_PASSWORD',   // 登入後台用的密碼

  // ── 主人資訊（必填）──────────────────────────────────
  OWNER_NAME:  'YOUR_NAME',               // 顯示在預約頁面的名字
  OWNER_EMAIL: 'your@gmail.com',          // 收到預約通知的 Gmail

  // ── 通用密語（必填）──────────────────────────────────
  // 沒有個人密語的訪客輸入這個，需要自己填姓名/電話/LINE
  GUEST_PASSPHRASE: 'YOUR_GUEST_PASS',

  // ── 預設會議時長（分鐘）─────────────────────────────
  DURATION_MIN: 60,
};
