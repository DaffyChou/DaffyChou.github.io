/* 歐盟碳成本試算（M8-b2～b4、M8-c2～c4）：ETS＋FuelEU 船隊表、強度與目標下降線、情境比較與碳價敏感度。
   計算全部走 carbon_engine.js；碳價、燃料價與生質係數為示意值，FuelEU 參數待核對，規劃用估算、非經驗證的排放報告。 */
(function () {
  'use strict';
  const U = window.UI, CE = U.carbon;
  if (!CE) return;
  const { COL, fmt, esc, vname, mkChart } = U;
  const C = CE.C;
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const eur = x => (x == null ? '—' : fmt(x, 0));
  const meur = x => (x == null ? '—' : fmt(x / 1e6, 2));
  // 年度與碳價：同一頁的三個區塊共用；碳價「套用」後才重算（Apply-on-Submit）
  const V = () => (U.STATE.view.carbon = U.STATE.view.carbon || { year: null, eua: null, open: null, bio: 'B30', share: 50 });
  const noEU = (el, c) => U.emptyChart(el, c.vids.length === 1 ? '無歐盟航段：這艘船沒有靠歐盟港，沒有歐盟碳成本。' : '範圍內沒有靠歐盟港的船，沒有歐盟碳成本。');

  function ctx(c) {
    const st = V(), ys = CE.years(c.vids);
    if (!ys.length) return null;
    const year = ys.includes(st.year) ? st.year : CE.defaultYear(c.vids);
    return { st, ys, year, eua: st.eua == null ? C.eua_price : st.eua };
  }

  // 「示意價／參數待核對／規劃用估算」：船隊頁收成頁首一條橫幅（U.carbonBanner，由 app.js 放在環保法遵兩個頁籤上方），卡片內不再重複；
  //   單船頁沒有橫幅，卡片內保留精簡的一行標示
  const badges = (x) => (U.STATE.l === 3 ? tag(['示意價', C.unverified ? '參數待核對' : '', '規劃用估算'].filter(Boolean).join('・'), 'warn') + ' ' : '') +
    (x.year === CE.PARTIAL ? `<span class="note">${x.year} 年資料只到 10 月</span>` : '');
  // ---------------- 單船環保法遵：有歐盟航段的船（選船選單標「歐盟」、預設改選、沒有時提示）
  const euIds = () => { const set = new Set(C.rows.map(r => r.vid)); return U.IA.vesselList().map(v => v.id).filter(id => set.has(id)); };
  U.euSet = () => new Set(C.rows.map(r => r.vid));
  /** 使用者還沒自己選船（目前的船是系統預設的）、在單船環保法遵、這艘船又沒有歐盟航段時，改選範圍內第一艘有歐盟航段的船 */
  U.euAutoPick = () => {
    const S = U.STATE;
    if (S.l !== 3 || S.st !== 's_env' || !S.vessel || S.vessel !== S.vesselAuto || U.euSet().has(S.vessel)) return;
    const L = euIds(); if (L.length) S.vessel = S.vesselAuto = L[0];
  };
  /** 這艘船沒有歐盟航段時，頁首提示並列出有歐盟航段的船（點一下切換） */
  U.euHint = () => {
    const S = U.STATE, L = euIds();
    if (!S.vessel || U.euSet().has(S.vessel)) return '';
    const box = s2 => `<div class="euhint" role="note" style="display:flex;flex-wrap:wrap;gap:.35rem .5rem;align-items:center;margin:.6rem 0 0;padding:.5rem .8rem;border:1px solid var(--line);background:var(--nobg);border-radius:.5rem">${s2}</div>`;
    if (!L.length) return box(`<span class="note">${S.type === 'bulk' ? '散裝船隊沒有歐盟航段' : '範圍內沒有歐盟航段的船'}，歐盟碳成本（ETS、FuelEU）卡片不會有資料；碳排強度與 CII 照常顯示。</span>`);
    return box(`<span class="note"><b>${esc(vname(S.vessel))}</b> 沒有歐盟航段，歐盟碳成本卡片是空的。有歐盟航段的船：</span>` +
      L.map(id => `<button type="button" class="btn" data-euv="${id}">${esc(vname(id))}</button>`).join(''));
  };
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-euv]'); if (!b) return; U.STATE.vessel = +b.dataset.euv; U.STATE.vesselAuto = null; U.bus.emit(); });

  U.carbonBanner = () => {
    const vids = U.scopeVessels().map(v => v.id), ys = CE.years(vids);
    const st = V(), y = ys.includes(st.year) ? st.year : CE.defaultYear(vids);
    let ver = '';
    if (y != null) {
      const P = CE.params(y), row = C.rows.find(r => r.year === y) || {}, ets = /ets(\d+)/.exec(row.ver || '');
      ver = `參數版本（${y} 年）：${ets ? 'ETS ' + ets[1] + ' 年版、' : ''}` + (P.target != null ? `FuelEU 目標 ${P.target_from} 年版、GWP ${P.versions.GWP_CH4} 年版、罰款 ${P.versions.PENALTY_EUR_PER_T} 年版` : 'FuelEU 尚未適用');
    }
    return `<div class="envban" role="note" style="display:flex;flex-wrap:wrap;gap:.35rem .6rem;align-items:center;margin:.6rem 0 0;padding:.5rem .8rem;border:1px solid var(--warn);background:var(--warnbg);border-radius:.5rem">` +
      `<b style="color:var(--ink)">歐盟碳成本與 FuelEU 數字</b>${tag('示意價', 'warn')}${C.unverified ? tag('參數待核對', 'warn') : ''}${tag('規劃用估算，非經驗證的排放報告', 'no')}` +
      `<span class="note">${ver ? esc(ver) + '；' : ''}碳價基準日 ${esc(C.eua_date)}；資料截至 ${esc(C.data_until)}${CE.PARTIAL ? `（${CE.PARTIAL} 年未滿一年）` : ''}。CII 與碳排強度為模擬營運資料計算，不是示意價。</span>` +
      // 數據驗證狀態與口徑（env-esg-kpi）：本 demo 全部是模擬資料，沒有經過 DCS／MRV 驗證
      `<span class="note" style="flex-basis:100%"><b>數據驗證：</b>${tag('DCS／MRV：未驗證（模擬資料）', 'no')}　<b>口徑：</b>CII、AER、碳排強度＝TtW（只算 CO₂）；ETS＝TtW（CO₂ 當量）；FuelEU＝WtW（含燃料生產與運送，CO₂ 當量）。</span></div>`;
  };

  // 年度選單與碳價輸入（碳價按「套用」才生效）
  function toolbar(x, withPrice) {
    return `<div class="toolbar"><label class="fld">排放年度<select data-cy>${x.ys.map(y => `<option value="${y}" ${y === x.year ? 'selected' : ''}>${y}${y === CE.PARTIAL ? '（到 10 月）' : ''}</option>`).join('')}</select></label>` +
      (withPrice ? `<label class="fld">碳價（歐元／噸）<input type="number" data-ce min="0" step="1" value="${x.eua}" style="width:6rem"></label><button class="btn" data-ca>套用</button>` +
        `<button class="btn" data-cr ${x.st.eua == null ? 'disabled' : ''}>還原示意價 ${fmt(C.eua_price, 0)}</button><span class="note" data-cm></span>` : '') + `</div>`;
  }
  function bindToolbar(el) {
    const st = V(), q = s => el.querySelector(s);
    const ys = q('[data-cy]'); if (ys) ys.onchange = () => { st.year = +ys.value; U.bus.emit(); };
    const inp = q('[data-ce]'), ap = q('[data-ca]'), rs = q('[data-cr]'), msg = q('[data-cm]');
    if (inp) {
      inp.oninput = () => { msg.textContent = '已修改，按「套用」後重算'; };
      ap.onclick = () => {
        const v = Number(inp.value);
        if (!(inp.value !== '' && Number.isFinite(v) && v >= 0 && v <= 1000)) { msg.textContent = '請輸入 0 到 1,000 之間的數字（歐元／噸）'; inp.focus(); return; }
        st.eua = v === C.eua_price ? null : v; U.bus.emit();
      };
      rs.onclick = () => { st.eua = null; U.bus.emit(); };
    }
  }

  // ============================================================ 船隊試算表（M8-b2／c2；單船頁 M14 也共用）
  U.reg(['M8-b2', 'M8-c2'], (el, c) => {
    const x = ctx(c);
    if (!x) return noEU(el, c);
    const F = CE.fleetYear(c.vids, x.year, x.eua), T = F.totals, fe = T.target != null;
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const def = F.rows.filter(r => r.balance_t != null && r.balance_t < 0).length;
    el.innerHTML = toolbar(x, true) + `<div class="note" style="margin:.3rem 0">${badges(x)} 碳價 ${fmt(x.eua, 0)} 歐元/噸${x.st.eua == null ? '（示意價，基準日 ' + esc(C.eua_date) + '）' : '（你輸入的假設）'}；` +
      `ETS 繳交比例 ${fmt(100 * CE.params(x.year).surrender[0], 0)}%${fe ? '；FuelEU 上限 ' + fmt(T.target, 2) + ' g/MJ' : '；FuelEU 自 2025 年起適用'}。</div><div data-k></div><div data-t></div><div data-tr style="margin-top:.6rem"></div>`;
    bindToolbar(el);
    const one = c.vids.length === 1;
    // 範圍內每艘船都赤字時，內部 pooling 沒有盈餘可抵，「各船單獨」與「合併計算」金額相同：合併成一張卡並說明，避免看起來像算錯
    const nFe = F.rows.filter(r => r.balance_t != null).length, allDef = fe && !one && nFe > 1 && def === nFe;
    const poolG = 'Pooling：把多艘船的盈餘與赤字合在一起算。這裡把整個船隊當成一池，不是正式的分配。';
    U.kpis(el.querySelector('[data-k]'), [
      { k: 'ETS 應繳碳權', v: fmt(T.eua_rounded, 0) + ' 張', d: '1 張＝1 噸 CO₂e（TtW）；公司層級加總後四捨五入', g: 'EU ETS：排多少就要繳多少碳權。' },
      { k: 'ETS 成本', v: meur(T.ets_cost) + ' 百萬歐元', d: `碳價 ${fmt(x.eua, 0)} 歐元/噸（示意）` },
    ].concat(allDef ? [
      { k: 'FuelEU 罰款（各船單獨＝合併計算）', v: meur(T.penalty_sum) + ' 百萬歐元', d: `${def} 艘皆赤字，內部 pooling 無盈餘可抵；船隊強度 ${fmt(T.actual, 2)}，上限 ${fmt(T.target, 2)}`, cls: 'bad', g: poolG },
    ] : [
      { k: fe ? 'FuelEU 罰款（各船單獨）' : 'FuelEU 罰款', v: fe ? meur(T.penalty_sum) + ' 百萬歐元' : '尚未適用', d: fe ? `${def} 艘赤字` : '2025 年起適用', cls: fe && T.penalty_sum > 0 ? 'bad' : 'ok' },
      { k: one ? '這艘船的 FuelEU 強度' : '船隊合併計算（pooling）後罰款', v: one ? (fe && T.actual != null ? fmt(T.actual, 2) + ' g/MJ' : '—') : fe ? meur(T.pooled_penalty) + ' 百萬歐元' : '—',
        d: fe ? (one ? `上限 ${fmt(T.target, 2)}；${T.actual > T.target ? '超標' : '低於上限'}` : `船隊強度 ${fmt(T.actual, 2)}，上限 ${fmt(T.target, 2)}；簡化估算`) : '', cls: fe && (one ? T.actual > T.target : T.pooled_penalty > 0) ? 'bad' : 'ok',
        g: poolG },
    ]));
    U.table(el.querySelector('[data-t]'), {
      rows: F.rows.map(r => Object.assign({ id: r.vid, name: vname(r.vid), tot: r.ets_cost + (r.penalty || 0) }, r)), sort: ['tot', -1], pageSize: 10, onRow: r => { V().open = r.vid; U.bus.emit(); },
      cols: [{ k: 'name', t: '船舶', h: r => esc(r.name) + (r.bio ? ' ' + tag(`示意 B30 ${r.bio}%`, 'no') : '') },
        { k: 'ets_eua', t: 'ETS 應繳（張）', n: true, d: 0 }, { k: 'ets_cost', t: 'ETS 成本（歐元）', n: true, d: 0 },
        { k: 'actual', t: 'FuelEU 強度（g/MJ）', n: true, d: 2 }, { k: 'balance_t', t: '合規餘額（噸 CO₂e）', n: true, d: 1 },
        { k: 'penalty', t: 'FuelEU 罰款（歐元）', n: true, d: 0 },
        { k: 'st', t: '狀態', h: r => (r.actual == null ? tag('未適用', 'no') : r.balance_t < 0 ? tag('赤字', 'bad') : tag('盈餘', 'ok')) },
        { k: 'tot', t: 'ETS＋罰款（歐元）', n: true, d: 0 }] });
    // 計算過程：點表格的列或從選單挑船，展開逐航段的係數與比例
    const st = V(), sel = F.rows.some(r => r.vid === st.open) ? st.open : F.rows[0].vid, R = F.rows.find(r => r.vid === sel), box = el.querySelector('[data-tr]');
    const P = CE.params(x.year), Tr = R.trace;
    box.innerHTML = `<details ${st.open != null ? 'open' : ''}><summary>展開計算過程（用了哪個係數、哪個比例）</summary>
      <div class="toolbar" style="margin:.4rem 0"><label class="fld">船舶<select data-cs>${F.rows.map(r => `<option value="${r.vid}" ${r.vid === sel ? 'selected' : ''}>${esc(vname(r.vid))}</option>`).join('')}</select></label>
      <button class="btn" data-cg>到這艘船的單船頁</button></div>
      <div class="note">ETS：每噸燃料的 CO₂e × 涵蓋比例 × 繳交比例 ${fmt(100 * P.surrender[0], 0)}%（${P.surrender[1] ? '含 CH₄、N₂O，GWP ' + P.gwp_ets.join('／') : '只算 CO₂'}）。` +
      (Tr.length ? `FuelEU：計入能源＝噸 × 1,000,000 × 涵蓋比例 × 熱值；排放＝能源 × 上游係數（WtT）＋克數 × 燃燒係數（TtW）；GWP ${R.trace.length ? P.feu.GWP_CH4 + '／' + P.feu.GWP_N2O : ''}（參數版本：目標 ${P.target_from} 年、GWP ${P.versions.GWP_CH4} 年、罰款 ${P.versions.PENALTY_EUR_PER_T} 年起）。` : 'FuelEU 尚未適用，沒有逐項計算。') +
      `</div><div data-tt></div></details>`;
    box.querySelector('[data-cs]').onchange = e => { V().open = +e.target.value; U.bus.emit(); };
    box.querySelector('[data-cg]').onclick = () => U.go('M3', sel);
    const agg = {};
    Tr.forEach(t => { const k = t.label + '|' + t.fuel_code; const a = agg[k] = agg[k] || { label: t.label, fuel: t.fuel_code, cov: t.coverage, tonnes: 0, mj: 0, g: 0, basis: t.basis }; a.tonnes += t.tonnes; a.mj += t.energy_mj; a.g += t.emission_g; });
    U.table(box.querySelector('[data-tt]'), { rows: Object.values(agg).map(a => Object.assign(a, { gj: a.mj / 1000, t: a.g / 1e6, inten: a.mj ? a.g / a.mj : null, pct: 100 * a.cov })), pageSize: 8, sort: ['t', -1],
      empty: 'FuelEU 尚未適用或沒有計入範圍的用油',
      cols: [{ k: 'label', t: '航段或靠泊' }, { k: 'pct', t: '涵蓋比例（%）', n: true, d: 0 }, { k: 'fuel', t: '燃料' }, { k: 'tonnes', t: '用油（噸）', n: true, d: 1 },
        { k: 'gj', t: '計入能源（GJ）', n: true, d: 0 }, { k: 't', t: '排放（噸 CO₂e）', n: true, d: 1 }, { k: 'inten', t: '強度（g/MJ）', n: true, d: 2 }, { k: 'basis', t: '依據' }] });
  });

  // ============================================================ 強度與目標逐年下降線（M8-b3／c3）
  U.reg(['M8-b3', 'M8-c3'], (el, c) => {
    const x = ctx(c);
    if (!x) return noEU(el, c);
    const yrs = []; for (let y = 2025; y <= 2050; y++) yrs.push(y);
    const lim = yrs.map(y => CE.params(y).target), col = COL();
    const pts = x.ys.filter(y => y >= 2025).map(y => ({ y, F: CE.fleetYear(c.vids, y, x.eua) }));
    if (!pts.length) return U.emptyChart(el, '範圍內只有 2024 年的歐盟航段；FuelEU 自 2025 年起適用。');
    const ships = [], fleet = [];
    pts.forEach(({ y, F }) => {
      if (F.totals.actual != null) fleet.push([String(y), F.totals.actual]);
      F.rows.forEach(r => r.actual != null && ships.push({ value: [String(y), r.actual], name: vname(r.vid), over: r.actual > F.totals.target }));
    });
    const one = c.vids.length === 1, who = one ? '這艘船' : '船隊', cur = (pts.find(p => p.y === x.year) || pts[pts.length - 1]), last = cur.F.totals.actual, firstOver = yrs.find((y, i) => last != null && last > lim[i]);
    // 圖只畫到 2032 年、Y 軸放大到約 84～93（資料都在這附近）；有點超出時自動放寬，點不會被切掉。2050 年的推算仍寫在文字裡
    const YE = 2032, ny = YE - 2025 + 1, vis = ships.map(s => s.value[1]).concat(fleet.map(f => f[1]), lim.slice(0, ny));
    let yLo = Math.min(84, Math.floor(Math.min(...vis) - 1)), yHi = Math.max(93, Math.ceil(Math.max(...vis) + 1));
    const yStep = yHi - yLo <= 10 ? 1 : 2; yLo = Math.floor(yLo / yStep) * yStep; yHi = Math.ceil(yHi / yStep) * yStep;   // 最小值落在刻度上，刻度標籤才不會擠在一起
    const later = [2035, 2040, 2050].map(y => `${y} 年 ${fmt(lim[yrs.indexOf(y)], 2)}`).join('、');
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div class="note" style="margin-bottom:.3rem">${badges(x)} ${cur.y} 年${who}強度 ${fmt(last, 2)} g/MJ：若之後維持這個強度，` +
      (firstOver == null ? '在 2050 年以前都低於上限。' : `從 ${firstOver} 年起超過上限（${firstOver} 年上限 ${fmt(lim[yrs.indexOf(firstOver)], 2)}）。`) + (one ? ' 菱形是這艘船各年度的強度。' : ' 圖上同時畫出各年度的點（菱形是船隊合併計算，圓點是各船，黃色代表超過當年上限）。') +
      `</div><div data-ch style="height:18rem"></div><div class="note" style="margin-top:.2rem">圖只畫到 ${YE} 年，縱軸從 ${yLo} 起（不是從 0），放大看近期差距。之後的上限：${later} g/MJ；2040 年起的上限是基準值 ${fmt(C.base, 2)} 乘減幅算出，非法規明文。</div>`;
    mkChart(el.querySelector('[data-ch]'), {
      grid: { left: 52, right: 20, top: 34, bottom: 34 },
      xAxis: { type: 'category', data: yrs.slice(0, ny).map(String), axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', name: 'gCO₂e/MJ　WtW', min: yLo, max: yHi, interval: yStep },
      legend: { data: one ? ['FuelEU 上限', '這艘船'] : ['FuelEU 上限', '船隊（合併計算）', '各船'] },
      tooltip: { trigger: 'item', formatter: p => p.seriesName === 'FuelEU 上限' ? `${p.name} 年上限 ${fmt(p.value, 2)} g/MJ` :
        `${esc(p.data.name || who)}　${p.value[0]} 年<br>強度 ${fmt(p.value[1], 2)} g/MJ` },
      series: [
        { name: 'FuelEU 上限', type: 'line', step: 'start', data: lim.slice(0, ny), showSymbol: false, lineStyle: { width: 2, color: col.bad }, itemStyle: { color: col.bad } },
        one ? null : { name: '各船', type: 'scatter', symbolSize: 7, data: ships.map(s => Object.assign({}, s, { itemStyle: { color: s.over ? col.warn : col.ok, opacity: .75 } })), itemStyle: { color: col.sub } },
        { name: one ? '這艘船' : '船隊（合併計算）', type: 'scatter', symbol: 'diamond', symbolSize: 13, data: fleet.map(v => ({ value: v, name: one ? vname(c.vids[0]) : '船隊' })), itemStyle: { color: col.ink } },
      ].filter(Boolean) });
  });

  // ============================================================ 情境比較（M8-b4／c4）：三種方案、成本占比、免罰比例、碳價敏感度
  U.reg(['M8-b4', 'M8-c4'], (el, c) => {
    const x = ctx(c);
    if (!x) return noEU(el, c);
    const st = x.st, F = CE.fleetYear(c.vids, x.year, x.eua), sc = CE.standardScenarios(F.ships, x.year, x.eua, st.bio, st.share);
    const base = sc[0][1];
    el.classList.add('auto'); el.style.maxHeight = 'none';
    const opts = C.bio_fuels.concat(C.params[String(x.year)].fuel.RFNBO ? ['RFNBO'] : []);
    el.innerHTML = toolbar(x, false) + `<div class="toolbar" style="margin-top:.3rem"><label class="fld">低碳燃料<select data-sb>${opts.map(b => `<option ${b === st.bio ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
      <label class="fld">取代重油比例（%，以質量計）<input type="number" data-ss min="0" max="100" step="0.1" value="${st.share}" style="width:6rem"></label>
      <button class="btn" data-sa>套用</button><button class="btn" data-sf>帶入免罰所需比例</button><button class="btn" data-sr ${st.bio === 'B30' && st.share === 50 ? 'disabled' : ''}>還原（B30、50%）</button><span class="note" data-sm></span></div>
      <div class="note" style="margin:.3rem 0">${badges(x)} ${F.rows.length} 艘、碳價 ${fmt(x.eua, 0)} 歐元/噸；燃料單價、pooling 價格（${fmt(CE.params(x.year).feu.POOL_PRICE_EUR_PER_T, 0) || '—'} 歐元／噸 CO₂e）都是示意價。燃料費算全部用油，碳成本只算歐盟範圍。</div>
      <div data-t></div><div data-ch style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(17rem,100%),1fr));gap:.8rem;margin-top:.5rem"></div><div data-sol class="note" style="margin:.4rem 0"></div><div data-sen></div>`;
    bindToolbar(el);
    {
      const q = s2 => el.querySelector(s2), msg = q('[data-sm]'), inp = q('[data-ss]'), sb = q('[data-sb]');
      const dirty = () => { msg.textContent = '已修改，按「套用」後重算'; };
      inp.oninput = dirty; sb.onchange = dirty;
      q('[data-sa]').onclick = () => {
        const v = Number(inp.value);
        if (inp.value === '' || !Number.isFinite(v) || v < 0 || v > 100) { msg.textContent = '取代比例請輸入 0 到 100 之間的數字'; inp.focus(); return; }
        st.bio = sb.value; st.share = Math.round(v * 10) / 10; U.bus.emit();
      };
      q('[data-sf]').onclick = () => {
        const r = CE.solveBioShare(F.ships, x.year, sb.value);
        if (r.status === 'ok') { st.bio = sb.value; st.share = Math.ceil(r.share_pct * 10) / 10; U.bus.emit(); }
        else msg.textContent = r.status === 'already' ? '已達標，不需要生質燃料' : r.status === 'infeasible' ? sb.value + ' 全部取代仍無法免罰' : 'FuelEU 尚未適用，無法反推';
      };
      q('[data-sr]').onclick = () => { st.bio = 'B30'; st.share = 50; U.bus.emit(); };
    }
    // 方案表：燃料費（全部用油）與歐盟碳成本（只算歐盟範圍）口徑不同，不相加成「合計」；只比較「比照常營運多或省多少」
    const sg = v => (Math.abs(v) < 0.5 ? '—' : (v > 0 ? '多 ' : '省 ') + eur(Math.abs(v)));
    const POOL = tag('非實質減碳（不可計入減碳揭露）', 'warn');
    const rows = sc.map(([n, r]) => ({ n, pool: r.mode === 'buy', fuel: r.fuel_cost, dfuel: r.fuel_cost - base.fuel_cost, ets: r.ets_cost, fe: r.fueleu_cost, carbon: r.carbon_cost,
      dets: r.ets_cost - base.ets_cost, dfe: r.fueleu_cost - base.fueleu_cost, dcarbon: r.carbon_cost - base.carbon_cost, net: r.total - base.total, sur: r.surcharge_per_t_gross }));
    const win = rows.slice(1).filter(r => r.net < -0.5).sort((a, b) => a.net - b.net)[0];
    U.table(el.querySelector('[data-t]'), { rows, pageSize: 10,
      cols: [{ k: 'n', t: '方案', h: r => esc(r.n) + (win && r.n === win.n ? ' ' + tag('淨省最多', 'ok') : '') + (r.pool ? ' ' + POOL : '') },
        { k: 'fuel', t: '燃料費（全部用油）', n: true, d: 0 }, { k: 'dfuel', t: '燃料費增減', n: true, h: r => sg(r.dfuel) },
        { k: 'carbon', t: '歐盟碳成本（ETS＋FuelEU）', n: true, h: r => `<span title="ETS ${eur(r.ets)}＋FuelEU ${eur(r.fe)} 歐元">${eur(r.carbon)}</span><div class="note">ETS ${meur(r.ets)}＋FuelEU ${meur(r.fe)} 百萬</div>` },
        { k: 'dcarbon', t: '碳成本增減', n: true, h: r => sg(r.dcarbon) },
        { k: 'sur', t: '每噸用油加價', n: true, d: 0 }] });
    el.querySelector('[data-t]').insertAdjacentHTML('beforeend', '<div class="note" style="margin-top:.2rem">金額單位：歐元。每噸用油加價＝歐盟碳成本 ÷ 全部用油噸數。</div>');
    // 增減瀑布圖：每個方案比照常營運，依序是燃料費、ETS、FuelEU 的增減，最後是淨增減（紅＝多花、綠＝省下）
    const col = COL(), Mx = v => v / 1e6, wfs = rows.slice(1).map(r => {
      let cum = 0;
      const bars = [['燃料費', r.dfuel], ['ETS', r.dets], ['FuelEU', r.dfe]].map(([k, d]) => { const a = cum; cum += d; return { k, lo: Math.min(a, cum), hi: Math.max(a, cum), d }; });
      bars.push({ k: '淨增減', lo: Math.min(0, cum), hi: Math.max(0, cum), d: cum, net: true });
      return { r, bars };
    });
    const all = wfs.flatMap(w => w.bars.flatMap(b => [Mx(b.lo), Mx(b.hi)])).concat([0]), span = Math.max(...all) - Math.min(...all) || 1;
    const stp = [1, 2, 5, 10].map(k => k * Math.pow(10, Math.floor(Math.log10(span / 5)))).find(s => s >= span / 5);   // 兩張圖共用同一個刻度，整數刻度好讀
    const yMin = Math.floor((Math.min(...all) - span * .06) / stp) * stp, yMax = Math.ceil((Math.max(...all) + span * .1) / stp) * stp;
    const wfEl = el.querySelector('[data-ch]');
    wfEl.innerHTML = wfs.map((w, i) => `<div><div class="note"><b>${esc(w.r.n)}</b>${w.r.pool ? ' ' + POOL : ''}<br>比照常營運：淨${sg(w.r.net)} 歐元</div><div data-wf="${i}" style="height:12rem"></div></div>`).join('');
    wfs.forEach((w, i) => mkChart(wfEl.querySelector(`[data-wf="${i}"]`), {
      grid: { left: 52, right: 12, top: 26, bottom: 26 }, legend: { show: false },
      xAxis: { type: 'category', data: w.bars.map(b => b.k), axisTick: { show: false } },
      yAxis: { type: 'value', name: '百萬歐元（比照常營運）', min: +yMin.toFixed(4), max: +yMax.toFixed(4), interval: stp, axisLabel: { formatter: v => fmt(v, 1) } },
      tooltip: { trigger: 'item', formatter: p => { const b = w.bars[p.dataIndex]; return `${esc(b.k)}${b.net ? '（燃料費＋碳成本的淨變化）' : ''}<br>${sg(b.d)} 歐元`; } },
      series: [{ type: 'custom', encode: { x: 0, y: [1, 2] },
        data: w.bars.map((b, j) => ({ value: [j, Mx(b.lo), Mx(b.hi), Mx(b.d)], itemStyle: { color: Math.abs(b.d) < 0.5 ? col.no : b.d > 0 ? col.bad : col.ok, opacity: b.net ? 1 : .7 } })),
        renderItem: (p, api) => {
          const j = api.value(0), a = api.coord([j, api.value(1)]), z = api.coord([j, api.value(2)]), bw = api.size([1, 0])[0] * .55, d = api.value(3);
          return { type: 'group', children: [
            { type: 'rect', shape: { x: a[0] - bw / 2, y: z[1], width: bw, height: Math.max(1.5, a[1] - z[1]) }, style: api.style() },
            { type: 'text', silent: true, style: { text: Math.abs(d) < 5e-7 ? '0' : (d > 0 ? '+' : '−') + fmt(Math.abs(d), 2), x: a[0], y: z[1] - 3, align: 'center', verticalAlign: 'bottom', fill: col.ink, fontSize: 11 } }] };
        },
        markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: col.sub, type: 'solid', width: 1 }, data: [{ yAxis: 0 }] } }] }));
    // 免罰所需生質比例：取代比例是「質量比」（占重油幾 %）；能讓罰款歸零的「生質能源占比」是能量比，三種燃料幾乎相同，只寫一次
    const sol = C.bio_fuels.map(b => [b, CE.solveBioShare(F.ships, x.year, b)]), okE = sol.filter(s => s[1].status === 'ok').map(s => s[1].bio_energy_share_pct);
    const sameE = okE.length > 1 && Math.max(...okE) - Math.min(...okE) < .05;
    el.querySelector('[data-sol]').innerHTML = '<b>罰款變 0 至少要換多少（質量比，占重油的比例）：</b>' + sol.map(([b, s]) => s.status === 'ok' ? `${esc(b)} 取代 ${fmt(s.share_pct, 1)}%` + (sameE ? '' : `（生質能源 ${fmt(s.bio_energy_share_pct, 1)}%，能量比）`) :
      s.status === 'already' ? `${esc(b)}：已達標` : s.status === 'infeasible' ? `${esc(b)}：全部取代仍不足` : `${esc(b)}：FuelEU 尚未適用`).join('；') + '。' +
      (sameE ? `三者需要的生質能源占比相同，約 ${fmt(okE[0], 1)}%（能量比，占計入能源）；含生質比例越低的燃料（如 B30）要換越多重油。` : '');
    // 碳價敏感度：不同碳價下，混用方案比照常營運的燃料費與碳成本增減（不列兩種口徑相加的「合計」）
    const prices = [...new Set(C.sens.concat([x.eua]))].sort((a, b) => a - b), mix = sc[sc.length - 1][1];
    const sBase = CE.euaSensitivity(F.ships, x.year, prices), sBio = CE.euaSensitivity(F.ships, x.year, prices, { bio_code: st.bio, bio_share_pct: st.share });
    U.table(el.querySelector('[data-sen]'), { pageSize: 10,
      rows: prices.map((p, i) => ({ p, ets: sBase[i].ets_cost, df: mix.fuel_cost - base.fuel_cost, dc: (sBio[i].total - mix.fuel_cost) - (sBase[i].total - base.fuel_cost), d: sBio[i].total - sBase[i].total })),
      cols: [{ k: 'p', t: '碳價（歐元／噸）', n: true, h: r => fmt(r.p, 0) + (r.p === x.eua ? ' ' + tag('目前', 'no') : '') }, { k: 'ets', t: '照常營運 ETS（歐元）', n: true, d: 0 },
        { k: 'df', t: `混用 ${st.bio} ${st.share}% 燃料費增減`, n: true, h: r => sg(r.df) }, { k: 'dc', t: '碳成本增減', n: true, h: r => sg(r.dc) },
        { k: 'd', t: '淨增減（比照常營運）', n: true, h: r => sg(r.d) }] });
  });
})();
