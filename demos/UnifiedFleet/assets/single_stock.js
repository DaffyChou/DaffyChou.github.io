/* 單船「燃油與庫存」（single-fuel-stock）：重點數字、庫存走勢與預測、加油紀錄與單量差異、各港加油量與次數、滑油庫存與耗量。
   資料：庫存快照（snap，剩餘天數同清單）、每日船報殘油（ledger）、加油紀錄（bunker）、月指標（滑油）。依使用者決定不顯示價格。 */
(function () {
  'use strict';
  const U = window.UI, { fmt, esc, val, months, STATE } = U;
  const R = n => U.risk.rows(n);
  const pn = u => (U.ports ? U.ports(u) : u);
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const LVC = { high: 'bad', mid: 'warn', low: 'ok', nodata: 'no' };
  const NOWMS = () => Date.parse(((window.UI_CARGO || {}).now || '2026-11-01T08:00') + ':00Z');
  const d10 = s => String(s || '').slice(0, 10);
  const vid0 = c => c.vids[0];
  const bunkers = id => R('bunker').filter(r => r.vid === id).sort((a, b) => (a.t < b.t ? -1 : 1));
  function toolbarToHeader(el) {   // 切換列放卡片標題列；重畫時取代舊的（不會出現兩份）
    const tb = el.querySelector(':scope > .toolbar'), tools = el.closest('.blk') && el.closest('.blk').querySelector('[data-tools]');
    if (tb && tools) { tools.querySelectorAll('.toolbar').forEach(x => x.remove()); tools.appendChild(tb); }
    return tools || el;
  }
  // 預估降到最低存量的日期（照目前日耗；資料過期或沒有日耗時不推算）
  function floorDate(id) {
    const s = (U.SN.snap || {})[id], v = U.VBY[id];
    if (!s || s.stale || !(s.rate > 0) || s.rob_res == null || v.floor_res == null) return null;
    const days = (s.rob_res - v.floor_res) / s.rate, base = Date.parse(s.last + (String(s.last).length <= 19 ? 'Z' : ''));
    return { days, t: base + days * 86400000 };
  }
  // 下次建議加油港（貨櫃）：依航線港序，從最近一次靠港往後找第一個有加油紀錄的港（同船隊「加油計畫」）
  function nextBunkerPort(id) {
    const v = U.VBY[id], svc = (U.M.services || []).find(x => x.id === v.svc), ports = svc ? svc.ports.slice(0, -1) : [];
    if (!ports.length) return null;
    const bp = new Set(R('bunker').map(r => r.port)), last = R('calls').filter(k => k.vid === id).sort((a, b) => (a.nor < b.nor ? 1 : -1))[0];
    if (!last) return null; const i = ports.indexOf(last.port);
    for (let k = 1; k <= ports.length; k++) { const p = ports[(i + k + ports.length) % ports.length]; if (bp.has(p)) return p; }
    return null;
  }

  // ---------------- 燃油重點數字（貨櫃 M14-c29、散裝 M14-b12）
  U.reg(['M14-c29', 'M14-b12'], (el, c) => {
    const id = vid0(c), s = (U.SN.snap || {})[id] || {}, v = U.VBY[id], r = (U.risk.byVessel(id) || {}).remain || {}, bulk = v.type === 'bulk';
    const hrs = s.last ? (NOWMS() - Date.parse(s.last + 'Z')) / 3600000 : null, lb = bunkers(id).filter(b => b.qty > 0).pop(), fd = floorDate(id), np = bulk ? null : nextBunkerPort(id);
    U.kpis(el, [
      { k: '殘油（重油）庫存', v: s.rob_res == null ? null : fmt(s.rob_res, 0) + ' 噸', d: v.floor_res == null ? '' : '最低存量 ' + fmt(v.floor_res, 0) + ' 噸', cls: s.below ? 'bad' : 'no', g: '最近一份船報的重油（HSFO／VLSFO）殘油；最低存量是這艘船設定的底線。' },
      { k: '輕油（MGO）庫存', v: s.rob_mgo == null ? null : fmt(s.rob_mgo, 0) + ' 噸', d: '排放管制區、進港用', cls: 'no', g: '輕油主要在排放管制區與港內使用。' },
      { k: '日耗（近 30 天）', v: s.rate == null ? null : fmt(s.rate, 1) + ' 噸／日', d: '合格日的平均', cls: 'no', g: '近 30 天合格船報日的平均日耗，用來推算剩餘天數。' },
      { k: '剩餘天數', v: s.stale ? '資料過期' : r.text || null, d: s.stale ? `${hrs == null ? '' : fmt(hrs, 0) + ' 小時'}沒有船報，不判斷` : r.level === 'high' ? '要處理' : r.level === 'mid' ? '留意' : r.level === 'low' ? '正常' : '', cls: s.stale ? 'warn' : LVC[r.level] || 'no', g: '和清單「剩餘天數」同一個燈號（貨櫃 3 天留意、1.5 天要處理；散裝 7 天、3 天）。超過 48 小時沒船報標資料過期。' },
      { k: '上次加油', v: lb ? d10(lb.t) : null, d: lb ? `${pn(lb.port)}・${lb.g}・${fmt(lb.qty, 0)} 噸` : '沒有加油紀錄', cls: 'no', g: '最近一次加油紀錄。' },
      bulk ? { k: '預計需要加油', v: fd ? new Date(fd.t).toISOString().slice(0, 10) : null, d: fd ? `約 ${fmt(fd.days, 0)} 天後降到最低存量` : s.stale ? '資料過期，不推算' : '無法推算', cls: fd && fd.days < 7 ? 'warn' : 'no', g: '照目前日耗，殘油降到最低存量的日期（散裝沒有固定航線船期，改看日期）。' }
        : { k: '下次建議加油港', v: np ? pn(np) : null, d: fd ? `約 ${fmt(fd.days, 0)} 天後降到最低存量` : '依航線港序', cls: 'no', g: '依航線港序，從最近一次靠港往後找第一個有加油紀錄的港（同船隊「加油計畫」）。' },
    ]);
  });

  // ---------------- 庫存走勢與預測（貨櫃 M14-c30、散裝 M14-b13）：每日船報殘油＋最低存量線＋推算＋加油前庫存點
  U.reg(['M14-c30', 'M14-b13'], (el, c) => {
    const id = vid0(c), v = U.VBY[id], col = U.COL(), end = NOWMS(), lo = end - 90 * 86400000;
    const L = R('ledger').filter(r => r.vid === id && r.rob != null && Date.parse(r.t + 'Z') >= lo).map(r => [Date.parse(r.t + 'Z'), +r.rob.toFixed(1)]);
    if (L.length < 3) return U.emptyChart(el, '近 90 天沒有足夠的船報殘油資料');
    const B = bunkers(id).filter(b => b.ra != null && b.qty > 0 && Date.parse(b.t + 'Z') >= Math.max(lo, L[0][0]) && b.g !== 'MGO');   // 只畫在船報曲線範圍內的加油
    const fd = floorDate(id), s = (U.SN.snap || {})[id] || {}, last = L[L.length - 1];
    const proj = fd && v.floor_res != null ? [[last[0], last[1]], [fd.t, v.floor_res]] : null;
    U.mkChart(el, { grid: { left: 56, right: 30, top: 34, bottom: 36 }, legend: { show: true, top: 0 }, xAxis: { type: 'time' }, yAxis: { type: 'value', name: '殘油（噸）', scale: true },
      tooltip: { trigger: 'item', confine: true, formatter: p => (p.seriesName === '加油' ? p.data[2] : `${new Date(p.data[0]).toISOString().slice(0, 16).replace('T', ' ')}<br>${esc(p.seriesName)}：${fmt(p.data[1], 0)} 噸`) },
      series: [{ name: '殘油（船報）', type: 'line', showSymbol: false, data: L, lineStyle: { width: 2, color: col.pal[0] }, itemStyle: { color: col.pal[0] },
          markLine: v.floor_res == null ? undefined : { symbol: 'none', silent: true, lineStyle: { color: col.bad, type: 'dashed' }, label: { formatter: '最低存量 ' + fmt(v.floor_res, 0) + ' 噸', color: col.bad, fontSize: 11, position: 'insideEndTop' }, data: [{ yAxis: v.floor_res }] } }]
        .concat(proj ? [{ name: `照目前日耗推算（${new Date(fd.t).toISOString().slice(0, 10)} 到底線）`, type: 'line', showSymbol: true, symbolSize: 6, data: proj, lineStyle: { type: 'dashed', width: 2, color: col.sub }, itemStyle: { color: col.sub } }] : [])
        .concat(B.length ? [{ name: '加油', type: 'scatter', symbolSize: 11, data: B.map(b => { const t = Date.parse(b.t + 'Z'), pre = L.filter(x => x[0] <= t).pop() || L[0]; return [t, pre[1], `${d10(b.t)}　${esc(pn(b.port))}<br>加油前 ${fmt(b.ra, 0)} 噸 → 加 ${fmt(b.qty, 0)} 噸（${esc(b.g)}）`]; }), itemStyle: { color: col.warn, borderColor: '#fff', borderWidth: 1 } }] : []) });   // 點標在曲線上（加油當時的船報殘油），提示框列加油紀錄上的加油前庫存
  });

  // ---------------- 加油紀錄與單量差異（貨櫃 M14-c31，切換表格｜差異圖）、加油紀錄（散裝 M14-b14）
  function records(el, c) {
    const id = vid0(c), bulk = U.VBY[id].type === 'bulk', V = (STATE.view.bunkRec = STATE.view.bunkRec || { m: 'table' }), L = bunkers(id).slice().reverse();
    if (!L.length) return U.emptyChart(el, '這艘船沒有加油紀錄');
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const hasDiff = L.some(r => r.bdn > 0 && r.snd != null);
    if (bulk || !hasDiff) V.m = 'table';
    el.innerHTML = (bulk || !hasDiff ? '' : `<div class="toolbar"><span class="seg" role="group" aria-label="看表格或差異圖"><button type="button" data-br="table" aria-pressed="${V.m === 'table'}">表格</button><button type="button" data-br="diff" aria-pressed="${V.m === 'diff'}">差異圖</button></span></div>`) + '<div data-b></div>';
    const host = toolbarToHeader(el), box = el.querySelector('[data-b]');
    host.querySelectorAll('[data-br]').forEach(b => (b.onclick = () => { V.m = b.dataset.br; records(el, c); }));
    if (V.m === 'diff') { box.style.height = '17rem'; return U.getRenderer('M6-c2')(box, c); }
    U.table(box, { pageSize: 8, rows: L.map(r => ({ t: String(r.t).slice(0, 16).replace('T', ' '), port: pn(r.port), g: r.g, qty: r.qty, ra: r.ra, rd: r.rd, ok: r.ra != null && r.rd != null ? Math.abs(r.rd - (r.ra + r.qty)) <= 2 : null, bdn: r.bdn, snd: r.snd, diff: r.bdn > 0 && r.snd != null ? 100 * (r.snd - r.bdn) / r.bdn : null, sup: r.sup || '', dq: r.dq })),
      cols: [{ k: 't', t: '時間（UTC）' }, { k: 'port', t: '港口' }, { k: 'g', t: '油種' }, { k: 'qty', t: '加油量（噸）', n: true, d: 1 }, { k: 'ra', t: '加油前庫存（噸）', n: true, d: 0 }, { k: 'rd', t: '加油後庫存（噸）', n: true, d: 0 },
        { k: 'ok', t: '庫存守恆', h: r => (r.ok == null ? tag('資料不足', 'no') : r.ok ? tag('符合', 'ok') : tag('不符（±2 噸）', 'bad')) }]
        .concat(bulk ? [] : [{ k: 'bdn', t: '供油單（噸）', n: true, d: 1 }, { k: 'snd', t: '實測（噸）', n: true, d: 1 }, { k: 'diff', t: '差距', n: true, h: r => (r.diff == null ? '—' : Math.abs(r.diff) >= 1 ? tag(fmt(r.diff, 2) + '%', 'bad') : Math.abs(r.diff) >= 0.5 ? tag(fmt(r.diff, 2) + '%', 'warn') : fmt(r.diff, 2) + '%') }, { k: 'sup', t: '供應商', h: r => esc(r.sup || '—') }]) });
  }
  U.reg(['M14-c31', 'M14-b14'], records);

  // ---------------- 各港加油量與次數（近 12 個月；貨櫃 M14-c32、散裝 M14-b15）：依決定不顯示油價
  U.reg(['M14-c32', 'M14-b15'], (el, c) => {
    const id = vid0(c), lo = months[Math.max(0, c.mi - 11)] + '-01', by = {};
    bunkers(id).forEach(r => { if (r.t >= lo && r.qty > 0) { const o = by[r.port] || (by[r.port] = { port: r.port, q: 0, n: 0 }); o.q += r.qty; o.n++; } });
    const L = Object.values(by).sort((a, b) => b.q - a.q);
    if (!L.length) return U.emptyChart(el, '近 12 個月這艘船沒有加油紀錄');
    const tot = L.reduce((s, x) => s + x.q, 0), col = U.COL();
    el.style.height = Math.max(11, L.length * 2.1 + 4) + 'rem';
    U.mkChart(el, { grid: { left: 110, right: 120, top: 10, bottom: 24 }, xAxis: { type: 'value', name: '噸' }, yAxis: { type: 'category', inverse: true, data: L.map(x => pn(x.port)), axisTick: { show: false } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: p => { const x = L[p[0].dataIndex]; return `<b>${esc(pn(x.port))}</b><br>加油 ${x.n} 次、共 ${fmt(x.q, 0)} 噸（占 ${fmt(100 * x.q / tot, 0)}%）`; } },
      series: [{ type: 'bar', barMaxWidth: 18, data: L.map(x => ({ value: Math.round(x.q), itemStyle: { color: col.pal[0], borderRadius: [0, 3, 3, 0] } })), label: { show: true, position: 'right', fontSize: 11, color: col.sub, formatter: p => `${fmt(p.value, 0)} 噸・${L[p.dataIndex].n} 次（${fmt(100 * p.value / tot, 0)}%）` } }] });
  });

  // ---------------- 滑油庫存與耗量（貨櫃 M14-c33、散裝 M14-b16）
  U.reg(['M14-c33', 'M14-b16'], (el, c) => {
    const id = vid0(c), mi = c.mi, S = [['LUBE_MECYO', '主機汽缸油'], ['LUBE_MESYLO', '主機系統油'], ['LUBE_AESYLO', '輔機系統油']];
    if (!S.some(([m]) => U.series(m, id).some(x => x != null))) return U.emptyChart(el, '這艘船沒有滑油資料');
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const kp = (k, v, sub) => `<div class="pk"><div class="note">${k}</div><b>${v}</b><div class="note">${sub || ''}</div></div>`;
    const f = m => { const x = val(m, id, mi); return x == null ? '—' : fmt(x, 0) + ' 公升'; };
    el.innerHTML = `<div class="pkpi sv4">${kp('汽缸油本月用量', f('LUBE_MECYO'), '主機汽缸注油')}${kp('汽缸油庫存', f('LUBE_MECYO_ROB'), '最近一份船報')}${kp('主機系統油本月用量', f('LUBE_MESYLO'), '')}${kp('輔機系統油本月用量', f('LUBE_AESYLO'), '')}</div><div data-c style="height:15rem"></div><div class="note">不標健康基準線（缺主機轉速、運轉時數與補油紀錄）；以庫存相減產生的異常消耗已排除。</div>`;
    U.lineChart(el.querySelector('[data-c]'), { yName: '公升', legend: true, series: S.map(([m, n]) => ({ name: n, data: U.series(m, id).map(x => (x == null ? null : Math.round(x))) })) });
  });
})();
