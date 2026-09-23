/* ─────────────────────────────────────────────────────────────
   中秋活動：本機儲存層

   資料存在這台電腦的瀏覽器（localStorage），五個項目：
     draw    抽籤名單     bank  題庫
     used    已出過的題   game  棋盤
     current 投影中的題目

   同一台電腦開多個視窗會透過 storage 事件自動同步，
   所以可以一個視窗投影、一個視窗操作。
   換電腦或清掉瀏覽器資料就會不見，要留底請用題目後台的「匯出題目」。
   ───────────────────────────────────────────────────────────── */

var Store = (function () {
  var KEY = { draw: 'mf-draw2', bank: 'mf-bank', used: 'mf-used', game: 'mf-ttt', current: 'mf-current' };
  var FIELDS = Object.keys(KEY);
  var watchers = {};
  var seen = {};        // 上次送出去的 JSON，避免重複渲染
  var errorCbs = [];

  function raise(msg) { errorCbs.forEach(function (cb) { try { cb(msg); } catch (e) { console.error(e); } }); }

  function read(f) {
    try { var v = localStorage.getItem(KEY[f]); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function persist(f, v) {
    try { localStorage.setItem(KEY[f], JSON.stringify(v)); return true; }
    catch (e) { raise('這台電腦的瀏覽器空間已滿,資料沒有存下來'); return false; }
  }
  function fanout(f, value) {
    var v = value === undefined ? null : value;
    var key = JSON.stringify(v);
    if (seen[f] === key) return;
    seen[f] = key;
    (watchers[f] || []).forEach(function (cb) { try { cb(v); } catch (e) { console.error(e); } });
  }

  function watch(f, cb) {
    (watchers[f] = watchers[f] || []).push(cb);
    var cur = read(f);
    seen[f] = JSON.stringify(cur);
    try { cb(cur); } catch (e) { console.error(e); }
  }
  function write(f, value) {
    var v = value === undefined ? null : value;
    persist(f, v);
    fanout(f, v);
    return Promise.resolve(v);
  }
  /* fn(目前的值) → 新值；回傳 undefined 表示不要寫 */
  function transact(f, fn) {
    var next = fn(read(f));
    if (next === undefined) return Promise.resolve(null);
    persist(f, next);
    fanout(f, next);
    return Promise.resolve(next);
  }
  function onError(cb) { errorCbs.push(cb); }

  function init() {
    window.addEventListener('storage', function (e) {
      var f = FIELDS.find(function (k) { return KEY[k] === e.key; });
      if (f) fanout(f, read(f));
    });
    return Promise.resolve();
  }

  return { init: init, get: read, watch: watch, write: write, transact: transact, onError: onError };
})();
