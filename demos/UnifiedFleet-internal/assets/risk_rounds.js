/* 每圈準點率（M4-c1）：圖與風險判讀共用同一份計算，數字才會一致。
   每圈準點率＝這圈有實際到港時間的港口中，延遲不超過 6 小時（提早也算準點）的比例；判讀看最近 n 圈的平均。 */
(function () {
  'use strict';
  const U = window.UI, K = U && U.risk && U.risk.K;
  if (!U || !U.risk) return;
  const R = n => U.risk.rows(n);
  // 回傳最近 n 圈：[{ v:航次, n:'第 x 圈', s:'MM-DD', k:有資料港數, ok:準點港數, val:百分比或 null }]
  U.roundOtp = (id, n, tol) => {
    tol = tol == null ? 6 : tol;
    const calls = R('calls').filter(r => r.vid === id && r.peta), by = {};
    calls.forEach(r => (by[r.vy] = by[r.vy] || []).push(r));
    return R('voy').filter(r => r.vid === id && by[r.id]).sort((a, b) => (a.s < b.s ? -1 : 1)).slice(-n).map(v => {
      const x = by[v.id].filter(k => k.dly != null), ok = x.filter(k => k.dly <= tol).length;
      return { v, n: '第 ' + v.rnd + ' 圈', s: (v.s || '').slice(5, 10), k: x.length, ok, val: x.length ? 100 * ok / x.length : null };
    });
  };
  U.roundOtpAvg = rs => { const vs = rs.filter(x => x.val != null); return vs.length ? vs.reduce((t, x) => t + x.val, 0) / vs.length : null; };
  if (!K) return;
  K.round_otp = (p, c) => {
    const L = [];
    c.vids.forEach(id => { const rs = U.roundOtp(id, p.rounds || 12, p.tol); const a = U.roundOtpAvg(rs); if (a != null) L.push({ id, a, rs }); });
    if (!L.length) return { level: 'nodata', summary: '這個範圍沒有航線輪班資料', items: [] };
    const lvOf = v => (v < p.high ? 'high' : v < p.mid ? 'mid' : 'low');
    const rank = { low: 0, mid: 1, high: 2 };
    let lv = 'low'; L.forEach(x => { if (rank[lvOf(x.a)] > rank[lv]) lv = lvOf(x.a); });
    const word = { high: '低於要處理門檻 ' + p.high + '%', mid: '低於留意門檻 ' + p.mid + '%', low: '在 ' + p.mid + '% 以上' };
    let s;
    if (L.length === 1) {
      const x = L[0], vs = x.rs.filter(r => r.val != null), bad = vs.filter(r => r.val < p.high).length, last = vs[vs.length - 1];
      s = `近 ${vs.length} 圈平均準點率 ${U.fmt(x.a, 0)}%（${word[lvOf(x.a)]}）；${bad} 圈低於 ${p.high}%，最近一圈（${last.n}）${U.fmt(last.val, 0)}%`;
    } else {
      const nh = L.filter(x => lvOf(x.a) === 'high').length, nm = L.filter(x => lvOf(x.a) === 'mid').length;
      s = nh + nm ? `${nh ? nh + ' 艘近 ' + (p.rounds || 12) + ' 圈平均' + word.high : ''}${nh && nm ? '，' : ''}${nm ? nm + ' 艘' + word.mid : ''}` : `${L.length} 艘近 ${p.rounds || 12} 圈平均準點率都${word.low}`;
    }
    return { level: lv, summary: s, items: L.sort((a, b) => a.a - b.a).filter(x => lvOf(x.a) !== 'low').slice(0, 60).map(x => ({ vid: x.id, text: `${U.vname(x.id)}　近 ${x.rs.length} 圈平均 ${U.fmt(x.a, 0)}%` })) };
  };
})();
