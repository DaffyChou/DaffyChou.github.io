/* 環保法遵數據頁的共用彙總（env-esg-kpi）：年度總排放、加權強度、同期比、LMDI 排放拆解、CII 合計與明年推估、生質占比（示意）。
   強度一律用「加權算法」＝船隊 CO₂ 合計 ÷ 運輸量合計（不是各船強度的簡單平均）；運輸量由各船各月的強度反推：
     AER → 載重噸·浬、TEU 浬強度 → TEU·浬、EEOI → 噸貨·浬；分母＝CO₂ × 10⁶ ÷ 強度，所以單船時與原本的值完全相同。
   只做彙總，不改任何既有計算（carbon_engine.js、CII 評級都照舊）。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const { months, VM } = U;
  const raw = (m, v, i) => { const a = VM.m[m] && VM.m[m][v]; return a ? a[i] : null; };

  // ---------------- 年度與月份
  const yearsAll = [...new Set(months.map(m => +m.slice(0, 4)))].sort();
  const monthsOf = y => months.map((m, i) => [m, i]).filter(([m]) => +m.slice(0, 4) === y);
  /** 資料不足 12 個月的年度（最新一年通常只到某月）：回傳最後月份 1～12；完整年度回傳 12 */
  const lastMonth = y => { const ms = monthsOf(y); return ms.length ? +ms[ms.length - 1][0].slice(5) : 0; };
  const isPartial = y => lastMonth(y) < 12;
  /** 預設年度：最新的完整年度 */
  const defaultYear = () => { const f = yearsAll.filter(y => !isPartial(y)); return f.length ? f[f.length - 1] : yearsAll[yearsAll.length - 1]; };

  // ---------------- 加權強度（任一強度指標）
  /** 某船某月的 CO₂（噸）與運輸量（強度的分母）；缺任一項回傳 null */
  function cell(metric, v, i) {
    const co2 = raw('CO2', v, i), k = raw(metric, v, i);
    if (co2 == null || !(co2 > 0) || k == null || !(k > 0)) return null;
    return { co2, den: co2 * 1e6 / k };
  }
  /** 範圍內各船、指定月份索引的加權合計 */
  function sumIdx(metric, vids, idx) {
    let co2 = 0, den = 0, n = 0;
    vids.forEach(v => idx.forEach(i => { const c = cell(metric, v, i); if (c) { co2 += c.co2; den += c.den; n++; } }));
    return { co2, den, n, inten: den > 0 ? co2 * 1e6 / den : null };
  }
  /** 每月的船隊加權強度，以及滾動 12 個月的加權強度（12 個月的 CO₂ 合計 ÷ 運輸量合計；不足 9 個月有資料就不畫） */
  function weightedSeries(metric, vids) {
    const per = months.map((_, i) => sumIdx(metric, vids, [i]));
    const mon = per.map(x => x.inten);
    const roll = per.map((_, i) => {
      if (i < 11) return null;
      const w = per.slice(i - 11, i + 1), have = w.filter(x => x.n > 0).length;
      if (have < 9) return null;
      const co2 = w.reduce((a, x) => a + x.co2, 0), den = w.reduce((a, x) => a + x.den, 0);
      return den > 0 ? co2 * 1e6 / den : null;
    });
    return { mon, roll };
  }

  // ---------------- 年度彙總與同期比
  /** 某年度（可限定只到某月，做同期比）的總排放、載重噸·浬、加權強度 */
  function yearAgg(vids, y, uptoMonth) {
    const idx = monthsOf(y).filter(([m]) => !uptoMonth || +m.slice(5) <= uptoMonth).map(x => x[1]);
    let co2 = 0;
    vids.forEach(v => idx.forEach(i => { const c = raw('CO2', v, i); if (c != null && c > 0) co2 += c; }));
    const s = sumIdx('AER', vids, idx);
    return { year: y, upto: uptoMonth || lastMonth(y), months: idx.length, co2_t: co2, dwtnm: s.den, inten: s.inten };
  }
  /** 今年與去年比較：今年未滿一年時，兩年都只算到今年的最後月份（同期比） */
  function compare(vids, y) {
    if (!yearsAll.includes(y - 1)) return null;
    const lm = lastMonth(y), part = lm < 12;
    const cur = yearAgg(vids, y, part ? lm : null), prev = yearAgg(vids, y - 1, part ? lm : null);
    const pct = (a, b) => (b ? 100 * (a / b - 1) : null);
    return { year: y, prevYear: y - 1, partial: part, upto: lm, cur, prev,
      co2_pct: pct(cur.co2_t, prev.co2_t), inten_pct: cur.inten != null && prev.inten != null ? pct(cur.inten, prev.inten) : null, lmdi: lmdi(prev, cur) };
  }

  // ---------------- LMDI（對數平均迪氏指數）：總排放變化＝活動量效果＋強度效果，兩項相加剛好等於總變化
  const L = (a, b) => (a === b ? a : (a - b) / Math.log(a / b));
  function lmdi(p, c) {
    if (!(p.co2_t > 0 && c.co2_t > 0 && p.dwtnm > 0 && c.dwtnm > 0)) return null;
    const w = L(c.co2_t, p.co2_t), act = w * Math.log(c.dwtnm / p.dwtnm), ip = p.co2_t / p.dwtnm, ic = c.co2_t / c.dwtnm, inten = w * Math.log(ic / ip);
    return { from: p.co2_t, to: c.co2_t, total: c.co2_t - p.co2_t, activity: act, intensity: inten, activity_pct: 100 * (c.dwtnm / p.dwtnm - 1), inten_pct: 100 * (ic / ip - 1) };
  }

  // ---------------- CII：合計偏離軌跡、明年推估、SEEMP
  const CP = () => window.UI_COMP.params, CII = () => window.UI_COMP.cii;
  const bounds = type => (CP().bounds || {})[type === 'bulk' ? 'BULK' : 'CONTAINER'] || [0.83, 0.94, 1.07, 1.19];
  const rateOf = (r, B) => (r < B[0] ? 'A' : r < B[1] ? 'B' : r < B[2] ? 'C' : r < B[3] ? 'D' : 'E');
  /** 某年度範圍內的 CII 加權合計（與強度同一個加權算法，運輸量＝CO₂ ÷ 實際值）：
     偏離軌跡＝實際 CO₂ 合計 ÷「依要求值可排的 CO₂」合計 − 1（正數＝落後減碳軌跡）；要求值軌跡＝要求值依運輸量加權。
     有評級的船優先；該年度還沒有任何船評級（未滿一年）時，用全部資料暫估（provisional=true） */
  function ciiYear(vids, y) {
    const set = new Set(vids), rows = CII().filter(x => set.has(x.vid) && x.year === y && x.att > 0 && x.req > 0 && x.co2 > 0);
    const rated = rows.filter(x => x.rating), use = rated.length ? rated : rows;
    const wsum = (rs, f) => rs.reduce((a, x) => a + f(x), 0), den = rs => wsum(rs, x => x.co2 / x.att);
    const co2 = wsum(use, x => x.co2), allow = wsum(use, x => x.co2 * x.req / x.att);
    return { year: y, n: rows.length, rated: rated.length, provisional: !rated.length && rows.length > 0,
      gap_pct: allow ? 100 * (co2 / allow - 1) : null, req_w: rows.length ? wsum(rows, x => x.co2 * x.req / x.att) / den(rows) : null, att_w: rows.length ? wsum(rows, x => x.co2) / den(rows) : null };
  }
  /** 各年度的船隊要求值軌跡（依運輸量加權）；沒有資料的年度依折減率推算（est=true） */
  function reqTrajectory(vids, toYear) {
    const z = CP().z || {}, out = [], have = {};
    yearsAll.forEach(y => { const c = ciiYear(vids, y); if (c.req_w != null) have[y] = c.req_w; });
    const ys = Object.keys(have).map(Number).sort();
    if (!ys.length) return out;
    const b = ys[ys.length - 1];
    for (let y = ys[0]; y <= (toYear || 2030); y++) {
      if (have[y] != null) out.push({ year: y, req: have[y], est: false });
      else if (z[y] != null && z[b] != null) out.push({ year: y, req: have[b] * (1 - z[y] / 100) / (1 - z[b] / 100), est: true });
    }
    return out;
  }
  /** 明年可能掉級：以今年（最新有評級的年度）實際值不變，明年要求值依折減率收緊後的等級 */
  function ciiNextYear(vids, y) {
    const z = CP().z || {}, set = new Set(vids), out = [];
    if (z[y] == null || z[y + 1] == null) return out;
    CII().filter(x => set.has(x.vid) && x.year === y && x.rating && x.att != null && x.req != null).forEach(x => {
      const B = bounds((U.VBY[x.vid] || {}).type), req1 = x.req * (1 - z[y + 1] / 100) / (1 - z[y] / 100), r1 = x.att / req1, next = rateOf(r1, B);
      if (next > x.rating) {
        const keepIdx = 'ABCDE'.indexOf(x.rating), lim = keepIdx < 4 ? req1 * B[keepIdx] : null;   // 守住目前等級：實際值要低於明年的等級上限
        out.push({ vid: x.vid, year: y, rating: x.rating, next, ratio: x.ratio, ratio1: r1, att: x.att, req1, cut_pct: lim ? 100 * (1 - lim / x.att) : null });
      }
    });
    return out.sort((a, b) => b.ratio1 - a.ratio1);
  }
  /** 最新一個已有評級的年度（未滿一年的年度不評級）；CII 行動清單的畫面與判讀共用 */
  function ciiLatestYear(vids) { const set = new Set(vids), ys = [...new Set(CII().filter(x => set.has(x.vid) && x.rating).map(x => x.year))].sort(); return ys.length ? ys[ys.length - 1] : null; }
  /** SEEMP 改善計畫：E 級必須提出；連續 3 年 D 級必須提出；連續 2 年 D 級列觀察名單 */
  function seemp(vids, y) {
    const set = new Set(vids), by = {};
    CII().filter(x => set.has(x.vid) && x.rating).forEach(x => ((by[x.vid] = by[x.vid] || {})[x.year] = x));
    const out = [];
    Object.keys(by).forEach(k => {
      const h = by[k], cur = h[y];
      if (!cur) return;
      let nD = 0; for (let t = y; h[t] && h[t].rating === 'D'; t--) nD++;
      if (cur.rating === 'E') out.push({ vid: +k, kind: 'must', why: 'E 級', rating: 'E', ratio: cur.ratio, nD: 0 });
      else if (nD >= 3) out.push({ vid: +k, kind: 'must', why: '連續 ' + nD + ' 年 D 級', rating: 'D', ratio: cur.ratio, nD });
      else if (nD === 2) out.push({ vid: +k, kind: 'watch', why: '連續 2 年 D 級（下一年仍是 D 就須提出）', rating: 'D', ratio: cur.ratio, nD });
    });
    return out.sort((a, b) => (a.kind === b.kind ? b.ratio - a.ratio : a.kind === 'must' ? -1 : 1));
  }

  // ---------------- 生質燃料占比（示意）：只有歐盟試算的資料有生質燃料，所以只算歐盟範圍內的計入能源
  function bioShare(vids, y) {
    const CE = U.carbon;
    if (!CE) return null;
    const set = new Set(vids);
    if (!CE.C.rows.some(r => set.has(r.vid) && r.year === y)) return null;
    let P; try { P = CE.params(y); } catch (e) { return null; }
    if (P.target == null) return null;                     // FuelEU 尚未適用的年度沒有逐項能源
    const F = CE.fleetYear(vids, y), bio = new Set(CE.C.bio_fuels.concat(['B100', 'HVO']));
    let tot = 0, b = 0;
    F.rows.forEach(r => r.trace.forEach(t => { tot += t.energy_mj; if (bio.has(t.fuel_code)) b += t.energy_mj; }));
    return tot > 0 ? { pct: 100 * b / tot, ships: F.rows.length, bioShips: F.rows.filter(r => r.bio).length } : null;
  }

  // ---------------- 燃料結構（船報）：各年度各燃料噸數與占比
  const FUELS = [['HSFO_T', 'HSFO'], ['VLSFO_T', 'VLSFO'], ['MGO_T', 'MGO'], ['OTHER_T', '其他']];
  function fuelMix(vids, y) {
    const idx = monthsOf(y).map(x => x[1]), t = FUELS.map(([k]) => vids.reduce((a, v) => a + idx.reduce((s, i) => s + (raw(k, v, i) || 0), 0), 0));
    const sum = t.reduce((a, b) => a + b, 0);
    return { year: y, partial: isPartial(y), upto: lastMonth(y), tonnes: t, total: sum, pct: t.map(x => (sum ? 100 * x / sum : null)), names: FUELS.map(f => f[1]) };
  }

  U.envAgg = { yearsAll, monthsOf, lastMonth, isPartial, defaultYear, weightedSeries, yearAgg, compare, lmdi, ciiYear, reqTrajectory, ciiNextYear, ciiLatestYear, seemp, bioShare, fuelMix, bounds, rateOf };
})();
