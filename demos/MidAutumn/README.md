# 中秋活動

三段式活動的現場工具。

| 階段 | 內容 | 頁面 |
| --- | --- | --- |
| STEP 1 | 抽籤分隊（四隊） | `draw.html` |
| STEP 2 | 實體三關卡、贏烤肉食材 | 線下進行，沒有頁面 |
| STEP 3 | 翻牌圈叉搶答 | `tictactoe.html` |

`index.html` 是導覽頁。

## 檔案

```
index.html           導覽頁
draw.html            抽籤分隊
tictactoe.html       翻牌圈叉搶答（含題目後台）
shared.css           共用樣式（統一淺色）
shared.js            共用工具函式
cloud.js             雲端同步層
firebase-config.js   ← 只有這一個檔要你填
assets/              四張隊徽
```

## 設定 Firebase（跨電腦同步）

沒設定也能用，只是資料只留在當下那台電腦。要「兩台電腦開同一個網址、資料互通」就要做這一段，約 3 分鐘。

### 1. 建專案

到 <https://console.firebase.google.com> → 建立專案。免費的 Spark 方案就夠，不用綁信用卡。Google Analytics 可以關掉。

### 2. 拿設定值

專案設定（齒輪）→ 一般 → 你的應用程式 → 點 `</>`（網頁）→ 取個暱稱 → 註冊應用程式。

畫面會給你一段 `firebaseConfig`，把六個值抄進 `firebase-config.js`：

```js
window.FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: '你的專案.firebaseapp.com',
  projectId: '你的專案',
  storageBucket: '你的專案.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
};
```

### 3. 建 Firestore

建置 → Firestore Database → 建立資料庫 → 選離台灣近的區域（`asia-east1` 台灣）→ 先選「以正式版模式啟動」。

### 4. 貼安全性規則

Firestore Database → 規則，整段換成：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /events/{room} {
      // 活動期間開放，時間一到自動關閉，不用記得回來改
      allow read, write: if request.time < timestamp.date(2026, 10, 15);
    }
  }
}
```

按發布。

**這條規則是全開的** —— 任何人只要知道你的 `projectId` 和房間名稱，就能讀寫這份資料。因為 repo 是公開的，`firebase-config.js` 裡的值等於公開（Firebase 的網頁設定值本來就不是密鑰，防護全靠規則）。所以：

- 日期設在活動後幾天，過期後規則自動鎖死，不用記得回來關
- 真的在意的話，活動結束直接把整個 Firebase 專案刪掉
- 不要把這個專案拿來放其他資料

### 5. 推上去測

`git push` 之後開 <https://daffychou.github.io/demos/MidAutumn/>，右上角狀態燈變綠色「雲端同步中」就成功了。

拿兩台電腦（或同一台開兩個瀏覽器視窗）開同一個網址，一邊抽籤，另一邊應該一秒內跟著跳。

## 現場操作

- **狀態燈**在三頁的右上角。綠色＝雲端同步中；黃色＝離線，只存這台電腦；紅色＝連線出問題，這時系統會自動改存本機讓活動繼續，但兩台電腦的資料會各走各的。
- **兩台電腦的分工**：一台接投影、一台當主持人後台都可以。翻牌圈叉的出題視窗是同步的，主持人這邊點開題目，投影那台也會跟著跳出同一題，按「顯示答案」兩邊一起顯示。
- **排練**：網址後面加 `?room=test`，例如 `tictactoe.html?room=test`，會開到另一間房，不會動到正式資料。排練完換回沒有參數的網址就好。
- **備案**：題目後台的「匯出題目」會存成一個 txt，現場網路不通時至少題庫還在。

## 資料長怎樣

Firestore 只有一份文件 `events/{room}`，五個欄位：

| 欄位 | 內容 |
| --- | --- |
| `draw` | 抽籤名單 `[{no, name, team}]` |
| `bank` | 題庫 `[{id, q, a}]` |
| `used` | 已出過的題目 id |
| `game` | 棋盤 `{round, teams, first, board, turn, history, tiebreak}` |
| `current` | 投影中的題目 `{cell, q, a, no, at, show}`，沒開題目時是 `null` |

寫入都是欄位級合併，所以一台在改題庫、另一台在下棋不會互蓋。抽籤用交易寫入，兩台同時抽也不會撞號碼。
