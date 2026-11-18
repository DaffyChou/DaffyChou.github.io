/* 卸櫃量（cargo-usage-ideas 1＋2），放在運務管理「靠泊時程」頁籤：
   M15-c15 未來 5 天卸櫃量（港口 × 天，和靠泊時程同一份資料）：格內是本公司船預計卸下的 TEU，點格子跳到下方靠泊時程並篩選該港。
   M15-c14 卸櫃量預估（本公司船）：靠泊時程內還沒離港的本公司船，在這港要卸多少（滿櫃、空櫃、冷櫃、危險櫃）。
   計算在 risk_unload.js（U.unloadAt、U.unloadPlan），圖、表、風險判讀共用。 */
(function () {
  'use strict';
  const U = window.UI, { COL, fmt, esc } = U;
  const CG = U.cargo, HR = 3600000;
  const pn = u => (U.ports ? U.ports(u) : u);
  const P = b => (U.RK.blocks[b] || {}).params || {};
  const NOORG = '此組織沒有運務資料（只有「模擬貨櫃公司」有）。請在上方組織選「模擬貨櫃公司」或「全部組織」。';

  U.reg('M15-c15', el => {
    if (!CG || !CG.orgOk()) return U.emptyChart(el, NOORG);
    const p = P('M15-c15'), days = p.days || 7, past = p.past == null ? 2 : p.past, L = U.unloadPlan(days, U.opsFilt ? U.opsFilt.regPorts() : null, past);
    if (!L.length) return U.emptyChart(el, '這個範圍沒有本公司船的卸櫃資料');
    const by = {}, ships = {};
    L.forEach(x => { x.col = x.day + past; const k = x.unlo + '|' + x.col; by[k] = (by[k] || 0) + x.u.tot; (ships[k] = ships[k] || []).push(x); });
    const allP = [...new Set(L.map(x => x.unlo))].map(u => ({ u, t: L.filter(x => x.unlo === u).reduce((s, x) => s + x.u.tot, 0) })).sort((a, b) => b.t - a.t).map(x => x.u);
    const BV = U.berthView || { ports: [] }, pick = (BV.ports || []).filter(u => allP.includes(u));   // 港口複選（和靠泊時程共用）
    const TOP = 12, showAll = !!U.STATE.view.unloadAll || pick.length > 0, ports = pick.length ? allP.filter(u => pick.includes(u)) : showAll ? allP : allP.slice(0, TOP);   // 預設只列卸櫃量前 12 港，可展開全部（少卷動）
    const tw = U.berthGantt && U.berthGantt.tzOff ? U.berthGantt.tzOff('Asia/Taipei', CG.NOW) : 0, d0 = Math.floor((CG.NOW + tw) / (24 * HR)) * 24 * HR, W = '日一二三四五六';   // 欄＝港口當地的第幾天（今天、明天…），日期以台灣日期標示
    const NM = { '-2': '前天', '-1': '昨天', 0: '今天', 1: '明天' }, xs = Array.from({ length: days }, (_, i) => { const dd = i - past, d = new Date(d0 + dd * 24 * HR); return (NM[dd] ? NM[dd] + (dd < 0 ? '（實際）' : '') + '\n' : '') + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '（' + W[d.getUTCDay()] + '）'; });
    const data = []; ports.forEach((u, yi) => { for (let d = 0; d < days; d++) { const v = by[u + '|' + d]; if (v) data.push([d, yi, v]); } });
    const col = COL();
    const card = el.closest('.blk'), tools = card && card.querySelector('[data-tools]');
    if (tools && U.portPick && !tools.querySelector('[data-mp]')) { tools.insertAdjacentHTML('afterbegin', U.portPick(allP, 'unload')); U.portPickWire(tools); }
    if (tools && !pick.length && allP.length > TOP && !tools.querySelector('[data-ua]')) { tools.insertAdjacentHTML('afterbegin', `<button type="button" class="btn" data-ua>${showAll ? '只看前 ' + TOP + ' 港' : '顯示全部 ' + allP.length + ' 港'}</button>`); tools.querySelector('[data-ua]').onclick = () => { U.STATE.view.unloadAll = !showAll; U.bus.emit(); }; }
    el.style.height = Math.max(9, ports.length * 1.65 + 4.2) + 'rem'; el.style.maxWidth = (118 + days * 88 + 16) + 'px';   // 每列約 26 px   // 格子固定約 92×34 px，數字放大
    const lv0 = v => (v >= p.high ? col.bad : v >= p.mid ? col.warn : col.pal[0]), mix = (a, b, t) => { const h = x => { x = String(x).trim().replace('#', ''); if (x.length === 3) x = x.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); }; try { const A = h(a), B = h(b); if (A.some(isNaN) || B.some(isNaN)) return a; return '#' + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join(''); } catch (e) { return a; } }, lv = (v, d) => (d < past ? mix(lv0(v), col.card, 0.62) : lv0(v));   // 過去兩天（實際）顏色稍淡，用混色不用透明度，文字對比不變
    U.mkChart(el, {
      grid: { left: 118, right: 16, top: 4, bottom: 40 },
      tooltip: { trigger: 'item', axisPointer: { type: 'none' }, confine: true, formatter: q => { const [d, yi, v] = q.data.value || q.data, k = ports[yi] + '|' + d; return `${esc(pn(ports[yi]))}　${xs[d].replace('\n', ' ')}<br>${d < past ? '實際卸' : '卸（已靠泊為實際、未靠泊為預估）'} <b>${fmt(v, 0)} TEU</b>（${(ships[k] || []).length} 艘）<br>` + (ships[k] || []).map(x => `${esc(x.name)}（${esc(x.term)}）：${fmt(x.u.tot, 0)}${x.actual ? '（實際）' : `（預估；空 ${fmt(x.u.emp, 0)}・冷 ${fmt(x.u.rf, 0)}・危 ${fmt(x.u.dg, 0)}）`}`).join('<br>') + '<br><span style="opacity:.7">點格子看這個港的靠泊時程</span>'; } },
      xAxis: { type: 'category', data: xs, position: 'bottom', splitArea: { show: false }, axisTick: { show: false }, axisLabel: { fontSize: 11, lineHeight: 14 } },
      yAxis: { type: 'category', data: ports.map(pn), inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 11 } },
      series: [{ type: 'heatmap', data: data.map(([d, yi, v]) => ({ value: [d, yi, v], itemStyle: { color: lv(v, d) } })),
        itemStyle: { borderColor: col.card, borderWidth: 4, borderRadius: 5 }, emphasis: { itemStyle: { borderColor: col.ink, borderWidth: 2 } },
        label: { show: true, fontSize: 13, fontWeight: 700, color: '#fff', textBorderColor: 'rgba(0,0,0,.7)', textBorderWidth: 2.5, formatter: q => fmt(q.data.value[2], 0) } }],
    });
    const ch = window.echarts && echarts.getInstanceByDom(el);
    if (ch) ch.on('click', q => { const u = ports[q.data.value[1]]; if (!u || !U.berthView) return; U.berthView.tab = 'ships'; U.berthView.ports = [u]; U.berthView.day = q.data.value[0] - past; U.STATE.scrollTo = 'M13-c4'; U.bus.emit(); });   // 帶入天數：靠泊時程捲到那一天並標出
  });

  U.reg('M15-c14', (el, c) => {
    if (!CG || !CG.orgOk()) return U.emptyChart(el, NOORG);
    if (!U.berthScope) return U.emptyChart(el, '靠泊時程元件未載入。');
    const NOW = CG.NOW, S = U.berthScope(c.vids), p = P('M15-c14');
    const rows = (S.list || []).filter(x => x.own && x.dep > NOW).map(x => { const u = U.unloadOf(x.vid, x.unlo, x.af, x.arr); return u ? Object.assign({}, x, { lad: null, emp: null, rf: null, dg: null }, u, { port: pn(x.unlo), stt: x.af <= NOW && x.est !== 2 ? '在泊' : x.arr && x.arr <= NOW ? '等泊中' : '未到', t: x.af, when: new Date(x.af).toISOString().slice(5, 16).replace('T', ' ').replace('-', '/') }) : null; }).filter(Boolean);
    if (!rows.length) return U.emptyChart(el, '靠泊時程內沒有本公司船的卸櫃資料（篩選後）');
    const tg = (t, k) => `<span class="tag ${k}">${esc(t)}</span>`;
    el.classList.add('auto'); el.style.maxHeight = 'none';
    U.table(el, { rows, sort: ['t', 1], pageSize: 10, onRow: r => U.go('M3', r.vid), cols: [
      { k: 'name', t: '船名', h: r => `<b>${esc(r.name)}</b>` },
      { k: 'port', t: '港口／碼頭', h: r => esc(r.port) + `<div class="rsub">${esc(r.term)}</div>` },
      { k: 't', t: '靠泊（UTC）', h: r => esc(r.when) + `<div class="rsub">${tg(r.stt, r.stt === '在泊' ? 'ok' : r.stt === '等泊中' ? 'warn' : 'no')}</div>` },
      { k: 'tot', t: '卸櫃（TEU）', n: true, h: r => (r.tot >= (p.tot_mid || 400) ? tg(fmt(r.tot, 0), 'warn') : fmt(r.tot, 0)) + (r.actual ? '<div class=rsub>實際</div>' : '<div class=rsub>預估</div>') },
      { k: 'lad', t: '滿櫃', n: true, d: 0 }, { k: 'emp', t: '空櫃', n: true, d: 0 }, { k: 'rf', t: '冷櫃', n: true, d: 0 },
      { k: 'dg', t: '危險櫃', n: true, h: r => (r.dg == null ? '—' : r.dg >= (p.dg_mid || 30) ? tg(fmt(r.dg, 0), 'bad') : fmt(r.dg, 0)) }] });
  });
})();
