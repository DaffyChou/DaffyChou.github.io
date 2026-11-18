/* 單船專屬區塊（M14）：多數是船隊層級圖表的單船版（同一個圖表程式，範圍改為這艘船），
   「前往的港口」另有 5 張圖。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C;
  const { fmt, esc } = U;
  const pn = u => (U.ports ? U.ports(u) : u);
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const SRC = { 'M14-b0': 'M8-b0', 'M14-c0': 'M8-c0', 'M14-b1': 'M8-b1', 'M14-c1': 'M8-c1', 'M14-b2': 'M8-b2', 'M14-c2': 'M8-c2', 'M14-b3': 'M6-b0', 'M14-c3': 'M6-c0',
    'M14-b4': 'M6-b1', 'M14-c4': 'M6-c2', 'M14-c5': 'M6-c3', 'M14-b5': 'M4-b2', 'M14-c6': 'M4-c3', 'M14-c7': 'M5-c2', 'M14-c8': 'M5-c1',
    'M14-b8': 'M8-b3', 'M14-c17': 'M8-c3', 'M14-b9': 'M8-b4', 'M14-c18': 'M8-c4' };
  Object.entries(SRC).forEach(([n, s]) => { const f = U.getRenderer(s); if (f) U.reg(n, f); });
  Object.keys(U.RK.blocks).filter(b => U.RK.blocks[b].mod === 'M14').forEach(b => U.SINGLE.add(b));

  const head = (a, c) => `<div class="note" style="margin-bottom:.4rem">這艘船（${esc(U.vname(c.vids[0]))}）${a.later ? U.sv.ordN(a.k) : '下一個靠港'}：<b>${esc(pn(a.unlo))}</b>${a.term ? '（' + esc(a.term) + '）' : ''}，預計 ${esc(String(a.etaCalc || a.etaRep || '—').replace('T', ' ').slice(0, 16))}（UTC，計算 ETA）。</div>`;
  const tgt = vid => (U.sv && U.sv.cur ? U.sv.cur(vid) : U.nextArrival(vid));   // 前往港口與貨櫃：目前選的港口（預設下一港）
  const none = el => U.emptyChart(el, '這艘船沒有到港預報，無法判斷前往的港口。');
  const orgChk = el => { if (!CG.orgOk()) { U.emptyChart(el, '此組織沒有貨務與運務資料（只有「模擬貨櫃公司」有）。'); return false; } return true; };
  const prep = (el, a, c, chart) => { el.classList.add('auto'); el.style.maxHeight = 'none'; el.innerHTML = head(a, c) + (chart ? '<div data-c style="height:16rem"></div>' : '<div data-t></div>'); return el.querySelector(chart ? '[data-c]' : '[data-t]'); };

  // M14-c9 空櫃存量：已併入 M14-c23（這艘船在這港的卸櫃與這港的空櫃，single_voyage.js）

  U.reg('M14-c10', (el, c) => {
    if (!orgChk(el)) return; const a = tgt(c.vids[0]); if (!a) return none(el);
    const rows = CG.cong().filter(r => r.unlo === a.unlo && r.term == null && r.off === 0).map(r => ({ cov: r.cov === 'PORT' ? '全港' : '僅本公司船舶', idx: r.n >= 5 ? r.idx : null, wait: r.wait, berthed: r.berthed, avg: r.avgWait, max: r.maxWait }));
    const box = prep(el, a, c);
    if (!rows.length) return U.emptyChart(box, pn(a.unlo) + ' 沒有壅塞資料');
    U.table(box, { rows, cols: [{ k: 'cov', t: '資料範圍' }, { k: 'idx', t: '塞港指數', n: true, d: 0, h: r => (r.idx == null ? tag('樣本不足', 'no') : fmt(r.idx, 0)) },
      { k: 'wait', t: '在錨船數', n: true, d: 0 }, { k: 'berthed', t: '在泊船數', n: true, d: 0 }, { k: 'avg', t: '平均等待 小時', n: true, d: 1 }, { k: 'max', t: '最長等待 小時', n: true, d: 1 }] });
  });

  // 等泊趨勢：近 7 天（每天）與每月切換；M14-c12（壅塞等待趨勢・月）已併進來
  U.reg('M14-c11', (el, c) => {
    if (!orgChk(el)) return; const a = tgt(c.vids[0]); if (!a) return none(el);
    const V = (U.STATE.view.svWait = U.STATE.view.svWait || { m: 'd' }), box = prep(el, a, c, true);
    box.insertAdjacentHTML('beforebegin', `<div class="toolbar" style="margin:.1rem 0 .3rem"><span class="seg" role="group" aria-label="看近 7 天或每月"><button type="button" data-wm="d" aria-pressed="${V.m === 'd'}">近 7 天</button><button type="button" data-wm="m" aria-pressed="${V.m === 'm'}">每月</button></span><span class="note">${V.m === 'd' ? '每天進泊船的平均等泊（小時）' : '本公司船在該港每月的平均等待（小時），長期參考'}</span></div>`);
    { const tb = el.querySelector('.toolbar'), tools = el.closest('.blk') && el.closest('.blk').querySelector('[data-tools]');   // 切換列放卡片標題列；重畫時取代舊的，不會出現兩份
      if (tb && tools) { tools.querySelectorAll('.toolbar').forEach(x => x.remove()); tools.appendChild(tb); }
      (tools || el).querySelectorAll('[data-wm]').forEach(b => (b.onclick = () => { V.m = b.dataset.wm; U.getRenderer('M14-c11')(el, c); })); }
    if (V.m === 'm') { const s = U.portMonthly(a.unlo, U.STATE.type); if (!s.some(v => v != null)) return U.emptyChart(box, pn(a.unlo) + ' 沒有每月等待資料'); return U.lineChart(box, { yName: '小時', series: [{ name: pn(a.unlo) + ' 平均等待', data: s.map(v => (v == null ? null : +v.toFixed(2))) }] }); }
    // 只畫一條：有全港資料就只畫全港（真實壅塞）；沒有才用本公司船舶（樣本少）。沒有船靠港的日子留空，不畫成 0（使用者 2026-11-19）
    const res = CG.waitTrend(3).filter(r => r.unlo === a.unlo), has = r => r && r.days.some(d => d.avg != null && d.calls > 0);
    const pick = res.find(r => r.cov === 'PORT' && has(r)) || res.find(has);
    if (!pick) return U.emptyChart(box, pn(a.unlo) + ' 沒有近 7 天的等泊資料');
    const isPort = pick.cov === 'PORT', nNo = pick.days.filter(d => !(d.calls > 0)).length;
    box.insertAdjacentHTML('beforebegin', `<div class="note" style="margin:.1rem 0 .2rem">${isPort ? '資料範圍：全港（所有公司的船）' : '資料範圍：<b>僅本公司船舶</b>（這個港口沒有全港資料，樣本少，參考就好）'}${nNo ? `；${nNo} 天沒有船靠港，圖上留空` : ''}</div>`);
    U.lineChart(box, { x: pick.days.map(d => (d.off === 0 ? '今天' : d.off + ' 天')), yName: '小時', legend: false, series: [{ name: isPort ? '全港平均等泊' : '本公司船舶平均等泊', data: pick.days.map(d => (d.calls > 0 && d.avg != null ? d.avg : null)), showSymbol: true, connectNulls: false }] });
  });

  U.reg('M14-c13', (el, c) => U.shipMap(el, { vids: c.vids, single: true, bulk: false }));
  U.reg('M14-b7', (el, c) => U.shipMap(el, { vids: c.vids, single: true, bulk: true }));
  U.reg('M14-b6', (el, c) => {
    const L = CG.arrivals().filter(x => x.vid === c.vids[0] && x.status === 'EXPECTED').sort((p, q) => String(p.etaCalc || p.etaRep).localeCompare(String(q.etaCalc || q.etaRep)));
    if (!L.length) return none(el);
    const gap = x => (x.etaRep && x.etaCalc ? (Date.parse(x.etaCalc + 'Z') - Date.parse(x.etaRep + 'Z')) / 3600000 : null);
    U.table(el, { rows: L.map((x, i) => ({ next: i === 0 ? '下一港' : '', port: pn(x.unlo), rep: x.etaRep ? x.etaRep.replace('T', ' ').slice(0, 16) : null, calc: x.etaCalc ? x.etaCalc.replace('T', ' ').slice(0, 16) : null, gap: gap(x) })),
      cols: [{ k: 'next', t: '', h: r => (r.next ? tag(r.next, 'ok') : '') }, { k: 'port', t: '港口' }, { k: 'rep', t: '回報 ETA（UTC）' }, { k: 'calc', t: '計算 ETA（UTC）', h: r => esc(r.calc || '—') }, { k: 'gap', t: '落差 小時', n: true, d: 1 }] });
  });
})();
