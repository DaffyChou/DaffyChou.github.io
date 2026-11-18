/* M3 單船、M4 航次與航線 */
(function () {
  'use strict';
  const U = window.UI;
  const { COL, fmt, months, val, vname, esc, STATE } = U;
  const R = n => U.risk.rows(n);
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const vid0 = c => c.vids[0];
  const t2 = s => (s ? String(s).replace('T', ' ').slice(0, 16) : null);
  const mark = (c) => ({ symbol: 'none', silent: true, lineStyle: { color: COL().sub, type: 'dashed' }, label: { show: false }, data: [{ xAxis: months[c.mi] }] });

  // ============================================================ M3 單船
  U.reg('M3-b0', (el, c) => {
    const id = vid0(c), s = U.SN.snap[id] || {};
    U.kpis(el, [U.kpiFrom([id], 'FUEL_TOTAL', '總油耗', { agg: 'sum', unit: 't', good: null }), U.kpiFrom([id], 'EFF', '燃油效率', { d: 2, unit: '浬／噸', good: 'up' }),
      { k: '剩餘天數', v: s.stale ? null : (s.remain == null ? null : fmt(s.remain, 1) + ' 日'), d: s.stale ? '資料過期' : s.below ? '已低於最低存量' : '殘油庫存 ' + fmt(s.rob_res, 0) + ' t', cls: s.stale ? 'no' : s.below ? 'bad' : 'ok' },
      U.kpiFrom([id], 'AER', 'AER', { d: 2, good: 'down' })]);
  });
  U.reg('M3-c0', (el, c) => {
    const id = vid0(c);
    U.kpis(el, [U.kpiFrom([id], 'OTP', '準點率', { d: 1, unit: '%', good: 'up' }), U.kpiFrom([id], 'SLOT_UTIL', '艙位利用率', { d: 1, unit: '%', good: 'up' }),
      U.kpiFrom([id], 'SPEED_RATIO', '速度對設計航速比', { d: 2, good: null }), U.kpiFrom([id], 'CO2_TEUNM', 'TEU 浬碳強度', { d: 0, unit: 'g/(TEU·nm)', good: 'down' })]);
  });
  function effTrend(el, c) {
    const id = vid0(c), s = U.series('EFF', id);
    const ma = s.map((_, i) => { const w = s.slice(Math.max(0, i - 5), i + 1).filter(x => x != null); return w.length >= 3 ? U.mean(w) : null; });
    const best = s.map((_, i) => { const w = s.slice(Math.max(0, i - 5), i + 1).filter(x => x != null); return w.length ? Math.max(...w) : null; });
    U.lineChart(el, { yName: '浬／噸（每噸油跑幾浬）', series: [{ name: '月效率', data: s, markLine: mark(c) }, { name: '近 6 個月移動平均', data: ma, lineStyle: { type: 'dashed', width: 2 } }, { name: '近 6 個月最佳月份', data: best, lineStyle: { type: 'dotted', width: 1.5 } }] });
  }
  U.reg(['M3-b1', 'M3-c2'], effTrend);
  U.reg('M3-b2', (el, c) => { const id = vid0(c); U.stackChart(el, { yName: '噸', series: [['HSFO_T', 'HSFO'], ['VLSFO_T', 'VLSFO'], ['MGO_T', 'MGO（輕油）'], ['OTHER_T', '其他']].map(([m, n]) => ({ name: n, data: U.series(m, id) })) }); });
  U.reg('M3-b3', (el, c) => {
    const id = vid0(c), ys = [['FUEL_ME', '主機'], ['FUEL_AE', '發電機'], ['FUEL_BOILER', '鍋爐'], ['FUEL_OTHER', '未分項']], data = [];
    ys.forEach(([m], yi) => months.forEach((_, xi) => { const v = val(m, id, xi); if (v != null) data.push([xi, yi, Math.round(v)]); }));
    if (!data.length) return U.emptyChart(el, '此船沒有設備別油耗（GBMC 型船報不分設備）');
    U.heatChart(el, { x: months, y: ys.map(y => y[1]), data, empty: '資料不足' });
  });
  U.reg('M3-b4', (el, c) => {
    const id = vid0(c), d = U.dailyWin(id, c.mi, 6, 0);
    if (!d.length) return U.emptyChart(el, '近 6 個月沒有逐日資料');
    U.lineChart(el, { x: d.map(r => U.dayToDate(r[0]).slice(5)), yName: '日耗油（噸／日）', y2: '航速（節）', legend: true,
      series: [{ name: '日耗油', data: d.map(r => r[3]), axis: 0, areaStyle: { opacity: .06 } }, { name: '對地航速', data: d.map(r => r[6]), axis: 1, lineStyle: { width: 1.5 } }] });
  });
  U.reg('M3-b5', (el, c) => {
    const id = vid0(c), vy = R('voy').filter(r => r.vid === id && r.dist > 0).sort((a, b) => (a.s < b.s ? 1 : -1)).slice(0, 30);
    const calls = R('calls');
    U.table(el, { rows: vy.map(r => { const cs = calls.filter(x => x.vy === r.id).sort((a, b) => (a.nor < b.nor ? -1 : 1)); return { no: r.no, s: t2(r.s), e: t2(r.e), route: cs.map(x => U.ports(x.port)).join(' → ') || '—', dist: r.dist, fuel: r.fuel, eff: r.fuel > 0 ? r.dist / r.fuel : null, st: r.status }; }),
      cols: [{ k: 'no', t: '航次' }, { k: 's', t: '開始（UTC）' }, { k: 'e', t: '結束（UTC）' }, { k: 'route', t: '靠港' }, { k: 'dist', t: '航距 nm', n: true, d: 0 }, { k: 'fuel', t: '油耗 t', n: true, d: 1 }, { k: 'eff', t: '效率 浬／噸', n: true, d: 2 },
        { k: 'st', t: '狀態', h: r => r.st === 'TRUNCATED' ? tag('觀察期截斷', 'warn') : r.st === 'ONGOING' ? tag('進行中', 'ok') : tag('完整', 'ok') }], empty: '沒有航次紀錄' });
  });

  // --- 貨櫃
  const SVCPORTS = id => { const v = U.VBY[id]; const s = U.M.services.find(x => x.id === v.svc); return s ? s.ports.slice(0, -1) : []; };
  function rounds(id, n) {
    const calls = R('calls').filter(r => r.vid === id && r.peta), by = {};
    calls.forEach(r => (by[r.vy] = by[r.vy] || []).push(r));
    const vo = R('voy').filter(r => r.vid === id && by[r.id]).sort((a, b) => (a.s < b.s ? -1 : 1)).slice(-n);
    return vo.map(v => ({ v, calls: by[v.id].sort((a, b) => (a.nor < b.nor ? -1 : 1)) }));
  }
  U.reg('M3-c1', (el, c) => {
    const id = vid0(c), rs = rounds(id, 3), ports = SVCPORTS(id), col = COL();
    if (!rs.length) return U.emptyChart(el, '此船沒有計畫對實際的靠港資料');
    const mi = months[c.mi];
    const series = rs.map((r, k) => ({ name: '第 ' + r.v.rnd + ' 圈（' + (r.v.s || '').slice(0, 10) + '）', type: 'bar', barMaxWidth: 18,
      data: ports.map((p, i) => { const x = r.calls[i]; if (!x || x.dly == null) return null; return { value: +x.dly.toFixed(1), itemStyle: { color: x.dly >= 24 ? col.bad : x.dly >= 6 ? col.warn : col.ok, opacity: .45 + .25 * k } }; }) }));
    U.mkChart(el, { grid: { left: 52, right: 24, top: 40, bottom: 60 }, xAxis: { type: 'category', data: ports.map(U.ports), axisLabel: { interval: 0, rotate: 25 } }, yAxis: { type: 'value', name: '到港晚了幾小時（負數＝提早）' },
      legend: { top: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 } },
      series: series.map((s, i) => i === 0 ? Object.assign(s, { markLine: { symbol: 'none', silent: true, label: { color: col.sub, fontSize: 11 }, lineStyle: { type: 'dashed' }, data: [{ yAxis: 6, lineStyle: { color: col.warn }, label: { formatter: '容許 6 小時' } }, { yAxis: 24, lineStyle: { color: col.bad }, label: { formatter: '嚴重 24 小時' } }] } }) : s) });
  });
  U.reg('M3-c3', (el, c) => { const id = vid0(c); U.lineChart(el, { yName: '百分比（%）', series: [{ name: '艙位利用率', data: U.series('SLOT_UTIL', id), markLine: mark(c) }, { name: '空箱比例', data: U.series('EMPTY_SHARE', id) }, { name: '冷凍箱比例（占滿箱）', data: U.series('REEFER_SHARE', id) }] }); });
  U.reg('M3-c4', (el, c) => {
    const id = vid0(c), d = U.dailyWin(id, c.mi, 12, 0).filter(r => r[6] != null && r[3] != null), design = U.VBY[id].design, col = COL();
    U.scatterChart(el, { xName: '對地航速（節）', yName: '日耗油（噸／日）', empty: '沒有逐日資料', tip: p => `${p.data[2]}<br>航速 ${fmt(p.data[0], 1)} kn（${fmt(100 * p.data[0] / design, 0)}% 設計航速）<br>日耗油 ${fmt(p.data[1], 1)} t`,
      series: [{ name: '一般', data: d.filter(r => r[6] < 0.98 * design).map(r => [r[6], r[3], U.dayToDate(r[0])]), itemStyle: { color: col.pal[0], opacity: .5 } }, { name: '追趕（接近或超過設計航速）', data: d.filter(r => r[6] >= 0.98 * design).map(r => [r[6], r[3], U.dayToDate(r[0])]), itemStyle: { color: col.bad } }] });
  });
  U.reg('M3-c5', (el, c) => {
    const id = vid0(c), cs = R('calls').filter(r => r.vid === id).sort((a, b) => (a.nor < b.nor ? 1 : -1)).slice(0, 24);
    U.table(el, { rows: cs.map(r => { const wh = r.ws && r.we ? (Date.parse(r.we) - Date.parse(r.ws)) / 3600000 : null; return { port: U.ports(r.port), nor: t2(r.nor), peta: t2(r.peta), dly: r.dly, dwell: r.dep && r.nor ? (Date.parse(r.dep) - Date.parse(r.nor)) / 3600000 : null, mph: r.moves && r.gang && wh > 0 ? r.moves / (wh * r.gang) : null, teu: (r.tdis || 0) + (r.tload || 0) || null }; }),
      cols: [{ k: 'port', t: '港口' }, { k: 'peta', t: '計畫 ETA' }, { k: 'nor', t: '實際抵達' }, { k: 'dly', t: '延遲 小時', n: true, d: 1, h: r => r.dly == null ? '<span class="tag no">—</span>' : (r.dly >= 24 ? '<span class="tag bad">' + fmt(r.dly, 1) + '</span>' : r.dly >= 6 ? '<span class="tag warn">' + fmt(r.dly, 1) + '</span>' : fmt(r.dly, 1)) },
        { k: 'dwell', t: '在港總時 小時', n: true, d: 1 }, { k: 'mph', t: '橋吊 moves/hr', n: true, d: 1 }, { k: 'teu', t: '裝卸 TEU', n: true, d: 0 }] });
  });

  // ============================================================ M4 航次與航線
  U.reg('M4-b0', (el, c) => {
    const set = new Set(c.vids), lo = months[c.mi], calls = R('calls'), cbv = {};
    calls.forEach(r => (cbv[r.vy] = cbv[r.vy] || []).push(r));
    const vy = R('voy').filter(r => set.has(r.vid) && r.e && r.e.slice(0, 7) === lo && r.dist > 0).sort((a, b) => (a.e < b.e ? 1 : -1));
    U.table(el, { limit: 120, rows: vy.map(r => { const cs = (cbv[r.id] || []).sort((a, b) => (a.nor < b.nor ? -1 : 1)); const cyc = r.e && r.s ? (Date.parse(r.e) - Date.parse(r.s)) / 86400000 : null; return { v: vname(r.vid), no: r.no, route: cs.map(x => U.ports(x.port)).join(' → ') || '—', s: t2(r.s), cyc, dist: r.dist, fuel: r.fuel, eff: r.fuel > 0 ? r.dist / r.fuel : null, st: r.status }; }),
      cols: [{ k: 'v', t: '船名' }, { k: 'no', t: '航次（船名＋航次號為鍵）' }, { k: 'route', t: '靠港' }, { k: 's', t: '開始（UTC）' }, { k: 'cyc', t: '週期 日', n: true, d: 1 }, { k: 'dist', t: '航距 nm', n: true, d: 0 }, { k: 'fuel', t: '油耗 t', n: true, d: 1 }, { k: 'eff', t: '效率 浬／噸', n: true, d: 2 },
        { k: 'st', t: '狀態', h: r => r.st === 'TRUNCATED' ? tag('觀察期截斷', 'warn') : tag('完整', 'ok') }], empty: '所選月份沒有完成的航次' });
  });
  U.reg('M4-b1', (el, c) => {
    const id = vid0(c), led = R('ledger').filter(r => r.vid === id && r.vy).sort((a, b) => (a.t < b.t ? -1 : 1));
    el.classList.add('auto');
    const vys = [...new Set(led.map(r => r.vy))].reverse();
    if (!vys.length) return U.emptyChart(el, '時間軸只涵蓋近 60 天的船報；此船在此期間沒有航次報表');
    const vname_ = {}; R('voy').forEach(v => (vname_[v.id] = v.no));
    el.innerHTML = `<div class="toolbar"><label class="fld">航次<select id="vySel">${vys.map(v => `<option value="${v}">${esc(vname_[v] || v)}</option>`).join('')}</select></label><span class="note">近 60 天船報；點代表一份報告，顏色為營運狀態</span></div><div id="tl" style="height:15rem"></div>`;
    const draw = () => {
      const v = +el.querySelector('#vySel').value, rs = led.filter(r => r.vy === v), types = [...new Set(rs.map(r => r.ty))], col = COL();
      const cmap = { SEA: col.pal[0], ANCHOR_WAIT: col.warn, DRIFT_WAIT: col.pal[1], MANOEUVRE: col.pal[3], PORT_WORK: col.pal[2] };
      U.mkChart(el.querySelector('#tl'), { grid: { left: 90, right: 24, top: 24, bottom: 36 }, tooltip: { trigger: 'item', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 }, formatter: p => p.data[2] },
        xAxis: { type: 'time' }, yAxis: { type: 'category', data: types },
        series: [{ type: 'scatter', symbolSize: 11, data: rs.map(r => ({ value: [r.t, types.indexOf(r.ty), `${r.t.replace('T', ' ').slice(0, 16)}<br>${r.ty}　${r.st || ''}<br>油耗 ${fmt(r.fuel, 1)} t　距離 ${fmt(r.dist, 0)} nm${r.dq !== 'OK' ? '<br>資料狀態 ' + r.dq : ''}`], itemStyle: { color: r.dq !== 'OK' ? col.bad : (cmap[r.st] || col.no) } })) }] });
    };
    el.querySelector('#vySel').onchange = draw; draw();
  });
  U.reg('M4-b2', (el, c) => {
    const rows = c.vids.map(id => ({ id, name: vname(id).replace('SYN ', ''), s: val('TIME_SEA_SHARE', id, c.mi), w: val('TIME_WAIT_SHARE', id, c.mi), m: val('TIME_MANOEUVRE_SHARE', id, c.mi), p: val('TIME_PORT_SHARE', id, c.mi) })).filter(r => r.s != null);
    if (!rows.length) return U.emptyChart(el, '所選月份沒有時間資料');
    rows.sort((a, b) => b.w - a.w);
    U.stackChart(el, { x: rows.map(r => r.name), yName: '占總時間（%）', max: 100, series: [{ name: '海上航行', data: rows.map(r => r.s) }, { name: '等待（錨泊＋漂流）', data: rows.map(r => r.w) }, { name: '操船', data: rows.map(r => r.m) }, { name: '港內作業', data: rows.map(r => r.p) }] });
  });
  U.reg('M4-b3', (el, c) => {
    const d = c.vids.map(id => ({ id, v: val('FUEL_WAIT_SHARE', id, c.mi) })).filter(x => x.v != null).sort((a, b) => b.v - a.v).slice(0, 10);
    U.barChart(el, { rank: true, horizontal: true, data: d.map(x => ({ name: vname(x.id), value: +x.v.toFixed(1), color: x.v >= 8 ? COL().bad : x.v >= 4 ? COL().warn : COL().pal[0] })), yName: '占總油耗（%；前 10 名）', mark: 8, markLabel: '要處理 8%', empty: '所選月份沒有等待耗油資料' });
  });

  U.reg('M4-c0', (el, c) => {
    const id = vid0(c), rs = rounds(id, 12), ports = SVCPORTS(id), col = COL();
    if (!rs.length) return U.emptyChart(el, '此船沒有航線輪班資料');
    const OT = {}; (U.roundOtp ? U.roundOtp(id, 24) : []).forEach(r => (OT[r.v.id] = r));   // 右側欄：這一圈的準點率（每圈準點率 M4-c1 併進來）
    const otTxt = r => { const o = OT[r.v.id]; if (!o || o.val == null) return '{n|—}'; const k = o.val < 80 ? 'b' : o.val < 90 ? 'w' : 'g'; return `{${k}|${fmt(o.val, 0)}%}  {n|${o.ok}/${o.k} 港}`; };
    el.style.height = Math.max(16, rs.length * 1.9 + 6) + 'rem';           // 每圈一列，格內放得下數字
    const data = [];
    rs.forEach((r, yi) => ports.forEach((p, xi) => { const x = r.calls[xi]; if (x && x.dly != null) data.push({ value: [xi, yi, x.dly >= 24 ? 2 : x.dly >= 6 ? 1 : 0, x.dly], label: x }); }));
    U.mkChart(el, { grid: { left: 70, right: 124, top: 22, bottom: 92 },
      xAxis: { type: 'category', data: ports.map(U.ports), axisLabel: { interval: 0, rotate: 25 }, splitArea: { show: true } },
      yAxis: [{ type: 'category', data: rs.map(r => '第 ' + r.v.rnd + ' 圈') },
        { type: 'category', position: 'right', data: rs.map(otTxt), name: '本圈準點', nameLocation: 'end', nameGap: 6, nameTextStyle: { color: col.sub, fontSize: 11, align: 'left' }, axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { fontSize: 12, margin: 10, rich: { g: { color: col.ok, fontWeight: 700, fontSize: 13 }, w: { color: col.warn, fontWeight: 700, fontSize: 13 }, b: { color: col.bad, fontWeight: 700, fontSize: 13 }, n: { color: col.sub, fontSize: 12 } } } }],
      visualMap: { type: 'piecewise', dimension: 2, orient: 'horizontal', left: 'center', bottom: 0, pieces: [{ value: 0, label: '準點', color: col.ok }, { value: 1, label: '延誤（6 小時以上）', color: col.warn }, { value: 2, label: '嚴重延誤（24 小時以上）', color: col.bad }], textStyle: { color: col.sub, fontSize: 11 } },
      tooltip: { confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 }, formatter: p => `${U.ports(ports[p.data.value[0]])}<br>延遲 ${fmt(p.data.value[3], 1)} 小時<br>計畫 ${t2(p.data.label.peta)}<br>實際 ${t2(p.data.label.nor)}` },
      series: [{ type: 'heatmap', data, itemStyle: { borderColor: col.card, borderWidth: 2, borderRadius: 3 }, emphasis: { disabled: true },
        label: { show: true, fontSize: 11, color: '#fff', formatter: p => { const d = p.data.value[3]; return (d > 0 ? '+' : '') + (Math.abs(d) >= 10 ? Math.round(d) : d.toFixed(1)); } } }] });
  });
  U.reg('M4-c1', (el, c) => {
    const id = vid0(c), rs = U.roundOtp(id, 12);
    if (!rs.length) return U.emptyChart(el, '此船沒有航線輪班資料');
    const d = rs.map(r => ({ n: r.n, s: r.s, k: r.k, ok: r.ok, v: r.val }));
    const col = COL(), vs = d.filter(x => x.v != null), avg = U.roundOtpAvg(rs);
    U.mkChart(el, { grid: { left: 44, right: 70, top: 22, bottom: 40 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: p => { const x = d[p[0].dataIndex]; return `${x.n}（${x.s} 出發）<br>準點 ${x.ok} / ${x.k} 港${x.v == null ? '' : '（' + fmt(x.v, 0) + '%）'}`; } },
      xAxis: { type: 'category', data: d.map(x => x.n.replace('第 ', '').replace(' 圈', '') + '\n' + x.s), axisTick: { show: false }, axisLabel: { fontSize: 11, lineHeight: 14 } }, yAxis: { type: 'value', min: 0, max: 100, interval: 20, axisLabel: { formatter: '{value}%' } },
      series: [{ type: 'bar', barMaxWidth: 34, barMinHeight: 3, data: d.map(x => ({ value: x.v == null ? null : +x.v.toFixed(0), itemStyle: { color: x.v == null ? col.no : x.v < 80 ? col.bad : x.v < 90 ? col.warn : col.ok, borderRadius: [3, 3, 0, 0] } })),
        label: { show: true, position: 'top', fontSize: 11, color: col.sub, rich: {}, formatter: p => p.value + '%' },
        markLine: { symbol: 'none', silent: true, data: [{ yAxis: 90, lineStyle: { color: col.warn, type: 'dashed' }, label: { formatter: '90%', color: col.warn, fontSize: 11 } }, { yAxis: 80, lineStyle: { color: col.bad, type: 'dashed' }, label: { formatter: '80% 要處理', color: col.bad, fontSize: 11 } }].concat(avg == null ? [] : [{ yAxis: +avg.toFixed(0), lineStyle: { color: col.sub, type: 'solid', opacity: .6 }, label: { formatter: '平均 ' + fmt(avg, 0) + '%', color: col.sub, fontSize: 11, position: 'end' } }]) } }] });
  });
  U.reg('M4-c2', (el, c) => {
    const set = new Set(c.vids), lo = months[c.mi], cs = R('calls').filter(r => set.has(r.vid) && r.nor && r.nor.slice(0, 7) === lo && r.dly != null).sort((a, b) => b.dly - a.dly).slice(0, 40);
    U.table(el, { rows: cs.map(r => ({ v: vname(r.vid), port: U.ports(r.port), peta: t2(r.peta), nor: t2(r.nor), dly: r.dly, dwell: r.dep ? (Date.parse(r.dep) - Date.parse(r.nor)) / 3600000 : null, dep: r.dly2 })),
      cols: [{ k: 'v', t: '船名' }, { k: 'port', t: '港口' }, { k: 'peta', t: '計畫 ETA' }, { k: 'nor', t: '實際抵達' }, { k: 'dly', t: '抵港延遲 小時', n: true, d: 1, h: r => r.dly >= 24 ? '<span class="tag bad">' + fmt(r.dly, 1) + '</span>' : r.dly >= 6 ? '<span class="tag warn">' + fmt(r.dly, 1) + '</span>' : fmt(r.dly, 1) }, { k: 'dwell', t: '在港總時 小時', n: true, d: 1 }, { k: 'dep', t: '離港延遲 小時', n: true, d: 1 }], empty: '所選月份沒有靠港紀錄' });
  });
  U.reg('M4-c3', (el, c) => U.stackChart(el, { yName: '占總時間（%）', max: 100, series: [['TIME_SEA_SHARE', '海上航行'], ['TIME_WAIT_SHARE', '等待'], ['TIME_MANOEUVRE_SHARE', '操船'], ['TIME_PORT_SHARE', '港內作業']].map(([m, n]) => ({ name: n, data: U.fleetSeries(m, c.vids, 'mean') })) }));
})();
