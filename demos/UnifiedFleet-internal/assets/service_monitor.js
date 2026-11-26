/* Service 監控（service-monitor）：航線詳情下方「Service 監控」區塊用的計算。只限貨櫃輪。
   一條 Service＝一條航線（U.M.services），港序是「去＋回」對稱：前半（含折返港）＝去程、後半＝回程。
   - 方向：把每艘船的靠港（近 200 天靠港紀錄＋到港預報）依時間沿港序往前走，看落在港序的哪一格。
   - 前後 7 天：資料基準日（cargo NOW）前 7 天的實際靠港、後 7 天的到港預報。
     原定到港（Proforma）：靠港紀錄用 peta；到港預報沒有 → 以這艘船最後一筆 peta 加上這條航線各段「原定到港間隔」中位數往後推。
   - 碼頭等待與作業：近 90 天，等泊＝aw＋dw、作業＝完工−開工（小時），與「在港時間分解」同口徑；全公司同港平均＝同期所有貨櫃船。
   - BSA：UI_BSA（示意值，key＝靠港 id）對照船上 TEU（onb）。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U || !U.cargo || !U.risk) return;
  const CG = U.cargo, HR = 3600000, DAY = 24 * HR;
  const ts = s => (s ? Date.parse(String(s).length <= 16 ? s + ':00Z' : String(s).slice(0, 19) + 'Z') : null);
  // 有東西向的長程線：[去程名稱, 回程名稱]；其他區域線顯示 去程／回程
  const BOUND = { EU1: ['West bound', 'East bound'], EC1: ['West bound', 'East bound'], EU2: ['East bound', 'West bound'], TP1: ['East bound', 'West bound'], TP2: ['East bound', 'West bound'] };
  const LATE_WARN = 6, LATE_BAD = 12, MORE_WAIT = 2;   // 晚到 6 小時黃、12 小時紅；比全公司同港平均多等 2 小時以上標出
  const USE_HI = 100, USE_LO = 70;                       // BSA 使用率 >100% 超配、<70% 偏低

  const svcBy = code => (U.M.services || []).find(x => x.code === code);
  const median = a => U.median(a), mean = a => U.mean(a);

  // 這條航線的船，沿港序走一遍：回傳每筆靠港／預報的方向、航次、原定到港
  function walk(sv) {
    const rot = sv.ports, cyc = rot.slice(0, -1), half = (rot.length - 1) >> 1, N = cyc.length;
    const ids = U.scopeVessels().filter(v => v.svc === sv.id).map(v => v.id), idset = new Set(ids);
    const lo200 = new Date(CG.NOW - 200 * DAY).toISOString().slice(0, 10);
    const hist = U.risk.rows('calls').filter(r => idset.has(r.vid) && r.nor && r.nor >= lo200);
    const fut = CG.arrivals().filter(a => a.status === 'EXPECTED' && idset.has(a.vid) && (a.etaCalc || a.etaRep));
    const out = [];
    ids.forEach(vid => {
      const seq = hist.filter(r => r.vid === vid).map(r => ({ k: 'H', t: ts(r.nor), port: r.port, r }))
        .concat(fut.filter(a => a.vid === vid).map(a => ({ k: 'F', t: ts(a.etaCalc || a.etaRep), port: a.unlo, a })))
        .sort((x, y) => x.t - y.t);
      let p = null, vy = null, pf = null, lastPort = null, seg = null, segDir = null;
      seq.forEach(s => {
        if (s.k === 'F' && s.port === lastPort) return;                 // 到港預報在折返／終點港會重複同一港（資料瑕疵），只取第一筆
        lastPort = s.port;
        let j = null;
        if (p == null) {
          const cand = cyc.map((q, i) => (q === s.port ? i : -1)).filter(i => i >= 0);
          j = cand.length ? cand[0] : null;
          const last = s.a ? s.a.last : null;
          if (last) cand.forEach(i => { if (cyc[(i - 1 + N) % N] === last) j = i; });
        } else {
          for (let st = 1; st <= N; st++) { const i = (p + st) % N; if (cyc[i] === s.port) { j = i; break; } }
        }
        if (j == null) return;                                         // 不在港序上的靠港（加油、臨時）略過
        const steps = p == null ? [] : Array.from({ length: ((j - p + N) % N) || N }, (_, i) => (p + 1 + i) % N);
        const dir = j <= half ? 0 : 1;
        // 航次方向段：同一艘船連續同方向的靠港＝一段；航次編號取該段第一筆靠港紀錄的航次（資料的航次切點不一定在港序起點）
        if (seg == null || dir !== segDir || steps.length >= N || steps.includes(0) || steps.includes(half + 1)) { seg = (seg == null ? 0 : seg + 1); segDir = dir; vy = s.k === 'H' ? s.r.vy : (vy == null ? null : vy + 1); }
        if (s.k === 'H') pf = ts(s.r.peta);
        else pf = pf == null ? null : steps.reduce((acc, i) => (acc == null || leg(sv, i) == null ? null : acc + leg(sv, i)), pf);
        out.push({ vid, k: s.k, t: s.t, port: s.port, idx: j, dir, seg, vy, pf: s.k === 'H' ? ts(s.r.peta) : pf, r: s.r, a: s.a });
        p = j;
      });
    });
    return out;
  }

  // 各段原定到港間隔（小時，中位數）：港序第 i 格的原定到港 − 第 i−1 格；用同航線全部船近 200 天的靠港紀錄
  const LEG = {};
  function leg(sv, i) {
    if (!LEG[sv.code]) {
      const rot = sv.ports, cyc = rot.slice(0, -1), N = cyc.length, ids = new Set(U.VBY ? Object.values(U.VBY).filter(v => v.svc === sv.id).map(v => v.id) : []);
      const lo = new Date(CG.NOW - 200 * DAY).toISOString().slice(0, 10), by = {};
      const rs = U.risk.rows('calls').filter(r => ids.has(r.vid) && r.nor >= lo && r.peta).sort((a, b) => a.vid - b.vid || (a.nor < b.nor ? -1 : 1));
      let prev = null, p = null;
      rs.forEach(r => {
        if (!prev || prev.vid !== r.vid) p = null;
        let j = null;
        if (p == null) j = cyc.indexOf(r.port);
        else for (let st = 1; st <= N; st++) { const i = (p + st) % N; if (cyc[i] === r.port) { j = i; break; } }
        if (j >= 0 && j != null) {
          if (p != null && (p + 1) % N === j) { const h = (ts(r.peta) - ts(prev.peta)) / HR; if (h > 0 && h < 60 * 24) (by[j] = by[j] || []).push(h); }
          p = j; prev = r;
        }
      });
      LEG[sv.code] = {}; Object.keys(by).forEach(k => (LEG[sv.code][k] = median(by[k]) * HR));
    }
    return LEG[sv.code][i] == null ? null : LEG[sv.code][i];
  }

  function bounds(sv) {
    const rot = sv.ports, half = (rot.length - 1) >> 1, nm = BOUND[sv.code] || ['去程', '回程'];
    return [{ name: nm[0], from: rot[0], to: rot[half] }, { name: nm[1], from: rot[half], to: rot[rot.length - 1] }];
  }

  // A：前後 7 天的船
  function window7(sv, W) {
    const lo = CG.NOW - 7 * DAY, hi = CG.NOW + 7 * DAY;
    return W.filter(x => (x.k === 'H' ? x.t >= lo && x.t < CG.NOW : x.t >= CG.NOW && x.t <= hi)).map(x => {
      const diff = x.pf != null ? (x.t - x.pf) / HR : null;
      return { vid: x.vid, name: U.VBY[x.vid].name, vy: x.vy, port: x.port, dir: x.dir, kind: x.k === 'H' ? 'actual' : 'expected', t: x.t, pf: x.pf, pfEst: x.k === 'F',
        diff, lv: diff == null ? 'no' : diff > LATE_BAD ? 'bad' : diff > LATE_WARN ? 'warn' : 'ok' };
    }).sort((a, b) => a.t - b.t);
  }

  // B：各港碼頭等待與作業（近 90 天）
  function portTimes(sv) {
    const lo = new Date(CG.NOW - 90 * DAY).toISOString().slice(0, 10), ids = new Set(Object.values(U.VBY).filter(v => v.svc === sv.id).map(v => v.id));
    const cont = new Set(Object.values(U.VBY).filter(v => v.type === 'container').map(v => v.id));
    const ok = r => r.nor >= lo && (r.role === 'LOAD' || r.role === 'DISCHARGE') && cont.has(r.vid);
    const wait = r => (r.aw || 0) + (r.dw || 0), work = r => (r.ws && r.we ? (ts(r.we) - ts(r.ws)) / HR : null);
    const all = U.risk.rows('calls').filter(ok), stops = [];
    sv.ports.forEach(u => { if (!stops.includes(u)) stops.push(u); });
    return stops.map(u => {
      const mine = all.filter(r => r.port === u && ids.has(r.vid)), fleet = all.filter(r => r.port === u);
      const w = mean(mine.map(wait)), fw = mean(fleet.map(wait));
      return { port: u, n: mine.length, wait: w, work: mean(mine.map(work).filter(h => h > 0.5)), fleetWait: fw, fleetN: fleet.length,
        more: w != null && fw != null && mine.length >= 2 && w - fw >= MORE_WAIT ? w - fw : 0 };
    });
  }

  // C：BSA vs 實際裝載（最近 4 個航次方向；每段＝離開某港時）
  function bsa(sv, W) {
    const B = (window.UI_BSA || {}).bsa || {}, g = {};
    W.filter(x => x.k === 'H' && x.r && B[x.r.id] != null && x.r.onb != null).forEach(x => {
      const key = x.vid + '|' + x.seg;
      const o = g[key] || (g[key] = { vid: x.vid, name: U.VBY[x.vid].name, vy: x.vy, dir: x.dir, legs: [], last: 0 });
      const b = B[x.r.id], use = 100 * x.r.onb / b;
      o.legs.push({ port: x.port, t: x.t, dep: ts(x.r.dep), bsa: b, onb: x.r.onb, use, lv: use > USE_HI ? 'over' : use < USE_LO ? 'low' : 'ok' });
      o.last = Math.max(o.last, x.t);
    });
    const vs = Object.values(g).filter(o => o.legs.length >= 2).sort((a, b) => b.last - a.last).slice(0, 4);
    // 依到港排序（還在港內的靠港沒有離港時間）
    vs.forEach(o => { o.legs.sort((a, b) => a.t - b.t); o.avg = mean(o.legs.map(l => l.use)); o.nOver = o.legs.filter(l => l.lv === 'over').length; o.nLow = o.legs.filter(l => l.lv === 'low').length; });
    return { voyages: vs, avg: mean(vs.map(o => o.avg)) };
  }

  // ---------------- 畫面：掛在航線詳情（route_detail.js）最下方；可收合，開合狀態記在 STATE.view.svmOpen
  const esc = s => U.esc(s), fmt = (v, d) => U.fmt(v, d);
  const pn = u => (U.ports ? U.ports(u) : u);
  const hm = t => (t == null ? '—' : new Date(t).toISOString().slice(5, 16).replace('T', ' '));
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const T = (title, text) => `<div class="bt">${title} <button type="button" class="qm pq" aria-expanded="false" title="說明">?</button></div><div class="pqx note" hidden>${text}</div>`;
  const sgn = h => (h > 0 ? '+' : h < 0 ? '−' : '') + fmt(Math.abs(h), 0);

  function htmlShips(m) {
    const th = m.th;
    const one = (b, dir) => {
      const rs = m.ships.filter(x => x.dir === dir), past = rs.filter(x => x.kind === 'actual'), fut = rs.filter(x => x.kind === 'expected');
      const row = x => `<div class="svrow">
          <span class="svn"><button type="button" class="lnk" data-svv="${x.vid}" title="地圖移到這艘船">${esc(x.name)}</button><small>${x.vy != null ? '航次 ' + esc(x.vy) : ''}</small></span>
          <span class="svp">${esc(pn(x.port))}<small>${x.kind === 'actual' ? '實際到港' : '預計到港'}</small></span>
          <span class="svt"><small>原定 ${hm(x.pf)}${x.pfEst ? '＊' : ''}</small>${hm(x.t)}</span>
          <span class="svd">${x.diff == null ? '<small class="note">—</small>' : tag(Math.abs(x.diff) < 0.5 ? '準時' : (x.diff > 0 ? '晚 ' : '早 ') + fmt(Math.abs(x.diff), 0) + ' 時', x.lv)}<button type="button" class="lnk svbp" data-svbp="${x.vid}" title="看這艘船的示意配載圖（船圖）">船圖</button></span>
        </div>`;
      const mid = `<div class="svnow"><span>資料基準 ${hm(CG.NOW)}（UTC）</span></div>`;
      return `<div class="svdir"><div class="svdh"><b>${esc(b.name)}</b><span class="note">${esc(pn(b.from))} → ${esc(pn(b.to))}</span><span class="note">${rs.length} 筆</span></div>
        ${rs.length ? past.map(row).join('') + mid + (fut.length ? fut.map(row).join('') : '<div class="note svempty">之後 7 天沒有本公司船靠港</div>') : '<div class="note svempty">前後 7 天沒有本公司船靠港</div>'}</div>`;
    };
    return T('前後 7 天的船', `以資料基準時間為中心，前 7 天的實際到港與後 7 天的預計到港，依方向分開列（每 7 天一班）。原定＝船期表（Proforma）的到港時間；標「＊」的是依這艘船最後一次原定到港，加上這條航線各段的原定航程推算。差＝實際或預計到港 − 原定到港：晚 ${th.LATE_WARN} 小時以上標黃、${th.LATE_BAD} 小時以上標紅，早到或準時標綠。點船名：地圖移到這艘船；點「船圖」：看這艘船的示意配載圖（正式版由運務部提供船圖）。時間皆為 UTC。`)
      + m.bounds.map(one).join('');
  }

  function htmlPorts(m) {
    const P = m.ports, mx = Math.max(1, ...P.map(p => Math.max(p.wait || 0, p.fleetWait || 0))), hot = P.filter(p => p.more > 0);
    const w = h => (h == null ? 0 : Math.max(0, Math.min(100, 100 * h / mx)));
    const row = p => `<div class="svprow${p.more ? ' hot' : ''}">
        <span class="svmpn">${esc(pn(p.port))}<small>${p.n} 次靠港</small></span>
        <span class="svbar" title="這條航線平均等泊 ${p.wait == null ? '—' : fmt(p.wait, 1)} 小時；全公司同港平均 ${p.fleetWait == null ? '—' : fmt(p.fleetWait, 1)} 小時">
          <i class="b" style="width:${w(p.wait)}%"></i>${p.fleetWait == null ? '' : `<i class="m" style="left:${w(p.fleetWait)}%"></i>`}</span>
        <span class="svpv">${p.n ? fmt(p.wait, 1) : '—'}<small>全公司 ${p.fleetWait == null ? '—' : fmt(p.fleetWait, 1)}</small></span>
        <span class="svpv">${p.work == null ? '—' : fmt(p.work, 1)}</span>
        <span class="svpf">${p.more ? tag('多等 ' + fmt(p.more, 1) + ' 時', 'warn') : p.n < 2 ? '<small class="note">次數少</small>' : ''}</span>
      </div>`;
    return T('碼頭等待與作業時間', `近 90 天這條航線的船在各港的平均等泊小時（到港到開始作業前的等待）與平均作業小時（開工到完工），依停靠港序排列。長條＝這條航線的平均等泊；細直線＝全公司所有貨櫃船在同一港的平均等泊。比全公司平均多等 ${m.th.MORE_WAIT} 小時以上（且至少 2 次靠港）標「多等」，代表這條航線在這港的泊位窗口可能要跟碼頭重新協調。`)
      + `<p class="svmsum">${hot.length ? `比全公司同港平均多等的港：${hot.map(p => `<strong>${esc(pn(p.port))}</strong>（多 ${fmt(p.more, 1)} 小時）`).join('、')}` : '各港等泊都和全公司同港平均差不多。'}</p>
      <div class="svlgd note"><span><i class="b"></i>本航線平均等泊</span><span><i class="m"></i>全公司同港平均</span><span>單位：小時</span></div>
      <div class="svptbl"><div class="svprow svhd"><span>港口</span><span>等泊</span><span>等泊</span><span>作業</span><span></span></div>${P.map(row).join('')}</div>`;
  }

  function htmlBsa(m) {
    const B = m.bsa, th = m.th, vs = B.voyages;
    if (!vs.length) return T('BSA 配艙與實際裝載', 'BSA＝聯營航線上每艘船分給本公司的艙位額度（TEU）。') + '<div class="note svempty">近期沒有可比對的航次。</div>';
    const nOver = vs.reduce((s, o) => s + o.nOver, 0), nLow = vs.reduce((s, o) => s + o.nLow, 0);
    const bar = u => `<span class="svub"><i style="width:${Math.min(100, u / 1.2)}%"></i><b></b></span>`;
    const lt = l => (l.lv === 'over' ? tag('超配', 'bad') : l.lv === 'low' ? tag('偏低', 'warn') : '');
    const voy = (o, i) => `<details class="svv"${i === 0 ? ' open' : ''}><summary><span><b>${esc(o.name)}</b>${o.vy != null ? '　航次 ' + esc(o.vy) : ''}　${esc(m.bounds[o.dir].name)}</span>
        <span class="note">平均 ${fmt(o.avg, 0)}%${o.nOver ? '・超配 ' + o.nOver + ' 港' : ''}${o.nLow ? '・偏低 ' + o.nLow + ' 港' : ''}</span></summary>
        <div class="svbrow svhd"><span>離開港口</span><span>BSA</span><span>實際</span><span>使用率</span><span></span></div>
        ${o.legs.map(l => `<div class="svbrow${l.lv !== 'ok' ? ' ' + l.lv : ''}"><span>${esc(pn(l.port))}<small>${l.dep ? '離港 ' + hm(l.dep) : '在港作業中'}</small></span><span>${fmt(l.bsa, 0)}</span><span>${fmt(l.onb, 0)}</span><span class="svu">${bar(l.use)}${fmt(l.use, 0)}%</span><span>${lt(l)}</span></div>`).join('')}</details>`;
    return T('BSA 配艙與實際裝載 ' + tag('示意', 'warn'), `BSA＝聯營航線上每艘船分給本公司的艙位額度（TEU）；實際＝離開該港時船上本公司的貨櫃量（TEU）；使用率＝實際 ÷ BSA。超過 ${th.USE_HI}% 標「超配」（要向聯營夥伴借艙位），低於 ${th.USE_LO}% 標「偏低」（分到的艙位沒用滿）。列出這條航線最近 4 個航次（每個方向各算一個航次），最新的一個預設展開。長條的直線＝100%。目前 BSA 為示意值（依各航段歷來載貨量模擬），正式版由陽明運務部提供。`)
      + `<p class="svmsum">近 4 個航次平均使用率 <strong>${fmt(B.avg, 0)}%</strong>；${nOver || nLow ? `超配 ${nOver} 港、偏低 ${nLow} 港。` : '沒有超配或偏低的港。'}</p>`
      + `<div class="svbsa">${vs.map(voy).join('')}</div>`;
  }

  U.svcMonMount = (el, code) => {
    if (!el) return;
    if (U.STATE.type !== 'container') { el.innerHTML = ''; return; }
    const m = U.svcMon(code); if (!m) { el.innerHTML = ''; return; }
    const V = U.STATE.view || (U.STATE.view = {});
    el.innerHTML = `<details class="svm"${V.svmOpen ? ' open' : ''}><summary><b>Service 監控</b><span class="note">去程／回程前後 7 天的船</span></summary>
      <div class="svbody">${T('名詞說明', `<b>Service</b>＝一條固定繞行的航線（例如歐洲線），這裡就是航線 ${esc(m.sv.code)}（${esc(m.sv.name)}）。<br><b>${esc(m.bounds[0].name)}／${esc(m.bounds[1].name)}</b>＝去程與回程：港序前半（${esc(pn(m.bounds[0].from))} → ${esc(pn(m.bounds[0].to))}）是去程，後半是回程${BOUND[m.sv.code] ? '；長程線依航行方向稱 West bound（往西）或 East bound（往東）' : '；區域線沒有明確東西向，直接稱去程／回程'}。<br><b>Proforma（原定船期）</b>＝航線固定的船期表，每港原本排定的到港時間，用來和實際或預計到港比較早晚。<br><b>BSA</b>（Basic Slot Allocation）＝聯營航線上，每艘船分給本公司的艙位額度（TEU）。`)}${htmlShips(m)}${htmlPorts(m)}${htmlBsa(m)}</div></details>`;
    const dt = el.querySelector('details');
    dt.addEventListener('toggle', () => (V.svmOpen = dt.open));
    el.querySelectorAll('[data-svv]').forEach(b => (b.onclick = () => { const S = V.map; if (!S) return; S.fv = +b.dataset.svv; S.fvFly = true; if (U.cmdMap && U.cmdMap.redraw) U.cmdMap.redraw(); }));
    el.querySelectorAll('[data-svbp]').forEach(b => (b.onclick = () => { U.STATE.vessel = +b.dataset.svbp; U.IA.setLoc(3, 's_load'); U.STATE.scrollTo = null; U.bus.emit(); window.scrollTo(0, 0); }));
  };

  const memo = {};
  U.svcMon = code => {
    const sv = svcBy(code); if (!sv) return null;
    const key = code + '|' + U.STATE.org + '|' + U.STATE.type;
    if (memo[key]) return memo[key];
    const W = walk(sv);
    return (memo[key] = { sv, bounds: bounds(sv), ships: window7(sv, W), ports: portTimes(sv), bsa: bsa(sv, W),
      th: { LATE_WARN, LATE_BAD, MORE_WAIT, USE_HI, USE_LO } });
  };
})();
