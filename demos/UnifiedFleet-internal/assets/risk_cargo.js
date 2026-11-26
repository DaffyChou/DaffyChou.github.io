/* 貨務與運務（M12、M13）的風險評估器。門檻由 data/risk.js 規格提供，等級與文字全部由資料即時計算。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C, { fmt, STATE, VBY } = U, K = U.risk.K;
  const nd = s => ({ level: 'nodata', summary: s, items: [] });
  const NOORG = '此組織沒有貨務與運務資料（只有「模擬貨櫃公司」有）';
  const RANK = { low: 0, mid: 1, high: 2 };
  const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);
  const pn = u => (U.ports ? U.ports(u) : u);
  const HR = 3600000;
  const t = s => Date.parse(s + 'Z');
  const covT = c => (c === 'PORT' ? '全港' : '僅本公司船舶');
  const item = (vid, text) => ({ vid, text });
  const lvIdx = (v, p) => (v >= p.high ? 'high' : v >= p.mid ? 'mid' : 'low');

  K.cargo_stock = p => {
    if (!CG.orgOk()) return nd(NOORG);
    const ut = CG.util(), stale = ut.filter(x => x.stale), neg = C.inv.filter(r => r[4]).length;
    const lv = stale.length ? (stale.length / ut.length >= 0.25 ? 'high' : 'mid') : 'low';
    // 空櫃存量地圖（blocks_stockmap.js）載入時，加上目前所選櫃型的港口缺櫃概況；等級仍只看存量是否過期
    const SM = U.stockMap, sv = (U.STATE.view || {}).stockmap, gid = sv ? sv.g : 'all', g = SM && SM.GROUPS.find(x => x.id === gid);
    const P = SM ? SM.agg(gid) : [], nH = P.filter(x => x.risk === '要處理').length, nM = P.filter(x => x.risk === '留意').length;
    const by = SM ? `；目前看「${g ? g.name : '全部'}」：${P.length} 個港口中要處理 ${nH} 港、留意 ${nM} 港（缺櫃細節見「缺櫃預估」）` : '';
    return { level: lv, summary: `${ut.length} 個場站中 ${stale.length} 個存量過期（超過 ${p.stale_hr} 小時沒更新）${neg ? '；存量為負數的 ' + neg + ' 筆紀錄已排除' : ''}${by}`,
      items: stale.map(x => item(null, `${x.yard}（${pn(x.unlo)}）　最後更新 ${String(x.last).replace('T', ' ')}`)) };
  };

  K.yard_util = p => {
    if (!CG.orgOk()) return nd(NOORG);
    const ut = CG.util(), noCap = ut.filter(x => x.cap == null), valid = ut.filter(x => x.u != null && !x.stale), over = valid.filter(x => x.u > 1), ok = valid.filter(x => x.u <= 1);
    if (!ok.length) return nd('沒有可判斷的場站（缺容量或存量過期）');
    let lv = 'low';
    ok.forEach(x => (lv = worse(lv, lvIdx(x.u * 100, p))));
    const hi = ok.filter(x => x.u * 100 >= p.high), mi = ok.filter(x => x.u * 100 >= p.mid && x.u * 100 < p.high);
    const it = hi.concat(mi).sort((a, b) => b.u - a.u).slice(0, 6).map(x => item(null, `${x.yard}　使用率 ${fmt(x.u * 100, 0)}%（${fmt(x.teu, 0)} / ${fmt(x.cap, 0)} TEU）`));
    over.forEach(x => it.push(item(null, `${x.yard}　使用率 ${fmt(x.u * 100, 0)}%，資料異常（容量或存量有一個填錯）`)));
    return { level: lv, summary: `${hi.length} 個場站使用率 ${p.high}% 以上、${mi.length} 個在 ${p.mid}% 到 ${p.high}%；${noCap.length} 個沒有容量資料（N/A）、${over.length} 個超過 100%（資料異常，不算紅燈）`, items: it };
  };

  K.cargo_forecast = () => {
    if (!CG.orgOk()) return nd(NOORG);
    const all = CG.forecastAll();
    if (!all.length) return nd('沒有空櫃存量資料');
    const by = s => all.filter(r => r.status === s), hi = by('要處理'), mi = by('留意'), ok = by('正常'), no = by('資料不足');
    if (!hi.length && !mi.length && !ok.length) return nd('所有場站都因資料不足無法預估');
    const lv = hi.length ? 'high' : mi.length ? 'mid' : 'low';
    const list = (hi.length ? hi.slice().sort((a, b) => a.first - b.first || b.gap - a.gap) : mi.slice().sort((a, b) => a.first - b.first)).slice(0, 6);
    return { level: lv, summary: `${hi.length} 個場站櫃型預估缺櫃（要處理）、${mi.length} 個留意、${ok.length} 個正常；${no.length} 個因資料不足無法預估（存量過期）`,
      items: list.map(r => item(null, hi.length ? `${r.yard} ${r.ct} ${r.sz} 呎　第 ${r.first} 天缺櫃，缺口 ${fmt(r.gap, 0)} 個（${r.source.split('；')[0]}）` : `${r.yard} ${r.ct} ${r.sz} 呎　第 ${r.first} 天預估下緣低於安全存量`)) };
  };

  K.bulk_volume = p => {
    const B = CG.bulk(), tot = {}; B.month.forEach(([mi, d, v]) => (tot[mi] = (tot[mi] || 0) + v));
    if (!B.month.length) return nd('所選組織沒有貨量資料（船報不含貨量），需客戶提供散裝貨量（資料需求 D1）');
    const mi = STATE.mi, cur = tot[mi];
    if (cur == null) return nd('所選月份沒有散裝貨量資料');
    const prev = []; for (let i = 1; i <= p.window; i++) if (tot[mi - i] != null) prev.push(tot[mi - i]);
    if (prev.length < 3) return nd('前期資料不足，無法比較');
    const m = prev.reduce((a, b) => a + b, 0) / prev.length, chg = 100 * (cur - m) / m;
    const miss = B.missing.filter(x => x[0] === mi).reduce((a, x) => a + x[1], 0);
    const lv = chg <= -p.high ? 'high' : chg <= -p.mid ? 'mid' : 'low';
    return { level: lv, summary: `本月裝卸合計 ${fmt(cur / 1000, 0)} 千噸，對前 ${prev.length} 個月平均 ${chg >= 0 ? '+' : ''}${fmt(chg, 1)}%（低 ${p.mid}% 留意、低 ${p.high}% 要處理）${miss ? '；另有 ' + miss + ' 筆紀錄沒填數量，未計入' : ''}`, items: [] };
  };

  K.bulk_port = p => {
    const tot = {}; CG.bulk().port.forEach(([u, d, v]) => (tot[u] = (tot[u] || 0) + v));
    const L = Object.entries(tot).sort((a, b) => b[1] - a[1]), S = L.reduce((a, x) => a + x[1], 0);
    if (!L.length || !S) return nd('所選組織近 12 個月沒有貨量資料（船報不含貨量），需客戶提供散裝貨量（資料需求 D1）');
    const top = 100 * L[0][1] / S, lv = top >= p.high ? 'high' : top >= p.mid ? 'mid' : 'low';
    return { level: lv, summary: `最大的港口 ${pn(L[0][0])} 占 ${fmt(top, 0)}%，前三大合計 ${fmt(100 * L.slice(0, 3).reduce((a, x) => a + x[1], 0) / S, 0)}%（${p.mid}% 留意、${p.high}% 要處理）`,
      items: L.slice(0, 5).map(x => item(null, `${pn(x[0])}　${fmt(100 * x[1] / S, 1)}%`)) };
  };

  const portRows = off => CG.cong().filter(r => r.term == null && (off == null || r.off === off));

  K.congestion = p => {
    if (!CG.orgOk()) return nd(NOORG);
    const rows = portRows(0), w = rows.filter(r => r.idx != null && r.n >= p.min_n);
    if (!w.length) return nd(`各港口近 30 天樣本不足（少於 ${p.min_n} 艘次），不給塞港指數`);
    let lv = 'low'; w.forEach(r => (lv = worse(lv, lvIdx(r.idx, p))));
    const hi = w.filter(r => r.idx >= p.high), mi = w.filter(r => r.idx >= p.mid && r.idx < p.high), fleet = w.filter(r => r.cov === 'FLEET').length;
    return { level: lv, summary: `${hi.length} 個港口指數 ${p.high} 以上、${mi.length} 個在 ${p.mid} 到 ${p.high}；${rows.length - w.length} 個樣本不足（不給指數）${fleet ? '；其中 ' + fleet + ' 個港口的數字只涵蓋本公司船舶，不代表全港' : ''}`,
      items: w.slice().sort((a, b) => b.idx - a.idx).slice(0, 6).map(r => item(null, `${pn(r.unlo)}（${covT(r.cov)}）　指數 ${fmt(r.idx, 0)}　等待 ${r.wait} 艘`)) };
  };

  K.anchorage = p => {
    if (!CG.orgOk()) return nd(NOORG);
    const rows = portRows(0).filter(r => r.maxWait != null || r.wait === 0);
    if (!rows.length) return nd('沒有錨地資料');
    const waiting = rows.filter(r => r.wait > 0);
    if (!waiting.length) return { level: 'low', summary: '目前沒有船在錨地等待', items: [] };
    let lv = 'low'; waiting.forEach(r => (lv = worse(lv, r.maxWait >= p.high ? 'high' : r.maxWait >= p.mid ? 'mid' : 'low')));
    return { level: lv, summary: `${waiting.length} 個港口有船在等；最長已等 ${fmt(Math.max(...waiting.map(r => r.maxWait)), 0)} 小時（${p.mid} 小時留意、${p.high} 小時要處理）`,
      items: waiting.slice().sort((a, b) => b.maxWait - a.maxWait).slice(0, 5).map(r => item(null, `${pn(r.unlo)}（${covT(r.cov)}）　在錨 ${r.wait} 艘，最長已等 ${fmt(r.maxWait, 0)} 小時`)) };
  };

  K.wait_trend = p => {
    if (!CG.orgOk()) return nd(NOORG);
    const res = CG.waitTrend(p.min_calls).filter(r => r.chg != null);
    if (!res.length) return nd('每天進泊船數太少（少於 ' + p.min_calls + ' 艘的日子不計），無法比較本週與上週');
    let lv = 'low'; res.forEach(r => (lv = worse(lv, r.chg >= p.high ? 'high' : r.chg >= p.mid ? 'mid' : 'low')));
    const up = res.filter(r => r.chg >= p.mid);
    return { level: lv, summary: `${res.length} 個港口可比較；${up.length} 個本週平均等泊時間比上週增加 ${p.mid}% 以上（${p.high}% 要處理）`,
      items: res.slice().sort((a, b) => b.chg - a.chg).slice(0, 5).map(r => item(null, `${pn(r.unlo)}（${covT(r.cov)}）　本週 ${fmt(r.a, 1)} 小時，上週 ${fmt(r.b, 1)} 小時（${r.chg >= 0 ? '+' : ''}${fmt(r.chg, 0)}%）`)) };
  };

  const arr = () => {
    const bulk = STATE.type === 'bulk';
    return CG.arrivals().filter(a => a.status === 'EXPECTED' && (bulk ? (a.org === 1 || a.org === 2) : a.org === 3));
  };

  K.position_stale = p => {
    if (STATE.type !== 'bulk' && !CG.orgOk()) return nd(NOORG);
    const own = {}; arr().filter(a => a.vid != null).forEach(a => (own[a.vid] = a));
    const L = Object.values(own);
    if (!L.length) return nd('沒有本公司船舶的位置資料');
    const stale = L.filter(a => a.posT && (CG.NOW - t(a.posT)) / HR > p.hours);
    const pct = 100 * stale.length / L.length;
    const lv = !stale.length ? 'low' : pct >= p.high_pct ? 'high' : 'mid';
    return { level: lv, summary: `${L.length} 艘船中 ${stale.length} 艘位置超過 ${p.hours} 小時沒更新（占 ${fmt(pct, 0)}%；${p.high_pct}% 以上要處理）`,
      items: stale.map(a => item(a.vid, `${a.name}　最後位置 ${String(a.posT).replace('T', ' ').slice(0, 16)}`)) };
  };

  K.arrival_eta = p => {
    if (STATE.type !== 'bulk' && !CG.orgOk()) return nd(NOORG);
    const L = arr();
    if (!L.length) return nd('沒有即將到港的船');
    const both = L.filter(a => a.etaRep && a.etaCalc), noCalc = L.filter(a => !a.etaCalc).length;
    if (!both.length) return nd('沒有可比較回報與計算 ETA 的預報');
    const gaps = both.map(a => ({ a, g: Math.abs(t(a.etaRep) - t(a.etaCalc)) / HR })), big = gaps.filter(x => x.g > p.gap_hr), pct = 100 * big.length / both.length;
    const lv = pct >= p.high_pct ? 'high' : pct >= p.mid_pct ? 'mid' : 'low';
    return { level: lv, summary: `${both.length} 筆預報中 ${big.length} 筆回報與計算 ETA 差超過 ${p.gap_hr} 小時（占 ${fmt(pct, 0)}%；${p.mid_pct}% 留意、${p.high_pct}% 要處理）${noCalc ? '；' + noCalc + ' 筆因位置過期沒有計算 ETA' : ''}`,
      items: big.sort((x, y) => y.g - x.g).slice(0, 6).map(x => item(x.a.vid, `${x.a.name || x.a.imo}　${pn(x.a.unlo)}　落差 ${fmt(x.g, 0)} 小時`)) };
  };
})();
