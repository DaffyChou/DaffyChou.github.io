/* 碼頭靠泊時程：每列一個碼頭，同碼頭的船依時間自動分成不重疊的多條。
   U.berthGantt(el, 港口)：畫一個港口的所有碼頭；U.berthGanttTerms(el, [碼頭代碼…])：畫指定碼頭（自有碼頭分頁），
   跨港口時共用同一條時間軸（時區不同時改用台灣時間），並在圖上方列出每個碼頭的摘要。
   長條＝靠泊到離港；深色段＝開工到完工；長條前虛線＝到港到靠泊（等泊）。以資料基準時間為「現在」。
   時間軸用港口當地時間（取基準時間當下的時差，期間內不處理夏令時間切換）。資料：UI_CARGO.berth（export_cargo_data.py）。 */
(function () {
  'use strict';
  const U = window.UI, C = window.UI_CARGO, { esc } = U;
  const HR = 3600000, NOW = Date.parse(C.now + ':00Z');
  const T0 = NOW - 3 * 24 * HR, T1 = NOW + 5 * 24 * HR;           // 資料範圍：前 3 天到後 5 天
  const PX = 13, LANE = 26, PAD = 5, HEAD = 40;                      // 每小時寬度、每條高度
  const ms = s => (s ? Date.parse(s + ':00Z') : null);
  const LVN = { A: ['A 級', '碼頭作業系統介接：所有船都有五個時間'], B: ['B 級', '港務開放資料：其他公司船只有靠泊與離泊，沒有開工、完工'], C: ['C 級', '只有本公司船報：看不到其他公司的船'] };
  const ST = { done: ['#9aa3ad', '已完工'], work: ['#ef8a2b', '作業中'], plan: ['#13998a', '尚未開工'] };
  const LATE = 6, RED = '#dc3f41';                                    // 離港比計畫晚 6 小時以上標紅框（使用者確認）

  function tzOff(tz, t) {                                             // 該時區在 t 的時差（毫秒）
    if (!tz) return 0;
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(new Date(t)).map(x => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60000) * 60000;
    } catch (e) { return 0; }
  }

  // 一筆靠泊 → { name, term, own, arr, af, ws, we, dep, est, st }；時間為毫秒（UTC）
  // unlo：港口（null＝不限港口）；codes：只取這些碼頭（省略＝不限）
  function items(unlo, codes) {
    const B = C.berth || { own: [], ext: [] }, out = [], cs = codes ? new Set(codes) : null;
    const pick = r => (unlo == null || r[2] === unlo) && (!cs || cs.has(r[3]));
    B.own.filter(pick).forEach(r => out.push({ own: true, vid: r[0], name: r[1] || '—', unlo: r[2], term: r[3], arr: ms(r[4]), af: ms(r[5]), ws: ms(r[6]), we: ms(r[7]), dep: ms(r[8]), pEta: ms(r[9]), pEtd: ms(r[10]), delay: r[11], est: r[12] }));
    const lvOf = t => ((B.lv || {})[t] || ['C'])[0];
    B.ext.filter(r => pick(r) && lvOf(r[3]) !== 'C').forEach(r => {                  // C 級碼頭不畫其他公司船
      const plan = !r[8];
      out.push({ own: false, name: r[0], carrier: r[1], unlo: r[2], term: r[3], src: r[4], arr: ms(r[5]), af: ms(r[8]) || ms(r[6]), ws: ms(r[9]), we: ms(r[10]), dep: ms(r[11]) || ms(r[7]), pEta: ms(r[6]), pEtd: ms(r[7]), est: plan ? 2 : r[11] ? 0 : 1 });
    });
    out.forEach(x => { x.st = x.dep <= NOW && x.est !== 2 ? 'done' : x.af <= NOW && x.est !== 2 ? 'work' : 'plan'; x.late = x.own && x.delay != null && x.delay >= LATE; });
    return out.filter(x => x.af && x.dep && x.dep > T0 && x.af < T1);
  }

  // 提示框：五個時間（實際或預計），港口當地時間，非台灣港口附台灣時間
  const twOff = t => tzOff('Asia/Taipei', t);
  const fmtT = (t, o) => { const d = new Date(t + o); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.toISOString().slice(11, 16)}`; };
  const when = (t, est, none, tz) => {
    if (!t) return `<span class="note">${none || '—'}</span>`;
    const pre = est || t > NOW ? '預計 ' : '';
    return pre + fmtT(t, tzOff(tz, t)) + (tz === 'Asia/Taipei' ? '' : `<span class="note">（台灣 ${fmtT(t, twOff(t))}）</span>`);
  };
  function tipHtml(x, tz) {
    const noWork = !x.own && x.src === 'PORT_OPEN' ? '港務資料沒有' : '—', e2 = x.est === 2;
    const rows = [['到港', when(x.arr, e2, null, tz)], ['靠泊', when(x.af, e2, null, tz)], ['開工', when(x.ws, e2, noWork, tz)], ['完工', when(x.we, e2, x.ws && x.st === 'work' && !x.we ? '作業中，尚未完工' : noWork, tz)], ['離港', when(x.dep, x.est > 0, null, tz)]];
    if (x.own && x.pEtd) rows.push(['計畫離港', when(x.pEtd, false, null, tz).replace('預計 ', '')]);
    const ul = x.own && U.unloadOf ? U.unloadOf(x.vid, x.unlo, x.af, x.arr) : null;   // 貨量：未靠泊＝預估（含明細）、已靠泊或離港＝實際
    if (ul) rows.push([ul.actual ? '卸櫃（實際）' : '預計卸櫃', ul.actual ? `<b>${U.fmt(ul.tot, 0)} TEU</b>` : `<b>${U.fmt(ul.tot, 0)} TEU</b><span class="note">（滿 ${U.fmt(ul.lad, 0)}・空 ${U.fmt(ul.emp, 0)}・冷 ${U.fmt(ul.rf, 0)}・危 ${U.fmt(ul.dg, 0)}）</span>`]);
    if (x.own && x.delay != null) rows.push(['離港延誤', `<b style="color:${x.late ? RED : 'inherit'}">${x.delay > 0 ? x.delay.toFixed(1) + ' 小時' : '沒有延誤'}</b>`]);
    return `<b>${esc(x.name)}</b>　<span class="note">${x.own ? '本公司' : esc(x.carrier || '其他公司')}</span><br><span class="note">碼頭 ${esc(x.term)}・${ST[x.st][1]}${x.est === 2 ? '（依預計到港推估）' : ''}</span>
      <table>${rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</table>${x.own ? '<div class="note">點長條看這艘船的單船頁</div>' : ''}`;
  }

  // 同碼頭依時間分道：用 [到港或靠泊, 離港] 判斷重疊，先到先排
  function lanes(list) {
    const ends = [];
    list.sort((a, b) => (a.arr || a.af) - (b.arr || b.af)).forEach(x => {
      const s = Math.min(x.arr || x.af, x.af);
      let k = ends.findIndex(e => e <= s - HR);
      if (k < 0) { k = ends.length; ends.push(0); }
      ends[k] = x.dep; x.lane = k;
    });
    return Math.max(1, ends.length);
  }

  U.berthGantt = function (el, unlo) {
    const all = items(unlo), terms = [...new Set(all.map(x => x.term).filter(Boolean))].sort();
    if (!all.length) { el.innerHTML = '<div class="note">基準時間前後幾天沒有靠泊紀錄。</div>'; return; }
    draw(el, all, terms, (C.berth.tz || {})[unlo], '');
  };

  // 每個碼頭的摘要：在泊（已靠泊、未離港）、等泊中（已到港、未靠泊）、今天預計離港（現在到當地今天結束）、本公司船離港延誤 6 小時以上
  function summary(codes) {
    const B = C.berth || {}, info = {}; (B.ownTerms || []).forEach(t => (info[t[0]] = t));
    return codes.map(code => {
      const list = items(null, [code]), unlo = info[code] ? info[code][2] : (list[0] || {}).unlo, tz = (B.tz || {})[unlo];
      const off = tzOff(tz, NOW), dayEnd = Math.floor((NOW + off) / (24 * HR)) * 24 * HR + 24 * HR - off;
      const real = x => x.est !== 2;
      return { code, name: info[code] ? info[code][1] : code, unlo: info[code] ? info[code][2] : null, berths: info[code] ? info[code][3] : null, tz,
        berthed: list.filter(x => real(x) && x.af <= NOW && x.dep > NOW).length,
        waiting: list.filter(x => x.arr && x.arr <= NOW && x.af > NOW).length,
        departToday: list.filter(x => x.dep > NOW && x.dep <= dayEnd).length,
        late: list.filter(x => x.late).length, lateList: list.filter(x => x.late), n: list.length };
    });
  }

  U.berthGanttTerms = function (el, codes) {
    const all = items(null, codes);
    const S = summary(codes), tzs = [...new Set(S.map(s => s.tz).filter(Boolean))];
    const tz = tzs.length === 1 ? tzs[0] : 'Asia/Taipei';
    const pn = u => (U.ports ? U.ports(u) : u);
    const head = `<div class="bgsum">${S.map(s => `<div class="bgsr"><b>${esc(s.code)}</b><span class="note">${esc(pn(s.unlo || ''))}${s.berths ? '・' + s.berths + ' 個泊位' : ''}</span>
      <span class="pill">在泊 <b>${s.berthed}</b></span><span class="pill">等泊中 <b>${s.waiting}</b></span><span class="pill">今天預計離港 <b>${s.departToday}</b></span>
      <span class="pill${s.late ? ' bad' : ''}">離港延誤 ${LATE} 小時以上 <b>${s.late}</b></span></div>`).join('')}</div>`;
    if (!all.length) { el.innerHTML = head + '<div class="note">基準時間前後幾天，這些碼頭沒有靠泊紀錄。</div>'; return; }
    draw(el, all, codes.filter(c => all.some(x => x.term === c)), tz, head + (tzs.length > 1 ? '<div class="note">碼頭分屬不同時區，時間軸統一用台灣時間。</div>' : ''));
  };

  // 本公司船會停靠的碼頭：只取本公司船（vids），排除自有碼頭；ports＝只看這些港口（省略＝不限）
  // 碼頭依「下一艘到港時間」排序：還沒離港的船中最早到港（或靠泊）的排最上面，期間內都已離港的碼頭排最後
  const RG = { ap: '亞太', eu: '歐洲', am: '美洲' };
  const portRegion = u => { const p = (C.ports || {})[u]; if (!p) return 'ap'; return p[1] < -25 ? 'am' : p[1] < 45 && p[0] > 28 ? 'eu' : 'ap'; };
  function ownShipItems(vids, withOwn) {   // withOwn：單船頁也列自有碼頭
    const own = new Set(((C.berth || {}).ownTerms || []).map(t => t[0]));
    return items(null).filter(x => x.own && x.term && (withOwn || !own.has(x.term)) && (!vids || vids.has(x.vid)));
  }
  function nextAt(list) { const up = list.filter(x => x.dep > NOW).map(x => x.arr || x.af); return up.length ? Math.min(...up) : Infinity; }
  U.berthGanttOwn = function (el, opt) {
    opt = opt || {};
    const all = ownShipItems(opt.vids, opt.withOwn).filter(x => !opt.ports || opt.ports.has(x.unlo));
    if (!all.length) { el.innerHTML = (opt.pre || '') + '<div class="note">基準時間前 3 天到後 5 天，這個範圍沒有本公司船的靠泊紀錄。</div>'; return; }
    const terms = [...new Set(all.map(x => x.term))].map(t => { const l = all.filter(x => x.term === t); return { t, nx: nextAt(l), last: Math.max(...l.map(x => x.dep)) }; })
      .sort((a, b) => (a.nx - b.nx) || (b.last - a.last) || (a.t < b.t ? -1 : 1)).map(r => r.t);
    const tzs = [...new Set(all.map(x => (C.berth.tz || {})[x.unlo]).filter(Boolean))], tz = tzs.length === 1 ? tzs[0] : 'Asia/Taipei';
    draw(el, all, terms, tz, (opt.pre || '') + (tzs.length > 1 ? '<div class="note">碼頭分屬不同時區，時間軸統一用台灣時間；提示框另列港口當地時間。</div>' : ''), { ownOnly: true, focus: opt.focus || null });
  };
  U.berthGanttOwn.items = ownShipItems;
  U.berthGanttOwn.region = portRegion;
  U.berthGanttOwn.RG = RG;

  // 圖示：本公司船（白底小船形）、離港延誤 6 小時以上（紅底白色驚嘆號）
  const ICON_OWN = (x, cy) => `<g transform="translate(${x},${cy - 7})" pointer-events="none"><rect width="14" height="14" rx="3" fill="#fff"/><path d="M2.5 8.2 L11.5 8.2 L10 11 L4 11 Z M5 8 V4.6 H8.4 L9.6 8" fill="#1f6feb" stroke="#1f6feb" stroke-width=".8" stroke-linejoin="round"/></g>`;
  const ICON_LATE = (x, cy) => `<g transform="translate(${x},${cy})" pointer-events="none"><circle r="7.5" fill="${RED}" stroke="#fff" stroke-width="1.5"/><rect x="-1" y="-4.4" width="2" height="5.2" rx="1" fill="#fff"/><circle cy="3.2" r="1.15" fill="#fff"/></g>`;
  U.berthGantt.ICON_OWN = ICON_OWN; U.berthGantt.ICON_LATE = ICON_LATE;

  function draw(el, all, terms, tz, pre, o) {
    o = o || {};
    const pn = u => (U.ports ? U.ports(u) : u), unloOf = t => (all.find(x => x.term === t) || {}).unlo;
    const off = tzOff(tz, NOW);
    const L0 = T0 + off, X = t => ((t + off) - L0) / HR * PX, W = Math.round((T1 - T0) / HR * PX);
    const rows = terms.map(t => { const list = all.filter(x => x.term === t); return { t, list, n: lanes(list) }; });
    let y = HEAD; rows.forEach(r => { r.y = y; y += r.n * LANE + 2 * PAD; });
    const H = y + 2;
    // 時間軸：日期（當地）與每 6 小時刻度
    let ax = '';
    for (let t = Math.ceil(L0 / (6 * HR)) * 6 * HR; t < T1 + off; t += 6 * HR) {
      const x = (t - L0) / HR * PX, d = new Date(t), h = d.getUTCHours();
      ax += `<line x1="${x}" x2="${x}" y1="${h ? 22 : 0}" y2="${H}" stroke="var(--line)" stroke-width="${h ? .5 : 1}"/>`;
      ax += `<text x="${x + 3}" y="34" font-size="11" fill="var(--sub)">${String(h).padStart(2, '0')}:00</text>`;
      if (!h) ax += `<text x="${x + 4}" y="13" font-size="11" font-weight="600" fill="var(--ink)">${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${'日一二三四五六'[d.getUTCDay()]}）</text>`;
    }
    rows.forEach((r, i) => { if (i) ax += `<line x1="0" x2="${W}" y1="${r.y}" y2="${r.y}" stroke="var(--line)"/>`; });
    // 長條
    let bars = '';
    const flat = [];
    rows.forEach(r => r.list.forEach(x => {
      const k = flat.push(x) - 1;
      const c = ST[x.st][0], yy = r.y + PAD + x.lane * LANE, bh = LANE - 6, x1 = X(x.af), x2 = X(x.dep);
      bars += `<g data-k="${k}" style="cursor:${x.own ? 'pointer' : 'default'}">`;
      if (x.arr && x.arr < x.af) bars += `<line x1="${X(x.arr)}" x2="${x1}" y1="${yy + bh / 2}" y2="${yy + bh / 2}" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      bars += `<rect x="${x1}" y="${yy}" width="${Math.max(2, x2 - x1)}" height="${bh}" rx="3" fill="${c}" opacity=".45"/>`;
      const we = x.we || (x.ws && x.st === 'work' ? Math.min(NOW, x.dep) : null);      // 作業中、還沒完工：深色畫到現在
      if (x.ws && we && we > x.ws) bars += `<rect x="${X(x.ws)}" y="${yy}" width="${Math.max(2, X(we) - X(x.ws))}" height="${bh}" rx="2" fill="${c}"/>`;
      if (x.own) bars += ICON_OWN(x1 + 3, yy + bh / 2);
      if (x.late) bars += ICON_LATE(x2 - 9, yy + bh / 2);
      if (x2 - x1 > 48) bars += `<text x="${(x1 + x2) / 2 + (x.own ? 5 : 0) - (x.late ? 6 : 0)}" y="${yy + bh / 2 + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.72)" stroke-width="3" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(x.name)}${(() => { const ul = x.own && x2 - x1 > 110 && U.unloadOf ? U.unloadOf(x.vid, x.unlo, x.af, x.arr) : null; /* 和熱度表同口徑：未靠泊＝預估、已靠泊＝實際 */ return ul ? '　卸 ' + U.fmt(ul.tot, 0) + (ul.actual ? '（實際）' : '') : ''; })()}</text>`;
      bars += '</g>';
    }));
    const xn = X(NOW);
    const fz = o.focus ? `<rect x="${X(o.focus[0])}" y="18" width="${X(o.focus[1]) - X(o.focus[0])}" height="${H - 18}" fill="#f5a623" opacity=".13"/><line x1="${X(o.focus[0])}" x2="${X(o.focus[0])}" y1="18" y2="${H}" stroke="#f5a623" stroke-width="1.5" stroke-dasharray="4 3"/><line x1="${X(o.focus[1])}" x2="${X(o.focus[1])}" y1="18" y2="${H}" stroke="#f5a623" stroke-width="1.5" stroke-dasharray="4 3"/>` : '';   // 點熱度表格子帶入的那一天
    const now = `<line x1="${xn}" x2="${xn}" y1="18" y2="${H}" stroke="#4a90d9" stroke-width="1.5"/><text x="${xn + 3}" y="22" font-size="11" fill="#4a90d9">現在 ${new Date(NOW + off).toISOString().slice(11, 16)}</text>`;
    const lvOf = t => ((C.berth.lv || {})[t] || ['C'])[0], lvs = [...new Set(terms.map(lvOf))].sort();
    const lab = rows.map(r => { const v = lvOf(r.t); return o.ownOnly ? `<div class="bgl bglo" style="height:${r.n * LANE + 2 * PAD}px" title="${esc(r.t)}"><span>${esc(r.t)}</span><span class="note bglp">${esc(pn(unloOf(r.t) || ''))}</span></div>` : `<div class="bgl" style="height:${r.n * LANE + 2 * PAD}px" title="${esc(LVN[v][1])}"><span>${esc(r.t)}</span><span class="bglv lv${v}">${LVN[v][0]}</span></div>`; }).join('');
    const lvNote = o.ownOnly ? '' : `<div class="bglvn"><b>資料等級</b>${lvs.map(v => `<span><span class="bglv lv${v}">${LVN[v][0]}</span>${esc(LVN[v][1])}</span>`).join('')}${lvs.length === 1 && lvs[0] === 'C' ? '<span class="tag warn">僅本公司船舶</span>' : ''}</div>`;
    const leg = Object.values(ST).map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')
      + `<span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${ICON_OWN(0, 7)}</svg>本公司船（點了看單船頁）${o.ownOnly ? '，只排本公司船' : ''}</span><span><svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">${ICON_LATE(0, 0)}</svg>離港比計畫晚 ${LATE} 小時以上</span>`;
    el.innerHTML = (pre || '') + lvNote + `<div class="bgleg">${leg}<span class="note">淡色＝靠泊到離港；深色＝開工到完工；虛線＝等泊</span><span class="note">時間：${esc(tz || 'UTC')}${o.ownOnly && tz === 'Asia/Taipei' ? '' : '（港口當地）'}</span></div>
      <div class="bgwrap"><div class="bgtip" data-tip hidden></div><div class="bglab" style="padding-top:${HEAD}px">${lab}</div>
      <div class="bgscroll" data-bgs><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="碼頭靠泊時程">${fz}${ax}${bars}${now}</svg></div></div>`;
    const sc = el.querySelector('[data-bgs]'); sc.scrollLeft = Math.max(0, o.focus ? X(o.focus[0]) - 24 : X(NOW - 24 * HR) - 4);    // 預設從前 1 天開始看；有帶入天數時從那一天開始
    // 提示框與點擊
    const tip = el.querySelector('[data-tip]'), wrap = el.querySelector('.bgwrap'), html = x => tipHtml(x, o.ownOnly ? (C.berth.tz || {})[x.unlo] || tz : tz);
    if (!tip || !sc.addEventListener) return;
    sc.addEventListener('mousemove', e => {
      const g = e.target.closest && e.target.closest('[data-k]');
      if (!g) { tip.hidden = true; return; }
      tip.innerHTML = html(flat[+g.dataset.k]); tip.hidden = false;
      // 提示框跟著整個視窗定位（position:fixed），不會被甘特圖外框的 overflow 裁掉；靠近視窗右緣、下緣時改放到滑鼠左邊、上方
      tip.style.position = 'fixed';
      const w = tip.offsetWidth, h = tip.offsetHeight, VW = window.innerWidth, VH = window.innerHeight;
      let lx = e.clientX + 14, ly = e.clientY + 14;
      if (lx + w > VW - 4) lx = Math.max(4, e.clientX - w - 14);
      if (ly + h > VH - 4) ly = Math.max(4, e.clientY - h - 14);
      tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
    });
    sc.addEventListener('mouseleave', () => (tip.hidden = true));
    sc.addEventListener('click', e => {
      const g = e.target.closest && e.target.closest('[data-k]'), x = g && flat[+g.dataset.k];
      if (x && x.own && x.vid != null) { e.preventDefault(); U.go('M3', +x.vid); }
    });
  };
  U.berthGantt.items = items;
  U.berthGantt.tzOff = tzOff;
  U.berthGantt.summary = summary;
  U.berthGantt.tip = tipHtml;
})();
