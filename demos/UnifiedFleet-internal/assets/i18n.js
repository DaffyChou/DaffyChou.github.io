/* 英文介面（ui-english）：翻譯「介面骨架」（選單、標題、表頭、按鈕、狀態標籤、系統管理頁等），說明文字與圖表內文維持中文。
   做法：渲染後替換。英文模式下用 MutationObserver 看整頁的變動，把文字節點與 title／placeholder／aria-label 依字典翻成英文：
   - exact：整段文字（去掉前後空白）完全等於字典的詞才換（最安全，絕大多數介面文字走這條）
   - patterns：帶數字的固定句型（例如「信件（91 / 91 封）」），正規式替換
   - terms：只在 TERM_ZONES（燈號、方向標題等組合字串）裡做「詞替換」，長詞優先
   不翻的區域（EXCL）：卡片說明、風險判讀展開、AI 分析內文、信件內文、名詞小幫手、地圖彈出框；英文模式下在說明區塊上方加一行「Details in Chinese」。
   切換語言＝記住選擇（localStorage uf_lang）＋網址 lang=en，然後重新載入整頁（回到中文一定完整還原）。
   字典在 data/i18n_en.js（window.UI_I18N_EN），由 build/i18n_extract.py 擷取待翻詞、人工翻譯。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  const KEY = 'uf_lang';
  const hashLang = () => { const m = /[#&]lang=(en|zh)\b/.exec(location.hash); return m ? m[1] : null; };
  let lang = hashLang();
  if (!lang) { try { lang = localStorage.getItem(KEY) || 'zh'; } catch (e) { lang = 'zh'; } }
  if (lang !== 'en') lang = 'zh';
  try { localStorage.setItem(KEY, lang); } catch (e) { }
  U.lang = lang;
  if (document.documentElement) document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';

  const D = window.UI_I18N_EN || { exact: {}, terms: {}, patterns: [] };
  const EX = D.exact || {};
  const PAT = (D.patterns || []).map(([re, to]) => [new RegExp('^' + re + '$'), to]);
  const TERMS = Object.keys(D.terms || {}).sort((a, b) => b.length - a.length).map(k => [k, D.terms[k]]);
  const CJK = /[㐀-鿿豈-﫿]/;
  const EXCL = '.cex, .rd, .pqx, .aibox .aiw, .mai .aiw, .mbody p, #glossBox .gb, .leaflet-popup-content .note, [data-todo] .note, .sovface .note, .langbtn, script, style, textarea';
  const TERM_ZONES = '.lampchip, .svdh, .lvbtn, .rs .lvt, .ovlv, .evchip, .kpi .k, .pk > .note:first-child, .bt, .crumb, .admbar h4, .tabs [role=tab], .nt, .ns, th, .evrow, .evh, details.rcp > summary, .mhead dd';

  // 一段文字 → 英文（沒有對應就回傳 null）
  function tr(s, termsOk) {
    const t = s.trim(); if (!t || !CJK.test(t)) return null;
    if (EX[t] != null) return s.replace(t, EX[t]);
    for (const [re, to] of PAT) if (re.test(t)) return s.replace(t, t.replace(re, to));
    if (termsOk) { let o = t, hit = false; for (const [k, v] of TERMS) if (o.includes(k)) { o = o.split(k).join(v); hit = true; } if (hit && !CJK.test(o)) return s.replace(t, o); }   // 詞替換後還有中文就不換（避免中英夾雜）
    return null;
  }
  U.t = s => (lang === 'en' ? (tr(String(s), true) || String(s)) : String(s));

  const ATTR = ['title', 'placeholder', 'aria-label'];
  function doEl(el) {
    if (el.closest && el.closest(EXCL)) return;
    ATTR.forEach(a => { const v = el.getAttribute && el.getAttribute(a); if (v && CJK.test(v)) { const x = tr(v, false); if (x != null) el.setAttribute(a, x); } });
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && CJK.test(el.value)) { const x = tr(el.value, false); if (x != null) el.value = x; }
  }
  function doText(n) {
    const p = n.parentElement; if (!p || p.closest(EXCL)) return;
    const v = n.nodeValue; if (!v || !CJK.test(v)) return;
    const x = tr(v, !!p.closest(TERM_ZONES)); if (x != null && x !== v) n.nodeValue = x;
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  // 說明區塊加「Details in Chinese」（只加一次）
  function hint(root) {
    (root.querySelectorAll ? root.querySelectorAll('.cex, .pqx, .rd, details.aibox .aiw, .mbody') : []).forEach(b => {
      if (b.previousElementSibling && b.previousElementSibling.classList && b.previousElementSibling.classList.contains('i18nh')) return;
      if (b.querySelector(':scope > .i18nh')) return;
      const h = document.createElement('div'); h.className = 'i18nh note'; h.textContent = 'Details in Chinese';
      b.insertBefore(h, b.firstChild);
    });
    // 系統管理各頁、通知紀錄的頁首說明段落：提示放在段落前面（段落本身不翻）
    (root.querySelectorAll ? root.querySelectorAll('.admhead > h3 + p.note') : []).forEach(p => {
      if (p.previousElementSibling && p.previousElementSibling.classList.contains('i18nh')) return;
      const h = document.createElement('div'); h.className = 'i18nh note'; h.textContent = 'Details in Chinese';
      p.parentNode.insertBefore(h, p);
    });
  }
  let busy = false;
  function run(nodes) {
    if (busy) return; busy = true;
    try { nodes.forEach(n => { walk(n); if (n.nodeType === 1) hint(n); }); if (document.title && CJK.test(document.title)) { const x = tr(document.title, false); if (x) document.title = x; } }
    finally { busy = false; }
  }
  if (lang === 'en' && typeof MutationObserver !== 'undefined' && document.body) {
    const mo = new MutationObserver(ms => {
      const set = new Set();
      ms.forEach(m => { if (m.type === 'characterData') set.add(m.target); else if (m.type === 'attributes') set.add(m.target); else m.addedNodes.forEach(x => set.add(x)); });
      mo.disconnect(); run([...set]); obs();
    });
    const obs = () => mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
    run([document.body]); obs();
    U.i18nRun = () => { mo.disconnect(); run([document.body]); obs(); };
  }

  // 切換：記住選擇、改網址，重新載入整頁
  function setLang(l) {
    try { localStorage.setItem(KEY, l); } catch (e) { }
    let h = location.hash.replace(/([#&])lang=(en|zh)\b&?/, '$1').replace(/&$/, '');
    if (l === 'en') h = (h && h !== '#' ? h + '&' : '#') + 'lang=en';
    if (h === '#') h = '';
    history.replaceState(null, '', location.pathname + location.search + h);
    location.reload();
  }
  function bindBtn(b) { if (!b || b.dataset.lb) return; b.dataset.lb = '1'; b.textContent = lang === 'en' ? '中' : 'EN'; b.title = lang === 'en' ? '切換成中文' : 'Switch to English'; b.setAttribute('aria-label', b.title); b.onclick = () => setLang(lang === 'en' ? 'zh' : 'en'); }
  bindBtn(document.getElementById('langBtn'));
  U.i18n = { lang, set: setLang, tr: s => tr(s, true), bindBtn, CJK, EXCL };
})();
