/* 歐盟碳成本試算：ETS＋FuelEU＋情境比較與反推。
   與 synth/fueleu_engine.py、synth/scenario_engine.py 逐步對應（Python 用 Decimal、這裡用浮點數），
   verify_ui.js 會拿 build/ref_carbon.json 逐筆比對。參數全部讀自 window.UI_CARBON（資料表匯出），程式不寫死法規數值。
   規劃用估算，非經驗證的排放報告；碳價、燃料價與生質係數為示意值。 */
(function () {
  'use strict';
  const C = window.UI_CARBON;
  if (!C) return;

  // ---------------- 參數：每個年度取「適用起始年度不晚於該年」的最新一筆（匯出時已解好）
  function params(y) {
    const p = C.params[String(y)];
    if (!p) throw new Error('UNSUPPORTED_YEAR ' + y);
    return p;
  }

  // 航段輸入：[label, coverage, {燃料: 噸}] → {label, coverage, fuel:[{fuel_code, tonnes}]}
  function ship(key) {
    return (C.items[key] || []).map(([label, coverage, fu]) => ({ label, coverage, fuel: Object.keys(fu).map(k => ({ fuel_code: k, tonnes: fu[k] })) }));
  }

  function expand(code, t) {
    const b = C.blends[code];
    return b ? b.map(([c, s]) => [c, t * s]) : [[code, t]];
  }
  function merged(fuels) {
    const out = {};
    fuels.forEach(fu => expand(fu.fuel_code, fu.tonnes).forEach(([c, t]) => (out[c] = (out[c] || 0) + t)));
    return out;
  }

  // ETS 的 CO2 當量（公噸）：2026 年起計入 CH4、N2O 與甲烷逸散
  function etsCo2e(code, t, P) {
    const f = P.ets[code];
    if (!f) throw new Error('UNSUPPORTED_FUEL ' + code);
    if (t < 0) throw new Error('NEGATIVE_VALUE');
    const [co2, ch4, n2o, slipPct] = f, s = slipPct / 100;
    if (!P.surrender[1]) return t * (1 - s) * co2;
    return t * (1 - s) * (co2 + ch4 * P.gwp_ets[0] + n2o * P.gwp_ets[1]) + t * s * P.gwp_ets[0];
  }

  // FuelEU 的 TtW 係數（每克燃料的 gCO2e），GWP 用 FuelEU 的版本
  function ttw(code, P) {
    const [co2, ch4, n2o, slipPct] = P.ets[code], s = slipPct / 100;
    return (1 - s) * (co2 + ch4 * P.feu.GWP_CH4 + n2o * P.feu.GWP_N2O) + s * P.feu.GWP_CH4;
  }

  function penaltyFor(balance, actual, P) {
    if (balance >= 0 || !actual) return 0;
    return (-balance / (actual * P.feu.VLSFO_MJ_PER_T)) * P.feu.PENALTY_EUR_PER_T;
  }

  /** 一艘船、一個排放年度的 FuelEU。法規尚未適用時回傳空值與 BEFORE_FUELEU。 */
  function computeShip(items, year, P) {
    P = P || params(year);
    if (P.target == null || P.feu.GWP_CH4 == null)
      return { energy_mj: null, ghg_g: null, actual: null, target: null, balance_g: null, penalty_eur: null, trace: [], warnings: ['BEFORE_FUELEU'], versions: {} };
    let energy = 0, ghg = 0;
    const trace = [], warns = new Set();
    items.forEach(it => {
      const cov = it.coverage;
      if (cov === 0) return;
      it.fuel.forEach(fu => {
        if (fu.tonnes < 0) throw new Error('NEGATIVE_VALUE');
        expand(fu.fuel_code, fu.tonnes).forEach(([code, tn]) => {
          const ff = P.fuel[code];
          if (!ff || !P.ets[code]) throw new Error('UNSUPPORTED_FUEL ' + code);
          const [lcv, wtt, pos, ill] = ff;
          const grams = tn * 1e6 * cov, mj = grams * lcv, k = ttw(code, P);
          const emit = pos != null ? mj * pos : mj * wtt + grams * k;
          if (ill) warns.add('ILLUSTRATIVE_FUEL ' + code);
          energy += mj; ghg += emit;
          trace.push({ label: it.label, fuel_code: code, coverage: cov, tonnes: tn, grams, energy_mj: mj, lcv, wtt, ttw: k, pos, emission_g: emit,
            basis: pos != null ? `認證強度 ${pos} g/MJ` : `WtT ${wtt}×能源＋TtW ${k.toFixed(4)}×克數` });
        });
      });
    });
    const actual = energy > 0 ? ghg / energy : null;
    const balance = actual != null ? (P.target - actual) * energy : null;
    return { energy_mj: energy, ghg_g: ghg, actual, target: P.target, balance_g: balance, penalty_eur: balance == null ? null : penaltyFor(balance, actual, P),
      trace, warnings: [...warns].sort(), versions: Object.assign({}, P.versions, { target_from: P.target_from, gwp_ch4: P.feu.GWP_CH4, gwp_n2o: P.feu.GWP_N2O }) };
  }

  /** 船隊合計：pooled＝整個船隊視為一池的簡化估算（不是精確分配）。 */
  function computeFleet(results, P) {
    if (P.target == null) return { energy_mj: null, actual: null, target: null, balance_g: null, penalty_sum_eur: null, pooled_penalty_eur: null };
    const en = results.reduce((a, r) => a + (r.energy_mj || 0), 0), gh = results.reduce((a, r) => a + (r.ghg_g || 0), 0);
    const actual = en > 0 ? gh / en : null;
    const bal = results.reduce((a, r) => a + (r.balance_g == null ? 0 : r.balance_g), 0);
    return { energy_mj: en, actual, target: P.target, balance_g: bal, penalty_sum_eur: results.reduce((a, r) => a + (r.penalty_eur == null ? 0 : r.penalty_eur), 0),
      pooled_penalty_eur: penaltyFor(bal, actual, P) };
  }

  /** 以生質取代 replace 燃料的 share%（質量）；不改動輸入。 */
  function substitute(items, replace, bio, sharePct) {
    const s = sharePct / 100;
    return items.map(it => {
      const fuel = [];
      it.fuel.forEach(fu => {
        if (fu.fuel_code === replace && s > 0) {
          if (fu.tonnes * (1 - s) > 0) fuel.push({ fuel_code: replace, tonnes: fu.tonnes * (1 - s) });
          fuel.push({ fuel_code: bio, tonnes: fu.tonnes * s });
        } else fuel.push({ fuel_code: fu.fuel_code, tonnes: fu.tonnes });
      });
      return Object.assign({}, it, { fuel });
    });
  }

  function fuelBill(items, P) {
    let bill = 0, tonnes = 0;
    items.forEach(it => {
      const m = merged(it.fuel);
      Object.keys(m).forEach(c => {
        if (P.price[c] == null) throw new Error('MISSING_PRICE ' + c);
        bill += m[c] * P.price[c]; tonnes += m[c];
      });
    });
    return [bill, tonnes];
  }

  function ets(items, P, euaPrice) {
    let co2e = 0, scoped = 0;
    items.forEach(it => {
      if (it.coverage === 0) return;
      const m = merged(it.fuel);
      let e = 0, t = 0;
      Object.keys(m).forEach(c => { e += etsCo2e(c, m[c], P); t += m[c]; });
      co2e += e * it.coverage; scoped += t * it.coverage;
    });
    const eua = co2e * P.surrender[0];
    return [eua, eua * euaPrice, scoped];
  }

  /** 一個方案的成本。ships＝[航段輸入, …]；spec＝{bio_code, bio_share_pct, replace_code:'HFO', fueleu_mode:'penalty'|'buy'|'fleet_pool'}。 */
  function evaluate(ships, year, euaPrice, spec, P) {
    P = P || params(year);
    spec = spec || {};
    const mode = spec.fueleu_mode || 'penalty';
    if (spec.bio_share_pct) ships = ships.map(s => substitute(s, spec.replace_code || 'HFO', spec.bio_code, spec.bio_share_pct));
    const warns = new Set();
    const per = ships.map(sh => {
      const [bill, gross] = fuelBill(sh, P), [eua, etsCost, scoped] = ets(sh, P, euaPrice), fe = computeShip(sh, year, P);
      fe.warnings.forEach(w => warns.add(w));
      return { fuel_cost: bill, gross_t: gross, scoped_t: scoped, ets_eua: eua, ets_cost: etsCost, fe };
    });
    const applies = P.target != null, pp = P.feu.POOL_PRICE_EUR_PER_T;
    let feCost = per.map(() => 0), poolDeficit = null;
    if (applies && mode === 'penalty') feCost = per.map(x => x.fe.penalty_eur || 0);
    else if (applies && (mode === 'fleet_pool' || mode === 'buy')) {
      const fl = computeFleet(per.map(x => x.fe), P);
      let tot;
      if (mode === 'fleet_pool') tot = fl.pooled_penalty_eur || 0;
      else {
        if (pp == null) throw new Error('MISSING_POOL_PRICE');
        poolDeficit = Math.max(0, -(fl.balance_g || 0)) / 1e6;
        tot = poolDeficit * pp;
      }
      const totEn = per.reduce((a, x) => a + (x.fe.energy_mj || 0), 0);
      feCost = per.map(x => (totEn ? (tot * (x.fe.energy_mj || 0)) / totEn : 0));
    }
    const sum = k => per.reduce((a, x) => a + x[k], 0);
    const fuel = sum('fuel_cost'), etsC = sum('ets_cost'), feC = feCost.reduce((a, b) => a + b, 0), gross = sum('gross_t'), scoped = sum('scoped_t'), eua = sum('ets_eua');
    const carbon = etsC + feC, fl = computeFleet(per.map(x => x.fe), P);
    return {
      year, mode, spec: Object.assign({}, spec), eua_price: euaPrice,
      ships: per.map((x, i) => ({ fuel_cost: x.fuel_cost, ets_eua: x.ets_eua, ets_cost: x.ets_cost, fueleu_cost: feCost[i], actual: x.fe.actual,
        balance_t: x.fe.balance_g == null ? null : x.fe.balance_g / 1e6, energy_mj: x.fe.energy_mj, trace: x.fe.trace })),
      fuel_cost: fuel, ets_eua: eua, ets_eua_rounded: Math.round(eua), ets_cost: etsC, fueleu_cost: feC, total: fuel + carbon, carbon_cost: carbon,
      fleet_actual: fl.actual, fleet_balance_t: fl.balance_g == null ? null : fl.balance_g / 1e6, pool_deficit_t: poolDeficit,
      surcharge_per_t_gross: gross ? carbon / gross : null, surcharge_per_t_scoped: scoped ? carbon / scoped : null, warnings: [...warns].sort()
    };
  }

  /** 反推罰款為零所需的最小生質取代比例。合規餘額隨比例線性變化，用兩端點精確求解。 */
  function solveBioShare(ships, year, bio, replace, P) {
    P = P || params(year); replace = replace || 'HFO';
    if (P.target == null) return { status: 'n/a', share_pct: null };
    const bal = s => computeFleet(ships.map(x => computeShip(substitute(x, replace, bio, s), year, P)), P);
    const f0 = bal(0);
    if (f0.balance_g == null || !f0.energy_mj) return { status: 'n/a', share_pct: null };
    if (f0.balance_g >= 0) return { status: 'already', share_pct: 0, bio_energy_share_pct: 0 };
    const b1 = bal(100).balance_g;
    if (b1 < 0) return { status: 'infeasible', share_pct: null, balance_at_100_t: b1 / 1e6 };
    const s = (-f0.balance_g / (b1 - f0.balance_g)) * 100;
    const parts = ships.map(x => computeShip(substitute(x, replace, bio, s), year, P));
    const bioCodes = new Set([bio].concat((C.blends[bio] || []).map(b => b[0])));
    bioCodes.delete(replace);
    let bioMj = 0, totMj = 0;
    parts.forEach(p => { totMj += p.energy_mj; p.trace.forEach(t => { if (bioCodes.has(t.fuel_code)) bioMj += t.energy_mj; }); });
    return { status: 'ok', share_pct: s, bio_energy_share_pct: totMj ? (100 * bioMj) / totMj : null };
  }

  function euaSensitivity(ships, year, prices, spec) {
    return prices.map(pr => { const r = evaluate(ships, year, pr, spec); return { eua_price: pr, ets_cost: r.ets_cost, total: r.total }; });
  }

  /** 三種常見方案並排；缺 pooling 價格時不產生「購買 pooling 盈餘」。 */
  function standardScenarios(ships, year, euaPrice, bio, share) {
    const P = params(year);
    bio = bio || 'B30'; share = share == null ? 50 : share;
    const out = [['照常營運並繳罰款', evaluate(ships, year, euaPrice, null, P)]];
    if (P.feu.POOL_PRICE_EUR_PER_T != null) out.push(['購買 pooling 盈餘', evaluate(ships, year, euaPrice, { fueleu_mode: 'buy' }, P)]);
    out.push([`混用低碳燃料（${bio} 取代 ${share}% 重油）`, evaluate(ships, year, euaPrice, { bio_code: bio, bio_share_pct: share }, P)]);
    return out;
  }

  // ---------------- 畫面用：範圍內各船某年度的 ETS＋FuelEU 與船隊合計
  const PARTIAL = (() => { const d = C.data_until || ''; return d && d.slice(5, 7) !== '12' ? +d.slice(0, 4) : null; })();   // 資料不足一整年的年度
  function years(vids) {
    const set = new Set(vids);
    return [...new Set(C.rows.filter(r => set.has(r.vid)).map(r => r.year))].sort();
  }
  /** 預設年度：最新的完整年度（2026 年資料只到 10 月，有 2025 年時預設 2025）。 */
  function defaultYear(vids) {
    const ys = years(vids), full = ys.filter(y => y !== PARTIAL);
    return full.length ? full[full.length - 1] : ys.length ? ys[ys.length - 1] : null;
  }
  function fleetYear(vids, year, euaPrice) {
    euaPrice = euaPrice == null ? C.eua_price : euaPrice;
    const set = new Set(vids), P = params(year);
    const vs = C.rows.filter(r => set.has(r.vid) && r.year === year).map(r => r.vid);
    const ships = vs.map(v => ship(v + '|' + year));
    const rows = vs.map((vid, i) => {
      const ev = evaluate([ships[i]], year, euaPrice, null, P), fe = computeShip(ships[i], year, P);
      return { vid, year, fuel_cost: ev.fuel_cost, ets_eua: ev.ets_eua, ets_cost: ev.ets_cost, actual: fe.actual, target: fe.target,
        balance_t: fe.balance_g == null ? null : fe.balance_g / 1e6, penalty: fe.penalty_eur, energy_mj: fe.energy_mj, trace: fe.trace, warnings: fe.warnings,
        bio: C.bio[vid] && year >= 2026 ? C.bio[vid] : 0 };
    });
    const all = evaluate(ships, year, euaPrice, null, P), fl = computeFleet(ships.map(s => computeShip(s, year, P)), P);
    return { year, partial: year === PARTIAL, eua_price: euaPrice, rows, ships,
      totals: { eua_rounded: all.ets_eua_rounded, ets_cost: all.ets_cost, penalty_sum: fl.penalty_sum_eur, pooled_penalty: fl.pooled_penalty_eur,
        actual: fl.actual, target: fl.target, balance_t: fl.balance_g == null ? null : fl.balance_g / 1e6, fuel_cost: all.fuel_cost } };
  }

  const api = { C, params, ship, computeShip, computeFleet, substitute, evaluate, solveBioShare, euaSensitivity, standardScenarios, penaltyFor, years, defaultYear, fleetYear, PARTIAL };
  window.UI_CARBON_ENGINE = api;
  if (window.UI) window.UI.carbon = api;
})();
