/* M8 環保法遵、M9 機務 */
(function () {
  'use strict';
  const U = window.UI;
  const { COL, fmt, months, val, vname, esc } = U;
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const mk = c => ({ symbol: 'none', silent: true, lineStyle: { color: COL().sub, type: 'dashed' }, label: { show: false }, data: [{ xAxis: months[c.mi] }] });

  // ============================================================ M8
  // 碳排強度：兩種算法單位不同、不能比大小，改成一次只看一種（切換），不用雙 Y 軸。
  //   主線＝滾動 12 個月平均（滿 12 個月才畫），月值淡化成點；最新月份畫空心點（航次未結，配載與距離可能未完整）。
  const IM = {
    AER: { b: 'AER', unit: '克 CO₂／（載重噸·浬）', d: '法遵用，以 DWT 為容量基準，可對外' },
    CO2_TEUNM: { b: 'TEU 浬', unit: '克 CO₂／（TEU·浬）', d: '營運比較用（TEU 來自配載），不可與 AER 比大小' },
    EEOI: { b: 'EEOI', unit: '克 CO₂／（噸貨·浬）', d: '只有實際貨量的船才有；CSE 為估算，不可對外，也不可與 AER 比大小' },
  };
  // 已知事件（來源：special_event 模擬颱風；只標影響全船隊的月份）
  const IEV = { '2025-07': '2025-07 偏高：模擬颱風（7/14～7/17 港口停航），等泊時間加倍，之後加速追船期，油耗上升。' };
  function intensity(el, c, alt) {
    const V = U.STATE.view, k = V.envMetric === alt ? alt : 'AER', D = IM[k], col = COL();
    // 加權算法（與 KPI 列一致）：每月＝船隊 CO₂ 合計 ÷ 運輸量合計；滾動 12 個月＝12 個月的 CO₂ 合計 ÷ 運輸量合計。單船時與原值相同
    const W = U.envAgg ? U.envAgg.weightedSeries(k, c.vids) : { mon: U.fleetSeries(k, c.vids, 'mean'), roll: [] }, s = W.mon, roll = W.roll, L = s.length - 1;
    // IMO 要求值軌跡（只有 AER 有法規目標）：各年要求值依運輸量加權；沒有資料的年度依折減率推算（虛線）；橫軸延伸到 2028 年底
    const TR = k === 'AER' && U.envAgg ? U.envAgg.reqTrajectory(c.vids, 2028) : [], trBy = {}; TR.forEach(t => (trBy[t.year] = t));
    const ext = months.slice(); if (TR.length) { const [y0, m0] = months[L].split('-').map(Number); for (let y = y0, m = m0 + 1; y <= 2028; m++) { if (m > 12) { m = 1; y++; } if (y > 2028) break; ext.push(`${y}-${String(m).padStart(2, '0')}`); } }
    const trAt = x => trBy[+x.slice(0, 4)], lastAct = TR.filter(t => !t.est).map(t => t.year).pop();
    const trA = ext.map(x => { const t = trAt(x); return t && !t.est ? t.req : null; }), trE = ext.map(x => { const t = trAt(x); return t && (t.est || (+x.slice(0, 4) === lastAct && x.slice(5) === '12')) ? t.req : null; });
    el.classList.add('auto'); el.style.maxHeight = 'none'; el.style.display = 'flex'; el.style.flexDirection = 'column';   // 與旁邊的 CII 卡等高：圖撐滿卡片剩下的高度
    const ev = Object.keys(IEV).filter(m => { const i = months.indexOf(m), nb = U.nums([s[i - 1], s[i + 1]]);   // 只有當月確實比前後月高 5% 以上才標
      return i > 0 && s[i] != null && nb.length && s[i] > 1.05 * nb.reduce((a, b) => a + b, 0) / nb.length; });
    el.innerHTML = `<div class="toolbar"><span class="seg" role="group" aria-label="碳排強度算法">${['AER', alt].map(x => `<button type="button" data-im="${x}" aria-pressed="${x === k}">${esc(IM[x].b)}</button>`).join('')}</span>` +
      `<span class="note">${esc(D.d)}</span></div><div data-ch style="flex:1 1 auto;min-height:15rem;max-height:26rem"></div>` +
      `<div class="note" style="margin-top:.2rem">${c.vids.length > 1 ? '船隊加權（CO₂ 合計 ÷ 運輸量合計，大船、跑得多的船占比較重，和各船平均不同）。' : ''}實線是滾動 12 個月（滿 12 個月才畫），淡色點是各月值；空心點是最新月份 ${months[L]}（航次未結，配載與距離可能未完整）。` +
      (k === 'AER' ? (TR.length ? `紅色階梯是 IMO 要求值軌跡${c.vids.length > 1 ? '（CII 要求值依運輸量加權）' : '（這艘船的 CII 要求值）'}${TR.some(t => t.est) ? '，虛線年度是依折減率推算' : ''}；實線在階梯下方代表領先軌跡。` : '') : `${esc(D.b)} 沒有官方減碳目標，不畫軌跡線。`) + `${ev.map(m => esc(IEV[m])).join('')}</div>`;
    el.querySelectorAll('[data-im]').forEach(b => (b.onclick = () => { V.envMetric = b.dataset.im === 'AER' ? null : b.dataset.im; U.bus.emit(); }));
    if (!U.nums(s).length) return U.emptyChart(el.querySelector('[data-ch]'), '此範圍沒有 ' + D.b + ' 資料');
    const pts = s.map((v, i) => (v == null ? null : i === L ? { value: v, symbolSize: 8, itemStyle: { color: col.card, borderColor: col.ink, borderWidth: 1.5, opacity: 1 } } : v));
    const chEl = el.querySelector('[data-ch]'), ch = U.mkChart(chEl, {
      grid: { left: 52, right: TR.length ? 40 : 20, top: 50, bottom: 26 },          // 圖例在最上面、單位在圖例下方，窄螢幕也不會重疊
      legend: { data: ['滾動 12 個月平均', '月值'].concat(TR.length ? ['IMO 要求軌跡'] : []).concat(TR.some(t => t.est) ? ['要求軌跡（推算）'] : []), left: 0 },
      xAxis: { type: 'category', data: ext, boundaryGap: false, axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', name: D.unit + '　TtW', scale: true },          // 口徑小標：只算船上燃燒（TtW）
      tooltip: { trigger: 'axis', formatter: ps => { const i = ps[0].dataIndex, m = ext[i], t = trAt(m);
        return `${m}` + (i <= L ? `<br>月值 ${fmt(s[i], 2)}${i === L ? '（最新月份，可能未完整）' : ''}<br>滾動 12 個月 ${roll[i] == null ? '—（未滿 12 個月）' : fmt(roll[i], 2)}` : '') +
          (t ? `<br>IMO 要求值 ${fmt(t.req, 2)}${t.est ? '（推算）' : ''}` : '') + `<br><span style="opacity:.75">${esc(D.unit)}${c.vids.length > 1 ? '，船隊加權' : ''}</span>` + (IEV[m] ? `<br>${esc(IEV[m])}` : ''); } },
      series: [
        { name: '滾動 12 個月平均', type: 'line', data: roll.concat(ext.slice(L + 1).map(() => null)), showSymbol: false, connectNulls: false, lineStyle: { width: 2.5, color: col.acc }, itemStyle: { color: col.acc }, markLine: mk(c), z: 3 },
        { name: '月值', type: 'scatter', data: pts, symbolSize: 6, itemStyle: { color: col.sub, opacity: .45 }, z: 2,
          markPoint: ev.length ? { symbol: 'circle', symbolSize: 9, itemStyle: { color: col.warn }, label: { show: true, position: 'top', fontSize: 11, color: col.warn, formatter: '模擬颱風' }, data: ev.map(m => ({ coord: [m, s[months.indexOf(m)]] })) } : undefined },
      ].concat(TR.length ? [
        { name: 'IMO 要求軌跡', type: 'line', data: trA, showSymbol: false, connectNulls: false, lineStyle: { width: 1.8, color: col.bad }, itemStyle: { color: col.bad }, z: 1 },
        { name: '要求軌跡（推算）', type: 'line', data: trE, showSymbol: false, connectNulls: false, lineStyle: { width: 1.8, color: col.bad, type: 'dashed' }, itemStyle: { color: col.bad }, z: 1,
          endLabel: { show: true, formatter: '推算', color: col.bad, fontSize: 11 } },
      ] : []) });
    // 卡片高度要等旁邊的 CII 卡畫完才確定：圖的容器大小一變就重畫尺寸
    if (window.ResizeObserver) new ResizeObserver(() => { try { if (!ch.isDisposed()) ch.resize(); } catch (e) { } }).observe(chEl);
  }
  U.reg('M8-b0', (el, c) => intensity(el, c, 'EEOI'));
  U.reg('M8-c0', (el, c) => intensity(el, c, 'CO2_TEUNM'));

  // CII 評級五階連續色（好到壞），船隊點圖與單船色帶共用；顏色定義在 app.css 的 --cii-a～e
  const ciiCol = () => ({ A: U.css('--cii-a'), B: U.css('--cii-b'), C: U.css('--cii-c'), D: U.css('--cii-d'), E: U.css('--cii-e') });
  const ciiBounds = type => { const CP = window.UI_COMP.params; return (CP.bounds || {})[type === 'bulk' ? 'BULK' : 'CONTAINER'] || [0.83, 0.94, 1.07, 1.19]; };

  // 單船 CII：一般常見的呈現方式＝評級色帶（A～E 邊界逐年收緊）＋這艘船每年的實際值，並推算維持現狀時未來幾年的評級
  function ciiOne(el, c) {
    const vid = c.vids[0], col = COL(), CP = window.UI_COMP.params, v = U.VBY[vid] || {}, B = ciiBounds(v.type);   // VBY 的船型已轉小寫
    const rows = window.UI_COMP.cii.filter(x => x.vid === vid && x.att != null && x.req != null).sort((a, b) => a.year - b.year);
    if (!rows.length) return U.emptyChart(el, '這艘船沒有 CII 資料');
    const RC = ciiCol(), L = ['A', 'B', 'C', 'D', 'E'];
    const rate = r => (r < B[0] ? 'A' : r < B[1] ? 'B' : r < B[2] ? 'C' : r < B[3] ? 'D' : 'E');
    const rated = rows.filter(x => x.rating), last = rated[rated.length - 1] || rows[rows.length - 1], z = CP.z || {};
    const reqOf = y => { const r = rows.find(x => x.year === y); if (r) return r.req; const b = last; return z[y] != null && z[b.year] != null ? b.req * (1 - z[y] / 100) / (1 - z[b.year] / 100) : null; };
    const Y = []; for (let y = rows[0].year; y <= 2030; y++) Y.push(y);
    const toC = last.req * B[2], cut = 100 * (1 - toC / last.att);
    const proj = Y.map(y => { const rq = reqOf(y); return rq ? { y, rq, r: last.att / rq } : null; }).filter(Boolean);
    const firstE = proj.find(p => p.y > last.year && rate(p.r) === 'E'), firstD = proj.find(p => p.y > last.year && rate(p.r) >= 'D');
    const lo = 0.6, hi = Math.max(1.4, last.ratio + .08), pos = r => Math.max(0, Math.min(100, (r - lo) / (hi - lo) * 100));
    const segs = [lo].concat(B, [hi]);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="ci1"><div class="ci1h"><span class="ci1g" style="background:${RC[last.rating || rate(last.ratio)]};${'BCD'.includes(last.rating || rate(last.ratio)) ? 'color:#1a1a1a' : ''}">${last.rating || rate(last.ratio)}</span><div><div class="note">${last.year} 年評級（${last.days} 天資料）</div><b>實際 ${fmt(last.att, 3)}　要求 ${fmt(last.req, 3)}　比值 ${fmt(last.ratio, 3)}</b><div class="note">單位：克 CO₂／（載重噸·浬）；比值＝實際÷要求，越小越好</div></div></div>
      <div class="ci1band">${L.map((k, i) => `<i style="left:${pos(segs[i])}%;width:${pos(segs[i + 1]) - pos(segs[i])}%;background:${RC[k]}"><span>${k}</span></i>`).join('')}<b class="ci1m" style="left:${pos(last.ratio)}%"><em>${fmt(last.ratio, 2)}</em></b></div>
      <div class="ci1ax">${B.map(b => `<span style="left:${pos(b)}%">${fmt(b, 2)}<br>${fmt(last.req * b, 2)}</span>`).join('')}</div>
      <div class="ci1act">${(last.rating || rate(last.ratio)) <= 'C' ? `目前在 C 級以內；要守住 C 級，實際值需低於 <b>${fmt(toC, 3)}</b>。` : `要回到 C 級，實際值需降到 <b>${fmt(toC, 3)}</b> 以下（約減少 <b>${fmt(cut, 1)}%</b>）。`}${firstE ? ` 若維持 ${last.year} 年的實際值，要求值逐年收緊，<b>${firstE.y} 年會掉到 E 級</b>。` : firstD && (last.rating || '') < 'D' ? ` 若維持現狀，${firstD.y} 年會掉到 D 級。` : ''}</div>
      <div class="ci1c" data-ci></div><div data-ct></div></div>`;
    const bandSer = L.map((k, i) => ({ name: k + ' 級區間', type: 'line', stack: 'band', symbol: 'none', lineStyle: { width: 0 }, areaStyle: { color: RC[k], opacity: .18 }, tooltip: { show: false }, emphasis: { disabled: true },
      data: Y.map(y => { const rq = reqOf(y); if (!rq) return null; const b = [0].concat(B, [hi * 1.15]); return +(rq * (b[i + 1] - b[i])).toFixed(3); }) }));
    U.mkChart(el.querySelector('[data-ci]'), { grid: { left: 44, right: 16, top: 26, bottom: 24 }, legend: { show: true, top: 0, data: ['實際值', '維持現狀的推算'] },
      tooltip: { trigger: 'axis', confine: true, formatter: ps => { const y = Y[ps[0].dataIndex], rq = reqOf(y), a = rows.find(x => x.year === y); return `${y} 年<br>要求值 ${rq ? fmt(rq, 3) : '—'}<br>C 級上限 ${rq ? fmt(rq * B[2], 3) : '—'}` + (a ? `<br>實際值 ${fmt(a.att, 3)}（${a.rating || '未滿一年，不評級'}）` : rq && y > last.year ? `<br>維持現狀推算：${rate(last.att / rq)} 級` : ''); } },
      xAxis: { type: 'category', data: Y.map(String), boundaryGap: false, axisTick: { show: false } }, yAxis: { type: 'value', min: v => +(v.min * .9).toFixed(1), max: v => +(Math.min(v.max, last.req * hi * 1.05)).toFixed(1), splitLine: { show: false } },
      series: bandSer.concat([{ name: '實際值', type: 'line', data: Y.map(y => { const a = rows.find(x => x.year === y); return a ? { value: a.att, itemStyle: { color: a.rating ? RC[a.rating] : col.no } } : null; }), symbol: 'circle', symbolSize: 10, lineStyle: { color: col.ink, width: 2 }, z: 5, label: { show: true, position: 'top', fontSize: 11, color: col.ink, formatter: p => { const a = rows.find(x => x.year === Y[p.dataIndex]); return a ? (a.rating || '未滿一年') : ''; } } },
        { name: '維持現狀的推算', type: 'line', data: Y.map(y => (y >= last.year && reqOf(y) ? last.att : null)), symbol: 'none', lineStyle: { color: col.sub, width: 1.5, type: 'dashed' }, z: 4 }]) });
    U.table(el.querySelector('[data-ct]'), { rows: rows.map(x => ({ y: x.year, att: x.att, req: x.req, ratio: x.ratio, days: x.days, rating: x.rating })), sort: ['y', -1], pageSize: 10,
      cols: [{ k: 'y', t: '年度', n: true, h: r => String(r.y) }, { k: 'att', t: '實際值', n: true, d: 3 }, { k: 'req', t: '要求值', n: true, d: 3 }, { k: 'ratio', t: '比值', n: true, d: 3 }, { k: 'days', t: '資料天數', n: true, d: 0 },
        { k: 'rating', t: '等級', h: r => (r.rating ? tag(r.rating, r.rating >= 'E' ? 'bad' : r.rating === 'D' ? 'warn' : 'ok') : tag('未滿一年，不評級', 'no')) }] });
  }
  function cii(el, c) {
    if (c.vids.length === 1) return ciiOne(el, c);
    const set = new Set(c.vids), col = COL(), all = window.UI_COMP.cii.filter(x => set.has(x.vid) && x.att != null && x.req != null);
    const years = [...new Set(all.filter(x => x.rating).map(x => x.year))].sort(), yr = years.length ? years[years.length - 1] : 2025;
    const L = all.filter(x => x.year === yr).sort((a, b) => b.ratio - a.ratio);
    if (!L.length) return U.emptyChart(el, '沒有 CII 資料');
    const dist = {}; L.forEach(x => (dist[x.rating || '—'] = (dist[x.rating || '—'] || 0) + 1));
    // 比值點圖：船型大小不同，實際值高低不能比；改看「實際÷要求」，每艘船一點，背景是 A～E 區間，越右越差
    const RC = ciiCol(), B = ciiBounds(U.STATE.type), LV5 = ['A', 'B', 'C', 'D', 'E'];
    const rs = L.map(x => x.ratio), lo = Math.min(0.6, Math.floor((Math.min(...rs) - .05) * 20) / 20), hi = Math.max(1.4, Math.ceil((Math.max(...rs) + .05) * 20) / 20);
    const edges = [lo].concat(B, [hi]);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="note" style="margin-bottom:.3rem">${yr} 年評級：${LV5.map(k => `<b style="color:${RC[k]}">${k} ${dist[k] || 0}</b>`).join('　')}${dist['—'] ? '　不評級 ' + dist['—'] : ''}。每艘船一個點，橫軸是比值（實際值÷要求值），<b>越右越差</b>；背景是 A～E 等級區間，虛線是要求值（比值 1.0）。不同大小的船可以直接比左右位置；船名在滑鼠提示框，點一下到單船頁；各船表格在下方「CII 行動清單」的「全部船」分頁。</div>` +
      `<div id="cc" style="height:${Math.max(14, Math.min(22, 6 + L.length * .3))}rem"></div><div class="note" style="margin-top:.3rem">${esc(window.UI_COMP.params.note)}。等級邊界（比值）：${B.map(b => fmt(b, 2)).join('／')}。評級需資料天數達 330 天以上（否則不評級，畫空心點）；容量基準為 DWT。</div>`;   // 各船表格併入 CII 行動清單的「全部船」分頁（env-esg-kpi 第 10 條），這裡只留比值點圖
    U.mkChart(el.querySelector('#cc'), { grid: { left: 16, right: 24, top: 30, bottom: 40 },
      xAxis: { type: 'value', min: lo, max: hi, splitNumber: 8, name: '比值（實際值 ÷ 要求值）越小越好　TtW', nameLocation: 'middle', nameGap: 26, axisLabel: { formatter: v => fmt(v, 1), hideOverlap: true }, splitLine: { show: false } },
      yAxis: { type: 'category', data: L.map(x => vname(x.vid)), inverse: true, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false } },
      legend: { show: false },
      tooltip: { trigger: 'item', formatter: p => { const x = L[p.dataIndex]; return x ? `${esc(vname(x.vid))}<br>比值 ${fmt(x.ratio, 3)}　評級 ${x.rating || '不評級（資料不足 330 天）'}<br>實際值 ${fmt(x.att, 2)}　要求值 ${fmt(x.req, 2)}<br><span style="opacity:.75">克 CO₂／（載重噸·浬）</span>` : ''; } },
      series: [{ name: '比值', type: 'scatter', symbolSize: 9, z: 3,
        data: L.map(x => ({ value: [x.ratio, vname(x.vid)], itemStyle: x.rating ? { color: RC[x.rating], borderColor: col.card, borderWidth: 1 } : { color: col.card, borderColor: col.no, borderWidth: 1.5 } })),
        markArea: { silent: true, data: LV5.map((k, i) => [{ xAxis: edges[i], itemStyle: { color: RC[k], opacity: .16 }, label: { show: true, position: 'insideBottom', color: RC[k], fontSize: 12, fontWeight: 700, formatter: k } }, { xAxis: edges[i + 1] }]) },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: col.ink, type: 'dashed', width: 1.5 }, label: { formatter: '要求值 1.0', color: col.ink, fontSize: 11, position: 'start', distance: 4 }, data: [{ xAxis: 1 }] } }] },
      p => { const x = L[p.dataIndex]; if (p.componentType === 'series' && x) U.go('M3', x.vid); });
  }
  U.reg(['M8-b1', 'M8-c1'], cii);
  // 歐盟碳成本試算（M8-b2／c2 起）改在 blocks_carbon.js：ETS＋FuelEU，計算走 carbon_engine.js

  // ============================================================ M9
  function slip(el, c) {
    U.lineChart(el, { yName: '螺旋槳打滑率（%；船員填報）', y2: '轉速（每分鐘轉數 rpm）', legend: true,
      series: [{ name: '平均滑失率', data: U.fleetSeries('SLIP', c.vids, 'mean'), markLine: mk(c) }, { name: '平均轉速（填報值）', data: U.fleetSeries('RPM', c.vids, 'mean'), axis: 1, lineStyle: { type: 'dashed', width: 2 } }] });
  }
  U.reg(['M9-b0', 'M9-c0'], slip);
  function lube(el, c) {
    const bad = {}; window.UI_DQ.agg.forEach(([r, v, n]) => { if (r === 'LUBE_UNIT_SUSPECT' && v != null) bad[v] = (bad[v] || 0) + n; });
    const rows = c.vids.map(id => ({ id, name: vname(id), cyl: val('LUBE_MECYO', id, c.mi), sys: val('LUBE_MESYLO', id, c.mi), ae: val('LUBE_AESYLO', id, c.mi), rob: val('LUBE_MECYO_ROB', id, c.mi), bad: bad[id] || 0 }));
    el.classList.add('auto');
    el.innerHTML = '<div class="note" style="margin-bottom:.4rem">只顯示 ROB 與耗量，<b>不標健康基準線</b>：缺主機 MCR 轉速、SFOC、主機運轉時數與補油紀錄。以庫存相減產生的數千升或負的消耗是假值，已排除，不納入下表。</div><div id="lt"></div>';
    U.table(el.querySelector('#lt'), { rows, sort: ['bad', -1], onRow: r => U.go('M3', r.id),
      cols: [{ k: 'name', t: '船舶' }, { k: 'cyl', t: '汽缸油耗 L（有效）', n: true, d: 0 }, { k: 'sys', t: '主機系統油 L', n: true, d: 0 }, { k: 'ae', t: '輔機系統油 L', n: true, d: 0 }, { k: 'rob', t: '汽缸油 ROB L', n: true, d: 0 },
        { k: 'bad', t: '可疑消耗紀錄（全期）', n: true, d: 0, h: r => (r.bad ? tag(r.bad + ' 筆', 'bad') : tag('無', 'ok')) }] });
  }
  U.reg(['M9-b1', 'M9-c1'], lube);
  U.reg(['M9-b2', 'M9-c3'], el => U.emptyChart(el, '資料不足：淡水存量與消耗在統一資料表尚無欄位（GBMC 船報有）。補 report_fw 後啟用淡水預警。'));
  U.reg('M9-c2', (el, c) => U.lineChart(el, { yName: '冷凍箱占滿箱（%）', y2: '發電機油耗（噸）', legend: true, scale: false,
    series: [{ name: '冷凍箱比例', data: U.fleetSeries('REEFER_SHARE', c.vids, 'mean'), markLine: mk(c) }, { name: '發電機油耗（輔機負載代理）', data: U.fleetSeries('FUEL_AE', c.vids, 'sum'), axis: 1, lineStyle: { type: 'dashed', width: 2 } }] }));
})();
