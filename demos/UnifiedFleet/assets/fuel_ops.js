/* 燃油成本與營運的計算（提案 fuel-ops-cost）：依航線、依港口彙總油耗、燃油成本、裝卸箱數、等待油耗、趕船多燒的油。
   - 油價是示意價：先用該船該月的加權油價（BUNKER_PRICE）；沒有就用同月份全船隊加油紀錄的加權油價；再沒有就往前找最近一個有價格的月份。
   - 每箱燃油成本：當月靠港（以抵港時間 nor 算月份）的卸貨＋裝貨 TEU。
   - 等待油耗：等待耗油占比（錨泊＋漂流）× 總油耗；依港口時，把這艘船當月的等待油耗按各次靠港的等待時數（錨泊 aw＋漂流 dw）分攤。
   - 趕船多燒的油（估算）：航行用油 × 趕船航段占比 ×（1 − 1 ÷（1＋加速幅度）²）；每浬油耗約與航速平方成正比，加速幅度預設 10%。
   - 船屬於哪條航線以船目前的航線為準（示範資料船不換航線）。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const { months, val, VBY } = U;
  const R = n => U.risk.rows(n);
  const P = { boost: 0.10 };                                   // 趕船時比平時快多少（門檻設定可改）

  const boost = () => { const v = ((U.RK.blocks['M16-c2'] || {}).params || {}).boost; return v != null ? v : P.boost; };   // 門檻設定（M16-c2 的 boost）優先
  P.get = boost;
  const svcById = id => (U.M.services || []).find(s => s.id === id);
  const ym = mi => months[mi];

  // 每月全船隊加權油價（快取）
  let fleetPx = null;
  function fleetPrice(mi) {
    if (!fleetPx) {
      const by = {};
      R('bunker').forEach(r => { if (r.price != null && r.qty > 0) { const k = r.t.slice(0, 7), o = by[k] || (by[k] = { w: 0, q: 0 }); o.w += r.price * r.qty; o.q += r.qty; } });
      fleetPx = months.map(m => (by[m] ? by[m].w / by[m].q : null));
    }
    for (let i = mi; i >= 0; i--) if (fleetPx[i] != null) return fleetPx[i];
    return null;
  }
  function price(vid, mi) { const p = val('BUNKER_PRICE', vid, mi); return p != null ? p : fleetPrice(mi); }

  // 每船每月的靠港（快取）：{ vid|YYYY-MM: [calls] }
  let callIdx = null;
  function callsOf(vid, mi) {
    if (!callIdx) { callIdx = {}; R('calls').forEach(r => { if (!r.nor) return; const k = r.vid + '|' + r.nor.slice(0, 7); (callIdx[k] = callIdx[k] || []).push(r); }); }
    return callIdx[vid + '|' + ym(mi)] || [];
  }

  // 單船單月
  function vessel(vid, mi) {
    const fuel = val('FUEL_TOTAL', vid, mi);
    if (fuel == null) return null;
    const px = price(vid, mi), ws = val('FUEL_WAIT_SHARE', vid, mi) || 0, ps = val('FUEL_PORT_SHARE', vid, mi) || 0, cs = val('CATCHUP_SHARE', vid, mi);
    const cl = callsOf(vid, mi), teu = cl.reduce((s, r) => s + (r.tdis || 0) + (r.tload || 0), 0);
    const sea = fuel * Math.max(0, 1 - (ws + ps) / 100), k = 1 - 1 / Math.pow(1 + boost(), 2);
    return { vid, fuel, px, cost: px != null ? fuel * px : null, teu, wait: fuel * ws / 100, catchX: cs != null ? sea * cs / 100 * k : null, catchShare: cs,
      delay: val('ARR_DELAY', vid, mi), portWait: val('PORT_WAIT_HR', vid, mi), speed: val('SPEED_RATIO', vid, mi), calls: cl };
  }

  const sumK = (a, k) => { let s = 0, n = 0; a.forEach(x => { if (x[k] != null) { s += x[k]; n++; } }); return n ? s : null; };
  const meanK = (a, k) => { const s = sumK(a, k), n = a.filter(x => x[k] != null).length; return n ? s / n : null; };
  const pct = (a, b) => (a != null && b > 0 ? 100 * (a - b) / b : null);
  // 近 6 個月準點率：合併靠港計算（晚到 6 小時內算準點），和既有判讀一致
  function otp6(vids, mi) {
    const lo = months[Math.max(0, mi - 5)] + '-01', hi = months[mi] + '-32', set = new Set(vids);
    const cs = R('calls').filter(r => set.has(r.vid) && r.dly != null && r.nor >= lo && r.nor < hi);
    return cs.length >= 3 ? { v: 100 * cs.filter(r => r.dly <= 6).length / cs.length, n: cs.length } : { v: null, n: cs.length };
  }
  const mean6 = (metric, vids, mi) => { const a = []; vids.forEach(id => { for (let i = Math.max(0, mi - 5); i <= mi; i++) { const v = val(metric, id, i); if (v != null) a.push(v); } }); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };

  function sumUp(rows) {
    const fuel = sumK(rows, 'fuel'), cost = sumK(rows, 'cost'), teu = sumK(rows, 'teu');
    return { n: rows.length, fuel, cost, teu, cpt: cost != null && teu > 0 ? cost / teu : null, wait: sumK(rows, 'wait'), catchX: sumK(rows, 'catchX'),
      catchShare: meanK(rows, 'catchShare'), delay: meanK(rows, 'delay'), portWait: meanK(rows, 'portWait'), speed: meanK(rows, 'speed') };
  }

  // 依航線：vids 是已經套用頁首航線篩選的船
  function byRoute(vids, mi) {
    const g = {};
    vids.forEach(id => { const v = VBY[id], s = v && svcById(v.svc); if (!s) return; (g[s.code] = g[s.code] || { code: s.code, name: s.name, ids: [] }).ids.push(id); });
    return Object.values(g).map(o => {
      const cur = o.ids.map(id => vessel(id, mi)).filter(Boolean), prev = mi > 0 ? o.ids.map(id => vessel(id, mi - 1)).filter(Boolean) : [];
      const a = sumUp(cur), b = sumUp(prev), ot = otp6(o.ids, mi);
      return Object.assign({ code: o.code, name: o.name, ids: o.ids, vessels: o.ids.length }, a,
        { prevCost: b.cost, prevCpt: b.cpt, dCost: pct(a.cost, b.cost), dCpt: pct(a.cpt, b.cpt), otp6: ot.v, otpN: ot.n, speed6: mean6('SPEED_RATIO', o.ids, mi) });
    }).sort((x, y) => (y.cost || 0) - (x.cost || 0));
  }

  // 依港口：等待油耗按各次靠港的等待時數分攤
  function byPort(vids, mi) {
    const by = {};
    vids.forEach(id => {
      const x = vessel(id, mi); if (!x || !(x.wait > 0)) return;
      const hrs = x.calls.map(r => (r.aw || 0) + (r.dw || 0)), tot = hrs.reduce((s, h) => s + h, 0); if (!(tot > 0)) return;
      x.calls.forEach((r, i) => { if (!(hrs[i] > 0)) return; const o = by[r.port] || (by[r.port] = { port: r.port, n: 0, hr: 0, fuel: 0, cost: 0, ids: new Set() }); const f = x.wait * hrs[i] / tot;
        o.n++; o.hr += hrs[i]; o.fuel += f; o.cost += x.px != null ? f * x.px : 0; o.ids.add(id); });
    });
    return Object.values(by).map(o => Object.assign(o, { vessels: o.ids.size, avgHr: o.hr / o.n })).sort((a, b) => b.fuel - a.fuel);
  }

  // 重點數字：整個範圍合計＋油量偏低的船
  function kpi(vids, mi) {
    const cur = vids.map(id => vessel(id, mi)).filter(Boolean), prev = mi > 0 ? vids.map(id => vessel(id, mi - 1)).filter(Boolean) : [];
    const a = sumUp(cur), b = sumUp(prev);
    const low = vids.filter(id => { const s = (U.SN.snap || {})[id]; return s && !s.stale && s.remain != null && (s.below || s.remain <= 3); });   // 同「燃油與庫存」剩餘天數的判讀（貨櫃 3 天；資料過期不判斷）
    return Object.assign(a, { prevCost: b.cost, prevCpt: b.cpt, prevWait: b.wait, prevCatchX: b.catchX, dCost: pct(a.cost, b.cost), dCpt: pct(a.cpt, b.cpt), low, hasData: cur.length > 0 });
  }

  // 同一次畫面裡六張卡片與判讀會用同一組船重複計算：依（函式、月份、船、加速幅度）快取，資料不變所以不用清
  const memo = (name, fn) => { const C = {}; return (vids, mi) => { const k = mi + '|' + boost() + '|' + vids.join(','); return C[k] || (C[k] = fn(vids, mi)); }; };
  const byRouteM = memo('route', byRoute), byPortM = memo('port', byPort), kpiM = memo('kpi', kpi);
  const base = mi => kpiM(U.scopeVessels().map(v => v.id), mi).cpt;   // 全部航線（不套篩選）的每箱燃油成本：各航線比較的基準
  U.fuelOps = { P, price, fleetPrice, vessel, byRoute: byRouteM, byPort: byPortM, kpi: kpiM, base };
})();
