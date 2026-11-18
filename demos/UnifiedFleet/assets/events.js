/* 事件處理：把「今日要處理」的問題立案成事件，有負責人、狀態、回報處理結果與時間軸；
   問題自己消失的事件標「條件已消失」，沒人處理超過 N 天自動歸檔；統計給長官看（平均處理時間、逾時比例、各類別件數）。
   資料存在瀏覽器 localStorage（離線示範；正式版改接資料庫）。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, { esc, fmt } = U;
  const KEY = 'uf_events_v1', HR = 3600000, DAY = 24 * HR;
  const ARCHIVE_DAYS = 3, SLA = { high: 24, mid: 48 };           // 條件消失且沒人處理 N 天自動歸檔；處理時限（小時）：要處理 24、留意 48
  const USERS = [['Op-Alice', '運務'], ['Op-Bob', '營運'], ['Op-Carol', '貨務'], ['Mgr-Lee', '主管']];
  const RESULTS = ['已通知代理', '已調櫃', '已聯絡船長', '已通知碼頭', '已調整航程', '已補報位置', '其他'];
  const KINDS = { port: '港口', yard: '缺櫃', eta: 'ETA', pos: '位置' };
  const STATUS = { new: '待處理', in_progress: '處理中', resolved: '已解決', archived: '已歸檔' };
  const isRole = (u, r) => (USERS.find(x => x[0] === u) || [])[1] === r;
  const isMgr = u => isRole(u, '主管');

  // ---------- 儲存與時鐘：以資料時間為起點，之後隨實際時間前進；記住上次時間，重新整理不會倒退
  let S = null, base = 0, t0 = 0;
  function load() {
    if (S) return S;
    try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
    if (!S || !Array.isArray(S.events)) S = { events: [], user: 'Op-Alice', last: 0, seq: 0, seeded: false };
    base = Math.max(CG.NOW, S.last || 0); t0 = Date.now();
    return S;
  }
  const now = () => { load(); return base + (Date.now() - t0); };
  function save() { try { S.last = now(); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  const closed = e => e.status === 'resolved' || e.status === 'archived';
  const hhmm = t => (t ? new Date(t).toISOString().replace('T', ' ').slice(5, 16) : '—');
  const dur = ms => { const h = ms / HR; return h < 1 ? Math.max(1, Math.round(ms / 60000)) + ' 分' : h < 48 ? fmt(h, 1) + ' 小時' : fmt(h / 24, 1) + ' 天'; };
  const hist = (e, by, act, text, result) => e.history.push({ t: now(), by, act, text: text || '', result: result || '' });
  const user = () => load().user;
  const setUser = u => { load().user = u; save(); };

  // ---------- 示範歷史：第一次開啟時補一些已結案的事件，統計才有東西可看（標「示範」）
  function seed() {
    const s = load(); if (s.seeded) return; s.seeded = true;
    let r = 12345; const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ports = Object.keys(CG.C.ports || {}), names = Object.values(U.VBY || {}).filter(v => v.cls).map(v => v.name);
    const mk = (kind, i) => ({
      port: ['塞港指數偏高', ports[i % Math.max(1, ports.length)] ? (typeof U.ports === 'function' ? U.ports(ports[i % ports.length]) : ports[i % ports.length]) : '港口'], yard: ['預估缺櫃', (CG.C.yards[i % Math.max(1, CG.C.yards.length)] || ['場站'])[0]],
      eta: ['回報與計算 ETA 落差', names[i % Math.max(1, names.length)] || '船舶'], pos: ['位置超過 12 小時沒更新', names[(i + 3) % Math.max(1, names.length)] || '船舶'],
    }[kind]);
    const people = USERS.map(u => u[0]), kinds = Object.keys(KINDS);
    for (let i = 0; i < 16; i++) {
      const kind = kinds[i % 4], [what, who] = mk(kind, i), lv = rnd() < .45 ? 'high' : 'mid', open = CG.NOW - (1 + Math.floor(rnd() * 13)) * DAY - Math.floor(rnd() * 12) * HR;
      const took = (lv === 'high' ? 3 + rnd() * 40 : 6 + rnd() * 70) * HR, by = people[Math.floor(rnd() * 4)];
      const e = { id: 'S' + (i + 1), kind, key: 'seed:' + i, title: `${who}　${what}`, sub: '示範資料', lv, openedAt: open, status: 'resolved', assignee: by, cleared: false, clearedAt: null, retrig: 0, resolvedAt: open + took, resolvedBy: by, result: RESULTS[Math.floor(rnd() * 5)], seed: true,
        history: [{ t: open, by: '系統', act: '立案', text: '', result: '' }, { t: open + 1 * HR, by, act: '開始處理', text: '', result: '' }, { t: open + took, by, act: '標記已解決', text: '', result: '' }] };
      if (i % 7 === 6) { e.status = 'archived'; e.cleared = true; e.clearedAt = open + 5 * HR; e.resolvedAt = open + (5 + ARCHIVE_DAYS * 24) * HR; e.resolvedBy = '系統'; e.result = ''; e.assignee = null; e.history = [e.history[0], { t: e.clearedAt, by: '系統', act: '條件已消失', text: '', result: '' }, { t: e.resolvedAt, by: '系統', act: '自動歸檔', text: `條件消失超過 ${ARCHIVE_DAYS} 天沒人處理`, result: '' }]; }
      s.events.push(e);
    }
    s.seq = 100; save();
  }

  // ---------- 立案與同步：todo 項目 = { key, kind, lv, title, sub, spec }
  function sync(items) {
    seed(); const s = load(), t = now(), keys = new Set(items.map(x => x.key));
    items.forEach(it => {
      const ev = s.events.find(e => e.key === it.key && !closed(e));
      if (ev) { ev.lv = it.lv; ev.title = it.title; ev.sub = it.sub; ev.spec = it.spec; if (ev.cleared) { ev.cleared = false; ev.clearedAt = null; ev.retrig++; hist(ev, '系統', '條件再度出現', `第 ${ev.retrig} 次再度觸發`); } }
      else s.events.push({ id: 'E' + (++s.seq), kind: it.kind, key: it.key, title: it.title, sub: it.sub, lv: it.lv, spec: it.spec, openedAt: t, status: 'new', assignee: null, cleared: false, clearedAt: null, retrig: 0, resolvedAt: null, resolvedBy: null, result: '', history: [{ t, by: '系統', act: '立案', text: it.title, result: '' }] });
    });
    s.events.forEach(e => {
      if (closed(e) || e.seed) return;
      if (!keys.has(e.key) && !e.cleared) { e.cleared = true; e.clearedAt = t; hist(e, '系統', '條件已消失', '系統偵測問題已不存在'); }
      if (e.cleared && e.status === 'new' && t - e.clearedAt > ARCHIVE_DAYS * DAY) { e.status = 'archived'; e.resolvedAt = t; e.resolvedBy = '系統'; hist(e, '系統', '自動歸檔', `條件消失超過 ${ARCHIVE_DAYS} 天沒人處理`); }
    });
    save();
  }

  // ---------- 動作與權限（誰都留紀錄）
  const find = id => load().events.find(e => e.id === id);
  function can(e, act, u) {
    u = u || user();
    if (act === 'start') return e.status === 'new';
    if (act === 'resolve') return (e.status === 'in_progress' || e.status === 'new') && (isMgr(u) || e.assignee === u);
    if (act === 'reset') return e.status === 'in_progress' && (isMgr(u) || e.assignee === u);
    if (act === 'reopen') return closed(e) && (isMgr(u) || e.resolvedBy === u || e.assignee === u);
    if (act === 'assign') return !closed(e) && (isMgr(u) || e.assignee === u || !e.assignee);
    if (act === 'note') return !e.seed;
    return false;
  }
  function act(id, a, o) {
    const e = find(id), u = user(); o = o || {};
    if (!e || !can(e, a, u)) return { ok: false, msg: '這個動作你目前沒有權限，或事件狀態不允許' };
    if (a === 'start') { e.status = 'in_progress'; if (!e.assignee) e.assignee = u; hist(e, u, '開始處理', '負責人：' + e.assignee); }
    else if (a === 'resolve') { if (!o.result) return { ok: false, msg: '結案前請先選「處理結果」' }; e.status = 'resolved'; e.resolvedAt = now(); e.resolvedBy = u; e.result = o.result; if (!e.assignee) e.assignee = u; hist(e, u, '標記已解決', o.text, o.result); }
    else if (a === 'reset') { e.status = 'new'; hist(e, u, '退回待處理', o.text); }
    else if (a === 'reopen') { e.status = 'in_progress'; e.resolvedAt = null; e.resolvedBy = null; e.cleared = false; e.clearedAt = null; hist(e, u, '重新開啟', o.text); }
    else if (a === 'assign') { const to = o.to || u; hist(e, u, '指派', `${e.assignee || '無'} → ${to}`); e.assignee = to; if (e.status === 'new') e.status = 'in_progress'; }
    else if (a === 'note') { if (!o.text && !o.result) return { ok: false, msg: '請選處理結果或輸入文字' }; hist(e, u, '回報', o.text, o.result); if (o.result) e.result = o.result; }
    save(); return { ok: true };
  }

  // ---------- 統計：平均處理時間、逾時比例、各類別件數、各人處理件數
  function overdue(e, t) { return !closed(e) && !e.cleared && t - e.openedAt > (SLA[e.lv] || 48) * HR; }
  function stats() {
    const ev = load().events, t = now(), res = ev.filter(e => e.status === 'resolved');
    const took = e => e.resolvedAt - e.openedAt, late = e => took(e) > (SLA[e.lv] || 48) * HR;
    const lateRes = res.filter(late).length, od = ev.filter(e => overdue(e, t)), denom = res.length + ev.filter(e => !closed(e) && !e.cleared).length;
    const by = {}; Object.keys(KINDS).forEach(k => (by[k] = { new: 0, in_progress: 0, resolved: 0, archived: 0, n: 0, sum: 0, late: 0, open: 0 }));
    ev.forEach(e => { const b = by[e.kind]; if (!b) return; b[e.status]++; if (e.status === 'resolved') { b.n++; b.sum += took(e); if (late(e)) b.late++; } if (overdue(e, t)) b.late++, b.open++; });
    const ppl = {}; res.forEach(e => { const p = (ppl[e.resolvedBy] = ppl[e.resolvedBy] || { n: 0, sum: 0 }); p.n++; p.sum += took(e); });
    return { n: ev.length, open: ev.filter(e => e.status === 'new').length, prog: ev.filter(e => e.status === 'in_progress').length, done: res.length, arch: ev.filter(e => e.status === 'archived').length,
      avg: res.length ? res.reduce((s, e) => s + took(e), 0) / res.length : null, rate: denom ? (lateRes + od.length) / denom : null, overdueOpen: od.length, by, ppl };
  }

  // ---------- 畫面：今日要處理（事件清單）
  const V = { tab: 'new', kind: '', mine: false, sel: new Set(), go: null };
  const LV = { high: ['要處理', 'bad'], mid: ['留意', 'warn'] };
  function render(el, items, goFn) {
    V.go = goFn || V.go; sync(items); const s = load(), t = now(), u = user();
    const inTab = e => (V.tab === 'new' ? e.status === 'new' : V.tab === 'prog' ? e.status === 'in_progress' : closed(e));
    const cnt = { new: s.events.filter(e => e.status === 'new').length, prog: s.events.filter(e => e.status === 'in_progress').length, done: s.events.filter(closed).length };
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const tabs = `<div class="evtabs" role="tablist">${[['new', '待處理'], ['prog', '處理中'], ['done', '已結案'], ['stat', '統計']].map(([k, n]) => `<button role="tab" data-evt="${k}"${V.tab === k ? ' aria-selected="true"' : ''}>${n}${cnt[k] != null ? ` <small>${cnt[k]}</small>` : ''}</button>`).join('')}</div>`;
    if (V.tab === 'stat') { el.innerHTML = tabs + statsHtml(); wire(el, items); return; }
    const rows = s.events.filter(inTab).filter(e => !V.kind || e.kind === V.kind).filter(e => !V.mine || e.assignee === u)
      .sort((a, b) => (V.tab === 'done' ? (b.resolvedAt || 0) - (a.resolvedAt || 0) : (a.lv === b.lv ? a.openedAt - b.openedAt : a.lv === 'high' ? -1 : 1)));
    const tools = `<div class="evtools"><select data-evk aria-label="類別"><option value="">全部類別</option>${Object.entries(KINDS).map(([k, n]) => `<option value="${k}"${V.kind === k ? ' selected' : ''}>${n}</option>`).join('')}</select><label class="fld"><input type="checkbox" data-evm${V.mine ? ' checked' : ''}> 只看我的</label></div>`;
    const bulk = V.tab !== 'done' ? `<div class="evbulk"${V.sel.size ? '' : ' hidden'}><span class="note">已選 <b data-evn>${V.sel.size}</b> 筆</span><button class="btn" data-evb="start">開始處理</button><select data-evr aria-label="處理結果"><option value="">結案的處理結果…</option>${RESULTS.map(r => `<option>${r}</option>`).join('')}</select><button class="btn" data-evb="resolve">標記已解決</button></div>` : '';
    const row = e => {
      const od = overdue(e, t), chips = (e.assignee ? `<span class="evchip">${esc(e.assignee)}</span>` : '<span class="evchip no">未指派</span>') + (od ? '<span class="evchip bad">逾時</span>' : '') + (e.cleared && !closed(e) ? '<span class="evchip ok">條件已消失</span>' : '') + (e.retrig ? `<span class="evchip warn">再發 ${e.retrig}</span>` : '') + (e.seed ? '<span class="evchip no">示範</span>' : '');
      const when = V.tab === 'done' ? (e.status === 'archived' ? '自動歸檔' : '結案：' + esc(e.result || '—')) + ' · ' + hhmm(e.resolvedAt) : '開立 ' + dur(t - e.openedAt) + '前';
      return `<div class="evrow ${e.lv}" data-id="${e.id}"><button class="evmain" title="${esc(e.sub || '')}"><span class="evtitle"><i>${KINDS[e.kind]}</i>${esc(e.title)}</span><span class="evsub"><span>${when}</span>${chips}</span></button></div>`;
    };
    el.innerHTML = tabs + tools + bulk + `<div class="evlist">${rows.length ? rows.map(row).join('') : '<div class="note" style="padding:.8rem">這裡沒有事件。</div>'}</div>`;
    wire(el, items);
  }
  function statsHtml() {
    const st = stats(), k = (a, b, c) => `<div class="evk"><div class="note">${a}</div><b>${b}</b><div class="note">${c}</div></div>`;
    const kinds = Object.entries(st.by).map(([key, b]) => `<tr><td>${KINDS[key]}</td><td class="num">${b.new}</td><td class="num">${b.in_progress}</td><td class="num">${b.resolved}</td><td class="num">${b.archived}</td><td class="num">${b.n ? fmt(b.sum / b.n / HR, 1) : '—'}</td><td class="num">${b.n + b.open ? fmt(100 * b.late / (b.n + b.open), 0) + '%' : '—'}</td></tr>`).join('');
    const ppl = Object.entries(st.ppl).sort((a, b) => b[1].n - a[1].n).map(([p, v]) => `<tr><td>${esc(p)}</td><td class="num">${v.n}</td><td class="num">${fmt(v.sum / v.n / HR, 1)}</td></tr>`).join('');
    return `<div class="evks">${k('平均處理時間', st.avg == null ? '—' : dur(st.avg), '已解決事件，開立到解決')}${k('逾時比例', st.rate == null ? '—' : fmt(100 * st.rate, 0) + '%', `超過時限：要處理 ${SLA.high}、留意 ${SLA.mid} 小時`)}${k('逾時未處理', st.overdueOpen + ' 件', '目前還開著且超過時限')}${k('事件總數', st.n + ' 件', `待處理 ${st.open}、處理中 ${st.prog}、已解決 ${st.done}、歸檔 ${st.arch}`)}</div>
      <table class="evt"><caption>各類別件數</caption><thead><tr><th>類別</th><th class="num">待處理</th><th class="num">處理中</th><th class="num">已解決</th><th class="num">歸檔</th><th class="num">平均處理（小時）</th><th class="num">逾時比例</th></tr></thead><tbody>${kinds}</tbody></table>
      <table class="evt"><caption>各人處理件數</caption><thead><tr><th>處理人</th><th class="num">已解決</th><th class="num">平均處理（小時）</th></tr></thead><tbody>${ppl || '<tr><td colspan="3" class="note">還沒有已解決的事件</td></tr>'}</tbody></table>
      <div class="note">逾時比例＝（已解決但超過時限＋仍開著且超過時限）÷（已解決＋仍開著）。條件消失且 ${ARCHIVE_DAYS} 天沒人處理的事件自動歸檔，不計入處理時間。事件含示範歷史資料（標「示範」）。</div>`;
  }
  function wire(el, items) {
    const again = () => { U.bus.emit(); };
    el.querySelectorAll('[data-evt]').forEach(b => (b.onclick = () => { V.tab = b.dataset.evt; V.sel.clear(); render(el, items); }));
    const k = el.querySelector('[data-evk]'); if (k) k.onchange = () => { V.kind = k.value; render(el, items); };
    const m = el.querySelector('[data-evm]'); if (m) m.onchange = () => { V.mine = m.checked; render(el, items); };
    el.querySelectorAll('[data-evck]').forEach(c => (c.onchange = () => { c.checked ? V.sel.add(c.dataset.evck) : V.sel.delete(c.dataset.evck); const n = el.querySelector('[data-evn]'); if (n) n.textContent = V.sel.size; const bb = el.querySelector('.evbulk'); if (bb) bb.hidden = !V.sel.size; }));
    el.querySelectorAll('.evmain').forEach(b => (b.onclick = () => openDrawer(b.closest('.evrow').dataset.id)));
    el.querySelectorAll('[data-evb]').forEach(b => (b.onclick = () => {
      const ids = [...V.sel], msg = []; if (!ids.length) return;
      const r = el.querySelector('[data-evr]').value;
      ids.forEach(id => { const x = act(id, b.dataset.evb, { result: r }); if (!x.ok) msg.push(x.msg); });
      V.sel.clear(); if (msg.length) alert(msg[0] + '（部分事件未變更）'); again();
    }));
  }

  // ---------- 事件抽屜：說明、時間軸、回報處理、指派、狀態按鈕
  let openId = null;
  function drawerEl() {
    let d = document.getElementById('evDrawer');
    if (!d) { d = document.createElement('aside'); d.id = 'evDrawer'; d.className = 'evd'; d.setAttribute('aria-label', '事件詳情'); document.body.appendChild(d); }
    const host = document.querySelector('.grid.cmd .mapwrap');             // 營運指揮台：停靠在地圖右邊緣；其他頁：固定在視窗右邊緣
    if (host) { if (d.parentNode !== host) host.appendChild(d); d.classList.add('dock'); } else { if (d.parentNode !== document.body) document.body.appendChild(d); d.classList.remove('dock'); }
    return d;
  }
  // 右側的詳情面板（事件、船舶、切換設定）一次只開一個
  U.closeRight = except => {
    ['evDrawer', 'vdDrawer', 'ctl', 'rtDrawer'].forEach(id => { if (id !== except) { const e = document.getElementById(id); if (e) e.classList.remove('open'); } });
    if (except !== 'ctl') { const t = document.getElementById('ctlTg'); if (t) { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); } }
    if (except !== 'evDrawer') openId = null;
  };
  U.closeDetailDrawers = () => { ['evDrawer', 'vdDrawer'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('open'); }); openId = null; };   // 只收事件／船舶詳情（切換設定不動）：開港口或航線詳情時用
  function openDrawer(id) { if (U.routeDetail) U.routeDetail.close(); if (U.closeRight) U.closeRight('evDrawer'); if (U.boardApi && document.querySelector('.grid.cmd #blk-M15-c1')) U.boardApi.select('', false); if (U.svCloseSheet) U.svCloseSheet(); openId = id; paintDrawer(); const dd = drawerEl(); requestAnimationFrame(() => requestAnimationFrame(() => dd.classList.add('open'))); const e = find(id); if (e && U.events && U.events.fly) U.events.fly(e.spec); }
  function closeDrawer() { openId = null; drawerEl().classList.remove('open'); }
  function paintDrawer() {
    const e = openId && find(openId); const d = drawerEl(); if (!e) { d.innerHTML = ''; return; }
    const u = user(), t = now(), btn = (a, label, cls) => (can(e, a, u) ? `<button class="btn ${cls || ''}" data-ea="${a}">${label}</button>` : '');
    d.innerHTML = `<div class="evh"><b>${esc(e.title)}</b><button class="btn" data-ex aria-label="關閉">✕</button></div>
      <div class="evb"><div class="evchips"><span class="ovlv ${LV[e.lv][1]}">${LV[e.lv][0]}</span><span class="evchip">${KINDS[e.kind]}</span><span class="evchip">${STATUS[e.status]}</span>${overdue(e, t) ? '<span class="evchip bad">逾時</span>' : ''}${e.cleared && !closed(e) ? '<span class="evchip ok">條件已消失</span>' : ''}${e.retrig ? `<span class="evchip warn">再發 ${e.retrig} 次</span>` : ''}</div>
      <p class="note">${esc(e.sub || '')}　開立 ${hhmm(e.openedAt)}（${dur(t - e.openedAt)}前）</p>
      ${e.spec ? '<button class="btn" data-eg>看相關頁面</button>' : ''}
      <div class="evsec">負責人</div><div class="evas"><select data-eas ${can(e, 'assign', u) ? '' : 'disabled'}><option value="">未指派</option>${USERS.map(x => `<option value="${x[0]}"${e.assignee === x[0] ? ' selected' : ''}>${x[0]}（${x[1]}）</option>`).join('')}</select></div>
      <div class="evsec">回報處理</div>${e.seed ? '<div class="note">示範資料，不能回報。</div>' : `<select data-er aria-label="處理結果"><option value="">處理結果…</option>${RESULTS.map(r => `<option>${r}</option>`).join('')}</select><textarea data-et rows="3" placeholder="補充說明（選填；結案時建議填寫）"></textarea><div class="evbtns"><button class="btn" data-ea="note">送出回報</button>${btn('start', '開始處理')}${btn('resolve', '標記已解決', 'pri')}${btn('reset', '退回待處理')}${btn('reopen', '重新開啟')}</div><div class="note" data-emsg></div><div class="note">結案前必須選處理結果。負責人本人與主管可結案，每個動作都會記在時間軸。</div>`}
      <div class="evsec">時間軸（誰、何時、做了什麼）</div><ol class="evtl">${e.history.slice().reverse().map(h => `<li><b>${esc(h.act)}</b>${h.result ? `<span class="evchip">${esc(h.result)}</span>` : ''}<div class="note">${hhmm(h.t)} · ${esc(h.by)}${h.text ? ' · ' + esc(h.text) : ''}</div></li>`).join('')}</ol></div>`;
    d.querySelector('[data-ex]').onclick = closeDrawer;
    const g = d.querySelector('[data-eg]'); if (g) g.onclick = () => { if (V.go) V.go(e.spec); };
    const as = d.querySelector('[data-eas]'); if (as) as.onchange = () => { const x = act(e.id, 'assign', { to: as.value || null }); if (x.ok) U.bus.emit(); else d.querySelector('[data-emsg]').textContent = x.msg; };
    d.querySelectorAll('[data-ea]').forEach(b => (b.onclick = () => { const x = act(e.id, b.dataset.ea, { result: d.querySelector('[data-er]').value, text: d.querySelector('[data-et]').value.trim() }); if (x.ok) U.bus.emit(); else d.querySelector('[data-emsg]').textContent = x.msg; }));
  }
  U.bus.on(() => { if (!document.getElementById) return; if (openId) paintDrawer(); const sel = document.getElementById('userSel'); if (sel) sel.value = user(); });
  if (document.addEventListener) document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId) closeDrawer(); });

  // ---------- 目前使用者（切換設定抽屜裡的選單，示意用）
  function bindUser() {
    const sel = document.getElementById && document.getElementById('userSel'); if (!sel || sel.dataset.b) return; sel.dataset.b = '1';
    sel.innerHTML = USERS.map(x => `<option value="${x[0]}">${x[0]}（${x[1]}）</option>`).join(''); sel.value = user();
    sel.onchange = () => { setUser(sel.value); U.bus.emit(); };
  }
  if (document.addEventListener) document.addEventListener('DOMContentLoaded', bindUser); bindUser();

  U.events = { close: closeDrawer, reattach() { if (openId) { paintDrawer(); drawerEl().classList.add('open'); } }, render, sync, stats, act, can, list: () => load().events, user, USERS, RESULTS, KINDS, SLA, ARCHIVE_DAYS, now, openDrawer, bindUser,
    reset() { try { localStorage.removeItem(KEY); } catch (e) { } S = null; openId = null; } };
})();
