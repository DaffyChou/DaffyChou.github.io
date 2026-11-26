/* M13 運務：船舶位置與預計抵港時間（簡圖）、到港預報表。貨櫃版與散裝版共用（散裝在 M13-b0、M13-b1 註冊）。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C;
  const { COL, fmt, esc, mkChart } = U;
  const HR = 3600000, NOW = CG.NOW, t = s => Date.parse(s + 'Z');
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const pn = u => (U.ports ? U.ports(u) : u);
  const noOrg = el => U.emptyChart(el, '此組織沒有運務資料（只有「模擬貨櫃公司」有）。請在上方組織選「模擬貨櫃公司」或「全部組織」。');
  const hhmm = s => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');
  const card = el => el.closest('.blk') || el;
  const V = () => (U.STATE.view.arr = U.STATE.view.arr || { c: { port: '', svc: '', who: '', days: 7 }, b: { port: '', who: '', days: 30 } });
  const rows = bulk => CG.arrivals().filter(a => a.status === 'EXPECTED' && (bulk ? (a.org === 1 || a.org === 2) : a.org === 3));
  const dur = h => (h < 0 ? '已逾期' : h < 24 ? `${Math.floor(h)} 小時` : `${Math.floor(h / 24)} 天 ${Math.floor(h % 24)} 小時`);

  // ---------------- 位置簡圖
  function positionMap(el, bulk) {
    if (!bulk && !CG.orgOk()) return noOrg(el);
    const col = COL(), lonf = l => (bulk ? l : (l < 0 ? l + 360 : l)), own = {};
    rows(bulk).filter(a => a.vid != null && a.lat != null).sort((a, b) => (a.etaCalc || a.etaRep || '') < (b.etaCalc || b.etaRep || '') ? -1 : 1).forEach(a => { if (!own[a.vid]) own[a.vid] = a; });
    const L = Object.values(own);
    if (!L.length) return U.emptyChart(el, '沒有本公司船舶的位置資料');
    el.style.height = '28rem';                                    // 船多時需要較大的圖；滑鼠滾輪可縮放，重疊的名稱自動隱藏，移到點上顯示
    const dest = new Set(L.map(a => a.unlo));
    const ptsPort = Object.entries(C.ports).filter(([u]) => dest.has(u) || L.some(a => a.last === u)).map(([u, p]) => ({ name: pn(u), value: [lonf(p[1]), p[0]] }));
    const stale = a => !a.posT || (NOW - t(a.posT)) / HR > 12;
    const ves = L.map(a => ({ name: a.name, value: [lonf(a.lon), a.lat], a, itemStyle: stale(a) ? { color: 'transparent', borderColor: col.no, borderWidth: 2 } : { color: col.pal[0] } }));
    const lines = L.filter(a => C.ports[a.unlo]).map(a => ({ coords: [[lonf(a.lon), a.lat], [lonf(C.ports[a.unlo][1]), C.ports[a.unlo][0]]] }));
    const lonLab = v => { const x = v > 180 ? v - 360 : v; return Math.abs(Math.round(x)) + (x < 0 ? '°W' : '°E'); };
    mkChart(el, {
      grid: { left: 52, right: 24, top: 24, bottom: 34 }, legend: { show: false },
      tooltip: { trigger: 'item', confine: true, backgroundColor: col.card, borderColor: col.line, textStyle: { color: col.ink, fontSize: 12 },
        formatter: p => {
          if (p.seriesName === '港口') return esc(p.name);
          if (p.seriesName !== '船') return '';
          const a = p.data.a, st = stale(a), gap = a.etaRep && a.etaCalc ? Math.abs(t(a.etaRep) - t(a.etaCalc)) / HR : null;
          return `<b>${esc(a.name)}</b>${a.svc ? '（' + esc(a.svc) + '）' : ''}<br>下一港 ${esc(pn(a.unlo))}<br>` + (st ? '<b>位置過期</b>（超過 12 小時沒更新），不顯示計算 ETA' : `計算 ETA ${hhmm(a.etaCalc)}（UTC）`) +
            `<br>回報 ETA ${hhmm(a.etaRep)}${gap != null && gap > 6 ? '（落差 ' + fmt(gap, 0) + ' 小時）' : ''}<br>位置時間 ${hhmm(a.posT)}`;
        } },
      xAxis: { type: 'value', name: '經度', scale: true, axisLabel: { formatter: lonLab }, splitLine: { show: true } },
      yAxis: { type: 'value', name: '緯度', scale: true, axisLabel: { formatter: v => Math.abs(v) + (v < 0 ? '°S' : '°N') } },
      series: [{ type: 'lines', coordinateSystem: 'cartesian2d', silent: true, lineStyle: { color: col.sub, opacity: 0.5, type: 'dashed', width: 1 }, data: lines, z: 1 },
        { type: 'scatter', name: '港口', symbol: 'rect', symbolSize: 8, itemStyle: { color: col.pal[1] }, label: { show: true, formatter: p => p.name, position: 'top', color: col.sub, fontSize: 11 }, labelLayout: { hideOverlap: true }, emphasis: { focus: 'none', label: { show: true } }, data: ptsPort, z: 2 },
        { type: 'scatter', name: '船', symbolSize: 13, data: ves, z: 3,
          label: { show: true, formatter: p => (stale(p.data.a) ? p.data.name + '（位置過期）' : p.data.name), position: 'bottom', color: col.ink, fontSize: 11 }, labelLayout: { hideOverlap: true }, emphasis: { focus: 'none', label: { show: true } } }],
      dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }, { type: 'inside', yAxisIndex: 0, filterMode: 'none' }],
    });
  }
  U.positionMap = positionMap;
  // 位置：預設「地圖」（圖層、衛星／街道／深色底圖），可切回原本的經緯度簡圖
  function posView(el, bulk) {
    const V = U.STATE.view, mode = V.posMode || 'map';
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="maptools"><span class="seg" role="group" aria-label="顯示方式"><button data-pm="map" aria-pressed="${mode === 'map'}">地圖</button><button data-pm="chart" aria-pressed="${mode === 'chart'}">簡圖（經緯度）</button></span></div><div data-pv></div>`;
    el.querySelectorAll('[data-pm]').forEach(b => (b.onclick = () => { V.posMode = b.dataset.pm; U.bus.emit(); }));
    const inner = el.querySelector('[data-pv]');
    if (mode === 'map') U.shipMap(inner, { bulk }); else { inner.style.height = '24rem'; positionMap(inner, bulk); }
  }

  // ---------------- 到港預報表（含篩選）
  function arrivalTable(el, bulk, keep, noSvc) {               // noSvc：航線改由頁首篩選，不重複                       // keep：額外的範圍篩選（運務管理的區域）
    if (!bulk && !CG.orgOk()) return noOrg(el);
    const st = V()[bulk ? 'b' : 'c'], all = rows(bulk).filter(a => !keep || keep(a));
    if (noSvc) st.svc = '';
    if (!all.length) return U.emptyChart(el, '沒有即將到港的船');
    const ports = [...new Set(all.map(a => a.unlo))].sort(), svcs = [...new Set(all.map(a => a.svc).filter(Boolean))].sort();
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="toolbar"><label class="fld">港口<select data-p><option value="">全部</option>${ports.map(p => `<option value="${p}" ${st.port === p ? 'selected' : ''}>${esc(pn(p))}</option>`).join('')}</select></label>
      ${bulk ? '' : `${noSvc ? '' : `<label class="fld">航線<select data-s><option value="">全部</option>${svcs.map(s => `<option value="${s}" ${st.svc === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`}
      <label class="fld">船舶<select data-w><option value="">全部</option><option value="own" ${st.who === 'own' ? 'selected' : ''}>本公司</option><option value="ext" ${st.who === 'ext' ? 'selected' : ''}>其他公司</option></select></label>`}
      <label class="fld">未來<select data-d>${[3, 7, 14, 30, 40].map(d => `<option value="${d}" ${st.days === d ? 'selected' : ''}>${d} 天內</option>`).join('')}</select></label><span class="note" data-c></span><span class="note">時間為 UTC</span></div>
      <div data-t></div>`;
    const q = s => card(el).querySelector(s);
    function draw() {
      let L = all.filter(a => (!st.port || a.unlo === st.port) && (!st.svc || a.svc === st.svc) && (st.who !== 'own' || a.vid != null) && (st.who !== 'ext' || a.vid == null));
      L = L.filter(a => { const e = a.etaCalc || a.etaRep; return !e || (t(e) - NOW) / HR <= st.days * 24; });
      const objs = L.map(a => {
        const h = a.etaCalc ? (t(a.etaCalc) - NOW) / HR : null, gap = a.etaRep && a.etaCalc ? Math.abs(t(a.etaRep) - t(a.etaCalc)) / HR : null;
        return Object.assign({ port: pn(a.unlo), h, gap, who: a.vid != null ? '本公司' : '其他公司', sort: h == null ? 1e9 : h }, a);
      });
      q('[data-c]').textContent = `共 ${objs.length} 筆（全部 ${all.length} 筆）`;
      const cols = [{ k: 'port', t: '港口' }, { k: 'term', t: '碼頭', h: r => (r.term ? esc(r.term) : tag('碼頭未填', 'no')) }]
        .concat(bulk ? [] : [{ k: 'svc', t: '航線', h: r => (r.svc ? esc(r.svc) : '<span class="note">其他公司</span>') }])
        .concat([{ k: 'name', t: '船名', h: r => (r.vid != null ? `<button class="lnk" data-vessel="${r.vid}">${esc(r.name)}</button>` : esc(r.name || '')) },
          { k: 'etaCalc', t: '計算 ETA', h: r => (r.etaCalc ? hhmm(r.etaCalc) : tag('位置過期', 'warn')) }, { k: 'etaRep', t: '回報 ETA', h: r => hhmm(r.etaRep) },
          { k: 'gap', t: '落差（小時）', n: true, h: r => (r.gap == null ? '—' : r.gap > 6 ? tag(fmt(r.gap, 0) + '　ETA 有落差', 'warn') : fmt(r.gap, 1)) },
          { k: 'h', t: '距抵達', n: true, h: r => (r.h == null ? '—' : dur(r.h)) }])
        .concat(bulk ? [{ k: 'cargo', t: '貨種', h: r => (r.cargo ? esc(r.cargo) : '—') }, { k: 'qty', t: '預計貨量（噸）', n: true, d: 0 }]
          : [{ k: 'teu', t: '艙位（TEU）', n: true, d: 0 }, { k: 'empties', t: '預計卸空櫃（TEU）', n: true, d: 0 }]);
      U.table(q('[data-t]'), { rows: objs, cols, sort: ['sort', 1], pageSize: 10, empty: '這個條件下沒有即將到港的船，可放寬天數或港口' });
      card(el).querySelectorAll('[data-vessel]').forEach(x => (x.onclick = () => U.go('M3', +x.dataset.vessel)));
    }
    [['[data-p]', 'port'], ['[data-s]', 'svc'], ['[data-w]', 'who']].forEach(([sel, k]) => { const n = q(sel); if (n) n.onchange = e => { st[k] = e.target.value; draw(); }; });
    q('[data-d]').onchange = e => { st.days = +e.target.value; draw(); };
    draw();
  }
  U.arrivalTable = arrivalTable;
  U.reg('M13-b0', el => arrivalTable(el, true));
  U.reg('M13-b1', el => posView(el, true));
})();
