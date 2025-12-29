(() => {
  // Sample data for demo (replace with your API payload later)
  const data = window.__WARRANTY_DATA__ || {
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
    test: { result: "已完成", note: "<p>現地檢測已通過；建議維持 4 小時觀察。</p>" },
    paper: [
      { fileName: "sign_v1.jpg", desc: "首版簽章", ver: "v1", ts: "2025-12-26 15:20:11" },
      { fileName: "sign_v2.jpg", desc: "補簽修正", ver: "v2", ts: "2025-12-26 18:42:03" }
    ]
  };

  const get = (obj, path) => {
    return path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : ''), obj);
  };

  // Bind plain text
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const path = el.getAttribute('data-bind');
    el.textContent = String(get(data, path) ?? '');
  });

  // Bind rich html
  document.querySelectorAll('[data-bind-html]').forEach((el) => {
    const path = el.getAttribute('data-bind-html');
    el.innerHTML = String(get(data, path) ?? '');
  });

  // Attachments render
  const attachList = document.getElementById('viewAttachList');
  if (attachList){
    attachList.innerHTML = '';
    (data.attachments || []).forEach((a) => {
      const item = document.createElement('div');
      item.className = 'viewAttach__item';
      item.innerHTML = `
        <div class="viewAttach__file"><i class="bi bi-paperclip"></i> ${escapeHtml(a.fileName || '-')}</div>
        <div class="viewAttach__desc">${escapeHtml(a.desc || '')}</div>
      `;
      attachList.appendChild(item);
    });
    if ((data.attachments || []).length === 0){
      attachList.innerHTML = '<div class="text-muted">無附件</div>';
    }
  }

  // Paper render (with ver + ts)
  const paperList = document.getElementById('viewPaperList');
  if (paperList){
    paperList.innerHTML = '';
    (data.paper || []).forEach((p) => {
      const item = document.createElement('div');
      item.className = 'viewAttach__item viewAttach__item--paper';
      item.innerHTML = `
        <div class="viewAttach__file"><i class="bi bi-file-earmark"></i> ${escapeHtml(p.fileName || '-')}</div>
        <div class="viewAttach__desc">${escapeHtml(p.desc || '')}</div>
        <div class="viewAttach__meta"><span class="badge text-bg-light">${escapeHtml(p.ver || '')}</span></div>
        <div class="viewAttach__meta text-muted">${escapeHtml(p.ts || '')}</div>
      `;
      paperList.appendChild(item);
    });
    if ((data.paper || []).length === 0){
      paperList.innerHTML = '<div class="text-muted">無紙本附件</div>';
    }
  }

  // Parts render
  const partsBody = document.getElementById('viewPartsBody');
  if (partsBody){
    partsBody.innerHTML = '';
    (data.parts || []).forEach((r) => {
      const tr = document.createElement('tr');
      const src = (r.source || []).join('、');
      tr.innerHTML = `
        <td data-label="品名"><div class="viewText">${escapeHtml(r.name || '')}</div></td>
        <td data-label="規格"><div class="viewText">${escapeHtml(r.spec || '')}</div></td>
        <td data-label="數量"><div class="viewText">${escapeHtml(String(r.qty ?? ''))}</div></td>
        <td data-label="物料來源"><div class="viewText">${escapeHtml(src)}</div></td>
        <td data-label="備註"><div class="viewText">${escapeHtml(r.memo || '')}</div></td>
      `;
      partsBody.appendChild(tr);
    });
    if ((data.parts || []).length === 0){
      partsBody.innerHTML = '<tr><td colspan="5" class="text-muted p-3">無資料</td></tr>';
    }
  }

  // Print
  document.getElementById('btnPrint')?.addEventListener('click', () => window.print());

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
})();