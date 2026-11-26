/* 環保法遵數據頁新增區塊（env-esg-kpi）：KPI 列（M8-b5／c5）。
   彙總全部走 env_kpi.js（U.envAgg）：強度一律加權（CO₂ 合計 ÷ 運輸量合計）；今年未滿一年時用同期比。 */
(function () {
  'use strict';
  const U = window.UI, A = U && U.envAgg;
  if (!A) return;
  const { fmt, esc } = U;
  const sp = (x, d) => (x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x), d == null ? 1 : d) + '%');
  // 年度：數據頁的新卡片共用（KPI 列、排放拆解）；只列有前一年可比較的年度
  const yearsCmp = () => A.yearsAll.filter(y => A.yearsAll.includes(y - 1));
  const V = () => (U.STATE.view.envY = U.STATE.view.envY || null);
  function yearOf() { const ys = yearsCmp(), y = V(); return ys.includes(y) ? y : (ys.includes(A.defaultYear()) ? A.defaultYear() : ys[ys.length - 1]); }
  function yearSel(y) {
    return `<label class="fld">年度<select data-ey>${yearsCmp().map(t => `<option value="${t}" ${t === y ? 'selected' : ''}>${t}${A.isPartial(t) ? `（1～${A.lastMonth(t)} 月）` : ''}</option>`).join('')}</select></label>`;
  }
  const bindYear = el => { const s = el.querySelector('[data-ey]'); if (s) s.onchange = () => { U.STATE.view.envY = +s.value; U.bus.emit(); }; };
  U.envYear = { yearOf, yearSel, bindYear };

  // ============================================================ KPI 列（M8-b5／c5）
  U.reg(['M8-b5', 'M8-c5'], (el, c) => {
    const y = yearOf(), cmp = y != null ? A.compare(c.vids, y) : null;
    if (!cmp || !cmp.prev.co2_t) return U.emptyChart(el, '資料不足：沒有前一年可以比較');
    const ci = A.ciiYear(c.vids, y), bio = A.bioShare(c.vids, y), per = cmp.partial ? `1～${cmp.upto} 月同期比` : `比 ${cmp.prevYear} 年`;
    const nDE = window.UI_COMP.cii.filter(x => c.vids.includes(x.vid) && x.year === y && (x.rating === 'D' || x.rating === 'E')).length;
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="toolbar">${yearSel(y)}<span class="note">${cmp.partial ? `${y} 年資料只到 ${cmp.upto} 月，與 ${cmp.prevYear} 年同期比較。` : ''}強度與軌跡都用加權算法（全船隊 CO₂ 合計 ÷ 運輸量合計），與各船平均不同。</span></div><div data-k></div>` +
      (ci.gap_pct != null && ci.gap_pct <= 0 && nDE ? `<div class="note" style="margin-top:.3rem">整體領先軌跡，但仍有 ${nDE} 艘是 D、E 級：大船效率高、運量又大，加權後拉低整體強度。個別船請看 CII 行動清單。</div>` : '');
    bindYear(el);
    U.kpis(el.querySelector('[data-k]'), [
      { k: `${y} 年總排放${cmp.partial ? `（1～${cmp.upto} 月）` : ''}`, v: fmt(cmp.cur.co2_t / 1e3, 0) + ' 千噸 CO₂', d: `${per} ${sp(cmp.co2_pct)}（TtW）`, cls: cmp.co2_pct > 0 ? 'bad' : 'ok',
        g: '範圍內各船 CO₂ 排放加總。今年未滿一年時，兩年都只算到同一個月。' },
      { k: '加權強度變化', v: sp(cmp.inten_pct, 2), d: `${fmt(cmp.prev.inten, 3)} → ${fmt(cmp.cur.inten, 3)} 克 CO₂／（載重噸·浬）`, cls: cmp.inten_pct > 0 ? 'bad' : 'ok',
        g: '全船隊 CO₂ 合計 ÷ 載重噸·浬合計。負數是變好（每噸·浬排得少）。' },
      { k: '偏離減碳軌跡', v: ci.gap_pct == null ? '—' : sp(ci.gap_pct, 2), d: ci.gap_pct == null ? '沒有 CII 資料' : (ci.gap_pct > 0 ? '落後' : '領先') + ' IMO 要求軌跡' + (ci.provisional ? '（未滿一年，暫估）' : ''),
        cls: ci.gap_pct == null ? 'no' : ci.gap_pct > 0 ? 'bad' : 'ok', g: '實際排的 CO₂ ÷ 依 CII 要求值可以排的 CO₂ − 1。正數代表比要求多排。' },
      { k: '生質燃料占比（示意）', v: bio ? fmt(bio.pct, 1) + '%' : '—', d: bio ? `只算歐盟航段；${bio.ships} 艘有歐盟航段，${bio.bioShips} 艘有示意生質燃料` : '沒有歐盟航段或尚無資料（只有歐盟試算有生質燃料）', cls: 'no',
        g: '歐盟航段計入能源中，生質燃料的比例。資料是示意值，不是實際加油紀錄。' },
    ]);
  });

  // ============================================================ 排放為什麼變了（M8-b6／c6）：運量與效率前後對照
  //   總排放＝運量（載重噸·浬）× 每噸·浬排放（加權強度）。三列並排去年與今年，標出變化 % 與白話意思；
  //   LMDI 換算的「運量造成／效率造成」幾千噸放在最後一行小字（給需要的人看）。使用者 2026-11-19 選定這種呈現（原本是瀑布圖，看不懂）
  U.reg(['M8-b6', 'M8-c6'], (el, c) => {
    const y = yearOf(), cmp = y != null ? A.compare(c.vids, y) : null, d = cmp && cmp.lmdi;
    if (!d) return U.emptyChart(el, '資料不足：沒有前一年可以比較');
    const col = U.COL(), P = cmp.prev, C = cmp.cur, k = v => v / 1e3;
    const lab0 = cmp.partial ? `${cmp.prevYear} 年 1～${cmp.upto} 月` : `${cmp.prevYear} 年`, lab1 = cmp.partial ? `${y} 年 1～${cmp.upto} 月` : `${y} 年`;
    const pc = (a, b) => 100 * (b / a - 1), small = x => Math.abs(x) < 0.05;
    const pctTxt = (x, dd) => (small(x) ? '±0' : (x > 0 ? '+' : '−') + fmt(Math.abs(x), dd)) + '%';
    const rows = [
      { name: '運量', unit: '億 載重噸·浬', hint: '運了多少、運多遠（像開了幾公里）', a: P.dwtnm / 1e8, b: C.dwtnm / 1e8, dd: 0, x: d.activity_pct, xd: 1,
        mean: x => (small(x) ? ['持平', col.sub] : x > 0 ? ['↑ 運得多', col.acc] : ['↓ 運得少', col.acc]) },
      { name: '每噸·浬排放', unit: '克 CO₂／（載重噸·浬）', hint: '效率：每運 1 噸走 1 浬排幾克（像每公里耗油）', a: P.inten, b: C.inten, dd: 3, x: d.inten_pct, xd: 2,
        mean: x => (small(x) ? ['幾乎不變', col.sub] : x > 0 ? ['↑ 排得比較髒', col.bad] : ['↓ 變乾淨', col.ok]) },
      { name: '總排放', unit: '千噸 CO₂', hint: '＝ 運量 × 每噸·浬排放', a: k(P.co2_t), b: k(C.co2_t), dd: 0, x: pc(P.co2_t, C.co2_t), xd: 1, tot: true,
        mean: x => (small(x) ? ['持平', col.sub] : x > 0 ? ['↑ 多排', col.bad] : ['↓ 少排', col.ok]) },
    ];
    const bar = (v, mx, c2, dd, lb) => `<div style="display:flex;align-items:center;gap:.5rem;margin-top:.2rem"><span class="note" style="min-width:5.2rem">${esc(lb)}</span><div style="flex:1;min-width:0;height:.8rem;background:var(--line);border-radius:.2rem;overflow:hidden"><div style="width:${(100 * v / mx).toFixed(2)}%;height:100%;background:${c2}"></div></div><span style="min-width:4.2rem;text-align:right">${fmt(v, dd)}</span></div>`;
    const mainAct = Math.abs(d.activity) >= Math.abs(d.intensity), ip = d.inten_pct;
    const concl = `${lab1}總排放 ${pctTxt(rows[2].x, 1)}，` + (mainAct ? `主要跟著運量（${pctTxt(d.activity_pct, 1)}）變動；` : `主要是每噸·浬排放（${pctTxt(ip, 2)}）造成；`) +
      (small(ip) ? '效率幾乎沒變。' : ip > 0 ? '每噸·浬排放變多，<b>效率變差</b>，要找原因（看碳排強度與效能診斷）。' : '每噸·浬排放變少，效率變好。') +
      (mainAct && ip <= 0 && rows[2].x > 0 ? '排放增加是因為生意變多，不是船變髒。' : '');
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="toolbar">${yearSel(y)}<span class="note">與上方重點數字共用年度${cmp.partial ? '；未滿一年用同期比' : ''}</span></div>` +
      `<div data-cmp style="margin:.4rem 0">` +
      rows.map(r => { const mx = Math.max(r.a, r.b), [m, mc] = r.mean(r.x);
        return `<div data-cr style="padding:.5rem 0;${r.tot ? 'border-top:2px solid var(--line)' : 'border-top:1px solid var(--line)'}">` +
          `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.4rem .8rem;flex-wrap:wrap"><span><b>${esc(r.name)}</b>　<span class="note">${esc(r.unit)}</span></span>` +
          `<span><b style="font-size:1.05rem">${pctTxt(r.x, r.xd)}</b>　<span style="color:${mc};font-weight:600">${esc(m)}</span></span></div>` +
          `<div class="note">${esc(r.hint)}</div>${bar(r.a, mx, col.sub, r.dd, lab0)}${bar(r.b, mx, col.acc, r.dd, lab1)}</div>`; }).join('') + `</div>` +
      `<div style="padding:.5rem .7rem;border-radius:.4rem;background:var(--nobg)"><b>結論：</b>${concl}</div>` +
      `<div class="note" style="margin-top:.35rem">像開車：運量＝開了幾公里，每噸·浬排放＝每公里耗油，總排放＝兩者相乘。所以總排放變多，可能是開得多，也可能是車變耗油，要分開看。</div>` +
      `<div class="note" style="margin-top:.2rem;opacity:.85">換算成排放量（LMDI 拆解）：運量造成 ${d.activity >= 0 ? '+' : '−'}${fmt(Math.abs(k(d.activity)), 1)} 千噸、效率造成 ${d.intensity >= 0 ? '+' : '−'}${fmt(Math.abs(k(d.intensity)), 1)} 千噸，合計 ${d.total >= 0 ? '+' : '−'}${fmt(Math.abs(k(d.total)), 1)} 千噸。</div>`;
    bindYear(el);
  });

  // ============================================================ 燃料結構逐年占比（M8-b8／c8）：船報用油的 100% 堆疊柱；生質燃料（歐盟試算示意）另列
  U.reg(['M8-b8', 'M8-c8'], (el, c) => {
    const ys = A.yearsAll, mx = ys.map(y => A.fuelMix(c.vids, y)).filter(m => m.total > 0);
    if (!mx.length) return U.emptyChart(el, '沒有用油資料');
    const col = U.COL(), names = mx[0].names, colors = [col.bad, col.pal[0], col.pal[2], col.sub];
    const lab = m => String(m.year) + (m.partial ? `（1～${m.upto} 月）` : ''), bio = mx.map(m => A.bioShare(c.vids, m.year));
    el.classList.add('auto'); el.style.maxHeight = 'none'; el.style.display = 'flex'; el.style.flexDirection = 'column';   // 圖撐滿卡片剩下的高度，和旁邊「總排放為什麼變了」等高
    el.innerHTML = `<div class="note" style="margin-bottom:.2rem">依船報的用油噸數，每年四段加起來是 100%。</div><div data-fm style="flex:1 1 auto;min-height:15rem"></div>` +
      (bio.some(Boolean) ? `<div class="note" style="margin-top:.3rem"><b>歐盟航段生質燃料占比（示意，能量比）：</b>${mx.map((m, i) => `${lab(m)} ${bio[i] ? fmt(bio[i].pct, 1) + '%' : '—'}`).join('、')}。` +
        `來源是歐盟試算的示意資料，與船報不同，所以不疊進柱子；歐盟試算把燃料記成重油（HFO）、船報記成 VLSFO，代碼不一致，待確認。</div>` :
        `<div class="note" style="margin-top:.3rem">範圍內沒有歐盟航段，沒有生質燃料資料（生質燃料只出現在歐盟試算的示意資料）。</div>`);
    const fmEl = el.querySelector('[data-fm]'), fmC = U.mkChart(fmEl, {
      grid: { left: 44, right: 12, top: 56, bottom: 26 }, legend: { data: names, left: 0, top: 0 },          // 圖例在最上面、縱軸名稱在圖例下方，不重疊
      xAxis: { type: 'category', data: mx.map(lab), axisTick: { show: false } },
      yAxis: { type: 'value', name: '占比（%，依噸數）', min: 0, max: 100, interval: 25 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => { const m = mx[ps[0].dataIndex];
        return `${esc(lab(m))}　共 ${fmt(m.total / 1e3, 1)} 千噸<br>` + m.names.map((n, j) => `${n} ${fmt(m.pct[j], 1)}%（${fmt(m.tonnes[j] / 1e3, 1)} 千噸）`).join('<br>'); } },
      series: names.map((n, j) => ({ name: n, type: 'bar', stack: 'mix', barMaxWidth: 46, data: mx.map(m => m.pct[j]), itemStyle: { color: colors[j] }, emphasis: { disabled: true },
        label: { show: true, position: 'inside', fontSize: 11, color: '#fff', formatter: p => (p.value >= 6 ? fmt(p.value, 1) + '%' : '') } })) });
    if (window.ResizeObserver) new ResizeObserver(() => { try { if (!fmC.isDisposed()) fmC.resize(); } catch (e) { } }).observe(fmEl);   // 卡片高度要等旁邊的卡畫完才確定
  });

  // ============================================================ CII 行動清單（M8-b7／c7）：明年可能掉級、SEEMP 改善計畫、全部船（原本 CII 卡內的各船明細併到這裡）
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`, rk = r => (r === 'E' ? 'bad' : r === 'D' ? 'warn' : 'ok');
  U.reg(['M8-b7', 'M8-c7'], (el, c) => {
    const y = A.ciiLatestYear(c.vids);
    if (y == null) return U.emptyChart(el, '沒有已評級的 CII 資料');
    const z = window.UI_COMP.params.z || {}, tight = z[y] != null && z[y + 1] != null ? 100 * (1 - (1 - z[y + 1] / 100) / (1 - z[y] / 100)) : null;
    const nx = A.ciiNextYear(c.vids, y), se = A.seemp(c.vids, y), must = se.filter(x => x.kind === 'must'), watch = se.filter(x => x.kind === 'watch');
    const V = U.STATE.view, tab = ['seemp', 'all'].includes(V.ciiAct) ? V.ciiAct : 'next', set = new Set(c.vids);
    const allR = window.UI_COMP.cii.filter(x => set.has(x.vid) && x.year === y && x.att != null && x.req != null);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="toolbar"><span class="seg" role="group" aria-label="CII 行動清單">` +
      `<button type="button" data-ca="next" aria-pressed="${tab === 'next'}">明年可能掉級（${nx.length} 艘）</button><button type="button" data-ca="seemp" aria-pressed="${tab === 'seemp'}">SEEMP 改善計畫（必須 ${must.length}、觀察 ${watch.length}）</button><button type="button" data-ca="all" aria-pressed="${tab === 'all'}">全部船（${allR.length} 艘）</button></span>` +
      `<span class="note">依 ${y} 年評級（最新的完整評級年度）</span></div>` +
      `<div class="note" style="margin:.3rem 0">${tab === 'all' ? `範圍內每艘船 ${y} 年的 CII：比值＝實際值 ÷ 要求值（越小越好），由差到好排；資料不足 330 天不評級。` : tab === 'next' ? `假設 ${y + 1} 年的實際值和 ${y} 年一樣，要求值依 IMO 折減率收緊${tight != null ? ` ${fmt(tight, 1)}%（折減率 ${fmt(z[y], 1)}% → ${fmt(z[y + 1], 1)}%）` : ''}後，評級會變差的船。「需減少」是守住 ${y} 年等級，實際值要比 ${y} 年少幾 %。` :
        `國際規定：E 級，或連續 3 年 D 級，要在 SEEMP 提出改善計畫並經船級社確認。資料只有 ${A.yearsAll.filter(t => !A.isPartial(t)).length} 個完整年度，連續 2 年 D 級先列觀察名單（${y + 1} 年仍是 D 就須提出）。`}點一列到單船頁。</div><div data-t></div>`;
    el.querySelectorAll('[data-ca]').forEach(b => (b.onclick = () => { V.ciiAct = b.dataset.ca === 'next' ? null : b.dataset.ca; U.bus.emit(); }));
    if (tab === 'all') U.table(el.querySelector('[data-t]'), { rows: allR.map(x => ({ id: x.vid, name: U.vname(x.vid), att: x.att, req: x.req, ratio: x.ratio, days: x.days, rating: x.rating })), onRow: r => U.go('M3', r.id), sort: ['ratio', -1], pageSize: 10,
      empty: `${y} 年沒有 CII 資料`,
      cols: [{ k: 'name', t: '船舶' }, { k: 'att', t: '實際值', n: true, d: 3 }, { k: 'req', t: '要求值', n: true, d: 3 }, { k: 'ratio', t: '比值（實際÷要求）', n: true, d: 3 }, { k: 'days', t: '資料天數', n: true, d: 0 },
        { k: 'rating', t: '等級', h: r => (r.rating ? tag(r.rating, rk(r.rating)) : tag('不評級（資料不足一年）', 'no')) }] });
    else if (tab === 'next') U.table(el.querySelector('[data-t]'), { rows: nx.map(x => Object.assign({ id: x.vid, name: U.vname(x.vid) }, x)), onRow: r => U.go('M3', r.id), sort: ['ratio1', -1], pageSize: 10,
      empty: `維持 ${y} 年的實際值，${y + 1} 年沒有船會掉級`,
      cols: [{ k: 'name', t: '船舶' }, { k: 'rating', t: `${y} 年等級`, h: r => tag(r.rating, rk(r.rating)) }, { k: 'next', t: `${y + 1} 年推估`, h: r => tag(r.next + '（推估）', rk(r.next)) },
        { k: 'ratio', t: `${y} 年比值`, n: true, d: 3 }, { k: 'ratio1', t: `${y + 1} 年比值（推估）`, n: true, d: 3 }, { k: 'cut_pct', t: '守住等級需減少（%）', n: true, d: 1 }] });
    else U.table(el.querySelector('[data-t]'), { rows: se.map(x => Object.assign({ id: x.vid, name: U.vname(x.vid), ord: x.kind === 'must' ? 0 : 1 }, x)), onRow: r => U.go('M3', r.id), sort: ['ord', 1], pageSize: 10,
      empty: `${y} 年沒有需要提出或觀察的船`,
      cols: [{ k: 'name', t: '船舶' }, { k: 'ord', t: '類別', h: r => (r.kind === 'must' ? tag('必須提出', 'bad') : tag('觀察名單', 'warn')) }, { k: 'why', t: '原因' },
        { k: 'rating', t: `${y} 年等級`, h: r => tag(r.rating, rk(r.rating)) }, { k: 'ratio', t: `${y} 年比值`, n: true, d: 3 }] });
  });
})();
