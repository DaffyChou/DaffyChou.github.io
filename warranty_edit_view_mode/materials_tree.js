(() => {
  /**
   * ============================================================
   * materials_tree.js（完整版）
   * - 多系統構型樹（All / 磁羅經 / 推進）
   * - 列表欄位：料號、中文名、英文名、規格、位置、適用裝備中英、製造商、供應商、單價、庫存(可用/總量)
   * - 重點：因為列表不再顯示 path，所以「樹節點/類別」過濾改用 dt.ext.search 看 _raw.path
   * ============================================================
   */

  // =========================
  // 0) 共用小工具
  // =========================
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));

  const fmtInt = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    return v.toLocaleString('en-US');
  };

  // =========================
  // 1) 多系統構型樹（每個 node 都有 pathPrefix）
  //    pathPrefix = 對應 rows.path 的開頭字串，用來 prefix filter
  // =========================
  const systemsRoot = {
    id: 'all',
    label: '全部系統',
    pathPrefix: '', // 空字串 = 不過濾（顯示全部）
    children: [
      {
        id: 'mag',
        label: '磁羅經系統',
        pathPrefix: '磁羅經系統',
        children: [
          {
            id: 'binnacle',
            label: '羅經櫃 (Binnacle)',
            pathPrefix: '磁羅經系統 / 羅經櫃 (Binnacle)',
            children: [
              {
                id: 'helmet',
                label: '羅經艙防護罩 (Helmet)',
                pathPrefix: '磁羅經系統 / 羅經櫃 (Binnacle) / Helmet',
                children: []
              }
            ]
          },
          {
            id: 'compass',
            label: '磁羅經 (Magnetic Compass)',
            pathPrefix: '磁羅經系統 / 磁羅經 (Magnetic Compass)',
            children: [
              {
                id: 'bulb',
                label: '24伏特、15瓦 小型螺口燈泡 (Bulb)',
                pathPrefix: '磁羅經系統 / 磁羅經 (Magnetic Compass) / Bulb',
                children: []
              }
            ]
          },
          { id: 'azimuth', label: '方位鏡 (Azimuth Circle)', pathPrefix: '磁羅經系統 / 方位鏡 (Azimuth Circle)', children: [] },
          { id: 'box', label: '磁羅經盒 (Compass Box)', pathPrefix: '磁羅經系統 / 磁羅經盒 (Compass Box)', children: [] },
          { id: 'control', label: '燈光控制設備 (Control Unit)', pathPrefix: '磁羅經系統 / 燈光控制設備 (Control Unit)', children: [] }
        ]
      },

      {
        id: 'propulsion',
        label: '推進系統 (Propulsion System)',
        pathPrefix: '推進系統 (Propulsion System)',
        children: [
          {
            id: 'me',
            label: '原動機 (Main Engine)',
            pathPrefix: '推進系統 (Propulsion System) / 原動機 (Main Engine)',
            children: [
              {
                id: 'me-body',
                label: '主機本體',
                pathPrefix: '推進系統 (Propulsion System) / 原動機 (Main Engine) / 主機本體',
                children: [
                  {
                    id: 'me-cylinder',
                    label: '氣缸單元',
                    pathPrefix: '推進系統 (Propulsion System) / 原動機 (Main Engine) / 主機本體 / 氣缸單元',
                    children: [
                      { id: 'piston-ring', label: '活塞環', pathPrefix: '推進系統 (Propulsion System) / 原動機 (Main Engine) / 主機本體 / 氣缸單元 / 活塞環', children: [] },
                      { id: 'injector', label: '噴油嘴', pathPrefix: '推進系統 (Propulsion System) / 原動機 (Main Engine) / 主機本體 / 氣缸單元 / 噴油嘴', children: [] },
                      { id: 'valve-guide', label: '氣門導管', pathPrefix: '推進系統 (Propulsion System) / 原動機 (Main Engine) / 主機本體 / 氣缸單元 / 氣門導管', children: [] }
                    ]
                  }
                ]
              }
            ]
          },
          {
            id: 'transmission',
            label: '傳動系統 (Transmission)',
            pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission)',
            children: [
              {
                id: 'gearbox',
                label: '減速齒輪箱',
                pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 減速齒輪箱',
                children: [
                  {
                    id: 'gearset',
                    label: '齒輪組',
                    pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 減速齒輪箱 / 齒輪組',
                    children: [
                      { id: 'pinion', label: '高速 Pinion', pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 減速齒輪箱 / 齒輪組 / 高速 Pinion', children: [] },
                      { id: 'gear-face', label: '大齒輪齒面', pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 減速齒輪箱 / 齒輪組 / 大齒輪齒面', children: [] }
                    ]
                  }
                ]
              },
              {
                id: 'shaft',
                label: '軸系裝置',
                pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 軸系裝置',
                children: [
                  {
                    id: 'stern-tube',
                    label: '艉軸管組件',
                    pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 軸系裝置 / 艉軸管組件',
                    children: [
                      { id: 'seal', label: '水密密封環', pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 軸系裝置 / 艉軸管組件 / 水密密封環', children: [] },
                      { id: 'bearing', label: '切拿軸承', pathPrefix: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 軸系裝置 / 艉軸管組件 / 切拿軸承', children: [] }
                    ]
                  }
                ]
              }
            ]
          },
          {
            id: 'propulsor',
            label: '螺旋槳系統 (Propulsor)',
            pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor)',
            children: [
              {
                id: 'hub',
                label: '槳轂總成 (Hub)',
                pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 槳轂總成 (Hub)',
                children: [
                  {
                    id: 'pitch-mech',
                    label: '變距機構',
                    pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 槳轂總成 (Hub) / 變距機構',
                    children: [
                      { id: 'link', label: '變距連桿', pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 槳轂總成 (Hub) / 變距機構 / 變距連桿', children: [] },
                      { id: 'crosshead', label: '十字頭 (Crosshead)', pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 槳轂總成 (Hub) / 變距機構 / 十字頭 (Crosshead)', children: [] }
                    ]
                  }
                ]
              },
              {
                id: 'odbox',
                label: '螺距控制 (OD Box)',
                pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 螺距控制 (OD Box)',
                children: [
                  {
                    id: 'servo',
                    label: '伺服單元',
                    pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 螺距控制 (OD Box) / 伺服單元',
                    children: [
                      { id: 'coil', label: '電磁閥線圈', pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 螺距控制 (OD Box) / 伺服單元 / 電磁閥線圈', children: [] },
                      { id: 'sensor', label: '反饋感測器', pathPrefix: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 螺距控制 (OD Box) / 伺服單元 / 反饋感測器', children: [] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  // =========================
  // 2) 原始 rows（保持你目前資料結構）
  // =========================
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
    },

    // ===== 推進系統（假資料）=====
    {
      path: '推進系統 (Propulsion System) / 原動機 (Main Engine) / 主機本體 / 氣缸單元 / 活塞環',
      pn: 'ME-PR-92-01',
      nameZh: '活塞環',
      specShort: 'Ø920mm / 3pcs set',
      location: '機艙',
      maker: 'MAN B&W',
      vendor: 'B廠商',
      price: '$ 28,500',
      life: 'C 2027/06/30',
      stockUsed: 2, stockOk: 6, stockTotal: 8,
      applyDate: '2025/10/12',
      reqUnit: '輪機部',
      altPns: ['ME-PR-92-ALT-01'],
      docs: ['型錄_活塞環.pdf', '安裝注意事項.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 原動機 (Main Engine) / 主機本體 / 氣缸單元 / 噴油嘴',
      pn: 'ME-INJ-92-03',
      nameZh: '噴油嘴',
      specShort: 'Nozzle tip / 8-hole',
      location: '機艙',
      maker: 'Wärtsilä',
      vendor: 'C廠商',
      price: '$ 42,000',
      life: 'C 2026/12/31',
      stockUsed: 1, stockOk: 3, stockTotal: 4,
      applyDate: '2025/11/03',
      reqUnit: '輪機部',
      altPns: ['ME-INJ-92-ALT-02', 'ME-INJ-92-ALT-03'],
      docs: ['檢修手冊_噴油嘴.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 原動機 (Main Engine) / 主機本體 / 氣缸單元 / 氣門導管',
      pn: 'ME-VG-92-02',
      nameZh: '氣門導管',
      specShort: 'Exhaust valve guide',
      location: '機艙',
      maker: 'MITSUBISHI',
      vendor: 'B廠商',
      price: '$ 19,800',
      life: 'C 2028/03/31',
      stockUsed: 0, stockOk: 2, stockTotal: 2,
      applyDate: '2025/09/18',
      reqUnit: '輪機部',
      altPns: [],
      docs: ['材質證明.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 減速齒輪箱 / 齒輪組 / 高速 Pinion',
      pn: 'GB-PIN-01',
      nameZh: '高速小齒輪（Pinion）',
      specShort: 'Module 10 / 24T',
      location: '機艙',
      maker: 'RENK',
      vendor: 'D廠商',
      price: '$ 380,000',
      life: '—',
      stockUsed: 0, stockOk: 1, stockTotal: 1,
      applyDate: '2025/08/22',
      reqUnit: '工務部',
      altPns: ['GB-PIN-ALT-01'],
      docs: ['齒輪箱爆炸圖.pdf', '檢驗報告.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 減速齒輪箱 / 齒輪組 / 大齒輪齒面',
      pn: 'GB-GEARFACE-01',
      nameZh: '大齒輪齒面修補片',
      specShort: 'Surface patch kit',
      location: '機艙',
      maker: 'Flender',
      vendor: 'D廠商',
      price: '$ 65,000',
      life: 'C 2027/12/31',
      stockUsed: 1, stockOk: 1, stockTotal: 2,
      applyDate: '2025/12/05',
      reqUnit: '工務部',
      altPns: [],
      docs: ['修補程序.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 軸系裝置 / 艉軸管組件 / 水密密封環',
      pn: 'ST-SEAL-110-02',
      nameZh: '水密密封環',
      specShort: '110mm / NBR',
      location: '艉部',
      maker: 'SKF',
      vendor: 'E廠商',
      price: '$ 12,600',
      life: 'C 2026/09/30',
      stockUsed: 2, stockOk: 0, stockTotal: 2,
      applyDate: '2025/12/20',
      reqUnit: '輪機部',
      altPns: ['ST-SEAL-110-VITON'],
      docs: ['型錄_密封環.pdf', '安裝圖.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 傳動系統 (Transmission) / 軸系裝置 / 艉軸管組件 / 切拿軸承',
      pn: 'ST-BRG-CH-01',
      nameZh: '切拿軸承',
      specShort: 'Composite / water-lubricated',
      location: '艉部',
      maker: 'Thordon',
      vendor: 'E廠商',
      price: '$ 210,000',
      life: '—',
      stockUsed: 0, stockOk: 1, stockTotal: 1,
      applyDate: '2025/07/30',
      reqUnit: '工務部',
      altPns: ['ST-BRG-ALT-01'],
      docs: ['檢修建議.pdf', '材質證明.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 槳轂總成 (Hub) / 變距機構 / 變距連桿',
      pn: 'CPP-LINK-01',
      nameZh: '變距連桿',
      specShort: 'CPP linkage rod',
      location: '艉部',
      maker: 'Kongsberg',
      vendor: 'F廠商',
      price: '$ 88,000',
      life: 'C 2027/03/31',
      stockUsed: 0, stockOk: 2, stockTotal: 2,
      applyDate: '2025/10/28',
      reqUnit: '工務部',
      altPns: [],
      docs: ['爆炸圖_CPP.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 槳轂總成 (Hub) / 變距機構 / 十字頭 (Crosshead)',
      pn: 'CPP-CRH-02',
      nameZh: '十字頭（Crosshead）',
      specShort: 'CPP crosshead assy',
      location: '艉部',
      maker: 'Rolls-Royce',
      vendor: 'F廠商',
      price: '$ 145,000',
      life: '—',
      stockUsed: 1, stockOk: 1, stockTotal: 2,
      applyDate: '2025/11/18',
      reqUnit: '工務部',
      altPns: ['CPP-CRH-ALT-01'],
      docs: ['檢修手冊_十字頭.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 螺距控制 (OD Box) / 伺服單元 / 電磁閥線圈',
      pn: 'OD-SOL-COIL-24V',
      nameZh: '電磁閥線圈',
      specShort: '24VDC / IP67',
      location: '機艙',
      maker: 'Parker',
      vendor: 'G廠商',
      price: '$ 6,800',
      life: 'C 2026/05/31',
      stockUsed: 3, stockOk: 5, stockTotal: 8,
      applyDate: '2025/12/01',
      reqUnit: '電機組',
      altPns: ['OD-SOL-COIL-24V-ALT'],
      docs: ['型錄_電磁閥.pdf']
    },
    {
      path: '推進系統 (Propulsion System) / 螺旋槳系統 (Propulsor) / 螺距控制 (OD Box) / 伺服單元 / 反饋感測器',
      pn: 'OD-FB-SEN-01',
      nameZh: '反饋感測器',
      specShort: '4–20mA / angle feedback',
      location: '機艙',
      maker: 'Siemens',
      vendor: 'G廠商',
      price: '$ 32,500',
      life: 'C 2027/09/30',
      stockUsed: 0, stockOk: 1, stockTotal: 1,
      applyDate: '2025/09/05',
      reqUnit: '電機組',
      altPns: [],
      docs: ['接線圖.pdf', '校正程序.pdf']
    }
  ];

  // =========================
  // 3) 列表欄位需要的新資料：英文名稱、適用裝備中英、庫存顯示
  // =========================
  // 3.1 零件英文名稱（假資料對照；未來可換成 API 欄位）
  const partNameEnByPn = {
    'BULB-24V-15W-01': 'Small Screw Bulb (24V 15W)',
    'HELMET-01': 'Binnacle Helmet',
    'AZI-01': 'Azimuth Circle',
    'ME-PR-92-01': 'Piston Ring Set',
    'ME-INJ-92-03': 'Fuel Injector Nozzle',
    'ME-VG-92-02': 'Valve Guide',
    'GB-PIN-01': 'High-speed Pinion',
    'GB-GEARFACE-01': 'Gear Tooth Surface Patch Kit',
    'ST-SEAL-110-02': 'Stern Tube Seal Ring',
    'ST-BRG-CH-01': 'Cutless Bearing',
    'CPP-LINK-01': 'Pitch Control Link Rod',
    'CPP-CRH-02': 'Crosshead Assembly',
    'OD-SOL-COIL-24V': 'Solenoid Valve Coil (24VDC)',
    'OD-FB-SEN-01': 'Feedback Sensor (Angle)'
  };

  // 3.2 從 path 第一段解析「適用裝備中英」
  // - 例如：推進系統 (Propulsion System) => zh=推進系統, en=Propulsion System
  // - 沒括號就 en=''
  const parseEquipFromPath = (path) => {
    const first = String(path || '').split(' / ')[0] || '';
    const m = first.match(/^(.*?)\s*\((.*?)\)\s*$/);
    if (m) return { equipZh: m[1].trim(), equipEn: m[2].trim() };
    return { equipZh: first.trim(), equipEn: '' };
  };

  // 3.3 庫存數量顯示（A 方案）：可用/總量
  const formatStockQty = (r) => {
    const ok = Number(r.stockOk) || 0;
    const total = Number(r.stockTotal) || 0;
    return `${ok.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`;
  };

  // 3.4 產出 DataTables 用的 uiRows（保留 _raw 供樹過濾 & 子列展開）
  const uiRows = rows.map(r => {
    const eq = parseEquipFromPath(r.path);
    return {
      pn: r.pn,
      nameZh: r.nameZh,
      nameEn: partNameEnByPn[r.pn] || '',
      spec: r.specShort,
      location: r.location,
      equipNameZh: eq.equipZh,
      equipNameEn: eq.equipEn,
      maker: r.maker,
      vendor: r.vendor,
      price: r.price,
      stockQty: formatStockQty(r),
      _raw: r
    };
  });

  // =========================
  // 4) KPI 計算（樹節點顯示）
  //    KPI 一律用原始 rows（看 pathPrefix 比對）
  // =========================
  const computeKPIsByPrefix = (prefix) => {
    const matched = rows.filter(r => String(r.path || '').startsWith(prefix));
    const low = matched.filter(r => (Number(r.stockOk) || 0) <= 0).length;
    const pending = matched.filter(r => (Number(r.stockUsed) || 0) > 0).length;
    const alt = matched.reduce((acc, r) => acc + (Array.isArray(r.altPns) ? r.altPns.length : 0), 0);
    return { low, pending, alt, total: matched.length };
  };

  // =========================
  // 5) 左側樹渲染（點選節點 => activePathPrefix）
  // =========================
  const treeEl = document.getElementById('materialsTree');

  // activePathPrefix：樹點選的 prefix
  let activePathPrefix = '';

  // activeCategoryPrefix：上方「裝備類別」下拉 prefix（系統層級）
  let activeCategoryPrefix = '';

  const renderTreeNode = (node, depth = 0) => {
    const isLeaf = !node.children || node.children.length === 0;
    const prefix = node.pathPrefix ?? '';
    const kpi = computeKPIsByPrefix(prefix);

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

    // KPI badges：管理端一眼能看出缺料與替代料狀態
    const meta = document.createElement('div');
    meta.className = 'treeNode__meta';
    meta.innerHTML = `
      <span class="badgeMini">${fmtInt(kpi.total)} 筆</span>`;
    row.appendChild(meta);

    wrap.appendChild(row);

    if (!isLeaf) {
      const children = document.createElement('div');
      children.className = 'treeChildren';
      children.hidden = depth > 0; // 除了 root 預設展開，其他預設收合

      node.children.forEach(ch => children.appendChild(renderTreeNode(ch, depth + 1)));
      wrap.appendChild(children);

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        children.hidden = !children.hidden;
        toggle.innerHTML = children.hidden
          ? '<i class="bi bi-chevron-right"></i>'
          : '<i class="bi bi-chevron-down"></i>';
      });
    }

    row.addEventListener('click', () => {
      treeEl?.querySelectorAll('.treeNode').forEach(n => n.classList.remove('is-active'));
      row.classList.add('is-active');

      activePathPrefix = prefix;  // ✅ 樹節點收斂
      applyAllFilters();
    });

    return wrap;
  };

  if (treeEl) {
    treeEl.innerHTML = '';
    treeEl.appendChild(renderTreeNode(systemsRoot, 0));
  }

  // =========================
  // 6) 子列展開內容（沿用你原本 raw row 的欄位）
  // =========================
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

  // =========================
  // 7) DataTables 初始化（改用 uiRows）
  // =========================
  let dt = $('#materialsTable').DataTable({
    data: uiRows,
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
      {
        data: null,
        className: 'dt-control',
        orderable: false,
        searchable: false,
        render: () => `<button class="materialsToggle is-plus" type="button" aria-label="展開"><span class="materialsToggle__dot">+</span></button>`
      },
      { data: 'pn' },
      { data: 'nameZh' },
      { data: 'nameEn' },
      { data: 'spec' },
      { data: 'location' },
      { data: 'equipNameZh' },
      { data: 'equipNameEn' },
      { data: 'maker' },
      { data: 'vendor' },
      { data: 'price' },
      { data: 'stockQty' }
    ],
    drawCallback: function () {
      const api = this.api();
      const info = api.page.info();
      const text = info.recordsDisplay
        ? `顯示第 ${info.start + 1} 到第 ${info.end} 筆，共 ${info.recordsDisplay} 筆資料`
        : '顯示第 0 到第 0 筆，共 0 筆資料';
      const el = document.getElementById('materialsFootInfo');
      if (el) el.textContent = text;
    }
  });

  // =========================
  // 8) 核心：自訂過濾器（樹節點/類別下拉 改看 _raw.path）
  // =========================
  $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
    // 只針對本頁 table（避免同頁多表互相干擾）
    if (settings.nTable?.id !== 'materialsTable') return true;

    const ui = dt.row(dataIndex).data();
    const rawPath = ui?._raw?.path || '';

    // 類別（系統層級）：例如「推進系統 (Propulsion System)」
    if (activeCategoryPrefix && !rawPath.startsWith(activeCategoryPrefix)) return false;

    // 樹節點（更細的構型層級）
    if (activePathPrefix && !rawPath.startsWith(activePathPrefix)) return false;

    return true;
  });

  // =========================
  // 9) 子列展開：注意要用 _raw
  // =========================
  $('#materialsTable tbody').on('click', 'td.dt-control button.materialsToggle', function () {
    const $btn = $(this);
    const tr = $btn.closest('tr');
    const row = dt.row(tr);

    if (row.child.isShown()) {
      row.child.hide();
      $btn.removeClass('is-minus').addClass('is-plus').find('.materialsToggle__dot').text('+');
    } else {
      // ✅ 用 _raw，展開內容才能取得 stockOk/altPns/docs
      row.child(renderChild(row.data()._raw), 'materialsChildRow').show();
      $btn.removeClass('is-plus').addClass('is-minus').find('.materialsToggle__dot').text('−');
    }
  });

  // =========================
  // 10) Filters（搜尋/清除）
  // - 類別：不再用 dt.column(path) 搜尋，改用 activeCategoryPrefix（由 ext.search 處理）
  // - 位置：仍可用欄位精準比對（因為列表有 location 欄）
  // - 關鍵字：使用 dt.search（會掃描顯示欄位）
  // =========================
  const applyAllFilters = () => {
    const cat = (document.getElementById('fCategory')?.value || '').trim();
    const loc = (document.getElementById('fLocation')?.value || '').trim();
    const kw = (document.getElementById('fKeyword')?.value || '').trim();

    // 這裡先把 DataTables 的欄位搜尋清掉，避免疊加造成誤判
    dt.columns().search('');
    dt.search('');

    // 類別：改走 ext.search（看 rawPath prefix）
    activeCategoryPrefix = cat || '';

    // 位置：列表 column index = 5（0=#,1=pn,2=nameZh,3=nameEn,4=spec,5=location）
    if (loc) {
      const locColIndex = 5;
      dt.column(locColIndex).search('^' + loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', true, false);
    }

    // 關鍵字：掃描顯示欄位（pn/name/spec/equip/maker/vendor...）
    if (kw) dt.search(kw);

    dt.draw();
  };

  document.getElementById('btnSearch')?.addEventListener('click', applyAllFilters);

  document.getElementById('btnClear')?.addEventListener('click', () => {
    const c = document.getElementById('fCategory');
    const l = document.getElementById('fLocation');
    const k = document.getElementById('fKeyword');
    if (c) c.value = '';
    if (l) l.value = '';
    if (k) k.value = '';

    // 清掉兩種 prefix（類別/樹）
    activeCategoryPrefix = '';
    activePathPrefix = '';

    // UI：把樹 active 回到「全部系統」
    treeEl?.querySelectorAll('.treeNode').forEach(n => n.classList.remove('is-active'));
    const first = treeEl?.querySelector('.treeNode');
    if (first) first.classList.add('is-active');

    applyAllFilters();
  });

  document.getElementById('fKeyword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyAllFilters();
  });

  // =========================
  // 11) 類別下拉：自動同步「多系統」選項
  //     value 用 system.pathPrefix（因為我們用 prefix 過濾）
  // =========================
  const syncCategoryOptions = () => {
    const sel = document.getElementById('fCategory');
    if (!sel) return;

    // 保留第一個「全部」
    const keep = sel.querySelector('option[value=""]');
    sel.innerHTML = '';
    if (keep) sel.appendChild(keep);

    systemsRoot.children.forEach(sys => {
      const opt = document.createElement('option');
      opt.value = sys.pathPrefix;
      opt.textContent = sys.label;
      sel.appendChild(opt);
    });
  };

  syncCategoryOptions();

  // =========================
  // 12) 預設選取「全部系統」
  // =========================
  if (treeEl) {
    const root = treeEl.querySelector('.treeNode');
    if (root) root.click(); // 會把 activePathPrefix 設成 ''（全部）
  }
})();
