/* M10 資料品質與填報、M11 警報 */
(function () {
  'use strict';
  const U = window.UI;
  const { COL, fmt, months, vname, esc, STATE } = U;
  const R = n => U.risk.rows(n);
  const tag = (l, k) => `<span class="tag ${k}">${esc(l)}</span>`;
  const t2 = s => (s ? String(s).replace('T', ' ').slice(0, 16) : null);
  const SEV = { ERROR: ['錯誤', 'bad'], WARN: ['警告', 'warn'], INFO: ['資訊', 'no'] };
  const STA = { OK: '正常', INSUFFICIENT: '資料不足', ANOMALY: '資料異常', STALE: '資料過期', ESTIMATED: '估算' };

  // ============================================================ M10
  function dqList(el, c) {
    const set = new Set(c.vids), by = {};
    window.UI_DQ.agg.forEach(([rule, vid, n]) => { if (vid == null || set.has(vid)) by[rule] = (by[rule] || 0) + n; });
    const rules = window.UI_DQ.rules.map(r => ({ rule: r.rule_code, n: by[r.rule_code] || 0, sev: r.severity, st: r.result_status, d: r.description }));
    U.table(el, { sort: ['n', -1], rows: rules.filter(r => r.n > 0), cols: [{ k: 'rule', t: '規則' }, { k: 'n', t: '問題筆數', n: true, d: 0 }, { k: 'sev', t: '嚴重度', h: r => tag(SEV[r.sev][0], SEV[r.sev][1]) }, { k: 'st', t: '命中後的資料狀態', h: r => esc(STA[r.st] || r.st) }, { k: 'd', t: '說明' }],
      empty: '此範圍沒有資料品質問題' });
  }
  U.reg(['M10-b0', 'M10-c0'], dqList);

  function fill(el, c) {
    const F = window.UI_DQ.fill, bulk = STATE.type === 'bulk';
    const fields = bulk ? [['bft', '浪高風級'], ['disp', '排水量'], ['cargo', '貨量']] : [['bft', '浪高風級'], ['price', '油價'], ['bdn', 'BDN 供油單量']];
    const rows = c.vids.map(id => ({ id, name: vname(id), v: fields.map(([k]) => (F[id] && F[id][k] != null ? 100 * F[id][k] : null)) }));
    const x = rows.map(r => r.name.replace('SYN ', ''));
    if (!rows.length) return U.emptyChart(el, '沒有船舶');
    U.mkChart(el, { grid: { left: 52, right: 24, top: 34, bottom: 56 }, xAxis: { type: 'category', data: x, axisLabel: { rotate: 40, interval: 0, fontSize: 11 } }, yAxis: { type: 'value', name: '填充率 %', max: 100 },
      series: fields.map(([, n], i) => ({ name: n, type: 'bar', barMaxWidth: 14, data: rows.map(r => (r.v[i] == null ? null : +r.v[i].toFixed(0))) })),
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, backgroundColor: COL().card, borderColor: COL().line, textStyle: { color: COL().ink, fontSize: 12 } } });
  }
  U.reg(['M10-b1', 'M10-c1'], fill);

  function flow(el, c) {
    el.classList.add('auto');
    const bulk = STATE.type === 'bulk';
    const steps = bulk ? ['早報／午報／每日報', '抵港報', '靠泊', '離港報', '完工報（短航程免）'] : ['每日報', '抵港報（計畫 ETA 對實際）', '配載（TEU、空箱、冷凍箱）', '橋吊作業', '離港報'];
    const checks = bulk ? ['時間順序（抵港早於離港）', '裝卸方向以船艙狀態為準', '庫存取最新有填值', '航次以「船名＋航次號」為鍵'] : ['計畫 ETA 與實際到港時間', '空箱＋滿箱 ＝ 船上 TEU', '橋吊移動數與作業時數相符', '貨櫃船報型態需新定義（配載、船期、橋吊）'];
    el.innerHTML = `<div class="flow">${steps.map((s, i) => `<div>${esc(s)}</div>${i < steps.length - 1 ? '<span>→</span>' : ''}`).join('')}</div>
      <div class="note" style="margin-top:.6rem"><b>檢查情境</b></div><ul>${checks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="note">${bulk ? '沿用 shipreport-flow-demo 的報告型態與檢查情境。' : '兩個現有系統都沒有貨櫃船報型態，需與客戶一起定義；本圖為示意。'}</div>`;
  }
  U.reg(['M10-b2', 'M10-c2'], flow);

  function ledger(el, c) {
    const set = new Set(c.vids);
    const rows = R('ledger').filter(r => set.has(r.vid)).sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 300).map(r => ({ v: vname(r.vid), t: t2(r.t), ty: r.ty, st: r.st, dist: r.dist, hrs: r.hrs, fuel: r.fuel, rob: r.rob, bft: r.bft, dq: r.dq }));
    el.classList.add('auto');
    el.innerHTML = '<div class="toolbar"><button class="btn" id="exp">匯出目前列表（CSV，含 dq_status 欄）</button><span class="note">近 60 天船報；異常列標紅，匯出時帶資料狀態欄</span></div><div id="tb"></div>';
    U.table(el.querySelector('#tb'), { limit: 120, rows, cols: [{ k: 'v', t: '船名' }, { k: 't', t: '時間（UTC）' }, { k: 'ty', t: '報告類型' }, { k: 'st', t: '營運狀態' }, { k: 'dist', t: '距離 nm', n: true, d: 1 }, { k: 'hrs', t: '時數', n: true, d: 2 }, { k: 'fuel', t: '油耗 t', n: true, d: 2 }, { k: 'rob', t: '殘油庫存 t', n: true, d: 0 }, { k: 'bft', t: '風級', n: true, d: 0 },
      { k: 'dq', t: '資料狀態', h: r => (r.dq === 'OK' ? tag('正常', 'ok') : tag(STA[r.dq] || r.dq, 'bad')) }], empty: '近 60 天沒有船報' });
    el.querySelector('#exp').onclick = () => {
      const head = ['船名', '時間UTC', '報告類型', '營運狀態', '距離nm', '時數', '油耗t', '殘油庫存t', '風級', 'dq_status'];
      const lines = [head.join(',')].concat(rows.map(r => [r.v, r.t, r.ty, r.st, r.dist, r.hrs, r.fuel, r.rob, r.bft, r.dq].map(x => (x == null ? '' : String(x).replace(/,/g, ' '))).join(',')));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = '船報明細_模擬資料.csv'; a.click();
    };
  }
  U.reg(['M10-b3', 'M10-c3'], ledger);

  // ============================================================ M11
  const RN = { FCD: '油耗偏差', LSA: '最低庫存', REMAIN_DAYS: '剩餘天數', OTP: '準點' };
  function rules(el, c) {
    const set = new Set(c.vids), ev = window.UI_ALARM.events.filter(e => set.has(e.vid));
    const rows = window.UI_ALARM.rules.filter(r => STATE.type === 'container' || r.id !== 'OTP').map(r => { const e = ev.filter(x => x.rule === r.id); return { id: r.id, name: r.name, thr: r.thr, freq: r.freq, open: e.filter(x => !x.end).length, all: e.length, note: r.note }; });
    U.table(el, { rows, cols: [{ k: 'name', t: '規則' }, { k: 'thr', t: '觸發條件' }, { k: 'freq', t: '偵測頻率' }, { k: 'open', t: '進行中', n: true, d: 0 }, { k: 'all', t: '全期事件', n: true, d: 0 }, { k: 'note', t: '備註' }] });
  }
  U.reg(['M11-b0', 'M11-c0'], rules);

  function events(el, c) {
    const set = new Set(c.vids), ev = window.UI_ALARM.events.filter(e => set.has(e.vid)).sort((a, b) => (a.start < b.start ? 1 : -1));
    U.table(el, { limit: 80, onRow: r => U.go('M3', r.vid), rows: ev.map(e => ({ vid: e.vid, v: vname(e.vid), rule: RN[e.rule], start: e.start, end: e.end || null, val: e.value, thr: e.thr, open: !e.end })),
      cols: [{ k: 'v', t: '船舶' }, { k: 'rule', t: '規則' }, { k: 'start', t: '觸發' }, { k: 'end', t: '恢復正常', h: r => (r.open ? tag('進行中', 'bad') : esc(r.end)) }, { k: 'val', t: '觸發值', n: true, d: 1 }, { k: 'thr', t: '門檻', n: true, d: 1 }], empty: '沒有警報事件' });
  }
  U.reg(['M11-b1', 'M11-c1'], events);

  // 警報規則設定（alert-email-ai）：收件人（勾選帳號、按套用才存）、測試模式（只寄系統管理員、主旨加 [測試]）、寄測試信；需要「資料與警報 › 改」
  let stMsg = '';
  function setting(el, c) {
    if (!U.notify) return settingOld(el, c);
    el.classList.add('auto');
    const N = U.notify, ro = U.can ? !U.can('data', 'edit') : false, dis = ro ? ' disabled' : '';
    const acc = U.auth ? U.auth.ACCOUNTS : [];
    const rules = N.RULES.filter(r => STATE.type === 'container' || (r.src === 'alarm' && r.id !== 'OTP'));
    const row = r => {
      const cf = N.cfg(r.id);
      return `<tr data-rid="${r.id}"><td><b>${esc(r.name)}</b><small class="note">${r.src === 'ev' ? '今日要處理事件' : '船舶警報'}</small></td><td>${esc(r.thr || '')}</td><td>${esc(r.freq || '')}</td>
        <td><details class="rcp"><summary class="btn"${dis}>${cf.to.length ? esc(cf.to.map(id => (U.auth.byId(id) || { name: id }).name).join('、')) : '（沒有收件人）'} ▾</summary>
          <div class="rcpl">${acc.map(a => `<label class="fld"><input type="checkbox" value="${esc(a.id)}"${cf.to.includes(a.id) ? ' checked' : ''}${dis}> ${esc(a.name)}<small class="note">${esc(a.role)}</small></label>`).join('')}
          <div class="rcpb"><button type="button" class="btn pri" data-rapply${dis}>套用</button><button type="button" class="btn" data-rcancel>取消</button></div></div></details></td>
        <td><label class="fld"><input type="checkbox" data-rtest${cf.test ? ' checked' : ''}${dis}> ${cf.test ? '<span class="tag warn" title="測試中：觸發時只寄系統管理員、主旨加 [測試]">測試中</span>' : '關'}</label></td>
        <td><button type="button" class="btn" data-rsend${dis || (cf.to.length ? '' : ' disabled')}>寄測試信</button></td></tr>`;
    };
    el.innerHTML = (ro ? `<div class="roban" role="note"><b>沒有修改權限</b>　只有「資料與警報 › 改」以上可以修改收件人、測試模式或寄測試信。</div>` : '')
      + (stMsg ? `<p class="upmsg" role="status">${esc(stMsg)}</p>` : '')
      + `<table class="t rst"><thead><tr><th>規則</th><th>觸發條件</th><th>偵測頻率</th><th>收件人</th><th>測試模式</th><th></th></tr></thead><tbody>${rules.map(row).join('')}</tbody></table>
      <div class="note">收件人勾選後按「套用」才會存；測試模式開啟時，這條規則觸發只寄給系統管理員、主旨加「[測試]」，用來確認規則合理再正式通知。寄出的信在「系統管理 › 通知紀錄」查看（示意：沒有真的寄信；正式版接公司 SMTP）。門檻在本頁的「油品門檻設定」編輯。</div>`;
    stMsg = '';
    if (ro) return;
    el.querySelectorAll('tr[data-rid]').forEach(tr => {
      const id = tr.dataset.rid, re = () => setting(el, c);
      tr.querySelector('[data-rapply]').onclick = () => { N.setCfg(id, { to: [...tr.querySelectorAll('.rcpl input:checked')].map(i => i.value) }); stMsg = `已更新「${N.RULES.find(r => r.id === id).name}」的收件人。`; re(); };
      tr.querySelector('[data-rcancel]').onclick = () => re();
      tr.querySelector('[data-rtest]').onchange = e => { N.setCfg(id, { test: e.target.checked }); re(); };
      tr.querySelector('[data-rsend]').onclick = () => { const m = N.test(id); stMsg = m && m.to.length ? `已寄出測試信（模擬）給 ${m.to.map(x => (U.auth.byId(x) || { name: x }).name).join('、')}；可在「系統管理 › 通知紀錄」查看。` : '沒有收件人，測試信沒有寄出。'; re(); };
    });
  }
  function settingOld(el, c) {
    el.classList.add('auto');
    const rows = window.UI_ALARM.rules.filter(r => STATE.type === 'container' || r.id !== 'OTP');
    el.innerHTML = `<table class="t"><thead><tr><th>規則</th><th>範圍</th><th>偵測頻率</th><th>收件人</th><th>測試模式</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.types)}</td><td>${esc(r.freq)}</td><td><input type="text" value="（待設定）" style="width:10rem" disabled></td><td>${tag('只建立事件，不寄信', 'warn')}</td></tr>`).join('')}</tbody></table>
      <div class="note">收件清單與 SMTP 屬公司層級設定，尚待提供；待寄事件不受偵測頻率限制，成功寄出前會持續重送（規格）。門檻在本頁的「油品門檻設定」編輯。</div>`;
  }
  U.reg(['M11-b2', 'M11-c2'], setting);
})();
