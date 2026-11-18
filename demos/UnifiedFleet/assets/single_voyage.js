/* 單船「航次與港口」（single-voyage-port）：四個頁籤（航行地圖、航次數據、靠港與到港、前往港口與貨櫃）共用的摘要列、
   接下來停靠港清單與「目前選的港口」；航行地圖的港口詳情與「這艘船要處理的事」。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C, { fmt, esc, STATE } = U;
  const HR = 3600000, ts = s => (s ? Date.parse(String(s).length <= 16 ? s + ':00Z' : s + 'Z') : null);
  const pn = u => (U.ports ? U.ports(u) : u);
  const hhmm = s => (s ? String(s).replace('T', ' ').slice(5, 16) : '—');
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const SV = () => (STATE.view.sv = STATE.view.sv || { p: 0 });   // p：前往港口與貨櫃選的第幾港（0＝下一港）

  // 接下來停靠港（最多 4 個，依航線順序）：貨櫃船取船上貨櫃的卸貨港順序；沒有時只用到港預報的下一港。
  // 只有下一港有到港預報（ETA），之後的港口沒有 ETA，不推估。
  function ports(vid) {
    const a = U.nextArrival ? U.nextArrival(vid) : null, v = (C.vcargo || {})[vid], out = [];
    const L = v && v[7] ? v[7].map(r => r[0]) : [];
    if (a && a.unlo && !L.includes(a.unlo)) L.unshift(a.unlo);
    if (a && a.unlo && L[0] !== a.unlo) { L.splice(L.indexOf(a.unlo), 1); L.unshift(a.unlo); }
    [...new Set(L)].slice(0, 4).forEach((u, k) => out.push({ u, k, arr: a && a.unlo === u ? a : null }));
    return out;
  }
  // 目前選的港口（前往港口與貨櫃的港口頁籤）：回傳和到港預報同樣格式的物件（之後的港口沒有 ETA）
  function cur(vid) {
    const P = ports(vid); if (!P.length) return null;
    const i = Math.min(SV().p || 0, P.length - 1), x = P[i];
    return x.arr || { unlo: x.u, vid, etaCalc: null, etaRep: null, term: null, k: x.k, later: true };
  }
  const ordN = k => (k === 0 ? '下一港' : '第 ' + (k + 1) + ' 港');
  U.sv = { ports, cur, ordN, state: SV };

  // 船的狀態：位置過期／在港／航行中
  function status(a) {
    if (!a || !a.posT || CG.NOW - ts(a.posT) > 12 * HR) return ['位置過期', 'warn'];
    return a.sog != null && a.sog < 1 ? ['在港', 'no'] : ['航行中', 'ok'];
  }
  U.sv.status = status;

  // ---------------- 航行地圖（M14-c13，滿版）：這艘船＋航線＋接下來停靠港；點港口右側滑出港口詳情；左上「這艘船要處理的事」
  const LVN = { high: ['要處理', 'bad'], mid: ['留意', 'warn'], low: ['順暢', 'ok'], nodata: ['資料不足', 'no'] };
  const kp = (k, v, sub, c) => `<div class="pk"><div class="note">${k}</div><b class="${c || ''}">${v}</b><div class="note">${sub || ''}</div></div>`;
  // 港口詳情：港口概況（沿用運務板的港口等級）＋這艘船在這港（抵港、卸櫃、空櫃、缺櫃）
  function portDetail(vid, u) {
    const b = (U.portBoard ? U.portBoard() : []).find(x => x.unlo === u) || {}, lv = b.level || 'nodata';
    const P = ports(vid), me = P.find(x => x.u === u), a = me && me.arr;
    const ul = U.unloadAt ? U.unloadAt(vid, u) : null;
    const yd = CG.util().filter(x => x.unlo === u), teu = yd.reduce((s, x) => s + (x.teu || 0), 0), stale = yd.filter(x => x.stale).length;
    const fc = CG.forecastAll().filter(r => (C.yards[r.y] || [])[1] === u), fHi = fc.filter(r => r.status === '要處理'), fMid = fc.filter(r => r.status === '留意');
    const first = fHi.concat(fMid).filter(r => r.first).sort((x, y) => x.first - y.first)[0];
    const idxC = b.idx == null ? '' : b.idx >= 150 ? 'bad' : b.idx >= 120 ? 'warn' : '';
    return `<div class="pd"><div class="bhead"><h4>${esc(pn(u))}</h4>${tag(LVN[lv][0], LVN[lv][1])}${me ? tag(ordN(me.k), 'no') : ''}</div>
      ${b.action ? `<div class="bact"><b>建議動作</b>　${esc(b.action)}</div>` : ''}
      <div class="bt">這艘船在這港</div>
      <div class="pkpi">${kp('預計抵港（UTC）', a ? esc(hhmm(a.etaCalc || a.etaRep)) : '—', a ? (a.etaRep && a.etaCalc ? '回報 ' + esc(hhmm(a.etaRep)) : '計算 ETA') : '只有下一港有到港預報')}
        ${kp('預計卸櫃', ul ? fmt(ul.tot, 0) + ' TEU' : '—', ul ? `空 ${fmt(ul.emp, 0)}・冷 ${fmt(ul.rf, 0)}・危 ${fmt(ul.dg, 0)}` : '沒有卸貨資料')}
        ${kp('這港空櫃', yd.length ? fmt(teu, 0) + ' TEU' : '—', yd.length ? `${yd.length} 個場站${stale ? '・' + stale + ' 個過期' : ''}` : '沒有場站資料', stale ? 'warn' : '')}
        ${kp('缺櫃預估（7 天）', fc.length ? (fHi.length ? fHi.length + ' 項要處理' : fMid.length ? fMid.length + ' 項留意' : '正常') : '—', first ? `最早第 ${first.first} 天：${esc(first.yard)} ${esc(first.ct)} ${first.sz}` : fc.length ? '各場站櫃型都夠' : '沒有預估資料', fHi.length ? 'bad' : fMid.length ? 'warn' : '')}</div>
      <div class="bt">港口概況</div>
      <div class="pkpi">${kp('塞港指數', b.idx == null ? '樣本不足' : fmt(b.idx, 0), '100＝平常', idxC)}${kp('在錨／在泊', b.wait == null ? '—' : `${b.wait}／${b.berthed} 艘`, '')}
        ${kp('平均等待', b.avgWait == null ? '—' : fmt(b.avgWait, 1) + ' 小時', b.maxWait == null ? '' : '最長 ' + fmt(b.maxWait, 1) + ' 小時')}${kp('等泊週變化', b.chg == null ? '—' : (b.chg >= 0 ? '+' : '') + fmt(b.chg, 0) + '%', '本週對上週', b.chg >= 30 ? 'warn' : '')}</div>
      ${me ? `<button type="button" class="btn svgo" data-svgo="${me.k}">到「前往港口」看這港 →</button>` : ''}</div>`;
  }
  U.reg('M14-c13', (el, c) => {
    const vid = c.vids[0];
    if (!CG.orgOk()) return U.emptyChart(el, '此組織沒有運務資料（只有「模擬貨櫃公司」有）。');
    const me = U.nextArrival ? U.nextArrival(vid) : null;
    if (!me) return U.emptyChart(el, '這艘船沒有到港預報與位置資料，無法畫航行地圖。');
    const st = SV(), peers = CG.arrivals().filter(a => a.status === 'EXPECTED' && a.org === 3 && a.vid != null && a.svc && a.svc === me.svc).map(a => a.vid);
    if (st.vid !== vid) { st.vid = vid; st.port = null; }   // 換船時收起港口詳情
    let M = null;
    const paint = () => {
      const sh = el.querySelector('.svsheet'); if (!sh) return;
      if (!st.port) { sh.hidden = true; return; }
      if (U.closeDetailDrawers && sh.dataset.u !== st.port) U.closeDetailDrawers();   // 右側一次只開一種詳情
      sh.dataset.u = st.port; sh.hidden = false;
      sh.querySelector('[data-bd]').innerHTML = portDetail(vid, st.port); sh.scrollTop = 0;
      const go = sh.querySelector('[data-svgo]'); if (go) go.onclick = () => { st.p = +go.dataset.svgo; U.IA.setLoc(3, 's_vport'); U.bus.emit(); window.scrollTo(0, 0); };
    };
    U.svCloseSheet = () => { if (st.port) { st.port = null; paint(); if (M) M.redraw(); } };
    M = U.shipMap(el, { vids: [...new Set([vid].concat(peers))], height: '100%', voy: { vid, onPort: u => { st.port = st.port === u ? null : u; paint(); M.redraw(); }, sel: () => st.port } });
    const wrap = el.querySelector('.mapwrap'); if (!wrap || !M) return;
    wrap.insertAdjacentHTML('beforeend', `<div class="psheet svsheet" hidden><div class="psh"><b>港口詳情</b><button type="button" class="btn" data-svx>關閉 ✕</button></div><div data-bd></div></div>`);
    wrap.querySelector('[data-svx]').onclick = () => { st.port = null; paint(); M.redraw(); };
    // 這艘船要處理的事（開著的事件＋進行中警報）
    const A = U.vesselAlerts ? U.vesselAlerts(vid) : { ev: [], al: [] }, ev = A.ev || [], al = A.al || [], n = ev.length + al.length;
    const KN = (U.events && U.events.KINDS) || {};
    const RN = Object.fromEntries(((window.UI_ALARM || {}).rules || []).map(r => [r.id || r.rule || r.code, r.name || r.label || r.id || r.rule]));   // 警報規則代號 → 名稱
    wrap.insertAdjacentHTML('beforeend', `<div class="svtodo${st.todo === false ? '' : ' open'}"><button type="button" class="cmdtab svtt" aria-expanded="${st.todo === false ? 'false' : 'true'}">這艘船要處理的事 ${n ? `<b>${n}</b>` : '<span class="note">0</span>'} <span class="car">${st.todo === false ? '▾' : '▴'}</span></button>
      <div class="svtl">${n ? ev.map(e => `<button type="button" class="svte" data-sve="${esc(e.id)}"><span class="lampdot ${e.lv === 'high' ? 'bad' : 'warn'}"></span><span class="svtx"><small>${esc(KN[e.kind] || '事件')}・${e.status === 'new' ? '待處理' : '處理中'}</small>${esc(e.title)}</span></button>`).join('') +
        al.map(x => `<div class="svte"><span class="lampdot ${x.thr && x.value >= 2 * x.thr ? 'bad' : 'warn'}"></span><span class="svtx"><small>警報・進行中</small>${esc(RN[x.rule] || x.rule)}（${fmt(x.value, 1)}${x.thr ? '，門檻 ' + fmt(x.thr, 1) : ''}）</span></div>`).join('') : '<div class="note">目前沒有要處理的事件或警報。</div>'}</div></div>`);
    const td = wrap.querySelector('.svtodo'), tt = td.querySelector('.svtt');
    tt.onclick = () => { const o = !td.classList.contains('open'); td.classList.toggle('open', o); st.todo = o; tt.setAttribute('aria-expanded', o ? 'true' : 'false'); tt.querySelector('.car').textContent = o ? '▴' : '▾'; };
    td.querySelectorAll('[data-sve]').forEach(b => (b.onclick = () => { st.port = null; paint(); M.redraw(); if (U.events && U.events.openDrawer) U.events.openDrawer(b.dataset.sve); }));
    paint();
  });

  // 四個頁籤上方的摘要列
  // 頁籤列右側的精簡摘要：狀態、下一港、ETA（接下來的港口看航行地圖或「前往港口」的港口頁籤）
  U.svSummary = () => {
    const vid = STATE.vessel; if (!vid || STATE.type !== 'container' || !CG.orgOk()) return '';
    const a = U.nextArrival ? U.nextArrival(vid) : null;
    if (!a) return `<span class="svsum"><span class="note">這艘船沒有到港預報</span></span>`;
    const [sn, sk] = status(a);
    return `<span class="svsum">${tag(sn, sk)}<span class="svsep">｜</span><span>下一港 <b>${esc(pn(a.unlo))}</b></span><span class="svsep">｜</span><span>${a.etaCalc ? '計算' : '回報'} ETA <b>${esc(hhmm(a.etaCalc || a.etaRep))}</b><span class="note">（UTC）</span></span></span>`;
  };
  // 「前往港口」頁籤下方的港口切換（下一港、第 2 港…）
  U.svPortTabs = id => {
    const vid = STATE.vessel; if (id !== 's_vport' || !vid || STATE.type !== 'container' || !CG.orgOk()) return '';
    const P = ports(vid); if (!P.length) return '';
    return `<div class="tabs svptabs" role="tablist" aria-label="選港口">${P.map(x => `<button type="button" role="tab" data-svpt="${x.k}"${Math.min(SV().p || 0, P.length - 1) === x.k ? ' aria-selected="true"' : ''}><small>${esc(ordN(x.k))}</small>${esc(pn(x.u))}</button>`).join('')}<span class="note svpn">下方各卡片跟著選的港口換</span></div>`;
  };
  // 港口頁籤：換港口後重畫（只影響「前往的港口」各卡片）
  document.addEventListener('click', e => { const b = e.target.closest('[data-svpt]'); if (!b) return; SV().p = +b.dataset.svpt; U.bus.emit(); });
})();
(function () {
  'use strict';
  const U = window.UI, { fmt, esc, STATE } = U;
  const pn = u => (U.ports ? U.ports(u) : u);
  const kp = (k, v, sub, c) => `<div class="pk"><div class="note">${k}</div><b class="${c || ''}">${v}</b><div class="note">${sub || ''}</div></div>`;
  // ---------------- M14-c20 這艘船的 ETA 準確度（依港口）
  U.reg('M14-c20', (el, c) => {
    if (!U.cargo.orgOk()) return U.emptyChart(el, '此組織沒有運務資料（只有「模擬貨櫃公司」有）。');
    const S = U.etaStats(c.vids, c.mi, 'port'), a = S.all;
    if (!a.n) return U.emptyChart(el, '近 6 個月這艘船沒有可比較的預測紀錄。');
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const cl = v => (v >= 6 ? 'bad' : v >= 4 ? 'warn' : '');
    el.innerHTML = `<div class="pkpi sv4">${kp('回報 ETA 平均差', fmt(a.repAbs, 1) + ' 小時', '抵港前 24 小時船上回報', cl(a.repAbs))}${kp('計算 ETA 平均差', fmt(a.calAbs, 1) + ' 小時', '同時間系統計算', cl(a.calAbs))}${kp('早到：錨地多等', fmt(a.early, 0) + ' 小時', '比回報早到、等超過平常')}${kp('晚到：泊位空等', fmt(a.late, 0) + ' 小時', '比船期晚到、排好的泊位空著')}</div><div data-t></div><div class="note" style="margin-top:.3rem">近 6 個月 ${a.n} 次靠港；差值為絕對值平均（小時）；靠港不到 3 次的港口數字僅供參考。</div>`;
    U.table(el.querySelector('[data-t]'), { rows: S.rows.map(r => ({ port: pn(r.k), n: r.n, rep: r.repAbs, cal: r.calAbs, dir: r.rep, early: r.early, late: r.late, thin: r.n < 3 })), sort: ['rep', -1],
      cols: [{ k: 'port', t: '港口', h: r => esc(r.port) + (r.thin ? ' <span class="tag no">樣本少</span>' : '') }, { k: 'n', t: '靠港次數', n: true, d: 0 },
        { k: 'rep', t: '回報 ETA 平均差（小時）', n: true, h: r => `<span class="${cl(r.rep)}">${fmt(r.rep, 1)}</span>` }, { k: 'cal', t: '計算 ETA 平均差（小時）', n: true, d: 1 },
        { k: 'dir', t: '方向', h: r => (r.dir >= 0 ? '多半比回報晚到' : '多半比回報早到') }, { k: 'early', t: '早到多等（小時）', n: true, d: 0 }, { k: 'late', t: '晚到空等（小時）', n: true, d: 0 }] });
  });
})();
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, { fmt, esc, STATE } = U;
  const pn = u => (U.ports ? U.ports(u) : u), HR = 3600000, ts = s => (s ? Date.parse(s + 'Z') : null);
  const hhmm = s => (s ? String(s).replace('T', ' ').slice(5, 16) : '—');
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const LVN = { high: ['要處理', 'bad'], mid: ['留意', 'warn'], low: ['順暢', 'ok'], nodata: ['資料不足', 'no'] };
  const noOrg = el => { if (!CG.orgOk()) { U.emptyChart(el, '此組織沒有運務資料（只有「模擬貨櫃公司」有）。'); return true; } return false; };
  // ---------------- M14-c21 這艘船的靠泊時程（沿用靠泊時程，只排這艘船、含自有碼頭）
  U.reg('M14-c21', (el, c) => { if (noOrg(el)) return; U.berthGanttOwn(el, { vids: new Set(c.vids), withOwn: true }); });
  // ---------------- M14-c22 接下來的停靠港預報
  U.reg('M14-c22', (el, c) => {
    if (noOrg(el)) return;
    const vid = c.vids[0], P = U.sv.ports(vid); if (!P.length) return U.emptyChart(el, '這艘船沒有到港預報與卸貨港資料。');
    const B = Object.fromEntries((U.portBoard ? U.portBoard() : []).map(b => [b.unlo, b]));
    const rows = P.map(x => { const a = x.arr, ul = U.unloadAt ? U.unloadAt(vid, x.u) : null, gap = a && a.etaRep && a.etaCalc ? (ts(a.etaRep) - ts(a.etaCalc)) / HR : null;
      return { k: x.k, ord: U.sv.ordN(x.k), port: pn(x.u), term: a && a.term || '', calc: a ? a.etaCalc : null, rep: a ? a.etaRep : null, gap, ul: ul ? ul.tot : null, ulx: ul, lv: (B[x.u] || {}).level || 'nodata' }; });
    U.table(el, { rows, pageSize: 10, cols: [{ k: 'ord', t: '順序', h: r => (r.k === 0 ? tag(r.ord, 'ok') : esc(r.ord)) }, { k: 'port', t: '港口', h: r => '<b>' + esc(r.port) + '</b>' + (r.term ? ' <span class="note">' + esc(r.term) + '</span>' : '') },
      { k: 'calc', t: '計算 ETA（UTC）', h: r => (r.calc ? esc(hhmm(r.calc)) : r.k === 0 && r.rep ? '<span class="note">尚未計算</span>' : '<span class="note">沒有到港預報</span>') }, { k: 'rep', t: '回報 ETA（UTC）', h: r => (r.rep ? esc(hhmm(r.rep)) : '—') },
      { k: 'gap', t: '回報－計算（小時）', n: true, h: r => (r.gap == null ? '—' : Math.abs(r.gap) > 6 ? tag((r.gap > 0 ? '+' : '') + fmt(r.gap, 0), 'warn') : (r.gap > 0 ? '+' : '') + fmt(r.gap, 0)) },
      { k: 'ul', t: '預計卸櫃（TEU）', n: true, h: r => (r.ul == null ? '—' : fmt(r.ul, 0) + `<div class="note">空 ${fmt(r.ulx.emp, 0)}・冷 ${fmt(r.ulx.rf, 0)}・危 ${fmt(r.ulx.dg, 0)}</div>`) },
      { k: 'lv', t: '港口狀況', h: r => tag(LVN[r.lv][0], LVN[r.lv][1]) }, { k: 'go', t: '', h: r => `<button type="button" class="lnk" data-svp="${r.k}">看這港 →</button>` }] });
    el.addEventListener('click', e => { const b = e.target.closest('[data-svp]'); if (!b) return; U.sv.state().p = +b.dataset.svp; U.IA.setLoc(3, 's_vport'); U.bus.emit(); window.scrollTo(0, 0); });
  });
})();
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C, { fmt, esc } = U;
  const pn = u => (U.ports ? U.ports(u) : u);
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const kp = (k, v, sub, c) => `<div class="pk"><div class="note">${k}</div><b class="${c || ''}">${v}</b><div class="note">${sub || ''}</div></div>`;
  const SK = { '要處理': 'bad', '留意': 'warn', '正常': 'ok', '資料不足': 'no' };
  // ---------------- M14-c23 這艘船在這港的卸櫃＋這港的缺櫃預估（沿用「場站與缺櫃 › 缺櫃預估」的計算）
  U.reg('M14-c23', (el, c) => {
    if (!CG.orgOk()) return U.emptyChart(el, '此組織沒有貨務資料（只有「模擬貨櫃公司」有）。');
    const vid = c.vids[0], a = U.sv.cur(vid); if (!a) return U.emptyChart(el, '這艘船沒有到港預報與卸貨港資料。');
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const ul = U.unloadAt ? U.unloadAt(vid, a.unlo) : null;
    const L = CG.forecastAll().filter(r => (C.yards[r.y] || [])[1] === a.unlo);
    const hi = L.filter(r => r.status === '要處理').length, mid = L.filter(r => r.status === '留意').length;
    const UT = Object.fromEntries(CG.util().filter(x => x.unlo === a.unlo).map(x => [x.yard, x]));   // 場站使用率與存量過期（原「空櫃存量」卡片併進來）
    el.innerHTML = `<div class="note" style="margin-bottom:.4rem">${esc(a.later ? U.sv.ordN(a.k) : '下一港')}：<b>${esc(pn(a.unlo))}</b></div>
      <div class="pkpi sv4">${kp('這艘船預計卸櫃', ul ? fmt(ul.tot, 0) + ' TEU' : '—', ul ? '滿＋空（模擬分配）' : '沒有卸貨資料')}${kp('其中空櫃', ul ? fmt(ul.emp, 0) + ' TEU' : '—', '可補這港的空櫃缺口')}${kp('冷櫃／危險櫃', ul ? `${fmt(ul.rf, 0)}／${fmt(ul.dg, 0)} TEU` : '—', '要接電／危險品作業')}${kp('這港缺櫃預估（7 天）', L.length ? (hi ? hi + ' 項會缺' : mid ? mid + ' 項可能缺' : '都夠') : '—', L.length ? L.length + ' 個場站櫃型' : '沒有場站資料', hi ? 'bad' : mid ? 'warn' : '')}</div><div data-t></div>`;
    if (!L.length) return U.emptyChart(el.querySelector('[data-t]'), pn(a.unlo) + ' 沒有場站空櫃資料');
    U.table(el.querySelector('[data-t]'), { rows: L.map(r => ({ yard: r.yard, ut: UT[r.yard], ct: r.ct + ' ' + r.sz, cur: r.cur, safety: r.safety, st: r.status, first: r.first, why: r.reason, rk: { '要處理': 0, '留意': 1, '正常': 2, '資料不足': 3 }[r.status] })), sort: ['rk', 1], pageSize: 8,
      cols: [{ k: 'yard', t: '場站（使用率）', h: r => esc(r.yard) + (r.ut ? (r.ut.cap == null ? '' : r.ut.u > 1 ? ' ' + tag('使用率異常', 'bad') : ' <span class="note">' + fmt(r.ut.u * 100, 0) + '%</span>') + (r.ut.stale ? ' ' + tag('資料過期', 'warn') : '') : '') }, { k: 'ct', t: '櫃型' }, { k: 'cur', t: '目前空櫃（個）', n: true, d: 0 }, { k: 'safety', t: '安全存量（個）', n: true, d: 0 },
        { k: 'rk', t: '狀態', h: r => tag(r.st, SK[r.st] || 'no') + (r.why ? ' <span class="note">' + esc(r.why) + '</span>' : '') }, { k: 'first', t: '最早缺櫃', n: true, h: r => (r.first ? '第 ' + r.first + ' 天' : '—') }] });
  });
})();
