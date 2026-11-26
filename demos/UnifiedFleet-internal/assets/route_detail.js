/* 營運總控台的航線詳情（route-detail-panel）：選了一條航線（圖層與篩選、地圖上的航線線條、港口詳情的航線代碼）時，
   在右側港口詳情的同一個位置顯示；點停靠港換成港口詳情，港口詳情上方可「回到航線」。
   顯示中的航線＝STATE.view.map.svc，且 STATE.view.routeOpen 為真；dispatch.js 的 drawDetail 決定要畫港口還是航線。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U || !U.cargo) return;
  const { COL, fmt, esc, STATE } = U, CG = U.cargo, HR = 3600000;
  const ts = s => (s ? Date.parse(s.length <= 16 ? s + ':00Z' : s + 'Z') : null);
  const pn = u => (U.ports ? U.ports(u) : u);
  const hhmm = s => (s ? String(s).slice(5, 16).replace('T', ' ') : '—');
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const LVN = { high: ['要處理', 'bad'], mid: ['留意', 'warn'], low: ['順暢', 'ok'], nodata: ['資料不足', 'no'] };
  const svcBy = code => (U.M.services || []).find(x => x.code === code);
  const stops = s => { const seen = []; s.ports.forEach(u => { if (!seen.includes(u)) seen.push(u); }); return seen; };

  // 整區（北美／歐洲／亞洲／大洋洲）：這一區每條航線的準點率、船數、警報數；點一條換成那條航線的詳情
  function renderRegion(d, rk) {
    const R = (U.svcRegions ? U.svcRegions() : []).find(r => r.k === rk);
    if (!R) { d.innerHTML = '<div class="note">找不到這一區的航線。</div>'; return; }
    const V = U.scopeVessels();
    const rows = R.list.map(sv => {
      const ids = V.filter(v => v.svc === sv.id).map(v => v.id);
      let n = 0, hi = 0; ids.forEach(id => { const a = U.vesselAlerts ? U.vesselAlerts(id) : { n: 0, hi: 0 }; n += a.n; hi += a.hi; });
      return { sv, ids, otp: ids.length ? U.fleetAt('OTP', ids, STATE.mi, 'mean') : null, n, hi };
    });
    const all = rows.flatMap(r => r.ids), idset = new Set(all);
    const otp = all.length ? U.fleetAt('OTP', all, STATE.mi, 'mean') : null;
    const UL = U.unloadPlan ? U.unloadPlan(5).filter(x => idset.has(x.vid)) : [], ulTot = UL.reduce((s, x) => s + x.u.tot, 0);
    const nEv = rows.reduce((s, r) => s + r.n, 0), nHi = rows.reduce((s, r) => s + r.hi, 0);
    const worst = rows.filter(r => r.otp != null).sort((a, b) => a.otp - b.otp)[0];
    const act = nHi ? `這一區有 ${nHi} 件要處理的警報事件${rows.filter(r => r.hi).length ? '（' + rows.filter(r => r.hi).map(r => r.sv.code + ' ' + r.hi + ' 件').join('、') + '）' : ''}，請到「運務管理 › 警報事件」處理。`
      : worst && worst.otp < 60 ? `${worst.sv.code} 本月準點率 ${fmt(worst.otp, 0)}%，是這一區最低：請點這條航線看是哪個港延誤。` : '這一區各航線目前正常，維持例行監看。';
    const oc = v => (v == null ? '' : v < 60 ? 'bad' : v < 75 ? 'warn' : '');
    const kp = (k, v, sub, c) => `<div class="pk"><div class="note">${k}</div><b class="${c || ''}">${v}</b><div class="note">${sub || ''}</div></div>`;
    const T = (title, text) => `<div class="bt">${title} <button type="button" class="qm pq" aria-expanded="false" title="說明">?</button></div><div class="pqx note" hidden>${text}</div>`;
    d.innerHTML = `<div class="pd rdt"><div class="bhead"><h4>${esc(R.n)}整區</h4><span class="sp"></span><span class="note">${R.list.length} 條航線・${all.length} 艘</span></div>
      <div class="bact"><b>建議動作</b>　${esc(act)}</div>
      ${T('重點數字', '準點率：本月這一區所有航線的船平均（到港延遲 6 小時內算準點）。未來 5 天卸櫃量：還沒靠泊的本公司船、依預計靠泊日加總。警報事件：這一區的船相關、還開著的事件與進行中警報。分區依航線停靠港自動判斷：有北美港＝北美，否則有歐洲港＝歐洲，否則有澳紐港＝大洋洲，其餘＝亞洲。')}
      <div class="pkpi">${kp('準點率（本月）', otp == null ? '—' : fmt(otp, 0) + '%', '', oc(otp))}${kp('船數', all.length + ' 艘', R.list.length + ' 條航線')}${kp('未來 5 天卸櫃量', fmt(ulTot, 0) + ' TEU', UL.length + ' 航次')}${kp('警報事件', nEv + ' 件', nHi ? '要處理 ' + nHi + ' 件' : '沒有要處理', nHi ? 'bad' : nEv ? 'warn' : '')}</div>
      ${T('這一區的航線', '點一條航線：地圖只留這條航線，右側換成航線詳情。準點率為本月平均；警報＝還開著的事件與進行中警報（紅字＝其中要處理的件數）。')}
      <div class="rgrid"><div class="rgh"><span>航線</span><span>船</span><span>準點率</span><span>警報</span></div>${rows.map(r => `<button type="button" class="rgr" data-rsv="${esc(r.sv.code)}"><span class="rsp"><b>${esc(r.sv.code)}</b><span class="rsx">${esc(r.sv.name)}</span></span><span>${r.ids.length}</span><span class="${oc(r.otp)}">${r.otp == null ? '—' : fmt(r.otp, 0) + '%'}</span><span>${r.n}${r.hi ? ` <b class="bad">(${r.hi})</b>` : ''}</span></button>`).join('')}</div></div>`;
    d.querySelectorAll('.pq').forEach(q => (q.onclick = () => { const x = q.closest('.bt').nextElementSibling; if (x) { x.hidden = !x.hidden; q.setAttribute('aria-expanded', x.hidden ? 'false' : 'true'); } }));
    d.querySelectorAll('[data-rsv]').forEach(b => (b.onclick = () => { if (U.mapPickSvc) { U.mapPickSvc(b.dataset.rsv); STATE.view.routeFrom = 'R:' + rk; } }));   // 記住從哪一區來，航線詳情上方可回到整區
  }

  U.routeDetail = {
    active: () => { const S = (STATE.view || {}).map || {}; return S.svc && STATE.view.routeOpen ? S.svc : ''; },
    close: clear => { STATE.view.routeOpen = false; if (clear && U.mapPickSvc) U.mapPickSvc(''); },   // clear：一併取消地圖上的航線（地圖回到全部）
    label: code => (U.svcLabel ? U.svcLabel(code) : '航線 ' + code),
    render(d, code) {
      if (String(code).startsWith('R:')) return renderRegion(d, code.slice(2));
      const sv = svcBy(code); if (!sv) { d.innerHTML = '<div class="note">找不到這條航線。</div>'; return; }
      const col = COL(), ids = U.scopeVessels().filter(v => v.svc === sv.id).map(v => v.id), idset = new Set(ids), st = stops(sv), stset = new Set(st);
      const arr = CG.arrivals().filter(a => a.status === 'EXPECTED' && a.org === 3 && idset.has(a.vid));
      const B = U.portBoard ? Object.fromEntries(U.portBoard().map(b => [b.unlo, b])) : {};
      const lv = u => (U.boardApi ? U.boardApi.level(u) : (B[u] || {}).level || 'nodata');
      // 重點數字
      const otp = U.fleetAt('OTP', ids, STATE.mi, 'mean');
      const E = U.etaStats ? U.etaStats(ids, STATE.mi, 'svc').rows.find(r => r.k === sv.code) : null;
      const UL = U.unloadPlan ? U.unloadPlan(5).filter(x => idset.has(x.vid)) : [], ulTot = UL.reduce((s, x) => s + x.u.tot, 0);
      let nEv = 0, nHi = 0; ids.forEach(id => { const a = U.vesselAlerts ? U.vesselAlerts(id) : { n: 0, hi: 0 }; nEv += a.n; nHi += a.hi; });
      // 停靠港序
      const rows = st.map((u, k) => {
        const nx = arr.filter(a => a.unlo === u).sort((a, b) => ts(a.etaCalc || a.etaRep) - ts(b.etaCalc || b.etaRep))[0];
        const ul = UL.filter(x => x.unlo === u).reduce((s, x) => s + x.u.tot, 0), b = B[u] || {};
        return { k, u, lv: lv(u), idx: b.idx, next: nx, h: nx ? (ts(nx.etaCalc || nx.etaRep) - CG.NOW) / HR : null, ul };
      });
      // 建議動作
      const hot = rows.filter(r => r.lv === 'high').sort((a, b) => (a.h == null ? 1e9 : a.h) - (b.h == null ? 1e9 : b.h))[0];
      const n24 = hot ? arr.filter(a => a.unlo === hot.u && (ts(a.etaCalc || a.etaRep) - CG.NOW) / HR <= 72).length : 0;
      const act = hot ? `${pn(hot.u)} 塞港${hot.idx != null ? '（指數 ' + fmt(hot.idx, 0) + '）' : ''}，本航線 ${n24} 艘 3 天內到港：請提早通知代理與碼頭預排泊位，必要時調整靠港順序或航速。`
        : E && !E.thin && E.repAbs >= 4 ? `回報 ETA 平均差 ${fmt(E.repAbs, 1)} 小時（計算 ETA ${fmt(E.calAbs, 1)} 小時）：請以計算 ETA 通知碼頭，並請船務檢討回報。`
          : nHi ? `本航線有 ${nHi} 件要處理的警報事件，請到「運務管理 › 警報事件」處理。` : '本航線各港目前順暢，維持例行監看。';
      // 航線上的船
      const ships = ids.map(id => {
        const a = arr.filter(x => x.vid === id).sort((p, q) => ts(p.etaCalc || p.etaRep) - ts(q.etaCalc || q.etaRep))[0], v = U.VBY[id];
        const stale = !a || !a.posT || CG.NOW - ts(a.posT) > 12 * HR, gap = a && a.etaRep && a.etaCalc ? (ts(a.etaRep) - ts(a.etaCalc)) / HR : null;
        return { id, name: v.name, a, stale, inPort: a && a.sog != null && a.sog < 1, gap, h: a ? (ts(a.etaCalc || a.etaRep) - CG.NOW) / HR : 1e9 };
      }).sort((x, y) => x.h - y.h);
      const kp = (k, v, sub, c) => `<div class="pk"><div class="note">${k}</div><b class="${c || ''}">${v}</b><div class="note">${sub || ''}</div></div>`;
      const T = (title, text) => `<div class="bt">${title} <button type="button" class="qm pq" aria-expanded="false" title="說明">?</button></div><div class="pqx note" hidden>${text}</div>`;
      const from = STATE.view.routeFrom && U.svcSetOf && U.svcSetOf(STATE.view.routeFrom).has(sv.code) ? STATE.view.routeFrom : '';
      d.innerHTML = (from ? `<button type="button" class="btn rback" data-rfrom>← 回到${esc(U.routeDetail.label(from))}</button>` : '') + `<div class="pd rdt"><div class="bhead"><h4>航線 ${esc(sv.code)}</h4><span class="note">${esc(sv.name)}</span><span class="sp"></span><span class="note">環航約 ${fmt(sv.rot, 0)} 天・${ids.length} 艘</span></div>
        <div class="bact"><b>建議動作</b>　${esc(act)}</div>
        ${T('重點數字', '準點率：本月這條航線的船平均（到港延遲 6 小時內算準點）。ETA 準確度：近 6 個月抵港前 24 小時的回報 ETA 與計算 ETA，和實際到港平均差幾小時。未來 5 天卸櫃量：還沒靠泊的本公司船、依預計靠泊日加總。警報事件：這條航線的船相關、還開著的事件與進行中警報。')}
        <div class="pkpi">${kp('準點率（本月）', otp == null ? '—' : fmt(otp, 0) + '%', '', otp == null ? '' : otp < 60 ? 'bad' : otp < 75 ? 'warn' : '')}${kp('ETA 平均差', E ? fmt(E.repAbs, 1) + ' 小時' : '—', E ? '回報；計算 ' + fmt(E.calAbs, 1) + ' 小時' : '近 6 個月沒有紀錄', E && E.repAbs >= 6 ? 'bad' : E && E.repAbs >= 4 ? 'warn' : '')}${kp('未來 5 天卸櫃量', fmt(ulTot, 0) + ' TEU', UL.length + ' 航次')}${kp('警報事件', nEv + ' 件', nHi ? '要處理 ' + nHi + ' 件' : '沒有要處理', nHi ? 'bad' : nEv ? 'warn' : '')}</div>
        ${T('停靠港序', '依船期表的停靠順序。點港口看港口詳情（上方可回到航線）。下一艘＝這條航線最早到這港的本公司船與計算 ETA（UTC）。卸櫃量＝未來 5 天這條航線的船在這港預計卸下的 TEU。')}
        <div class="rstops">${rows.map(r => `<button type="button" class="rsr" data-ru="${esc(r.u)}"><span class="rsn">${r.k + 1}</span><span class="rsp"><b>${esc(pn(r.u))}</b>${tag(LVN[r.lv][0], LVN[r.lv][1])}</span><span class="rsx">${r.next ? `<small>下一艘</small> ${esc(r.next.name)}・${hhmm(r.next.etaCalc || r.next.etaRep)}` : '<small>近期沒有本公司船</small>'}</span><span class="rsu">${r.ul ? fmt(r.ul, 0) + ' <small>TEU</small>' : '—'}</span></button>`).join('')}</div>
        ${T('航線上的船', '依抵達下一港的時間排序。點一艘船：地圖移到這艘船並標出。位置過期＝超過 12 小時沒更新。ETA 差＝回報 ETA 減計算 ETA，超過 6 小時標黃。')}
        <div class="rships">${ships.map(s => `<button type="button" class="rshp" data-rv="${s.id}"><b>${esc(s.name)}</b><span>${s.stale ? tag('位置過期', 'warn') : s.inPort ? tag('在港', 'no') : tag('航行中', 'ok')}</span><span class="rsx">${s.a ? `→ ${esc(pn(s.a.unlo))}・${hhmm(s.a.etaCalc || s.a.etaRep)}` : '—'}</span><span>${s.gap == null ? '' : Math.abs(s.gap) > 6 ? tag('ETA 差 ' + (s.gap > 0 ? '+' : '') + fmt(s.gap, 0) + ' 時', 'warn') : '<small class="note">ETA 差 ' + (s.gap > 0 ? '+' : '') + fmt(s.gap, 0) + ' 時</small>'}</span></button>`).join('')}</div><div class="svmon"></div></div>`;
      if (U.svcMonMount) U.svcMonMount(d.querySelector('.svmon'), sv.code);   // Service 監控（service_monitor.js）
      d.querySelectorAll('.pq').forEach(q => (q.onclick = () => { const x = q.closest('.bt').nextElementSibling; if (x) { x.hidden = !x.hidden; q.setAttribute('aria-expanded', x.hidden ? 'false' : 'true'); } }));
      d.querySelectorAll('[data-ru]').forEach(b => (b.onclick = () => { const sc = d.closest('.psheet'); STATE.view.routeScroll = sc ? sc.scrollTop : 0; if (U.boardApi) U.boardApi.select(b.dataset.ru, true); }));
      { const rf = d.querySelector('[data-rfrom]'); if (rf) rf.onclick = () => { if (U.mapPickSvc) U.mapPickSvc(from); }; }
      d.querySelectorAll('[data-rv]').forEach(b => (b.onclick = () => { const S = STATE.view.map; if (!S) return; S.fv = +b.dataset.rv; S.fvFly = true; if (U.cmdMap && U.cmdMap.redraw) U.cmdMap.redraw(); }));
    },
  };
})();
