/* 單船「船上貨櫃」：概況數字、依卸貨港分組表、示意配載圖（模擬資料；冷櫃與危險櫃是滿櫃的一部分）。 */
(function () {
  'use strict';
  const U = window.UI, CG = U.cargo, C = CG.C, { COL, fmt, esc } = U;
  const reg = U.reg || (() => {});
  const pn = u => (U.ports ? U.ports(u) : u);
  const NOORG = '此組織沒有貨務資料（只有「模擬貨櫃公司」有）';
  const vcOf = c => (C.vcargo || {})[c.vids[0]];
  const none = el => U.emptyChart(el, '這艘船沒有貨櫃資料');

  reg('M14-c14', (el, c) => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    const v = vcOf(c); if (!v || v[0] == null) return none(el);
    const [onb, lad, emp, rf, dg, t, cap] = v, share = x => (onb ? fmt(100 * x / onb, 0) + '% 的船上貨櫃' : '');
    U.kpis(el, [
      { k: '船上貨櫃', v: fmt(onb, 0) + ' TEU', d: cap ? `艙位 ${fmt(cap, 0)} TEU，載貨率 ${fmt(100 * onb / cap, 0)}%` : '', cls: 'no', g: '最近一港裝船後，船上的貨櫃總量（模擬資料）。' },
      { k: '滿櫃', v: fmt(lad, 0) + ' TEU', d: share(lad), cls: 'no', g: '裝了貨的貨櫃。' },
      { k: '空櫃', v: fmt(emp, 0) + ' TEU', d: share(emp), cls: onb && emp / onb >= .4 ? 'bad' : onb && emp / onb >= .25 ? 'warn' : 'no', g: '沒有裝貨、要回收到場站的貨櫃。' },
      { k: '冷櫃', v: fmt(rf, 0) + ' TEU', d: rf > 0 ? '載有冷櫃，需接電' : '沒有冷櫃', cls: rf > 0 ? 'ok' : 'no', g: '冷凍或冷藏貨櫃，航行與靠港期間都要接電（滿櫃的一部分）。' },
      { k: '危險櫃', v: fmt(dg, 0) + ' TEU', d: dg > 0 ? '載有危險櫃，須特別處理' : '沒有危險櫃', cls: dg > 0 ? 'bad' : 'no', g: '裝載危險品的貨櫃，需要隔離與特別作業（滿櫃的一部分）。' },
    ]);
    el.insertAdjacentHTML('beforeend', `<div class="note">資料時間：${esc(String(t).replace('T', ' '))}（UTC，最近一港裝船後）。冷櫃與危險櫃為該港裝船量，作為船上載有與否的估計；模擬資料，不是逐櫃清單。</div>`);
  });

  reg('M14-c15', (el, c) => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    const v = vcOf(c); if (!v) return none(el);
    if (!v[7]) return U.emptyChart(el, '這艘船沒有航線預報，無法依卸貨港分組');
    const tot = v[7].reduce((s, r) => s + r[1], 0) || 1;
    U.table(el, { rows: v[7].map((r, i) => ({ ord: i + 1, port: pn(r[0]), lad: r[1], emp: r[2], rf: r[3], dg: r[4], pct: 100 * r[1] / tot })), sort: ['ord', 1],
      cols: [{ k: 'ord', t: '順序', n: true, d: 0 }, { k: 'port', t: '卸貨港' }, { k: 'lad', t: '滿櫃', n: true, d: 0 }, { k: 'emp', t: '空櫃', n: true, d: 0 },
        { k: 'rf', t: '冷櫃', n: true, d: 0 }, { k: 'dg', t: '危險櫃', n: true, d: 0 }, { k: 'pct', t: '占比', n: true, d: 0, h: r => fmt(r.pct, 0) + '%' }] });
    el.insertAdjacentHTML('beforeend', '<div class="note">單位：TEU。冷櫃、危險櫃是滿櫃的一部分；占比＝占船上滿櫃。</div>');
  });

  // ---------------- M14-c16 示意配載圖：每一格是一只貨櫃（有櫃號），由下往上堆；固定亂數，同一艘船每次一樣（模擬資料）
  const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const NC = 14, HOLD_T = 7, DECK_T = 5, TT = HOLD_T + DECK_T;
  const SHIPPERS = [['星辰電子貿易', '電子零組件', '陳經理'], ['海藍食品國際', '食品', '林專員'], ['錦程紡織', '紡織成衣', '黃經理'], ['遠航機械工業', '機械設備', '張副理'], ['岳峰化工', '化學原料', '吳經理'], ['新耀光電', '光電產品', '劉專員'], ['長盛家具', '家具', '蔡經理'], ['瑞豐塑膠', '塑膠原料', '許專員'], ['安泰醫材', '醫療器材', '鄭經理'], ['鼎利汽車零件', '汽車零件', '謝副理'], ['天橋玩具', '玩具文具', '楊專員'], ['順達日用品', '日用品', '洪經理'], ['凌雲半導體', '半導體', '郭經理'], ['青山農產', '農產冷鏈', '曾專員'], ['潮汐水產', '水產冷鏈', '簡經理'], ['恆基鋼鐵製品', '鋼製品', '賴副理']];
  const GOODS = { 1: ['消費性電子零組件', '成衣與紡織品', '家具', '塑膠原料', '汽車零件', '機械設備', '玩具與文具', '日用品', '紙製品', '鋼製品'], 3: [['冷凍水產', '-18°C'], ['冷藏水果', '+2°C'], ['冷凍肉品', '-25°C'], ['乳製品', '+4°C'], ['冷藏蔬菜', '+3°C'], ['疫苗與藥品', '+5°C']], 4: [['UN1263 油漆', '第 3 類 易燃液體'], ['UN1950 噴霧罐', '第 2 類 氣體'], ['UN3077 環境危害物質', '第 9 類 雜項'], ['UN1789 鹽酸', '第 8 類 腐蝕性'], ['UN2031 硝酸', '第 8 類 腐蝕性']], 5: ['半導體晶圓與 IC', '手機與平板', '精密醫療設備', '名牌服飾與皮件', '高級酒類', '藥品原料'] };
  const TYPE_NAME = { 1: '滿櫃', 2: '空櫃', 3: '冷櫃', 4: '危險櫃' };
  // 櫃型（ISO 6346 尺寸型號）：20 呎一律 DC／RF；40 呎乾櫃約五成五是 HQ；40 呎冷櫃多為冷凍高櫃 RQ（比例為模擬）
  const CTYPE = { DC: ['乾貨櫃', '8′6″'], HQ: ['高櫃', '9′6″'], RF: ['冷凍櫃', '8′6″'], RQ: ['冷凍高櫃', '9′6″'] };
  const ISO = { DC20: '22G1', DC40: '42G1', HQ40: '45G1', RF20: '22R1', RF40: '42R1', RQ40: '45R1' };
  // 櫃主：由櫃號前四碼（BIC 櫃主代碼）判斷；代碼與公司皆為虛構
  const OWNERS = { SLBU: ['COC', '本公司'], FLTU: ['COC', '本公司'], QZLU: ['LEASE', '恆通貨櫃租賃'], QXRU: ['LEASE', '環宇貨櫃租賃'], ORCU: ['SOC', ''] };
  const OWN_KIND = { COC: 'COC 船公司自有櫃', LEASE: '租賃櫃', SOC: 'SOC 貨主自備櫃' };
  const CONSOL = [['捷運通國際物流', '林課長'], ['匯海併櫃物流', '周專員'], ['聯程貨運承攬', '馬經理']];   // 併櫃業者（虛構）
  function buildBay(c, v) {                                                          // 回傳 { bays, cells }
    const [onb, , emp, rf, dg, , cap] = v, R = rng(+c.vids[0] * 104729), bays = Math.max(6, Math.min(30, Math.round(cap / (NC * TT * 2)))), f = Math.min(.97, onb / cap);
    const h = []; for (let b = 0; b < bays; b++) for (let k = 0; k < NC; k++) h.push(Math.max(0, Math.min(TT, Math.round(TT * (f + (R() - .5) * .5)))));
    const N = Math.round(f * bays * NC * TT); let sum = h.reduce((s, x) => s + x, 0), guard = 0;
    while (sum !== N && guard++ < 100000) { const i = Math.floor(R() * h.length); if (sum < N && h[i] < TT) { h[i]++; sum++; } else if (sum > N && h[i] > 0) { h[i]--; sum--; } }
    const cells = []; h.forEach((hh, i) => { const b = Math.floor(i / NC), col = i % NC; for (let k = 0; k < hh; k++) { const deck = k >= HOLD_T; if (R() < .22) { cells.push({ b, col, k, deck, type: 0, size: "20′", half: 0 }); cells.push({ b, col, k, deck, type: 0, size: "20′", half: 1 }); } else cells.push({ b, col, k, deck, type: 0, size: "40′", half: -1 }); } });
    const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const take = (pred, n, type) => { const pool = shuf(cells.filter(x => !x.type && pred(x))); pool.slice(0, n).forEach(x => (x.type = type)); const left = n - Math.min(n, pool.length); if (left > 0) shuf(cells.filter(x => !x.type)).slice(0, left).forEach(x => (x.type = type)); };
    const nOf = (x, min) => (x > 0 ? Math.max(min, Math.round(cells.length * x / onb)) : 0);
    take(x => x.deck && x.b >= bays * .35, nOf(dg, 1), 4);
    take(x => x.deck && (x.col < 3 || x.col >= NC - 3), nOf(rf, 1), 3);
    {                                                                                // 空櫃：只放在每一疊的最上面（一輪輪往下剝，下面的櫃子上方不會有空位）
      const stk = {}; cells.forEach(x => { (stk[x.b * NC + x.col] = stk[x.b * NC + x.col] || []).push(x); });
      const st = Object.values(stk).map(a => a.sort((p, q) => q.k - p.k));         // 每疊由上往下
      let need = nOf(emp, 0), rounds = 0;
      while (need > 0 && rounds++ < TT) {
        const cand = []; st.forEach(a => { const t = a.find(x => x.type !== 2); if (t && !t.type) cand.push(t); });
        if (!cand.length) break; shuf(cand).slice(0, need).forEach(x => { x.type = 2; need--; });
      }
    }
    cells.forEach(x => { if (!x.type) x.type = 1; });
    const lad = cells.filter(x => x.type !== 2);                                     // 高價值：在滿櫃（含冷櫃）裡挑少數，多在艙內
    shuf(lad.filter(x => !x.deck && x.type === 1).concat(lad.filter(x => x.type === 3 && R() < .3))).slice(0, Math.max(1, Math.round(lad.length * .04))).forEach(x => (x.hv = true));
    // 卸貨港：先卸的放上面，後卸的放下面；空櫃另外依空櫃量分配
    const ports = (v[7] || []).map(r => ({ u: r[0], lad: r[1], emp: r[2] }));
    const assign = (list, key) => {
      if (!ports.length) { list.forEach(x => (x.dest = -1)); return; }
      const w = ports.map(p => p[key]), tot = w.reduce((s, z) => s + z, 0) || 1, srt = list.slice().sort((a, b) => b.k - a.k + (R() - .5) * 1.5);
      let acc = 0, pi = 0; srt.forEach((x, i) => { while (pi < ports.length - 1 && i >= Math.round((acc + w[pi]) / tot * srt.length)) { acc += w[pi]; pi++; } x.dest = pi; });
    };
    assign(cells.filter(x => x.type !== 2), 'lad'); assign(cells.filter(x => x.type === 2), ports.some(p => p.emp > 0) ? 'emp' : 'lad');
    const R2 = rng(+c.vids[0] * 7919 + 17), pick = a => a[Math.floor(R2() * a.length)];   // 櫃型、櫃主、提單用另一組亂數，不改變原本的位置與貨物
    const blno = pre => pre + String(Math.floor(R2() * 9e8) + 1e8);
    cells.forEach((x, i) => {
      const sh = SHIPPERS[Math.floor(R() * SHIPPERS.length)];
      x.ct = x.type === 3 ? (x.size === '40′' && R2() < .6 ? 'RQ' : 'RF') : (x.size === '40′' && R2() < .55 ? 'HQ' : 'DC');
      x.iso = ISO[x.ct + (x.size === '20′' ? '20' : '40')];
      x.lcl = x.type === 1 && !x.hv && R2() < .12;                                   // 併櫃：只出現在一般乾貨滿櫃
      const u = R2(), pre = (x.type === 3 || x.lcl) ? (u < .7 ? (u < .35 ? 'SLBU' : 'FLTU') : (u < .85 ? 'QZLU' : 'QXRU'))
        : (u < .6 ? (u < .3 ? 'SLBU' : 'FLTU') : u < .88 ? (u < .74 ? 'QZLU' : 'QXRU') : 'ORCU');
      x.own = OWNERS[pre][0]; x.ownBy = pre === 'ORCU' ? (x.type === 2 ? pick(SHIPPERS)[0] : sh[0]) : OWNERS[pre][1];
      R();                                                                           // 保留原本的亂數順序（舊版用來挑櫃號前綴）
      x.no = pre + String(Math.floor(R() * 900000) + 100000) + Math.floor(R() * 10);
      x.wt = x.type === 2 ? +(2.1 + R() * 1.5).toFixed(1) : +(7 + R() * 21).toFixed(1);
      if (x.type === 1 && !x.hv) x.goods = GOODS[1][Math.floor(R() * GOODS[1].length)];
      if (x.type === 3) { const g = GOODS[3][Math.floor(R() * GOODS[3].length)]; x.goods = g[0]; x.temp = g[1]; }
      if (x.type === 4) { const g = GOODS[4][Math.floor(R() * GOODS[4].length)]; x.goods = g[0]; x.cls = g[1]; }
      if (x.hv) { x.goods = GOODS[5][Math.floor(R() * GOODS[5].length)]; x.val = Math.round(18 + R() * 180); }
      if (x.type === 2) x.bls = [];                                                  // 空櫃：沒有提單、沒有貨主
      else if (!x.lcl) x.bls = [{ no: blno('SLBT'), sh }];                           // 整櫃：一張提單、一個貨主
      else {                                                                         // 併櫃：主提單託運人是併櫃業者，各貨主在分提單上
        const n = 2 + Math.floor(R2() * 4), pool = SHIPPERS.slice();
        for (let j = pool.length - 1; j > 0; j--) { const k = Math.floor(R2() * (j + 1)); [pool[j], pool[k]] = [pool[k], pool[j]]; }
        const w = pool.slice(0, n).map(() => .3 + R2()), tw = w.reduce((a, b) => a + b, 0), hp = 'H' + pick(['JYT', 'HHC', 'LCF']);
        x.master = { no: blno('SLBT'), by: pick(CONSOL) };
        let acc = 0;
        x.bls = pool.slice(0, n).map((s2, j) => { const wt = j < n - 1 ? +(x.wt * w[j] / tw).toFixed(1) : +(x.wt - acc).toFixed(1); acc += wt; return { no: blno(hp), sh: s2, goods: s2[1], pk: 5 + Math.floor(R2() * 120), wt }; });
        x.goods = `併櫃雜貨（${n} 個貨主，見下方分提單）`;
      }
      x.i = i;
    });
    return { bays, cells, ports };
  }
  reg('M14-c16', (el, c) => {
    if (!CG.orgOk()) return U.emptyChart(el, NOORG);
    const v = vcOf(c); if (!v || !v[0] || !v[6]) return none(el);
    const M = buildBay(c, v), { bays, cells, ports } = M, col = COL();
    const byBay = Array.from({ length: bays }, () => []); cells.forEach(x => byBay[x.b].push(x));
    const S = { mode: 'type', type: 0, bay: Math.min(bays - 1, Math.floor(bays * .5)), sel: null, hvOnly: false, lclOnly: false, q: '' };
    const hit = x => { const k = S.q.toUpperCase(); return x.no.includes(k) || (x.master && x.master.no.includes(k)) || x.bls.some(b => b.no.includes(k) || b.sh[0].includes(S.q)) || (x.master && x.master.by[0].includes(S.q)) || x.ownBy.includes(S.q); };
    const PCOL = i => col.pal[(i + 1) % col.pal.length], CT = { 1: col.pal[0], 2: col.no, 3: col.ok, 4: col.bad };
    const fillOf = x => (S.mode === 'port' && x.type !== 2 ? PCOL(x.dest) : S.mode === 'port' ? col.no : CT[x.type]);
    const dim = x => (S.type && x.type !== S.type) || (S.hvOnly && !x.hv) || (S.lclOnly && !x.lcl) || (S.q && !hit(x));
    const pad2 = n => String(n).padStart(2, '0');
    const CS = 40, CH = 28, OX = 34, OY = 20, GAP = 8;
    const cy = k => OY + (TT - 1 - k) * CH + (k < HOLD_T ? GAP : 0);
    function bigSvg() {
      const W = OX + NC * CS + 4, H = OY + TT * CH + GAP + 4, hy = OY + DECK_T * CH + GAP / 2;
      let s = `<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;max-width:none;display:block;margin:0 auto" role="img" aria-label="第 ${S.bay + 1} 貨艙的貨櫃">`;
      for (let cc = 0; cc < NC; cc++) s += `<text x="${OX + cc * CS + CS / 2 - .75}" y="13" text-anchor="middle" font-size="11" fill="${col.sub}">${pad2(cc + 1)}</text>`;
      for (let k = 0; k < TT; k++) {
        s += `<text x="${OX - 8}" y="${cy(k) + CH / 2 + 3}" text-anchor="end" font-size="11" fill="${col.sub}">${pad2(k + 1)}</text>`;
        for (let cc = 0; cc < NC; cc++) s += `<rect x="${OX + cc * CS}" y="${cy(k)}" width="${CS - 2}" height="${CH - 2}" rx="3" fill="none" stroke="${col.line}" stroke-width=".5" stroke-dasharray="2 2" opacity=".5"/>`;
      }
      s += byBay[S.bay].map(x => `<rect data-i="${x.i}" x="${OX + x.col * CS + (x.half > 0 ? CS / 2 : 0)}" y="${cy(x.k)}" width="${x.half < 0 ? CS - 2 : CS / 2 - 1.5}" height="${CH - 2}" rx="3" fill="${fillOf(x)}" opacity="${dim(x) ? .18 : 1}" stroke="${x.i === S.sel ? '#fff' : x.hv ? '#f5c542' : 'none'}" stroke-width="${x.i === S.sel ? 3 : x.hv ? 2.5 : 0}" style="cursor:pointer"><title>${esc(x.no)}</title></rect>`).join('');
      return s + `<line x1="${OX - 4}" x2="${W}" y1="${hy}" y2="${hy}" stroke="${col.sub}" stroke-dasharray="5 4" opacity=".7"/></svg>`;
    }
    function miniSvg(arr) {
      const cs = 4.5, W = NC * cs + 4, H = TT * cs + 8;
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block" aria-hidden="true">${arr.map(x => `<rect x="${2 + x.col * cs + (x.half > 0 ? cs / 2 : 0)}" y="${2 + (TT - 1 - x.k) * cs + (x.deck ? 0 : 3)}" width="${x.half < 0 ? cs - .6 : cs / 2 - .4}" height="${cs - .6}" fill="${fillOf(x)}" opacity="${dim(x) ? .18 : 1}"/>`).join('')}</svg>`;
    }
    const money = n => 'US$ ' + fmt(n, 0) + ' 萬', phone = x => '02-5550-' + String(1000 + (x.i * 37) % 9000);
    function card() {
      const x = S.sel == null ? null : cells[S.sel];
      if (!x) return `<div class="bcard"><div class="bch"><b>貨櫃詳細資訊</b><span class="note">BAY ${pad2(S.bay + 1)}</span></div><div class="bempty">先選貨艙 → 點格位 → 這裡顯示櫃號、櫃型、櫃主、卸貨港、貨物與貨主／提單資料。<br><span class="note">黃色外框＝高價值貨櫃；白框＝目前選取</span></div></div>`;
      const p = x.dest >= 0 && ports[x.dest] ? ports[x.dest] : null, tier = x.deck ? x.k - HOLD_T + 1 : x.k + 1;
      const own = x.own === 'SOC' ? `${esc(x.ownBy)}（${OWN_KIND.SOC}）` : `${esc(x.ownBy)}（${OWN_KIND[x.own]}）`;
      const rows = [['位置', `第 ${x.b + 1} 貨艙 · 第 ${x.col + 1} 排 · ${x.deck ? '甲板' : '艙內'}第 ${tier} 層`],
        ['櫃型', `${x.size} ${x.ct} ${CTYPE[x.ct][0]}（ISO ${x.iso}，高 ${CTYPE[x.ct][1]}）`], ['櫃主', `${own}<div class="note">依櫃號前四碼 ${esc(x.no.slice(0, 4))} 判斷</div>`],
        ['卸貨港', p ? `${esc(pn(p.u))}（第 ${x.dest + 1} 個卸貨）` : '—'],
        ['貨物', x.type === 2 ? (x.own === 'SOC' ? '空櫃，回送櫃主' : '空櫃，回收到場站') : esc(x.goods)], ['重量', fmt(x.wt, 1) + ' 噸' + (x.type === 2 ? '（空櫃自重）' : '')]];
      if (x.temp) rows.push(['設定溫度', esc(x.temp) + '（需接電）']);
      if (x.cls) rows.push(['危險品等級', esc(x.cls)]);
      if (x.hv) rows.push(['申報價值', money(x.val)], ['處理', '加封、全程追蹤，建議放艙內並避免與危險櫃相鄰']);
      const tr = r => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`;
      const sh = x.type === 2 ? '<div class="note">空櫃，沒有提單與貨主（櫃主見上方）。</div>'
        : !x.lcl ? `<table>${[['提單號', esc(x.bls[0].no)], ['貨主', `${esc(x.bls[0].sh[0])}（${esc(x.bls[0].sh[1])}）`], ['聯絡人', esc(x.bls[0].sh[2])], ['電話', phone(x)]].map(tr).join('')}</table>`
        : `<table>${[['主提單號', esc(x.master.no)], ['託運人', `${esc(x.master.by[0])}（併櫃業者）`], ['聯絡人', esc(x.master.by[1])], ['電話', phone(x)]].map(tr).join('')}</table>
          <div class="note" style="margin:.3rem 0">併櫃：多個貨主的貨由併櫃業者拼在同一個櫃子。船公司的主提單只有一張，各貨主列在分提單上。</div>
          <table class="blt"><thead><tr><th>分提單號</th><th>貨主（聯絡人）</th><th>貨物</th><th>件數</th><th>重量</th></tr></thead><tbody>${x.bls.map(b => `<tr><td>${esc(b.no)}</td><td>${esc(b.sh[0])}<span class="note">（${esc(b.sh[2])}）</span></td><td>${esc(b.goods)}</td><td>${fmt(b.pk, 0)}</td><td>${fmt(b.wt, 1)} 噸</td></tr>`).join('')}</tbody></table>`;
      return `<div class="bcard"><div class="bch"><b>貨櫃詳細資訊</b><span class="note">BAY ${pad2(x.b + 1)}</span></div>
        <div class="bno"><b>${esc(x.no)}</b><button type="button" class="btn" data-copy>複製櫃號</button></div>
        <div class="bchips"><span class="bchip" style="--c:${CT[x.type]}">${TYPE_NAME[x.type]}</span><span class="bchip">${x.size} ${x.ct} ${CTYPE[x.ct][0]}（${x.size === "20′" ? 1 : 2} TEU）</span>${x.type === 2 ? '' : `<span class="bchip">${x.lcl ? `併櫃 LCL · ${x.bls.length} 個貨主` : '整櫃 FCL'}</span>`}<span class="bchip">${OWN_KIND[x.own]}</span>${x.hv ? '<span class="bchip hv">高價值</span>' : ''}</div>
        <div class="bsec">配載資訊</div><table>${rows.map(tr).join('')}</table>
        <div class="bsec">貨主與提單</div>${sh}
        <button type="button" class="btn" data-loc>定位目前格位</button>
        <div class="note" style="margin-top:.5rem">貨主、提單號、櫃主代碼、聯絡方式與貨物皆為虛構的模擬資料。</div></div>`;
    }
    const cnt = t => cells.filter(x => x.type === t).length, hvN = cells.filter(x => x.hv).length;
    const lg = (c2, l) => `<span><i style="background:${c2};border:1px solid ${col.line}"></i>${l}</span>`;
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const chip = (t, label, n, c2) => `<button type="button" class="bfc" data-type="${t}">${c2 ? `<i style="background:${c2}"></i>` : ''}${label} <small>${n}</small></button>`;
    el.innerHTML = `<div class="binfo"><span>圖上示意貨櫃 <b>${fmt(cells.length, 0)}</b> 只，合計 <b>${fmt(cells.reduce((a, x) => a + (x.size === "20′" ? 1 : 2), 0), 0)}</b> TEU（20 呎＝1 TEU、40 呎＝2 TEU）</span><span>其中高櫃（HQ、RQ）<b>${fmt(cells.filter(x => x.ct === 'HQ' || x.ct === 'RQ').length, 0)}</b> 只、併櫃 <b>${fmt(cells.filter(x => x.lcl).length, 0)}</b> 只</span><span class="note">窄格是 20 呎、寬格是 40 呎；合計 TEU 與上方概況相同。</span><span class="bdemo">模擬資料・非真實裝載位置</span></div>
      <div class="bfilter"><span class="note">配載分類</span>${chip(0, '全部', cells.length)}${chip(1, '一般滿櫃', cnt(1), CT[1])}${chip(2, '空櫃', cnt(2), CT[2])}${chip(3, '冷櫃', cnt(3), CT[3])}${chip(4, '危險櫃', cnt(4), CT[4])}
      <span class="seg" role="group" aria-label="顏色"><button type="button" data-md="type" aria-pressed="true">依類別</button><button type="button" data-md="port" aria-pressed="false">依卸貨港</button></span>
      <label class="fld"><input type="checkbox" data-hv> 只看高價值（${hvN}）</label><label class="fld"><input type="checkbox" data-lcl> 只看併櫃（${cells.filter(x => x.lcl).length}）</label><span class="sp"></span>
      <input type="search" data-q placeholder="搜尋櫃號、提單號或貨主…" style="width:15rem"><button type="button" class="btn" data-clear>清除篩選</button></div>
      <div class="bwork"><div class="bpanel"><div class="bch"><b>貨艙與配載格位</b><span class="note">由船尾（01）至船頭（${pad2(bays)}）</span></div><div data-bsel></div><div class="baywrap" data-grid></div><div class="mapleg" data-leg></div></div><div data-card></div></div>
      <div class="note">示意圖，不是真實配載：貨櫃一律從下往上堆，空櫃放在每疊最上面，冷櫃放甲板兩側、危險櫃放甲板前段，高價值櫃多在艙內；虛線以上是甲板、以下是艙內；未做穩定度與危險品隔離檢查。</div>`;
    const q = el.querySelector('[data-q]'), gridEl = el.querySelector('[data-grid]');
    function paint() {
      el.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('on', +b.dataset.type === S.type));
      el.querySelectorAll('[data-md]').forEach(b => b.setAttribute('aria-pressed', b.dataset.md === S.mode ? 'true' : 'false'));
      el.querySelector('[data-bsel]').innerHTML = `<div class="bsel">${byBay.map((arr, b) => `<button type="button" class="bmini${b === S.bay ? ' on' : ''}" data-bay="${b}"><span>${pad2(b + 1)}</span>${miniSvg(arr)}</button>`).join('')}</div><div class="note"><b>第 ${S.bay + 1} 貨艙</b>（點上方切換貨艙；點格位看詳細）</div>`;
      gridEl.innerHTML = bigSvg();
      el.querySelector('[data-leg]').innerHTML = (S.mode === 'port' ? ports.map((p, i) => lg(PCOL(i), `${i + 1} ${esc(pn(p.u))}`)).join('') + lg(col.no, '空櫃') : lg(CT[1], '一般滿櫃') + lg(CT[2], '空櫃') + lg(CT[3], '冷櫃') + lg(CT[4], '危險櫃')) + '<span><i style="background:none;border:2px solid #f5c542"></i>高價值</span><span><i style="background:none;border:2px solid #fff"></i>目前選取</span>';
      el.querySelector('[data-card]').innerHTML = card();
      el.querySelectorAll('[data-bay]').forEach(x => (x.onclick = () => { S.bay = +x.dataset.bay; S.sel = null; paint(); }));
      gridEl.querySelectorAll('[data-i]').forEach(r => (r.onclick = () => { S.sel = +r.dataset.i; paint(); }));
      const cp = el.querySelector('[data-copy]'); if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(cells[S.sel].no); cp.textContent = '已複製'; } catch (e) { cp.textContent = '無法複製'; } };
      const lc = el.querySelector('[data-loc]'); if (lc) lc.onclick = () => { S.bay = cells[S.sel].b; paint(); const r = gridEl.querySelector('[data-i="' + S.sel + '"]'); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    }
    el.querySelectorAll('[data-type]').forEach(b => (b.onclick = () => { S.type = +b.dataset.type; paint(); }));
    el.querySelectorAll('[data-md]').forEach(b => (b.onclick = () => { S.mode = b.dataset.md; paint(); }));
    el.querySelector('[data-hv]').onchange = e => { S.hvOnly = e.target.checked; paint(); };
    el.querySelector('[data-lcl]').onchange = e => { S.lclOnly = e.target.checked; paint(); };
    q.onchange = () => { S.q = q.value.trim(); const m = S.q ? cells.find(hit) : null; if (m) { S.bay = m.b; S.sel = m.i; } paint(); };
    el.querySelector('[data-clear]').onclick = () => { S.type = 0; S.hvOnly = false; S.lclOnly = false; S.q = ''; q.value = ''; el.querySelector('[data-hv]').checked = false; el.querySelector('[data-lcl]').checked = false; paint(); };
    paint();
  });
})();
