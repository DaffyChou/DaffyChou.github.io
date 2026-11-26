/* 運務板：每個港口的等級與建議動作。等級取三項最差者：塞港指數、最長等待、本週對上週等泊變化；
   三項都沒有資料時是「資料不足」，不用 0 代替。門檻來自 M13-c3 的規格（data/risk.js）。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C, { fmt, STATE } = U, K = U.risk.K;
  const HR = 3600000, ts = s => Date.parse(s + 'Z');
  const pn = u => (U.ports ? U.ports(u) : u);
  const RANK = { nodata: -1, low: 0, mid: 1, high: 2 };
  const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);
  const EU = new Set(['NL', 'DE', 'BE', 'FR', 'ES', 'IT', 'GR', 'PT', 'IE', 'DK', 'SE', 'FI', 'PL', 'HR', 'SI', 'MT', 'CY', 'EE', 'LV', 'LT', 'RO', 'BG']);
  const P = () => Object.assign({ mid: 120, high: 150, min_n: 5, wait_mid: 24, wait_high: 48, chg_mid: 30, chg_high: 60, min_calls: 3, horizon_hr: 72 }, (U.RK.blocks['M13-c3'] || {}).params || {});

  // 每個港口一列（優先全港資料）；只含貨櫃船運務資料
  function portBoard() {
    if (!CG.orgOk()) return [];
    const p = P(), cong = {};
    CG.cong().filter(r => r.off === 0 && r.term == null).forEach(r => { if (!cong[r.unlo] || r.cov === 'PORT') cong[r.unlo] = r; });
    const trend = CG.waitTrend(p.min_calls);
    const arr = CG.arrivals().filter(a => a.status === 'EXPECTED' && a.org === 3 && a.vid != null && a.unlo);
    const svc = {}; (U.M.services || []).forEach(s => s.ports.forEach(u => (svc[u] = svc[u] || new Set()).add(s.code)));
    return Object.keys(cong).map(u => {
      const r = cong[u], tr = trend.find(x => x.unlo === u && x.cov === r.cov), meta = U.M.ports[u] || {};
      const idx = r.n >= p.min_n && r.idx != null ? r.idx : null, mw = r.maxWait, chg = tr && tr.chg != null ? tr.chg : null;
      const comp = [];
      if (idx != null) comp.push([idx >= p.high ? 'high' : idx >= p.mid ? 'mid' : 'low', `塞港指數 ${fmt(idx, 0)}`]);
      if (mw != null) comp.push([mw >= p.wait_high ? 'high' : mw >= p.wait_mid ? 'mid' : 'low', `最長已等 ${fmt(mw, 0)} 小時`]);
      if (chg != null) comp.push([chg >= p.chg_high ? 'high' : chg >= p.chg_mid ? 'mid' : 'low', `本週等泊比上週${chg >= 0 ? '增加' : '減少'} ${fmt(Math.abs(chg), 0)}%`]);
      let level = comp.length ? 'low' : 'nodata'; comp.forEach(c => (level = worse(level, c[0])));
      const toward = arr.filter(a => { const e = a.etaCalc || a.etaRep; return e && ts(e) - CG.NOW <= p.horizon_hr * HR && ts(e) - CG.NOW > -24 * HR; })
        .filter(a => a.unlo === u).sort((a, b) => ts(a.etaCalc || a.etaRep) - ts(b.etaCalc || b.etaRep))
        .map((a, i, L) => Object.assign({}, a, { nCalls: a.vid == null ? 1 : L.filter(x => x.vid === a.vid).length, dup: a.vid != null && L.findIndex(x => x.vid === a.vid) !== i }))
        .filter(a => !a.dup);                                             // 同一艘船在期間內多次靠港只列一次（取最早一次），另記次數
      const bad = comp.filter(c => c[0] !== 'low').map(c => c[1]);
      const days = Math.round(p.horizon_hr / 24);
      let action = '';
      if (level === 'high' || level === 'mid') action = `${bad.join('、')}；` + (toward.length ? `${toward.length} 艘將於 ${days} 天內到港，建議提早通知代理並預留等泊時間` : `${days} 天內沒有本公司船要到，持續觀察`);
      else if (level === 'low') action = '目前正常，不需動作';
      return { unlo: u, name: pn(u), cc: meta.cc, eu: EU.has(meta.cc), eca: !!meta.eca, row: r, cov: r.cov, idx, wait: r.wait, berthed: r.berthed, tw: r.tw, tb: r.tb, maxWait: mw, avgWait: r.avgWait, avgStay: r.avgStay,
        newA: r.newA, newB: r.newB, chg, trend: tr || null, level, comp, toward, nToward: toward.length, svc: [...(svc[u] || [])].sort(), action };
    });
  }

  // 壅塞預測（模擬）：未來 7 天的簡單排隊模型。用目前在錨、在泊船數，加上本公司船舶的預計到港，並假設每個泊位平均停靠時數不變。
  // 預測塞港指數＝（正常等待＋排隊等待）÷ 正常等待 × 100。樣本不足的港口不預測。這是模擬，不是統計預測。
  U.portForecast = function (u) {
    if (!CG.orgOk()) return { ok: false, reason: '此組織沒有運務資料' };
    const p = P(), rows = CG.cong().filter(r => r.off === 0 && r.term == null && r.unlo === u);
    const r = rows.find(x => x.cov === 'PORT') || rows[0];
    if (!r) return { ok: false, reason: '沒有這個港口的壅塞資料' };
    if (r.n < p.min_n || r.idx == null || !r.base || !r.avgStay) return { ok: false, reason: '樣本不足，無法預測' };
    const A = new Array(7).fill(0);
    CG.arrivals().filter(a => a.status === 'EXPECTED' && a.org === 3 && a.unlo === u && a.vid != null).forEach(a => { const e = a.etaCalc || a.etaRep; if (!e) return; const h = (ts(e) - CG.NOW) / HR; if (h >= 0 && h < 168) A[Math.floor(h / 24)]++; });
    const B = Math.max(r.berthed, 3), mu = B * 24 / r.avgStay, q0 = r.wait;   // 泊位數至少 3（全港資料只到在泊船數，避免低估容量）
    let N = r.wait + r.berthed;
    const days = [{ d: 0, arr: 0, q: r.wait, idx: Math.round(r.idx) }];
    for (let d = 1; d <= 7; d++) {
      N = N + A[d - 1] - Math.min(N, mu); const q = Math.max(0, N - B);
      const lowF = 1 - (1 - Math.min(1, r.idx / 100)) * Math.pow(0.75, d);   // 目前低於平常的港口：等待時間逐日回到平常水準（不再一律從 100 起算）
      const idx = r.idx >= 100 ? Math.round(100 + (r.idx - 100) * (q0 > 0 ? q / q0 : (q > 0 ? 1 : 0))) : Math.round(100 * lowF + q / mu * 24 / r.base * 100);   // 已塞：依排隊船數相對今天的比例增減；低於平常：逐日回到平常再加排隊
      days.push({ d, arr: A[d - 1], q: +q.toFixed(1), idx });
    }
    days.forEach(x => (x.level = x.idx >= p.high ? 'high' : x.idx >= p.mid ? 'mid' : 'low'));
    const peak = days.slice(1).reduce((m, x) => (x.idx > m.idx ? x : m), days[1]), future = days.slice(1).find(x => x.level !== 'low');
    const cur = days[0].level;
    const text = future ? (cur === 'low' ? `目前不塞，但預估第 ${future.d} 天起可能${future.level === 'high' ? '嚴重' : ''}壅塞（塞港指數約 ${peak.idx}）` : `預估仍會維持壅塞，最高約 ${peak.idx}（第 ${peak.d} 天）`) : '預估未來 7 天不會壅塞';
    return { ok: true, days, B, stay: r.avgStay, mu, cov: r.cov, peak, text, level: peak.level === 'low' && cur === 'low' ? 'low' : (RANK[peak.level] > RANK[cur] ? peak.level : cur) };
  };
  const sortKey = b => RANK[b.level] * 1000 + Math.min(b.nToward, 50) * 10 + (b.idx || 0) / 100;
  U.portBoard = portBoard; U.portBoardSort = (a, b) => sortKey(b) - sortKey(a) || a.name.localeCompare(b.name);

  K.port_board = () => {
    if (!CG.orgOk()) return { level: 'nodata', summary: '此組織沒有運務資料（只有「模擬貨櫃公司」有）', items: [] };
    const B = portBoard();
    if (!B.length) return { level: 'nodata', summary: '沒有港口壅塞資料', items: [] };
    const n = l => B.filter(b => b.level === l).length;
    const level = n('high') ? 'high' : n('mid') ? 'mid' : n('low') ? 'low' : 'nodata';
    const items = B.filter(b => b.level === 'high' || b.level === 'mid').sort(U.portBoardSort).slice(0, 60).map(b => ({ vid: null, text: `${b.name}（${b.cov === 'PORT' ? '全港' : '僅本公司船舶'}）　${b.comp.filter(c => c[0] !== 'low').map(c => c[1]).join('、')}　${b.nToward} 艘將到港` }));
    return { level, summary: `${B.length} 個港口：要處理 ${n('high')}、留意 ${n('mid')}、正常 ${n('low')}、資料不足 ${n('nodata')}（塞港指數 ${P().mid} 留意、${P().high} 要處理；最長等待 ${P().wait_mid}／${P().wait_high} 小時；等泊週變化 ${P().chg_mid}%／${P().chg_high}%）`, items };
  };
})();
