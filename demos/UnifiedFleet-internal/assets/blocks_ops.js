/* M13 運務（貨櫃輪）：壅塞狀態、錨地與泊位現況、等泊趨勢 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C;
  const { COL, fmt, esc, mkChart } = U;
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const pn = u => (U.ports ? U.ports(u) : u);
  const covTag = c => (c === 'PORT' ? tag('全港', 'ok') : tag('僅本公司船舶', 'warn'));
  const noOrg = el => U.emptyChart(el, '此組織沒有運務資料（只有「模擬貨櫃公司」有）。請在上方組織選「模擬貨櫃公司」或「全部組織」。');
  const card = el => el.closest('.blk') || el;
  const V = () => (U.STATE.view.ops = U.STATE.view.ops || { lvl: 'port', port: null });
  const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const termName = code => { const t = C.terminals.find(x => x[0] === code); return t ? t[0] : code; };

  function today(level) {
    return CG.cong().filter(r => r.off === 0 && (level === 'term' ? r.term != null : r.term == null));
  }

  // 壅塞、錨地與泊位、等泊趨勢已併入運務板（assets/dispatch.js，M13-c3）
})();
