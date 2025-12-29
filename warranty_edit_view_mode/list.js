(() => {
  const STORE_KEY = 'demo_maintenance_records_v1';

  // 這份資料結構對齊你 view.js / view.html data-bind 用法（例如 warrantyRep / notifyDate / shipName / yard.planFix 等）:contentReference[oaicite:1]{index=1}
  const seed = [
    {
      id: 'AS669335459',
      warrantyRep: '海軍艦艇',
      notifyDate: '2025/12/26',
      shipName: '玉山艦',
      unit: '工務部',
      handler: { name: '李承辦' },
      yard: { no: 'AS669335459', resp: '非保固工程', planFix: '2026/01/02' }
    },
    {
      id: 'AS669335460',
      warrantyRep: '海軍艦艇',
      notifyDate: '2025/12/20',
      shipName: '磐石艦',
      unit: '工務部',
      handler: { name: '張承辦' },
      yard: { no: 'AS669335460', resp: '保固工程', planFix: '2025/12/28' }
    },
    {
      id: 'AS669335461',
      warrantyRep: '海軍艦艇',
      notifyDate: '2025/12/18',
      shipName: '成功艦',
      unit: '維修部',
      handler: { name: '陳承辦' },
      yard: { no: 'AS669335461', resp: '非保固工程', planFix: '2026/01/05' }
    }
  ];

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

  const getRows = () => {
    const rows = loadRows();
    if (rows && rows.length) return rows;
    saveRows(seed);
    return seed;
  };

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));

  // 轉成 DataTables 需要的 flat row（也可以直接用 columns.data function）
  const toTableRow = (r, idx) => ({
    rowNo: idx + 1,
    yardNo: r.yard?.no ?? r.id,
    notifyDate: r.notifyDate ?? '',
    warrantyRep: r.warrantyRep ?? '',
    shipName: r.shipName ?? '',
    yardResp: r.yard?.resp ?? '',
    unit: r.unit ?? '',
    handlerName: r.handler?.name ?? '',
    planFix: r.yard?.planFix ?? '',
    _id: r.id
  });

  const rows = getRows().map(toTableRow);

  const table = $('#recordsTable').DataTable({
    data: rows,
    deferRender: true,
    pageLength: 5,
    lengthMenu: [5, 10, 25, 50],
    order: [[2, 'desc']], // 通知時間
    language: {
      search: '關鍵字搜尋：',
      lengthMenu: '每頁顯示 _MENU_ 筆',
      info: '顯示第 _START_ 到第 _END_ 筆，共 _TOTAL_ 筆',
      infoEmpty: '無資料',
      zeroRecords: '查無符合條件資料',
      paginate: { previous: 'Previous', next: 'Next' }
    },
    columns: [
      { data: 'rowNo', width: '56px' },
      { data: 'yardNo' },
      { data: 'notifyDate' },
      { data: 'warrantyRep' },
      { data: 'shipName' },
      {
        data: 'yardResp',
        render: (val) => {
          const isWarranty = val === '保固工程';
          const cls = isWarranty ? 'text-bg-success' : 'text-bg-secondary';
          return `<span class="badge ${cls}">${esc(val)}</span>`;
        }
      },
      { data: 'unit' },
      { data: 'handlerName' },
      { data: 'planFix' },
      {
        data: '_id',
        orderable: false,
        searchable: false,
        render: (id) => `
          <div class="d-flex gap-1 flex-wrap">
            <a class="btn btn-outline-primary btn-sm" href="./view.html?id=${encodeURIComponent(id)}">
              <i class="bi bi-eye"></i>
            </a>
            <a class="btn btn-primary btn-sm" href="./edit.html?id=${encodeURIComponent(id)}">
              <i class="bi bi-pencil-square"></i>
            </a>
            <button class="btn btn-outline-danger btn-sm js-del" data-id="${esc(id)}">
              <i class="bi bi-trash"></i>
            </button>
          </div>`
      }
    ]
  });

  // 刪除（demo：刪 localStorage + 重新載入 table）
  $('#recordsTable tbody').on('click', 'button.js-del', function () {
    const id = $(this).data('id');
    if (!confirm(`確認刪除 ${id}？（demo 版僅刪除本機資料）`)) return;

    const raw = getRows().filter(r => String(r.id) !== String(id));
    saveRows(raw);

    const newRows = raw.map(toTableRow);
    table.clear().rows.add(newRows).draw();
  });
})();
