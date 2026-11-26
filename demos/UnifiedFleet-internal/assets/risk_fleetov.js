/* 船隊營運總覽（fleet-overview-replan）的共用計算與風險判讀：
   - 航線績效：每條航線的船數、準點率（本月、近 6 個月）、到港延誤、艙位利用率、裝卸 TEU、每箱燃油、警報
   - 延誤原因歸納：每次靠港的到港延誤拆成「上一港傳遞」「航行段」，加上港內的「等泊（超過該港平常）」「作業超時」
   - 裝卸量趨勢：每月卸櫃、裝櫃 TEU（依航線或港口）
   圖（fleet_routes.js）與判讀用同一份計算，數字一致。 */
(function () {
  'use strict';
  const U = window.UI; if (!U || !U.risk) return;
  const K = U.risk.K, { fmt, months, val, STATE } = U;
  const R = n => U.risk.rows(n);
  const HR = 3600000, ts = s => (s ? Date.parse(s.length <= 16 ? s + ':00Z' : s + 'Z') : null);
  const pn = u => (U.ports ? U.ports(u) : u);
  const nd = s => ({ level: 'nodata', summary: s, items: [] });
  const codeOf = id => { const v = U.VBY[id], s = v && (U.M.services || []).find(x => x.id === v.svc); return s ? s.code : null; };
  const svcName = code => ((U.M.services || []).find(x => x.code === code) || {}).name || '';
  const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
  const own = () => U.scopeVessels().filter(v => v.type === 'container').map(v => v.id);
  const inMonth = (s, mi) => !!s && s.slice(0, 7) === months[mi];
  const lo6 = mi => months[Math.max(0, mi - 5)] + '-01', hi6 = mi => months[mi] + '-32';

  // ---------------- 航線績效
  function routes(vids, mi) {
    const g = {};
    vids.forEach(id => { const c = codeOf(id); if (c) (g[c] = g[c] || []).push(id); });
    const calls = R('calls');
    return Object.entries(g).map(([code, ids]) => {
      const set = new Set(ids), cm = calls.filter(r => set.has(r.vid) && inMonth(r.nor, mi)), c6 = calls.filter(r => set.has(r.vid) && r.dly != null && r.nor >= lo6(mi) && r.nor < hi6(mi));
      const teu = cm.reduce((s, r) => s + (r.tdis || 0) + (r.tload || 0), 0), fuel = ids.reduce((s, id) => s + (val('FUEL_TOTAL', id, mi) || 0), 0);
      let al = 0, alHi = 0; ids.forEach(id => { const a = U.vesselAlerts ? U.vesselAlerts(id) : { n: 0, hi: 0 }; al += a.n; alHi += a.hi; });
      return { code, name: svcName(code), ids, n: ids.length, otp: U.fleetAt('OTP', ids, mi, 'mean'), otp6: c6.length >= 3 ? 100 * c6.filter(r => r.dly <= 6).length / c6.length : null,
        delay: U.fleetAt('ARR_DELAY', ids, mi, 'mean'), slot: U.fleetAt('SLOT_UTIL', ids, mi, 'mean'), teu, fpt: teu > 0 ? fuel / teu : null, al, alHi };
    }).sort((a, b) => (a.otp == null ? 999 : a.otp) - (b.otp == null ? 999 : b.otp));
  }

  // ---------------- 延誤原因歸納（近 6 個月）：by＝'svc'（航線）或 'port'（港口）
  function delays(vids, mi, by) {
    const set = new Set(vids), calls = R('calls').filter(r => set.has(r.vid) && r.nor && r.nor < hi6(mi)).sort((a, b) => (a.vid - b.vid) || (a.nor < b.nor ? -1 : 1));
    const W = {}; calls.forEach(r => { if (r.nor >= lo6(mi)) (W[r.port] = W[r.port] || []).push((r.aw || 0) + (r.dw || 0)); });
    const MW = Object.fromEntries(Object.entries(W).map(([p, a]) => [p, median(a) || 0]));   // 各港平常等泊（中位數）
    const LG = {}; R('ledger').forEach(r => { if (r.bft != null) (LG[r.vid] = LG[r.vid] || []).push([ts(r.t), r.bft]); });
    const g = {};
    calls.forEach((r, i) => {
      if (r.nor < lo6(mi) || r.dly == null) return;
      const prev = i > 0 && calls[i - 1].vid === r.vid ? calls[i - 1] : null, k = by === 'port' ? r.port : codeOf(r.vid); if (!k) return;
      const arr = Math.max(0, r.dly), pd = prev && prev.dly2 != null ? Math.max(0, prev.dly2) : 0, prop = Math.min(arr, pd), sea = arr - prop;
      const wait = Math.max(0, (r.aw || 0) + (r.dw || 0) - (MW[r.port] || 0)), work = r.ws && r.we ? (ts(r.we) - ts(r.ws)) / HR : null, over = work != null && r.wplan != null ? Math.max(0, work - r.wplan) : 0;
      let bft = null; if (prev && prev.dep && LG[r.vid]) { const a = ts(prev.dep), b = ts(r.nor), xs = LG[r.vid].filter(x => x[0] >= a && x[0] <= b).map(x => x[1]); if (xs.length) bft = xs.reduce((s, x) => s + x, 0) / xs.length; }
      const o = g[k] || (g[k] = { k, n: 0, prop: 0, sea: 0, wait: 0, over: 0, arr: 0, bs: 0, bn: 0 });
      o.n++; o.prop += prop; o.sea += sea; o.wait += wait; o.over += over; o.arr += arr; if (bft != null) { o.bs += bft; o.bn++; }
    });
    return Object.values(g).filter(o => o.n >= 3).map(o => ({ k: o.k, n: o.n, prop: o.prop / o.n, sea: o.sea / o.n, wait: o.wait / o.n, over: o.over / o.n, arr: o.arr / o.n, bft: o.bn ? o.bs / o.bn : null, tot: (o.prop + o.sea + o.wait + o.over) / o.n }))
      .sort((a, b) => b.tot - a.tot);
  }

  // ---------------- 裝卸量（每月卸櫃、裝櫃 TEU；依航線或港口）
  function volume(vids, by) {
    const set = new Set(vids), g = {};
    R('calls').forEach(r => { if (!set.has(r.vid) || !r.nor) return; const mi = months.indexOf(r.nor.slice(0, 7)); if (mi < 0) return; const k = by === 'port' ? r.port : codeOf(r.vid); if (!k) return;
      const o = g[k] || (g[k] = { k, dis: months.map(() => 0), load: months.map(() => 0), tot: 0 }); o.dis[mi] += r.tdis || 0; o.load[mi] += r.tload || 0; o.tot += (r.tdis || 0) + (r.tload || 0); });
    return Object.values(g).sort((a, b) => b.tot - a.tot);
  }
  const monthTeu = (vids, mi) => { const set = new Set(vids); return R('calls').filter(r => set.has(r.vid) && inMonth(r.nor, mi)).reduce((s, r) => s + (r.tdis || 0) + (r.tload || 0), 0); };
  U.fleetOv = { routes, delays, volume, monthTeu, own, codeOf, svcName };

  if (!K) return;
  const lv3 = (v, mid, high, below) => (v == null ? 'nodata' : below ? (v < high ? 'high' : v < mid ? 'mid' : 'low') : (v >= high ? 'high' : v >= mid ? 'mid' : 'low'));
  // 船期代表卡：全船隊本月準點率；附最差的 3 條航線
  K.ov_sched = (p, c) => {
    const ids = own(), v = U.fleetAt('OTP', ids, c.mi, 'mean'); if (v == null) return nd('本月沒有準點率資料');
    const rs = routes(ids, c.mi).filter(r => r.otp != null).slice(0, 3);
    return { level: lv3(v, p.mid, p.high, true), summary: `全船隊本月準點率 ${fmt(v, 0)}%（低於 ${p.mid}% 留意、${p.high}% 要處理）；最差的航線：${rs.map(r => r.code + ' ' + fmt(r.otp, 0) + '%').join('、') || '—'}`, items: [] };
  };
  // 港口代表卡：港口等級最差的幾港（同港口運務板）
  K.ov_ports = (p) => {
    if (!U.portBoard || !U.cargo.orgOk()) return nd('此組織沒有運務資料');
    const B = U.portBoard(), hi = B.filter(b => b.level === 'high'), mid = B.filter(b => b.level === 'mid');
    if (!B.length) return nd('沒有港口資料');
    return { level: hi.length ? 'high' : mid.length ? 'mid' : 'low', summary: `${B.length} 個港口中，要處理 ${hi.length} 港、留意 ${mid.length} 港` + (hi.length ? `（${hi.slice(0, p.top).map(b => b.name).join('、')}）` : ''), items: [] };
  };
  // 貨量代表卡、裝卸量趨勢：本月裝卸 TEU 比上月減少的幅度
  const volLv = (p, c, label) => {
    const ids = own(), a = monthTeu(ids, c.mi), b = c.mi > 0 ? monthTeu(ids, c.mi - 1) : 0;
    if (!b) return nd('上月沒有裝卸資料，無法比較');
    const d = 100 * (b - a) / b, s = U.fleetAt('SLOT_UTIL', ids, c.mi, 'mean');
    return { level: lv3(d, p.mid, p.high), summary: `${label}本月裝卸 ${fmt(a, 0)} TEU，上月 ${fmt(b, 0)} TEU（${d >= 0 ? '減少' : '增加'} ${fmt(Math.abs(d), 0)}%；減少 ${p.mid}% 留意、${p.high}% 要處理）` + (s != null ? `；艙位利用率 ${fmt(s, 1)}%` : ''), items: [] };
  };
  K.ov_cargo = (p, c) => volLv(p, c, '');
  K.ov_vol = (p, c) => volLv(p, c, '全船隊');
  // 法遵代表卡：最新年度的碳強度評級分布（同清單「碳強度評級」）
  K.ov_cii = () => {
    const cnt = { A: 0, B: 0, C: 0, D: 0, E: 0 }; let n = 0;
    own().forEach(id => { const t = ((U.risk.byVessel(id) || {}).cii || {}).text || '', k = t.trim().charAt(0); if (cnt[k] != null) { cnt[k]++; n++; } });
    if (!n) return nd('沒有已評級的碳強度資料');
    const A = U.envAgg, ids = own(), y = A && A.ciiLatestYear ? A.ciiLatestYear(ids) : null, nx = y != null && A.ciiNextYear ? A.ciiNextYear(ids, y) : [];
    return { level: cnt.E ? 'high' : cnt.D || nx.length ? 'mid' : 'low', summary: `${n} 艘已評級：A ${cnt.A}、B ${cnt.B}、C ${cnt.C}、D ${cnt.D}、E ${cnt.E} 艘（D 留意、E 要處理）；明年可能掉級 ${nx.length} 艘`, items: [] };
  };
  // 航線績效：最差航線的本月準點率
  K.ov_routes = (p, c) => {
    const ids = U.opsFilt && U.opsFilt.vids ? U.opsFilt.vids() : own(), rs = routes(ids, c.mi).filter(r => r.otp != null);
    if (!rs.length) return nd('沒有航線準點率資料');
    const bad = rs.filter(r => r.otp < p.mid), w = rs[0];
    return { level: lv3(w.otp, p.mid, p.high, true), summary: `${rs.length} 條航線中，${bad.length} 條本月準點率低於 ${p.mid}%；最差的是 ${w.code}（${fmt(w.otp, 0)}%）`,
      items: bad.map(r => ({ vid: null, text: `${r.code}　本月準點率 ${fmt(r.otp, 0)}%、平均到港延誤 ${r.delay == null ? '—' : fmt(r.delay, 1) + ' 小時'}` })) };
  };
  // 延誤原因：平均每次靠港到港延誤最大的航線；摘要寫出最大的原因
  K.ov_delay = (p, c) => {
    const ids = U.opsFilt && U.opsFilt.vids ? U.opsFilt.vids() : own(), D = delays(ids, c.mi, 'svc');
    if (!D.length) return nd('近 6 個月靠港樣本不足');
    const w = D.slice().sort((a, b) => b.arr - a.arr)[0], parts = [['上一港傳遞', w.prop], ['航行段', w.sea], ['港口等泊', w.wait], ['港內作業超時', w.over]].sort((a, b) => b[1] - a[1]);
    return { level: lv3(w.arr, p.mid, p.high), summary: `平均到港延誤最大的是 ${w.k}（每次 ${fmt(w.arr, 1)} 小時，${p.mid} 小時留意、${p.high} 小時要處理）；最大的原因是「${parts[0][0]}」${fmt(parts[0][1], 1)} 小時`,
      items: D.slice(0, 8).map(o => ({ vid: null, text: `${o.k}　上一港傳遞 ${fmt(o.prop, 1)}、航行段 ${fmt(o.sea, 1)}、等泊 ${fmt(o.wait, 1)}、作業超時 ${fmt(o.over, 1)} 小時（${o.n} 次）` })) };
  };
})();
