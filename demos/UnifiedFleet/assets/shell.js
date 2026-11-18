/* 三層架構外殼的共用邏輯：船隊總覽（1）→ 清單（2）→ 單船總覽（3）。
   區塊歸屬、主題分頁、角色入口都來自 data/ia.js（由 build/ia_map.py 產生）。 */
(function () {
  'use strict';
  const U = window.UI, VBY = U.VBY, IA = window.UI_IA, RK = U.RK, STATE = U.STATE;
  Object.assign(STATE, { l: 1, tab: 'overview', st: 's_over', role: '' });
  const order = Object.keys(RK.blocks);
  const FIRST = ['M13-c3', 'M13-b1'];                       // 運務分頁的位置地圖
  const TABN = Object.fromEntries(IA.tabs.map(t => [t[0], t[1]]));
  const STN = Object.fromEntries(IA.stabs.map(t => [t[0], t[1]]));
  const GR = IA.groups || { 1: IA.tabs.map(t => [t[0], t[1], t[t.length - 1], [t[0]]]), 3: IA.stabs.map(t => [t[0], t[1], t[t.length - 1], [t[0]]]) };
  const ALIAS = {}; [1, 3].forEach(l => (GR[l] || []).forEach(g => { ALIAS[g[0]] = g[0]; g[3].forEach(m => (ALIAS[m] = g[0])); }));   // 舊的分頁代號 → 合併後的導覽項目
  ALIAS.portops = 'opsov';                                    // 上一版的導覽代號
  ALIAS.opsan = 'opsdata';
  ALIAS.perfuel = 'perf';                                     // 效能與燃油改成兩個頁籤，舊網址到第一個頁籤（效能與機務）
  ALIAS.s_voyport = 's_vmap';                                 // 單船「航次與港口」改成四個頁籤（single-voyage-port），舊網址到第一個頁籤（航行地圖）                                    // 營運分析 → 運務管理（數據）
  const norm = id => ALIAS[id] || id;

  // 某一層某分頁、某船型的區塊（依 risk.js 的原順序）
  function blocksRaw(l, id, type) {
    const L = order.filter(b => { const h = IA.home[b]; return h && h[0] === l && (l === 2 || h[1] === id) && RK.blocks[b].type === type; });
    const first = id => !/^M15-/.test(id) && (RK.blocks[id].vis === 'map' || FIRST.includes(id));   // 營運指揮台（M15）維持規格順序：數字、地圖＋待辦、三張圖
    L.sort((x, y) => (first(y) ? 1 : 0) - (first(x) ? 1 : 0));   // 地圖放最前面
    const PIN = ['M15-c8', 'M15-c10', 'M15-c11', 'M15-c13', 'M5-c2', 'M5-c1'];   // 運務管理（數據）的排列
    if (L.some(b => PIN.includes(b))) L.sort((x, y) => (PIN.includes(x) ? PIN.indexOf(x) : 99) - (PIN.includes(y) ? PIN.indexOf(y) : 99));
    const PIN2 = ['M15-c0', 'M15-c15', 'M13-c4', 'M15-c14'];   // 運務管理（靠泊時程）的排列
    if (L.includes('M13-c4')) L.sort((x, y) => (PIN2.includes(x) ? PIN2.indexOf(x) : 99) - (PIN2.includes(y) ? PIN2.indexOf(y) : 99));
    if (L.includes('M14-c20')) { L.splice(L.indexOf('M14-c20'), 1); L.unshift('M14-c20'); }   // 單船「航次數據」：ETA 準確度放最上方
    const PIN4 = ['M14-c23', 'M14-c10', 'M14-c11'];   // 單船「前往港口」：這艘船在這港（卸櫃＋空櫃）、壅塞、等泊趨勢
    if (L.includes('M14-c23')) L.sort((x, y) => (PIN4.includes(x) ? PIN4.indexOf(x) : 99) - (PIN4.includes(y) ? PIN4.indexOf(y) : 99));
    const PIN3 = ['M14-c21', 'M14-c22', 'M3-c5'];   // 單船「靠港與到港」：靠泊時程、停靠港預報、靠港紀錄
    if (L.includes('M14-c21')) L.sort((x, y) => (PIN3.includes(x) ? PIN3.indexOf(x) : 99) - (PIN3.includes(y) ? PIN3.indexOf(y) : 99));
    if (L.includes('M15-c0')) { L.splice(L.indexOf('M15-c0'), 1); L.unshift('M15-c0'); }   // 營運分析：重點數字放最前面
    ['M8-b5', 'M8-c5'].forEach(k => { if (L.includes(k)) { L.splice(L.indexOf(k), 1); L.unshift(k); } });   // 環保法遵（數據）：年度排放重點數字放最前面
    [['M8-b7', 'M8-b3'], ['M8-c7', 'M8-c3']].forEach(([a, b]) => { if (L.includes(a) && L.includes(b)) { L.splice(L.indexOf(a), 1); L.splice(L.indexOf(b), 0, a); } });   // CII 行動清單放在 FuelEU 強度圖上方（使用者 2026-11-19）
    if (L.includes('M14-c14') && L.includes('M3-c3')) { L.splice(L.indexOf('M3-c3'), 1); L.splice(L.indexOf('M14-c14') + 1, 0, 'M3-c3'); }   // 單船「船上貨櫃」：貨量結構圖放在概況數字下面
    return L;
  }
  function blocksAt(l, id, type) {
    const g = l !== 2 && (GR[l] || []).find(x => x[0] === id);
    return g ? g[3].flatMap(m => blocksRaw(l, m, type)) : blocksRaw(l, id, type);
  }
  // 合併項目的區段（每個原分頁一段，各段的卡片）；單一成員的項目回傳空陣列
  function sections(l, id, type) {
    const g = l !== 2 && (GR[l] || []).find(x => x[0] === id);
    if (!g || g[3].length < 2) return [];
    return g[3].map(m => ({ m, name: (IA.secnames || {})[m] || m, bids: blocksRaw(l, m, type) })).filter(x => x.bids.length);
  }
  // 此船型有區塊的分頁
  function tabsAvail(l, type) {
    return (GR[l] || []).filter(g => blocksAt(l, g[0], type).length).map(g => [g[0], g[1], g[2], g[4] || '']);
  }
  function modLoc(mod) {
    const b = order.find(x => RK.blocks[x].mod === mod && IA.home[x]);
    return b ? { l: IA.home[b][0], id: IA.home[b][1] } : null;
  }
  function setLoc(l, id) {
    STATE.l = l;
    if (l === 1 && id) STATE.tab = norm(id);
    if (l === 3 && id) STATE.st = norm(id);
  }
  // 讓目前位置在此組織與船型下有效
  function validateLoc() {
    const type = STATE.type;
    STATE.tab = norm(STATE.tab); STATE.st = norm(STATE.st);
    if (STATE.l === 1) { const a = tabsAvail(1, type); if (!a.some(t => t[0] === STATE.tab)) STATE.tab = a.length ? a[0][0] : 'overview'; }
    if (STATE.l === 3) {
      const a = tabsAvail(3, type); if (!a.some(t => t[0] === STATE.st)) STATE.st = a.length ? a[0][0] : 's_over';
      if (!STATE.vessel) STATE.l = 2;
    }
    if (STATE.l === 2 && !blocksAt(2, 'list', type).length) STATE.l = 1;
  }
  // 上一艘／下一艘：若剛從清單進來，沿用清單目前的篩選與排序
  function vesselList() {
    if (STATE.order && STATE.order.includes(STATE.vessel)) return STATE.order.map(id => VBY[id]).filter(Boolean);
    return U.scopeVessels().slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  function step(d) {
    const L = vesselList(); if (!L.length) return;
    const i = Math.max(0, L.findIndex(v => v.id === STATE.vessel));
    STATE.vessel = L[(i + d + L.length) % L.length].id;
    U.bus.emit();
  }
  // 舊的呼叫方式（模組代號、區塊代號）轉成新位置：點船名進單船、點「相關圖表」跳到該圖
  function go(mod, vessel, bid) {
    if (vessel) STATE.vessel = vessel;
    if (bid && IA.home[bid]) setLoc(IA.home[bid][0], IA.home[bid][1]);
    else if (mod === 'M3') setLoc(3, 's_over');
    else { const m = modLoc(mod); if (m) setLoc(m.l, m.id); }
    STATE.scrollTo = bid || null;
    U.bus.emit();
  }
  function roleEntry(name) {
    const r = IA.roles.find(x => x[0] === name);
    STATE.role = r ? name : '';
    try { localStorage.setItem('uf_role', STATE.role); } catch (e) { }
    if (r) setLoc(1, r[2]);
  }
  // 文字裡的舊模組代號（例如「到 M7 看離群日」）改成新位置名稱：M2＝清單、M3＝單船總覽，其餘依該模組圖表所在的分頁
  const MODN = {};
  function modName(m) {
    if (m === 'M2') return '清單';
    if (m === 'M3') return '單船總覽';
    if (!(m in MODN)) { const L = modLoc(m); MODN[m] = !L ? '相關頁面' : L.l === 1 ? '「' + TABN[L.id] + '」分頁' : '單船「' + STN[L.id] + '」分頁'; }
    return MODN[m];
  }
  const human = t => (typeof t === 'string' ? t.replace(/\bM(\d+)(?![\d-])/g, (x, n) => modName('M' + n)) : t);
  Object.values(RK.blocks).forEach(b => ['q', 'ax', 'how', 'action', 'why', 'title'].forEach(k => { if (b[k]) b[k] = human(b[k]); }));
  if (RK.guide) RK.guide = RK.guide.map(human);
  U.IA = { IA, GR, norm, sections, blocksAt, tabsAvail, modLoc, setLoc, validateLoc, vesselList, step, roleEntry, TABN, STN };
  U.go = go;
})();
