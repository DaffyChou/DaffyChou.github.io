// =====================================================
// 海發進銷存系統 Demo - 主程式
// =====================================================

// ---------- 全域狀態 + 持久化 ----------
const STATE = (function(){
  let s = {};
  try { s = JSON.parse(localStorage.getItem('haifa_state') || '{}'); } catch(e){ s = {}; }
  if (!s.draftPR) s.draftPR = createEmptyDraftPR();
  const empty = createEmptyDraftPR();
  for (const k of Object.keys(empty)){
    if (s.draftPR[k] === undefined) s.draftPR[k] = empty[k];
  }
  if (!s.draftPR.repair_meta) s.draftPR.repair_meta = empty.repair_meta;
  if (!s.activityLog) s.activityLog = [];
  if (!s.submittedPRs) s.submittedPRs = [];
  if (!s.savedDrafts) s.savedDrafts = [];
  if (!s.rmaOrders) s.rmaOrders = [];
  if (!s.workOrders) s.workOrders = [];
  if (!s.inspections) s.inspections = []; // 場勘
  if (!s.repairingItems) s.repairingItems = {}; // {impa:{rma_no,since}} 標示送修中
  // 種子版本變更時清空使用者狀態（只保留 currentUserId）
  if (s.seed_version !== (typeof SEED_VERSION!=='undefined'?SEED_VERSION:'v1')){
    s.draftPR = createEmptyDraftPR();
    s.activityLog = [];
    s.submittedPRs = [];
    s.savedDrafts = [];
    s.seed_version = (typeof SEED_VERSION!=='undefined'?SEED_VERSION:'v1');
  }
  if (!s.currentUserId) s.currentUserId = 1; // 預設 admin
  return s;
})();

// ====== 權限與使用者切換 ======
function currentUser(){
  return DB.users.find(u=>u.id===STATE.currentUserId) || DB.users[0];
}
function setCurrentUser(uid){
  const u = DB.users.find(x=>x.id===uid);
  if (!u){ toast('找不到使用者'); return; }
  if (u.status==='停用'){ toast('該使用者已停用'); return; }
  STATE.currentUserId = uid;
  saveState();
  logActivity('切換登入身分', u.username, u.display_name+'（'+u.role+'）');
  closeModal(); render();
  toast('已切換為 '+u.display_name+' / '+u.role);
}
function canSeeAmount(){ return !!currentUser().permissions.see_amount; }
function canSeeVendorQuotes(){ return !!currentUser().permissions.see_vendor_quotes; }
function canApprove(){ return !!currentUser().permissions.approve; }
function canApproveLevel(){ return currentUser().permissions.approve_level || 0; }
function canCreatePR(){
  const u = currentUser();
  return u.side==='船端' || u.role==='系統管理員';
}
function canSeeVessel(vesselName){
  const u = currentUser();
  if (u.assigned_vessels==null) return true; // 全部
  return u.assigned_vessels.includes(vesselName);
}
function canSeeModule(module){
  // 以 DB.permissions 表查詢；以 role 名稱比對
  const u = currentUser();
  const p = DB.permissions.find(x=>x.module===module);
  if (!p) return true;
  return p.view.includes('admin') && u.role==='系統管理員'
      || p.view.includes(u.role);
}
function filterPRsByUser(prs){
  return prs.filter(p=>canSeeVessel(p.vessel));
}
function filterRFQsByUser(rfqs){
  return rfqs.filter(r=>canSeeVessel(r.vessel));
}
function priceText(amount, currency){
  if (!canSeeAmount()) return '<span class="text-muted" title="權限不足">- - -</span>';
  return (currency==='USD'?'$':'NT$')+' '+amount.toLocaleString();
}
function openUserSwitcher(){
  const cur = currentUser();
  const html = `
    <p class="text-muted">這是 demo 用切換器；正式版會接 SSO 登入。每個身分有不同權限與可見範圍。</p>
    <table class="tbl">
      <thead><tr>
        <th></th><th>姓名 / 帳號</th><th>角色</th><th>類別</th><th>可看船舶</th><th>可看金額</th><th>可審核</th><th>狀態</th>
      </tr></thead>
      <tbody>
        ${DB.users.map(u=>{
          const isCur = cur.id === u.id;
          const isOff = u.status==='停用';
          return `<tr style="${isCur?'background:#eef2fb':(isOff?'opacity:.5':'')}">
            <td><button class="btn-x ${isCur?'btn-primary':'btn-outline'}" ${isOff?'disabled':''} onclick="setCurrentUser(${u.id})">${isCur?'目前':(isOff?'停用':'切換')}</button></td>
            <td><strong>${u.display_name}</strong><br><small class="text-muted">${u.username}</small></td>
            <td>${u.role}</td>
            <td>${u.side==='岸端'?'<span class="b b-blue">岸端</span>':'<span class="b b-purple">船端</span>'}</td>
            <td>${u.assigned_vessels ? u.assigned_vessels.join('、') : '<span class="text-muted">全部</span>'}</td>
            <td>${u.permissions.see_amount?'<i class="bi bi-check-lg" style="color:#22c55e"></i>':'<i class="bi bi-x-lg" style="color:#ef4444"></i>'}</td>
            <td>${u.permissions.approve?'<i class="bi bi-check-lg" style="color:#22c55e"></i>':'<i class="bi bi-dash-lg text-muted"></i>'}</td>
            <td>${statusBadge(u.status)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="text-muted mt-2" style="font-size:12px"><i class="bi bi-info-circle"></i> 切換使用者後，請購單列表、詢價單、金額欄位會依該角色權限重新呈現。</div>
  `;
  openModal('切換登入身分（demo）', html, `<button class="btn-x btn-outline" onclick="closeModal()">關閉</button>`, true);
}
function createEmptyDraftPR(){
  return {
    draft_id: null, // 暫存後分配，用來識別該草稿在 savedDrafts 中的條目
    step:1, // 目前步驟 1-4
    subject:'', category:'',
    send_at: new Date().toISOString().slice(0,10),
    expected_delivery:'',
    applicant:'admin', owner:'', vessel:'', warehouse:'',
    urgent:false, key_eq:false,
    items:[],
    attachments:[],
    buyer_note:'', expected_vendors:[],
    repair_meta:{ equipment:'', part_no:'', timing:'', symptom:'', current_action:'', dispatch_type:'勘工後派工', target_port:'' },
    equipment_path:'',
    last_saved_at: null,
    created_at: new Date().toISOString()
  };
}
// 簡化的設備樹資料（AMOS Position 風格）
const DEVICE_TREE = [
  { lvl:1, name:'主機 (MAN B&W 6S60MC)', children:[
    { lvl:2, name:'活塞組', items:[
      { impa:'520122', name:'活塞環組', unit:'組', spec:'φ600 配 6S60MC' },
      { impa:'520125', name:'活塞銷', unit:'個', spec:'φ200×580mm' },
      { impa:'520101', name:'主機曲軸軸瓦', unit:'套', spec:'MAN B&W 6S60MC' },
    ]},
    { lvl:2, name:'渦輪增壓器 (ABB A170-L)', items:[
      { impa:'530108', name:'渦輪軸承', unit:'組', spec:'A170-L 主軸承' },
      { impa:'530112', name:'渦輪葉片', unit:'組', spec:'A170-L 壓縮端' },
    ]},
    { lvl:2, name:'冷卻系統', items:[
      { impa:'520301', name:'缸套冷卻 O-ring', unit:'組', spec:'矽膠耐高溫' },
    ]},
  ]},
  { lvl:1, name:'發電機 (Yanmar 6N18AL-EV)', children:[
    { lvl:2, name:'本體', items:[
      { impa:'540234', name:'發電機調速器', unit:'個', spec:'400kW 發電機用' },
      { impa:'540256', name:'發電機軸承', unit:'套', spec:'NSK 6320' },
    ]},
  ]},
  { lvl:1, name:'舵機 (Rolls-Royce SR723)', children:[
    { lvl:2, name:'液壓系統', items:[
      { impa:'550789', name:'舵機液壓油泵', unit:'台', spec:'高壓 350bar' },
      { impa:'550792', name:'液壓油管', unit:'米', spec:'φ25 SAE100R2' },
    ]},
  ]},
  { lvl:1, name:'錨機 (MacGregor HHW-50T)', children:[
    { lvl:2, name:'動力', items:[
      { impa:'560111', name:'錨機馬達', unit:'台', spec:'30kW 三相感應馬達' },
    ]},
  ]},
  { lvl:1, name:'冷凍機 (Marine Tech)', children:[
    { lvl:2, name:'壓縮系統', items:[
      { impa:'530102', name:'冷凍壓縮機', unit:'台', spec:'貨櫃冷凍系統' },
      { impa:'530105', name:'冷媒 R134a', unit:'桶', spec:'13.6kg/桶' },
    ]},
  ]},
];

// ---------- Wizard 步驟操作 ----------
function gotoStep(n){
  STATE.draftPR.step = n;
  saveState();
  render();
}
function nextStep(){
  const errs = validateStep(STATE.draftPR.step);
  if (errs.length){ window.__stepErrors = errs; render(); toast('請先修正 '+errs.length+' 個錯誤'); return; }
  window.__stepErrors = [];
  STATE.draftPR.step = Math.min(4, STATE.draftPR.step+1);
  saveState();
  logActivity('進入步驟 '+STATE.draftPR.step, '草稿請購單', '');
  render();
}
function prevStep(){
  window.__stepErrors = [];
  STATE.draftPR.step = Math.max(1, STATE.draftPR.step-1);
  saveState();
  render();
}
function validateStep(step){
  const d = STATE.draftPR;
  const errs = [];
  if (step===1){
    if (!d.vessel) errs.push({field:'vessel', msg:'請選擇船舶'});
    if (!d.category) errs.push({field:'category', msg:'請選擇請購類別'});
    if (!d.subject || d.subject.trim().length<5) errs.push({field:'subject', msg:'請購主旨需至少 5 個字'});
    if (!d.send_at) errs.push({field:'send_at', msg:'請選擇送審日期'});
    if (d.expected_delivery && d.send_at && d.expected_delivery < d.send_at) errs.push({field:'expected_delivery', msg:'期望到貨日不能早於送審日'});
    if (d.expected_delivery && d.send_at && !d.urgent){
      const days = Math.floor((new Date(d.expected_delivery)-new Date(d.send_at))/86400000);
      if (days<3) errs.push({field:'expected_delivery', msg:'期望到貨日距送審日至少 3 天，若情況緊急請於下一步勾選「緊急需求」'});
    }
    if (d.category!=='維修' && !d.warehouse) errs.push({field:'warehouse', msg:'物料/配件類請購需指定收貨倉庫'});
  }
  if (step===2){
    if (d.category==='維修'){
      const m = d.repair_meta || {};
      if (!m.equipment) errs.push({field:'equipment', msg:'請填寫對應設備'});
      if (!m.symptom || m.symptom.length<10) errs.push({field:'symptom', msg:'故障症狀需至少 10 字'});
      // 自動同步以確保 items[0] 存在
      if (m.equipment && m.symptom && d.items.length===0){
        syncRepairMetaToItem();
      }
    } else {
      if (d.items.length===0) errs.push({field:'items', msg:'請至少加入一個品項'});
      d.items.forEach((it,i)=>{ if (!it.qty || it.qty<=0) errs.push({field:'item_'+i, msg:'第 '+(i+1)+' 項「'+it.name+'」數量需大於 0'}); });
    }
  }
  if (step===3){
    if (d.key_eq && d.attachments.length===0) errs.push({field:'attachments', msg:'勾選「關鍵裝備」時需至少附上一張銘牌或現場照'});
  }
  return errs;
}
// 補充欄位操作
function updateRepairMeta(field, value){
  STATE.draftPR.repair_meta[field] = value;
  syncRepairMetaToItem();
  saveState();
}
function syncRepairMetaToItem(){
  const d = STATE.draftPR;
  if (d.category !== '維修') return;
  const m = d.repair_meta || {};
  if (!m.equipment){
    d.items = [];
    return;
  }
  // 自動將自訂設備加入系統清單
  if (!STATE.customEquipment) STATE.customEquipment = [];
  const sysEq = [];
  if (typeof DEVICE_TREE !== 'undefined'){
    DEVICE_TREE.forEach(n1=>n1.children.forEach(n2=>sysEq.push(n1.name+' / '+n2.name)));
  }
  if (m.equipment && !sysEq.includes(m.equipment) && !STATE.customEquipment.includes(m.equipment)){
    STATE.customEquipment.push(m.equipment);
  }
  d.items = [{
    impa:'-', name:'維修：'+m.equipment, unit:'件', cat:'維修',
    spec: (m.symptom||'').slice(0,80),
    safety:0, stock:0, qty:1,
    remark: '症狀：'+(m.symptom||'')
      + '\n影響程度：'+(m.impact||'-')
      + (m.timing?'\n發生時機：'+m.timing:'')
      + (m.current_action?'\n目前處置：'+m.current_action:'')
      + (m.dispatch_type?'\n建議派工：'+m.dispatch_type:'')
      + (m.target_port?'\n預計港口：'+m.target_port:'')
  }];
}
function toggleAttrFlag(flag){
  STATE.draftPR[flag] = !STATE.draftPR[flag];
  saveState();
  logActivity('切換屬性', '草稿請購單', flag+' = '+(STATE.draftPR[flag]?'on':'off'));
  render();
}
function addMockAttachment(){
  // 模擬附件（demo 不上傳真檔）
  const samples = [
    {name:'故障照片_'+(STATE.draftPR.attachments.length+1)+'.jpg', size:1234567, type:'image'},
    {name:'設備銘牌.png', size:892334, type:'image'},
    {name:'廠商上次報價.pdf', size:312540, type:'pdf'},
    {name:'規格說明.docx', size:48902, type:'docx'},
  ];
  const att = samples[STATE.draftPR.attachments.length % samples.length];
  STATE.draftPR.attachments.push(att);
  saveState();
  logActivity('上傳附件', '草稿請購單', att.name);
  render();
  toast('已加入附件：'+att.name);
}
function removeAttachment(idx){
  const a = STATE.draftPR.attachments[idx];
  STATE.draftPR.attachments.splice(idx,1);
  saveState();
  logActivity('移除附件', '草稿請購單', a?.name||'');
  render();
}
// 配件設備樹
function selectEqNode(path){
  STATE.draftPR.equipment_path = path;
  saveState();
  render();
}
function addPartFromTree(impa, name, unit, spec){
  const existing = STATE.draftPR.items.find(i=>i.impa===impa);
  if (existing){ toast('「'+name+'」已加入'); return; }
  STATE.draftPR.items.push({ impa, name, unit, cat:'配件', spec, safety:0, stock:0, qty:1, remark:'' });
  saveState();
  logActivity('加入配件', '草稿請購單', name);
  render();
}
// 維修：把 repair_meta 變成一個 item 加入 items（這樣後續可以走相同 schema）
function commitRepairItem(){
  const m = STATE.draftPR.repair_meta;
  if (!m.equipment){ toast('請填寫對應設備'); return; }
  if (!m.symptom || m.symptom.length<10){ toast('請描述故障症狀（至少 10 字）'); return; }
  // 自動將自訂設備加入系統清單
  if (!STATE.customEquipment) STATE.customEquipment = [];
  const sysEq = [];
  DEVICE_TREE.forEach(n1=>n1.children.forEach(n2=>sysEq.push(n1.name+' / '+n2.name)));
  if (!sysEq.includes(m.equipment) && !STATE.customEquipment.includes(m.equipment)){
    STATE.customEquipment.push(m.equipment);
    logActivity('自動新增設備', m.equipment, '由維修申請自動帶入');
  }
  const photos = (STATE.draftPR.attachments||[]).filter(a=>a.kind==='photo');
  STATE.draftPR.items = [{
    impa:'-', name:'維修：'+m.equipment, unit:'件', cat:'維修',
    spec: m.symptom.slice(0,80),
    safety:0, stock:0, qty:1,
    remark: '症狀：'+m.symptom
      +'\n影響程度：'+(m.impact||'-')
      +(m.current_action?'\n目前處置：'+m.current_action:'')
      +(m.timing?'\n發生時機：'+m.timing:'')
      +(m.dispatch_type?'\n建議派工：'+m.dispatch_type:'')
      +(m.target_port?'\n預計港口：'+m.target_port:'')
      +(photos.length?'\n附圖：'+photos.length+' 張':'')
  }];
  saveState();
  logActivity('建立維修項目', '草稿請購單', m.equipment);
  toast('維修需求已寫入請購項目');
  render();
}
function saveState(){
  // 若 draftPR 已有 draft_id，自動同步該條目到 savedDrafts（背景）
  if (STATE.draftPR && STATE.draftPR.draft_id){
    const idx = STATE.savedDrafts.findIndex(x=>x.id===STATE.draftPR.draft_id);
    if (idx>=0){
      const d = STATE.draftPR;
      const e = STATE.savedDrafts[idx];
      e.draft = JSON.parse(JSON.stringify(d));
      e.summary = makeDraftSummary(d);
      e.vessel = d.vessel; e.category = d.category; e.items = d.items.length;
      e.urgent = d.urgent; e.key_eq = d.key_eq;
      // saved_at 由顯式「暫存」更新；自動同步只更新 auto_synced_at
      e.auto_synced_at = new Date().toLocaleString('zh-TW',{hour12:false}).replace(/\//g,'/');
    }
  }
  try { localStorage.setItem('haifa_state', JSON.stringify(STATE)); } catch(e){}
}
function makeDraftSummary(d){
  const parts = [];
  parts.push(d.subject ? d.subject : '(未填主旨)');
  if (d.vessel) parts.push(d.vessel);
  if (d.category) parts.push(d.category);
  parts.push(d.items.length+' 項');
  return parts.join(' ・ ');
}
function logActivity(action, target, detail){
  const now = new Date();
  const t = now.getFullYear()+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+String(now.getDate()).padStart(2,'0')+
    ' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');
  STATE.activityLog.unshift({ time:t, user:'admin', action, target: target||'-', detail: detail||'' });
  if (STATE.activityLog.length > 200) STATE.activityLog.length = 200;
  saveState();
}
function clearAllState(){
  if (!confirm('確定要重置所有 demo 狀態（包括草稿請購單、操作紀錄）？')) return;
  localStorage.removeItem('haifa_state');
  Object.assign(STATE, { draftPR:createEmptyDraftPR(), activityLog:[], submittedPRs:[] });
  toast('已重置 demo 狀態');
  render();
}

// ---------- 草稿請購單 - 操作 ----------
function updateDraftPRField(field, value){
  STATE.draftPR[field] = value;
  saveState();
}
function changeDraftPRCategory(value){
  if (STATE.draftPR.category === value) return;
  // 從空 → 有值不需確認；從有值 → 改變才需要確認
  if (STATE.draftPR.category && STATE.draftPR.items.length > 0){
    if (!confirm('切換到「'+value+'」會清空 '+STATE.draftPR.items.length+' 個已加入的'+STATE.draftPR.category+'品項（兩種類別的品項型態不同）。已輸入的主旨、船舶、附件會保留。\n\n確定切換？')){
      render();
      return;
    }
    logActivity('清空請購項目', '草稿請購單', '因類別切換為「'+value+'」清空 '+STATE.draftPR.items.length+' 項');
    STATE.draftPR.items = [];
  }
  STATE.draftPR.category = value;
  // 重置設備樹路徑與維修中繼欄位
  if (value!=='配件') STATE.draftPR.equipment_path = '';
  saveState();
  logActivity('切換請購類別', '草稿請購單', '改為「'+value+'」');
  render();
}
function updateDraftItemField(idx, field, value){
  if (!STATE.draftPR.items[idx]) return;
  STATE.draftPR.items[idx][field] = (field==='qty' ? (parseFloat(value)||0) : value);
  saveState();
}
function removeDraftItem(idx){
  const it = STATE.draftPR.items[idx];
  if (!it) return;
  if (!confirm('確定移除「'+it.name+'」？')) return;
  STATE.draftPR.items.splice(idx,1);
  saveState();
  logActivity('移除請購項目', '草稿請購單', it.name);
  render();
}
function addItemsFromPicker(){
  const rows = document.querySelectorAll('#modalBody tr[data-impa]');
  let added = 0, names = [];
  rows.forEach(r=>{
    const cb = r.querySelector('input.pick-cb');
    if (cb && cb.checked && !cb.disabled){
      const qtyEl = r.querySelector('input.pick-qty');
      const qty = parseFloat(qtyEl?.value || 0) || 1;
      STATE.draftPR.items.push({
        impa: r.dataset.impa,
        name: r.dataset.name,
        unit: r.dataset.unit,
        cat: r.dataset.cat,
        spec: r.dataset.spec || '',
        safety: parseFloat(r.dataset.safety||0),
        stock: parseFloat(r.dataset.stock||0),
        qty: qty,
        remark: ''
      });
      added++;
      names.push(r.dataset.name);
    }
  });
  if (added===0){ toast('請至少勾選一個項目'); return; }
  saveState();
  logActivity('加入請購項目', '草稿請購單', '加入 '+added+' 項：'+names.slice(0,3).join('、')+(names.length>3?' 等':''));
  closeModal();
  render();
  toast('已加入 '+added+' 個項目');
}
function addRepairItemFromModal(){
  const subj = document.getElementById('repSubj')?.value.trim();
  if (!subj){ toast('請填寫維修項目主旨'); return; }
  STATE.draftPR.items.push({
    impa: '-',
    name: subj,
    unit: document.getElementById('repUnit')?.value || '件',
    cat: '維修',
    spec: document.getElementById('repEq')?.value || '',
    safety: 0,
    stock: 0,
    qty: parseFloat(document.getElementById('repQty')?.value)||1,
    remark: document.getElementById('repDesc')?.value || ''
  });
  saveState();
  logActivity('加入維修項目', '草稿請購單', subj);
  closeModal();
  render();
  toast('已加入維修項目');
}
function submitDraftPR(){
  const d = STATE.draftPR;
  if (!d.subject){ toast('請填寫請購主旨'); return; }
  if (!d.vessel){ toast('請選擇隸屬船舶'); return; }
  if (d.items.length===0){ toast('請加入至少一個請購項目'); return; }
  // 產生新單號
  const yyyymm = new Date().toISOString().slice(0,7).replace('-','');
  const seq = (STATE.submittedPRs.length+1).toString().padStart(4,'0');
  const no = 'PR-'+yyyymm+'-'+seq;
  const submitted = {
    no, subject:d.subject, type:d.category, items:d.items.length, applicant:d.applicant,
    vessel:d.vessel, send_at:d.send_at, status:'審核中', reviewer:'-', reviewed_at:'-',
    updated_by:d.applicant, updated_at:new Date().toISOString().replace('T',' ').slice(0,19),
    urgent:d.urgent, key_eq:d.key_eq, warehouse:d.warehouse, owner:d.owner,
    item_list: d.items.slice()
  };
  STATE.submittedPRs.unshift(submitted);
  STATE.draftPR = createEmptyDraftPR();
  saveState();
  logActivity('送出審核', '請購單 '+no, d.subject+'（'+submitted.items+' 項）');
  toast('請購單 '+no+' 已送出審核');
  go('pr');
}

// ---------- Navigation ----------
const NAV = [
  { name:'進銷存功能管理', icon:'bi-grid-3x3-gap-fill', open:true, items:[
    { id:'dashboard', label:'功能總覽', icon:'bi-speedometer2' },
    { id:'log',       label:'操作紀錄', icon:'bi-clock-history' },
    { id:'pr',   label:'請購單管理',     icon:'bi-pencil-square' },
    { id:'rfq',  label:'詢價單管理',     icon:'bi-search' },
    { id:'crfq', label:'綜合詢價單管理', icon:'bi-folder' },
    { id:'oq',   label:'船東報價單管理', icon:'bi-chat-square-quote' },
    { id:'oi',   label:'船東請款單管理', icon:'bi-receipt' },
    { id:'po',   label:'採購單管理',     icon:'bi-cart-check' },
    { id:'wo',   label:'派工單管理',     icon:'bi-tools' },
    { id:'rma',  label:'送修單管理',     icon:'bi-arrow-return-left' },
    { id:'ac',   label:'驗收單管理',     icon:'bi-clipboard-check' },
    { id:'rf',   label:'退款單管理',     icon:'bi-arrow-counterclockwise' },
    { id:'wh',   label:'倉庫管理',       icon:'bi-box-seam' },
    { id:'is',   label:'領用管理',       icon:'bi-box-arrow-up' },
    { id:'wi',   label:'入庫管理',       icon:'bi-box-arrow-in-down' },
    { id:'to',   label:'調撥管理',       icon:'bi-arrow-left-right' },
    { id:'ic',   label:'盤點管理',       icon:'bi-card-checklist' },
    { id:'items',label:'物料/配件管理',  icon:'bi-collection' },
    { id:'vendors',label:'廠商資料管理', icon:'bi-shop' },
  ]},
  { name:'使用者管理', icon:'bi-people-fill', items:[
    { id:'users', label:'使用者列表', icon:'bi-person-lines-fill' },
  ]},
  { name:'系統權限管理', icon:'bi-shield-lock-fill', items:[
    { id:'depts', label:'部門/職位管理', icon:'bi-diagram-3' },
    { id:'roles', label:'角色與權限',     icon:'bi-key-fill' },
  ]},
  { name:'船東管理', icon:'bi-building', items:[
    { id:'owners', label:'船東資料管理', icon:'bi-buildings' },
  ]},
  { name:'船舶管理', icon:'bi-truck-front', items:[
    { id:'vessels', label:'船舶資料管理', icon:'bi-truck-front-fill' },
  ]},
  { name:'船員管理', icon:'bi-person-badge', items:[
    { id:'crew', label:'船員資料管理', icon:'bi-person-vcard' },
  ]},
];

// ---------- Render sidebar ----------
function renderSidebar(){
  const sb = document.getElementById('sidebar');
  sb.innerHTML = NAV.map((g,gi)=>`
    <div class="nav-group ${g.open?'open':''}" data-gi="${gi}">
      <div class="nav-head" onclick="toggleGroup(${gi})">
        <span><i class="bi ${g.icon}" style="margin-right:8px;color:#6b7280"></i>${g.name}</span>
        <i class="bi bi-chevron-right chev"></i>
      </div>
      <div class="nav-items">
        ${g.items.map(it=>`
          <div class="nav-item" data-route="${it.id}" onclick="go('${it.id}')">
            <i class="bi ${it.icon}"></i>${it.label}
          </div>`).join('')}
      </div>
    </div>
  `).join('');
}
function toggleGroup(gi){
  const el = document.querySelector(`.nav-group[data-gi="${gi}"]`);
  el.classList.toggle('open');
}
function setActiveNav(route){
  document.querySelectorAll('.nav-item').forEach(el=>{
    el.classList.toggle('active', el.dataset.route===route.split('/')[0]);
  });
}

// ---------- Router ----------
function go(route){ location.hash = '#'+route; }
function currentRoute(){ return (location.hash||'#dashboard').slice(1); }
window.addEventListener('hashchange', render);

// ---------- Modal helpers ----------
function openModal(title, body, foot, lg=false){
  document.getElementById('modalTitle').innerHTML = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFoot').innerHTML = foot || `<button class="btn-x btn-outline" onclick="closeModal()">關閉</button>`;
  document.getElementById('modalBox').classList.toggle('lg', lg);
  document.getElementById('modal').classList.add('show');
}
function closeModal(){ document.getElementById('modal').classList.remove('show'); }

// ---------- Toast ----------
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2000);
}

// ---------- Common UI ----------
function breadcrumb(parts){
  return `<div class="breadcrumb-row">${parts.map((p,i)=> i===parts.length-1 ? p.label : `<a onclick="go('${p.route||'dashboard'}')">${p.label}</a> / `).join('')}</div>`;
}
function pageTitle(t){ return `<h2 class="page-title">${t}</h2>`; }
function filterRow(html){ return `<div class="filter-row">${html}</div>`; }
function pager(total, pageSize=10){
  // 單頁時隱藏分頁元件，只顯示資料筆數
  if (total <= pageSize){
    if (total===0) return '';
    return `<div class="page-bar"><div>共 ${total} 筆資料</div><div></div></div>`;
  }
  const totalPages = Math.ceil(total/pageSize);
  let pages = '';
  for (let i=1; i<=Math.min(totalPages,5); i++){
    pages += `<span class="pg ${i===1?'active':''}">${i}</span>`;
  }
  return `<div class="page-bar">
    <div>顯示第 1 到第 ${pageSize} 筆，共 ${total} 筆資料（${totalPages} 頁）</div>
    <div class="pager">
      <span class="pg">上一頁</span>
      ${pages}
      <span class="pg">下一頁</span>
    </div>
  </div>`;
}
function tableHead(cols){
  return `<thead><tr>${cols.map(c=>`<th>${c}<i class="bi bi-arrow-down-up sort"></i></th>`).join('')}</tr></thead>`;
}

// ---------- Sample reusable table renderer ----------
function dataTable({columns, rows, actions=true}){
  return `<table class="tbl">
    ${tableHead(columns.map(c=>c.label).concat(actions?['操作']:[]))}
    <tbody>
      ${rows.length===0 ? `<tr><td class="empty" colspan="${columns.length+1}">No data available in table</td></tr>` :
        rows.map(r=>`<tr>${columns.map(c=>`<td>${c.render?c.render(r):r[c.key]}</td>`).join('')}${actions?`<td class="row-actions"><a title="檢視" onclick="event.stopPropagation()"><i class="bi bi-eye-fill"></i></a><a title="編輯"><i class="bi bi-pencil-square"></i></a></td>`:''}</tr>`).join('')}
    </tbody>
  </table>`;
}

// ---------- Render dispatcher ----------
function render(){
  const route = currentRoute();
  setActiveNav(route);
  const v = document.getElementById('view');
  const [page, sub, id] = route.split('/');
  const fn = ROUTES[page] || ROUTES.dashboard;
  v.innerHTML = fn(sub, id);
  // 更新頂部使用者標籤
  const u = currentUser();
  const lab = document.getElementById('userLabel');
  if (lab) lab.innerHTML = 'Hi '+u.display_name+' <span class="b '+(u.side==='船端'?'b-purple':'b-blue')+'" style="margin-left:6px;font-size:10px">'+u.role+'</span>';
  window.scrollTo(0,0);
}

// ---------- Pages ----------
const ROUTES = {};

// === 01 Dashboard 功能總覽 ===
ROUTES.dashboard = function(){
  const groups = [
    { title:'請購流程管理', items:[
      ['pr','請購功能管理','bi-pencil-square','ic-c1'],
      ['rfq','詢價功能管理','bi-search','ic-c1'],
      ['crfq','綜合詢價管理','bi-folder-fill','ic-c1'],
      ['oq','船東報價管理','bi-chat-square-quote-fill','ic-c1'],
      ['oi','船東請款管理','bi-receipt','ic-c1'],
      ['po','採購管理','bi-cart-check-fill','ic-c1'],
      ['wo','派工管理','bi-tools','ic-c1'],
      ['ac','驗收管理','bi-clipboard-check-fill','ic-c1'],
      ['rf','退款管理','bi-arrow-counterclockwise','ic-c1'],
    ]},
    { title:'倉庫功能管理', items:[
      ['wh','倉庫管理','bi-box-seam','ic-c3'],
      ['is','領用管理','bi-box-arrow-up','ic-c3'],
      ['wi','入庫管理','bi-box-arrow-in-down','ic-c3'],
      ['to','調撥管理','bi-arrow-left-right','ic-c3'],
      ['ic','盤點管理','bi-card-checklist','ic-c3'],
    ]},
    { title:'進銷存資料管理', items:[
      ['items','物料管理','bi-collection-fill','ic-c5'],
      ['items/parts','配件管理','bi-puzzle-fill','ic-c5'],
      ['vendors','廠商資料管理','bi-shop','ic-c5'],
    ]},
    { title:'基本資料管理', items:[
      ['users','使用者管理','bi-people-fill','ic-c2'],
      ['depts','部門/職位','bi-diagram-3-fill','ic-c2'],
      ['roles','角色與權限','bi-key-fill','ic-c2'],
      ['owners','船東資料','bi-building','ic-c4'],
      ['vessels','船舶資料','bi-truck-front-fill','ic-c4'],
      ['crew','船員資料','bi-person-vcard-fill','ic-c4'],
    ]},
  ];

  // 計算 KPI
  const prCount = DB.purchase_requests.length;
  const inProgressPr = DB.purchase_requests.filter(p=>p.status==='審核中'||p.status==='通過').length;
  const totalInvoice = DB.owner_invoices.reduce((s,o)=>s+o.total,0);
  const wh = DB.warehouses.reduce((s,w)=>s+w.value,0);
  const vendors = DB.vendors.filter(v=>v.status==='啟用').length;
  const vessels = DB.vessels.length;

  const kpiHtml = `
    <div class="kpi-grid">
      <div class="kpi"><div><div class="l">本月請購單</div><div class="v">${prCount}</div><div class="text-muted" style="font-size:12px">處理中 ${inProgressPr} 筆</div></div><div class="ic b1"><i class="bi bi-pencil-square"></i></div></div>
      <div class="kpi"><div><div class="l">船東請款總額</div><div class="v">$${(totalInvoice/10000).toFixed(1)}萬</div><div class="text-muted" style="font-size:12px">本月 ${DB.owner_invoices.length} 筆</div></div><div class="ic b3"><i class="bi bi-receipt"></i></div></div>
      <div class="kpi"><div><div class="l">倉庫庫存總值</div><div class="v">$${(wh/10000).toFixed(0)}萬</div><div class="text-muted" style="font-size:12px">${DB.warehouses.length} 個倉庫</div></div><div class="ic b2"><i class="bi bi-box-seam"></i></div></div>
      <div class="kpi"><div><div class="l">合作廠商</div><div class="v">${vendors}</div><div class="text-muted" style="font-size:12px">啟用中</div></div><div class="ic b4"><i class="bi bi-shop"></i></div></div>
      <div class="kpi"><div><div class="l">管理船舶</div><div class="v">${vessels}</div><div class="text-muted" style="font-size:12px">${DB.ship_owners.length} 家船東</div></div><div class="ic b5"><i class="bi bi-truck-front-fill"></i></div></div>
      <div class="kpi"><div><div class="l">在船船員</div><div class="v">${DB.crew.filter(c=>c.status==='在船').length}</div><div class="text-muted" style="font-size:12px">總計 ${DB.crew.length} 人</div></div><div class="ic b6"><i class="bi bi-person-vcard-fill"></i></div></div>
    </div>`;

  // 待辦事項列表
  const pendingPrs = DB.purchase_requests.filter(p=>p.status==='審核中').slice(0,3);
  const pendingRefunds = DB.refunds.filter(r=>r.status==='核准中').slice(0,2);
  const recentOrders = DB.purchase_orders.slice(0,3);

  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'功能總覽'}])}
    ${pageTitle('功能總覽')}
    ${kpiHtml}
    <div class="card-x">
      ${groups.map((g,gi)=>`
        <div class="feat-section">
          <h3>${g.title}</h3>
          <div class="feat-grid">
            ${g.items.map((it,ii)=>{
              const colors=['ic-c1','ic-c2','ic-c3','ic-c4','ic-c5','ic-c6','ic-c7','ic-c8','ic-c9','ic-c10'];
              const color = colors[(gi*3+ii)%10];
              return `<div class="feat" onclick="go('${it[0]}')">
                <div class="ic ${color}"><i class="bi ${it[2]}"></i></div>
                <div class="name">${it[1]}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px;">
      <div class="card-x mb-0">
        <h3 class="section-title"><i class="bi bi-bell" style="color:#f59e0b"></i> 待審核請購單</h3>
        <table class="tbl">
          <thead><tr><th>單號</th><th>船舶</th><th>主旨</th><th>狀態</th></tr></thead>
          <tbody>
            ${STATE.submittedPRs.filter(p=>p.status==='審核中').map(p=>`<tr style="background:#fff7ed"><td><a onclick="viewSubmittedPR('${p.no}')"><span class="b b-yellow">新</span> ${p.no}</a></td><td>${p.vessel}</td><td>${p.subject}</td><td>${statusBadge(p.status)}</td></tr>`).join('')}
            ${pendingPrs.map(p=>`<tr><td><a onclick="go('pr/view/${p.id}')">${p.no}</a></td><td>${p.vessel}</td><td>${p.subject}</td><td>${statusBadge(p.status)}</td></tr>`).join('')||(STATE.submittedPRs.filter(p=>p.status==='審核中').length===0?'<tr><td class="empty" colspan="4">無待審核項目</td></tr>':'')}
          </tbody>
        </table>
      </div>
      <div class="card-x mb-0">
        <h3 class="section-title"><i class="bi bi-cart-check"></i> 最近採購單</h3>
        <table class="tbl">
          <thead><tr><th>單號</th><th>廠商</th><th>船舶</th><th>金額</th><th>狀態</th></tr></thead>
          <tbody>
            ${recentOrders.map(p=>`<tr><td><a onclick="go('po/view/${p.id}')">${p.no}</a></td><td>${p.vendor}</td><td>${p.vessel}</td><td>$${p.total.toLocaleString()}</td><td>${statusBadge(p.status)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${STATE.savedDrafts.length>0?`
      <div class="card-x mb-0" style="grid-column:1/-1;background:#fffbeb;border:1px solid #fde68a">
        <div class="flex between aic">
          <h3 class="section-title mb-0"><i class="bi bi-pencil-square" style="color:#d97706"></i> 我的草稿（${STATE.savedDrafts.length} 張）</h3>
          <a onclick="go('pr')" style="font-size:13px">前往請購單列表 →</a>
        </div>
        <table class="tbl mt-2">
          <thead><tr><th>草稿編號</th><th>主旨</th><th>船舶</th><th>類別</th><th>項目</th><th>最後儲存</th><th>操作</th></tr></thead>
          <tbody>
            ${STATE.savedDrafts.slice(0,4).map(e=>`<tr>
              <td>${e.id}</td>
              <td>${(e.draft && e.draft.subject) || '<span class="text-muted">(未填主旨)</span>'}</td>
              <td>${e.vessel||'-'}</td>
              <td>${e.category?'<span class="b b-blue">'+e.category+'</span>':'-'}</td>
              <td>${e.items}</td>
              <td>${e.saved_at}</td>
              <td class="row-actions">
                <a onclick="editSavedDraft('${e.id}')"><i class="bi bi-pencil-square"></i> 繼續編輯</a>
                <a class="danger" onclick="deleteSavedDraft('${e.id}')"><i class="bi bi-trash"></i></a>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`:''}
      <div class="card-x mb-0" style="grid-column:1/-1">
        <div class="flex between aic">
          <h3 class="section-title mb-0"><i class="bi bi-clock-history"></i> 最近操作紀錄</h3>
          <div>
            <a onclick="go('log')" style="font-size:13px">查看全部 →</a>
            <button class="btn-x btn-outline btn-icon" style="margin-left:8px" onclick="clearAllState()" title="重置 demo 狀態"><i class="bi bi-arrow-clockwise"></i></button>
          </div>
        </div>
        <table class="tbl mt-2">
          <thead><tr><th style="width:160px">時間</th><th style="width:90px">操作人</th><th style="width:130px">動作</th><th style="width:200px">對象</th><th>說明</th></tr></thead>
          <tbody>
            ${STATE.activityLog.length===0
              ? '<tr><td class="empty" colspan="5">尚無操作紀錄。請至「請購單管理 → 新增請購單」測試流程。</td></tr>'
              : STATE.activityLog.slice(0,8).map(l=>`<tr><td>${l.time}</td><td>${l.user}</td><td><span class="b b-blue">${l.action}</span></td><td>${l.target}</td><td>${l.detail}</td></tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
};

// === 操作紀錄頁 ===
ROUTES.log = function(){
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'操作紀錄'}])}
    ${pageTitle('操作紀錄')}
    <div class="card-x">
      <div class="flex between aic">
        <h3 class="section-title mb-0">完整操作紀錄（共 ${STATE.activityLog.length} 筆）</h3>
        <div>
          <button class="btn-x btn-outline" onclick="exportLog()"><i class="bi bi-download"></i> 匯出 CSV</button>
          <button class="btn-x btn-danger" onclick="clearAllState()"><i class="bi bi-arrow-clockwise"></i> 重置 demo 狀態</button>
        </div>
      </div>
      ${filterRow(`
        <select class="form-select" onchange="window.__logFilter=this.value;render()">
          <option value="">全部動作</option>
          ${[...new Set(STATE.activityLog.map(l=>l.action))].map(a=>`<option ${window.__logFilter===a?'selected':''}>${a}</option>`).join('')}
        </select>
        <input class="form-control grow" placeholder="搜尋對象 / 說明" oninput="filterLogRows(this.value)">
      `)}
      <table class="tbl" id="logTbl">
        <thead><tr><th style="width:170px">時間</th><th style="width:90px">操作人</th><th style="width:140px">動作</th><th style="width:240px">對象</th><th>說明</th></tr></thead>
        <tbody>
          ${(window.__logFilter ? STATE.activityLog.filter(l=>l.action===window.__logFilter) : STATE.activityLog).map(l=>`<tr>
            <td>${l.time}</td><td>${l.user}</td><td><span class="b b-blue">${l.action}</span></td><td>${l.target}</td><td>${l.detail}</td>
          </tr>`).join('') || '<tr><td class="empty" colspan="5">尚無紀錄</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
};
function filterLogRows(q){
  q = (q||'').toLowerCase();
  document.querySelectorAll('#logTbl tbody tr').forEach(r=>{
    if (r.querySelector('.empty')) return;
    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
function exportLog(){
  const head = ['時間','操作人','動作','對象','說明'];
  const rows = STATE.activityLog.map(l=>[l.time,l.user,l.action,l.target,l.detail]);
  const csv = '﻿'+[head, ...rows].map(r=>r.map(c=>'"'+String(c||'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'activity_log_'+Date.now()+'.csv'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast('已匯出 CSV');
}

// === 02 使用者管理 ===
ROUTES.users = function(sub, id){
  if (sub==='new' || sub==='edit'){
    const u = id ? DB.users.find(x=>x.id==id) : {};
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'使用者管理',route:'users'},{label:sub==='new'?'新增使用者':'編輯使用者'}])}
      ${pageTitle('使用者管理')}
      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">${sub==='new'?'新增使用者':'編輯使用者'}</h3>
          <div class="right-actions">
            <button class="btn-x btn-primary" onclick="toast('已儲存');go('users')"><i class="bi bi-check-lg"></i> 儲存</button>
            <button class="btn-x btn-outline" onclick="go('users')">返回</button>
          </div>
        </div>
        <div class="form-section">
          <div class="form-grid">
            <div><label><span class="req">*</span>帳號</label><input value="${u.username||''}"></div>
            <div><label><span class="req">*</span>姓名</label><input value="${u.display_name||''}"></div>
            <div><label>Email</label><input value="${u.email||''}"></div>
            <div><label>部門</label><select>${DB.departments.map(d=>`<option ${u.dept===d.name?'selected':''}>${d.name}</option>`).join('')}</select></div>
            <div><label>職位</label><select>${DB.positions.map(p=>`<option ${u.role===p.name?'selected':''}>${p.name}</option>`).join('')}</select></div>
            <div><label>角色</label><select>${DB.roles.map(r=>`<option ${u.role===r.name?'selected':''}>${r.name}</option>`).join('')}</select></div>
            <div><label>狀態</label><select><option>啟用</option><option ${u.status==='停用'?'selected':''}>停用</option></select></div>
            <div><label>密碼</label><input type="password" placeholder="${sub==='edit'?'不變更請留空':'請輸入'}"></div>
          </div>
        </div>
        ${sub==='edit'?`
        <h4 class="sub-title"><i class="bi bi-clock-history"></i> 存取紀錄</h4>
        <table class="tbl">
          <thead><tr><th>時間</th><th>動作</th><th>IP</th><th>裝置</th></tr></thead>
          <tbody>
            <tr><td>2026/05/03 09:12</td><td>登入系統</td><td>192.168.1.45</td><td>Chrome / Windows</td></tr>
            <tr><td>2026/05/02 11:45</td><td>編輯請購單 PR-202604-0001</td><td>192.168.1.45</td><td>Chrome / Windows</td></tr>
            <tr><td>2026/05/02 09:08</td><td>登入系統</td><td>192.168.1.45</td><td>Chrome / Windows</td></tr>
            <tr><td>2026/05/01 14:33</td><td>修改使用者資料</td><td>192.168.1.45</td><td>Chrome / Windows</td></tr>
          </tbody>
        </table>`:''}
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'使用者管理'},{label:'使用者列表'}])}
    ${pageTitle('使用者管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">使用者列表</h3>
        <button class="btn-x btn-primary" onclick="go('users/new')"><i class="bi bi-plus-lg"></i> 新增使用者</button>
      </div>
      ${filterRow(`
        <select class="form-select"><option>全部部門</option>${DB.departments.map(d=>`<option>${d.name}</option>`).join('')}</select>
        <select class="form-select"><option>全部狀態</option><option>啟用</option><option>停用</option></select>
        <input class="form-control" placeholder="請輸入帳號或姓名">
        <span class="text-muted">每頁顯示</span>
        <select class="form-select" style="min-width:70px"><option>10</option><option>25</option></select>
      `)}
      <table class="tbl">
        <thead><tr><th>帳號</th><th>姓名</th><th>Email</th><th>部門</th><th>角色</th><th>狀態</th><th>最後登入</th><th>操作</th></tr></thead>
        <tbody>
          ${DB.users.map(u=>`<tr>
            <td>${u.username}</td>
            <td>${u.display_name}</td>
            <td>${u.email}</td>
            <td>${u.dept}</td>
            <td>${u.role}</td>
            <td>${statusBadge(u.status)}</td>
            <td>${u.last_login}</td>
            <td class="row-actions">
              <a onclick="go('users/edit/${u.id}')" title="編輯"><i class="bi bi-pencil-square"></i></a>
              <a class="danger" onclick="toast('Demo 模式不執行刪除')" title="刪除"><i class="bi bi-trash"></i></a>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${pager(DB.users.length)}
    </div>
  `;
};

// === 03 部門/職位管理 ===
ROUTES.depts = function(sub){
  const tab = sub || 'depts';
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'部門/職位管理'}])}
    ${pageTitle('部門/職位管理')}
    <div class="card-x">
      <div class="pill-tabs">
        <div class="tab ${tab==='depts'?'active':''}" onclick="go('depts')"><i class="bi bi-diagram-3"></i> 部門分類管理</div>
        <div class="tab ${tab==='pos'?'active':''}" onclick="go('depts/pos')"><i class="bi bi-person-badge"></i> 職位分類管理</div>
      </div>
      ${tab==='pos' ? renderPositions() : renderDepartments()}
    </div>
  `;
};
function renderDepartments(){
  return `
    <div class="flex between aic mt-3"><h4 class="sub-title">部門列表（行內編輯）</h4>
      <button class="btn-x btn-primary" onclick="toast('已新增空白列')"><i class="bi bi-plus-lg"></i> 新增部門</button>
    </div>
    <table class="tbl">
      <thead><tr><th>部門代碼</th><th>部門名稱</th><th>主管</th><th>人數</th><th>操作</th></tr></thead>
      <tbody>
        ${DB.departments.map(d=>`<tr>
          <td><input class="form-control" style="height:30px" value="${d.code}"></td>
          <td><input class="form-control" style="height:30px" value="${d.name}"></td>
          <td><input class="form-control" style="height:30px" value="${d.leader}"></td>
          <td>${d.count}</td>
          <td class="row-actions">
            <a onclick="toast('已儲存 ${d.name}')"><i class="bi bi-check-lg"></i></a>
            <a class="danger" onclick="toast('Demo 不執行刪除')"><i class="bi bi-trash"></i></a>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}
function renderPositions(){
  return `
    <div class="flex between aic mt-3"><h4 class="sub-title">職位列表</h4>
      <button class="btn-x btn-primary" onclick="toast('已新增空白列')"><i class="bi bi-plus-lg"></i> 新增職位</button>
    </div>
    <table class="tbl">
      <thead><tr><th>職位代碼</th><th>職位名稱</th><th>對應人數</th><th>操作</th></tr></thead>
      <tbody>
        ${DB.positions.map(p=>`<tr>
          <td>${p.code}</td>
          <td>${p.name}</td>
          <td>${p.count}</td>
          <td class="row-actions">
            <a><i class="bi bi-pencil-square"></i></a>
            <a class="danger" onclick="toast('Demo 不執行刪除')"><i class="bi bi-trash"></i></a>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// === 04 角色與權限 ===
ROUTES.roles = function(sub){
  const tab = sub || 'roles';
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'系統權限管理'}])}
    ${pageTitle('系統權限管理')}
    <div class="card-x">
      <div class="pill-tabs">
        <div class="tab ${tab==='roles'?'active':''}" onclick="go('roles')"><i class="bi bi-people-fill"></i> 角色管理</div>
        <div class="tab ${tab==='perm'?'active':''}" onclick="go('roles/perm')"><i class="bi bi-shield-check"></i> 權限矩陣</div>
      </div>
      ${tab==='perm' ? renderPermMatrix() : renderRoles()}
    </div>
  `;
};
function renderRoles(){
  return `
    <div class="flex between aic mt-3"><h4 class="sub-title">角色列表</h4>
      <button class="btn-x btn-primary"><i class="bi bi-plus-lg"></i> 新增角色</button>
    </div>
    <table class="tbl">
      <thead><tr><th>角色名稱</th><th>說明</th><th>使用者數</th><th>使用者</th><th>操作</th></tr></thead>
      <tbody>
        ${DB.roles.map(r=>`<tr>
          <td><strong>${r.name}</strong></td>
          <td>${r.desc}</td>
          <td>${r.user_count}</td>
          <td>${r.users.map(u=>`<span class="chip">${u}</span>`).join('')}</td>
          <td class="row-actions">
            <a onclick="openRoleEdit('${r.name}')"><i class="bi bi-pencil-square"></i> 編輯</a>
            <a onclick="openRoleAddUser('${r.name}')"><i class="bi bi-person-plus"></i> 加入使用者</a>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}
function openRoleEdit(name){
  openModal(`編輯角色 - ${name}`,`
    <div class="form-grid">
      <div><label><span class="req">*</span>角色名稱</label><input value="${name}"></div>
      <div><label>說明</label><input></div>
      <div class="full"><label>權限模組勾選（簡化示意）</label>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
          ${DB.permissions.map(p=>`<label><input type="checkbox" checked> ${p.module}</label>`).join('')}
        </div>
      </div>
    </div>
  `,`<button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('已儲存')">儲存</button>`);
}
function openRoleAddUser(name){
  openModal(`加入使用者至 - ${name}`,`
    <input class="form-control" placeholder="搜尋使用者...">
    <table class="tbl mt-2">
      <thead><tr><th><input type="checkbox"></th><th>帳號</th><th>姓名</th><th>部門</th></tr></thead>
      <tbody>
        ${DB.users.map(u=>`<tr><td><input type="checkbox"></td><td>${u.username}</td><td>${u.display_name}</td><td>${u.dept}</td></tr>`).join('')}
      </tbody>
    </table>
  `,`<button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('已加入')">加入</button>`);
}
function renderPermMatrix(){
  const allRoles = DB.roles.map(r=>r.name);
  return `
    <h4 class="sub-title mt-3"><i class="bi bi-grid-3x3"></i> 權限矩陣（V=檢視 / C=新增 / E=編輯 / D=刪除）</h4>
    <table class="perm-matrix">
      <thead><tr><th>模組</th>${allRoles.map(r=>`<th>${r}</th>`).join('')}</tr></thead>
      <tbody>
        ${DB.permissions.map(p=>`<tr>
          <th>${p.module}</th>
          ${allRoles.map(role=>{
            const hasV = p.view.includes('admin')||p.view.includes(role);
            const hasC = p.create.includes('admin')||p.create.includes(role);
            const hasE = p.edit.includes('admin')||p.edit.includes(role);
            const hasD = p.delete.includes('admin')||p.delete.includes(role);
            const flag = (b,t)=>`<span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:${b?'#22c55e':'#e5e7eb'};color:${b?'#fff':'#9ca3af'};font-size:11px;line-height:20px;margin:1px">${t}</span>`;
            return `<td>${flag(hasV,'V')}${flag(hasC,'C')}${flag(hasE,'E')}${flag(hasD,'D')}</td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// === 05 船東 ===
ROUTES.owners = function(sub, id){
  if (sub==='edit' || sub==='new'){
    const o = id ? DB.ship_owners.find(x=>x.id==id) : {};
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船東資料管理',route:'owners'},{label:sub==='new'?'新增船東':'編輯船東'}])}
      ${pageTitle('船東資料管理')}
      <div class="card-x">
        <div class="flex between aic">
          <h3 class="section-title mb-0">${sub==='new'?'新增船東資料':'編輯船東資料'}</h3>
          <div class="right-actions">
            <button class="btn-x btn-primary"><i class="bi bi-check-lg"></i> 儲存</button>
            <button class="btn-x btn-outline" onclick="go('owners')">返回</button>
          </div>
        </div>
        <h4 class="sub-title">基本資料</h4>
        <div class="form-section">
          <div class="form-grid">
            <div><label><span class="req">*</span>船東代碼</label><input value="${o.code||''}"></div>
            <div><label><span class="req">*</span>船東名稱</label><input value="${o.name||''}"></div>
            <div><label>簡稱</label><input value="${o.short||''}"></div>
            <div><label>統一編號</label><input value="${o.tax||''}"></div>
            <div><label>幣別</label><select><option>TWD</option><option ${o.currency==='USD'?'selected':''}>USD</option></select></div>
            <div class="full"><label>地址</label><input value="${o.address||''}"></div>
          </div>
        </div>
        <h4 class="sub-title flex between aic"><span><i class="bi bi-person-lines-fill"></i> 聯絡人</span>
          <button class="btn-x btn-outline" onclick="openContactModal()"><i class="bi bi-plus-lg"></i> 新增聯絡人</button>
        </h4>
        <table class="tbl">
          <thead><tr><th>姓名</th><th>職稱</th><th>電話</th><th>Email</th><th>主要聯絡人</th><th>操作</th></tr></thead>
          <tbody>
            <tr><td>${o.contact||'李守正'}</td><td>業務經理</td><td>${o.phone||'02-2345-6789'}</td><td>${o.email||'contact@evergreen.com.tw'}</td><td><i class="bi bi-check-circle-fill" style="color:#22c55e"></i></td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
            <tr><td>陳秘書</td><td>專員</td><td>02-2345-6790</td><td>secretary@evergreen.com.tw</td><td>-</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
          </tbody>
        </table>
        ${sub==='edit'?`
        <h4 class="sub-title"><i class="bi bi-clock-history"></i> 異動紀錄</h4>
        <table class="tbl">
          <thead><tr><th>時間</th><th>欄位</th><th>變更前</th><th>變更後</th><th>異動人</th></tr></thead>
          <tbody>
            <tr><td>2026/04/28 14:22</td><td>地址</td><td>(空)</td><td>${o.address}</td><td>admin</td></tr>
            <tr><td>2026/04/15 09:18</td><td>聯絡人</td><td>(無)</td><td>${o.contact}</td><td>admin</td></tr>
          </tbody>
        </table>`:''}
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船東資料管理'}])}
    ${pageTitle('船東資料管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">船東資料列表</h3>
        <button class="btn-x btn-primary" onclick="go('owners/new')"><i class="bi bi-plus-lg"></i> 新增船東</button>
      </div>
      ${filterRow(`<input class="form-control" placeholder="請輸入船東名稱或代碼">`)}
      <table class="tbl">
        <thead><tr><th>船東代碼</th><th>船東名稱</th><th>聯絡人</th><th>電話</th><th>Email</th><th>船舶數</th><th>幣別</th><th>操作</th></tr></thead>
        <tbody>
          ${DB.ship_owners.map(o=>`<tr>
            <td>${o.code}</td><td>${o.name}</td><td>${o.contact}</td><td>${o.phone}</td><td>${o.email}</td><td>${o.vessels}</td><td>${o.currency}</td>
            <td class="row-actions">
              <a onclick="go('owners/edit/${o.id}')"><i class="bi bi-pencil-square"></i></a>
              <a><i class="bi bi-eye-fill"></i></a>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${pager(DB.ship_owners.length)}
    </div>
  `;
};
function openContactModal(){
  openModal('新增聯絡人',`
    <div class="form-grid">
      <div><label><span class="req">*</span>姓名</label><input></div>
      <div><label>職稱</label><input></div>
      <div><label>電話</label><input></div>
      <div><label>手機</label><input></div>
      <div class="full"><label>Email</label><input></div>
      <div class="full"><label>備註</label><textarea></textarea></div>
      <div><label class="check"><input type="checkbox"> 設為主要聯絡人</label></div>
    </div>
  `,`<button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('已新增聯絡人')">儲存</button>`);
}

// === 06 船舶 ===
ROUTES.vessels = function(sub, id){
  if (sub==='view' && id){
    const v = DB.vessels.find(x=>x.id==id);
    if(!v) return '<div class="card-x">找不到資料</div>';
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船舶資料管理',route:'vessels'},{label:v.name}])}
      ${pageTitle('船舶資料管理')}
      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">船舶資訊 - ${v.name}</h3>
          <div class="right-actions">
            <button class="btn-x btn-outline"><i class="bi bi-printer"></i> 列印</button>
            <button class="btn-x btn-primary"><i class="bi bi-pencil-square"></i> 編輯</button>
            <button class="btn-x btn-outline" onclick="go('vessels')">返回</button>
          </div>
        </div>
        <h4 class="sub-title">完整規格</h4>
        <div class="form-section">
          <div class="form-grid">
            <div><label>船舶代碼</label><div>${v.code}</div></div>
            <div><label>船名</label><div><strong>${v.name}</strong></div></div>
            <div><label>IMO 編號</label><div>${v.imo}</div></div>
            <div><label>船旗國</label><div>${v.flag}</div></div>
            <div><label>船舶類型</label><div>${v.type}</div></div>
            <div><label>船東</label><div>${v.owner}</div></div>
            <div><label>建造年份</label><div>${v.build}</div></div>
            <div><label>載重噸 DWT</label><div>${v.dwt.toLocaleString()} 噸</div></div>
            <div><label>總噸 GT</label><div>${v.gross.toLocaleString()}</div></div>
          </div>
        </div>
        <h4 class="sub-title flex between aic"><span><i class="bi bi-gear-wide"></i> 機械設備</span><button class="btn-x btn-outline" onclick="openEqModal()"><i class="bi bi-plus-lg"></i> 新增設備</button></h4>
        <table class="tbl">
          <thead><tr><th>設備類別</th><th>製造商</th><th>型號</th><th>序號</th><th>建檔日期</th></tr></thead>
          <tbody>
            <tr><td>主機</td><td>MAN B&W</td><td>6S60MC</td><td>MAN-2018-1234</td><td>2018/03/15</td></tr>
            <tr><td>發電機</td><td>Yanmar</td><td>6N18AL-EV</td><td>YM-2018-5678</td><td>2018/03/15</td></tr>
            <tr><td>舵機</td><td>Rolls-Royce</td><td>SR723</td><td>RR-2018-9012</td><td>2018/03/15</td></tr>
            <tr><td>錨機</td><td>MacGregor</td><td>HHW-50T</td><td>MG-2018-3456</td><td>2018/03/15</td></tr>
            <tr><td>渦輪增壓器</td><td>ABB</td><td>A170-L</td><td>ABB-2018-7890</td><td>2018/03/15</td></tr>
          </tbody>
        </table>
        <h4 class="sub-title flex between aic"><span><i class="bi bi-file-earmark-medical"></i> 船舶證書 (${v.cert_count}/43 種)</span>
          <button class="btn-x btn-outline" onclick="openCertList(${v.id})"><i class="bi bi-list-ul"></i> 全部 43 種</button>
        </h4>
        <table class="tbl">
          <thead><tr><th>證書名稱</th><th>證書編號</th><th>核發單位</th><th>核發日期</th><th>有效期限</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>
            <tr><td>船舶國籍證書</td><td>NC-${v.code}-001</td><td>${v.flag}海事局</td><td>${v.build}/03/15</td><td>2028/03/14</td><td>${statusBadge('有效')}</td><td class="row-actions"><a onclick="openCertEdit()"><i class="bi bi-pencil-square"></i></a></td></tr>
            <tr><td>船舶安全管理證書(SMC)</td><td>SMC-${v.code}</td><td>BV 法國驗船協會</td><td>2024/06/01</td><td>2029/05/31</td><td>${statusBadge('有效')}</td><td class="row-actions"><a onclick="openCertEdit()"><i class="bi bi-pencil-square"></i></a></td></tr>
            <tr><td>防止油污染證書(IOPP)</td><td>IOPP-${v.code}</td><td>BV 法國驗船協會</td><td>2024/06/01</td><td>2027/05/31</td><td>${statusBadge('有效')}</td><td class="row-actions"><a onclick="openCertEdit()"><i class="bi bi-pencil-square"></i></a></td></tr>
            <tr><td>載重線證書(LL)</td><td>LL-${v.code}</td><td>BV 法國驗船協會</td><td>2024/06/01</td><td>2026/06/30</td><td><span class="b b-yellow">即將到期</span></td><td class="row-actions"><a onclick="openCertEdit()"><i class="bi bi-pencil-square"></i></a></td></tr>
          </tbody>
        </table>
        <p class="text-muted mt-2">※ 顯示前 4 項，點擊「全部 43 種」可查看完整證書清單。</p>
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船舶資料管理'}])}
    ${pageTitle('船舶資料管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">船舶資料列表</h3>
        <div class="right-actions">
          <button class="btn-x btn-outline" onclick="openClassList()"><i class="bi bi-bookmark"></i> 船級社資料</button>
          <button class="btn-x btn-primary"><i class="bi bi-plus-lg"></i> 新增船舶</button>
        </div>
      </div>
      ${filterRow(`
        <select class="form-select"><option>全部船東</option>${DB.ship_owners.map(o=>`<option>${o.short}</option>`).join('')}</select>
        <select class="form-select"><option>全部類型</option><option>貨櫃船</option><option>散裝船</option><option>油輪</option></select>
        <input class="form-control" placeholder="船名 / IMO 編號">
      `)}
      <table class="tbl">
        <thead><tr><th>船舶代碼</th><th>船名</th><th>IMO 編號</th><th>船旗國</th><th>類型</th><th>DWT</th><th>船東</th><th>證書數</th><th>操作</th></tr></thead>
        <tbody>
          ${DB.vessels.map(v=>`<tr>
            <td>${v.code}</td>
            <td><a onclick="go('vessels/view/${v.id}')"><strong>${v.name}</strong></a></td>
            <td>${v.imo}</td>
            <td>${v.flag}</td>
            <td>${v.type}</td>
            <td>${v.dwt.toLocaleString()}</td>
            <td>${v.owner}</td>
            <td>${v.cert_count}/43</td>
            <td class="row-actions">
              <a onclick="go('vessels/view/${v.id}')"><i class="bi bi-eye-fill"></i></a>
              <a><i class="bi bi-pencil-square"></i></a>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${pager(DB.vessels.length)}
    </div>
  `;
};
function openClassList(){
  openModal('船級社資料',`
    <div class="flex between aic mb-2"><span></span><button class="btn-x btn-primary"><i class="bi bi-plus-lg"></i> 新增船級社</button></div>
    <table class="tbl">
      <thead><tr><th>代碼</th><th>名稱</th><th>國家</th><th>聯絡電話</th><th>操作</th></tr></thead>
      <tbody>
        <tr><td>BV</td><td>Bureau Veritas (法國驗船)</td><td>法國</td><td>+33-1-5524-7000</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
        <tr><td>NK</td><td>Class NK (日本海事協會)</td><td>日本</td><td>+81-3-5226-2400</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
        <tr><td>LR</td><td>Lloyd's Register</td><td>英國</td><td>+44-20-7423-2400</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
        <tr><td>ABS</td><td>American Bureau of Shipping</td><td>美國</td><td>+1-281-877-5800</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
        <tr><td>CCS</td><td>China Classification Society</td><td>中國</td><td>+86-10-5811-2288</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
      </tbody>
    </table>
  `,'',true);
}
function openCertList(vid){
  const v = DB.vessels.find(x=>x.id==vid);
  openModal(`船舶證書清單 - ${v.name}（共 43 種）`,`
    <table class="tbl">
      <thead><tr><th>#</th><th>證書名稱</th><th>狀態</th><th>有效至</th><th>操作</th></tr></thead>
      <tbody>
        ${DB.cert_types.map((c,i)=>{
          const has = i < v.cert_count;
          const expiring = i%9===3;
          return `<tr><td>${i+1}</td><td>${c}</td><td>${has?(expiring?'<span class="b b-yellow">即將到期</span>':statusBadge('有效')):'<span class="b b-gray">未建檔</span>'}</td><td>${has?(2026+i%5)+'/'+String(1+i%12).padStart(2,'0')+'/15':'-'}</td><td class="row-actions">${has?'<a><i class="bi bi-pencil-square"></i></a>':'<a><i class="bi bi-plus-lg"></i> 新增</a>'}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `,'',true);
}
function openCertEdit(){
  openModal('編輯證書資料',`
    <div class="form-grid">
      <div><label><span class="req">*</span>證書名稱</label><input value="船舶安全管理證書(SMC)"></div>
      <div><label>證書編號</label><input value="SMC-V-001"></div>
      <div><label>核發單位</label><input value="BV 法國驗船協會"></div>
      <div><label>核發日期</label><input type="date" value="2024-06-01"></div>
      <div><label>有效期限</label><input type="date" value="2029-05-31"></div>
      <div><label>狀態</label><select><option>有效</option><option>即將到期</option><option>已過期</option></select></div>
      <div class="full"><label>備註</label><textarea></textarea></div>
      <div class="full"><label>附件上傳</label><input type="file"></div>
    </div>
  `,`<button class="btn-x btn-danger">刪除</button><div class="spacer" style="flex:1"></div><button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('已儲存')">儲存</button>`);
}
function openEqModal(){
  openModal('新增機械設備',`
    <div class="form-grid">
      <div><label><span class="req">*</span>設備類別</label><select><option>主機</option><option>發電機</option><option>舵機</option><option>錨機</option><option>渦輪增壓器</option><option>冷凍機</option></select></div>
      <div><label>製造商</label><input></div>
      <div><label>型號</label><input></div>
      <div><label>序號</label><input></div>
      <div><label>建檔日期</label><input type="date"></div>
      <div class="full"><label>規格說明</label><textarea></textarea></div>
    </div>
  `,`<button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('已新增')">儲存</button>`);
}

// === 07 船員 ===
ROUTES.crew = function(sub, id){
  if (sub==='view' && id){
    const c = DB.crew.find(x=>x.id==id);
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船員資料管理',route:'crew'},{label:c.name}])}
      ${pageTitle('船員資料管理')}
      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">船員詳細資訊 - ${c.name}</h3>
          <div class="right-actions">
            <button class="btn-x btn-outline">列印</button>
            <button class="btn-x btn-primary"><i class="bi bi-pencil-square"></i> 編輯</button>
            <button class="btn-x btn-outline" onclick="go('crew')">返回</button>
          </div>
        </div>
        <h4 class="sub-title">基本資料</h4>
        <div class="form-section">
          <div class="form-grid">
            <div><label>船員編號</label><div>${c.no}</div></div>
            <div><label>姓名</label><div><strong>${c.name}</strong></div></div>
            <div><label>身分證號</label><div>${c.id_no}</div></div>
            <div><label>國籍</label><div>${c.nationality}</div></div>
            <div><label>出生日期</label><div>${c.birth}</div></div>
            <div><label>職位</label><div>${c.position}</div></div>
            <div><label>狀態</label><div>${statusBadge(c.status)}</div></div>
          </div>
        </div>
        <div class="pill-tabs mt-4">
          <div class="tab active"><i class="bi bi-card-list"></i> 任職紀錄</div>
          <div class="tab"><i class="bi bi-clock-history"></i> 異動歷程</div>
        </div>
        <table class="tbl">
          <thead><tr><th>船舶</th><th>職位</th><th>上船日期</th><th>下船日期</th><th>船東</th><th>狀態</th></tr></thead>
          <tbody>
            <tr><td>${c.vessel}</td><td>${c.position}</td><td>${c.onboard}</td><td>-</td><td>長榮海運</td><td>${statusBadge(c.status)}</td></tr>
            <tr><td>長榮山</td><td>${c.position==='船長'?'大副':c.position}</td><td>2022/05/12</td><td>2024/01/30</td><td>長榮海運</td><td><span class="b b-gray">已下船</span></td></tr>
            <tr><td>長榮海</td><td>大副</td><td>2020/02/18</td><td>2022/04/10</td><td>長榮海運</td><td><span class="b b-gray">已下船</span></td></tr>
          </tbody>
        </table>
        <h4 class="sub-title flex between aic"><span><i class="bi bi-file-earmark-medical"></i> 證件 / 證書（${c.cert_count} 張）</span>
          <button class="btn-x btn-outline" onclick="openCrewCertModal()"><i class="bi bi-plus-lg"></i> 新增證件</button>
        </h4>
        <table class="tbl">
          <thead><tr><th>證件類別</th><th>證件編號</th><th>核發機關</th><th>核發日期</th><th>有效期限</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>
            <tr><td>適任證書 (船長)</td><td>STCW-${c.no}-001</td><td>交通部航港局</td><td>2022/06/15</td><td>2027/06/14</td><td>${statusBadge('有效')}</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
            <tr><td>船員手冊</td><td>SB-${c.no}</td><td>交通部航港局</td><td>2023/01/10</td><td>2028/01/09</td><td>${statusBadge('有效')}</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
            <tr><td>STCW 基本訓練</td><td>BST-${c.no}</td><td>中華航海技術人員協會</td><td>2024/03/20</td><td>2029/03/19</td><td>${statusBadge('有效')}</td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
            <tr><td>船員體格檢查</td><td>MED-${c.no}-2025</td><td>港務醫療站</td><td>2025/02/05</td><td>2026/08/04</td><td><span class="b b-yellow">即將到期</span></td><td class="row-actions"><a><i class="bi bi-pencil-square"></i></a></td></tr>
          </tbody>
        </table>
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船員資料管理'}])}
    ${pageTitle('船員資料管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">船員資料列表</h3>
        <button class="btn-x btn-primary"><i class="bi bi-plus-lg"></i> 新增船員</button>
      </div>
      ${filterRow(`
        <select class="form-select"><option>全部船舶</option>${DB.vessels.map(v=>`<option>${v.name}</option>`).join('')}</select>
        <select class="form-select"><option>全部職位</option><option>船長</option><option>輪機長</option><option>大副</option><option>水手</option></select>
        <select class="form-select"><option>全部狀態</option><option>在船</option><option>休假</option></select>
        <input class="form-control" placeholder="姓名 / 編號">
      `)}
      <table class="tbl">
        <thead><tr><th>編號</th><th>姓名</th><th>職位</th><th>國籍</th><th>所屬船舶</th><th>上船日</th><th>證件數</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${DB.crew.map(c=>`<tr>
            <td>${c.no}</td>
            <td><a onclick="go('crew/view/${c.id}')"><strong>${c.name}</strong></a></td>
            <td>${c.position}</td>
            <td>${c.nationality}</td>
            <td>${c.vessel}</td>
            <td>${c.onboard}</td>
            <td>${c.cert_count}</td>
            <td>${statusBadge(c.status)}</td>
            <td class="row-actions"><a onclick="go('crew/view/${c.id}')"><i class="bi bi-eye-fill"></i></a><a><i class="bi bi-pencil-square"></i></a></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${pager(DB.crew.length)}
    </div>
  `;
};
function openCrewCertModal(){
  openModal('新增船員證件 / 證書',`
    <div class="form-grid">
      <div><label><span class="req">*</span>證件類別</label><select><option>適任證書</option><option>船員手冊</option><option>STCW 基本訓練</option><option>船員體格檢查</option><option>救生艇操作證</option><option>消防訓練證</option></select></div>
      <div><label>證件編號</label><input></div>
      <div><label>核發機關</label><input></div>
      <div><label>核發日期</label><input type="date"></div>
      <div><label>有效期限</label><input type="date"></div>
      <div class="full"><label>附件</label><input type="file"></div>
    </div>
  `,`<button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('已新增')">儲存</button>`);
}

// === 08 請購單 ===
ROUTES.pr = function(sub, id){
  if (sub==='view' && id){
    const p = DB.purchase_requests.find(x=>x.id==id);
    if (!p) return '<div class="card-x">找不到請購單</div>';
    const u = currentUser();
    if (!canSeeVessel(p.vessel)) return '<div class="card-x"><h3>權限不足</h3><p>您所屬的角色（'+u.role+'）無權檢視「'+p.vessel+'」相關請購單。</p><button class="btn-x btn-outline" onclick="go(\'pr\')">返回列表</button></div>';
    const isMine = p.applicant === u.username;
    const linkedRfqs = (p.linked_rfqs||[]).map(no=>DB.rfqs.find(r=>r.no===no)).filter(Boolean);
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'請購單管理',route:'pr'},{label:p.no}])}
      ${pageTitle('請購單功能管理')}

      ${p.status==='駁回'?`<div class="err-banner">
        <strong><i class="bi bi-exclamation-triangle-fill"></i> 此請購單於 ${p.reviewed_at} 被 ${p.reviewer} 駁回</strong>
        <div style="margin-top:6px">原因：${p.reject_reason}</div>
        ${(u.side==='岸端' || isMine)?`<button class="btn-x btn-warn mt-2" onclick="editLegacyDraftPR(${p.id})"><i class="bi bi-pencil-square"></i> 修改後重送</button>`:''}
      </div>`:''}

      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">檢視請購單 - ${p.no}</h3>
          <div class="right-actions">
            ${p.status==='審核中' && canApprove()?`<button class="btn-x btn-success" onclick="openReviewDialog('PR',${p.id})"><i class="bi bi-clipboard-check"></i> 審核</button>`:''}
            ${(p.status==='通過'||p.status==='已詢價') && (u.role==='採購人員'||u.role==='採購主管'||u.role==='系統管理員')?`<button class="btn-x btn-info" onclick="createRfqFromPR(${p.id})"><i class="bi bi-plus-lg"></i> 建立詢價單</button>`:''}
            ${p.status==='已詢價' && (u.role==='採購人員'||u.role==='採購主管'||u.role==='系統管理員')?`<button class="btn-x btn-outline" onclick="goRfqFor('${p.no}')"><i class="bi bi-list-ul"></i> 查看詢價列表</button>`:''}
            ${(p.status==='草稿'||p.status==='駁回') && (u.side==='岸端' || isMine)?`<button class="btn-x btn-warn" onclick="editLegacyDraftPR(${p.id})"><i class="bi bi-pencil-square"></i> 編輯</button>`:''}
            <button class="btn-x btn-outline">列印</button>
            <button class="btn-x btn-outline" onclick="go('pr')">返回</button>
          </div>
        </div>
        <div class="info-row">
          <div><b>請購單號：</b><span>${p.no}</span></div>
          <div><b>狀態：</b>${statusBadge(p.status)}</div>
          <div><b>類別：</b><span class="b ${p.type==='物料'?'b-blue':(p.type==='配件'?'b-purple':'b-yellow')}">${p.type}</span></div>
          <div><b>申請人：</b><span>${p.applicant_name||p.applicant} (${p.applicant})</span></div>
          <div><b>船舶：</b><span>${p.vessel}</span></div>
          <div><b>船東：</b><span>${p.owner||'-'}</span></div>
          <div><b>送審日期：</b><span>${p.send_at||'-'}</span></div>
          <div><b>期望到貨：</b><span>${p.expected_delivery||'-'}</span></div>
          <div><b>異動人員：</b><span>${p.updated_by||'-'}</span></div>
          <div><b>異動時間：</b><span>${p.updated_at||'-'}</span></div>
          ${p.urgent?'<div><span class="b b-red"><i class="bi bi-fire"></i> 緊急需求</span></div>':''}
          ${p.key_eq?'<div><span class="b b-purple"><i class="bi bi-star-fill"></i> 關鍵裝備</span></div>':''}
        </div>
        <h4 class="sub-title">請購主旨：${p.subject}</h4>

        <div class="pill-tabs">
          <div class="tab active"><i class="bi bi-card-list"></i> 請購項目（${(p.item_list||[]).length}）</div>
          <div class="tab"><i class="bi bi-link-45deg"></i> 後續單據</div>
        </div>

        <table class="tbl">
          <thead>
            <tr>
              <th>IMPA</th><th>產品名稱 / 規格</th><th>單位</th>
              ${p.type==='維修'?'':'<th>安全庫存</th><th>目前庫存</th>'}
              <th>申請數量</th><th>備註</th>
            </tr>
          </thead>
          <tbody>
            ${(p.item_list||[]).map(it=>`<tr>
              <td>${it.impa||'-'}</td>
              <td><strong>${it.name}</strong>${it.spec?'<br><small class="text-muted">'+it.spec+'</small>':''}</td>
              <td>${it.unit}</td>
              ${p.type==='維修'?'':`<td>${it.safety||0}</td><td>${(it.stock||0)<(it.safety||0)?'<span style="color:var(--danger);font-weight:600">'+(it.stock||0)+'</span>':(it.stock||0)}</td>`}
              <td><strong>${it.qty}</strong></td>
              <td style="white-space:pre-line;max-width:340px">${it.remark||''}</td>
            </tr>`).join('') || '<tr><td colspan="7" class="empty">無項目</td></tr>'}
          </tbody>
        </table>

        ${p.status==='已詢價' && linkedRfqs.length>0?`
          <h4 class="sub-title mt-3"><i class="bi bi-search"></i> 已產生的詢價單（${linkedRfqs.length} 家）</h4>
          <table class="tbl">
            <thead><tr><th>詢價單號</th><th>廠商</th><th>幣別</th><th>項目</th><th>${canSeeAmount()?'總額':'金額'}</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>
              ${linkedRfqs.map(r=>`<tr>
                <td><strong>${r.no}</strong></td>
                <td>${r.vendor}</td>
                <td>${r.currency}</td>
                <td>${r.items}</td>
                <td>${priceText(r.total, r.currency)}</td>
                <td>${statusBadge(r.status)}</td>
                <td class="row-actions">
                  ${canSeeVendorQuotes()?`<a onclick="viewRFQDetail(${r.id})"><i class="bi bi-eye-fill"></i> 詳情</a>`:'<span class="text-muted" style="font-size:12px">船端不可見</span>'}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
          ${u.side==='船端'?`<div class="text-muted mt-2" style="font-size:12px"><i class="bi bi-shield-lock"></i> 船端視角：可看到 RFQ 已建立、單號、廠商、狀態，但「金額」與「比價詳情」由岸端採購端處理。</div>`:''}
        `:''}

        ${p.status==='通過'?`
          <div class="status-box mt-3" style="background:#15803d"><i class="bi bi-check-circle-fill"></i> 已審核通過 ${p.reviewed_at?('於 '+p.reviewed_at):''} ${p.reviewer?('（審核：'+p.reviewer+'）'):''}${(u.role==='採購人員'||u.role==='採購主管'||u.role==='系統管理員')?' － 可進入詢價流程':''}</div>
        `:''}
      </div>
    `;
  }
  if (sub==='new'){
    return renderPRWizard();
  }
  // 列表
  const u = currentUser();
  const visiblePRs = filterPRsByUser(DB.purchase_requests);
  const visibleSubmitted = filterPRsByUser(STATE.submittedPRs);
  // 草稿過濾：船端只看自己建的
  const visibleDrafts = STATE.savedDrafts.filter(d=>{
    if (u.side==='岸端') return true;
    return d.applicant === u.username;
  });
  const showCreate = canCreatePR();
  const draftsSection = visibleDrafts.length===0 ? '' : `
    <div class="card-x" style="background:#fffbeb;border:1px solid #fde68a">
      <div class="flex between aic"><h3 class="section-title mb-0"><i class="bi bi-pencil-square" style="color:#d97706"></i> 我的草稿（${STATE.savedDrafts.length} 張）</h3>
        <small class="text-muted">草稿會自動同步到此清單，可隨時開啟編輯或刪除</small>
      </div>
      <table class="tbl">
        <thead><tr><th>草稿編號</th><th>主旨</th><th>船舶</th><th>類別</th><th>項目</th><th>屬性</th><th>申請人</th><th>最後儲存</th><th>操作</th></tr></thead>
        <tbody>
          ${visibleDrafts.map(e=>`<tr style="background:#fff">
            <td><strong>${e.id}</strong></td>
            <td>${(e.draft && e.draft.subject) || '<span class="text-muted">(未填主旨)</span>'}</td>
            <td>${e.vessel||'<span class="text-muted">未指定</span>'}</td>
            <td>${e.category?('<span class="b b-blue">'+e.category+'</span>'):'<span class="b b-gray">未選</span>'}</td>
            <td>${e.items}</td>
            <td>${e.urgent?'<span class="b b-red"><i class="bi bi-fire"></i> 緊急</span> ':''}${e.key_eq?'<span class="b b-purple"><i class="bi bi-star-fill"></i> 關鍵</span>':''}</td>
            <td>${e.applicant||'admin'}</td>
            <td>${e.saved_at}${e.auto_synced_at && e.auto_synced_at!==e.saved_at?'<br><small class="text-muted">自動同步 '+e.auto_synced_at+'</small>':''}</td>
            <td class="row-actions">
              <a onclick="editSavedDraft('${e.id}')"><i class="bi bi-pencil-square"></i> 編輯</a>
              <a class="danger" onclick="deleteSavedDraft('${e.id}')"><i class="bi bi-trash"></i></a>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'請購單功能管理'},{label:'請購單列表'}])}
    ${pageTitle('請購單功能管理')}
    ${draftsSection}
    <div class="card-x">
      <div class="flex between aic">
        <h3 class="section-title mb-0">請購單列表
          <small class="text-muted" style="font-size:13px;font-weight:normal">
            ${u.side==='船端' ? `<i class="bi bi-shield-check"></i> 船端權限：僅顯示「${(u.assigned_vessels||[]).join('、')}」相關，金額隱藏` : `<i class="bi bi-shield-check"></i> 岸端權限：可查看 ${visiblePRs.length+visibleSubmitted.length} 筆`}
          </small>
        </h3>
        ${showCreate?`<button class="btn-x btn-primary" onclick="newDraftFromScratch()"><i class="bi bi-plus-lg"></i> 新增請購單</button>`:`<span class="text-muted" style="font-size:12px"><i class="bi bi-info-circle"></i> 你的角色不可建立請購單</span>`}
      </div>
      ${filterRow(`
        <input class="form-control" placeholder="送審日期區間" type="text" onfocus="this.type='date'">
        <select class="form-select"><option>全部船舶</option>${(u.assigned_vessels||DB.vessels.map(v=>v.name)).map(v=>`<option>${v.name||v}</option>`).join('')}</select>
        <select class="form-select"><option>全部狀態</option><option>草稿</option><option>審核中</option><option>通過</option><option>駁回</option><option>已詢價</option></select>
        <select class="form-select"><option>全部類別</option><option>物料</option><option>配件</option><option>維修</option></select>
        <input class="form-control grow" placeholder="請輸入單號 / 主旨關鍵字">
      `)}
      <table class="tbl mt-2">
        <thead><tr><th>請購單編號</th><th>請購主旨</th><th>分類</th><th>項目</th><th>申請人</th><th>船舶</th><th>送審日</th><th>期望到貨</th><th>狀態</th><th>審核人</th><th>屬性</th><th>異動人員 / 時間</th><th>操作</th></tr></thead>
        <tbody>
          ${visibleSubmitted.map(p=>`<tr style="background:#fff7ed">
            <td><span class="b b-yellow">新</span> ${p.no}</td>
            <td>${p.subject}</td>
            <td>${p.type}</td>
            <td>${p.items}</td>
            <td>${p.applicant}</td>
            <td>${p.vessel}</td>
            <td>${p.send_at}</td>
            <td>${p.expected_delivery||'-'}</td>
            <td>${statusBadge(p.status)}</td>
            <td>${p.reviewer}</td>
            <td>${p.urgent?'<span class="b b-red"><i class="bi bi-fire"></i></span> ':''}${p.key_eq?'<span class="b b-purple"><i class="bi bi-star-fill"></i></span>':''}</td>
            <td><small>${p.updated_by||'-'}<br><span class="text-muted">${p.updated_at||'-'}</span></small></td>
            <td class="row-actions"><a onclick="viewSubmittedPR('${p.no}')"><i class="bi bi-eye-fill"></i></a></td>
          </tr>`).join('')}
          ${visiblePRs.map(p=>{
            const isMine = p.applicant === u.username;
            const canEditLegacy = (p.status==='草稿' || p.status==='駁回') && (u.side==='岸端' || isMine);
            return `<tr>
              <td><a onclick="go('pr/view/${p.id}')">${p.no}</a></td>
              <td>${p.subject}</td>
              <td><span class="b ${p.type==='物料'?'b-blue':(p.type==='配件'?'b-purple':'b-yellow')}">${p.type}</span></td>
              <td>${p.items}</td>
              <td>${p.applicant_name||p.applicant}<br><small class="text-muted">${p.applicant}</small></td>
              <td>${p.vessel}</td>
              <td>${p.send_at}</td>
              <td>${p.expected_delivery||'-'}</td>
              <td>${statusBadge(p.status)}${p.status==='駁回'?'<br><small class="text-muted" style="cursor:help" title="'+(p.reject_reason||'').replace(/"/g,'&quot;')+'">查看原因</small>':''}</td>
              <td>${p.reviewer||'-'}<br><small class="text-muted">${p.reviewed_at||'-'}</small></td>
              <td>${p.urgent?'<span class="b b-red"><i class="bi bi-fire"></i></span> ':''}${p.key_eq?'<span class="b b-purple"><i class="bi bi-star-fill"></i></span>':''}</td>
              <td><small>${p.updated_by||'-'}<br><span class="text-muted">${p.updated_at||'-'}</span></small></td>
              <td class="row-actions">
                <a onclick="go('pr/view/${p.id}')" title="檢視"><i class="bi bi-eye-fill"></i></a>
                ${canEditLegacy ? `<a onclick="editLegacyDraftPR(${p.id})" title="${p.status==='駁回'?'修改後重送':'編輯草稿'}"><i class="bi bi-pencil-square"></i></a>` : ''}
                ${p.status==='審核中' && canApprove() ? `<a class="text-success" onclick="openReviewDialog('PR',${p.id})" title="審核"><i class="bi bi-clipboard-check"></i></a>` : ''}
                ${p.status==='通過' && (u.role==='採購人員' || u.role==='採購主管' || u.role==='系統管理員') ? `<a class="text-info" onclick="goRfqFor('${p.no}')" title="進入詢價"><i class="bi bi-arrow-right-circle"></i></a>` : ''}
              </td>
            </tr>`;
          }).join('')}
          ${(visiblePRs.length===0 && visibleSubmitted.length===0)?'<tr><td class="empty" colspan="12">您所屬權限範圍內目前沒有請購單</td></tr>':''}
        </tbody>
      </table>
      ${pager(visiblePRs.length + visibleSubmitted.length)}
    </div>
  `;
};

// ========== PR 審核操作 (岸端用) ==========
function approveDBPR(id){
  const p = DB.purchase_requests.find(x=>x.id==id);
  if (!p) return;
  if (!canApprove()){ toast('權限不足'); return; }
  if (!confirm('確認審核通過「'+p.subject+'」？通過後將進入詢價流程。')) return;
  p.status = '通過';
  p.reviewer = currentUser().username;
  p.reviewed_at = new Date().toISOString().slice(0,10).replace(/-/g,'/') + ' ' + new Date().toTimeString().slice(0,5);
  p.reject_reason = null;
  logActivity('審核通過', '請購單 '+p.no, p.subject);
  toast('已審核通過');
  render();
}
function rejectDBPR(id){
  const p = DB.purchase_requests.find(x=>x.id==id);
  if (!p) return;
  if (!canApprove()){ toast('權限不足'); return; }
  const reason = prompt('請輸入駁回原因（≥ 10 字，會通知申請人）：');
  if (!reason || reason.trim().length<10){ toast('駁回原因需至少 10 字'); return; }
  p.status = '駁回';
  p.reviewer = currentUser().username;
  p.reviewed_at = new Date().toISOString().slice(0,10).replace(/-/g,'/') + ' ' + new Date().toTimeString().slice(0,5);
  p.reject_reason = reason.trim();
  logActivity('駁回', '請購單 '+p.no, reason.trim());
  toast('已駁回，申請人可修改後重送');
  render();
}
function goRfqFor(prNo){
  // 切到 RFQ 列表並過濾此 PR
  window.__rfqPrFilter = prNo;
  go('rfq');
}
function viewSubmittedPR(no){
  const p = STATE.submittedPRs.find(x=>x.no===no);
  if (!p) return;
  const itemsHtml = p.item_list.map(it=>`<tr><td>${it.impa||'-'}</td><td>${it.name}</td><td>${it.unit}</td><td>${it.qty}</td><td>${it.remark||''}</td></tr>`).join('');
  openModal('檢視請購單 - '+p.no, `
    <div class="info-row">
      <div><b>請購單號：</b>${p.no}</div>
      <div><b>類別：</b>${p.type}</div>
      <div><b>狀態：</b>${statusBadge(p.status)}</div>
      <div><b>申請人：</b>${p.applicant}</div>
      <div><b>船舶：</b>${p.vessel}</div>
      <div><b>送出日：</b>${p.send_at}</div>
      ${p.urgent?'<span class="b b-red"><i class="bi bi-exclamation-triangle-fill"></i> 緊急需求</span>':''}
      ${p.key_eq?'<span class="b b-purple"><i class="bi bi-star-fill"></i> 關鍵裝備</span>':''}
    </div>
    <h4 class="sub-title">請購主旨：${p.subject}</h4>
    <table class="tbl">
      <thead><tr><th>IMPA</th><th>名稱</th><th>單位</th><th>申請數量</th><th>備註</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  `, `
    <button class="btn-x btn-success" onclick="approveSubmittedPR('${p.no}')"><i class="bi bi-check-lg"></i> 審核通過</button>
    <button class="btn-x btn-danger" onclick="rejectSubmittedPR('${p.no}')"><i class="bi bi-x-lg"></i> 駁回</button>
    <button class="btn-x btn-outline" onclick="closeModal()">關閉</button>
  `, true);
}
function approveSubmittedPR(no){
  const p = STATE.submittedPRs.find(x=>x.no===no);
  if (!p) return;
  p.status = '通過'; p.reviewer = 'k.lin'; p.reviewed_at = new Date().toISOString().slice(0,10).replace(/-/g,'/');
  saveState();
  logActivity('審核通過', '請購單 '+no, p.subject);
  closeModal(); render(); toast('已審核通過');
}
function rejectSubmittedPR(no){
  const p = STATE.submittedPRs.find(x=>x.no===no);
  if (!p) return;
  p.status = '駁回'; p.reviewer = 'k.lin'; p.reviewed_at = new Date().toISOString().slice(0,10).replace(/-/g,'/');
  saveState();
  logActivity('駁回', '請購單 '+no, p.subject);
  closeModal(); render(); toast('已駁回');
}

// ====== Wizard 主框架 ======
function renderPRWizard(){
  const d = STATE.draftPR;
  const step = d.step || 1;
  const errors = window.__stepErrors || [];
  const errsHtml = errors.length ? `
    <div class="err-banner">
      <strong><i class="bi bi-exclamation-triangle-fill"></i> 還有 ${errors.length} 個欄位需要修正：</strong>
      <ul>${errors.map(e=>`<li>${e.msg}</li>`).join('')}</ul>
    </div>` : '';
  const savedTxt = d.last_saved_at ? '💾 草稿已儲存於 '+d.last_saved_at : '💾 草稿即時自動儲存';

  let body = '';
  if (step===1) body = renderStep1(d, errors);
  else if (step===2) body = renderStep2(d, errors);
  else if (step===3) body = renderStep3(d, errors);
  else body = renderStep4(d);

  const stepDef = [
    {n:1, title:'基本資訊', desc:'船舶 / 類別 / 主旨'},
    {n:2, title:'請購項目', desc:'品項 / 數量'},
    {n:3, title:'補充資訊', desc:'屬性 / 附件 / 備註'},
    {n:4, title:'確認送出', desc:'預覽 / 送審'},
  ];

  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'請購單管理',route:'pr'},{label:'新增請購單'}])}
    ${pageTitle('新增請購單')}

    <div class="wizard-bar">
      ${stepDef.map(s=>`
        <div class="step ${step===s.n?'active':(step>s.n?'done':'')}" onclick="${step>=s.n?`gotoStep(${s.n})`:''}">
          <div class="num">${step>s.n?'<i class=\"bi bi-check-lg\"></i>':s.n}</div>
          <div class="lab">${s.title}</div>
          <div class="desc">${s.desc}</div>
        </div>
      `).join('')}
    </div>

    ${errsHtml}

    <div class="card-x">${body}</div>

    <div class="wizard-foot">
      <div>
        ${step>1 ? `<button class="btn-x btn-outline" onclick="prevStep()"><i class="bi bi-arrow-left"></i> 上一步</button>` : `<button class="btn-x btn-outline" onclick="go('pr')">取消</button>`}
        <button class="btn-x btn-outline" style="margin-left:6px" onclick="if(confirm('將清空所有草稿欄位（包含已選項目、附件等）')){STATE.draftPR=createEmptyDraftPR();saveState();logActivity('清空草稿請購單','草稿請購單','');render();toast('草稿已清空');}">清空草稿</button>
      </div>
      <div class="save-state"><span class="dot"></span>${savedTxt}</div>
      <div>
        <button class="btn-x btn-outline" onclick="saveDraftAsDraft()"><i class="bi bi-cloud-arrow-up"></i> 暫存</button>
        ${step<4
          ? `<button class="btn-x btn-primary" onclick="nextStep()">下一步 <i class="bi bi-arrow-right"></i></button>`
          : `<button class="btn-x btn-info" onclick="submitWizard()"><i class="bi bi-send"></i> 確認送出審核</button>`}
      </div>
    </div>
  `;
}

function renderStep1(d, errs){
  const errOf = (f)=>errs.find(e=>e.field===f);
  const fld = (f)=>errOf(f)?`<div class="field-err"><i class="bi bi-exclamation-circle"></i> ${errOf(f).msg}</div>`:'';
  const inv = (f)=>errOf(f)?'is-invalid':'';
  const ownerByVessel = d.vessel ? (DB.vessels.find(v=>v.name===d.vessel)?.owner||'') : '';
  if (ownerByVessel && d.owner!==ownerByVessel){ d.owner = ownerByVessel; saveState(); }
  const minReq = d.send_at ? new Date(new Date(d.send_at).getTime()+86400000*3).toISOString().slice(0,10) : '';

  return `
    <h3 class="section-title"><i class="bi bi-1-circle-fill" style="color:var(--primary)"></i> Step 1：基本資訊</h3>
    <p class="text-muted" style="margin-top:-8px">告訴系統「為哪艘船、要做什麼、何時要」。船東會由船舶自動帶出。</p>

    <h4 class="sub-title">為哪艘船請購？</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
      ${DB.vessels.slice(0,4).map(v=>`
        <div class="vessel-card ${d.vessel===v.name?'selected':''}" onclick="updateDraftPRField('vessel','${v.name}');render()">
          <div class="vico"><i class="bi bi-truck-front-fill"></i></div>
          <div class="vinfo"><b>${v.name}</b><small>${v.owner} ・ ${v.type}</small></div>
        </div>`).join('')}
    </div>
    <div style="margin-top:8px">其他船舶：
      <select class="form-control ${inv('vessel')}" style="display:inline-block;width:auto;height:32px" onchange="updateDraftPRField('vessel',this.value);render()">
        <option value="">— 請選擇 —</option>
        ${DB.vessels.map(v=>`<option ${d.vessel===v.name?'selected':''}>${v.name}</option>`).join('')}
      </select>
      ${d.vessel?`　<span class="text-muted">船東：<strong style="color:#111827">${ownerByVessel}</strong>（自動帶入）</span>`:''}
    </div>
    ${fld('vessel')}

    <h4 class="sub-title mt-4">這次要請購什麼類別？</h4>
    <div class="cat-cards">
      <div class="cat-card ${d.category==='物料'?'selected':''}" onclick="changeDraftPRCategory('物料')">
        <div class="ic cmat"><i class="bi bi-collection"></i></div>
        <div class="nm">物料</div>
        <div class="ds">耗材、備品 (IMPA)<br>用 IMPA 代碼搜尋</div>
      </div>
      <div class="cat-card ${d.category==='配件'?'selected':''}" onclick="changeDraftPRCategory('配件')">
        <div class="ic cpart"><i class="bi bi-puzzle-fill"></i></div>
        <div class="nm">配件</div>
        <div class="ds">設備零件、整套組<br>由設備樹找件號</div>
      </div>
      <div class="cat-card ${d.category==='維修'?'selected':''}" onclick="changeDraftPRCategory('維修')">
        <div class="ic crep"><i class="bi bi-tools"></i></div>
        <div class="nm">維修</div>
        <div class="ds">故障維修、勘工<br>填工單式描述</div>
      </div>
    </div>
    ${fld('category')}
    ${d.category==='維修'?'<div class="text-muted" style="font-size:12px"><i class="bi bi-info-circle"></i> 維修類請購不對應庫存，後續會由廠商勘工後產生報價。</div>':''}
    ${d.category==='配件'?'<div class="text-muted" style="font-size:12px"><i class="bi bi-info-circle"></i> 配件依設備位置歸類（主機 → 渦輪增壓器 → 軸承），可從設備樹快速找到件號。</div>':''}

    <h4 class="sub-title mt-4">主旨與時程</h4>
    <div class="form-section">
      <div class="form-grid">
        <div class="full">
          <label><span class="req">*</span>請購主旨</label>
          <input class="${inv('subject')}" value="${escapeAttr(d.subject||'')}" oninput="updateDraftPRField('subject',this.value)" placeholder="例：${d.vessel||'東方勇士'}-${new Date().getMonth()+1}月-${d.category||'物料'}-定期添購消耗品">
          ${fld('subject')}
        </div>
        <div>
          <label>申請人</label>
          <input value="${d.applicant}" readonly style="background:#f3f4f6">
        </div>
        <div>
          <label><span class="req">*</span>送審日期</label>
          <input type="date" class="${inv('send_at')}" value="${d.send_at||''}" oninput="updateDraftPRField('send_at',this.value);render()">
          ${fld('send_at')}
        </div>
        <div>
          <label>期望到貨／到港日 ${d.urgent?'<span class="b b-red" style="font-size:10px">緊急可少於 3 天</span>':'<small class="text-muted">建議 ≥ 送審日 + 3 天</small>'}</label>
          <input type="date" class="${inv('expected_delivery')}" value="${d.expected_delivery||''}" min="${minReq}" oninput="updateDraftPRField('expected_delivery',this.value)">
          ${fld('expected_delivery')}
        </div>
        ${d.category!=='維修' ? `
        <div class="full">
          <label><span class="req">*</span>收貨倉庫 <small class="text-muted">（已依船舶過濾）</small></label>
          <select class="${inv('warehouse')}" onchange="updateDraftPRField('warehouse',this.value)">
            <option value="">請選擇</option>
            ${DB.warehouses.filter(w=>w.vessel===d.vessel||w.vessel==='-').map(w=>`<option ${d.warehouse===w.name?'selected':''}>${w.name}</option>`).join('')}
          </select>
          ${fld('warehouse')}
        </div>` : ''}
      </div>
    </div>
  `;
}

function renderStep2(d, errs){
  const errOf = (f)=>errs.find(e=>e.field===f);
  if (d.category==='維修') return renderStep2Repair(d, errs);
  if (d.category==='配件') return renderStep2Parts(d, errs);
  return renderStep2Material(d, errs);
}

function renderStep2Material(d, errs){
  const errItems = errs.find(e=>e.field==='items');
  const itemsHtml = d.items.length===0
    ? `<tr><td colspan="9" class="empty">尚未加入任何物料，請點下方「<strong>新增物料項目</strong>」按鈕，從 IMPA 庫挑選。</td></tr>`
    : d.items.map((it,idx)=>{
      const lowStock = (it.stock||0) < (it.safety||0);
      return `<tr>
        <td>${idx+1}</td>
        <td>${it.impa||'-'}</td>
        <td><strong>${it.name}</strong>${it.spec?'<br><small class="text-muted">'+it.spec+'</small>':''}</td>
        <td>${it.unit}</td>
        <td>${it.safety||0}</td>
        <td>${lowStock?'<span class="b b-red">'+(it.stock||0)+'</span>':(it.stock||0)}</td>
        <td><input class="form-control" style="height:30px;width:80px" type="number" min="1" value="${it.qty}" oninput="updateDraftItemField(${idx},'qty',this.value)"></td>
        <td><input class="form-control" style="height:30px" value="${escapeAttr(it.remark||'')}" oninput="updateDraftItemField(${idx},'remark',this.value)" placeholder="（選填）"></td>
        <td class="row-actions"><a class="danger" onclick="removeDraftItem(${idx})" title="移除"><i class="bi bi-trash"></i></a></td>
      </tr>`;
    }).join('');
  const total = d.items.length;

  return `
    <h3 class="section-title"><i class="bi bi-2-circle-fill" style="color:var(--primary)"></i> Step 2：請購項目（物料）</h3>
    <p class="text-muted" style="margin-top:-8px">用 IMPA 代碼或品名搜尋，已加入清單後可直接編輯數量與備註。</p>

    ${errItems?`<div class="err-banner"><i class="bi bi-exclamation-triangle-fill"></i> ${errItems.msg}</div>`:''}

    <div class="filter-row">
      <button class="btn-x btn-primary" onclick="openItemPicker()"><i class="bi bi-plus-lg"></i> 新增物料項目</button>
      <button class="btn-x btn-outline" onclick="applyTemplate()"><i class="bi bi-files"></i> 套用上次同船請購</button>
      <div class="right text-muted">已選 <strong style="color:#111827">${total}</strong> 項</div>
    </div>

    <table class="tbl">
      <thead><tr><th>#</th><th>IMPA</th><th>品名 / 規格</th><th>單位</th><th>安全庫存</th><th>目前庫存</th><th>申請數量</th><th>備註</th><th>操作</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  `;
}

function renderStep2Parts(d, errs){
  const errItems = errs.find(e=>e.field==='items');
  const path = d.equipment_path || '';
  // 解析路徑找出該節點的 items
  let activeItems = [];
  let activeName = '';
  if (path){
    const [l1,l2] = path.split('|');
    const node1 = DEVICE_TREE.find(n=>n.name===l1);
    if (node1){
      const node2 = node1.children.find(c=>c.name===l2);
      if (node2){ activeItems = node2.items; activeName = l1+' / '+l2; }
    }
  }

  const itemsHtml = d.items.length===0
    ? `<tr><td colspan="7" class="empty">請從左側設備樹選擇位置，再從右側點擊配件加入。</td></tr>`
    : d.items.map((it,idx)=>`<tr>
        <td>${idx+1}</td>
        <td>${it.impa}</td>
        <td><strong>${it.name}</strong><br><small class="text-muted">${it.spec||''}</small></td>
        <td>${it.unit}</td>
        <td><input class="form-control" style="height:30px;width:80px" type="number" min="1" value="${it.qty}" oninput="updateDraftItemField(${idx},'qty',this.value)"></td>
        <td><input class="form-control" style="height:30px" value="${escapeAttr(it.remark||'')}" oninput="updateDraftItemField(${idx},'remark',this.value)" placeholder="（選填）"></td>
        <td class="row-actions"><a class="danger" onclick="removeDraftItem(${idx})"><i class="bi bi-trash"></i></a></td>
      </tr>`).join('');

  return `
    <h3 class="section-title"><i class="bi bi-2-circle-fill" style="color:var(--primary)"></i> Step 2：請購項目（配件）</h3>
    <p class="text-muted" style="margin-top:-8px">配件依設備位置歸類，從左側設備樹選擇 → 右側點擊配件即可加入。</p>

    ${errItems?`<div class="err-banner"><i class="bi bi-exclamation-triangle-fill"></i> ${errItems.msg}</div>`:''}

    <div class="dtree">
      <div class="left">
        ${DEVICE_TREE.map(n1=>`
          <div class="node lvl1"><i class="bi bi-gear-wide-connected"></i> ${n1.name}</div>
          ${n1.children.map(n2=>{
            const p = n1.name+'|'+n2.name;
            return `<div class="node lvl2 ${path===p?'active':''}" onclick="selectEqNode('${p}')"><i class="bi bi-dot"></i> ${n2.name}</div>`;
          }).join('')}
        `).join('')}
      </div>
      <div class="right">
        ${activeName ? `
          <h5 style="margin:0 0 10px"><i class="bi bi-tools"></i> ${activeName}</h5>
          <table class="tbl">
            <thead><tr><th>IMPA</th><th>件號名稱</th><th>單位</th><th>規格</th><th>操作</th></tr></thead>
            <tbody>
              ${activeItems.map(it=>{
                const added = d.items.some(x=>x.impa===it.impa);
                return `<tr>
                  <td>${it.impa}</td><td><strong>${it.name}</strong></td><td>${it.unit}</td><td>${it.spec}</td>
                  <td class="row-actions">
                    ${added?'<span class="b b-gray">已加入</span>':`<a onclick="addPartFromTree('${it.impa}','${it.name}','${it.unit}','${escapeAttr(it.spec)}')"><i class="bi bi-plus-lg"></i> 加入</a>`}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : `<div class="text-muted text-center" style="padding:60px 0"><i class="bi bi-arrow-left" style="font-size:24px"></i><br>請先從左側選擇設備位置</div>`}
      </div>
    </div>

    <h4 class="sub-title mt-4">已選配件（${d.items.length} 項）</h4>
    <table class="tbl">
      <thead><tr><th>#</th><th>IMPA</th><th>件號 / 規格</th><th>單位</th><th>數量</th><th>備註</th><th>操作</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  `;
}

function renderStep2Repair(d, errs){
  const errItems = errs.find(e=>e.field==='items');
  const m = d.repair_meta||{};
  // 系統設備清單（從 DEVICE_TREE 與儲存的自訂設備合併）
  const sysEq = [];
  DEVICE_TREE.forEach(n1=>n1.children.forEach(n2=>sysEq.push(n1.name+' / '+n2.name)));
  if (!STATE.customEquipment) STATE.customEquipment = [];
  const allEq = [...new Set([...sysEq, ...STATE.customEquipment])];
  const photos = (d.attachments||[]).filter(a=>a.kind==='photo');
  const isCustom = m.equipment && !sysEq.includes(m.equipment);

  return `
    <h3 class="section-title"><i class="bi bi-tools" style="color:var(--warning)"></i> Step 2：報修申請</h3>
    <p class="text-muted" style="margin-top:-8px">填寫故障設備與症狀，可拍照／上傳圖片補充說明。後續由岸端審核並決定處理方式。</p>

    ${errItems?`<div class="err-banner"><i class="bi bi-exclamation-triangle-fill"></i> ${errItems.msg}</div>`:''}

    <div class="form-section">
      <h4 class="sub-title" style="margin-top:0"><i class="bi bi-gear-wide-connected"></i> 對應設備</h4>
      <div class="form-grid">
        <div class="full">
          <label><span class="req">*</span>設備名稱（系統清單可選，找不到可直接輸入新設備）</label>
          <input list="eqDataList" value="${escapeAttr(m.equipment||'')}" placeholder="例：主機 / 渦輪增壓器；或自行輸入" oninput="updateRepairMeta('equipment',this.value)">
          <datalist id="eqDataList">
            ${allEq.map(e=>`<option value="${escapeAttr(e)}">`).join('')}
          </datalist>
          <div class="text-muted" style="font-size:12px;margin-top:4px">
            ${m.equipment ? (isCustom ? '<i class="bi bi-plus-circle text-success" style="color:#22c55e"></i> 自訂設備（送出時會加入系統清單）' : '<i class="bi bi-check-circle" style="color:#22c55e"></i> 來自系統設備清單') : '<i class="bi bi-info-circle"></i> 從清單選或直接輸入'}
            ${isCustom ? `　<a onclick="saveCustomEquipment('${escapeAttr(m.equipment)}')" style="cursor:pointer">立即加入清單</a>` : ''}
          </div>
        </div>
        <div><label>關聯件號（選填）</label><input value="${escapeAttr(m.part_no||'')}" oninput="updateRepairMeta('part_no',this.value)" placeholder="若已知件號可填寫"></div>
        <div><label>影響程度</label>
          <select onchange="updateRepairMeta('impact',this.value)">
            <option value="">— 請選擇 —</option>
            ${['輕微（不影響適航）','中度（部分功能失效）','嚴重（影響適航）','緊急（停航中）'].map(t=>`<option ${m.impact===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>

      <h4 class="sub-title"><i class="bi bi-chat-square-text"></i> 症狀說明（圖文）</h4>
      <div class="photo-actions">
        <button class="pa-btn cam" onclick="addRepairPhoto('camera')"><i class="bi bi-camera-fill"></i> 拍照</button>
        <button class="pa-btn" onclick="addRepairPhoto('upload')"><i class="bi bi-image"></i> 上傳圖片</button>
        <button class="pa-btn" onclick="addRepairPhoto('doc')"><i class="bi bi-file-earmark-medical"></i> 上傳檢測資料</button>
      </div>
      <div class="form-grid">
        <div class="full">
          <label><span class="req">*</span>故障描述（≥ 10 字，可搭配照片說明）</label>
          <textarea rows="5" oninput="updateRepairMeta('symptom',this.value)" placeholder="請描述：故障現象、發生時間、是否影響運作、目前處理狀況&#10;&#10;例：渦輪增壓器運轉時產生規律性低頻噪音，巡航 2 小時後溫度偏高 8-10°C；已減載運行（見附圖）。">${escapeAttr(m.symptom||'')}</textarea>
        </div>
      </div>
      ${photos.length>0?`
        <div class="photo-gallery">
          ${photos.map((p,i)=>{
            const allIdx = (d.attachments||[]).indexOf(p);
            return `<div class="photo-thumb" title="${p.name}">
              <i class="bi bi-${p.type==='image'?'image':'file-earmark-medical'}"></i>
              <div class="lbl">${p.name}</div>
              <div class="src">${p.source==='camera'?'📷 拍照':(p.source==='doc'?'📋 文件':'🖼️ 上傳')}</div>
              <button class="rm-btn" onclick="removeAttachment(${allIdx})" title="移除"><i class="bi bi-x"></i></button>
            </div>`;
          }).join('')}
        </div>
      `:'<div class="text-muted" style="font-size:12px;margin-top:4px"><i class="bi bi-info-circle"></i> 還未加入照片；點上方按鈕拍照或上傳</div>'}

      <details style="margin-top:12px;background:#f9fafb;border-radius:6px;padding:8px 12px">
        <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#6b7280;list-style:none">▸ 進階選項（發生時機 / 目前處置 / 派工 / 港口）</summary>
        <div style="margin-top:10px">
          <div class="form-grid">
            <div class="full">
              <label style="display:block;margin-bottom:4px">發生時機</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${['啟航時','航行中','入港','隨機'].map(t=>`<label style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border:1px solid ${m.timing===t?'var(--primary)':'#d1d5db'};border-radius:99px;background:${m.timing===t?'#eef2fb':'#fff'};color:${m.timing===t?'var(--primary)':'#374151'};font-size:13px;cursor:pointer;font-weight:${m.timing===t?'600':'normal'}"><input type="radio" name="rtim" style="margin:0" ${m.timing===t?'checked':''} onchange="updateRepairMeta('timing','${t}')"> ${t}</label>`).join('')}
              </div>
            </div>
            <div class="full"><label>目前處置</label><textarea oninput="updateRepairMeta('current_action',this.value)" placeholder="目前是否已減載、停機或暫時處理...">${escapeAttr(m.current_action||'')}</textarea></div>
            <div class="full">
              <label style="display:block;margin-bottom:4px">建議派工方式</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${['直接派工','勘工後派工'].map(t=>`<label style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border:1px solid ${m.dispatch_type===t?'var(--primary)':'#d1d5db'};border-radius:99px;background:${m.dispatch_type===t?'#eef2fb':'#fff'};color:${m.dispatch_type===t?'var(--primary)':'#374151'};font-size:13px;cursor:pointer;font-weight:${m.dispatch_type===t?'600':'normal'}"><input type="radio" name="rdis" style="margin:0" ${m.dispatch_type===t?'checked':''} onchange="updateRepairMeta('dispatch_type','${t}')"> ${t}</label>`).join('')}
              </div>
            </div>
            <div class="full"><label>預計處理港口</label><input value="${escapeAttr(m.target_port||'')}" oninput="updateRepairMeta('target_port',this.value)" placeholder="例：高雄、新加坡"></div>
          </div>
          <div class="text-muted" style="font-size:12px;margin-top:8px"><i class="bi bi-info-circle"></i> 進階選項由岸端審核時參考；船端不填也可送審。</div>
        </div>
      </details>

      <div class="text-muted mt-3" style="font-size:12px"><i class="bi bi-check-circle text-success" style="color:#22c55e"></i> 一張維修申請即一個請購項目，填寫對應設備與症狀後會自動建立，不需要額外點選「加入請購項目」。</div>
    </div>
  `;
}

// ====== 維修拍照／上傳圖片 ======
function addRepairPhoto(source){
  const sampleImages = ['故障部位特寫.jpg','銘牌照片.jpg','現場全景.jpg','溫度顯示.jpg','油漬痕跡.jpg'];
  const sampleDocs  = ['檢測報告.pdf','測振數據.xlsx','維修建議書.pdf'];
  const isDoc = source==='doc';
  const samples = isDoc ? sampleDocs : sampleImages;
  const idx = (STATE.draftPR.attachments||[]).filter(a=>a.kind==='photo').length;
  const baseName = samples[idx % samples.length];
  const filename = (source==='camera'?'IMG_'+nowStamp().replace(/[\/\s:]/g,'')+'.jpg':baseName);
  if (!STATE.draftPR.attachments) STATE.draftPR.attachments = [];
  STATE.draftPR.attachments.push({
    name: filename,
    size: 1500000 + Math.floor(Math.random()*1000000),
    type: isDoc ? (filename.endsWith('.pdf')?'pdf':'docx') : 'image',
    kind: 'photo',
    source: source,
    uploaded_at: nowStamp()
  });
  saveState();
  logActivity(source==='camera'?'拍照':(source==='doc'?'上傳檢測資料':'上傳圖片'), '維修申請', filename);
  render();
  toast(source==='camera' ? '已拍照：'+filename : '已加入：'+filename);
}
function saveCustomEquipment(name){
  if (!STATE.customEquipment) STATE.customEquipment = [];
  if (!STATE.customEquipment.includes(name)){
    STATE.customEquipment.push(name);
    saveState();
    logActivity('新增自訂設備', name, '加入系統設備清單');
    toast('已加入系統設備清單：'+name);
    render();
  }
}

function renderStep3(d, errs){
  const errAtt = errs.find(e=>e.field==='attachments');
  return `
    <h3 class="section-title"><i class="bi bi-3-circle-fill" style="color:var(--primary)"></i> Step 3：補充資訊</h3>
    <p class="text-muted" style="margin-top:-8px">屬性、附件、備註，越完整越能加速採購端處理。</p>

    <h4 class="sub-title">重要屬性</h4>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <button class="attr-pill urgent ${d.urgent?'on':''}" onclick="toggleAttrFlag('urgent')">
        <i class="bi bi-${d.urgent?'fire':'flame'}"></i> 緊急需求
      </button>
      <button class="attr-pill key ${d.key_eq?'on':''}" onclick="toggleAttrFlag('key_eq')">
        <i class="bi bi-${d.key_eq?'star-fill':'star'}"></i> 關鍵裝備
      </button>
    </div>
    <div class="attr-effect">
      ${d.urgent?'<div><i class="bi bi-info-circle"></i> 緊急需求會直接通知採購主管 LINE，且免二級審核（總經理）。</div>':''}
      ${d.key_eq?'<div style="margin-top:4px"><i class="bi bi-info-circle"></i> 關鍵裝備需附上設備銘牌或現場照，並由總經理審核。</div>':''}
      ${(!d.urgent && !d.key_eq)?'<div>勾選後會顯示影響說明。一般請購流程約需 4-8 小時審核。</div>':''}
    </div>

    <h4 class="sub-title mt-4">附件 ${d.key_eq?'<span class="b b-red">必填</span>':'<small class="text-muted">（選填）</small>'}</h4>
    <div class="dropzone" onclick="addMockAttachment()">
      <i class="bi bi-cloud-upload" style="font-size:28px"></i>
      <div style="margin-top:6px">點擊新增模擬附件（demo 用）｜實際版本支援拖拉、貼上、相機拍照</div>
      <small>支援 jpg, png, pdf, docx；單檔 ≤ 10MB</small>
    </div>
    ${errAtt?`<div class="field-err"><i class="bi bi-exclamation-circle"></i> ${errAtt.msg}</div>`:''}
    ${d.attachments.length>0?`<div class="att-list">
      ${d.attachments.map((a,i)=>`<div class="att">
        <i class="bi bi-${a.type==='image'?'file-image':(a.type==='pdf'?'file-pdf':'file-text')}"></i>
        <span class="nm">${a.name}</span>
        <span class="sz">${(a.size/1024).toFixed(0)} KB</span>
        <button class="rm" onclick="removeAttachment(${i})"><i class="bi bi-x-lg"></i></button>
      </div>`).join('')}
    </div>`:''}

    <h4 class="sub-title mt-4">備註</h4>
    <div class="form-section">
      <div class="form-grid">
        <div class="full">
          <label>給採購人員的補充說明（選填）</label>
          <textarea oninput="updateDraftPRField('buyer_note',this.value)" placeholder="特殊規格、付款條件、其他需採購端注意的事項">${escapeAttr(d.buyer_note||'')}</textarea>
        </div>
      </div>
      <div class="text-muted" style="font-size:12px"><i class="bi bi-info-circle"></i> 詢價廠商由岸端採購端統一決定，船端無需指定。</div>
    </div>
  `;
}

function renderStep4(d){
  const total = d.items.reduce((s,it)=>s+(it.qty||0)*(0),0); // demo 不算金額
  const itemRows = d.items.map(it=>`<tr><td>${it.impa||'-'}</td><td>${it.name}</td><td>${it.unit}</td><td>${it.qty}</td><td>${it.remark||''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">無項目</td></tr>';
  return `
    <h3 class="section-title"><i class="bi bi-4-circle-fill" style="color:var(--primary)"></i> Step 4：確認送出</h3>
    <p class="text-muted" style="margin-top:-8px">送出前最後檢查。送出後狀態變為「審核中」，採購主管會收到通知。</p>

    <div class="snap">
      <h5><i class="bi bi-file-earmark-text"></i> 單據快照（PR-${new Date().toISOString().slice(0,7).replace('-','')}-XXXX 待產生）</h5>
      <div class="row"><b>船舶：</b><span>${d.vessel||'-'}</span><b>船東：</b><span>${d.owner||'-'}</span><b>類別：</b><span class="b b-blue">${d.category||'-'}</span></div>
      <div class="row"><b>主旨：</b><span style="font-size:15px;font-weight:600">${escapeAttr(d.subject||'(未填)')}</span></div>
      <div class="row"><b>送審日：</b><span>${d.send_at||'-'}</span><b>期望到貨：</b><span>${d.expected_delivery||'-'}</span><b>收貨倉庫：</b><span>${d.warehouse||'(維修不入庫)'}</span></div>
      <div class="row">
        ${d.urgent?'<span class="b b-red"><i class="bi bi-fire"></i> 緊急需求</span>':''}
        ${d.key_eq?'<span class="b b-purple"><i class="bi bi-star-fill"></i> 關鍵裝備</span>':''}
      </div>
    </div>

    <div class="snap">
      <h5><i class="bi bi-list-ul"></i> 請購項目（${d.items.length} 項）</h5>
      <table class="tbl"><thead><tr><th>IMPA</th><th>名稱</th><th>單位</th><th>數量</th><th>備註</th></tr></thead><tbody>${itemRows}</tbody></table>
    </div>

    ${d.attachments.length>0?`<div class="snap">
      <h5><i class="bi bi-paperclip"></i> 附件（${d.attachments.length}）</h5>
      <div class="att-list">${d.attachments.map(a=>`<div class="att"><i class="bi bi-file-earmark"></i><span class="nm">${a.name}</span><span class="sz">${(a.size/1024).toFixed(0)} KB</span></div>`).join('')}</div>
    </div>`:''}

    ${d.buyer_note?`<div class="snap">
      <h5><i class="bi bi-chat-left-text"></i> 給採購人員的備註</h5>
      <div style="white-space:pre-line;font-size:13px;color:#374151">${escapeAttr(d.buyer_note)}</div>
    </div>`:''}


    <div class="snap">
      <h5><i class="bi bi-diagram-3"></i> 預計審核流程</h5>
      <div class="timeline">
        <div class="tnode done"><b>申請人</b><small>${d.applicant} ・ 將於送出時打上時戳</small></div>
        <div class="tnode cur"><b>採購人員</b><small>m.chen 陳俊宏 ・ 收到後分派</small></div>
        <div class="tnode"><b>採購主管</b><small>k.lin 林佳穎 ・ 審核採購預算與廠商</small></div>
        ${(d.urgent||d.key_eq)?'<div class="tnode"><b>總經理</b><small>因為'+(d.urgent?'緊急':'')+(d.urgent&&d.key_eq?' + ':'')+(d.key_eq?'關鍵裝備':'')+'觸發二級審核</small></div>':''}
      </div>
      <div class="text-muted" style="font-size:12px"><i class="bi bi-clock"></i> 預估審核時間：${d.urgent?'2 小時內':'4-8 小時'}</div>
    </div>
  `;
}
function escapeAttr(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function toggleExpectedVendor(name){
  const arr = STATE.draftPR.expected_vendors;
  const i = arr.indexOf(name);
  if (i>=0) arr.splice(i,1); else arr.push(name);
  saveState(); render();
}
function applyTemplate(){
  // 套用上次同船同類型模板
  const last = STATE.submittedPRs.find(p=>p.vessel===STATE.draftPR.vessel && p.type===STATE.draftPR.category)
            || DB.purchase_requests.find(p=>p.vessel===STATE.draftPR.vessel && p.type===STATE.draftPR.category);
  if (!last){ toast('找不到此船同類型的歷史請購'); return; }
  if (last.item_list && last.item_list.length){
    STATE.draftPR.items = JSON.parse(JSON.stringify(last.item_list));
  } else {
    STATE.draftPR.items = JSON.parse(JSON.stringify(DB.pr_items_demo)).map(x=>({impa:x.impa,name:x.name,unit:x.unit,cat:STATE.draftPR.category,spec:'',safety:x.min_req,stock:x.stock,qty:x.qty,remark:x.remark}));
  }
  saveState();
  logActivity('套用模板', '草稿請購單', '從 '+(last.no||'歷史單')+' 帶入 '+STATE.draftPR.items.length+' 項');
  toast('已套用模板：'+STATE.draftPR.items.length+' 項');
  render();
}
function submitWizard(){
  // 全步驟驗證
  let allErrs = [];
  for (let s=1; s<=3; s++){ allErrs = allErrs.concat(validateStep(s).map(e=>({step:s, ...e}))); }
  if (allErrs.length){
    window.__stepErrors = allErrs;
    STATE.draftPR.step = allErrs[0].step;
    saveState();
    render();
    toast('還有 '+allErrs.length+' 個錯誤，請依步驟修正');
    return;
  }
  // 沿用既有 submitDraftPR（並補上新欄位）
  const d = STATE.draftPR;
  const yyyymm = new Date().toISOString().slice(0,7).replace('-','');
  const seq = (STATE.submittedPRs.length+1).toString().padStart(4,'0');
  const no = 'PR-'+yyyymm+'-'+seq;
  STATE.submittedPRs.unshift({
    no, subject:d.subject, type:d.category, items:d.items.length, applicant:d.applicant,
    vessel:d.vessel, send_at:d.send_at, expected_delivery:d.expected_delivery,
    status:'審核中', reviewer:'-', reviewed_at:'-',
    updated_by:d.applicant, updated_at:new Date().toISOString().replace('T',' ').slice(0,19),
    urgent:d.urgent, key_eq:d.key_eq, warehouse:d.warehouse, owner:d.owner,
    item_list: d.items.slice(),
    attachments: d.attachments.slice(),
    buyer_note: d.buyer_note,
    expected_vendors: d.expected_vendors.slice(),
    repair_meta: d.category==='維修' ? Object.assign({}, d.repair_meta) : null,
    from_draft_id: d.draft_id || null
  });
  // 送出後清除對應草稿條目
  if (d.draft_id){
    STATE.savedDrafts = STATE.savedDrafts.filter(x=>x.id!==d.draft_id);
  }
  STATE.draftPR = createEmptyDraftPR();
  saveState();
  logActivity('送出審核', '請購單 '+no, d.subject+'（'+d.items.length+' 項）');
  toast('請購單 '+no+' 已送出審核');
  go('pr');
}
// 覆寫舊的 saveDraftAsDraft 以更新 last_saved_at
function saveDraftAsDraft(){
  const d = STATE.draftPR;
  // 內容空白時拒絕儲存
  if (!d.subject && !d.vessel && d.items.length===0){
    toast('草稿內容為空，請至少填寫主旨或船舶');
    return;
  }
  // 第一次暫存：分配 draft_id
  if (!d.draft_id) d.draft_id = 'DRAFT-'+Date.now().toString(36).toUpperCase();
  d.last_saved_at = new Date().toLocaleString('zh-TW',{hour12:false}).replace(/\//g,'/');
  // 寫入或更新 savedDrafts 條目
  const snap = JSON.parse(JSON.stringify(d));
  const summary = makeDraftSummary(d);
  const entry = {
    id: d.draft_id, summary,
    saved_at: d.last_saved_at,
    auto_synced_at: d.last_saved_at,
    draft: snap,
    vessel: d.vessel, category: d.category,
    items: d.items.length, urgent: d.urgent, key_eq: d.key_eq,
    applicant: d.applicant
  };
  const idx = STATE.savedDrafts.findIndex(x=>x.id===d.draft_id);
  if (idx>=0) STATE.savedDrafts[idx] = entry;
  else STATE.savedDrafts.unshift(entry);
  saveState();
  logActivity('儲存草稿', d.draft_id, summary);
  toast('草稿已儲存（'+d.draft_id+'）');
}
function editSavedDraft(id){
  const e = STATE.savedDrafts.find(x=>x.id===id);
  if (!e){ toast('找不到草稿'); return; }
  const cur = STATE.draftPR;
  // 若目前正在編輯不同的草稿且有未存內容，提示
  if (cur.draft_id !== id && (cur.subject || cur.items.length || cur.vessel)){
    if (!confirm(
      '目前正在編輯：\n  '+ makeDraftSummary(cur) +'\n\n要切換到下列草稿嗎？\n  '+ e.summary +'\n\n• 確定 → 載入此草稿（目前的編輯若未暫存將遺失）\n• 取消 → 留在當前頁'
    )) return;
    if (cur.draft_id){
      // 把目前內容回寫到它原本的草稿條目
      const idx = STATE.savedDrafts.findIndex(x=>x.id===cur.draft_id);
      if (idx>=0) STATE.savedDrafts[idx].draft = JSON.parse(JSON.stringify(cur));
    }
  }
  STATE.draftPR = JSON.parse(JSON.stringify(e.draft));
  STATE.draftPR.draft_id = id; // 確保 ID 一致
  saveState();
  logActivity('開啟草稿', id, e.summary);
  go('pr/new');
}
function deleteSavedDraft(id){
  const e = STATE.savedDrafts.find(x=>x.id===id);
  if (!e){ return; }
  if (!confirm('確定刪除草稿？此動作無法復原：\n\n'+e.summary)) return;
  STATE.savedDrafts = STATE.savedDrafts.filter(x=>x.id!==id);
  if (STATE.draftPR.draft_id === id){
    STATE.draftPR = createEmptyDraftPR();
  }
  saveState();
  logActivity('刪除草稿', id, e.summary);
  toast('草稿已刪除');
  render();
}
function newDraftFromScratch(){
  const cur = STATE.draftPR;
  // 若有進行中內容
  if (cur.subject || cur.items.length || cur.vessel){
    const choice = confirm(
      '目前有未送審的編輯內容：\n  '+ makeDraftSummary(cur) +'\n\n要先暫存再開新單嗎？\n\n• 確定 → 暫存後開新單\n• 取消 → 直接開新單（目前內容若未暫存將遺失）'
    );
    if (choice) {
      saveDraftAsDraft();
    } else {
      if (!confirm('目前的編輯內容將遺失，確定建立新單？')) return;
    }
  }
  STATE.draftPR = createEmptyDraftPR();
  saveState();
  go('pr/new');
}
// 從 DB 中現存的「草稿」狀態請購單載入（demo 用）
function editLegacyDraftPR(id){
  const p = DB.purchase_requests.find(x=>x.id==id);
  if (!p) return;
  if (STATE.draftPR.subject || STATE.draftPR.items.length){
    if (!confirm('目前有編輯中的草稿，確定切換到歷史草稿「'+p.subject+'」？')) return;
  }
  // 把舊資料映射到 wizard schema
  const d = createEmptyDraftPR();
  d.draft_id = 'DRAFT-LEGACY-'+p.id;
  d.subject = p.subject;
  d.category = p.type;
  d.vessel = p.vessel;
  d.warehouse = p.warehouse && p.warehouse !== '-' ? p.warehouse : '';
  d.send_at = p.send_at && p.send_at !== '-' ? p.send_at.replace(/\//g,'-') : new Date().toISOString().slice(0,10);
  d.urgent = !!p.urgent; d.key_eq = !!p.key_eq;
  d.applicant = p.applicant || 'admin';
  // 帶入示意品項
  d.items = (p.type==='物料'?DB.pr_items_demo:[]).map(x=>({
    impa:x.impa, name:x.name, unit:x.unit, cat:p.type, spec:'', safety:x.min_req, stock:x.stock, qty:x.qty, remark:x.remark||''
  }));
  d.step = 1;
  STATE.draftPR = d;
  // 也加入 savedDrafts 以便編輯後追蹤
  saveDraftAsDraft();
  logActivity('載入歷史草稿', d.draft_id, p.subject);
  go('pr/new');
}
function filterDraftItems(q){
  q = (q||'').toLowerCase();
  document.querySelectorAll('#draftItemsTbl tbody tr').forEach(r=>{
    if (r.querySelector('.empty')) return;
    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
function openItemPicker(){
  const cat = STATE.draftPR.category || '物料';
  if (cat==='維修') return openRepairItemModal();
  const items = (cat==='配件') ? DB.items_part : DB.items_material;
  const existing = new Set(STATE.draftPR.items.map(i=>i.impa));
  const titleMap = { '物料':'選擇物料項目', '配件':'選擇配件項目' };
  const escAttr = (s='') => String(s).replace(/"/g,'&quot;');
  const html = `
    <div class="flex between aic mb-2">
      <span class="text-muted">類別：<strong>${cat}</strong>　僅顯示「<strong>${cat}</strong>」可選項目（共 ${items.length} 筆）。要切換類別請先關閉此視窗，於主表單修改「請購類別」。</span>
    </div>
    <input class="form-control mb-2" placeholder="搜尋 IMPA / 品名 / 規格" oninput="filterPickerRows(this.value)">
    <table class="tbl">
      <thead><tr>
        <th style="width:40px"><input type="checkbox" onchange="document.querySelectorAll('#modalBody tr[data-impa] input.pick-cb:not(:disabled)').forEach(c=>c.checked=this.checked)"></th>
        <th>IMPA</th><th>品名</th><th>單位</th><th>分類</th><th>規格</th><th>安全庫存</th><th>目前庫存</th><th>申請數量</th>
      </tr></thead>
      <tbody>
        ${items.map(it=>{
          const dup = existing.has(it.impa);
          return `<tr data-impa="${escAttr(it.impa)}" data-name="${escAttr(it.name)}" data-unit="${escAttr(it.unit)}" data-cat="${escAttr(it.cat)}" data-spec="${escAttr(it.spec)}" data-safety="${it.safety}" data-stock="${it.stock||0}">
            <td><input type="checkbox" class="pick-cb" ${dup?'disabled checked':''}></td>
            <td>${it.impa}</td>
            <td><strong>${it.name}</strong>${dup?' <span class="b b-gray">已加入</span>':''}</td>
            <td>${it.unit}</td>
            <td>${it.cat}</td>
            <td>${it.spec||''}</td>
            <td>${it.safety}</td>
            <td>${it.stock||0}</td>
            <td><input class="form-control pick-qty" style="height:28px;width:80px" type="number" min="1" value="${Math.max(it.safety||1,1)}" ${dup?'disabled':''}></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <p class="text-muted mt-2"><i class="bi bi-info-circle"></i> 已加入的項目會自動勾選並停用，避免重複加入。要修改數量請於主表單編輯。</p>
  `;
  openModal(titleMap[cat]||'選擇項目', html, `
    <button class="btn-x btn-outline" onclick="closeModal()">取消</button>
    <button class="btn-x btn-primary" onclick="addItemsFromPicker()"><i class="bi bi-plus-lg"></i> 加入勾選項目</button>
  `, true);
}
function filterPickerRows(q){
  q = (q||'').toLowerCase();
  document.querySelectorAll('#modalBody tbody tr[data-impa]').forEach(r=>{
    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
function openRepairItemModal(){
  openModal('新增維修項目', `
    <p class="text-muted">維修類請購不對應庫存品項，請填寫維修主旨與描述。後續會由廠商勘工後產生派工單與報價。</p>
    <div class="form-grid">
      <div class="full"><label><span class="req">*</span>維修項目主旨</label><input id="repSubj" placeholder="例：渦輪增壓器軸承異音檢修"></div>
      <div><label>數量</label><input id="repQty" type="number" min="1" value="1"></div>
      <div><label>單位</label><input id="repUnit" value="件"></div>
      <div class="full"><label>對應設備</label><input id="repEq" placeholder="例：主機渦輪增壓器 ABB A170-L"></div>
      <div class="full"><label>故障描述 / 維修需求</label><textarea id="repDesc" rows="4" placeholder="說明問題現象、發生時機、希望廠商處理範圍..."></textarea></div>
    </div>
  `, `
    <button class="btn-x btn-outline" onclick="closeModal()">取消</button>
    <button class="btn-x btn-primary" onclick="addRepairItemFromModal()"><i class="bi bi-plus-lg"></i> 加入維修項目</button>
  `);
}

// === 09 詢價單 ===
ROUTES.rfq = function(sub, id){
  if (sub==='edit' || sub==='view'){
    const r = id ? DB.rfqs.find(x=>x.id==id) : DB.rfqs[0];
    if (!r) return `<div class="card-x"><h3>找不到詢價單</h3><p class="text-muted">編號 ${id} 不存在於資料中。</p><button class="btn-x btn-outline" onclick="go('rfq')">返回</button></div>`;
    const pr = DB.purchase_requests.find(p=>p.no===r.pr_no);
    const vendor = DB.vendors.find(v=>v.id===r.vendor_id) || DB.vendors.find(v=>v.short_name===r.vendor);
    const u = currentUser();
    if (!canSeeVessel(r.vessel)) return `<div class="card-x"><h3>權限不足</h3><p>您（${u.role}）無權檢視「${r.vessel}」相關詢價單。</p><button class="btn-x btn-outline" onclick="go('rfq')">返回</button></div>`;
    const hasQuote = (r.item_list||[]).some(it=>it.unit_price>0) || (r.attachments||[]).length>0;
    const totalCalc = (r.item_list||[]).reduce((s,it)=>s+(it.unit_price||0)*(it.qty||0),0);

    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'詢價單管理',route:'rfq'},{label:r.no||'編輯詢價單'}])}
      ${pageTitle('詢價單功能管理')}

      <div class="card-x">
        <div class="flex between aic">
          <h3 class="section-title mb-0">${sub==='view'?'檢視':'編輯'}詢價單 - ${r.no}</h3>
          <div class="right-actions">
            ${r.status==='待審核' && canApprove()?`<button class="btn-x btn-success" onclick="openReviewDialog('RFQ',${r.id})"><i class="bi bi-clipboard-check"></i> 審核</button>`:''}
            ${r.status==='詢價中' && hasQuote?`<button class="btn-x btn-info" onclick="markRfqPendingReview(${r.id})"><i class="bi bi-send"></i> 送出待審核</button>`:''}
            <button class="btn-x btn-primary" onclick="saveRfqDraft(${r.id})"><i class="bi bi-cloud-arrow-up"></i> 儲存</button>
            <button class="btn-x btn-outline" onclick="go('rfq')">返回</button>
          </div>
        </div>
        <div class="info-row">
          <div><b>詢價單號：</b><span>${r.no}</span></div>
          <div><b>狀態：</b>${statusBadge(r.status)}</div>
          <div><b>幣別：</b><span>${r.currency}</span></div>
          <div><b>負責人：</b><span>${r.buyer}</span></div>
          <div><b>報價日期：</b><span>${r.quoted_at}</span></div>
          <div><b>異動人員：</b><span>${r.updated_by||'-'}</span></div>
          <div><b>異動時間：</b><span>${r.updated_at||'-'}</span></div>
        </div>

        <details class="coll" ${(!pr || sub==='view')?'':'open'}>
          <summary><i class="bi bi-clipboard-data"></i> 對應請購單資訊 ${pr?`<span class="text-muted" style="font-weight:normal;margin-left:6px">${pr.no} ・ ${pr.type} ・ ${pr.vessel}</span>`:''}</summary>
          <div class="body">
            ${pr?`
              <div class="form-grid">
                <div><label>請購單號</label><div><a onclick="go('pr/view/${pr.id}')"><strong>${pr.no}</strong></a></div></div>
                <div><label>類別</label><div><span class="b ${pr.type==='物料'?'b-blue':(pr.type==='配件'?'b-purple':'b-yellow')}">${pr.type}</span></div></div>
                <div><label>船舶</label><div>${pr.vessel}（${pr.owner||'-'}）</div></div>
                <div><label>申請人</label><div>${pr.applicant_name||pr.applicant} (${pr.applicant})</div></div>
                <div class="full"><label>主旨</label><div><strong>${pr.subject}</strong></div></div>
              </div>
            `:`<div class="text-muted"><i class="bi bi-exclamation-circle"></i> 找不到對應請購單 ${r.pr_no}</div>`}
          </div>
        </details>

        <h4 class="sub-title"><i class="bi bi-shop"></i> 詢價廠商</h4>
        <div class="form-section">
          <div class="form-grid">
            <div>
              <label><span class="req">*</span>詢價廠商（來自廠商主檔）</label>
              <div style="display:flex;gap:6px;align-items:center">
                <input value="${vendor?vendor.short_name+'（'+vendor.code+'）':''}" readonly style="background:#fff;flex:1" placeholder="尚未選擇廠商">
                <button class="btn-x btn-outline" onclick="openRfqVendorPicker(${r.id})"><i class="bi bi-search"></i> 選擇/變更</button>
              </div>
              ${vendor?`<small class="text-muted" style="display:block;margin-top:4px"><i class="bi bi-person"></i> ${vendor.contact} ・ <i class="bi bi-telephone"></i> ${vendor.phone} ・ ${vendor.category} ・ ${vendor.currency}</small>`:'<small class="text-danger">尚未選擇廠商</small>'}
            </div>
            <div><label>幣別</label><input value="${r.currency}" readonly style="background:#f3f4f6"></div>
            <div><label>負責人</label><input value="${r.buyer}" oninput="updateRfqField(${r.id},'buyer',this.value)"></div>
            <div><label>報價日期</label><input type="date" value="${(r.quoted_at||'').replace(/\//g,'-')}" oninput="updateRfqField(${r.id},'quoted_at',this.value.replace(/-/g,'/'))"></div>
          </div>
        </div>

        <h4 class="sub-title"><i class="bi bi-truck"></i> 廠商回覆資訊</h4>
        <div class="form-section">
          <div class="form-grid">
            <div><label>廠商提供工作天</label><input type="number" min="0" value="${r.vendor_workdays||''}" placeholder="廠商承諾天數" oninput="updateRfqField(${r.id},'vendor_workdays',parseInt(this.value)||null)"></div>
            <div><label>預計交期</label><input type="date" value="${(r.vendor_lead_date||'').replace(/\//g,'-')}" oninput="updateRfqField(${r.id},'vendor_lead_date',this.value.replace(/-/g,'/'))"></div>
            <div class="full"><label>備註（廠商回覆說明、付款條件、含稅含運等）</label><textarea oninput="updateRfqField(${r.id},'vendor_remark',this.value)" placeholder="例：交期 7 天，含稅含運，付款月結 30 天">${escapeAttr(r.vendor_remark||'')}</textarea></div>
          </div>
        </div>

        <h4 class="sub-title flex between aic">
          <span><i class="bi bi-paperclip"></i> 廠商報價單檔案（${(r.attachments||[]).length}）</span>
          <button class="btn-x btn-outline btn-icon" onclick="addRfqAttachment(${r.id})" title="一次上傳一個檔案"><i class="bi bi-cloud-upload"></i> 上傳檔案</button>
        </h4>
        <div class="dropzone-mini" onclick="addRfqAttachment(${r.id})">
          <i class="bi bi-cloud-upload"></i>
          <span>點擊上傳一份報價單（單檔 ≤ 10MB；支援 pdf/docx/xlsx/jpg/png）</span>
        </div>
        ${(r.attachments||[]).length>0?`<table class="tbl mt-2">
          <thead><tr><th>檔名</th><th>上傳人員</th><th>上傳時間</th><th style="width:90px">操作</th></tr></thead>
          <tbody>
            ${(r.attachments||[]).map((a,i)=>`<tr>
              <td><i class="bi bi-file-earmark-${a.filename.endsWith('.pdf')?'pdf':a.filename.endsWith('.docx')?'word':'text'}"></i> ${a.filename}</td>
              <td>${a.uploaded_by}</td>
              <td>${a.uploaded_at}</td>
              <td class="row-actions">
                <a title="下載"><i class="bi bi-download"></i></a>
                <a class="danger" onclick="removeRfqAttachment(${r.id},${i})" title="刪除"><i class="bi bi-trash"></i></a>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>`:''}

        <h4 class="sub-title flex between aic"><span><i class="bi bi-list-ul"></i> 報價項目（${(r.item_list||[]).length} 項）</span>
          <div>
            <button class="btn-x btn-outline" onclick="openHistoryQuote('${escapeAttr(r.vendor||'')}')"><i class="bi bi-clock-history"></i> 商品歷史詢價</button>
            <button class="btn-x btn-primary" onclick="openRfqItemPicker(${r.id})"><i class="bi bi-plus-lg"></i> 新增報價項目</button>
          </div>
        </h4>
        <table class="tbl">
          <thead><tr><th>來源</th><th>IMPA</th><th>產品名稱</th><th>單位</th><th>請購數</th><th>報價數</th><th>單價(${r.currency})</th><th>小計</th><th>備註</th><th>操作</th></tr></thead>
          <tbody>
            ${(r.item_list||[]).map((it,idx)=>{
              const fromPr = (pr && pr.item_list||[]).some(x=>x.impa===it.impa);
              const reqQty = fromPr ? ((pr.item_list||[]).find(x=>x.impa===it.impa)||{}).qty : '-';
              return `<tr>
                <td>${fromPr?'<span class="src-pr"><i class="bi bi-link-45deg"></i> 請購項目</span>':'<span class="src-other">外加</span>'}</td>
                <td>${it.impa||'-'}</td>
                <td>${it.name}</td>
                <td>${it.unit}</td>
                <td>${reqQty}</td>
                <td><input class="form-control" style="height:30px;width:70px" type="number" value="${it.qty}" oninput="updateRfqItem(${r.id},${idx},'qty',parseFloat(this.value)||0)"></td>
                <td><input class="form-control" style="height:30px;width:100px" type="number" value="${it.unit_price||''}" oninput="updateRfqItem(${r.id},${idx},'unit_price',parseFloat(this.value)||0)"></td>
                <td>${canSeeAmount()?(it.unit_price?(it.unit_price*it.qty).toLocaleString():'-'):'<span class="text-muted">- - -</span>'}</td>
                <td><input class="form-control" style="height:30px" placeholder="(選填)" value="${escapeAttr(it.remark||'')}" oninput="updateRfqItem(${r.id},${idx},'remark',this.value)"></td>
                <td class="row-actions"><a class="danger" onclick="removeRfqItem(${r.id},${idx})"><i class="bi bi-trash"></i></a></td>
              </tr>`;
            }).join('')||'<tr><td colspan="10" class="empty">尚無報價項目；填入單價或上傳報價單後狀態會自動進入「待審核」</td></tr>'}
            ${(r.item_list||[]).length>0?`<tr style="background:#f3f4f6"><td colspan="7" class="text-right"><strong>總計</strong></td><td><strong>${canSeeAmount()?(r.currency==='USD'?'$':'NT$')+' '+totalCalc.toLocaleString():'- - -'}</strong></td><td colspan="2"></td></tr>`:''}
          </tbody>
        </table>

        ${r.status==='審核不通過' && r.reject_reason?`<div class="err-banner mt-3"><strong><i class="bi bi-x-circle"></i> 審核不通過</strong><div style="margin-top:6px">${r.reject_reason}</div></div>`:''}
        ${r.status==='審核通過'?`<div class="status-box mt-3" style="background:#15803d"><i class="bi bi-check-circle-fill"></i> 已審核通過 ${r.reviewed_at} ${r.updated_by?'（'+r.updated_by+'）':''}</div>`:''}
      </div>
    `;
  }
  // 詢價單列表 - 含 PR 關聯與權限
  const u = currentUser();
  const canSeeRFQ = u.permissions.see_vendor_quotes || u.role==='系統管理員' || u.role==='採購主管' || u.role==='採購人員';
  if (!canSeeRFQ){
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'詢價單管理'}])}
      ${pageTitle('詢價單功能管理')}
      <div class="card-x">
        <div class="text-center" style="padding:50px 0">
          <i class="bi bi-shield-lock" style="font-size:48px;color:#9ca3af"></i>
          <h3 style="margin:14px 0 6px">權限不足</h3>
          <p class="text-muted">您所屬角色（${u.role}）無權檢視詢價單詳情。<br>船端僅能在「請購單檢視」頁看到 RFQ 的單號與狀態。</p>
          <button class="btn-x btn-outline mt-3" onclick="go('pr')">回到請購單列表</button>
        </div>
      </div>
    `;
  }
  // 套用過濾
  let visibleRfqs = filterRFQsByUser(DB.rfqs);
  const prFilter = window.__rfqPrFilter || '';
  if (prFilter){ visibleRfqs = visibleRfqs.filter(r=>r.pr_no===prFilter); }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'詢價單管理'}])}
    ${pageTitle('詢價單功能管理')}
    ${prFilter?`<div class="err-banner" style="background:#dbeafe;border-color:#93c5fd;color:#1e40af">
      <i class="bi bi-funnel-fill"></i> 已過濾：對應請購單「${prFilter}」（${visibleRfqs.length} 筆）
      <button class="btn-x btn-outline" style="margin-left:10px;padding:2px 10px" onclick="window.__rfqPrFilter='';render()">清除過濾</button>
    </div>`:''}
    <div class="card-x">
      <div class="flex between aic">
        <h3 class="section-title mb-0">詢價單列表
          <small class="text-muted" style="font-size:13px;font-weight:normal">${u.role} 視角｜${visibleRfqs.length} 筆</small>
        </h3>
        <div class="right-actions">
          <button class="btn-x btn-outline" onclick="openVendorPicker()"><i class="bi bi-shop"></i> 選擇詢價廠商</button>
          <button class="btn-x btn-primary" onclick="go('rfq/edit/0')"><i class="bi bi-plus-lg"></i> 新增詢價單</button>
        </div>
      </div>
      ${filterRow(`
        <input class="form-control" placeholder="報價日期區間" type="text" onfocus="this.type='date'">
        <select class="form-select"><option>全部廠商</option>${DB.vendors.map(v=>`<option>${v.short_name}</option>`).join('')}</select>
        <select class="form-select"><option>全部狀態</option><option>草稿</option><option>已回覆</option></select>
        <input class="form-control grow" placeholder="請輸入搜尋關鍵字">
      `)}
      <table class="tbl">
        <thead><tr><th>詢價單編號</th><th>對應請購單</th><th>船舶</th><th>廠商</th><th>負責人</th><th>報價日</th><th>幣別</th><th>項目</th><th>總額</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${visibleRfqs.length===0?'<tr><td class="empty" colspan="11">無資料</td></tr>':visibleRfqs.map(r=>{
            const pr = DB.purchase_requests.find(p=>p.no===r.pr_no);
            return `<tr>
            <td><a onclick="viewRFQDetail(${r.id})">${r.no}</a></td>
            <td>${pr?`<a onclick="go('pr/view/${pr.id}')">${r.pr_no}</a><br><small class="text-muted">${pr.subject}</small>`:r.pr_no}</td>
            <td>${r.vessel}</td>
            <td>${r.vendor}</td>
            <td>${r.buyer}</td>
            <td>${r.quoted_at}</td>
            <td>${r.currency}</td>
            <td>${r.items}</td>
            <td>${priceText(r.total, r.currency)}</td>
            <td>${statusBadge(r.status)}</td>
            <td class="row-actions">
              <a onclick="viewRFQDetail(${r.id})" title="檢視"><i class="bi bi-eye-fill"></i></a>
              <a onclick="go('rfq/edit/${r.id}')" title="編輯"><i class="bi bi-pencil-square"></i></a>
            </td>
          </tr>`}).join('')}
        </tbody>
      </table>
      ${pager(visibleRfqs.length)}
    </div>
  `;
};
// ========== RFQ 編輯操作 ==========
function updateRfqField(id, field, value){
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  r[field] = value;
  // 報價填入單價 → 若為「詢價中」自動轉為「待審核」
  autoUpdateRfqStatusByQuote(r);
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
}
function updateRfqItem(id, idx, field, value){
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r || !r.item_list[idx]) return;
  r.item_list[idx][field] = value;
  if (field==='unit_price' || field==='qty'){
    r.item_list[idx].total = (r.item_list[idx].unit_price||0) * (r.item_list[idx].qty||0);
  }
  r.total = r.item_list.reduce((s,it)=>s+(it.total||0), 0);
  r.items = r.item_list.length;
  autoUpdateRfqStatusByQuote(r);
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
}
function removeRfqItem(id, idx){
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  r.item_list.splice(idx,1);
  r.items = r.item_list.length;
  r.total = r.item_list.reduce((s,it)=>s+(it.total||0), 0);
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  render();
}
function addRfqItem(id){
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  // 從對應 PR 的品項挑選
  const pr = DB.purchase_requests.find(p=>p.no===r.pr_no);
  if (!pr || !pr.item_list){ toast('無對應請購單品項'); return; }
  const existingImpa = new Set(r.item_list.map(i=>i.impa));
  const candidates = pr.item_list.filter(it=>!existingImpa.has(it.impa));
  if (candidates.length===0){ toast('已涵蓋所有請購品項'); return; }
  const html = `
    <p class="text-muted">從對應請購單 ${r.pr_no} 加入品項到此次報價：</p>
    <table class="tbl">
      <thead><tr><th></th><th>IMPA</th><th>名稱</th><th>單位</th><th>請購數</th></tr></thead>
      <tbody>${candidates.map(it=>`<tr>
        <td><input type="checkbox" value="${it.impa}" data-name="${escapeAttr(it.name)}" data-unit="${it.unit}" data-qty="${it.qty}"></td>
        <td>${it.impa||'-'}</td><td>${it.name}</td><td>${it.unit}</td><td>${it.qty}</td>
      </tr>`).join('')}</tbody>
    </table>
  `;
  openModal('加入報價項目', html, `
    <button class="btn-x btn-outline" onclick="closeModal()">取消</button>
    <button class="btn-x btn-primary" onclick="confirmAddRfqItems(${id})"><i class="bi bi-plus-lg"></i> 加入</button>
  `);
}
function confirmAddRfqItems(id){
  const r = DB.rfqs.find(x=>x.id===id);
  const checks = document.querySelectorAll('#modalBody input[type=checkbox]:checked');
  let added = 0;
  checks.forEach(c=>{
    r.item_list.push({impa:c.value, name:c.dataset.name, unit:c.dataset.unit, qty:parseFloat(c.dataset.qty)||1, unit_price:0, total:0, lead_days:null, remark:''});
    added++;
  });
  if (added===0){ toast('請至少勾選 1 個品項'); return; }
  r.items = r.item_list.length;
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  closeModal();
  render();
  toast('已加入 '+added+' 項');
}
function addRfqAttachment(id){
  // 一次只上傳一個檔案：跳出 modal 確認檔名
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  const exts = ['pdf','docx','xlsx','jpg','png'];
  openModal('上傳報價單檔案（單檔）', `
    <p class="text-muted">demo 模式：填入檔名後加入。實際版本會跳出檔案選擇器並上傳。</p>
    <div class="form-grid">
      <div class="full"><label><span class="req">*</span>檔名（含副檔名）</label>
        <input id="attFilename" placeholder="例：${(r.vendor||'廠商')}_報價單_${nowDate().replace(/\//g,'')}.pdf">
      </div>
      <div class="full"><label>檔案類型</label>
        <select id="attExt">${exts.map(e=>`<option>${e}</option>`).join('')}</select>
      </div>
      <div class="full"><small class="text-muted"><i class="bi bi-info-circle"></i> 上傳後若狀態為「詢價中」會自動轉為「待審核」。</small></div>
    </div>
  `, `
    <button class="btn-x btn-outline" onclick="closeModal()">取消</button>
    <button class="btn-x btn-primary" onclick="confirmRfqAttach(${id})"><i class="bi bi-cloud-upload"></i> 上傳</button>
  `);
}
function confirmRfqAttach(id){
  const r = DB.rfqs.find(x=>x.id===id);
  let filename = (document.getElementById('attFilename').value || '').trim();
  if (!filename){ toast('請填寫檔名'); return; }
  const ext = document.getElementById('attExt').value;
  if (!filename.includes('.')) filename = filename + '.' + ext;
  if (!r.attachments) r.attachments = [];
  r.attachments.push({
    filename,
    uploaded_by: currentUser().username,
    uploaded_at: nowStamp()
  });
  autoUpdateRfqStatusByQuote(r);
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  logActivity('上傳報價單', r.no, filename);
  closeModal();
  render();
  toast('已上傳：'+filename);
}

// ========== RFQ 廠商選擇器（modal、單選）==========
function openRfqVendorPicker(rfqId){
  const r = DB.rfqs.find(x=>x.id===rfqId);
  if (!r) return;
  const html = `
    <p class="text-muted">廠商必須來自廠商主檔；只列出狀態為「啟用」的廠商。</p>
    <input class="form-control mb-2" placeholder="搜尋代碼 / 名稱 / 類別" oninput="filterVendorPickerRows(this.value)">
    <table class="tbl">
      <thead><tr><th></th><th>代碼</th><th>名稱</th><th>聯絡人</th><th>電話</th><th>類別</th><th>幣別</th><th>評等</th></tr></thead>
      <tbody id="vpBody">
        ${DB.vendors.filter(v=>v.status==='啟用').map(v=>`<tr data-key="${v.code} ${v.name} ${v.short_name} ${v.category}">
          <td><input type="radio" name="picvend" value="${v.id}" ${r.vendor_id===v.id?'checked':''}></td>
          <td>${v.code}</td>
          <td><strong>${v.name}</strong><br><small class="text-muted">${v.short_name}</small></td>
          <td>${v.contact}</td>
          <td>${v.phone}</td>
          <td>${v.category}</td>
          <td>${v.currency}</td>
          <td><span class="b ${v.rating==='A'?'b-green':(v.rating==='B'?'b-yellow':'b-gray')}">${v.rating}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
  openModal('選擇詢價廠商', html, `
    <button class="btn-x btn-outline" onclick="closeModal()">取消</button>
    <button class="btn-x btn-primary" onclick="confirmRfqVendor(${rfqId})"><i class="bi bi-check-lg"></i> 確定選擇</button>
  `, true);
}
function filterVendorPickerRows(q){
  q = (q||'').toLowerCase();
  document.querySelectorAll('#vpBody tr').forEach(tr=>{
    tr.style.display = tr.dataset.key.toLowerCase().includes(q) ? '' : 'none';
  });
}
function confirmRfqVendor(rfqId){
  const r = DB.rfqs.find(x=>x.id===rfqId);
  const sel = document.querySelector('#vpBody input[name=picvend]:checked');
  if (!sel){ toast('請選擇一家廠商'); return; }
  const vid = parseInt(sel.value);
  const v = DB.vendors.find(x=>x.id===vid);
  if (!v){ toast('廠商不存在於主檔'); return; }
  r.vendor_id = vid;
  r.vendor = v.short_name;
  r.currency = v.currency;
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  logActivity('變更詢價廠商', r.no, v.short_name);
  closeModal();
  render();
  toast('廠商已變更為：'+v.short_name);
}

// ========== RFQ 項目選擇器（從全部物料/配件挑，標註是否為請購項目）==========
function openRfqItemPicker(rfqId){
  const r = DB.rfqs.find(x=>x.id===rfqId);
  if (!r) return;
  const pr = DB.purchase_requests.find(p=>p.no===r.pr_no);
  const prImpas = new Set((pr?.item_list||[]).map(i=>i.impa));
  const existing = new Set(r.item_list.map(i=>i.impa));
  const tab = window.__pickerTab || 'all';
  const allMat = DB.items_material.map(i=>({...i, _kind:'物料'}));
  const allPart = DB.items_part.map(i=>({...i, _kind:'配件'}));
  const allItems = [...allMat, ...allPart];
  // 加上 PR 中但庫不存在的品項（例如維修項目 IMPA='-'）
  (pr?.item_list||[]).forEach(prIt=>{
    if (!allItems.some(x=>x.impa===prIt.impa) && prIt.impa!=='-'){
      allItems.unshift({impa:prIt.impa, name:prIt.name, unit:prIt.unit, cat:prIt.cat||'-', spec:prIt.spec||'', _kind:prIt.cat||'其他'});
    }
  });
  let list = allItems;
  if (tab==='pr') list = list.filter(it=>prImpas.has(it.impa));
  else if (tab==='mat') list = list.filter(it=>it._kind==='物料');
  else if (tab==='part') list = list.filter(it=>it._kind==='配件');

  const html = `
    <p class="text-muted">可選任何品項加入報價（不限該請購單）；屬於原請購單的項目會標註「請購項目」。</p>
    <div class="pill-tabs" style="margin-bottom:8px">
      <div class="tab ${tab==='all'?'active':''}" onclick="window.__pickerTab='all';openRfqItemPicker(${rfqId})">全部 (${allItems.length})</div>
      ${pr?`<div class="tab ${tab==='pr'?'active':''}" onclick="window.__pickerTab='pr';openRfqItemPicker(${rfqId})">請購項目 (${prImpas.size})</div>`:''}
      <div class="tab ${tab==='mat'?'active':''}" onclick="window.__pickerTab='mat';openRfqItemPicker(${rfqId})">物料 (${allMat.length})</div>
      <div class="tab ${tab==='part'?'active':''}" onclick="window.__pickerTab='part';openRfqItemPicker(${rfqId})">配件 (${allPart.length})</div>
    </div>
    <input class="form-control mb-2" placeholder="搜尋 IMPA / 品名 / 規格" oninput="filterPicker2(this.value)">
    <table class="tbl">
      <thead><tr><th></th><th>來源</th><th>IMPA</th><th>品名 / 規格</th><th>類別</th><th>單位</th><th>請購數</th><th>報價數</th></tr></thead>
      <tbody id="ipBody">
        ${list.map(it=>{
          const dup = existing.has(it.impa);
          const fromPr = prImpas.has(it.impa);
          const reqQty = fromPr ? ((pr.item_list||[]).find(x=>x.impa===it.impa)||{}).qty : '-';
          const defaultQty = fromPr ? reqQty : 1;
          return `<tr data-key="${(it.impa||'')+' '+it.name+' '+(it.spec||'')}">
            <td><input type="checkbox" class="pick2-cb" ${dup?'disabled checked':''}></td>
            <td>${fromPr?'<span class="src-pr"><i class="bi bi-link-45deg"></i> 請購項目</span>':'<span class="src-other">'+(it._kind||'其他')+'</span>'}</td>
            <td>${it.impa||'-'}</td>
            <td><strong>${it.name}</strong>${it.spec?'<br><small class="text-muted">'+it.spec+'</small>':''}${dup?' <span class="b b-gray">已加入</span>':''}</td>
            <td>${it.cat||'-'}</td>
            <td>${it.unit}</td>
            <td>${reqQty}</td>
            <td><input class="form-control pick2-qty" style="height:28px;width:80px" type="number" min="1" value="${defaultQty}" ${dup?'disabled':''}></td>
          </tr>`;
        }).join('') || '<tr><td colspan="8" class="empty">無符合的品項</td></tr>'}
      </tbody>
    </table>
  `;
  openModal('新增報價項目', html, `
    <button class="btn-x btn-outline" onclick="closeModal()">取消</button>
    <button class="btn-x btn-primary" onclick="confirmRfqItemPick(${rfqId})"><i class="bi bi-plus-lg"></i> 加入勾選項目</button>
  `, true);
}
function filterPicker2(q){
  q = (q||'').toLowerCase();
  document.querySelectorAll('#ipBody tr').forEach(tr=>{
    if (tr.querySelector('.empty')) return;
    tr.style.display = (tr.dataset.key||'').toLowerCase().includes(q) ? '' : 'none';
  });
}
function confirmRfqItemPick(rfqId){
  const r = DB.rfqs.find(x=>x.id===rfqId);
  const rows = document.querySelectorAll('#ipBody tr[data-key]');
  let added = 0;
  rows.forEach(tr=>{
    const cb = tr.querySelector('input.pick2-cb');
    if (!cb || !cb.checked || cb.disabled) return;
    // 從表格資料還原
    const cells = tr.querySelectorAll('td');
    const impa = cells[2].textContent.trim();
    const name = tr.querySelector('strong')?.textContent || '';
    const unit = cells[5].textContent.trim();
    const qty = parseFloat(tr.querySelector('input.pick2-qty')?.value)||1;
    r.item_list.push({impa: impa==='-'?'':impa, name, unit, qty, unit_price:0, total:0, lead_days:null, remark:''});
    added++;
  });
  if (added===0){ toast('請至少勾選 1 項'); return; }
  r.items = r.item_list.length;
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  logActivity('加入報價項目', r.no, '加入 '+added+' 項');
  closeModal();
  render();
  toast('已加入 '+added+' 項');
}

// ========== 商品歷史詢價（可搜尋過往詢價單）==========
function openHistoryQuote(currentVendor){
  const q = window.__historyQ || '';
  const filtered = !q ? [] : (function(){
    const result = [];
    DB.rfqs.forEach(r=>{
      (r.item_list||[]).forEach(it=>{
        const text = (it.impa||'')+' '+(it.name||'')+' '+(r.vendor||'');
        if (text.toLowerCase().includes(q.toLowerCase())){
          result.push({rfq:r, item:it});
        }
      });
    });
    // 按日期由新到舊排序
    result.sort((a,b)=> (b.rfq.quoted_at||'').localeCompare(a.rfq.quoted_at||''));
    return result;
  })();

  openModal('商品歷史詢價', `
    <p class="text-muted">輸入 IMPA 或品名，自動列出過往各家廠商的單價、交期，可作為比價參考。</p>
    <input class="form-control mb-2" id="hqQuery" value="${escapeAttr(q)}" placeholder="例：救生衣、330145、潤滑油" oninput="window.__historyQ=this.value;openHistoryQuote('${escapeAttr(currentVendor||'')}')">
    ${q?`
      <div class="text-muted mb-2" style="font-size:13px">命中 ${filtered.length} 筆</div>
      <table class="tbl">
        <thead><tr><th>詢價日</th><th>詢價單</th><th>對應請購</th><th>廠商</th><th>IMPA</th><th>品名</th><th>數量</th><th>單價</th><th>幣別</th><th>交期(天)</th><th>狀態</th></tr></thead>
        <tbody>
          ${filtered.map(({rfq,item})=>`<tr ${rfq.vendor===currentVendor?'style="background:#fef9c3"':''}>
            <td>${rfq.quoted_at}</td>
            <td><a onclick="closeModal();go('rfq/edit/${rfq.id}')">${rfq.no}</a></td>
            <td>${rfq.pr_no}</td>
            <td>${rfq.vendor}</td>
            <td>${item.impa||'-'}</td>
            <td>${item.name}</td>
            <td>${item.qty}</td>
            <td>${item.unit_price?priceText(item.unit_price, rfq.currency):'<span class="text-muted">-</span>'}</td>
            <td>${rfq.currency}</td>
            <td>${item.lead_days||'-'}</td>
            <td>${statusBadge(rfq.status)}</td>
          </tr>`).join('') || '<tr><td colspan="11" class="empty">無歷史紀錄</td></tr>'}
        </tbody>
      </table>
      ${currentVendor?'<p class="text-muted mt-2" style="font-size:12px">＊黃底 = 與目前詢價單同廠商的紀錄</p>':''}
    `:'<div class="text-muted text-center" style="padding:30px 0"><i class="bi bi-search" style="font-size:24px"></i><br>請輸入關鍵字搜尋</div>'}
  `, '<button class="btn-x btn-outline" onclick="window.__historyQ=\'\';closeModal()">關閉</button>', true);
}

// ========== 統一審核 modal（PR 與 RFQ 共用）==========
function openReviewDialog(type, id){
  if (!canApprove()){ toast('權限不足，僅採購主管或系統管理員可審核'); return; }
  let title='', subject='', isRepair=false;
  if (type==='PR'){
    const p = DB.purchase_requests.find(x=>x.id===id);
    if (!p) return;
    title = '審核請購單 - '+p.no;
    subject = p.subject;
    isRepair = p.type==='維修';
  } else {
    const r = DB.rfqs.find(x=>x.id===id);
    if (!r) return;
    title = '審核詢價單 - '+r.no;
    subject = r.subject;
  }
  const u = currentUser();

  // 維修類 PR：5 個動作；其他：通過 / 不通過
  let actions;
  if (isRepair){
    actions = `
      <p class="text-muted">此為維修申請，請依故障判定選擇處理方式：</p>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0">
        <button class="btn-x btn-success" onclick="doRepairAction('dispatch',${id})" style="justify-content:flex-start;padding:14px"><i class="bi bi-truck" style="font-size:20px"></i><div style="margin-left:8px"><b>直接派工</b><br><small style="opacity:.85">產生派工單，廠商上船維修</small></div></button>
        <button class="btn-x btn-info" onclick="doRepairAction('inspect',${id})" style="justify-content:flex-start;padding:14px"><i class="bi bi-search" style="font-size:20px"></i><div style="margin-left:8px"><b>先安排場勘</b><br><small style="opacity:.85">廠商上船檢查後再決定</small></div></button>
        <button class="btn-x btn-primary" onclick="doRepairAction('quote',${id})" style="justify-content:flex-start;padding:14px"><i class="bi bi-search-heart" style="font-size:20px"></i><div style="margin-left:8px"><b>進入詢價</b><br><small style="opacity:.85">標準維修品項，多家報價</small></div></button>
        <button class="btn-x btn-warn" onclick="doRepairAction('rma',${id})" style="justify-content:flex-start;padding:14px"><i class="bi bi-arrow-return-left" style="font-size:20px"></i><div style="margin-left:8px"><b>送回原廠維修</b><br><small style="opacity:.85">建立送修單 (RMA)</small></div></button>
        <button class="btn-x btn-danger" onclick="document.getElementById('rejForm').style.display='block'" style="grid-column:1/-1;justify-content:flex-start;padding:14px"><i class="bi bi-arrow-counterclockwise" style="font-size:20px"></i><div style="margin-left:8px"><b>退回補件 / 不通過</b><br><small style="opacity:.85">需填寫退回原因</small></div></button>
      </div>`;
  } else {
    actions = `
      <div style="display:flex;gap:8px;margin:14px 0">
        <button class="btn-x btn-success" onclick="doReviewApprove('${type}',${id})" style="flex:1;justify-content:center;padding:10px"><i class="bi bi-check-lg"></i> 通過</button>
        <button class="btn-x btn-danger" onclick="document.getElementById('rejForm').style.display='block';this.disabled=true;this.style.opacity=.5" style="flex:1;justify-content:center;padding:10px"><i class="bi bi-x-lg"></i> 不通過</button>
      </div>`;
  }

  const html = `
    <div class="info-row">
      <div><b>單據主旨：</b><span>${subject}</span></div>
      <div><b>審核人：</b><span>${u.display_name} (${u.role})</span></div>
    </div>
    ${actions}
    <div id="rejForm" style="display:none;background:#fef2f2;border:1px solid #fecaca;padding:14px;border-radius:6px">
      <label style="display:block;margin-bottom:6px"><span class="req">*</span>不通過 / 退回補件原因（必填，≥ 10 字，將通知申請人並保留於單據紀錄）</label>
      <textarea id="rejReason" class="form-control" rows="4" placeholder="請具體說明退回原因（例：規格不符、描述不完整、缺乏佐證資料等）" oninput="document.getElementById('rejReasonCount').textContent=this.value.length"></textarea>
      <div class="text-muted mt-2" style="font-size:12px;display:flex;justify-content:space-between">
        <span>已輸入 <span id="rejReasonCount">0</span> 字</span>
        <span>送出後不可變更</span>
      </div>
      <div class="text-right mt-2">
        <button class="btn-x btn-outline" onclick="document.getElementById('rejForm').style.display='none'">取消不通過</button>
        <button class="btn-x btn-danger" onclick="doReviewReject('${type}',${id})"><i class="bi bi-send"></i> 確認不通過</button>
      </div>
    </div>
  `;
  openModal(title, html, '<button class="btn-x btn-outline" onclick="closeModal()">關閉</button>');
}

// 維修專用動作
function doRepairAction(action, id){
  const p = DB.purchase_requests.find(x=>x.id===id);
  if (!p) return;
  const u = currentUser();
  const stamp = nowStamp();
  if (action==='dispatch'){
    p.status = '已派工';
    p.reviewer = u.username;
    p.reviewed_at = stamp;
    p.updated_by = u.username;
    p.updated_at = stamp;
    p.repair_decision = '直接派工';
    // 建立工單
    const woNo = 'WO-'+nowDate().replace(/\//g,'').slice(0,6)+'-'+String((STATE.workOrders.length+1)).padStart(3,'0');
    STATE.workOrders.unshift({
      no: woNo, pr_no: p.no, vessel: p.vessel,
      subject: p.subject, dispatch_type:'直接派工',
      created_by: u.username, created_at: stamp,
      status: '已派工'
    });
    logActivity('維修-直接派工', p.no, '建立派工單 '+woNo);
    closeModal(); render();
    toast('已建立派工單 '+woNo);
  } else if (action==='inspect'){
    p.status = '場勘中';
    p.reviewer = u.username;
    p.reviewed_at = stamp;
    p.updated_by = u.username;
    p.updated_at = stamp;
    p.repair_decision = '先場勘';
    const insNo = 'INS-'+nowDate().replace(/\//g,'').slice(0,6)+'-'+String((STATE.inspections.length+1)).padStart(3,'0');
    STATE.inspections.unshift({
      no: insNo, pr_no: p.no, vessel: p.vessel, subject: p.subject,
      created_by: u.username, created_at: stamp, status:'場勘中'
    });
    logActivity('維修-安排場勘', p.no, '建立場勘 '+insNo);
    closeModal(); render();
    toast('已安排場勘 '+insNo);
  } else if (action==='quote'){
    p.status = '通過';
    p.reviewer = u.username;
    p.reviewed_at = stamp;
    p.updated_by = u.username;
    p.updated_at = stamp;
    p.repair_decision = '進入詢價';
    logActivity('維修-進入詢價', p.no, '');
    closeModal(); render();
    toast('已通過，可在 PR 檢視頁建立詢價單');
  } else if (action==='rma'){
    p.status = '送修中';
    p.reviewer = u.username;
    p.reviewed_at = stamp;
    p.updated_by = u.username;
    p.updated_at = stamp;
    p.repair_decision = '送回原廠';
    closeModal();
    openRmaCreateDialog(p);
  }
}
function openRmaCreateDialog(pr){
  // 從維修描述解析設備
  const eq = (pr.repair_meta && pr.repair_meta.equipment) || ((pr.item_list||[])[0]||{}).name || '未指定設備';
  const partNo = (pr.repair_meta && pr.repair_meta.part_no) || '';
  openModal('建立送修單 (RMA) - 對應 '+pr.no, `
    <div class="form-grid">
      <div class="full"><label><span class="req">*</span>對應設備</label><input id="rmaEq" value="${escapeAttr(eq)}"></div>
      <div><label>關聯件號</label><input id="rmaPart" value="${escapeAttr(partNo)}"></div>
      <div><label><span class="req">*</span>送修廠商</label>
        <select id="rmaVendor">
          <option value="">— 請選擇 —</option>
          ${DB.vendors.filter(v=>v.status==='啟用').map(v=>`<option value="${v.id}">${v.short_name}（${v.category}）</option>`).join('')}
        </select>
      </div>
      <div><label>拆卸日</label><input id="rmaRemove" type="date" value="${nowDate().replace(/\//g,'-')}"></div>
      <div><label>物流單號</label><input id="rmaShip" placeholder="例：SF1234567890"></div>
      <div><label>預計返船日</label><input id="rmaReturn" type="date"></div>
      <div class="full"><label>備註</label><textarea id="rmaRemark"></textarea></div>
    </div>
  `, `<button class="btn-x btn-outline" onclick="closeModal()">取消</button>
      <button class="btn-x btn-primary" onclick="confirmCreateRma(${pr.id})"><i class="bi bi-check-lg"></i> 建立送修單</button>`);
}
function confirmCreateRma(prId){
  const pr = DB.purchase_requests.find(x=>x.id===prId);
  const eq = document.getElementById('rmaEq').value.trim();
  const partNo = document.getElementById('rmaPart').value.trim();
  const vendorId = parseInt(document.getElementById('rmaVendor').value);
  if (!eq){ toast('請填寫對應設備'); return; }
  if (!vendorId){ toast('請選擇送修廠商'); return; }
  const v = DB.vendors.find(x=>x.id===vendorId);
  const u = currentUser();
  const stamp = nowStamp();
  const rmaNo = 'RMA-'+nowDate().replace(/\//g,'').slice(0,6)+'-'+String((STATE.rmaOrders.length+1)).padStart(3,'0');
  const rma = {
    no: rmaNo,
    pr_id: prId, pr_no: pr.no,
    vessel: pr.vessel,
    equipment: eq,
    part_no: partNo,
    vendor_id: vendorId,
    vendor: v.short_name,
    removal_date: document.getElementById('rmaRemove').value.replace(/-/g,'/'),
    shipping_no: document.getElementById('rmaShip').value.trim(),
    expected_return_date: document.getElementById('rmaReturn').value.replace(/-/g,'/'),
    remark: document.getElementById('rmaRemark').value.trim(),
    status: '待拆卸',
    created_by: u.username, created_at: stamp,
    updated_by: u.username, updated_at: stamp,
    history: [{ action:'建立 RMA', user:u.username, at:stamp, detail:'初始狀態：待拆卸' }]
  };
  STATE.rmaOrders.unshift(rma);
  // 設備標記送修中
  if (partNo){
    STATE.repairingItems[partNo] = { rma_no: rmaNo, since: stamp, equipment: eq };
  }
  saveState();
  logActivity('維修-送回原廠', pr.no, '建立 RMA '+rmaNo+' / '+v.short_name);
  closeModal();
  toast('已建立送修單 '+rmaNo);
  go('rma/view/'+rmaNo);
}

// PR 通過後建立 RFQ（自動帶入請購項目）
function createRfqFromPR(prId){
  const pr = DB.purchase_requests.find(x=>x.id===prId);
  if (!pr){ toast('找不到請購單'); return; }
  if (pr.status !== '通過' && pr.status !== '已詢價'){
    toast('請購單尚未通過審核，無法建立詢價單');
    return;
  }
  const u = currentUser();
  // 產生新 RFQ id (大於現有)
  const newId = Math.max(...DB.rfqs.map(x=>x.id), 1000) + 1;
  // 序號：取該 PR 已有 RFQ 數量 + 1
  const existing = DB.rfqs.filter(x=>x.pr_no===pr.no);
  const seq = String(existing.length + 1).padStart(3, '0');
  const catCode = pr.type==='物料'?'MAT':(pr.type==='配件'?'PRT':'REP');
  const ym = nowDate().replace(/\//g,'').slice(0,6);
  const rfqNo = 'RFQ-'+catCode+'-'+ym+'-'+seq;
  // Auto-copy items from PR
  const items = (pr.item_list||[]).map(it=>({
    impa: it.impa==='-'?'':it.impa,
    name: it.name,
    unit: it.unit,
    qty: it.qty,
    unit_price: 0,
    total: 0,
    lead_days: null,
    remark: ''
  }));
  const stamp = nowStamp();
  const newRfq = {
    id: newId,
    no: rfqNo,
    subject: pr.vessel + '-' + pr.subject + '（待選廠商）',
    pr_id: pr.id,
    pr_no: pr.no,
    vessel: pr.vessel,
    vendor_id: null, vendor: '',
    buyer: u.username,
    quoted_at: '-',
    currency: 'TWD',
    items: items.length,
    total: 0,
    status: '詢價中',
    reviewed_at: '-',
    vendor_workdays: null,
    vendor_lead_date: '',
    vendor_remark: '',
    attachments: [],
    updated_by: u.username,
    updated_at: stamp,
    item_list: items
  };
  DB.rfqs.unshift(newRfq);
  // Update PR linked_rfqs
  if (!pr.linked_rfqs) pr.linked_rfqs = [];
  pr.linked_rfqs.push(rfqNo);
  if (pr.status==='通過') pr.status = '已詢價';
  pr.updated_by = u.username;
  pr.updated_at = stamp;
  logActivity('建立詢價單', rfqNo, '由 '+pr.no+' 自動帶入 '+items.length+' 項，待選廠商');
  toast('已建立 '+rfqNo+'，請選擇廠商與填入報價');
  go('rfq/edit/'+newId);
}
function doReviewApprove(type, id){
  if (type==='PR'){
    const p = DB.purchase_requests.find(x=>x.id===id);
    if (!p) return;
    p.status = '通過';
    p.reviewer = currentUser().username;
    p.reviewed_at = nowStamp();
    p.reject_reason = null;
    p.updated_by = currentUser().username;
    p.updated_at = nowStamp();
    logActivity('PR 審核通過', p.no, p.subject);
  } else {
    const r = DB.rfqs.find(x=>x.id===id);
    if (!r) return;
    r.status = '審核通過';
    r.reviewed_at = nowDate();
    r.reject_reason = null;
    r.updated_by = currentUser().username;
    r.updated_at = nowStamp();
    logActivity('RFQ 審核通過', r.no, r.subject);
  }
  closeModal();
  toast('已審核通過');
  render();
}
function doReviewReject(type, id){
  const reason = (document.getElementById('rejReason').value||'').trim();
  if (reason.length<10){
    toast('不通過原因至少需 10 字');
    return;
  }
  if (type==='PR'){
    const p = DB.purchase_requests.find(x=>x.id===id);
    if (!p) return;
    p.status = '駁回';
    p.reviewer = currentUser().username;
    p.reviewed_at = nowStamp();
    p.reject_reason = reason;
    p.updated_by = currentUser().username;
    p.updated_at = nowStamp();
    logActivity('PR 駁回', p.no, reason);
  } else {
    const r = DB.rfqs.find(x=>x.id===id);
    if (!r) return;
    r.status = '審核不通過';
    r.reviewed_at = nowDate();
    r.reject_reason = reason;
    r.updated_by = currentUser().username;
    r.updated_at = nowStamp();
    logActivity('RFQ 審核不通過', r.no, reason);
  }
  closeModal();
  toast('已標記為不通過');
  render();
}
function removeRfqAttachment(id, idx){
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r || !r.attachments) return;
  if (!confirm('確定刪除此檔案？')) return;
  const a = r.attachments[idx];
  r.attachments.splice(idx,1);
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  logActivity('刪除報價單檔', r.no, a.filename);
  render();
}
function autoUpdateRfqStatusByQuote(r){
  // 有單價或附件 → 自動進入待審核（除非已審核完成）
  if (r.status==='詢價中'){
    const hasPrice = (r.item_list||[]).some(it=>it.unit_price>0);
    const hasFile = (r.attachments||[]).length>0;
    if (hasPrice || hasFile){
      r.status = '待審核';
      logActivity('狀態變更', r.no, '詢價中 → 待審核（廠商已回價）');
    }
  }
}
function markRfqPendingReview(id){
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  if (r.status !== '詢價中'){ toast('僅「詢價中」狀態可送出'); return; }
  const hasPrice = (r.item_list||[]).some(it=>it.unit_price>0);
  const hasFile = (r.attachments||[]).length>0;
  if (!hasPrice && !hasFile){ toast('請先填入單價或上傳報價單'); return; }
  r.status = '待審核';
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  logActivity('送出待審核', r.no, '');
  toast('已送出待審核');
  render();
}
function approveRFQ(id){
  if (!canApprove()){ toast('權限不足'); return; }
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  if (!confirm('確認審核通過此詢價單「'+r.no+'」？')) return;
  r.status = '審核通過';
  r.reviewed_at = nowDate();
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  logActivity('RFQ 審核通過', r.no, '');
  toast('已審核通過');
  render();
}
function rejectRFQ(id){
  if (!canApprove()){ toast('權限不足'); return; }
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  const reason = prompt('請輸入「審核不通過」原因（≥ 10 字）：');
  if (!reason || reason.trim().length<10){ toast('原因需至少 10 字'); return; }
  r.status = '審核不通過';
  r.reject_reason = reason.trim();
  r.reviewed_at = nowDate();
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  logActivity('RFQ 審核不通過', r.no, reason.trim());
  toast('已標記為審核不通過');
  render();
}
function saveRfqDraft(id){
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  r.updated_by = currentUser().username;
  r.updated_at = nowStamp();
  logActivity('儲存詢價單', r.no, '');
  toast('已儲存');
  render();
}
function updateRfqVendorMeta(id){
  // 同步 vendor short_name 到 r.vendor，並更新幣別
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  const v = DB.vendors.find(x=>x.id===r.vendor_id);
  if (v){
    r.vendor = v.short_name;
    r.currency = v.currency;
    logActivity('變更廠商', r.no, v.short_name);
    render();
  }
}
function nowStamp(){
  const d = new Date();
  return d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+' '+
    String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function nowDate(){
  const d = new Date();
  return d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0');
}

// RFQ 詳情 (modal)
function viewRFQDetail(id){
  const r = DB.rfqs.find(x=>x.id===id);
  if (!r) return;
  const pr = DB.purchase_requests.find(p=>p.no===r.pr_no);
  const items = (r.item_list||[]).map(it=>`<tr>
    <td>${it.impa||'-'}</td><td>${it.name}</td><td>${it.unit}</td><td>${it.qty}</td>
    <td>${priceText(it.unit_price, r.currency)}</td>
    <td>${priceText(it.total, r.currency)}</td>
    <td>${it.lead_days||'-'}</td>
  </tr>`).join('');
  openModal('詢價單詳情 - '+r.no, `
    <div class="info-row">
      <div><b>詢價單號：</b><span>${r.no}</span></div>
      <div><b>對應請購：</b><a onclick="closeModal();go('pr/view/${pr?pr.id:''}')">${r.pr_no}</a></div>
      <div><b>船舶：</b><span>${r.vessel}</span></div>
      <div><b>廠商：</b><span>${r.vendor}</span></div>
      <div><b>幣別：</b><span>${r.currency}</span></div>
      <div><b>狀態：</b>${statusBadge(r.status)}</div>
    </div>
    <h4 class="sub-title">${r.subject}</h4>
    <table class="tbl">
      <thead><tr><th>IMPA</th><th>名稱</th><th>單位</th><th>數量</th><th>單價</th><th>小計</th><th>交期(天)</th></tr></thead>
      <tbody>${items}</tbody>
      <tfoot><tr style="background:#f3f4f6"><td colspan="5" class="text-right"><strong>總計</strong></td><td><strong>${priceText(r.total, r.currency)}</strong></td><td></td></tr></tfoot>
    </table>
  `, `<button class="btn-x btn-outline" onclick="closeModal()">關閉</button>`, true);
}
function openVendorPicker(){
  openModal('選擇詢價廠商',`
    <input class="form-control mb-2" placeholder="搜尋廠商名稱 / 代碼">
    <table class="tbl">
      <thead><tr><th><input type="checkbox"></th><th>代碼</th><th>名稱</th><th>聯絡人</th><th>類別</th><th>評等</th></tr></thead>
      <tbody>
        ${DB.vendors.map(v=>`<tr><td><input type="checkbox"></td><td>${v.code}</td><td>${v.name}</td><td>${v.contact}</td><td>${v.category}</td><td>${v.rating}</td></tr>`).join('')}
      </tbody>
    </table>
  `,`<button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('已選擇 1 家廠商')">確定</button>`,true);
}
function openWorkdayCalc(){
  openModal('工作天計算機',`
    <div class="form-grid">
      <div><label>起始日期</label><input type="date" value="2026-04-29"></div>
      <div><label>工作天數</label><input type="number" value="7"></div>
      <div class="full"><label>排除日期（國定假日）</label><textarea>2026/05/01 勞動節\n2026/05/04 端午連假</textarea></div>
      <div class="full"><label>計算結果</label><div class="form-section" style="padding:10px"><strong>預計交貨日：2026/05/08（週五）</strong></div></div>
    </div>
  `);
}
function openHistoryQuote(){
  openModal('商品歷史詢價',`
    <div class="form-grid">
      <div><label>商品 IMPA</label><input value="550101"></div>
      <div><label>商品名稱</label><input value="潤滑油 SAE 40" readonly></div>
    </div>
    <table class="tbl mt-2">
      <thead><tr><th>日期</th><th>廠商</th><th>單號</th><th>單價(TWD)</th><th>數量</th><th>來源</th></tr></thead>
      <tbody>
        <tr><td>2026/04/29</td><td>摯誠數位科技</td><td>RFQ-202604-0002</td><td>1,000</td><td>30</td><td>詢價</td></tr>
        <tr><td>2026/04/29</td><td>測試場商</td><td>RFQ-202604-0001</td><td>1,100</td><td>30</td><td>詢價</td></tr>
        <tr><td>2026/03/15</td><td>宏達油品</td><td>PO-202603-0005</td><td>980</td><td>50</td><td>採購</td></tr>
        <tr><td>2026/02/10</td><td>宏達油品</td><td>PO-202602-0003</td><td>965</td><td>40</td><td>採購</td></tr>
        <tr><td>2025/12/05</td><td>摯誠數位科技</td><td>PO-202512-0008</td><td>950</td><td>60</td><td>採購</td></tr>
      </tbody>
    </table>
  `,'',true);
}
function openSendApprove(){
  openModal('送出審核',`
    <div class="form-grid">
      <div class="full"><label>審核人</label><select><option>k.lin 林佳穎（採購主管）</option><option>admin 系統管理員</option></select></div>
      <div class="full"><label>備註</label><textarea placeholder="說明此次詢價狀況..."></textarea></div>
    </div>
  `,`<button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('已送出審核')">送出</button>`);
}

// === 10 綜合詢價單 ===
ROUTES.crfq = function(sub, id){
  if (sub==='view' || sub==='edit' || sub==='new'){
    const c = id ? DB.consolidated.find(x=>x.id==id) : DB.consolidated[0];
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'綜合詢價單管理',route:'crfq'},{label:'編輯綜合詢價單'}])}
      ${pageTitle('綜合詢價單功能管理')}
      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">編輯綜合詢價單</h3>
          <div class="right-actions">
            <button class="btn-x btn-danger">刪除</button>
            <button class="btn-x btn-outline">列印</button>
            <button class="btn-x btn-primary" onclick="toast('已儲存')">儲存</button>
            <button class="btn-x btn-outline" onclick="go('crfq')">返回</button>
          </div>
        </div>
        <div class="info-row">
          <div><b>請購單資訊 - 主旨：</b><span><a onclick="go('pr/view/1')">${c.pr}</a> ${c.subject} <i class="bi bi-chevron-down"></i></span></div>
          <div style="margin-left:auto"><b>綜合詢價單編號：</b><span>${c.no}</span></div>
        </div>
        <div class="form-section">
          <div class="form-grid">
            <div><label><span class="req">*</span>負責人</label><input value="${c.buyer}"></div>
            <div><label><span class="req">*</span>建立日期</label><input type="date" value="2026-04-30"></div>
            <div><label><span class="req">*</span>換算幣別</label><select><option>新台幣 (TWD)</option><option>美金 (USD)</option></select></div>
            <div><label>匯率資訊（外幣兌新台幣）</label><div style="display:flex;gap:6px"><input style="width:60px" value="新台幣"><input value="1"></div></div>
          </div>
        </div>
        <h4 class="sub-title flex between aic"><span><i class="bi bi-card-list"></i> 詢價單資訊</span>
          <button class="btn-x btn-primary" onclick="openCrfqAdd()"><i class="bi bi-plus-lg"></i> 加入詢價單</button>
        </h4>
        <table class="tbl">
          <thead><tr><th>#</th><th>詢價單編號</th><th>報價日期</th><th>負責人</th><th>廠商名稱</th><th>審核日期</th><th>幣別</th><th>詢價單總額</th><th>審核人</th><th>操作</th></tr></thead>
          <tbody>
            <tr><td>1</td><td><a onclick="go('rfq/edit/1')">RFQ-202604-0001</a></td><td>2026/04/29</td><td>admin</td><td>測試場商</td><td>2026/04/30</td><td>新台幣</td><td>213,500</td><td>admin</td><td class="row-actions"><a class="danger"><i class="bi bi-trash"></i></a></td></tr>
            <tr><td>2</td><td><a onclick="go('rfq/edit/2')">RFQ-202604-0002</a></td><td>2026/04/29</td><td>admin</td><td>摯誠數位科技</td><td>2026/04/30</td><td>新台幣</td><td>210,000</td><td>admin</td><td class="row-actions"><a class="danger"><i class="bi bi-trash"></i></a></td></tr>
          </tbody>
        </table>
        <h4 class="sub-title"><i class="bi bi-bar-chart-line"></i> 綜合詢價單比價內容</h4>
        ${filterRow(`<input class="form-control" placeholder="請輸入搜尋關鍵字">`)}
        <table class="tbl">
          <thead>
            <tr>
              <th rowspan="2" style="vertical-align:middle">IMPA代碼</th>
              <th rowspan="2" style="vertical-align:middle">產品名稱</th>
              <th rowspan="2" style="vertical-align:middle">單位</th>
              <th rowspan="2" style="vertical-align:middle">請購數量</th>
              <th colspan="2" class="text-center">測試場商</th>
              <th colspan="2" class="text-center">摯誠數位科技</th>
              <th rowspan="2" style="vertical-align:middle">歷史最近採購價</th>
              <th rowspan="2" style="vertical-align:middle">最佳選擇</th>
            </tr>
            <tr><th>單價</th><th>小計</th><th>單價</th><th>小計</th></tr>
          </thead>
          <tbody>
            ${DB.comparison_demo.map(r=>`<tr>
              <td>${r.impa}</td><td>${r.name}</td><td>${r.unit}</td><td>${r.qty}</td>
              <td>${r.v1.price.toLocaleString()}</td><td>${r.v1.total.toLocaleString()}</td>
              <td><strong style="color:var(--success)">${r.v2.price.toLocaleString()}</strong></td><td><strong style="color:var(--success)">${r.v2.total.toLocaleString()}</strong></td>
              <td>${r.history.toLocaleString()}</td>
              <td><span class="b b-green">摯誠數位科技</span></td>
            </tr>`).join('')}
            <tr style="background:#f9fafb"><td colspan="4" class="text-right"><strong>合計</strong></td><td colspan="2" class="text-right">${(33000+175000+5500).toLocaleString()}</td><td colspan="2" class="text-right"><strong>${(30000+175000+5000).toLocaleString()}</strong></td><td colspan="2"></td></tr>
          </tbody>
        </table>
        <div class="text-right mt-2"><strong>本綜合詢價單總金額：NT$ 210,000</strong></div>
        <h4 class="sub-title"><i class="bi bi-percent"></i> 折扣內容（依廠商）</h4>
        <table class="tbl">
          <thead><tr><th>廠商</th><th>原小計</th><th>折扣</th><th>折扣後</th><th>備註</th></tr></thead>
          <tbody>
            <tr><td>測試場商</td><td>213,500</td><td>0%</td><td>213,500</td><td>-</td></tr>
            <tr><td>摯誠數位科技</td><td>210,000</td><td>0%</td><td><strong>210,000</strong></td><td>本次最佳</td></tr>
          </tbody>
        </table>
        <h4 class="sub-title">綜合詢價單備註</h4>
        <textarea class="form-control" rows="3" placeholder="說明本次比價結論..."></textarea>
        <h4 class="sub-title"><i class="bi bi-link-45deg"></i> 綜合詢價單關聯內容</h4>
        <table class="tbl">
          <thead><tr><th>類型</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>
            <tr><td>船東報價單</td><td>${statusBadge('已寄出')}</td><td><button class="btn-x btn-outline" onclick="go('oq')"><i class="bi bi-arrow-right"></i> 產生關聯老單</button></td></tr>
            <tr><td>船東請款單</td><td>${statusBadge('已收款')}</td><td><button class="btn-x btn-outline" onclick="go('oi')"><i class="bi bi-arrow-right"></i> 產生關聯老單</button></td></tr>
            <tr><td>採購單</td><td>${statusBadge('已驗收')}</td><td><button class="btn-x btn-outline" onclick="go('po')"><i class="bi bi-arrow-right"></i> 產生關聯老單</button></td></tr>
            <tr><td>驗收單</td><td>${statusBadge('驗收通過')}</td><td><button class="btn-x btn-outline" onclick="go('ac')"><i class="bi bi-arrow-right"></i> 前往</button></td></tr>
          </tbody>
        </table>
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'綜合詢價單管理'}])}
    ${pageTitle('綜合詢價單功能管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">綜合詢價單列表</h3>
        <button class="btn-x btn-primary" onclick="openCrfqAdd(true)"><i class="bi bi-plus-lg"></i> 建立綜合詢價單</button>
      </div>
      ${filterRow(`
        <input class="form-control" placeholder="請選擇建立日期區間" type="text" onfocus="this.type='date'">
        <select class="form-select"><option>全部狀態</option><option>草稿</option><option>已比價</option><option>已產生採購單</option></select>
        <input class="form-control grow" placeholder="請輸入搜尋關鍵字">
      `)}
      <table class="tbl">
        <thead><tr><th>綜合詢價單編號</th><th>對應請購</th><th>主旨</th><th>負責人</th><th>建立日期</th><th>幣別</th><th>廠商家數</th><th>項目數</th><th>最佳總額</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${DB.consolidated.map(c=>`<tr>
            <td><a onclick="go('crfq/view/${c.id}')">${c.no}</a></td>
            <td><a onclick="go('pr')">${c.pr}</a></td>
            <td>${c.subject}</td>
            <td>${c.buyer}</td>
            <td>${c.created_at}</td>
            <td>${c.currency}</td>
            <td>${c.vendors}</td>
            <td>${c.items}</td>
            <td>NT$ ${c.best_total.toLocaleString()}</td>
            <td>${statusBadge(c.status)}</td>
            <td class="row-actions"><a onclick="go('crfq/view/${c.id}')"><i class="bi bi-eye-fill"></i></a></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${pager(DB.consolidated.length)}
    </div>
  `;
};
function openCrfqAdd(buildMode=false){
  openModal(buildMode?'建立綜合詢價單 - 選擇詢價單':'加入詢價單',`
    <p class="text-muted">請勾選要納入比價的詢價單（同一張請購單可選多家）</p>
    <table class="tbl">
      <thead><tr><th><input type="checkbox"></th><th>詢價單編號</th><th>對應請購</th><th>廠商</th><th>項目</th><th>總額</th><th>狀態</th></tr></thead>
      <tbody>
        ${DB.rfqs.filter(r=>r.status==='待審核'||r.status==='審核通過').map(r=>`<tr>
          <td><input type="checkbox" ${r.id<=2?'checked':''}></td>
          <td>${r.no}</td><td>${r.pr_no}</td><td>${r.vendor}</td><td>${r.items}</td><td>${priceText(r.total, r.currency)}</td><td>${statusBadge(r.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `,`<button class="btn-x btn-outline" onclick="closeModal()">取消</button><button class="btn-x btn-primary" onclick="closeModal();toast('${buildMode?'已建立綜合詢價單':'已加入'}')">${buildMode?'建立':'加入'}</button>`,true);
}

// === 11 船東報價單 ===
ROUTES.oq = function(sub, id){
  if (sub==='edit' || sub==='view'){
    const o = id ? DB.owner_quotes.find(x=>x.id==id) : DB.owner_quotes[0];
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船東報價單管理',route:'oq'},{label:o.no}])}
      ${pageTitle('船東報價單功能管理')}
      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">編輯船東報價單 - ${o.no}</h3>
          <div class="right-actions">
            <button class="btn-x btn-info" onclick="toast('已寄出給船東')"><i class="bi bi-send"></i> 寄出</button>
            <button class="btn-x btn-outline">列印</button>
            <button class="btn-x btn-primary" onclick="toast('已儲存')">儲存</button>
            <button class="btn-x btn-outline" onclick="go('oq')">返回</button>
          </div>
        </div>
        <div class="form-section">
          <div class="form-grid">
            <div><label>報價單號</label><input value="${o.no}" readonly></div>
            <div><label><span class="req">*</span>船東</label><select><option>${o.owner}</option></select></div>
            <div><label><span class="req">*</span>船舶</label><select><option>${o.vessel}</option></select></div>
            <div><label><span class="req">*</span>幣別</label><select><option>${o.currency}</option></select></div>
            <div><label><span class="req">*</span>加成 %</label><input type="number" value="${o.markup}"></div>
            <div><label>有效期限</label><input type="date" value="2026-05-30"></div>
            <div class="full"><label><span class="req">*</span>主旨</label><input value="${o.subject}"></div>
          </div>
        </div>
        <h4 class="sub-title">報價內容（成本 × 105%）</h4>
        <table class="tbl">
          <thead><tr><th>IMPA</th><th>產品名稱</th><th>單位</th><th>數量</th><th>成本單價</th><th>船東單價</th><th>金額</th><th>備註</th></tr></thead>
          <tbody>
            <tr><td>550101</td><td>潤滑油 SAE 40</td><td>桶</td><td>30</td><td>1,000</td><td>1,050</td><td>31,500</td><td></td></tr>
            <tr><td>591234</td><td>柴油濾芯</td><td>個</td><td>50</td><td>3,500</td><td>3,675</td><td>183,750</td><td></td></tr>
            <tr><td>174562</td><td>空氣濾網</td><td>個</td><td>10</td><td>500</td><td>525</td><td>5,250</td><td></td></tr>
            <tr style="background:#f9fafb"><td colspan="6" class="text-right"><strong>未稅小計</strong></td><td><strong>220,500</strong></td><td></td></tr>
            <tr><td colspan="6" class="text-right">營業稅 5%</td><td>11,025</td><td></td></tr>
            <tr style="background:#f3f4f6"><td colspan="6" class="text-right"><strong>含稅總計</strong></td><td><strong style="color:var(--primary);font-size:15px">${o.total.toLocaleString()}</strong></td><td></td></tr>
          </tbody>
        </table>
        <h4 class="sub-title">備註 / 條件說明</h4>
        <textarea class="form-control" rows="3">本報價單金額不含關稅及進口費用，付款條件：月結 30 天。</textarea>
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船東報價單管理'}])}
    ${pageTitle('船東報價單功能管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">船東報價單列表</h3>
        <button class="btn-x btn-primary"><i class="bi bi-plus-lg"></i> 新增船東報價單</button>
      </div>
      ${filterRow(`
        <select class="form-select"><option>全部船東</option>${DB.ship_owners.map(o=>`<option>${o.short}</option>`).join('')}</select>
        <select class="form-select"><option>全部船舶</option>${DB.vessels.map(v=>`<option>${v.name}</option>`).join('')}</select>
        <select class="form-select"><option>全部狀態</option><option>草稿</option><option>已寄出</option><option>已接受</option></select>
        <input class="form-control grow" placeholder="請輸入單號或主旨">
      `)}
      <table class="tbl">
        <thead><tr><th>報價單號</th><th>對應綜合詢價</th><th>船東</th><th>船舶</th><th>主旨</th><th>建立日期</th><th>有效期限</th><th>加成%</th><th>總金額</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${DB.owner_quotes.map(o=>`<tr>
            <td><a onclick="go('oq/edit/${o.id}')">${o.no}</a></td>
            <td><a onclick="go('crfq')">${o.crfq}</a></td>
            <td>${o.owner}</td>
            <td>${o.vessel}</td>
            <td>${o.subject}</td>
            <td>${o.issued}</td>
            <td>${o.valid}</td>
            <td>${o.markup}%</td>
            <td>${o.currency==='USD'?'$':'NT$'} ${o.total.toLocaleString()}</td>
            <td>${statusBadge(o.status)}</td>
            <td class="row-actions"><a onclick="go('oq/edit/${o.id}')"><i class="bi bi-pencil-square"></i></a></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${pager(DB.owner_quotes.length)}
    </div>
  `;
};

// === 12 船東請款單 ===
ROUTES.oi = function(sub, id){
  if (sub==='view' || sub==='edit'){
    const o = id ? DB.owner_invoices.find(x=>x.id==id) : DB.owner_invoices[0];
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船東請款單管理',route:'oi'},{label:o.no}])}
      ${pageTitle('船東請款單功能管理')}
      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">船東請款單 - ${o.no}</h3>
          <div class="right-actions">
            <button class="btn-x btn-outline">列印 PDF</button>
            <button class="btn-x btn-primary">儲存</button>
            <button class="btn-x btn-outline" onclick="go('oi')">返回</button>
          </div>
        </div>
        <div class="form-section">
          <div class="form-grid">
            <div><label>請款單號</label><div><strong>${o.no}</strong></div></div>
            <div><label>船東</label><div>${o.owner}</div></div>
            <div><label>船舶</label><div>${o.vessel}</div></div>
            <div><label>對應報價單</label><div><a onclick="go('oq')">${o.oq}</a></div></div>
            <div><label>開立日期</label><div>${o.issued}</div></div>
            <div><label>應付日</label><div>${o.due}</div></div>
            <div><label>幣別</label><div>${o.currency}</div></div>
            <div><label>狀態</label><div>${statusBadge(o.status)}</div></div>
          </div>
        </div>
        <h4 class="sub-title"><i class="bi bi-bank"></i> 匯款帳戶</h4>
        <div class="form-section">
          <div class="form-grid">
            <div><label>受款人</label><div>海發船舶服務股份有限公司</div></div>
            <div><label>銀行</label><div>${o.bank.split(' ')[0]}</div></div>
            <div><label>分行</label><div>${o.bank.split(' ')[1]}</div></div>
            <div><label>帳號</label><div><strong>${o.bank.split(' ')[2]}</strong></div></div>
            <div><label>SWIFT Code</label><div>FCBKTWTP</div></div>
          </div>
        </div>
        <h4 class="sub-title">請款項目</h4>
        <table class="tbl">
          <thead><tr><th>IMPA</th><th>產品</th><th>單位</th><th>數量</th><th>單價</th><th>金額</th><th>已驗收</th><th>已退款</th><th>備註</th></tr></thead>
          <tbody>
            <tr><td>520101</td><td>主機曲軸軸瓦</td><td>套</td><td>2</td><td>194,250</td><td>388,500</td><td>2</td><td>0</td><td></td></tr>
            <tr><td>520122</td><td>活塞環組</td><td>組</td><td>2</td><td>44,100</td><td>88,200</td><td>2</td><td>0</td><td></td></tr>
            <tr><td>540234</td><td>發電機調速器</td><td>個</td><td>1</td><td>32,550</td><td>32,550</td><td>0</td><td>1</td><td>退款中</td></tr>
            <tr style="background:#f3f4f6"><td colspan="5" class="text-right"><strong>含稅總計</strong></td><td><strong>${o.total.toLocaleString()}</strong></td><td colspan="3"></td></tr>
          </tbody>
        </table>
        <h4 class="sub-title">備註</h4>
        <textarea class="form-control" rows="3">付款條件：月結 30 天。請於 ${o.due} 前匯款至上述帳戶。</textarea>
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'船東請款單管理'}])}
    ${pageTitle('船東請款單功能管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">船東請款單列表</h3>
        <button class="btn-x btn-primary"><i class="bi bi-plus-lg"></i> 新增船東請款單</button>
      </div>
      ${filterRow(`
        <input class="form-control" placeholder="請選擇開立日期區間" type="text" onfocus="this.type='date'">
        <select class="form-select"><option>全部船東</option>${DB.ship_owners.map(o=>`<option>${o.short}</option>`).join('')}</select>
        <select class="form-select"><option>全部船舶</option>${DB.vessels.map(v=>`<option>${v.name}</option>`).join('')}</select>
        <select class="form-select"><option>全部狀態</option><option>已開立</option><option>已收款</option><option>部分退款</option></select>
        <input class="form-control grow" placeholder="品項關鍵字 / 單號">
      `)}
      <table class="tbl">
        <thead><tr><th>請款單號</th><th>對應報價</th><th>船東</th><th>船舶</th><th>主旨</th><th>開立日</th><th>應付日</th><th>幣別</th><th>金額</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${DB.owner_invoices.map(o=>`<tr>
            <td><a onclick="go('oi/view/${o.id}')">${o.no}</a></td>
            <td><a onclick="go('oq')">${o.oq}</a></td>
            <td>${o.owner}</td>
            <td>${o.vessel}</td>
            <td>${o.subject}</td>
            <td>${o.issued}</td>
            <td>${o.due}</td>
            <td>${o.currency}</td>
            <td>NT$ ${o.total.toLocaleString()}</td>
            <td>${statusBadge(o.status)}</td>
            <td class="row-actions"><a onclick="go('oi/view/${o.id}')"><i class="bi bi-eye-fill"></i></a></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${pager(DB.owner_invoices.length)}
    </div>
  `;
};

// === 13 採購單 ===
ROUTES.po = function(sub, id){
  if (sub==='view' || sub==='edit'){
    const p = id ? DB.purchase_orders.find(x=>x.id==id) : DB.purchase_orders[0];
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'採購單管理',route:'po'},{label:p.no}])}
      ${pageTitle('採購單功能管理')}
      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">檢視採購單 - ${p.no}</h3>
          <div class="right-actions">
            <button class="btn-x btn-outline">列印 PDF</button>
            <button class="btn-x btn-info" onclick="toast('已寄出給廠商')"><i class="bi bi-send"></i> 寄送廠商</button>
            <button class="btn-x btn-outline" onclick="go('po')">返回</button>
          </div>
        </div>
        <div class="form-section">
          <div class="form-grid">
            <div><label>採購單號</label><div><strong>${p.no}</strong></div></div>
            <div><label>對應綜合詢價</label><div><a onclick="go('crfq')">${p.crfq}</a></div></div>
            <div><label>廠商</label><div>${p.vendor}</div></div>
            <div><label>船舶</label><div>${p.vessel}</div></div>
            <div><label>下單日期</label><div>${p.issued}</div></div>
            <div><label>預計交期</label><div>2026/05/05</div></div>
            <div><label>幣別</label><div>${p.currency}</div></div>
            <div><label>狀態</label><div>${statusBadge(p.status)}</div></div>
          </div>
        </div>
        <h4 class="sub-title">採購項目</h4>
        <table class="tbl">
          <thead><tr><th>IMPA</th><th>產品</th><th>單位</th><th>下單數</th><th>單價</th><th>金額</th><th>已驗收</th><th>已退貨</th><th>備註</th></tr></thead>
          <tbody>
            <tr><td>550101</td><td>潤滑油 SAE 40</td><td>桶</td><td>30</td><td>1,000</td><td>30,000</td><td>30</td><td>0</td><td></td></tr>
            <tr><td>591234</td><td>柴油濾芯</td><td>個</td><td>50</td><td>3,500</td><td>175,000</td><td>50</td><td>0</td><td></td></tr>
            <tr><td>174562</td><td>空氣濾網</td><td>個</td><td>10</td><td>500</td><td>5,000</td><td>10</td><td>0</td><td></td></tr>
            <tr style="background:#f3f4f6"><td colspan="5" class="text-right"><strong>含稅總計</strong></td><td><strong>${p.total.toLocaleString()}</strong></td><td colspan="3"></td></tr>
          </tbody>
        </table>
        <h4 class="sub-title flex between aic"><span><i class="bi bi-link-45deg"></i> 後續單據</span></h4>
        <table class="tbl">
          <thead><tr><th>類型</th><th>單號</th><th>狀態</th><th>建立日期</th><th>操作</th></tr></thead>
          <tbody>
            <tr><td>驗收單</td><td><a onclick="go('ac')">AC-202605-0001</a></td><td>${statusBadge('驗收通過')}</td><td>2026/05/05</td><td><a onclick="go('ac')">前往</a></td></tr>
            <tr><td>入庫單</td><td><a onclick="go('wi')">WI-202605-0001</a></td><td>${statusBadge('已入庫')}</td><td>2026/05/05</td><td><a onclick="go('wi')">前往</a></td></tr>
            <tr><td>廠商請款單</td><td>VI-202605-0001</td><td>${statusBadge('已開立')}</td><td>2026/05/06</td><td><a>前往</a></td></tr>
          </tbody>
        </table>
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'採購單管理'}])}
    ${pageTitle('採購單功能管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">採購單列表</h3>
        <button class="btn-x btn-primary"><i class="bi bi-plus-lg"></i> 新增採購單</button>
      </div>
      ${filterRow(`
        <input class="form-control" placeholder="請選擇下單日期區間" type="text" onfocus="this.type='date'">
        <select class="form-select"><option>全部廠商</option>${DB.vendors.map(v=>`<option>${v.short_name}</option>`).join('')}</select>
        <select class="form-select"><option>全部船舶</option>${DB.vessels.map(v=>`<option>${v.name}</option>`).join('')}</select>
        <select class="form-select"><option>全部狀態</option><option>草稿</option><option>已下單</option><option>部分驗收</option><option>已驗收</option><option>部分退貨</option></select>
        <input class="form-control grow" placeholder="請輸入單號或品項">
      `)}
      <table class="tbl">
        <thead><tr><th>採購單號</th><th>對應綜合詢價</th><th>廠商</th><th>船舶</th><th>下單日</th><th>幣別</th><th>項目數</th><th>金額</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${DB.purchase_orders.map(p=>`<tr>
            <td><a onclick="go('po/view/${p.id}')">${p.no}</a></td>
            <td><a onclick="go('crfq')">${p.crfq}</a></td>
            <td>${p.vendor}</td>
            <td>${p.vessel}</td>
            <td>${p.issued}</td>
            <td>${p.currency}</td>
            <td>${p.items}</td>
            <td>NT$ ${p.total.toLocaleString()}</td>
            <td>${statusBadge(p.status)}</td>
            <td class="row-actions"><a onclick="go('po/view/${p.id}')"><i class="bi bi-eye-fill"></i></a></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${pager(DB.purchase_orders.length)}
    </div>
  `;
};

// === 14 派工單 ===
ROUTES.wo = function(sub, id){
  if (sub==='edit' || sub==='view'){
    const w = id ? DB.work_orders.find(x=>x.id==id) : DB.work_orders[0];
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'派工單管理',route:'wo'},{label:w.no}])}
      ${pageTitle('派工單功能管理')}
      <div class="card-x">
        <div class="flex between aic"><h3 class="section-title mb-0">編輯派工單 - ${w.no}</h3>
          <div class="right-actions">
            <button class="btn-x btn-info" onclick="toast('派工單已寄出')"><i class="bi bi-send"></i> 派工</button>
            <button class="btn-x btn-primary">儲存</button>
            <button class="btn-x btn-outline" onclick="go('wo')">返回</button>
          </div>
        </div>
        <div class="form-section">
          <div class="form-grid">
            <div><label><span class="req">*</span>對應報修單</label><input value="${w.repair}"><a style="font-size:12px"><i class="bi bi-search"></i> 選擇</a></div>
            <div><label><span class="req">*</span>派工方式</label><select><option ${w.dispatch_type==='直接派工'?'selected':''}>直接派工</option><option ${w.dispatch_type==='勘工後派工'?'selected':''}>勘工後派工</option></select></div>
            <div><label><span class="req">*</span>船舶</label><select><option>${w.vessel}</option></select></div>
            <div><label><span class="req">*</span>派工廠商</label><select><option>${w.vendor}</option></select></div>
            <div><label>派工日期</label><input type="date" value="2026-04-26"></div>
            <div><label>預計完工日</label><input type="date" value="2026-05-05"></div>
            <div class="full"><label><span class="req">*</span>工作主旨</label><input value="${w.subject}"></div>
          </div>
        </div>
        <h4 class="sub-title">派工內容</h4>
        <textarea class="form-control" rows="4">渦輪增壓器運轉時產生異常聲響，懷疑軸承磨損。請貴公司派員至東方勇士進行檢修，並提出維修方案及報價。</textarea>
        <h4 class="sub-title">勘工 / 維修報價</h4>
        <table class="tbl">
          <thead><tr><th>項目</th><th>說明</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
          <tbody>
            <tr><td>勘工費</td><td>初步檢查與診斷</td><td>1</td><td>15,000</td><td>15,000</td></tr>
            <tr><td>軸承更換</td><td>ABB A170-L 渦輪軸承總成</td><td>1</td><td>52,000</td><td>52,000</td></tr>
            <tr><td>工資</td><td>2 名技師 × 1.5 天</td><td>3</td><td>6,000</td><td>18,000</td></tr>
            <tr style="background:#f3f4f6"><td colspan="4" class="text-right"><strong>合計（含稅）</strong></td><td><strong>${w.amount.toLocaleString()}</strong></td></tr>
          </tbody>
        </table>
      </div>
    `;
  }
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'派工單管理'}])}
    ${pageTitle('派工單功能管理')}
    <div class="card-x">
      <div class="flex between aic"><h3 class="section-title mb-0">派工單列表</h3>
        <button class="btn-x btn-primary" onclick="go('wo/edit/0')"><i class="bi bi-plus-lg"></i> 新增派工單</button>
      </div>
      ${filterRow(`
        <input class="form-control" placeholder="派工日期區間" type="text" onfocus="this.type='date'">
        <select class="form-select"><option>全部船舶</option>${DB.vessels.map(v=>`<option>${v.name}</option>`).join('')}</select>
        <select class="form-select"><option>全部廠商</option>${DB.vendors.map(v=>`<option>${v.short_name}</option>`).join('')}</select>
        <select class="form-select"><option>全部�
狀態</option><option>已派工</option><option>施工中</option><option>已完工</option></select>
      `)}
      <table class="tbl">
        <thead><tr><th>派工單號</th><th>船舶</th><th>廠商</th><th>主旨</th><th>狀態</th></tr></thead>
        <tbody>${(DB.work_orders||[]).map(w=>`<tr><td>${w.no}</td><td>${w.vessel}</td><td>${w.vendor}</td><td>${w.subject}</td><td>${statusBadge(w.status)}</td></tr>`).join('')||'<tr><td colspan=5 class=empty>無資料</td></tr>'}</tbody>
      </table>
    </div>`;
};

ROUTES.ac = function(){
  return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'驗收單管理'}])}${pageTitle('驗收單功能管理')}<div class="card-x"><h3 class="section-title">驗收單列表</h3><table class="tbl"><thead><tr><th>驗收單號</th><th>船舶</th><th>廠商</th><th>狀態</th></tr></thead><tbody>${(DB.acceptance||[]).map(a=>`<tr><td>${a.no}</td><td>${a.vessel}</td><td>${a.vendor}</td><td>${statusBadge(a.status)}</td></tr>`).join('')||'<tr><td colspan=4 class=empty>無資料</td></tr>'}</tbody></table></div>`;
};

ROUTES.rf = function(){
  return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'退款單管理'}])}${pageTitle('退款單功能管理')}<div class="card-x"><h3 class="section-title">退款單列表</h3><table class="tbl"><thead><tr><th>退款單號</th><th>船東</th><th>船舶</th><th>狀態</th></tr></thead><tbody>${(DB.refunds||[]).map(r=>`<tr><td>${r.no}</td><td>${r.owner}</td><td>${r.vessel}</td><td>${statusBadge(r.status)}</td></tr>`).join('')||'<tr><td colspan=4 class=empty>無資料</td></tr>'}</tbody></table></div>`;
};

ROUTES.wh = function(){
  return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'倉庫管理'}])}${pageTitle('倉庫管理')}<div class="card-x"><h3 class="section-title">倉庫管理列表</h3><table class="tbl"><thead><tr><th>代碼</th><th>名稱</th><th>類型</th><th>船舶</th><th>幣別</th><th>物料</th><th>配件</th><th>總價值</th></tr></thead><tbody>${DB.warehouses.map(w=>`<tr><td>${w.code}</td><td><strong>${w.name}</strong></td><td>${w.type}</td><td>${w.vessel}</td><td>${w.currency}</td><td>${w.items}</td><td>${w.parts}</td><td>${priceText(w.value,'TWD')}</td></tr>`).join('')}</tbody></table></div>`;
};

ROUTES.wi = function(){ return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'入庫單管理'}])}${pageTitle('入庫單功能管理')}<div class="card-x"><h3 class="section-title">入庫單列表</h3><table class="tbl"><thead><tr><th>入庫單編號</th><th>來源</th><th>倉庫</th></tr></thead><tbody>${(DB.inbounds||[]).map(w=>`<tr><td>${w.no}</td><td>${w.source}</td><td>${w.warehouse}</td></tr>`).join('') || '<tr><td colspan=3 class=empty>無資料</td></tr>'}</tbody></table></div>`; };

ROUTES.is = function(){ return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'領用管理'}])}${pageTitle('領用管理')}<div class="card-x"><h3 class="section-title">領用單列表</h3><table class="tbl"><thead><tr><th>領用單號</th><th>倉庫</th><th>領用人</th></tr></thead><tbody>${(DB.issues||[]).map(i=>`<tr><td>${i.no}</td><td>${i.warehouse}</td><td>${i.user}</td></tr>`).join('') || '<tr><td colspan=3 class=empty>無資料</td></tr>'}</tbody></table></div>`; };

ROUTES.to = function(){ return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'調撥管理'}])}${pageTitle('調撥管理')}<div class="card-x"><h3 class="section-title">調撥單列表</h3><table class="tbl"><thead><tr><th>調撥單號</th><th>來源</th><th>目的</th></tr></thead><tbody>${(DB.transfers||[]).map(t=>`<tr><td>${t.no}</td><td>${t.from}</td><td>${t.to}</td></tr>`).join('') || '<tr><td colspan=3 class=empty>無資料</td></tr>'}</tbody></table></div>`; };

ROUTES.ic = function(){ return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'盤點管理'}])}${pageTitle('盤點管理')}<div class="card-x"><h3 class="section-title">盤點計畫列表</h3><table class="tbl"><thead><tr><th>盤點單號</th><th>倉庫</th></tr></thead><tbody>${(DB.inventory_plans||[]).map(p=>`<tr><td>${p.no}</td><td>${p.warehouse}</td></tr>`).join('') || '<tr><td colspan=2 class=empty>無資料</td></tr>'}</tbody></table></div>`; };

ROUTES.items = function(sub){
  const tab = sub || 'mat';
  return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'物料/配件管理'}])}${pageTitle('物料 / 配件管理')}<div class="card-x">
    <div class="pill-tabs">
      <div class="tab ${tab==='mat'?'active':''}" onclick="go('items')"><i class="bi bi-collection"></i> 物料</div>
      <div class="tab ${tab==='parts'?'active':''}" onclick="go('items/parts')"><i class="bi bi-puzzle"></i> 配件</div>
    </div>
    <table class="tbl"><thead><tr><th>IMPA</th><th>品名</th><th>單位</th><th>分類</th><th>規格</th><th>安全庫存</th><th>目前庫存</th><th>單價</th><th>主供應商</th></tr></thead>
    <tbody>${(tab==='parts'?DB.items_part:DB.items_material).map(it=>`<tr><td>${it.impa}</td><td><strong>${it.name}</strong></td><td>${it.unit}</td><td>${it.cat}</td><td>${it.spec}</td><td>${it.safety}</td><td>${it.stock}</td><td>${priceText(it.price,'TWD')}</td><td>${it.vendor}</td></tr>`).join('')}</tbody></table></div>`;
};

ROUTES.vendors = function(){
  return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'廠商資料管理'}])}${pageTitle('廠商資料管理')}<div class="card-x"><h3 class="section-title">廠商列表</h3><table class="tbl"><thead><tr><th>代碼</th><th>名稱</th><th>簡稱</th><th>聯絡人</th><th>類別</th><th>幣別</th><th>評等</th><th>狀態</th></tr></thead><tbody>${DB.vendors.map(v=>`<tr><td>${v.code}</td><td><strong>${v.name}</strong></td><td>${v.short_name}</td><td>${v.contact}</td><td>${v.category}</td><td>${v.currency}</td><td><span class="b ${v.rating==='A'?'b-green':(v.rating==='B'?'b-yellow':'b-gray')}">${v.rating}</span></td><td>${statusBadge(v.status)}</td></tr>`).join('')}</tbody></table></div>`;
};
ROUTES.wo = function(){
  return `${breadcrumb([{label:'Home',route:'dashboard'},{label:'派工單管理'}])}${pageTitle('派工單功能管理')}<div class="card-x"><h3 class="section-title">派工單列表</h3><table class="tbl"><thead><tr><th>派工單號</th><th>對應 PR</th><th>船舶</th><th>主旨</th><th>派工方式</th><th>建立人</th><th>狀態</th></tr></thead><tbody>
    ${(STATE.workOrders||[]).map(w=>`<tr style="background:#fff7ed"><td><span class="b b-yellow">新</span> ${w.no}</td><td><a onclick="(function(){const p=DB.purchase_requests.find(x=>x.no==='${w.pr_no}');if(p)go('pr/view/'+p.id)})()">${w.pr_no}</a></td><td>${w.vessel}</td><td>${w.subject}</td><td>${w.dispatch_type}</td><td>${w.created_by}</td><td>${statusBadge(w.status)}</td></tr>`).join('')}
    ${(DB.work_orders||[]).map(w=>`<tr><td>${w.no}</td><td>-</td><td>${w.vessel}</td><td>${w.subject}</td><td>${w.dispatch_type}</td><td>-</td><td>${statusBadge(w.status)}</td></tr>`).join('')}
    ${((STATE.workOrders||[]).length+(DB.work_orders||[]).length===0)?'<tr><td colspan=7 class=empty>無資料</td></tr>':''}
    </tbody></table></div>`;
};

// ==================== 送修單 (RMA) ====================
ROUTES.rma = function(sub, id){
  const u = currentUser();
  if (sub==='view' && id){
    const r = STATE.rmaOrders.find(x=>x.no===id);
    if (!r) return '<div class="card-x"><h3>找不到送修單</h3><button class="btn-x btn-outline" onclick="go(\'rma\')">返回</button></div>';
    if (!canSeeVessel(r.vessel)) return '<div class="card-x"><h3>權限不足</h3><p>無權檢視「'+r.vessel+'」相關送修單。</p></div>';
    const flow = ['待拆卸','待出貨','送修中','報價中','維修中','已返船','已驗收','結案'];
    const curIdx = flow.indexOf(r.status);
    const pr = DB.purchase_requests.find(p=>p.no===r.pr_no);
    return `
      ${breadcrumb([{label:'Home',route:'dashboard'},{label:'送修單管理',route:'rma'},{label:r.no}])}
      ${pageTitle('送修單詳情')}
      <div class="card-x">
        <div class="flex between aic">
          <h3 class="section-title mb-0">送修單 - ${r.no}</h3>
          <div class="right-actions">
            ${u.side==='岸端' && r.status!=='結案'?`<button class="btn-x btn-primary" onclick="advanceRma('${r.no}')"><i class="bi bi-arrow-right"></i> 推進至下一狀態</button><button class="btn-x btn-outline" onclick="changeRmaStatus('${r.no}')"><i class="bi bi-pencil-square"></i> 自訂狀態</button>`:''}
            <button class="btn-x btn-outline" onclick="go('rma')">返回</button>
          </div>
        </div>
        <div class="info-row">
          <div><b>送修單號：</b>${r.no}</div>
          <div><b>狀態：</b>${statusBadge(r.status)}</div>
          <div><b>船舶：</b>${r.vessel}</div>
          ${pr?`<div><b>來源請購單：</b><a onclick="go('pr/view/${pr.id}')">${r.pr_no}</a></div>`:''}
          <div><b>送修廠商：</b>${r.vendor}</div>
          <div><b>異動人員：</b>${r.updated_by}</div>
          <div><b>異動時間：</b>${r.updated_at}</div>
        </div>

        <h4 class="sub-title">流程進度</h4>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${flow.map((s,i)=>`<div style="flex:1;min-width:80px;padding:8px;background:${i<curIdx?'#dcfce7':(i===curIdx?'#dbeafe':'#f3f4f6')};border-radius:6px;text-align:center;font-size:12px;font-weight:${i===curIdx?'700':'500'};color:${i<curIdx?'#15803d':(i===curIdx?'#1d4ed8':'#9ca3af')}">${i<curIdx?'<i class="bi bi-check-circle-fill"></i> ':(i===curIdx?'<i class="bi bi-arrow-right-circle-fill"></i> ':'')}${s}</div>`).join('')}
        </div>

        <h4 class="sub-title">送修資訊</h4>
        <div class="form-section">
          <div class="form-grid">
            <div><label>對應設備</label><div><strong>${r.equipment}</strong></div></div>
            <div><label>關聯件號</label><div>${r.part_no||'-'}</div></div>
            <div><label>拆卸日</label><div>${r.removal_date||'-'}</div></div>
            <div><label>物流單號</label><div>${r.shipping_no||'-'}</div></div>
            <div><label>預計返船日</label><div>${r.expected_return_date||'-'}</div></div>
            <div><label>建立人</label><div>${r.created_by} (${r.created_at})</div></div>
            <div class="full"><label>備註</label><div style="white-space:pre-line">${r.remark||'(無)'}</div></div>
          </div>
        </div>

        <h4 class="sub-title"><i class="bi bi-clock-history"></i> 異動歷程</h4>
        <table class="tbl">
          <thead><tr><th>時間</th><th>操作人</th><th>動作</th><th>說明</th></tr></thead>
          <tbody>${(r.history||[]).map(h=>`<tr><td>${h.at}</td><td>${h.user}</td><td><span class="b b-blue">${h.action}</span></td><td>${h.detail||''}</td></tr>`).join('')}</tbody>
        </table>

        ${r.part_no && STATE.repairingItems[r.part_no]?`<div class="status-box mt-3" style="background:#7e22ce"><i class="bi bi-exclamation-circle-fill"></i> 此件號 ${r.part_no} 已被標記為「送修中」，新請購單會跳出警示避免誤判庫存。</div>`:''}
      </div>
    `;
  }
  // 列表
  const visibleRmas = STATE.rmaOrders.filter(r=>canSeeVessel(r.vessel));
  return `
    ${breadcrumb([{label:'Home',route:'dashboard'},{label:'送修單管理'}])}
    ${pageTitle('送修單管理')}
    <div class="card-x">
      <h3 class="section-title">送修單 (RMA) 列表 <small class="text-muted" style="font-size:13px;font-weight:normal">共 ${visibleRmas.length} 張</small></h3>
      ${visibleRmas.length===0?'<div class="text-center text-muted" style="padding:40px 0"><i class="bi bi-inbox" style="font-size:32px"></i><br>目前尚無送修單</div>':`
      <table class="tbl">
        <thead><tr><th>送修單號</th><th>來源 PR</th><th>船舶</th><th>設備</th><th>送修廠商</th><th>狀態</th><th>異動</th></tr></thead>
        <tbody>${visibleRmas.map(r=>`<tr><td><a onclick="go('rma/view/${r.no}')"><strong>${r.no}</strong></a></td><td>${r.pr_no}</td><td>${r.vessel}</td><td>${r.equipment}</td><td>${r.vendor}</td><td>${statusBadge(r.status)}</td><td><small>${r.updated_by}<br><span class="text-muted">${r.updated_at}</span></small></td></tr>`).join('')}</tbody>
      </table>`}
    </div>`;
};

// ============ 初始化 ============
try {
  document.getElementById('menuToggle').addEventListener('click', function(){
    var sb = document.getElementById('sidebar');
    var mn = document.getElementById('main');
    sb.classList.toggle('collapsed');
    mn.classList.toggle('full');
  });
  renderSidebar();
  render();
} catch(initErr){
  console.error('Demo init failed:', initErr);
  var v = document.getElementById('view');
  if (v){
    var msg = (initErr && initErr.message) ? initErr.message : String(initErr);
    v.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:24px;margin:20px"><h3>Demo 初始化失敗</h3><div>錯誤訊息：' + msg + '<br><br>請按 F12 看主控台，或執行 localStorage.clear();location.reload()</div></div>';
  }
}
