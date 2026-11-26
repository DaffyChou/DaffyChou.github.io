/* 貨務與運務計算：缺櫃預估、使用率、壅塞、預報。公式依「16_缺櫃預估與塞港指數」；
   與 synth/cargo_forecast.py 逐步對應，verify_ui.js 會拿 ref_forecast.json 比對。 */
(function () {
  'use strict';
  const U = window.UI, C = window.UI_CARGO;
  const Z = 1.28, DEFAULT_K = 1.0, TEU = { 20: 1, 40: 2, 45: 2 };
  const NOW = Date.parse(C.now + ':00Z');
  const TODAY_WD = (new Date(NOW).getUTCDay() + 6) % 7;                       // 星期一 = 0（同 Python weekday）
  const wdOf = o => (((TODAY_WD + o) % 7) + 7) % 7;
  const W = {}; C.combos.forEach((c, i) => (W[i] = c[2]));
  const sz = i => C.combos[i][1];
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const k3 = (y, c) => y + '|' + c;
  const yardIdx = {}; C.yards.forEach((y, i) => (yardIdx[y[0]] = i));

  // ---- 索引
  const inv = {}, last = {}, outs = {}, book = {}, vinH = {}, safety = {};
  let SOVR = {};                                                              // 上傳的安全存量（setSafety）
  C.inv.forEach(([y, c, o, q, f]) => { if (f) return; (inv[k3(y, c)] = inv[k3(y, c)] || {})[o] = q; });
  C.demand.forEach(([y, c, o, q, s]) => { const t = s === 'A' ? outs : book; (t[k3(y, c)] = t[k3(y, c)] || {})[o] = q; });
  C.vin.forEach(([y, o, v]) => (vinH[y + '|' + o] = v));
  C.safety.forEach(([y, c, q]) => (safety[k3(y, c)] = q));
  const vinFut = {};                                                          // 碼頭場站 -> 第幾天 -> TEU
  C.arrivals.forEach(a => {
    const [, scope, , , , , , term, , , , etaCalc, , , , , teu, empt, , , , , status] = a;
    if (scope !== 'FLEET' || !etaCalc || empt == null || status !== 'EXPECTED' || teu == null || !term || !(term in yardIdx)) return;
    const off = Math.ceil((Date.parse(etaCalc + 'Z') - NOW) / 86400000);
    if (off >= 1 && off <= 7) { const y = yardIdx[term]; vinFut[y] = vinFut[y] || {}; vinFut[y][off] = (vinFut[y][off] || 0) + empt; }
  });

  function one(y, c, horizon) {
    horizon = horizon || 7;
    const key = k3(y, c), s = inv[key] || {};
    const yd = C.yards[y], r = { y, c, yard: yd[0], ct: C.combos[c][0], sz: sz(c), status: '資料不足', reason: '', first: null, gap: null, series: [], low: [], safety: null, source: '', cur: null };
    const stale = (NOW - Date.parse(yd[4] + ':00Z')) / 1000 > 48 * 3600;
    if (stale || !Object.keys(s).length) { r.reason = '存量過期或缺失'; return r; }
    let cur = s[0];
    if (cur == null) { const ks = Object.keys(s).map(Number).filter(o => s[o] != null).sort((a, b) => a - b); cur = ks.length ? s[ks[ks.length - 1]] : null; }
    if (cur == null) { r.reason = '存量過期或缺失'; return r; }
    r.cur = cur;
    const o = outs[key] || {}, bk = book[key] || {};
    const hist = []; for (let i = 1; i <= 42; i++) if (o[-i] != null) hist.push([-i, o[-i]]);
    if (hist.length < 28 && !Object.keys(bk).length) { r.reason = '歷史不足 4 週且無出櫃需求'; return r; }
    const wd = {}; hist.forEach(([d, v]) => (wd[wdOf(d)] = wd[wdOf(d)] || []).push(v));
    const allv = hist.map(h => h[1]), m = mean(allv);
    const sd = Math.sqrt(allv.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(allv.length - 1, 1));
    const oth = [];
    for (let i = 1; i <= 42; i++) {
      const d = -i;
      if (s[d] != null && s[d + 1] != null && o[d] != null) oth.push(s[d + 1] - s[d] + o[d] - (vinH[y + '|' + d] || 0) * W[c] / TEU[sz(c)]);
    }
    const other = oth.length ? mean(oth) : 0;
    let sf;
    const up = SOVR[yd[0] + '|' + C.combos[c][0] + '|' + sz(c)];                // 補充資料上傳的安全存量（admin.js，platform-login-admin）優先
    if (up != null) { sf = up; r.source = '上傳設定'; } else if (key in safety) { sf = safety[key]; r.source = '客戶設定'; } else {
      const wk = [];
      for (let w = 0; w < 8; w++) { const vs = []; for (let i = 1; i <= 7; i++) { const v = s[-(7 * w + i)]; if (v != null) vs.push(v); } if (vs.length) wk.push(Math.min(...vs)); }
      sf = wk.length ? DEFAULT_K * Math.min(...wk) : 0; r.source = '預設值（近 8 週最低水位）';
    }
    r.safety = sf;
    let est = cur;
    for (let k = 1; k <= horizon; k++) {
      let dm = bk[k - 1];
      if (dm == null) { const v = wd[wdOf(k - 1)]; dm = v ? mean(v) : m; }
      const vin = ((vinFut[y] || {})[k] || 0) * W[c] / TEU[sz(c)];
      est = est + other + vin - dm;
      r.series.push(est); r.low.push(est - Z * sd * Math.sqrt(k));
    }
    r.source += '；出櫃：' + (Object.keys(bk).length ? '訂艙需求' : '歷史平均');
    const short = r.series.findIndex(v => v < sf), warn = r.low.findIndex(v => v < sf);
    if (short >= 0) { r.status = '要處理'; r.first = short + 1; r.gap = sf - r.series[short]; } else if (warn >= 0) { r.status = '留意'; r.first = warn + 1; } else r.status = '正常';
    return r;
  }
  let cacheAll = null;
  function forecastAll() {
    if (cacheAll) return cacheAll;
    const out = [];
    const keys = []; C.yards.forEach((_, y) => C.combos.forEach((_c, c) => { if (inv[k3(y, c)]) keys.push([y, c]); }));
    keys.sort((a, b) => (C.yards[a[0]][0] < C.yards[b[0]][0] ? -1 : C.yards[a[0]][0] > C.yards[b[0]][0] ? 1 : C.combos[a[1]][0] < C.combos[b[1]][0] ? -1 : C.combos[a[1]][0] > C.combos[b[1]][0] ? 1 : sz(a[1]) - sz(b[1])));
    keys.forEach(([y, c]) => out.push(one(y, c)));
    return (cacheAll = out);
  }
  // 使用率＝最新存量（TEU）÷ 容量；容量缺失回傳 null；超過 100% 標資料異常
  function util() {
    return C.yards.map((yd, y) => {
      let teu = 0, any = false;
      C.combos.forEach((cb, c) => { const s = inv[k3(y, c)]; if (!s) return; const ks = Object.keys(s).map(Number).filter(o => s[o] != null).sort((a, b) => a - b); if (ks.length) { teu += s[ks[ks.length - 1]] * TEU[cb[1]]; any = true; } });
      const stale = (NOW - Date.parse(yd[4] + ':00Z')) / 1000 > 48 * 3600;
      return { y, yard: yd[0], unlo: yd[1], teu: any ? teu : null, cap: yd[3], u: (any && yd[3]) ? teu / yd[3] : null, stale, last: yd[4] };
    });
  }
  // 本週（近 7 天）對上週的平均等待時數；每天進泊船次少於 minCalls 的日子不計，兩週各需 3 天以上，上週平均低於 2 小時不比較
  function waitTrend(minCalls) {
    const all = cong().filter(r => r.term == null), res = [];
    [...new Set(all.map(r => r.unlo + '|' + r.cov))].forEach(k => {
      const rows = all.filter(r => r.unlo + '|' + r.cov === k), ok = rows.filter(r => r.avgWait != null && r.calls >= minCalls);
      const cur = ok.filter(r => r.off >= -6).map(r => r.avgWait), prev = ok.filter(r => r.off < -6).map(r => r.avgWait);
      const days = []; for (let o = -6; o <= 0; o++) { const r = rows.find(x => x.off === o); days.push({ off: o, avg: r ? r.avgWait : null, calls: r ? r.calls : null }); }
      const o = { unlo: k.split('|')[0], cov: k.split('|')[1], days, nCur: cur.length, nPrev: prev.length, a: null, b: null, chg: null };
      if (cur.length >= 3 && prev.length >= 3) { o.a = mean(cur); o.b = mean(prev); if (o.b >= 2) o.chg = 100 * (o.a - o.b) / o.b; }
      res.push(o);
    });
    return res;
  }
  // 散裝貨量：依畫面上選的組織篩選（每列最後一欄是組織）
  function bulk() {
    const o = U.STATE.org, f = r => o === 'all' || +o === r[r.length - 1];
    return { month: C.bulk.month.filter(f), missing: C.bulk.missing.filter(f), port: C.bulk.port.filter(f) };
  }
  const orgOk = () => U.STATE.org === 'all' || +U.STATE.org === 3;
  const arrivals = () => C.arrivals.map(a => { const o = {}; C.cols.arrivals.split(',').forEach((k, i) => (o[k] = a[i])); return o; });
  const cong = () => C.cong.map(a => { const o = {}; C.cols.cong.split(',').forEach((k, i) => (o[k] = a[i])); return o; });
  // 最新一筆非空存量（個）與它距離今天幾天
  function latest(y, c) {
    const s = inv[k3(y, c)]; if (!s) return null;
    const ks = Object.keys(s).map(Number).filter(o => s[o] != null).sort((a, b) => a - b);
    return ks.length ? { qty: s[ks[ks.length - 1]], off: ks[ks.length - 1] } : null;
  }
  // 展示用：把某場站某櫃型的最新存量改成指定個數（測試風險是否即時改變）；傳回原值，傳 null 還原
  const saved = {};
  function setStock(y, c, qty) {
    const key = k3(y, c), s = inv[key];
    if (!s) return null;
    if (qty == null) { if (key in saved) { s[0] = saved[key]; delete saved[key]; } } else { if (!(key in saved)) saved[key] = s[0]; s[0] = qty; }
    cacheAll = null;
    return saved[key];
  }
  // 上傳的安全存量：{ '場站|櫃型|尺寸': 個數 }；設定後清掉預估快取
  function setSafety(map) { SOVR = Object.assign({}, map || {}); cacheAll = null; }
  U.cargo = { C, NOW, one, forecastAll, util, orgOk, arrivals, cong, waitTrend, bulk, yardIdx, wdOf, setStock, setSafety, latest, TEU, orgPorts: () => [...new Set(C.cong.map(r => r[0]))].length };
})();
