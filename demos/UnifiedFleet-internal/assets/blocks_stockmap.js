/* 空櫃存量地圖（M12-c0，提案 empty-stock-map）：每個港口一個泡泡（同港場站合併），大小＝空櫃 TEU、顏色＝7 天內最差的缺櫃風險、灰＝資料過期；
   上方切換櫃型；點港口看該港各場站、各櫃型個數。數字全部取自 cargo_engine.js（最新存量 latest、缺櫃預估 forecastAll、場站 util），不另算。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo;
  if (!CG) return;
  const C = CG.C;

  // 櫃型分組：代碼取自 C.combos 的第 1 欄；RQ、FO、FC 的定義待客戶確認
  const GROUPS = [
    { id: 'all', name: '全部', codes: null },
    { id: 'dc', name: '乾貨櫃（DC）', codes: ['DC'] },
    { id: 'hq', name: '高櫃（HQ）', codes: ['HQ'] },
    { id: 'rf', name: '冷凍櫃（RF、RQ）', codes: ['RF', 'RQ'] },
    { id: 'sp', name: '特殊櫃（FO、FC）', codes: ['FO', 'FC'] },
    { id: 'ot', name: '其他', codes: ['OTHER'] },
  ];
  const RANK = { '要處理': 3, '留意': 2, '正常': 1, '資料不足': 0 };
  const combosOf = gid => { const g = GROUPS.find(x => x.id === gid) || GROUPS[0]; return C.combos.map((cb, c) => c).filter(c => !g.codes || g.codes.includes(C.combos[c][0])); };

  /** 依港口彙總某櫃型分組：個數、TEU、場站（含各櫃型個數）、過期場站數、最差缺櫃風險。
      risk：全部場站都過期＝'過期'；否則取未過期場站在這組櫃型的最差預估等級（要處理＞留意＞正常；都資料不足＝'資料不足'）。 */
  // 彙總結果依櫃型暫存：切圖層、切回同一個櫃型時不用重算（約 16 毫秒）；每次重畫頁面時清掉（clearAgg），資料改變就會重算
  const aggCache = {};
  const clearAgg = () => Object.keys(aggCache).forEach(k => delete aggCache[k]);
  function agg(gid) {
    if (aggCache[gid]) return aggCache[gid];
    return (aggCache[gid] = aggCalc(gid));
  }
  function aggCalc(gid) {
    const cs = combosOf(gid), ut = CG.util(), fc = CG.forecastAll(), by = {};
    const fcBy = {}; fc.forEach(r => (fcBy[r.y + '|' + r.c] = r));
    ut.forEach(x => {
      const cells = cs.map(c => ({ c, l: CG.latest(x.y, c) })).filter(o => o.l);
      if (!cells.length) return;                                       // 這個場站沒有這組櫃型的存量紀錄
      const P = by[x.unlo] = by[x.unlo] || { unlo: x.unlo, ll: C.ports[x.unlo] || null, yards: [], boxes: 0, teu: 0, stale: 0, risk: null, worst: [] };
      const yd = { y: x.y, yard: x.yard, stale: x.stale, last: x.last, boxes: 0, teu: 0, by: {} };
      cells.forEach(({ c, l }) => { yd.by[c] = l.qty; yd.boxes += l.qty; yd.teu += l.qty * CG.TEU[C.combos[c][1]]; });
      P.yards.push(yd); P.boxes += yd.boxes; P.teu += yd.teu; if (x.stale) P.stale++;
      if (x.cap != null && x.u != null) { if (x.u > 1) P.uerr = (P.uerr || 0) + 1; else if (P.umax == null || x.u > P.umax) { P.umax = x.u; P.uyard = x.yard; } }   // 場站使用率：取該港最滿的場站
      if (!x.stale) cells.forEach(({ c }) => { const r = fcBy[x.y + '|' + c]; if (r) P.worst.push(r); });
    });
    return Object.values(by).map(P => {
      if (P.stale === P.yards.length) P.risk = '過期';
      else {
        const top = P.worst.reduce((a, r) => (RANK[r.status] > RANK[a] ? r.status : a), '資料不足');
        P.risk = top;
        P.worstRows = P.worst.filter(r => r.status === top && top !== '正常' && top !== '資料不足').sort((a, b) => (a.first || 99) - (b.first || 99));
      }
      delete P.worst;
      P.yards.sort((a, b) => (a.yard < b.yard ? -1 : 1));
      return P;
    }).sort((a, b) => b.teu - a.teu);
  }

  // ---------------- 地圖：Leaflet（本機）＋ Esri 底圖（網址由 map.js 的 U.mapBases 提供）；重繪前一律釋放
  const { COL, fmt, esc, STATE } = U;
  const pn = u => (U.ports ? U.ports(u) : u);
  const mine = [];
  const prevDispose = U.disposeMaps;
  U.disposeMaps = () => { mine.splice(0).forEach(m => { try { m.remove(); } catch (e) { } }); if (prevDispose) prevDispose(); };
  const OFFS = [-360, 0, 360];                                         // 跨日期變更線平移時仍看得到泡泡
  const LABEL_N = 8;                                                   // 常駐標籤：要處理的港口＋空櫃最多的前 8 個；其餘滑鼠移上才顯示
  const colorOf = (risk, col) => (risk === '要處理' ? col.bad : risk === '留意' ? col.warn : risk === '正常' ? col.ok : col.no);
  // 場站使用率圖層：顏色看該港最滿的場站（80% 黃、95% 紅）；沒有容量資料或只有資料異常的港為灰
  const utilLv = P => (P.umax == null ? 'na' : P.umax >= 0.95 ? 'bad' : P.umax >= 0.8 ? 'warn' : 'ok');
  const utilText = P => (P.umax == null ? (P.uerr ? '容量或存量有誤（超過 100%）' : '沒有容量資料') : `最滿的場站 ${P.uyard} ${fmt(P.umax * 100, 0)}%`) + (P.umax != null && P.uerr ? `（另 ${P.uerr} 個場站資料異常）` : '');
  const isHot = (P, layer) => (layer === 'util' ? utilLv(P) === 'bad' : P.risk === '要處理');

  // 滑鼠提示框：只做快速比較，1～2 行、不換行；細節交給點開後的港口詳情
  const TIPK = { '要處理': 'bad', '留意': 'warn', '正常': 'ok', '資料不足': 'no', '過期': 'no' };
  function tipHtml(P, gname, layer) {
    const head = `<b>${esc(pn(P.unlo))}</b>　${fmt(P.teu, 0)} TEU　<span class="tag ${TIPK[P.risk] || 'no'}">${esc(P.risk === '過期' ? '資料過期' : P.risk)}</span>`;
    let sub = '';
    if (layer === 'util') sub = '場站使用率：' + utilText(P);
    else if (P.worstRows && P.worstRows.length) { const r = P.worstRows[0]; sub = `最早第 ${r.first} 天缺：${r.yard} ${r.ct} ${r.sz} 呎${P.worstRows.length > 1 ? `（另 ${P.worstRows.length - 1} 項）` : ''}`; }
    else if (P.stale) sub = `${P.stale} 個場站資料過期`;
    return head + (sub ? `<br><span class="note">${esc(sub)}</span>` : '');
  }

  /** 在 el 畫空櫃泡泡地圖；opts.onPick(港口代碼) 點泡泡時呼叫；opts.sel 目前選中的港口。回傳 { map, ports }。 */
  function draw(el, gid, opts) {
    opts = opts || {};
    const col = COL();
    if (!window.L) { U.emptyChart(el, '地圖元件載入失敗'); return null; }
    // 地圖本體只建立一次；泡泡與標籤放在圖層群組，切換櫃型、圖層、「只看要處理」時只重畫群組（paint），縮放與拖曳位置不動
    const map = L.map(el, { worldCopyJump: true, zoomControl: true, attributionControl: true, minZoom: 1 });
    mine.push(map);
    try { const z = Math.max(1, Math.ceil(Math.log2(Math.max(el.clientWidth, 256) / 256) - 0.15)); map.setMinZoom(z); } catch (e) { }   // 世界約填滿寬度：寬度略大於整個世界時（例如 1,086px 對 1,024px）允許兩側少量重複，避免縮放過大看不到所有港口
    const B = U.mapBases || {}, base = B[STATE.theme === 'light' ? 'street' : 'dark'];
    if (base) {
      let err = 0;
      L.tileLayer(base.url, { maxZoom: base.max, attribution: 'Esri' }).on('tileerror', () => { if (++err === 3 && opts.onTileError) opts.onTileError(); }).addTo(map);
    }
    const grp = L.layerGroup().addTo(map), msg = L.DomUtil.create('div', 'smempty', el);
    let labs = [], mks = {}, sel = opts.sel || null, fitted = false;
    const relabel = () => {                                            // 標籤避讓：依優先序放，和已放的重疊就先藏起來；縮放或平移後重算
      const kept = [];
      labs.slice().sort((a, b) => b[0] - a[0]).forEach(([, mk, w]) => {
        const p = map.latLngToContainerPoint(mk.getLatLng()), r = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - 34, y1: p.y - 14 };
        const hit = kept.some(k => r.x0 < k.x1 && r.x1 > k.x0 && r.y0 < k.y1 && r.y1 > k.y0);
        const e = mk.getElement(); if (e) e.style.display = hit ? 'none' : '';
        if (!hit) kept.push(r);
      });
    };
    map.on('zoomend moveend', relabel);
    function paint(gid2, layer, only) {
      const g = GROUPS.find(x => x.id === gid2) || GROUPS[0], ports = agg(g.id).filter(P => P.ll && (!only || isHot(P, layer)));
      grp.clearLayers(); labs = []; mks = {};
      msg.textContent = ports.length ? '' : (only ? `沒有${layer === 'util' ? '使用率 95% 以上' : '要處理'}的港口（${g.name}）` : `沒有${g.name}的空櫃存量資料`);
      msg.style.display = ports.length ? 'none' : '';
      const maxT = Math.max(1, ...ports.map(P => P.teu)), rad = t => Math.max(5, 30 * Math.sqrt(t / maxT));   // 面積與 TEU 成正比，最大半徑 30px
      const lab = new Set(ports.filter(P => isHot(P, layer)).map(P => P.unlo).concat(ports.slice(0, LABEL_N).map(P => P.unlo)));
      ports.slice().sort((a, b) => b.teu - a.teu).forEach(P => OFFS.forEach(o => {      // 大的先畫，小的疊在上面才點得到
        const c = layer === 'util' ? ({ bad: col.bad, warn: col.warn, ok: col.ok, na: col.no })[utilLv(P)] : colorOf(P.risk, col), on = sel === P.unlo;
        const m = L.circleMarker([P.ll[0], P.ll[1] + o], { radius: rad(P.teu), color: on ? col.ink : c, weight: on ? 3 : 1.5, fillColor: c, fillOpacity: P.risk === '過期' ? .35 : .6, className: 'smdot' }).addTo(grp);
        m.bindTooltip(tipHtml(P, g.name, layer), { direction: 'top', className: 'smtip', sticky: true, offset: [0, -6] });
        if (lab.has(P.unlo) && o === 0) {
          const mk = L.marker([P.ll[0], P.ll[1]], { icon: L.divIcon({ className: 'smlab', html: `<span>${esc(pn(P.unlo))}<b>${fmt(P.teu, 0)}</b></span>`, iconSize: null }), interactive: false, keyboard: false }).addTo(grp);
          labs.push([(isHot(P, layer) ? 1e9 : 0) + P.teu, mk, (pn(P.unlo).length + fmt(P.teu, 0).length) * 6.4 + 16]);   // 最後一項＝標籤寬度估算（11px 字、左右留白）
        }
        (mks[P.unlo] = mks[P.unlo] || []).push([m, c]);
        m.on('click', () => opts.onPick && opts.onPick(P.unlo));
      }));
      if (!fitted && ports.length) {                                   // 只在第一次畫時決定視野；之後切換保留使用者的縮放位置
        fitted = true;
        try { map.fitBounds(L.latLngBounds(ports.map(P => P.ll)), { padding: [24, 24], maxZoom: 4 }); } catch (e) { map.setView([20, 60], 2); }
      }
      relabel();
      el.classList.remove('smrepaint'); void el.offsetWidth; el.classList.add('smrepaint');   // 新泡泡淡入（app.css 的 .smrepaint）
      return ports;
    }
    const setSel = u => { sel = u; Object.entries(mks).forEach(([k, arr]) => arr.forEach(([m, c]) => m.setStyle({ color: k === u ? col.ink : c, weight: k === u ? 3 : 1.5 }))); };
    const ports = paint(gid, opts.layer || 'risk', opts.only);
    return { map, ports, setSel, paint };
  }

  // 圖例：顏色與大小的意思（HTML，跟著日夜模式的顏色變數）
  function legend(g, layer) {
    const it = (v, t) => `<span><i style="background:var(--${v})"></i>${t}</span>`;
    const items = layer === 'util' ? it('bad', '最滿的場站 95% 以上') + it('warn', '80% 到 95%') + it('ok', '80% 以下') + it('no', '沒有容量資料或資料異常')
      : it('bad', '7 天內會缺櫃（要處理）') + it('warn', '可能會缺（留意）') + it('ok', '正常') + it('no', '資料過期或不足');
    return `<div class="smleg"><b>${layer === 'util' ? '顏色＝場站使用率' : '顏色＝缺櫃風險'}</b>${items}` +
      `<span class="note">圓越大＝${esc(g.name)}空櫃 TEU 越多（20 呎＝1、40 呎與 45 呎＝2）；常駐標籤為${layer === 'util' ? '使用率 95% 以上' : '要處理'}的港口與空櫃最多的 ${LABEL_N} 個</span></div>`;
  }

  /** 缺櫃清單：該櫃型分組中 7 天內會低於安全存量（要處理）的場站與櫃型，依最早缺櫃日、缺口大到小、場站代碼排序 */
  function shortList(gid) {
    const cs = combosOf(gid);
    return CG.forecastAll().filter(r => r.status === '要處理' && cs.includes(r.c)).sort((a, b) => (a.first || 99) - (b.first || 99) || (b.gap || 0) - (a.gap || 0) || (a.yard < b.yard ? -1 : 1));
  }
  U.stockMap = { GROUPS, agg, combosOf, draw, legend, colorOf, shortList, utilLv: P => utilLv(P), tip: (P, g, l) => tipHtml(P, g, l), clearAgg };


  // ---------------- 港口明細面板：各場站、各櫃型個數；會缺的櫃型標色；可跳到缺櫃預估並選好該場站與櫃型
  const SK = { '要處理': 'bad', '留意': 'warn', '正常': 'ok', '資料不足': 'no' };
  const FCBOX = '<div class="smfc"><div class="note" data-fsum></div><div data-fch style="height:12rem"></div><div class="note">實線＝預估存量，色帶＝約 80% 信心的區間，紅虛線＝安全存量。和「場站與缺櫃 › 缺櫃預估」選同一個場站與櫃型時數字相同。</div><button type="button" class="btn" data-fcgo>在「場站與缺櫃」看完整預估與清單 →</button></div>';
  function panel(box, ports, g, st, pick) {
    const P = ports.find(p => p.unlo === st.sel);
    if (!P) {                                                          // 還沒選港口：提示＋最需要注意的港口
      const top = ports.filter(p => p.risk === '要處理' || p.risk === '留意').sort((a, b) => (a.risk === b.risk ? b.teu - a.teu : a.risk === '要處理' ? -1 : 1)).slice(0, 8);
      box.innerHTML = `<div class="smph"><b>港口明細</b><div class="note">點地圖上的港口，看該港各場站、各櫃型的空櫃個數。</div>${top.length ? '<div class="note" style="margin-top:.4rem">最需要注意的港口：</div>' +
        top.map(p => `<button type="button" class="smpick" data-u="${esc(p.unlo)}"><span class="tag ${SK[p.risk]}">${esc(p.risk)}</span> ${esc(pn(p.unlo))}<span class="note">${fmt(p.teu, 0)} TEU</span></button>`).join('') : ''}</div>`;
      box.querySelectorAll('[data-u]').forEach(b => (b.onclick = () => pick(b.dataset.u)));
      return;
    }
    const cs = combosOf(g.id), fcBy = {}; CG.forecastAll().forEach(r => (fcBy[r.y + '|' + r.c] = r));
    const ut = {}; CG.util().forEach(x => (ut[x.y] = x));
    const rk = P.risk === '過期' ? ['資料過期', 'no'] : [P.risk, SK[P.risk] || 'no'];
    // 這個港口、這組櫃型裡會缺的（要處理）組合；最早缺櫃日
    const short = [].concat(...P.yards.filter(yd => !yd.stale).map(yd => cs.filter(c => yd.by[c] != null).map(c => fcBy[yd.y + '|' + c]).filter(f => f && f.status === '要處理')));
    const first = short.length ? Math.min(...short.map(f => f.first || 99)) : null;
    // 詳情內的缺櫃預估：預設打開這個港口最早會缺的場站與櫃型；已選的不屬於這個港口時重選
    if (!st.fc || !P.yards.some(yd => yd.y === st.fc.y && yd.by[st.fc.c] != null && cs.includes(st.fc.c))) {
      const f0 = short.slice().sort((x, y) => (x.first || 99) - (y.first || 99))[0];
      st.fc = f0 ? { y: f0.y, c: f0.c } : null;
    }
    const kp = (k, v, sub, c) => `<div class="smkp"><div class="note">${k}</div><b class="${c || ''}">${v}</b>${sub ? `<div class="note">${sub}</div>` : ''}</div>`;
    const bar = x => {                                                 // 場站使用率（全部櫃型的 TEU ÷ 容量）
      if (!x || x.cap == null) return `<div class="smut"><span class="note">場站使用率</span><span class="tag no">N/A</span><span class="note">沒有容量資料</span></div>`;
      if (x.u > 1) return `<div class="smut"><span class="note">場站使用率</span><span class="tag bad">資料異常</span><span class="note">${fmt(x.teu, 0)}／${fmt(x.cap, 0)} TEU，超過 100%</span></div>`;
      const k = x.u >= 0.95 ? 'bad' : x.u >= 0.8 ? 'warn' : 'ok';
      return `<div class="smut"><span class="note">場站使用率</span><span class="smbar"><i class="${k}" style="width:${Math.round(x.u * 100)}%"></i></span><b>${fmt(x.u * 100, 0)}%</b><span class="note">${fmt(x.teu, 0)}／${fmt(x.cap, 0)} TEU</span></div>`;
    };
    box.innerHTML = `<div class="smph"><div class="psh"><b>港口詳情</b><button type="button" class="btn" data-x aria-label="關閉港口詳情">關閉 ✕</button></div><div class="smhd"><b>${esc(pn(P.unlo))}</b><span class="tag ${rk[1]}">${esc(rk[0])}</span></div>
      <div class="note">${esc(g.name)}</div>
      <div class="smkps">${kp('空櫃', fmt(P.teu, 0) + ' TEU', fmt(P.boxes, 0) + ' 個')}${kp('場站', P.yards.length + ' 個', P.stale ? P.stale + ' 個資料過期' : '', P.stale ? 'warn' : '')}
        ${kp('會缺的櫃型', short.length + ' 項', '7 天內低於安全存量', short.length ? 'bad' : 'ok')}${kp('最早缺櫃', first ? '第 ' + first + ' 天' : '—', first ? '' : '7 天內不會缺', first ? 'bad' : 'ok')}</div>
      ${P.yards.map(yd => {
        const cells = cs.filter(c => yd.by[c] != null).map(c => {
          const f = fcBy[yd.y + '|' + c], k = yd.stale ? '' : f && (f.status === '要處理' || f.status === '留意') ? SK[f.status] : '';
          const on = st.fc && st.fc.y === yd.y && st.fc.c === c;
          return `<button type="button" class="smcell ${k}${on ? ' on' : ''}" data-cell="${yd.y}|${c}" aria-pressed="${on}" title="${esc(C.combos[c][0] + ' ' + C.combos[c][1] + ' 呎' + (f && !yd.stale ? '：' + f.status + (f.first ? '，第 ' + f.first + ' 天低於安全存量' : '') : '') + '；點一下看缺櫃預估')}">${esc(C.combos[c][0])} ${C.combos[c][1]}<b>${fmt(yd.by[c], 0)}</b></button>`;
        }).join('');
        const here = st.fc && st.fc.y === yd.y;
        return `<div class="smyd"><div class="smyh"><b>${esc(yd.yard)}</b>${yd.stale ? '<span class="tag warn">資料過期</span>' : ''}<span class="note">${fmt(yd.boxes, 0)} 個</span></div>${bar(ut[yd.y])}
          <div class="smcells">${cells}</div>${here ? FCBOX : ''}</div>`;
      }).join('')}
      <div class="note">點櫃型格看該場站該櫃型的 7 天缺櫃預估。紅底＝7 天內會缺、黃底＝可能會缺；資料過期的場站不標色。使用率 80% 以上黃、95% 以上紅。</div></div>`;
    box.querySelector('[data-x]').onclick = () => pick(null);
    // 點櫃型格：只換選中狀態、把預估區塊移到該場站底下，下一格畫面再畫圖（先讓使用者看到選中變化），不重建整個詳情
    const drawFc = () => {
      const fch = box.querySelector('[data-fch]');
      if (fch && st.fc && U.cargoFcChart) U.cargoFcChart(fch, box.querySelector('[data-fsum]'), st.fc.y, st.fc.c);
      const go = box.querySelector('[data-fcgo]'); if (go) go.onclick = () => { U.STATE.view.cgtab = 'M12-c2'; U.go('M12', null, 'M12-c2'); };   // 跳到「場站與缺櫃」的缺櫃預估頁籤（已選好同一組）
      if (st.fc) {                                                     // 「場站與缺櫃 › 缺櫃預估」跟著選同一個場站與櫃型（切過去時用這組）
        U.STATE.view.cargo = Object.assign(U.STATE.view.cargo || { f: 'attn' }, { y: st.fc.y, c: st.fc.c });
        if (U.cargoFcSync) U.cargoFcSync(st.fc.y, st.fc.c);
      }
    };
    box.querySelectorAll('[data-cell]').forEach(b2 => (b2.onclick = () => {
      const [y, c] = b2.dataset.cell.split('|').map(Number); st.fc = { y, c };
      box.querySelectorAll('[data-cell]').forEach(x => { const on = x === b2; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      const yd = b2.closest('.smyd'); let fc = box.querySelector('.smfc');
      if (!fc) { yd.insertAdjacentHTML('beforeend', FCBOX); fc = yd.querySelector('.smfc'); } else if (fc.parentNode !== yd) yd.appendChild(fc);
      requestAnimationFrame(() => setTimeout(drawFc, 0));
    }));
    drawFc();
  }

  // ---------------- 區塊 M12-c0（取代原本的表格；櫃型切換、港口明細、地圖／表格切換見後續）
  const V = () => {                                                    // 網址可帶 sm=櫃型、smp=港口、sml=util（圖層）、smo=layer|short（展開面板）、smt=1（表格），開啟時直接選好
    if (!STATE.view.stockmap) { const q = new URLSearchParams(location.hash.slice(1)), h = q.get('sm'); STATE.view.stockmap = { g: GROUPS.some(x => x.id === h) ? h : 'all', sel: q.get('smp') || null, mode: q.get('smv') === 'table' ? 'table' : 'map', layer: q.get('sml') === 'util' ? 'util' : 'risk', open: ['layer', 'short'].includes(q.get('smo')) ? q.get('smo') : null, tbl: q.get('smt') === '1' }; }
    return STATE.view.stockmap;
  };
  const CC = () => [...new Set(C.yards.map(y => y[1]))];                // 有場站的港口
  const tableView = U.getRenderer && U.getRenderer('M12-c0');          // 原本的空櫃存量明細表格（blocks_cargo.js），當作「表格」檢視
  // 版型參考「營運總控台」：地圖佔滿卡片寬度、高度接近整個視窗；左上浮動按鈕、左下圖例；點港口後右側全高港口詳情（窄螢幕改到地圖下方）
  U.reg('M12-c0', el => {
    if (!CG.orgOk()) return U.emptyChart(el, '此組織沒有貨務資料（只有「模擬貨櫃公司」有）。請在上方組織選「模擬貨櫃公司」或「全部組織」。');
    clearAgg();
    const st = V(); let g = GROUPS.find(x => x.id === st.g) || GROUPS[0];
    el.classList.add('auto'); el.style.maxHeight = 'none';
    if (st.mode === 'table' && tableView) {                           // 表格：原本的明細（所有場站、所有櫃型）
      el.innerHTML = `<div class="toolbar"><button type="button" class="btn" data-back>← 回到地圖</button><span class="note">所有場站、所有櫃型的最新空櫃個數；地圖上的港口數字＝同港各場站的合計</span></div><div data-tbl></div>`;
      el.querySelector('[data-back]').onclick = () => { st.mode = 'map'; U.bus.emit(); };
      tableView(el.querySelector('[data-tbl]'));
      return;
    }
    let P = agg(g.id); const cnt = r => P.filter(p => p.risk === r).length, open = st.open || null;
    if (st.leg && st.rsk) st.rsk = false;
    const sumOf = () => `<b>${esc(g.name)}</b>：${P.length} 個港口、${fmt(P.reduce((a, p) => a + p.boxes, 0), 0)} 個空櫃（${fmt(P.reduce((a, p) => a + p.teu, 0), 0)} TEU）；` +
      `要處理 <b class="bad">${cnt('要處理')}</b> 港、留意 <b class="warn">${cnt('留意')}</b> 港、資料過期 ${cnt('過期')} 港${g.codes && g.codes.some(c => ['RQ', 'FO', 'FC'].includes(c)) ? '（RQ、FO、FC 的定義待客戶確認）' : ''}`;
    let shortRows = shortList(g.id), nShort = shortRows.length, layer = st.layer || 'risk';
    const cntOf = () => `顯示 ${P.filter(p => p.ll && (!st.only || isHot(p, layer))).length}／${CC().length} 港${layer === 'util' ? '・顏色＝場站使用率' : ''}`;
    const riskBody = R => `<b>風險判讀</b><div>${esc(R.summary)}</div>${(R.items || []).slice(0, 6).map(x => `<div class="note">・${esc(x.text)}</div>`).join('')}`;
    const RS = U.risk && U.risk.evaluate ? U.risk.evaluate('M12-c0') : null, LVx = RS && U.LV ? U.LV[RS.level] : null;   // 滿版時卡片下緣的判讀列被隱藏，改成左下「判讀」按鈕
    el.innerHTML = `
      <div class="smstage${st.sel ? ' sheetopen' : ''}">
        <div class="smbox" data-smap></div>
        <div class="smfloat smtl">
          <button type="button" class="cmdtab${open === 'layer' ? ' on' : ''}" data-open="layer" aria-expanded="${open === 'layer'}">櫃型與圖層 ▾</button>
          <button type="button" class="cmdtab${open === 'short' ? ' on' : ''}" data-open="short" aria-expanded="${open === 'short'}">缺櫃清單 <b>${nShort}</b></button>
          <button type="button" class="cmdtab" data-table>表格</button>
          <span class="smsumchip"><span data-sum>${sumOf()}</span><span data-tilemsg></span></span>
          <div class="smpop smfade${open ? ' show' : ''}" data-pop></div>
        </div>
        <div class="smfloat smbl"><button type="button" class="cmdtab${st.leg ? ' on' : ''}" data-leg aria-expanded="${!!st.leg}">圖例 ${st.leg ? '▾' : '▴'}</button>
          ${LVx ? `<button type="button" class="cmdtab${st.rsk ? ' on' : ''}" data-rsk aria-expanded="${!!st.rsk}"><span class="tag ${LVx.k}">${esc(LVx.t)}</span> 判讀 ${st.rsk ? '▾' : '▴'}</button>` : ''}
          <span class="cmdtab smcnt">${cntOf()}</span><div class="smlegbox smfade${st.leg ? ' show' : ''}" data-legbox>${legend(g, layer)}</div>${RS ? `<div class="smlegbox smrisk smfade${st.rsk ? ' show' : ''}" data-rskbox>${riskBody(RS)}</div>` : ''}</div>
        <aside class="smsheet${st.sel ? ' open' : ''}" data-smp aria-label="港口詳情" aria-hidden="${!st.sel}"></aside>
        <div class="smtbl smfade${st.tbl ? ' show' : ''}" role="dialog" aria-label="空櫃存量明細表格" data-tblbox><div class="psh"><b>空櫃存量明細（所有場站、所有櫃型）</b><button type="button" class="btn" data-tx aria-label="關閉表格">關閉 ✕</button></div><div class="note" style="margin:.2rem 0 .3rem">地圖上的港口數字＝同港各場站的合計</div><div data-tbl></div></div>
      </div>`;
    const q = s2 => el.querySelector(s2), pop = q('[data-pop]'), stage = q('.smstage'), box = q('[data-smp]');
    // 浮動面板：櫃型與圖層（按下就生效，屬篩選類）、缺櫃清單（點一列＝選該港並打開該場站櫃型的預估）
    const shortHtml = () => `<div class="smsl"><div class="note">${esc(g.name)}：7 天內會低於安全存量的場站與櫃型，依最早缺櫃日排序；點一列看該港詳情與預估。</div>${shortRows.length ? shortRows.map(r =>
        `<button type="button" class="smpick" data-sr="${r.y}|${r.c}"><span class="tag bad">第 ${r.first} 天</span><b>${esc(r.yard)}</b> ${esc(r.ct)} ${r.sz} 呎<span class="note">${esc(pn(C.yards[r.y][1]))}・${r.gap >= 0.5 ? '缺 ' + fmt(r.gap, 0) + ' 個' : '缺不到 1 個'}</span></button>`).join('') : '<div class="note">沒有會缺的項目。</div>'}</div>`;
    // 缺櫃清單：寬螢幕從左側滑入、取代左側選單（同「營運總控台 › 港口運務板」：nav#nav[data-mode]、.layout.navwide、.cmdp.enter）；窄螢幕仍用下拉面板
    const wide = () => matchMedia('(min-width:60.01rem)').matches;
    const bindShort = root => root.querySelectorAll('[data-sr]').forEach(b2 => (b2.onclick = () => { const [y, c] = b2.dataset.sr.split('|').map(Number); st.fc = { y, c };
      if (!wide()) { st.open = null; pop.classList.remove('show'); syncTabs(); }
      root.querySelectorAll('[data-sr]').forEach(x => x.classList.toggle('on', x === b2)); pick(C.yards[y][1]); }));
    const leftShort = on => {
      const nav = document.getElementById('nav'), lay = document.querySelector('.layout');
      if (!nav || !lay) return;
      let lp = document.getElementById('smshortp');
      if (on) {
        if (!lp) { lp = document.createElement('section'); lp.id = 'smshortp'; lp.className = 'blk cmdp'; nav.appendChild(lp); }
        lp.innerHTML = `<div class="psh"><b>缺櫃清單 <span class="tag bad">${nShort}</span></b><button type="button" class="btn" data-back aria-label="關閉缺櫃清單">關閉 ✕</button></div>${shortHtml()}`;   // 關閉按鈕與港口詳情統一（營運總控台的 .psh 標題列）
        lp.querySelector('[data-back]').onclick = () => { st.open = null; leftShort(false); syncTabs(); };
        bindShort(lp);
        const was = nav.dataset.mode === 'smshort';
        nav.dataset.mode = 'smshort'; lay.classList.add('navwide');
        if (!was) { lp.classList.remove('enter'); void lp.offsetWidth; lp.classList.add('enter'); setTimeout(() => lp.classList.remove('enter'), 400); }
      } else if (nav.dataset.mode === 'smshort') { delete nav.dataset.mode; lay.classList.remove('navwide'); }
      else return;
      [0, 160, 340].forEach(t => setTimeout(() => { if (M) U.mapInv(M.map); }, t));   // 左欄寬度有動畫，動畫中與結束後各重算一次（同港口運務板）
    };
    const fillPop = () => {
      const open = st.open; pop.dataset.kind = open || '';                 // 面板寬度依內容種類固定（app.css）
      if (open === 'layer') pop.innerHTML = `<div class="mgrp"><b>櫃型</b><span class="seg smgrid" role="group" aria-label="櫃型">${GROUPS.map(x => `<button type="button" data-g="${x.id}" aria-pressed="${x.id === g.id}">${esc(x.name)}</button>`).join('')}</span></div>
        <div class="mgrp"><b>圓的顏色</b><label class="fld"><input type="radio" name="smly" data-ly="risk"${layer === 'risk' ? ' checked' : ''}> 缺櫃風險（未來 7 天）</label><label class="fld"><input type="radio" name="smly" data-ly="util"${layer === 'util' ? ' checked' : ''}> 場站使用率（該港最滿的場站）</label></div>
        <div class="mgrp"><label class="fld"><input type="checkbox" data-only${st.only ? ' checked' : ''}> 只看${layer === 'util' ? '使用率 95% 以上' : '要處理'}的港口</label></div>`;
      else if (open === 'short') pop.innerHTML = shortHtml();
      if (open) { pop.insertAdjacentHTML('afterbegin', `<div class="psh smpoph"><b>${open === 'layer' ? '櫃型與圖層' : '缺櫃清單 <span class="tag bad">' + nShort + '</span>'}</b><button type="button" class="btn" data-popx aria-label="關閉">關閉 ✕</button></div>`);   // 窄螢幕（底部升起）才顯示的標題列，與其他面板的關閉按鈕統一
        pop.querySelector('[data-popx]').onclick = () => { st.open = null; showOpen(); }; }
      pop.querySelectorAll('[data-g]').forEach(b2 => (b2.onclick = () => { if (st.g !== b2.dataset.g) { st.g = b2.dataset.g; apply(); } }));     // 切換：就地更新（apply），不重畫頁面、不重建地圖
      pop.querySelectorAll('[data-ly]').forEach(b2 => (b2.onchange = () => { st.layer = b2.dataset.ly; apply(); }));
      const oc = pop.querySelector('[data-only]'); if (oc) oc.onchange = () => { st.only = oc.checked; apply(); };
      bindShort(pop);
    };
    const syncTabs = () => el.querySelectorAll('[data-open]').forEach(b2 => { const on = st.open === b2.dataset.open; b2.classList.toggle('on', on); b2.setAttribute('aria-expanded', on); });
    if (open && !(open === 'short' && wide())) fillPop();
    if (open === 'short' && wide()) { pop.classList.remove('show'); setTimeout(() => leftShort(true), 0); }   // 營運總控台的 U.cmdAfter 每次重畫後會清掉左欄狀態，所以在它之後再套用
    else { const old = document.getElementById('smshortp'); if (old) old.remove(); }
    // 開關面板：就地顯示／隱藏（淡入見 app.css 的 .smfade），不重畫頁面、不重建地圖
    const showOpen = () => {                                           // 依 st.open 顯示：櫃型與圖層＝下拉面板；缺櫃清單＝寬螢幕左側滑入、窄螢幕下拉
      const left = st.open === 'short' && wide();
      if (st.open && !left) fillPop();
      pop.classList.toggle('show', !!st.open && !left);
      leftShort(left);
      syncTabs();
    };
    el.querySelectorAll('[data-open]').forEach(b2 => (b2.onclick = () => { st.open = st.open === b2.dataset.open ? null : b2.dataset.open; showOpen(); }));
    const tblBox = q('[data-tblbox]'), showTbl = on => { st.tbl = on; if (on && tableView && !tblBox.dataset.done) { tableView(q('[data-tbl]')); tblBox.dataset.done = '1'; } tblBox.classList.toggle('show', on); };
    q('[data-table]').onclick = () => { st.open = null; pop.classList.remove('show'); syncTabs(); showTbl(true); };
    q('[data-tx]').onclick = () => showTbl(false);
    if (st.tbl) showTbl(true);
    // 左下圖例與判讀：一次只開一個（兩個都懸浮在按鈕上方）
    const legB = q('[data-leg]'), rskB = q('[data-rsk]'), legBox = q('[data-legbox]'), rskBox = q('[data-rskbox]');
    const syncBL = () => { legBox.classList.toggle('show', !!st.leg); legB.classList.toggle('on', !!st.leg); legB.setAttribute('aria-expanded', !!st.leg); legB.lastChild.textContent = '圖例 ' + (st.leg ? '▾' : '▴');
      if (rskB && rskBox) { rskBox.classList.toggle('show', !!st.rsk); rskB.classList.toggle('on', !!st.rsk); rskB.setAttribute('aria-expanded', !!st.rsk); rskB.lastChild.textContent = ' 判讀 ' + (st.rsk ? '▾' : '▴'); } };
    legB.onclick = () => { st.leg = !st.leg; if (st.leg) st.rsk = false; syncBL(); };
    if (rskB) rskB.onclick = () => { st.rsk = !st.rsk; if (st.rsk) st.leg = false; syncBL(); };                // 圖例預設收合（同營運總控台）
    let M = null;
    const pick = u => {                                                // 選港口：只更新詳情與外框，不重畫地圖（保留縮放位置）
      st.sel = u; if (M) M.setSel(u);
      box.classList.toggle('open', !!u); box.setAttribute('aria-hidden', !u); stage.classList.toggle('sheetopen', !!u);   // 詳情從右邊滑入／滑出（app.css 的 transition）
      if (M && M.map) setTimeout(() => { U.mapInv(M.map); if (u) reveal(u, true); }, 0);
      if (u) panel(box, P, g, st, pick);
    };
    // 選中的港口移到「詳情左邊看得到的區域」中央，不被詳情蓋住（窄螢幕詳情在下方，不需要）
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveal = (u, anim) => {                                      // anim：點選時與詳情滑入同步平移 0.25 秒；剛打開頁面時直接定位
      const p = P.find(x => x.unlo === u); if (!p || !p.ll || !M || !M.map) return;
      const mp = M.map, W = mp.getSize().x, sw = !box.classList.contains('open') || getComputedStyle(box).position !== 'absolute' ? 0 : box.offsetWidth;
      const pt = mp.latLngToContainerPoint(p.ll), want = L.point((W - sw) / 2, mp.getSize().y / 2);
      if (pt.x > W - sw - 30 || pt.x < 30) mp.panBy(pt.subtract(want), anim && !calm() ? { animate: true, duration: 0.25, easeLinearity: 0.2 } : { animate: false });
    };
    M = draw(q('[data-smap]'), g.id, { sel: st.sel, layer, only: st.only, onPick: pick, onTileError: () => (q('[data-tilemsg]').textContent = '　底圖載入失敗（可能沒有網路）；泡泡與數字仍可使用。') });
    if (st.sel) { panel(box, P, g, st, pick); setTimeout(() => reveal(st.sel), 0); }
    // 就地更新：依目前的櫃型、圖層、「只看要處理」重算並更新泡泡、總覽、缺櫃清單數字、港口數、圖例、判讀、已開的面板與詳情
    function apply() {
      g = GROUPS.find(x => x.id === st.g) || GROUPS[0]; layer = st.layer || 'risk'; P = agg(g.id); shortRows = shortList(g.id); nShort = shortRows.length;
      q('[data-sum]').innerHTML = sumOf();
      q('[data-open="short"] b').textContent = nShort;
      q('.smcnt').textContent = cntOf();
      legBox.innerHTML = legend(g, layer);
      if (st.open === 'short' && wide()) leftShort(true); else if (st.open) fillPop();
      if (M && M.paint) { M.paint(g.id, layer, st.only); M.setSel(st.sel); }
      // 判讀文字（約 20 毫秒）等泡泡畫完的下一個空檔再更新，不擋住這一格畫面
      if (rskB && rskBox && U.risk) setTimeout(() => { const R = U.risk.evaluate('M12-c0'), lv = U.LV[R.level]; rskB.firstElementChild.className = 'tag ' + lv.k; rskB.firstElementChild.textContent = lv.t; rskBox.innerHTML = riskBody(R); }, 60);
      if (st.sel) { if (P.some(p => p.unlo === st.sel)) panel(box, P, g, st, pick); else pick(null); }
    }
  });
})();
