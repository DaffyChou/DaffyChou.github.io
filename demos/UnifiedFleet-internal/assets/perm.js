/* 權限（platform-login-admin，示意）：角色 × 功能，三個等級：看（1）、改（2）、管理（3）；0＝沒有權限。
   功能＝第一層選單的項目（合併項目以上層名稱算，例如「運務管理」底下六個頁籤同一個功能）＋系統管理。
   船舶清單（第 2 層）與單船總覽（第 3 層）到處都有連結，登入者一律可看，不列入權限表。
   系統管理員可在「系統管理 › 帳號與權限」修改，存在瀏覽器（localStorage uf_perm）；「還原預設」回到下面的 DEF。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const KEY = 'uf_perm';
  const LV = ['無', '看', '改', '管理'];
  // 功能：[代號, 名稱, 說明]
  const FUNCS = [
    ['overview', '營運總覽', '營運重點數字與各面向代表卡'],
    ['opsov', '即時動態地圖', '船舶位置、港口運務板、今日要處理、航線詳情與 Service 監控'],
    ['ops', '運務管理', '船舶動態清單、到港預報、靠泊時程、警報事件、航線績效、趨勢分析'],
    ['cargo', '貨務', '空櫃地圖、場站使用率、缺櫃預估、裝卸量趨勢'],
    ['fuelops', '燃油成本', '各航線燃油成本、營運行為與油耗'],
    ['ship', '船況與加油', '船舶效能、燃油庫存與加油'],
    ['env', '環保法遵', '年度數據、計算工具'],
    ['data', '資料與警報', '警報規則與事件、資料品質、各船油品門檻設定'],
    ['admin', '系統管理', '帳號與權限、參數異動紀錄、地點代碼對應、補充資料上傳'],
  ];
  const ROLES = ['船務部', '營運部', '運務', '貨務', '主管', '系統管理員'];
  const all = v => Object.fromEntries(FUNCS.map(f => [f[0], v]));
  const DEF = {
    '船務部': Object.assign(all(1), { ship: 2, env: 2, data: 2, admin: 0 }),
    '營運部': Object.assign(all(1), { admin: 0 }),
    '運務': Object.assign(all(1), { opsov: 2, ops: 2, admin: 0 }),
    '貨務': Object.assign(all(1), { cargo: 2, admin: 0 }),
    '主管': Object.assign(all(2), { admin: 0 }),
    '系統管理員': all(3),
  };
  // 第一層選單的上層名稱 → 功能（貨櫃輪與散裝輪的上層名稱不同）
  const PARENT = { '運務管理': 'ops', '貨務': 'cargo', '效能與燃油': 'ship', '船況與加油': 'ship', '環保法遵': 'env', '系統管理': 'admin' };

  let M = null;
  function load() {
    if (M) return M;
    M = JSON.parse(JSON.stringify(DEF));
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) ROLES.forEach(r => FUNCS.forEach(([f]) => { if (s[r] && Number.isInteger(s[r][f])) M[r][f] = s[r][f]; })); } catch (e) { }
    return M;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch (e) { } }

  const role = () => { const me = U.auth && U.auth.me(); return me ? me.role : null; };
  const level = (r, f) => ((load()[r] || {})[f] || 0);
  const NEED = { view: 1, edit: 2, admin: 3 };
  // 目前登入者對某功能有沒有某等級；沒有登入功能（auth.js 沒載入）時一律可以
  function can(f, what) {
    if (!U.auth) return true;
    const r = role(); if (!r) return false;
    return level(r, f) >= (NEED[what] || 1);
  }
  // 第一層的導覽項目（tabsAvail 的一列：[代號, 名稱, 說明, 上層名稱]）屬於哪個功能
  const funcOfTab = t => PARENT[t[3]] || t[0];
  function set(r, f, v) {
    const old = level(r, f);
    if (old === v) return;
    load()[r][f] = v; save();
    if (U.audit) U.audit.log('權限', '權限', `${r} › ${(FUNCS.find(x => x[0] === f) || [])[1] || f}`, LV[old], LV[v]);
  }
  function reset() {
    const before = JSON.stringify(load());
    M = JSON.parse(JSON.stringify(DEF)); save();
    if (before !== JSON.stringify(M) && U.audit) U.audit.log('權限', '權限', '全部角色', '自訂', '還原預設');
  }

  U.perm = { FUNCS, ROLES, LV, DEF, level, can, set, reset, funcOfTab, matrix: () => load() };
  U.can = can;
})();
