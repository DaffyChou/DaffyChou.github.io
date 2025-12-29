(() => {
  const STORE_KEY = 'demo_maintenance_records_v1';

  const getParam = (k) => {
    try { return new URLSearchParams(location.search).get(k); } catch { return null; }
  };

  const deepGet = (obj, path) =>
    path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : ''), obj);

  const deepSet = (obj, path, value) => {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
      cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
  };

  const loadRows = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const rows = JSON.parse(raw);
      return Array.isArray(rows) ? rows : null;
    } catch {
      return null;
    }
  };

  const saveRows = (rows) => {
    localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  };

  const findRecordById = (id) => {
    const rows = loadRows();
    if (!rows || !rows.length) return null;
    return rows.find(r => String(r.id) === String(id)) || null;
  };

  // fallback = view.js demo data (same shape)
  const demoData = {
    id: 'DEMO',
    warrantyRep: "海軍艦艇",
    notifyDate: "2025/12/26",
    shipName: "玉山艦",
    warrantyDate: "2026/01/22",
    location: "805台灣海軍基地上竹77號",
    unit: "工務部",
    manager: "陳主管",
    handler: { name: "李承辦", phone: "02-12345678", fax: "02-87654321", mobile: "0912-345-678", email: "handler@example.com" },
    warrantyItems: "<ul><li>主機啟動異常</li><li>電源訊號不穩定</li><li>回傳測試</li></ul>",
    attachments: [
      { fileName: "IMG_1203.jpg", desc: "現場照片" },
      { fileName: "test_log.pdf", desc: "初測結果" }
    ],
    note: "請於 48 小時內安排檢查。",
    yard: {
      no: "W-20251226-001",
      recvDate: "2025/12/26",
      yardShipNo: "JSS-8899",
      resp: "非保固工程",
      planFix: "2026/01/02",
      startFix: "2026/01/02",
      actualFix: "2026/01/30",
      workDays: "25 日",
      manpower: "10 人",
      process: "<p>已完成初步排程與故障定位，待零件到料後進行更換。</p>"
    },
    parts: [
      { name: "溫度感測頭", spec: "PT100", qty: 1, source: ["庫房"], memo: "" },
      { name: "訊號線", spec: "Cat.7 / 5m", qty: 2, source: ["請購"], memo: "需耐鹽霧" }
    ],
    test: { result: "已完成", note: "<p>現地檢測已通過；建議維持 4 小時觀察。</p>" }
  };

  const bindForm = (data) => {
    document.querySelectorAll('[data-field]').forEach((el) => {
      const path = el.getAttribute('data-field');
      if (!path) return;

      // radio group
      if (el.type === 'radio') {
        const v = deepGet(data, path);
        el.checked = String(el.value) === String(v);
        return;
      }

      // checkbox single
      if (el.type === 'checkbox') {
        el.checked = Boolean(deepGet(data, path));
        return;
      }

      // normal input/textarea
      const v = deepGet(data, path);
      el.value = v ?? '';

      // ship combo: trigger filter UI refresh
      if (el.classList.contains('shipCombo__input')) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Quill initial HTML (app.js already created editors)
    const setQuillHtml = (editorId, hiddenId, html) => {
      const el = document.getElementById(editorId);
      const hidden = document.getElementById(hiddenId);
      const q = el && el.__quill;
      if (q) {
        q.root.innerHTML = html || '';
      }
      if (hidden) hidden.value = html || '';
    };

    setQuillHtml('q_warranty', 'q_warranty_val', data.warrantyItems || '');
    setQuillHtml('q_process', 'q_process_val', data?.yard?.process || '');
    // if you later add test note editor, wire it here.

    // Attachments (file input cannot be preset by browser)
    const attachList = document.getElementById('attachList');
    if (attachList) {
      attachList.innerHTML = '';
      const items = Array.isArray(data.attachments) ? data.attachments : [];
      const mk = (idx, a) => {
        const wrap = document.createElement('div');
        wrap.className = 'attachItem attachItem--bs';
        wrap.innerHTML = `
          <div class="attachItem__file">
            <div class="text-muted small">既有檔名：<span class="js-existing-name"></span>（若需更新，請重新選檔）</div>
            <input id="attFile_${idx}" type="file" class="form-control form-control-sm" />
          </div>
          <div class="attachItem__desc">
            <label for="attDesc_${idx}" class="text-muted">說明</label>
            <input id="attDesc_${idx}" class="form-control form-control-sm" type="text" placeholder="例：現場照片 / 測試紀錄 / 其他" />
          </div>
          <div class="attachItem__act">
            <button class="btn btn-outline-danger btn-sm js-remove-attach" type="button">刪除</button>
          </div>
        `;
        wrap.querySelector('.js-existing-name').textContent = a?.fileName || '-';
        wrap.dataset.existingFileName = a?.fileName || '';
        const desc = wrap.querySelector(`#attDesc_${idx}`);
        if (desc) desc.value = a?.desc || '';
        return wrap;
      };
      if (!items.length) {
        // keep one blank row (app.js behavior)
        const blank = mk(0, { fileName: '-', desc: '' });
        blank.dataset.existingFileName = '';
        attachList.appendChild(blank);
      } else {
        items.forEach((a, i) => attachList.appendChild(mk(i, a)));
      }
    }

    // Parts table
    const partsBody = document.getElementById('partsBody');
    if (partsBody) {
      partsBody.innerHTML = '';
      const rows = Array.isArray(data.parts) ? data.parts : [];
      const mkRow = (r) => {
        const tr = document.createElement('tr');
        const src = Array.isArray(r?.source) ? r.source : [];
        const hasStore = src.includes('庫房');
        const hasReq = src.includes('請購');
        tr.innerHTML = `
          <td data-label="品名"><input class="input input--sm" type="text" value="${escapeAttr(r?.name ?? '')}" /></td>
          <td data-label="規格"><input class="input input--sm" type="text" value="${escapeAttr(r?.spec ?? '')}" /></td>
          <td data-label="數量"><input class="input input--sm" type="number" min="0" value="${escapeAttr(String(r?.qty ?? ''))}" /></td>
          <td data-label="物料來源">
            <div class="checks checks--inline">
              <label class="check"><input type="checkbox" ${hasStore ? 'checked' : ''} /> 庫房</label>
              <label class="check"><input type="checkbox" ${hasReq ? 'checked' : ''} /> 請購</label>
            </div>
          </td>
          <td data-label="備註"><input class="input input--sm" type="text" value="${escapeAttr(r?.memo ?? '')}" /></td>
          <td class="rowActions" data-label="操作">
            <button class="btn btn-outline-danger btn-sm js-remove-row" type="button" title="刪除此列">刪除</button>
          </td>
        `;
        return tr;
      };

      if (!rows.length) {
        // keep at least one empty row so user can edit
        partsBody.appendChild(mkRow({ name:'', spec:'', qty:'', source:[], memo:'' }));
      } else {
        rows.forEach(r => partsBody.appendChild(mkRow(r)));
      }
    }

    // Dates: if flatpickr exists, set date for those inputs
    document.querySelectorAll('input[data-role="date-single"][data-field]').forEach((el) => {
      const path = el.getAttribute('data-field');
      const v = deepGet(data, path);
      // flatpickr instance is on el._flatpickr
      if (el._flatpickr && v) {
        try { el._flatpickr.setDate(v, true, 'Y/m/d'); } catch {}
      } else if (v) {
        el.value = v;
      }
    });
  };

  const collectForm = () => {
    const out = {};
    // data-field (text/textarea + radio)
    document.querySelectorAll('[data-field]').forEach((el) => {
      const path = el.getAttribute('data-field');
      if (!path) return;

      if (el.type === 'radio') {
        if (el.checked) deepSet(out, path, el.value);
        return;
      }
      if (el.type === 'checkbox') {
        deepSet(out, path, el.checked);
        return;
      }
      deepSet(out, path, el.value);
    });

    // quill (use hidden inputs maintained by app.js)
    const w = document.getElementById('q_warranty_val')?.value ?? '';
    if (w) out.warrantyItems = w;

    const p = document.getElementById('q_process_val')?.value ?? '';
    if (!out.yard) out.yard = {};
    if (p) out.yard.process = p;

    // attachments: keep existingFileName unless user re-selected
    const attachList = document.getElementById('attachList');
    if (attachList) {
      const items = [];
      attachList.querySelectorAll('.attachItem').forEach((item) => {
        const fileEl = item.querySelector('input[type="file"]');
        const descEl = item.querySelector('input[type="text"]');
        const picked = fileEl?.files && fileEl.files.length ? fileEl.files[0].name : '';
        const existing = item.dataset.existingFileName || '';
        const fileName = picked || existing || '';
        const desc = descEl?.value || '';
        if (fileName || desc) items.push({ fileName, desc });
      });
      out.attachments = items;
    }

    // parts
    const partsBody = document.getElementById('partsBody');
    if (partsBody) {
      const parts = [];
      partsBody.querySelectorAll('tr').forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;

        const name = tds[0].querySelector('input')?.value || '';
        const spec = tds[1].querySelector('input')?.value || '';
        const qtyRaw = tds[2].querySelector('input')?.value;
        const qty = qtyRaw === '' || qtyRaw === null ? '' : Number(qtyRaw);
        const cbs = tds[3].querySelectorAll('input[type="checkbox"]');
        const source = [];
        if (cbs[0]?.checked) source.push('庫房');
        if (cbs[1]?.checked) source.push('請購');
        const memo = tds[4].querySelector('input')?.value || '';

        // ignore fully empty rows
        if (!name && !spec && (qty === '' || Number.isNaN(qty)) && !source.length && !memo) return;

        parts.push({ name, spec, qty: qty === '' ? '' : qty, source, memo });
      });
      out.parts = parts;
    }

    return out;
  };

  const upsertRecord = (id, payload) => {
    const rows = loadRows() || [];
    const idx = rows.findIndex(r => String(r.id) === String(id));
    const merged = { ...(idx >= 0 ? rows[idx] : {}), id, ...payload };

    if (idx >= 0) rows[idx] = merged;
    else rows.unshift(merged);

    saveRows(rows);
    return merged;
  };

  // tiny helpers for safe attribute injection
  function escapeAttr(s){
    return String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const id = getParam('id') || demoData.id;
    const data = findRecordById(id) || window.__WARRANTY_DATA__ || { ...demoData, id };

    // set "Back to view" link
    const btnGoView = document.getElementById('btnGoView');
    if (btnGoView) btnGoView.href = `./view.html?id=${encodeURIComponent(id)}`;

    // wait until app.js initializes flatpickr/quill then bind
    const start = Date.now();
    const tick = () => {
      const qReady = !!document.getElementById('q_warranty')?.__quill && !!document.getElementById('q_process')?.__quill;
      const fpReady = [...document.querySelectorAll('input[data-role="date-single"]')].every(el => !!el._flatpickr || el.value !== undefined);
      if (qReady && fpReady) {
        bindForm(data);
        return;
      }
      if (Date.now() - start > 1500) {
        // best-effort bind even if editors not ready
        bindForm(data);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();

    // Save
    const saveBtn = document.querySelector('.panel__headActions .btn.btn-primary');
    saveBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      const payload = collectForm();
      const saved = upsertRecord(id, payload);

      // navigate to view
      location.href = `./view.html?id=${encodeURIComponent(saved.id)}`;
    });
  });
})();

function initQuillWithValue(editorId, hiddenId, html) {
  const el = document.getElementById(editorId);
  const hidden = document.getElementById(hiddenId);
  if (!el || !hidden) return null;

  const q = new Quill(el, {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }]
      ]
    }
  });

  // ⭐ 關鍵：帶入既有 HTML
  if (html) {
    q.root.innerHTML = html;
    hidden.value = html;
  }

  // 編輯時同步回 hidden
  q.on('text-change', () => {
    hidden.value = q.root.innerHTML;
  });

  return q;
}
initQuillWithValue(
  'q_warranty',
  'q_warranty_val',
  data.warrantyItems
);
