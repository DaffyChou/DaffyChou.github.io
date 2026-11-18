/* 營運指揮台（營運面總覽版本 B）：重點數字、營運地圖、今日要處理、未來 72 小時到港、航線到港落差、船隊狀態。
   只用既有資料（到港預報、港口運務板、缺櫃預估、船報）。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C, { COL, fmt, esc, STATE } = U, K = U.risk.K;
  const HR = 3600000, ts = s => Date.parse(s + 'Z');
  const pn = u => (U.ports ? U.ports(u) : u), vname = id => ((U.VBY[id] || {}).name || '');
  const NOORG = '此組織沒有運務資料（只有「模擬貨櫃公司」有）。請在上方組織選「模擬貨櫃公司」或「全部組織」。';
  const reg = U.reg || (() => {});
  const P = bid => Object.assign({}, (U.RK.blocks[bid] || {}).params || {});

  // 本公司貨櫃船：每艘取最早一筆預報
  function own() {
    const m = {};
    CG.arrivals().filter(a => a.status === 'EXPECTED' && a.org === 3 && a.vid != null)
      .sort((a, b) => ((a.etaCalc || a.etaRep || '9999') < (b.etaCalc || b.etaRep || '9999') ? -1 : 1)).forEach(a => { if (!m[a.vid]) m[a.vid] = a; });
    return Object.values(m);
  }
  const stale = (a, h) => a.posT == null || CG.NOW - ts(a.posT) > h * HR;
  const gapOf = a => (a.etaRep && a.etaCalc ? Math.abs(ts(a.etaCalc) - ts(a.etaRep)) / HR : null);
  const arrH = a => { const e = a.etaCalc || a.etaRep; return e ? (ts(e) - CG.NOW) / HR : null; };

  // 今日要處理：跨主題清單（港口、缺櫃、ETA 落差、位置過期）
  function todo() {
    const p = P('M15-c2'), L = [];
    U.portBoard().filter(b => b.level === 'high' || b.level === 'mid').forEach(b => L.push({
      key: 'port:' + b.unlo, ek: 'port', spec: { k: 'port', unlo: b.unlo }, lv: b.level, w: (b.level === 'high' ? 100 : 40) + Math.min(b.nToward, 20), kind: '港口', title: `${b.name}　${b.comp.filter(c => c[0] !== 'low').map(c => c[1]).join('、')}`,
      sub: b.nToward ? `${b.nToward} 艘將於 3 天內到港` : '3 天內沒有本公司船要到', go: () => { STATE.bd.sel = b.unlo; U.IA.setLoc(1, 'dispatch'); } }));
    const ys = {};
    CG.forecastAll().filter(r => r.status === '要處理' || r.status === '留意').forEach(r => { (ys[r.y] = ys[r.y] || []).push(r); });
    Object.entries(ys).forEach(([y, rs]) => {                                   // 同一場站的缺櫃櫃型合成一列
      const hi = rs.filter(r => r.status === '要處理'), first = Math.min(...rs.map(r => (r.first == null ? 99 : r.first)));
      L.push({ key: 'yard:' + y, ek: 'yard', spec: { k: 'yard', y: +y, c: rs[0].c }, lv: hi.length ? 'high' : 'mid', w: (hi.length ? 90 : 35) - Math.min(first, 7), kind: '缺櫃', title: `${C.yards[y][0]}　${rs.map(r => C.combos[r.c][0]).join('、')} 預估缺櫃`,
        sub: first < 99 ? `最早第 ${first} 天起低於安全存量（${hi.length} 種要處理、${rs.length - hi.length} 種留意）` : '預估區間下緣低於安全存量', go: () => { STATE.view.cargo = Object.assign(STATE.view.cargo || {}, { y: +y, c: rs[0].c }); U.IA.setLoc(1, 'cargo'); } });
    });
    own().forEach(a => {
      const g = gapOf(a), name = a.vid != null && U.VBY[a.vid] ? U.VBY[a.vid].name : '—';
      if (stale(a, p.stale_hr)) L.push({ key: 'pos:' + a.vid, ek: 'pos', spec: { k: 'vessel', vid: a.vid }, lv: 'mid', w: 30, kind: '位置', title: `${name}　位置超過 ${p.stale_hr} 小時沒更新`, sub: '無法算計算 ETA，請船務補報', go: () => U.go('M3', a.vid) });
      else if (g != null && g > p.gap_hr) L.push({ key: 'eta:' + a.vid, ek: 'eta', spec: { k: 'vessel', vid: a.vid }, lv: g > 2 * p.gap_hr ? 'high' : 'mid', w: (g > 2 * p.gap_hr ? 80 : 32) + Math.min(g, 20) / 4, kind: 'ETA', title: `${name}　回報與計算 ETA 差 ${fmt(g, 0)} 小時`, sub: `前往 ${pn(a.unlo || a.next)}`, go: () => U.go('M3', a.vid) });
    });
    return L.sort((a, b) => b.w - a.w);
  }

  function goSpec(sp) {
    if (!sp) return;
    if (sp.k === 'port') { if (U.boardApi) { U.boardApi.select(sp.unlo, true); return; } STATE.bd.sel = sp.unlo; U.IA.setLoc(1, 'opsov'); }
    else if (sp.k === 'yard') { STATE.view.cargo = Object.assign(STATE.view.cargo || {}, { y: sp.y, c: sp.c }); U.IA.setLoc(1, 'cargo'); }
    else if (sp.k === 'vessel') U.go('M3', sp.vid);
    window.scrollTo(0, 0); U.bus.emit();
  }
  // 點事件：地圖飛到該港口（並開港口詳情）或該船
  U.events.fly = sp => {
    if (!sp || !U.cmdMap) return;
    const mm = U.cmdMap.map; if (!mm || !mm._mapPane || !mm._container || !mm._container.isConnected) return;   // 營運總控台的地圖已不在畫面上（例如在單船頁開事件）就不飛
    if (sp.k === 'port') U.cmdMap.focus(sp.unlo);
    else if (sp.k === 'vessel') { const a = own().find(x => x.vid === sp.vid); if (a && a.lat != null) U.cmdMap.map.flyTo([a.lat, a.lon], 6, { duration: .6 }); }
  };
  // ---------- 運務管理的共用篩選：航線下拉分組（北美、歐洲、亞洲、大洋洲；和地圖同一套自動分區），可選整區或單一航線
  const RGS = () => (U.svcRegions ? U.svcRegions() : []);
  const REGION = new Proxy({}, { get: (o, k) => { const r = RGS().find(x => x.k === k); return r ? r.list.map(x => x.code) : []; } });   // region 代號 → 這一區的航線代碼
  const F = () => { const f = (STATE.view.opsan = STATE.view.opsan || { region: '', svc: '', h: 72 }); if (f.region && !RGS().some(r => r.k === f.region)) f.region = ''; return f; };   // 舊的區域代號（ap/eu/am）不再使用
  const inF = svc => { const f = F(); return (!f.region || REGION[f.region].includes(svc)) && (!f.svc || svc === f.svc); };
  const ownF = () => own().filter(a => inF(a.svc));
  function regPorts() { const f = F(); if (!f.region && !f.svc) return null; const set = new Set(); (U.M.services || []).filter(x => inF(x.code)).forEach(x => x.ports.forEach(u => set.add(u))); return set; }
  function evF(list) {
    const rp = regPorts(); if (!rp) return list;
    return list.filter(e => { const sp = e.spec || {}; if (sp.k === 'port') return rp.has(sp.unlo); if (sp.k === 'vessel') { const a = own().find(x => x.vid === sp.vid); return a ? inF(a.svc) : false; } if (sp.k === 'yard') { const y = C.yards[sp.y]; return y ? rp.has(y[1]) : true; } return true; });
  }
  const filtBar = () => { const f = F(), cur = f.svc || (f.region ? 'R:' + f.region : ''); return `<div class="opf"><label class="fld">航線<select data-ops aria-label="航線（可選整區）"><option value="">全部航線</option>${RGS().map(r => `<optgroup label="${esc(r.n)}（${r.list.length} 條）"><option value="R:${r.k}"${cur === 'R:' + r.k ? ' selected' : ''}>${esc(r.n)}整區（${r.list.length} 條）</option>${r.list.map(x => `<option value="${esc(x.code)}"${cur === x.code ? ' selected' : ''}>${esc(x.code)}　${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>${cur ? `<button type="button" class="lnk" data-opx>清除</button>` : ''}</div>`; };
  const wireFilt = el => {
    const f = F();
    const s = el.querySelector('[data-ops]'); if (s) s.onchange = () => { const v = s.value; if (v.startsWith('R:')) { f.region = v.slice(2); f.svc = ''; } else { f.region = ''; f.svc = v; } U.bus.emit(); };   // 整區＝region；單一航線＝svc
    const x = el.querySelector('[data-opx]'); if (x) x.onclick = () => { f.region = ''; f.svc = ''; U.bus.emit(); };
  };
  const codeOf = id => ((U.M.services || []).find(s => s.id === id) || {}).code;   // 船的 svc 是航線編號，篩選用航線代碼
  const fActive = () => { const f = F(); return !!(f.region || f.svc); };
  const fLabel = () => { const f = F(); if (f.svc) return '航線 ' + f.svc; const r = RGS().find(x => x.k === f.region); return r ? r.n + '整區' : ''; };
  const fVids = () => U.scopeVessels().filter(v => !fActive() || (v.svc != null && inF(codeOf(v.svc)))).map(v => v.id);
  // blocks：卡片右上「範圍」跟著這個篩選顯示（core.js vesselsFor、app.js 範圍文字用）
  U.opsFilt = { html: filtBar, wire: wireFilt, regPorts, F, vids: fVids, active: fActive, label: fLabel, blocks: new Set(['M15-c8', 'M15-c10', 'M15-c11', 'M15-c13', 'M5-c1', 'M5-c2', 'M16-c0', 'M16-c1', 'M16-c2', 'M16-c3', 'M16-c4', 'M16-c5']) };   // 運務管理四個頁籤共用的頁首篩選（app.js 畫在頁籤下面）
  const evItems = () => todo().map(x => ({ key: x.key, kind: x.ek, lv: x.lv, title: x.title, sub: x.sub, spec: x.spec }));

  // ---------------- M15-c0 營運重點數字（頁首篩選＋六張數字卡）
  reg('M15-c0', (el, c) => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    const o = ownF(), all = own(), EV = U.events; EV.sync(evItems());
    const rows = nextRows(o), z = states(o), in24 = o.filter(a => { const h = arrH(a); return h != null && h >= 0 && h <= 24; }).length;
    const hi = rows.filter(r => r.lv === 'high').length, abn = rows.filter(r => r.lv !== 'low' || r.stale).length;
    const evo = evF(EV.list().filter(e => !e.seed && (e.status === 'new' || e.status === 'in_progress'))), nNew = evo.filter(e => e.status === 'new').length, od = evo.filter(e => e.status === 'new' && Date.now() > 0 && (EV.now() - e.openedAt) > (EV.SLA[e.lv] || 48) * HR && !e.cleared).length;
    U.kpis(el, [
      { k: '營運船舶', v: fmt(o.length, 0) + ' 艘', d: o.length === all.length ? '前往下一港的本公司貨櫃船' : `全船隊 ${all.length} 艘`, cls: 'no', g: '有預計抵港資料、正在前往下一個港口的本公司貨櫃船；篩選區域或航線時只算範圍內。' },
      { k: '在航中', v: fmt(z.sail, 0) + ' 艘', d: `位置正常、航速 1 節以上`, cls: 'ok', g: '位置沒有過期且航速 1 節以上。' },
      { k: '靠泊中', v: fmt(z.port, 0) + ' 艘', d: `航速不到 1 節`, cls: 'no', g: '位置沒有過期且航速不到 1 節（停泊或在錨）。' },
      { k: '24 小時內到港', v: fmt(in24, 0) + ' 艘', d: '依計算 ETA', cls: 'no', g: '預計 24 小時內抵達下一港的船。' },
      { k: '異常／需處置', v: fmt(abn, 0) + ' 艘', d: hi ? `要處理 ${hi}、留意 ${abn - hi}` : `留意 ${abn}（含位置過期 ${z.stale}）`, cls: hi ? 'bad' : abn ? 'warn' : 'ok', g: '船舶動態清單中優先分數達留意以上，或位置過期的船。' },
      { k: '待處理事件', v: fmt(nNew, 0) + ' 件', d: od ? `其中逾時 ${od} 件` : '沒有逾時', cls: od ? 'bad' : 'ok', g: '還沒人開始處理的事件（含篩選範圍）；逾時＝超過處理時限（要處理 24 小時、留意 48 小時）。' },
    ]);
  });

  // ---------------- M15-c1 營運指揮台：滿版地圖（圖層與篩選、港口清單、事件、港口詳情都浮在地圖上）
  reg('M15-c1', el => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const B = { ports: () => (U.boardApi ? U.boardApi.ports() : new Set()), level: u => (U.boardApi ? U.boardApi.level(u) : 'nodata'), selected: () => (U.boardApi ? U.boardApi.selected() : ''), onPort: u => { if (U.boardApi) U.boardApi.select(u, false); } };
    U.cmdMap = U.shipMap(el, { bulk: false, height: '100%', board: B });
    const wrap = el.querySelector('.mapwrap');
    if (wrap) {
      wrap.insertAdjacentHTML('beforeend', '<div class="psheet" data-sheet hidden><div class="psh"><b>港口詳情</b><button class="btn" data-sc aria-label="關閉港口詳情">關閉 ✕</button></div><div class="bdetail" data-bd></div></div>');
      wrap.querySelector('[data-sc]').onclick = () => { const wasRoute = U.routeDetail && U.routeDetail.active(); if (U.routeDetail) U.routeDetail.close(!!wasRoute); if (U.boardApi) U.boardApi.select('', false); };   // 關閉：港口詳情與航線詳情一起收起
      if (U.boardApi && U.boardApi.refresh) U.boardApi.refresh();
    }
  });

  // ---------------- M15-c2 今日要處理（事件：立案、指派、回報處理結果、結案；統計給長官看）
  reg('M15-c2', el => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    U.events.render(el, evItems(), goSpec);
  });

  // ---------------- M15-c4 各航線到港時間落差
  const sgapOf = a => (a.etaRep && a.etaCalc ? (ts(a.etaRep) - ts(a.etaCalc)) / HR : null);      // 回報減計算：正＝回報比計算晚、負＝回報比計算早
  function routeRows() {
    const by = {};
    ownF().forEach(a => { const g = sgapOf(a); if (g != null && a.svc) (by[a.svc] = by[a.svc] || []).push(g); });
    return Object.entries(by).map(([sv, arr]) => ({ svc: sv, n: arr.length, v: arr.reduce((x, y) => x + y, 0) / arr.length, thin: arr.length < 3 })).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  }

  // ---------------- M15-c5 船隊目前狀態
  function states(list) {
    const p = P('M15-c0'), o = list || own(), s = { sail: 0, port: 0, stale: 0 };
    o.forEach(a => { if (stale(a, p.stale_hr)) s.stale++; else if (a.sog != null && a.sog < 1) s.port++; else s.sail++; });
    return Object.assign(s, { n: o.length });
  }
  // ---------------- M15-c6 前往下一港的船：把 ETA、位置、目的港壅塞與空櫃、船上貨櫃、燃油放在同一列，依優先順序排序
  const EUC = new Set(['NL', 'DE', 'BE', 'FR', 'ES', 'IT', 'GR', 'PT', 'IE', 'DK', 'SE', 'FI', 'PL', 'HR', 'SI', 'MT', 'CY', 'EE', 'LV', 'LT', 'RO', 'BG']);
  const tg = (t, k) => `<span class="tag ${k}">${esc(t)}</span>`;
  function nextRows(list) {
    const p = P('M15-c6'), PB = Object.fromEntries(U.portBoard().map(b => [b.unlo, b])), fc = CG.forecastAll(), yardU = Object.fromEntries(C.yards.map(y => [y[0], y[1]]));
    return (list || own()).map(a => {
      const v = U.VBY[a.vid] || {}, g = gapOf(a), h = arrH(a), stl = stale(a, p.stale_hr), pb = PB[a.unlo], vc = (C.vcargo || {})[a.vid];
      const short = fc.filter(r => r.status === '要處理' && yardU[C.yards[r.y][0]] === a.unlo).length;
      const sn = (U.SN && U.SN.snap && U.SN.snap[a.vid]) || {}, days = sn.stale || sn.remain == null ? null : sn.remain, eta = h != null ? h / 24 : null;
      const fuelLow = days != null && eta != null && days < eta + p.fuel_margin_days;
      const emptyPct = vc && vc[0] ? 100 * vc[2] / vc[0] : null;
      let score = 0; const why = [];
      if (g != null && g > p.gap_hr) { score += g > 2 * p.gap_hr ? 3 : 2; why.push('ETA 落差'); }
      if (stl) { score += 2; why.push('位置過期'); }
      if (pb && pb.level === 'high') { score += 3; why.push('目的港壅塞'); } else if (pb && pb.level === 'mid') { score += 1; why.push('目的港留意'); }
      if (short) { score += 2; why.push('目的港缺櫃'); }
      if (fuelLow) { score += 3; why.push('燃油偏緊'); }
      if (emptyPct != null && emptyPct >= 40) { score += 1; why.push('空櫃多'); }
      return { st: stl ? '位置過期' : (a.sog != null && a.sog < 1 ? '靠泊' : '在航'), vid: a.vid, name: v.name || a.name || '—', svc: a.svc || '—', port: pn(a.unlo), unlo: a.unlo, h, calc: a.etaCalc, rep: a.etaRep, term: a.term, empties: a.empties, gap: g, stale: stl, pbLv: pb ? pb.level : 'nodata', pbIdx: pb ? pb.idx : null, short,
        cargo: vc ? { emp: vc[2], rf: vc[3], dg: vc[4], onb: vc[0] } : null, days, fuelLow, eu: EUC.has((U.M.ports[a.unlo] || {}).cc), score, why, lv: score >= p.high ? 'high' : score >= p.mid ? 'mid' : 'low' };
    }).sort((x, y) => y.score - x.score || (x.h == null) - (y.h == null) || x.h - y.h);
  }
  const hhmm = s => (s ? String(s).replace('T', ' ').slice(5, 16) : '—');
  const dur = h => (h == null ? '—' : h < 0 ? '已逾期' : h < 24 ? Math.floor(h) + ' 小時' : Math.floor(h / 24) + ' 天 ' + Math.floor(h % 24) + ' 小時');
  const V6 = { mode: 'next', tab: 'all' };
  const LVT = { high: ['要處理', 'bad'], mid: ['留意', 'warn'], low: ['正常', 'ok'] };
  // 船舶詳情抽屜：判讀依據、建議處置流程、相關事件
  function openVessel(r) {
    if (U.closeRight) U.closeRight('vdDrawer');
    let d = document.getElementById('vdDrawer'); if (!d) { d = document.createElement('aside'); d.id = 'vdDrawer'; d.className = 'evd'; document.body.appendChild(d); }
    const evs = U.events.list().filter(e => e.spec && e.spec.k === 'vessel' && e.spec.vid === r.vid && e.status !== 'resolved' && e.status !== 'archived');
    d.innerHTML = `<div class="evh"><b>${esc(r.name)}　→　${esc(r.port)}</b><button class="btn" data-x aria-label="關閉">✕</button></div><div class="evb">
      <div class="evchips">${tg(LVT[r.lv][0], LVT[r.lv][1])} ${tg(r.st, r.st === '位置過期' ? 'warn' : r.st === '靠泊' ? 'no' : 'ok')}</div>
      <div class="evsec">判讀依據</div><ul class="vdl">${r.why.length ? r.why.map(w => `<li>${esc(w)}</li>`).join('') : '<li>沒有異常項目</li>'}</ul>
      <p class="note">計算 ETA ${hhmm(r.calc)}（UTC）、回報 ETA ${hhmm(r.rep)}（UTC）、ETA 落差 ${r.gap == null ? '—' : fmt(r.gap, 1) + ' 小時'}、距抵達 ${dur(r.h)}。目的港壅塞指數 ${r.pbIdx == null ? '無資料' : fmt(r.pbIdx, 0)}${r.short ? '，目的港 ' + r.short + ' 種櫃型預估缺櫃' : ''}${r.days != null ? '；燃油剩餘約 ' + fmt(r.days, 1) + ' 天' : ''}。</p>
      <div class="evsec">建議處置流程</div><ol class="vdl"><li>確認位置時效：位置是否超過 12 小時沒更新。</li><li>比較計算 ETA 與回報 ETA，確認是真延誤還是資料異常。</li><li>聯絡船務、代理與碼頭，修正預報並預留泊位。</li><li>在事件中記錄處理結果並結案。</li></ol>
      <div class="evsec">相關事件</div>${evs.length ? evs.map(e => `<div class="vde"><span class="evchip">${U.events.KINDS[e.kind]}</span> ${esc(e.title)} <button class="btn" data-ev="${e.id}">開啟</button></div>`).join('') : '<div class="note">這艘船目前沒有開著的事件。</div>'}
      <div class="evbtns" style="margin-top:.8rem"><button class="btn pri" data-sv>看單船頁</button></div></div>`;
    d.querySelector('[data-x]').onclick = () => d.classList.remove('open');
    d.querySelector('[data-sv]').onclick = () => { d.classList.remove('open'); U.go('M3', r.vid); };
    d.querySelectorAll('[data-ev]').forEach(b => (b.onclick = () => { d.classList.remove('open'); U.events.openDrawer(b.dataset.ev); }));
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('open')));
  }
  reg('M15-c6', el => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    const all = nextRows(ownF()); if (!all.length) return U.emptyChart(el, '這個範圍內沒有前往下一港的本公司船');
    const PL = { high: ['塞', 'bad'], mid: ['留意', 'warn'], low: ['順', 'ok'], nodata: ['無資料', 'no'] };
    const TABS = [['all', '全部', r => true], ['sail', '在航', r => r.st === '在航'], ['port', '靠泊', r => r.st === '靠泊'], ['abn', '異常', r => r.lv !== 'low' || r.stale]];
    all.forEach(r => { r.onb = r.cargo ? r.cargo.onb : null; r.sgap = r.rep && r.calc ? (ts(r.rep) - ts(r.calc)) / HR : null; });
    const sub = t => `<div class="rsub">${t}</div>`;
    const nextTable = (box, rows) => U.table(box, { rows, sort: ['score', -1], onRow: r => openVessel(r), pageSize: 10, cols: [
      { k: 'score', t: '優先', h: r => tg(LVT[r.lv][0], LVT[r.lv][1]) },
      { k: 'name', t: '船名／原因', h: r => `<b>${esc(r.name)}</b> <span class="note rsvc">${esc(r.svc)}</span>` + (r.why.length ? sub(esc(r.why.join('、'))) : '') },
      { k: 'port', t: '下一港／碼頭', h: r => esc(r.port) + (r.eu ? ' ' + tg('歐盟', 'no') : '') + sub(r.term ? esc(r.term) : '碼頭未填') },
      { k: 'h', t: '計算 ETA／距抵達', n: true, h: r => hhmm(r.calc) + sub(dur(r.h)) },
      { k: 'sgap', t: 'ETA 差異', n: true, h: r => (r.sgap == null ? '—' : (Math.abs(r.sgap) > 6 ? tg('回報' + (r.sgap >= 0 ? '晚 ' : '早 ') + fmt(Math.abs(r.sgap), 1) + ' 時', 'warn') : '回報' + (r.sgap >= 0 ? '晚 ' : '早 ') + fmt(Math.abs(r.sgap), 1) + ' 時') + sub('回報 ' + hhmm(r.rep))) },
      { k: 'pbIdx', t: '目的港', h: r => tg(PL[r.pbLv][0], PL[r.pbLv][1]) + (r.pbIdx != null ? ' ' + fmt(r.pbIdx, 0) : '') + sub(r.short ? `<span class="bad">${r.short} 種缺櫃</span>` : '空櫃夠') },
      { k: 'onb', t: '貨櫃（TEU）', n: true, h: r => (r.cargo ? fmt(r.cargo.onb, 0) + sub(`${r.cargo.rf > 0 ? '冷 ' + fmt(r.cargo.rf, 0) : ''}${r.cargo.rf > 0 && r.cargo.dg > 0 ? '・' : ''}${r.cargo.dg > 0 ? '<span class="bad">危 ' + fmt(r.cargo.dg, 0) + '</span>' : ''}`) : '—') },
      { k: 'empties', t: '卸空櫃（TEU）', n: true, d: 0 },
      { k: 'days', t: '燃油（天）', n: true, h: r => (r.days == null ? '—' : (r.fuelLow ? tg(fmt(r.days, 1), 'warn') : fmt(r.days, 1))) },
      { k: 'st', t: '狀態', h: r => tg(r.st, r.st === '位置過期' ? 'warn' : r.st === '靠泊' ? 'no' : 'ok') }] });
    el.innerHTML = `<div class="v6bar"><span class="seg" role="group" aria-label="狀態">${TABS.map(([k, n, f]) => `<button type="button" data-v6t="${k}" aria-pressed="${V6.tab === k}">${n} ${all.filter(f).length}</button>`).join('')}</span></div><div data-v6></div>`;
    nextTable(el.querySelector('[data-v6]'), all.filter(TABS.find(t => t[0] === V6.tab)[2]));
    el.querySelectorAll('[data-v6t]').forEach(b => (b.onclick = () => { V6.tab = b.dataset.v6t; U.bus.emit(); }));
  });

  // ---------------- 船舶相關的警報事件（清單「警報數」與警報事件總覽共用）
  // 這艘船的事件：ETA 落差、位置過期（spec.vid＝這艘船）；目的港塞港、目的港缺櫃（港口或場站＝這艘船的下一港）；加上這艘船進行中的警報（警報規則）
  const openEv = () => U.events.list().filter(e => !e.seed && (e.status === 'new' || e.status === 'in_progress'));
  let evSynced = 0;
  const syncEv = () => { if (CG.orgOk() && Date.now() - evSynced > 2000) { U.events.sync(evItems()); evSynced = Date.now(); } };
  const nextPort = vid => { const a = own().find(x => x.vid === vid); return a ? a.unlo : null; };
  function evOfVessel(e, vid, np) {
    const sp = e.spec || {};
    if (sp.k === 'vessel') return sp.vid === vid;
    if (!np) return false;
    if (sp.k === 'port') return sp.unlo === np;
    if (sp.k === 'yard') { const y = C.yards[sp.y]; return !!y && y[1] === np; }
    return false;
  }
  const RULEN = () => Object.fromEntries(((window.UI_ALARM || {}).rules || []).map(r => [r.id || r.rule || r.code, r.name || r.label || r.id || r.rule]));
  const alarmsOf = vid => ((window.UI_ALARM || {}).events || []).filter(e => !e.end && e.vid === vid);
  U.vesselAlerts = vid => {
    syncEv();
    const np = CG.orgOk() ? nextPort(vid) : null, ev = CG.orgOk() ? openEv().filter(e => evOfVessel(e, vid, np)) : [], al = alarmsOf(vid);
    return { n: ev.length + al.length, hi: ev.filter(e => e.lv === 'high').length + al.filter(x => x.thr && x.value >= 2 * x.thr).length, ev, al };
  };

  // ---------------- M15-c7 警報事件總覽（運務管理第 5 個頁籤）：全部開著的事件＋進行中警報；可帶入船舶篩選（清單點「警報數」進來）
  const V7 = { kind: '', p: 0 };
  reg('M15-c7', el => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    syncEv();
    const KD = Object.assign({}, U.events.KINDS, { alarm: '警報' }), t = U.events.now(), ship = STATE.view.evShip || null, RN = RULEN();
    const ago = ms => { const h = ms / HR; return h < 1 ? Math.max(1, Math.round(ms / 60000)) + ' 分' : h < 48 ? fmt(h, 0) + ' 小時' : fmt(h / 24, 0) + ' 天'; };
    const shipOk = id => U.scopeVessels().some(v => v.id === id && inF(v.svc));
    let evs = evF(openEv()).map(e => ({ lv: e.lv, kind: e.kind, title: e.title, st: e.status === 'new' ? '待處理' : '處理中', who: e.assignee || '', when: ago(t - e.openedAt) + '前', t0: e.openedAt, ev: e.id }));
    let als = ((window.UI_ALARM || {}).events || []).filter(x => !x.end && shipOk(x.vid)).map(x => ({ lv: x.thr && x.value >= 2 * x.thr ? 'high' : 'mid', kind: 'alarm', vid: x.vid, title: `${vname(x.vid)}　${RN[x.rule] || x.rule}（${fmt(x.value, 1)}，門檻 ${fmt(x.thr, 1)}）`, st: '進行中', who: '', when: x.start + ' 起', t0: Date.parse(x.start + '-01') }));
    if (ship) { const np = nextPort(ship); evs = evF(openEv()).filter(e => evOfVessel(e, ship, np)).map(e => ({ lv: e.lv, kind: e.kind, title: e.title, st: e.status === 'new' ? '待處理' : '處理中', who: e.assignee || '', when: ago(t - e.openedAt) + '前', t0: e.openedAt, ev: e.id })); als = als.filter(x => x.vid === ship); }
    const all = evs.concat(als).sort((a, b) => (a.lv === b.lv ? a.t0 - b.t0 : a.lv === 'high' ? -1 : 1));
    const kc = k => all.filter(e => e.kind === k).length, list = all.filter(e => !V7.kind || e.kind === V7.kind);
    const PG = 15, npg = Math.max(1, Math.ceil(list.length / PG)); if (V7.p >= npg) V7.p = npg - 1;
    const page = list.slice(V7.p * PG, V7.p * PG + PG);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `${ship ? `<div class="evship">只看 <b>${esc(vname(ship))}</b> 的警報事件（${all.length} 件）<button type="button" class="btn sm" data-evx>看全部</button><button type="button" class="lnk" data-evv="${ship}">看單船頁</button></div>` : ''}
      <div class="fhd"><span class="seg fk" role="group" aria-label="類別"><button type="button" data-fk="" aria-pressed="${!V7.kind}">全部 ${all.length}</button>${Object.keys(KD).filter(k => kc(k)).map(k => `<button type="button" data-fk="${k}" aria-pressed="${V7.kind === k}">${KD[k]} ${kc(k)}</button>`).join('')}</span>
      <span class="fq"><span class="note">快速處理</span><button class="btn" data-q="eta">ETA 核對</button><button class="btn" data-q="map">看地圖與事件</button><button class="btn" data-q="cargo">看空櫃與場站</button></span></div>
      <div class="flist2" role="table" aria-label="警報事件總覽"><div class="flh" role="row"><span>等級</span><span>類別</span><span>事件</span><span>狀態</span><span>負責人</span><span>開立</span><span></span></div>${page.length ? page.map(e => `<div class="flr ${e.lv}" role="row"><span class="${e.lv === 'high' ? 'bad' : 'warn'}">${e.lv === 'high' ? '要處理' : '留意'}</span><span class="kc">${KD[e.kind] || e.kind}</span><span class="ft" title="${esc(e.title)}">${esc(e.title)}</span><span>${e.st}</span><span class="${e.who ? '' : 'mut'}">${e.who ? esc(e.who) : e.kind === 'alarm' ? '—' : '未指派'}</span><span class="mut">${esc(e.when)}</span>${e.ev ? `<button class="btn sm" data-ev="${e.ev}">處理</button>` : `<button class="btn sm" data-al="${e.vid}">看警報</button>`}</div>`).join('') : '<div class="note" style="padding:.6rem">這個範圍內目前沒有開著的警報事件。</div>'}</div>
      ${npg > 1 ? `<div class="pager"><span class="note">第 ${V7.p * PG + 1}–${Math.min(list.length, V7.p * PG + PG)} 件，共 ${list.length} 件</span><span class="pg"><button data-p7="-1"${V7.p === 0 ? ' disabled' : ''}>上一頁</button>${Array.from({ length: npg }, (_, i) => `<button data-p7="${i}" class="${i === V7.p ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-p7="+1"${V7.p === npg - 1 ? ' disabled' : ''}>下一頁</button></span></div>` : ''}`;
    el.querySelectorAll('[data-fk]').forEach(x => (x.onclick = () => { V7.kind = x.dataset.fk; V7.p = 0; U.bus.emit(); }));
    el.querySelectorAll('[data-p7]').forEach(x => (x.onclick = () => { const v = x.dataset.p7; V7.p = v === '+1' ? V7.p + 1 : v === '-1' ? V7.p - 1 : +v; U.bus.emit(); }));
    el.querySelectorAll('[data-ev]').forEach(b => (b.onclick = () => U.events.openDrawer(b.dataset.ev)));
    el.querySelectorAll('[data-al]').forEach(b => (b.onclick = () => { U.IA.setLoc(1, 'data'); window.scrollTo(0, 0); U.bus.emit(); }));
    { const x = el.querySelector('[data-evx]'); if (x) x.onclick = () => { STATE.view.evShip = null; V7.p = 0; U.bus.emit(); }; const v = el.querySelector('[data-evv]'); if (v) v.onclick = () => U.go('M3', +v.dataset.evv); }
    el.querySelectorAll('[data-q]').forEach(b => (b.onclick = () => {
      if (b.dataset.q === 'eta') { V6.tab = 'abn'; U.IA.setLoc(1, 'opsvl'); window.scrollTo(0, 0); U.bus.emit(); }
      else { U.IA.setLoc(1, b.dataset.q === 'map' ? 'opsov' : 'cargo'); window.scrollTo(0, 0); U.bus.emit(); }
    }));
  });
  // 從清單點「警報數」：到警報事件總覽，只看這艘船
  U.openVesselAlerts = vid => { STATE.view.evShip = vid; V7.p = 0; V7.kind = ''; U.IA.setLoc(1, 'opsevt'); window.scrollTo(0, 0); U.bus.emit(); };

  // ---------------- M15-c8 船隊貨櫃概況（環圈）／c9 貨櫃分布前 10 船／c10 貨櫃趨勢
  const fShips = () => fVids().map(vid => ({ vid }));   // 三張卡片（貨櫃概況、貨櫃趨勢、準點率）：和右上範圍同一批船
  function cargoSum(list) { let on = 0, g = 0, e = 0, r = 0, d = 0; list.forEach(a => { const v = (C.vcargo || {})[a.vid]; if (!v) return; on += v[0]; g += Math.max(0, v[1] - v[3] - v[4]); e += v[2]; r += v[3]; d += v[4]; }); return { on, g, e, r, d }; }
  reg('M15-c8', el => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    const z = cargoSum(fShips()); if (!z.on) return U.emptyChart(el, '這個範圍內沒有船上貨櫃資料');
    const col = COL(), items = [['一般滿櫃', z.g, col.pal[0]], ['空櫃', z.e, col.no], ['冷櫃', z.r, col.ok], ['危險櫃', z.d, col.bad]];
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="dn"><div class="dnc" data-d></div><ul class="dnl">${items.map(([n, v, c]) => `<li><i style="background:${c}"></i><span>${n}</span><b>${fmt(v, 0)} TEU</b><em>${fmt(100 * v / z.on, 1)}%</em></li>`).join('')}</ul></div>`;
    U.mkChart(el.querySelector('[data-d]'), { legend: { show: false }, tooltip: { trigger: 'item', confine: true, formatter: '{b}：{c} TEU（{d}%）' }, series: [{ type: 'pie', radius: ['58%', '80%'], label: { show: true, position: 'center', formatter: `船上總量\n${fmt(z.on, 0)} TEU`, color: col.ink, fontSize: 14, lineHeight: 20 }, labelLine: { show: false }, emphasis: { label: { show: true } }, data: items.map(([n, v, c]) => ({ name: n, value: v, itemStyle: { color: c } })) }] });
  });
  reg('M15-c10', el => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    const ids = fVids();
    const col = COL(), ser = [['艙位利用率', 'SLOT_UTIL', col.pal[0]], ['空箱比例', 'EMPTY_SHARE', col.warn], ['冷凍箱比例', 'REEFER_SHARE', col.ok]].map(([n, m, c]) => ({ n, c, d: U.fleetSeries(m, ids, 'mean') }));
    if (!ser.some(x => U.nums(x.d).length)) return U.emptyChart(el, '這個範圍內沒有逐月貨量資料');
    U.mkChart(el, { grid: { left: 36, right: 92, top: 30, bottom: 24 }, legend: { show: true, top: 0 }, tooltip: { trigger: 'axis', confine: true, valueFormatter: v => (v == null ? '—' : fmt(v, 1) + '%') },
      xAxis: { type: 'category', data: U.months, axisTick: { show: false } }, yAxis: { type: 'value', min: 0, max: 100, splitNumber: 4, axisLabel: { formatter: '{value}%' } },
      series: ser.map(x => ({ type: 'line', name: x.n, data: x.d.map(v => (v == null ? null : +(+v).toFixed(1))), showSymbol: false, lineStyle: { width: 2.2, color: x.c }, itemStyle: { color: x.c },
        endLabel: { show: true, formatter: p => `${x.n.replace('比例', '')} ${fmt(p.value, 1)}%`, color: x.c, fontSize: 11 } })) });
  });

  // ---------------- M15-c11 準點率與港口效率（準點率趨勢＋港口周轉）
  reg('M15-c11', el => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const ids = fVids(), col = COL(), pb = el, rp = regPorts();
      pb.innerHTML = '<div class="pgrid"><div><div class="bt">整體準點率趨勢（每月）</div><div class="pc" data-a></div></div><div><div class="bt">港口周轉：平均停留最長的 8 港（小時，近 30 天' + (rp ? '；只看所選航線停靠的港' : '') + '）</div><div class="pc" data-b></div></div></div>';
      const otp = U.fleetSeries('OTP', ids, 'mean'), pP = P('M15-c11');
      if (!U.nums(otp).length) U.emptyChart(pb.querySelector('[data-a]'), '這個範圍內沒有準點率資料');
      else U.mkChart(pb.querySelector('[data-a]'), { grid: { left: 40, right: 86, top: 16, bottom: 24 }, tooltip: { trigger: 'axis', confine: true, valueFormatter: v => (v == null ? '—' : fmt(v, 1) + '%') },
        xAxis: { type: 'category', data: U.months, axisTick: { show: false } }, yAxis: { type: 'value', min: v => Math.max(0, Math.floor((v.min - 5) / 10) * 10), max: 100, axisLabel: { formatter: '{value}%' } },
        series: [{ type: 'line', name: '準點率', data: otp.map(v => (v == null ? null : +(+v).toFixed(1))), showSymbol: false, lineStyle: { width: 2.4, color: col.pal[0] }, itemStyle: { color: col.pal[0] }, areaStyle: { color: col.pal[0], opacity: .08 },
          endLabel: { show: true, formatter: p => '本月 ' + fmt(p.value, 1) + '%', color: col.ink, fontSize: 11 },
          markLine: { symbol: 'none', silent: true, data: [{ yAxis: pP.otp_mid || 75, lineStyle: { color: col.warn, type: 'dashed' }, label: { formatter: (pP.otp_mid || 75) + '% 留意', color: col.warn, fontSize: 11, position: 'insideEndTop' } }, { yAxis: pP.otp_high || 60, lineStyle: { color: col.bad, type: 'dashed' }, label: { formatter: (pP.otp_high || 60) + '% 要處理', color: col.bad, fontSize: 11, position: 'insideEndBottom' } }] } }] });
      const PB = U.portBoard().filter(b => !rp || rp.has(b.unlo));
      const ports = PB.filter(b => b.avgStay != null).sort((x, y) => y.avgStay - x.avgStay).slice(0, 8);
      const allStay = PB.filter(b => b.avgStay != null), avgS = allStay.reduce((t, b) => t + b.avgStay, 0) / Math.max(1, allStay.length);
      if (!ports.length) U.emptyChart(pb.querySelector('[data-b]'), '沒有港口停留資料');
      else U.mkChart(pb.querySelector('[data-b]'), { grid: { left: 110, right: 70, top: 16, bottom: 24 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: p => `${p[0].name}<br>平均停留 ${fmt(p[0].value, 1)} 小時（所有港口平均 ${fmt(avgS, 1)}）` },
        xAxis: { type: 'value', show: false }, yAxis: { type: 'category', inverse: true, data: ports.map(b => b.name), axisTick: { show: false }, axisLine: { show: false } },
        series: [{ type: 'bar', barMaxWidth: 16, data: ports.map(b => ({ value: +b.avgStay.toFixed(1), itemStyle: { color: b.avgStay >= avgS * 1.2 ? col.bad : b.avgStay >= avgS * 1.05 ? col.warn : col.pal[0], borderRadius: [0, 3, 3, 0] } })), label: { show: true, position: 'right', fontSize: 11, color: col.sub, formatter: p => fmt(p.value, 1) + ' 小時' },
          markLine: { symbol: 'none', silent: true, data: [{ xAxis: +avgS.toFixed(1) }], lineStyle: { color: col.sub, type: 'dashed' }, label: { formatter: '平均 ' + fmt(avgS, 1), color: col.sub, fontSize: 11, position: 'end' } } }] });
  });
  // ---------------- M15-c13 ETA 準確度（對實際到港）：抵港前 24 小時的回報 ETA、計算 ETA 各差實際到港幾小時，換算浪費的時間
  const V13 = { by: 'svc' };
  reg('M15-c13', (el, c) => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const col = COL(), S = U.etaStats(U.opsFilt.vids(), c.mi, V13.by), a = S.all;
    if (!a.n) return U.emptyChart(el, '近 6 個月這個範圍沒有可比較的預測紀錄');
    const rows = S.rows.filter(r => V13.by === 'svc' || r.n >= 5).slice(0, V13.by === 'svc' ? 20 : 12), nm = k => (V13.by === 'port' ? pn(k) : k);
    const kp = (t, v, d, cls) => `<div class="kp1${cls ? ' ' + cls : ''}"><small>${t}</small><b>${v}</b><span class="note">${d}</span></div>`;
    el.innerHTML = `<div class="kprow">${kp('回報 ETA 平均差', fmt(a.repAbs, 1) + ' 小時', '抵港前 24 小時船上回報', a.repAbs >= 6 ? 'bad' : a.repAbs >= 4 ? 'warn' : '')}${kp('計算 ETA 平均差', fmt(a.calAbs, 1) + ' 小時', '同時間系統計算', a.calAbs >= 6 ? 'bad' : a.calAbs >= 4 ? 'warn' : '')}${kp('早到：錨地多等', fmt(a.early, 0) + ' 小時', '比回報早到、等泊超過該港平常', '')}${kp('晚到：泊位空等', fmt(a.late, 0) + ' 小時', '比船期表晚到、排好的泊位空著', '')}</div>
      <div class="v6bar"><span class="seg" role="group" aria-label="分組"><button type="button" data-eb="svc" aria-pressed="${V13.by === 'svc'}">依航線</button><button type="button" data-eb="port" aria-pressed="${V13.by === 'port'}">依港口（前 12，至少 5 次）</button></span><span class="note">近 6 個月 ${a.n} 次靠港；誤差＝實際到港 − 預測，往右＝實際比預測晚到</span></div>
      <div class="pc" data-a></div>`;
    const box = el.querySelector('[data-a]'); box.style.height = Math.max(14, rows.length * 2.2 + 4) + 'rem';
    U.mkChart(box, { grid: { left: 110, right: 40, top: 30, bottom: 36 }, legend: { show: true, top: 0, data: ['回報 ETA', '計算 ETA'] },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: ps => { const r = rows[ps[0].dataIndex]; return `${esc(nm(r.k))}${r.thin ? '（樣本少）' : ''}　${r.n} 次靠港<br>回報 ETA：平均 ${r.rep >= 0 ? '+' : ''}${fmt(r.rep, 1)} 小時，平均差 ${fmt(r.repAbs, 1)} 小時<br>計算 ETA：平均 ${r.cal >= 0 ? '+' : ''}${fmt(r.cal, 1)} 小時，平均差 ${fmt(r.calAbs, 1)} 小時<br>早到錨地多等 ${fmt(r.early, 0)} 小時（${r.nEarly} 次）・晚到泊位空等 ${fmt(r.late, 0)} 小時（${r.nLate} 次）`; } },
      xAxis: { type: 'value', name: '實際到港 − 預測（小時）', nameLocation: 'middle', nameGap: 24, axisLabel: { formatter: v => (v > 0 ? '+' : '') + v } },
      yAxis: { type: 'category', inverse: true, data: rows.map(r => nm(r.k) + (r.thin ? '（樣本少）' : '')), axisTick: { show: false } },
      series: [{ name: '回報 ETA', type: 'bar', barMaxWidth: 12, data: rows.map(r => +r.rep.toFixed(1)), itemStyle: { color: col.warn, borderRadius: 2 }, label: { show: true, position: 'right', fontSize: 11, color: col.sub, formatter: p => (p.value > 0 ? '+' : '') + p.value } },
        { name: '計算 ETA', type: 'bar', barMaxWidth: 12, data: rows.map(r => +r.cal.toFixed(1)), itemStyle: { color: col.pal[0], borderRadius: 2 }, label: { show: true, position: 'right', fontSize: 11, color: col.sub, formatter: p => (p.value > 0 ? '+' : '') + p.value },
          markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: col.sub }, label: { formatter: '{c}', color: col.sub, fontSize: 11 }, data: [{ xAxis: -6 }, { xAxis: 0 }, { xAxis: 6 }] } }] });
    el.querySelectorAll('[data-eb]').forEach(b => (b.onclick = () => { V13.by = b.dataset.eb; U.bus.emit(); }));
  });
  // ---------------- M15-c12 到港預報（含其他公司、之後的靠港）；範圍跟著運務管理的區域與航線
  reg('M15-c12', el => {
    const rp = regPorts();
    U.arrivalTable(el, false, rp ? a => rp.has(a.unlo) && (!F().svc || !a.svc || a.svc === F().svc) : null, true);   // 航線用頁首的，不重複
  });

  // ---------------- 風險判讀
  const nd = s => ({ level: 'nodata', summary: s, items: [] });
  const NOO = '此組織沒有運務資料（只有「模擬貨櫃公司」有）';
  const lv3 = (v, mid, high) => (v >= high ? 'high' : v >= mid ? 'mid' : 'low');
  K.ov_kpi = () => {
    if (!CG.orgOk()) return nd(NOO);
    const t = todo(), hi = t.filter(x => x.lv === 'high'), mi = t.filter(x => x.lv === 'mid');
    return { level: hi.length ? 'high' : mi.length ? 'mid' : 'low', summary: `今日 ${hi.length} 件要處理、${mi.length} 件留意（港口、缺櫃、ETA 落差、位置過期合計）`, items: t.slice(0, 6).map(x => ({ vid: null, text: `${x.kind}：${x.title}` })) };
  };
  K.ov_map = () => {
    if (!CG.orgOk()) return nd(NOO);
    const p = P('M15-c1'), o = own();
    if (!o.length) return nd('沒有前往下一港的本公司船');
    const st = o.filter(a => stale(a, p.stale_hr)), pct = 100 * st.length / o.length;
    return { level: lv3(pct, p.mid_pct, p.high_pct), summary: `${o.length} 艘船中 ${st.length} 艘位置超過 ${p.stale_hr} 小時沒更新（${fmt(pct, 0)}%；${p.mid_pct}% 留意、${p.high_pct}% 要處理）`, items: st.slice(0, 30).map(a => ({ vid: a.vid, text: '位置過期' })) };
  };
  K.ov_todo = () => {
    if (!CG.orgOk()) return nd(NOO);
    U.events.sync(evItems()); const st = U.events.stats(), list = U.events.list().filter(e => (e.status === 'new' || e.status === 'in_progress') && !e.seed);
    const od = st.overdueOpen, hi = list.filter(e => e.lv === 'high').length;
    return { level: od || hi ? 'high' : list.length ? 'mid' : 'low', summary: `開著的事件 ${list.length} 件（待處理 ${st.open}、處理中 ${st.prog}），其中要處理 ${hi} 件、逾時 ${od} 件；平均處理時間 ${st.avg == null ? '—' : fmt(st.avg / 3600000, 1) + ' 小時'}`,
      items: list.slice(0, 60).map(x => ({ vid: null, text: `${U.events.KINDS[x.kind]}：${x.title}（${x.status === 'new' ? '待處理' : '處理中：' + (x.assignee || '未指派')}）` })) };
  };
  K.ov_focus = () => {
    if (!CG.orgOk()) return nd(NOO);
    U.events.sync(evItems()); const list = evF(U.events.list().filter(e => !e.seed && (e.status === 'new' || e.status === 'in_progress'))), hi = list.filter(e => e.lv === 'high').length, st = U.events.stats();
    return { level: st.overdueOpen || hi ? 'high' : list.length ? 'mid' : 'low', summary: `開著的事件 ${list.length} 件，其中要處理 ${hi} 件、逾時 ${st.overdueOpen} 件`, items: list.slice(0, 40).map(x => ({ vid: null, text: `${U.events.KINDS[x.kind]}：${x.title}` })) };
  };
  K.ov_cdonut = () => {
    if (!CG.orgOk()) return nd(NOO);
    const p = P('M15-c8'), z = cargoSum(fShips()); if (!z.on) return nd('範圍內沒有船上貨櫃資料');
    const pct = 100 * z.e / z.on;
    return { level: lv3(pct, p.empty_mid, p.empty_high), summary: `空櫃占船上貨櫃 ${fmt(pct, 1)}%（${p.empty_mid}% 留意、${p.empty_high}% 要處理）；冷櫃 ${fmt(z.r, 0)}、危險櫃 ${fmt(z.d, 0)} TEU`, items: [] };
  };
  K.ov_ctrend = () => {
    if (!CG.orgOk()) return nd(NOO);
    const p = P('M15-c10'), ids = fVids(), a = U.fleetAt('SLOT_UTIL', ids, STATE.mi, 'mean'), b = U.fleetAt('SLOT_UTIL', ids, STATE.mi - 1, 'mean');
    if (a == null || b == null) return nd('資料不足，無法比較本月與上月艙位利用率');
    const drop = b - a;
    return { level: lv3(drop, p.drop_mid, p.drop_high), summary: `艙位利用率本月 ${fmt(a, 1)}%、上月 ${fmt(b, 1)}%（下降 ${p.drop_mid} 個百分點留意、${p.drop_high} 個要處理）`, items: [] };
  };
  K.ov_perf = () => {
    if (!CG.orgOk()) return nd(NOO);
    const p = P('M15-c11'), ids = fVids(), v = U.fleetAt('OTP', ids, STATE.mi, 'mean');
    if (v == null) return nd('資料不足，無法計算準點率');
    return { level: v < p.otp_high ? 'high' : v < p.otp_mid ? 'mid' : 'low', summary: `本月準點率 ${fmt(v, 1)}%（低於 ${p.otp_mid}% 留意、低於 ${p.otp_high}% 要處理）`, items: [] };
  };

  K.ov_gap = () => {
    if (!CG.orgOk()) return nd(NOO);
    const p = P('M15-c13'), rows = routeRows().filter(r => !r.thin);
    if (!rows.length) return nd('這個範圍內沒有足夠的回報與計算 ETA 可比較（每條航線至少 3 筆）');
    const top = rows[0], a = Math.abs(top.v), bad = rows.filter(r => Math.abs(r.v) >= p.mid);
    return { level: a >= p.high ? 'high' : a >= p.mid ? 'mid' : 'low', summary: `落差最大的航線 ${top.svc} 平均 ${top.v >= 0 ? '+' : ''}${fmt(top.v, 1)} 小時（${top.v >= 0 ? '回報較晚' : '回報較早'}；${p.mid} 小時留意、${p.high} 小時要處理）；${bad.length} 條航線超過 ${p.mid} 小時`,
      items: bad.slice(0, 10).map(r => ({ vid: null, text: `${r.svc}　平均 ${r.v >= 0 ? '+' : ''}${fmt(r.v, 1)} 小時（${r.n} 筆）` })) };
  };
  K.ov_next = () => {
    if (!CG.orgOk()) return nd(NOO);
    const p = P('M15-c6'), r = nextRows();
    if (!r.length) return nd('沒有前往下一港的本公司船');
    const hi = r.filter(x => x.lv === 'high'), mi = r.filter(x => x.lv === 'mid');
    return { level: hi.length ? 'high' : mi.length ? 'mid' : 'low', summary: `${r.length} 艘船中 ${hi.length} 艘要處理、${mi.length} 艘留意（優先分數 ${p.mid} 分留意、${p.high} 分要處理；ETA 落差、位置過期、目的港壅塞與缺櫃、燃油偏緊、空櫃多合計）`,
      items: hi.concat(mi).slice(0, 60).map(x => ({ vid: x.vid, text: `${x.port}：${x.why.join('、')}` })) };
  };
})();
