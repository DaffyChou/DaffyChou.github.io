/* 單卡片頁面高度補到視窗（提案 solo-card-fit）：每次畫完頁面後，若內容區目前只顯示一張卡片（排除滿版頁、被頁籤藏起來的卡片），
   就在版面網格加上 solo、卡片加上 solofit，並把卡片最小高度設成「視窗高度 − 卡片頂端位置 − 底部留白」。
   卡片本來就比視窗高時不受影響（只設最小高度）；寬度不到 960px 不套用。視窗改變、切頁籤（U.fitSolo）時重算。
   掛在 U.cmdAfter 之後執行（app.js 每次畫完頁面都會呼叫它），不改 app.js 與 command_map.js。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const GAP = 16, NARROW = 960, MINH = 240;

  function fit() {
    const main = document.getElementById('main');
    if (!main) return;
    main.querySelectorAll('.grid.solo').forEach(g => g.classList.remove('solo'));
    main.querySelectorAll('.blk.solofit').forEach(b => { b.classList.remove('solofit'); b.style.minHeight = ''; });
    main.querySelectorAll('[data-fill]').forEach(x => (x.style.maxHeight = ''));        // 單卡片時算出的捲動區高度先還原
    if (innerWidth <= NARROW || main.querySelector('.grid.cmd')) return;                 // 窄螢幕、滿版頁（空櫃地圖、營運總控台）不套用
    const shown = [...main.querySelectorAll('.grid .blk')].filter(b => b.offsetParent !== null && getComputedStyle(b).display !== 'none' && getComputedStyle(b).position !== 'absolute');
    if (shown.length !== 1) return;
    const b = shown[0], grid = b.closest('.grid');
    const top = b.getBoundingClientRect().top + scrollY, h = Math.floor(innerHeight - top - GAP);
    if (h < MINH) return;
    grid.classList.add('solo'); b.classList.add('solofit');
    b.style.minHeight = h + 'px';
    U.solo = { bid: b.id.replace(/^blk-/, ''), h };
    // 卡片內標記 data-fill 的捲動區（例如場站使用率的長條圖）：高度＝卡片底部 − 它的頂端 − 判讀列高度，超出就在裡面捲動
    const rs = b.querySelector(':scope > .rs'), cardBottom = top + h, pad = parseFloat(getComputedStyle(b).paddingBottom) || 0;
    b.querySelectorAll('[data-fill]').forEach(x => { const ft = x.getBoundingClientRect().top + scrollY, avail = Math.floor(cardBottom - ft - (rs ? rs.offsetHeight + parseFloat(getComputedStyle(rs).marginTop || 0) : 0) - pad - 8); if (avail > 120) x.style.maxHeight = avail + 'px'; });
    // 圖表容器跟著長高後，重新計算 echarts 與地圖尺寸（下一格畫面版面才確定）
    requestAnimationFrame(() => {
      b.querySelectorAll('[_echarts_instance_]').forEach(x => { const c = window.echarts && echarts.getInstanceByDom(x); if (c) c.resize(); });
      if (U.mapInv && U.lastMap) U.mapInv(U.lastMap);
    });
  }

  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(fit, 120); };
  const prev = U.cmdAfter;
  U.cmdAfter = function () { const r = prev ? prev.apply(this, arguments) : undefined; fit(); return r; };
  U.fitSolo = fit;
  addEventListener('resize', later);
})();
