/* 單船總覽（single-overview）共用對照：逐船燈號 → 白話名稱、所屬面向、前往哪裡；船的位置沿用清單的 posOf（U.rosterPos）。
   燈號全部來自 U.risk.byVessel（與清單頁同一份逐船評估），這裡不另外計算。 */
(function () {
  'use strict';
  const U = window.UI;
  if (!U) return;
  // 面向（④ 各面向狀況的格子）：key、名稱、單船頁籤、包含哪些燈號、代表數字取哪一個燈號
  const FACES = {
    container: [
      { key: 'fuel', name: '油耗與效率', tab: 's_drive', lights: ['eff', 'speed', 'catchup', 'outlier'], rep: 'eff' },
      { key: 'voy', name: '航次與準點', tab: 's_vdata', lights: ['otp', 'pwait'], rep: 'otp' },   // 準點在「每圈靠港順序圖」、等泊在「每次靠港的在港時間分解」，都在航次數據
      { key: 'stock', name: '燃油庫存', tab: 's_stock', lights: ['remain'], rep: 'remain' },
      { key: 'env', name: '環保', tab: 's_env', lights: ['cii'], rep: 'cii' },
      { key: 'load', name: '船上貨櫃', tab: 's_load', lights: ['slot'], rep: 'slot' },
      { key: 'data', name: '資料更新', tab: 's_over', lights: ['data'], rep: 'data' },   // 船報更新時間在總覽上方的船舶動態
    ],
    bulk: [
      { key: 'fuel', name: '油耗與效率', tab: 's_drive', lights: ['eff', 'outlier', 'foul', 'mgo'], rep: 'eff' },
      { key: 'voy', name: '等待耗油', tab: 's_drive', lights: ['wait'], rep: 'wait' },   // 等待耗油占比在「油花在哪裡」
      { key: 'stock', name: '燃油庫存', tab: 's_stock', lights: ['remain'], rep: 'remain' },
      { key: 'env', name: '環保', tab: 's_env', lights: ['cii'], rep: 'cii' },
      { key: 'data', name: '資料更新', tab: 's_over', lights: ['data'], rep: 'data' },
    ],
  };
  // 燈號各自要去哪裡：預設是所屬面向的頁籤；警報到「警報事件總覽（只看這艘船）」；資料品質散裝到單船「紀錄」、貨櫃（沒有紀錄頁籤）到船隊「資料與警報」
  const GO = { data: 's_over' };
  // 單船頁不顯示的燈號：單船頁沒有對應的圖表或數據（使用者 2026-11-19）——警報數、資料品質。船隊清單頁照常顯示
  const HIDE = new Set(['alarm', 'dq']);
  /** 單船頁用的逐船燈號（拿掉 HIDE） */
  const vis = vid => { const o = U.risk.byVessel(vid) || {}, r = {}; Object.keys(o).forEach(k => { if (o[k] && !HIDE.has(k)) r[k] = o[k]; }); return r; };
  const R = { nodata: -1, low: 0, mid: 1, high: 2 };

  function faces(type) { return (FACES[type] || FACES.container).filter(f => f.tab === 'alerts' || U.IA.tabsAvail(3, type).some(t => t[0] === f.tab)); }
  function faceOf(type, k) { return (FACES[type] || []).find(f => f.lights.includes(k)); }
  function dest(type, k) { const g = GO[k], d = g && typeof g === 'object' ? g[type] : g; return d || (faceOf(type, k) || {}).tab || 's_over'; }
  function destName(type, d) {
    if (d === 'alerts') return '警報事件';
    if (d === 'fleetdata') return '資料與警報（船隊）';
    const t = U.IA.tabsAvail(3, type).find(x => x[0] === d); return t ? t[1] : d;
  }
  /** 前往：單船頁籤、這艘船的警報事件、或船隊資料與警報 */
  function go(vid, d) {
    if (d === 'alerts') { if (U.openVesselAlerts) U.openVesselAlerts(vid); return; }
    if (d === 'fleetdata') { U.IA.setLoc(1, 'data'); U.bus.emit(); window.scrollTo(0, 0); return; }
    U.STATE.vessel = vid; U.IA.setLoc(3, d); U.bus.emit(); window.scrollTo(0, 0);
  }
  /** 這艘船的燈號清單（含面向與前往），依嚴重度排序（紅 → 黃 → 綠 → 資料不足） */
  function lights(vid, type) {
    const o = vis(vid);
    return Object.keys(o).map(k => {
      const x = o[k], f = faceOf(type, k), d = dest(type, k);
      const it = (x.items || []).find(i => i.vid === vid);
      const own = it ? it.text.replace(/^.*?　/, '') : '';
      // CII 的判讀文字是船隊寫法（「2025 年 1 艘評級：A 0、B 0…」），單船改寫成這艘船自己的評級
      const sum = k === 'cii' && own ? `評級 ${own}；${x.level === 'high' ? 'E 級（或連續 3 年 D 級）要提出 SEEMP 改善計畫' : x.level === 'mid' ? 'D 級，連續 3 年 D 級就要提出改善計畫' : '在 C 級以內'}` : (x.summary || '');
      return { key: k, label: x.label || k, level: x.level || 'nodata', text: x.text || own, summary: sum, face: f ? f.key : null, dest: d, destName: destName(type, d) };
    }).sort((a, b) => (R[b.level] - R[a.level]));
  }
  const worst = L => L.reduce((lv, x) => (R[x.level] > R[lv] ? x.level : lv), 'nodata');

  U.sov = { FACES, faces, lights, worst, go, destName, R, HIDE, vis };
})();
