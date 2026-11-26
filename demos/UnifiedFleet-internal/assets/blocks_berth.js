/* 碼頭靠泊時程（M13-b2／c4）：側邊選單「碼頭靠泊時程」分頁；不需點地圖或港口，直接畫碼頭。
   兩個頁籤（同一張卡片內切換，預設第一個）：
   - 本公司船會停靠的碼頭（ships）：只排本公司船，不含自有碼頭；可依區域、港口篩選，碼頭依下一艘到港時間排序。
   - 自有碼頭（own）：所有到自有碼頭（terminal.is_own）的船，含其他公司的船。
   兩者時間範圍都是資料基準時間前 3 天到後 5 天。區域跟著運務管理頁首的共用篩選（U.opsFilt：區域、航線停靠的港口）；頁籤與港口記在 U.berthView，風險判讀（risk_berth.js）跟著同一個狀態。 */
(function () {
  'use strict';
  const U = window.UI, { esc } = U;
  const V = U.berthView = U.berthView || { tab: '', region: '', ports: [], day: null };   // ports：港口複選（卸櫃量與靠泊時程共用；空＝全部）；day：從卸櫃量熱度表帶入的那一天（相對今天）
  if (!Array.isArray(V.ports)) V.ports = V.port ? [V.port] : [];
  // 港口複選（下拉勾選，按「套用」才生效；卸櫃量熱度表與靠泊時程共用同一組選擇）
  U.portPick = (list, key) => {
    const sel = V.ports.filter(u => list.includes(u)), lab = sel.length ? (sel.length <= 2 ? sel.map(pn).join('、') : `${pn(sel[0])} 等 ${sel.length} 港`) : `全部港口（${list.length}）`;
    return `<details class="mpick" data-mp="${key}"><summary class="btn" title="可複選；按「套用」才生效">港口：${esc(lab)} ▾</summary><div class="mpl"><div class="mpa"><input type="search" data-mpq placeholder="找港口" aria-label="找港口"><button type="button" class="lnk" data-mpall>全選</button><button type="button" class="lnk" data-mpnone>全不選</button></div>
      <div class="mpb">${list.slice().sort((a, b) => (sel.includes(b) ? 1 : 0) - (sel.includes(a) ? 1 : 0)).map(u => `<label data-mpn="${esc(pn(u).toLowerCase())}"><input type="checkbox" value="${esc(u)}"${sel.includes(u) ? ' checked' : ''}> ${esc(pn(u))}</label>`).join('')}</div>
      <div class="mpf"><span class="note">不勾＝全部港口</span><button type="button" class="btn" data-mpx>取消</button><button type="button" class="btn pri" data-mpok>套用</button></div></div></details>`;
  };
  U.portPickWire = root => root.querySelectorAll('details.mpick').forEach(d => {
    const boxes = () => [...d.querySelectorAll('.mpb input')];
    const q = d.querySelector('[data-mpq]'); if (q) q.oninput = () => { const k = q.value.trim().toLowerCase(); d.querySelectorAll('.mpb label').forEach(l => (l.hidden = !!k && !l.dataset.mpn.includes(k))); };
    d.querySelector('[data-mpall]').onclick = () => boxes().forEach(b => { if (!b.closest('label').hidden) b.checked = true; });
    d.querySelector('[data-mpnone]').onclick = () => boxes().forEach(b => (b.checked = false));
    d.querySelector('[data-mpx]').onclick = () => { d.open = false; boxes().forEach(b => (b.checked = V.ports.includes(b.value))); };
    d.querySelector('[data-mpok]').onclick = () => { const v = boxes().filter(b => b.checked).map(b => b.value); V.ports = v.length === boxes().length ? [] : v; V.day = null; d.open = false; U.bus.emit(); };
  });
  const pn = u => (U.ports ? U.ports(u) : u);

  // 目前頁籤：預設「本公司船會停靠的碼頭」；選了「自有碼頭」且此範圍有自有碼頭時才切過去
  U.berthTab = () => (V.tab === 'own' && U.ownTerminals && U.ownTerminals().length ? 'own' : 'ships');
  // 目前頁籤的資料（依區域、港口篩選）：兩個頁籤用同一套篩選，圖與風險判讀共用
  //   ships：本公司船的靠泊（不含自有碼頭）；own：自有碼頭上所有船（含其他公司）
  U.berthScope = vids => {
    const G = U.berthGanttOwn, BG = U.berthGantt, tab = U.berthTab(); if (!G || !BG) return { tab, all: [], list: [], ports: [], codes: [] };
    const all = tab === 'ships' ? G.items(new Set(vids)) : BG.items(null, U.ownTerminals ? U.ownTerminals() : []);
    const termPort = {}; all.forEach(x => (termPort[x.term] = x.unlo));
    if (tab === 'own') ((window.UI_CARGO.berth || {}).ownTerms || []).forEach(t => (termPort[t[0]] = termPort[t[0]] || t[2]));
    const rp = U.opsFilt ? U.opsFilt.regPorts() : null;                 // 運務管理頁首的區域／航線：只留這些航線停靠的港口
    const terms = Object.keys(termPort), inR = t => !rp || rp.has(termPort[t]);
    const ports = [...new Set(terms.filter(inR).map(t => termPort[t]))].sort((a, b) => (pn(a) < pn(b) ? -1 : 1));
    const pick = V.ports.filter(u => ports.includes(u));
    const codes = terms.filter(t => inR(t) && (!pick.length || pick.includes(termPort[t]))), cs = new Set(codes);
    return { tab, all, terms, termPort, ports, codes, list: all.filter(x => cs.has(x.term)) };
  };
  U.berthShipScope = U.berthScope;

  U.reg(['M13-b2', 'M13-c4'], (el, c) => {
    if (!U.berthGanttTerms || !U.berthGanttOwn) return U.emptyChart(el, '碼頭靠泊時程元件未載入。');
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const own = U.ownTerminals ? U.ownTerminals() : [], S = U.berthScope(c.vids), tab = S.tab;
    const tabs = `<span class="seg bgtabs" role="tablist" aria-label="碼頭範圍">` +
      `<button type="button" role="tab" data-bgt="ships" aria-selected="${tab === 'ships'}" aria-pressed="${tab === 'ships'}">本公司船會停靠的碼頭</button>` +
      `<button type="button" role="tab" data-bgt="own" aria-selected="${tab === 'own'}" aria-pressed="${tab === 'own'}"${own.length ? '' : ' disabled title="此範圍沒有自有碼頭（自有碼頭只屬於「模擬貨櫃公司」的貨櫃輪）"'}>自有碼頭</button></span>`;
    const nOther = S.list.filter(x => !x.own).length;
    const bar = `<div class="bgbar">${tabs}${U.portPick(S.ports, 'berth')}
      <span class="note">${S.codes.length} 個碼頭・${S.list.length} 航次${tab === 'own' ? `（其他公司 ${nOther}）` : '（只排本公司船）'}</span>${tab === 'ships' && V.ports.length === 1 && V.day != null ? `<span class="bgday">標出：${({ '-2': '前天', '-1': '昨天', 0: '今天', 1: '明天' })[V.day] || (V.day > 0 ? V.day + ' 天後' : -V.day + ' 天前')}（港口當地日期）<button type="button" class="lnk" data-bgd>取消</button></span>` : ''}</div>`;
    el.innerHTML = bar; const body = document.createElement('div'); el.appendChild(body);
    if (!S.codes.length) body.innerHTML = '<div class="note">這個篩選範圍沒有碼頭。</div>';
    else if (tab === 'ships') { const fr = V.ports.length === 1 && V.day != null && U.unloadDayRange ? U.unloadDayRange(V.ports[0], V.day) : null;
      U.berthGanttOwn(body, { vids: new Set(c.vids), ports: new Set(S.codes.map(t => S.termPort[t])), focus: fr }); }
    else U.berthGanttTerms(body, S.codes);
    el.querySelectorAll('[data-bgt]').forEach(b => (b.onclick = () => { if (b.disabled) return; V.tab = b.dataset.bgt; V.day = null; U.bus.emit(); }));
    { const dx = el.querySelector('[data-bgd]'); if (dx) dx.onclick = () => { V.day = null; U.bus.emit(); }; }
    U.portPickWire(el);
  });
})();
