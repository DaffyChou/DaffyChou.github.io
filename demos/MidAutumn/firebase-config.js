/* ─────────────────────────────────────────────────────────────
   Firebase 設定（跨電腦同步用）

   還沒填的話，三頁都會自動退回「離線模式」：功能完全正常，
   但資料只存在當下這台電腦的瀏覽器，不會跨電腦同步。

   填法（約 3 分鐘，詳細步驟見同資料夾的 README.md）：
   1. https://console.firebase.google.com 建立專案（免費 Spark 方案即可）
   2. 專案設定 → 一般 → 新增「網頁應用程式」→ 複製 firebaseConfig
   3. 把下面六個值換成你的
   4. 建置 → Firestore Database → 建立資料庫，規則貼 README.md 裡那一段
   ───────────────────────────────────────────────────────────── */

window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

/* 活動代號。兩台電腦只要開同一個網址就是同一間房，資料互通。
   想開一場全新的（例如明年再辦），把這行換個名字就好，舊資料不受影響。
   臨時要另開一場，也可以在網址後面加 ?room=test，例如：
   https://daffychou.github.io/demos/MidAutumn/draw.html?room=test */
window.EVENT_ROOM = '2026-midautumn';
