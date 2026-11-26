/* 營運指揮台（滿版地圖）：點「港口運務板」「今日要處理」，左側選單就換成該面板（左欄變寬），按「← 選單」回到選單。
   港口詳情與事件詳情在地圖右邊緣停靠，一次只顯示一個。 */
(function () {
  'use strict';
  const U = window.UI;
  const PANELS = [['M13-c3', '港口運務板'], ['M15-c2', '今日要處理']];
  let cur = '', shown = '';
  U.cmdPanel = () => (document.querySelector('.grid.cmd') ? cur : '');   // 目前左欄顯示的面板（空＝沒有）
  U.cmdAfter = function () {
    const stage = document.querySelector('.grid.cmd'), layout = document.querySelector('.layout'), nav = document.getElementById('nav');
    if (!stage) { cur = ''; layout.classList.remove('navwide'); delete nav.dataset.mode; return; }
    const fit = () => { const st = document.querySelector('.grid.cmd'); if (!st) return; const pb = parseFloat(getComputedStyle(document.querySelector('.layout')).paddingBottom) || 0; st.style.height = Math.max(420, Math.floor(innerHeight - st.getBoundingClientRect().top - pb)) + 'px'; /* 扣掉版面下緣留白（單船航行地圖保留邊距） */ if (U.cmdMap && U.cmdMap.map) U.mapInv(U.cmdMap.map); };
    U.cmdFit = fit; fit(); if (!U._cmdFit) { U._cmdFit = true; addEventListener('resize', () => fit()); }
    const mf = stage.querySelector('.mapfloat'), tabs = document.createElement('span'); tabs.className = 'cmdtabs';
    const open = id => {
      if (id && id !== shown) { const b = document.getElementById('blk-' + id); if (b) { b.classList.add('enter'); setTimeout(() => b.classList.remove('enter'), 400); } }
      if (id && U.setNav && !layout.classList.contains('navc')) U.setNav(true, false);   // 開面板：左欄換成面板，選單暫時收起（三者一次一個）
      shown = id; cur = id; layout.classList.toggle('navwide', !!id); if (id) nav.dataset.mode = id; else delete nav.dataset.mode;
      tabs.querySelectorAll('button').forEach(t => { t.classList.toggle('on', t.dataset.p === id); t.setAttribute('aria-pressed', t.dataset.p === id ? 'true' : 'false'); });
      const inv = () => { if (U.cmdMap && U.cmdMap.map) U.mapInv(U.cmdMap.map, { pan: false }); };
      inv(); setTimeout(inv, 160); setTimeout(inv, 340);           // 左欄寬度有動畫，動畫中與結束後各重算一次
      { const hd = document.getElementById('navHd'); if (hd) hd.setAttribute('aria-pressed', !id && !layout.classList.contains('navc') ? 'true' : 'false'); }
    };
    U.cmdOpen = open;
    PANELS.forEach(([bid, name]) => {
      const b = document.getElementById('blk-' + bid), ch = b && b.querySelector('.ch'); if (!b || !ch) return;
      b.classList.add('cmdp'); nav.appendChild(b);
      const back = document.createElement('button'); back.type = 'button'; back.className = 'btn cmdback'; back.textContent = '← 選單'; back.onclick = () => { open(''); if (U.setNav) U.setNav(false, true); }; b.insertBefore(back, ch);
      const t = document.createElement('button'); t.type = 'button'; t.className = 'cmdtab'; t.dataset.p = bid; t.setAttribute('aria-pressed', 'false');
      const n = bid === 'M15-c2' && U.events ? U.events.stats().open : 0;
      t.innerHTML = name + (n ? ` <b>${n}</b>` : ''); t.onclick = () => open(cur === bid ? '' : bid); tabs.appendChild(t);
    });
    if (mf) mf.insertBefore(tabs, mf.querySelector('.maptools'));
    open(cur);
    if (U.events && U.events.reattach) U.events.reattach();
    if (U.cmdMap && U.cmdMap.map) setTimeout(() => U.mapInv(U.cmdMap.map), 50);
  };
})();
