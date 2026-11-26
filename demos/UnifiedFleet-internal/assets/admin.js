/* 系統管理（platform-login-admin，示意）：帳號與權限、參數異動紀錄、地點代碼對應、補充資料上傳。
   每頁是自訂頁面（U.pages[代號](容器)），由 app.js 的 renderModule 呼叫；選單項目在 data/ia.js（build/ia_map.py 的 ADMIN_PAGES）。
   資料都存在瀏覽器（localStorage，key 以 uf_ 開頭），頁首標示「示意：資料只存在這台電腦的瀏覽器」。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const { esc } = U;
  const SIM = '<p class="note admsim">示意：資料只存在這台電腦的瀏覽器（localStorage），換電腦或清除瀏覽器資料就會回到預設；正式版存在伺服器。</p>';
  const head = (title, text) => `<div class="admhead"><h3>${esc(title)}</h3><p class="note">${text}</p>${SIM}</div>`;

  // ---------------- 參數異動紀錄（共用）：U.audit.log(類型, 分類, 項目, 舊值, 新值)；誰＝目前登入者；最多留 500 筆（新的在前）
  const AKEY = 'uf_audit';
  let AL = null;
  const aload = () => { if (AL) return AL; try { AL = JSON.parse(localStorage.getItem(AKEY) || '[]'); } catch (e) { AL = []; } if (!Array.isArray(AL)) AL = []; return AL; };
  U.audit = {
    log(type, cat, target, oldV, newV) {
      if (oldV != null && oldV !== '' && String(oldV) === String(newV)) return;   // 值沒變不記
      const me = U.auth && U.auth.me();
      aload().unshift({ t: Date.now(), by: me ? me.id : '（未登入）', name: me ? me.name : '', type, cat, target: String(target), old: oldV == null ? '' : String(oldV), nv: newV == null ? '' : String(newV) });
      if (AL.length > 500) AL.length = 500;
      try { localStorage.setItem(AKEY, JSON.stringify(AL)); } catch (e) { }
    },
    list: () => aload().slice(),
    clear() { AL = []; try { localStorage.removeItem(AKEY); } catch (e) { } },
  };

  U.pages = U.pages || {};
  // ---------------- 帳號與權限：帳號清單＋權限矩陣（改完按「套用」才生效；系統管理員 › 系統管理固定為管理，避免把自己鎖在外面）
  const hm = t => (t ? new Date(t).toLocaleString('zh-TW', { hour12: false }).replace(/\//g, '-') : '—');
  let draft = null;                                            // 權限矩陣的草稿（未套用的修改）
  U.pages.adm_acct = el => {
    const P = U.perm, A = U.auth, me = A.me(), canEdit = U.can('admin', 'admin');
    const M = P.matrix();
    if (!draft) draft = JSON.parse(JSON.stringify(M));
    const locked = (r, f) => r === '系統管理員' && f === 'admin';
    const diff = () => P.ROLES.reduce((n, r) => n + P.FUNCS.filter(([f]) => draft[r][f] !== M[r][f]).length, 0);
    const notDef = (r, f) => draft[r][f] !== P.DEF[r][f];
    const accRows = A.ACCOUNTS.map(a => `<tr${me && me.id === a.id ? ' class="me"' : ''}><td>${esc(a.id)}</td><td>${esc(a.name)}</td><td>${esc(a.dept)}</td><td>${esc(a.role)}</td><td class="n">${hm(A.last(a.id))}</td></tr>`).join('');
    const cell = (r, f) => {
      const v = draft[r][f], ch = v !== M[r][f];
      if (!canEdit || locked(r, f)) return `<td class="pmc lv${v}" title="${locked(r, f) ? '固定為管理（避免系統管理員把自己鎖在外面）' : ''}">${esc(P.LV[v])}</td>`;
      return `<td class="pmc lv${v}${ch ? ' ch' : ''}${notDef(r, f) ? ' nd' : ''}"><select data-pr="${esc(r)}" data-pf="${f}" aria-label="${esc(r)} 的 ${esc(P.FUNCS.find(x => x[0] === f)[1])} 權限">${P.LV.map((n, i) => `<option value="${i}"${i === v ? ' selected' : ''}>${n}</option>`).join('')}</select></td>`;
    };
    const n = diff();
    el.innerHTML = head('帳號與權限', '正式版採陽明既有 AD 帳號登入，帳號由資訊部建立；這裡設定每個角色能看、能改哪些功能。權限等級：看＝能打開該頁；改＝能修改該頁的設定（例如門檻）；管理＝能管理帳號與權限。沒有「看」的功能不會出現在選單。')
      + `<section class="admcard"><h4>示範帳號</h4><table class="t admt"><thead><tr><th>帳號</th><th>姓名</th><th>部門</th><th>角色</th><th class="n">最後登入</th></tr></thead><tbody>${accRows}</tbody></table></section>
      <section class="admcard"><div class="admbar"><h4>權限矩陣（角色 × 功能）</h4>
        ${canEdit ? `<span class="note" data-pn>${n ? `已修改 ${n} 格，按「套用」才會生效` : '修改下拉選單後按「套用」才會生效'}</span><button type="button" class="btn" data-pundo${n ? '' : ' disabled'}>取消修改</button><button type="button" class="btn pri" data-papply${n ? '' : ' disabled'}>套用</button><button type="button" class="btn" data-preset>還原預設</button>` : '<span class="note">只有「系統管理 › 管理」權限可以修改</span>'}</div>
        <div class="admscroll"><table class="t pmx"><thead><tr><th>功能</th>${P.ROLES.map(r => `<th>${esc(r)}</th>`).join('')}</tr></thead>
        <tbody>${P.FUNCS.map(([f, nm, d]) => `<tr><th scope="row"><b>${esc(nm)}</b><small>${esc(d)}</small></th>${P.ROLES.map(r => cell(r, f)).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="note">底色：深＝權限越高。黃框＝已修改但還沒套用；點狀底線＝和預設不同。</p></section>`;
    if (!canEdit) return;
    el.querySelectorAll('[data-pr]').forEach(s => (s.onchange = () => { draft[s.dataset.pr][s.dataset.pf] = +s.value; U.pages.adm_acct(el); }));
    el.querySelector('[data-pundo]').onclick = () => { draft = null; U.pages.adm_acct(el); };
    el.querySelector('[data-papply]').onclick = () => {
      P.ROLES.forEach(r => P.FUNCS.forEach(([f]) => { if (!locked(r, f) && draft[r][f] !== M[r][f]) P.set(r, f, draft[r][f]); }));
      draft = null; U.bus.emit();                               // 重畫：選單依新權限更新
    };
    el.querySelector('[data-preset]').onclick = () => { if (!confirm('把全部角色的權限還原成預設值？')) return; P.reset(); draft = null; U.bus.emit(); };
  };
  // ---------------- 參數異動紀錄頁：依人、類型、日期篩選（篩選只影響顯示，立即套用）
  const AF = { by: '', type: '', from: '', to: '' };
  const day = t => new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);   // 本地日期 YYYY-MM-DD
  U.pages.adm_audit = el => {
    const all = U.audit.list(), people = [...new Set(all.map(x => x.by))], types = [...new Set(all.map(x => x.type))];
    const rows = all.filter(x => (!AF.by || x.by === AF.by) && (!AF.type || x.type === AF.type) && (!AF.from || day(x.t) >= AF.from) && (!AF.to || day(x.t) <= AF.to));
    const opt = (list, v, all0) => `<option value="">${all0}</option>` + list.map(x => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
    el.innerHTML = head('參數異動紀錄', '門檻設定、權限、地點代碼對應、補充資料上傳的每一次修改，以及登入與登出，都會留下紀錄：誰、什麼時間、改了哪一項、舊值與新值。')
      + `<section class="admcard"><div class="admbar"><h4>紀錄（${rows.length} / ${all.length} 筆）</h4>
        <label class="fld">人 <select data-af="by">${opt(people, AF.by, '全部')}</select></label>
        <label class="fld">類型 <select data-af="type">${opt(types, AF.type, '全部')}</select></label>
        <label class="fld">日期 <input type="date" data-af="from" value="${AF.from}" aria-label="起日"> ～ <input type="date" data-af="to" value="${AF.to}" aria-label="迄日"></label>
        <button type="button" class="btn" data-afc${AF.by || AF.type || AF.from || AF.to ? '' : ' disabled'}>清除篩選</button></div>
        ${rows.length ? `<div class="admscroll"><table class="t admt"><thead><tr><th>時間</th><th>帳號</th><th>類型</th><th>項目</th><th>舊值</th><th></th><th>新值</th></tr></thead><tbody>
          ${rows.slice(0, 300).map(x => `<tr><td class="nw">${hm(x.t)}</td><td>${esc(x.by)}${x.name ? `<small class="note"> ${esc(x.name)}</small>` : ''}</td><td>${esc(x.type)}</td><td>${esc(x.target)}</td><td class="n">${esc(x.old) || '—'}</td><td class="note">→</td><td class="n"><b>${esc(x.nv) || '—'}</b></td></tr>`).join('')}</tbody></table></div>${rows.length > 300 ? '<p class="note">只列最新 300 筆。</p>' : ''}`
          : `<p class="note">${all.length ? '沒有符合篩選條件的紀錄。' : '還沒有紀錄：修改門檻、權限、地點代碼或上傳資料後，這裡會出現紀錄。'}</p>`}</section>`;
    el.querySelectorAll('[data-af]').forEach(s => (s.onchange = () => { AF[s.dataset.af] = s.value; U.pages.adm_audit(el); }));
    el.querySelector('[data-afc]').onclick = () => { Object.keys(AF).forEach(k => (AF[k] = '')); U.pages.adm_audit(el); };
  };
  // ---------------- 地點代碼對應：UI_LOCMAP（示意清單）＋使用者手動對應（localStorage uf_locmap：{代碼: {unlo, term}}）
  const LKEY = 'uf_locmap';
  let LO = null;
  const lload = () => { if (LO) return LO; try { LO = JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) { LO = {}; } return LO; };
  const lsave = () => { try { localStorage.setItem(LKEY, JSON.stringify(LO)); } catch (e) { } };
  const TERMS = () => ((window.UI_CARGO || {}).terminals || []).map(t => ({ term: t[0], unlo: t[1], name: t[2] }));
  const pname = u => (U.ports ? U.ports(u) : u);
  // 目前的對應（預設＋手動）與狀態
  function locRows() {
    const D = window.UI_LOCMAP || { cols: [], rows: [] }, O = lload();
    const rows = D.rows.map(r => { const o = {}; D.cols.forEach((c, i) => (o[c] = r[i])); o.def = { unlo: o.unlo, term: o.term }; if (O[o.code]) Object.assign(o, O[o.code]); o.edited = !!O[o.code]; return o; });
    const cnt = {}; rows.forEach(r => { if (r.term) cnt[r.term] = (cnt[r.term] || 0) + 1; });
    rows.forEach(r => {
      r.st = [];
      if (!r.term) r.st.push('unmapped');
      if (r.term && cnt[r.term] > 1) r.st.push('dup');
      if (r.lat == null || r.lon == null) r.st.push('nocoord');
      if (!r.st.length) r.st.push('ok');
    });
    return rows;
  }
  U.locmap = { rows: locRows, set(code, unlo, term) {   // 存檔一筆對應（寫入異動紀錄）
    const r = locRows().find(x => x.code === code); if (!r) return false;
    const old = r.term ? `${r.unlo} / ${r.term}` : '未對應', nv = term ? `${unlo} / ${term}` : '未對應';
    lload()[code] = { unlo: unlo || null, term: term || null }; lsave();
    U.audit.log('地點代碼對應', '地點代碼', `${code}（${r.name}）`, old, nv);
    return true;
  }, reset() { if (Object.keys(lload()).length) U.audit.log('地點代碼對應', '地點代碼', '全部手動對應', `${Object.keys(LO).length} 筆`, '還原預設'); LO = {}; lsave(); } };
  const LST = { unmapped: ['未對應', 'bad'], dup: ['疑似重複', 'warn'], nocoord: ['座標不完整', 'warn'], ok: ['已對應', 'ok'] };
  const LF = { st: '', q: '', edit: null, eu: '', et: '' };
  U.pages.adm_loc = el => {
    const rows = locRows(), canEdit = U.can('admin', 'edit'), T = TERMS();
    const n = k => rows.filter(r => r.st.includes(k)).length;
    const q = LF.q.trim().toLowerCase();
    const show = rows.filter(r => (!LF.st || r.st.includes(LF.st)) && (!q || (r.code + ' ' + r.name + ' ' + (r.unlo || '') + ' ' + (r.term || '')).toLowerCase().includes(q)));
    const ports = [...new Set(T.map(t => t.unlo))].sort((a, b) => pname(a).localeCompare(pname(b)));
    const editor = r => {
      const pu = LF.eu, tl = T.filter(t => t.unlo === pu), changed = (LF.et || null) !== (r.term || null);   // 碼頭代號全域唯一，比碼頭就夠
      return `<td colspan="2" class="lmed"><select data-leu aria-label="港口"><option value="">選港口…</option>${ports.map(u => `<option value="${u}"${u === pu ? ' selected' : ''}>${esc(pname(u))}（${u}）</option>`).join('')}</select>
        <select data-let aria-label="碼頭"${pu ? '' : ' disabled'}><option value="">${pu ? '（不對應）' : '先選港口'}</option>${tl.map(t => `<option value="${t.term}"${t.term === LF.et ? ' selected' : ''}>${esc(t.term)}</option>`).join('')}</select></td>
        <td>${r.st.map(s => `<span class="tag ${LST[s][1]}">${LST[s][0]}</span>`).join(' ')}</td>
        <td class="nw"><button type="button" class="btn pri" data-lsave${changed ? '' : ' disabled'}>存檔</button> <button type="button" class="btn" data-lcancel>取消</button></td>`;
    };
    const row = r => `<tr data-lc="${esc(r.code)}"${LF.edit === r.code ? ' class="lmedit"' : ''}><td><b>${esc(r.code)}</b>${r.edited ? '<small class="note"> 手動</small>' : ''}</td><td>${esc(r.name)}</td>
      <td class="n nw">${r.lat == null ? '<span class="note">缺</span>' : r.lat.toFixed(4)}, ${r.lon == null ? '<span class="note">缺</span>' : r.lon.toFixed(4)}</td>
      ${LF.edit === r.code ? editor(r) : `<td>${r.unlo ? esc(pname(r.unlo)) + `<small class="note"> ${esc(r.unlo)}</small>` : '<span class="note">—</span>'}</td><td>${r.term ? esc(r.term) : '<span class="note">—</span>'}</td>
      <td>${r.st.map(s => `<span class="tag ${LST[s][1]}">${LST[s][0]}</span>`).join(' ')}</td><td>${canEdit ? `<button type="button" class="btn" data-ledit>${r.term ? '修改' : '對應'}</button>` : ''}</td>`}</tr>`;
    const chip = (k, label) => `<button type="button" class="btn lmchip${LF.st === k ? ' on' : ''}" data-lst="${k}" aria-pressed="${LF.st === k}">${label} <b>${k ? n(k) : rows.length}</b></button>`;
    el.innerHTML = head('地點代碼對應', '陽明系統使用自訂的 location code（對應到碼頭），本平台的港口與碼頭位置由海圖切出；兩邊靠這張對照表連起來。<b>未對應</b>＝還不知道是哪個碼頭（資料進來會對不上）；<b>疑似重複</b>＝兩個代碼對到同一個碼頭（可能是舊代碼）；<b>座標不完整</b>＝陽明的資料缺經度或緯度（櫃場若需精確座標，建議改用 RTK 量測）。')
      + `<section class="admcard"><div class="admbar"><h4>代碼清單</h4>${chip('', '全部')}${chip('unmapped', '未對應')}${chip('dup', '疑似重複')}${chip('nocoord', '座標不完整')}${chip('ok', '已對應')}
        <input type="search" data-lq placeholder="搜尋代碼、名稱、港口" value="${esc(LF.q)}" aria-label="搜尋代碼">
        ${canEdit ? '<button type="button" class="btn" data-lreset>還原預設</button>' : '<span class="note">只有「系統管理 › 改」以上可以修改</span>'}</div>
        <div class="admscroll"><table class="t admt lmt"><thead><tr><th>代碼</th><th>陽明名稱</th><th class="n">座標（緯度, 經度）</th><th>對應港口</th><th>對應碼頭</th><th>狀態</th><th></th></tr></thead>
        <tbody>${show.map(row).join('') || '<tr><td colspan="7" class="note">沒有符合條件的代碼。</td></tr>'}</tbody></table></div>
        <p class="note">共 ${rows.length} 個代碼，顯示 ${show.length} 個。修改：點「對應／修改」→ 選港口與碼頭 →「存檔」；存檔後寫入參數異動紀錄。</p></section>`;
    const re = () => U.pages.adm_loc(el);
    el.querySelectorAll('[data-lst]').forEach(b => (b.onclick = () => { LF.st = LF.st === b.dataset.lst ? '' : b.dataset.lst; re(); }));
    { const s = el.querySelector('[data-lq]'); s.oninput = () => { LF.q = s.value; const p = s.selectionStart; re(); const s2 = el.querySelector('[data-lq]'); s2.focus(); s2.setSelectionRange(p, p); }; }
    el.querySelectorAll('[data-ledit]').forEach(b => (b.onclick = () => { const r = rows.find(x => x.code === b.closest('tr').dataset.lc); LF.edit = r.code; LF.eu = r.unlo || ''; LF.et = r.term || ''; re(); }));
    { const s = el.querySelector('[data-leu]'); if (s) s.onchange = () => { LF.eu = s.value; LF.et = ''; re(); }; }
    { const s = el.querySelector('[data-let]'); if (s) s.onchange = () => { LF.et = s.value; re(); }; }
    { const b = el.querySelector('[data-lsave]'); if (b) b.onclick = () => { U.locmap.set(LF.edit, LF.et ? LF.eu : null, LF.et || null); LF.edit = null; re(); }; }
    { const b = el.querySelector('[data-lcancel]'); if (b) b.onclick = () => { LF.edit = null; re(); }; }
    { const b = el.querySelector('[data-lreset]'); if (b) b.onclick = () => { if (!confirm('清除全部手動對應，回到預設？')) return; U.locmap.reset(); LF.edit = null; re(); }; }
  };
  // ---------------- 補充資料上傳：三種 CSV（範本下載 → 上傳 → 預覽與錯誤列 → 確認套用；可還原預設）
  //   安全存量：存 uf_up_safety（{ '場站|櫃型|尺寸': 個數 }）→ cargo_engine.setSafety；缺櫃預估改用上傳值（依據顯示「上傳設定」）
  //   各船油品門檻：存 uf_up_thr（{ 船 id: [殘油, 輕油, LNG] }；舊格式只有前兩個值）→ 直接改 VBY 的 thr_res／thr_mgo／thr_lng（U.fuel，fuel_thr.js）
  //   地點代碼對應：逐筆呼叫 U.locmap.set（和手動對應同一份）
  const jget = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const jset = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const THR0 = {}; Object.values(U.VBY).forEach(v => (THR0[v.id] = U.fuel.vals(v)));   // 原始門檻（還原用）
  const VBYN = {}; Object.values(U.VBY).forEach(v => (VBYN[v.name.toLowerCase()] = v));
  function applySaved() {
    if (U.cargo && U.cargo.setSafety) U.cargo.setSafety(jget('uf_up_safety') || {});
    const t = jget('uf_up_thr') || {};
    Object.keys(t).forEach(id => { const v = U.VBY[id]; if (v) U.fuel.setVals(v, t[id]); });   // 只動有上傳的船，不蓋掉門檻設定頁的手動修改；舊格式（兩個值）不動 LNG
  }
  applySaved();
  if (U.lowStock) U.lowStock.sync();   // fuel-threshold-lng：載入時先對齊低庫存警報（含上傳過的門檻），這次不寄信；之後改門檻才寄
  const num = s => (/^\s*-?\d+(\.\d+)?\s*$/.test(s) ? +s : NaN);
  const KINDS = {
    safety: {
      name: '安全存量', file: '安全存量範本.csv', cols: ['場站代碼', '櫃型', '尺寸', '安全存量（個）'], num: [2, 3],
      help: '每個場站、每種櫃型的安全存量（低於這個數就算缺櫃）。範本內是目前使用中的值；只要改數字、刪掉不改的列即可。',
      rows() { return (U.cargo ? U.cargo.forecastAll() : []).filter(r => r.safety != null).map(r => [r.yard, r.ct, r.sz, Math.round(r.safety)]); },
      check(c) {
        const C = U.cargo.C, yd = C.yards.find(y => y[0] === c[0]);
        if (!yd) return { err: `找不到場站代碼「${c[0]}」` };
        if (!C.combos.some(x => x[0] === c[1] && String(x[1]) === String(c[2]))) return { err: `沒有櫃型 ${c[1]} ${c[2]} 呎` };
        const q = num(c[3]);
        if (!Number.isFinite(q) || q < 0 || q !== Math.round(q)) return { err: '安全存量要是 0 以上的整數' };
        if (q > yd[3]) return { err: `安全存量 ${q} 超過場站容量 ${yd[3]}，數字不合理` };
        const cur = (U.cargo.forecastAll().find(r => r.yard === c[0] && r.ct === c[1] && String(r.sz) === String(c[2])) || {}).safety;
        return { key: `${c[0]}|${c[1]}|${c[2]}`, label: `${c[0]} ${c[1]} ${c[2]} 呎`, old: cur == null ? null : Math.round(cur), nv: q };
      },
      apply(ok) { const m = jget('uf_up_safety') || {}; ok.forEach(x => (m[x.key] = x.nv)); jset('uf_up_safety', m); },
      count: () => Object.keys(jget('uf_up_safety') || {}).length,
      reset() { jset('uf_up_safety', null); },
    },
    thr: {
      // fuel-threshold-lng：多一欄 LNG 門檻（艙容 %，只有 LNG 雙燃料船填）；舊的三欄範本（船名、殘油、輕油）仍可上傳
      name: '各船油品門檻', file: '各船油品門檻範本.csv', cols: ['船名', '殘油門檻（噸）', '輕油門檻（噸）', 'LNG門檻（艙容%）'], minCols: 3, num: [1, 2, 3],
      help: '各船殘油、輕油的低庫存門檻（噸），LNG 雙燃料船另有 LNG 門檻（艙容 %，0～100）；最新庫存低於門檻就觸發低庫存警報，0＝未設定。不是 LNG 船的 LNG 欄留空。舊的三欄範本（沒有 LNG 欄）也可以上傳。範本內是目前的值。',
      rows() { return Object.values(U.VBY).filter(v => v.status === 'ACTIVE').map(v => [v.name, v.thr_res ?? 0, v.thr_mgo ?? 0, U.fuel.isLng(v) ? (v.thr_lng ?? 0) : '']); },
      check(c) {
        const v = VBYN[String(c[0]).trim().toLowerCase()];
        if (!v) return { err: `找不到船名「${c[0]}」` };
        const a = num(c[1]), b = num(c[2]), hasL = c.length > 3 && String(c[3]).trim() !== '', l = hasL ? num(c[3]) : null, lng = U.fuel.isLng(v);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return { err: '門檻要是 0 以上的數字' };
        if (a > 5000 || b > 2000) return { err: '門檻過大（殘油上限 5000 噸、輕油上限 2000 噸），數字不合理' };
        if (hasL && !Number.isFinite(l)) return { err: 'LNG 門檻要是數字（艙容 %）' };
        if (hasL && (l < 0 || l > 100)) return { err: 'LNG 門檻要在 0～100 之間（艙容 %）' };
        if (hasL && !lng && l > 0) return { err: '這艘船不是 LNG 雙燃料船，LNG 門檻請留空' };
        const cur = lng ? `${v.thr_res ?? 0} / ${v.thr_mgo ?? 0} / ${v.thr_lng ?? 0}%` : `${v.thr_res ?? 0} / ${v.thr_mgo ?? 0}`;
        const nl = lng ? (hasL ? l : (v.thr_lng ?? 0)) : null;
        return { key: v.id, label: v.name, old: cur, nv: lng ? `${a} / ${b} / ${nl}%` : `${a} / ${b}`, val: lng && hasL ? [a, b, l] : [a, b] };
      },
      apply(ok) { const m = jget('uf_up_thr') || {}; ok.forEach(x => (m[x.key] = x.val)); jset('uf_up_thr', m); },
      count: () => Object.keys(jget('uf_up_thr') || {}).length,
      reset() { Object.keys(jget('uf_up_thr') || {}).forEach(id => { const v = U.VBY[id]; if (v) U.fuel.setVals(v, THR0[id]); }); jset('uf_up_thr', null); },
    },
    loc: {
      name: '地點代碼對應', file: '地點代碼對應範本.csv', cols: ['代碼', '港口代碼', '碼頭代碼'], num: [],
      help: '陽明 location code 對應到本平台的港口（UN/LOCODE）與碼頭；港口與碼頭都留空＝取消對應。範本內是目前的對應。',
      rows() { return U.locmap.rows().map(r => [r.code, r.unlo || '', r.term || '']); },
      check(c) {
        const r = U.locmap.rows().find(x => x.code === String(c[0]).trim());
        if (!r) return { err: `找不到代碼「${c[0]}」` };
        const u = String(c[1] || '').trim(), t = String(c[2] || '').trim();
        if (!u && !t) return { key: r.code, label: r.code, old: r.term ? `${r.unlo} / ${r.term}` : '未對應', nv: '未對應', unlo: null, term: null };
        if (!U.M.ports[u]) return { err: `找不到港口代碼「${u}」` };
        const T = TERMS().find(x => x.term === t);
        if (!T) return { err: `找不到碼頭代碼「${t}」` };
        if (T.unlo !== u) return { err: `碼頭 ${t} 不在 ${u}（在 ${T.unlo}）` };
        return { key: r.code, label: r.code, old: r.term ? `${r.unlo} / ${r.term}` : '未對應', nv: `${u} / ${t}`, unlo: u, term: t };
      },
      apply(ok) { ok.forEach(x => U.locmap.set(x.key, x.unlo, x.term)); },
      count: () => U.locmap.rows().filter(r => r.edited).length,
      reset() { U.locmap.reset(); },
    },
  };
  // CSV：支援雙引號欄位；去掉 BOM 與空白列
  function parseCsv(text) {
    const out = []; let row = [], f = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; } else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); out.push(row); }
    return out.filter(r => r.some(x => String(x).trim() !== ''));
  }
  const toCsv = (cols, rows) => '﻿' + [cols].concat(rows).map(r => r.map(x => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  // 檢查整份檔案：回傳 { rows: [{ n, cells, err?, …, same }], ok: [可套用的列], nErr }
  function checkFile(kind, text) {
    const K = KINDS[kind], A = parseCsv(text);
    if (!A.length) return { headErr: '檔案是空的', rows: [], ok: [], nErr: 1 };
    const h = A[0].map(s => String(s).trim());
    const need = K.minCols || K.cols.length;                                         // 有些種類後面的欄位可省略（例如油品門檻的 LNG 欄）
    if (h.length < need || K.cols.some((c, i) => i < h.length && h[i] !== '' && h[i] !== c)) return { headErr: `第 1 列（欄位名稱）要是：${K.cols.join('、')}；請用「下載範本」的格式`, rows: [], ok: [], nErr: 1 };
    const seen = {}, rows = A.slice(1).map((cells, i) => {
      const r = Object.assign({ n: i + 2, cells }, cells.length < need ? { err: `欄位不足（要 ${need} 欄）` } : K.check(cells.slice(0, Math.min(h.length, K.cols.length)).map(s => String(s).trim())));
      if (!r.err) { if (seen[r.key]) r.err = `和第 ${seen[r.key]} 列重複`; else seen[r.key] = r.n; }
      if (!r.err) r.same = String(r.old) === String(r.nv);
      return r;
    });
    const ok = rows.filter(r => !r.err && !r.same), nErr = rows.filter(r => r.err).length;
    return { rows, ok, nErr };
  }
  function applyFile(kind, res, fname) {
    if (!res || res.nErr || !res.ok.length) return false;
    KINDS[kind].apply(res.ok); applySaved();
    U.audit.log('補充資料上傳', KINDS[kind].name, `${KINDS[kind].name}：${fname || '上傳檔案'}`, '', `更新 ${res.ok.length} 筆`);
    return true;
  }
  function resetKind(kind) { const K = KINDS[kind], n = K.count(); K.reset(); applySaved(); if (n && kind !== 'loc') U.audit.log('補充資料上傳', K.name, K.name, `上傳 ${n} 筆`, '還原預設'); }
  U.upload = { KINDS, parseCsv, toCsv, checkFile, applyFile, resetKind, applySaved };

  const UF = { kind: 'safety', res: null, fname: '', msg: '' };
  U.pages.adm_upload = el => {
    const K = KINDS[UF.kind], canEdit = U.can('admin', 'edit'), R = UF.res;
    const card = k => `<label class="upk${UF.kind === k ? ' on' : ''}"><input type="radio" name="upk" value="${k}"${UF.kind === k ? ' checked' : ''}><span><b>${esc(KINDS[k].name)}</b><small>目前上傳 ${KINDS[k].count()} 筆</small></span></label>`;
    const prev = !R ? '' : R.headErr ? `<p class="uperr">${esc(R.headErr)}</p>` : `
      <p class="upsum">「${esc(UF.fname)}」共 ${R.rows.length} 列：<b class="${R.nErr ? 'bad' : ''}">錯誤 ${R.nErr} 列</b>、將更新 ${R.ok.length} 筆、沒變 ${R.rows.filter(r => r.same).length} 筆。${R.nErr ? '請修正錯誤列後重新選檔，才能套用。' : R.ok.length ? '確認無誤後按「確認套用」。' : '沒有要更新的資料。'}</p>
      <div class="admscroll upprev"><table class="t admt"><thead><tr><th class="n">列</th>${K.cols.map((c, i) => `<th${K.num.includes(i) ? ' class="n"' : ''}>${esc(c)}</th>`).join('')}<th>檢查結果</th></tr></thead><tbody>
      ${R.rows.slice().sort((a, b) => (b.err ? 1 : 0) - (a.err ? 1 : 0) || a.n - b.n).slice(0, 200).map(r => `<tr class="${r.err ? 'uperrow' : r.same ? 'upsame' : ''}"><td class="n">${r.n}</td>${K.cols.map((_, i) => `<td${K.num.includes(i) ? ' class="n"' : ''}>${esc(r.cells[i] ?? '')}</td>`).join('')}
        <td>${r.err ? `<span class="tag bad">錯誤</span> ${esc(r.err)}` : r.same ? '<span class="note">沒變</span>' : `<span class="tag ok">更新</span> ${esc(r.old ?? '—')} → <b>${esc(r.nv)}</b>`}</td></tr>`).join('')}</tbody></table></div>
      ${R.rows.length > 200 ? '<p class="note">只列 200 列（錯誤列排在前面）。</p>' : ''}`;
    el.innerHTML = head('補充資料上傳', '資料中台還沒有的輔助資料（主檔、CSV、一次性資料）從這裡上傳。步驟：① 選資料類型 → ② 下載範本（內含目前的值）並修改 → ③ 選擇檔案，系統先檢查並列出錯誤列 → ④ 沒有錯誤才能「確認套用」。')
      + `<section class="admcard"><h4>① 資料類型</h4><div class="upks">${Object.keys(KINDS).map(card).join('')}</div><p class="note">${esc(K.help)}</p></section>
      <section class="admcard"><div class="admbar"><h4>② 範本　③ 上傳</h4>
        <button type="button" class="btn" data-uptpl>下載範本（${esc(K.file)}）</button>
        ${canEdit ? `<label class="btn upfile">選擇 CSV 檔<input type="file" accept=".csv,text/csv" data-upf hidden></label>
        <button type="button" class="btn pri" data-upgo${R && !R.nErr && R.ok.length ? '' : ' disabled'}>確認套用</button>
        <button type="button" class="btn" data-upreset${K.count() ? '' : ' disabled'}>還原預設</button>` : '<span class="note">只有「系統管理 › 改」以上可以上傳</span>'}</div>
        ${UF.msg ? `<p class="upmsg" role="status">${esc(UF.msg)}</p>` : ''}
        <p class="note">欄位：${K.cols.map(esc).join('、')}。檔案用 UTF-8（範本已是 Excel 可直接開的格式）。</p>${prev}</section>`;
    const re = () => U.pages.adm_upload(el);
    el.querySelectorAll('input[name=upk]').forEach(i => (i.onchange = () => { UF.kind = i.value; UF.res = null; UF.fname = ''; UF.msg = ''; re(); }));
    el.querySelector('[data-uptpl]').onclick = () => { const b = new Blob([toCsv(K.cols, K.rows())], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = K.file; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    if (!canEdit) return;
    el.querySelector('[data-upf]').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { UF.fname = f.name; UF.res = checkFile(UF.kind, rd.result); UF.msg = ''; re(); }; rd.readAsText(f, 'utf-8'); };
    el.querySelector('[data-upgo]').onclick = () => { const n = UF.res.ok.length; if (applyFile(UF.kind, UF.res, UF.fname)) { UF.msg = `已套用 ${n} 筆${K.name}，並寫入參數異動紀錄。`; UF.res = null; U.bus.emit(); } };
    el.querySelector('[data-upreset]').onclick = () => { if (!confirm(`把上傳的「${K.name}」全部清除，回到預設值？`)) return; resetKind(UF.kind); UF.msg = `已還原「${K.name}」預設值。`; UF.res = null; U.bus.emit(); };
  };
})();
