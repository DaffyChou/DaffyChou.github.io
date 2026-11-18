/* 單船總覽重新規劃（single-overview）的風險評估器。燈號沿用 U.risk.byVessel；位置取自到港預報與船報（不依賴清單畫面）。 */
(function () {
  'use strict';
  const U = window.UI, K = U && U.risk && U.risk.K;
  if (!K) return;
  const { fmt } = U;
  const tsZ = s => (s ? Date.parse(s.length <= 16 ? s + ':00Z' : s + 'Z') : null);

  // ① 這艘船現在在哪：位置過期或預計到港與回報差太多為留意
  K.sov_pos = (p, c) => {
    const id = c.vids[0], sn = (U.SN && U.SN.snap[id]) || {}, CG = U.cargo;
    const arr = CG ? CG.arrivals().filter(a => a.vid === id && a.status === 'EXPECTED').sort((a, b) => ((a.etaCalc || a.etaRep || '') < (b.etaCalc || b.etaRep || '') ? -1 : 1)) : [];
    const nx = arr[0];
    if (!nx && !sn.last) return { level: 'nodata', summary: '沒有位置與船報資料', items: [] };
    const gap = nx && nx.etaCalc && nx.etaRep ? (tsZ(nx.etaCalc) - tsZ(nx.etaRep)) / 3600000 : null, lim = p.gap_h == null ? 6 : p.gap_h;
    const port = u => (U.ports ? U.ports(u) : u);
    const lv = sn.stale || (gap != null && Math.abs(gap) >= lim) ? 'mid' : 'low';
    return { level: lv,
      summary: (sn.stale ? `超過 ${fmt(sn.hours || 0, 0)} 小時沒有船報，位置可能已過期；` : '') +
        (nx ? `下一港 ${port(nx.unlo)}，預計 ${(nx.etaCalc || nx.etaRep || '').slice(5, 16).replace('T', ' ')} 到港` + (gap == null ? '' : Math.abs(gap) < 0.5 ? '，與船上回報一致' : `，比船上回報${gap > 0 ? '晚' : '早'} ${fmt(Math.abs(gap), 1)} 小時`) : '沒有到港預報'),
      items: [] };
  };

  // ③ 重點數字：判讀依這艘船的燈號（和頁首、清單一致），另寫出這幾個數字相對上月的變化
  K.sov_kpi = (p, c) => {
    const id = c.vids[0], o = (U.sov ? U.sov.vis(id) : U.risk.byVessel(id) || {}), L = Object.keys(o).filter(k => o[k]).map(k => o[k]);
    const hi = L.filter(x => x.level === 'high'), mid = L.filter(x => x.level === 'mid');
    const ch = (p.metrics || []).map(m => { const a = U.val(m, id, c.mi), b = U.val(m, id, c.mi - 1), nm = ((U.RK.metrics || {})[m] || {}).name || m;
      return a == null ? null : `${nm} ${fmt(a)}` + (b ? `（對上月 ${a >= b ? '+' : '−'}${fmt(Math.abs(100 * (a / b - 1)), 1)}%）` : ''); }).filter(Boolean);
    return { level: hi.length ? 'high' : mid.length ? 'mid' : L.length ? 'low' : 'nodata',
      summary: (hi.length || mid.length ? '頁首燈號：' + [hi.length ? `要處理 ${hi.length} 項（${hi.map(x => x.label).join('、')}）` : '', mid.length ? `留意 ${mid.length} 項（${mid.map(x => x.label).join('、')}）` : ''].filter(Boolean).join('、') : '頁首燈號都正常') + (ch.length ? '。本月：' + ch.join('；') : ''),
      items: [] };
  };

  // ④ 各面向狀況：整體取最差的燈；文字列出每個面向的燈號
  K.sov_faces = (p, c) => {
    const id = c.vids[0], o = (U.sov ? U.sov.vis(id) : U.risk.byVessel(id) || {}), F = (U.sov && U.sov.FACES[U.VBY[id] && U.VBY[id].type === 'bulk' ? 'bulk' : 'container']) || [];
    const R = { nodata: -1, low: 0, mid: 1, high: 2 }, NM = { high: '要處理', mid: '留意', low: '正常', nodata: '資料不足' };
    const fl = F.map(f => { const ls = f.lights.map(k => o[k]).filter(Boolean); return [f.name, ls.reduce((lv, x) => (R[x.level] > R[lv] ? x.level : lv), 'nodata')]; }).filter(x => x);
    if (!fl.length) return { level: 'nodata', summary: '沒有逐船燈號', items: [] };
    const w = fl.reduce((lv, x) => (R[x[1]] > R[lv] ? x[1] : lv), 'nodata');
    return { level: w, summary: fl.map(([n, lv]) => `${n} ${NM[lv]}`).join('、'), items: [] };
  };

  // ② 要處理的事：直接用逐船燈號——有紅燈要處理、有黃燈留意
  K.sov_todo = (p, c) => {
    const o = (U.sov ? U.sov.vis(c.vids[0]) : U.risk.byVessel(c.vids[0]) || {}), L = Object.keys(o).filter(k => o[k]).map(k => o[k]);
    if (!L.length) return { level: 'nodata', summary: '沒有逐船燈號', items: [] };
    const hi = L.filter(x => x.level === 'high'), mid = L.filter(x => x.level === 'mid');
    return { level: hi.length ? 'high' : mid.length ? 'mid' : 'low',
      summary: hi.length || mid.length ? `要處理 ${hi.length} 項${hi.length ? '（' + hi.map(x => x.label).join('、') + '）' : ''}、留意 ${mid.length} 項${mid.length ? '（' + mid.map(x => x.label).join('、') + '）' : ''}` : `${L.length} 項燈號都正常，目前沒有要處理的事`,
      items: [] };
  };
})();
