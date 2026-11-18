/* 燃油成本與營運（M16，fuel-ops-cost）的風險評估器。數字全部來自 fuel_ops.js（U.fuelOps），和卡片畫面同一份計算；c.vids 已套用運務管理共用的航線篩選。
   門檻在 fuelops_spec.py（暫定）；成本為示意價、趕船多燒的油為估算。 */
(function () {
  'use strict';
  const U = window.UI, K = U && U.risk && U.risk.K;
  if (!K) return;
  const { fmt } = U;
  const F = () => U.fuelOps;
  const pn = u => (U.ports ? U.ports(u) : ((U.M.ports || {})[u] || {}).name || u);   // 港口名稱（U.ports 在畫面模組才有）
  const NOD = { level: 'nodata', summary: '所選航線本月沒有資料', items: [] };
  const RANK = { low: 0, mid: 1, high: 2 };
  const worst = a => a.reduce((x, y) => (RANK[y] > RANK[x] ? y : x), 'low');

  // M16-c0：每箱燃油成本對上月
  K.fuelops_kpi = (p, c) => {
    if (!F()) return NOD;
    const k = F().kpi(c.vids, c.mi);
    if (!k.hasData || k.cpt == null) return NOD;
    const d = k.dCpt, lv = d == null ? 'low' : +d.toFixed(1) >= p.high ? 'high' : +d.toFixed(1) >= p.mid ? 'mid' : 'low';
    const items = [];
    if (k.low.length) items.push(...k.low.map(id => ({ vid: id, text: `${U.vname(id)}　剩餘天數 3 天以下或已低於最低存量` })));
    return { level: k.low.length ? worst([lv, 'mid']) : lv,
      summary: `本月燃油成本 ${fmt(k.cost / 1e4, 0)} 萬美元、每箱 ${fmt(k.cpt, 1)} 美元（示意價）` + (d == null ? '，上月沒有資料' : `，每箱成本${d >= 0 ? '比上月高' : '比上月低'} ${fmt(Math.abs(d), 1)}%`) +
        `；趕船多燒約 ${fmt(k.catchX, 0)} 噸（估算）、等待燒掉 ${fmt(k.wait, 0)} 噸` + (k.low.length ? `；${k.low.length} 艘油量偏低` : ''), items };
  };

  // M16-c1：每箱成本比全部航線平均高多少
  K.fuelops_route = (p, c) => {
    if (!F()) return NOD;
    const rows = F().byRoute(c.vids, c.mi).filter(r => r.cpt != null), base = F().base(c.mi);
    if (!rows.length || !base) return NOD;
    const L = rows.map(r => { const d = 100 * (r.cpt / base - 1), v = +d.toFixed(1); return { r, d, lv: v >= p.high ? 'high' : v >= p.mid ? 'mid' : 'low' }; }).filter(x => x.lv !== 'low').sort((a, b) => b.d - a.d);
    return { level: worst(L.map(x => x.lv)),
      summary: L.length ? `${L.length} 條航線每箱燃油成本比全部航線平均（${fmt(base, 1)} 美元／TEU，示意價）高 ${p.mid}% 以上，其中 ${L.filter(x => x.lv === 'high').length} 條高 ${p.high}% 以上` : `${rows.length} 條航線每箱燃油成本都在全部航線平均（${fmt(base, 1)} 美元／TEU）的 ${p.mid}% 以內或更低`,
      items: L.map(x => ({ text: `${x.r.code}　每箱 ${fmt(x.r.cpt, 1)} 美元，比平均高 ${fmt(x.d, 1)}%` })) };
  };

  // M16-c2：趕船航段占比
  K.fuelops_catch = (p, c) => {
    if (!F()) return NOD;
    const rows = F().byRoute(c.vids, c.mi).filter(r => r.catchShare != null);
    if (!rows.length) return NOD;
    const L = rows.map(r => { const v = Math.round(r.catchShare); return { r, lv: v >= p.high ? 'high' : v >= p.mid ? 'mid' : 'low' }; }).filter(x => x.lv !== 'low').sort((a, b) => b.r.catchX - a.r.catchX);
    const tot = rows.reduce((s, r) => s + (r.catchX || 0), 0);
    return { level: worst(L.map(x => x.lv)),
      summary: `本月趕船多燒約 ${fmt(tot, 0)} 噸（估算）；` + (L.length ? `${L.length} 條航線趕船航段占比 ${p.mid}% 以上（${L.filter(x => x.lv === 'high').length} 條 ${p.high}% 以上）` : `${rows.length} 條航線趕船航段占比都低於 ${p.mid}%`),
      items: L.map(x => ({ text: `${x.r.code}　趕船 ${fmt(x.r.catchShare, 0)}%、平均晚到 ${fmt(x.r.delay, 1)} 小時，多燒約 ${fmt(x.r.catchX, 0)} 噸` })) };
  };

  // M16-c3：等待油耗占航線總油耗
  K.fuelops_wait = (p, c) => {
    if (!F()) return NOD;
    const rows = F().byRoute(c.vids, c.mi).filter(r => r.wait != null && r.fuel > 0);
    if (!rows.length) return NOD;
    const L = rows.map(r => { const s = 100 * r.wait / r.fuel, v = +s.toFixed(1); return { r, s, lv: v >= p.high ? 'high' : v >= p.mid ? 'mid' : 'low' }; }).filter(x => x.lv !== 'low').sort((a, b) => b.s - a.s);
    const tot = rows.reduce((s, r) => s + r.wait, 0), top = F().byPort(c.vids, c.mi)[0];
    return { level: worst(L.map(x => x.lv)),
      summary: `本月等待燒掉 ${fmt(tot, 0)} 噸` + (top ? `，最多的港口是 ${pn(top.port)}（${fmt(top.fuel, 0)} 噸）` : '') + '；' +
        (L.length ? `${L.length} 條航線等待油耗占總油耗 ${p.mid}% 以上（${L.filter(x => x.lv === 'high').length} 條 ${p.high}% 以上）` : `各航線等待油耗都低於總油耗的 ${p.mid}%`),
      items: L.map(x => ({ text: `${x.r.code}　等待燒掉 ${fmt(x.r.wait, 0)} 噸，占 ${fmt(x.s, 1)}%` })) };
  };

  // M16-c4：準點率（近 6 個月）；快卻不準的航線一併列出
  K.fuelops_speed = (p, c) => {
    if (!F()) return NOD;
    const rows = F().byRoute(c.vids, c.mi).filter(r => r.speed6 != null && r.otp6 != null);
    if (!rows.length) return { level: 'nodata', summary: '所選航線近 6 個月靠港紀錄不足 3 次', items: [] };
    const L = rows.map(r => { const v = Math.round(r.otp6); return { r, lv: v < p.high ? 'high' : v < p.mid ? 'mid' : 'low', fast: r.speed6 >= p.split }; }).filter(x => x.lv !== 'low').sort((a, b) => a.r.otp6 - b.r.otp6);
    const fastLate = L.filter(x => x.fast);
    return { level: worst(L.map(x => (x.fast && x.lv === 'mid' ? 'high' : x.lv))),
      summary: L.length ? `${L.length} 條航線近 6 個月準點率低於 ${p.mid}%` + (fastLate.length ? `，其中 ${fastLate.map(x => x.r.code).join('、')} 航速已達設計 ${fmt(p.split, 2)} 以上仍不準點（快卻不準，要處理）` : '，都是慢速航行；可評估稍微加速或調整船期') : `${rows.length} 條航線近 6 個月準點率都在 ${p.mid}% 以上`,
      items: L.map(x => ({ text: `${x.r.code}　準點率 ${fmt(x.r.otp6, 0)}%、航速占設計 ${fmt(x.r.speed6, 2)}${x.fast ? '（快卻不準）' : ''}` })) };
  };
})();
