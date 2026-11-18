/* 燃油成本與營運（M16，提案 fuel-ops-cost）的畫面。計算在 fuel_ops.js（U.fuelOps）；c.vids 已套用運務管理共用的航線篩選。
   成本一律標「示意價」，趕船多燒的油一律標「估算」。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const { fmt } = U;
  const F = () => U.fuelOps;
  const NOD = '所選航線本月沒有資料';
  const usd = v => (v == null ? null : v >= 1e4 ? fmt(v / 1e4, 0) + ' 萬美元' : fmt(v, 0) + ' 美元');
  const chg = (a, b, unit) => { if (a == null || b == null || b === 0) return { d: '上月沒有資料', cls: 'no' }; const p = 100 * (a - b) / Math.abs(b); return { d: `${p >= 0 ? '▲' : '▼'} ${fmt(Math.abs(p), 1)}% 對上月${unit || ''}`, cls: Math.abs(p) < 1 ? 'ok' : p > 0 ? 'bad' : 'ok' }; };

  // ---------------- M16-c0 重點數字列
  U.reg('M16-c0', (el, c) => {
    const k = F().kpi(c.vids, c.mi);
    if (!k.hasData) return U.emptyChart(el, NOD);
    const g1 = chg(k.cost, k.prevCost), g2 = chg(k.cpt, k.prevCpt), g3 = chg(k.catchX, k.prevCatchX), g4 = chg(k.wait, k.prevWait);
    U.kpis(el, [
      { k: '燃油成本（示意價）', v: usd(k.cost), d: g1.d, cls: g1.cls, go: 'M16-c1', g: `本月總油耗 ${fmt(k.fuel, 0)} 噸 × 油價（示意價）。油價先用每艘船當月的加權油價，沒有就用同月份全船隊加油紀錄的加權油價。` },
      { k: '每箱燃油成本（示意價）', v: k.cpt == null ? null : fmt(k.cpt, 1) + ' 美元／TEU', d: g2.d, cls: g2.cls, go: 'M16-c1', g: `燃油成本 ÷ 本月靠港的卸貨＋裝貨 ${fmt(k.teu, 0)} TEU。` },
      { k: '趕船多燒的油（估算）', v: k.catchX == null ? null : fmt(k.catchX, 0) + ' 噸', d: g3.d, cls: g3.cls, go: 'M16-c2', g: `航行用油 × 趕船航段占比 ×（1 − 1 ÷（1＋${fmt(100 * F().P.get(), 0)}%）²）。資料沒有趕船時的實際航速，預設趕船比平時快 ${fmt(100 * F().P.get(), 0)}%。` },
      { k: '等待燒掉的油', v: k.wait == null ? null : fmt(k.wait, 0) + ' 噸', d: g4.d, cls: g4.cls, go: 'M16-c3', g: '在錨地等泊與漂流時燒掉的油＝等待耗油占比 × 總油耗。' },
      { k: '油量偏低的船', v: k.low.length + ' 艘', d: k.low.length ? '剩 3 天以下或低於最低存量' : '都在 3 天以上', cls: k.low.length ? 'bad' : 'ok', go: 'M16-c5', g: '同「燃油與庫存」的剩餘天數判讀；資料過期的船不判斷。' },
    ]);
    // 點數字跳到對應的卡片（說明按鈕不觸發）
    const goes = ['M16-c1', 'M16-c1', 'M16-c2', 'M16-c3', 'M16-c5'];
    el.querySelectorAll('.kpi').forEach((x, i) => { x.classList.add('kgo'); x.title = '看下方卡片'; x.onclick = e => { if (e.target.closest('.kq')) return; const t = document.getElementById('blk-' + goes[i]); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
  });

  // ---------------- M16-c1 各航線燃油成本：每箱成本和「全部航線平均」比（基準不受篩選影響）；點一列＝頁首篩選切到那條航線
  const P = b => (U.RK.blocks[b] || {}).params || {};
  const tag = (t, k) => `<span class="tag ${k}">${t}</span>`;
  const pctTxt = v => (v == null ? '<span class="tag no">—</span>' : (v > 0 ? '+' : '') + fmt(v, 1) + '%');
  U.reg('M16-c1', (el, c) => {
    const rows = F().byRoute(c.vids, c.mi).filter(r => r.fuel != null);
    if (!rows.length) return U.emptyChart(el, NOD);
    const p = P('M16-c1'), base = F().base(c.mi);
    rows.forEach(r => { r.dev = r.cpt != null && base ? 100 * (r.cpt / base - 1) : null; r.costW = r.cost == null ? null : r.cost / 1e4; });
    const host = document.createElement('div');
    el.classList.add('auto'); el.style.maxHeight = 'none'; el.innerHTML = `<div class="note fo-note">成本為示意價。每箱燃油成本和全部航線平均（${base == null ? '—' : fmt(base, 1) + ' 美元／TEU'}）比：高 ${p.mid}% 以上標黃、${p.high}% 以上標紅。點一列只看那條航線。</div>`;
    el.appendChild(host);
    U.table(host, { rows, sort: ['costW', -1], pageSize: 15, onRow: r => { const f = U.opsFilt && U.opsFilt.F(); if (!f) return; f.region = ''; f.svc = r.code; U.bus.emit(); },
      cols: [{ k: 'code', t: '航線', h: r => `<b>${U.esc(r.code)}</b>　${U.esc(r.name)}` }, { k: 'vessels', t: '船數', n: true, d: 0 },
        { k: 'fuel', t: '油耗（噸）', n: true, d: 0 }, { k: 'costW', t: '燃油成本（萬美元）', n: true, d: 0 }, { k: 'teu', t: '裝卸（TEU）', n: true, d: 0 },
        { k: 'cpt', t: '每箱成本（美元）', n: true, h: r => { if (r.cpt == null) return tag('—', 'no'); const t = fmt(r.cpt, 1); return r.dev >= p.high ? tag(t, 'bad') : r.dev >= p.mid ? tag(t, 'warn') : t; } },
        { k: 'dev', t: '比平均', n: true, h: r => pctTxt(r.dev) },
        { k: 'dCost', t: '成本對上月', n: true, h: r => pctTxt(r.dCost) }, { k: 'dCpt', t: '每箱對上月', n: true, h: r => pctTxt(r.dCpt) }] });
    el.querySelectorAll('tbody tr').forEach(tr => { tr.style.cursor = 'pointer'; tr.title = '只看這條航線'; });
  });
  // ---------------- M16-c2 延誤 → 趕船 → 多燒的油：上方長條（多燒的油，估算），下方同一組航線的晚到、等泊、趕船占比
  U.reg('M16-c2', (el, c) => {
    const rows = F().byRoute(c.vids, c.mi).filter(r => r.catchX != null);
    if (!rows.length) return U.emptyChart(el, NOD);
    const p = P('M16-c2'), col = U.COL(), lv = r => { const v = Math.round(r.catchShare); return v >= p.high ? 'bad' : v >= p.mid ? 'warn' : ''; };   // 用畫面上顯示的整數判斷，避免 49.6 顯示 50% 卻沒標色
    rows.forEach(r => { r.xCost = r.fuel > 0 && r.cost != null ? r.catchX * r.cost / r.fuel / 1e4 : null; });
    rows.sort((a, b) => b.catchX - a.catchX);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="note fo-note">多燒的油是估算：航行用油 × 趕船航段占比 ×（1 − 1 ÷（1＋${fmt(100 * F().P.get(), 0)}%）²）；趕船航段＝航段平均航速達設計航速 98% 以上。長條顏色看趕船航段占比：${p.mid}% 以上黃、${p.high}% 以上紅。</div><div data-b></div><div data-t style="margin-top:.6rem"></div>`;
    const box = el.querySelector('[data-b]'); box.style.height = Math.max(12, rows.length * 2 + 4) + 'rem';
    U.barChart(box, { horizontal: true, data: rows.map(r => ({ name: r.code, value: Math.round(r.catchX), color: lv(r) === 'bad' ? col.bad : lv(r) === 'warn' ? col.warn : col.pal[0] })), yName: '噸（估算）', empty: NOD });
    U.table(el.querySelector('[data-t]'), { rows, sort: ['catchX', -1], pageSize: 15,
      cols: [{ k: 'code', t: '航線', h: r => `<b>${U.esc(r.code)}</b>　${U.esc(r.name)}` }, { k: 'vessels', t: '船數', n: true, d: 0 },
        { k: 'delay', t: '平均晚到（小時）', n: true, d: 1 }, { k: 'portWait', t: '平均等泊（小時）', n: true, d: 1 },
        { k: 'catchShare', t: '趕船航段占比', n: true, h: r => { if (r.catchShare == null) return tag('—', 'no'); const t = fmt(r.catchShare, 0) + '%', l = lv(r); return l ? tag(t, l) : t; } },
        { k: 'catchX', t: '多燒的油（噸，估算）', n: true, d: 0 }, { k: 'xCost', t: '換算成本（萬美元）', n: true, d: 1 }] });
  });
  // ---------------- M16-c3 等待燒掉的油：依航線／依港口切換（只重畫這張卡片，不整頁重畫）
  const V3 = () => (U.STATE.view.fo3 = U.STATE.view.fo3 || { by: 'svc' });
  function drawWait(el, c) {
    const v = V3(), p = P('M16-c3'), col = U.COL(), byPort = v.by === 'port';
    let rows, data;
    if (byPort) {
      rows = F().byPort(c.vids, c.mi).slice(0, 12);
      rows.forEach(r => { r.name = U.ports(r.port); r.costW = r.cost / 1e4; });
      data = rows.map(r => ({ name: r.name, value: Math.round(r.fuel), color: col.pal[0] }));
    } else {
      rows = F().byRoute(c.vids, c.mi).filter(r => r.wait != null && r.fuel > 0);
      rows.forEach(r => { r.share = 100 * r.wait / r.fuel; r.wCostW = r.cost != null ? r.wait * r.cost / r.fuel / 1e4 : null; r.lv = (x => (x >= p.high ? 'bad' : x >= p.mid ? 'warn' : ''))(+r.share.toFixed(1)); });
      rows.sort((a, b) => b.wait - a.wait);
      data = rows.map(r => ({ name: r.code, value: Math.round(r.wait), color: r.lv === 'bad' ? col.bad : r.lv === 'warn' ? col.warn : col.pal[0] }));
    }
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="v6bar"><span class="seg" role="group" aria-label="分組"><button type="button" data-wb="svc" aria-pressed="${!byPort}">依航線</button><button type="button" data-wb="port" aria-pressed="${byPort}">依港口（前 12）</button></span></div>
      <div class="note fo-note">${byPort ? '每艘船當月的等待油耗，依各次靠港的等待時數（錨泊＋漂流）分攤到港口。表格的油＝等待燒掉的油，萬美元＝換算成本（示意價）。' : `長條顏色看等待油耗占該航線總油耗：${p.mid}% 以上黃、${p.high}% 以上紅。表格的油＝等待燒掉的油，萬美元＝換算成本（示意價）。`}</div><div data-b></div><div data-t style="margin-top:.6rem"></div>`;
    el.querySelectorAll('[data-wb]').forEach(b => (b.onclick = () => { if (V3().by === b.dataset.wb) return; V3().by = b.dataset.wb; drawWait(el, c); }));
    if (!rows.length) { U.emptyChart(el.querySelector('[data-b]'), byPort ? '所選航線本月沒有等待紀錄' : NOD); return; }
    const box = el.querySelector('[data-b]'); box.style.height = Math.max(10, rows.length * 1.9 + 4) + 'rem';
    U.barChart(box, { horizontal: true, data, yName: '噸' });
    U.table(el.querySelector('[data-t]'), byPort
      ? { rows, sort: ['fuel', -1], pageSize: 12, cols: [{ k: 'name', t: '港口' }, { k: 'n', t: '靠港', n: true, d: 0 }, { k: 'avgHr', t: '平均等待（時）', n: true, d: 1 }, { k: 'fuel', t: '油（噸）', n: true, d: 0 }, { k: 'costW', t: '萬美元', n: true, d: 1 }] }
      : { rows, sort: ['wait', -1], pageSize: 15, cols: [{ k: 'code', t: '航線', h: r => `<b>${U.esc(r.code)}</b>` }, { k: 'wait', t: '油（噸）', n: true, d: 0 },
          { k: 'share', t: '占總油耗', n: true, h: r => { const t = fmt(r.share, 1) + '%'; return r.lv ? tag(t, r.lv) : t; } }, { k: 'portWait', t: '平均等泊（時）', n: true, d: 1 }, { k: 'wCostW', t: '萬美元', n: true, d: 1 }] });   // 快取的航線資料和各航線成本表共用，欄位名稱不能和 costW 撞
  }
  U.reg('M16-c3', (el, c) => { if (!F().kpi(c.vids, c.mi).hasData) return U.emptyChart(el, NOD); drawWait(el, c); });
  // ---------------- M16-c4 慢速航行與準點：每條航線一個點（近 6 個月），虛線分四塊；點一下＝頁首篩選切到那條航線
  U.reg('M16-c4', (el, c) => {
    const all = F().byRoute(c.vids, c.mi), rows = all.filter(r => r.speed6 != null && r.otp6 != null);
    if (!rows.length) return U.emptyChart(el, '所選航線近 6 個月沒有足夠的靠港紀錄（至少 3 次）');
    const p = P('M16-c4'), col = U.COL(), sp = p.split, qd = r => (r.speed6 < sp ? (r.otp6 >= p.mid ? '慢又準點' : '慢又不準') : (r.otp6 >= p.mid ? '快且準點' : '快卻不準'));
    const lv = r => { const v = Math.round(r.otp6); return v < p.high ? 'bad' : v < p.mid ? 'warn' : ''; };
    const xs = rows.map(r => r.speed6).concat(sp), ys = rows.map(r => r.otp6).concat(p.mid, p.high);
    const x0 = Math.floor((Math.min(...xs) - .03) * 50) / 50, x1 = Math.ceil((Math.max(...xs) + .03) * 50) / 50, y0 = Math.max(0, Math.floor((Math.min(...ys) - 8) / 10) * 10), y1 = 100;
    const worst = rows.filter(r => qd(r) === '快卻不準'), miss = all.length - rows.length;
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="note fo-note">近 6 個月。直虛線＝航速占設計航速 ${fmt(sp, 2)}（左慢右快），橫虛線＝準點率 ${p.mid}%（晚到 6 小時內算準點）。點的顏色看準點率：低於 ${p.mid}% 黃、低於 ${p.high}% 紅；點越大船越多。點一下只看那條航線。</div><div data-s style="height:20rem"></div>
      <div class="note fo-note" style="margin-top:.4rem">${worst.length ? `<b>快卻不準</b>（加速也沒準點，最要處理）：${worst.map(r => U.esc(r.code)).join('、')}` : '沒有「快卻不準」的航線'}${miss ? `；另有 ${miss} 條航線靠港紀錄不足 3 次，未畫入` : ''}</div><div data-t style="margin-top:.5rem"></div>`;
    const corner = (t, left, top) => ({ type: 'text', left, top, style: { text: t, fill: col.sub, fontSize: 11 } });
    U.mkChart(el.querySelector('[data-s]'), {
      grid: { left: 52, right: 24, top: 30, bottom: 44 }, legend: { show: false },
      xAxis: { type: 'value', name: '航速占設計航速', nameLocation: 'middle', nameGap: 28, min: x0, max: x1, axisLabel: { formatter: v => fmt(v, 2), showMaxLabel: false, showMinLabel: false } },
      yAxis: { type: 'value', name: '準點率（%）', min: y0, max: y1 },
      tooltip: { trigger: 'item', formatter: q => { const r = rows[q.dataIndex]; return `<b>${U.esc(r.code)}</b> ${U.esc(r.name)}<br>航速占設計航速 ${fmt(r.speed6, 2)}<br>準點率 ${fmt(r.otp6, 0)}%（${r.otpN} 次靠港）<br>${r.vessels} 艘　${qd(r)}`; } },
      graphic: [corner('慢又準點', 60, 34), corner('快且準點', '78%', 34), corner('慢又不準', 60, '76%'), corner('快卻不準', '78%', '76%')],
      series: [{ type: 'scatter', data: rows.map(r => ({ value: [r.speed6, r.otp6], symbolSize: 10 + r.vessels * 2.5, itemStyle: { color: lv(r) === 'bad' ? col.bad : lv(r) === 'warn' ? col.warn : col.pal[0], opacity: .85 } })),
        label: { show: true, position: 'right', color: col.ink, fontSize: 11, formatter: q => rows[q.dataIndex].code },
        markLine: { symbol: 'none', silent: true, label: { show: false }, lineStyle: { color: col.sub, type: 'dashed' }, data: [{ xAxis: sp }, { yAxis: p.mid }] } }],
    }, q => { const r = rows[q.dataIndex], f = U.opsFilt && U.opsFilt.F(); if (!r || !f || q.componentType !== 'series') return; f.region = ''; f.svc = r.code; U.bus.emit(); });
    const QO = { '快卻不準': 0, '慢又不準': 1, '快且準點': 2, '慢又準點': 3 };
    rows.forEach(r => { r.q = qd(r); r.qo = QO[r.q]; });
    U.table(el.querySelector('[data-t]'), { rows, sort: ['qo', 1], pageSize: 15, cols: [{ k: 'code', t: '航線', h: r => `<b>${U.esc(r.code)}</b>` }, { k: 'qo', t: '位置', h: r => (r.qo === 0 ? tag(r.q, 'bad') : r.qo === 1 ? tag(r.q, 'warn') : U.esc(r.q)) },
      { k: 'speed6', t: '航速比', n: true, d: 2 }, { k: 'otp6', t: '準點率', n: true, h: r => { const t = fmt(r.otp6, 0) + '%', l = lv(r); return l ? tag(t, l) : t; } }, { k: 'vessels', t: '船數', n: true, d: 0 }] });
  });
  // ---------------- M16-c5 油量與下一加油港：同「燃油與庫存」的剩餘天數與加油計畫，加上航線，跟著頁首篩選
  U.reg('M16-c5', (el, c) => {
    const R = n => U.risk.rows(n), lim = 3, limH = 1.5,   // 貨櫃門檻同 rob_remain：3 天留意、1.5 天或低於最低存量要處理
      bunkerPorts = new Set(R('bunker').map(r => r.port)), prices = {};
    R('bunker').forEach(r => { if (r.price != null && r.t >= U.months[Math.max(0, c.mi - 5)] + '-01') { const o = prices[r.port] || (prices[r.port] = { w: 0, q: 0 }); o.w += r.price * r.qty; o.q += r.qty; } });
    const rows = c.vids.map(id => {
      const v = U.VBY[id], s = U.SN.snap[id] || {}, svc = (U.M.services || []).find(x => x.id === v.svc), ports = svc ? svc.ports.slice(0, -1) : [];
      const st = s.stale ? '資料過期' : s.remain == null ? '資料不足' : s.below ? '已低於最低存量' : s.remain <= limH ? '要處理' : s.remain <= lim ? '留意' : '正常';
      const last = R('calls').filter(k => k.vid === id).sort((a, b) => (a.nor < b.nor ? 1 : -1))[0];
      let next = null; if (last && ports.length) { const i = ports.indexOf(last.port); for (let k = 1; k <= ports.length; k++) { const q = ports[(i + k) % ports.length]; if (bunkerPorts.has(q)) { next = q; break; } } }
      return { id, name: v.name, svc: svc ? svc.code : '—', rob: s.rob_res, rate: s.rate, remain: s.stale ? null : s.remain, rk: s.stale || s.remain == null ? 1e9 : s.remain, st, next: next ? U.ports(next) : '—', price: next && prices[next] ? prices[next].w / prices[next].q : null };
    });
    const stTag = { '資料過期': tag('資料過期', 'warn'), '資料不足': tag('資料不足', 'no'), '已低於最低存量': tag('已低於最低存量', 'bad'), '要處理': tag('要處理', 'bad'), '留意': tag('留意', 'warn'), '正常': tag('正常', 'ok') };
    el.classList.add('auto'); el.style.maxHeight = 'none'; el.innerHTML = `<div class="note fo-note">剩餘天數＝（最新庫存 − 最低存量）÷ 近 30 天日耗。${lim} 天以下留意，${limH} 天以下或已低於最低存量要處理；資料過期的船不判斷、排在最後。下一個可加油港依航線港序往後找有加油紀錄的港口；油價為示意價。點一列看單船頁。</div><div data-t></div>`;
    U.table(el.querySelector('[data-t]'), { rows, sort: ['rk', 1], pageSize: 10, onRow: r => U.go('M3', r.id), empty: NOD,
      cols: [{ k: 'name', t: '船名' }, { k: 'svc', t: '航線' }, { k: 'rob', t: '殘油庫存（噸）', n: true, d: 0 }, { k: 'rate', t: '日耗（噸）', n: true, d: 1 },
        { k: 'rk', t: '剩餘天數', n: true, h: r => (r.remain == null ? tag('—', 'no') : r.remain <= lim ? `<b>${fmt(r.remain, 1)}</b>` : fmt(r.remain, 1)) }, { k: 'st', t: '狀態', h: r => stTag[r.st] },
        { k: 'next', t: '下一個可加油港' }, { k: 'price', t: '該港油價（美元／噸）', n: true, d: 0 }] });
  });
})();
