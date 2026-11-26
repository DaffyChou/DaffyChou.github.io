/* 卸櫃量（cargo-usage-ideas 1＋2）：本公司船到各港預計卸下的貨櫃（TEU），與風險判讀。
   來源：UI_CARGO.vcargo[vid][7]＝船上貨櫃依卸貨港分配（下一港起最多 4 港）：[港口, 滿櫃, 空櫃, 冷櫃, 危險櫃]（冷、危是滿櫃的一部分）。
   時間：和靠泊時程同一份靠泊資料（UI_CARGO.berth.own），依「靠泊時間」落在港口當地的哪一天分格（前 2 天＋今天＋後 4 天）。
   還沒靠泊＝預估（依船上貨櫃與卸貨港）；已靠泊或已離港＝實際（靠港紀錄的卸櫃 TEU，UI_CALLS.tdis；沒有滿／空／冷／危明細）。
   點熱度表格子後，下方時間軸只看那個港、並捲到那一天，船與卸櫃量對得起來。 */
(function () {
  'use strict';
  const U = window.UI, K = U && U.risk && U.risk.K;
  if (!U || !U.cargo) return;
  const CG = U.cargo, C = CG.C, HR = 3600000, ts = s => Date.parse(s + 'Z');
  // 某艘船在某港預計卸下的貨櫃；沒有資料回 null
  U.unloadAt = (vid, unlo) => {
    const v = (C.vcargo || {})[vid], L = v && v[7];
    const r = L && L.find(x => x[0] === unlo);
    return r ? { lad: r[1], emp: r[2], rf: r[3], dg: r[4], tot: r[1] + r[2] } : null;
  };
  const tsm = s => (s ? Date.parse(s + ':00Z') : null);
  // 已靠泊／已離港的實際卸櫃：靠港紀錄中同船、同港、到港時間相差 6 小時內的那一次
  U.unloadActual = (vid, unlo, arr) => {
    const L = U.risk.rows('calls').filter(r => r.vid === vid && r.port === unlo && r.tdis != null && r.nor);
    const r = L.map(x => ({ x, d: Math.abs(ts(x.nor) - arr) })).filter(z => z.d < 6 * HR).sort((a, b) => a.d - b.d)[0];
    return r ? { tot: r.x.tdis, actual: true } : null;
  };
  // 一筆靠泊的卸櫃量：還沒靠泊＝預估；已靠泊或已離港＝實際
  U.unloadOf = (vid, unlo, af, arr) => (af > CG.NOW ? U.unloadAt(vid, unlo) : U.unloadActual(vid, unlo, arr || af));
  // 熱度表的天數：前 PAST 天＋今天＋之後，共 days 天（港口當地日期；day＝相對今天，負＝過去）
  U.unloadPlan = (days, ports, past) => {
    if (!CG.orgOk()) return [];
    past = past == null ? 2 : past;
    const now = CG.NOW, tz = (C.berth || {}).tz || {}, off = u => (U.berthGantt && U.berthGantt.tzOff ? U.berthGantt.tzOff(tz[u], now) : 0);
    return ((C.berth || {}).own || []).map(r => {
      const vid = r[0], unlo = r[2], af = tsm(r[5]), arr = tsm(r[4]) || af; if (af == null || (ports && !ports.has(unlo))) return null;
      const o = off(unlo), d0 = Math.floor((now + o) / (24 * HR)) * 24 * HR, day = Math.floor((af + o - d0) / (24 * HR));
      if (day < -past || day >= days - past) return null;
      const u = U.unloadOf(vid, unlo, af, arr);
      return u ? { vid, name: r[1] || '', a: { name: r[1] || '' }, unlo, term: r[3], af, day, u, actual: !!u.actual } : null;
    }).filter(Boolean);
  };
  // 港口當地某一天（相對今天）的起訖（UTC 毫秒）：點熱度表格子後，靠泊時程捲到那一天
  U.unloadDayRange = (unlo, day) => {
    const tz = ((C.berth || {}).tz || {})[unlo], o = U.berthGantt && U.berthGantt.tzOff ? U.berthGantt.tzOff(tz, CG.NOW) : 0;
    const s0 = Math.floor((CG.NOW + o) / (24 * HR)) * 24 * HR - o + day * 24 * HR;
    return [s0, s0 + 24 * HR];
  };
  if (!K) return;
  const nd = s => ({ level: 'nodata', summary: s, items: [] });
  const fmt = U.fmt, pn = u => (U.ports ? U.ports(u) : u);
  const scope = () => { const rp = U.opsFilt ? U.opsFilt.regPorts() : null, pk = ((U.berthView || {}).ports || []); if (!pk.length) return rp; return new Set(pk.filter(u => !rp || rp.has(u))); };   // 區域／航線＋港口複選
  // 港口 × 天熱度表：單一港口單日卸櫃量達門檻
  K.unload_heat = p => {
    if (!CG.orgOk()) return nd('此組織沒有運務資料（只有「模擬貨櫃公司」有）');
    const L = U.unloadPlan(p.days, scope(), p.past).filter(x => x.day >= 0); if (!L.length) return nd('今天起這個範圍沒有本公司船的卸櫃資料');   // 判讀只看今天以後（過去的已發生）
    const cell = {}; L.forEach(x => { const k = x.unlo + '|' + x.day; cell[k] = (cell[k] || 0) + x.u.tot; });
    const E = Object.entries(cell).sort((a, b) => b[1] - a[1]), top = E[0], [u, d] = top[0].split('|');
    const hi = E.filter(e => e[1] >= p.high).length, mi = E.filter(e => e[1] >= p.mid && e[1] < p.high).length;
    const tot = L.reduce((s, x) => s + x.u.tot, 0);
    return { level: hi ? 'high' : mi ? 'mid' : 'low',
      summary: `今天起 ${p.days - (p.past || 0)} 天本公司船卸 ${fmt(tot, 0)} TEU；最集中是 ${pn(u)} ${+d === 0 ? '今天' : '第 ' + d + ' 天'} ${fmt(top[1], 0)} TEU（單港單日 ${p.mid} TEU 留意、${p.high} TEU 要處理；${hi} 格要處理、${mi} 格留意）`,
      items: E.filter(e => e[1] >= p.mid).slice(0, 12).map(([k, v]) => { const [uu, dd] = k.split('|'); return { vid: null, text: `${pn(uu)}　${+dd === 0 ? '今天' : '第 ' + dd + ' 天'}　${fmt(v, 0)} TEU` }; }) };
  };
  // 卸櫃量預估表：危險櫃多的船先通知碼頭
  K.unload_list = (p, c) => {
    if (!U.berthScope) return nd('靠泊時程元件未載入');
    const NOW = CG.NOW, L = (U.berthScope(c.vids).list || []).filter(x => x.own && x.dep > NOW && x.af > NOW).map(x => ({ x, u: U.unloadAt(x.vid, x.unlo) })).filter(r => r.u);   // 判讀看還沒靠泊的（要提早通知碼頭）
    if (!L.length) return nd('靠泊時程內沒有本公司船的卸櫃資料');
    const dg = L.filter(r => r.u.dg >= p.dg_mid), big = L.filter(r => r.u.tot >= p.tot_mid), tot = L.reduce((s, r) => s + r.u.tot, 0);
    return { level: dg.length || big.length ? 'mid' : 'low',
      summary: `${L.length} 航次預計卸 ${fmt(tot, 0)} TEU；危險櫃 ${p.dg_mid} TEU 以上 ${dg.length} 航次、單次卸 ${p.tot_mid} TEU 以上 ${big.length} 航次` + (dg.length || big.length ? '（留意：提早通知碼頭安排人力與危險品作業）' : ''),
      items: dg.concat(big.filter(r => !dg.includes(r))).slice(0, 12).map(r => ({ vid: r.x.vid, text: `${r.x.name}　${pn(r.x.unlo)} ${r.x.term}　卸 ${fmt(r.u.tot, 0)} TEU（危 ${fmt(r.u.dg, 0)}）` })) };
  };
})();
