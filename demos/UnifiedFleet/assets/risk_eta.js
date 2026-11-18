/* ETA 對實際到港（ATA）與港內作業周轉（eta-ata-turnaround）：圖與風險判讀共用的計算。
   資料：UI_CALLS 的 erep／ecal＝實際到港 − 抵港前 24 小時當時的回報 ETA／計算 ETA（小時；正＝實際比預測晚）；
         wplan＝開工時碼頭給的預計作業時數（預計完工 − 開工）。只算貨櫃船的裝卸靠港、近 6 個月。
   浪費的時間（使用者確認的定義）：
     早到 → 實際到港比回報 ETA 早 1 小時以上時，等泊超過該港正常等泊（期間中位數）的部分＝錨地多等；
     晚到 → 實際到港比船期表（計畫 ETA）晚時，晚的小時數＝已排好的泊位窗口空等（以計畫靠泊窗口長度為上限）。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U || !U.risk) return;
  const R = n => U.risk.rows(n), H = (a, b) => (a && b ? (Date.parse(b) - Date.parse(a)) / 3600000 : null);
  let SC = null;                                                  // 航線編號 → 航線代碼
  const svcOf = vid => { if (!SC) { SC = {}; (U.M.services || []).forEach(x => (SC[x.id] = x.code)); } const v = (U.VBY[vid] || {}).svc; return v == null ? '' : SC[v] || String(v); };
  // 近 6 個月、範圍內船舶的貨櫃裝卸靠港（含預測紀錄）
  function calls(vids, mi) {
    const lo = U.months[Math.max(0, mi - 5)] + '-01', hi = U.months[mi] + '-32', set = new Set(vids);
    return R('calls').filter(r => set.has(r.vid) && r.nor >= lo && r.nor <= hi && (r.role === 'LOAD' || r.role === 'DISCHARGE') && r.erep != null);
  }
  // 每港正常等泊（中位數）：用同期全部靠港
  function normWait(L) { const by = {}; L.forEach(r => (by[r.port] = by[r.port] || []).push((r.aw || 0) + (r.dw || 0))); const o = {}; Object.keys(by).forEach(k => (o[k] = U.median(by[k]))); return o; }
  function wasteOf(r, nw) {
    const wait = (r.aw || 0) + (r.dw || 0), early = r.erep < -1 ? Math.max(0, wait - (nw[r.port] || 0)) : 0;
    const win = H(r.peta, r.petd), late = r.dly > 0 ? Math.min(r.dly, win > 0 ? win : r.dly) : 0;
    return { early, late };
  }
  // ETA 準確度，依航線（by='svc'）或港口（by='port'）分組
  U.etaStats = (vids, mi, by) => {
    const L = calls(vids, mi), nw = normWait(L), g = {};
    L.forEach(r => {
      const k = by === 'port' ? r.port : svcOf(r.vid); if (!k) return;
      const o = g[k] || (g[k] = { k, n: 0, rep: [], cal: [], early: 0, late: 0, nEarly: 0, nLate: 0 });
      const w = wasteOf(r, nw);
      o.n++; o.rep.push(r.erep); o.cal.push(r.ecal); o.early += w.early; o.late += w.late; if (w.early > 0) o.nEarly++; if (w.late > 0) o.nLate++;
    });
    const abs = a => U.mean(a.map(Math.abs));
    const rows = Object.values(g).map(o => ({ k: o.k, n: o.n, rep: U.mean(o.rep), cal: U.mean(o.cal), repAbs: abs(o.rep), calAbs: abs(o.cal), early: o.early, late: o.late, nEarly: o.nEarly, nLate: o.nLate, thin: o.n < 5 }));
    const all = { n: L.length, repAbs: abs(L.map(r => r.erep)), calAbs: abs(L.map(r => r.ecal)), early: rows.reduce((s, x) => s + x.early, 0), late: rows.reduce((s, x) => s + x.late, 0) };
    return { rows: rows.sort((a, b) => b.repAbs - a.repAbs), all };
  };
  // 港內作業周轉，依港口：預計作業 vs 實際作業
  U.turnStats = (vids, mi) => {
    const g = {};
    calls(vids, mi).forEach(r => {
      const act = H(r.ws, r.we); if (!(act > 0.5) || !(r.wplan > 0.5)) return;
      const o = g[r.port] || (g[r.port] = { port: r.port, n: 0, act: [], plan: [], over: [], ok: 0 });
      o.n++; o.act.push(act); o.plan.push(r.wplan); o.over.push(act - r.wplan); if (act - r.wplan <= 1) o.ok++;
    });
    return Object.values(g).map(o => ({ port: o.port, n: o.n, act: U.mean(o.act), plan: U.mean(o.plan), over: U.mean(o.over), ratio: U.mean(o.act) / U.mean(o.plan), onTime: 100 * o.ok / o.n, thin: o.n < 3 }));
  };

  const K = U.risk.K; if (!K) return;
  const nd = s => ({ level: 'nodata', summary: s, items: [] });
  // ETA 準確度：回報 ETA 平均絕對誤差（小時）
  K.eta_acc = (p, c) => {
    const ids = U.opsFilt && U.opsFilt.vids ? U.opsFilt.vids() : c.vids, S = U.etaStats(ids, c.mi, 'svc');
    if (!S.all.n) return nd('近 6 個月沒有可比較的預測紀錄');
    const a = S.all, lv = a.repAbs >= p.high ? 'high' : a.repAbs >= p.mid ? 'mid' : 'low', bad = S.rows.filter(r => !r.thin && r.repAbs >= p.mid);
    return { level: lv, summary: `近 6 個月 ${a.n} 次靠港：抵港前 24 小時的回報 ETA 平均差 ${U.fmt(a.repAbs, 1)} 小時、計算 ETA 平均差 ${U.fmt(a.calAbs, 1)} 小時（回報 ${p.mid} 小時留意、${p.high} 小時要處理）；早到錨地多等 ${U.fmt(a.early, 0)} 小時、晚到泊位空等 ${U.fmt(a.late, 0)} 小時`,
      items: bad.slice(0, 10).map(r => ({ vid: null, text: `${r.k}　回報平均差 ${U.fmt(r.repAbs, 1)} 小時（${r.rep >= 0 ? '多半比回報晚到' : '多半比回報早到'}）、計算 ${U.fmt(r.calAbs, 1)} 小時，${r.n} 次` })) };
  };
})();
