/* ─────────────────────────────────────────────────────────────
   中秋活動：雲端同步層

   資料全部放在 Firestore 的一份文件 events/{room} 裡，五個欄位：
     draw    抽籤名單     bank  題庫
     used    已出過的題   game  棋盤
     current 投影中的題目
   寫入一律用「欄位級合併」，所以 A 電腦在改題庫、B 電腦在下棋，不會互相蓋掉。
   抽籤用交易（transaction）寫，兩台同時抽也不會撞號。

   firebase-config.js 沒填 → 自動退回 localStorage，
   功能一樣，只是不跨電腦（同一台電腦開多個視窗仍會同步）。
   ───────────────────────────────────────────────────────────── */

var Cloud = (function () {
  // Firebase SDK 來源（Google 官方 CDN）。要自架或換版本時可用 window.FIREBASE_SDK_BASE 覆寫。
  var SDK = window.FIREBASE_SDK_BASE || 'https://www.gstatic.com/firebasejs/11.0.2/';
  var LOCAL_KEY = { draw: 'mf-draw2', bank: 'mf-bank', used: 'mf-used', game: 'mf-ttt', current: 'mf-current' };
  var FIELDS = Object.keys(LOCAL_KEY);

  var status = 'loading';       // loading | cloud | local | error
  var statusDetail = '';
  var statusCbs = [];
  var errorCbs = [];
  var watchers = {};            // field -> [cb]
  var seen = {};                // field -> 上次送出去的 JSON，避免重複渲染
  var cache = {};               // 雲端最新快照
  var room = 'default';
  var fs = null, db = null, ref = null;
  var queue = Promise.resolve();

  /* ---------- 狀態 ---------- */
  function setStatus(s, detail) {
    status = s; statusDetail = detail || '';
    statusCbs.forEach(function (cb) { try { cb(s, statusDetail); } catch (e) { console.error(e); } });
  }
  function raiseError(msg) {
    errorCbs.forEach(function (cb) { try { cb(msg); } catch (e) { console.error(e); } });
  }
  function codeText(e) {
    var c = e && (e.code || e.message) || '';
    if (/permission-denied/.test(c)) return '雲端拒絕寫入:Firestore 規則沒開放,請看 README.md';
    if (/unavailable|network/.test(c)) return '連不上雲端,請檢查網路';
    if (/resource-exhausted|quota/.test(c)) return '雲端額度已滿';
    if (/invalid-argument/.test(c)) return '資料格式不合法,沒有存進雲端';
    if (/not-found/.test(c)) return '找不到雲端資料庫,請確認 Firestore 已建立';
    return '雲端儲存失敗:' + c;
  }

  /* ---------- 本機 ---------- */
  function readLocal(f) {
    try { var v = localStorage.getItem(LOCAL_KEY[f]); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function writeLocal(f, v) {
    try { localStorage.setItem(LOCAL_KEY[f], JSON.stringify(v)); } catch (e) { raiseError('這台電腦的瀏覽器空間已滿,資料沒存下來'); }
  }

  /* ---------- 通知訂閱者 ---------- */
  function fanout(f, value) {
    var v = (value === undefined) ? null : value;
    var key = JSON.stringify(v);
    if (seen[f] === key) return;
    seen[f] = key;
    (watchers[f] || []).forEach(function (cb) { try { cb(v); } catch (e) { console.error(e); } });
  }
  function fanoutAll(data) { FIELDS.forEach(function (f) { fanout(f, data[f]); }); }

  /* ---------- 退回本機模式 ---------- */
  function startLocal(detail) {
    ref = null; fs = null;
    setStatus('local', detail);
    window.addEventListener('storage', function (e) {
      var f = FIELDS.find(function (k) { return LOCAL_KEY[k] === e.key; });
      if (f) fanout(f, readLocal(f));
    });
    FIELDS.forEach(function (f) { fanout(f, readLocal(f)); });
  }

  /* ---------- 啟動 ---------- */
  function configured() {
    var c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.projectId);
  }
  async function init() {
    room = new URLSearchParams(location.search).get('room') || window.EVENT_ROOM || 'default';
    if (!configured()) { startLocal('firebase-config.js 還沒填'); return status; }
    try {
      var mods = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')]);
      fs = mods[1];
      var app = mods[0].initializeApp(window.FIREBASE_CONFIG);
      db = fs.getFirestore(app);
      ref = fs.doc(db, 'events', room);
      fs.onSnapshot(ref,
        function (snap) {
          cache = snap.exists() ? snap.data() : {};
          if (status !== 'cloud') setStatus('cloud', room);
          fanoutAll(cache);
        },
        function (err) {
          console.error(err);
          setStatus('error', codeText(err));
          raiseError(codeText(err) + '(已改用本機儲存,活動可以繼續)');
          startLocalKeepError();
        }
      );
      return 'cloud';
    } catch (e) {
      console.error(e);
      startLocal('雲端載入失敗:' + (e && e.message || e));
      raiseError('雲端載入失敗,已改用本機儲存');
      return status;
    }
  }
  /* 連線中斷時仍讓活動跑得下去，但狀態燈保持紅色提醒 */
  function startLocalKeepError() {
    var detail = statusDetail;
    ref = null; fs = null;
    window.addEventListener('storage', function (e) {
      var f = FIELDS.find(function (k) { return LOCAL_KEY[k] === e.key; });
      if (f) fanout(f, readLocal(f));
    });
    setStatus('error', detail);
  }

  /* ---------- 讀 ---------- */
  function get(f) { return ref ? (cache[f] === undefined ? null : cache[f]) : readLocal(f); }

  function watch(f, cb) {
    (watchers[f] = watchers[f] || []).push(cb);
    var cur = get(f);
    seen[f] = JSON.stringify(cur === undefined ? null : cur);
    try { cb(cur === undefined ? null : cur); } catch (e) { console.error(e); }
  }
  function onStatus(cb) { statusCbs.push(cb); try { cb(status, statusDetail); } catch (e) { console.error(e); } }
  function onError(cb) { errorCbs.push(cb); }

  /* ---------- 寫 ---------- */
  function write(f, value) {
    var v = (value === undefined) ? null : value;
    if (!ref) { writeLocal(f, v); fanout(f, v); return Promise.resolve(v); }
    var patch = {}; patch[f] = v; patch.updatedAt = Date.now();
    queue = queue.then(function () {
      return fs.setDoc(ref, patch, { merge: true });
    }).catch(function (e) {
      console.error(e); raiseError(codeText(e));
    });
    return queue.then(function () { return v; });
  }

  /* fn(目前的值) → 新值；回傳 undefined 表示不要寫 */
  async function transact(f, fn) {
    if (!ref) {
      var next = fn(readLocal(f));
      if (next === undefined) return null;
      writeLocal(f, next); fanout(f, next);
      return next;
    }
    return fs.runTransaction(db, async function (tx) {
      var snap = await tx.get(ref);
      var cur = snap.exists() && snap.data()[f] !== undefined ? snap.data()[f] : null;
      var nx = fn(cur);
      if (nx === undefined) return null;
      var patch = {}; patch[f] = nx; patch.updatedAt = Date.now();
      tx.set(ref, patch, { merge: true });
      return nx;
    });
  }

  /* ---------- 狀態徽章 ---------- */
  var LABEL = {
    loading: '連線中…',
    cloud: '雲端同步中',
    local: '離線:只存這台電腦',
    error: '雲端連線異常',
  };
  function bindBadge(el) {
    if (!el) return;
    onStatus(function (s, detail) {
      el.dataset.state = s;
      el.textContent = LABEL[s] + (s === 'cloud' && detail ? '(' + detail + ')' : '');
      el.title = detail || LABEL[s];
    });
  }

  return {
    init: init, get: get, watch: watch, write: write, transact: transact,
    onStatus: onStatus, onError: onError, bindBadge: bindBadge,
    get status() { return status; },
    get room() { return room; },
    get online() { return !!ref; },
  };
})();
