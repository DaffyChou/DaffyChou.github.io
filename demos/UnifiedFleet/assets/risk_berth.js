/* 自有碼頭靠泊時程（M13-b2／c4）的風險評估器：本公司船離港比計畫晚 late_hr 小時以上＝留意（暫定）。
   摘要數字來自 berth_gantt.js 的 U.berthGantt.summary，和甘特圖用同一份資料。 */
(function () {
  'use strict';
  const U = window.UI, K = U && U.risk && U.risk.K;
  if (!K) return;
  const NONE = '此範圍沒有自有碼頭（自有碼頭只屬於「模擬貨櫃公司」的貨櫃輪）';
  U.ownTerminals = () => {
    const B = (window.UI_CARGO || {}).berth || {}, CG = U.cargo;
    if (U.STATE.type !== 'container' || (CG && CG.orgOk && !CG.orgOk())) return [];
    return (B.ownTerms || []).map(t => t[0]);
  };
  K.berth_own = (p, c) => {
    if (U.berthTab && U.berthTab() === 'ships' && U.berthShipScope) {   // 「本公司船會停靠的碼頭」頁籤：依目前篩選，只看本公司船
      const S = U.berthShipScope(c.vids), L = S.list || [], late = L.filter(x => x.late), nT = new Set(L.map(x => x.term)).size;
      if (!L.length) return { level: 'nodata', summary: '基準時間前 3 天到後 5 天，這個範圍沒有本公司船的靠泊紀錄', items: [] };
      const NOW = Date.parse(window.UI_CARGO.now + ':00Z');
      return { level: late.length ? 'mid' : 'low',
        summary: `${nT} 個碼頭、本公司船 ${L.length} 航次：在泊 ${L.filter(x => x.est !== 2 && x.af <= NOW && x.dep > NOW).length} 艘、等泊中 ${L.filter(x => x.arr && x.arr <= NOW && x.af > NOW).length} 艘；離港比計畫晚 ${p.late_hr} 小時以上 ${late.length} 艘` + (late.length ? '（留意）' : ''),
        items: late.sort((a, b) => b.delay - a.delay).slice(0, 20).map(x => ({ vid: x.vid, text: `${x.name}　${x.term}　離港延誤 ${x.delay.toFixed(1)} 小時` })) };
    }
    const codes = U.berthScope ? U.berthScope(c.vids).codes : U.ownTerminals();
    if (!codes.length || !U.berthGantt || !U.berthGantt.summary) return { level: 'nodata', summary: NONE, items: [] };
    const S = U.berthGantt.summary(codes), late = [].concat(...S.map(s => s.lateList.map(x => Object.assign({ code: s.code }, x))));
    const sum = k => S.reduce((a, s) => a + s[k], 0);
    return { level: late.length ? 'mid' : 'low',
      summary: `${codes.length} 個自有碼頭：在泊 ${sum('berthed')} 艘、等泊中 ${sum('waiting')} 艘、今天預計離港 ${sum('departToday')} 艘；本公司船離港比計畫晚 ${p.late_hr} 小時以上 ${late.length} 艘` +
        (late.length ? '（留意）' : ''),
      items: late.sort((a, b) => b.delay - a.delay).slice(0, 20).map(x => ({ vid: x.vid, text: `${x.name}　${x.code}　離港延誤 ${x.delay.toFixed(1)} 小時` })) };
  };
})();
