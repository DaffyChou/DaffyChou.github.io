/* 運務地圖：船舶位置、前往方向、港口壅塞、錨地與泊位、航線、歐盟港口與排放管制區等圖層，可切換衛星／街道／深色底圖。
   底圖圖磚來自 Esri（需要網路，不需金鑰）；沒有網路時仍會顯示船與港口，只是沒有底圖。圖層與篩選記在 STATE.view.map。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C, { COL, fmt, esc, STATE } = U;
  const HR = 3600000, NOW = CG.NOW, ts = s => Date.parse(s + 'Z');
  const pn = u => (U.ports ? U.ports(u) : u);
  const hhmm = s => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');
  const EU = new Set(['NL', 'DE', 'BE', 'FR', 'ES', 'IT', 'GR', 'PT', 'IE', 'DK', 'SE', 'FI', 'PL', 'HR', 'SI', 'MT', 'CY', 'EE', 'LV', 'LT', 'RO', 'BG']);
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const BASES = {
    sat: { name: '衛星', url: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 17 },
    street: { name: '街道', url: ESRI + 'World_Street_Map/MapServer/tile/{z}/{y}/{x}', max: 17 },
    dark: { name: '深色', url: ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', max: 16 },
  };
  U.mapBases = BASES;                              // 空櫃存量地圖（blocks_stockmap.js）共用同一份底圖網址；外部網址只寫在本檔
  const LAYERS = [
    ['vessel', '船舶位置', true], ['route', '船的下一段航跡', true], ['cong', '港口壅塞', true], ['anchor', '錨地與泊位', false],
    ['service', '航線（整條循環）', false], ['eu', '歐盟港口與管制區', false], ['peers', '同航線其他船', true],   // peers：只在單船航行地圖出現
  ];
  // 圖資面板「圖層」卡片的示意小圖（與地圖上的畫法一致）
  const TRI = (x, y, r, c) => `<path transform="translate(${x} ${y}) rotate(${r})" d="M0 -6 L5 6 L0 3.5 L-5 6 Z" fill="${c}" stroke="#fff" stroke-width=".8"/>`;
  const PIN = (x, y, c, s) => `<circle cx="${x}" cy="${y}" r="${s || 6}" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
  const SV = b => `<svg viewBox="0 0 64 40" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="64" height="40" fill="#2b2f36"/><path d="M0 30 Q14 22 24 27 T46 24 T64 18 V40 H0Z" fill="#3a3f47"/>${b}</svg>`;
  const LYICON = {
    vessel: SV(TRI(16, 14, 60, '#3fb950') + TRI(34, 24, 110, '#f5a623') + TRI(50, 12, 30, '#f85149') + TRI(26, 33, 80, '#3fb950')),
    route: SV('<path d="M14 28 L30 18 L50 12" fill="none" stroke="#c9d1d9" stroke-width="1.6" stroke-dasharray="3 3"/>' + TRI(14, 28, 58, '#3fb950') + PIN(50, 12, '#3fb950', 4)),
    cong: SV(PIN(16, 16, '#3fb950') + PIN(34, 26, '#f5a623') + PIN(50, 14, '#f85149')),
    anchor: SV(PIN(18, 20, '#3fb950') + '<rect x="26" y="14" width="34" height="12" rx="2" fill="#161b22" stroke="#8b949e" stroke-width=".8"/><text x="43" y="22.4" font-size="6.5" fill="#e6edf3" text-anchor="middle">錨 3｜泊 5</text>'),
    service: SV('<path d="M6 30 C18 6 34 34 58 10" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="5"/><path d="M6 30 C18 6 34 34 58 10" fill="none" stroke="#a371f7" stroke-width="2.6"/>' + [[12, 21, 1], [32, 22, 2], [52, 13, 3]].map(([x, y, n]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="#a371f7" stroke="#fff" stroke-width="1"/><text x="${x}" y="${y + 2.4}" font-size="6.5" font-weight="700" fill="#fff" text-anchor="middle">${n}</text>`).join('')),
    peers: SV(TRI(20, 22, 70, '#8b949e') + TRI(44, 16, 70, '#8b949e') + '<circle cx="32" cy="20" r="9" fill="none" stroke="#58a6ff" stroke-width="1.6"/>' + TRI(32, 20, 70, '#3fb950')),
    eu: SV('<circle cx="22" cy="20" r="9" fill="none" stroke="#58a6ff" stroke-width="2"/>' + PIN(22, 20, '#3fb950', 4) + '<ellipse cx="46" cy="20" rx="13" ry="11" fill="#e3b341" fill-opacity=".12" stroke="#e3b341" stroke-width="1.5" stroke-dasharray="3 2"/>'),
  };
  const maps = [];
  // 所有 Leaflet 地圖（運務地圖、空櫃地圖…）都登記起來：選單收合／展開後一起重算大小
  U._allMaps = U._allMaps || []; if (window.L && L.Map && !L.Map._ufHook) { L.Map._ufHook = true; L.Map.addInitHook(function () { U._allMaps.push(this); }); }
  U.invAllMaps = () => { U._allMaps = U._allMaps.filter(m => m._container && m._container.isConnected && m._mapPane); U._allMaps.forEach(m => U.mapInv(m, { pan: false })); };
  const OFFS = [-360, 0, 360];                    // 跨日期變更線的航路經度會超過 180，所以船、港口與航路各畫三份世界（左、中、右），平移地圖時才接得起來
  const wrap = x => ((((x + 180) % 360) + 360) % 360) - 180;
  const ROUTES = () => (C.routes || { v: {}, leg: {} });
  U.mapInv = (m, o) => { try { if (m && m._mapPane && m._container && m._container.isConnected) m.invalidateSize(o); } catch (e) { } };   // 地圖已被移除（畫面重畫）時不重算大小，避免 Leaflet 報錯
  U.disposeMaps = () => { maps.splice(0).forEach(m => { try { m.remove(); } catch (e) { } }); };


  // ---- 船舶圖示：有船頭方向；縮小時是固定大小的船形圖示，放大到船身夠長（約 22 像素以上）就畫成真實尺寸的船形
  const LOA_T = [[1000, 150], [2500, 215], [5000, 280], [8000, 335], [14000, 366], [20000, 400]];
  const loaOf = teu => {                                 // 艙位 TEU → 船長（公尺），依常見貨櫃船尺寸內插（示意）
    const t = Math.max(1000, Math.min(20000, teu || 5000));
    for (let i = 1; i < LOA_T.length; i++) if (t <= LOA_T[i][0]) { const [x0, y0] = LOA_T[i - 1], [x1, y1] = LOA_T[i]; return y0 + (y1 - y0) * (t - x0) / (x1 - x0); }
    return 400;
  };
  const bearing = (a, b) => { const dx = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), dy = b[0] - a[0]; return ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360; };
  function headingOf(a, path, port) {                    // 船頭朝向：沿航路下一個點；沒有航路就朝下一港
    if (path) for (let i = 1; i < path.length; i++) if (Math.abs(path[i][0] - a.lat) + Math.abs(path[i][1] - a.lon) > 0.03) return bearing([a.lat, a.lon], path[i]);
    if (port) { let lon = port[1]; if (Math.abs(lon - a.lon) > 180) lon += lon < a.lon ? 360 : -360; return bearing([a.lat, a.lon], [port[0], lon]); }
    return 0;
  }
  const localPts = (lat, lon, hd, loc) => {              // 局部座標 [橫向, 縱向]（公尺）→ 經緯度
    const th = hd * Math.PI / 180, kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574;
    return loc.map(([x, y]) => [lat + (y * Math.cos(th) - x * Math.sin(th)) / ky, lon + (y * Math.sin(th) + x * Math.cos(th)) / kx]);
  };
  const rectLoc = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // 放大到船身夠長時，在船形上加船橋（船尾）與一排排貨櫃堆（藍＝滿櫃、灰＝空櫃、綠＝冷櫃、紅＝危險櫃；依這艘船的貨櫃組成與固定亂數排列，是示意）
  function shipDetail(a, lat, lon, hd, L, B, add) {
    const col = COL(), vc = (C.vcargo || {})[a.vid], seed = (+a.vid || 1) * 2654435761;
    let sd = seed >>> 0; const rnd = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const n = Math.max(6, Math.min(14, Math.round(L / 32))), y0 = -L * .2, y1 = L * .4, bl = (y1 - y0) / n;
    const onb = vc && vc[0] ? vc[0] : 1, rf = vc ? vc[3] : 0, dg = vc ? vc[4] : 0, emp = vc ? vc[2] : onb * .2;
    const nEmp = Math.round(n * emp / onb), nRf = rf > 0 ? Math.max(1, Math.round(n * rf / onb * 2)) : 0, nDg = dg > 0 ? Math.max(1, Math.round(n * dg / onb * 2)) : 0;
    const kinds = []; for (let i = 0; i < n; i++) kinds.push(i < nDg ? 4 : i < nDg + nRf ? 3 : i < nDg + nRf + nEmp ? 2 : 1);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    const fill = { 1: col.pal[0], 2: col.no, 3: col.ok, 4: col.bad }, put = (loc, o) => add(L2.polygon(localPts(lat, lon, hd, loc), Object.assign({ interactive: false }, o)));
    kinds.forEach((k, i) => { const ya = y0 + i * bl + bl * .06, yb = y0 + (i + 1) * bl - bl * .06; put(rectLoc(-B * .38, B * .38, ya, yb), { color: '#0d1620', weight: .6, fillColor: fill[k], fillOpacity: .92 }); });
    put(rectLoc(-B * .36, B * .36, -L * .39, -L * .27), { color: '#fff', weight: 1, fillColor: '#dfe6ee', fillOpacity: .95 });          // 船尾上層建築（船橋）
    put(rectLoc(-B * .46, B * .46, -L * .335, -L * .315), { color: '#fff', weight: .8, fillColor: '#b6c2cf', fillOpacity: .95 });        // 駕駛台兩側延伸
    put(rectLoc(-B * .1, B * .1, -L * .43, -L * .395), { color: '#fff', weight: .8, fillColor: '#8a97a6', fillOpacity: .95 });          // 煙囪
  }
  const L2 = { polygon: (...x) => L.polygon(...x) };
  const hullPts = (lat, lon, hd, L, B) => {              // 船形多邊形（尖船頭）：以公尺定義，轉成經緯度
    const th = hd * Math.PI / 180, kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574;
    const loc = [[0, L / 2], [B * .4, L / 2 - L * .12], [B / 2, L / 2 - L * .3], [B / 2, -L / 2], [-B / 2, -L / 2], [-B / 2, L / 2 - L * .3], [-B * .4, L / 2 - L * .12]];   // [橫向, 縱向]
    return loc.map(([x, y]) => [lat + (y * Math.cos(th) - x * Math.sin(th)) / ky, lon + (y * Math.sin(th) + x * Math.cos(th)) / kx]);
  };
  const shipIcon = (color, hollow, hd, z) => !(z > 7)                     // 縮放 7 以下：只畫方向小三角形，船多時不互相遮蓋；8 以上小船；再放大到看得出船長才畫真實船體
    ? L.divIcon({ className: '', iconSize: [10, 12], iconAnchor: [5, 6],
      html: `<svg width="10" height="13" viewBox="0 0 10 13" style="transform:rotate(${hd}deg);display:block;overflow:visible"><path d="M5 0 L10 13 L5 9.5 L0 13 Z" fill="${hollow ? 'none' : color}" stroke="${hollow ? color : '#fff'}" stroke-width="${hollow ? 1.6 : 1}" stroke-linejoin="round"/></svg>` })
    : L.divIcon({ className: '', iconSize: [9, 24], iconAnchor: [4.5, 12],
      html: `<svg width="9" height="24" viewBox="0 0 12 32" style="transform:rotate(${hd}deg);display:block;overflow:visible"><path d="M6 1 L11 10 L11 31 L1 31 L1 10 Z" fill="${hollow ? 'none' : color}" stroke="${hollow ? color : '#fff'}" stroke-width="${hollow ? 2.5 : 1.6}" stroke-linejoin="round"/>${hollow ? '' : '<rect x="3" y="24" width="6" height="3.2" rx=".6" fill="#fff" opacity=".9"/>'}</svg>` });

  // ---- 港口與碼頭圖示、壅塞預測小圖、碼頭與場站資訊
  const CRANE = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16M7 21V9M17 21V9M3 9h18M7 9l5-5 5 5M12 4v5"/></svg>';
  const ANCHOR = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M7 11h10M5 15c0 3 3 6 7 6s7-3 7-6"/></svg>';
  const lab = t => (t ? `<span class="plab">${esc(t)}</span>` : '');
  const portIcon = (color, sz, name) => L.divIcon({ className: '', iconSize: [sz, sz], html: `<div class="pmk" style="width:${sz}px;height:${sz}px"><div class="pmark pico" style="width:${sz}px;height:${sz}px;background:${color}">${ANCHOR}</div>${lab(name)}</div>` });
  const termIcon = (color, sz, name) => L.divIcon({ className: '', iconSize: [sz, sz], html: `<div class="pmk" style="width:${sz}px;height:${sz}px"><div class="pmark pico tico" style="width:${sz}px;height:${sz}px;background:${color}">${CRANE}</div>${lab(name)}</div>` });
  const lvText = lv => (lv === 'high' ? '要處理' : lv === 'mid' ? '留意' : lv === 'low' ? '正常' : '資料不足');
  function fcSvg(f) {                                        // 預測小圖：橫軸今天到第 7 天，柱高＝預估塞港指數，虛線是 120 與 150
    const W = 280, H = 92, mx = Math.max(180, ...f.days.map(d => d.idx)), y = v => H - 16 - (H - 28) * v / mx, c = COL(), bw = 20;
    return `<svg width="${W}" height="${H}" role="img" aria-label="未來 7 天塞港指數預估" style="display:block"><line x1="0" x2="${W}" y1="${y(120)}" y2="${y(120)}" stroke="${c.warn}" stroke-dasharray="3 3"/><line x1="0" x2="${W}" y1="${y(150)}" y2="${y(150)}" stroke="${c.bad}" stroke-dasharray="3 3"/>` +
      f.days.map((d, i) => `<rect x="${4 + i * 34}" y="${y(d.idx)}" width="${bw}" height="${Math.max(1, H - 16 - y(d.idx))}" fill="${lvColor(d.level)}" opacity="${i ? .85 : 1}"/><text x="${14 + i * 34}" y="${H - 3}" font-size="11" text-anchor="middle" fill="${c.sub}">${i ? i : '今'}</text><text x="${14 + i * 34}" y="${Math.max(10, y(d.idx) - 2)}" font-size="11" text-anchor="middle" fill="${c.ink}">${d.idx}</text>`).join('') + '</svg>';
  }
  U.fcSvg = fcSvg;
  function yardOf(code) {                                    // 碼頭代碼＝場站代碼：有場站資料才是空櫃存放點
    const u = CG.util().find(x => x.yard === code); if (!u) return null;
    const fc = CG.forecastAll().filter(r => r.yard === code);
    return { u, hi: fc.filter(r => r.status === '要處理').length, mi: fc.filter(r => r.status === '留意').length };
  }
  const termPopup = (t, u) => {
    const y = yardOf(t[0]);
    return `<b>${esc(t[2] || t[0])}</b>（${esc(pn(u))}　${esc(t[0])}）<br>` + (y ? `<b>空櫃存放點</b>：是<br>存放量 ${y.u.teu == null ? '—' : fmt(y.u.teu, 0) + ' TEU'}　容量 ${y.u.cap ? fmt(y.u.cap, 0) + ' TEU' : 'N/A'}<br>使用率 ${y.u.u == null ? 'N/A' : fmt(y.u.u * 100, 0) + '%'}${y.u.stale ? '（資料過期）' : ''}` +
      (y.hi || y.mi ? `<br>缺櫃預估：${y.hi ? y.hi + ' 種櫃型要處理' : ''}${y.hi && y.mi ? '、' : ''}${y.mi ? y.mi + ' 種留意' : ''}` : '<br>缺櫃預估：目前正常') : '<b>空櫃存放點</b>：否（沒有場站存量資料）');
  };
  // 船舶氣泡卡片：下一港與航程狀態、計算／回報 ETA（含提前或延遲）、位置時間、貨櫃組成條、整體評估、兩個連結
  function vesselCard(a, stale, gap, lv, bad) {
    const vc = (C.vcargo || {})[a.vid], tsx = x => (x ? Date.parse(x + 'Z') : null);
    const diff = a.etaRep && a.etaCalc ? (tsx(a.etaRep) - tsx(a.etaCalc)) / 3600000 : null;      // 回報 − 計算：負＝回報比較早（提前）
    const dtxt = h => { const m = Math.abs(h) * 60; return (h < 0 ? '回報早 ' : '回報晚 ') + (m < 60 ? Math.round(m) + ' 分' : fmt(Math.abs(h), 1) + ' 小時'); };
    const status = stale ? ['位置過期', 'warn'] : a.sog != null && a.sog < 1 ? ['停泊', 'no'] : ['航行中', 'ok'];
    const LVN = { high: ['要處理', 'bad'], mid: ['留意', 'warn'], low: ['正常', 'ok'] }[lv] || ['正常', 'ok'];
    let cargo = '<div class="vc-none">沒有船上貨櫃資料</div>';
    if (vc && vc[0]) {
      const on = vc[0], lad = vc[1], emp = vc[2], rf = vc[3], dg = vc[4], gen = Math.max(0, lad - rf - dg), pc = x => (100 * x / on), seg = (x, c2) => (x > 0 ? `<i style="width:${pc(x)}%;background:${c2}"></i>` : '');
      cargo = `<div class="vc-h" title="最近一港裝船後的估計"><span>貨櫃</span><b>${fmt(on, 0)} TEU</b></div>
        <div class="vc-bar">${seg(gen, '#4c8dff')}${seg(emp, '#9aa7b8')}${seg(rf, '#2ea66a')}${seg(dg, '#e5484d')}</div>
        <div class="vc-leg"><span><i style="background:#2ea66a"></i>冷櫃 ${fmt(rf, 0)} TEU（${fmt(pc(rf), 1)}%）</span><span><i style="background:#e5484d"></i>危險櫃 ${fmt(dg, 0)} TEU（${fmt(pc(dg), 1)}%）</span><span><i style="background:#4c8dff"></i>一般滿櫃 ${fmt(gen, 0)}</span><span><i style="background:#9aa7b8"></i>空櫃 ${fmt(emp, 0)}</span></div>`;
    }
    // 航線：代碼＋中文名稱，圓點顏色同地圖上的航線線條（依全部航線的順序取色）；「只看這條航線」走既有的 data-rs → pickSvc
    const si = SVCS().findIndex(x => x.code === a.svc), sv = si >= 0 ? SVCS()[si] : null, svCol = si >= 0 ? COL().pal[(si + 2) % COL().pal.length] : null;
    const route = a.svc ? `<div class="vc-svc"><span class="note">航線</span><span class="vc-svn"><i style="background:${svCol || 'var(--no)'}"></i><b>${esc(a.svc)}</b>${sv ? `<span>${esc(sv.name)}</span>` : ''}</span>${sv ? `<a href="#" data-rs="${esc(a.svc)}">只看這條航線 ›</a>` : ''}</div>` : '';
    return `<div class="vcard"><div class="vc-name"><b>${esc(a.name)}</b></div>${route}
      <div class="vc-row"><div><div class="note">下一港</div><b class="vc-port">${esc(pn(a.unlo))}</b></div><div class="vc-r"><div class="note">航程狀態</div><span class="vc-chip ${status[1]}">${status[0]}</span></div></div>
      <div class="vc-eta"><div title="系統依船位與航速算出的抵港時間"><div class="note">計算 ETA（UTC）</div><b>${stale ? '位置過期，無法計算' : hhmm(a.etaCalc)}</b></div>
        <div title="船方或代理回報的抵港時間"><div class="note">回報 ETA（UTC）</div><b>${hhmm(a.etaRep)}</b>${diff != null ? `<span class="vc-chip ${Math.abs(diff) > 6 ? 'warn' : 'ok'}" title="回報 ETA 與計算 ETA 的差；超過 6 小時標黃">${dtxt(diff)}</span>` : ''}</div></div>
      <div class="note">位置時間　${hhmm(a.posT)}（UTC）</div>
      <div class="vc-cargo">${cargo}</div>
      <div class="vc-ov" title="各項燈號（準點率、燃油效率、異常日數等）：2 項以上要處理＝要處理；1 項要處理或 2 項以上留意＝留意；其餘正常"><span>整體評估</span><span class="vc-chip ${LVN[1]}">${LVN[0]}</span><span class="note">${bad.length ? esc(bad.slice(0, 3).join('、')) : ''}</span></div>
      <div class="vc-btns"><a href="#" data-pv="${a.vid}">看這艘船的單船頁 ›</a><a href="#" data-pl="${a.vid}">看船上貨櫃 ›</a></div></div>`;
  }
  const vCargoHtml = vid => {                                // 單船貨櫃概況：最近一港裝船後的估計
    const v = (C.vcargo || {})[vid]; if (!v) return '貨櫃：沒有資料';
    const [onb, lad, emp, rf, dg] = v, b = (t, k) => `<span class="tag ${k}">${t}</span>`;
    return `貨櫃（最近一港裝船後估計）：船上 ${fmt(onb, 0)} TEU（滿 ${fmt(lad, 0)}、空 ${fmt(emp, 0)}）<br>${rf > 0 ? b('載有冷櫃 ' + fmt(rf, 0) + ' TEU', 'ok') : b('沒有冷櫃', 'no')} ${dg > 0 ? b('載有危險櫃 ' + fmt(dg, 0) + ' TEU', 'bad') : b('沒有危險櫃', 'no')}`;
  };
  // 航線（服務）：整條循環的停靠港順序；一個港口可能被多條航線經過
  // 歐盟碳排成本（示意）：點歐盟港口時顯示碳價、繳交比例與前往此港的本公司船成本
  const ETS_PCT = { 2024: 40, 2025: 70 };
  function etsHtml(eu, shipsHere, compact) {
    if (!eu) return '';
    const E = (window.UI_COMP || {}).ets || [], yrs = [...new Set(E.map(x => x.year))].sort(), yr = yrs[yrs.length - 1], price = E.length ? E[0].price : 88;
    const rows = (shipsHere || []).map(a => { const x = E.find(e => e.vid === a.vid && e.year === yr); return `<li>${esc(a.name)}：${x ? '約 ' + fmt(x.cost / 1e6, 2) + ' 百萬歐元（' + yr + ' 年累計，歐盟涵蓋 ' + fmt(x.share, 0) + '%）' : '沒有歐盟航段成本資料'}</li>`; }).join('');
    if (compact) { const E2 = (window.UI_COMP || {}).ets || []; const yr2 = [...new Set(E2.map(x => x.year))].sort().pop(); return `<div class="note">碳價（示意）${fmt(E2.length ? E2[0].price : 88, 0)} 歐元/噸，${yr2 || 2026} 年繳交 ${yr2 >= 2026 || !yr2 ? 100 : yr2 === 2025 ? 70 : 40}%</div>` + (rows ? '<ul class="pc-ul">' + rows + '</ul>' : '<div class="note">目前沒有本公司船前往此港。</div>'); }
    return `<div class="pc-line"><b>歐盟碳排成本（示意）</b><br><span class="note">碳價為示意價 ${fmt(price, 0)} 歐元/噸，不是真實價格；繳交比例 2024 年 40%、2025 年 70%、2026 年起 100%；${yr || 2026} 年資料只到 10 月。只有靠歐盟港的船才有成本。</span>${rows ? '<ul class="pc-ul">' + rows + '</ul>' : '<span class="note">目前沒有本公司船前往此港。</span>'}</div>`;
  }
  U.etsHtml = etsHtml;
  const SVCS = () => (U.M.services || []);
  // 航線分區：依停靠港的國家自動判斷（有北美港＝北美；否則有歐洲港＝歐洲；否則有澳紐港＝大洋洲；其餘＝亞洲）。選整區時 S.svc＝'R:NA' 這種寫法
  const REGIONS = [['NA', '北美'], ['EU', '歐洲'], ['AS', '亞洲'], ['OC', '大洋洲']];
  const NA_CC = new Set(['US', 'CA', 'MX']), EUR_CC = new Set([...EU, 'GB', 'NO', 'IS', 'TR', 'UA', 'RU', 'GE']), OC_CC = new Set(['AU', 'NZ', 'PG', 'FJ']);
  const svcRegion = sv => { const cc = new Set(sv.ports.map(u => String(u).slice(0, 2))), has = S2 => [...cc].some(c => S2.has(c)); return has(NA_CC) ? 'NA' : has(EUR_CC) ? 'EU' : has(OC_CC) ? 'OC' : 'AS'; };
  U.svcRegions = () => REGIONS.map(([k, n]) => ({ k, n, list: SVCS().filter(sv => svcRegion(sv) === k) })).filter(r => r.list.length);
  U.svcLabel = code => { if (!code) return ''; if (String(code).startsWith('R:')) { const r = REGIONS.find(x => x[0] === code.slice(2)); return r ? r[1] + '（整區）' : code; } return '航線 ' + code; };
  const svcSetOf = code => (!code ? null : String(code).startsWith('R:') ? new Set(SVCS().filter(sv => svcRegion(sv) === code.slice(2)).map(sv => sv.code)) : new Set([code]));
  U.svcSetOf = svcSetOf;
  const svcOfPort = u => SVCS().filter(s => s.ports.includes(u));
  const svcStops = s => { const seen = []; s.ports.forEach(u => { if (!seen.includes(u)) seen.push(u); }); return seen; };
  const state = k => (STATE.view[k || 'map'] = STATE.view[k || 'map'] || { base: '', layers: { vessel: true, route: true, cong: true, anchor: false, service: true, eu: false, peers: true }, svc: '', red: false, days: 0 });   // k：單船航行地圖另存 vmap，不影響船隊地圖
  const lvColor = lv => { const c = COL(); return lv === 'high' ? c.bad : lv === 'mid' ? c.warn : lv === 'low' ? c.ok : c.no; };
  const idxColor = i => { const c = COL(); return i == null ? c.no : i >= 150 ? c.bad : i >= 120 ? c.warn : c.ok; };

  // 每艘船取最早的一筆預報；一艘船只畫一個點
  function ownVessels(bulk, only) {
    const own = {};
    CG.arrivals().filter(a => a.status === 'EXPECTED' && (bulk ? (a.org === 1 || a.org === 2) : a.org === 3) && a.vid != null && a.lat != null && (!only || only.includes(a.vid)))
      .sort((a, b) => (a.etaCalc || a.etaRep || '9999') < (b.etaCalc || b.etaRep || '9999') ? -1 : 1).forEach(a => { if (!own[a.vid]) own[a.vid] = a; });
    return Object.values(own);
  }
  // 港口壅塞：每港取一列（優先全港資料）
  function congByPort() {
    const by = {};
    CG.cong().filter(r => r.off === 0 && r.term == null).forEach(r => { if (!by[r.unlo] || r.cov === 'PORT') by[r.unlo] = r; });
    return by;
  }
  const spark = (days) => {
    const v = days.map(d => d.avg); const nums = v.filter(x => x != null);
    if (nums.length < 2) return '';
    const mx = Math.max(...nums, 1), W = 120, H = 26;
    const pts = v.map((x, i) => (x == null ? null : [i * W / (v.length - 1), H - 2 - (H - 4) * x / mx])).filter(Boolean).map(p => p.join(',')).join(' ');
    return `<svg width="${W}" height="${H}" style="vertical-align:middle"><polyline points="${pts}" fill="none" stroke="#58a6ff" stroke-width="2"/></svg>`;
  };

  // opts: { bulk, vids（只畫這些船）, single（單船小地圖）, height, voy（單船航行地圖：{ vid, onPort(u), sel() }） }
  U.shipMap = function (el, opts) {
    opts = opts || {};
    const V = opts.voy || null, bulk = !!opts.bulk, S = state(V ? 'vmap' : 'map');
    if (!window.L) return U.emptyChart(el, '地圖元件載入失敗');
    if (!bulk && !CG.orgOk()) return U.emptyChart(el, '此組織沒有運務資料（只有「模擬貨櫃公司」有）。請在上方組織選「模擬貨櫃公司」或「全部組織」。');
    const ships = ownVessels(bulk, opts.vids), single = !!opts.single;
    const fvList = 'fvl' + Math.random().toString(36).slice(2, 8);
    if (!ships.length) return U.emptyChart(el, '沒有本公司船舶的位置資料');
    if (!S.base) S.base = STATE.theme === 'light' ? 'street' : 'dark';
    const svcCodes = (bulk ? [...new Set(ships.map(a => a.svc).filter(Boolean))] : SVCS().map(s => s.code)).sort();
    const hasCong = !bulk;
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const B = opts.board || null;                                   // 運務板：港口顏色＝港口等級，點港口＝選中
    const layerList = LAYERS.filter(l => (hasCong || !['cong', 'anchor', 'service'].includes(l[0])) && !(B && l[0] === 'cong') && (V || l[0] !== 'peers'));
    if (V) { const me = ships.find(a => a.vid === V.vid); S.svc = me && me.svc ? me.svc : ''; S.days = 0; S.red = false; }   // 航行地圖：航線固定為這艘船的航線
    el.innerHTML = `<div class="svcinfo" data-svcinfo hidden></div>
      <div class="mapwrap"><div class="mapbox" data-map style="height:${opts.height || (single ? '20rem' : '32rem')}"></div>
      ${single || V ? '' : `<div class="mapfloat"><label class="mctl msvc" title="選一條航線：地圖只留這條航線${B ? '，右側顯示航線詳情' : ''}">航線<select data-svc><option value="">全部航線</option>${bulk ? svcCodes.map(s => `<option value="${esc(s)}"${S.svc === s ? ' selected' : ''}>${esc(s)}</option>`).join('')
        : U.svcRegions().map(r => `<optgroup label="${esc(r.n)}（${r.list.length} 條）"><option value="R:${r.k}"${S.svc === 'R:' + r.k ? ' selected' : ''}>${esc(r.n)}整區（${r.list.length} 條）</option>${r.list.map(sv => `<option value="${esc(sv.code)}"${S.svc === sv.code ? ' selected' : ''}>${esc(sv.code)}　${esc(sv.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="mctl mfv" title="輸入船名，地圖移到那艘船並打開資訊框"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/></svg><input type="search" data-fv list="${fvList}" placeholder="找船名" value="${S.fv ? esc((ships.find(a => a.vid === S.fv) || {}).name || '') : ''}" aria-label="找船並在地圖上標出"></label><datalist id="${fvList}">${[...new Set(ships.map(a => a.name))].sort().map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>`}
      <div class="mapgis"><div class="gispanel" data-mtp${S.open ? '' : ' hidden'}>
        <div class="gisg"><b>底圖</b><div class="giscards">${Object.entries(BASES).map(([k, b]) => `<button type="button" class="giscard" data-base="${k}" aria-pressed="${S.base === k}"><span class="gisth gisimg" style="background-image:url('${b.url.replace('{z}', 6).replace('{y}', 27).replace('{x}', 53)}')"></span><span class="gisn">${b.name}</span></button>`).join('')}</div></div>
        ${single ? '' : `<div class="gisg"><b>圖層</b><div class="giscards">${layerList.map(([k, n]) => `<button type="button" class="giscard" data-ly="${k}" aria-pressed="${!!S.layers[k]}"><span class="gisth">${LYICON[k] || ''}</span><span class="gisn">${n}</span></button>`).join('')}</div></div>
        ${V ? '' : `<div class="gisg gisf"><b>篩選</b><label class="fld">預計抵港<select data-days>${[[0, '不限'], [3, '3 天內'], [7, '7 天內'], [14, '14 天內'], [30, '30 天內']].map(([d, n]) => `<option value="${d}"${+S.days === d ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label class="fld"><input type="checkbox" data-red${S.red ? ' checked' : ''}> 只看要處理的船</label></div>`}`}
      </div><button type="button" class="btn mft gisbtn" data-mft aria-expanded="${S.open ? 'true' : 'false'}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg> 圖資 <span class="car">${S.open ? '▾' : '▴'}</span></button></div>
      <div class="maplegf"><div class="mapleg" data-mlp${S.leg ? '' : ' hidden'}><span><i style="background:var(--ok)"></i>正常</span><span><i style="background:var(--warn)"></i>留意</span><span><i style="background:var(--bad)"></i>要處理</span><span><i class="hollow"></i>位置過期（超過 12 小時沒更新）</span>${B ? '<span class="note">港口方塊顏色＝港口等級（取塞港指數、最長等待、等泊週變化三項最差者；灰＝資料不足）；白圈＝選中的港口；點方塊或右側清單看詳情</span>' : hasCong ? '<span class="note">港口方塊顏色＝塞港指數（綠 120 以下、黃 120 到 150、紅 150 以上、灰＝樣本不足）</span>' : ''}${hasCong && !single ? '<span><i style="background:none;border:2px solid #58a6ff"></i>藍圈＝歐盟港口（靠港要繳歐盟碳排成本）</span><span><i style="background:none;border:2px solid #e3b341"></i>黃圈＝排放管制區（ECA，燃油含硫與氮氧化物限制較嚴）</span>' : ''}<span class="note" data-tilemsg></span></div><div class="mlrow"><button type="button" class="btn mlt" data-mlt aria-expanded="${S.leg ? 'true' : 'false'}">圖例 <span class="car">${S.leg ? '▾' : '▴'}</span></button><span class="mcnt note" data-mc></span></div></div></div>`;
    const box = el.querySelector('[data-map]');
    { const mlt = el.querySelector('[data-mlt]'), mlp = el.querySelector('[data-mlp]'); mlt.onclick = () => { S.leg = !S.leg; mlp.hidden = !S.leg; mlt.setAttribute('aria-expanded', S.leg ? 'true' : 'false'); mlt.querySelector('.car').textContent = S.leg ? '▾' : '▴'; }; }
    { const mft = el.querySelector('[data-mft]'), mtp = el.querySelector('[data-mtp]'); mft.onclick = () => { S.open = !S.open; mtp.hidden = !S.open; mft.setAttribute('aria-expanded', S.open ? 'true' : 'false'); mft.querySelector('.car').textContent = S.open ? '▾' : '▴'; }; }   // 圖資在右下角、面板往上開
    const map = L.map(box, { worldCopyJump: true, zoomControl: true, attributionControl: true, minZoom: 1 });
    maps.push(map); U.lastMap = map;
    const setMin = () => { try { const z = Math.max(1, Math.ceil(Math.log2(Math.max(box.clientWidth, 256) / 256))); map.setMinZoom(z); if (map.getZoom() < z) map.setZoom(z); } catch (e) { } };   // 縮小時世界不重複出現
    setMin(); window.addEventListener('resize', setMin);
    let baseLayer = null, tileErr = 0;
    const setBase = k => {
      if (baseLayer) map.removeLayer(baseLayer);
      const b = BASES[k]; tileErr = 0;
      baseLayer = L.tileLayer(b.url, { maxZoom: 18, maxNativeZoom: 13, attribution: '圖磚 © Esri' });   // Esri 海面在 14 級以上只有「Map data not yet available」提示圖：13 級以上沿用 13 級圖磚放大
      baseLayer.on('tileerror', () => { if (++tileErr === 3) el.querySelector('[data-tilemsg]').textContent = '底圖載入失敗（可能沒有網路）；船與港口仍可使用。'; });
      baseLayer.on('tileload', () => { if (tileErr) { tileErr = 0; el.querySelector('[data-tilemsg]').textContent = ''; } });
      baseLayer.addTo(map); baseLayer.bringToBack();
      el.querySelectorAll('[data-base]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.base === k)));
    };
    const groups = {}; LAYERS.forEach(([k]) => (groups[k] = L.layerGroup().addTo(map))); groups.sel = L.layerGroup().addTo(map);
    let fitted = false, lastFocus = null;
    if (!single && S.fv == null) { const hv = +new URLSearchParams(location.hash.slice(1)).get('fv'); if (hv && ships.some(a => a.vid === hv)) { S.fv = hv; S.fvFly = true; } }

    function draw() {
      LAYERS.forEach(([k]) => groups[k].clearLayers()); groups.sel.clearLayers(); lastFocus = null;
      const cong = hasCong ? congByPort() : {}, trend = hasCong ? CG.waitTrend(3) : [];
      const SS = svcSetOf(S.svc);   // 選中的航線（一條或整區）
      let L1 = ships.filter(a => !SS || SS.has(a.svc) || single);
      if (V) L1 = ships.filter(a => a.vid === V.vid || (S.layers.peers && SS && SS.has(a.svc)));   // 航行地圖：這艘船＋（可關）同航線其他船
      const UP = V && U.sv ? Object.fromEntries(U.sv.ports(V.vid).map(x => [x.u, x.k + 1])) : null;   // 接下來停靠港 → 第幾港
      if (!single && +S.days) L1 = L1.filter(a => { const e = a.etaCalc || a.etaRep; return e && (ts(e) - NOW) / HR <= S.days * 24; });
      const lvOf = a => U.risk.overall(U.risk.byVessel(a.vid));
      const info = L1.map(a => ({ a, lv: lvOf(a) })).filter(x => !S.red || single || x.lv === 'high');
      const stale = a => !a.posT || (NOW - ts(a.posT)) / HR > 12;
      const toward = new Map();           // 港口 → 前往該港的船
      info.forEach(({ a }) => { if (a.unlo) (toward.get(a.unlo) || toward.set(a.unlo, []).get(a.unlo)).push(a); });
      const bounds = [];
      const col = COL();
      // 航線（整條循環）：實線、較粗，選了某條航線時一定畫出並標停靠順序
      const sel = S.svc ? SVCS().find(x => x.code === S.svc) : null, regSel = !!SS && !sel && !bulk;   // regSel：選了整區
      if ((S.layers.service || sel || regSel) && hasCong && !single) {
        const RT = ROUTES();
        SVCS().filter(x => !SS || SS.has(x.code)).forEach((sv, i) => {
          const seen = new Set(), color = col.pal[(i + 2) % col.pal.length];
          sv.ports.forEach((u, j) => {
            const v = sv.ports[j + 1]; if (!v || u === v || !C.ports[u] || !C.ports[v] || seen.has(u + '|' + v) || seen.has(v + '|' + u)) return; seen.add(u + '|' + v);
            const path = RT.leg[u + '|' + v] || (RT.leg[v + '|' + u] ? RT.leg[v + '|' + u].slice().reverse() : [C.ports[u], C.ports[v]]);   // 海上航路（避開陸地）；查不到才退回直線
            OFFS.forEach(o => { const pl = path.map(q => [q[0], q[1] + o]); L.polyline(pl, { color: '#fff', weight: sel || regSel ? 6 : 5, opacity: .25 }).addTo(groups.service); L.polyline(pl, { color, weight: sel || regSel ? 3.5 : 3, opacity: .9 }).bindTooltip('航線 ' + sv.code + '　' + sv.name + (B ? '（點一下看航線詳情）' : ''), { sticky: true }).on('click', () => { if (B) pickSvc(sv.code); }).addTo(groups.service); });
          });
          if (regSel) svcStops(sv).forEach(u => { const p = C.ports[u]; if (p) bounds.push([p[0], wrap(p[1])]); });   // 整區：不標停靠順序，只用來對焦
          if (sel) svcStops(sv).forEach((u, k) => { const p = C.ports[u]; if (p) { if (!UP || UP[u]) OFFS.forEach(o => L.marker([p[0], p[1] + o], { icon: L.divIcon({ className: '', iconSize: [18, 18], html: `<div class="stopn${UP ? ' svup' : ''}" style="background:${color}">${UP ? UP[u] : k + 1}</div>` }), interactive: false, zIndexOffset: 500 }).addTo(groups.service)); bounds.push([p[0], wrap(p[1])]); } });   // 航行地圖：只標接下來的 4 港（1＝下一港）
        });
      }
      const svcBar = el.querySelector('[data-svcinfo]');
      if (svcBar && (B || V)) svcBar.hidden = true;                          // 營運總控台：航線說明改在右側「航線詳情」，不佔地圖上方
      else if (svcBar) {
        if (sel && hasCong && !single) {
          const nShip = ships.filter(a => a.svc === sel.code).length;
          svcBar.hidden = false;
          svcBar.innerHTML = `<b>航線 ${esc(sel.code)}　${esc(sel.name)}</b>　環航約 ${fmt(sel.rot, 0)} 天　目前 ${nShip} 艘船在這條航線上<br><span class="note">停靠順序：${svcStops(sel).map((u, k) => `${k + 1} ${esc(pn(u))}`).join(' → ')}（粗實線＝整條航線；圖上只顯示這條航線的船與港口）</span>`;
        } else if (regSel && hasCong && !single) {
          const R = U.svcRegions().find(r => 'R:' + r.k === S.svc);
          svcBar.hidden = false;
          svcBar.innerHTML = `<b>${esc(R ? R.n : '')}整區</b>　${R ? R.list.length : 0} 條航線：${R ? R.list.map(x => esc(x.code)).join('、') : ''}　目前 ${L1.length} 艘船<br><span class="note">圖上只顯示這一區的航線、船與港口；點航線線條或在上方選單選單一航線看停靠順序</span>`;
        } else svcBar.hidden = true;
      }
      // 港口：壅塞方塊、錨地與泊位、歐盟與管制區
      const shown = new Set(toward.keys());
      if (single) { /* 單船小地圖：只畫目的港 */ } else if ((sel || regSel) && hasCong) { shown.clear(); SVCS().filter(x => SS.has(x.code)).forEach(x => svcStops(x).forEach(u => shown.add(u))); } else if (B) { shown.clear(); B.ports().forEach(u => shown.add(u)); } else if (S.layers.cong || S.layers.anchor || S.layers.eu) Object.keys(C.ports).forEach(u => shown.add(u));
      shown.forEach(u => {
        const p = C.ports[u]; if (!p) return;
        const r = cong[u], meta = U.M.ports[u] || {}, ships2 = toward.get(u) || [];
        const eu = EU.has(meta.cc), eca = !!meta.eca;
        const tr = trend.find(x => x.unlo === u && (!r || x.cov === r.cov));
        const lvl = r && r.n >= 5 && r.idx != null ? (r.idx >= 150 ? 'high' : r.idx >= 120 ? 'mid' : 'low') : 'nodata', lvTxt = { high: '嚴重壅塞', mid: '留意', low: '順暢', nodata: '樣本不足' }[lvl];
        const chg = tr && tr.chg != null ? tr.chg : null, svs = svcOfPort(u);
        const f = hasCong && !single && U.portForecast ? U.portForecast(u) : null;
        const popup = `<div class="pcard"><div class="pc-h"><span class="pc-code">${esc(u)}</span><b>${esc(pn(u))}</b><span class="pc-pill ${lvl}">${lvTxt}</span></div>` +
          `${eu ? '<span class="note">歐盟港口　</span>' : ''}${eca ? '<span class="note">排放管制區</span>' : ''}` +
          (r ? `<div class="pc-stats"><div><small>平均等待</small><b>${r.avgWait == null ? '—' : fmt(r.avgWait, 1)} 小時</b></div><div><small>平均停留</small><b>${r.avgStay == null ? '—' : fmt(r.avgStay, 1)} 小時</b></div><div><small>積壓（在錨）</small><b>${r.wait} 艘</b></div></div>` +
            `<div class="pc-line">塞港指數 <b>${r.n >= 5 && r.idx != null ? fmt(r.idx, 0) : '樣本不足'}</b>（${r.cov === 'PORT' ? '全港' : '僅本公司船舶'}）　在泊 ${r.berthed} 艘` + (chg != null ? `<br>等泊比上週 <b class="${chg >= 30 ? 'up' : ''}">${chg >= 0 ? '▲ +' : '▼ '}${fmt(chg, 0)}%</b>` : '') + `</div>` + (tr ? `<div class="pc-line">7 天平均等泊 ${spark(tr.days)}</div>` : '') : '<div class="pc-line">沒有壅塞資料</div>') +
          (f ? (f.ok ? `<div class="pc-line"><b>未來 7 天（模擬）</b>：${esc(f.text)}${fcSvg(f)}<span class="note">橫軸：今天到第 7 天；柱高：預估塞港指數（100＝平常，虛線 120、150）。假設 ${f.B} 個泊位、每船平均停 ${fmt(f.stay, 0)} 小時，只計本公司船舶預報。</span></div>` : `<div class="pc-line"><b>未來 7 天（模擬）</b>：${esc(f.reason || '無')}</div>`) : '') +
          (() => { const ts2 = (C.terminals || []).filter(t => t[1] === u && t[3]); return ts2.length ? `<div class="pc-line">碼頭：${ts2.map(t => esc(t[0]) + (yardOf(t[0]) ? '（空櫃存放點）' : '')).join('、')}</div>` : ''; })() +
          etsHtml(eu, ships2) +
          (svs.length ? `<div class="pc-line">經過的航線：${svs.map(x => `<a href="#" data-rs="${esc(x.code)}" title="${esc(x.name)}">${esc(x.code)}</a>`).join('、')}<span class="note">點航線代碼，地圖只顯示該航線與航線上的船</span></div>` : '') +
          (ships2.length ? `<div class="pc-line">前往此港：${ships2.slice(0, 6).map(a => `<a href="#" data-pv="${a.vid}">${esc(a.name)}</a>`).join('、')}${ships2.length > 6 ? ' 等 ' + ships2.length + ' 艘' : ''}</div>` : '') +
          `<div class="pc-foot"><a href="#" data-pd="${esc(u)}">查看港口詳情 →</a></div></div>`;
        const addTo = (g, m) => { if (B || V) m.bindTooltip(esc(pn(u)) + (UP && UP[u] ? '　' + (UP[u] === 1 ? '下一港' : '第 ' + UP[u] + ' 港') : ''), { direction: 'top', offset: [0, -8] }); else m.bindPopup(popup); m.addTo(g); return m; };
        if (S.layers.cong || single || B) {
          const sz = r ? 20 + Math.min(8, r.wait * 2) : 18, color = B ? lvColor(B.level(u)) : r && r.n >= 5 ? idxColor(r.idx) : col.no;
          OFFS.forEach(o => { const mk = addTo(groups.cong, L.marker([p[0], p[1] + o], { icon: portIcon(color, map.getZoom() >= 14 ? 16 : sz, map.getZoom() >= 5 ? pn(u) : ''), keyboard: false, opacity: map.getZoom() >= 14 ? .55 : 1 }));
            if (B) mk.on('click', () => B.onPort(u));
            if (V) mk.on('click', () => V.onPort(u));
            if (V && V.sel && V.sel() === u) L.circleMarker([p[0], p[1] + o], { radius: 16, color: '#fff', weight: 3, fill: false, interactive: false }).addTo(groups.sel);
            if (B && B.selected() === u) L.circleMarker([p[0], p[1] + o], { radius: 16, color: '#fff', weight: 3, fill: false, interactive: false }).addTo(groups.sel); });
          bounds.push([p[0], wrap(p[1])]);
        }
        if ((S.layers.cong || single || B) && hasCong && map.getZoom() >= 10) {                 // 放大後把各碼頭分開畫（沒有碼頭座標，繞著港口示意排列）
          const ts3 = (C.terminals || []).filter(t => t[1] === u && t[3]);
          ts3.forEach((t, k) => {
            const ang = 2 * Math.PI * k / ts3.length - Math.PI / 2, la = p[0] + .03 * Math.sin(ang), lo = p[1] + .03 * Math.cos(ang) / Math.max(.3, Math.cos(p[0] * Math.PI / 180)), y = yardOf(t[0]);
            OFFS.forEach(o => { const m = L.marker([la, lo + o], { icon: termIcon(y ? col.pal[0] : col.no, 22, t[0]), keyboard: false }); m.bindTooltip(esc(t[0]) + (y ? '（空櫃存放點）' : ''), { direction: 'top', offset: [0, -10] }); m.bindPopup(termPopup(t, u)); m.addTo(groups.cong); });
          });
        }
        if (S.layers.anchor && r && (r.wait > 0 || r.berthed > 0) && !single) {
          OFFS.forEach(o => addTo(groups.anchor, L.marker([p[0], p[1] + o], { icon: L.divIcon({ className: '', html: `<div class="amark">錨 ${r.wait}｜泊 ${r.berthed}</div>`, iconSize: null, iconAnchor: [-17, 10] }), keyboard: false })));
        }
        if (S.layers.eu && (eu || eca) && !single) {
          OFFS.forEach(o => { if (eu) addTo(groups.eu, L.circle([p[0], p[1] + o], { radius: 120000, color: '#58a6ff', weight: 1, dashArray: '4 4', fillColor: '#58a6ff', fillOpacity: .13, interactive: false }).bindTooltip('歐盟港口區域（需繳歐盟碳排成本）', { sticky: true })); addTo(groups.eu, L.circleMarker([p[0], p[1] + o], { radius: 14, color: eu ? '#58a6ff' : '#e3b341', weight: 3, fill: false })); });
        }
      });
      // 船與前往方向
      info.forEach(({ a, lv }) => {
        const st = stale(a), p = C.ports[a.unlo];
        const peer = V && a.vid !== V.vid;   // 航行地圖：同航線其他船畫淡色、不畫航跡
        if ((S.layers.route || single) && !peer) if (p) {
          let path = ROUTES().v[a.vid];                                  // 從船位沿海上航路到下一港（避開陸地）；查不到才退回直線
          if (!path) { let lon = p[1]; if (Math.abs(lon - a.lon) > 180) lon += lon < a.lon ? 360 : -360; path = [[a.lat, a.lon], [p[0], lon]]; }
          OFFS.forEach(o => L.polyline(path.map(q => [q[0], q[1] + o]), { color: col.sub, weight: 2, opacity: .8, dashArray: '5 5' }).addTo(groups.route));
        }
        if (S.layers.vessel || single) {
          const gap = a.etaRep && a.etaCalc ? Math.abs(ts(a.etaRep) - ts(a.etaCalc)) / HR : null, o = U.risk.byVessel(a.vid);
          const bad = Object.values(o).filter(x => x.level === 'high').map(x => x.label);
          const pop = vesselCard(a, st, gap, lv, bad);
          const hd = headingOf(a, ROUTES().v[a.vid], p), loa = loaOf(a.teu), mpp = 156543.03 * Math.cos(a.lat * Math.PI / 180) / Math.pow(2, map.getZoom()), real = loa / mpp >= 28;
          OFFS.forEach(o => {
            const cc = peer ? col.no : lvColor(lv);
            const m = real ? L.polygon(hullPts(a.lat, a.lon + o, hd, loa, loa * .14), { color: cc, weight: st ? 2.5 : 1.5, fillColor: cc, fillOpacity: st ? .1 : peer ? .4 : .85, opacity: peer ? .6 : 1 })
              : L.marker([a.lat, a.lon + o], { icon: shipIcon(cc, st, hd, map.getZoom()), zIndexOffset: peer ? 900 : 1100, opacity: peer ? .55 : 1 });   // 船畫在港口圖示上面，停在港內也看得到
            m.bindTooltip(a.name, { direction: 'top', offset: [0, real ? 0 : -9], sticky: !!real }); m.bindPopup(pop, { minWidth: 300, maxWidth: 340 }); m.addTo(groups.vessel);
            if (real && loa / mpp >= 90) shipDetail(a, a.lat, a.lon + o, hd, loa, loa * .14, x => x.addTo(groups.vessel));
            if (V && !peer) L.marker([a.lat, a.lon + o], { icon: L.divIcon({ className: '', iconSize: [48, 48], iconAnchor: [24, 24], html: '<div class="vpulse"></div>' }), interactive: false, keyboard: false }).addTo(groups.sel);   // 這艘船：外圈脈動
            if (!single && !V && a.vid === S.fv) { L.marker([a.lat, a.lon + o], { icon: L.divIcon({ className: '', iconSize: [48, 48], iconAnchor: [24, 24], html: '<div class="vpulse"></div>' }), interactive: false, keyboard: false }).addTo(groups.sel); if (o === 0) lastFocus = m; }
          });
          bounds.push([a.lat, wrap(a.lon)]);
        }
      });
      el.querySelector('[data-mc]').textContent = single ? '' : V ? (S.svc ? `航線 ${S.svc}：這艘船＋同航線 ${info.length - 1} 艘` : '') : `顯示 ${info.length} / ${ships.length} 艘`;
      if (V) {   // 航行地圖對焦：這艘船＋接下來停靠港（不是整條航線）
        bounds.length = 0; const me = ships.find(a => a.vid === V.vid); if (me && me.lat != null) bounds.push([me.lat, wrap(me.lon)]);
        Object.keys(UP || {}).forEach(u => { const p = C.ports[u]; if (p) bounds.push([p[0], wrap(p[1])]); });
      }
      if (!fitted || single) {
        fitted = true;
        if (bounds.length > 1) {   // 跨太平洋的航線：經度改用 0～360 表示時範圍較小，就改用那一種，地圖才會對焦在太平洋而不是整個世界
          const sp = a => Math.max(...a) - Math.min(...a), l1 = bounds.map(b => b[1]), l2 = l1.map(x => (x < 0 ? x + 360 : x));
          if (sp(l2) < sp(l1) - 1) bounds.forEach((b, i) => (b[1] = l2[i]));
        }
        if (bounds.length) { if (bounds.length === 1) map.setView(bounds[0], 5); else { const pr = B && SS ? Math.min(box.clientWidth * .45, 480) : 0;   // 營運總控台選了航線／整區：右側會開詳情，對焦時避開那一塊
          map.fitBounds(bounds, pr ? { paddingTopLeft: [30, 60], paddingBottomRight: [30 + pr, 30], maxZoom: 6 } : { padding: [30, 30], maxZoom: single ? 7 : 6 }); } } else map.setView([20, 120], 3);
      }
      if (S.fvFly && lastFocus) {                                    // 標出的船：移到畫面中間並打開氣泡
        S.fvFly = false; const ll = lastFocus.getLatLng ? lastFocus.getLatLng() : lastFocus.getBounds().getCenter();
        setTimeout(() => { map.setView(ll, Math.max(map.getZoom(), 5), { animate: true }); setTimeout(() => { if (lastFocus) lastFocus.openPopup(); }, 450); }, 0);
      }
    }
    box.addEventListener('click', e => { const rs = e.target.closest('[data-rs]'); if (rs) { e.preventDefault(); pickSvc(rs.dataset.rs); return; } const pd = e.target.closest('[data-pd]'); if (pd) { e.preventDefault(); STATE.bd.sel = pd.dataset.pd; U.IA.setLoc(1, 'dispatch'); U.bus.emit(); return; } const l = e.target.closest('[data-pl]'); if (l) { e.preventDefault(); U.go('M3', +l.dataset.pl); U.IA.setLoc(3, 's_load'); U.bus.emit(); return; } const a = e.target.closest('[data-pv]'); if (a) { e.preventDefault(); U.go('M3', +a.dataset.pv); } });
    el.querySelectorAll('[data-base]').forEach(b => (b.onclick = () => { S.base = b.dataset.base; setBase(S.base); }));
    el.querySelectorAll('[data-ly]').forEach(b => (b.onclick = () => { S.layers[b.dataset.ly] = !S.layers[b.dataset.ly]; b.setAttribute('aria-pressed', String(S.layers[b.dataset.ly])); draw(); }));   // 圖層卡片：點一下開關
    const sv = el.querySelector('[data-svc]');
    const pickSvc = code => { STATE.view.routeOpen = !!code; STATE.view.routeFrom = ''; if (B && U.boardApi) setTimeout(() => U.boardApi.select('', false), 0);   // 營運總控台：選了航線就在右側顯示航線詳情
      S.svc = code; if (code) S.layers.service = true; fitted = false; if (sv) sv.value = code; const cb = el.querySelector('[data-ly="service"]'); if (cb && code) cb.setAttribute('aria-pressed', 'true'); map.closePopup(); draw(); };
    if (sv) sv.onchange = () => pickSvc(sv.value);
    if (B) U.mapPickSvc = pickSvc;   // 營運總控台沒有航線下拉：航線詳情按「關閉」時用這個取消航線
    const dy = el.querySelector('[data-days]'); if (dy) dy.onchange = () => { S.days = +dy.value; draw(); };
    const rd = el.querySelector('[data-red]'); if (rd) rd.onchange = () => { S.red = rd.checked; draw(); };
    const fvIn = el.querySelector('[data-fv]');
    if (fvIn) { const pickFv = () => { const k = fvIn.value.trim().toLowerCase(); const hit = k ? ships.find(a => a.name.toLowerCase() === k) || ships.find(a => a.name.toLowerCase().includes(k)) : null; S.fv = hit ? hit.vid : null; S.fvFly = !!hit; if (hit) fvIn.value = hit.name; draw(); }; fvIn.onchange = pickFv; fvIn.addEventListener('search', pickFv); }
    map.on('zoomend', draw);   // 縮放時依比例切換三角形／小船／真實船體（要在第一次 draw 前掛上：第一次自動對焦後才知道縮放級距）
    setBase(S.base); draw();
    { const mft2 = el.querySelector('[data-mft]'), mtp2 = el.querySelector('[data-mtp]'); if (mft2 && mtp2) map.on('dragstart click', () => { if (S.open) { S.open = false; mtp2.hidden = true; mft2.setAttribute('aria-expanded', 'false'); const cr = mft2.querySelector('.car'); if (cr) cr.textContent = '▴'; } }); }
    setTimeout(() => U.mapInv(map), 0);
    return { redraw: draw, focus: u => { const p = C.ports[u]; if (p) map.flyTo([p[0], p[1]], Math.max(map.getZoom(), 5), { duration: .6 }); }, map };
  };
})();
