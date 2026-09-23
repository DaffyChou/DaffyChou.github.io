/* 中秋活動共用工具：選取、localStorage、跳脫、動畫、確認對話框
   需搭配頁面內的 #confirmBox / #confirmMsg / #confirmYes / #confirmNo 使用 */

const $ = (s) => document.querySelector(s);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function load(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pop(el) { if (reduceMotion) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

function askConfirm(msg, okText) {
  return new Promise((resolve) => {
    const box = document.getElementById('confirmBox');
    const yes = document.getElementById('confirmYes');
    const no = document.getElementById('confirmNo');
    document.getElementById('confirmMsg').textContent = msg;
    yes.textContent = okText || '確定';
    box.hidden = false;
    no.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    function done(v) {
      box.hidden = true; yes.onclick = null; no.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    }
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
    document.addEventListener('keydown', onKey, true);
  });
}
