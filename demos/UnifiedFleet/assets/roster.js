/* 第 2 層：船舶清單。欄位＝各主題的數值與燈號（來自 risk.js 的逐船評估），可排序、篩選、分頁、分組、匯出。
   篩選條件放在 STATE.rf，並同步到網址（r_ 開頭的參數）。 */
(function () {
  'use strict';
  const U = window.UI, { esc, STATE, VBY } = U;
  const LV = { high: ['bad', '要處理'], mid: ['warn', '留意'], low: ['ok', '正常'], nodata: ['no', '資料不足'] };
  const RANK = { high: 3, mid: 2, low: 1, nodata: 0 };
  const PAGE = 25;
  const DEF = () => ({ q: '', port: '', cls: '', svc: '', lv: '', sort: '_score', dir: -1, p: 0, grp: '', hide: '' });
  STATE.rf = DEF();

  // ---- 網址同步
  const KEYS = { q: 'r_q', port: 'r_port', cls: 'r_cls', svc: 'r_svc', lv: 'r_lv', sort: 'r_sort', dir: 'r_dir', p: 'r_p', grp: 'r_grp', hide: 'r_hide' };
  function readHash(h) {
    const f = DEF();
    Object.keys(KEYS).forEach(k => { const v = h.get(KEYS[k]); if (v != null) f[k] = (k === 'dir' || k === 'p') ? +v : v; });
    STATE.rf = f;
  }
  function writeHash(h) {
    if (STATE.l !== 2) return;
    const d = DEF();
    Object.keys(KEYS).forEach(k => { if (STATE.rf[k] !== d[k]) h.set(KEYS[k], STATE.rf[k]); });
  }
  // 從第 1 層帶篩選進清單：U.openRoster({lv:'high', cls:'...'})
  U.openRoster = function (f) { STATE.rf = Object.assign(DEF(), f || {}); STATE.l = 2; U.bus.emit(); window.scrollTo(0, 0); };

  const svcOf = v => (v.svc ? (U.M.services.find(x => x.id === v.svc) || {}).code : null) || '';
  const overall = U.risk.overall;
  const pn = u => (u ? (U.ports ? U.ports(u) : u) : '');
  const isAdmin = () => STATE.role === '系統管理員';
  // 船的位置（fleet-list-redesign）：狀態、抵達港（在港＝目前港；航行中＝上一個抵達的港）、目的港（正要去的下一港＋計算 ETA）
  const tsZ = s => (s ? Date.parse(s.length <= 16 ? s + ':00Z' : s + 'Z') : null);
  function posOf(id) {
    const CG = U.cargo, NOW = CG ? CG.NOW : Date.now(), B = CG && CG.C.berth;
    const arr = CG ? CG.arrivals().filter(a => a.vid === id && a.status === 'EXPECTED').sort((a, b) => ((a.etaCalc || a.etaRep || '') < (b.etaCalc || b.etaRep || '') ? -1 : 1)) : [];
    const cur = B ? (B.own || []).find(r => r[0] === id && tsZ(r[5]) <= NOW && tsZ(r[8]) > NOW) : null;
    const calls = U.risk.rows('calls').filter(r => r.vid === id && r.nor && tsZ(r.nor) <= NOW).sort((a, b) => (a.nor < b.nor ? 1 : -1));
    const last = calls[0];
    const a0 = arr[0], stale = a0 && (a0.posT == null || NOW - tsZ(a0.posT) > 12 * 3600000);
    const inPort = !!cur || (last && (!last.dep || tsZ(last.dep) > NOW));
    const at = cur ? cur[2] : last ? last.port : null;
    const dest = arr.find(a => a.unlo !== (inPort ? at : null)) || null;
    return { st: stale ? '位置過期' : inPort ? '在港' : '航行中', at, atNote: inPort ? '靠泊中' : last && last.dep ? '離港 ' + last.dep.slice(5, 16).replace('T', ' ') : '', dest: dest ? dest.unlo : null, eta: dest ? (dest.etaCalc || dest.etaRep || '').slice(5, 16).replace('T', ' ') : '' };
  }
  U.rosterPos = posOf;                                      // 單船總覽的船舶動態沿用同一套位置判斷（single-overview）
  function build(c) {
    const themes = U.risk.themes[STATE.type];
    return c.vids.map(id => {
      const v = VBY[id], o = U.risk.byVessel(id);
      const ps = posOf(id);
      return { id, name: v.name, cls: v.cls || '', svc: svcOf(v), o, all: overall(o), _score: U.risk.score(id), st: ps.st, at: ps.at, atp: pn(ps.at), atNote: ps.atNote, dest: ps.dest, destp: pn(ps.dest), eta: ps.eta };
    });
  }
  const TXT = ['name', 'cls', 'svc', 'st', 'atp', 'destp'];
  const sortVal = (r, k) => (k === '_score' ? r._score : TXT.includes(k) ? r[k] : r.o[k] ? RANK[r.o[k].level] * 1e6 + (r.o[k].value == null ? 0 : Math.abs(r.o[k].value)) : null);

  function csv(rows, themes, cols) {
    const head = ['船名', '級距', '航線', '狀態', '抵達港', '抵達港說明', '目的港', '目的港計算 ETA（UTC）'].concat(...cols.map(t => [t.label, t.label + '燈號']));
    const lines = [head].concat(rows.map(r => [r.name, r.cls, r.svc, r.st, r.atp, r.atNote, r.destp, r.eta].concat(...cols.map(t => [r.o[t.k].text, LV[r.o[t.k].level][1]]))));
    const txt = '﻿' + lines.map(l => l.map(x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = '船舶清單.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  function render(el, c) {
    el.classList.add('auto');
    const themes = U.risk.themes[STATE.type], all = build(c);
    const sync = () => { U.syncHash && U.syncHash(); };
    function draw() {
      const f = STATE.rf, hide = new Set((f.hide || '').split(',').filter(Boolean));
      const adm = isAdmin(), ADM = U.ADMIN_COLS || ['data', 'dq'], avail = themes.filter(t => adm || !ADM.includes(t.k));   // 資料更新、資料品質只給系統管理員
      const cols = avail.filter(t => !hide.has(t.k));
      const clsList = [...new Set(all.map(r => r.cls).filter(Boolean))].sort(), svcList = [...new Set(all.map(r => r.svc).filter(Boolean))].sort();
      const portList = [...new Set(all.flatMap(r => [r.at, r.dest]).filter(Boolean))].sort((a, b) => (pn(a) < pn(b) ? -1 : 1));
      const q = f.q.trim().toLowerCase();
      // 紅黃綠船數（依其他篩選，不含等級篩選本身）
      const base = all.filter(r => (!f.cls || r.cls === f.cls) && (!f.svc || r.svc === f.svc) && (!f.port || r.at === f.port || r.dest === f.port) && (!q || r.name.toLowerCase().includes(q)));
      const cnt = { high: 0, mid: 0, low: 0 }; base.forEach(r => cnt[r.all]++);
      let rows = base.filter(r => !f.lv || r.all === f.lv);
      rows.sort((a, b) => {
        if (f.grp) { const g = (a[f.grp] || '~').localeCompare(b[f.grp] || '~'); if (g) return g; }
        const x = sortVal(a, f.sort), y = sortVal(b, f.sort);
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        return (x > y ? 1 : x < y ? -1 : a.name.localeCompare(b.name)) * f.dir;
      });
      U.STATE.order = rows.map(r => r.id);
      const npg = Math.max(1, Math.ceil(rows.length / PAGE)); if (f.p >= npg) f.p = npg - 1; if (f.p < 0) f.p = 0;
      const page = rows.slice(f.p * PAGE, f.p * PAGE + PAGE);
      const filtered = f.q || f.port || f.cls || f.svc || f.lv;
      const arrow = k => (f.sort === k ? (f.dir > 0 ? ' ▲' : ' ▼') : '');
      const opt = (arr, v, all0) => `<option value="">${all0}</option>` + arr.map(x => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
      let lastG = null, body = '';
      page.forEach(r => {
        if (f.grp && r[f.grp] !== lastG) { lastG = r[f.grp]; body += `<tr class="grp"><td colspan="${6 + cols.length}">${esc(lastG || '未分類')}</td></tr>`; }
        body += `<tr data-id="${r.id}"><td class="nm"><a href="#" class="lnk" data-id="${r.id}">${esc(r.name)}</a></td><td>${esc(r.cls)}</td><td>${esc(r.svc || '—')}</td><td><span class="tag ${r.st === '位置過期' ? 'warn' : r.st === '在港' ? 'no' : 'ok'}">${r.st}</span></td><td class="ps">${r.at ? `<b>${esc(r.atp)}</b><div class="rsub">${esc(r.atNote)}</div>` : '—'}</td><td class="ps">${r.dest ? `<b>${esc(r.destp)}</b><div class="rsub">ETA ${esc(r.eta)}</div>` : '—'}</td>${cols.map(t => { const x = r.o[t.k], l = LV[x.level]; return t.k === 'alarm' ? `<td class="n lamp ${l[0]}" title="${esc('警報數：' + (x.summary || ''))}"><i></i>${x.value ? `<button type="button" class="lnk" data-alarm="${r.id}" title="到警報事件，只看這艘船">${esc(x.text)}</button>` : esc(x.text || '0 件')}</td>` : `<td class="n lamp ${l[0]}" title="${esc(t.label + '：' + l[1] + '｜' + (x.summary || ''))}"><i></i>${esc(x.text || l[1])}</td>`; }).join('')}</tr>`;
      });
      el.innerHTML = `<div class="rost">
        <div class="rsum"><button class="lvbtn bad${f.lv === 'high' ? ' on' : ''}" data-lv="high">要處理 <b>${cnt.high}</b> 艘</button><button class="lvbtn warn${f.lv === 'mid' ? ' on' : ''}" data-lv="mid">留意 <b>${cnt.mid}</b> 艘</button><button class="lvbtn ok${f.lv === 'low' ? ' on' : ''}" data-lv="low">正常 <b>${cnt.low}</b> 艘</button>
          <span class="note">整體等級：2 欄以上「要處理」＝要處理；1 欄要處理或 2 欄以上留意＝留意；其餘正常。點一下只看該等級，再點一次取消。</span></div>
        <div class="toolbar"><input type="text" id="rq" placeholder="搜尋船舶" value="${esc(f.q)}" aria-label="搜尋船舶（船名）">
          <label class="fld">港口 <select id="rport" title="目的港或抵達港符合就列出"><option value="">全部</option>${portList.map(u => `<option value="${esc(u)}"${u === f.port ? ' selected' : ''}>${esc(pn(u))}</option>`).join('')}</select></label>
          <label class="fld">級距 <select id="rcls">${opt(clsList, f.cls, '全部')}</select></label>
          ${svcList.length ? `<label class="fld">航線 <select id="rsvc">${opt(svcList, f.svc, '全部')}</select></label>` : ''}
          <label class="fld">分組 <select id="rgrp"><option value="">不分組</option><option value="cls"${f.grp === 'cls' ? ' selected' : ''}>依級距</option>${svcList.length ? `<option value="svc"${f.grp === 'svc' ? ' selected' : ''}>依航線</option>` : ''}</select></label>
          <details class="colpick"><summary class="btn">欄位</summary><div>${avail.map(t => `<label><input type="checkbox" data-col="${t.k}"${hide.has(t.k) ? '' : ' checked'}> ${esc(t.label)}</label>`).join('')}</div></details>
          <button class="btn" id="rcsv">匯出 CSV</button>
          ${filtered ? `<span class="note">已篩選：${rows.length} 艘（全部 ${all.length} 艘）</span><button class="btn" id="rclr">清除篩選</button>` : `<span class="note">共 ${all.length} 艘</span>`}</div>
        <div class="rwrap"><table class="t rt"><thead><tr><th data-k="name" class="nm">船名${arrow('name')}</th><th data-k="cls">級距${arrow('cls')}</th><th data-k="svc">航線${arrow('svc')}</th><th data-k="st">狀態${arrow('st')}</th><th data-k="atp" title="在港＝目前所在港；航行中＝上一個抵達的港">抵達港${arrow('atp')}</th><th data-k="destp" title="正要去的下一港與計算 ETA（UTC）">目的港${arrow('destp')}</th>${cols.map(t => `<th class="n" data-k="${t.k}" title="點一下依此欄排序，最差的排最前">${esc(t.label)}${arrow(t.k)}</th>`).join('')}</tr></thead>
          <tbody>${body || `<tr><td colspan="${6 + cols.length}" class="note">沒有符合條件的船</td></tr>`}</tbody></table></div>
        ${npg > 1 ? `<div class="pager"><span class="note">第 ${f.p * PAGE + 1}–${Math.min(rows.length, f.p * PAGE + PAGE)} 筆，共 ${rows.length} 筆</span><span class="pg"><button data-pg="-1"${f.p === 0 ? ' disabled' : ''}>上一頁</button>${Array.from({ length: npg }, (_, i) => `<button data-pg="${i}" class="${i === f.p ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-pg="+1"${f.p === npg - 1 ? ' disabled' : ''}>下一頁</button></span></div>` : ''}</div>`;
      // 清單高度符合視窗：表格區塊撐到視窗底部（扣掉下方分頁與風險判讀），表格內捲動；視窗改變大小時重算
      el.classList.add('auto'); el.style.maxHeight = 'none';
      U.rosterFit = () => { const w = document.querySelector('.rost .rwrap'); if (!w) return; const blk = w.closest('.blk'), rd = blk && blk.querySelector(':scope > .rd'), MIN = 240;
        w.style.maxHeight = 'none'; if (rd) { rd.style.maxHeight = ''; rd.style.overflow = ''; }
        const r = w.getBoundingClientRect(), below = blk ? Math.max(0, blk.getBoundingClientRect().bottom - r.bottom) : 0, top = r.top + window.scrollY, avail = Math.floor(innerHeight - top - below - 16);
        w.style.maxHeight = Math.max(MIN, avail) + 'px';
        if (avail < MIN && rd && rd.offsetHeight) { rd.style.maxHeight = Math.max(120, rd.offsetHeight - (MIN - avail)) + 'px'; rd.style.overflow = 'auto'; } };   // 風險判讀展開後太高：表格保留至少 5 列，判讀內容改在框內捲動，整張卡仍在視窗內
      if (!U._rosterFitOn) { U._rosterFitOn = true; addEventListener('resize', () => U.rosterFit && U.rosterFit()); }
      requestAnimationFrame(() => U.rosterFit()); U.rosterFit();
      { const blk = el.closest('.blk');   // 風險判讀「展開／收合」或說明打開時，表格下方的高度會變：觀察表格以外的區域，變了就重算表格高度
        if (U._rosterRO) U._rosterRO.disconnect();
        if (blk && window.ResizeObserver) { let last = ''; const ro = U._rosterRO = new ResizeObserver(() => { const k = [...blk.children].filter(c => c !== el).map(c => c.offsetHeight).join(','); if (k !== last) { last = k; U.rosterFit(); } });
          [...blk.children].filter(c => c !== el).forEach(c => ro.observe(c)); }
        if (blk && !blk._rfClick) { blk._rfClick = true; blk.addEventListener('click', e => { if (el.contains(e.target)) return; setTimeout(() => U.rosterFit(), 0); setTimeout(() => U.rosterFit(), 350); }); } }   // 保險：點了展開／收合、說明後也重算（動畫結束再算一次）
      const root = el.closest('.blk') || el;   // 篩選列會被搬到卡片標題列（app.js），之後找元素要從整張卡找
      const on = (s, ev, fn) => el.querySelectorAll(s).forEach(n => n.addEventListener(ev, fn));
      const set = (o) => { Object.assign(STATE.rf, o, o.p == null ? { p: 0 } : {}); sync(); draw(); };
      const q0 = el.querySelector('#rq');
      q0.addEventListener('input', () => { const pos = q0.selectionStart; set({ q: q0.value }); const n = root.querySelector('#rq'); n.focus(); n.setSelectionRange(pos, pos); });
      el.querySelector('#rcls').onchange = e => set({ cls: e.target.value });
      el.querySelector('#rport').onchange = e => set({ port: e.target.value });
      if (el.querySelector('#rsvc')) el.querySelector('#rsvc').onchange = e => set({ svc: e.target.value });
      el.querySelector('#rgrp').onchange = e => set({ grp: e.target.value });
      if (el.querySelector('#rclr')) el.querySelector('#rclr').onclick = () => set({ q: '', port: '', cls: '', svc: '', lv: '' });
      el.querySelector('#rcsv').onclick = () => csv(rows, themes, cols);
      on('.lvbtn', 'click', e => set({ lv: f.lv === e.currentTarget.dataset.lv ? '' : e.currentTarget.dataset.lv }));
      on('th[data-k]', 'click', e => { const k = e.currentTarget.dataset.k; set(f.sort === k ? { dir: -f.dir } : { sort: k, dir: TXT.includes(k) ? 1 : -1 }); });
      on('.pager [data-pg]', 'click', e => { const v = e.currentTarget.dataset.pg; set({ p: v === '+1' ? f.p + 1 : v === '-1' ? f.p - 1 : +v }); });
      on('[data-col]', 'change', () => { const hs = [...root.querySelectorAll('[data-col]')].filter(x => !x.checked).map(x => x.dataset.col); set({ hide: hs.join(','), p: f.p }); root.querySelector('.colpick').open = true; });
      on('a.lnk', 'click', e => { e.preventDefault(); U.go('M3', +e.currentTarget.dataset.id); });
      on('[data-alarm]', 'click', e => { e.stopPropagation(); if (U.openVesselAlerts) U.openVesselAlerts(+e.currentTarget.dataset.alarm); });
      // 清單內部重畫（篩選、排序、分頁）時：新的篩選列取代標題列上舊的那一份，不會出現兩份
      { const tools = root.querySelector('[data-tools]'), tb = el.querySelector('.rost > .toolbar'); if (tools && tb) { tools.querySelectorAll('.toolbar').forEach(x => x.remove()); tools.appendChild(tb); U.rosterFit(); } }
    }
    draw();
  }
  U.reg(['M2-b0', 'M2-c0'], render);
  U.rosterHash = { read: readHash, write: writeHash };
})();
