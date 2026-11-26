/* 船隊營運總覽（fleet-overview-replan）的畫面：營運總覽代表卡（船期、港口、貨量、法遵；燃油沿用 M1-c1）、
   航線績效（點一列在右側開航線詳情）、延誤原因歸納、裝卸量趨勢。計算在 risk_fleetov.js（U.fleetOv）。 */
(function () {
  'use strict';
  const U = window.UI, { fmt, esc, months, STATE } = U;
  const F = () => U.fleetOv;
  const pn = u => (U.ports ? U.ports(u) : u);
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const LVN = { high: ['要處理', 'bad'], mid: ['留意', 'warn'], low: ['順暢', 'ok'], nodata: ['資料不足', 'no'] };
  const otpC = v => (v == null ? '' : v < 60 ? 'bad' : v < 75 ? 'warn' : '');
  const orgOk = el => { if (!U.cargo.orgOk()) { U.emptyChart(el, '此組織沒有運務資料（只有「模擬貨櫃公司」有）。'); return false; } return true; };
  const scopeIds = () => (U.opsFilt && U.opsFilt.vids ? U.opsFilt.vids() : F().own());
  function toolbarToHeader(el) {   // 切換列放卡片標題列；重畫時取代舊的（不會出現兩份）
    const tb = el.querySelector(':scope > .toolbar'), tools = el.closest('.blk') && el.closest('.blk').querySelector('[data-tools]');
    if (tb && tools) { tools.querySelectorAll('.toolbar').forEach(x => x.remove()); tools.appendChild(tb); }
    return tools || el;
  }

  // 代表卡的「看更多 →」（app.js 依這張表在標題列放連結）
  U.MORE = { 'M15-c16': ['opsroute', '航線績效'], 'M15-c17': ['opsov', '即時動態地圖'], 'M15-c18': ['cargovol', '貨務'], 'M1-c1': ['fuelops', '燃油成本'], 'M15-c20': ['env', '環保法遵'] };

  // ---------------- 船期代表卡（M15-c16）
  U.reg('M15-c16', (el, c) => {
    if (!orgOk(el)) return;
    const ids = F().own(), rs = F().routes(ids, c.mi).filter(r => r.otp != null).slice(0, 3);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="ovsplit"><div data-c style="height:14rem"></div><div><div class="bt">本月準點率最低的航線</div>${rs.length ? `<div class="ovlist">${rs.map(r => `<div class="ovrow"><b>${esc(r.code)}</b><span class="note">${esc(r.name)}</span><span class="${otpC(r.otp)}">${fmt(r.otp, 0)}%</span></div>`).join('')}</div>` : '<div class="note">沒有資料</div>'}</div></div>`;
    U.lineChart(el.querySelector('[data-c]'), { yName: '準點率（%）', series: [{ name: '全船隊平均準點率', data: U.fleetSeries('OTP', ids, 'mean').map(v => (v == null ? null : +v.toFixed(1))) }] });
  });
  // ---------------- 港口代表卡（M15-c17）
  U.reg('M15-c17', (el) => {
    if (!orgOk(el) || !U.portBoard) return;
    const B = U.portBoard().slice().sort(U.portBoardSort).slice(0, 5);
    if (!B.length) return U.emptyChart(el, '沒有港口資料');
    U.table(el, { pageSize: 5, rows: B.map(b => ({ name: b.name, lv: b.level, idx: b.idx, wait: b.wait, max: b.maxWait })),
      cols: [{ k: 'name', t: '港口', h: r => '<b>' + esc(r.name) + '</b>' }, { k: 'lv', t: '港口等級', h: r => tag(LVN[r.lv][0], LVN[r.lv][1]) }, { k: 'idx', t: '塞港指數', n: true, d: 0 }, { k: 'wait', t: '在錨船數', n: true, d: 0 }, { k: 'max', t: '最長等待（小時）', n: true, d: 1 }] });
  });
  // ---------------- 貨量代表卡（M15-c18）
  U.reg('M15-c18', (el, c) => {
    if (!orgOk(el)) return;
    const ids = F().own(), a = F().monthTeu(ids, c.mi), b = c.mi > 0 ? F().monthTeu(ids, c.mi - 1) : 0, s = U.fleetAt('SLOT_UTIL', ids, c.mi, 'mean'), d = b ? 100 * (a - b) / b : null;
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="pkpi"><div class="pk"><div class="note">本月艙位利用率</div><b>${s == null ? '—' : fmt(s, 1) + '%'}</b><div class="note">全船隊平均</div></div><div class="pk"><div class="note">本月裝卸</div><b>${fmt(a, 0)} TEU</b><div class="note ${d != null && d <= -10 ? 'bad' : ''}">${d == null ? '上月無資料' : (d >= 0 ? '▲ ' : '▼ ') + fmt(Math.abs(d), 0) + '% 對上月'}</div></div></div><div data-c style="height:10rem"></div>`;
    U.lineChart(el.querySelector('[data-c]'), { yName: '艙位利用率（%）', series: [{ name: '艙位利用率', data: U.fleetSeries('SLOT_UTIL', ids, 'mean').map(v => (v == null ? null : +v.toFixed(1))) }] });
  });
  // ---------------- 法遵代表卡（M15-c20）
  U.reg('M15-c20', function draw(el) {   // 點長條或上方數字卡（D、E、明年可能掉級）→ 下方列出那些船；再點一次收起；點船名到單船「環保法遵」
    const col = U.COL(), ids = F().own(), V = (STATE.view.ciiPick = STATE.view.ciiPick || { k: null });
    const A = U.envAgg, y = A && A.ciiLatestYear ? A.ciiLatestYear(ids) : null, nx = y != null && A.ciiNextYear ? A.ciiNextYear(ids, y) : [], NX = Object.fromEntries(nx.map(x => [x.vid, x]));
    const rows = ids.map(id => { const c = (U.risk.byVessel(id) || {}).cii || {}, k = (c.text || '').trim().charAt(0), v = U.VBY[id]; return { id, name: v.name, cls: v.cls || '', svc: F().codeOf(id) || '—', k, ratio: c.value != null ? c.value : null, nx: NX[id] || null }; /* 逐船評估的 cii.value＝比值（實際÷要求） */ }).filter(r => 'ABCDE'.includes(r.k) && r.k);
    const cnt = { A: 0, B: 0, C: 0, D: 0, E: 0 }; rows.forEach(r => cnt[r.k]++);
    if (!rows.length) return U.emptyChart(el, '沒有已評級的碳強度資料');
    const C2 = { A: col.ok, B: col.ok, C: col.pal[0], D: col.warn, E: col.bad }, pick = V.k;
    const fade = h => (/^#[0-9a-f]{6}$/i.test(h) ? h + '59' : h);   // 沒被選的長條變淡
    const kpi = (k, label, val, sub, cls) => `<button type="button" class="pk cpk${pick === k ? ' on' : ''}" data-cp="${k}" aria-pressed="${pick === k}"><div class="note">${label}</div><b class="${cls}">${val}</b><div class="note">${sub}</div></button>`;
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="pkpi sv4"><div class="pk"><div class="note">已評級（${y || '—'} 年）</div><b>${rows.length} 艘</b><div class="note">本公司貨櫃船・點長條看那些船</div></div>${kpi('D', 'D 級', cnt.D + ' 艘', '留意', cnt.D ? 'warn' : '')}${kpi('E', 'E 級', cnt.E + ' 艘', '依法要提出改善計畫', cnt.E ? 'bad' : '')}${kpi('next', '明年可能掉級', nx.length + ' 艘', '要求值收緊後', nx.length ? 'warn' : '')}</div><div data-c style="height:11rem"></div><div data-l></div>`;
    const toggle = k => { V.k = V.k === k ? null : k; draw(el); };
    el.querySelectorAll('[data-cp]').forEach(b => (b.onclick = () => toggle(b.dataset.cp)));
    const ks = Object.keys(cnt);
    U.barChart(el.querySelector('[data-c]'), { horizontal: true, yName: '船數', data: ks.map(k => ({ name: k + ' 級', value: cnt[k], color: pick && pick !== k ? fade(C2[k]) : C2[k] })), onClick: p => { const k = ks[p.dataIndex]; if (k) toggle(k); } });
    const L = !pick ? [] : pick === 'next' ? rows.filter(r => r.nx) : rows.filter(r => r.k === pick), box = el.querySelector('[data-l]');
    if (!pick) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="cpl-h"><b>${pick === 'next' ? '明年可能掉級' : pick + ' 級'}：${L.length} 艘</b><span class="note">依比值由差到好排序（比值＝實際 ÷ 要求，越小越好）；點船名到單船「環保法遵」</span><button type="button" class="lnk" data-cpx>收起</button></div><div data-t></div>`;
    box.querySelector('[data-cpx]').onclick = () => toggle(pick);
    if (!L.length) return U.emptyChart(box.querySelector('[data-t]'), '沒有船');
    U.table(box.querySelector('[data-t]'), { pageSize: 10, sort: ['ratio', -1], onRow: r => { STATE.vessel = r.id; U.IA.setLoc(3, 's_env'); U.bus.emit(); window.scrollTo(0, 0); },
      rows: L.map(r => ({ id: r.id, name: r.name, cls: r.cls, svc: r.svc, k: r.k, ratio: r.ratio, nx: r.nx })),
      cols: [{ k: 'name', t: '船名', h: r => `<span class="cpn">${esc(r.name)} →</span>` }, { k: 'cls', t: '級距' }, { k: 'svc', t: '航線' },
        { k: 'k', t: '今年評級', h: r => tag(r.k + ' 級', r.k === 'E' ? 'bad' : r.k === 'D' ? 'warn' : 'ok') }, { k: 'ratio', t: '比值（實際÷要求）', n: true, d: 2 },
        { k: 'nx', t: '明年可能掉級', h: r => (r.nx ? tag('→ ' + r.nx.next + ' 級', 'warn') : '<span class="note">—</span>') }] });
  });

  // ---------------- 航線績效（M15-c21）：點一列開航線詳情
  function openRoute(code) {
    let d = document.getElementById('rtDrawer');
    if (!d) { d = document.createElement('aside'); d.id = 'rtDrawer'; d.className = 'evd rtd'; d.setAttribute('aria-label', '航線詳情'); document.body.appendChild(d); }
    if (U.closeRight) U.closeRight('rtDrawer');
    d.innerHTML = `<div class="psh"><b>航線詳情</b><button type="button" class="btn" data-rtx>關閉 ✕</button></div><div data-bd></div>`;
    const body = d.querySelector('[data-bd]'); U.routeDetail.render(body, code);
    d.querySelector('[data-rtx]').onclick = () => d.classList.remove('open');
    body.querySelectorAll('[data-ru]').forEach(b => (b.onclick = () => { STATE.bd = STATE.bd || {}; STATE.bd.sel = b.dataset.ru; d.classList.remove('open'); U.IA.setLoc(1, 'opsov'); U.bus.emit(); window.scrollTo(0, 0); }));   // 停靠港：到營運總控台看港口詳情
    body.querySelectorAll('[data-rv]').forEach(b => (b.onclick = () => { d.classList.remove('open'); U.go('M3', +b.dataset.rv); }));   // 航線上的船：到單船總覽
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('open')));
  }
  U.openRouteDrawer = openRoute;
  U.reg('M15-c21', (el, c) => {
    if (!orgOk(el)) return;
    const rs = F().routes(scopeIds(), c.mi);
    if (!rs.length) return U.emptyChart(el, '這個範圍沒有航線');
    U.table(el, { pageSize: 15, sort: ['otp', 1], onRow: r => openRoute(r.code), rows: rs.map(r => Object.assign({}, r, { otpS: r.otp == null ? 999 : r.otp })),
      cols: [{ k: 'code', t: '航線', h: r => `<b>${esc(r.code)}</b> <span class="note">${esc(r.name)}</span>` }, { k: 'n', t: '船數', n: true, d: 0 },
        { k: 'otp', t: '本月準點率', n: true, h: r => (r.otp == null ? '—' : `<span class="${otpC(r.otp)}">${fmt(r.otp, 0)}%</span>`) }, { k: 'otp6', t: '近 6 個月準點率', n: true, h: r => (r.otp6 == null ? '—' : `<span class="${otpC(r.otp6)}">${fmt(r.otp6, 0)}%</span>`) },
        { k: 'delay', t: '平均到港延誤（小時）', n: true, d: 1 }, { k: 'slot', t: '艙位利用率', n: true, h: r => (r.slot == null ? '—' : fmt(r.slot, 1) + '%') }, { k: 'teu', t: '本月裝卸 TEU', n: true, d: 0 },
        { k: 'fpt', t: '每箱燃油（噸／TEU）', n: true, d: 3 }, { k: 'al', t: '警報', n: true, h: r => (r.al ? `${r.al}${r.alHi ? ` <b class="bad">(${r.alHi})</b>` : ''}` : '0') }] });
  });

  // ---------------- 延誤原因歸納（M15-c22）：依航線｜依港口
  U.reg('M15-c22', function draw(el, c) {
    if (!orgOk(el)) return;
    const V = (STATE.view.dlyBy = STATE.view.dlyBy || { by: 'svc' }), D = F().delays(scopeIds(), c.mi, V.by).slice(0, V.by === 'port' ? 15 : 20), col = U.COL();
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="toolbar"><span class="seg" role="group" aria-label="依航線或依港口"><button type="button" data-dby="svc" aria-pressed="${V.by === 'svc'}">依航線</button><button type="button" data-dby="port" aria-pressed="${V.by === 'port'}">依港口</button></span></div><div data-c></div>`;
    toolbarToHeader(el).querySelectorAll('[data-dby]').forEach(b => (b.onclick = () => { V.by = b.dataset.dby; draw(el, c); }));
    const box = el.querySelector('[data-c]');
    if (!D.length) return U.emptyChart(box, '近 6 個月靠港樣本不足（每組至少 3 次）');
    box.style.height = Math.max(12, D.length * 1.9 + 5) + 'rem';
    const nm = o => (V.by === 'port' ? pn(o.k) : o.k), S = [['prop', '上一港傳遞', '#a371f7'], ['wait', '港口等泊（超過平常）', col.warn], ['over', '港內作業超時', col.bad], ['sea', '航行段（含天候、慢速）', col.pal[0]]];
    U.mkChart(box, { grid: { left: 110, right: 30, top: 34, bottom: 24 }, legend: { show: true, top: 0 }, xAxis: { type: 'value', name: '小時／次' }, yAxis: { type: 'category', inverse: true, data: D.map(nm), axisTick: { show: false } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: p => { const o = D[p[0].dataIndex]; return `<b>${esc(nm(o))}</b>（${o.n} 次靠港）<br>平均到港延誤 ${fmt(o.arr, 1)} 小時<br>${S.map(s => `${s[1]}：${fmt(o[s[0]], 1)} 小時`).join('<br>')}${o.bft != null ? `<br>航行段平均風級 ${fmt(o.bft, 1)}` : ''}`; } },
      series: S.map(([k, n, cc]) => ({ name: n, type: 'bar', stack: 'a', barMaxWidth: 18, itemStyle: { color: cc }, data: D.map(o => +o[k].toFixed(2)), emphasis: { disabled: true } })) });
  });

  // ---------------- 裝卸量趨勢（M15-c23）：依航線｜依港口；前 6 名，其餘併為其他
  U.reg('M15-c23', function draw(el, c) {
    if (!orgOk(el)) return;
    const V = (STATE.view.volBy = STATE.view.volBy || { by: 'svc' }), G = F().volume(F().own(), V.by);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="toolbar"><span class="seg" role="group" aria-label="依航線或依港口"><button type="button" data-vby="svc" aria-pressed="${V.by === 'svc'}">依航線</button><button type="button" data-vby="port" aria-pressed="${V.by === 'port'}">依港口</button></span></div><div data-c style="height:20rem"></div>`;
    toolbarToHeader(el).querySelectorAll('[data-vby]').forEach(b => (b.onclick = () => { V.by = b.dataset.vby; draw(el, c); }));
    const box = el.querySelector('[data-c]');
    if (!G.length) return U.emptyChart(box, '沒有裝卸紀錄');
    const top = G.slice(0, 6), rest = G.slice(6), nm = k => (V.by === 'port' ? pn(k) : k);
    const ser = top.map(o => ({ name: nm(o.k), d: o.dis, l: o.load })).concat(rest.length ? [{ name: `其他 ${rest.length} ${V.by === 'port' ? '港' : '條'}`, d: months.map((_, i) => rest.reduce((s, o) => s + o.dis[i], 0)), l: months.map((_, i) => rest.reduce((s, o) => s + o.load[i], 0)), other: true }] : []);
    const f0 = Math.max(0, months.findIndex((_, i) => ser.some(s => s.d[i] + s.l[i] > 0)));   // 從有裝卸資料的月份開始畫（靠港紀錄沒有涵蓋全部月份）
    const MX = months.slice(f0);
    U.mkChart(box, { legend: { show: true, top: 0, type: 'scroll' }, grid: { left: 56, right: 20, top: 34, bottom: 30 }, xAxis: { type: 'category', data: MX, axisLabel: { hideOverlap: true } }, yAxis: { type: 'value', name: 'TEU（卸＋裝）' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: p => `<b>${esc(MX[p[0].dataIndex])}</b><br>` + p.filter(x => x.value).map(x => { const s = ser[x.seriesIndex], i = x.dataIndex + f0; return `${esc(s.name)}：${fmt(x.value, 0)} TEU（卸 ${fmt(s.d[i], 0)}・裝 ${fmt(s.l[i], 0)}）`; }).join('<br>') },
      series: ser.map(s => Object.assign({ name: s.name, type: 'bar', stack: 'a', emphasis: { disabled: true }, data: s.d.slice(f0).map((v, i) => v + s.l[i + f0] || null) }, s.other ? { itemStyle: { color: U.COL().no } } : {})) });
  });
})();
