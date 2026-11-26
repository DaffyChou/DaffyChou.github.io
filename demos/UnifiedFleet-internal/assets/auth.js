/* 登入（platform-login-admin，示意）：模擬「以公司 AD 帳號登入」。不驗證密碼、不連伺服器；登入狀態存在瀏覽器（localStorage uf_auth）。
   示範帳號＝原本的角色（船務部、營運部、運務、貨務、系統管理員）＋事件處理使用者（Op-Alice 等、主管 Mgr-Lee）合併成一份。
   每個帳號：[帳號, 姓名, 部門, 角色]；角色決定進入頁與權限（權限見 perm.js）；事件處理的「目前使用者」＝帳號。
   舊網址帶 role=（例如 #...&role=運務）且還沒登入或角色不同時，自動以該角色的第一個示範帳號登入，已發出的連結不會失效。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const { STATE, esc } = U;
  const KEY = 'uf_auth';
  const ACCOUNTS = [
    ['ship.chen', '陳志明', '船務部', '船務部'],
    ['Op-Bob', 'Bob 林', '營運部', '營運部'],
    ['Op-Alice', 'Alice 王', '運務部', '運務'],
    ['Op-Carol', 'Carol 張', '櫃務部', '貨務'],
    ['Mgr-Lee', '李主管', '營運部', '主管'],
    ['it.admin', '系統管理員', '資訊部', '系統管理員'],
  ].map(([id, name, dept, role]) => ({ id, name, dept, role }));
  const byId = id => ACCOUNTS.find(a => a.id === id) || null;
  let cur = null;
  try { cur = byId(localStorage.getItem(KEY)); } catch (e) { cur = null; }
  const LAST = {};                                              // 最後登入時間（帳號與權限頁顯示）
  try { Object.assign(LAST, JSON.parse(localStorage.getItem(KEY + '_last') || '{}')); } catch (e) { }

  // 依角色進入：IA 有定義入口的角色走既有入口（roleEntry）；系統管理員與主管進營運總覽
  function land(a) {
    const inIA = U.IA.IA.roles.some(r => r[0] === a.role);
    if (inIA && a.role !== '系統管理員') U.IA.roleEntry(a.role);
    else { U.IA.setLoc(1, 'overview'); }
    STATE.role = a.role;
  }
  function setCur(a) {
    cur = a;
    try { if (a) { localStorage.setItem(KEY, a.id); LAST[a.id] = Date.now(); localStorage.setItem(KEY + '_last', JSON.stringify(LAST)); } else localStorage.removeItem(KEY); } catch (e) { }
  }
  function login(id, opts) {
    const a = byId(id); if (!a) return false;
    setCur(a);
    if (!(opts && opts.stay)) land(a); else STATE.role = a.role;
    paintBox(); hideLogin();
    if (U.audit) U.audit.log('登入', '帳號', a.id, '', '登入成功');
    return true;
  }
  function logout() {
    if (cur && U.audit) U.audit.log('登入', '帳號', cur.id, '', '登出');
    setCur(null); STATE.role = ''; paintBox(); showLogin();
    U.bus.emit();
  }

  // ---------------- 右上角：帳號與登出
  function paintBox() {
    const b = document.getElementById('authBox'); if (!b) return;
    b.innerHTML = cur ? `<span class="authme" title="${esc(cur.dept)}"><b>${esc(cur.name)}</b><small>${esc(cur.id)}・${esc(cur.role)}</small></span><button type="button" class="btn authout" id="authOut">登出</button>` : '';
    const o = document.getElementById('authOut'); if (o) o.onclick = logout;
  }

  // ---------------- 登入畫面
  function loginHtml() {
    return `<div class="lgcard" role="dialog" aria-modal="true" aria-labelledby="lgT">
      <button type="button" class="btn langbtn lglang" id="lgLang">EN</button>
      <h2 id="lgT">船隊燃油與航運績效監控</h2>
      <p class="note">以公司 AD 帳號登入（示意）：選一個示範帳號，密碼任意輸入即可，不會驗證。</p>
      <form id="lgF" autocomplete="off">
        <fieldset class="lgacc"><legend>示範帳號</legend>
          ${ACCOUNTS.map((a, i) => `<label class="lgopt"><input type="radio" name="lgA" value="${esc(a.id)}"${i === 0 ? ' checked' : ''}><span><b>${esc(a.name)}</b><small>${esc(a.id)}・<span>${esc(a.dept)}</span>・<span>角色：</span><span>${esc(a.role)}</span></small></span></label>`).join('')}
        </fieldset>
        <label class="lgpw"><span>密碼</span><input type="password" id="lgP" placeholder="任意文字（示意）"></label>
        <div class="lgmsg note" id="lgM" role="status"></div>
        <button type="submit" class="btn pri lgbtn">登入</button>
      </form>
      <p class="note lgsim">模擬資料　非真實客戶資料。正式版採陽明既有 AD 帳號登入，由資訊部設定角色。</p>
    </div>`;
  }
  function showLogin() {
    const d = document.getElementById('login'); if (!d) return;
    d.innerHTML = loginHtml(); d.hidden = false; if (document.body) document.body.classList.add('lgon');
    if (U.i18n) U.i18n.bindBtn(d.querySelector('#lgLang'));   // 登入畫面也能切換中／EN（ui-english）
    const f = d.querySelector('#lgF');
    f.onsubmit = e => {
      e.preventDefault();
      const id = (f.querySelector('input[name=lgA]:checked') || {}).value, pw = f.querySelector('#lgP').value;
      if (!pw.trim()) { d.querySelector('#lgM').textContent = '請輸入密碼（示意，任意文字即可）'; f.querySelector('#lgP').focus(); return; }
      if (login(id)) { U.bus.emit(); window.scrollTo(0, 0); }
    };
    setTimeout(() => { const p = d.querySelector('#lgP'); if (p) p.focus(); }, 0);
  }
  function hideLogin() { const d = document.getElementById('login'); if (d) { d.hidden = true; d.innerHTML = ''; } if (document.body) document.body.classList.remove('lgon'); }

  // ---------------- 開站：hashRole＝網址帶的 role；hadHash＝有沒有網址參數
  function boot(hashRole, hadHash) {
    if (hashRole && (!cur || cur.role !== hashRole)) {          // 舊連結帶角色：以該角色的第一個示範帳號登入並進該角色入口
      const a = ACCOUNTS.find(x => x.role === hashRole);
      if (a) { setCur(a); land(a); paintBox(); hideLogin(); return; }
    }
    if (cur) { if (hadHash) STATE.role = cur.role; else land(cur); paintBox(); hideLogin(); return; }
    STATE.role = ''; paintBox(); showLogin();
  }

  U.auth = { ACCOUNTS, byId, me: () => cur, login, logout, boot, last: id => LAST[id] || null };
})();
