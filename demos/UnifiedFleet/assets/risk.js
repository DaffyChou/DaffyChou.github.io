/* 風險判讀引擎：22 種評估器。等級與文字全部由資料與 risk.js 規格的門檻即時計算。 */
(function () {
  'use strict';
  const U = window.UI;
  const { RK, STATE, months, VBY, val, fmt, vname, mean, median, quant, esc } = U;
  const RANK = { low: 0, mid: 1, high: 2 };
  const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

  // ---------------- 資料表（欄位陣列轉物件，快取）
  const cache = {};
  function rows(name) {
    if (cache[name]) return cache[name];
    const D = window['UI_' + name.toUpperCase()];
    cache[name] = D.rows.map(r => { const o = {}; D.cols.forEach((c, i) => (o[c] = r[i])); return o; });
    return cache[name];
  }
  function winStart(mi, n) { return months[Math.max(0, mi - (n || 6) + 1)] + '-01'; }
  function winEnd(mi) { return months[mi] + '-31'; }
  const mkItem = (vid, text) => ({ vid, text });
  const nd = (summary) => ({ level: 'nodata', summary, items: [] });
  const typeLim = (p, type) => (p.bytype && type === 'container' ? { mid: 3, high: 1.5 } : { mid: p.mid, high: p.high });

  // 近 n 個月的平均（略過沒有資料的月份）；單月數字波動大的指標（準點、追趕）用它
  function wmean(metric, id, mi, n) {
    if (metric === 'OTP') {                                           // 準點率：把近 n 個月的靠港合併計算（延遲 6 小時內為準點），比月平均穩定
      const lo = months[Math.max(0, mi - n + 1)] + '-01', hi = months[mi] + '-32';
      const cs = rows('calls').filter(r => r.vid === id && r.dly != null && r.nor >= lo && r.nor < hi);
      return cs.length >= 3 ? 100 * cs.filter(r => r.dly <= 6).length / cs.length : null;
    }
    const a = []; for (let i = Math.max(0, mi - n + 1); i <= mi; i++) { const v = val(metric, id, i); if (v != null) a.push(v); } return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  // 方向判斷：回傳 'high'|'mid'|'low'
  function levelOf(v, p) {
    if (v == null) return null;
    const dir = p.dir;
    const x = dir === 'abs_above' ? Math.abs(v) : v;
    if (dir === 'above' || dir === 'abs_above') return x >= p.high ? 'high' : x >= p.mid ? 'mid' : 'low';
    if (dir === 'below') return x <= p.high ? 'high' : x <= p.mid ? 'mid' : 'low';
    return 'low';
  }

  // ---------------- 評估器
  const K = {};

  K.vessel_threshold = (p, c) => {
    const L = [], miss = [];
    c.vids.forEach(id => { const v = p.window ? wmean(p.metric, id, c.mi, p.window) : val(p.metric, id, c.mi); if (v == null) miss.push(id); else L.push({ id, v, lv: levelOf(v, p) }); });
    if (!L.length) return nd('這個範圍沒有可判斷的資料（' + c.vids.length + ' 艘皆無此指標）');
    let lv = 'low';
    L.forEach(x => (lv = worse(lv, x.lv)));
    const ord = L.slice().sort((a, b) => (p.dir === 'below' ? a.v - b.v : Math.abs(b.v) - Math.abs(a.v)));
    const nh = L.filter(x => x.lv === 'high').length, nm = L.filter(x => x.lv === 'mid').length;
    const m = (RK.metrics[p.metric] || { name: p.metric }).name;
    const u = p.unit || '';
    const sym = p.dir === 'below' ? '低於' : '高於';
    let s = nh + nm === 0 ? `${L.length} 艘的「${m}」都在正常範圍（${sym}留意門檻 ${p.mid}${u} 才會提示）` :
      `${nh ? nh + ' 艘' + sym + '要處理門檻 ' + p.high + u : ''}${nh && nm ? '，' : ''}${nm ? nm + ' 艘' + sym + '留意門檻 ' + p.mid + u : ''}`;
    if (miss.length) s += `；${miss.length} 艘無資料`;
    return { level: lv, summary: s, items: ord.filter(x => x.lv !== 'low').slice(0, 60).map(x => mkItem(x.id, `${vname(x.id)}　${fmt(x.v)}${u}`)).concat(ord.filter(x => x.lv === 'low').slice(0, nh + nm ? 0 : 3).map(x => mkItem(x.id, `${vname(x.id)}　${fmt(x.v)}${u}`))) };
  };

  K.share_flagged = (p, c) => K.vessel_threshold(p, c);

  K.class_dev = (p, c) => {
    const L = [];
    c.vids.forEach(id => { const v = val('CLASS_DEV', id, c.mi); if (v != null) L.push({ id, v, lv: v <= p.high ? 'high' : v <= p.warn ? 'mid' : 'low' }); });
    if (!L.length) return nd('同級距有效船數不足 2 艘，無法比較（樣本不足時不給基準，不下結論）');
    let lv = 'low';
    L.forEach(x => (lv = worse(lv, x.lv)));
    const bad = L.filter(x => x.lv !== 'low').sort((a, b) => a.v - b.v);
    const nh = bad.filter(x => x.lv === 'high').length;
    const s = bad.length ? `${nh} 艘效率落後（偏離 ${p.high}% 以下）、${bad.length - nh} 艘略低於同級距（${p.warn}% 到 ${p.high}%）；共判定 ${L.length} 艘` : `${L.length} 艘都在同級距正常範圍內（偏離大於 ${p.warn}%）`;
    return { level: lv, summary: s, items: bad.slice(0, 60).map(x => mkItem(x.id, `${vname(x.id)}　偏離 ${fmt(x.v, 1)}%`)) };
  };

  K.kpi_change = (p, c) => {
    let lv = 'low', anyData = false;
    const items = [];
    p.items.forEach(it => {
      if (it.snap) {
        const lim = typeLim(it, STATE.type);
        const vals = c.vids.map(id => ({ id, v: U.SN.snap[id] && U.SN.snap[id][it.snap] })).filter(x => x.v != null && !U.SN.snap[x.id].stale);
        if (!vals.length) return;
        anyData = true;
        const m = vals.reduce((a, b) => (b.v < a.v ? b : a));
        const l = m.v <= lim.high ? 'high' : m.v <= lim.mid ? 'mid' : 'low';
        lv = worse(lv, l);
        items.push(mkItem(m.id, `${it.label || it.snap}　最低 ${vname(m.id)} ${fmt(m.v, 1)}`));
        return;
      }
      const a = U.fleetAt(it.metric, c.vids, c.mi, it.agg), b = U.fleetAt(it.metric, c.vids, c.mi - 1, it.agg);
      if (a == null || b == null) return;
      anyData = true;
      let bad;
      if (it.dir === 'down_bad') bad = -100 * (a - b) / Math.abs(b || 1);
      else if (it.dir === 'up_bad') bad = 100 * (a - b) / Math.abs(b || 1);
      else if (it.dir === 'down_pts') bad = b - a;
      else if (it.dir === 'up_pts') bad = a - b;
      else bad = a - b;
      const l = bad >= it.high ? 'high' : bad >= it.mid ? 'mid' : 'low';
      lv = worse(lv, l);
      const nm = (RK.metrics[it.metric] || { name: it.metric }).name;
      if (l !== 'low') items.push(mkItem(null, `${nm}　${fmt(a)}（上月 ${fmt(b)}）`));
    });
    if (!anyData) return nd('這個範圍沒有足夠的 KPI 資料');
    return { level: lv, summary: items.length ? `${items.length} 項 KPI 相對上月惡化超過門檻` : '各 KPI 相對上月都在正常範圍', items };
  };

  K.trend_run = (p, c) => {
    const s = months.map((_, i) => U.fleetAt(p.metric, c.vids, i, p.agg));
    const end = c.mi;
    const cur = s.slice(0, end + 1);
    const nm = (RK.metrics[p.metric] || { name: p.metric }).name;
    if (U.nums(cur).length < 3) return nd(`「${nm}」資料期數不足，無法看趨勢`);
    const up = p.dir === 'up_bad' ? 1 : -1;
    let run = 0;
    for (let i = end; i > 0; i--) { if (cur[i] != null && cur[i - 1] != null && up * (cur[i] - cur[i - 1]) > 0) run++; else break; }
    const base = cur[Math.max(0, end - p.window)];
    const pct = base ? up * 100 * (cur[end] - base) / Math.abs(base) : 0;
    let lv = 'low';
    if (run >= p.run) lv = 'mid';
    if (pct >= p.high_pct) lv = 'high';
    const txt = `「${nm}」${p.agg === 'wmean' && c.vids.length > 1 ? '（船隊加權：CO₂ 合計 ÷ 運輸量合計）' : ''}本月 ${fmt(cur[end])}；連續 ${run} 個月往${up > 0 ? '上升' : '下降'}方向（${p.run} 個月視為關注）；相較 ${p.window} 個月前${pct >= 0 ? '惡化' : '改善'} ${fmt(Math.abs(pct), 1)}%（${p.high_pct}% 為要處理）`;
    return { level: lv, summary: txt, items: [] };
  };

  K.vs_baseline_avg = (p, c) => {
    const L = [];
    c.vids.forEach(id => {
      const v = val(p.metric, id, c.mi);
      const prev = []; for (let k = Math.max(0, c.mi - 6); k < c.mi; k++) prev.push(val(p.metric, id, k));
      const b = mean(prev);
      if (v != null && b) { const pct = 100 * (v - b) / Math.abs(b); L.push({ id, v, b, pct, lv: pct >= p.high ? 'high' : pct >= p.mid ? 'mid' : 'low' }); }
    });
    if (!L.length) return nd('沒有足夠的歷史資料可比較');
    let lv = 'low'; L.forEach(x => (lv = worse(lv, x.lv)));
    const bad = L.filter(x => x.lv !== 'low').sort((a, b) => b.pct - a.pct);
    const nm = (RK.metrics[p.metric] || { name: p.metric }).name;
    return { level: lv, summary: bad.length ? `${bad.length} 艘的「${nm}」比自己近 6 個月平均高出 ${p.mid}% 以上` : `${L.length} 艘的「${nm}」都在自己近 6 個月平均附近`, items: bad.slice(0, 60).map(x => mkItem(x.id, `${vname(x.id)}　${fmt(x.v)}（平均 ${fmt(x.b)}，+${fmt(x.pct, 0)}%）`)) };
  };

  K.foul_index = (p, c) => K.vessel_threshold({ metric: 'FOUL', dir: 'below', mid: p.mid, high: p.high, unit: p.unit }, c);

  // 近 6 個月的離群日數（每日效率超出四分位距 1.5 倍；合格日不足 10 天回傳 null）
  function outlierOf(id, mi) {
    const lo = Math.floor((Date.parse(winStart(mi, 6)) - Date.UTC(2024, 0, 1)) / 86400000), hi = Math.floor((Date.parse(months[mi] + '-28') - Date.UTC(2024, 0, 1)) / 86400000) + 3;
    const d = (window.UI_DAILY.d[id] || []).filter(r => r[0] >= lo && r[0] <= hi && r[1] != null && r[2] >= 100);
    if (d.length < 10) return null;
    const e = d.map(r => r[1]), q1 = quant(e, .25), q3 = quant(e, .75), f = 1.5 * (q3 - q1);
    return { id, n: e.filter(x => x < q1 - f || x > q3 + f).length, tot: e.length };
  }
  K.outlier_days = (p, c) => {
    const L = [];
    c.vids.forEach(id => { const o = outlierOf(id, c.mi); if (o) L.push(o); });
    if (!L.length) return nd('每船合格日不足 10 天，不判定離群（規格）');
    let lv = 'low'; L.forEach(x => (lv = worse(lv, x.n >= p.high ? 'high' : x.n >= p.mid ? 'mid' : 'low')));
    const bad = L.filter(x => x.n >= p.mid).sort((a, b) => b.n - a.n);
    return { level: lv, summary: bad.length ? `${bad.length} 艘在近 6 個月有 ${p.mid} 個以上離群日（${p.high} 個以上為要處理）` : `${L.length} 艘近 6 個月離群日都不多`, items: bad.slice(0, 60).map(x => mkItem(x.id, `${vname(x.id)}　離群 ${x.n} 日（合格 ${x.tot} 日）`)) };
  };

  K.dq_issues = (p, c) => {
    const set = new Set(c.vids), any = p.rules.includes('*');
    const by = {};
    window.UI_DQ.agg.forEach(([rule, vid, n]) => { if ((any || p.rules.includes(rule)) && (vid == null || set.has(vid))) { by[rule] = (by[rule] || 0) + n; } });
    const nul = {}; window.UI_DQ.agg.forEach(([rule, vid, k]) => { if (vid == null && (any || p.rules.includes(rule))) nul[rule] = (nul[rule] || 0) + k; });
    const n = Math.max(1, c.vids.length), totV = Object.values(by).reduce((s, x) => s + x, 0) - Object.values(nul).reduce((s, x) => s + x, 0), tot = totV + (n > 1 ? Object.values(nul).reduce((s, x) => s + x, 0) : 0), avg = totV / n;
    if (n === 1) Object.keys(nul).forEach(r => { by[r] -= nul[r]; if (by[r] <= 0) delete by[r]; });
    const per = (p.per && p.per[STATE.type]) || [p.mid, p.high];                  // 每艘平均的門檻（全期）
    const lv = avg >= per[1] ? 'high' : avg >= per[0] ? 'mid' : 'low';
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, k]) => mkItem(null, `${r}　${k} 筆`));
    return { level: lv, summary: tot ? `此範圍共 ${tot.toLocaleString()} 筆資料品質問題${n > 1 ? '，平均每艘 ' + fmt(avg, 0) + ' 筆' : ''}（每艘 ${per[0]} 筆起留意、${per[1]} 筆起要處理，全期累計）` : '此範圍沒有相關的資料品質問題', items: top };
  };

  K.coverage = (p, c) => {
    const F = window.UI_DQ.fill, fields = STATE.type === 'bulk' ? [['bft', '浪高風級'], ['disp', '排水量'], ['cargo', '貨量']] : [['bft', '浪高風級'], ['price', '油價'], ['bdn', 'BDN 供油單量']];
    const L = [];
    fields.forEach(([k, n]) => { const v = c.vids.map(id => F[id] && F[id][k]).filter(x => x != null); if (v.length) L.push({ n, v: 100 * mean(v) }); else L.push({ n, v: null }); });
    const have = L.filter(x => x.v != null);
    if (!have.length) return nd('沒有填充率資料');
    let lv = 'low';
    L.forEach(x => { const v = x.v == null ? 0 : x.v; lv = worse(lv, v < p.high ? 'high' : v < p.mid ? 'mid' : 'low'); });
    return { level: lv, summary: L.map(x => `${x.n} ${x.v == null ? '無資料' : fmt(x.v, 0) + '%'}`).join('、') + `（${p.mid}% 以下留意、${p.high}% 以下要處理）`, items: [] };
  };

  K.config_gap = (p, c) => {
    const vs = c.vids.map(id => VBY[id]);
    const unset = vs.filter(v => !(v.thr_res > 0) || !(v.thr_mgo > 0));
    const lv = unset.length ? 'mid' : 'low';
    return { level: lv, summary: unset.length ? `${unset.length} 艘有油品門檻未設定（小於等於 0 視為未設定，不會觸發低庫存警報）` : `${vs.length} 艘的殘油與輕油門檻都已設定；循環油門檻目前不判斷`, items: unset.slice(0, 60).map(v => mkItem(v.id, vname(v.id))) };
  };

  K.nodata = (p) => nd(p.reason || '資料不足');

  K.concentration = (p, c) => {
    const lo = winStart(c.mi, 6), hi = winEnd(c.mi), set = new Set(c.vids), by = {};
    rows('bunker').forEach(r => { if (set.has(r.vid) && r.t >= lo && r.t <= hi + 'T99') by[r.port] = (by[r.port] || 0) + r.qty; });
    const e = Object.entries(by).sort((a, b) => b[1] - a[1]), tot = e.reduce((s, x) => s + x[1], 0);
    if (!tot) return nd('近 6 個月沒有加油紀錄');
    const share = 100 * e[0][1] / tot, lv = share >= p.high ? 'high' : share >= p.mid ? 'mid' : 'low';
    const nm = k => (U.M.ports[k] ? U.M.ports[k].name : k);
    return { level: lv, summary: `近 6 個月加油量最大的港口 ${nm(e[0][0])} 占 ${fmt(share, 0)}%（${p.mid}% 起留意、${p.high}% 起要處理）；共 ${e.length} 個港口`, items: e.slice(0, 3).map(x => mkItem(null, `${nm(x[0])}　${fmt(x[1], 0)} t（${fmt(100 * x[1] / tot, 0)}%）`)) };
  };

  K.price_spread = (p, c) => {
    const lo = winStart(c.mi, 6), set = new Set(c.vids), by = {};
    rows('bunker').forEach(r => { if (set.has(r.vid) && r.t >= lo && r.price != null) { const o = by[r.port] || (by[r.port] = { w: 0, q: 0 }); o.w += r.price * r.qty; o.q += r.qty; } });
    const e = Object.entries(by).filter(x => x[1].q > 0).map(([k, o]) => [k, o.w / o.q]);
    if (e.length < 2) return nd('沒有油價資料（真實客戶系統目前不提供油價與供油商）');
    e.sort((a, b) => a[1] - b[1]);
    const sp = 100 * (e[e.length - 1][1] - e[0][1]) / e[0][1], lv = sp >= p.high ? 'high' : sp >= p.mid ? 'mid' : 'low';
    const nm = k => (U.M.ports[k] ? U.M.ports[k].name : k);
    return { level: lv, summary: `各港加權油價差 ${fmt(sp, 1)}%（最低 ${nm(e[0][0])} ${fmt(e[0][1], 0)}、最高 ${nm(e[e.length - 1][0])} ${fmt(e[e.length - 1][1], 0)} USD/t）`, items: [] };
  };

  // 清單的整體判讀：與清單的紅黃綠船數同一套規則（2 欄以上要處理＝要處理）
  K.roster_levels = (p, c) => {
    const L = c.vids.map(id => ({ id, lv: overall(byVessel(id)), sc: score(id) })), n = Math.max(1, L.length);
    const cnt = { high: 0, mid: 0, low: 0 }; L.forEach(x => cnt[x.lv]++);
    const lv = cnt.high / n >= 0.25 ? 'high' : cnt.high >= 1 || cnt.mid / n >= 0.5 ? 'mid' : 'low';
    const top = L.filter(x => x.lv === 'high').sort((a, b) => b.sc - a.sc).slice(0, 60).map(x => mkItem(x.id, `${vname(x.id)}　${Object.values(byVessel(x.id)).filter(t => t.level === 'high').map(t => t.label).join('、')}`));
    return { level: lv, summary: `${L.length} 艘中，要處理 ${cnt.high} 艘、留意 ${cnt.mid} 艘、正常 ${cnt.low} 艘`, items: top };
  };
  K.multi_flags = (p, c) => {
    const out = []; let lv = 'low';
    c.vids.forEach(id => {
      const s = U.SN.snap[id] || {}, fl = [];
      p.flags.forEach(f => {
        if (f.snap) {
          const v = s[f.snap];
          if (f.snap === 'stale' || f.snap === 'below') { if (v) fl.push([f.label, 'high']); return; }
          if (v == null || s.stale) return;
          const lim = typeLim(f, STATE.type);
          const l = f.dir === 'below' ? (v <= lim.high ? 'high' : v <= lim.mid ? 'mid' : null) : (v >= lim.high ? 'high' : v >= lim.mid ? 'mid' : null);
          if (l) fl.push([f.label + ' ' + fmt(v, 1), l]);
        } else {
          const v = val(f.metric, id, c.mi);
          if (v == null) return;
          const l = levelOf(v, f);
          if (l && l !== 'low') fl.push([f.label + ' ' + fmt(v, 0), l]);
        }
      });
      if (fl.length) { const m = fl.reduce((a, b) => worse(a, b[1]), 'low'); lv = worse(lv, m); out.push({ id, fl, m }); }
    });
    out.sort((a, b) => b.fl.length - a.fl.length || (RANK[b.m] - RANK[a.m]));
    return { level: lv, summary: out.length ? `${out.length} / ${c.vids.length} 艘有風險提醒（${out.filter(x => x.m === 'high').length} 艘有要處理旗標）` : '各船都沒有風險提醒', items: out.slice(0, 60).map(x => mkItem(x.id, `${vname(x.id)}　${x.fl.map(f => f[0]).join('、')}`)) };
  };

  K.rob_remain = (p, c) => {
    const lim = typeLim(p, STATE.type), L = []; let stale = 0, below = 0;
    c.vids.forEach(id => {
      const s = U.SN.snap[id]; if (!s) return;
      if (s.stale) { stale++; return; }
      if (s.remain == null) return;
      if (s.below) below++;
      L.push({ id, d: s.remain, lv: s.below || s.remain <= lim.high ? 'high' : s.remain <= lim.mid ? 'mid' : 'low' });
    });
    if (!L.length) return nd(stale ? `${stale} 艘資料過期，不判斷庫存` : '沒有庫存資料');
    let lv = 'low'; L.forEach(x => (lv = worse(lv, x.lv)));
    const bad = L.filter(x => x.lv !== 'low').sort((a, b) => a.d - b.d);
    let s = bad.length ? `${bad.length} 艘剩餘天數低於 ${lim.mid} 天（${bad.filter(x => x.lv === 'high').length} 艘低於 ${lim.high} 天或已低於最低存量）` : `${L.length} 艘剩餘天數都大於 ${lim.mid} 天`;
    if (stale) s += `；${stale} 艘資料過期未判斷`;
    return { level: lv, summary: s, items: bad.slice(0, 60).map(x => mkItem(x.id, `${vname(x.id)}　剩餘 ${fmt(x.d, 1)} 日`)) };
  };

  K.bunker_arrival = (p, c) => {
    const lo = winStart(c.mi, 6), set = new Set(c.vids), L = [];
    rows('bunker').forEach(r => { const s = U.SN.snap[r.vid]; if (set.has(r.vid) && r.t >= lo && r.ra != null && s && s.rate) L.push({ vid: r.vid, d: r.ra / s.rate, t: r.t }); });
    if (!L.length) return nd('近 6 個月沒有可計算抵港庫存的加油事件');
    const nh = L.filter(x => x.d < p.high).length, nm = L.filter(x => x.d < p.mid).length;
    const lv = nh ? 'high' : nm ? 'mid' : 'low';
    const w = L.slice().sort((a, b) => a.d - b.d).slice(0, 4);
    return { level: lv, summary: `近 6 個月 ${L.length} 次加油中，${nm} 次抵港庫存不到 ${p.mid} 日用量、${nh} 次不到 ${p.high} 日`, items: w.map(x => mkItem(x.vid, `${vname(x.vid)}　${x.t.slice(0, 10)}　抵港庫存約 ${fmt(x.d, 1)} 日`)) };
  };

  K.delay_chain = (p, c) => {
    const id = c.vids[0];
    const cs = rows('calls').filter(r => r.vid === id && r.peta && r.dly != null).sort((a, b) => (a.nor < b.nor ? -1 : 1));
    if (!cs.length) return nd('這艘船沒有計畫對實際的靠港資料');
    const last = cs.slice(-Math.min(cs.length, 8));
    const mx = last.reduce((a, b) => (b.dly > a.dly ? b : a));
    const lv = mx.dly >= p.high ? 'high' : mx.dly >= p.mid ? 'mid' : 'low';
    const first = last.find(r => r.dly >= p.mid);
    const nm = k => (U.M.ports[k] ? U.M.ports[k].name : k);
    return { level: lv, summary: first ? `最近 ${last.length} 港中，最早超過容許值的是 ${nm(first.port)}（延遲 ${fmt(first.dly, 1)} 小時）；最大延遲 ${fmt(mx.dly, 1)} 小時於 ${nm(mx.port)}` : `最近 ${last.length} 港延遲都在容許值 ${p.mid} 小時內（最大 ${fmt(mx.dly, 1)}）`, items: last.filter(r => r.dly >= p.mid).slice(0, 4).map(r => mkItem(id, `${nm(r.port)}　${r.nor.slice(0, 10)}　延遲 ${fmt(r.dly, 1)} 小時`)) };
  };

  K.port_eff_dev = (p, c) => {
    const lo = winStart(c.mi, 6), set = new Set(c.vids), by = {};
    rows('calls').forEach(r => { if (set.has(r.vid) && r.nor >= lo && r.qty > 0 && r.cname === 'DRY BULK' && r.ws && r.we) { const h = (Date.parse(r.we) - Date.parse(r.ws)) / 3600000; if (h > 0.5) (by[r.port + '|' + r.role] = by[r.port + '|' + r.role] || []).push(r.qty / h); } });
    const all = [].concat(...Object.values(by));
    if (all.length < 5) return nd('有貨量的貨運作業不足，無法建立裝卸效率基準（CSE 型無貨量）');
    const base = median(all), L = [];
    Object.entries(by).forEach(([k, a]) => { if (a.length >= 3) { const m = median(a), dv = 100 * (m - base) / base; L.push({ k, n: a.length, dv }); } });
    if (!L.length) return nd('各港樣本都少於 3 次，只供參考、不判斷');
    let lv = 'low'; L.forEach(x => (lv = worse(lv, x.dv <= p.high ? 'high' : x.dv <= p.mid ? 'mid' : 'low')));
    const bad = L.filter(x => x.dv <= p.mid).sort((a, b) => a.dv - b.dv);
    const nm = k => { const [pt, ro] = k.split('|'); return (U.M.ports[pt] ? U.M.ports[pt].name : pt) + (ro === 'LOAD' ? '（裝）' : '（卸）'); };
    return { level: lv, summary: bad.length ? `${bad.length} 個港口的裝卸效率比全船隊中位數低 ${-p.mid}% 以上` : `${L.length} 個港口的裝卸效率都在全船隊中位數附近（樣本小於 3 的港口不判斷）`, items: bad.slice(0, 4).map(x => mkItem(null, `${nm(x.k)}　${fmt(x.dv, 0)}%（n=${x.n}）`)) };
  };

  // CII：依 IMO 評級。E 級要處理；D 級留意，連續 3 年 D 級要處理；C 級以上正常；資料不足一年不評級
  K.cii = (p, c) => {
    const set = new Set(c.vids), all = window.UI_COMP.cii.filter(x => set.has(x.vid) && x.rating), years = [...new Set(all.map(x => x.year))].sort();
    if (!years.length) return nd('資料天數不足一年，不評 CII 等級');
    const yr = years[years.length - 1], L = all.filter(x => x.year === yr);
    const dist = {}; L.forEach(x => (dist[x.rating] = (dist[x.rating] || 0) + 1));
    const streak = id => { let n = 0; for (let y = yr; y >= years[0]; y--) { const r = all.find(x => x.vid === id && x.year === y); if (r && r.rating === 'D') n++; else break; } return n; };
    const E = L.filter(x => x.rating === 'E'), Dd = L.filter(x => x.rating === 'D'), D3 = Dd.filter(x => streak(x.vid) >= 3);
    const lv = E.length || D3.length ? 'high' : Dd.length ? 'mid' : 'low';
    const lab = x => `${vname(x.vid)}　${x.rating} 級（比值 ${fmt(x.ratio, 2)}）${x.rating === 'D' && streak(x.vid) >= 2 ? '　連續 ' + streak(x.vid) + ' 年 D 級' : ''}`;
    return { level: lv, summary: `${yr} 年 ${L.length} 艘評級：${['A', 'B', 'C', 'D', 'E'].map(k => k + ' ' + (dist[k] || 0)).join('、')}；E 級 ${E.length} 艘要處理、D 級 ${Dd.length} 艘留意（連續 3 年 D 級也要處理）。依 IMO`,
      items: E.concat(Dd).sort((a, b) => b.ratio - a.ratio).slice(0, 60).map(x => mkItem(x.vid, lab(x))) };
  };

  // 歐盟碳排成本（示意價）：成本取決於碳價；沒有歐盟航段的船不需繳納
  K.ets_cost = (p, c) => {
    const set = new Set(c.vids), E = (window.UI_COMP.ets || []).filter(x => set.has(x.vid));
    if (!E.length) return { level: 'low', summary: c.vids.length === 1 ? '無歐盟航段：這艘船沒有靠歐盟港' : '範圍內沒有靠歐盟港的船，沒有歐盟碳排成本', items: [] };
    const yr = Math.max(...E.map(x => x.year)), full = E.filter(x => x.year === yr - (yr === 2026 ? 1 : 0)), Y = full.length ? full[0].year : yr, L = E.filter(x => x.year === Y);
    const tot = L.reduce((a, x) => a + x.cost, 0), price = L[0].price;
    return { level: 'low', summary: `${new Set(E.map(x => x.vid)).size} 艘有歐盟航段；${Y} 年成本合計約 ${fmt(tot / 1e6, 1)} 百萬歐元（示意價 ${fmt(price, 0)} 歐元/噸，非真實價格）；碳價在 63 到 94 歐元之間時約 ${fmt(tot * 63 / price / 1e6, 1)} 到 ${fmt(tot * 94 / price / 1e6, 1)} 百萬歐元`,
      items: L.slice().sort((a, b) => b.cost - a.cost).slice(0, 60).map(x => mkItem(x.vid, `${vname(x.vid)}　${fmt(x.cost / 1e6, 2)} 百萬歐元（歐盟涵蓋占比 ${fmt(x.share, 0)}%）`)) };
  };

  K.alarm_open = (p, c) => {
    const set = new Set(c.vids), E = window.UI_ALARM.events.filter(e => !e.end && set.has(e.vid) && p.rules.includes(e.rule)), n = Math.max(1, c.vids.length), avg = E.length / n;
    const lv = avg >= p.high ? 'high' : avg >= p.mid ? 'mid' : 'low';
    const nm = { FCD: '油耗偏差', LSA: '最低庫存', REMAIN_DAYS: '剩餘天數', OTP: '準點' };
    return { level: lv, summary: E.length ? `${E.length} 筆警報進行中${n > 1 ? '，平均每艘 ' + fmt(avg, 1) + ' 筆' : ''}（每艘平均 ${p.mid} 筆起留意、${p.high} 筆起要處理）` : '目前沒有進行中的警報', items: E.slice(0, 6).map(e => mkItem(e.vid, `${vname(e.vid)}　${nm[e.rule]}　自 ${e.start}`)) };
  };

  K.alarm_fatigue = (p, c) => {
    const set = new Set(c.vids), E = window.UI_ALARM.events.filter(e => set.has(e.vid));
    const rate = E.length / Math.max(1, c.vids.length) / months.length;
    const by = {}; E.forEach(e => (by[e.vid] = (by[e.vid] || 0) + 1));
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const lv = rate >= p.high ? 'high' : rate >= p.mid ? 'mid' : 'low';
    return { level: lv, summary: `全期 ${E.length} 筆警報事件，平均 ${fmt(rate, 2)} 次/船月（${p.mid} 起留意、${p.high} 起要處理）`, items: top.map(x => mkItem(+x[0], `${vname(+x[0])}　${x[1]} 次`)) };
  };

  // ---------------- 入口
  function evaluate(bid) {
    const sp = RK.blocks[bid];
    const ctx = { vids: U.vesselsFor(bid), mi: STATE.mi };
    if (!ctx.vids.length && sp.kind !== 'nodata') return nd('目前範圍沒有船舶');
    try { return Object.assign({ items: [] }, K[sp.kind](sp.params, ctx)); } catch (e) { console.error(bid, e); return nd('判讀失敗：' + e.message); }
  }

  function panel(bid, res) {
    const sp = RK.blocks[bid], lv = U.LV[res.level];
    const rel = sp.related.map(r => `<button class="lnk" data-go="${r}">${esc(RK.blocks[r].title)}</button>`).join('');
    const th = Object.entries(sp.params).filter(([k]) => !['items', 'flags', 'rules', 'reason'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('　');
    return `<div class="risk lv-${res.level}"><div class="rh"><span class="chip lvl ${lv.k}">${lv.t}</span><strong>這張圖的風險怎麼看</strong></div>
      <div class="rb"><div class="rr"><b>現在狀況</b><div>${esc(res.summary)}</div>${res.items.length ? '<ul class="items">' + res.items.map(i => `<li>${i.vid ? `<button class="lnk" data-vessel="${i.vid}">${esc(i.text)}</button>` : esc(i.text)}</li>`).join('') + '</ul>' : ''}</div>
      <div class="rr"><b>為什麼要在意</b><div>${esc(sp.why)}</div></div>
      <div class="rr"><b>怎麼看這張圖</b><div>${esc(sp.how)}</div></div>
      <div class="rr"><b>建議你做什麼</b><div>${esc(sp.action)}</div>${rel ? `<div class="rel">相關圖表：${rel}</div>` : ''}</div>
      <details class="rr meta"><summary>判斷標準（給管理者看）</summary><div>門檻出處：${esc(sp.basis)}${th ? '；' + esc(th) : ''}</div></details></div></div>`;
  }
  // 新版卡片：展開後的內容（現在狀況的明細、為什麼、怎麼看、建議、判斷標準）
  function detail(bid, res) {
    const sp = RK.blocks[bid];
    const li = i => `<li>${i.vid ? `<button class="lnk" data-vessel="${i.vid}">${esc(i.text)}</button>` : esc(i.text)}</li>`;
    const rel = sp.related.map(r => `<button class="lnk" data-go="${r}">${esc(RK.blocks[r].title)}</button>`).join('');
    const th = Object.entries(sp.params).filter(([k]) => !['items', 'flags', 'rules', 'reason'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('　');
    // 每項一列：類別標籤｜名稱（船可點）｜明細（過長截斷，滑鼠看全文）｜狀態；文字格式「類別：名稱　明細（狀態）」，缺哪段就留空
    const parse = t => { let k = '', x = String(t); const m = x.match(/^([^：　]{1,6})：(.*)$/); if (m) { k = m[1]; x = m[2]; } let st = ''; const m2 = x.match(/（([^（）]{1,12})）$/); if (m2 && /處理|結案|指派|留意/.test(m2[1])) { st = m2[1]; x = x.slice(0, -m2[0].length); } const i = x.indexOf('　'); return { k, name: i > 0 ? x.slice(0, i) : x, rest: i > 0 ? x.slice(i + 1).trim() : '', st }; };
    const row = i => { const q = parse(i.text); return `<li class="ri">${q.k ? `<span class="ri-k">${esc(q.k)}</span>` : '<span></span>'}<span class="ri-n">${i.vid ? `<button class="lnk" data-vessel="${i.vid}">${esc(q.name)}</button>` : esc(q.name)}</span><span class="ri-d" title="${esc(q.rest)}">${esc(q.rest)}</span>${q.st ? `<span class="ri-s">${esc(q.st)}</span>` : '<span></span>'}</li>`; };
    const N = 8, its = res.items;
    return `${its.length ? `<div class="rr"><b>需要留意的項目（${its.length}）</b><ul class="ritems">${its.slice(0, N).map(row).join('')}</ul>` + (its.length > N ? `<details class="more rmore"><summary>再顯示 ${its.length - N} 項</summary><ul class="ritems">${its.slice(N).map(row).join('')}</ul></details>` : '') + '</div>' : ''}
      <div class="rr"><b>為什麼要在意</b><div>${esc(sp.why)}</div></div>
      <div class="rr"><b>怎麼看這張圖</b><div>${esc(sp.how)}</div></div>
      <div class="rr"><b>建議你做什麼</b><div>${esc(sp.action)}</div>${rel ? `<div class="rel">相關圖表：${rel}</div>` : ''}</div>
      <details class="rr meta"><summary>判斷標準（給管理者看）</summary><div>門檻出處：${esc(sp.basis)}${th ? '；' + esc(th) : ''}</div></details>`;
  }

  // ================= 逐船評估：清單每一欄的燈號。燈號直接用來源區塊的評估器與門檻（只把範圍限縮為這艘船），
  // 所以清單上的燈號與單船頁對應圖表的風險判讀必定一致。
  function evalWith(bid, vids) {
    const sp = RK.blocks[bid];
    try { return Object.assign({ items: [] }, K[sp.kind](sp.params, { vids, mi: STATE.mi })); } catch (e) { console.error(bid, e); return nd('判讀失敗：' + e.message); }
  }
  const fv = (x, d, u) => (x == null ? '—' : fmt(x, d) + (u || ''));
  const mval = (m, d, u) => id => { const v = val(m, id, STATE.mi); return { v, text: fv(v, d, u) }; };
  const THEMES = {
    bulk: [
      { k: 'eff', label: '燃油效率差距', bid: 'M1-b3', value: mval('CLASS_DEV', 1, '%'), num: true },
      { k: 'outlier', label: '異常日數', bid: 'M7-b1', value: id => { const o = outlierOf(id, STATE.mi); return { v: o ? o.n : null, text: o ? o.n + ' 日' : '—' }; }, num: true },
      { k: 'foul', label: '結垢徵兆', bid: 'M7-b4', value: mval('FOUL', 1, '%'), num: true },
      { k: 'remain', label: '剩餘天數', bid: 'M6-b0', value: id => { const s = U.SN.snap[id]; return { v: s && !s.stale ? s.remain : null, text: !s ? '—' : s.stale ? '資料過期' : fv(s.remain, 1, ' 日') }; }, num: true },
      { k: 'wait', label: '等待耗油占比', bid: 'M1-b2', value: mval('FUEL_WAIT_SHARE', 1, '%'), num: true },
      { k: 'mgo', label: '輕油占比', bid: 'M1-b4', value: mval('MGO_SHARE', 1, '%'), num: true },
      { k: 'cii', label: '碳強度評級', bid: 'M8-b1', value: id => ciiOf(id) },
      { k: 'alarm', label: '警報數', kind: 'vessel_alerts', params: {}, value: id => { const a = U.vesselAlerts ? U.vesselAlerts(id) : { n: 0 }; return { v: a.n, text: a.n + ' 件' }; }, num: true },
      { k: 'data', label: '資料更新', bid: 'M6-b0', unit: '' },
      { k: 'dq', label: '資料品質', bid: 'M10-b0', value: id => { const n = dqOf(id); return { v: n, text: n + ' 筆' }; }, num: true },
    ],
    container: [
      { k: 'otp', label: '準點率（近 6 個月）', bid: 'M4-c0', value: id => { const v = wmean('OTP', id, STATE.mi, 6); return { v, text: fv(v, 0, '%') }; }, num: true },
      { k: 'slot', label: '艙位利用率', kind: 'vessel_threshold', params: { metric: 'SLOT_UTIL', dir: 'below', mid: 68, high: 65, unit: '%', window: 6 }, value: id => { const v = wmean('SLOT_UTIL', id, STATE.mi, 6); return { v, text: fv(v, 0, '%') }; }, num: true },
      { k: 'cii', label: '碳強度評級', bid: 'M8-c1', value: id => ciiOf(id) },
      { k: 'eff', label: '燃油效率差距', bid: 'M1-c4', value: mval('CLASS_DEV', 1, '%'), num: true },
      { k: 'pwait', label: '等泊時長（近 6 個月）', kind: 'vessel_threshold', params: { metric: 'PORT_WAIT_HR', dir: 'above', mid: 6, high: 12, unit: ' 小時', window: 6 }, value: id => { const v = wmean('PORT_WAIT_HR', id, STATE.mi, 6); return { v, text: fv(v, 1, ' 小時') }; }, num: true },
      { k: 'speed', label: '速度比', bid: 'M7-c1', value: mval('SPEED_RATIO', 2, ''), num: true },
      { k: 'catchup', label: '趕船航段占比', bid: 'M7-c2', value: mval('CATCHUP_SHARE', 0, '%'), num: true },
      { k: 'outlier', label: '異常日數', bid: 'M7-c3', value: id => { const o = outlierOf(id, STATE.mi); return { v: o ? o.n : null, text: o ? o.n + ' 日' : '—' }; }, num: true },
      { k: 'remain', label: '剩餘天數', bid: 'M6-c0', value: id => { const s = U.SN.snap[id]; return { v: s && !s.stale ? s.remain : null, text: !s ? '—' : s.stale ? '資料過期' : fv(s.remain, 1, ' 日') }; }, num: true },
      { k: 'alarm', label: '警報數', kind: 'vessel_alerts', params: {}, value: id => { const a = U.vesselAlerts ? U.vesselAlerts(id) : { n: 0 }; return { v: a.n, text: a.n + ' 件' }; }, num: true },
      { k: 'data', label: '資料更新', bid: 'M6-c0', unit: '' },
      { k: 'dq', label: '資料品質', bid: 'M10-c0', value: id => { const n = dqOf(id); return { v: n, text: n + ' 筆' }; }, num: true },
    ],
  };
  function ciiOf(id) {
    const L = window.UI_COMP.cii.filter(x => x.vid === id && x.rating).sort((a, b) => b.year - a.year);
    return L.length ? { v: L[0].ratio, text: L[0].rating + ' 級' } : { v: null, text: '不評級' };
  }
  const dqOf = id => window.UI_DQ.agg.reduce((a, [, v, n]) => (v === id ? a + n : a), 0);
  // 資料更新、資料品質兩欄只給系統管理員看（清單最後兩欄）
  U.ADMIN_COLS = ['data', 'dq'];
  // 警報數（清單）：這艘船相關、還開著的事件＋進行中警報；U.vesselAlerts 在 ops_overview.js（沒有時只算警報）
  K.vessel_alerts = (p, c) => {
    const id = c.vids[0], a = U.vesselAlerts ? U.vesselAlerts(id) : { n: alarmOf(id), hi: 0, ev: [], al: [] };
    return { level: a.hi ? 'high' : a.n ? 'mid' : 'low', summary: a.n ? `開著的事件 ${a.ev ? a.ev.length : 0} 件、進行中警報 ${a.al ? a.al.length : a.n} 件` + (a.hi ? `，其中要處理 ${a.hi} 件` : '') : '沒有開著的警報事件', items: [] };
  };
  const alarmOf = id => window.UI_ALARM.events.filter(e => !e.end && e.vid === id).length;
  const vcache = {};
  function byVessel(id) {
    const key = [id, STATE.mi, STATE.type].join('|');
    if (vcache[key]) return vcache[key];
    const out = {};
    THEMES[VBY[id].type].forEach(t => {
      let r;
      if (t.k === 'data') {
        const s = U.SN.snap[id];
        r = !s ? nd('沒有庫存快照') : s.stale ? { level: 'mid', summary: '資料過期（超過 48 小時沒有船報）', items: [] } : { level: 'low', summary: '資料正常', items: [] };
        r.value = !s ? null : s.stale ? null : 0; r.text = !s ? '—' : s.stale ? '資料過期' : '正常';
      } else {
        r = t.bid ? evalWith(t.bid, [id]) : Object.assign({ items: [] }, K[t.kind](t.params, { vids: [id], mi: STATE.mi }));
        const v = t.value ? t.value(id) : { v: null, text: '' };
        r.value = v.v; r.text = v.text;
      }
      out[t.k] = Object.assign({ label: t.label, bid: t.bid || null }, r);
    });
    return (vcache[key] = out);
  }
  // 整體等級：2 欄以上「要處理」＝要處理；1 欄要處理或 2 欄以上留意＝留意；其餘正常
  function overall(o) {
    const L = Object.values(o).map(x => x.level), h = L.filter(x => x === 'high').length, m = L.filter(x => x === 'mid').length;
    return h >= 2 ? 'high' : h >= 1 || m >= 2 ? 'mid' : 'low';
  }
  const RANKL = { high: 3, mid: 2, low: 1, nodata: 0 };
  // 風險分數：要處理的欄位數 ×100 加留意欄位數（清單預設排序用）
  function score(id) { const o = byVessel(id); return Object.values(o).reduce((a, x) => a + (x.level === 'high' ? 100 : x.level === 'mid' ? 1 : 0), 0); }
  function clearCache() { Object.keys(vcache).forEach(k => delete vcache[k]); }
  U.bus.on(clearCache);
  window.UI.risk = { evaluate, evalWith, panel, detail, K, rows, byVessel, themes: THEMES, score, clearCache, outlierOf, overall };
})();
