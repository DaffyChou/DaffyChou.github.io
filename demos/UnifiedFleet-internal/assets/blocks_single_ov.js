/* 單船總覽重新規劃（single-overview）的畫面：① 這艘船現在在哪、要去哪（M14-b40／c40）。
   位置判斷沿用清單的 posOf（U.rosterPos），預計到港與回報值取自到港預報（U.cargo.arrivals），船報更新取自 U.SN.snap。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const { fmt, esc } = U;
  const tsZ = s => (s ? Date.parse(s.length <= 16 ? s + ':00Z' : s + 'Z') : null);
  const pn = u => (u ? (U.ports ? U.ports(u) : u) : '—');
  const hm = s => (s ? s.slice(5, 16).replace('T', ' ') : '—');

  /** 這艘船的位置與下一港（畫面與判讀共用） */
  U.sovPos = function (id) {
    const CG = U.cargo, NOW = CG ? CG.NOW : Date.now(), sn = (U.SN && U.SN.snap[id]) || {};
    const arr = CG ? CG.arrivals().filter(a => a.vid === id && a.status === 'EXPECTED').sort((a, b) => ((a.etaCalc || a.etaRep || '') < (b.etaCalc || b.etaRep || '') ? -1 : 1)) : [];
    const ps = U.rosterPos ? U.rosterPos(id) : null;
    const nx = (ps && ps.dest && arr.find(a => a.unlo === ps.dest)) || arr[0] || null;
    const gap = nx && nx.etaCalc && nx.etaRep ? (tsZ(nx.etaCalc) - tsZ(nx.etaRep)) / 3600000 : null;
    return { ps, nx, gap, sog: nx ? nx.sog : null, svc: (nx && nx.svc) || (U.VBY[id] || {}).svc || null, last: sn.last || null, hours: sn.hours, stale: !!sn.stale || (ps && ps.st === '位置過期'), NOW };
  };

  /** ③ 重點數字的小走勢：在每張數字卡下面畫近 12 個月的折線（到目前選的月份為止），最後一點加圓點；沒有逐月資料的數字（例如剩餘天數）不畫 */
  U.sovSpark = function (el, id, metrics, c) {
    const col = U.COL(), cards = el.querySelectorAll('.kpi'), grid = el.querySelector('.kpis');
    if (grid) grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(min(11rem,100%),1fr))';   // 半寬時排成 2×2，不會變成 3＋1
    if (grid && el.clientWidth < 900 && el.clientWidth > 360) grid.style.gridTemplateColumns = 'repeat(2,minmax(0,1fr))';
    metrics.forEach((m, i) => {
      const card = cards[i]; if (!card || !m) return;
      const s = U.series(m, id).slice(Math.max(0, c.mi - 11), c.mi + 1), v = s.filter(x => x != null);
      if (v.length < 2) return;
      const lo = Math.min(...v), hi = Math.max(...v), W = 120, H = 28, n = s.length, X = j => (j / (n - 1)) * W, Y = x => (hi === lo ? H / 2 : H - 3 - ((x - lo) / (hi - lo)) * (H - 6));
      const pts = s.map((x, j) => (x == null ? null : `${X(j).toFixed(1)},${Y(x).toFixed(1)}`)).filter(Boolean).join(' '), li = s.length - 1;
      card.insertAdjacentHTML('beforeend', `<div class="sovsp" title="近 12 個月（最低 ${fmt(lo)}、最高 ${fmt(hi)}）" style="margin-top:.35rem"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:1.75rem;display:block" aria-label="近 12 個月走勢">` +
        `<polyline points="${pts}" fill="none" stroke="${col.acc}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>` + (s[li] != null ? `<circle cx="${X(li)}" cy="${Y(s[li])}" r="2.4" fill="${col.acc}"/>` : '') +
        `</svg><div class="note" style="display:flex;justify-content:space-between;font-size:.6875rem"><span>12 個月前</span><span>本月</span></div></div>`);
    });
  };

  U.reg(['M14-b40', 'M14-c40'], (el, c) => {
    const id = c.vids[0];
    if (!id) return U.emptyChart(el, '沒有選船');
    const P = U.sovPos(id), ps = P.ps || {}, nx = P.nx;
    const gapTxt = P.gap == null || Math.abs(P.gap) < 0.5 ? '與船上回報一致' : `比船上回報${P.gap > 0 ? '晚' : '早'} ${fmt(Math.abs(P.gap), 1)} 小時`;
    const stCls = P.stale ? 'warn' : ps.st === '在港' ? 'ok' : 'ok';
    U.kpis(el, [
      { k: '目前狀態', v: P.stale ? '位置可能已過期' : (ps.st || '—'), d: P.stale ? `超過 ${fmt(P.hours || 0, 0)} 小時沒有船報` : (ps.atNote || ''), cls: P.stale ? 'warn' : stCls },
      { k: ps.st === '在港' ? '目前港口' : '上一個港口', v: pn(ps.at), d: P.svc ? '航線 ' + P.svc : '', cls: 'no' },
      { k: '下一港與預計到港', v: nx ? pn(nx.unlo) : '—', d: nx ? `${hm(nx.etaCalc || nx.etaRep)}（${gapTxt}）` : '沒有到港預報', cls: P.gap != null && Math.abs(P.gap) >= 6 ? 'warn' : 'no',
        g: '預計到港是系統依位置與航速推算；括號內是和船上回報的預計到港相差幾小時。' },
      { k: '航速', v: P.sog == null ? '—' : fmt(P.sog, 1) + ' 節', d: P.stale ? '最後一筆位置的航速（可能已過期）' : P.sog === 0 ? '停泊或錨泊中' : '最後一筆位置的對地航速', cls: 'no' },
      { k: '船報更新', v: P.last ? hm(P.last) : '—', d: P.hours == null ? '' : `${fmt(P.hours, 0)} 小時前${P.stale ? '（已過期）' : ''}`, cls: P.stale ? 'warn' : 'ok' },
    ]);
  });

  // ============================================================ ② 要處理的事（M14-b41／c41）：這艘船的紅燈、黃燈，紅燈在前；每項可前往對應頁籤
  U.reg(['M14-b41', 'M14-c41'], (el, c) => {
    const id = c.vids[0];
    if (!id || !U.sov) return U.emptyChart(el, '沒有選船');
    const L = U.sov.lights(id, U.STATE.type), todo = L.filter(x => x.level === 'high' || x.level === 'mid'), nd = L.filter(x => x.level === 'nodata'), ok = L.filter(x => x.level === 'low');
    const tg = lv => (lv === 'high' ? '<span class="tag bad">要處理</span>' : '<span class="tag warn">留意</span>');
    const cut = (t, n) => (t.length > n ? t.slice(0, n) + '…' : t);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = (todo.length ? `<div class="note" style="margin-bottom:.3rem">要處理 ${todo.filter(x => x.level === 'high').length} 項、留意 ${todo.filter(x => x.level === 'mid').length} 項（共 ${L.length} 項燈號，和清單頁同一份評估）</div>` +
      todo.map(x => `<div data-todo="${esc(x.key)}" style="display:flex;flex-wrap:wrap;gap:.4rem .6rem;align-items:flex-start;padding:.5rem 0;border-top:1px solid var(--line)">` +
        `<div style="flex:none;padding-top:.1rem">${tg(x.level)}</div>` +
        `<div style="flex:1 1 12rem;min-width:0"><b>${esc(x.label)}</b>${x.text ? `　<span style="font-weight:600">${esc(x.text)}</span>` : ''}<div class="note" title="${esc(x.summary)}">${esc(cut(x.summary, 70))}</div></div>` +
        `<button type="button" class="btn" data-sovgo="${esc(x.dest)}" style="flex:none;margin-left:auto">前往${esc(x.destName)} →</button>` +
        (U.ai ? `<div style="flex:1 1 100%;min-width:0">${U.ai.box(U.ai.forLight(id, x))}</div>` : '') + '</div>').join('') :   // AI 分析（示意，ai_insight.js）
      `<div style="padding:.6rem .2rem .3rem"><b style="color:var(--ok)">目前沒有要處理的事</b><div class="note">${ok.length} 項燈號都正常${nd.length ? '' : '。'}</div></div>` +
      `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(12rem,100%),1fr));gap:.15rem .9rem;margin-top:.3rem">${ok.map(x => `<div class="note" style="display:flex;justify-content:space-between;gap:.5rem;padding:.25rem 0;border-top:1px solid var(--line)"><span><span class="tag ok">正常</span> ${esc(x.label)}</span><b style="color:var(--ink)">${esc(x.text || '')}</b></div>`).join('')}</div>`) +
      (nd.length ? `<div class="note" style="margin-top:.4rem;padding-top:.4rem;border-top:1px dashed var(--line)">資料不足、無法判斷：${nd.map(x => esc(x.label) + (x.text ? '（' + esc(x.text) + '）' : '')).join('、')}</div>` : '');
    el.querySelectorAll('[data-sovgo]').forEach(bt => (bt.onclick = () => U.sov.go(id, bt.dataset.sovgo)));   // 不用 data-go：app.js 會把 data-go 當成「相關圖表」連結
  });

  // ============================================================ ④ 各面向狀況（M14-b42／c42）：每格＝面向、最差的燈、代表數字、一行原因；點格子到對應頁籤
  U.reg(['M14-b42', 'M14-c42'], (el, c) => {
    const id = c.vids[0];
    if (!id || !U.sov) return U.emptyChart(el, '沒有選船');
    const type = U.STATE.type, L = U.sov.lights(id, type), F = U.sov.faces(type);
    const TAGC = { high: ['要處理', 'bad', 'var(--bad)'], mid: ['留意', 'warn', 'var(--warn)'], low: ['正常', 'ok', 'var(--ok)'], nodata: ['資料不足', 'no', 'var(--no)'] };
    const cut = (t, n) => (t.length > n ? t.slice(0, n) + '…' : t);
    el.classList.add('auto'); el.style.maxHeight = 'none';
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(9.5rem,100%),1fr));gap:.6rem">` + F.map(f => {
      const ls = L.filter(x => x.face === f.key), lv = U.sov.worst(ls), rep = ls.find(x => x.key === f.rep) || ls[0], bad = ls.filter(x => x.level === lv && (lv === 'high' || lv === 'mid'));
      const [tn, tk, bc] = TAGC[lv] || TAGC.nodata;
      // 原因：只有代表數字那一項有問題時寫它的判讀（不重複名稱與數字）；多項有問題時列出名稱與數字；都正常寫幾項正常
      let why = bad.length === 1 && rep && bad[0].key === rep.key ? bad[0].summary : bad.length ? bad.map(x => x.label + (x.text ? ' ' + x.text : '')).join('、') : lv === 'nodata' ? (rep ? rep.summary : '沒有資料') : `${ls.length} 項都正常`;
      if (f.key === 'env' && U.euSet) why += U.euSet().has(id) ? '；有歐盟航段（ETS、FuelEU 成本）' : '；沒有歐盟航段';
      return `<button type="button" class="sovface" data-sovface="${esc(f.key)}" data-tab="${esc(f.tab)}" style="text-align:left;cursor:pointer;padding:.65rem .75rem;border:1px solid var(--line);border-left:4px solid ${bc};border-radius:.5rem;background:var(--card);color:var(--ink);font:inherit">` +
        `<div style="display:flex;justify-content:space-between;gap:.4rem;align-items:center"><b>${esc(f.name)}</b><span class="tag ${tk}">${tn}</span></div>` +
        `<div style="font-size:1.15rem;font-weight:700;margin:.3rem 0 .1rem">${rep && rep.text ? esc(rep.text) : '—'}</div>` +
        `<div class="note">${rep ? esc(rep.label) : ''}</div>` +
        `<div class="note" style="margin-top:.25rem" title="${esc(why)}">${esc(cut(why, 46))}</div>` +
        `<div class="note" style="margin-top:.35rem;color:var(--acc)">看${esc(U.sov.destName(type, f.tab))} →</div></button>`;
    }).join('') + `</div>`;
    el.querySelectorAll('[data-sovface]').forEach(bt => (bt.onclick = () => U.sov.go(id, bt.getAttribute('data-tab'))));
  });
})();
