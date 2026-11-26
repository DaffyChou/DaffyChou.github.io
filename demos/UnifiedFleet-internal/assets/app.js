/* 外殼：頂部列、導覽、路由（網址參數）、區塊渲染與風險判讀。 */
(function () {
  'use strict';
  const U = window.UI;
  const { STATE, RK, M, months, esc, VBY } = U;
  const $ = s => document.querySelector(s);

  // ---------------- 路由：#l=1&tab=overview&t=container&org=3&mo=2026-10&theme=dark
  //   l：層級（1 船隊總覽、2 清單、3 單船）；tab：第 1 層主題分頁；st：單船分頁；v：船；role：角色
  //   舊網址 #m=M13 仍可使用，會轉成對應位置
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1)), IAx = U.IA;
    if (h.get('t') === 'bulk' || h.get('t') === 'container') STATE.type = h.get('t');
    if (h.get('org')) STATE.org = h.get('org');
    if (h.get('v') && VBY[+h.get('v')]) STATE.vessel = +h.get('v');
    if (h.get('m') && !h.get('l')) { const m = IAx.modLoc(h.get('m')); if (m) IAx.setLoc(m.l, m.id); }
    if (['1', '2', '3'].includes(h.get('l'))) STATE.l = +h.get('l');
    if (h.get('tab')) STATE.tab = h.get('tab');
    if (h.get('st')) STATE.st = h.get('st');
    if (h.has('role')) STATE.role = h.get('role');
    if (h.get('cls') != null) STATE.cls = h.get('cls');
    STATE.expand = h.get('x') === '1';                      // 開發用：#x=1 讓卡片的說明與風險判讀全部展開
    const mi = months.indexOf(h.get('mo')); if (mi >= 0) STATE.mi = mi;
    if (h.get('theme')) STATE.theme = h.get('theme');
    STATE.view.envMetric = ['CO2_TEUNM', 'EEOI'].includes(h.get('em')) ? h.get('em') : null;   // 碳排強度圖的算法切換（未指定＝AER）
    if (U.rosterHash) U.rosterHash.read(h);
    if (U.boardHash) U.boardHash.read(h);
  }
  function writeHash() {
    const h = new URLSearchParams({ l: STATE.l, t: STATE.type, org: STATE.org, mo: months[STATE.mi] });
    if (STATE.l === 1) h.set('tab', STATE.tab);
    if (STATE.l === 3) { h.set('st', STATE.st); if (STATE.vessel) h.set('v', STATE.vessel); }
    if (STATE.role) h.set('role', STATE.role);
    if (STATE.cls) h.set('cls', STATE.cls);
    if (STATE.theme) h.set('theme', STATE.theme);
    if (U.lang === 'en') h.set('lang', 'en');                  // 英文介面（i18n.js）
    if (STATE.view.envMetric) h.set('em', STATE.view.envMetric);
    if (U.rosterHash) U.rosterHash.write(h);
    if (U.boardHash) U.boardHash.write(h);
    history.replaceState(null, '', '#' + h.toString());
  }

  // ---------------- 頂部列
  function buildTop() {
    $('#orgSel').innerHTML = `<option value="all">全部組織（示範）</option>` + M.orgs.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
    $('#monSel').innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).reverse().join('');
    $('#orgSel').onchange = e => { STATE.org = e.target.value; U.ensureValid(); U.bus.emit(); };
    $('#monSel').onchange = e => { STATE.mi = +e.target.value; U.bus.emit(); };
    if ($('#roleSel')) {   // 角色改跟著登入者（auth.js）；沒有登入功能時才有角色下拉
      $('#roleSel').innerHTML = '<option value="">不指定</option>' + U.IA.IA.roles.map(r => `<option value="${esc(r[0])}">${esc(r[0])}</option>`).join('');
      $('#roleSel').onchange = e => { U.IA.roleEntry(e.target.value); U.bus.emit(); window.scrollTo(0, 0); };
    }
    document.querySelectorAll('#typeSeg button').forEach(b => (b.onclick = () => { STATE.type = b.dataset.t; U.ensureValid(); U.bus.emit(); }));
    $('#themeBtn').onclick = () => { STATE.theme = (STATE.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark'; applyTheme(); U.bus.emit(); };
  }
  function applyTheme() { if (STATE.theme) document.documentElement.dataset.theme = STATE.theme; }
  function syncTop() {
    $('#orgSel').value = STATE.org;
    $('#monSel').value = STATE.mi;
    if ($('#roleSel')) $('#roleSel').value = STATE.role || '';
    if ($('#ctlMe')) { const me = U.auth && U.auth.me(); $('#ctlMe').innerHTML = me ? `${esc(me.name)}（${esc(me.role)}）<small>要換人請按右上「登出」再登入</small>` : '未登入'; }
    const types = U.typesInOrg();
    const seg = $('#typeSeg');
    seg.style.display = types.length > 1 ? '' : 'none';      // 規格：組織只有一種船型時隱藏開關
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === STATE.type)));
  }

  // ---------------- 左側樹狀選單：三層＋各層的導覽項目；合併過的項目可跳到頁內區段（收合狀態記在瀏覽器）
  let navC = null;
  // 設定左側選單收合（save＝記在瀏覽器；營運總控台開面板時只暫時收起、不記）；收合／展開後重算地圖大小，滿版地圖才會貼滿
  U.setNav = (c, save) => {
    navC = !!c; if (save) { try { localStorage.setItem('uf_navc2', navC ? '1' : '0'); } catch (e) { } }
    document.querySelector('.layout').classList.toggle('navc', navC);
    const hd2 = document.getElementById('navHd'); if (hd2) hd2.setAttribute('aria-pressed', navC || (U.cmdPanel && U.cmdPanel()) ? 'false' : 'true');
    if (U.invAllMaps) { U.invAllMaps(); setTimeout(U.invAllMaps, 180); setTimeout(U.invAllMaps, 360); }
    const st = document.querySelector('.grid.cmd'); if (st && U.cmdFit) U.cmdFit();
  };
  function navCollapsed() {
    if (navC === null) { try { const v = localStorage.getItem('uf_navc2'); navC = v === null ? matchMedia('(max-width:60rem)').matches : v === '1'; } catch (e) { navC = false; } }
    return navC;
  }
  const LEVELS0 = [[1, '船隊總覽'], [2, '清單'], [3, '單船總覽']];
  const lvName = l => (STATE.type === 'container' && ((U.IA.IA.cont || {}).levels || {})[l]) || LEVELS0[l - 1][1];   // 貨櫃輪第 2 層叫「船舶清單」（menu-order-naming）；散裝輪不變
  const levels = () => LEVELS0.map(([l]) => [l, lvName(l)]);
  function buildNav() {
    const IAx = U.IA; IAx.validateLoc();
    const kids = l => (l === STATE.l && (l === 1 || l === 3) ? IAx.tabsAvail(l, STATE.type) : []);
    const cur = l => (l === 1 ? STATE.tab : STATE.st), attr = l => (l === 1 ? 'data-tab' : 'data-st');
    const secs = STATE.l === 1 || STATE.l === 3 ? IAx.sections(STATE.l, cur(STATE.l), STATE.type) : [];
    $('#nav').innerHTML = `<button class="navtg" id="navTg" aria-label="收合或展開選單" title="收合或展開選單">«</button>` + levels().map(([l, n]) =>
      `<div class="ng${l === STATE.l ? ' on' : ''}"><button class="nh" data-l="${l}" ${l === STATE.l ? 'aria-current="true"' : ''}><span class="mid">${l}</span><span class="mn">${n}</span></button>` +
      kids(l).filter((t, i, A) => !t[3] || i === 0 || A[i - 1][3] !== t[3]).map(t => { const sib = t[3] ? kids(l).filter(x => x[3] === t[3]) : [t], on = l === STATE.l && sib.some(x => x[0] === cur(l)); return `<button class="nt${on ? ' on' : ''}" ${attr(l)}="${t[0]}" title="${esc(sib.map(x => x[2] || '').join('；'))}">${esc(t[3] || t[1])}</button>` +
        (on && secs.length > 1 ? secs.map(x => `<button class="ns" data-sec="${x.m}">${esc(x.name)}</button>`).join('') : ''); }).join('') + '</div>').join('');
    document.querySelector('.layout').classList.toggle('navc', navCollapsed());
    const tgl = () => {
      if (U.cmdPanel && U.cmdPanel()) { U.cmdOpen(''); U.setNav(false, true); return; }   // 營運總控台：左欄正顯示港口運務板／今日要處理時，按「選單」換成選單（三者同一組，一次一個）
      U.setNav(!navCollapsed(), true);
    };
    $('#navTg').onclick = tgl; { const hd = document.getElementById('navHd'); if (hd) { hd.onclick = tgl; hd.setAttribute('aria-pressed', navCollapsed() ? 'false' : 'true'); } }
    $('#nav').querySelectorAll('button[data-l]').forEach(b => (b.onclick = () => { goLevel(+b.dataset.l); }));
    $('#nav').querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => { IAx.setLoc(1, b.dataset.tab); STATE.scrollTo = null; U.bus.emit(); window.scrollTo(0, 0); }));
    $('#nav').querySelectorAll('[data-st]').forEach(b => (b.onclick = () => { if (!STATE.vessel) { const v = IAx.vesselList()[0]; if (v) STATE.vessel = STATE.vesselAuto = v.id; } IAx.setLoc(3, b.dataset.st); STATE.scrollTo = null; U.bus.emit(); window.scrollTo(0, 0); }));
    $('#nav').querySelectorAll('[data-sec]').forEach(b => (b.onclick = () => { const e = document.getElementById('sec-' + b.dataset.sec); if (e) { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -64); } }));
  }
  function goLevel(l) {
    if (l === 3 && !STATE.vessel) { const v = U.IA.vesselList()[0]; if (v) STATE.vessel = STATE.vesselAuto = v.id; }
    STATE.l = l; STATE.scrollTo = null; U.bus.emit(); window.scrollTo(0, 0);
  }

  // ---------------- 區塊
  function chipsFor(ids) { return ids.map(i => { const m = RK.metrics[i]; return m ? `<button class="chip gl ${m.status}" data-gloss="${i}" title="點一下看白話說明">${esc(m.name)}</button>` : ''; }).join(''); }
  function scopeText(b) {
    if (/^M12-c|^M13-c[012]$/.test(b) && U.cargo) return /^M13/.test(b) ? `港口 ${U.cargo.orgPorts()} 個` : `場站 ${U.cargo.C.yards.length} 個`;
    if (/^M13-(c3|b1)$/.test(b)) return b === 'M13-b1' ? '本公司散裝船' : '本公司貨櫃船';
    if (/^M13-(c4|b2)$/.test(b)) { const n = U.ownTerminals ? U.ownTerminals().length : 0; return n ? `自有碼頭 ${n} 個` : '沒有自有碼頭'; }   // 自有碼頭靠泊時程
    if (b === 'M13-b0') return '預報中的船舶';
    if (/^M12-b/.test(b)) return '散裝船隊';
    if (U.SINGLE.has(b)) return STATE.vessel ? '單船：' + U.vname(STATE.vessel) : '單船';
    if (/^M8-[bc][234]$/.test(b) && U.carbon) {             // 歐盟碳成本只算有歐盟航段的船：寫清楚「幾艘有算／船隊幾艘」，避免誤以為是全船隊
      const CE = U.carbon, vids = U.vesselsFor(b), set = new Set(vids), st = STATE.view.carbon || {}, ys = CE.years(vids), y = ys.includes(st.year) ? st.year : CE.defaultYear(vids);
      return `歐盟航段 ${CE.C.rows.filter(r => r.year === y && set.has(r.vid)).length} 艘／船隊 ${vids.length} 艘`;
    }
    const n = U.vesselsFor(b).length;
    if (U.opsFilt && U.opsFilt.blocks && U.opsFilt.blocks.has(b) && U.opsFilt.active()) return `${U.opsFilt.label()}　${n} 艘`;
    return U.CLASSBLK.has(b) && STATE.cls ? `同型船：${STATE.cls}　${n} 艘` : `船隊全部　${n} 艘`;
  }
  const clsSel = () => `<label class="fld">同型船<select data-cls><option value="">全部級距</option>${U.classesInScope().map(c => `<option value="${esc(c)}" ${c === STATE.cls ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
  // 第 1 層的圖 → 清單：依該分頁的主題排序（清單若沒有這一欄，改依整體風險）
  const TAB_SORT = { overview: '_score', perf: 'outlier', ops: 'otp', dispatch: 'otp', cargo: 'slot', fuel: 'remain', env: 'cii', data: 'dq' };
  function toList(b) {
    const keys = U.risk.themes[STATE.type].map(t => t.k), want = TAB_SORT[(U.IA.IA.home[b] || [])[1]] || '_score';
    const sort = want === '_score' || keys.includes(want) ? want : '_score';
    U.openRoster({ sort, dir: -1, cls: STATE.cls && U.CLASSBLK.has(b) ? STATE.cls : '' });
  }
  function cardNew(b) {
    const r = RK.blocks[b];
    return `<section class="blk c2" id="blk-${b}" style="grid-column:span ${r.vis === 'table' ? 12 : r.span}"><div class="ch"><h4>${esc(r.title)}</h4><button class="qm" aria-expanded="false" title="這張圖的說明">?</button><span class="sp"></span><span class="tools" data-tools>${U.CLASSBLK.has(b) ? clsSel() : ''}</span><span class="scope" title="資料範圍">${esc(scopeText(b))}</span>${STATE.l === 1 && U.MORE && U.MORE[b] ? `<button type="button" class="lnk tolist more" data-more="${U.MORE[b][0]}" title="到「${esc(U.MORE[b][1])}」看更多">看更多 →</button>` : ''}${STATE.l === 1 ? `<button class="lnk tolist" data-tolist="${b}" title="到${lvName(2)}看每艘船的燈號，並依這個主題排序">查看清單</button>` : ''}</div>
      <div class="cex" hidden><div class="bq">${esc(r.q)}</div>${r.ax ? `<div class="ax"><b>座標軸</b>　${esc(r.ax)}</div>` : ''}<div class="bm">${chipsFor(r.metrics)}</div></div>
      <div class="bc ${r.vis === 'table' || r.vis === 'kpi' || r.vis === 'form' || r.vis === 'map' || r.vis === 'board' ? 'auto' : ''}" data-chart></div>
      <div class="rs lv-no" data-rs><span class="dot"></span><b class="lvt">…</b><span class="sum" data-sum></span><button class="tg" aria-expanded="false">展開</button></div><div class="rd" data-rd hidden></div></section>`;
  }
  function wireNew(sec, b, res) {
    const lv = U.LV[res.level], rs = sec.querySelector('[data-rs]'), rd = sec.querySelector('[data-rd]'), tg = sec.querySelector('.tg'), ex = sec.querySelector('.cex'), qm = sec.querySelector('.qm');
    rs.className = 'rs lv-' + res.level; rs.querySelector('.lvt').textContent = lv.t;
    const sm = rs.querySelector('[data-sum]'); sm.textContent = res.summary; sm.title = res.summary;
    rd.innerHTML = U.risk.detail(b, res);
    const flip = (btn, box, open, onT, offT) => { box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (offT) btn.textContent = open ? onT : offT; };
    tg.onclick = () => flip(tg, rd, rd.hidden, '收合', '展開');
    qm.onclick = () => flip(qm, ex, ex.hidden);
    sm.onclick = tg.onclick;
    if (STATE.expand) { flip(tg, rd, true, '收合', '展開'); flip(qm, ex, true); }
    const tolist = sec.querySelector('[data-tolist]'); if (tolist) tolist.onclick = () => toList(b);
    const cs = sec.querySelector('[data-cls]'); if (cs) cs.onchange = e => { STATE.cls = e.target.value; U.bus.emit(); };
    const tl = sec.querySelector('[data-chart] .toolbar');            // 篩選移到標題列右側
    if (tl) sec.querySelector('[data-tools]').appendChild(tl);
  }
  function crumbs() {
    const parts = [['1', '船隊總覽']];
    if (STATE.l >= 2) parts.push(['2', lvName(2)]);
    if (STATE.l === 3) parts.push(['3', U.vname(STATE.vessel)]);
    return `<div class="crumb" role="navigation" aria-label="目前位置">${parts.map(([l, n], i) => (i === parts.length - 1 ? `<b>${esc(n)}</b>` : `<button class="lnk" data-crumb="${l}">${esc(n)}</button>`)).join('<span class="sep">›</span>')}</div>`;
  }
  function tabBar(list, cur, attr) {
    return `<div class="tabs" role="tablist">${list.map(t => `<button role="tab" ${attr}="${t[0]}" ${t[0] === cur ? 'aria-selected="true"' : ''} title="${esc(t[t.length - 1] || '')}">${esc(t[1])}</button>`).join('')}</div>`;
  }
  function vesselBar() {
    const L = U.IA.vesselList(), i = L.findIndex(v => v.id === STATE.vessel), v = U.VBY[STATE.vessel];
    return `<div class="vbar"><button class="btn" data-step="-1">‹ 上一艘</button><span class="picker"><button class="btn pk" data-pick aria-haspopup="listbox"><strong>${esc(v.name)}</strong> ▾</button><div class="pop" data-pop hidden><input type="text" data-pq placeholder="搜尋船名" aria-label="搜尋船名"><div data-pl></div></div></span><span class="note">${esc(v.cls || '')}　第 ${i + 1} / ${L.length} 艘</span><button class="btn" data-step="1">下一艘 ›</button><button class="lnk" data-crumb="2">回${lvName(2)}</button></div>${lampStrip()}`;
  }
  // 最近看過的船（記在瀏覽器，每種船型各自記 5 艘）
  function recentIds() { try { return JSON.parse(localStorage.getItem('uf_recent_' + STATE.type) || '[]').filter(id => U.VBY[id]); } catch (e) { return []; } }
  function pushRecent(id) { try { const r = [id].concat(recentIds().filter(x => x !== id)).slice(0, 5); localStorage.setItem('uf_recent_' + STATE.type, JSON.stringify(r)); } catch (e) { } }
  function wirePicker() {
    const btn = $('#main [data-pick]'); if (!btn) return;
    const pop = $('#main [data-pop]'), q = $('#main [data-pq]'), pl = $('#main [data-pl]');
    const eu = U.euSet ? U.euSet() : new Set();   // 有歐盟航段的船標「歐盟」
    const row = id => `<button class="pi${id === STATE.vessel ? ' on' : ''}" data-pid="${id}">${esc(U.VBY[id].name)}<span class="note"> ${esc(U.VBY[id].cls || '')}</span>${eu.has(id) ? ' <span class="tag no">歐盟</span>' : ''}</button>`;
    function fill() {
      const k = q.value.trim().toLowerCase(), all = U.IA.vesselList().map(v => v.id), rec = recentIds().filter(id => all.includes(id) && id !== STATE.vessel);
      const L = all.filter(id => !k || U.VBY[id].name.toLowerCase().includes(k) || (U.VBY[id].cls || '').toLowerCase().includes(k));
      pl.innerHTML = (!k && rec.length ? '<div class="note pg">最近看過</div>' + rec.map(row).join('') + '<div class="note pg">全部船舶（' + all.length + ' 艘）</div>' : '') + (L.length ? L.map(row).join('') : '<div class="note">沒有符合的船</div>');
      pl.querySelectorAll('[data-pid]').forEach(b => (b.onclick = () => { STATE.vessel = +b.dataset.pid; U.bus.emit(); }));
    }
    btn.onclick = () => { pop.hidden = !pop.hidden; if (!pop.hidden) { q.value = ''; fill(); q.focus(); const on = pl.querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' }); } };
    q.oninput = fill;
    q.onkeydown = e => { if (e.key === 'Escape') pop.hidden = true; if (e.key === 'Enter') { const f = pl.querySelector('[data-pid]'); if (f) f.click(); } };
    document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('.picker')) pop.hidden = true; }, { once: true, capture: true });
  }
  // 這艘船的各主題燈號（與清單同一份逐船評估）；有對應單船分頁的可點進去
  const LAMP_TAB = { otp: 's_voy', pwait: 's_voy', slot: 's_load', eff: 's_fuel', speed: 's_diag', catchup: 's_diag', outlier: 's_diag', foul: 's_diag', remain: 's_stock', data: 's_stock', cii: 's_env' };
  function lampStrip() {   // 只列要處理與留意（紅、黃）；正常與資料不足收進「＋N 項 ▾」，點了才展開
    const o = U.risk.byVessel(STATE.vessel), avail = U.IA.tabsAvail(3, STATE.type).map(t => t[0]), nm = U.IA.norm;
    const chip = ([k, x]) => {
      const tab = LAMP_TAB[k] && avail.includes(nm(LAMP_TAB[k])) ? nm(LAMP_TAB[k]) : '', c = { high: 'bad', mid: 'warn', low: 'ok', nodata: 'no' }[x.level];
      return `<${tab ? 'button data-lamp="' + tab + '"' : 'span'} class="lampchip ${c}" title="${esc(x.summary || '')}"><i></i>${esc(x.label)}　${esc(x.text || '')}</${tab ? 'button' : 'span'}>`;
    };
    const E = Object.entries(o).filter(([k]) => !(U.sov && U.sov.HIDE.has(k))), R = { high: 0, mid: 1 }, /* 單船頁不顯示沒有對應圖表的燈號（警報數、資料品質） */ hot = E.filter(([, x]) => x.level in R).sort((a, b) => R[a[1].level] - R[b[1].level]), rest = E.filter(([, x]) => !(x.level in R)), all = !!STATE.view.lampAll;
    const nOk = rest.filter(([, x]) => x.level === 'low').length, nNo = rest.length - nOk;
    return `<div class="lamps${all ? ' all' : ''}" aria-label="這艘船各項燈號">${hot.length ? hot.map(chip).join('') : '<span class="note">各項都正常</span>'}${all ? rest.map(chip).join('') : ''}${rest.length ? `<button type="button" class="lampmore" data-lampall aria-expanded="${all}">${all ? '收起 ▴' : `＋${rest.length} 項（正常 ${nOk}${nNo ? '、資料不足 ' + nNo : ''}） ▾`}</button>` : ''}</div>`;
  }
  // 同一列卡片高度一致時，較矮卡片的圖表長高填滿空白（最多長到原本的 2 倍）
  function fillCharts() {
    if (!window.echarts) return;
    document.querySelectorAll('#main .grid.g2:not(.cmd) > .blk.c2').forEach(b => {
      const ch = b.querySelector('[data-chart]'); if (!ch) return;
      const node = [ch].concat([...ch.querySelectorAll('[_echarts_instance_]')]).find(n => n.getAttribute && n.getAttribute('_echarts_instance_'));
      if (!node) return;
      const cs = getComputedStyle(b), used = [...b.children].reduce((t, c) => t + (c.hidden ? 0 : c.offsetHeight), 0);
      const free = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - used;
      const e = echarts.getInstanceByDom(node); if (!e) return;
      const h0 = node.dataset.h0 ? +node.dataset.h0 : e.getHeight(); node.dataset.h0 = h0;
      if (node === ch) { const target = Math.min(node.clientHeight, h0 * 2); if (Math.abs(target - e.getHeight()) > 8) e.resize({ height: target }); }   // 圖表區已被撐高：讓畫布跟著長
      else if (free > 24) { node.style.height = Math.min(node.offsetHeight + free, h0 * 2) + 'px'; e.resize(); }
    });
  }
  U.fillCharts = fillCharts;
  const setHdr = () => { const h = document.getElementById('top'); if (h) document.documentElement.style.setProperty('--hdr', h.offsetHeight + 'px'); };
  setHdr(); addEventListener('resize', setHdr);
  const FOLD = ['ops'];                                   // 預設收起的區段（運務管理數據頁的「進階：營運與港口」）
  function renderModule() {
    U.disposeCharts(); if (U.disposeMaps) U.disposeMaps();
    const IAx = U.IA;
    IAx.validateLoc();
    if (U.euAutoPick) U.euAutoPick();                         // 單船環保法遵：使用者還沒自己選船時，改選有歐盟航段的船
    const l = STATE.l, id = l === 1 ? STATE.tab : l === 3 ? STATE.st : 'list';
    const bids = IAx.blocksAt(l, id, STATE.type);
    const vs = U.scopeVessels();
    const title = lvName(l);
    const meTab = l === 1 || l === 3 ? IAx.tabsAvail(l, STATE.type).find(t => t[0] === id) : null;
    const sibTabs = (() => { if (!meTab || !meTab[3]) return ''; const A = IAx.tabsAvail(l, STATE.type); return tabBar(A.filter(t => t[3] === meTab[3]).map(t => [t[0], t[1], t[2]]), id, l === 3 ? 'data-st' : 'data-tab'); })()
      + (meTab && (meTab[3] === '運務管理' || meTab[0] === 'fuelops') && STATE.type === 'container' && U.opsFilt && U.cargo && U.cargo.orgOk() ? `<div class="opsf" data-opsf>${U.opsFilt.html()}</div>` : '');   // 運務管理：四個頁籤共用的區域／航線／預報區間
    const voy = l === 3 && meTab && meTab[3] === '航次與港口';
    const nav = l === 3 ? vesselBar() + (voy && U.svSummary ? sibTabs.replace(/<\/div>$/, U.svSummary(id) + '</div>') : sibTabs) + (voy && U.svPortTabs ? U.svPortTabs(id) : '') : sibTabs;   // 單船「航次與港口」：頁籤列右側放這艘船的摘要（狀態、下一港、ETA）；「前往港口」另有港口切換
    if (l === 1 && U.pages && U.pages[id]) {   // 自訂頁面（系統管理，admin.js）：沒有圖表卡片，整頁由該頁自己畫
      $('#main').innerHTML = `${crumbs()}<h2>${esc(title)}</h2>${nav}<div class="admpage" id="admPage"></div>`;
      $('#main').querySelectorAll('[data-tab]').forEach(x => (x.onclick = () => { IAx.setLoc(1, x.dataset.tab); STATE.scrollTo = null; U.bus.emit(); }));
      $('#main').querySelectorAll('[data-crumb]').forEach(x => (x.onclick = () => goLevel(+x.dataset.crumb)));
      try { U.pages[id]($('#admPage')); } catch (e) { console.error(id, e); $('#admPage').innerHTML = '<div class="note">頁面載入失敗：' + esc(e.message) + '</div>'; }
      return;
    }
    const envBan = (l === 1 && meTab && meTab[3] === '環保法遵' && U.carbonBanner ? U.carbonBanner() : '') + (l === 3 && id === 's_env' && U.euHint ? U.euHint() : '');   // 單船環保法遵：這艘船沒有歐盟航段時提示並列出有歐盟航段的船   // 環保法遵頁首：示意價／參數版本／基準日只寫一次
    $('#main').innerHTML = `${crumbs()}<h2>${esc(title)}</h2>
      ${nav}${envBan}
      <div class="grid g2${bids.includes('M15-c1') || bids.includes('M12-c0') || (l === 3 && id === 's_vmap' && (bids.includes('M14-c13') || bids.includes('M14-b7'))) ? ' cmd' : ''}">${(() => { const sc = l === 2 ? [] : IAx.sections(l, id, STATE.type); return sc.length > 1 ? sc.map(x => (FOLD.includes(x.m) ? `<details class="secx" id="sec-${x.m}"${STATE.view['fold_' + x.m] ? ' open' : ''}><summary class="sech">${esc(x.name)}</summary><div class="grid g2">${x.bids.map(b => cardNew(b)).join('')}</div></details>` : `<h3 class="sech" id="sec-${x.m}">${esc(x.name)}</h3>` + x.bids.map(b => cardNew(b)).join(''))).join('') : bids.map(b => cardNew(b)).join(''); })()}</div>`;
    $('#main').querySelectorAll('[data-tab]').forEach(x => (x.onclick = () => { IAx.setLoc(1, x.dataset.tab); STATE.scrollTo = null; U.bus.emit(); }));
    { const f = $('#main').querySelector('[data-opsf]'); if (f) U.opsFilt.wire(f); }
    $('#main').querySelectorAll('details.secx').forEach(d => (d.ontoggle = () => { STATE.view['fold_' + d.id.slice(4)] = d.open; if (d.open && window.echarts) d.querySelectorAll('[_echarts_instance_]').forEach(n => { const e = echarts.getInstanceByDom(n); if (e) e.resize(); }); }));
    $('#main').querySelectorAll('[data-st]').forEach(x => (x.onclick = () => { IAx.setLoc(3, x.dataset.st); STATE.scrollTo = null; U.bus.emit(); }));
    if (l === 3) { pushRecent(STATE.vessel); wirePicker(); }
    function renderLampWire() { $('#main').querySelectorAll('[data-lamp]').forEach(x => (x.onclick = () => { IAx.setLoc(3, x.dataset.lamp); STATE.scrollTo = null; U.bus.emit(); })); const lm = $('#main').querySelector('[data-lampall]'); if (lm) lm.onclick = () => { STATE.view.lampAll = !STATE.view.lampAll; lm.closest('.lamps').outerHTML = lampStrip(); renderLampWire(); if (U.cmdFit) U.cmdFit(); }; }
    renderLampWire();
    $('#main').querySelectorAll('[data-more]').forEach(x => (x.onclick = () => { IAx.setLoc(1, x.dataset.more); STATE.scrollTo = null; U.bus.emit(); window.scrollTo(0, 0); }));   // 營運總覽代表卡的「看更多 →」
    $('#main').querySelectorAll('[data-crumb]').forEach(x => (x.onclick = () => goLevel(+x.dataset.crumb)));
    $('#main').querySelectorAll('[data-step]').forEach(x => (x.onclick = () => IAx.step(+x.dataset.step)));
    bids.forEach(b => {
      const sec = document.getElementById('blk-' + b), chart = sec.querySelector('[data-chart]');
      const ctx = { bid: b, vids: U.vesselsFor(b), mi: STATE.mi, type: STATE.type };
      const fn = U.getRenderer(b);
      try { if (fn) fn(chart, ctx); else U.emptyChart(chart, '（此區塊圖表尚未實作；風險判讀已可用）'); } catch (e) { console.error(b, e); U.emptyChart(chart, '圖表載入失敗：' + e.message); }
      const res = U.risk.evaluate(b), lv = U.LV[res.level];
      wireNew(sec, b, res);
    });
    $('#main').querySelectorAll('[data-gloss]').forEach(x => (x.onclick = () => openGloss(x.dataset.gloss)));
    $('#main').querySelectorAll('[data-vessel]').forEach(x => (x.onclick = () => U.go('M3', +x.dataset.vessel)));
    $('#main').querySelectorAll('[data-go]').forEach(x => (x.onclick = () => { const t = RK.blocks[x.dataset.go]; if (t.type !== STATE.type) STATE.type = t.type; U.go(t.mod, null, x.dataset.go); window.scrollTo(0, 0); }));
    if (U.cmdAfter) U.cmdAfter();
    setTimeout(fillCharts, 80);
    if (STATE.scrollTo) { const el = document.getElementById('blk-' + STATE.scrollTo); if (el) { el.classList.add('hl'); el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); } STATE.scrollTo = null; }
  }


  // ---------------- 名詞小幫手
  function glossHtml(focus) {
    const rows = Object.entries(RK.metrics).filter(([, m]) => m.gloss).map(([k, m]) => ({ k, n: m.name, g: m.gloss, e: m.eg, u: m.unit }));
    rows.push(...(RK.extra || []).map(x => ({ k: 'x' + x[0], n: x[0], g: x[1], e: x[2] })));
    return `<div class="gh"><strong>名詞小幫手</strong><input type="text" id="glQ" placeholder="輸入關鍵字，例如：準點、碳排" aria-label="搜尋名詞"><button class="btn" id="glX">關閉</button></div>
      <div class="gb">${rows.map(r => `<div class="gi ${r.k === focus ? 'hl' : ''}" id="gl-${r.k}" data-t="${esc(r.n + r.g)}"><b>${esc(r.n)}</b><div>${esc(r.g)}</div>${r.e ? `<div class="note">例：${esc(r.e)}${r.u ? '（單位：' + esc(r.u) + '）' : ''}</div>` : ''}</div>`).join('')}</div>`;
  }
  function openGloss(focus) {
    let d = document.getElementById('glossBox');
    if (!d) { d = document.createElement('dialog'); d.id = 'glossBox'; document.body.appendChild(d); }
    d.innerHTML = glossHtml(focus);
    d.querySelector('#glX').onclick = () => d.close();
    d.querySelector('#glQ').oninput = e => { const q = e.target.value.trim(); d.querySelectorAll('.gi').forEach(x => (x.hidden = !!q && !x.dataset.t.includes(q))); };
    d.showModal();
    const t = focus && d.querySelector('#gl-' + focus); if (t) t.scrollIntoView({ block: 'center' });
  }

  U.syncHash = writeHash;
  function render() { U.ensureValid(); applyTheme(); syncTop(); buildNav(); renderModule(); writeHash(); }
  U.bus.on(render);
  window.addEventListener('hashchange', () => { readHash(); render(); });
  document.getElementById('glossBtn').onclick = () => openGloss();
  { const tg = document.getElementById('ctlTg'), pn_ = document.getElementById('ctl');                 // 右側「切換設定」抽屜
    const set = on => { if (on && U.closeRight) U.closeRight('ctl'); pn_.classList.toggle('open', on); tg.classList.toggle('open', on); tg.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    tg.onclick = () => set(!pn_.classList.contains('open'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
    document.addEventListener('click', e => { if (pn_.classList.contains('open') && !e.target.closest('#ctl, #ctlTg')) set(false); }); }
  const hadHash = !!location.hash;
  readHash(); buildTop();
  if (U.auth) U.auth.boot(STATE.role, hadHash);   // 登入（auth.js）：沒登入出現登入畫面；舊網址帶 role= 自動以該角色登入；沒有網址參數時進登入者的角色入口
  else if (!hadHash) { try { const r = localStorage.getItem('uf_role'); if (r) U.IA.roleEntry(r); } catch (e) { } }   // 沒有網址參數時，套用上次選的角色
  render();
  window.UI.render = render;
})();
