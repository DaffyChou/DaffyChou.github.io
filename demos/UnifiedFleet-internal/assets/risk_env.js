/* 環保法遵數據頁新增區塊（env-esg-kpi）的風險評估器。彙總全部走 env_kpi.js（U.envAgg）；門檻由 data/risk.js 規格提供。
   判讀固定用預設年度（最新的完整年度），與畫面選的年度無關。 */
(function () {
  'use strict';
  const U = window.UI, A = U && U.envAgg, K = U && U.risk && U.risk.K;
  if (!A || !K) return;
  const { fmt } = U;
  const sp = (x, d) => (x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x), d == null ? 1 : d) + '%');

  // KPI 列：落後減碳軌跡超過門檻要處理；落後軌跡或加權強度變差為留意
  K.env_kpi = (p, c) => {
    const y = A.defaultYear(), cmp = A.compare(c.vids, y), ci = A.ciiYear(c.vids, y);
    if (!cmp || !cmp.prev.co2_t) return { level: 'nodata', summary: '資料不足：沒有前一年可以比較', items: [] };
    const gap = ci.gap_pct, hi = p.high_gap == null ? 5 : p.high_gap;
    const lv = gap != null && gap >= hi ? 'high' : (gap != null && gap > 0) || (cmp.inten_pct != null && cmp.inten_pct > 0) ? 'mid' : 'low';
    return { level: lv,
      summary: `${y} 年總排放 ${fmt(cmp.cur.co2_t / 1e3, 0)} 千噸 CO₂，比 ${y - 1} 年${sp(cmp.co2_pct)}；加權強度${sp(cmp.inten_pct, 2)}；` +
        (gap == null ? '沒有 CII 資料，無法比對減碳軌跡' : gap > 0 ? `落後 IMO 要求軌跡 ${fmt(gap, 2)}%` : `領先 IMO 要求軌跡 ${fmt(-gap, 2)}%`) +
        `（加權算法：CO₂ 合計 ÷ 運輸量合計）`,
      items: [] };
  };

  // 總排放為什麼變了：效率變差（每噸·浬排放變多）為留意；效率變差造成的排放占去年排放超過門檻要處理
  K.env_lmdi = (p, c) => {
    const y = A.defaultYear(), cmp = A.compare(c.vids, y), d = cmp && cmp.lmdi;
    if (!d) return { level: 'nodata', summary: '資料不足：沒有前一年可以比較', items: [] };
    const ip = 100 * d.intensity / d.from, hi = p.high_pct == null ? 2 : p.high_pct;
    const lv = ip >= hi ? 'high' : d.intensity > 0 ? 'mid' : 'low', t = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v) / 1e3, 1);
    return { level: lv,
      summary: `${y} 年比 ${y - 1} 年${d.total >= 0 ? '多' : '少'}排 ${fmt(Math.abs(d.total) / 1e3, 1)} 千噸 CO₂：運量 ${sp(d.activity_pct)}、每噸·浬排放 ${sp(d.inten_pct, 2)}` +
        (d.intensity > 0 ? '，效率變差（排得比較髒）' : '，效率沒有變差') + `；換算成排放量：運量造成 ${t(d.activity)}、效率造成 ${t(d.intensity)} 千噸`,
      items: [] };
  };

  // 燃料結構：只描述結構（不判定好壞）；沒有用油資料才標資料不足
  K.env_fuel_mix = (p, c) => {
    const y = A.defaultYear(), m = A.fuelMix(c.vids, y), m0 = A.fuelMix(c.vids, y - 1);
    if (!m.total) return { level: 'nodata', summary: '沒有用油資料', items: [] };
    const bio = A.bioShare(c.vids, y), low = m.pct[1] + m.pct[2], low0 = m0.total ? m0.pct[1] + m0.pct[2] : null;
    return { level: 'low',
      summary: `${y} 年用油 ${fmt(m.total / 1e3, 1)} 千噸：` + m.names.map((n, j) => `${n} ${fmt(m.pct[j], 1)}%`).join('、') +
        (low0 != null ? `；低硫燃油加輕油 ${fmt(low, 1)}%（${y - 1} 年 ${fmt(low0, 1)}%）` : '') + (bio ? `；歐盟航段生質燃料（示意）${fmt(bio.pct, 1)}%` : ''),
      items: [] };
  };

  // CII 行動清單：有必須提出 SEEMP 改善計畫的船要處理；有明年可能掉級的船留意
  K.env_cii_action = (p, c) => {
    const y = A.ciiLatestYear(c.vids);
    if (y == null) return { level: 'nodata', summary: '沒有已評級的 CII 資料', items: [] };
    const nx = A.ciiNextYear(c.vids, y), se = A.seemp(c.vids, y), must = se.filter(x => x.kind === 'must'), watch = se.filter(x => x.kind === 'watch');
    const lv = must.length ? 'high' : nx.length || watch.length ? 'mid' : 'low';
    return { level: lv,
      summary: `${y} 年：必須提出 SEEMP 改善計畫 ${must.length} 艘、觀察名單 ${watch.length} 艘（連續 2 年 D 級）；維持現狀 ${y + 1} 年可能掉級 ${nx.length} 艘`,
      items: must.concat(watch).slice(0, 12).map(x => ({ vid: x.vid, text: `${U.vname(x.vid)}：${x.why}` })) };
  };
})();
