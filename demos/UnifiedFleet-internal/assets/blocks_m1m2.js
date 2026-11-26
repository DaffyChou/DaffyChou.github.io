/* 船隊總覽（M1）與門檻設定表單 */
(function () {
  'use strict';
  const U = window.UI;
  const { COL, fmt, months, val, vname, esc, STATE } = U;

  // ---------------- 共用：逐日樣本、箱形統計
  U.dailyWin = function (vid, mi, n, minDist) {
    const lo = Math.floor((Date.parse(months[Math.max(0, mi - (n || 6) + 1)] + '-01') - Date.UTC(2024, 0, 1)) / 86400000);
    const hi = Math.floor((Date.parse(months[mi] + '-28') - Date.UTC(2024, 0, 1)) / 86400000) + 3;
    return (window.UI_DAILY.d[vid] || []).filter(r => r[0] >= lo && r[0] <= hi && r[1] != null && r[2] >= (minDist == null ? 100 : minDist));
  };
  U.boxStats = function (a) {
    a = U.nums(a).sort((x, y) => x - y);
    if (a.length < 10) return null;                       // 規格：每船合格日不足 10 天不判定
    const q1 = U.quant(a, .25), q2 = U.quant(a, .5), q3 = U.quant(a, .75), f = 1.5 * (q3 - q1);
    const inn = a.filter(x => x >= q1 - f && x <= q3 + f);
    return { v: [inn[0], q1, q2, q3, inn[inn.length - 1]], out: a.filter(x => x < q1 - f || x > q3 + f), n: a.length, q2 };
  };
  // 同級距箱形圖：落後（偏離 -10% 以下）標紅。船多時（超過 16 艘）預設只畫「落後最多的 10 艘」，
  // 另可切換「依級距合併」（每級距一個箱）或「全部船」（可橫向拖曳縮放）
  U.classBox = function (el, ctx) {
    const items = [];
    ctx.vids.forEach(id => {
      const w = U.dailyWin(id, ctx.mi, 6).map(r => r[1]), bs = U.boxStats(w);
      if (bs) items.push({ id, bs, v: U.VBY[id], dev: val('CLASS_DEV', id, ctx.mi), raw: w });
    });
    const many = items.length > 16, V = U.STATE.view;
    if (!V.box) V.box = 'worst';
    const mode = many ? V.box : 'all';
    el.classList.add('auto'); el.style.maxHeight = 'none'; el.style.height = 'auto';
    el.innerHTML = (many ? `<div class="toolbar"><label class="fld">顯示<select data-bm><option value="worst"${mode === 'worst' ? ' selected' : ''}>落後最多的 10 艘</option><option value="class"${mode === 'class' ? ' selected' : ''}>依級距合併（每級距一個箱）</option><option value="all"${mode === 'all' ? ' selected' : ''}>全部 ${items.length} 艘（可拖曳縮放）</option></select></label></div>` : '') + '<div data-bx style="height:22rem"></div>';
    const box = el.querySelector('[data-bx]'), sel = el.querySelector('[data-bm]');
    if (sel) sel.onchange = () => { V.box = sel.value; U.bus.emit(); };
    const yName = '浬／噸（每噸油跑幾浬；近 6 個月逐日）', empty = '合格日不足（每船至少 10 天、日距離不小於 100 nm）';
    if (mode === 'class') {
      const by = {}; items.forEach(x => (by[x.v.cls || '未分類'] = by[x.v.cls || '未分類'] || []).push(...x.raw.filter(r => r != null)));
      const boxes = Object.entries(by).sort((a, b) => a[0].localeCompare(b[0])).map(([k, a]) => { const bs = U.boxStats(a); const n = items.filter(x => (x.v.cls || '未分類') === k).length; return bs && { name: k + '（' + n + ' 艘）', v: bs.v, warn: false }; }).filter(Boolean);
      return U.boxChart(box, { boxes, yName, empty });
    }
    let L = items.slice();
    if (mode === 'worst') L = items.filter(x => x.dev != null).sort((a, b) => a.dev - b.dev).slice(0, 10);
    else L.sort((a, b) => (a.v.cls || '').localeCompare(b.v.cls || '') || a.bs.q2 - b.bs.q2);
    const boxes = L.map(x => ({ name: x.v.name.replace('SYN ', ''), v: x.bs.v, warn: x.dev != null && x.dev <= -10 }));
    const outl = [];
    L.forEach((x, i) => x.bs.out.slice(0, 6).forEach(o => outl.push([i, o, `${x.v.name}（${x.v.cls || ''}）離群日 ${fmt(o, 2)} 浬／噸`])));
    U.boxChart(box, { boxes, outliers: outl, yName, empty, zoom: mode === 'all' && boxes.length > 25 });
  };

  // ============================================================ M1
  U.reg('M1-b0', (el, c) => U.kpis(el, [
    U.kpiFrom(c.vids, 'FUEL_TOTAL', '總油耗', { agg: 'sum', unit: 't', good: null }),
    U.kpiFrom(c.vids, 'DIST', '海上航距', { agg: 'sum', unit: 'nm', good: null }),
    U.kpiFrom(c.vids, 'AER', 'AER（DWT 估算）', { agg: 'mean', d: 2, good: 'down' }),
    U.kpiFrom(c.vids, 'EFF', '燃油效率', { agg: 'mean', d: 2, unit: '浬／噸', good: 'up' })]));
  U.reg('M1-c0', (el, c) => U.kpis(el, [
    U.kpiFrom(c.vids, 'FUEL_TOTAL', '總油耗', { agg: 'sum', unit: 't', good: null }),
    U.kpiFrom(c.vids, 'OTP', '準點率', { agg: 'mean', d: 1, unit: '%', good: 'up' }),
    U.kpiFrom(c.vids, 'SLOT_UTIL', '艙位利用率', { agg: 'mean', d: 1, unit: '%', good: 'up' }),
    U.kpiFrom(c.vids, 'CO2_TEUNM', 'TEU 浬碳強度', { agg: 'mean', d: 0, unit: '克／（箱·浬）', good: 'down' })]));

  function trendLine(el, c, a, b, cname) {
    const sel = [{ xAxis: months[c.mi] }], mk = { symbol: 'none', silent: true, lineStyle: { color: COL().sub, type: 'dashed' }, label: { show: false }, data: sel };
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = '<div class="sub2" data-a></div><div class="sub2" data-b></div>';
    U.lineChart(el.querySelector('[data-a]'), { yName: a.name + '（' + a.unit + '）', series: [{ name: a.name, data: U.fleetSeries(a.m, c.vids, a.agg), areaStyle: { opacity: .08 }, markLine: mk }] });
    U.lineChart(el.querySelector('[data-b]'), { yName: b.name + '（' + b.unit + '）', legend: true,
      series: [].concat(U.bandSeries(b.m, c.vids), [{ name: b.name, data: U.fleetSeries(b.m, c.vids, 'mean'), markLine: mk }, cname ? { name: cname.name, data: U.fleetSeries(cname.m, c.vids, 'mean'), lineStyle: { type: 'dashed', width: 2 } } : { name: '', data: [] }]) });
  }
  U.reg('M1-b1', (el, c) => trendLine(el, c, { name: '全船隊總用油量', unit: '噸', m: 'FUEL_TOTAL', agg: 'sum' }, { name: '每載重噸每浬碳排（AER）', unit: '克 CO₂／（載重噸·浬）', m: 'AER' }, { name: 'EEOI（僅有實際貨量的船）', m: 'EEOI' }));
  U.reg('M1-c1', (el, c) => trendLine(el, c, { name: '全船隊總用油量', unit: '噸', m: 'FUEL_TOTAL', agg: 'sum' }, { name: '每千箱浬用油', unit: '公斤/千箱浬', m: 'FUEL_PER_KTEUNM' }, { name: '每載重噸每浬碳排（AER）', m: 'AER' }));
  U.reg('M1-c2', (el, c) => U.lineChart(el, {
    yName: '百分比（%）', series: [].concat(U.bandSeries('OTP', c.vids), [{ name: '準點率', data: U.fleetSeries('OTP', c.vids, 'mean'), markLine: { symbol: 'none', silent: true, lineStyle: { color: COL().sub, type: 'dashed' }, label: { show: false }, data: [{ xAxis: months[c.mi] }] } },
      { name: '艙位利用率', data: U.fleetSeries('SLOT_UTIL', c.vids, 'mean') }]),
  }));

  function stateStack(el, c) {
    const x = months, wait = [], port = [], rest = [];
    months.forEach((_, i) => {
      let T = 0, W = 0, P = 0;
      c.vids.forEach(id => { const t = val('FUEL_TOTAL', id, i); if (t > 0) { T += t; W += t * (val('FUEL_WAIT_SHARE', id, i) || 0) / 100; P += t * (val('FUEL_PORT_SHARE', id, i) || 0) / 100; } });
      wait.push(T ? 100 * W / T : null); port.push(T ? 100 * P / T : null); rest.push(T ? 100 - 100 * (W + P) / T : null);
    });
    U.stackChart(el, { x, yName: '占總油耗（%）', max: 100, series: [{ name: '等待（錨泊＋漂流）', data: wait }, { name: '港內作業', data: port }, { name: '海上航行與操船', data: rest }] });
  }
  U.reg(['M1-b2', 'M1-c3'], stateStack);
  U.reg(['M1-b3', 'M1-c4'], (el, c) => U.classBox(el, c));
  U.reg('M1-b4', (el, c) => U.stackChart(el, { yName: '噸', series: [{ name: 'HSFO', data: U.fleetSeries('HSFO_T', c.vids, 'sum') }, { name: 'VLSFO', data: U.fleetSeries('VLSFO_T', c.vids, 'sum') }, { name: 'MGO（輕油）', data: U.fleetSeries('MGO_T', c.vids, 'sum') }, { name: '其他', data: U.fleetSeries('OTHER_T', c.vids, 'sum') }] }));

  function portAgg(c, n) {
    const lo = months[Math.max(0, c.mi - 5)] + '-01', set = new Set(c.vids), by = {};
    U.risk.rows('bunker').forEach(r => { if (set.has(r.vid) && r.t >= lo && r.t <= months[c.mi] + '-31T99') { const o = by[r.port] || (by[r.port] = { q: 0, w: 0, wq: 0, n: 0 }); o.q += r.qty; o.n++; if (r.price != null) { o.w += r.price * r.qty; o.wq += r.qty; } } });
    return Object.entries(by).sort((a, b) => b[1].q - a[1].q).slice(0, n || 10).map(([k, o]) => ({ port: k, q: o.q, n: o.n, price: o.wq ? o.w / o.wq : null }));
  }
  U.portAgg = portAgg;
  U.reg('M1-b5', (el, c) => { const d = portAgg(c); U.barChart(el, { data: d.map(x => ({ name: U.ports(x.port), value: Math.round(x.q) })), yName: '加油量（噸；近 6 個月，僅實際加油）', empty: '近 6 個月沒有加油紀錄' }); });
  U.reg('M1-c5', (el, c) => {
    const d = portAgg(c); const col = COL();
    if (!d.length) return U.emptyChart(el, '近 6 個月沒有加油紀錄');
    const hasP = d.some(x => x.price != null);
    U.mkChart(el, {
      xAxis: { type: 'category', data: d.map(x => U.ports(x.port)), axisLabel: { interval: 0, rotate: 25 } }, grid: { left: 56, right: 56, top: 34, bottom: 56 },
      yAxis: [{ type: 'value', name: '加油量（噸）' }, { type: 'value', name: hasP ? '加權油價（美元／噸）' : '', scale: true, splitLine: { show: false } }],
      series: [{ name: '加油量', type: 'bar', barMaxWidth: 30, data: d.map(x => Math.round(x.q)) }, ...(hasP ? [{ name: '加權油價', type: 'line', yAxisIndex: 1, data: d.map(x => x.price == null ? null : Math.round(x.price)), symbolSize: 8 }] : [])],
    });
  });

  // ============================================================ M2 船舶清單
  function tag(l, k) { return `<span class="tag ${k}">${esc(l)}</span>`; }

  // 門檻設定：可編輯；設為 0 代表未設定。另提供示範按鈕：把所選船庫存降到底線以下，觀察各處風險判讀隨資料改變
  const SNAP0 = JSON.parse(JSON.stringify(U.SN.snap));
  function form(el, c) {
    el.classList.add('auto');
    const ro = U.can ? !U.can('data', 'edit') : false, dis = ro ? ' disabled' : '';   // 權限（perm.js）：沒有「資料與警報 › 改」時唯讀
    const rows = c.vids.map(id => { const v = U.VBY[id]; return `<tr><td>${esc(v.name)}</td><td>${esc(v.cls || '')}</td>
      <td class="n"><input data-id="${id}" data-f="thr_res" type="number" min="0" step="10" value="${v.thr_res ?? 0}" style="width:6rem"${dis}></td>
      <td class="n"><input data-id="${id}" data-f="thr_mgo" type="number" min="0" step="5" value="${v.thr_mgo ?? 0}" style="width:5rem"${dis}></td>
      <td class="n">${fmt(v.floor_res, 0)} / ${fmt(v.floor_dis, 0)}</td><td>${(v.thr_res > 0 && v.thr_mgo > 0) ? tag('已設定', 'ok') : tag('未設定（不觸發低庫存警報）', 'bad')}</td></tr>`; }).join('');
    const sel = U.vname(STATE.vessel);
    const me = U.auth && U.auth.me();
    el.innerHTML = (ro ? `<div class="roban" role="note"><b>沒有修改權限</b>　目前角色「${esc(me ? me.role : '未登入')}」只能查看門檻；要修改請由有「資料與警報 › 改」權限的人員處理（權限在「系統管理 › 帳號與權限」設定）。</div>` : '')
      + `<div class="toolbar"><span class="note">示範：把所選船（${esc(sel)}）的庫存降到最低存量以下，觀察清單、燃油與庫存、資料與警報各頁的風險判讀即時改變。</span>
      <button class="btn" id="demoLow"${dis}>降低所選船庫存</button><button class="btn" id="demoReset"${dis}>還原全部</button></div>
      <table class="t"><thead><tr><th>船名</th><th>級距</th><th class="n">殘油門檻 t</th><th class="n">輕油門檻 t</th><th class="n">最低存量底線（殘油／輕油）</th><th>狀態</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="note">門檻小於等於 0 視為未設定；循環油門檻目前不判斷（規格）。修改後立即重新評估風險判讀。</div>`;
    el.querySelectorAll('input').forEach(i => (i.onchange = () => {
      if (ro) return;
      const v = U.VBY[+i.dataset.id], old = v[i.dataset.f];
      v[i.dataset.f] = +i.value;
      if (U.audit) U.audit.log('門檻設定', '門檻', `${v.name} › ${i.dataset.f === 'thr_res' ? '殘油門檻' : '輕油門檻'}`, old ?? 0, +i.value);   // 參數異動紀錄（admin.js）
      U.bus.emit();
    }));
    el.querySelector('#demoLow').onclick = () => {
      const id = STATE.vessel, v = U.VBY[id], s = U.SN.snap[id];
      s.rob_res = Math.max((v.floor_res || 0) - 20, 0); s.below = true; s.remain = 0; s.stale = false; U.bus.emit();
    };
    el.querySelector('#demoReset').onclick = () => { Object.keys(SNAP0).forEach(k => Object.assign(U.SN.snap[k], SNAP0[k])); U.bus.emit(); };
  }
  U.reg(['M2-b1', 'M2-c1'], form);
})();
