(() => {
  const sidebar = document.getElementById('sidebar');
  const btnMenu = document.getElementById('btnMenu');

  btnMenu?.addEventListener('click', () => {
    sidebar?.classList.toggle('is-collapsed');
  });

  document.querySelectorAll('[data-toggle="group"]').forEach((chev) => {
    chev.addEventListener('click', (e) => {
      const head = e.currentTarget.closest('.tree__sectionHead');
      const section = head?.parentElement;
      const list = section?.querySelector('.tree__list');
      if (!list) return;

      const collapsed = list.classList.toggle('tree__list--collapsed');
      e.currentTarget.textContent = collapsed ? '▸' : '▾';
    });
  });

  // parts table: add row
  const addRow = document.getElementById('addRow');
  const body = document.getElementById('partsBody');

  addRow?.addEventListener('click', () => {
    if (!body) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="品名"><input class="input input--sm" type="text" /></td>
      <td data-label="規格"><input class="input input--sm" type="text" /></td>
      <td data-label="數量"><input class="input input--sm" type="number" min="0" /></td>
      <td data-label="物料來源">
        <div class="checks checks--inline">
          <label class="check"><input type="checkbox" /> 庫房</label>
          <label class="check"><input type="checkbox" /> 請購</label>
        </div>
      </td>
      <td data-label="備註"><input class="input input--sm" type="text" /></td>
      <td class="rowActions" data-label="操作">
        <button class="btn btn-outline-danger btn-sm js-remove-row" type="button" title="刪除此列">刪除</button>
      </td>
    `;
    body.appendChild(tr);
  });

  // Row delete (delegation)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-remove-row');
    if (!btn) return;
    const tr = btn.closest('tr');
    if (!tr) return;

    if (confirm('確定要刪除此列配件嗎？')) tr.remove();
  });

  // Print A4
  const btnPrint = document.getElementById('btnPrint');
  btnPrint?.addEventListener('click', () => window.print());

  // Attachments repeater
  const attachList = document.getElementById('attachList');
  const addAttach = document.getElementById('addAttach');

  const mkAttachItem = (idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'attachItem attachItem--bs';
    wrap.innerHTML = `
  <div class="attachItem__file">
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

const file
 = wrap.querySelector(`#attFile_${idx}`);
    const name = wrap.querySelector(`#attName_${idx}`);
    file?.addEventListener('change', () => {
      const n = file.files && file.files.length ? file.files[0].name : '未選擇任何檔案';
      if (name) name.textContent = n;
    });

    return wrap;
  };

  let attSeq = 0;
  const addOneAttach = () => {
    if (!attachList) return;
    const item = mkAttachItem(attSeq++);
    attachList.appendChild(item);
  };

  addAttach?.addEventListener('click', addOneAttach);

  // default one row
  if (attachList && attachList.children.length === 0) addOneAttach();

  // delete attachment (delegation)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-remove-attach');
    if (!btn) return;
    const item = btn.closest('.attachItem');
    if (item) item.remove();
  });

  // Date picker (single date; YYYY/MM/DD)
document.querySelectorAll('[data-role="date-single"]').forEach((el) => {
  try{
    flatpickr(el, { dateFormat:'Y/m/d', allowInput:true });
  }catch(e){}
});

 // Calendar icon: click to focus/open
document.addEventListener('click', (e) => {
  const icon = e.target.closest('.date-icon');
  if(!icon) return;
  const group = icon.closest('.date-input-wrapper');
  const input = group?.querySelector('input[data-role="date-single"]');
  input?.focus();
  input?.click();
});


  // --- Ship Name Combo (Search + Dropdown, fallback to free typing) ---
  const SHIP_OPTIONS = window.SHIP_OPTIONS || [
    "玉山艦", "磐石艦", "沱江艦", "成功級", "康定級", "錦江級"
  ];

  function initShipCombos() {
    document.querySelectorAll('[data-ship-combo]').forEach((root) => {
      const input = root.querySelector('.shipCombo__input');
      const btn = root.querySelector('.shipCombo__btn');
      const menu = root.querySelector('.shipCombo__menu');
      const empty = root.querySelector('.shipCombo__empty');

      if (!input || !btn || !menu || !empty) return;

      const options = Array.isArray(SHIP_OPTIONS) ? SHIP_OPTIONS.filter(Boolean) : [];
      if (options.length === 0) {
        // no list -> pure input
        btn.style.display = 'none';
        menu.style.display = 'none';
        empty.hidden = true;
        input.placeholder = '請直接填寫（無可選清單）';
        return;
      }

      function close() { root.classList.remove('is-open'); }
      function open() { root.classList.add('is-open'); }

      function render(list, selectedValue) {
        menu.innerHTML = '';
        list.forEach((name) => {
          const item = document.createElement('div');
          item.className = 'shipCombo__item';
          item.setAttribute('role', 'option');
          item.textContent = name;
          item.setAttribute('aria-selected', String(name === selectedValue));
          item.addEventListener('mousedown', (e) => {
            // mousedown to avoid blur before click
            e.preventDefault();
            input.value = name;
            close();
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
          menu.appendChild(item);
        });
        empty.hidden = list.length !== 0;
      }

      function filter() {
        const q = (input.value || '').trim().toLowerCase();
        const list = q
          ? options.filter((x) => String(x).toLowerCase().includes(q))
          : options.slice(0, 30);
        render(list, input.value);
        open(); // keep open to show empty hint if needed
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (root.classList.contains('is-open')) close();
        else {
          filter();
          input.focus();
        }
      });

      input.addEventListener('focus', () => filter());
      input.addEventListener('input', () => filter());
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

      document.addEventListener('click', (e) => { if (!root.contains(e.target)) close(); });

      // initial
      render(options.slice(0, 30), input.value);
    });
  }

  initShipCombos();

  // Quill editors
  const quillCfg = { theme:'snow', modules:{ toolbar:[['bold','italic','underline'],[{list:'ordered'},{list:'bullet'}]] } };
  const bindQuill = (id, hiddenId) => {
    const el = document.getElementById(id);
    const hidden = document.getElementById(hiddenId);
    if(!el || !hidden) return;
    const q = new Quill(el, quillCfg);
    q.on('text-change', () => { hidden.value = q.root.innerHTML; });
  };
  bindQuill('q_warranty','q_warranty_val');
  bindQuill('q_process','q_process_val');
  bindQuill('q_testnote','q_testnote_val');

  // Signature helpers (supports components you add with .sigBox markup)
  const setupSigBox = (box) => {
    const canvas = box.querySelector('canvas.sigCanvas');
    const hidden = box.querySelector('input.sigValue');
    const preview = box.querySelector('.sigPreview');
    const clearBtn = box.querySelector('.sig-clear');
    const saveBtn = box.querySelector('.sig-save');
    const fileInput = box.querySelector('.sig-file');
    const saveUpload = box.querySelector('.sig-save-upload');
    const nameInput = box.querySelector('.sig-name');
    const genBtn = box.querySelector('.sig-gen');

    // Canvas drawing
    const ctx = canvas?.getContext('2d');
    let drawing = false;
    let last = null;

    const resize = () => {
      if(!canvas || !ctx) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.setTransform(ratio,0,0,ratio,0,0);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111827';
    };
    resize();
    window.addEventListener('resize', resize);

    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const start = (e) => { if(!canvas||!ctx) return; drawing = true; last = pos(e); e.preventDefault(); };
    const move = (e) => {
      if(!drawing || !canvas || !ctx) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      e.preventDefault();
    };
    const end = () => { drawing = false; last = null; };

    canvas?.addEventListener('mousedown', start);
    canvas?.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas?.addEventListener('touchstart', start, {passive:false});
    canvas?.addEventListener('touchmove', move, {passive:false});
    window.addEventListener('touchend', end);

    clearBtn?.addEventListener('click', () => { if(ctx && canvas){ ctx.clearRect(0,0,canvas.width,canvas.height); } });

    const setPreview = (dataUrl) => {
      if(!preview) return;
      preview.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="signature">` : '';
    };

    saveBtn?.addEventListener('click', () => {
      if(!canvas || !hidden) return;
      const dataUrl = canvas.toDataURL('image/png');
      hidden.value = dataUrl;
      setPreview(dataUrl);
    });

    // Upload signature
    saveUpload?.addEventListener('click', () => {
      if(!fileInput || !hidden) return;
      const f = fileInput.files && fileInput.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        hidden.value = reader.result;
        setPreview(reader.result);
      };
      reader.readAsDataURL(f);
    });

    // Typed name (generate simple image via canvas)
    genBtn?.addEventListener('click', () => {
      const name = nameInput?.value?.trim();
      if(!name || !hidden) return;
      const c = document.createElement('canvas');
      c.width = 800; c.height = 250;
      const cctx = c.getContext('2d');
      cctx.fillStyle = '#fff'; cctx.fillRect(0,0,c.width,c.height);
      cctx.fillStyle = '#111827';
      cctx.font = '64px serif';
      cctx.fillText(name, 40, 150);
      const dataUrl = c.toDataURL('image/png');
      hidden.value = dataUrl;
      setPreview(dataUrl);
    });
  };

  document.querySelectorAll('.sigBox').forEach(setupSigBox);


  // Paper return attachments (scan/photo): repeater with desc + version + timestamp
  const paperList = document.getElementById('paperList');
  const addPaper = document.getElementById('addPaper');

  const nowStamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const mkPaperItem = (idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'paperItem';
    wrap.innerHTML = `
      <div class="paperItem__file">
        <input id="paperFile_${idx}" type="file" accept="image/*,.pdf" class="form-control form-control-sm" />
      </div>

      <div class="paperItem__desc">
        <label for="paperDesc_${idx}" class="text-muted">說明</label>
        <input id="paperDesc_${idx}" class="form-control form-control-sm" type="text" placeholder="簽章說明" />
      </div>

      <div class="paperItem__meta">
        <label for="paperVer_${idx}" class="text-muted">版本</label>
        <input id="paperVer_${idx}" class="form-control form-control-sm" type="text" value="v1" />
      </div>

      <div class="paperItem__ts">
        <div class="text-muted">時間戳</div>
        <div id="paperTs_${idx}">-</div>
      </div>

      <div class="paperItem__act">
        <button class="btn btn-outline-danger btn-sm js-remove-paper" type="button">刪除</button>
      </div>
    `;

    const file = wrap.querySelector(`#paperFile_${idx}`);
    const name = wrap.querySelector(`#paperName_${idx}`);
    const ts = wrap.querySelector(`#paperTs_${idx}`);

    file?.addEventListener('change', () => {
      const n = file.files && file.files.length ? file.files[0].name : '未選擇任何檔案';
      if (name) name.textContent = n;
      if (ts) ts.textContent = file.files && file.files.length ? nowStamp() : '-';
    });

    return wrap;
  };

  let paperSeq = 0;
  const addOnePaper = () => {
    if (!paperList) return;
    paperList.appendChild(mkPaperItem(paperSeq++));
  };
  addPaper?.addEventListener('click', addOnePaper);
  if (paperList && paperList.children.length === 0) addOnePaper();

  // delete paper attachment (delegation)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-remove-paper');
    if (!btn) return;
    const item = btn.closest('.paperItem');
    if (item) item.remove();
  });

})();

function get(obj, path) {
  return path.split('.').reduce(
    (acc, k) => (acc && acc[k] !== undefined ? acc[k] : ''),
    obj
  );
}

function bindForm(data) {
  document.querySelectorAll('[data-field]').forEach((el) => {
    const path = el.dataset.field;
    const value = get(data, path);

    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
    } else if (el.type === 'radio') {
      el.checked = el.value === value;
    } else {
      el.value = value ?? '';
    }
  });
}
