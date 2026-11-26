/* AI 分析（alert-email-ai，示意）：依事件類型用「預先寫好的規則範本」產生 可能原因／建議動作／門檻檢討，引用事件當下的數據。
   不呼叫 AI 模型；畫面一律標「示意」並註明「正式版由 AI 模型依實際資料分析，範圍於執行規劃書確認」。
   用在：警報事件詳情（events.js 抽屜）、單船總覽「要處理的事」、通知紀錄的信件預覽。
   門檻檢討：看這條規則「現在有多少比例的船／港／場站超過門檻」與近 30 天觸發次數；比例明顯偏高時建議新門檻（讓約 15% 觸發）。
   安全相關的規則（最低庫存、燃油剩餘天數）觸發偏多時不建議放寬，改提醒檢視加油計畫。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U || !U.cargo) return;
  const CG = U.cargo, HR = 36e5, DAY = 864e5, { fmt, esc } = U;
  const ts = s => (s ? Date.parse(String(s).length <= 16 ? s + ':00Z' : String(s).slice(0, 19) + 'Z') : null);
  const pn = u => (U.ports ? U.ports(u) : u);
  const q = (a, p) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
  const P = () => Object.assign({ gap_hr: 6, stale_hr: 12 }, (U.RK.blocks['M15-c2'] || {}).params || {});
  const PP = () => Object.assign({ mid: 120, high: 150 }, (U.RK.blocks['M13-c3'] || {}).params || {});
  const DISC = '示意：目前依規則範本與事件數據產生；正式版由 AI 模型依實際資料分析，範圍於執行規劃書確認。';
  const SHARE_HI = 0.25;                                       // 超過這個比例觸發，視為門檻可能過於敏感

  // 本公司船（目前範圍）每艘最早一筆到港預報
  function ownArr() {
    const ids = new Set(U.scopeVessels().map(v => v.id)), by = {};
    CG.arrivals().filter(a => a.status === 'EXPECTED' && ids.has(a.vid)).forEach(a => { const t = ts(a.etaCalc || a.etaRep); if (t != null && (!by[a.vid] || t < by[a.vid].t)) by[a.vid] = Object.assign({ t }, a); });
    return Object.values(by);
  }
  const gapOf = a => (a.etaRep && a.etaCalc ? Math.abs(ts(a.etaCalc) - ts(a.etaRep)) / HR : null);
  const ageOf = a => (a.posT ? (CG.NOW - ts(a.posT)) / HR : null);
  const board = u => (U.portBoard ? U.portBoard().find(b => b.unlo === u) : null);
  const n30 = kind => (U.events ? U.events.list().filter(e => e.kind === kind && e.openedAt >= (U.events.now() - 30 * DAY)).reduce((s, e) => s + 1 + (e.retrig || 0), 0) : 0);

  // ---------------- 門檻檢討（每條規則）
  function review(rule) {
    if (rule === 'eta') {
      const g = ownArr().map(gapOf).filter(x => x != null), th = P().gap_hr, share = g.filter(x => x > th).length / Math.max(1, g.length);
      const sug = Math.ceil(q(g, 0.85) || th);
      return share > SHARE_HI && sug > th ? { hot: true, text: `近 30 天觸發 ${n30('eta')} 次；目前 ${fmt(share * 100, 0)}% 的船（${g.length} 艘中）ETA 落差超過門檻 ${th} 小時。門檻可能過於敏感，建議調整為 ${sug} 小時（約 15% 的船會觸發）。` }
        : { hot: false, text: `目前 ${fmt(share * 100, 0)}% 的船超過門檻 ${th} 小時，觸發比例合理，維持門檻。` };
    }
    if (rule === 'pos') {
      const g = ownArr().map(ageOf).filter(x => x != null), th = P().stale_hr, share = g.filter(x => x > th).length / Math.max(1, g.length);
      const sug = Math.ceil(q(g, 0.85) || th);
      return share > SHARE_HI && sug > th ? { hot: true, text: `近 30 天觸發 ${n30('pos')} 次；目前 ${fmt(share * 100, 0)}% 的船位置超過 ${th} 小時沒更新。門檻可能過於敏感，建議調整為 ${sug} 小時；但也請先確認船位資料來源是否正常。` }
        : { hot: false, text: `目前 ${fmt(share * 100, 0)}% 的船位置超過 ${th} 小時沒更新，觸發比例合理，維持門檻。` };
    }
    if (rule === 'port') {
      const B = U.portBoard ? U.portBoard().filter(b => b.idx != null) : [], p = PP(), share = B.filter(b => b.idx >= p.mid).length / Math.max(1, B.length);
      const sug = Math.ceil((q(B.map(b => b.idx), 0.85) || p.mid) / 10) * 10;
      return share > SHARE_HI && sug > p.mid ? { hot: true, text: `近 30 天觸發 ${n30('port')} 次；目前 ${fmt(share * 100, 0)}% 的港（${B.length} 港中）塞港指數達「留意」門檻 ${p.mid}。門檻可能過於敏感，建議調整為 ${sug}（約 15% 的港會觸發）。` }
        : { hot: false, text: `目前 ${fmt(share * 100, 0)}% 的港塞港指數達「留意」門檻 ${p.mid}，觸發比例合理，維持門檻。` };
    }
    if (rule === 'yard') {
      const R = CG.forecastAll().filter(r => r.series.length), share = R.filter(r => r.status === '要處理' || r.status === '留意').length / Math.max(1, R.length);
      return share > SHARE_HI ? { hot: true, text: `近 30 天觸發 ${n30('yard')} 次；目前 ${fmt(share * 100, 0)}% 的場站櫃型被標記缺櫃。觸發偏多，建議檢視安全存量設定（可用「系統管理 › 補充資料上傳」改成各場站實際的安全存量）。` }
        : { hot: false, text: `目前 ${fmt(share * 100, 0)}% 的場站櫃型被標記缺櫃，觸發比例合理。` };
    }
    if (window.UI_ALARM && ['FCD', 'LSA', 'REMAIN_DAYS', 'OTP'].includes(rule)) {
      const lo = CG.NOW - 30 * DAY, at = s => Date.parse(String(s).length <= 7 ? s + '-01T00:00:00Z' : s + 'T00:00:00Z');
      const loM = new Date(lo).toISOString().slice(0, 7), inWin = s => (String(s).length <= 7 ? String(s) >= loM : at(s) >= lo);   // 月規則（油耗偏差、準點）的觸發只到月份：以月份比較
      const ids = new Set(U.scopeVessels().map(v => v.id)), ev = window.UI_ALARM.events.filter(a => a.rule === rule && ids.has(a.vid) && inWin(a.start));
      const share = new Set(ev.map(a => a.vid)).size / Math.max(1, ids.size), safe = rule === 'LSA' || rule === 'REMAIN_DAYS';
      if (share <= SHARE_HI) return { hot: false, text: `近 30 天 ${ev.length} 次觸發（${fmt(share * 100, 0)}% 的船），觸發比例合理。` };
      return safe ? { hot: true, text: `近 30 天 ${ev.length} 次觸發（${fmt(share * 100, 0)}% 的船）。這是安全相關門檻，不建議放寬；請檢視加油計畫與各船最低存量底線。` }
        : { hot: true, text: `近 30 天 ${ev.length} 次觸發（${fmt(share * 100, 0)}% 的船）。門檻可能過於敏感，建議和船務部確認是否調整。` };
    }
    return null;
  }

  // ---------------- 今日要處理事件
  function forEvent(e) {
    if (!e) return null;
    const sp = e.spec || {}, cause = [], action = [];
    if (e.kind === 'port') {
      const b = board(sp.unlo), p = PP();
      if (!b) return pack(['找不到這個港口目前的壅塞資料。'], ['到「即時動態地圖」點這個港口看詳情。'], review('port'));
      if (b.idx != null) cause.push(`塞港指數 ${fmt(b.idx, 0)}（平常＝100；${p.mid} 留意、${p.high} 要處理）`);
      if (b.wait != null) cause.push(`在錨等泊 ${fmt(b.wait, 0)} 艘、在泊 ${fmt(b.berthed, 0)} 艘${b.wait > b.berthed ? '：等泊的船比在泊多，碼頭作業量跟不上到港量' : ''}`);
      if (b.maxWait != null) cause.push(`目前最長已等 ${fmt(b.maxWait, 0)} 小時${b.avgWait != null ? `（近期平均等泊 ${fmt(b.avgWait, 1)} 小時）` : ''}`);
      if (b.chg != null && Math.abs(b.chg) >= 10) cause.push(`本週等泊比上週${b.chg > 0 ? '增加' : '減少'} ${fmt(Math.abs(b.chg), 0)}%${b.chg > 0 ? '，壅塞正在變嚴重' : ''}`);
      if (b.nToward) { const names = b.toward.slice(0, 3).map(x => (U.VBY[x.vid] || {}).name || x.name).filter(Boolean); action.push(`${b.nToward} 艘本公司船 3 天內到港（${names.join('、')}${b.nToward > 3 ? ' 等' : ''}）：請提早通知代理與碼頭預排泊位`); action.push('評估讓這些船適度減速、晚一點到港，少在錨地等（等泊也在燒油）'); }
      else action.push('3 天內沒有本公司船要到，持續觀察；有船排定前再通知代理');
      if (b.level === 'high') action.push('必要時調整靠港順序，先去其他港');
      return pack(cause, action, review('port'));
    }
    if (e.kind === 'yard') {
      const C = CG.C, rs = CG.forecastAll().filter(r => r.y === sp.y && (r.status === '要處理' || r.status === '留意'));
      if (!rs.length) return pack(['這個場站目前已沒有預估缺櫃的櫃型（條件可能已消失）。'], ['確認後可結案。'], review('yard'));
      rs.slice(0, 4).forEach(r => cause.push(`${r.ct} ${r.sz} 呎：目前 ${fmt(r.cur, 0)} 個、安全存量 ${fmt(r.safety, 0)} 個；${r.first ? `預估第 ${r.first} 天起低於安全存量` : '預估區間下緣低於安全存量'}${r.gap >= 0.5 ? `，缺 ${fmt(r.gap, 0)} 個` : ''}（${String(r.source).split('；').pop()}）`));
      const term = C.yards[sp.y] ? C.yards[sp.y][0] : '', toward = ownArr().filter(a => a.term === term);
      action.push(toward.length ? `${toward.length} 艘本公司船即將到這個碼頭（${toward.slice(0, 3).map(a => a.name).join('、')}）：請安排多卸空櫃` : '近期沒有本公司船到這個碼頭：請從鄰近場站調櫃');
      if (rs.some(r => r.status === '要處理')) action.push('缺口明確的櫃型，暫緩接受該櫃型的新訂艙或改由其他場站提櫃');
      return pack(cause, action, review('yard'));
    }
    if (e.kind === 'eta' || e.kind === 'pos') {
      const a = ownArr().find(x => x.vid === sp.vid), v = U.VBY[sp.vid] || {};
      if (!a) return pack(['找不到這艘船目前的到港預報。'], ['到單船總覽確認航次與船位。'], review(e.kind));
      const age = ageOf(a);
      if (e.kind === 'eta') {
        const g = gapOf(a), late = a.etaRep && a.etaCalc && ts(a.etaRep) > ts(a.etaCalc);
        cause.push(`船上回報的 ETA 比依船位與航速計算的 ETA ${late ? '晚' : '早'} ${fmt(g, 0)} 小時（門檻 ${P().gap_hr} 小時）`);
        if (a.sog != null && v.design && a.sog < v.design * 0.8) cause.push(`目前航速 ${fmt(a.sog, 1)} 節，低於設計航速 ${fmt(v.design, 1)} 節：可能降速、遇天候或在等泊`);
        const b = board(a.unlo); if (b && b.idx != null && b.level !== 'low') cause.push(`目的港 ${pn(a.unlo)} 塞港指數 ${fmt(b.idx, 0)}，船可能刻意晚到、避免在錨地等`);
        if (age != null && age > 6) cause.push(`船位 ${fmt(age, 0)} 小時前更新，計算 ETA 可能已不準`);
        action.push(`以計算 ETA 通知 ${pn(a.unlo)} 的碼頭與代理`); action.push('請船務向船長確認回報 ETA，差距大的原因寫進事件回報');
      } else {
        cause.push(`最後船位 ${age == null ? '沒有紀錄' : fmt(age, 0) + ' 小時前'}（門檻 ${P().stale_hr} 小時）`);
        cause.push('可能原因：AIS 訊號被遮蔽（港區、海峽）、船上設備或船報沒有送出');
        action.push('請船務聯絡船長補報船位'); action.push(`補報前，${pn(a.unlo)} 的到港時間先以船上回報 ETA 為準，並提醒碼頭可能變動`);
      }
      return pack(cause, action, review(e.kind));
    }
    return null;
  }

  // ---------------- 船舶警報（信件用）
  function forAlarm(rule, vid, al) {
    const v = U.VBY[vid] || {}, s = (U.SN && U.SN.snap || {})[vid] || {}, cause = [], action = [];
    if (rule === 'FCD') { cause.push(`當月每浬油耗比上月上升 ${fmt(al.value, 1)}%（門檻 ${al.thr}%）`); cause.push('常見原因：航速提高、天候海況變差、船殼或螺槳結垢、資料填報錯誤'); action.push('到單船「油耗與航行」比對航速與油耗、找出異常日'); action.push('若連續兩個月偏高，安排檢查船殼與螺槳'); }
    else if (rule === 'LSA' && al && al.fuel === 'LNG') {           // fuel-threshold-lng：LNG 低於門檻
      cause.push(`LNG 剩艙容 ${al.value}%（約 ${fmt(U.fuel.m3(v, al.value), 0)} m³），低於門檻 ${al.thr}%；每天約用 ${fmt(s.lng_rate, 0)} m³，另有艙內自然蒸發（BOG）`);
      cause.push('可加注 LNG 的港口與加注船比燃油少，錯過就要改燒備援的 VLSFO（碳排與歐盟碳成本較高）');
      action.push('確認航線上下一個可加注 LNG 的港口與加注船檔期，提前預約'); action.push('若來不及加注，改用 VLSFO 備援並確認殘油庫存足夠');
    } else if (rule === 'LSA' && al && al.fuel === 'MGO') {         // 輕油低於門檻
      cause.push(`輕油（MGO）剩 ${al.value} 噸，低於門檻 ${al.thr} 噸；輕油用於排放管制區、進出港${U.fuel.isLng(v) ? '，也是 LNG 引擎的引燃油' : ''}`);
      action.push('下一個加油港補足輕油，進入排放管制區前確認存量'); if (U.fuel.isLng(v)) action.push('引燃油不足時 LNG 引擎無法運轉，優先補足');
    } else if (rule === 'LSA' || rule === 'REMAIN_DAYS') {
      if (s.rob_res != null) cause.push(`殘油 ${fmt(s.rob_res, 0)} 噸、日耗 ${fmt(s.rate, 1)} 噸，剩餘約 ${fmt(s.remain, 1)} 天`);
      cause.push(rule === 'LSA' ? `觸發值 ${al.value} 噸，低於該船門檻 ${al.thr} 噸（最低存量底線 ${fmt(v.floor_res, 0)} 噸）` : `剩餘天數 ${al.value} 天，低於門檻 ${al.thr} 天`);
      action.push('確認下一個可加油港與油價（燃油成本頁「油量與下一加油港」），安排加油'); action.push('加油前避免趕船，降低日耗');
    } else if (rule === 'OTP') { cause.push(`月準點率 ${fmt(al.value, 0)}%，低於門檻 ${al.thr}%`); cause.push('常見原因：沿途港口壅塞、上一港延誤傳遞、航速安排'); action.push('到「運務管理 › 趨勢分析」看延誤原因歸納'); }
    return pack(cause, action, review(rule));
  }

  // ---------------- 單船「要處理的事」：每一項是這艘船的一個燈號（U.sov.lights 的一列）
  const LACT = {
    otp: ['到「航次與港口 › 航次數據」看哪幾港延誤、是不是港口壅塞造成', '和運務確認下一航次各港的泊位窗口'],
    pwait: ['等泊偏長：評估讓船適度減速、晚一點到港，少在錨地等', '和代理確認泊位窗口，必要時調整靠港順序'],
    slot: ['艙位利用率偏低：和貨務確認攬貨狀況，檢討分配的艙位（BSA）是否過多'],
    eff: ['到「油耗與航行」比對同型船與航速，找出油耗偏高的航段', '連續偏高時安排檢查船殼與螺槳'],
    speed: ['到「油耗與航行」看速度比與油耗，確認是否長時間高速航行'], catchup: ['趕船多燒油：檢討延誤源頭（上一港、等泊），避免用加速補時間'],
    outlier: ['到「油耗與航行」看異常日，確認是設備問題還是填報錯誤'], foul: ['有船殼結垢徵兆：評估水下清潔或螺槳拋光的時機'],
    remain: ['確認下一個可加油港與油價，安排加油', '加油前避免趕船，降低日耗'], data: ['請船上補報或更正資料，確認後再判讀其他燈號'],
    cii: ['到「環保法遵」看全年推估等級與改善方式（降速、換燃料）', '年底前評估是否需要提出改善計畫'],
  };
  const LRULE = { remain: 'REMAIN_DAYS', otp: 'OTP', eff: 'FCD' };
  function forLight(vid, x) {
    if (!x) return null;
    const cause = [x.summary || `${x.label} ${x.text || ''}`];
    const ev = U.events ? U.events.list().find(e => !e.seed && (e.status === 'new' || e.status === 'in_progress') && e.spec && e.spec.vid === vid) : null;
    if (ev) cause.push(`這艘船另有進行中的事件：${ev.title}`);
    const rv = LRULE[x.key] ? review(LRULE[x.key]) : null;
    return pack(cause, LACT[x.key] || [`點「前往」看「${x.destName || '對應頁面'}」的細節`], rv);
  }

  function pack(cause, action, rv) {
    const li = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return { cause, action, review: rv, html: `<div class="aiw"><div class="ais"><b>可能原因</b>${li(cause)}</div><div class="ais"><b>建議動作</b>${li(action)}</div>
      ${rv ? `<div class="aith${rv.hot ? ' hot' : ''}"><b>門檻檢討</b>${esc(rv.text)}</div>` : ''}<p class="note aidisc">${DISC}</p></div>` };
  }
  function forMail(m) {
    if (!m || m.src === 'test') return null;
    if (m.src === 'ev') { const e = U.events && U.events.list().find(x => x.id === m.evId); return forEvent(e || { kind: m.rule, spec: m.spec }); }
    if (m.src === 'alarm' && m.alarm) return forAlarm(m.rule, m.vid, m.alarm);
    return null;
  }
  // 可展開的區塊（事件抽屜、單船要處理的事用）
  const box = (a, open) => (a ? `<details class="aibox"${open ? ' open' : ''}><summary><b>AI 分析</b><span class="tag warn">示意</span>${a.review && a.review.hot ? '<span class="tag bad">門檻可能過於敏感</span>' : ''}</summary>${a.html}</details>` : '');

  U.ai = { forEvent, forAlarm, forLight, forMail, review, box, DISC };
})();
