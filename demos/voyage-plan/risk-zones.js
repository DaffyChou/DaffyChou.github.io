/* ─────────────────────────────────────────────────────────────────
 * 全球海事風險區 / Global Maritime Risk Zones
 * Demo 資料：邊界為近似值，僅供介面展示。實務上請以下列權威來源即時資料為準：
 *   - IMB / ReCAAP（海盜）          - JWC / Lloyd's JWLA-027（戰爭）
 *   - OFAC / EU / UN（制裁）        - 各國 NAVAREA / NOTMAR（軍演 / 臨航）
 *   - WMO / JMA / NOAA NHC（氣象） - MARPOL Annex VI / IMO MEPC（ECA）
 *   - NOAA Fisheries / IMO MEPC（保護 / 限速）
 *   - IMO Traffic Separation Schemes（壅塞）
 *
 * 每筆 zone 欄位：
 *   cat            類別 key（對應 RISK_ZONE_CATEGORIES）
 *   id             區域代碼
 *   level          風險分級：critical / high / medium / low / info
 *   name / name_en 中／英名稱
 *   type / type_en 區域類型（次分類）
 *   desc / desc_en 中／英說明
 *   source         資料來源 / 出處
 *   source_url     來源連結（可選）
 *   effective_from 生效時間（'年-月-日' 或描述性，例如 '全年' / 'seasonal Nov–Mar'）
 *   effective_to   結束時間（'進行中' / 'ongoing' / 或日期）
 *   coords         邊界座標 [[lat, lon], ...]（leaflet polygon 用）
 * ───────────────────────────────────────────────────────────────── */

window.RISK_ZONE_CATEGORIES = [
  /* Demo 階段聚焦台灣周邊軍演 / 臨時禁航區 */
  { key: "military", label: "軍演 / 臨時禁航區", label_en: "Military Exercise / NOTAM", color: "#b069ff", semantic: "risk" },
];
/* 注意：港口錨地不算「風險區」而是「另一個風險監控維度」(window.ANCHORAGE_AREAS)
 * 對應 voyage-alert.html 的 anchorage 維度，獨立計算 + 獨立 threshold + 獨立圖層 */

/* ─────────────────────────────────────────────────────────────────
 * 風險區命中時的「建議動作清單」模板
 * 來源文件：
 *   - BMP5 (Best Management Practices to Deter Piracy v5, BIMCO/ICS/IGP&I/INTERTANKO/OCIMF, Jun 2018)
 *   - ITF List of Designated Risk Areas with Applicable Benefits, 13 March 2026
 *   - Liberia Marine Security Advisory 09/2023 Rev 7 — Anti-Piracy Checklist
 *   - GCPG (Global Counter Piracy Guidance)
 *
 * 每個 zone 透過 action_template 欄位指向其中一個 template key；命中時依此模板出建議動作。
 * 動作依「進入前 / 進入中 / 受攻擊 / 通報」階段分組，前端可摺疊顯示。
 * ───────────────────────────────────────────────────────────────── */
window.ZONE_ACTION_TEMPLATES = {
  // ─── ITF Warlike Operations Area（最高層級：ISPS 3 + 拒航權 + 5 天最低戰險加成）
  itf_woa: {
    designation:    "ITF Warlike Operations Area (WOA)",
    designation_cn: "ITF 戰爭風險區",
    isps_level:     3,
    bmp_level:      "BMP5 + GCPG（強制等同 ISPS Level 3）",
    refs: [
      "BMP5 §4 Planning / §5 Ship Protection Measures / §6 Reporting / §7 Ships under attack",
      "ITF Designation 1/2/4/5/6/8（依區域）— 2026-03-13",
      "Liberia Marine Security Advisory 09/2023 Rev 7 — Anti-Piracy Checklist",
      "GCPG Part 6 Crew Briefing / Part 7 Ship Hardening",
    ],
    phases: [
      { phase: "進入 VRA 之前 / Before entering VRA", items: [
        "向 MSCIO 提交 Vessel Movement Registration Form（前身為 MSCHOA；postmaster@mscio.eu）",
        "向 UKMTO 提交 Vessel Position Reporting Form — Initial Report（BMP5 Annex D）",
        "完成航線專屬風險評估（含替代路線、是否使用 PCASP 武裝安全人員）",
        "與保險公司確認 JWC / Lloyd's JWLA 加費條款；通知船員權益（5 天最低戰險加成 + 雙倍死亡傷害補償）",
        "向公司 DPA / CSO 通報並取得最終出航許可",
      ]},
      { phase: "進入 HRA 之前 / Before entering HRA", items: [
        "船舶 ISPS Security Level 設為 **Level 3**（強制），啟用最高等級安全措施",
        "向船員宣告權益：依 ITF 規定有權拒絕航行；如拒航，公司負擔遣返費用 + 2 個月基本工資補償",
        "依 BMP5 §4 進行全船船員簡報並完成演練（含警報、Citadel 撤離、通訊）",
        "測試所有警報、SSAS、內部通訊、PA 廣播；驗證 UKMTO / MSCIO 緊急聯絡電話在駕駛室與 Citadel",
        "Citadel 已備妥糧食、飲水、衛生用品、衛星電話 + VHF；演練全員撤離至 Citadel 並確認門禁",
        "確認推進機可全速運轉；確認 AIS 維持開啟（軍方追蹤用）但限制資訊欄位",
      ]},
      { phase: "進入 HRA 之後 / During transit", items: [
        "依 §6 提交 Position Report；持續監看 NAVAREA 警報與 UKMTO 更新",
        "管制駕駛室與機艙出入口為單一進入點；非值班船員撤離至 Safe Muster Point",
        "部署反登船障礙：高張力刺鐵絲（730/980mm 線圈直徑）、消防水帶噴射模式、泡沫水砲、探照燈",
        "移除可協助攀爬的繩索、梯子；風暴梯（Pilot Ladder）收回",
        "強化瞭望：增加額外瞭望員、縮短輪值、夜視鏡 / 熱顯像、雷達連續監視",
        "避免漂航、慢速、錨泊；尤其在 MSTC 走廊內全速通過",
        "VHF 減量使用，改用 Email 或衛星電話；只回應已知合法呼叫",
      ]},
      { phase: "若遭遇攻擊 / Under attack", items: [
        "BMP5 §7：啟動警報、廣播 PA、船員撤至 Citadel；持續鳴汽笛干擾攻擊者",
        "立即發送 SSAS（Ship Security Alert System）",
        "通知 UKMTO（+44 1923 958 545 / watchkeepers@ukmto.org）+ MSCIO + 船公司 CSO",
        "增速並進行迴避操作（操船產生水壓船尾效應，比單純加速更有效）",
        "部署所有水砲 / 探照燈；舷外射燈以強光阻撓攻擊者",
        "全員進入 Citadel 後門禁鎖死，與外界保持雙向通訊；軍方介入需「全員確認在 Citadel + 雙向通訊」兩條件",
      ]},
      { phase: "事件後通報 / After incident", items: [
        "對 UKMTO + MSCIO + 船旗國 + 公司 DPA 提交事件報告（BMP5 §7 表單）",
        "對 IMB Piracy Reporting Centre 提交副本",
        "保留 CCTV 錄影、現場照片（船舶受損、攻擊船特徵）",
        "驗證船員人數、傷亡、損害；依 ITF 規定，攻擊當日有額外補償資格",
      ]},
    ],
    benefits: [
      "依 ITF 2026-03-13 規定：最低 5 天戰險加成等於基本工資；其後依實際停留天數加給",
      "雙倍死亡與傷殘補償（compensation doubled for death and disability）",
      "船員享有拒航權；如拒航，公司負擔遣返費 + 兩個月基本工資補償",
      "船東須執行等同 ISPS Level 3 的強化安全措施",
    ],
  },

  // ─── ITF Extended Risk Zone（中層級：BMP 等級提升 + 攻擊當日加成）
  itf_erz: {
    designation:    "ITF Extended Risk Zone (ERZ)",
    designation_cn: "ITF 擴展風險區",
    isps_level:     2,
    bmp_level:      "BMP5 / BMP West Africa（提升至最新版）",
    refs: [
      "BMP5 §4 / §5 / §6",
      "BMP West Africa（如 Gulf of Guinea）",
      "ITF Designation 3 / 9 / 10 — 2026-03-13",
    ],
    phases: [
      { phase: "進入前 / Before entry", items: [
        "依最新 BMP（BMP5 或 BMP West Africa）執行風險評估與航線規劃",
        "通知 MDAT-GoG（西非）或 UKMTO（其它區域）並登記 Vessel Position Report",
        "船員簡報：說明 ITF 攻擊當日加成（100% 基本工資）與雙倍傷亡補償權益",
        "ISPS Security Level 提升至 Level 2",
      ]},
      { phase: "進入後 / During transit", items: [
        "依 BMP 部署反登船障礙；維持強化瞭望",
        "管制入口；Citadel 演練；通訊測試",
        "AIS 維持開啟（除非當地軍方建議關閉）；持續監看區域警報",
      ]},
      { phase: "若遭遇攻擊 / Under attack", items: [
        "啟動警報、SSAS、進入 Citadel；同 WOA 程序",
        "事件報告須提交至國際認可機構（MDAT-GoG 等）以證明 ITF 加成資格",
        "船日誌正式記載攻擊事件",
      ]},
    ],
    benefits: [
      "攻擊當日（且僅當日）享有 100% 基本工資加成",
      "攻擊當日傷亡享雙倍補償",
      "提升 BMP 等級為強制執行條件",
    ],
  },

  // ─── ITF High Risk Area（中高層級：ISPS 3 + 全期加成 + 拒航權）
  itf_hra: {
    designation:    "ITF High Risk Area (HRA)",
    designation_cn: "ITF 高風險區",
    isps_level:     3,
    bmp_level:      "BMP5 + GCPG",
    refs: [
      "BMP5 §4 / §5 / §6 / §7",
      "ITF Designation 7（黑海 HRA）— 2026-03-13",
    ],
    phases: [
      { phase: "進入前 / Before entry", items: [
        "向 UKMTO 提交 Vessel Position Report — Initial Report",
        "ISPS Security Level 設為 Level 3",
        "依 BMP5 完成船員簡報、Citadel 演練、通訊測試",
        "通知船員權益：實際停留期間皆享 100% 基本工資加成；雙倍傷亡補償；可拒航",
      ]},
      { phase: "進入後 / During transit", items: [
        "依 BMP5 §5 部署所有 SPM（Ship Protection Measures）",
        "持續監看 UKMTO / 區域軍方警報",
        "管制出入口、強化瞭望、避免慢速漂航",
      ]},
      { phase: "若遭遇攻擊 / Under attack", items: [
        "依 BMP5 §7 流程；同 WOA 程序",
      ]},
    ],
    benefits: [
      "依 ITF：實際停留 / 通過天數皆享 100% 基本工資加成",
      "雙倍死亡傷殘補償；可拒航 + 2 個月基本工資補償",
      "船東須執行等同 ISPS Level 3 強化安全措施",
    ],
  },

  // ─── 海盜 BMP West Africa（西非適用，補充 ERZ 不足之處）
  piracy_bmp_wa: {
    designation:    "BMP West Africa (Gulf of Guinea)",
    designation_cn: "BMP 西非版（幾內亞灣）",
    isps_level:     2,
    bmp_level:      "BMP West Africa（補 BMP5）",
    refs: [
      "BMP West Africa 4th edition",
      "ITF Designation 3 — Gulf of Guinea ERZ",
      "MDAT-GoG（Maritime Domain Awareness for the Gulf of Guinea）",
    ],
    phases: [
      { phase: "進入前 / Before entry", items: [
        "向 MDAT-GoG 提交 Reporting Form（西非地區的對應 UKMTO 機制）",
        "依 BMP West Africa 進行風險評估，考慮使用區域 Convoy（如有提供）",
        "ISPS Level 提升 Level 2",
        "與保險公司確認 JWC 加費（西非長期戰險區）",
      ]},
      { phase: "進入後 / During transit", items: [
        "部署反登船障礙：刺鐵絲、水砲、探照燈、CCTV",
        "管制出入口；夜間限縮對外通訊",
        "監看 MDAT-GoG 公告、區域海軍動態（奈及利亞、加納）",
      ]},
      { phase: "若遭遇攻擊 / Under attack", items: [
        "通知 MDAT-GoG（+33 2 98 22 88 88）+ 船旗國 + 公司 CSO",
        "啟動 SSAS + 警報 + Citadel 撤離",
        "事件後提交報告予 IMB Piracy Reporting Centre + MDAT-GoG（ITF 攻擊當日加成資格憑證）",
      ]},
    ],
    benefits: [
      "ITF ERZ：攻擊當日 100% 基本工資加成 + 雙倍傷亡補償",
      "BMP 等級提升為強制執行條件",
    ],
  },

  // ─── 自願通報區（reporting）— 進入時觸發「請啟動通報程序」流程
  reporting_general: {
    designation:    "Voluntary Reporting Area (VRA)",
    designation_cn: "自願通報區",
    isps_level:     null,
    bmp_level:      "BMP5 / GCPG（依區域）",
    refs: [
      "BMP5 §6 Reporting / GCPG Section 6",
      "Admiralty Charts Q6099 (WIO) / Q6112+Q6113 (SE Asia) / Q6114 (GoG)",
      "MC(18)48 - Global Counter Piracy Guidance",
    ],
    phases: [
      { phase: "進入 VRA 之前 / Before entering VRA", items: [
        "依該 VRA 所屬機構（MSCIO / MDAT-GoG / IFC Singapore / ReCAAP）取得最新指南與聯絡資訊",
        "船員簡報通報程序：誰、何時、何種頻率送 Initial / Daily / Final Report",
        "確認 SSAS、衛星電話、Email 通訊管道可用",
      ]},
      { phase: "進入 VRA / On entering", items: [
        "提交 **Initial Report**（依該機構表單）— 通常含：船名、IMO、MMSI、Call Sign、入區時間/座標、預計航程、貨物、船員國籍、武裝安全人員（若有）",
        "向 UKMTO（WIO）/ MDAT-GoG（GoG）/ IFC Singapore（SEA）登記船舶移動",
      ]},
      { phase: "在 VRA 期間 / During transit", items: [
        "依規定頻率提交 **Daily Position Report**（通常每 6 或 12 小時一次）",
        "監看區域警報與其他船舶 incident 報告",
        "如遇可疑接近或攻擊，即刻向該 VRA 機構通報 + 對國旗國 / 公司 CSO 同步",
      ]},
      { phase: "離開 VRA / On exit", items: [
        "提交 **Final Report**：離區時間/座標、靠港資訊、有無 incident",
      ]},
    ],
    benefits: [
      "獲得區域軍方 / 護衛艦的即時援助管道",
      "區域安全情資（IRTA / IRTB）共享",
      "船員權益依該 VRA 內的特定子區 ITF 規定（如 ITF WOA / HRA / ERZ）另行適用",
    ],
  },

  // ─── 安全通道（corridor）— 護航走廊 / TSS
  corridor_general: {
    designation:    "Safety Corridor / Transit Scheme",
    designation_cn: "安全通道 / 護航走廊",
    isps_level:     null,
    bmp_level:      "BMP5 §1（MSTC）/ COLREG Rule 10（TSS）",
    refs: [
      "BMP5 §1 Maritime Security Transit Corridor",
      "IMO COLREG Rule 10 Traffic Separation Schemes",
      "Admiralty Chart Q6099（IRTC / BAM TSS）",
      "MSCIO Group Transit Scheme",
    ],
    phases: [
      { phase: "進入通道前 / Before entering corridor", items: [
        "確認船速能保持通道內最低航速（IRTC 內建議全速通過）",
        "向 MSCIO 登記參加 Group Transit（如有提供）",
        "規劃精準的進入點 / 退出點時間，避免在 corridor 外慢速漂航",
      ]},
      { phase: "在通道內 / Inside corridor", items: [
        "全速通過、不漂航、不錨泊（規格 BMP5 §4）",
        "依 COLREG Rule 10 行駛分隔通道（東行 / 西行）",
        "AIS 維持開啟，便於軍方追蹤護航",
        "VHF 維持與護航艦聯絡頻道（IRTC 通常為 VHF 16 + 軍方指定頻道）",
      ]},
      { phase: "出通道 / Exiting corridor", items: [
        "提交 Final Position Report，確認離開時間與下一個 leg 計畫",
      ]},
    ],
    benefits: [
      "獲得軍方護航艦與空中監視涵蓋",
      "享受 Group Transit 編隊優勢（多艘船同時通過降低個別風險）",
      "事故發生時援助到達時間最短",
    ],
  },

  // ─── 制裁區（通用：與 BMP / ITF 無關，著重法律與合規）
  sanction_general: {
    designation:    "Sanctions / Embargo Zone",
    designation_cn: "制裁 / 禁運區",
    isps_level:     null,
    bmp_level:      null,
    refs: [
      "OFAC SDN List / EU Council Reg 833 / UN Security Council Resolutions",
      "船公司法律顧問建議",
    ],
    phases: [
      { phase: "進入前 / Before entry", items: [
        "向法律顧問與 DPA 確認該港 / 該貨主 / 該收貨人是否在 SDN / EU Annex / UN 名單",
        "確認貨物未列入禁運品（武器、軍民兩用、能源產品等）",
        "確認支付通路（避免使用美元結算列名銀行）",
        "考慮取得 OFAC General License 或 EU Annex 例外（如適用）",
        "船東與承租人簽署 Letter of Indemnity（LOI）；確認保險覆蓋",
      ]},
      { phase: "進入後 / During port call", items: [
        "保留完整文件鏈：BOL、貨主、收貨人、船員國籍、付款流水",
        "AIS 維持開啟（**不可關閉 AIS**，避免被列入「影子船隊」嫌疑）",
        "船員離港制度依當地規定（部分制裁港需事先取得船員簽證）",
      ]},
      { phase: "離港後 / After departure", items: [
        "保留所有港口紀錄至少 5 年備查",
        "向公司合規部門提交完整航次報告",
      ]},
    ],
    benefits: [],
  },
};
/* helper：依 action_template key 取出 template；找不到回 null */
window.getZoneActionTemplate = function(key) {
  return key ? (window.ZONE_ACTION_TEMPLATES[key] || null) : null;
};

window.RISK_ZONES = [
  /* Demo: 4 個台灣周邊 PLA 演習區，用於到離區域監控示範 */
  { cat: "military", id: "MIL-TWS-2026", level: "high",
    name: "台灣東部禁航走廊", name_en: "East Taiwan Exclusion Corridor",
    type: "PLA 演習緩衝走廊 / NOTMAR", type_en: "PLA drill buffer corridor / NOTMAR",
    desc: "宜蘭東至台東外海沿 124°E 一帶的細長緩衝走廊；2024-05 / 2024-10 / 2025-12 各次 PLA 海空封鎖演習期間，劃為 NOTMAR 外緣，商船建議經此走廊以東繞行並向 NAVAREA XI 通報。",
    desc_en: "Narrow buffer corridor along 124°E from off Yilan E to Taitung; designated as NOTMAR outer edge during PLA blockade drills (May 2024 / Oct 2024 / Dec 2025). Commercial ships advised to route east of this corridor and report to NAVAREA XI.",
    source: "China MSA NAVAREA XI / Global Taiwan Institute / The Diplomat",
    source_url: "https://www.msa.gov.cn",
    effective_from: "依公告 / per NOTMAR", effective_to: "依公告 / per NOTMAR",
    coords: [[25.3, 123.95], [25.3, 124.10], [21.5, 124.60], [21.5, 124.45]],
    source_kinds: ["official"] },

  { cat: "military", id: "MIL-TW-PENGHU", level: "high",
      name: "澎湖西側演習區", name_en: "Penghu West Drill Zone",
      type: "PLA NOTMAR 臨航禁區", type_en: "PLA NOTMAR exclusion area",
      desc: "澎湖群島西側海域，2024-05「聯合利劍-2024A」首批劃設 6 個演訓區之一；2025-26 仍多次出現於 China MSA 公告，建議商船依 NAVAREA XI 即時繞行。",
      desc_en: "Penghu West offshore — among the 6 boxes designated in PLA Joint Sword 2024A (May 2024); recurrent in China MSA NOTMARs through 2025-26. Commercial ships advised to reroute per NAVAREA XI.",
      source: "China MSA NAVAREA XI / 國防部 NCD 即時通告",
      source_url: "https://www.msa.gov.cn",
      effective_from: "依公告 / per NOTMAR", effective_to: "依公告 / per NOTMAR",
      coords: [[24.10, 118.85], [23.95, 119.75], [23.30, 119.55], [23.45, 118.70]],
      source_kinds: ["official"] },

  { cat: "military", id: "MIL-TW-SW", level: "high",
      name: "台灣西南演習區", name_en: "SW Taiwan Drill Zone",
      type: "PLA NOTMAR 臨航禁區", type_en: "PLA NOTMAR exclusion area",
      desc: "高雄外海至巴士海峽北口，「聯合利劍-2024B」（2024-10-14）演習圈之一；2025-12「Justice Mission 2025」海上實彈延伸至此區。靠近 ETKMS-KHHM 航線。",
      desc_en: "Offshore Kaohsiung to N entrance of Bashi Channel — used in Joint Sword 2024B (Oct 2024) and the maritime live-fire extension of Justice Mission 2025 (Dec 2025). Overlaps ETKMS-KHHM route.",
      source: "China MSA NAVAREA XI / Naval News",
      source_url: "https://www.msa.gov.cn",
      effective_from: "依公告 / per NOTMAR", effective_to: "依公告 / per NOTMAR",
      coords: [[22.50, 117.40], [22.00, 119.70], [20.70, 119.45], [20.60, 117.20]],
      source_kinds: ["official", "web"] },

  { cat: "military", id: "MIL-TW-EAST", level: "high",
      name: "台灣東部演習區", name_en: "East Taiwan Drill Zone",
      type: "PLA / 海空封鎖演練", type_en: "PLA / blockade drill",
      desc: "花蓮東外海至蘇澳東南，2022-08 環台軍演劃設 6 區之一，2024-05 / 2024-10 / 2025-12 各次演訓均再次涵蓋；商船建議經 124°E 以東繞行。",
      desc_en: "Off Hualien E to Su-ao SE — one of the 6 boxes from the Aug 2022 Pelosi-visit drills; reused in May/Oct 2024 and Dec 2025 PLA exercises. Commercial reroute east of 124°E advised.",
      source: "China MSA NAVAREA XI / USNI News",
      source_url: "https://news.usni.org",
      effective_from: "依公告 / per NOTMAR", effective_to: "依公告 / per NOTMAR",
      coords: [[24.40, 122.50], [24.05, 123.80], [21.85, 124.00], [22.00, 122.50]],
      source_kinds: ["official", "web"] }
];

/* ─────────────────────────────────────────────────────────────────
 * 港口錨地 / Anchorage Areas — 獨立於 RISK_ZONES，對應 anchorage 維度監控
 * 涵蓋亞洲 East Asia / Southeast Asia / South Asia 主要商港 41 個
 * Demo 資料：邊界為近似值（港口中心 ±0.08° 5 點多邊形）
 * ───────────────────────────────────────────────────────────────── */
window.ANCHORAGE_AREAS = [
  { id: "ANC-CNSHA", port_code: "CNSHA",
    port_name: "Shanghai Outer Anchorages", port_name_cn: "上海港外錨地",
    region: "East Asia / China",
    desc: "長江口外與洋山深水港外錨地近似範圍",
    source: "Shanghai MSA chart 參考近似",
    coords: [[31.50,121.70],[31.50,122.40],[30.95,122.40],[30.55,122.25],[30.55,122.05],[31.15,121.70]],
    source_kinds: ["official"] },
  { id: "ANC-CNNGB", port_code: "CNNGB",
    port_name: "Ningbo-Zhoushan Outer Anchorages", port_name_cn: "寧波舟山港外錨地",
    region: "East Asia / China",
    desc: "寧波舟山港外與螺頭水道附近錨地近似範圍",
    source: "Ningbo MSA chart 參考近似",
    coords: [[30.10,121.85],[30.10,122.30],[29.75,122.30],[29.75,121.85]],
    source_kinds: ["web"] },
  { id: "ANC-CNQIN", port_code: "CNQIN",
    port_name: "Qingdao", port_name_cn: "青島",
    region: "East Asia / China",
    coords: [[36.15,120.32000000000001],[36.15,120.48],[36.07,120.49600000000001],[35.99,120.48],[35.99,120.32000000000001]],
    source_kinds: ["official"] },
  { id: "ANC-CNTAO", port_code: "CNTAO",
    port_name: "Tianjin / Xingang", port_name_cn: "天津新港",
    region: "East Asia / China",
    coords: [[39.07,117.7],[39.07,117.86],[38.99,117.876],[38.910000000000004,117.86],[38.910000000000004,117.7]],
    source_kinds: ["doc", "official"] },
  { id: "ANC-CNDLC", port_code: "CNDLC",
    port_name: "Dalian", port_name_cn: "大連",
    region: "East Asia / China",
    coords: [[39,121.58],[39,121.74],[38.92,121.756],[38.84,121.74],[38.84,121.58]],
    source_kinds: ["doc", "official"] },
  { id: "ANC-CNXMN", port_code: "CNXMN",
    port_name: "Xiamen Bay Outer Anchorages", port_name_cn: "環廈門灣港外推薦錨區（閩廈港外 11-17）",
    region: "East Asia / China",
    desc: "中國海事局公布閩廈港外 11/12/14/15/16/17 共 6 個推薦錨區，涵蓋環廈門灣（廈門 / 漳州 / 泉州外港）水域",
    source: "中華人民共和國海事局《關於公佈環廈門灣水域港外推薦錨區的通告》",
    coords: [[24.55,117.85],[24.55,118.25],[24.30,118.40],[24.05,118.30],[24.05,117.85]],
    source_kinds: ["doc", "official"] },
  { id: "ANC-CNZHA", port_code: "CNZHA",
    port_name: "Zhangzhou Outer Anchorages", port_name_cn: "漳州港外錨地",
    region: "East Asia / China",
    desc: "漳州外港錨地（涵蓋於環廈門灣港外推薦錨區範圍內，含古雷 / 招商局碼頭外港等）",
    source: "中華人民共和國海事局 / 漳州海事局 參考近似",
    coords: [[24.10,117.70],[24.10,117.95],[23.85,117.95],[23.85,117.70]],
    source_kinds: ["doc", "official"] },
  { id: "ANC-CNQUZ", port_code: "CNQUZ",
    port_name: "Quanzhou Outer Anchorages", port_name_cn: "泉州港外錨地",
    region: "East Asia / China",
    desc: "泉州港外錨地（含圍頭灣 / 肖厝 / 斗尾 等深水錨地）",
    source: "福建海事局 參考近似",
    coords: [[24.95,118.85],[24.95,119.10],[24.70,119.10],[24.70,118.85]],
    source_kinds: ["doc", "official"] },
  { id: "ANC-CNPTN", port_code: "CNPTN",
    port_name: "Pingtan Outer Anchorages", port_name_cn: "平潭港外錨地",
    region: "East Asia / China",
    desc: "平潭港外錨地（草嶼錨地 / 石牌錨地 / 白薑錨地 / 引航檢疫錨地）",
    source: "福州港港口章程 / 福建海事局",
    coords: [[25.45,119.78],[25.45,119.95],[25.30,119.95],[25.30,119.78]] },
  { id: "ANC-CNPTI", port_code: "CNPTI",
    port_name: "Putian Outer Anchorages", port_name_cn: "莆田港外錨地",
    region: "East Asia / China",
    desc: "莆田港外錨地（含秀嶼港 / 東吳港 / 興化灣 等錨地）",
    source: "福建海事局 參考近似",
    coords: [[25.45,119.10],[25.45,119.35],[25.20,119.35],[25.20,119.10]] },
  { id: "ANC-CNNDE", port_code: "CNNDE",
    port_name: "Ningde / Sandu Ao Outer Anchorages", port_name_cn: "寧德三都澳港外錨地",
    region: "East Asia / China",
    desc: "三都澳東衝口錨地 + 30 萬噸級散貨船候潮錨地 + 官井洋錨地（10 萬噸級船舶待泊）",
    source: "福州港港口章程 / 寧德海事局",
    coords: [[26.65,119.78],[26.65,120.00],[26.45,120.00],[26.45,119.78]] },
  { id: "ANC-CNYTN", port_code: "CNYTN",
    port_name: "Yantian / Shenzhen Outer Anchorages", port_name_cn: "深圳鹽田港外錨地",
    region: "East Asia / China",
    desc: "大鵬灣外鹽田港錨地近似範圍",
    source: "Shenzhen MSA chart 參考近似",
    coords: [[22.62,114.20],[22.62,114.40],[22.50,114.40],[22.50,114.20]] },
  { id: "ANC-CNSHK", port_code: "CNSHK",
    port_name: "Shekou (Shenzhen)", port_name_cn: "蛇口",
    region: "East Asia / China",
    coords: [[22.56,113.84],[22.56,114],[22.48,114.016],[22.400000000000002,114],[22.400000000000002,113.84]] },
  { id: "ANC-CNFOC", port_code: "CNFOC",
    port_name: "Fuzhou Jiangyin Anchorage 15W-DWT", port_name_cn: "福州江陰小月嶼 15 萬噸級錨地",
    region: "East Asia / China",
    desc: "福州江陰港主要候潮錨地，5 萬噸級船舶候潮 / 引水 / 檢疫，水深 19-24.1 m（4 點 M1-M4）",
    source: "福州港港口章程 2022.08",
    coords: [[25.221944,119.682778],[25.212778,119.705000],[25.231944,119.695278],[25.241111,119.673611]] },
  { id: "ANC-HKHKG", port_code: "HKHKG",
    port_name: "Hong Kong Anchorages", port_name_cn: "香港錨地",
    region: "East Asia / Hong Kong",
    desc: "涵蓋 Western / Eastern / Tathong / 南丫西 等錨區 — 近似範圍",
    source: "HK Marine Department chart 參考近似",
    coords: [[22.32,114.08],[22.32,114.25],[22.22,114.28],[22.16,114.16],[22.18,114.08]] },
  { id: "ANC-TWKHH-1", port_code: "TWKHH",
    port_name: "Kaohsiung Anchorage 1", port_name_cn: "高雄第一錨區",
    region: "East Asia / Taiwan",
    desc: "進入一港口之中小型船舶及危險品船舶備用錨區（約 11 個錨位）",
    source: "高雄港務分公司 https://kh.twport.com.tw/service/Articles?a=1051",
    coords: [[22.643333,120.249722],[22.665,120.211667],[22.644444,120.211111],[22.620833,120.256944]] },
  { id: "ANC-TWKHH-2", port_code: "TWKHH",
    port_name: "Kaohsiung Anchorage 2", port_name_cn: "高雄第二錨區",
    region: "East Asia / Taiwan",
    desc: "進出一港口船舶（不含危險品船）錨泊（約 18 個錨位）",
    source: "高雄港務分公司 https://kh.twport.com.tw/service/Articles?a=1051",
    coords: [[22.617778,120.251944],[22.616667,120.202778],[22.591667,120.211389],[22.591667,120.270278]] },
  { id: "ANC-TWKHH-3", port_code: "TWKHH",
    port_name: "Kaohsiung Anchorage 3", port_name_cn: "高雄第三錨區",
    region: "East Asia / Taiwan",
    desc: "進出二港口中小型船舶（不含危險品船）錨泊（約 10 個錨位）",
    source: "臺灣港務《各國際商港錨泊使用管理規定》108 年 8 月",
    coords: [[22.571667,120.263056],[22.578611,120.279167],[22.567222,120.263333],[22.570278,120.261111],[22.551111,120.296111],[22.550000,120.225000],[22.571667,120.218333]] },
  { id: "ANC-TWKHH-4", port_code: "TWKHH",
    port_name: "Kaohsiung Anchorage 4", port_name_cn: "高雄第四錨區",
    region: "East Asia / Taiwan",
    desc: "大型散裝及貨櫃船、危險品備用（約 10 個錨位）— PDF 未列 D2，4 點近似",
    source: "臺灣港務《各國際商港錨泊使用管理規定》108 年 8 月",
    coords: [[22.547500,120.298889],[22.529444,120.309722],[22.508333,120.249722],[22.526111,120.238611]] },
  { id: "ANC-TWKHH-5", port_code: "TWKHH",
    port_name: "Kaohsiung Dangerous Goods Anchorage", port_name_cn: "高雄危險品船專用錨區",
    region: "East Asia / Taiwan",
    desc: "專供危險品船拋錨使用，其他船舶不得進入（約 12 個錨位）",
    source: "臺灣港務《各國際商港錨泊使用管理規定》108 年 8 月",
    coords: [[22.591667,120.211389],[22.591667,120.270278],[22.581667,120.277222],[22.571667,120.263056],[22.571667,120.218333]] },
  { id: "ANC-TWKEL", port_code: "TWKEL",
    port_name: "Keelung Anchorage", port_name_cn: "基隆港外海錨泊區",
    region: "East Asia / Taiwan",
    desc: "基隆港外海錨泊區，北防波堤北 1–1.5 浬，水深 32–70 m 沙泥底（WGS-84），4 點 A1-A4",
    source: "臺灣港務《各國際商港錨泊使用管理規定》108 年 8 月",
    coords: [[25.170278,121.736667],[25.210556,121.729444],[25.215833,121.706389],[25.185833,121.697222]] },
  { id: "ANC-TWTXG", port_code: "TWTXG",
    port_name: "Taichung Anchorage", port_name_cn: "臺中港外海錨泊區",
    region: "East Asia / Taiwan",
    desc: "臺中港外海錨泊區 6 點 A-F；A-B-C-D 連線以北 + 經度 120°25′ E 以東為禁止錨泊區",
    source: "臺灣港務《各國際商港錨泊使用管理規定》108 年 8 月",
    coords: [[24.281028,120.494556],[24.281028,120.483167],[24.263528,120.450389],[24.263528,120.436778],[24.233250,120.429833],[24.233250,120.466500]] },
  { id: "ANC-TWTPP", port_code: "TWTPP",
    port_name: "Taipei Anchorage", port_name_cn: "臺北港外海錨泊區",
    region: "East Asia / Taiwan",
    desc: "臺北港外海錨泊區 4 點 A/B/C/D（WGS-84）",
    source: "臺灣港務《各國際商港錨泊使用管理規定》108 年 8 月",
    coords: [[25.170500,121.343167],[25.182833,121.368000],[25.177333,121.373333],[25.164500,121.347833]] },
  { id: "ANC-KRPUS", port_code: "KRPUS",
    port_name: "Busan Anchorages", port_name_cn: "釜山港錨地",
    region: "East Asia / Korea",
    desc: "Busan 北港 + 新港外錨地近似範圍",
    source: "Busan Port Authority chart 參考近似",
    coords: [[35.14,129.00],[35.14,129.18],[35.04,129.20],[34.95,129.10],[34.98,128.95]] },
  { id: "ANC-KRINC", port_code: "KRINC",
    port_name: "Incheon", port_name_cn: "仁川",
    region: "East Asia / Korea",
    coords: [[37.54,126.54],[37.54,126.7],[37.46,126.71600000000001],[37.38,126.7],[37.38,126.54]] },
  { id: "ANC-KRKAN", port_code: "KRKAN",
    port_name: "Gwangyang", port_name_cn: "光陽",
    region: "East Asia / Korea",
    coords: [[35,127.66],[35,127.82],[34.92,127.836],[34.84,127.82],[34.84,127.66]] },
  { id: "ANC-KRULS", port_code: "KRULS",
    port_name: "Ulsan", port_name_cn: "蔚山",
    region: "East Asia / Korea",
    coords: [[35.58,129.28],[35.58,129.44000000000003],[35.5,129.45600000000002],[35.42,129.44000000000003],[35.42,129.28]] },
  { id: "ANC-JPTYO", port_code: "JPTYO",
    port_name: "Tokyo Bay Anchorages", port_name_cn: "東京港錨地",
    region: "East Asia / Japan",
    desc: "東京港外錨地（含 Daini / Honma 等）— 近似範圍",
    source: "Tokyo Port chart 參考近似",
    coords: [[35.66,139.78],[35.66,139.92],[35.55,139.92],[35.55,139.78]] },
  { id: "ANC-JPYOK", port_code: "JPYOK",
    port_name: "Yokohama Anchorages", port_name_cn: "橫濱港錨地",
    region: "East Asia / Japan",
    desc: "橫濱港外錨地（含 Negishi / Honmoku 等）— 近似範圍",
    source: "Yokohama Port chart 參考近似",
    coords: [[35.46,139.62],[35.46,139.74],[35.36,139.74],[35.36,139.62]] },
  { id: "ANC-JPNGO", port_code: "JPNGO",
    port_name: "Nagoya", port_name_cn: "名古屋",
    region: "East Asia / Japan",
    coords: [[35.16,136.79999999999998],[35.16,136.96],[35.08,136.976],[35,136.96],[35,136.79999999999998]] },
  { id: "ANC-JPUKB", port_code: "JPUKB",
    port_name: "Kobe", port_name_cn: "神戶",
    region: "East Asia / Japan",
    coords: [[34.76,135.11999999999998],[34.76,135.28],[34.68,135.296],[34.6,135.28],[34.6,135.11999999999998]] },
  { id: "ANC-JPOSA", port_code: "JPOSA",
    port_name: "Osaka", port_name_cn: "大阪",
    region: "East Asia / Japan",
    coords: [[34.739999999999995,135.35],[34.739999999999995,135.51000000000002],[34.66,135.526],[34.58,135.51000000000002],[34.58,135.35]] },
  { id: "ANC-JPHKT", port_code: "JPHKT",
    port_name: "Hakata (Fukuoka)", port_name_cn: "博多福岡",
    region: "East Asia / Japan",
    coords: [[33.699999999999996,130.32],[33.699999999999996,130.48000000000002],[33.62,130.496],[33.54,130.48000000000002],[33.54,130.32]] },
  { id: "ANC-SGSIN", port_code: "SGSIN",
    port_name: "Singapore Anchorages", port_name_cn: "新加坡港東/西錨區",
    region: "Southeast Asia / Singapore",
    desc: "涵蓋 Eastern (Bunkering / Petroleum / Holding A-C) + Western (VLCC / Petroleum / Sudong / Selat Pauh) — 近似範圍",
    source: "MPA chartlet 參考近似（Port of Singapore Anchorages 2021 ed.）",
    coords: [[1.32,103.55],[1.32,103.96],[1.20,103.96],[1.10,103.78],[1.10,103.55]] },
  { id: "ANC-MYPKG", port_code: "MYPKG",
    port_name: "Port Klang", port_name_cn: "巴生港",
    region: "Southeast Asia / Malaysia",
    coords: [[3.0500000000000003,101.32000000000001],[3.0500000000000003,101.48],[2.97,101.49600000000001],[2.89,101.48],[2.89,101.32000000000001]] },
  { id: "ANC-MYTPP", port_code: "MYTPP",
    port_name: "Tanjung Pelepas", port_name_cn: "丹戎柏勒巴斯",
    region: "Southeast Asia / Malaysia",
    coords: [[1.4400000000000002,103.47],[1.4400000000000002,103.63],[1.36,103.646],[1.28,103.63],[1.28,103.47]] },
  { id: "ANC-MYPEN", port_code: "MYPEN",
    port_name: "Penang", port_name_cn: "檳城",
    region: "Southeast Asia / Malaysia",
    coords: [[5.49,100.26],[5.49,100.42],[5.41,100.436],[5.33,100.42],[5.33,100.26]] },
  { id: "ANC-THLCH", port_code: "THLCH",
    port_name: "Laem Chabang", port_name_cn: "林查班",
    region: "Southeast Asia / Thailand",
    coords: [[13.14,100.8],[13.14,100.96],[13.06,100.976],[12.98,100.96],[12.98,100.8]] },
  { id: "ANC-THBKK", port_code: "THBKK",
    port_name: "Bangkok", port_name_cn: "曼谷",
    region: "Southeast Asia / Thailand",
    coords: [[13.790000000000001,100.47],[13.790000000000001,100.63],[13.71,100.646],[13.63,100.63],[13.63,100.47]] },
  { id: "ANC-VNSGN", port_code: "VNSGN",
    port_name: "Ho Chi Minh / Cai Mep", port_name_cn: "胡志明/蓋梅",
    region: "Southeast Asia / Vietnam",
    coords: [[10.63,106.96000000000001],[10.63,107.12],[10.55,107.13600000000001],[10.47,107.12],[10.47,106.96000000000001]] },
  { id: "ANC-VNHPH", port_code: "VNHPH",
    port_name: "Hai Phong", port_name_cn: "海防",
    region: "Southeast Asia / Vietnam",
    coords: [[20.939999999999998,106.61],[20.939999999999998,106.77],[20.86,106.786],[20.78,106.77],[20.78,106.61]] },
  { id: "ANC-PHMNL", port_code: "PHMNL",
    port_name: "Manila", port_name_cn: "馬尼拉",
    region: "Southeast Asia / Philippines",
    coords: [[14.67,120.88],[14.67,121.03999999999999],[14.59,121.056],[14.51,121.03999999999999],[14.51,120.88]] },
  { id: "ANC-IDJKT", port_code: "IDJKT",
    port_name: "Jakarta (Tanjung Priok)", port_name_cn: "雅加達丹戎不碌",
    region: "Southeast Asia / Indonesia",
    coords: [[-6.02,106.8],[-6.02,106.96],[-6.1,106.976],[-6.18,106.96],[-6.18,106.8]] },
  { id: "ANC-IDSUB", port_code: "IDSUB",
    port_name: "Surabaya", port_name_cn: "泗水",
    region: "Southeast Asia / Indonesia",
    coords: [[-7.12,112.65],[-7.12,112.81],[-7.2,112.82600000000001],[-7.28,112.81],[-7.28,112.65]] },
  { id: "ANC-INNSA", port_code: "INNSA",
    port_name: "Nhava Sheva (Mumbai)", port_name_cn: "尼瓦舍瓦/孟買",
    region: "South Asia / India",
    coords: [[19.029999999999998,72.87],[19.029999999999998,73.03],[18.95,73.046],[18.87,73.03],[18.87,72.87]] },
  { id: "ANC-INMAA", port_code: "INMAA",
    port_name: "Chennai", port_name_cn: "清奈",
    region: "South Asia / India",
    coords: [[13.18,80.22],[13.18,80.38],[13.1,80.396],[13.02,80.38],[13.02,80.22]] },
  { id: "ANC-INCOK", port_code: "INCOK",
    port_name: "Cochin", port_name_cn: "柯枝",
    region: "South Asia / India",
    coords: [[10.05,76.19],[10.05,76.35],[9.97,76.366],[9.89,76.35],[9.89,76.19]] },
  { id: "ANC-BDCGP", port_code: "BDCGP",
    port_name: "Chittagong Outer Anchorage", port_name_cn: "吉大港外錨地",
    region: "South Asia / Bangladesh",
    desc: "Karnaphuli 河口外、Patenga 南方孟加拉灣海面，等候靠泊",
    coords: [[22.22,91.55],[22.22,91.78],[22.13,91.80],[22.00,91.72],[22.00,91.55]] },
  { id: "ANC-LKCMB", port_code: "LKCMB",
    port_name: "Colombo", port_name_cn: "可倫坡",
    region: "South Asia / Sri Lanka",
    coords: [[7.03,79.77],[7.03,79.92999999999999],[6.95,79.946],[6.87,79.92999999999999],[6.87,79.77]] },
  { id: "ANC-PKKHI", port_code: "PKKHI",
    port_name: "Karachi", port_name_cn: "喀拉蚩",
    region: "South Asia / Pakistan",
    coords: [[24.919999999999998,66.93],[24.919999999999998,67.09],[24.84,67.10600000000001],[24.76,67.09],[24.76,66.93]] },
];
