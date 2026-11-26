/* fuel-threshold-lng：油品門檻依燃料種類（U.fuel）
   燃料分三類：殘油 RES（VLSFO／HSFO，噸）、輕油 MGO（噸；LNG 船含引燃油）、LNG（艙容 %，LNG 雙燃料船才有）。
   門檻存在船舶資料上：v.thr_res、v.thr_mgo、v.thr_lng（沿用既有欄位名稱，舊程式讀 thr_res／thr_mgo 不受影響）；門檻 ≤ 0＝未設定、不觸發低庫存。
   庫存：U.SN.snap[id].rob_res／rob_mgo（噸）、lng_pct（艙容 %）、rob_lng（立方公尺）。
   上傳門檻的瀏覽器紀錄 uf_up_thr：{ 船 id: [殘油, 輕油, LNG] }；舊格式只有兩個值（[殘油, 輕油]），LNG 視為沒上傳、維持原值。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const KINDS = {
    RES: { key: 'thr_res', stock: 'rob_res', name: '殘油', unit: '噸', step: 10, max: 5000 },
    MGO: { key: 'thr_mgo', stock: 'rob_mgo', name: '輕油', unit: '噸', step: 5, max: 2000 },
    LNG: { key: 'thr_lng', stock: 'lng_pct', name: 'LNG', unit: '%', step: 5, max: 100 },
  };
  const isLng = v => !!(v && (v.fuels || []).includes('LNG'));
  const kinds = v => (isLng(v) ? ['LNG', 'RES', 'MGO'] : ['RES', 'MGO']);                 // 這艘船要設門檻的燃料
  const resName = v => (v && v.scr ? 'HSFO' : 'VLSFO');                                     // 殘油實際油種（有脫硫塔燒 HSFO）
  // 顯示名稱：殘油（VLSFO）、輕油（MGO，含引燃油）、LNG（艙容 %）
  const label = (v, k) => (k === 'RES' ? `殘油（${resName(v)}${isLng(v) ? '，備援' : ''}）` : k === 'MGO' ? `輕油（MGO${isLng(v) ? '，含引燃油' : ''}）` : 'LNG（艙容 %）');
  const get = (v, k) => (v ? v[KINDS[k].key] : null);
  const set = (v, k, x) => { if (v) v[KINDS[k].key] = x; };
  const isSet = (v, k) => get(v, k) > 0;
  const allSet = v => kinds(v).every(k => isSet(v, k));
  const unsetKinds = v => kinds(v).filter(k => !isSet(v, k));
  const stock = (v, k) => { const s = v && U.SN && U.SN.snap ? U.SN.snap[v.id] : null; return s ? s[KINDS[k].stock] : null; };
  const m3 = (v, pct) => (v && v.lng_cap && pct != null ? Math.round(v.lng_cap * pct / 100) : null);   // 艙容 % → 立方公尺
  // 一艘船目前的門檻陣列（存檔、還原用）：[殘油, 輕油, LNG]
  const vals = v => [v.thr_res, v.thr_mgo, v.thr_lng];
  const setVals = (v, a) => { if (!v || !a) return; v.thr_res = a[0]; v.thr_mgo = a[1]; if (a.length > 2 && a[2] != null) v.thr_lng = a[2]; };
  U.fuel = { KINDS, isLng, kinds, resName, label, get, set, isSet, allSet, unsetKinds, stock, m3, vals, setVals };

  // ---------------- 低庫存即時判斷（U.lowStock）：最新庫存 < 門檻 → 「最低庫存」警報（UI_ALARM.events，rule＝LSA）
  //   每次畫面更新（U.bus）都重算一次：改門檻、上傳門檻、還原、示範降低庫存，警報立即跟著變。
  //   - 每艘船、每種燃料各一筆進行中警報（fuel＝RES／MGO／LNG）；資料超過 48 小時不判斷（維持原狀態）；門檻 ≤ 0 不觸發
  //   - 產生資料時預先算好、還開著的殘油警報（舊資料）視為「殘油」那一筆，沿用原本的觸發時間；已恢復的歷史警報不動
  //   - 觸發、恢復會呼叫 U.notify.onAlarm（寄信紀錄）；頁面剛載入的第一次同步不寄信（只對齊目前狀態）
  const AL = () => window.UI_ALARM || null;
  const today = () => String((U.M && U.M.now) || '').slice(0, 10);
  const r1 = x => Math.round(x * 10) / 10;
  let booted = false;
  function judge(v) {                                                          // 回傳這艘船各燃料的判斷：{ k: { low, value, thr } }；資料過舊回傳 null
    const s = U.SN && U.SN.snap ? U.SN.snap[v.id] : null;
    if (!s || s.stale || (s.hours != null && s.hours > 48)) return null;
    const o = {};
    kinds(v).forEach(k => { const t = get(v, k), x = s[KINDS[k].stock]; o[k] = { thr: t, value: x, low: t > 0 && x != null && x < t }; });
    return o;
  }
  function openOf(vid, k) { const A = AL(); return A ? A.events.find(e => e.rule === 'LSA' && e.vid === vid && !e.end && (e.fuel || 'RES') === k) : null; }
  function sync() {
    const A = AL(); if (!A) return [];
    const silent = !booted; booted = true;
    const ch = [];
    Object.values(U.VBY).forEach(v => {
      if (v.status !== 'ACTIVE') return;
      const J = judge(v); if (!J) return;
      kinds(v).forEach(k => {
        const j = J[k], cur = openOf(v.id, k), unit = KINDS[k].unit;
        if (cur && !cur.fuel) Object.assign(cur, { fuel: k, unit });               // 舊資料的殘油警報補上燃料種類
        if (j.low && !cur) {
          const e = { rule: 'LSA', vid: v.id, start: today(), value: r1(j.value), thr: j.thr, fuel: k, unit, live: true };
          A.events.push(e); ch.push(['open', e]);
        } else if (j.low && cur) { cur.value = r1(j.value); cur.thr = j.thr; }
        else if (!j.low && cur) { cur.end = today(); cur.endValue = j.value == null ? null : r1(j.value); cur.endThr = j.thr; ch.push(['clear', cur]); }
      });
    });
    // 船舶已沒有這種燃料（例如門檻資料改了）的進行中警報不處理；只同步有判斷的燃料
    if (!silent && U.notify && U.notify.onAlarm) ch.forEach(([t, e]) => U.notify.onAlarm(t, e));
    return ch;
  }
  // 一艘船目前低於門檻的燃料（給單船頁、清單顯示）
  const lowOf = vid => { const A = AL(); return A ? A.events.filter(e => e.rule === 'LSA' && e.vid === vid && !e.end) : []; };
  const fuelText = e => { const v = U.VBY[e.vid], k = e.fuel || 'RES'; return `${KINDS[k].name} ${e.value}${k === 'LNG' ? '%' : ' 噸'}（門檻 ${e.thr}${k === 'LNG' ? '%' : ' 噸'}）`; };
  U.lowStock = { sync, judge, lowOf, fuelText };
  if (U.bus) U.bus.on(sync);
})();
