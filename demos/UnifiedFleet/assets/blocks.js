/* 區塊註冊與共用元件（表格、KPI、折線、堆疊、箱形、散佈、熱圖） */
(function () {
  'use strict';
  const U = window.UI;
  const { esc, fmt, COL, mkChart, months, val, vname, VBY } = U;
  const REG = {};
  U.reg = (bid, fn) => { (Array.isArray(bid) ? bid : [bid]).forEach(b => (REG[b] = fn)); };
  U.getRenderer = bid => REG[bid];

  // ---------------- 表格（數字靠右、可排序）：用 DataTables 分頁與排序，每頁預設 10 筆，筆數不多時不顯示分頁列
  U.table = function (el, o) {
    el.classList.add('auto');
    if (!o.rows.length) { U.emptyChart(el, o.empty || '資料不足'); return; }
    const raw = (c, r) => { const v = r[c.k]; return v == null ? '' : typeof v === 'number' ? v : String(v); };
    el.innerHTML = `<table class="t"><thead><tr>${o.cols.map(c => `<th class="${c.n ? 'n' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${o.rows.map(r =>
      `<tr>${o.cols.map(c => { const v = r[c.k]; const s = c.h ? c.h(r) : c.n ? (v == null ? '<span class="tag no">—</span>' : fmt(v, c.d)) : esc(v == null ? '—' : v); return `<td class="${c.n ? 'n' : ''}" data-order="${esc(raw(c, r))}">${s}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
    const size = o.pageSize || 10, si = o.sort ? o.cols.findIndex(c => c.k === o.sort[0]) : -1;
    const $t = window.jQuery(el.querySelector('table'));
    const dt = $t.DataTable({
      paging: o.rows.length > size, pageLength: size, lengthChange: false, searching: o.rows.length > 20, info: o.rows.length > size, autoWidth: false,
      order: si >= 0 ? [[si, o.sort[1] > 0 ? 'asc' : 'desc']] : [],
      language: { search: '搜尋：', searchPlaceholder: '輸入關鍵字', info: '第 _START_ 到 _END_ 筆，共 _TOTAL_ 筆', infoEmpty: '沒有資料', infoFiltered: '（從 _MAX_ 筆篩選）', zeroRecords: '沒有符合的資料', paginate: { first: '«', previous: '上一頁', next: '下一頁', last: '»' } },
      pagingType: 'simple_numbers',
    });
    if (o.onRow) $t.on('click', 'tbody tr', function () { const r = o.rows[dt.row(this).index()]; if (r) o.onRow(r); });
  };

  U.kpis = function (el, list) {
    el.classList.add('auto');
    el.innerHTML = `<div class="kpis">${list.map(x => `<div class="kpi"><div class="k">${esc(x.k)}</div>${x.g ? '<button type="button" class="qm kq" aria-expanded="false" title="說明">?</button>' : ''}<div class="v">${x.v == null ? '—' : esc(x.v)}</div><div class="d ${x.cls || 'no'}">${esc(x.d == null ? '' : x.d)}</div>${x.g ? `<div class="kg">${esc(x.g)}</div>` : ''}</div>`).join('')}</div>`;
    el.querySelectorAll('.kq').forEach(b => (b.onclick = e => { e.stopPropagation(); const k = b.closest('.kpi'); const on = k.classList.toggle('open'); b.setAttribute('aria-expanded', on ? 'true' : 'false'); }));
  };
  // KPI：本月值與相對上月變化（good: 'up' 越高越好 / 'down' 越低越好）
  U.kpiFrom = function (vids, metric, label, o) {
    o = o || {};
    const a = U.fleetAt(metric, vids, U.STATE.mi, o.agg), b = U.fleetAt(metric, vids, U.STATE.mi - 1, o.agg);
    const m = U.RK.metrics[metric] || {};
    let d = '', cls = 'no';
    if (a != null && b != null && b !== 0) { const p = 100 * (a - b) / Math.abs(b); const good = (o.good || (m.dir === '越高越好' ? 'up' : m.dir === '越低越好' ? 'down' : null)); d = `${p >= 0 ? '▲' : '▼'} ${fmt(Math.abs(p), 1)}% 對上月`; if (good) cls = ((p >= 0) === (good === 'up')) || Math.abs(p) < 1 ? 'ok' : 'bad'; }
    else d = '上月無資料';
    const dirT = m.dir === '越高越好' ? '越高越好' : m.dir === '越低越好' ? '越低越好' : '';
    return { g: (m.gloss || '') + (dirT ? '（' + dirT + '）' : ''), k: label || m.name || metric, v: a == null ? null : fmt(a, o.d) + (o.unit ? ' ' + o.unit : (m.unit && m.unit.length < 8 ? ' ' + m.unit : '')), d, cls };
  };

  // ---------------- 圖表
  const X = () => months.map(m => m);
  // 船多時（8 艘以上）畫「中間 50% 的船」範圍帶（每月第 25 到第 75 百分位）；折線本身是平均值
  U.bandSeries = function (metric, vids) {
    if (vids.length < 8) return [];
    const lo = [], d = [];
    months.forEach((_, i) => {
      const a = vids.map(id => val(metric, id, i)).filter(x => x != null);
      if (a.length < 5) { lo.push(null); d.push(null); return; }
      const q1 = U.quant(a, .25), q3 = U.quant(a, .75); lo.push(q1); d.push(q3 - q1);
    });
    const c = COL().sub;
    return [{ name: '（範圍下緣）', noLegend: true, data: lo, stack: 'band' + metric, lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
      { name: '中間 50% 的船', data: d, stack: 'band' + metric, lineStyle: { opacity: 0 }, itemStyle: { color: c }, areaStyle: { color: c, opacity: .16 }, silent: true, tooltip: { show: false } }];
  };
  U.lineChart = function (el, o) {
    const col = COL();
    const ser = o.series.filter(s => U.nums(s.data).length);
    if (!ser.length) return U.emptyChart(el, o.empty || '資料不足（此範圍沒有可畫的資料）');
    mkChart(el, {
      xAxis: { type: 'category', data: o.x || X(), boundaryGap: false, axisLabel: { color: col.sub, hideOverlap: true } },
      yAxis: o.y2 ? [{ type: 'value', name: o.yName, scale: o.scale !== false }, { type: 'value', name: o.y2, scale: o.scale !== false, splitLine: { show: false } }] : { type: 'value', name: o.yName, scale: o.scale !== false },
      legend: { show: ser.length > 1 || o.legend, data: ser.filter(s => !s.noLegend).map(s => s.name) },
      series: ser.map((s, i) => Object.assign({ type: s.type || 'line', showSymbol: false, connectNulls: false, lineStyle: { width: 2 }, emphasis: { disabled: true } }, s, { yAxisIndex: s.axis || 0 })),
    }, o.onClick);
  };
  U.stackChart = function (el, o) {
    const col = COL();
    mkChart(el, {
      xAxis: { type: 'category', data: o.x || X(), axisLabel: { hideOverlap: true } }, yAxis: { type: 'value', name: o.yName, max: o.max },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 } },
      series: o.series.map(s => Object.assign({ type: 'bar', stack: 'a', emphasis: { disabled: true } }, s)),
    }, o.onClick);
  };
  // 排行圖（o.rank）：項目超過 10 個時預設只畫前 10 名，可切換顯示全部（資料需已由差到好排序）
  U.barChart = function (el, o) {
    if (o.rank && o.data.length > 10) {
      const id = 'rank:' + ((el.closest('.blk') || {}).id || ''), V = U.STATE.view, all = !!V[id];
      el.classList.add('auto'); el.style.maxHeight = 'none';
      el.innerHTML = `<div class="toolbar"><button class="btn" data-rk>${all ? '只看前 10 名' : '顯示全部 ' + o.data.length + ' 項'}</button><span class="note">${all ? '已顯示全部' : '目前只顯示最差的前 10 項（圖由差到好排序）'}</span></div><div data-rb style="height:${all && o.horizontal ? Math.max(18, o.data.length * 1.5) : 18}rem"></div>`;
      el.querySelector('[data-rk]').onclick = () => { V[id] = !all; U.bus.emit(); };
      return U.barChart(el.querySelector('[data-rb]'), Object.assign({}, o, { rank: false, data: all ? o.data : o.data.slice(0, 10) }));
    }
    const col = COL();
    if (!o.data.length) return U.emptyChart(el, o.empty);
    mkChart(el, {
      grid: { left: o.horizontal ? 120 : 52, right: 28, top: 30, bottom: o.horizontal ? 24 : 54 },
      [o.horizontal ? 'yAxis' : 'xAxis']: { type: 'category', data: o.data.map(d => d.name), axisLabel: { color: col.sub, interval: 0, rotate: o.horizontal ? 0 : 30, fontSize: 11 }, inverse: !!o.horizontal },
      [o.horizontal ? 'xAxis' : 'yAxis']: { type: 'value', name: o.yName },
      legend: { show: false }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 } },
      series: [{ type: 'bar', barMaxWidth: 28, data: o.data.map(d => ({ value: d.value, itemStyle: { color: d.color || col.pal[0] } })), emphasis: { disabled: true },
        markLine: o.mark != null ? { symbol: 'none', lineStyle: { color: col.bad, type: 'dashed' }, label: { color: col.bad, formatter: o.markLabel || '' }, data: [o.horizontal ? { xAxis: o.mark } : { yAxis: o.mark }] } : undefined }],
    }, o.onClick);
  };
  U.scatterChart = function (el, o) {
    const col = COL();
    if (!o.series.some(s => s.data.length)) return U.emptyChart(el, o.empty);
    mkChart(el, {
      xAxis: { type: 'value', name: o.xName, scale: true }, yAxis: { type: 'value', name: o.yName, scale: true },
      tooltip: { trigger: 'item', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 }, formatter: o.tip },
      series: o.series.map(s => Object.assign({ type: 'scatter', symbolSize: 7 }, s)),
    }, o.onClick);
  };
  U.boxChart = function (el, o) {
    const col = COL();
    if (!o.boxes.length) return U.emptyChart(el, o.empty || '合格日不足，無法畫箱形圖');
    mkChart(el, {
      grid: { left: 52, right: 20, top: 34, bottom: o.zoom ? 84 : 64 },
      xAxis: { type: 'category', data: o.boxes.map(b => b.name), axisLabel: { rotate: 40, fontSize: 11, interval: 0 } }, yAxis: { type: 'value', name: o.yName, scale: true },
      tooltip: { trigger: 'item', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 } },
      legend: { show: false },
      dataZoom: o.zoom ? [{ type: 'inside', xAxisIndex: 0, start: 0, end: 50 }, { type: 'slider', xAxisIndex: 0, height: 14, bottom: 4, start: 0, end: 50 }] : undefined,
      series: [{ type: 'boxplot', data: o.boxes.map(b => ({ value: b.v, itemStyle: { color: b.warn ? col.bad : col.pal[0], opacity: .25, borderColor: b.warn ? col.bad : col.pal[0] } })) },
        { type: 'scatter', symbolSize: 6, itemStyle: { color: col.bad }, data: o.outliers || [], tooltip: { formatter: p => p.data[2] || '' } }],
    }, o.onClick);
  };
  U.heatChart = function (el, o) {
    const col = COL();
    const vals = o.data.map(d => d[2]).filter(x => x != null);
    if (!vals.length) return U.emptyChart(el, o.empty);
    mkChart(el, {
      grid: { left: 80, right: 20, top: 20, bottom: 56 },
      xAxis: { type: 'category', data: o.x, splitArea: { show: true }, axisLabel: { hideOverlap: true } }, yAxis: { type: 'category', data: o.y },
      visualMap: { min: Math.min(...vals), max: Math.max(...vals), calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 80, textStyle: { color: col.sub, fontSize: 11 }, inRange: { color: [col.pal[0] + '33', col.pal[0]] } },
      tooltip: { position: 'top', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 } },
      series: [{ type: 'heatmap', data: o.data.filter(d => d[2] != null), emphasis: { disabled: true } }],
    });
  };

  U.dqTag = function (kind) { const m = { INSUFFICIENT: ['資料不足', 'no'], ANOMALY: ['資料異常', 'bad'], STALE: ['資料過期', 'warn'], ESTIMATED: ['估算', 'warn'], OK: ['正常', 'ok'] }[kind] || ['', 'no']; return `<span class="tag ${m[1]}">${m[0]}</span>`; };
  U.ports = k => (U.M.ports[k] ? U.M.ports[k].name : k);
  U.go = function (mod, vessel, bid) { U.STATE.mod = mod; if (vessel) U.STATE.vessel = vessel; U.STATE.scrollTo = bid || null; U.bus.emit(); };
  U.vsel = () => U.STATE.vessel;
})();
