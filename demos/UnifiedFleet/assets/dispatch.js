/* 運務板（M13-c3）：左邊地圖、右邊依注意程度排序的港口清單；點港口（地圖或清單）看詳情：
   港口小卡、錨地與泊位示意、塞港指數儀表、7 天走勢、前往此港的船。篩選與選中的港口寫進網址（b_ 開頭參數）。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, { esc, fmt, COL, mkChart, STATE } = U;
  const HR = 3600000, ts = s => Date.parse(s + 'Z');
  const LV = { high: ['bad', '要處理'], mid: ['warn', '留意'], low: ['ok', '正常'], nodata: ['no', '資料不足'] };
  const DEF = () => ({ sel: '', lv: '', q: '', svc: '', arr: 0, watch: 0 });
  STATE.bd = DEF();
  const KEYS = { sel: 'b_p', lv: 'b_lv', q: 'b_q', svc: 'b_svc', arr: 'b_arr', watch: 'b_w' };
  U.boardHash = {
    read(h) { const f = DEF(); Object.keys(KEYS).forEach(k => { const v = h.get(KEYS[k]); if (v != null) f[k] = (k === 'arr' || k === 'watch') ? +v : v; }); STATE.bd = f; },
    write(h) { if (STATE.l !== 1 || STATE.tab !== 'opsov') return; const d = DEF(); Object.keys(KEYS).forEach(k => { if (STATE.bd[k] !== d[k]) h.set(KEYS[k], STATE.bd[k]); }); },
  };
  const watchList = () => { try { return JSON.parse(localStorage.getItem('uf_watch_ports') || '[]'); } catch (e) { return []; } };
  const saveWatch = a => { try { localStorage.setItem('uf_watch_ports', JSON.stringify(a)); } catch (e) { } };
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const chip = lv => `<span class="chip lvl ${LV[lv][0]}">${LV[lv][1]}</span>`;
  const hhmm = s => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');
  const dur = h => (h < 0 ? '已逾期' : h < 24 ? Math.floor(h) + ' 小時' : Math.floor(h / 24) + ' 天 ' + Math.floor(h % 24) + ' 小時');

  U.reg('M13-c3', el => {
    if (!CG.orgOk()) return U.emptyChart(el, '此組織沒有運務資料（只有「模擬貨櫃公司」有）。請在上方組織選「模擬貨櫃公司」或「全部組織」。');
    const all = U.portBoard().sort(U.portBoardSort), byU = Object.fromEntries(all.map(b => [b.unlo, b]));
    if (!all.length) return U.emptyChart(el, '沒有港口壅塞資料');
    const st = STATE.bd;
    if (st.sel && !byU[st.sel]) st.sel = '';
    const svcs = [...new Set(all.flatMap(b => b.svc))].sort();
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="board"><div class="bsum" data-bs></div><div class="blist" data-bl></div></div>`;
    const q = s => el.querySelector(s);
    const mp = () => U.cmdMap;                                          // 地圖由營運指揮台（M15-c1）提供
    const sheet = () => document.querySelector('[data-sheet]');

    function filtered() {
      const w = new Set(watchList()), k = st.q.trim().toLowerCase();
      return all.filter(b => (!st.lv || b.level === st.lv) && (!k || b.name.toLowerCase().includes(k)) && (!st.svc || b.svc.includes(st.svc)) && (!st.arr || b.nToward > 0) && (!st.watch || w.has(b.unlo)));
    }
    function drawSummary() {
      const cnt = l => all.filter(b => b.level === l).length;
      q('[data-bs]').innerHTML = ['high', 'mid', 'low', 'nodata'].map(l => `<button class="lvbtn ${LV[l][0]}${st.lv === l ? ' on' : ''}" data-lv="${l}">${{ high: '要處理', mid: '留意', low: '正常', nodata: '不足' }[l]} <b>${cnt(l)}</b></button>`).join('') +
        `<input type="text" data-q placeholder="搜尋港口" value="${esc(st.q)}" aria-label="搜尋港口">
        <label class="fld">航線 <select data-svc><option value="">全部</option>${svcs.map(s => `<option value="${esc(s)}"${st.svc === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="fld"><input type="checkbox" data-arr${st.arr ? ' checked' : ''}> 只看有船要到的港口</label>
        <label class="fld"><input type="checkbox" data-w${st.watch ? ' checked' : ''}> 只看關注的港口</label>
        <button type="button" class="qm pq bsq" aria-expanded="false" title="說明">?</button><div class="pqx note" hidden>港口等級取三項最差者：塞港指數、最長等待、等泊週變化；都沒有資料＝資料不足（不是正常）。</div>`;
      { const bq = q('[data-bs] .bsq'); if (bq) bq.onclick = () => { const x = bq.nextElementSibling; x.hidden = !x.hidden; bq.setAttribute('aria-expanded', x.hidden ? 'false' : 'true'); }; }
      q('[data-bs]').querySelectorAll('[data-lv]').forEach(b => (b.onclick = () => { st.lv = st.lv === b.dataset.lv ? '' : b.dataset.lv; refresh(); }));
      const qi = q('[data-q]'); qi.oninput = () => { st.q = qi.value; const pos = qi.selectionStart; refresh(true); const n = q('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); };
      q('[data-svc]').onchange = e => { st.svc = e.target.value; refresh(); };
      q('[data-arr]').onchange = e => { st.arr = e.target.checked ? 1 : 0; refresh(); };
      q('[data-w]').onchange = e => { st.watch = e.target.checked ? 1 : 0; refresh(); };
    }
    function drawList() {
      const L = filtered(), w = new Set(watchList());
      q('[data-bl]').innerHTML = `<div class="note" style="margin-bottom:.3rem">${L.length} / ${all.length} 個港口（要處理與有船要到的排前面）</div>` +
        (L.length ? L.map(b => `<div class="brow${b.unlo === st.sel ? ' on' : ''}" data-u="${b.unlo}" role="button" tabindex="0"><span class="lampdot ${LV[b.level][0]}"></span><span class="bn"><b>${esc(b.name)}</b><span class="note">${b.cov === 'PORT' ? '全港' : '僅本公司船舶'}</span></span>
          <span class="bi">${b.idx == null ? '<span class="tag no">指數：樣本不足</span>' : '指數 ' + fmt(b.idx, 0)}</span><span class="bi">在錨 ${b.wait}｜到港 ${b.nToward}</span>
          <button class="star${w.has(b.unlo) ? ' on' : ''}" data-star="${b.unlo}" title="${w.has(b.unlo) ? '取消關注' : '加入關注'}" aria-label="關注">${w.has(b.unlo) ? '★' : '☆'}</button></div>`).join('') : '<div class="note">沒有符合條件的港口</div>');
      q('[data-bl]').querySelectorAll('[data-u]').forEach(r => { r.onclick = e => { if (e.target.closest('[data-star]')) return; select(r.dataset.u, true); }; r.onkeydown = e => { if (e.key === 'Enter') select(r.dataset.u, true); }; });
      q('[data-bl]').querySelectorAll('[data-star]').forEach(b => (b.onclick = e => { e.stopPropagation(); const a = watchList(), u = b.dataset.star; saveWatch(a.includes(u) ? a.filter(x => x !== u) : a.concat(u)); drawList(); drawDetail(); if (st.watch) refresh(); }));
    }
    const T = (title, text) => `<div class="bt">${title} <button type="button" class="qm pq" aria-expanded="false" title="說明">?</button></div><div class="pqx note" hidden>${text}</div>`;
    function schematic(b) {
      const net = (b.newA || 0) - (b.newB || 0);
      return `<div class="slot"><div class="sl">錨地（還沒靠上碼頭）<b>${b.wait} 艘</b>${b.tw ? `<span class="note" title="在錨船的 TEU 合計，用來看排隊的規模">合計 ${fmt(b.tw, 0)} TEU</span>` : ''}</div></div>
        <div class="flowa">昨日新進錨 <b>${b.newA ?? '—'}</b> 艘　→　昨日離錨進泊 <b>${b.newB ?? '—'}</b> 艘　${net > 0 ? tag('隊伍變長 +' + net, 'warn') : net < 0 ? tag('隊伍變短 ' + net, 'ok') : tag('持平', 'no')}</div>
        <div class="slot"><div class="sl">泊位（正在裝卸）<b>${b.berthed} 艘</b>${b.tb ? `<span class="note" title="在泊船的 TEU 合計">合計 ${fmt(b.tb, 0)} TEU</span>` : ''}</div></div>
`;
    }
    // 港口詳情：先看重點（建議動作、六個數字），再看走勢、預測、前往此港的船；示意圖與其他資訊收在「更多」
    function drawDetail() {
      const sh = sheet(), stage = el.closest('.grid');
      if (!sh) return;
      const rc = U.routeDetail ? U.routeDetail.active() : '', ttl = sh.querySelector('.psh b');   // 航線詳情（route-detail-panel）：沒選港口、但選了航線時顯示
      if (!st.sel || !byU[st.sel]) {
        if (rc) { if (U.closeDetailDrawers && U._sheetKey !== 'r:' + rc) U.closeDetailDrawers(); U._sheetKey = 'r:' + rc; sh.hidden = false;   // 右側一次只開一種詳情：開航線詳情先收起事件詳情
           if (stage) stage.classList.add('sheetopen'); if (ttl) ttl.textContent = '航線詳情'; U.routeDetail.render(sh.querySelector('[data-bd]'), rc); const y = STATE.view.routeScroll || 0; requestAnimationFrame(() => { sh.scrollTop = y; }); return; }
        U._sheetKey = ''; sh.hidden = true; if (stage) stage.classList.remove('sheetopen'); return;
      }
      if (U.closeDetailDrawers && U._sheetKey !== 'p:' + st.sel) U.closeDetailDrawers(); U._sheetKey = 'p:' + st.sel;   // 換成港口詳情時先收起事件詳情（只在切換時，不在每次重畫）
      sh.hidden = false; if (stage) stage.classList.add('sheetopen'); if (ttl) ttl.textContent = '港口詳情'; sh.scrollTop = 0;
      const b = byU[st.sel], d = sh.querySelector('[data-bd]'), w = watchList().includes(b.unlo), col = COL(), r = b.row;
      const idxC = b.idx == null ? 'no' : b.idx >= 150 ? 'bad' : b.idx >= 120 ? 'warn' : 'ok', chg = b.chg == null ? null : b.chg;
      const kp = (k, v, sub, c) => `<div class="pk"><div class="note">${k}</div><b class="${c || ''}">${v}</b><div class="note">${sub || ''}</div></div>`;
      const svcs = (U.M.services || []).filter(x => x.ports.includes(b.unlo)).map(x => esc(x.code) + '（' + esc(x.name) + '）').join('、') || '—';
      const f = U.portForecast(b.unlo);
      const ownHere = (((window.UI_CARGO || {}).berth || {}).ownTerms || []).filter(t => t[2] === b.unlo).map(t => t[0]);   // 這個港口的自有碼頭
      d.innerHTML = (rc ? `<button type="button" class="btn rback" data-rback>← 回到${esc(U.routeDetail.label(rc))}</button>` : '') + `<div class="pd"><div class="bhead"><h4>${esc(b.name)}</h4>${chip(b.level)}${b.cov === 'PORT' ? tag('全港', 'ok') : tag('僅本公司船舶', 'warn')}${b.eu ? tag('歐盟港口', 'no') : ''}${b.eca ? tag('排放管制區', 'no') : ''}
        <span class="sp"></span><button class="btn" data-w1>${w ? '★ 已關注' : '☆ 加入關注'}</button><button class="btn" data-cargo title="到貨務與貨量分頁看這個港口的空櫃">去看空櫃</button></div>
        <div class="bact"><b>建議動作</b>　${esc(b.action || '資料不足：近 30 天樣本少於 5 艘次，且沒有等待資料；請向港口確認資料來源，暫不給建議')}</div>
        ${T('重點數字', '塞港指數：100＝平常，120 以上留意、150 以上要處理。最長等待：24 小時留意、48 小時要處理。等泊週變化：本週平均等泊對上週。平均停留：近 30 天。前往此港：未來 3 天的本公司船（同一艘船只算一次）。')}<div class="pks">${kp('塞港指數', b.idx == null ? '樣本不足' : fmt(b.idx, 0), '', idxC)}${kp('在錨／在泊', `${b.wait}／${b.berthed} 艘`, `平均等待 ${r.avgWait == null ? '—' : fmt(r.avgWait, 1) + ' 小時'}`)}${kp('最長等待', b.maxWait == null ? '—' : fmt(b.maxWait, 0) + ' 小時', '', b.maxWait >= 48 ? 'bad' : b.maxWait >= 24 ? 'warn' : '')}${kp('等泊週變化', chg == null ? '—' : (chg >= 0 ? '▲ +' : '▼ ') + fmt(chg, 0) + '%', '', chg != null && chg >= 60 ? 'bad' : chg != null && chg >= 30 ? 'warn' : '')}${kp('平均停留', b.avgStay == null ? '—' : fmt(b.avgStay, 0) + ' 小時', '')}${kp('前往此港', `${b.nToward} 艘`, '')}</div>
        <div class="pcols"><div class="bz">${T('過去 7 天等泊走勢', '柱子＝每天進泊的船次（樣本數，淡色＝少於 3 艘次，參考性低）；線＝當天平均等泊小時。')}<div class="gauge" data-t></div><div class="note" data-tn></div></div>
          <div class="bz">${T('未來 7 天壅塞預測（模擬）', '柱高＝預估塞港指數（100＝平常）。黃虛線＝120（留意），紅虛線＝150（要處理）；柱子越過虛線就是那一天可能塞港。「今」＝目前的塞港指數，第 1～7 天是模擬：已經塞的港口，依排隊船數相對今天的比例增減（船到得多就更塞、排隊消化就回落）；低於平常的港口，假設逐日回到平常水準再加上排隊。假設泊位至少 3 個、每船停留時間取近 30 天平均，只計本公司船的到港預報。滑過柱子看每天預計到港與排隊船數。')}${f.ok ? `<div class="pft"><b>${esc(f.text)}</b></div><div class="pfc" data-fc></div>` : `<div class="note">${esc(f.reason || '無')}</div>`}</div>
          <div class="bz">${T('前往此港的船（3 天內）', '點一艘船看單船頁。位置過期＝超過 12 小時沒更新位置，計算 ETA 不可靠。回報晚／早＝回報 ETA 比計算 ETA 晚或早，超過 6 小時標黃。同一艘船 3 天內多次靠港只列最早一次。')}<div data-v></div></div></div>
        ${ownHere.length ? `<div class="bz"><div class="note">這個港口有自有碼頭（${ownHere.map(esc).join('、')}）：<button class="btn" data-berth>看自有碼頭靠泊時程</button></div></div>` : ''}
        <div class="pmore"><div class="bz">${T('錨地與泊位', '錨地＝還沒靠上碼頭、在外面排隊的船；泊位＝正在裝卸的船。自有碼頭各艘船的靠泊、開工、離港時間見側邊選單「碼頭靠泊時程」。合計 TEU＝這些船的 TEU 合計，用來看排隊的規模。最長等待 24 小時留意、48 小時要處理。')}${schematic(b)}</div><div class="bz"><div class="bt">經過的航線</div><div class="note bsvc">${svcs}</div></div>${U.etsHtml && b.eu ? `<div class="bz">${T('歐盟碳排成本（示意）', '碳價為示意價，不是真實價格；繳交比例 2024 年 40%、2025 年 70%、2026 年起 100%；2026 年資料只到 10 月。只有靠歐盟港的船才有成本；金額是該船整年累計，不是這個港口造成的成本。')}<div class="pets">${U.etsHtml(true, b.toward, true)}</div></div>` : ''}</div></div>`;
      { const rb = d.querySelector('[data-rback]'); if (rb) rb.onclick = () => select('', false); }
      d.querySelector('[data-w1]').onclick = () => { const a = watchList(); saveWatch(w ? a.filter(x => x !== b.unlo) : a.concat(b.unlo)); drawList(); drawDetail(); };
      d.querySelector('[data-cargo]').onclick = () => { U.go('M12', null, 'M12-c0'); window.scrollTo(0, 0); };
      { const bb = d.querySelector('[data-berth]'); if (bb) bb.onclick = () => { U.go('M13', null, 'M13-c4'); window.scrollTo(0, 0); }; }   // 碼頭靠泊時程已移到獨立分頁（own-terminal-berth-schedule）
      d.querySelectorAll('.pq').forEach(q => (q.onclick = () => { const x = q.closest('.bt').nextElementSibling; if (x) { x.hidden = !x.hidden; q.setAttribute('aria-expanded', x.hidden ? 'false' : 'true'); } }));
      const fe = d.querySelector('[data-fc]');
      if (fe && f.ok) mkChart(fe, { grid: { left: 34, right: 70, top: 22, bottom: 22 }, tooltip: { trigger: 'axis', confine: true, formatter: p => { const x = f.days[p[0].dataIndex]; return `${x.d === 0 ? '今天（目前值）' : '第 ' + x.d + ' 天（模擬）'}<br>塞港指數 ${x.idx}` + (x.d ? `<br>預計到港 ${x.arr} 艘、排隊約 ${fmt(x.q, 1)} 艘` : ''); } },
        xAxis: { type: 'category', data: f.days.map(x => (x.d === 0 ? '今' : '+' + x.d + ' 天')), axisTick: { show: false } },
        yAxis: { type: 'value', min: 0, max: v => Math.max(180, Math.ceil(v.max / 50) * 50), splitNumber: 3 },
        series: [{ type: 'bar', barMaxWidth: 20, data: f.days.map(x => ({ value: x.idx, itemStyle: { color: x.level === 'high' ? col.bad : x.level === 'mid' ? col.warn : col.ok, opacity: x.d === 0 ? 1 : .75, borderRadius: [3, 3, 0, 0] } })), label: { show: true, position: 'top', fontSize: 11, color: col.sub },
          markLine: { symbol: 'none', silent: true, data: [{ yAxis: 120, lineStyle: { color: col.warn, type: 'dashed' }, label: { formatter: '120 留意', color: col.warn, position: 'end', fontSize: 11 } }, { yAxis: 150, lineStyle: { color: col.bad, type: 'dashed' }, label: { formatter: '150 要處理', color: col.bad, position: 'end', fontSize: 11 } }] } }] });
      const tEl = d.querySelector('[data-t]'), tr = b.trend;
      if (!tr || !tr.days.some(x => x.avg != null)) { U.emptyChart(tEl, '過去 7 天沒有進泊船，無法畫趨勢'); d.querySelector('[data-tn]').textContent = ''; }
      else {
        const x = tr.days.map(z => (z.off === 0 ? '昨日' : z.off + ' 天'));
        mkChart(tEl, { grid: { left: 40, right: 36, top: 26, bottom: 22 }, legend: { show: true, top: 0 }, tooltip: { trigger: 'axis', confine: true },
          xAxis: { type: 'category', data: x }, yAxis: [{ type: 'value', name: '等泊（小時）', min: 0 }, { type: 'value', name: '船次', min: 0, splitLine: { show: false }, minInterval: 1 }],
          series: [{ type: 'bar', name: '進泊船次', yAxisIndex: 1, barMaxWidth: 20, data: tr.days.map(z => ({ value: z.calls, itemStyle: { color: col.pal[5], opacity: z.calls != null && z.calls < 3 ? .3 : .6 } })) },
            { type: 'line', name: '平均等泊', data: tr.days.map(z => (z.avg == null ? null : +z.avg.toFixed(1))), symbolSize: 6, lineStyle: { width: 2.5, color: col.pal[0] }, itemStyle: { color: col.pal[0] } }] });
        d.querySelector('[data-tn]').textContent = b.chg == null ? '本週與上週無法比較（進泊船次太少）。' : `本週 ${fmt(tr.a, 1)} 小時、上週 ${fmt(tr.b, 1)} 小時。`;
      }
      const tw = b.toward.map(a => { const gap = a.etaRep && a.etaCalc ? (ts(a.etaRep) - ts(a.etaCalc)) / HR : null, e = ts(a.etaCalc || a.etaRep), stale = !a.posT || (CG.NOW - ts(a.posT)) / HR > 12;
        return { vid: a.vid, name: a.name, calc: hhmm(a.etaCalc), gap, left: (e - CG.NOW) / HR, stale, n: a.nCalls || 1 }; }).sort((x, y) => x.left - y.left);
      const vEl = d.querySelector('[data-v]');
      vEl.innerHTML = tw.length ? `<div class="tw">${tw.map(r => `<button type="button" class="twr" data-tv="${r.vid}"><span class="twn"><b>${esc(r.name)}${r.n > 1 ? ` <small>（3 天內靠港 ${r.n} 次，列最早一次）</small>` : ''}</b><small>${r.stale ? '位置過期，計算 ETA 不可靠' : '計算 ETA ' + esc(r.calc) + '（UTC）'}</small></span><span class="twm"><b>${dur(r.left)}</b>${r.gap == null ? '' : `<small class="${Math.abs(r.gap) > 6 ? 'warn' : ''}">回報${r.gap >= 0 ? '晚' : '早'} ${fmt(Math.abs(r.gap), 1)} 小時</small>`}${r.stale ? tag('位置過期', 'warn') : ''}</span></button>`).join('')}</div>` : '<div class="note">未來 3 天沒有本公司船要到這個港口。</div>';
      vEl.querySelectorAll('[data-tv]').forEach(x => (x.onclick = () => U.go('M3', +x.dataset.tv)));
    }
    function refresh(keepSearch) {
      if (!keepSearch) drawSummary();
      else { q('[data-bs]').querySelectorAll('[data-lv]').forEach(b => b.classList.toggle('on', st.lv === b.dataset.lv)); }
      const L = filtered(); if (st.sel && !L.some(b => b.unlo === st.sel)) st.sel = '';
      drawList(); drawDetail(); if (mp()) mp().redraw(); sync();
    }
    function select(u, focus) { if (u && U.events && U.events.close) U.events.close(); st.sel = u; drawList(); drawDetail(); if (mp()) { mp().redraw(); if (focus && u) mp().focus(u); } sync(); }
    const sync = () => { if (U.syncHash) U.syncHash(); };
    drawSummary(); drawList();
    U.boardApi = { ports: () => new Set(filtered().map(b => b.unlo)), level: u => (byU[u] ? byU[u].level : 'nodata'), selected: () => st.sel, select, refresh: drawDetail };
    if (mp()) mp().redraw();
    drawDetail();
  });
})();
