/* M12 散裝版：散裝貨量趨勢（裝貨與卸貨）、各港裝卸量排行 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo;
  const { COL, fmt, months } = U;
  const pn = u => (U.ports ? U.ports(u) : u);

  U.reg('M12-b0', el => {
    const B = CG.bulk(), col = COL();
    if (!B.month.length) return U.emptyChart(el, '所選組織沒有散裝貨量資料');
    const sum = d => months.map((_, i) => { const v = B.month.filter(r => r[0] === i && r[1] === d); return v.length ? Math.round(v.reduce((a, r) => a + r[2], 0) / 1000) : null; });
    const miss = months.map((_, i) => B.missing.filter(r => r[0] === i).reduce((a, r) => a + r[1], 0));
    U.stackChart(el, {
      yName: '裝卸貨量（千噸）',
      series: [{ name: '卸貨', data: sum('D'), itemStyle: { color: col.pal[0] } }, { name: '裝貨', data: sum('L'), itemStyle: { color: col.pal[2] } }],
      onClick: null,
    });
    el.title = '沒填數量的紀錄未計入：' + miss.filter(x => x).length + ' 個月有缺值';
  });

  U.reg('M12-b1', el => {
    const tot = {}; CG.bulk().port.forEach(([u, d, v]) => (tot[u] = (tot[u] || 0) + v));
    const L = Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 10), S = Object.values(tot).reduce((a, b) => a + b, 0), col = COL();
    if (!L.length) return U.emptyChart(el, '近 12 個月沒有散裝貨量資料');
    U.barChart(el, { horizontal: true, yName: '近 12 個月裝卸貨量（千噸）', data: L.map(([u, v]) => ({ name: pn(u) + '（' + fmt(100 * v / S, 0) + '%）', value: Math.round(v / 1000), color: v / S >= 0.7 ? col.bad : v / S >= 0.5 ? col.warn : col.pal[0] })) });
  });
})();
