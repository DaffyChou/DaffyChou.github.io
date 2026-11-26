/* Email 通知（alert-email-ai，示意）：不真的寄信，只產生「已寄出（模擬）」的信件紀錄（localStorage uf_mail，最多 500 封，新的在前）。
   規則（8 條）：今日要處理事件 4 類（events.js 即時立案：港口壅塞、缺櫃、ETA 落差、位置過期）＋船舶警報 4 條（data/alarm.js 預先算好的歷史）。
   每條規則的收件人與測試模式存在 uf_ntf_cfg；測試模式＝只寄系統管理員、主旨加「[測試]」。
   什麼時候寄：
   - 今日要處理事件：立案、等級升為「要處理」、條件消失（恢復）、條件再度出現（events.js 的 sync 呼叫 U.notify.onEvent）
   - 船舶警報：資料基準日前 30 天內觸發或恢復的，第一次開啟時補成寄信紀錄（歷史，只補一次）
   - 寄測試信：警報規則設定表每列的按鈕（U.notify.test）
   收件人顯示帳號與姓名，不顯示信箱（示意；正式版接公司 SMTP 與 AD 信箱）。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const MKEY = 'uf_mail', CKEY = 'uf_ntf_cfg', SKEY = 'uf_mail_seeded', DAY = 864e5;
  const RULES = [
    { id: 'port', src: 'ev', name: '港口壅塞', thr: '港口等級為留意或要處理（塞港指數、在錨船數、等泊時間）', to: ['Op-Alice', 'Mgr-Lee'] },
    { id: 'yard', src: 'ev', name: '預估缺櫃', thr: '未來 7 天預估空櫃低於安全存量', to: ['Op-Carol', 'Mgr-Lee'] },
    { id: 'eta', src: 'ev', name: 'ETA 落差', thr: '回報 ETA 與計算 ETA 差超過門檻', to: ['Op-Alice'] },
    { id: 'pos', src: 'ev', name: '位置過期', thr: '船位超過門檻時數沒有更新', to: ['Op-Alice', 'ship.chen'], test: true },
    { id: 'FCD', src: 'alarm', name: '油耗偏差', to: ['ship.chen'] },
    { id: 'LSA', src: 'alarm', name: '最低庫存', to: ['ship.chen', 'Mgr-Lee'] },
    { id: 'REMAIN_DAYS', src: 'alarm', name: '燃油剩餘天數', to: ['ship.chen', 'Op-Bob'] },
    { id: 'OTP', src: 'alarm', name: '準點', to: ['Op-Bob', 'Mgr-Lee'] },
  ];
  (window.UI_ALARM ? window.UI_ALARM.rules : []).forEach(a => { const r = RULES.find(x => x.id === a.id); if (r) Object.assign(r, { thr: a.thr, freq: a.freq, types: a.types }); });
  RULES.forEach(r => { if (r.src === 'ev') { r.freq = '即時'; r.types = '貨櫃'; } });   // 即時＝開啟營運頁面時同步
  const LVN = { high: '要處理', mid: '留意' };
  const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

  // ---------------- 規則設定（收件人、測試模式）
  let CFG = null;
  function cfg(id) {
    if (!CFG) CFG = jget(CKEY, {});
    const r = RULES.find(x => x.id === id), c = CFG[id] || {};
    return { to: Array.isArray(c.to) ? c.to : r.to.slice(), test: typeof c.test === 'boolean' ? c.test : !!r.test };
  }
  function setCfg(id, patch) {
    const old = cfg(id), nv = Object.assign({}, old, patch), r = RULES.find(x => x.id === id);
    CFG[id] = nv; jset(CKEY, CFG);
    if (U.audit) {
      if (patch.to) U.audit.log('警報通知', '收件人', `${r.name} › 收件人`, old.to.join('、') || '（無）', nv.to.join('、') || '（無）');
      if (typeof patch.test === 'boolean') U.audit.log('警報通知', '測試模式', `${r.name} › 測試模式`, old.test ? '開' : '關', nv.test ? '開' : '關');
    }
  }
  const admins = () => (U.auth ? U.auth.ACCOUNTS.filter(a => a.role === '系統管理員').map(a => a.id) : ['it.admin']);

  // ---------------- 信件紀錄
  let ML = null;
  const mails = () => { if (!ML) ML = jget(MKEY, []); if (!Array.isArray(ML)) ML = []; return ML; };
  let seq = 0;
  function send(o) {
    const c = cfg(o.rule), test = o.test || c.test, to = test ? admins() : c.to;
    const m = Object.assign({ id: 'M' + Date.now().toString(36) + (++seq), to, test: !!test, status: test ? '測試（只寄系統管理員）' : '已寄出（模擬）' }, o);
    m.subj = (test ? '[測試] ' : '') + o.subj;
    if (!to.length) m.status = '沒有收件人（未寄出）';
    mails().unshift(m); if (ML.length > 500) ML.length = 500; jset(MKEY, ML);
    return m;
  }
  const ACT = { open: '新事件', up: '升為要處理', clear: '已恢復', again: '再度觸發' };
  // 今日要處理事件的生命週期（events.js 呼叫）
  function onEvent(type, e) {
    if (!e || e.seed || !RULES.some(r => r.id === e.kind)) return null;
    const r = RULES.find(x => x.id === e.kind), tag = type === 'clear' ? '[恢復]' : `[${LVN[e.lv] || '留意'}]`;
    return send({ t: U.events ? U.events.now() : Date.now(), rule: r.id, act: type, src: 'ev', evId: e.id, lv: e.lv,
      subj: `${tag} ${r.name}：${e.title}`, facts: [['事件', e.title], ['說明', e.sub || ''], ['等級', LVN[e.lv] || e.lv], ['狀況', ACT[type]], ['事件編號', e.id]], spec: e.spec || null });
  }
  // 船舶警報歷史：資料基準日前 30 天內觸發或恢復的補成寄信紀錄（只補一次）
  const at = s => (s ? Date.parse(String(s).length <= 7 ? s + '-01T00:00:00Z' : String(s).length <= 10 ? s + 'T00:00:00Z' : s + 'Z') : null);
  function seedAlarm() {
    if (jget(SKEY, false) || !window.UI_ALARM || !U.cargo) return;
    jset(SKEY, true);
    const NOW = U.cargo.NOW, lo0 = NOW - 30 * DAY, L = [];
    const lo = Date.parse(new Date(lo0).toISOString().slice(0, 7) + '-01T00:00:00Z');   // 月規則的時間只到月份（例如 2026-10＝10/1），起點放寬到該月 1 日
    window.UI_ALARM.events.forEach(a => {
      const r = RULES.find(x => x.id === a.rule), v = U.VBY[a.vid]; if (!r || !v) return;
      const unit = a.rule === 'FCD' ? '%' : a.rule === 'OTP' ? '%' : a.rule === 'REMAIN_DAYS' ? ' 天' : a.fuel === 'LNG' ? '%' : ' 噸';
      const facts = [['船舶', v.name], ['規則', r.name]].concat(a.rule === 'LSA' && U.fuel ? [['燃料', U.fuel.label(v, a.fuel || 'RES')]] : []).concat([['觸發值', a.value + unit], ['門檻', a.thr + unit], ['觸發時間', a.start]]);
      const ts = at(a.start), te = at(a.end);
      if (ts != null && ts >= lo && ts <= NOW) L.push({ t: ts, rule: r.id, act: 'open', src: 'alarm', vid: a.vid, lv: 'high', subj: `[要處理] ${r.name}：${v.name}（觸發值 ${a.value}${unit}，門檻 ${a.thr}${unit}）`, facts, alarm: a });
      if (te != null && te >= lo && te <= NOW) L.push({ t: te, rule: r.id, act: 'clear', src: 'alarm', vid: a.vid, lv: 'high', subj: `[恢復] ${r.name}：${v.name}`, facts: facts.concat([['恢復時間', a.end]]), alarm: a });
    });
    L.sort((a, b) => a.t - b.t).forEach(send);
  }

  // 低庫存即時判斷（fuel_thr.js 的 U.lowStock.sync）：觸發、恢復各寄一封（fuel-threshold-lng）
  function onAlarm(type, a) {
    const r = RULES.find(x => x.id === a.rule), v = U.VBY[a.vid]; if (!r || !v) return null;
    const k = a.fuel || 'RES', unit = k === 'LNG' ? '%' : ' 噸', fl = U.fuel ? U.fuel.label(v, k) : k;
    const facts = [['船舶', v.name], ['規則', r.name], ['燃料', fl], ['觸發值', a.value + unit], ['門檻', a.thr + unit], ['觸發時間', a.start]].concat(type === 'clear' ? [['恢復時間', a.end], ['恢復時庫存', (a.endValue ?? '—') + unit]] : []);
    return send({ t: U.events ? U.events.now() : Date.now(), rule: r.id, act: type, src: 'alarm', vid: a.vid, lv: 'high', alarm: a, facts,
      subj: type === 'clear' ? `[恢復] ${r.name}（${U.fuel ? U.fuel.KINDS[k].name : k}）：${v.name}` : `[要處理] ${r.name}（${U.fuel ? U.fuel.KINDS[k].name : k}）：${v.name}（觸發值 ${a.value}${unit}，門檻 ${a.thr}${unit}）` });
  }

  // 測試信：照該規則目前的收件人寄一封「[測試]」信（不受測試模式影響，收件人＝設定的收件人）
  function test(id) {
    const r = RULES.find(x => x.id === id); if (!r) return null;
    const me = U.auth && U.auth.me(), c = cfg(id);
    const m = send({ t: U.events ? U.events.now() : Date.now(), rule: id, act: 'test', src: 'test', lv: 'mid', subj: `[測試] ${r.name}：測試信`,
      facts: [['規則', r.name], ['觸發條件', r.thr || ''], ['寄件人', me ? `${me.name}（${me.id}）` : '—'], ['說明', '這是測試信，確認收件人收得到；不代表有事件發生。']] });
    m.to = c.to.slice(); m.test = true; m.status = c.to.length ? '測試信已寄出（模擬）' : '沒有收件人（未寄出）'; m.subj = `[測試] ${r.name}：測試信`;
    jset(MKEY, ML);
    if (U.audit) U.audit.log('警報通知', '測試信', `${r.name} › 寄測試信`, '', `收件人 ${c.to.length} 位`);
    return m;
  }

  // ---------------- 系統管理 › 通知紀錄：依收件人、規則、日期篩選；點一筆在下方預覽信件
  const esc = s => U.esc(s);
  const hm = t => (t == null ? '—' : new Date(t).toISOString().slice(0, 16).replace('T', ' '));
  const day = t => new Date(t).toISOString().slice(0, 10);
  const who = id => { const a = U.auth && U.auth.byId(id); return a ? `${a.name}（${a.id}）` : id; };
  const rname = id => (RULES.find(r => r.id === id) || {}).name || id;
  const MF = { to: '', rule: '', from: '', to2: '', sel: null };
  function page(el) {
    const all = mails(), people = [...new Set(all.flatMap(m => m.to))];
    const rows = all.filter(m => (!MF.to || m.to.includes(MF.to)) && (!MF.rule || m.rule === MF.rule) && (!MF.from || day(m.t) >= MF.from) && (!MF.to2 || day(m.t) <= MF.to2));
    const opt = (list, v, lab) => '<option value="">全部</option>' + list.map(x => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(lab(x))}</option>`).join('');
    const st = m => (m.test ? 'warn' : /沒有收件人/.test(m.status) ? 'bad' : 'ok');
    const any = MF.to || MF.rule || MF.from || MF.to2;
    el.innerHTML = `<div class="admhead"><h3>通知紀錄</h3><p class="note">警報規則觸發時寄出的 Email：今日要處理事件在立案、升為要處理、恢復、再度觸發時寄出；船舶警報為資料基準日前 30 天內的觸發與恢復。收件人在「資料與警報 › 警報規則設定」設定；規則開「測試模式」時只寄系統管理員、主旨加「[測試]」。時間皆為 UTC。</p>
        <p class="note admsim">示意：沒有真的寄信，只留下「已寄出（模擬）」的紀錄（存在這台電腦的瀏覽器）；正式版接公司 SMTP，收件人用 AD 信箱。</p></div>
      <section class="admcard"><div class="admbar"><h4>信件（${rows.length} / ${all.length} 封）</h4>
        <label class="fld">收件人 <select data-mf="to">${opt(people, MF.to, who)}</select></label>
        <label class="fld">規則 <select data-mf="rule">${opt(RULES.map(r => r.id), MF.rule, rname)}</select></label>
        <label class="fld">日期 <input type="date" data-mf="from" value="${MF.from}" aria-label="起日"> ～ <input type="date" data-mf="to2" value="${MF.to2}" aria-label="迄日"></label>
        <button type="button" class="btn" data-mfc${any ? '' : ' disabled'}>清除篩選</button></div>
        ${rows.length ? `<div class="admscroll mlist"><table class="t admt mlt"><thead><tr><th>時間（UTC）</th><th>收件人</th><th>主旨</th><th>規則</th><th>狀態</th></tr></thead><tbody>
          ${rows.slice(0, 300).map(m => `<tr data-mid="${esc(m.id)}" class="${MF.sel === m.id ? 'on' : ''}" tabindex="0" role="button" aria-label="預覽：${esc(m.subj)}"><td class="nw">${hm(m.t)}</td><td>${esc(m.to.map(id => (U.auth && U.auth.byId(id) || { name: id }).name).join('、') || '—')}</td><td>${esc(m.subj)}</td><td class="nw">${esc(rname(m.rule))}</td><td class="nw"><span class="tag ${st(m)}">${esc(m.status)}</span></td></tr>`).join('')}</tbody></table></div>${rows.length > 300 ? '<p class="note">只列最新 300 封。</p>' : ''}`
          : `<p class="note">${all.length ? '沒有符合篩選條件的信件。' : '還沒有信件。'}</p>`}
        <p class="note">點一封信可在下方預覽內容。</p></section>
      <div data-mprev>${MF.sel && U.notify.get(MF.sel) ? U.notify.preview(U.notify.get(MF.sel)) : ''}</div>`;
    const re = () => page(el);
    el.querySelectorAll('[data-mf]').forEach(s => (s.onchange = () => { MF[s.dataset.mf] = s.value; re(); }));
    el.querySelector('[data-mfc]').onclick = () => { MF.to = MF.rule = MF.from = MF.to2 = ''; re(); };
    el.querySelectorAll('tr[data-mid]').forEach(tr => { const go = () => { MF.sel = tr.dataset.mid; re(); const p = el.querySelector('[data-mprev]'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest' }); }; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
    if (U.notify.wirePreview) U.notify.wirePreview(el.querySelector('[data-mprev]'));
  }
  // 信件預覽：信頭、事件內容、AI 分析摘要（ai_insight.js）、「到平台查看」
  function preview(m) {
    const ev = m.src === 'ev' && U.events ? U.events.list().find(e => e.id === m.evId) : null;
    const ai = U.ai ? U.ai.forMail(m) : null;
    const go = m.src === 'ev' ? (ev ? '到平台查看這件事件' : '') : m.src === 'alarm' ? '到平台查看這艘船' : '';
    return `<section class="admcard mprev" aria-label="信件預覽"><div class="admbar"><h4>信件預覽</h4>${go ? `<button type="button" class="btn pri" data-mgo>${go} →</button>` : '<span class="note">這封信沒有對應的事件（測試信或事件已不存在）</span>'}</div>
      <dl class="mhead"><dt>寄件人</dt><dd>船隊監控平台（系統通知，示意）</dd><dt>收件人</dt><dd>${esc(m.to.map(who).join('、') || '（無）')}</dd>
        <dt>時間</dt><dd>${hm(m.t)}（UTC）</dd><dt>主旨</dt><dd><b>${esc(m.subj)}</b></dd><dt>狀態</dt><dd>${esc(m.status)}</dd></dl>
      <div class="mbody"><p>您好：</p><p>${m.act === 'test' ? '這是一封測試信。' : m.act === 'clear' ? `「${esc(rname(m.rule))}」警報已恢復正常。` : `平台偵測到「${esc(rname(m.rule))}」警報，請確認是否需要處理。`}</p>
        <table class="t mfacts"><tbody>${(m.facts || []).filter(f => f[1] !== '').map(f => `<tr><th>${esc(f[0])}</th><td>${esc(f[1])}</td></tr>`).join('')}</tbody></table>
        ${ai ? `<div class="mai"><div class="mait"><b>AI 分析摘要</b><span class="tag warn">示意</span></div>${ai.html}</div>` : ''}
        <p class="note">這封信由平台自動寄出，請勿直接回覆。處理請到平台：${m.src === 'ev' ? '運務管理 › 警報事件' : m.src === 'alarm' ? '單船總覽' : '資料與警報 › 警報規則設定'}。</p></div></section>`;
  }
  function wirePreview(box) {
    if (!box) return;
    const b = box.querySelector('[data-mgo]'), m = MF.sel && U.notify.get(MF.sel); if (!b || !m) return;
    b.onclick = () => {
      if (m.src === 'ev') { U.IA.setLoc(1, 'opsevt'); U.STATE.scrollTo = null; U.bus.emit(); window.scrollTo(0, 0); U.events.openDrawer(m.evId); }
      else if (m.src === 'alarm') { U.go('M3', m.vid); window.scrollTo(0, 0); }
    };
  }
  U.pages = U.pages || {};
  U.pages.adm_mail = page;

  U.notify = { RULES, cfg, setCfg, onEvent, onAlarm, seedAlarm, test, list: () => mails().slice(), get: id => mails().find(m => m.id === id) || null, who, rname, hm, MF,
    preview, wirePreview,
    reset() { ML = []; CFG = {}; try { [MKEY, CKEY, SKEY].forEach(k => localStorage.removeItem(k)); } catch (e) { } }, admins, LVN };
  seedAlarm();
})();
