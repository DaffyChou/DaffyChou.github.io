/* M5 港口績效、M6 燃油與庫存 */
(function () {
  'use strict';
  const U = window.UI;
  const { COL, fmt, months, val, vname, esc, STATE } = U;
  const R = n => U.risk.rows(n);
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const t2 = s => (s ? String(s).replace('T', ' ').slice(0, 16) : null);
  const hrs = (a, b) => (a && b ? (Date.parse(b) - Date.parse(a)) / 3600000 : null);

  // ---------------- 港口彙總（近 6 個月，範圍內船舶）
  function portStats(c, container) {
    const lo = months[Math.max(0, c.mi - 5)] + '-01', hi = months[c.mi] + '-32', set = new Set(c.vids), by = {};
    R('calls').forEach(r => {
      if (!set.has(r.vid) || r.nor < lo || r.nor > hi || !['LOAD', 'DISCHARGE'].includes(r.role)) return;
      const k = r.port + '|' + (container ? '' : r.role), o = by[k] || (by[k] = { port: r.port, role: container ? '' : r.role, n: 0, nc: 0, wait: [], work: [], eff: [], dwell: [], mph: [], teu: [], apr: [], other: [] });
      const work = hrs(r.ws, r.we), dwell = hrs(r.nor, r.dep);
      o.n++;
      o.wait.push((r.aw || 0) + (r.dw || 0));
      if (work > 0.5) o.work.push(work);
      if (dwell != null) { o.dwell.push(dwell); o.apr.push(r.ap || 0); o.other.push(Math.max(dwell - (r.aw || 0) - (r.dw || 0) - (r.ap || 0) - (work || 0), 0)); }
      if (container) { if (r.moves > 0 && r.gang > 0 && work > 0.5) o.mph.push(r.moves / (work * r.gang)); o.teu.push((r.tdis || 0) + (r.tload || 0)); o.nc++; }
      else if (r.qty > 0 && r.cname === 'DRY BULK' && work > 0.5) { o.eff.push(r.qty / work); o.nc++; }
    });
    return Object.values(by);
  }
  const lowN = n => (n < 3 ? ' ' + tag('n=' + n + ' 僅供參考', 'warn') : '');
  const roleName = r => (r === 'LOAD' ? '裝貨' : r === 'DISCHARGE' ? '卸貨' : '停靠');

  // ============================================================ M5
  U.reg('M5-b0', (el, c) => {
    const ps = portStats(c, false).sort((a, b) => b.n - a.n);
    U.table(el, { rows: ps.map(p => ({ port: U.ports(p.port), role: roleName(p.role), n: p.n, nc: p.nc, wait: U.mean(p.wait), work: U.median(p.work), eff: p.nc >= 1 ? U.median(p.eff) : null, non: p.n - p.nc })),
      cols: [{ k: 'port', t: '港口' }, { k: 'role', t: '角色' }, { k: 'n', t: '靠港次數', n: true, d: 0, h: r => fmt(r.n, 0) + lowN(r.n) }, { k: 'wait', t: '平均等泊 小時', n: true, d: 1 }, { k: 'work', t: '作業時數中位數 小時', n: true, d: 1 },
        { k: 'eff', t: '裝卸效率 t/小時', n: true, d: 0 }, { k: 'non', t: '不進基準的筆數（無貨量或非貨運）', n: true, d: 0 }], empty: '近 6 個月沒有貨運靠港紀錄' });
  });
  U.reg('M5-b1', (el, c) => {
    const ps = portStats(c, false), all = [].concat(...ps.map(p => p.eff));
    if (all.length < 5) return U.emptyChart(el, '有貨量的貨運作業不足，無法建立裝卸效率基準（CSE 型船無貨量資料）');
    const base = U.median(all), d = ps.filter(p => p.eff.length >= 3).map(p => ({ name: U.ports(p.port) + (p.role === 'LOAD' ? '（裝）' : '（卸）'), v: U.median(p.eff), dev: 100 * (U.median(p.eff) - base) / base }));
    if (!d.length) return U.emptyChart(el, '各港樣本都少於 3 次，只供參考、不畫排名');
    d.sort((a, b) => a.dev - b.dev);
    U.barChart(el, { rank: true, horizontal: true, data: d.map(x => ({ name: x.name, value: +x.dev.toFixed(0), color: x.dev <= -40 ? COL().bad : x.dev <= -20 ? COL().warn : COL().pal[0] })), yName: '和全船隊中間值的差距（%；基準只含貨運作業）', mark: -20, markLabel: '關注 −20%' });
  });
  U.reg('M5-b2', (el, c) => {
    const d = c.vids.map(id => ({ id, v: val('FUEL_PORT_SHARE', id, c.mi) })).filter(x => x.v != null).sort((a, b) => b.v - a.v).slice(0, 12);
    U.barChart(el, { horizontal: true, data: d.map(x => ({ name: vname(x.id), value: +x.v.toFixed(1), color: x.v >= 12 ? COL().bad : x.v >= 8 ? COL().warn : COL().pal[0] })), yName: '港內作業占總油耗（%）', mark: 8, markLabel: '關注 8%', empty: '所選月份沒有資料' });
  });
  U.reg('M5-c0', (el, c) => {
    const ps = portStats(c, true).sort((a, b) => b.n - a.n);
    U.table(el, { rows: ps.map(p => ({ port: U.ports(p.port), n: p.n, dwell: U.median(p.dwell), wait: U.mean(p.wait), mph: U.median(p.mph), teu: U.mean(p.teu) })),
      cols: [{ k: 'port', t: '港口' }, { k: 'n', t: '靠港次數', n: true, d: 0, h: r => fmt(r.n, 0) + lowN(r.n) }, { k: 'dwell', t: '在港總時中位數 小時', n: true, d: 1 }, { k: 'wait', t: '平均等泊 小時', n: true, d: 1 },
        { k: 'mph', t: '橋吊 moves/(crane·hr)', n: true, d: 1 }, { k: 'teu', t: '平均裝卸 TEU', n: true, d: 0 }], empty: '近 6 個月沒有靠港紀錄' });
  });
  U.reg('M5-c1', (el, c) => {
    const d = portStats(c, true).filter(p => p.mph.length >= 3).map(p => ({ name: U.ports(p.port), v: U.median(p.mph) })).sort((a, b) => a.v - b.v);
    U.barChart(el, { rank: true, horizontal: true, data: d.map(x => ({ name: x.name, value: +x.v.toFixed(1), color: x.v < 20 ? COL().bad : x.v < 24 ? COL().warn : COL().pal[0] })), yName: '每台吊車每小時搬幾個箱（樣本少於 3 次的港口不排名）', mark: 24, markLabel: '關注 24', empty: '各港樣本不足' });
  });
  U.reg('M5-c2', (el, c) => {
    const ps = portStats(c, true).filter(p => p.n >= 3).sort((a, b) => U.mean(b.dwell) - U.mean(a.dwell));
    if (!ps.length) return U.emptyChart(el, '各港樣本不足');
    // 上：在港時間分解（等泊、操船、作業、其他）；下：同一組港口的作業周轉（預計對實際完工）— eta-ata-turnaround
    const T = U.turnStats ? Object.fromEntries(U.turnStats(c.vids, c.mi).map(t => [t.port, t])) : {};
    const hasT = ps.some(p => T[p.port]);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = '<div data-s style="height:16rem"></div>' + (hasT ? '<div class="bt" style="margin-top:.6rem">作業周轉：預計完工 對 實際完工（同一組港口，近 6 個月） <button type="button" class="qm pq" aria-expanded="false" title="說明">?</button></div><div class="pqx note" hidden>有框的數字＝超過門檻：<span class="tag warn">黃框</span> 留意、<span class="tag bad">紅框</span> 要處理。門檻：完工比預計晚 1 小時留意、3 小時要處理；周轉比（實際作業÷預計作業）1.05 留意、1.15 要處理。沒有框＝正常。判斷用畫面上顯示的數字。</div><div data-t></div>' : '');
    U.stackChart(el.querySelector('[data-s]'), { x: ps.map(p => U.ports(p.port)), yName: '平均小時', series: [{ name: '等泊', data: ps.map(p => U.mean(p.wait)) }, { name: '操船', data: ps.map(p => U.mean(p.apr)) }, { name: '作業', data: ps.map(p => U.mean(p.work)) }, { name: '其他', data: ps.map(p => U.mean(p.other)) }] });
    { const q = el.querySelector('.pq'); if (q) q.onclick = () => { const x = el.querySelector('.pqx'), o = q.getAttribute('aria-expanded') !== 'true'; q.setAttribute('aria-expanded', o); x.hidden = !o; }; }
    if (hasT) U.table(el.querySelector('[data-t]'), { rows: ps.filter(p => T[p.port]).map(p => Object.assign({ name: U.ports(p.port), wait: U.mean(p.wait) }, T[p.port])), sort: ['ratio', -1], pageSize: 8,
      cols: [{ k: 'name', t: '港口', h: r => esc(r.name) + (r.thin ? ' ' + tag('樣本少', 'warn') : '') }, { k: 'n', t: '次數', n: true, d: 0 }, { k: 'wait', t: '平均等泊（小時）', n: true, d: 1 },
        { k: 'plan', t: '預計作業（小時）', n: true, d: 1 }, { k: 'act', t: '實際作業（小時）', n: true, d: 1 },
        { k: 'over', t: '完工比預計晚（小時）', n: true, h: r => { const v = +r.over.toFixed(1), t = (v > 0 ? '+' : '') + fmt(v, 1); return v >= 3 ? tag(t, 'bad') : v >= 1 ? tag(t, 'warn') : t; } },   // 用畫面上顯示的數字判斷，避免四捨五入後看起來一樣卻一個有框一個沒有
        { k: 'ratio', t: '周轉比（實際÷預計）', n: true, h: r => { const v = +r.ratio.toFixed(2); return v >= 1.15 ? tag(fmt(v, 2), 'bad') : v >= 1.05 ? tag(fmt(v, 2), 'warn') : fmt(v, 2); } },
        { k: 'onTime', t: '準時完工率', n: true, h: r => fmt(r.onTime, 0) + '%' }] });
  });
  U.reg('M5-c3', (el, c) => U.lineChart(el, { yName: '小時', series: [{ name: '平均等泊時數', data: U.fleetSeries('PORT_WAIT_HR', c.vids, 'mean'), markLine: { symbol: 'none', silent: true, lineStyle: { color: COL().sub, type: 'dashed' }, label: { show: false }, data: [{ xAxis: months[c.mi] }] } }] }));

  // ============================================================ M6
  function remainRows(c) {
    return c.vids.map(id => {
      const v = U.VBY[id], s = U.SN.snap[id] || {};
      const st = s.stale ? '資料過期' : s.rob_res == null ? '資料不足' : s.below ? '已低於最低存量' : s.remain == null ? '資料不足' : s.rate === 0 ? '無耗用' : '正常';
      return { id, name: v.name, rob: s.rob_res, mgo: s.rob_mgo, floor: v.floor_res, rate: s.rate, remain: s.stale ? null : s.remain, st, last: t2(s.last), v };
    });
  }
  const stCell = r => ({ '資料過期': tag('資料過期', 'warn'), '資料不足': tag('資料不足', 'no'), '已低於最低存量': tag('已低於最低存量', 'bad'), '無耗用': tag('無耗用', 'no'), '正常': tag('正常', 'ok') }[r.st]);
  function remainTable(el, c) {
    const lim = STATE.type === 'container' ? 3 : 7;
    U.table(el, { sort: ['remain', 1], onRow: r => U.go('M3', r.id), rows: remainRows(c),
      cols: [{ k: 'name', t: '船名' }, { k: 'rob', t: '殘油庫存 t', n: true, d: 0 }, { k: 'mgo', t: '輕油庫存 t', n: true, d: 0 }, { k: 'floor', t: '最低存量底線 t', n: true, d: 0 }, { k: 'rate', t: '日耗（近 30 天）t', n: true, d: 1 },
        { k: 'remain', t: '剩餘天數', n: true, d: 1, h: r => r.remain == null ? '<span class="tag no">—</span>' : (r.remain < lim ? '<b>' + fmt(r.remain, 1) + '</b>' : fmt(r.remain, 1)) }, { k: 'st', t: '狀態', h: stCell }, { k: 'last', t: '庫存取自報表（UTC）' }] });
  }
  U.reg(['M6-b0', 'M6-c0'], remainTable);

  U.reg('M6-b1', (el, c) => {
    const set = new Set(c.vids), ev = R('bunker').filter(r => set.has(r.vid) && r.ra != null && r.qty > 0 && r.g !== 'MGO');
    if (ev.length < 5) return U.emptyChart(el, '加油事件不足');
    const mx = U.median(ev.map(r => r.ra)), my = U.median(ev.map(r => r.qty)), col = COL();
    U.scatterChart(el, { xName: '抵港時庫存（噸）', yName: '加油量（噸）', tip: p => p.data[2],
      series: [{ name: '加油事件', data: ev.map(r => [r.ra, r.qty, `${vname(r.vid)}<br>${r.t.slice(0, 10)} ${U.ports(r.port)}<br>抵港庫存 ${fmt(r.ra, 0)} t　加油 ${fmt(r.qty, 0)} t`]), itemStyle: { color: col.pal[0], opacity: .45 },
        markLine: { symbol: 'none', silent: true, lineStyle: { color: col.sub, type: 'dashed' }, label: { color: col.sub, fontSize: 11 }, data: [{ xAxis: mx, label: { formatter: '庫存中位數' } }, { yAxis: my, label: { formatter: '加油量中位數' } }] } }] });
  });
  U.reg('M6-b2', (el, c) => { const d = U.portAgg(c, 12); U.barChart(el, { horizontal: true, data: d.map(x => ({ name: U.ports(x.port), value: Math.round(x.q) })), yName: '加油量（噸；近 6 個月）', empty: '近 6 個月沒有加油紀錄' }); });
  U.reg('M6-b3', (el, c) => {
    const set = new Set(c.vids);
    U.table(el, { limit: 60, rows: R('bunker').filter(r => set.has(r.vid)).sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 60).map(r => ({ v: vname(r.vid), t: t2(r.t), port: U.ports(r.port), g: r.g, qty: r.qty, ra: r.ra, rd: r.rd, ok: r.ra != null && Math.abs(r.rd - (r.ra + r.qty)) <= 2 })),
      cols: [{ k: 'v', t: '船名' }, { k: 't', t: '時間（UTC）' }, { k: 'port', t: '港口' }, { k: 'g', t: '油品' }, { k: 'qty', t: '加油量 t', n: true, d: 1 }, { k: 'ra', t: '抵港庫存 t', n: true, d: 0 }, { k: 'rd', t: '離港庫存 t', n: true, d: 0 },
        { k: 'ok', t: '庫存守恆', h: r => (r.ok ? tag('符合', 'ok') : tag('不符（±2 t）', 'bad')) }] });
  });

  U.reg('M6-c1', (el, c) => {
    const set = new Set(c.vids), lo = months[Math.max(0, c.mi - 11)] + '-01', by = {};
    R('bunker').forEach(r => { if (set.has(r.vid) && r.t >= lo && r.price != null) { const o = by[r.port] || (by[r.port] = { w: 0, q: 0 }); o.w += r.price * r.qty; o.q += r.qty; } });
    const d = Object.entries(by).map(([k, o]) => ({ k, v: o.w / o.q })).sort((a, b) => a.v - b.v);
    if (!d.length) return U.emptyChart(el, '沒有油價資料（真實客戶系統目前不提供油價與供油商）');
    const col = COL();
    U.barChart(el, { data: d.map(x => ({ name: U.ports(x.k) + (U.M.ports[x.k] && U.M.ports[x.k].eca ? '（管制區）' : ''), value: Math.round(x.v), color: U.M.ports[x.k] && U.M.ports[x.k].eca ? col.pal[1] : col.pal[0] })), yName: '加權平均油價（美元／噸；近 12 個月；示意水位）' });
  });
  U.reg('M6-c2', (el, c) => {
    const set = new Set(c.vids), ev = R('bunker').filter(r => set.has(r.vid) && r.bdn > 0 && r.snd != null), col = COL();
    if (!ev.length) return U.emptyChart(el, '沒有 BDN 與測深資料（真實兩邊皆缺，畫面維持資料不足）');
    U.mkChart(el, { grid: { left: 56, right: 24, top: 34, bottom: 36 }, xAxis: { type: 'time' }, yAxis: { type: 'value', name: '實測量與供油單差距（%；0＝一致）', scale: true }, legend: { show: false },
      tooltip: { trigger: 'item', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 }, formatter: p => p.data[2] },
      series: [{ type: 'scatter', symbolSize: 7, data: ev.map(r => { const d = 100 * (r.snd - r.bdn) / r.bdn; return { value: [r.t, d, `${vname(r.vid)}<br>${r.t.slice(0, 10)} ${U.ports(r.port)}<br>BDN ${fmt(r.bdn, 1)} t／測深 ${fmt(r.snd, 1)} t（${fmt(d, 2)}%）`], itemStyle: { color: Math.abs(d) >= 1 ? col.bad : Math.abs(d) >= .5 ? col.warn : col.pal[0] } }; }),
        markLine: { symbol: 'none', silent: true, label: { color: col.sub, fontSize: 11 }, lineStyle: { type: 'dashed' }, data: [{ yAxis: .5, lineStyle: { color: col.warn } }, { yAxis: -.5, lineStyle: { color: col.warn } }, { yAxis: 1, lineStyle: { color: col.bad } }, { yAxis: -1, lineStyle: { color: col.bad } }] } }] });
  });
  U.reg('M6-c3', (el, c) => {
    const bunkerPorts = new Set(R('bunker').map(r => r.port)), prices = {};
    R('bunker').forEach(r => { if (r.price != null && r.t >= months[Math.max(0, c.mi - 5)] + '-01') { const o = prices[r.port] || (prices[r.port] = { w: 0, q: 0 }); o.w += r.price * r.qty; o.q += r.qty; } });
    const rows = remainRows(c).map(r => {
      const v = r.v, svc = U.M.services.find(x => x.id === v.svc), ports = svc ? svc.ports.slice(0, -1) : [];
      const lastCall = R('calls').filter(k => k.vid === r.id).sort((a, b) => (a.nor < b.nor ? 1 : -1))[0];
      let next = null; if (lastCall && ports.length) { const i = ports.indexOf(lastCall.port); for (let k = 1; k <= ports.length; k++) { const p = ports[(i + k) % ports.length]; if (bunkerPorts.has(p)) { next = p; break; } } }
      return { name: r.name, remain: r.remain, st: r.st, next: next ? U.ports(next) : '—', price: next && prices[next] ? prices[next].w / prices[next].q : null, id: r.id };
    });
    U.table(el, { sort: ['remain', 1], onRow: r => U.go('M3', r.id), rows, cols: [{ k: 'name', t: '船名' }, { k: 'remain', t: '剩餘天數', n: true, d: 1 }, { k: 'st', t: '狀態', h: stCell }, { k: 'next', t: '預估下一個可加油港（依輪班港序）' }, { k: 'price', t: '近 6 個月該港加權油價 USD/t', n: true, d: 0 }] });
  });
})();
