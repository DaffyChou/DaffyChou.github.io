/* 單船「油耗與航行」（single-fuel-drive）：一頁不分段的新卡片
   重點數字（M14-c24／b10）、油花在哪裡（M14-c25／b11）、等待燒掉的油（M14-c26）、航速與油耗（M14-c27，沿用 M7-b2 的圖）、主機與輔機狀況（M14-c28，沿用 M9-c0／M9-c2 的圖）。
   數字都沿用船隊卡片的計算（fuel_ops.js、月指標、逐日資料），只是範圍縮成這艘船。 */
(function () {
  'use strict';
  const U = window.UI, { fmt, esc, val, months, STATE } = U;
  const pn = u => (U.ports ? U.ports(u) : u);
  const LVC = { high: 'bad', mid: 'warn', low: 'ok', nodata: 'no' };
  const vid0 = c => c.vids[0];
  // 切換列放卡片標題列；重畫時取代舊的那一份（不會出現兩份）
  function toolbarToHeader(el) {
    const tb = el.querySelector(':scope > .toolbar'), tools = el.closest('.blk') && el.closest('.blk').querySelector('[data-tools]');
    if (tb && tools) { tools.querySelectorAll('.toolbar').forEach(x => x.remove()); tools.appendChild(tb); }
    return tools || el;
  }

  // ---------------- 重點數字（貨櫃 M14-c24、散裝 M14-b10）：不顯示燃油成本（示意油價容易被誤當實際成本）
  function kpi(el, c) {
    const id = vid0(c), mi = c.mi, o = U.risk.byVessel(id) || {}, e = o.eff || {}, bulk = U.VBY[id].type === 'bulk';
    const chg = (m, good) => { const a = val(m, id, mi), b = val(m, id, mi - 1); if (a == null || b == null || !b) return { d: '上月無資料', cls: 'no' }; const p = 100 * (a - b) / Math.abs(b); return { d: `${p >= 0 ? '▲' : '▼'} ${fmt(Math.abs(p), 1)}% 對上月`, cls: good == null ? 'no' : (p >= 0) === (good === 'up') ? 'ok' : 'warn' }; };
    const L = [Object.assign({ k: '本月用油', v: val('FUEL_TOTAL', id, mi) == null ? null : fmt(val('FUEL_TOTAL', id, mi), 0) + ' 噸', g: '這艘船本月各油種合計（噸）。' }, chg('FUEL_TOTAL', null))];
    if (bulk) L.push(Object.assign({ k: '燃油效率', v: val('EFF', id, mi) == null ? null : fmt(val('EFF', id, mi), 2) + ' 浬／噸', g: '每噸油跑幾浬，越高越好。' }, chg('EFF', 'up')));
    else L.push(Object.assign({ k: '每浬油耗', v: val('FPN', id, mi) == null ? null : fmt(val('FPN', id, mi), 3) + ' 噸／浬', g: '每走一浬用幾噸油，越低越好。' }, chg('FPN', 'down')));
    L.push({ k: '對同型船差距', v: e.text || null, d: e.level === 'high' ? '要處理（低於同型船 10%）' : e.level === 'mid' ? '留意（低於同型船 3%）' : e.level === 'low' ? '和同型船差不多或更好' : '資料不足', cls: LVC[e.level] || 'no', g: '和同級距船的中間值比，跟清單「燃油效率差距」那一欄是同一個數字與燈號。' });
    if (bulk) {
      const ws = val('FUEL_WAIT_SHARE', id, mi);
      L.push({ k: '等待耗油占比', v: ws == null ? null : fmt(ws, 1) + '%', d: ws == null ? '' : ws >= 6 ? '要處理（6% 以上）' : ws >= 3 ? '留意（3% 以上）' : '正常', cls: ws == null ? 'no' : ws >= 6 ? 'bad' : ws >= 3 ? 'warn' : 'ok', g: '錨泊、漂流等待時用的油占總油耗的比例。' });
    } else {
      const F = U.fuelOps ? U.fuelOps.vessel(id, mi) : null, sp = val('SPEED_RATIO', id, mi);
      let c6 = 0, w6 = 0; for (let k = Math.max(0, mi - 5); k <= mi; k++) { const x = U.fuelOps ? U.fuelOps.vessel(id, k) : null; if (x) { c6 += x.catchX || 0; w6 += x.wait || 0; } }
      L.push({ k: '速度比', v: sp == null ? null : fmt(sp, 2), d: sp == null ? '' : sp >= 0.98 ? '接近或超過設計航速' : '實際航速 ÷ 設計航速', cls: sp == null ? 'no' : sp >= 0.98 ? 'warn' : 'no', g: '實際對地航速占設計航速的比例；接近 1 代表常開快車趕船。' });
      L.push({ k: '趕船多燒的油（估算）', v: F && F.catchX != null ? fmt(F.catchX, 0) + ' 噸' : null, d: `近 6 個月 ${fmt(c6, 0)} 噸`, cls: 'no', g: '航行用油 × 趕船航段占比 × 加速多耗的比例（加速 10%）；是估算。' });
      L.push({ k: '等待燒掉的油（估算）', v: F ? fmt(F.wait, 0) + ' 噸' : null, d: `近 6 個月 ${fmt(w6, 0)} 噸`, cls: 'no', g: '等待耗油占比 × 本月總油耗；依港口看下方「等待燒掉的油」。' });
    }
    U.kpis(el, L);
  }
  U.reg(['M14-c24', 'M14-b10'], kpi);

  // ---------------- 油花在哪裡（貨櫃 M14-c25、散裝 M14-b11）：依營運狀態｜依設備（｜依油種，散裝）
  function where(el, c) {
    const id = vid0(c), bulk = U.VBY[id].type === 'bulk', V = (STATE.view.fuelWhere = STATE.view.fuelWhere || { m: 'state' });
    const modes = [['state', '依營運狀態'], ['dev', '依設備']].concat(bulk ? [['fuel', '依油種']] : []);
    if (!modes.some(x => x[0] === V.m)) V.m = 'state';
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="toolbar"><span class="seg" role="group" aria-label="油花在哪裡的分法">${modes.map(([k, n]) => `<button type="button" data-fw="${k}" aria-pressed="${V.m === k}">${n}</button>`).join('')}</span></div><div data-c style="height:17rem"></div>`;
    const host = toolbarToHeader(el), box = el.querySelector('[data-c]');
    host.querySelectorAll('[data-fw]').forEach(b => (b.onclick = () => { V.m = b.dataset.fw; where(el, c); }));
    const r1 = x => (x == null ? null : Math.round(x));
    if (V.m === 'state') {
      const f = months.map((_, i) => val('FUEL_TOTAL', id, i)), ws = months.map((_, i) => val('FUEL_WAIT_SHARE', id, i)), ps = months.map((_, i) => val('FUEL_PORT_SHARE', id, i));
      if (!f.some(x => x != null)) return U.emptyChart(box, '沒有油耗資料');
      return U.stackChart(box, { yName: '噸', series: [
        { name: '航行', data: f.map((x, i) => (x == null ? null : r1(x * Math.max(0, 1 - ((ws[i] || 0) + (ps[i] || 0)) / 100)))) },
        { name: '等待（錨泊＋漂流）', data: f.map((x, i) => (x == null ? null : r1(x * (ws[i] || 0) / 100))) },
        { name: '在港', data: f.map((x, i) => (x == null ? null : r1(x * (ps[i] || 0) / 100))) }] });
    }
    if (V.m === 'dev') {
      const S = [['FUEL_ME', '主機'], ['FUEL_AE', '發電機（輔機）'], ['FUEL_BOILER', '鍋爐'], ['FUEL_OTHER', '未分項']].map(([m, n]) => ({ name: n, data: U.series(m, id).map(r1) }));
      if (!S.some(s => s.data.some(v => v != null))) return U.emptyChart(box, '這艘船的船報不分設備（沒有主機、輔機、鍋爐分項）');
      return U.stackChart(box, { yName: '噸', series: S });
    }
    U.stackChart(box, { yName: '噸', series: [['HSFO_T', 'HSFO'], ['VLSFO_T', 'VLSFO'], ['MGO_T', 'MGO（輕油）'], ['OTHER_T', '其他']].map(([m, n]) => ({ name: n, data: U.series(m, id).map(r1) })) });
  }
  U.reg(['M14-c25', 'M14-b11'], where);

  // ---------------- 等待燒掉的油（依港口，近 6 個月；M14-c26）
  U.reg('M14-c26', (el, c) => {
    if (!U.fuelOps) return U.emptyChart(el, '沒有燃油成本的計算');
    const id = vid0(c), P = {};
    for (let k = Math.max(0, c.mi - 5); k <= c.mi; k++) U.fuelOps.byPort([id], k).forEach(r => { const o = P[r.port] || (P[r.port] = { port: r.port, fuel: 0, n: 0, hr: 0 }); o.fuel += r.fuel; o.n += r.n; o.hr += r.hr; });
    const L = Object.values(P).sort((a, b) => b.fuel - a.fuel);
    if (!L.length) return U.emptyChart(el, '近 6 個月這艘船沒有等待耗油');
    el.style.height = Math.max(12, L.length * 2.1 + 4) + 'rem';
    const col = U.COL();
    U.mkChart(el, { grid: { left: 110, right: 90, top: 10, bottom: 24 }, xAxis: { type: 'value', name: '噸' }, yAxis: { type: 'category', inverse: true, data: L.map(x => pn(x.port)), axisTick: { show: false } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: p => { const x = L[p[0].dataIndex]; return `<b>${esc(pn(x.port))}</b><br>等待燒掉約 ${fmt(x.fuel, 1)} 噸<br>等待 ${x.n} 次、平均 ${fmt(x.hr / x.n, 1)} 小時`; } },
      series: [{ type: 'bar', barMaxWidth: 18, data: L.map((x, i) => ({ value: +x.fuel.toFixed(1), itemStyle: { color: i === 0 ? col.warn : col.pal[0], borderRadius: [0, 3, 3, 0] } })),
        label: { show: true, position: 'right', fontSize: 11, color: col.sub, formatter: p => fmt(p.value, 0) + ' 噸・' + L[p.dataIndex].n + ' 次' } }] });
  });

  // ---------------- 航速與油耗（貨櫃 M14-c27）：沿用散裝「航速與油耗的關係」的圖（逐日資料）
  { const f = U.getRenderer('M7-b2'); if (f) U.reg('M14-c27', f); }

  // ---------------- 主機與輔機狀況（M14-c28）：左＝打滑率與轉速（M9-c0 的圖）、右＝冷凍箱比例與發電機油耗（M9-c2 的圖）
  U.reg('M14-c28', (el, c) => {
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = '<div class="pgrid"><div><div class="bt">主機：打滑率與轉速</div><div class="pc" data-a style="height:16rem"></div></div><div><div class="bt">輔機：冷凍箱比例與發電機油耗</div><div class="pc" data-b style="height:16rem"></div></div></div>';
    const a = U.getRenderer('M9-c0'), b = U.getRenderer('M9-c2');
    if (a) a(el.querySelector('[data-a]'), c); else U.emptyChart(el.querySelector('[data-a]'), '沒有打滑率資料');
    if (b) b(el.querySelector('[data-b]'), c); else U.emptyChart(el.querySelector('[data-b]'), '沒有冷凍箱資料');
  });
})();
