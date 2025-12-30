(() => {
  const tree = {
    id: 'mag',
    label: '磁羅經系統',
    children: [
      { id: 'binnacle', label: '羅經櫃 (Binnacle)', children: [
        { id: 'helmet', label: '羅經艙防護罩 (Helmet)', children: [] }
      ]},
      { id: 'compass', label: '磁羅經 (Magnetic Compass)', children: [
        { id: 'bulb', label: '24伏特、15瓦 小型螺口燈泡 (Bulb)', children: [] }
      ]},
      { id: 'azimuth', label: '方位鏡 (Azimuth Circle)', children: [] },
      { id: 'box', label: '磁羅經盒 (Compass Box)', children: [] },
      { id: 'control', label: '燈光控制設備 (Control Unit)', children: [] }
    ]
  };

  const rows = [
    {
      path: '磁羅經系統 / 磁羅經 (Magnetic Compass) / Bulb',
      pn: 'BULB-24V-15W-01',
      nameZh: '小型螺口燈泡',
      specShort: '24V / 15W',
      location: '羅經艙',
      maker: 'SAMYUNG',
      vendor: 'A廠商',
      price: '$ 3,6000',
      life: 'C 2024/12/31',
      stockUsed: 2687, stockOk: 47313, stockTotal: 50000,
      applyDate: '2023/08/25',
      reqUnit: 'A單位',
      altPns: ['BULB-24V-15W-02', 'BULB-24V-15W-03'],
      docs: ['型錄.pdf', '保固.pdf']
    },
    {
      path: '磁羅經系統 / 羅經櫃 (Binnacle) / Helmet',
      pn: 'HELMET-01',
      nameZh: '羅經艙防護罩',
      specShort: 'Stainless / 1.2mm',
      location: '羅經艙',
      maker: 'Marine Power Inc.',
      vendor: 'A廠商',
      price: '$ 12,000',
      life: '—',
      stockUsed: 0, stockOk: 12, stockTotal: 12,
      applyDate: '2023/08/25',
      reqUnit: 'A單位',
      altPns: ['HELMET-ALT-01'],
      docs: ['安裝圖.pdf']
    },
    {
      path: '磁羅經系統 / 方位鏡 (Azimuth Circle)',
      pn: 'AZI-01',
      nameZh: '方位鏡',
      specShort: 'Ø180mm',
      location: '羅經艙',
      maker: 'AuxiEngine Co.',
      vendor: 'A廠商',
      price: '$ 8,800',
      life: 'C 2024/12/31',
      stockUsed: 1, stockOk: 2, stockTotal: 3,
      applyDate: '2023/08/25',
      reqUnit: 'A單位',
      altPns: [],
      docs: []
    }
  ];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
  const fmtInt = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    return v.toLocaleString('en-US');
  };
  const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const nodeToPathPrefix = (nodeId) => {
    const map = {
      mag: '磁羅經系統',
      binnacle: '磁羅經系統 / 羅經櫃 (Binnacle)',
      helmet: '磁羅經系統 / 羅經櫃 (Binnacle) / Helmet',
      compass: '磁羅經系統 / 磁羅經 (Magnetic Compass)',
      bulb: '磁羅經系統 / 磁羅經 (Magnetic Compass) / Bulb',
      azimuth: '磁羅經系統 / 方位鏡 (Azimuth Circle)',
      box: '磁羅經系統 / 磁羅經盒 (Compass Box)',
      control: '磁羅經系統 / 燈光控制設備 (Control Unit)'
    };
    return map[nodeId] || '磁羅經系統';
  };

  const computeKPIsByPrefix = (prefix) => {
    const matched = rows.filter(r => r.path.startsWith(prefix));
    const low = matched.filter(r => (Number(r.stockOk) || 0) <= 0).length;
    const pending = matched.filter(r => (Number(r.stockUsed) || 0) > 0).length;
    const alt = matched.reduce((acc, r) => acc + (Array.isArray(r.altPns) ? r.altPns.length : 0), 0);
    return { low, pending, alt };
  };

  const treeEl = document.getElementById('materialsTree');
  let activePathPrefix = '';

  const renderTreeNode = (node, depth=0) => {
    const isLeaf = !node.children || node.children.length === 0;
    const prefix = nodeToPathPrefix(node.id);
    const kpi = computeKPIsByPrefix(prefix);
    const hasWarn = kpi.low > 0;

    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'treeNode';
    row.dataset.pathPrefix = prefix;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'treeNode__toggle' + (isLeaf ? ' is-leaf' : '');
    toggle.innerHTML = '<i class="bi bi-chevron-down"></i>';
    row.appendChild(toggle);

    const label = document.createElement('div');
    label.className = 'treeNode__label';
    label.textContent = node.label;
    row.appendChild(label);

    const meta = document.createElement('div');
    meta.className = 'treeNode__meta';
    row.appendChild(meta);

    wrap.appendChild(row);

    if (!isLeaf){
      const children = document.createElement('div');
      children.className = 'treeChildren';
      children.hidden = depth > 0;
      node.children.forEach(ch => children.appendChild(renderTreeNode(ch, depth+1)));
      wrap.appendChild(children);

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        children.hidden = !children.hidden;
        toggle.innerHTML = children.hidden ? '<i class="bi bi-chevron-right"></i>' : '<i class="bi bi-chevron-down"></i>';
      });
    }

    row.addEventListener('click', () => {
      treeEl.querySelectorAll('.treeNode').forEach(n => n.classList.remove('is-active'));
      row.classList.add('is-active');
      activePathPrefix = prefix;
      applyAllFilters();
    });

    return wrap;
  };

  if (treeEl){
    treeEl.innerHTML = '';
    treeEl.appendChild(renderTreeNode(tree, 0));
  }

  const renderChild = (r) => {
    const alts = (r.altPns && r.altPns.length)
      ? r.altPns.map(p => `<span class="badge text-bg-light border me-1">${esc(p)}</span>`).join('')
      : '<span class="text-muted">無</span>';
    const docs = (r.docs && r.docs.length)
      ? r.docs.map(d => `<span class="badge text-bg-light border me-1"><i class="bi bi-paperclip"></i> ${esc(d)}</span>`).join('')
      : '<span class="text-muted">無</span>';

    return `
      <div class="materialsChild">
        <div class="materialsChild__row">
          <div class="materialsChild__k">庫存數量：</div>
          <div class="materialsChild__v">
            <span class="materialsChild__num materialsChild__num--bad">${fmtInt(r.stockUsed)}</span>
            <span class="materialsChild__sep">/</span>
            <span class="materialsChild__num materialsChild__num--ok">${fmtInt(r.stockOk)}</span>
            <span class="materialsChild__sep">/</span>
            <span class="materialsChild__num">${fmtInt(r.stockTotal)}</span>
            <button class="btn btn-warning btn-sm ms-3" type="button">修改庫存</button>
          </div>
        </div>
        <div class="materialsChild__row">
          <div class="materialsChild__k">申請日期：</div>
          <div class="materialsChild__v">${esc(r.applyDate || '')}</div>
        </div>
        <div class="materialsChild__row">
          <div class="materialsChild__k">接發單位：</div>
          <div class="materialsChild__v">${esc(r.reqUnit || '')}</div>
        </div>
        <div class="materialsChild__row">
          <div class="materialsChild__k">替代料：</div>
          <div class="materialsChild__v">${alts}</div>
        </div>
        <div class="materialsChild__row">
          <div class="materialsChild__k">文件：</div>
          <div class="materialsChild__v">${docs}</div>
        </div>
      </div>
    `;
  };

  let dt = null;
  dt = $('#materialsTable').DataTable({
    data: rows,
    deferRender: true,
    pageLength: 10,
    lengthMenu: [10, 25, 50],
    order: [],
    language: {
      lengthMenu: '每頁顯示 _MENU_ 筆',
      info: '顯示第 _START_ 到第 _END_ 筆，共 _TOTAL_ 筆資料',
      infoEmpty: '顯示第 0 到第 0 筆，共 0 筆資料',
      zeroRecords: '查無符合條件資料',
      paginate: { previous: 'Previous', next: 'Next' }
    },
    columns: [
      { data: null, className:'dt-control', orderable:false, searchable:false,
        render: () => `<button class="materialsToggle is-plus" type="button" aria-label="展開"><span class="materialsToggle__dot">+</span></button>` },
      { data: 'path' },
      { data: 'pn' },
      { data: 'nameZh' },
      { data: 'specShort' },
      { data: 'location' },
      { data: 'maker' },
      { data: 'vendor' },
      { data: 'price' },
      { data: 'life' }
    ],
    drawCallback: function(){
      const api = this.api();
      const info = api.page.info();
      const text = info.recordsDisplay
        ? `顯示第 ${info.start+1} 到第 ${info.end} 筆，共 ${info.recordsDisplay} 筆資料`
        : '顯示第 0 到第 0 筆，共 0 筆資料';
      const el = document.getElementById('materialsFootInfo');
      if (el) el.textContent = text;
    }
  });

  $('#materialsTable tbody').on('click', 'td.dt-control button.materialsToggle', function(){
    const $btn = $(this);
    const tr = $btn.closest('tr');
    const row = dt.row(tr);
    if (row.child.isShown()){
      row.child.hide();
      $btn.removeClass('is-minus').addClass('is-plus').find('.materialsToggle__dot').text('+');
    } else {
      row.child(renderChild(row.data()), 'materialsChildRow').show();
      $btn.removeClass('is-plus').addClass('is-minus').find('.materialsToggle__dot').text('−');
    }
  });

  const applyAllFilters = () => {
    const cat = (document.getElementById('fCategory')?.value || '').trim();
    const loc = (document.getElementById('fLocation')?.value || '').trim();
    const kw  = (document.getElementById('fKeyword')?.value || '').trim();

    dt.columns().search('');
    dt.search('');

    if (cat) dt.column(1).search(escapeRegExp(cat), true, false);
    if (loc) dt.column(5).search('^' + escapeRegExp(loc) + '$', true, false);
    if (kw) dt.search(kw);

    if (activePathPrefix){
      dt.column(1).search('^' + escapeRegExp(activePathPrefix), true, false);
    }
    dt.draw();
  };

  document.getElementById('btnSearch')?.addEventListener('click', applyAllFilters);
  document.getElementById('btnClear')?.addEventListener('click', () => {
    const c=document.getElementById('fCategory'); const l=document.getElementById('fLocation'); const k=document.getElementById('fKeyword');
    if(c) c.value=''; if(l) l.value=''; if(k) k.value='';
    applyAllFilters();
  });
  document.getElementById('fKeyword')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') applyAllFilters(); });

  // default select root
  if (treeEl){
    const root = treeEl.querySelector('.treeNode');
    if (root) root.click();
  }
})();