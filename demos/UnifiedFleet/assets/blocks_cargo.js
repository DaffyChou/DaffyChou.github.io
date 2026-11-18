/* M12 貨務（貨櫃輪）：空櫃存量明細、場站使用率、缺櫃預估 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C;
  const { COL, fmt, esc, mkChart } = U;
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const pn = u => (U.ports ? U.ports(u) : u);
  const noOrg = el => U.emptyChart(el, '此組織沒有貨務資料（只有「模擬貨櫃公司」有）。請在上方組織選「模擬貨櫃公司」或「全部組織」。');

  // ------------------------------------------------------------ M12-c0 空櫃存量明細
  U.reg('M12-c0', el => {
    if (!CG.orgOk()) return noOrg(el);
    const ut = CG.util();
    const rows = ut.map(x => {
      const r = { yard: x.yard, port: pn(x.unlo), stale: x.stale, last: x.last, u: x.u, cap: x.cap, boxes: 0, teu: x.teu };
      C.combos.forEach((cb, c) => { const l = CG.latest(x.y, c); r['c' + c] = l ? l.qty : null; if (l) r.boxes += l.qty; });
      return r;
    });
    const cols = [{ k: 'yard', t: '場站', h: r => esc(r.yard) + '　<span class="note">' + esc(r.port) + '</span>' + (r.stale ? ' ' + tag('資料過期', 'warn') : '') }]
      .concat(C.combos.map((cb, c) => ({ k: 'c' + c, t: cb[0] + ' ' + cb[1], n: true, d: 0 })))
      .concat([{ k: 'boxes', t: '合計（個）', n: true, d: 0 }, { k: 'teu', t: '合計（TEU）', n: true, d: 0 },
        { k: 'u', t: '使用率', n: true, h: r => (r.cap == null ? tag('N/A', 'no') : r.u > 1 ? tag('資料異常', 'bad') : fmt(r.u * 100, 0) + '%') }]);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = '<div class="note" style="margin-bottom:.3rem">數字是各櫃型與尺寸的最新空櫃個數。欄名「HQ 40」＝40 呎高櫃。標示「資料過期」的場站數字僅供參考。</div><div data-t></div>';
    U.table(el.querySelector('[data-t]'), { rows, cols, sort: ['yard', 1], limit: 40 });
  });

  // ------------------------------------------------------------ 「場站與缺櫃」頁的頁籤（cargo-board-fullbleed）：兩個區塊同頁時，上方一排頁籤，一次只顯示一個
  // 回傳這個區塊要不要畫（被藏起來的不畫，切換時整頁重繪）；網址可帶 cgt=util|fc 直接開到某個頁籤
  const CGT = [['M12-c1', '場站使用率', 'util'], ['M12-c2', '缺櫃預估（未來 7 天）', 'fc']];
  function cargoTab(bid) {
    const secs = CGT.map(t => document.getElementById('blk-' + t[0]));
    if (secs.some(x => !x)) return true;                               // 不在同一頁（或在測試環境）：照常畫
    if (U._cgPre === bid) return true;                                 // 預先在畫面外畫另一個頁籤（見下方 prerender）
    const V = U.STATE.view;
    if (!V.cgtab) { const h = new URLSearchParams(location.hash.slice(1)).get('cgt'), m = CGT.find(t => t[2] === h); V.cgtab = m ? m[0] : 'M12-c1'; }
    let bar = document.getElementById('cgtabs');
    const grid = secs[0].closest('.grid') || secs[0].parentNode;          // 頁籤放在版面網格外面的正上方（同運務管理），不受網格欄寬影響
    if (!bar || bar.nextElementSibling !== grid) {
      if (bar) bar.remove();
      bar = document.createElement('div'); bar.id = 'cgtabs'; bar.className = 'cgtabs';
      bar.className = 'tabs cgtabs'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', '場站與缺櫃');   // 與「運務管理」頁籤同樣式（app.js 的 .tabs）
      bar.innerHTML = CGT.map(t => `<button type="button" role="tab" data-cgt="${t[0]}">${esc(t[1])}</button>`).join('');
      grid.parentNode.insertBefore(bar, grid);
      bar.querySelectorAll('[data-cgt]').forEach(b => (b.onclick = () => { if (V.cgtab !== b.dataset.cgt) { V.cgtab = b.dataset.cgt; switchTab(); } }));   // 只切顯示，不重畫頁面
    }
    bar.querySelectorAll('[data-cgt]').forEach(b => { const on = b.dataset.cgt === V.cgtab; if (on) b.setAttribute('aria-selected', 'true'); else b.removeAttribute('aria-selected'); });
    CGT.forEach((t, i) => (secs[i].style.display = t[0] !== V.cgtab ? 'none' : ''));   // 卡片的版面樣式會蓋過 hidden，所以直接設定
    if (bid === V.cgtab) { secs[CGT.findIndex(t => t[0] === bid)].dataset.cgdone = '1'; setTimeout(prerender, 300); }   // 已畫過：之後切回來直接顯示；另一個頁籤趁空檔先畫
    return bid === V.cgtab;
  }
  // 和整頁重畫時一樣，把區塊內的篩選列移到標題列右側（app.js 在畫完後做這一步，這裡自己畫的要自己搬）
  const moveTools = sec => { const tl = sec.querySelector('[data-chart] .toolbar'), dst = sec.querySelector('[data-tools]'); if (tl && dst) { dst.innerHTML = ''; dst.appendChild(tl); } };
  // 預先畫另一個頁籤：暫時放到畫面外、寬度和目前顯示的卡片相同（藏起來時寬度為 0，直接畫會畫壞），畫完再藏回去；第一次切換就能直接顯示
  function prerender() {
    const V = U.STATE.view, cur = document.getElementById('blk-' + V.cgtab);
    CGT.forEach(t => {
      const sec = document.getElementById('blk-' + t[0]);
      if (!sec || !cur || sec === cur || sec.dataset.cgdone || sec.style.display !== 'none') return;
      const fn = U.getRenderer(t[0]), ch = sec.querySelector('[data-chart]'); if (!fn || !ch) return;
      Object.assign(sec.style, { display: '', position: 'absolute', left: '-100000px', top: '0', width: cur.getBoundingClientRect().width + 'px' });
      U._cgPre = t[0];
      try { fn(ch, { bid: t[0], vids: U.vesselsFor(t[0]), mi: U.STATE.mi, type: U.STATE.type }); sec.dataset.cgdone = '1'; } catch (e) { console.error(t[0], e); }
      U._cgPre = null;
      moveTools(sec);
      Object.assign(sec.style, { position: '', left: '', top: '', width: '', display: V.cgtab === t[0] ? '' : 'none' });
    });
  }
  // 切頁籤：顯示目標卡片並淡入；第一次切到才畫（藏起來時寬度為 0，先畫會畫壞）
  function switchTab() {
    const V = U.STATE.view, bar = document.getElementById('cgtabs');
    CGT.forEach(t => {
      const sec = document.getElementById('blk-' + t[0]); if (!sec) return;
      const on = t[0] === V.cgtab;
      sec.style.display = on ? '' : 'none';
      if (!on) return;
      sec.classList.remove('cgfade'); void sec.offsetWidth; sec.classList.add('cgfade');
      if (!sec.dataset.cgdone) {
        const fn = U.getRenderer(t[0]), ch = sec.querySelector('[data-chart]');
        if (fn && ch) { try { fn(ch, { bid: t[0], vids: U.vesselsFor(t[0]), mi: U.STATE.mi, type: U.STATE.type }); } catch (e) { console.error(t[0], e); } moveTools(sec); sec.dataset.cgdone = '1'; }
      } else sec.querySelectorAll('[_echarts_instance_]').forEach(x => { const c = window.echarts && echarts.getInstanceByDom(x); if (c) c.resize(); });   // 視窗大小在藏起來時可能變過
    });
    if (bar) bar.querySelectorAll('[data-cgt]').forEach(b => { if (b.dataset.cgt === V.cgtab) b.setAttribute('aria-selected', 'true'); else b.removeAttribute('aria-selected'); });
    if (U.fitSolo) U.fitSolo();                                        // 換了顯示的卡片：重算單卡片高度（solo-card-fit）
  }
  U.cargoTab = cargoTab;

  // ------------------------------------------------------------ M12-c1 場站使用率（全部場站，橫向長條；可依使用率或依港口排序、只看 80% 以上；點長條在空櫃地圖選中該港）
  U.reg('M12-c1', el => {
    if (!cargoTab('M12-c1')) return;
    if (!CG.orgOk()) return noOrg(el);
    const col = COL(), V = U.STATE.view, st = (V.util = V.util || { sort: 'u', hi: false });
    let ut = CG.util().slice();
    const nNA = ut.filter(x => x.cap == null).length, nErr = ut.filter(x => x.u > 1).length, nHi = ut.filter(x => x.u != null && x.u <= 1 && x.u >= 0.8).length;
    if (st.hi) ut = ut.filter(x => x.u != null && x.u >= 0.8);
    ut.sort(st.sort === 'port'
      ? (a, b) => (pn(a.unlo) < pn(b.unlo) ? -1 : pn(a.unlo) > pn(b.unlo) ? 1 : a.yard < b.yard ? -1 : 1)
      : (a, b) => (a.cap == null) - (b.cap == null) || (b.u || 0) - (a.u || 0));
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const sg = (k, v, t) => `<button type="button" data-${k}="${v}" aria-pressed="${st[k === 'so' ? 'sort' : 'hi'] === (k === 'so' ? v : v === '1')}">${t}</button>`;
    el.innerHTML = `<div class="toolbar"><span class="seg" role="group" aria-label="排序">${sg('so', 'u', '依使用率')}${sg('so', 'port', '依港口')}</span>
      <span class="seg" role="group" aria-label="範圍">${sg('hi', '0', '全部 ' + CG.util().length + ' 個場站')}${sg('hi', '1', '只看 80% 以上（' + nHi + '）')}</span>
      <span class="note">沒有容量資料 ${nNA} 個（N/A，排在最後）、資料異常 ${nErr} 個；點長條到「貨務與貨量」的空櫃地圖看該港</span></div>
      <div class="utscroll" data-fill><div data-rb style="height:${Math.max(6, ut.length * 1.45 + 3)}rem"></div></div>`;
    el.querySelectorAll('[data-so]').forEach(b2 => (b2.onclick = () => { st.sort = b2.dataset.so; U.bus.emit(); }));
    el.querySelectorAll('[data-hi]').forEach(b2 => (b2.onclick = () => { st.hi = b2.dataset.hi === '1'; U.bus.emit(); }));
    if (!ut.length) return U.emptyChart(el.querySelector('[data-rb]'), '沒有使用率 80% 以上的場站');
    const data = ut.map(x => {
      const na = x.cap == null, err = x.u > 1, ok = !na && !err && !x.stale;
      return { value: na ? 0 : +(x.u * 100).toFixed(0), x, itemStyle: { color: !ok ? col.no : x.u >= 0.95 ? col.bad : x.u >= 0.8 ? col.warn : col.ok, opacity: ok ? 1 : 0.5 },
        label: { show: true, position: 'right', fontSize: 11, color: col.sub, formatter: na ? 'N/A（沒有容量資料）' : err ? fmt(x.u * 100, 0) + '%（資料異常）' : fmt(x.u * 100, 0) + '%' + (x.stale ? '（過期）' : '') } };
    });
    mkChart(el.querySelector('[data-rb]'), {
      grid: (w => (w < 560 ? { left: 96, right: 70, top: 24, bottom: 10 } : { left: 150, right: 140, top: 24, bottom: 10 }))(el.clientWidth || 800),   // 窄螢幕縮小左右留白，場站名才不會被切掉
      yAxis: { type: 'category', inverse: true, data: ut.map(x => `${x.yard}　${pn(x.unlo)}`), axisLabel: { interval: 0, fontSize: 11 } },
      xAxis: { type: 'value', name: '使用率（%）', min: 0, max: v => Math.max(100, Math.ceil(v.max / 10) * 10), position: 'top' },
      legend: { show: false },
      tooltip: { trigger: 'item', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 },
        formatter: p => { const x = p.data.x; return `${esc(x.yard)}（${esc(pn(x.unlo))}）<br>` + (x.cap == null ? '沒有容量資料，使用率 N/A' : `使用率 ${fmt(x.u * 100, 0)}%<br>空櫃 ${fmt(x.teu, 0)} TEU ÷ 容量 ${fmt(x.cap, 0)} TEU`) + (x.stale ? '<br>資料過期（超過 48 小時沒更新）' : '') + (x.u > 1 ? '<br>超過 100%：容量或存量有一個填錯' : '') + '<br><span style="opacity:.7">點一下到空櫃地圖看這個港口</span>'; } },
      series: [{ type: 'bar', barMaxWidth: 14, data, emphasis: { disabled: true }, cursor: 'pointer',
        markLine: { symbol: 'none', silent: true, data: [{ xAxis: 80, lineStyle: { color: col.warn, type: 'dashed' }, label: { formatter: '80%', color: col.warn } }, { xAxis: 95, lineStyle: { color: col.bad, type: 'dashed' }, label: { formatter: '95%', color: col.bad } }] } }],
    }, p => {                                                          // 點長條：在空櫃地圖（M12-c0）選中這個港口並捲上去
      const x = p && p.data && p.data.x; if (!x) return;
      const sm = (U.STATE.view.stockmap = U.STATE.view.stockmap || { g: 'all', mode: 'map' });
      sm.sel = x.unlo; sm.fc = null; sm.mode = 'map'; sm.tbl = false;
      U.go('M12', null, 'M12-c0');
    });
  });

  // ------------------------------------------------------------ M12-c2 缺櫃預估
  const ORDER = { '要處理': 0, '留意': 1, '資料不足': 2, '正常': 3 };
  const SK = { '要處理': 'bad', '留意': 'warn', '正常': 'ok', '資料不足': 'no' };
  const V = () => (U.STATE.view.cargo = U.STATE.view.cargo || { y: null, c: null, f: 'attn' });

  // 缺櫃預估圖（某場站、某櫃型的未來 7 天）：「場站與缺櫃 › 缺櫃預估」與空櫃地圖的港口詳情共用，兩邊數字一致
  function fcChart(box, sumEl, y, c) {
    const r = CG.one(y, c), col = COL();
    const head = `${C.yards[y][0]} ${C.combos[c][0]} ${C.combos[c][1]} 呎`;
    if (!r.series.length) { sumEl.innerHTML = `<b>${esc(head)}</b>：資料不足，無法預估（${esc(r.reason)}）`; return U.emptyChart(box, '資料不足：' + r.reason); }
    sumEl.innerHTML = `<b>${esc(head)}</b>　目前 ${fmt(r.cur, 0)} 個、安全存量 ${fmt(r.safety, 0)} 個（${esc(r.source.split('；')[0])}）　${tag(r.status, SK[r.status])}${r.first ? '　' + (r.status === '要處理' ? '第 ' + r.first + ' 天缺櫃，缺口 ' + fmt(r.gap, 0) + ' 個' : '第 ' + r.first + ' 天預估下緣低於安全存量') : ''}`;
    const x = ['目前'].concat(r.series.map((_, i) => '第 ' + (i + 1) + ' 天')), est = [r.cur].concat(r.series), low = [r.cur].concat(r.low), up = est.map((v, i) => 2 * v - low[i]), z = v => Math.max(0, v);
    const mk = { symbol: 'none', silent: true, data: [{ yAxis: r.safety, lineStyle: { color: col.bad, type: 'dashed' }, label: { formatter: '安全存量 ' + fmt(r.safety, 0), color: col.bad, position: 'insideEndTop' } }] };
    mkChart(box, {
      grid: { left: 52, right: 28, top: 30, bottom: 30 }, legend: { show: false },
      tooltip: { trigger: 'axis', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 },
        formatter: ps => { const i = ps[0].dataIndex; return `${x[i]}<br>` + (est[i] < 0 ? `預估已用完，不足 ${fmt(-est[i], 0)} 個` : `預估存量 ${fmt(est[i], 0)} 個`) + `<br>預估區間 ${fmt(Math.max(0, low[i]), 0)} 到 ${fmt(Math.max(0, up[i]), 0)} 個（約 80% 信心）`; } },
      xAxis: { type: 'category', data: x, boundaryGap: false }, yAxis: { type: 'value', name: '預估空櫃存量（個，不足時以 0 表示）', min: 0, max: v => Math.ceil(Math.max(v.max, r.safety * 1.2)) },
      series: [{ type: 'line', stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, data: low.map(z), silent: true },
        { type: 'line', stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: col.pal[0], opacity: 0.18 }, data: est.map((v, i) => z(up[i]) - z(low[i])), silent: true },
        { type: 'line', name: '預估存量', data: est.map(z), symbolSize: 6, lineStyle: { width: 2.5, color: col.pal[0] }, itemStyle: { color: col.pal[0] }, markLine: mk }],
    });
  }
  U.cargoFcChart = fcChart;

  U.reg('M12-c2', el => {
    if (!cargoTab('M12-c2')) return;
    if (!CG.orgOk()) return noOrg(el);
    const all = CG.forecastAll(), st = V();
    if (!all.length) return U.emptyChart(el, '沒有空櫃存量資料');
    if (st.y == null || !all.some(r => r.y === st.y && r.c === st.c)) { const f = all.filter(r => r.status === '要處理').sort((a, b) => a.first - b.first)[0] || all[0]; st.y = f.y; st.c = f.c; }
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="toolbar"><label class="fld">場站<select data-y>${C.yards.map((y, i) => `<option value="${i}" ${i === st.y ? 'selected' : ''}>${esc(y[0])}</option>`).join('')}</select></label>
      <label class="fld">櫃型<select data-c>${C.combos.map((c, i) => `<option value="${i}" ${i === st.c ? 'selected' : ''}>${c[0]} ${c[1]} 呎</option>`).join('')}</select></label>
      <button class="btn" data-demo>示範：所選存量改為 0</button><button class="btn" data-reset>還原</button></div>
      <div data-sum class="note" style="margin:.2rem 0"></div><div class="sub2" data-ch></div>
      <div class="toolbar" style="margin-top:.5rem"><label class="fld">列出<select data-f><option value="attn" ${st.f === 'attn' ? 'selected' : ''}>需要關注的（要處理、留意、資料不足）</option><option value="all" ${st.f === 'all' ? 'selected' : ''}>全部</option></select></label><span class="note" data-cnt></span></div>
      <div data-tb></div>`;
    const q = s => el.querySelector(s);

    function drawChart() { fcChart(q('[data-ch]'), q('[data-sum]'), st.y, st.c); }
    function drawTable() {
      let rows = all.slice().sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.first || 99) - (b.first || 99) || (a.yard < b.yard ? -1 : 1));
      if (st.f === 'attn') rows = rows.filter(r => r.status !== '正常');
      const objs = rows.map(r => ({ y: r.y, c: r.c, label: r.yard + ' ' + r.ct + ' ' + r.sz + ' 呎', status: r.status, first: r.first, gap: r.gap, cur: r.cur, safety: r.safety, source: r.series.length ? (r.source.startsWith('客戶設定') ? '客戶設定' : '預設值') + '・' + (r.source.includes('訂艙') ? '訂艙' : '歷史平均') : r.reason }));
      q('[data-cnt]').textContent = `共 ${objs.length} 列（全部 ${all.length} 列）；點一列可在上方圖表查看`;
      U.table(q('[data-tb]'), { rows: objs, limit: 60, onRow: r => { st.y = r.y; st.c = r.c; q('[data-y]').value = r.y; q('[data-c]').value = r.c; drawChart(); },
        cols: [{ k: 'label', t: '場站與櫃型' }, { k: 'status', t: '預估', h: r => tag(r.status, SK[r.status]) }, { k: 'first', t: '最早缺櫃日', n: true, d: 0, h: r => (r.first ? '第 ' + r.first + ' 天' : '—') },
          { k: 'gap', t: '缺口（個）', n: true, d: 0 }, { k: 'cur', t: '目前存量', n: true, d: 0 }, { k: 'safety', t: '安全存量', n: true, d: 0 }, { k: 'source', t: '安全存量與出櫃依據' }], empty: '沒有需要關注的項目' });
    }
    // 和空櫃地圖連動：地圖的港口詳情選了場站與櫃型時呼叫，只重畫這張圖（選單元素先記下，標題列搬移後仍可用）
    const ySel = q('[data-y]'), cSel = q('[data-c]');
    U.cargoFcSync = (y, c) => { if (!all.some(r => r.y === y && r.c === c)) return; st.y = y; st.c = c; if (ySel) ySel.value = y; if (cSel) cSel.value = c; drawChart(); };
    q('[data-y]').onchange = e => { st.y = +e.target.value; drawChart(); };
    q('[data-c]').onchange = e => { st.c = +e.target.value; drawChart(); };
    q('[data-f]').onchange = e => { st.f = e.target.value; drawTable(); };
    q('[data-demo]').onclick = () => { CG.setStock(st.y, st.c, 0); U.bus.emit(); };
    q('[data-reset]').onclick = () => { CG.setStock(st.y, st.c, null); U.bus.emit(); };
    drawChart(); drawTable();
  });
})();
