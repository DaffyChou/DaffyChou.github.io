/* M7 效能診斷：同級距稽核、離群日、速度—油耗、風浪與滑失、結垢徵兆 */
(function () {
  'use strict';
  const U = window.UI;
  const { COL, fmt, months, val, vname, esc } = U;
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const vid0 = c => c.vids[0];

  // ---------------- 同級距稽核：箱形圖＋11 欄清單
  function audit(el, c) {
    el.classList.add('auto');
    el.style.maxHeight = 'none';                       // 清單要完整顯示，不截斷
    el.innerHTML = '<div id="cb" style="height:18rem"></div><div id="ct" style="margin-top:.6rem"></div>';
    U.classBox(el.querySelector('#cb'), c);
    const items = [];
    c.vids.forEach(id => { const bs = U.boxStats(U.dailyWin(id, c.mi, 6).map(r => r[1])); if (bs) items.push({ id, v: U.VBY[id], bs }); });
    // 同級距（含洗滌塔配置）中位數：至少 2 艘才給基準
    const grp = {};
    items.forEach(x => { const k = x.v.cls + '|' + x.v.scr; (grp[k] = grp[k] || []).push(x.bs.q2); });
    const rows = items.map(x => {
      const g = grp[x.v.cls + '|' + x.v.scr], base = g.length >= 2 ? U.median(g) : null, dev = base ? 100 * (x.bs.q2 - base) / base : null;
      const inn = U.dailyWin(x.id, c.mi, 6).map(r => r[1]).filter(e => e >= x.bs.v[0] && e <= x.bs.v[4]);
      const sd = Math.sqrt(U.mean(inn.map(e => (e - U.mean(inn)) ** 2)) * inn.length / Math.max(inn.length - 1, 1)), cv = 100 * sd / U.mean(inn);
      const age = 2026 - x.v.year;
      return { id: x.id, name: x.v.name, cls: x.v.cls + (x.v.scr ? '（洗滌塔）' : ''), dwt: x.v.dwt || x.v.teu, year: x.v.year, med: x.bs.q2, base, dev, iqr: x.bs.v[3] - x.bs.v[1], cv, n: x.bs.n,
        judge: dev == null ? '—' : dev >= 3 ? '級距領先' : dev > -3 ? '符合級距' : dev > -10 ? '略低於級距' : '效率落後，建議追查', age: age >= 12 ? '硬體異常' : age >= 8 ? '能效預警' : age >= 5 ? '狀態穩定' : '優良' };
    });
    const jt = r => r.dev == null ? '<span class="tag no">樣本不足</span>' : r.dev >= 3 ? tag(r.judge, 'ok') : r.dev > -3 ? tag(r.judge, 'no') : r.dev > -10 ? tag(r.judge, 'warn') : tag(r.judge, 'bad');
    U.table(el.querySelector('#ct'), { sort: ['dev', 1], onRow: r => U.go('M3', r.id), rows,
      cols: [{ k: 'name', t: '船舶' }, { k: 'cls', t: '工程級距' }, { k: 'dwt', t: '載重噸／TEU', n: true, d: 0 }, { k: 'year', t: '建造年', n: true, d: 0, h: r => r.year }, { k: 'med', t: '中位數 浬／噸', n: true, d: 2 },
        { k: 'base', t: '同級距中位數', n: true, d: 2 }, { k: 'dev', t: '偏離度 %', n: true, d: 1 }, { k: 'iqr', t: '變異度 IQR', n: true, d: 2 }, { k: 'cv', t: '變異係數 CV%', n: true, d: 1 }, { k: 'judge', t: '效率判定', h: jt }, { k: 'age', t: '船齡判定（獨立）' }], empty: '合格日不足' });
  }
  U.reg(['M7-b0', 'M7-c0'], audit);

  // ---------------- 離群日排查（所選船）
  U.reg(['M7-b1', 'M7-c3'], (el, c) => {
    const id = vid0(c), d = U.dailyWin(id, c.mi, 12), col = COL();
    const bs = U.boxStats(d.map(r => r[1]));
    if (!bs) return U.emptyChart(el, '此船合格日不足 10 天，不判定離群（規格）');
    const q1 = bs.v[1], q3 = bs.v[3], f = 1.5 * (q3 - q1), lo = q1 - f, hi = q3 + f;
    U.mkChart(el, { grid: { left: 52, right: 24, top: 34, bottom: 36 }, xAxis: { type: 'time' }, yAxis: { type: 'value', name: '浬／噸（日效率）', scale: true }, legend: { show: false },
      tooltip: { trigger: 'item', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 }, formatter: p => p.data[2] },
      series: [{ type: 'scatter', symbolSize: 6, data: d.map(r => { const o = r[1] < lo || r[1] > hi; return { value: [U.dayToDate(r[0]), r[1], `${U.dayToDate(r[0])}<br>效率 ${fmt(r[1], 2)} 浬／噸（距離 ${fmt(r[2], 0)} nm）<br>風級 ${fmt(r[4], 1)}　浪高 ${fmt(r[5], 1)} m　航速 ${fmt(r[6], 1)} kn${o ? '<br><b>離群日</b>' : ''}`], itemStyle: { color: o ? col.bad : col.pal[0], opacity: o ? 1 : .5 } }; }),
        markLine: { symbol: 'none', silent: true, label: { color: col.sub, fontSize: 11 }, lineStyle: { type: 'dashed' }, data: [{ yAxis: lo, label: { formatter: 'Q1−1.5×IQR' }, lineStyle: { color: col.bad } }, { yAxis: hi, label: { formatter: 'Q3+1.5×IQR' }, lineStyle: { color: col.bad } }, { yAxis: bs.q2, label: { formatter: '中位數' }, lineStyle: { color: col.sub } }] } }] });
  });

  // ---------------- 速度—油耗（散裝：所選船近期對較早期）
  U.reg('M7-b2', (el, c) => {
    const id = vid0(c), col = COL(), all = U.dailyWin(id, c.mi, 12, 100).filter(r => r[6] != null && r[3] != null);
    if (all.length < 10) return U.emptyChart(el, '合格日不足');
    const cut = months[Math.max(0, c.mi - 2)] + '-01', cd = Math.floor((Date.parse(cut) - Date.UTC(2024, 0, 1)) / 86400000);
    const old = all.filter(r => r[0] < cd), recent = all.filter(r => r[0] >= cd);
    U.scatterChart(el, { xName: '對地航速（節）', yName: '日耗油（噸／日）', tip: p => p.data[2],
      series: [{ name: '較早 9 個月', data: old.map(r => [r[6], r[3], U.dayToDate(r[0]) + ' ' + fmt(r[3], 1) + ' t']), itemStyle: { color: col.pal[0], opacity: .4 } }, { name: '最近 3 個月', data: recent.map(r => [r[6], r[3], U.dayToDate(r[0]) + ' ' + fmt(r[3], 1) + ' t']), itemStyle: { color: col.bad } }] });
  });

  // ---------------- 風浪與滑失率
  U.reg('M7-b3', (el, c) => {
    const pts = [], col = COL();
    c.vids.forEach(id => { for (let k = Math.max(0, c.mi - 11); k <= c.mi; k++) { const b = val('BFT', id, k), s = val('SLIP', id, k); if (b != null && s != null) pts.push([b, s, `${vname(id)} ${months[k]}<br>風級 ${fmt(b, 1)}　滑失率 ${fmt(s, 1)}%`]); } });
    U.scatterChart(el, { xName: '月平均風級（蒲福風級，數字越大風越強）', yName: '月平均打滑率（%；船員填報）', tip: p => p.data[2], empty: '沒有滑失率資料', series: [{ name: '船月', data: pts, itemStyle: { color: col.pal[0], opacity: .4 } }] });
  });

  // ---------------- 結垢徵兆
  U.reg(['M7-b4'], (el, c) => {
    const id = vid0(c), col = COL(), s = U.series('FOUL', id);
    const hull = (U.M.hull || []).filter(h => h.vid === id);
    const ml = hull.map(h => ({ xAxis: h.s.slice(0, 7), lineStyle: { color: h.type === 'DRYDOCK' ? col.pal[2] : col.pal[1], type: 'solid' }, label: { formatter: h.type === 'DRYDOCK' ? '進塢' : '洗船', color: col.sub, fontSize: 11 } }));
    U.lineChart(el, { yName: '和近 6 個月最佳月份的差距（%；負數＝變差）', series: [{ name: '結垢徵兆指數', data: s, markLine: { symbol: 'none', silent: true, data: ml.concat([{ yAxis: -3, lineStyle: { color: col.warn, type: 'dashed' }, label: { formatter: '關注 −3%', color: col.warn, fontSize: 11 } }, { yAxis: -8, lineStyle: { color: col.bad, type: 'dashed' }, label: { formatter: '要處理 −8%', color: col.bad, fontSize: 11 } }]) } }],
      empty: '資料不足' });
  });

  // ---------------- 貨櫃
  U.reg('M7-c1', (el, c) => U.lineChart(el, { yName: '實際航速占設計航速（1＝照設計）', y2: '噸／浬（每浬用油）', series: [{ name: '速度對設計航速比', data: U.fleetSeries('SPEED_RATIO', c.vids, 'mean'), markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed' }, label: { color: COL().sub, fontSize: 11 }, data: [{ yAxis: .85, label: { formatter: '降速上限 0.85' } }] } }, { name: '單位里程油耗', data: U.fleetSeries('FPN', c.vids, 'mean'), axis: 1 }] }));
  U.reg('M7-c2', (el, c) => {
    const d = c.vids.map(id => ({ id, v: val('CATCHUP_SHARE', id, c.mi) })).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    U.barChart(el, { rank: true, data: d.map(x => ({ name: vname(x.id).replace('SYN ', ''), value: +x.v.toFixed(0), color: x.v >= 50 ? COL().bad : x.v >= 30 ? COL().warn : COL().pal[0] })), yName: '趕船航段占比（%）', mark: 30, markLabel: '關注 30%', empty: '所選月份沒有資料' });
  });
  U.reg('M7-c4', (el, c) => {
    const pts = []; c.vids.forEach(id => { for (let k = Math.max(0, c.mi - 11); k <= c.mi; k++) { const b = val('BFT', id, k), d = val('ARR_DELAY', id, k); if (b != null && d != null) pts.push([b, d, `${vname(id)} ${months[k]}<br>風級 ${fmt(b, 1)}　平均延遲 ${fmt(d, 1)} 小時`]); } });
    U.scatterChart(el, { xName: '月平均風級（蒲福風級，數字越大風越強）', yName: '月平均晚到（小時）', tip: p => p.data[2], empty: '沒有資料', series: [{ name: '船月', data: pts, itemStyle: { color: COL().pal[0], opacity: .45 } }] });
  });
})();
