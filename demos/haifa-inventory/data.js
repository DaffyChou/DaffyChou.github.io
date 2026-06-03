// =====================================================
// 海發進銷存系統 - Demo 假資料 (v2 完整流程驗證)
// =====================================================
// 涵蓋 3 類別（物料/配件/維修） × 5 狀態（草稿/送審/不通過/通過/已詢價）
// 並包含 9 位多角色使用者（岸端 5 + 船端 3 + 停用 1）
// =====================================================

const SEED_VERSION = 'v2_2026_05_05';

const DB = {
  // ====== 1. 使用者（含角色與權限）======
  users: [
    // ========= 岸端管理人員 =========
    {id:1, username:'admin', display_name:'王志強', email:'admin@haifa.com.tw',
      dept:'資訊部', role:'系統管理員', side:'岸端',
      assigned_vessels:null, // null = 全部船舶
      permissions:{ read_all:true, write_all:true, see_amount:true, see_vendor_quotes:true, approve:true, approve_level:2 },
      status:'啟用', last_login:'2026/05/05 09:00'},
    {id:2, username:'pm.lin', display_name:'林佳穎', email:'k.lin@haifa.com.tw',
      dept:'採購部', role:'採購主管', side:'岸端',
      assigned_vessels:null,
      permissions:{ read_all:true, write_pr:true, write_rfq:true, write_po:true, see_amount:true, see_vendor_quotes:true, approve:true, approve_level:1 },
      status:'啟用', last_login:'2026/05/05 11:30'},
    {id:3, username:'buyer.chen', display_name:'陳俊宏', email:'m.chen@haifa.com.tw',
      dept:'採購部', role:'採購人員', side:'岸端',
      assigned_vessels:null,
      permissions:{ read_all:true, write_rfq:true, write_po:true, see_amount:true, see_vendor_quotes:true, approve:false },
      status:'啟用', last_login:'2026/05/05 08:30'},
    {id:4, username:'sales.wang', display_name:'王志豪', email:'j.wang@haifa.com.tw',
      dept:'業務部', role:'業務人員', side:'岸端',
      assigned_vessels:null,
      permissions:{ read_all:true, write_owner_quote:true, write_owner_invoice:true, see_amount:true, see_vendor_quotes:false, approve:false },
      status:'啟用', last_login:'2026/05/04 16:22'},
    {id:5, username:'finance.huang', display_name:'黃淑芬', email:'s.huang@haifa.com.tw',
      dept:'財務部', role:'會計', side:'岸端',
      assigned_vessels:null,
      permissions:{ read_all:true, write_invoice:true, see_amount:true, see_vendor_quotes:true, approve:false },
      status:'啟用', last_login:'2026/05/05 13:11'},
    // ========= 船端管理人員 =========
    {id:6, username:'v01.captain', display_name:'張國雄', email:'capt.dfys@haifa.com.tw',
      dept:'船端', role:'船端', side:'船端',
      assigned_vessels:['東方勇士'],
      permissions:{ read_all:false, write_pr:true, see_amount:false, see_vendor_quotes:false, approve:false },
      status:'啟用', last_login:'2026/05/04 22:50'},
    {id:7, username:'v02.captain', display_name:'王浩文', email:'capt.cys@haifa.com.tw',
      dept:'船端', role:'船端', side:'船端',
      assigned_vessels:['長榮山'],
      permissions:{ read_all:false, write_pr:true, see_amount:false, see_vendor_quotes:false, approve:false },
      status:'啟用', last_login:'2026/05/05 06:45'},
    {id:8, username:'v04.captain', display_name:'吳俊毅', email:'capt.myl@haifa.com.tw',
      dept:'船端', role:'船端', side:'船端',
      assigned_vessels:['明陽輪'],
      permissions:{ read_all:false, write_pr:true, see_amount:false, see_vendor_quotes:false, approve:false },
      status:'啟用', last_login:'2026/05/05 07:20'},
    {id:9, username:'p.tsai', display_name:'蔡明傑', email:'p.tsai@haifa.com.tw',
      dept:'採購部', role:'採購人員', side:'岸端',
      assigned_vessels:null,
      permissions:{ read_all:false, write_pr:false, see_amount:false, see_vendor_quotes:false, approve:false },
      status:'停用', last_login:'2026/03/15 10:00'},
  ],

  // ====== 2. 部門 / 職位 / 角色 / 權限矩陣 ======
  departments: [
    {id:1, code:'IT',  name:'資訊部', leader:'王志強', count:2},
    {id:2, code:'PUR', name:'採購部', leader:'林佳穎', count:3},
    {id:3, code:'SAL', name:'業務部', leader:'王志豪', count:1},
    {id:4, code:'FIN', name:'財務部', leader:'黃淑芬', count:1},
    {id:5, code:'SHP', name:'船端',  leader:'船長',   count:3},
  ],
  positions: [
    {id:1, code:'P01', name:'系統管理員', count:1},
    {id:2, code:'P02', name:'採購主管', count:1},
    {id:3, code:'P03', name:'採購人員', count:2},
    {id:4, code:'P04', name:'業務人員', count:1},
    {id:5, code:'P05', name:'會計人員', count:1},
    {id:6, code:'P06', name:'船長', count:3},
    {id:7, code:'P07', name:'輪機長', count:0},
  ],
  roles: [
    {id:1, name:'系統管理員', desc:'全系統最高權限，可審核第二級', user_count:1, users:['admin']},
    {id:2, name:'採購主管',   desc:'採購流程審核（第一級）+ 詢價/採購', user_count:1, users:['pm.lin']},
    {id:3, name:'採購人員',   desc:'執行詢價、採購、驗收', user_count:1, users:['buyer.chen']},
    {id:4, name:'業務人員',   desc:'船東報價、船東請款', user_count:1, users:['sales.wang']},
    {id:5, name:'財務人員',   desc:'廠商請款、退款核銷', user_count:1, users:['finance.huang']},
    {id:6, name:'船端', desc:'限定船舶範圍、不可見金額', user_count:3, users:['v01.captain','v02.captain','v04.captain']},
  ],
  permissions: [
    {module:'使用者管理',     view:['admin'],  create:['admin'], edit:['admin'], delete:['admin']},
    {module:'部門/職位管理',  view:['admin'],  create:['admin'], edit:['admin'], delete:['admin']},
    {module:'系統權限管理',   view:['admin'],  create:['admin'], edit:['admin'], delete:['admin']},
    {module:'船東/船舶/船員', view:['admin','業務人員','採購主管'], create:['admin','業務人員'], edit:['admin','業務人員'], delete:['admin']},
    {module:'請購單（金額）', view:['admin','採購主管','採購人員','業務人員','會計'], create:['admin','船端'], edit:['admin','船端','採購人員'], delete:['admin']},
    {module:'請購單（無金額）', view:['船端'], create:['船端'], edit:['船端'], delete:[]},
    {module:'詢價/綜合詢價',  view:['admin','採購主管','採購人員'], create:['admin','採購人員'], edit:['admin','採購人員'], delete:['admin']},
    {module:'船東報價/請款',  view:['admin','業務人員','會計'], create:['admin','業務人員'], edit:['admin','業務人員'], delete:['admin']},
    {module:'採購/驗收/退款', view:['admin','採購主管','採購人員','會計'], create:['admin','採購人員'], edit:['admin','採購人員'], delete:['admin']},
    {module:'倉庫/入庫/調撥', view:['admin','採購人員','船端'], create:['admin','採購人員','船端'], edit:['admin','採購人員'], delete:['admin']},
    {module:'物料/配件/廠商', view:['admin','採購主管','採購人員'], create:['admin','採購人員'], edit:['admin','採購人員'], delete:['admin']},
  ],

  // ====== 3. 船東 ======
  ship_owners: [
    {id:1, code:'SO-001', name:'長榮海運股份有限公司', short:'長榮海運', tax:'12345678', contact:'李守正', phone:'02-2345-6789', email:'contact@evergreen.com.tw', address:'台北市內湖區民權東路六段188號', vessels:2, currency:'TWD'},
    {id:2, code:'SO-002', name:'陽明海運股份有限公司', short:'陽明海運', tax:'87654321', contact:'王建民', phone:'07-5612-3456', email:'service@yangming.com', address:'高雄市鼓山區明華路271號', vessels:1, currency:'TWD'},
    {id:3, code:'SO-003', name:'萬海航運股份有限公司', short:'萬海航運', tax:'23456789', contact:'陳大偉', phone:'02-2567-8888', email:'info@wanhai.com', address:'台北市中山區松江路136號', vessels:1, currency:'TWD'},
  ],

  // ====== 4. 船舶 ======
  vessels: [
    {id:1, code:'V-001', name:'東方勇士', imo:'IMO9123456', flag:'巴拿馬', type:'貨櫃船', dwt:75000, gross:62000, build:'2018', owner_id:1, owner:'長榮海運', cert_count:38},
    {id:2, code:'V-002', name:'長榮山', imo:'IMO9234567', flag:'賴比瑞亞', type:'貨櫃船', dwt:120000, gross:98000, build:'2020', owner_id:1, owner:'長榮海運', cert_count:43},
    {id:4, code:'V-004', name:'明陽輪', imo:'IMO9456789', flag:'香港', type:'貨櫃船', dwt:95000, gross:78000, build:'2019', owner_id:2, owner:'陽明海運', cert_count:42},
    {id:6, code:'V-006', name:'萬海二號', imo:'IMO9678901', flag:'新加坡', type:'貨櫃船', dwt:68000, gross:55000, build:'2016', owner_id:3, owner:'萬海航運', cert_count:36},
  ],

  // ====== 5. 證書類別 ======
  cert_types: ['船舶國籍證書','船舶檢查證書','載重線證書(LL)','貨船安全構造證書(SC)','貨船安全設備證書(SE)','貨船安全無線電證書(SR)','船舶安全管理證書(SMC)','符合文件(DOC)','船舶保安證書(ISSC)','防止油污染證書(IOPP)'],

  // ====== 6. 船員 ======
  crew: [
    {id:1, no:'C-001', name:'張國雄', position:'船長', id_no:'A12345****', nationality:'中華民國', birth:'1972/05/18', vessel_id:1, vessel:'東方勇士', onboard:'2024/03/15', cert_count:8, status:'在船'},
    {id:2, no:'C-002', name:'王浩文', position:'船長', id_no:'F12345****', nationality:'中華民國', birth:'1970/02/28', vessel_id:2, vessel:'長榮山', onboard:'2024/01/10', cert_count:9, status:'在船'},
    {id:3, no:'C-003', name:'吳俊毅', position:'船長', id_no:'H12345****', nationality:'中華民國', birth:'1971/12/01', vessel_id:4, vessel:'明陽輪', onboard:'2025/01/15', cert_count:8, status:'在船'},
  ],

  // ====== 7. 廠商 ======
  vendors: [
    {id:1, code:'V001', name:'摯誠數位科技有限公司', short_name:'摯誠數位', contact:'吳店長', phone:'02-2789-1234', email:'service@zc-digital.com', address:'台北市信義區', currency:'TWD', tax:'53216547', category:'資訊設備', rating:'A', orders:18, status:'啟用'},
    {id:2, code:'V002', name:'光輝船舶機械有限公司', short_name:'光輝機械', contact:'黃經理', phone:'07-8123-4567', email:'sales@gh-marine.com', address:'高雄市前鎮區', currency:'TWD', tax:'24681357', category:'船舶機械', rating:'A', orders:42, status:'啟用'},
    {id:3, code:'V003', name:'宏達油品股份有限公司', short_name:'宏達油品', contact:'陳業務', phone:'02-2456-7890', email:'order@hd-oil.com.tw', address:'桃園市觀音區', currency:'TWD', tax:'13579246', category:'油料化學', rating:'A', orders:36, status:'啟用'},
    {id:4, code:'V004', name:'安全救生設備有限公司', short_name:'安全救生', contact:'林專員', phone:'07-3456-7890', email:'safety@an-life.com', address:'高雄市楠梓區', currency:'TWD', tax:'97531246', category:'安全設備', rating:'B', orders:12, status:'啟用'},
    {id:5, code:'V005', name:'環球船用塗料公司', short_name:'環球塗料', contact:'蔡業務', phone:'02-2987-6543', email:'paint@gw-coating.com', address:'新北市三重區', currency:'TWD', tax:'15975346', category:'塗料防鏽', rating:'B', orders:9, status:'啟用'},
    {id:6, code:'V006', name:'Marine Tech Singapore Pte Ltd', short_name:'Marine Tech', contact:'Mr. Tan', phone:'+65-6789-0123', email:'order@marinetech.sg', address:'Singapore', currency:'USD', tax:'-', category:'船舶機械', rating:'A', orders:14, status:'啟用'},
  ],

  // ====== 8. 物料 ======
  items_material: [
    {id:1, impa:'550101', name:'潤滑油 SAE 40', unit:'桶', cat:'油料', spec:'200L/桶 SAE40 主機潤滑油', safety:30, stock:30, price:1000, vendor:'宏達油品'},
    {id:2, impa:'591234', name:'柴油濾芯', unit:'個', cat:'濾材', spec:'適用 MAN B&W 主機', safety:50, stock:50, price:3500, vendor:'光輝機械'},
    {id:3, impa:'174562', name:'空氣濾網', unit:'個', cat:'濾材', spec:'渦輪增壓器專用', safety:10, stock:10, price:500, vendor:'光輝機械'},
    {id:4, impa:'751220', name:'船用環氧塗料', unit:'桶', cat:'塗料', spec:'20L/桶 海洋級防鏽', safety:5, stock:8, price:6800, vendor:'環球塗料'},
    {id:5, impa:'330145', name:'救生衣', unit:'件', cat:'安全', spec:'SOLAS 認證 成人型', safety:20, stock:25, price:1800, vendor:'安全救生'},
    {id:6, impa:'330167', name:'救生圈', unit:'個', cat:'安全', spec:'2.5kg 帶反光帶', safety:8, stock:10, price:1200, vendor:'安全救生'},
    {id:7, impa:'330189', name:'EPIRB 應急示位儀', unit:'台', cat:'安全', spec:'406MHz GPS 整合', safety:1, stock:1, price:18500, vendor:'安全救生'},
  ],

  // ====== 9. 配件 ======
  items_part: [
    {id:101, impa:'520101', name:'主機曲軸軸瓦', unit:'套', cat:'主機', spec:'MAN B&W 6S60MC', safety:1, stock:2, price:185000, vendor:'光輝機械'},
    {id:102, impa:'520122', name:'活塞環組', unit:'組', cat:'主機', spec:'φ600 配 6S60MC', safety:2, stock:3, price:42000, vendor:'光輝機械'},
    {id:103, impa:'530102', name:'冷凍壓縮機', unit:'台', cat:'冷凍', spec:'貨櫃冷凍系統 R134a', safety:0, stock:1, price:280000, vendor:'Marine Tech'},
    {id:104, impa:'530108', name:'渦輪軸承', unit:'組', cat:'主機', spec:'ABB A170-L 主軸承', safety:1, stock:1, price:52000, vendor:'光輝機械'},
    {id:105, impa:'540234', name:'發電機調速器', unit:'個', cat:'發電', spec:'400kW 發電機用', safety:0, stock:1, price:65000, vendor:'光輝機械'},
    {id:106, impa:'550789', name:'舵機液壓油泵', unit:'台', cat:'舵機', spec:'高壓 350bar', safety:0, stock:1, price:158000, vendor:'光輝機械'},
  ],

  // ====== 10. 倉庫 ======
  warehouses: [
    {id:1, code:'WH-PORT-01', name:'高雄港口倉庫', type:'港口', vessel:'-', currency:'TWD', value:8650000, items:128, parts:18},
    {id:2, code:'WH-DECK-01', name:'東方勇士-甲板倉庫', type:'甲板', vessel:'東方勇士', currency:'TWD', value:210000, items:45, parts:5},
    {id:3, code:'WH-ENG-01', name:'東方勇士-機艙倉庫', type:'機艙', vessel:'東方勇士', currency:'TWD', value:1280000, items:62, parts:12},
    {id:4, code:'WH-DECK-02', name:'長榮山-甲板倉庫', type:'甲板', vessel:'長榮山', currency:'TWD', value:185000, items:38, parts:4},
    {id:5, code:'WH-ENG-02', name:'長榮山-機艙倉庫', type:'機艙', vessel:'長榮山', currency:'TWD', value:1450000, items:71, parts:14},
    {id:6, code:'WH-DECK-04', name:'明陽輪-甲板倉庫', type:'甲板', vessel:'明陽輪', currency:'TWD', value:142000, items:32, parts:3},
    {id:7, code:'WH-ENG-04', name:'明陽輪-機艙倉庫', type:'機艙', vessel:'明陽輪', currency:'TWD', value:980000, items:58, parts:10},
    {id:8, code:'WH-DECK-06', name:'萬海二號-甲板倉庫', type:'甲板', vessel:'萬海二號', currency:'TWD', value:118000, items:28, parts:2},
  ],

  // ====== 11. 請購單（v2 完整流程資料）======
  // 命名：PR-{類別}-{YYYYMM}-{序號}
  // 類別碼：MAT=物料 / PRT=配件 / REP=維修
  // 狀態：草稿 / 審核中 / 駁回 / 通過 / 已詢價
  purchase_requests: [
    // ============ 物料 (MAT) ============
    {
      id:101, no:'PR-MAT-202605-D01', subject:'東方勇士-5月物料補充（草稿）',
      type:'物料', items:1, applicant:'v01.captain', applicant_name:'張國雄', vessel:'東方勇士', vessel_id:1, owner:'長榮海運',
      send_at:'-', expected_delivery:'2026/05/20',
      status:'草稿', reviewer:'-', reviewed_at:'-', reject_reason:null,
      updated_by:'v01.captain', updated_at:'2026/05/04 21:30:00',
      urgent:false, key_eq:false, warehouse:'東方勇士-甲板倉庫',
      item_list:[
        {impa:'751220', name:'船用環氧塗料', unit:'桶', qty:5, safety:5, stock:8, remark:'甲板防鏽備用', cat:'塗料'}
      ],
      linked_rfqs:[]
    },
    {
      id:102, no:'PR-MAT-202605-S01', subject:'長榮山-5月日常消耗品',
      type:'物料', items:3, applicant:'v02.captain', applicant_name:'王浩文', vessel:'長榮山', vessel_id:2, owner:'長榮海運',
      send_at:'2026/05/03', expected_delivery:'2026/05/15',
      status:'審核中', reviewer:'-', reviewed_at:'-', reject_reason:null,
      updated_by:'v02.captain', updated_at:'2026/05/03 09:15:00',
      urgent:false, key_eq:false, warehouse:'長榮山-機艙倉庫',
      item_list:[
        {impa:'550101', name:'潤滑油 SAE 40', unit:'桶', qty:20, safety:30, stock:15, remark:'5月例行', cat:'油料'},
        {impa:'591234', name:'柴油濾芯', unit:'個', qty:30, safety:50, stock:30, remark:'下月汰換', cat:'濾材'},
        {impa:'174562', name:'空氣濾網', unit:'個', qty:5, safety:10, stock:8, remark:'渦輪維修', cat:'濾材'},
      ],
      linked_rfqs:[]
    },
    {
      id:103, no:'PR-MAT-202605-R01', subject:'明陽輪-塗料採購（被退回）',
      type:'物料', items:2, applicant:'v04.captain', applicant_name:'吳俊毅', vessel:'明陽輪', vessel_id:4, owner:'陽明海運',
      send_at:'2026/04/28', expected_delivery:'2026/05/10',
      status:'駁回', reviewer:'pm.lin', reviewed_at:'2026/04/29 14:20',
      reject_reason:'規格說明不足：請註明環氧塗料的乾膜厚度（DFT）需求與底漆/面漆比例，以利廠商報價。退回後請於 Step 2 補充規格再送審。',
      updated_by:'pm.lin', updated_at:'2026/04/29 14:20:00',
      urgent:false, key_eq:false, warehouse:'明陽輪-甲板倉庫',
      item_list:[
        {impa:'751220', name:'船用環氧塗料', unit:'桶', qty:8, safety:5, stock:2, remark:'(規格不全)', cat:'塗料'},
        {impa:'750890', name:'錨鏈油漆', unit:'桶', qty:4, safety:0, stock:1, remark:'紅丹底漆', cat:'塗料'},
      ],
      linked_rfqs:[]
    },
    {
      id:104, no:'PR-MAT-202605-A01', subject:'東方勇士-5月油料補充',
      type:'物料', items:2, applicant:'v01.captain', applicant_name:'張國雄', vessel:'東方勇士', vessel_id:1, owner:'長榮海運',
      send_at:'2026/05/01', expected_delivery:'2026/05/12',
      status:'通過', reviewer:'pm.lin', reviewed_at:'2026/05/01 16:45', reject_reason:null,
      updated_by:'pm.lin', updated_at:'2026/05/01 16:45:00',
      urgent:false, key_eq:false, warehouse:'東方勇士-機艙倉庫',
      item_list:[
        {impa:'550101', name:'潤滑油 SAE 40', unit:'桶', qty:30, safety:30, stock:0, remark:'已用罄', cat:'油料'},
        {impa:'190450', name:'艙底清潔劑', unit:'桶', qty:3, safety:3, stock:1, remark:'例行', cat:'化學'},
      ],
      linked_rfqs:[]
    },
    {
      id:105, no:'PR-MAT-202605-Q01', subject:'萬海二號-救生設備年度採購',
      type:'物料', items:3, applicant:'v04.captain', applicant_name:'吳俊毅', vessel:'萬海二號', vessel_id:6, owner:'萬海航運',
      send_at:'2026/04/22', expected_delivery:'2026/05/22',
      status:'已詢價', reviewer:'pm.lin', reviewed_at:'2026/04/23 10:00', reject_reason:null,
      updated_by:'buyer.chen', updated_at:'2026/05/02 11:00:00',
      urgent:false, key_eq:true, warehouse:'萬海二號-甲板倉庫',
      item_list:[
        {impa:'330145', name:'救生衣', unit:'件', qty:30, safety:20, stock:18, remark:'SOLAS 認證', cat:'安全'},
        {impa:'330167', name:'救生圈', unit:'個', qty:8, safety:8, stock:6, remark:'帶反光帶', cat:'安全'},
        {impa:'330189', name:'EPIRB 應急示位儀', unit:'台', qty:1, safety:1, stock:0, remark:'年度更新', cat:'安全'},
      ],
      linked_rfqs:['RFQ-MAT-202605-001','RFQ-MAT-202605-002','RFQ-MAT-202605-003']
    },

    // ============ 配件 (PRT) ============
    {
      id:201, no:'PR-PRT-202605-D01', subject:'東方勇士-主機備品（草稿編輯中）',
      type:'配件', items:1, applicant:'v01.captain', applicant_name:'張國雄', vessel:'東方勇士', vessel_id:1, owner:'長榮海運',
      send_at:'-', expected_delivery:'2026/06/01',
      status:'草稿', reviewer:'-', reviewed_at:'-', reject_reason:null,
      updated_by:'v01.captain', updated_at:'2026/05/04 18:00:00',
      urgent:false, key_eq:true, warehouse:'東方勇士-機艙倉庫',
      item_list:[
        {impa:'520122', name:'活塞環組', unit:'組', qty:2, spec:'φ600 配 6S60MC', safety:2, stock:1, remark:'下次靠岸更換', cat:'主機'},
      ],
      linked_rfqs:[]
    },
    {
      id:202, no:'PR-PRT-202605-S01', subject:'長榮山-渦輪增壓器零件',
      type:'配件', items:2, applicant:'v02.captain', applicant_name:'王浩文', vessel:'長榮山', vessel_id:2, owner:'長榮海運',
      send_at:'2026/05/02', expected_delivery:'2026/05/25',
      status:'審核中', reviewer:'-', reviewed_at:'-', reject_reason:null,
      updated_by:'v02.captain', updated_at:'2026/05/02 14:30:00',
      urgent:true, key_eq:true, warehouse:'長榮山-機艙倉庫',
      item_list:[
        {impa:'530108', name:'渦輪軸承', unit:'組', qty:1, spec:'ABB A170-L 主軸承', safety:1, stock:0, remark:'已使用', cat:'主機'},
        {impa:'520122', name:'活塞環組', unit:'組', qty:1, spec:'φ600 配 6S60MC', safety:2, stock:1, remark:'備品', cat:'主機'},
      ],
      linked_rfqs:[]
    },
    {
      id:203, no:'PR-PRT-202605-R01', subject:'東方勇士-發電機調速器（被退回）',
      type:'配件', items:1, applicant:'v01.captain', applicant_name:'張國雄', vessel:'東方勇士', vessel_id:1, owner:'長榮海運',
      send_at:'2026/04/26', expected_delivery:'2026/05/05',
      status:'駁回', reviewer:'admin', reviewed_at:'2026/04/27 09:30',
      reject_reason:'發電機調速器規格不符：本船配備為 MTU 系列，請改填 MTU 16V4000 對應之調速器型號（PR 已附現有設備銘牌但未對應）。退回後請更新規格再送審。',
      updated_by:'admin', updated_at:'2026/04/27 09:30:00',
      urgent:false, key_eq:true, warehouse:'東方勇士-機艙倉庫',
      item_list:[
        {impa:'540234', name:'發電機調速器', unit:'個', qty:1, spec:'400kW 發電機用（規格錯誤）', safety:0, stock:1, remark:'-', cat:'發電'},
      ],
      linked_rfqs:[]
    },
    {
      id:204, no:'PR-PRT-202605-A01', subject:'長榮山-舵機液壓油泵（待詢價）',
      type:'配件', items:1, applicant:'v02.captain', applicant_name:'王浩文', vessel:'長榮山', vessel_id:2, owner:'長榮海運',
      send_at:'2026/05/01', expected_delivery:'2026/06/05',
      status:'通過', reviewer:'pm.lin', reviewed_at:'2026/05/01 17:20', reject_reason:null,
      updated_by:'pm.lin', updated_at:'2026/05/01 17:20:00',
      urgent:false, key_eq:true, warehouse:'長榮山-機艙倉庫',
      item_list:[
        {impa:'550789', name:'舵機液壓油泵', unit:'台', qty:1, spec:'高壓 350bar', safety:0, stock:1, remark:'安全備品', cat:'舵機'},
      ],
      linked_rfqs:[]
    },
    {
      id:205, no:'PR-PRT-202605-Q01', subject:'明陽輪-冷凍機壓縮機更換',
      type:'配件', items:1, applicant:'v04.captain', applicant_name:'吳俊毅', vessel:'明陽輪', vessel_id:4, owner:'陽明海運',
      send_at:'2026/04/20', expected_delivery:'2026/05/25',
      status:'已詢價', reviewer:'admin', reviewed_at:'2026/04/21 11:00', reject_reason:null,
      updated_by:'buyer.chen', updated_at:'2026/05/02 15:30:00',
      urgent:true, key_eq:true, warehouse:'明陽輪-機艙倉庫',
      item_list:[
        {impa:'530102', name:'冷凍壓縮機', unit:'台', qty:1, spec:'貨櫃冷凍系統 R134a', safety:0, stock:0, remark:'已故障，需更換', cat:'冷凍'},
      ],
      linked_rfqs:['RFQ-PRT-202605-001','RFQ-PRT-202605-002']
    },

    // ============ 維修 (REP) ============
    {
      id:301, no:'PR-REP-202605-D01', subject:'東方勇士-渦輪增壓器異音檢修（草稿）',
      type:'維修', items:1, applicant:'v01.captain', applicant_name:'張國雄', vessel:'東方勇士', vessel_id:1, owner:'長榮海運',
      send_at:'-', expected_delivery:'2026/05/18',
      status:'草稿', reviewer:'-', reviewed_at:'-', reject_reason:null,
      updated_by:'v01.captain', updated_at:'2026/05/05 06:30:00',
      urgent:true, key_eq:true, warehouse:'-',
      item_list:[
        {impa:'-', name:'維修：主機 / 渦輪增壓器 (ABB A170-L)', unit:'件', qty:1,
          spec:'巡航時產生規律性低頻噪音', cat:'維修',
          remark:'症狀：渦輪增壓器運轉時產生規律性低頻噪音，巡航 2 小時後溫度偏高 8-10°C；已減載運行。\n目前處置：暫時降速、加強監控\n派工：勘工後派工\n預計港口：高雄'}
      ],
      linked_rfqs:[]
    },
    {
      id:302, no:'PR-REP-202605-S01', subject:'長榮山-雷達校正與零件更換',
      type:'維修', items:1, applicant:'v02.captain', applicant_name:'王浩文', vessel:'長榮山', vessel_id:2, owner:'長榮海運',
      send_at:'2026/05/04', expected_delivery:'2026/05/12',
      status:'審核中', reviewer:'-', reviewed_at:'-', reject_reason:null,
      updated_by:'v02.captain', updated_at:'2026/05/04 10:15:00',
      urgent:false, key_eq:true, warehouse:'-',
      item_list:[
        {impa:'-', name:'維修：駕駛台 / X-Band 雷達', unit:'件', qty:1,
          spec:'雷達畫面有雜訊與漏掃', cat:'維修',
          remark:'症狀：X-Band 雷達畫面長距離偵測有大量雜訊，且 4 點鐘方向有死角。\n目前處置：以 S-Band 替代\n派工：直接派工\n預計港口：基隆'}
      ],
      linked_rfqs:[]
    },
    {
      id:303, no:'PR-REP-202605-R01', subject:'明陽輪-空調故障（被退回）',
      type:'維修', items:1, applicant:'v04.captain', applicant_name:'吳俊毅', vessel:'明陽輪', vessel_id:4, owner:'陽明海運',
      send_at:'2026/04/30', expected_delivery:'2026/05/08',
      status:'駁回', reviewer:'pm.lin', reviewed_at:'2026/04/30 16:45',
      reject_reason:'故障描述過於簡略：「空調壞了」未指出是哪一區（船員艙/駕駛台/機艙）、何時開始、是冷氣或主機問題。請補上具體症狀、發生時機、目前處置與是否影響適航，廠商才能勘工報價。',
      updated_by:'pm.lin', updated_at:'2026/04/30 16:45:00',
      urgent:false, key_eq:false, warehouse:'-',
      item_list:[
        {impa:'-', name:'維修：空調', unit:'件', qty:1,
          spec:'空調壞了', cat:'維修',
          remark:'症狀：空調壞了\n目前處置：-\n派工：勘工後派工'}
      ],
      linked_rfqs:[]
    },
    {
      id:304, no:'PR-REP-202605-A01', subject:'長榮山-冷凍機年度保養',
      type:'維修', items:1, applicant:'v02.captain', applicant_name:'王浩文', vessel:'長榮山', vessel_id:2, owner:'長榮海運',
      send_at:'2026/05/01', expected_delivery:'2026/06/01',
      status:'通過', reviewer:'pm.lin', reviewed_at:'2026/05/01 18:00', reject_reason:null,
      updated_by:'pm.lin', updated_at:'2026/05/01 18:00:00',
      urgent:false, key_eq:false, warehouse:'-',
      item_list:[
        {impa:'-', name:'維修：冷凍機 / 壓縮系統', unit:'件', qty:1,
          spec:'年度例行保養 + 冷媒補充', cat:'維修',
          remark:'症狀：年度例行（無故障）\n目前處置：正常運轉中\n派工：直接派工（指定 Marine Tech）\n預計港口：新加坡'}
      ],
      linked_rfqs:[]
    },
    {
      id:305, no:'PR-REP-202605-Q01', subject:'東方勇士-主機渦輪檢修（已勘工報價）',
      type:'維修', items:1, applicant:'v01.captain', applicant_name:'張國雄', vessel:'東方勇士', vessel_id:1, owner:'長榮海運',
      send_at:'2026/04/15', expected_delivery:'2026/05/15',
      status:'已詢價', reviewer:'admin', reviewed_at:'2026/04/16 09:30', reject_reason:null,
      updated_by:'buyer.chen', updated_at:'2026/05/03 14:00:00',
      urgent:true, key_eq:true, warehouse:'-',
      item_list:[
        {impa:'-', name:'維修：主機 / 渦輪增壓器 (ABB A170-L)', unit:'件', qty:1,
          spec:'軸承異音；溫度偏高；建議拆檢與軸承更換', cat:'維修',
          remark:'症狀：渦輪增壓器持續性異音、軸溫偏高 12°C\n目前處置：減速運行；廠商已勘工\n派工：勘工後派工\n預計港口：高雄'}
      ],
      linked_rfqs:['RFQ-REP-202605-001','RFQ-REP-202605-002']
    },
  ],

  // ====== 12. 詢價單（v2 對應 PR-Q01）======
  rfqs: [
    // ===== 物料 PR-MAT-202605-Q01（萬海二號-救生設備）3 家 =====
    { id:1001, no:'RFQ-MAT-202605-001', subject:'萬海二號-救生設備詢價(安全救生)',
      pr_id:105, pr_no:'PR-MAT-202605-Q01', vessel:'萬海二號',
      vendor_id:4, vendor:'安全救生',
      buyer:'buyer.chen', quoted_at:'2026/04/28', currency:'TWD', items:3, total:104500,
      status:'待審核', reviewed_at:'2026/04/29',
      vendor_workdays:7, vendor_lead_date:'2026/05/06', vendor_remark:'含稅含運。SOLAS 認證庫存充足。',
      attachments:[
        {filename:'安全救生_救生設備報價單_20260428.pdf', uploaded_by:'buyer.chen', uploaded_at:'2026/04/28 16:42'}
      ],
      updated_by:'buyer.chen', updated_at:'2026/04/28 16:42',
      item_list:[
        {impa:'330145', name:'救生衣', unit:'件', qty:30, unit_price:1850, total:55500, lead_days:7},
        {impa:'330167', name:'救生圈', unit:'個', qty:8, unit_price:1300, total:10400, lead_days:5},
        {impa:'330189', name:'EPIRB 應急示位儀', unit:'台', qty:1, unit_price:18600, total:18600, lead_days:14},
      ]
    },
    { id:1002, no:'RFQ-MAT-202605-002', subject:'萬海二號-救生設備詢價(摯誠數位)',
      pr_id:105, pr_no:'PR-MAT-202605-Q01', vessel:'萬海二號',
      vendor_id:1, vendor:'摯誠數位',
      buyer:'buyer.chen', quoted_at:'2026/04/28', currency:'TWD', items:3, total:108600,
      status:'審核不通過', reviewed_at:'2026/04/30',
      vendor_workdays:5, vendor_lead_date:'2026/05/04', vendor_remark:'單價偏高，已詢問是否可調整。',
      reject_reason:'總價較其他兩家高，已選定光輝機械。',
      attachments:[
        {filename:'摯誠數位_救生設備報價_v1.pdf', uploaded_by:'buyer.chen', uploaded_at:'2026/04/28 17:10'}
      ],
      updated_by:'pm.lin', updated_at:'2026/04/30 10:35',
      item_list:[
        {impa:'330145', name:'救生衣', unit:'件', qty:30, unit_price:1900, total:57000, lead_days:5},
        {impa:'330167', name:'救生圈', unit:'個', qty:8, unit_price:1350, total:10800, lead_days:5},
        {impa:'330189', name:'EPIRB 應急示位儀', unit:'台', qty:1, unit_price:19200, total:19200, lead_days:10},
      ]
    },
    { id:1003, no:'RFQ-MAT-202605-003', subject:'萬海二號-救生設備詢價(光輝機械)',
      pr_id:105, pr_no:'PR-MAT-202605-Q01', vessel:'萬海二號',
      vendor_id:2, vendor:'光輝機械',
      buyer:'buyer.chen', quoted_at:'2026/04/29', currency:'TWD', items:3, total:99800,
      status:'審核通過', reviewed_at:'2026/04/30',
      vendor_workdays:14, vendor_lead_date:'2026/05/13', vendor_remark:'交期較長但價格最優。',
      attachments:[
        {filename:'光輝機械_救生設備報價_最終版.pdf', uploaded_by:'buyer.chen', uploaded_at:'2026/04/29 09:15'},
        {filename:'光輝機械_合作條件說明.docx', uploaded_by:'pm.lin', uploaded_at:'2026/04/30 11:20'}
      ],
      updated_by:'pm.lin', updated_at:'2026/04/30 11:20',
      item_list:[
        {impa:'330145', name:'救生衣', unit:'件', qty:30, unit_price:1750, total:52500, lead_days:14},
        {impa:'330167', name:'救生圈', unit:'個', qty:8, unit_price:1200, total:9600, lead_days:14},
        {impa:'330189', name:'EPIRB 應急示位儀', unit:'台', qty:1, unit_price:18000, total:18000, lead_days:21},
      ]
    },

    // ===== 配件 PR-PRT-202605-Q01（明陽輪-冷凍機壓縮機）2 家 =====
    { id:1004, no:'RFQ-PRT-202605-001', subject:'明陽輪-冷凍機壓縮機詢價(Marine Tech)',
      pr_id:205, pr_no:'PR-PRT-202605-Q01', vessel:'明陽輪',
      vendor_id:6, vendor:'Marine Tech',
      buyer:'buyer.chen', quoted_at:'2026/04/26', currency:'USD', items:1, total:9500,
      status:'待審核', reviewed_at:'2026/04/27',
      vendor_workdays:14, vendor_lead_date:'2026/05/10', vendor_remark:'Original spare from manufacturer; 1-yr warranty.',
      attachments:[
        {filename:'MarineTech_Compressor_Quotation.pdf', uploaded_by:'buyer.chen', uploaded_at:'2026/04/26 14:00'}
      ],
      updated_by:'buyer.chen', updated_at:'2026/04/27 11:10',
      item_list:[
        {impa:'530102', name:'冷凍壓縮機', unit:'台', qty:1, unit_price:9500, total:9500, lead_days:14},
      ]
    },
    { id:1005, no:'RFQ-PRT-202605-002', subject:'明陽輪-冷凍機壓縮機詢價(光輝機械)',
      pr_id:205, pr_no:'PR-PRT-202605-Q01', vessel:'明陽輪',
      vendor_id:2, vendor:'光輝機械',
      buyer:'buyer.chen', quoted_at:'2026/04/27', currency:'TWD', items:1, total:295000,
      status:'待審核', reviewed_at:'2026/04/28',
      vendor_workdays:7, vendor_lead_date:'2026/05/04', vendor_remark:'非原廠副廠件，半年保固。可即時調貨。',
      attachments:[
        {filename:'光輝機械_壓縮機報價.pdf', uploaded_by:'buyer.chen', uploaded_at:'2026/04/27 15:30'}
      ],
      updated_by:'buyer.chen', updated_at:'2026/04/28 09:40',
      item_list:[
        {impa:'530102', name:'冷凍壓縮機', unit:'台', qty:1, unit_price:295000, total:295000, lead_days:7},
      ]
    },

    // ===== 維修 PR-REP-202605-Q01（東方勇士-主機渦輪檢修）2 家 =====
    { id:1006, no:'RFQ-REP-202605-001', subject:'東方勇士-渦輪檢修勘工報價(光輝機械)',
      pr_id:305, pr_no:'PR-REP-202605-Q01', vessel:'東方勇士',
      vendor_id:2, vendor:'光輝機械',
      buyer:'buyer.chen', quoted_at:'-', currency:'TWD', items:0, total:0,
      status:'詢價中', reviewed_at:'-',
      vendor_workdays:null, vendor_lead_date:'', vendor_remark:'廠商已派員勘工中，預計 5/8 提供報價。',
      attachments:[],
      updated_by:'buyer.chen', updated_at:'2026/04/25 09:00',
      item_list:[]
    },
    { id:1007, no:'RFQ-REP-202605-002', subject:'東方勇士-渦輪檢修勘工報價(Marine Tech)',
      pr_id:305, pr_no:'PR-REP-202605-Q01', vessel:'東方勇士',
      vendor_id:6, vendor:'Marine Tech',
      buyer:'buyer.chen', quoted_at:'2026/04/26', currency:'USD', items:3, total:4200,
      status:'審核通過', reviewed_at:'2026/04/27',
      vendor_workdays:5, vendor_lead_date:'2026/05/01', vendor_remark:'Includes inspection, parts and 2-day labor; can dispatch within 48hr.',
      attachments:[
        {filename:'MarineTech_TurboInspection_Quote.pdf', uploaded_by:'buyer.chen', uploaded_at:'2026/04/26 13:20'},
        {filename:'勘工報告_TurboBearing.pdf', uploaded_by:'buyer.chen', uploaded_at:'2026/04/26 13:25'}
      ],
      updated_by:'pm.lin', updated_at:'2026/04/27 16:00',
      item_list:[
        {impa:'-', name:'Inspection Fee', unit:'件', qty:1, unit_price:600, total:600, lead_days:1},
        {impa:'530108', name:'Turbocharger Bearing Replacement', unit:'set', qty:1, unit_price:2800, total:2800, lead_days:5},
        {impa:'-', name:'Technician Labor', unit:'man-day', qty:2, unit_price:400, total:800, lead_days:5},
      ]
    },
  ],

  pr_items_demo:[],

  // ====== 14. 其他模組沿用既有資料（簡化）======
  consolidated:[],
  owner_quotes:[],
  owner_invoices:[],
  purchase_orders:[],
  work_orders:[],
  acceptance:[],
  refunds:[],
  inbounds:[],
  transfers:[],
  issues:[],
  inventory_plans:[],
  repair_requests:[],
};

// ====== 狀態 → badge ======
const STATUS_COLOR = {
  '草稿':'b-gray', '審核中':'b-yellow','通過':'b-green','駁回':'b-red',
  '已詢價':'b-blue','請購完結':'b-dark',
  '詢價中':'b-yellow','待審核':'b-blue','審核通過':'b-green','審核不通過':'b-red',
  '場勘中':'b-yellow','已派工':'b-blue','送修中':'b-purple','退回補件':'b-red',
  '待拆卸':'b-gray','待出貨':'b-yellow','報價中':'b-yellow','維修中':'b-blue','已返船':'b-blue','結案':'b-green',
  '已寄出':'b-blue','已接受':'b-green','已開立':'b-yellow','已收款':'b-green',
  '部分退款':'b-purple','已下單':'b-blue','部分驗收':'b-yellow','已驗收':'b-green',
  '部分退貨':'b-red','驗收通過':'b-green','驗收不通過':'b-red',
  '已派工':'b-blue','施工中':'b-yellow','已完工':'b-green',
  '已退款':'b-green','核准中':'b-yellow','已入庫':'b-green',
  '運送中':'b-blue','已收貨':'b-green','已領用':'b-green',
  '進行中':'b-yellow','未開始':'b-gray','已完成':'b-green',
  '已產生採購單':'b-green','已比價':'b-blue',
  '在船':'b-green','休假':'b-yellow','離職':'b-gray',
  '啟用':'b-green','停用':'b-gray',
  '已回覆':'b-green','有效':'b-green'
};
function statusBadge(s){
  const cls = STATUS_COLOR[s] || 'b-gray';
  return `<span class="b ${cls}">${s}</span>`;
}
