/* 共用：狀態、資料存取、格式、圖表輔助。所有資料為模擬資料（假資料）。 */
(function () {
  'use strict';
  const M = window.UI_META, VM = window.UI_VM, SN = window.UI_SNAP, RK = window.UI_RISK;
  const months = M.months;
  const LAST = months.length - 1;
  const VBY = {};
  M.vessels.forEach(v => { v.type = String(v.type).toLowerCase(); VBY[v.id] = v; });   // 資料為大寫 BULK／CONTAINER，畫面一律小寫

  const STATE = { org: 'all', type: 'container', mi: LAST, vessel: null, mod: 'M1', theme: 'dark', view: {}, cls: '' };   // 預設：貨櫃輪、夜間模式（使用者 2026-11-13 指定）
  const listeners = [];
  const bus = { on(f) { listeners.push(f); }, emit() { listeners.forEach(f => f()); } };

  // ---------------- 衍生指標
  function raw(metric, vid, mi) {
    const a = VM.m[metric] && VM.m[metric][vid];
    return a ? a[mi] : null;
  }
  function derived(metric, vid, mi) {
    if (metric === 'MGO_SHARE') {
      const t = raw('FUEL_TOTAL', vid, mi), g = raw('MGO_T', vid, mi);
      return t > 0 && g != null ? (100 * g) / t : null;
    }
    if (metric === 'FOUL') {
      const e = raw('EFF', vid, mi);
      if (e == null) return null;
      let best = null;
      for (let k = Math.max(0, mi - 5); k <= mi; k++) { const x = raw('EFF', vid, k); if (x != null && (best == null || x > best)) best = x; }
      return best ? (100 * (e / best - 1)) : null;
    }
    if (metric === 'AE_SHARE') {
      const me = raw('FUEL_ME', vid, mi) || 0, ae = raw('FUEL_AE', vid, mi) || 0, bo = raw('FUEL_BOILER', vid, mi) || 0, ot = raw('FUEL_OTHER', vid, mi) || 0;
      const t = me + ae + bo + ot;
      return t > 0 ? (100 * ae) / t : null;
    }
    return undefined;
  }
  function val(metric, vid, mi) {
    const d = derived(metric, vid, mi);
    return d !== undefined ? d : raw(metric, vid, mi);
  }
  function series(metric, vid) { return months.map((_, i) => val(metric, vid, i)); }
  function nums(a) { return a.filter(x => x != null && x === x); }
  function mean(a) { a = nums(a); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
  function sum(a) { a = nums(a); return a.length ? a.reduce((s, x) => s + x, 0) : null; }
  function median(a) { a = nums(a).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function quant(a, p) { a = nums(a).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); }
  function agg(how, a) { return how === 'sum' ? sum(a) : how === 'median' ? median(a) : mean(a); }
  function fleetAt(metric, vids, mi, how) {
    if (how === 'wmean') {                                   // 碳排強度的加權平均：CO₂ 合計 ÷ 運輸量合計（運輸量＝CO₂ ÷ 強度），與環保數據頁一致
      let c = 0, d = 0;
      vids.forEach(v => { const co = raw('CO2', v, mi), k = val(metric, v, mi); if (co > 0 && k > 0) { c += co; d += co / k; } });
      return d > 0 ? c / d : null;
    }
    return agg(how || 'mean', vids.map(v => val(metric, v, mi)));
  }
  function fleetSeries(metric, vids, how) { return months.map((_, i) => fleetAt(metric, vids, i, how)); }

  // ---------------- 範圍
  function scopeVessels(opts) {
    opts = opts || {};
    return M.vessels.filter(v => v.status !== 'TEST' && (STATE.org === 'all' || v.org === +STATE.org) &&
      (opts.anyType || v.type === STATE.type) && (opts.withSold || v.status === 'ACTIVE'));
  }
  function typesInOrg() {
    const s = new Set(M.vessels.filter(v => v.status !== 'TEST' && (STATE.org === 'all' || v.org === +STATE.org)).map(v => v.type));
    return [...s];
  }
  function ensureValid() {
    if (STATE.cls && !classesInScope().includes(STATE.cls)) STATE.cls = '';
    const t = typesInOrg();
    if (!t.includes(STATE.type)) STATE.type = t[0] || 'bulk';
    const vs = scopeVessels();
    if (!STATE.vessel || !VBY[STATE.vessel] || VBY[STATE.vessel].type !== STATE.type || (STATE.org !== 'all' && VBY[STATE.vessel].org !== +STATE.org) || VBY[STATE.vessel].status !== 'ACTIVE')
      STATE.vessel = STATE.vesselAuto = vs.length ? vs[0].id : null;   // vesselAuto：系統預設選的船（使用者還沒自己選）；環保法遵頁會改選有歐盟航段的船
  }
  const SINGLE = new Set(['M3-b0', 'M3-b1', 'M3-b2', 'M3-b3', 'M3-b4', 'M3-b5', 'M3-c0', 'M3-c1', 'M3-c2', 'M3-c3', 'M3-c4', 'M3-c5',
    'M4-b1', 'M4-c0', 'M4-c1', 'M7-b1', 'M7-b2', 'M7-b4', 'M7-c3']);
  function vesselsFor(bid) {
    if (SINGLE.has(bid)) return STATE.vessel ? [STATE.vessel] : [];
    let all = scopeVessels();
    const OF = (window.UI || {}).opsFilt; if (OF && OF.blocks && OF.blocks.has(bid) && OF.active()) { const s = new Set(OF.vids()); all = all.filter(v => s.has(v.id)); }   // 運務管理頁首的航線／整區篩選
    return (CLASSBLK.has(bid) && STATE.cls ? all.filter(v => v.cls === STATE.cls) : all).map(v => v.id);
  }
  const CLASSBLK = new Set(['M1-b3', 'M1-c4', 'M7-b0', 'M7-c0']);
  const classesInScope = () => [...new Set(scopeVessels().map(v => v.cls).filter(Boolean))].sort();

  // ---------------- 格式
  function fmt(x, d) {
    if (x == null || x !== x) return '—';
    d = d == null ? (Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2) : d;
    return Number(x).toLocaleString('zh-Hant', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  const vname = id => (VBY[id] ? VBY[id].name : '—');
  function dayToDate(d) { const t = new Date(Date.UTC(2024, 0, 1) + d * 86400000); return t.toISOString().slice(0, 10); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------------- 顏色 token（日夜模式）
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function COL() {
    return { ink: css('--ink'), sub: css('--sub'), line: css('--line'), card: css('--card'), acc: css('--acc'), acc2: css('--acc2'), acc3: css('--acc3'),
      ok: css('--ok'), warn: css('--warn'), bad: css('--bad'), no: css('--no'), pal: [css('--c1'), css('--c2'), css('--c3'), css('--c4'), css('--c5'), css('--c6')] };
  }
  const LV = { high: { t: '要處理', k: 'bad' }, mid: { t: '留意', k: 'warn' }, low: { t: '正常', k: 'ok' }, nodata: { t: '資料不足', k: 'no' } };

  // ---------------- 圖表
  const charts = [];
  function mkChart(el, opt, onClick) {
    el.innerHTML = '';
    const c = echarts.init(el, null, { renderer: 'canvas' });
    const col = COL();
    const base = {
      textStyle: { color: col.sub, fontFamily: 'inherit', fontSize: 12 }, color: col.pal, animation: false,
      grid: { left: 52, right: 24, top: 34, bottom: 34, containLabel: false },
      tooltip: { trigger: 'axis', confine: true, backgroundColor: col.card, borderColor: col.line, className: 'uftip', textStyle: { color: col.ink, fontSize: 13 } },
      legend: { top: 0, textStyle: { color: col.sub, fontSize: 12 }, itemWidth: 14, itemHeight: 8, type: 'scroll' },
    };
    const o = Object.assign({}, base, opt);
    ['legend', 'tooltip'].forEach(k => { if (opt[k]) o[k] = Object.assign({}, base[k], opt[k], k === 'legend' ? { textStyle: Object.assign({}, base.legend.textStyle, opt[k].textStyle) } : { className: 'uftip', textStyle: Object.assign({}, base.tooltip.textStyle, opt[k].textStyle, { fontSize: 13 }) }); });   // 所有提示框同一字級 13px（標題不放大、備註不縮小）
    ['xAxis', 'yAxis'].forEach(k => {
      const fix = a => Object.assign({ axisLine: { lineStyle: { color: col.line } }, axisLabel: { color: col.sub, fontSize: 11 }, splitLine: { lineStyle: { color: col.line, opacity: .5 } }, nameTextStyle: Object.assign({ color: col.sub, fontSize: 11 }, k === 'yAxis' && a.type === 'value' ? { align: 'left' } : {}) }, a);
      if (o[k]) o[k] = Array.isArray(o[k]) ? o[k].map(fix) : fix(o[k]);
    });
    c.setOption(o);
    if (onClick) c.on('click', onClick);
    charts.push(c);
    return c;
  }
  function disposeCharts() { charts.splice(0).forEach(c => { try { c.dispose(); } catch (e) { } }); }
  window.addEventListener('resize', () => charts.forEach(c => { try { c.resize(); } catch (e) { } }));
  function emptyChart(el, msg) { el.innerHTML = `<div class="empty">${esc(msg || '資料不足')}</div>`; }

  window.UI = { M, VM, SN, RK, STATE, bus, months, LAST, VBY, val, raw, series, nums, mean, sum, median, quant, agg, fleetAt, fleetSeries,
    scopeVessels, classesInScope, CLASSBLK, typesInOrg, ensureValid, vesselsFor, SINGLE, fmt, vname, dayToDate, esc, css, COL, LV, mkChart, disposeCharts, emptyChart };
})();
