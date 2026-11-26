/* 單船「前往的港口」的風險評估器。前往的港口＝這艘船下一個靠港的港口（取到港預報中最早的一筆）。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, { fmt, STATE } = U, K = U.risk.K;
  const nd = s => ({ level: 'nodata', summary: s, items: [] });
  const pn = u => (U.ports ? U.ports(u) : u);
  const RANK = { low: 0, mid: 1, high: 2 };
  const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);
  const HR = 3600000, ts = s => Date.parse(s + 'Z');
  const item = (vid, text) => ({ vid, text });
  const covN = c => (c === 'PORT' ? '全港' : '僅本公司船舶');

  // 這艘船下一個靠港：預報中最早的一筆（優先用計算 ETA）
  function nextArrival(vid) {
    const key = a => ts(a.etaCalc || a.etaRep || '9999-01-01T00:00:00');
    const L = CG.arrivals().filter(a => a.vid === vid && a.status === 'EXPECTED' && a.unlo).sort((a, b) => key(a) - key(b));
    return L[0] || null;
  }
  U.nextArrival = nextArrival;
  const noNext = '這艘船沒有到港預報，無法判斷前往的港口';
  const noOrg = () => STATE.type !== 'bulk' && !CG.orgOk();
  const cur = c => (U.sv && U.sv.cur ? U.sv.cur(c.vids[0]) : nextArrival(c.vids[0]));   // 前往港口與貨櫃：目前選的港口（預設下一港）

  K.np_stock = (p, c) => {
    if (noOrg()) return nd('此組織沒有貨務資料');
    const a = cur(c); if (!a) return nd(noNext);
    const ut = CG.util().filter(x => x.unlo === a.unlo);
    if (!ut.length) return nd(pn(a.unlo) + ' 沒有場站空櫃資料');
    const stale = ut.filter(x => x.stale);
    return { level: stale.length ? (stale.length === ut.length ? 'high' : 'mid') : 'low', summary: `前往 ${pn(a.unlo)}：${ut.length} 個場站中 ${stale.length} 個存量過期（超過 ${p.stale_hr} 小時沒更新）`,
      items: stale.map(x => item(null, `${x.yard}　最後更新 ${String(x.last).replace('T', ' ')}`)) };
  };
  K.np_cong = (p, c) => {
    if (noOrg()) return nd('此組織沒有運務資料');
    const a = cur(c); if (!a) return nd(noNext);
    const rows = CG.cong().filter(r => r.unlo === a.unlo && r.term == null && r.off === 0);
    if (!rows.length) return nd(pn(a.unlo) + ' 沒有壅塞資料');
    const w = rows.filter(r => r.idx != null && r.n >= p.min_n);
    if (!w.length) return nd(`${pn(a.unlo)} 近 30 天樣本不足（少於 ${p.min_n} 艘次），不給塞港指數`);
    let lv = 'low'; w.forEach(r => (lv = worse(lv, r.idx >= p.high ? 'high' : r.idx >= p.mid ? 'mid' : 'low')));
    const m = Math.max(...w.map(r => r.idx));
    return { level: lv, summary: `前往 ${pn(a.unlo)}：塞港指數 ${fmt(m, 0)}（100＝平常；${p.mid} 留意、${p.high} 要處理）`, items: w.map(r => item(null, `${covN(r.cov)}　指數 ${fmt(r.idx, 0)}　等待 ${r.wait} 艘`)) };
  };
  K.np_wait = (p, c) => {
    if (noOrg()) return nd('此組織沒有運務資料');
    const a = cur(c); if (!a) return nd(noNext);
    const ok = CG.waitTrend(p.min_calls).filter(r => r.unlo === a.unlo && r.chg != null);
    if (!ok.length) return nd(`${pn(a.unlo)} 每天進泊船數太少（少於 ${p.min_calls} 艘的日子不計），無法比較本週與上週`);
    let lv = 'low'; ok.forEach(r => (lv = worse(lv, r.chg >= p.high ? 'high' : r.chg >= p.mid ? 'mid' : 'low')));
    const m = Math.max(...ok.map(r => r.chg));
    const ms = portMonthly(a.unlo, STATE.type), mi = STATE.mi, mv = ms[mi], prev = [1, 2, 3, 4, 5, 6].map(i => ms[mi - i]).filter(v => v != null), pm = prev.length ? prev.reduce((x, y) => x + y, 0) / prev.length : null;   // 每月：當作長期參考，不另亮燈
    const mItem = mv != null && pm != null && pm >= 1 ? [item(null, `每月（參考）：本月平均等待 ${fmt(mv, 1)} 小時，前 ${prev.length} 個月平均 ${fmt(pm, 1)} 小時（${mv >= pm ? '+' : ''}${fmt(100 * (mv - pm) / pm, 0)}%）`)] : [];
    return { level: lv, summary: `前往 ${pn(a.unlo)}：本週平均等泊時間比上週${m >= 0 ? '增加' : '減少'} ${fmt(Math.abs(m), 0)}%（增加 ${p.mid}% 留意、${p.high}% 要處理）`, items: ok.map(r => item(null, `${covN(r.cov)}　本週 ${fmt(r.a, 1)} 小時，上週 ${fmt(r.b, 1)} 小時`)).concat(mItem) };
  };
  // 該港每月平均等待（同船型所有船的靠港；等待＝錨地等待＋漂航等待）
  function portMonthly(unlo, type) {
    const by = {}, cols = window.UI_CALLS.cols;
    window.UI_CALLS.rows.forEach(r => {
      const o = {}; cols.forEach((k, i) => (o[k] = r[i]));
      if (o.port !== unlo || !(o.role === 'LOAD' || o.role === 'DISCHARGE') || !o.nor) return;
      const v = U.VBY[o.vid]; if (!v || v.type !== type) return;
      const mi = U.months.indexOf(o.nor.slice(0, 7)); if (mi < 0) return;
      (by[mi] = by[mi] || []).push((o.aw || 0) + (o.dw || 0));
    });
    return U.months.map((_, i) => (by[i] && by[i].length >= 2 ? by[i].reduce((a, b) => a + b, 0) / by[i].length : null));
  }
  U.portMonthly = portMonthly;
  K.np_wait_month = (p, c) => {
    const a = cur(c); if (!a) return nd(noNext);
    const s = portMonthly(a.unlo, STATE.type), mi = STATE.mi, now = s[mi];
    const prev = []; for (let i = 1; i <= p.window; i++) if (s[mi - i] != null) prev.push(s[mi - i]);
    if (now == null || prev.length < 3) return nd(`${pn(a.unlo)} 本月或前期靠港樣本不足，無法比較`);
    const m = prev.reduce((x, y) => x + y, 0) / prev.length;
    if (m < 1) return nd(`${pn(a.unlo)} 平常幾乎不用等，不給變化百分比`);
    const chg = 100 * (now - m) / m, lv = chg >= p.high ? 'high' : chg >= p.mid ? 'mid' : 'low';
    return { level: lv, summary: `前往 ${pn(a.unlo)}：本月平均等待 ${fmt(now, 1)} 小時，對前 ${prev.length} 個月平均 ${chg >= 0 ? '+' : ''}${fmt(chg, 0)}%（${p.mid}% 留意、${p.high}% 要處理）`, items: [] };
  };
  K.np_eta = (p, c) => {
    const a = nextArrival(c.vids[0]); if (!a) return nd(noNext);   // ETA 落差一律看下一港（只有下一港有到港預報）
    if (!a.etaRep || !a.etaCalc) return nd(`前往 ${pn(a.unlo)}：回報或計算 ETA 缺少一項，無法比較`);
    const g = Math.abs(ts(a.etaRep) - ts(a.etaCalc)) / HR, lv = g > p.gap_hr * 4 ? 'high' : g > p.gap_hr ? 'mid' : 'low';
    return { level: lv, summary: `前往 ${pn(a.unlo)}：回報與計算 ETA 差 ${fmt(g, 0)} 小時（超過 ${p.gap_hr} 小時留意、${p.gap_hr * 4} 小時要處理）`, items: [] };
  };

  // ---- single-voyage-port：這艘船的 ETA 準確度（依港口；沿用船隊 ETA 準確度的計算）
  K.np_etaacc = (p, c) => {
    if (noOrg()) return nd('此組織沒有運務資料');
    if (!U.etaStats) return nd('沒有 ETA 準確度資料');
    const S = U.etaStats(c.vids, c.mi, 'port'), a = S.all;
    if (!a.n) return nd('近 6 個月這艘船沒有可比較的預測紀錄');
    const lv = a.repAbs >= p.high ? 'high' : a.repAbs >= p.mid ? 'mid' : 'low', bad = S.rows.filter(r => r.n >= p.min_n && r.repAbs >= p.mid);
    return { level: lv, summary: `近 6 個月 ${a.n} 次靠港：回報 ETA 平均差 ${fmt(a.repAbs, 1)} 小時、計算 ETA 平均差 ${fmt(a.calAbs, 1)} 小時（回報 ${p.mid} 小時留意、${p.high} 小時要處理）`,
      items: bad.slice(0, 10).map(r => item(null, `${pn(r.k)}　回報平均差 ${fmt(r.repAbs, 1)} 小時、計算 ${fmt(r.calAbs, 1)} 小時，${r.n} 次`)) };
  };

  // 這港的缺櫃預估（M14-c23）：這港各場站、各櫃型未來 7 天，最差者
  K.np_short = (p, c) => {
    if (noOrg()) return nd('此組織沒有貨務資料');
    const a = cur(c); if (!a) return nd(noNext);
    const L = CG.forecastAll().filter(r => (CG.C.yards[r.y] || [])[1] === a.unlo && r.status !== '資料不足');
    const ut = CG.util().filter(x => x.unlo === a.unlo), stale = ut.filter(x => x.stale);   // 空櫃存量過期的場站（原「空櫃存量」卡片的判讀，併進來）
    if (!L.length && !ut.length) return nd(pn(a.unlo) + ' 沒有場站空櫃資料');
    const hi = L.filter(r => r.status === '要處理'), mid = L.filter(r => r.status === '留意');
    const lv = hi.length ? 'high' : mid.length || stale.length ? 'mid' : L.length ? 'low' : 'nodata';
    return { level: lv, summary: `${pn(a.unlo)}：未來 7 天 ${L.length} 個場站櫃型中，預估缺櫃 ${hi.length} 項、可能缺櫃 ${mid.length} 項；${ut.length} 個場站中 ${stale.length} 個存量過期（超過 ${p.stale_hr} 小時沒更新）`,
      items: hi.concat(mid).map(r => item(null, `${r.yard}　${r.ct} ${r.sz}　${r.status}，最早第 ${r.first} 天`)).concat(stale.map(x => item(null, `${x.yard}　存量過期，最後更新 ${String(x.last).replace('T', ' ')}`))) };
  };
  // 這艘船的靠泊時程（M14-c21）：離港比計畫晚 late_hr 小時以上＝留意（同靠泊時程）
  K.np_berth = (p, c) => {
    if (noOrg()) return nd('此組織沒有運務資料');
    if (!U.berthGanttOwn || !U.berthGanttOwn.items) return nd('沒有靠泊資料');
    const L = U.berthGanttOwn.items(new Set(c.vids), true);
    if (!L.length) return nd('基準時間前 3 天到後 5 天，這艘船沒有靠泊紀錄');
    const late = L.filter(x => x.late), now = CG.NOW, cur = L.find(x => x.af <= now && x.dep > now);
    return { level: late.length ? 'mid' : 'low', summary: `${L.length} 次靠泊（${new Set(L.map(x => x.term)).size} 個碼頭）${cur ? '；目前在 ' + cur.term + ' 靠泊中' : ''}；離港比計畫晚 ${p.late_hr} 小時以上 ${late.length} 次` + (late.length ? '（留意）' : ''),
      items: late.map(x => item(x.vid, `${x.term}　離港延誤 ${x.delay.toFixed(1)} 小時`)) };
  };

  // ---- single-fuel-drive：單船「油耗與航行」
  const worstOf = L => { let lv = 'nodata'; const R2 = { nodata: -1, low: 0, mid: 1, high: 2 }; L.forEach(x => { if (x && R2[x.level] > R2[lv]) lv = x.level; }); return lv; };
  // 重點數字：燈號直接用清單「燃油效率差距」那一欄（同一份逐船評估，數字一定一致）
  K.np_fuelkpi = (p, c) => {
    const vid = c.vids[0], o = U.risk.byVessel(vid) || {}, e = o.eff;
    const f = U.val ? U.val('FUEL_TOTAL', vid, c.mi) : null;
    if (!e) return nd('沒有燃油效率資料');
    return { level: e.level, summary: (f != null ? `本月用油 ${fmt(f, 0)} 噸；` : '') + `燃油效率對同型船：${e.text || '—'}（${e.summary || ''}）`, items: [] };
  };
  // 油花在哪裡：等待耗油占比（近 6 個月平均）；散裝另看輕油占比，取較差者
  K.np_fuelwhere = (p, c) => {
    const a = K.vessel_threshold({ metric: 'FUEL_WAIT_SHARE', dir: 'above', mid: p.mid, high: p.high, unit: '%', window: 6 }, c);
    const b = p.mgo_mid != null ? K.vessel_threshold({ metric: 'MGO_SHARE', dir: 'above', mid: p.mgo_mid, high: p.mgo_high, unit: '%', window: 6 }, c) : null;
    const lv = worstOf([a, b]);
    if (lv === 'nodata') return nd('沒有營運狀態耗油資料');
    return { level: lv, summary: `等待耗油占比：${a.summary}` + (b ? `；輕油占比：${b.summary}` : ''), items: (a.items || []).concat(b ? b.items || [] : []) };
  };
  // 等待燒掉的油（近 6 個月，依港口）：等待油耗占總油耗的比例
  K.np_waitfuel = (p, c) => {
    if (!U.fuelOps) return nd('沒有燃油成本的計算');
    const vid = c.vids[0]; let w = 0, f = 0;
    for (let k = Math.max(0, c.mi - 5); k <= c.mi; k++) { const x = U.fuelOps.vessel(vid, k); if (x) { w += x.wait || 0; f += x.fuel || 0; } }
    if (!(f > 0)) return nd('近 6 個月沒有油耗資料');
    const s = 100 * w / f, v = +s.toFixed(1), lv = v >= p.high ? 'high' : v >= p.mid ? 'mid' : 'low';
    const P = {}; for (let k = Math.max(0, c.mi - 5); k <= c.mi; k++) U.fuelOps.byPort([vid], k).forEach(r => { const o = P[r.port] || (P[r.port] = { port: r.port, fuel: 0 }); o.fuel += r.fuel; });
    const top = Object.values(P).sort((x, y) => y.fuel - x.fuel)[0];
    return { level: lv, summary: `近 6 個月等待燒掉約 ${fmt(w, 0)} 噸油，占總油耗 ${fmt(s, 1)}%（${p.mid}% 留意、${p.high}% 要處理）` + (top ? `；最多的是 ${pn(top.port)}（${fmt(top.fuel, 0)} 噸）` : ''), items: [] };
  };
  // 主機與輔機：打滑率（近 6 個月）與冷凍箱比例（對自己平常），取較差者
  K.np_engine = (p, c) => {
    const a = K.vessel_threshold({ metric: 'SLIP', dir: 'above', mid: p.slip_mid, high: p.slip_high, unit: '%', window: 6 }, c);
    const b = K.vs_baseline_avg({ metric: 'REEFER_SHARE', dir: 'above', mid: p.rf_mid, high: p.rf_high, unit: '%' }, c);
    const lv = worstOf([a, b]);
    if (lv === 'nodata') return nd('沒有打滑率與冷凍箱資料');
    return { level: lv, summary: `打滑率：${a.summary}；冷凍箱比例：${b.summary}`, items: [] };
  };

  // ---- single-fuel-stock：單船「燃油與庫存」
  // 重點數字：燈號直接用清單「剩餘天數」那一欄（同一份逐船評估）
  K.np_stockkpi = (p, c) => {
    const vid = c.vids[0], r = (U.risk.byVessel(vid) || {}).remain, s = (U.SN.snap || {})[vid];
    if (!r) return nd('沒有庫存資料');
    return { level: r.level, summary: (s && s.rob_res != null ? `殘油 ${fmt(s.rob_res, 0)} 噸、日耗 ${fmt(s.rate, 1)} 噸；` : '') + `剩餘天數 ${r.text || '—'}（${r.summary || ''}）`, items: r.items || [] };
  };
  // 加油紀錄：庫存守恆不符（資料品質）＋供油單與實測差（貨櫃），取較差者
  K.np_bunkerrec = (p, c) => {
    const a = K.dq_issues({ rules: ['BUNKER_ROB_MISMATCH'], mid: p.mid, high: p.high }, c);
    const b = p.diff_mid != null ? K.vessel_threshold({ metric: 'BUNKER_DIFF', dir: 'abs_above', mid: p.diff_mid, high: p.diff_high, unit: '%', window: 12 }, c) : null;
    const lv = worstOf([a, b]);
    if (lv === 'nodata') return nd('這艘船沒有加油紀錄');
    return { level: lv, summary: `庫存守恆：${a.summary}` + (b ? `；供油單與實測差：${b.summary}` : ''), items: (a.items || []).concat(b ? b.items || [] : []) };
  };

  // ---- 單船「船上貨櫃」（模擬資料）：空櫃、冷櫃、危險櫃
  const vc = c => (CG.C.vcargo || {})[c.vids[0]];
  K.np_load = (p, c) => {
    if (noOrg()) return nd('此組織沒有貨務資料');
    const v = vc(c); if (!v || v[0] == null) return nd('這艘船沒有貨櫃資料');
    const pct = v[0] ? 100 * v[2] / v[0] : 0;
    return { level: pct >= p.empty_high ? 'high' : pct >= p.empty_mid ? 'mid' : 'low', summary: `船上 ${fmt(v[0], 0)} TEU：滿櫃 ${fmt(v[1], 0)}、空櫃 ${fmt(v[2], 0)}（${fmt(pct, 0)}%；${p.empty_mid}% 留意、${p.empty_high}% 要處理）、冷櫃 ${fmt(v[3], 0)}、危險櫃 ${fmt(v[4], 0)}`, items: [] };
  };
  K.np_load_port = (p, c) => {
    if (noOrg()) return nd('此組織沒有貨務資料');
    const v = vc(c); if (!v || !v[7]) return nd('這艘船沒有航線預報，無法依卸貨港分組');
    const tot = v[7].reduce((s, r) => s + r[1], 0) || 1, top = v[7].slice().sort((a, b) => b[1] - a[1])[0], pct = 100 * top[1] / tot;
    return { level: pct >= p.share_high ? 'high' : pct >= p.share_mid ? 'mid' : 'low', summary: `最集中的卸貨港 ${pn(top[0])} 占船上滿櫃 ${fmt(pct, 0)}%（${p.share_mid}% 留意、${p.share_high}% 要處理）`, items: v[7].map(r => item(null, `${pn(r[0])}　滿櫃 ${fmt(r[1], 0)}、空櫃 ${fmt(r[2], 0)}、冷櫃 ${fmt(r[3], 0)}、危險櫃 ${fmt(r[4], 0)} TEU`)) };
  };
  K.np_bay = (p, c) => {
    if (noOrg()) return nd('此組織沒有貨務資料');
    const v = vc(c); if (!v || !v[0]) return nd('這艘船沒有貨櫃資料');
    const pct = 100 * v[3] / v[0];
    return { level: pct >= p.reefer_high ? 'high' : pct >= p.reefer_mid ? 'mid' : 'low', summary: `冷櫃占船上貨櫃 ${fmt(pct, 1)}%（${p.reefer_mid}% 留意、${p.reefer_high}% 要處理）；危險櫃 ${fmt(v[4], 0)} TEU（示意配載圖，非真實位置）`, items: [] };
  };
})();
