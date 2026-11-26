/* 歐盟碳成本試算（M8-b2～b4、M8-c2～c4）的風險評估器。計算全部走 carbon_engine.js；門檻由 data/risk.js 規格提供。
   碳價、燃料價與生質係數為示意值；FuelEU 參數待核對原文；規劃用估算，非經驗證的排放報告。 */
(function () {
  'use strict';
  const U = window.UI, CE = U && U.carbon, K = U && U.risk && U.risk.K;
  if (!CE || !K) return;
  const { fmt, vname } = U;
  const item = (vid, text) => ({ vid, text });
  const NOEU = c => ({ level: 'low', summary: c.vids.length === 1 ? '無歐盟航段：這艘船沒有靠歐盟港，沒有歐盟碳成本' : '範圍內沒有靠歐盟港的船，沒有歐盟碳成本', items: [] });
  const meur = x => fmt(x / 1e6, 2) + ' 百萬歐元';
  const yrNote = y => (y === CE.PARTIAL ? `（${y} 年資料只到 10 月）` : '');

  // 船隊試算：ETS 成本＋FuelEU 赤字與罰款；pooling 後仍有罰款要處理，各船有赤字但 pooling 可抵掉為留意
  K.carbon_fleet = (p, c) => {
    const y = CE.defaultYear(c.vids);
    if (y == null) return NOEU(c);
    const F = CE.fleetYear(c.vids, y), T = F.totals, def = F.rows.filter(r => r.balance_t != null && r.balance_t < 0);
    const one = c.vids.length === 1, r0 = F.rows[0];
    const fe = T.target == null ? `${y} 年 FuelEU 尚未適用` : one ?
      (r0.balance_t < 0 ? `FuelEU 強度 ${fmt(r0.actual, 2)}，赤字 ${fmt(-r0.balance_t, 0)} 噸 CO₂e、罰款 ${meur(r0.penalty)}` : `FuelEU 強度 ${fmt(r0.actual, 2)}，盈餘 ${fmt(r0.balance_t, 0)} 噸 CO₂e、沒有罰款`) :
      `FuelEU 赤字 ${def.length} 艘，各船單獨罰款合計 ${meur(T.penalty_sum)}，整個船隊合併計算（pooling）後 ${meur(T.pooled_penalty)}`;
    const lv = T.target == null ? 'low' : T.pooled_penalty > 0 ? 'high' : def.length ? 'mid' : 'low';
    return { level: lv,
      summary: `${y} 年${one ? '這艘船' : ' ' + F.rows.length + ' 艘'}有歐盟航段${yrNote(y)}：ETS 應繳 ${fmt(T.eua_rounded, 0)} 張、成本 ${meur(T.ets_cost)}（示意價 ${fmt(F.eua_price, 0)} 歐元/噸，非真實價格）；${fe}。規劃用估算`,
      items: F.rows.slice().sort((a, b) => (b.ets_cost + (b.penalty || 0)) - (a.ets_cost + (a.penalty || 0))).slice(0, 60).map(r => item(r.vid,
        `${vname(r.vid)}　ETS ${meur(r.ets_cost)}` + (r.actual == null ? '' : `　強度 ${fmt(r.actual, 2)}　${r.balance_t < 0 ? '赤字 ' + fmt(-r.balance_t, 0) + ' 噸、罰款 ' + meur(r.penalty) : '盈餘 ' + fmt(r.balance_t, 0) + ' 噸'}`) +
        (r.bio ? `　（示意：B30 取代 ${r.bio}% 重油）` : ''))) };
  };

  // 強度對照：超過當年上限 high_gap 以上要處理、超過即留意；另列在 future_year 的上限下會超標的船
  K.fueleu_intensity = (p, c) => {
    const y = CE.defaultYear(c.vids);
    if (y == null) return NOEU(c);
    const F = CE.fleetYear(c.vids, y), T = F.totals;
    if (T.target == null) return { level: 'low', summary: `${y} 年 FuelEU 尚未適用（2025 年起）`, items: [] };
    const fut = CE.params(p.future_year).target, over = F.rows.filter(r => r.actual != null && r.actual > T.target);
    const gap = Math.max(0, ...over.map(r => r.actual - T.target)), lv = gap >= p.high_gap ? 'high' : over.length ? 'mid' : 'low';
    const futOver = F.rows.filter(r => r.actual != null && r.actual > fut).length;
    return { level: lv,
      summary: `${y} 年上限 ${fmt(T.target, 2)} g/MJ：` + (c.vids.length === 1 ? `這艘船 ${fmt(T.actual, 2)}，${over.length ? '超標 ' + fmt(gap, 2) : '低於上限'}` : `船隊 ${fmt(T.actual, 2)}，${over.length} 艘超標${over.length ? '（最多超 ' + fmt(gap, 2) + '）' : ''}`) + `；以 ${p.future_year} 年上限 ${fmt(fut, 2)} 計，${c.vids.length === 1 ? (futOver ? '會超標' : '不會超標') : futOver + ' 艘超標'}${yrNote(y)}。參數待核對`,
      items: F.rows.filter(r => r.actual != null).sort((a, b) => b.actual - a.actual).slice(0, 60).map(r => item(r.vid,
        `${vname(r.vid)}　${fmt(r.actual, 2)} g/MJ（${r.actual > T.target ? '超過上限 ' + fmt(r.actual - T.target, 2) : '低於上限 ' + fmt(T.target - r.actual, 2)}）`)) };
  };

  // 情境比較：照常營運有罰款、且有淨省的方案時留意；只比「比照常營運多或省多少」——燃料費（全部用油）與碳成本（只算歐盟）口徑不同，不列相加的合計
  K.carbon_scenario = (p, c) => {
    const y = CE.defaultYear(c.vids);
    if (y == null) return NOEU(c);
    const F = CE.fleetYear(c.vids, y), sc = CE.standardScenarios(F.ships, y, F.eua_price, p.bio, p.share);
    const base = sc[0][1], net = r => r.total - base.total, best = sc.slice(1).filter(s => net(s[1]) < -0.5).sort((a, b) => net(a[1]) - net(b[1]))[0];
    const sg = v => (Math.abs(v) < 0.5 ? '不變' : (v > 0 ? '多 ' : '省 ') + meur(Math.abs(v)));
    const sol = CE.solveBioShare(F.ships, y, p.bio);
    const solTxt = sol.status === 'ok' ? `免罰需 ${p.bio} 取代 ${fmt(sol.share_pct, 1)}% 重油（質量比；生質能源約 ${fmt(sol.bio_energy_share_pct, 1)}%，能量比）` :
      sol.status === 'already' ? '已達標，不需生質燃料' : sol.status === 'infeasible' ? `${p.bio} 全部取代仍無法免罰` : 'FuelEU 尚未適用';
    const lv = base.fueleu_cost > 0 && best ? 'mid' : 'low';
    return { level: lv,
      summary: `${y} 年 ${F.rows.length} 艘：` + (best ? `淨省最多的是「${best[0]}」，比照常營運淨省 ${meur(-net(best[1]))}${best[1].mode === 'buy' ? '（非實質減碳，不可計入減碳揭露）' : ''}` : '沒有比照常營運更省的方案') +
        `；${solTxt}；碳成本每噸用油加價約 ${fmt(base.surcharge_per_t_gross, 0)} 歐元${yrNote(y)}。皆為示意價`,
      items: sc.map(([n, r]) => item(null, `${n}：燃料費（全部用油）${meur(r.fuel_cost)}、歐盟碳成本 ${meur(r.carbon_cost)}（ETS ${meur(r.ets_cost)}＋FuelEU ${meur(r.fueleu_cost)}）` +
        (r === base ? '' : `；比照常營運：燃料費${sg(r.fuel_cost - base.fuel_cost)}、碳成本${sg(r.carbon_cost - base.carbon_cost)}，淨${sg(net(r))}`))) };
  };
})();
