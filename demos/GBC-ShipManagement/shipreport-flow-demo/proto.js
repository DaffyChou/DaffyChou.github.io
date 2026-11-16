"use strict";
/* ============================================================
   船報填寫流程 互動雛形
   表單 HTML／CSS 直接取自 GBMC_Report 的 report.jsp 與 assets，這支檔只負責：
   1) 流程圖與問題清單  2) 在真實表單上標註「要調整的欄位」  3) 模擬填報與檢查
   ============================================================ */
let NOW='2026-10-31T15:30', TODAY='2026-10-31';
const TN={4:'抵港報',7:'離港報',10:'完工報',3:'日電報',6:'移泊報',9:'特殊情況報',2:'船位報'};
const COND={1:'重載',2:'空載'};
const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=t=>t?t.replace('T',' ').replace(/-/g,'/'):'—';
const num=x=>(x===''||x==null||isNaN(parseFloat(x)))?null:parseFloat(x);
const f1=x=>x==null?'—':(Math.round(x*10)/10).toFixed(1);
const pad=n=>String(n).padStart(2,'0');
const MIN_FO=150, RATE_DEFAULT=12.2;
let mode='pro', hist=[], cur=null, seq=0, collapseOthers=false, lastEvt='';

/* 表單編號：報表種類 → report.jsp 內的 Report-N */
const FM={2:1,4:2,7:4,10:4,3:3,6:5,9:6};
const CARRY_T=['CWCM','CWCP','COAA','NextPortETA','RSE','ESB','POB','TugAttended','TugCastOff','DOP','TugLeft','COSP'];
const TIMEKEYS={1:['ReportTime','NextPortETA'],2:['ReportTime','EOSP','Drifting','AnchorAweigh','RSE','POB','TugAttended','FirstLineMadeFast','AllLineMadeFast','TugCastOff','DOP','TugLeft','FEW'],4:['ReportTime','LSFO_BunkeringCommenced','MGO_BunkeringCommenced',...CARRY_T],3:['ReportTime'],5:['ReportTime'],6:['ReportTimeX','ReportTime']};
const VALKEYS={
 1:['ReportType','VoyageName','VesselCondition','Longitude-Degree','Longitude-Minute','Latitude-Degree','Latitude-Minute','Course','AverageSpeed','RPM','SLIP','ROB_FO','ROB_DO','ROB_MECYO','ROB_MESYLO','ROB_AESYLO','ROB_FW','FO_Consumption','DO_Consumption','RunningDistance_Day','RunningDistance_Hour','BalanceDistance'],
 2:['VoyageName','VesselCondition','ROB_MECYO_FWE','ROB_MESYLO_FWE','ROB_AESYLO_FWE','ROB_FW_FWE','ROB_FO_EOSP','ROB_DO_EOSP','ROB_FO_COSP_LastPort','ROB_DO_COSP_LastPort','ROB_FO_DD','ROB_DO_DD','ROB_FO_AC','ROB_DO_AC','ROB_FO_RSE','ROB_DO_RSE','ROB_FO_FWE','ROB_DO_FWE','TotalTime_Waiting','SeaPassage_TotalTime','SeaPassage_TotalDistance','DailyConsumption_FO_Sailing','DailyConsumption_DO_Sailing','Arrive_Draft_F','Arrive_Draft_M','Arrive_Draft_A'],
 4:['VoyageName','VesselCondition','COSP_ROB_FO','COSP_ROB_DO','COSP_ROB_MECYO','COSP_ROB_MESYLO','COSP_ROB_AESYLO','COSP_FW','CompletedWorking_ROB_FO','CompletedWorking_ROB_DO','CompletedWorking_ROB_MECYO','CompletedWorking_ROB_MESYLO','CompletedWorking_ROB_AESYLO','CompletedWorking_ROB_FW','CommencedWorking_ROB_FO','CommencedWorking_ROB_DO','CommencedWorking_ROB_MECYO','CommencedWorking_ROB_MESYLO','CommencedWorking_FW','PortSupply_FO','PortSupply_DO','PortSupply_MECYO','PortSupply_MESYLO','PortSupply_AESYLO','PortSupply_FW','NextPort','TotalCargo','TotalCargo-Type','TotalCargo-Unit','TotalCargo-PCS','CargoName','CWCM-Type','CWCP-Type','Total_Working_Hour','RSE_ROB_FO','RSE_ROB_DO','RSE_ROB_MECYO','RSE_ROB_MESYLO','RSE_ROB_AESYLO','RSE_ROB_FW'],
 3:['VoyageName','VesselCondition1','VesselCondition2','ROB_FO','ROB_DO','ROB_MECYO','ROB_MESYLO','ROB_AESYLO','ROB_FW'],
 5:['VoyageName','VesselCondition'],
 6:['VoyageName','VesselCondition1','ReportType','ROB_FO','ROB_DO','ROB_MECYO','ROB_MESYLO','ROB_AESYLO','ROB_FW','ROB_FO2','ROB_DO2','ROB_MECYO2','ROB_MESYLO2','ROB_AESYLO2','ROB_FW2']
};

/* 示範階段：每個階段是一段合理的航次進度，示範時間 NOW 也隨階段改變 */
const T7={CWCM:'2026-10-27T08:00',CWCP:'2026-10-28T05:30',COAA:'2026-10-28T09:30',NextPortETA:'2026-10-29T13:00',RSE:'2026-10-28T06:40',ESB:'2026-10-28T06:50',POB:'2026-10-28T07:10',TugAttended:'2026-10-28T07:20',TugCastOff:'2026-10-28T08:40',DOP:'2026-10-28T08:45',TugLeft:'2026-10-28T08:50',COSP:'2026-10-28T10:00'};
const STAGES={nodaily:{now:'2026-10-31T08:20',name:'沒有上一份日電報或抵港報'},sp:{now:'2026-10-31T17:45',name:'卸貨港，作業中發生特殊報'},noon:{now:'2026-10-30T12:15',name:'航行中，午報時間'},daily2:{now:'2026-11-01T08:20',name:'卸貨港，第二天日電報'},sea2:{now:'2026-10-30T21:40',name:'剛靠妥碼頭（沒有下錨）'},sea:{now:'2026-10-31T06:40',name:'剛靠妥碼頭、主機停俥，準備填抵港報'},port:{now:'2026-10-31T15:30',name:'卸貨港，卸貨作業中'},nocomp:{now:'2026-10-31T17:45',name:'卸貨港，尚未填完工報'},done:{now:'2026-10-31T17:45',name:'卸貨完成，已填完工報，準備離港'}};
let curStage='port', curPreset=null;
function mkHist(name){
  const S=[
   {id:9,type:4,time:'2026-10-27T07:50',voyage:'25',cond:2,fo:309.8,do_:31.2,cosp_fo:345.2,cosp_do:31.4,hours:48,avg_fo:17.7,avg_do:0.1},
   {id:1,type:7,time:'2026-10-28T09:30',voyage:'25',cond:1,fo:312.4,fo_alt:312.4,do_:31.0,do_alt:31.0,co:{MECYO:5.6,MESYLO:3.4,AESYLO:1.9,FW:44.0},supply_fo:5,nextPort:'台中港',cargo:'5200',t:{...T7}},
   {id:2,type:9,time:'2026-10-29T02:40',event:'2026-10-29T02:15',evType:'2',voyage:'25',cond:1},
   {id:3,type:4,time:'2026-10-31T06:30',stkT:'2026-10-31T06:00',stk:{FO:258.8,DO:30.6,MECYO:5.3,MESYLO:3.2,AESYLO:1.8,FW:43.0},voyage:'25',cond:1,fo:258.8,do_:30.6,eosp_fo:262.4,eosp_do:30.8,cosp_fo:312.4,cosp_do:31.0,hours:55.5,avg_fo:21.6,avg_do:0.1},
   {id:4,type:3,time:'2026-10-31T08:00',stk:{FO:257.6,DO:30.5,MECYO:5.2,MESYLO:3.1,AESYLO:1.8,FW:42.0},voyage:'25',cond:1,work:'4',fo:257.6,do_:30.5},
   {id:5,type:10,time:'2026-10-31T15:10',voyage:'25',cond:1,fo:'',fo_alt:255.9,do_:'',do_alt:30.4,start_fo:257.6,supply_fo:0,nextPort:'高雄港',cargo:'5200',t:{COAA:'2026-10-31T17:10',RSE:'2026-10-31T16:40',ESB:'2026-10-31T16:50',POB:'2026-10-31T17:00',TugAttended:'2026-10-31T17:05',TugCastOff:'2026-10-31T17:15',DOP:'2026-10-31T17:20',TugLeft:'2026-10-31T17:25',COSP:'2026-10-31T17:35',NextPortETA:'2026-11-01T14:00'},
    cs:{FO:257.6,DO:30.5,MECYO:5.2,MESYLO:3.1,AESYLO:1.8,FW:42.0},cg:{cwcm:'2026-10-31T08:30',cwcmT:2,cwcp:'2026-10-31T14:50',cwcpT:2,total:5200,tType:2,unit:1,pcs:'',name:'鋼捲（示範）'}},
   {id:6,type:9,time:'2026-10-31T11:30',event:'2026-10-31T11:10',evType:'3',stkT:'2026-10-31T11:10',stk:{FO:256.8,DO:30.5,MECYO:5.2,MESYLO:3.1,AESYLO:1.8,FW:41.5},voyage:'25',cond:1},
   {id:7,type:2,time:'2026-10-29T12:00',stk:{FO:289.0,DO:30.9,MECYO:5.5,MESYLO:3.3,AESYLO:1.9,FW:43.5},voyage:'25',cond:1,fo:289.0,do_:30.9,speed:11.5,hours:24,runDist:276,balance:339.3,lonD:120,lonM:31.5,latD:27,latM:16,eta:'2026-10-30T18:00'}
  ];
  const order={nodaily:[1],sp:[0,1,2,3,4,6],noon:[0,1,7],daily2:[0,1,2,3,4],sea2:[0,1,2],sea:[0,1,2],port:[0,1,2,3],nocomp:[0,1,2,3,4],done:[0,1,2,3,4,5]}[name];
  return order.map(i=>JSON.parse(JSON.stringify(S[i])));
}
function loadStage(name){
  curStage=name; hist=mkHist(name); seq=10; NOW=STAGES[name].now; TODAY=NOW.slice(0,10);
}
function initialHist(){return mkHist(curStage);}
loadStage('port');
const byTime=()=>hist.sort((a,b)=>a.time<b.time?-1:1);
const lastOf=t=>[...hist].reverse().find(r=>r.type===t);
const prevRep=(excl)=>[...hist].filter(r=>r.id!==excl).sort((a,b)=>a.time<b.time?-1:1).pop();
const stockFO=r=>num(r.fo)>0?num(r.fo):(num(r.fo_alt)>0?num(r.fo_alt):null);
const stockDO=r=>num(r.do_)>0?num(r.do_):(num(r.do_alt)>0?num(r.do_alt):null);
const mainStock=()=>[...hist].reverse().find(r=>r.type!==9&&stockFO(r)!=null)||null;
const role=()=>{const a=lastOf(4);return a?(a.cond===1?'卸貨港':'裝貨港'):null;};
const hasCompletion=()=>{const a=lastOf(4);return !!a&&hist.some(r=>r.type===10&&r.time>=a.time);};
const OIL_ZH={FO:'重油',DO:'輕油',MECYO:'主機汽缸油',MESYLO:'主機系統油',AESYLO:'輔機系統油',FW:'淡水'};
/* 日電報的「上一份」：上一份日電報或抵港報（現行系統也是這兩種）；抵港報取主機停俥時的存量 */
function lastDaily(excl){
  return [...hist].filter(x=>x.id!==excl&&(x.type===3||x.type===4)&&x.stk).sort((a,b)=>a.time<b.time?-1:1).pop()||null;
}
/* 開工存量：取「開工時間之前、離開工最近、有存量」的一份（抵港報主機停俥／移泊報／日電報）；特殊報不自動帶入，只提示；沒填開工時間時取最新一份抵港報的主機停俥存量 */
const effT=r=>r.stkT||(r.type===9?r.event:r.time);
function openingRef(cwcm){
  let c=hist.filter(r=>(cwcm?[4,3,6]:[4]).includes(r.type)&&r.stk).sort((a,b)=>effT(a)<effT(b)?-1:1);
  if(cwcm) c=c.filter(r=>effT(r)<=cwcm);
  const r=c[c.length-1]; return r?{rec:r,stk:r.stk,stkT:effT(r)}:null;
}
function openingSpecial(cwcm,ref){   // 開工之前（且晚於所取那一份）的特殊報，只提示
  if(!cwcm) return null;
  return hist.filter(r=>r.type===9&&r.stk&&effT(r)<=cwcm&&(!ref||effT(r)>ref.stkT)).sort((a,b)=>effT(a)<effT(b)?-1:1).pop()||null;
}
function autoOpening(){
  if(!cur||cur.F!==4) return; const type=+g(4,'ReportType')||cur.type;
  const lastAny=[...hist].sort((a,b)=>a.time<b.time?-1:1).pop();
  let stk=null, src='', spNote='';
  if(type===7&&lastAny&&lastAny.type===10&&lastAny.cs){ stk=lastAny.cs; src='前一份完工報的開工存量'; }
  else{ const cw=getT(4,'CWCM'); const ref=openingRef(cw); if(ref){ stk=ref.stk; src=TN[ref.rec.type]+' '+fmt(ref.stkT)+' 的存量'+(ref.rec.type===4?'（主機停俥）':'')+(cw?'':'；尚未填開工時間，先取最新一份抵港報'); const sp=openingSpecial(cw,ref); if(sp) spNote='開工前有一份特殊報（事發 '+fmt(sp.event)+'，重油 '+f1(num(sp.stk.FO))+'），沒有自動帶入，請確認是否要採用'; } }
  if(!stk){ toast('找不到可帶入的開工存量（沒有抵港報、移泊報或開工前的日電報）'); return; }
  [['FO','CommencedWorking_ROB_FO'],['DO','CommencedWorking_ROB_DO'],['MECYO','CommencedWorking_ROB_MECYO'],['MESYLO','CommencedWorking_ROB_MESYLO'],['AESYLO','CommencedWorking_ROB_AESYLO'],['FW','CommencedWorking_FW']].forEach(([c,k])=>{const v=stk[c]; sv(4,k,(v==null||v==='')?'':v);});
  toast('開工時油料資訊已帶入：'+src+(spNote?'。'+spNote:''));
}
function lastRef(exclId){
  const r=[...hist].filter(x=>x.id!==exclId&&x.type!==9).sort((a,b)=>a.time<b.time?-1:1).reverse().find(x=>stockFO(x)!=null);
  return {rep:r||null,fo:r?stockFO(r):null,do_:r?stockDO(r):null};
}

/* ================= 要調整的欄位（標在真實表單上） ================= */
const OILS=['FO','DO','MECYO','MESYLO','AESYLO','FW'];
const A=(tag,p,cur,pro)=>({tag,p,cur,pro});
const T5=(k)=>[k,A('不帶入',5,'帶入上一份離港報的時間，沒改就整包送出','留空不帶入，請填寫')];
const ADJ={
 2:{
  ReportTime:A('預設值＋必填',1,'日期預設今天、時間預設 12:00，以灰底「自動填寫」樣式顯示（看起來像系統填好），沒有必填檢查','開新報表自動帶入現在時間；必填；不能比上一份早；和現在差太多只提醒（可能是補資料）'),
  VoyageName:A('新增檢查',0,'沒有標必填，沒有檢查','必填；應與前一份離港報相同（抵港報不換航次號）'),
  VesselCondition:A('規則',0,'','重載＝卸貨港、空載＝裝貨港，用來判斷這個港需不需要完工報'),
  ROB_FO_EOSP:A('新增檢查',0,'沒有檢查','不能 0 或空白；不應比上港完車存量多；重油航行前後完全一樣會提醒（輕油不查）'),
  ROB_DO_EOSP:A('新增檢查',0,'沒有檢查','不能 0 或空白；不應比上港完車存量多'),
  ROB_FO_COSP_LastPort:A('新增檢查',0,'沒有檢查','不能 0 或空白；旁邊顯示上一份離港報的存量'),
  ROB_DO_COSP_LastPort:A('新增檢查',0,'沒有檢查','不能 0 或空白'),
  Arrive_Draft_F:A('新增檢查',0,'沒有檢查','空白會提醒'),Arrive_Draft_M:A('新增檢查',0,'沒有檢查','空白會提醒'),Arrive_Draft_A:A('新增檢查',0,'沒有檢查','空白會提醒'),
  SeaPassage_TotalTime:A('新增檢查',0,'缺少資料時，平均油耗直接清成空白','必填；缺少計算需要的資料時不給送出，並提示補哪個欄位'),
  AverageSpeed:A('新增檢查',0,'自動算出，沒有合理性檢查','和該船近期船速差太多會提醒'),
  DailyConsumption_FO_Sailing:A('改唯讀',6,'欄位可手改；新開時帶入上一份抵港報的數字；必填檢查只擋空白，0 也能過','唯讀，只由系統計算；不帶入上一份'),
  DailyConsumption_DO_Sailing:A('改唯讀',6,'欄位可手改；新開時帶入上一份抵港報的數字；必填檢查只擋空白，0 也能過','唯讀，只由系統計算；不帶入上一份')
 },
 4:{
  ReportType:A('規則',0,'','抵港重載＋離港空載＝有卸貨，要先有完工報才填離港報；抵港空載卻填完工報會提醒'),
  VoyageName:A('新增檢查',0,'沿用上一份的航次號，沒有檢查','有完工報之後的離港報（空載）才換成下一個，系統自動帶入；裝貨港離港報不換'),
  VesselCondition:A('規則',0,'','離港空載＝剛離開卸貨港'),
  ReportTime:A('預設值＋必填',1,'日期預設今天、時間預設 12:00，以灰底「自動填寫」樣式顯示（看起來像系統填好），沒有必填檢查','開新報表自動帶入現在時間；必填；和現在差太多只提醒（可能是補資料）；不能比最晚的事件時間早'),
  TotalCargo:A('新增檢查',0,'預設 0','貨量與單位要一起填'),
  NextPortETA:A('不帶入',5,'帶入上一份離港報的時間，沒改就整包送出','留空；必填，且要比發報時間晚'),
  NextPort:A('新增檢查',0,'沒有檢查','必填'),
  ...Object.fromEntries(['CWCM','CWCP','COAA','RSE','ESB','POB','TugAttended','TugCastOff','DOP','TugLeft','COSP'].map(T5)),
  LSFO_BunkeringCommenced:A('新增檢查',0,'沒有檢查','有補油量卻沒填加油開始、結束時間會提醒'),
  CommencedWorking_ROB_FO:A('新增檢查',0,'沒有檢查','有完工報時不能 0 或空白'),
  CompletedWorking_ROB_FO:A('新增檢查',0,'沒有檢查','不能 0 或空白'),CompletedWorking_ROB_DO:A('新增檢查',0,'沒有檢查','不能 0 或空白'),
  COSP_ROB_FO:A('修 bug',4,'完工報沒有定速航行，這欄通常空白；燃油預警把空白當 0，顯示 0 天','完工報不需填；預警取最新「有填存量」的欄位，並說明來源'),
  PortSupply_FO:A('新增檢查',0,'沒有檢查','有補油量，存量要對得上（存量應增加）')
 },
 3:{
  VesselCondition2:A('新增檢查',0,'沒有檢查','作業狀況要和港口角色一致（抵港重載＝卸貨港）'),
  ...Object.fromEntries(OILS.map(c=>['ROB_'+c,A('預設值',3,'預設 0，0 可以送出','預設空白，0 或空白不能送出；旁邊顯示「上一份：x 噸」')])),
  ...Object.fromEntries(OILS.map(c=>[c+'_Consumption',A('預設值',3,'新開時先放上一份的存量（等於整桶），沒填存量就是整桶耗量','空白、唯讀；填完存量才自動算（上一份存量 − 這份存量）')]))
 },
 5:{ReportTime:A('預設值＋必填',1,'日期預設今天、時間預設 12:00，以灰底「自動填寫」樣式顯示（看起來像系統填好），沒有必填檢查','開新報表自動帶入現在時間；必填；要在抵港報之後')},
 6:{
  ReportTimeX:A('修 bug',2,'修改時讀不到原本的發報時間（系統查成移泊報的資料表），顯示成今天 12:00，存檔就蓋掉','修改時顯示原本存的發報時間；查不到時不改用今天'),
  ReportTime:A('新增檢查',0,'沒有檢查','事件發生時間不能比發報時間晚')
 }
};

const KEEP=(tag,cur,pro)=>({tag,p:0,cur,pro,keep:true});
ADJ[2]={...ADJ[2],
  EOSP:A('新增檢查',0,'沒有時間順序檢查','時間要照順序：結束定速航行 ≤ 下錨 ≤ 起錨 ≤ 備俥 ≤ 主機停俥'),
  Drifting:A('新增檢查',0,'沒有檢查','有下錨才填；要晚於結束定速航行、早於起錨。沒下錨就不用填下錨／起錨兩區油料'),
  AnchorAweigh:A('新增檢查',0,'沒有檢查','要晚於下錨時間；等泊總時間改為自動算（起錨 − 下錨）'),
  RSE:A('新增檢查',0,'沒有檢查','要晚於起錨（沒下錨的話，要晚於結束定速航行）'),
  FEW:A('新增檢查',0,'沒有檢查','最後一個階段，時間要最晚'),
  ROB_FO_EOSP:A('新增檢查',0,'沒有檢查','不能 0 或空白；必須比上港完車存量少；與後面各階段依時間遞減（見下方「存量連鎖核對」）'),
  ROB_DO_EOSP:A('新增檢查',0,'沒有檢查','不能 0 或空白；必須比上港完車存量少'),
  ROB_FO_COSP_LastPort:KEEP('維持自動帶入','自動帶入上一份船報（離港報）的「定速航行存量」，灰底唯讀。上一份沒填時這裡是空白，航程耗油就算不出來','維持自動帶入；上一份離港報的定速航行存量若沒填，在離港報就擋下'),
  ROB_DO_COSP_LastPort:KEEP('維持自動帶入','自動帶入上一份船報（離港報）的「定速航行存量」','維持自動帶入'),
  ROB_FO_DD:A('新增檢查',0,'沒有檢查','只有下錨／漂航才填；要比結束定速航行時少'),
  ROB_DO_DD:A('新增檢查',0,'沒有檢查','只有下錨／漂航才填；要比結束定速航行時少'),
  ROB_FO_AC:A('新增檢查',0,'沒有檢查','要比下錨時少；等泊時主機不是全速，折算每天耗油不能比航行平均高很多'),
  ROB_DO_AC:A('新增檢查',0,'沒有檢查','要比下錨時少'),
  ROB_FO_RSE:A('新增檢查',0,'沒有檢查','要比起錨時少（沒下錨的話，要比結束定速航行時少）'),
  ROB_DO_RSE:A('新增檢查',0,'沒有檢查','要比起錨時少'),
  ROB_FO_FWE:A('新增檢查',0,'沒有檢查','要比備俥時少；這是整份抵港報最後一個存量，也是日電報耗量的起點'),
  ROB_DO_FWE:A('新增檢查',0,'沒有檢查','要比備俥時少'),
  SeaPassage_TotalTime:A('改自動',0,'手填；缺少資料時，平均油耗直接清成空白','自動計算：結束定速航行時間 − 上一份離港報的開始定速航行時間；唯讀'),
  TotalTime_Waiting:A('改自動',0,'手填','自動計算：起錨時間 − 下錨時間；唯讀'),
  TotalConsumption_FO_Waiting:A('改自動',0,'手填','自動計算：下錨存量 − 起錨存量；唯讀'),
  TotalConsumption_DO_Waiting:A('改自動',0,'手填','自動計算：下錨存量 − 起錨存量；唯讀'),
  DailyConsumption_FO_Waiting:A('改自動',0,'由等泊總耗油與時間算出，仍可手改','唯讀，由系統計算'),
  DailyConsumption_DO_Waiting:A('改自動',0,'由等泊總耗油與時間算出，仍可手改','唯讀，由系統計算')
};

ADJ[1]={
  ReportTime:A('新增檢查',0,'預設今天 12:00（午報本來就是 12:00），沒有檢查','午報固定 12:00（不是就提醒）；和現在差太多、比上一份早都只提醒（可能是補資料）；和上一份午報相隔約 24 小時'),
  VoyageName:A('新增檢查',0,'沿用上一份，沒有檢查','必填；要和上一份相同'),
  ROB_FO:A('新增檢查',0,'沒有檢查','不能 0 或空白；要比上一份少（航行中不會補油）；完全一樣會提醒'),
  ROB_DO:A('新增檢查',0,'沒有檢查','不能 0 或空白；要比上一份少'),
  ...Object.fromEntries(OILS.map(c=>[c+'_Consumption',A('預設值',3,'預設 0；新開時先放上一份的存量（等於整桶），沒填存量就停在整桶','空白、唯讀；填完存量才自動算：上一份船報的存量 − 這份存量；用量和最近日耗差太多會提醒')])),
  RunningDistance_Day:A('改自動',0,'新開時帶入上一份的日航程，沒改就整個沿用','自動計算：本次午報船位與上一份午報船位之間的距離（由兩個船位算）；唯讀；不再帶入上一份'),
  RunningDistance_Hour:A('改自動',0,'新開時帶入上一份的時數','自動計算：和上一份午報相隔的時數（最多 24 小時），扣掉其間在港、下錨的時間；唯讀'),
  BalanceDistance:A('新增檢查',0,'沒有檢查','要約等於「上一份距離下一港 − 日航程」，差太多會提醒；欄位上顯示預估值'),
  NextPortETA:A('新增檢查',0,'自動帶入 AIS 的預計抵達時間，沒有檢查','比發報時間早、或空白只提醒（AIS 資料可能過期）')
};

['SeaPassage_TotalTime','TotalTime_Waiting','TotalConsumption_FO_Waiting','TotalConsumption_DO_Waiting','DailyConsumption_FO_Waiting','DailyConsumption_DO_Waiting','AverageSpeed','DailyConsumption_FO_Sailing','DailyConsumption_DO_Sailing'].forEach(k=>{delete ADJ[2][k];});
Object.assign(ADJ[2],{
  DailyConsumption_FO_Sailing:A('新增檢查',0,'自動計算（航程耗油 ÷ 航行時間 × 24）；算出來不合理也能送出','算出來是 0 或負數時不能送出（通常是存量填錯）'),
  ROB_FO_DD:A('新增檢查',0,'結束定速航行的存量會自動帶入這裡；沒有檢查','沒有下錨就維持帶入值；有下錨才需要改，並要有下錨時間；要比結束定速航行時少或相等'),
  ROB_DO_DD:A('新增檢查',0,'結束定速航行的存量會自動帶入這裡；沒有檢查','沒有下錨就維持帶入值；有下錨才需要改，並要有下錨時間'),
  ROB_FO_FWE:A('修 bug',0,'自動帶入時：有備俥存量先放備俥，再被起錨存量蓋掉（兩者都有時取起錨）；之後改起錨存量，會把船員手填的停俥存量也蓋掉。備俥比起錨晚，較晚的才是主機停俥前的存量（程式順序，待確認是否為設計）','自動帶入最晚階段的存量：備俥優先，沒有才取起錨；船員手填的停俥存量不會被蓋掉；並檢查要比備俥時少。停俥存量只記錄靠泊後的存量，不再參與等泊耗油計算'),
  ROB_DO_FWE:A('修 bug',0,'自動帶入時：有備俥存量先放備俥，再被起錨存量蓋掉（兩者都有時取起錨）；之後改起錨存量，會把船員手填的停俥存量也蓋掉','自動帶入最晚階段的存量：備俥優先，沒有才取起錨；船員手填的不會被蓋掉'),
  TotalConsumption_FO_Waiting:A('計算口徑',0,'下錨存量 − 主機停俥存量。停俥存量是靠泊後的真實存量且可手改，與起錨存量不同時，等泊耗油就被改變，折算每日耗油被放大（匯順 07/13：應為 0.32 噸、每天約 3 噸，算成 2.61 噸、每天 25.6 噸）','依序判斷，不看停俥存量：①沒下錨（缺下錨或起錨時間）＝ 0；②有填起錨：下錨 − 起錨；③沒填起錨：下錨 − 備俥存量並標示「估算」（客戶 11/11 要求，船員不會填起錨）；④備俥也沒填：留空並提示補填；⑤算出負數：留空並提示檢查；唯讀【估算方式待確認】'),
  TotalConsumption_DO_Waiting:A('計算口徑',0,'下錨存量 − 主機停俥存量（同重油）','規則同重油（沒下錨 0、下錨 − 起錨、沒填起錨改用備俥估算）；唯讀')
});
ADJ[1]={
  ReportTime:A('新增檢查',0,'預設今天 12:00（午報本來就是 12:00），沒有檢查','午報固定 12:00（不是就提醒）；和現在差太多、比上一份早都只提醒（可能是補資料）；和上一份午報相隔約 24 小時'),
  VoyageName:A('新增檢查',0,'沿用上一份，沒有檢查','必填；要和上一份相同'),
  ROB_FO:A('新增檢查',0,'沒有檢查','不能 0 或空白；要比上一份少（航行中不會補油）；完全一樣會提醒；用量和最近日耗差太多會提醒'),
  ROB_DO:A('新增檢查',0,'沒有檢查','不能 0 或空白；要比上一份少'),
  NextPortETA:A('新增檢查',0,'自動帶入 AIS 的預計抵達時間，沒有檢查','比發報時間早、或空白只提醒（AIS 資料可能過期）')
};

/* ================= 問題清單 ================= */
const P=[
 {n:1,sev:'h',title:'發報時間常常是預設值',nodes:[4,7,10],run:()=>startForm(4),
  what:'表單打開時，日期自動放「今天」、時間自動放預設值（日電報 08:00，其他報 12:00）。而且發報時間和 GMT 放在灰底的「自動填寫」群組，與船名、船長、港口名稱同樣樣式，看起來像系統已經填好，船員不會想到要改。抵港報、離港報、完工報的表單也沒有「發報時間必填」的檢查。',
  ev:`<table class="pv-t"><tr><th>報表</th><th class="n">份數</th><th class="n">剛好 12:00</th><th class="n">比例</th></tr>
   <tr><td>抵港報</td><td class="n">190</td><td class="n">22</td><td class="n">約 12%</td></tr>
   <tr><td>離港報</td><td class="n">187</td><td class="n">50</td><td class="n">約 27%</td></tr>
   <tr><td>完工報</td><td class="n">80</td><td class="n">20</td><td class="n">約 25%</td></tr></table>
   <div class="pv-mute">2026/07/01 起的快取船報。若時間是隨機分布，剛好 12:00 應只有 2% 左右。</div>`,
  loc:'GBMC_Report 的 script.js 第 75–144 行（日期預設今天）；report.jsp（時間預設 12:00）',
  impact:'燃油預警是用發報時間挑「最近的一份抵港報」，時間錯了，挑到的日耗就可能不對；報表排序也會錯亂。',
  cur:'預設今天 12:00，用灰底「自動填寫」樣式顯示，沒有必填檢查，送出什麼就是什麼。',pro:'開新報表自動帶入現在時間，並改用可編輯樣式（不再是灰底自動填寫）；必填；不能比現在晚、不能比上一份早；和送出時間差太多就提醒。'},
 {n:2,sev:'h',title:'特殊報修改時，發報時間被改成今天',nodes:[9],run:()=>startForm(9,2),
  what:'修改特殊報時，系統要把原本的發報時間讀回表單，但它去查的是「移泊報」的資料表（ReportTypeID = 6），不是特殊報（9）。查不到，欄位就維持預設的「今天」，存檔後就把今天寫進去。',
  ev:'附帶風險：若移泊報剛好有相同編號，畫面會顯示別份報表的時間。',
  loc:'GBMC_Report 的 function0.jsp 第 805 行（<code>ReportTypeID = 6</code> 應為 <code>9</code>）',
  impact:'發報時間錯亂，報表順序與依時間挑選的資料全部受影響。這是依下載的原始碼判斷，線上版可能不同，驗證只需打開一份舊的特殊報看時間。',
  cur:'打開舊特殊報，發報時間顯示成今天 12:00，存檔就蓋掉原本的時間。',pro:'修改時顯示原本存的時間；查不到時不改用今天。'},
 {n:3,sev:'h',title:'日電報存量預設 0，耗量預先放上一份的存量',nodes:[3],run:()=>startForm(3),
  what:'日電報的六個存量欄位預設都是 0；耗量欄位在新開時先放「上一份的存量」，船員輸入存量後才用「上一份存量 − 這份存量」重算。船員忘了填存量，耗量就停在整桶存量；送出時只擋空白，0 可以通過。',
  ev:`<table class="pv-t"><tr><th>船舶</th><th>日電報時間</th><th class="n">存量</th><th>耗量</th></tr>
   <tr><td>金保順</td><td>8/10 08:00</td><td class="n">0</td><td>等於整桶存量</td></tr>
   <tr><td>源順</td><td>8/19 08:00</td><td class="n">0</td><td>等於整桶存量</td></tr>
   <tr><td>源順</td><td>9/14 08:00</td><td class="n">0</td><td>等於整桶存量</td></tr>
   <tr><td>豐順</td><td>10/18 08:38</td><td class="n">0</td><td>等於整桶存量</td></tr></table>`,
  loc:'GBMC_Report 的 report.jsp 第 3227 行（輸入值預設 0）；script.js 第 731–736 行（耗量預帶上一份存量）、第 2165 行（耗量計算）、第 2786–2788 行（只檢查空白）',
  impact:'大船輕油的「近 30 天平均日耗」會被這種假耗量拉高。',
  cur:'存量預設 0，0 可以送出；耗量先放整桶存量。',pro:'存量預設空白，0 或空白不能送出；旁邊顯示「上一份：x 噸」；耗量唯讀，填完存量才自動算。'},
 {n:4,sev:'h',title:'完工報最新時，重油存量被讀成 0，預警變 0 天',nodes:[10],run:()=>startForm(10),
  what:'燃油預警讀「最新一份報表」的存量。完工報沒有定速航行，這欄通常空白，系統把空白當成 0；另外有 6 個地方，程式把重油的備用值寫進了輕油的變數（ROB_DO），所以完工報是最新報表時，重油存量會變 0，預警顯示 0 天、紅色。',
  ev:'快取中有 28 份完工報的重油存量空白：匯順一號 17、金保順 7、豐順 3、源順 1。',
  loc:'GBMC_SRP 的 InfoModule.jsp 第 986、1026、1049 行；InfoModule_Single.jsp 第 475、511、532 行',
  impact:'船隊安全畫面的重油剩餘天數誤報 0 天、紅色警戒。',
  cur:'完工報定速航行存量留空可以送出；預警看到 0 天。',pro:'預警取「最新一份有填存量」的欄位，並說明改用哪一份。'},
 {n:5,sev:'m',title:'離港報、完工報會帶入上一份的時間',nodes:[7,10],run:()=>startForm(7),
  what:'開新的離港報或完工報時，系統把上一份報表的時間、貨量、下一港等欄位整包帶進來。船員沒改，送出的就是上一個港的資料。',
  ev:`<table class="pv-t"><tr><th>欄位</th><th class="n">不同港口卻完全相同（共 183 份）</th></tr>
   <tr><td>引水上船時間</td><td class="n">14</td></tr><tr><td>下一港預計抵達時間</td><td class="n">14</td></tr>
   <tr><td>RSE 時間</td><td class="n">12</td></tr><tr><td>引水下船時間</td><td class="n">11</td></tr>
   <tr><td>拖船離開時間</td><td class="n">11</td></tr></table>
   <div class="pv-mute">不同港口的時間不可能剛好相同到分鐘，所以是帶入後沒改。</div>`,
  loc:'GBMC_Report 的 script.js 第 806–900 行附近（LastReport 帶入）',
  impact:'港口作業時間、在港時數、航程時數的統計都會失真。',
  cur:'時間欄位已經填好上一個港的數字，容易直接送出。',pro:'時間欄位留空不帶入；港名、貨名可帶入並標示「系統帶入」。'},
 {n:6,sev:'m',title:'平均油耗可手改，且新開時帶入上一份的數字',nodes:[4],run:()=>startForm(4),
  what:'抵港報的平均重油、平均輕油油耗，表單雖然會自動計算（航程總耗油 ÷ 航程時數 × 24），但欄位可以手動改寫，新開時也會先帶入上一份報表的數字。必填檢查只擋空白，0 也能過。',
  ev:'這兩個欄位是燃油加油預警的計算基礎。',
  loc:'GBMC_Report 的 script.js 第 634–635 行（帶入）、第 2574–2576 行（只檢查空白）、第 4014–4040 行（計算）',
  impact:'預警的日耗取自這個欄位，被手改或帶入舊值，剩餘天數就不準。',
  cur:'可以直接打數字蓋掉，也可能是上一次航程的舊值。',pro:'唯讀，只由系統計算；缺資料時不給送出並提示補哪個欄位。'}
];

ADJ[3]={
  VesselCondition2:A('新增檢查',0,'沒有檢查','作業狀況要和港口角色一致（抵港重載＝卸貨港）'),
  ROB_FO:A('預設值',3,'預設 0；0 可以送出（耗量＝上一份存量 − 這份存量，存量沒填就等於整桶）','預設空白，0 或空白不能送出；旁邊顯示「上一份：x 噸」'),
  ROB_DO:A('預設值',3,'預設 0；0 可以送出','預設空白，0 或空白不能送出；旁邊顯示「上一份：x 噸」'),
  ...Object.fromEntries(['MECYO','MESYLO','AESYLO','FW'].map(c=>['ROB_'+c,A('預設值',0,'預設 0，要船員自己填','預先帶入上一份日電報或抵港報（主機停俥）的存量；找不到上一份時提醒')]))
};
delete ADJ[4].CWCM; delete ADJ[4].CWCP;
['COAA','RSE','ESB','POB','TugAttended','TugCastOff','DOP','TugLeft','COSP'].forEach(k=>{ADJ[4][k]=A('不帶入',5,'前一份是完工報時，連完工報裡的開航時間紀錄一起帶入，沒改就整包送出','不帶入，請填寫（只帶入完工報的裝卸時間與貨量）');});
ADJ[4].NextPortETA=A('不帶入',5,'前一份是完工報時，連完工報裡的下一港預計抵達一起帶入','不帶入，請填寫；必填，且要比發報時間晚');
ADJ[4].ReportType=A('規則',0,'','抵港重載＋離港空載＝有卸貨，要先有完工報才填離港報；完工報不限卸貨，裝貨也可以填');
['FO','DO','MECYO','MESYLO','AESYLO'].forEach(c=>{ADJ[4]['CommencedWorking_ROB_'+c]=A('預設值',0,'完工報：前一份不是完工報時，帶入最後一份抵港報的主機停俥存量（中間有日電報、特殊報都不看）','依開工時間，取「開工時間之前、離開工最近、有存量」的一份：抵港報主機停俥、移泊報、開工前的日電報（開工後的日電報已含作業耗量，不取）；特殊報不自動帶入，只提示；還沒填開工時間時取最新一份抵港報；離港報前一份是完工報時，直接帶入完工報的開工存量');});
ADJ[4].CommencedWorking_FW=ADJ[4].CommencedWorking_ROB_FO;
['FO','DO','MECYO','MESYLO','AESYLO','FW'].forEach(c=>{
  ADJ[4]['CompletedWorking_ROB_'+c]=A('新增檢查',0,'沒有檢查','重油、輕油不能 0 或空白；六種油水都要等於「開工存量＋補給」：補給是 0 時不應增加，有補給時要增加補給的量');
  ADJ[4]['PortSupply_'+c]=A('新增檢查',0,'沒有檢查（連重油補給也沒有核對存量）','補給量有填，離泊位存量要比開工存量增加相同的量；六種油水都檢查，重油、輕油還要填加油時間');
});
// 問題清單：依程式碼更正
P[2].title='日電報存量預設 0，沒填就當 0';
P[2].what='日電報的六個存量欄位預設都是 0，送出時只擋空白，0 可以通過。耗量是系統用「上一份存量 − 這份存量」自動算的，存量沒填（0）時，耗量就等於整桶存量。';
P[2].cur='存量預設 0，0 可以送出；耗量自動算，所以沒填存量就變整桶。';
P[2].pro='重油、輕油預設空白、不能 0；主機汽缸油、主機系統油、輔機系統油、淡水預先帶入上一份日電報或抵港報的存量；找不到上一份時提醒。耗量維持自動算。';
P[4].title='離港報前一份是完工報時，開航時間紀錄也被一起帶入';
P[4].what='現行系統看「上一個離港報之後最新的一份報表」：是完工報，就把完工報整份帶入，包含開裝／開卸、完裝／完卸、貨物及完工數量（這些符合需求），也包含開航時間紀錄（引水登船、備俥、引水離船、拖輪離開、開始定速航行、下一港預計抵達…）。船員沒改，送出的就是舊時間。';
P[4].loc='GBMC_Report 的 function.jsp 第 1190–1480 行（挑選上一份報表）；script.js 第 806–900 行（帶入欄位）';
P[4].cur='前一份是完工報：整份帶入，連開航時間紀錄也帶入。';
P[4].pro='只帶入完工報的開裝／開卸時間、完裝／完卸時間、貨物及完工數量；開航時間紀錄留空。';
P[4].impact='港口作業時間、在港時數的統計失真；下表是不同港口、時間卻完全相同的份數。';

['COAA','ESB','POB','TugAttended','TugCastOff','DOP','TugLeft','COSP'].forEach(k=>{delete ADJ[4][k];});
ADJ[4].RSE=A('新增檢查',0,'沒有檢查；前一份是完工報時，開航時間紀錄會直接帶入完工報的資料（維持）','開航時間要依序：備俥 → 機器備便 → 引水登船 → 拖輪協助 → 離泊位 → 拖輪纜繩解掉 → 引水離船 → 拖輪離開 → 開始定速航行；順序顛倒會提醒');
ADJ[4].NextPortETA=A('新增檢查',0,'前一份是完工報時，連同完工報的下一港預計抵達一起帶入；沒有檢查','必填，且要比發報時間晚');
['FO','DO','MECYO','MESYLO','AESYLO'].forEach(c=>{ADJ[4]['CommencedWorking_ROB_'+c]=A('預設值',0,'完工報：前一份不是完工報時，帶入最後一份抵港報的主機停俥存量（中間有日電報、特殊報都不看）','依開工時間，取「開工時間之前、離開工最近、有存量」的一份：抵港報主機停俥、日電報、移泊報、特殊報事發時都算；離港報前一份是完工報時，直接帶入完工報的開工存量，沒有完工報時規則和完工報相同');});
ADJ[4].CommencedWorking_FW=ADJ[4].CommencedWorking_ROB_FO;
ADJ[6]=ADJ[6]||{};
OILS.forEach(c=>{ADJ[6]['ROB_'+c]=A('新增檢查',0,'左邊填事發時、右邊填重新起航時；耗量總計自動算（左 − 右）。沒有其他檢查，填成上下也能送出','事發時在左、重新起航時在右，每一列兩個數字並排。右邊比左邊多、存量和最近一份報表差很多（疑似一路往下填）、續航報右邊空白，都會提醒');});
OILS.forEach(c=>{
  ADJ[4]['RSE_ROB_'+c]=A('新增檢查',0,'沒有檢查','不能比離泊位存量多（補給只在港內，離泊位之後存量不會增加）');
  if(c!=='FO') ADJ[4][c==='FW'?'COSP_FW':'COSP_ROB_'+c]=A('新增檢查',0,'沒有檢查','不能比備俥（或離泊位）存量多');
});
P.splice(5,1); P.splice(4,1);

/* ================= 流程圖 ================= */
const NODES=(t,sub,o={})=>({t,sub,...o});
const FLOW=[
 {lane:'裝貨港',tag:'抵港報為空載',items:[
   NODES(4,'每次到港',{cond:'空載'}),NODES(6,'在港內換碼頭',{opt:1,optt:'若有移泊'}),
   NODES(3,'每天 08:00・作業狀況＝裝貨'),NODES(10,'裝完後填，可有可無',{opt:1}),
   NODES(7,'離港',{cond:'重載',chg:'航次號不換',keep:1})]},
 {down:'離開裝貨港，航行中'},
 {lane:'航行中',tag:'依需要填',items:[
   NODES(2,'航行中每天 12:00（船鐘時間）一份午報',{opt:1}),NODES(9,'改向、減速、故障停俥、避風等突發事件',{opt:1})]},
 {down:'到達卸貨港'},
 {lane:'卸貨港',tag:'抵港報為重載',items:[
   NODES(4,'每次到港',{cond:'重載'}),NODES(3,'每天 08:00・作業狀況＝卸貨'),
   NODES(10,'卸完後填，有卸貨必填',{must:1}),NODES(7,'先有完工報才填離港報',{cond:'空載',chg:'航次號換新'})]},
 {down:'回到下一個裝貨港的抵港報（空載），進入下一個航次'}
];
const TCOL={4:'#0d6efd',7:'#0aa2c0',10:'#8540f5',3:'#198754',6:'#b08900',9:'#dc3545',2:'#6c757d'};
function renderFlow(){
  let h='<div class="pv-hint">點任一個報表，會開啟該報表的填寫畫面。</div>';
  for(const b of FLOW){
    if(b.down){h+=`<div class="pv-down">▼ ${b.down}</div>`;continue;}
    h+=`<div class="pv-lane"><h3>${b.lane}<span class="pv-tag">${b.tag}</span></h3><div class="pv-row">`;
    b.items.forEach((n,i)=>{
      if(i) h+='<span class="pv-arrow">→</span>';
      const pr=[];
      h+=`<button class="pv-node ${n.opt?'opt':''}" style="--c:${TCOL[n.t]}" ${n.noclick?'disabled':''} data-t="${n.t}">
        ${pr.length?`<span class="pv-pb">${pr.map(p=>`<span data-p="${p.n}" title="${esc(p.title)}">${p.n}</span>`).join('')}</span>`:''}
        <b>${TN[n.t]}${n.cond?`<span class="pv-cond">${n.cond}</span>`:''}</b>
        <small>${n.optt?n.optt+'・':''}${n.must?'必填・':''}${n.sub}</small>
        ${n.chg?`<span class="pv-chg ${n.keep?'keep':''}">${n.chg}</span>`:''}</button>`;
    });
    h+='</div></div>';
  }
  h+=`<div class="pv-rules">
    <div class="pv-card"><h3>港口角色怎麼判斷</h3>抵港報<b>重載</b>、離港報<b>空載</b> = 卸貨港。<br>抵港報<b>空載</b>、離港報<b>重載</b> = 裝貨港。</div>
    <div class="pv-card"><h3>航次號什麼時候換</h3>只有「<b>有完工報之後的離港報（空載）</b>」才換成下一個。<br>抵港報、裝貨港的離港報都不換。</div>
    <div class="pv-card"><h3>完工報什麼時候要填</h3>有卸貨才必填，並且要先填完工報才填離港報。裝貨的完工報可有可無。</div>
    <div class="pv-card"><h3>加油記在哪裡</h3>只有離港報、完工報有補油欄位，所以航程中不會補油。</div></div>`;
  qs('#flowBody').innerHTML=h;
  qsa('#flowBody .pv-node:not([disabled])').forEach(b=>b.onclick=e=>{
    const pn=e.target.closest('[data-p]'); if(pn){e.stopPropagation();showTab('prob');document.getElementById('prob'+pn.dataset.p).scrollIntoView({behavior:'smooth',block:'start'});return;}
    startForm(+b.dataset.t);
  });
}
/* ================= （已簡化）只呈現調整後的設計，與現行不同處用紅色虛線框標示 ================= */
function showTab(){}
function setMode(){}

/* ================= 上方的報表時間軸 ================= */
function renderStrip(){
  byTime();
  const chips=hist.map(r=>{
    const s=r.type===9?'':(stockFO(r)!=null?'　重油 '+f1(stockFO(r)):'　重油 <span class="pv-bad">空白</span>');
    return `<span class="pv-chip" style="--c:${TCOL[r.type]}"><b>${TN[r.type]}</b>${r.cond?`<span class="pv-cond">${COND[r.cond]}</span>`:''}<br>${fmt(r.time)}　航次 ${esc(r.voyage)}${s}${r.type===9?` <a href="#" class="pv-ed" data-ed="${r.id}">修改</a>`:''}</span>`;
  }).join('<span class="pv-arrow">→</span>');
  const ar=lastOf(4), core=[...hist].reverse().find(r=>[3,4,7,10].includes(r.type));
  let g;
  if(!core) g='從抵港報開始。';
  else if(core.type===7) g=core.cond===1?'航行中；到港後填抵港報。':'已離開卸貨港；到下一個裝貨港填抵港報（空載）。';
  else if(core.type===4) g=core.cond===1?'卸貨港：日電報 → 完工報 → 離港報（空載、航次號換新）。':'裝貨港：日電報 → 完工報（可有可無）→ 離港報（重載）。';
  else if(core.type===3) g=role()==='卸貨港'?'卸貨中；卸完填完工報，再填離港報。':'裝貨中；裝完可填完工報，再填離港報。';
  else g=role()==='卸貨港'?'完工報已送出；下一步離港報（空載），航次號換成 '+(+ar.voyage+1)+'。':'完工報已送出；下一步離港報（重載），航次號不換。';
  const last=[...hist].sort((a,b)=>a.time<b.time?-1:1).pop();
  qs('#proto-strip').innerHTML=`<div class="pv-strip-in"><span><b>示範時間</b> ${fmt(NOW)}（${STAGES[curStage].name}）</span>
    <span><b>上一份</b> ${TN[last.type]} ${fmt(last.time)}${last.type===9?'':'　重油 '+(stockFO(last)!=null?f1(stockFO(last)):'空白')}</span>
    <span><b>下一步</b> ${g}</span>
    <details class="tlm"><summary>前幾份報表</summary><div class="chips">${chips}</div></details>
    <button class="pv-btn sm" id="reset">重設示範資料</button></div>`;
  {// 「前幾份報表」浮動清單：貼著按鈕、不超出視窗；點別處、捲動、按 Esc 或點報表就收起，不會一直遮住畫面
    const tl=qs('.tlm'), ch=tl&&tl.querySelector('.chips'); if(tl&&ch){
      const close=()=>{tl.open=false;}, place=()=>{const r=tl.querySelector('summary').getBoundingClientRect(); ch.style.top=(r.bottom+4)+'px';};
      tl.addEventListener('toggle',()=>{if(tl.open) place();});
      ch.addEventListener('click',()=>setTimeout(close,0));
      document.addEventListener('click',e=>{if(tl.open&&!tl.contains(e.target)) close();});
      document.addEventListener('keydown',e=>{if(e.key==='Escape') close();});
      window.addEventListener('scroll',close,{passive:true}); window.addEventListener('resize',close);
    }}
  qsa('.pv-ed').forEach(a=>a.onclick=e=>{e.preventDefault();startForm(9,+a.dataset.ed);});
  qs('#reset').onclick=()=>{loadStage(curStage);cur=null;curPreset=null;touched=false;showReport(0);renderStrip();renderScnBar();};
}

/* ================= 真實表單的操作 ================= */
const rid=(F,k)=>`Report-${F}-${k}`;
const q=(F,k)=>document.getElementById(rid(F,k));
const g=(F,k)=>{const e=q(F,k);return e?e.value:'';};
const sv=(F,k,x)=>{const e=q(F,k); if(e) e.value=x;};
function getT(F,k){
  const d=document.getElementById(rid(F,k)+'-Date'); if(!d) return '';
  const m=d.value.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); if(!m) return '';
  return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}T${document.getElementById(rid(F,k)+'-Hour').value}:${document.getElementById(rid(F,k)+'-Minute').value}`;
}
function setT(F,k,iso){
  const d=document.getElementById(rid(F,k)+'-Date'); if(!d) return;
  const h=document.getElementById(rid(F,k)+'-Hour'), m=document.getElementById(rid(F,k)+'-Minute');
  if(!iso){d.value='';h.value=h.dataset.reset;m.value=m.dataset.reset;return;}
  d.value=iso.slice(0,10).replace(/-/g,'/'); h.value=iso.slice(11,13); m.value=iso.slice(14,16);
}
function getV(F){
  const V={}; VALKEYS[F].forEach(k=>V[k]=g(F,k)); TIMEKEYS[F].forEach(k=>V[k]=getT(F,k)); return V;
}
/* 與現行系統相同：Clear / Now 按鈕 */
window.ClearDate=function(target){
  const m=target.match(/^Report-(\d)-(.+)$/); if(!m) return; const F=+m[1],k=m[2];
  if(k==='ReportTime'&&F!==6||k==='ReportTimeX') setT(F,k,TODAY+'T'+pad(+document.getElementById(target+'-Hour').dataset.reset)+':00'); else setT(F,k,'');
  recalc(); hints(); setTimeout(liveCheck,0);
};
window.SetNowDate=function(target){const m=target.match(/^Report-(\d)-(.+)$/); if(!m) return; setT(+m[1],m[2],NOW); recalc(); hints(); setTimeout(liveCheck,0);};
window.reload=function(){};
window.OpenCoordinatesModal=function(){};
window.ChangeReport1_Oil=function(){recalc();};
window.ChangeReportVessel=function(){};
window.ReportCalculation=function(){recalc();};
window.ChangeReport3_Oil=function(){recalc();};
let silentSwitch=false;
window.SwitchReport=function(){
  if(silentSwitch) return;
  const n=+jQuery('#select2_report_form').val(); if(!n){showReport(0);return;}
  startForm(n===4?7:({2:4,3:3,5:6,6:9}[n]||4));
};
function showReport(n){
  if(n===0){cur=null;curPreset=null;try{renderScnBar();}catch(e){} const dk=document.getElementById('proto-dock'); if(dk){dk.hidden=true;document.body.classList.remove('pv-dock-on');}}
  qsa("div[id^='Report-']").forEach(d=>{ if(/^Report-\d$/.test(d.id)) d.style.display=(d.id==='Report-'+n)?'block':'none'; });
  const sel=jQuery('#select2_report_form'); const idx={0:0,2:2,3:3,4:4,5:5,6:6}[n]; if(idx!==undefined&&sel.val()!=String(idx)){silentSwitch=true; sel.val(String(idx)).trigger('change.select2'); silentSwitch=false;}
}
/* 與現行系統相同的欄位初始化（時間下拉、日期選擇器） */
const PRISTINE={};
function prepareForm(F){
  const root='#Report-'+F;
  jQuery(root+' .time-select-h').each(function(){const t=jQuery(this);t.html('');for(let i=0;i<24;i++)t.append(`<option value="${pad(i)}">${pad(i)}</option>`);t.val(t.data('reset'));});
  jQuery(root+' .time-select-m').each(function(){const t=jQuery(this);t.html('');for(let i=0;i<60;i++)t.append(`<option value="${pad(i)}">${pad(i)}</option>`);t.val(t.data('reset'));});
  jQuery(root+' .pick-single-date').each(function(){
    jQuery(this).daterangepicker({singleDatePicker:true,showDropdowns:true,autoApply:true,autoUpdateInput:false,locale:{format:'YYYY/MM/DD',applyLabel:'確認',cancelLabel:'清除'}})
      .on('apply.daterangepicker',function(e,p){jQuery(this).val(p.startDate.format('YYYY/MM/DD')).trigger('input');})
      .on('cancel.daterangepicker',function(){jQuery(this).val('').trigger('input');});
  });
  if(jQuery.fn.select2) jQuery(root+' .select2-dynamic-option-creation').select2({tags:true,width:'100%'});
}
const defTime=(F,k)=>{
  const h=document.getElementById(rid(F,k)+'-Hour'); const reset=h?+h.dataset.reset:12;
  return (mode==='cur'||F===3||F===1)?`${TODAY}T${pad(reset)}:00`:NOW;
};
function selByText(F,k,re){const e=q(F,k); if(!e) return; const o=[...e.options].find(o=>re.test(o.text)); if(o) e.value=o.value;}
function initVals(t,editId){
  const F=FM[t], L=prevRep(), dep=lastOf(7), ar=lastOf(4);
  sv(F,'ShipName','示範輪'); sv(F,'MasterName','（示範）');
  sv(F,'PortName',ar?(ar.cond===1?'台中港':'高雄港'):''); sv(F,'VoyageName',L?L.voyage:'');
  if(F!==6) setT(F,'ReportTime',defTime(F,'ReportTime'));
  if(F===2){
    if(dep){ sv(F,'ROB_FO_COSP_LastPort',dep.fo??''); sv(F,'ROB_DO_COSP_LastPort',dep.do_??''); const co=dep.co||{}; ['MECYO','MESYLO','AESYLO','FW'].forEach(c=>sv(F,'ROB_'+c+'_COSP_LastPort',co[c]??'')); }   // 現行系統：自動帶入上一份船報的定速航行存量（六項）
    ['FO','DO','MECYO','MESYLO','AESYLO','FW'].forEach(c=>{const e=q(F,'ROB_'+c+'_COSP_LastPort'); if(e) e.readOnly=true;});
    if(mode==='cur'&&ar){sv(F,'DailyConsumption_FO_Sailing',ar.avg_fo);sv(F,'DailyConsumption_DO_Sailing',ar.avg_do);}
  }
  if(F===4){
    sv(F,'ReportType',t); sv(F,'NextPort',dep?dep.nextPort:'');
    const c=t===10?(ar?ar.cond:1):(role()==='卸貨港'?2:role()==='裝貨港'?1:(L?L.cond:1));
    sv(F,'VesselCondition',c);
    const lastAny=[...hist].sort((a,b)=>a.time<b.time?-1:1).pop();
    if(t===7&&lastAny&&lastAny.type===10&&lastAny.cg){   // 離港報前一份是完工報：直接帶入完工報的資料
      const cg=lastAny.cg;
      setT(F,'CWCM',cg.cwcm); sv(F,'CWCM-Type',cg.cwcmT); setT(F,'CWCP',cg.cwcp); sv(F,'CWCP-Type',cg.cwcpT);
      sv(F,'TotalCargo-Type',cg.tType); sv(F,'TotalCargo',cg.total); sv(F,'TotalCargo-Unit',cg.unit); sv(F,'TotalCargo-PCS',cg.pcs); sv(F,'CargoName',cg.name);
      CARRY_T.forEach(k=>{ if(k!=='CWCM'&&k!=='CWCP'&&lastAny.t&&lastAny.t[k]) setT(F,k,lastAny.t[k]); });   // 開航時間紀錄也直接帶入完工報的資料
      if(lastAny.nextPort) sv(F,'NextPort',lastAny.nextPort);
    }
    autoOpening();
  }
  if(F===3){
    sv(F,'VesselCondition1',L?L.cond:1);
    if(mode==='cur'){const r=lastRef(null); sv(F,'FO_Consumption',r.fo??''); sv(F,'DO_Consumption',r.do_??'');}
    else{ OILS.forEach(c=>sv(F,'ROB_'+c,'')); selByText(3,'VesselCondition2',role()==='裝貨港'?/Loading/:/Discharging/);
      const ld=lastDaily(null);   // 主機汽缸油、主機系統油、輔機系統油、淡水：預先帶入上一份日電報或抵港報的存量
      if(ld) ['MECYO','MESYLO','AESYLO','FW'].forEach(c=>sv(F,'ROB_'+c,ld.stk[c]??''));
      else toast('找不到上一份日電報或抵港報：無法帶入存量，也無法計算前 24 小時耗量，請確認船報順序'); }
  }
  if(F===1){
    sv(F,'ReportType',2);
    // 現行系統：船位、航向、航速、轉速、目的港、預計抵達時間由 VDR／AIS 自動帶入
    sv(F,'Longitude-Degree',120); sv(F,'Longitude-Minute',5); sv(F,'Latitude-Degree',22); sv(F,'Latitude-Minute',40);
    sv(F,'Course',185); sv(F,'AverageSpeed',11.5); sv(F,'RPM',90); sv(F,'PortName','台中港'); setT(F,'NextPortETA','2026-10-30T18:00');
    // 現行：日航程、每日航行時間、已跑航程、距離下一港，由系統依 VDR 軌跡自動帶入
    sv(F,'RunningDistance_Day',277.2); sv(F,'RunningDistance_Hour',24); sv(F,'TotalDistance',575.0); sv(F,'BalanceDistance',63.3);
    sv(F,'VesselCondition',L?L.cond:1); sv(F,'VoyageName',L?L.voyage:'');
    const r1=lastRef(null); ['FO','DO'].forEach(c=>{const x=c==='FO'?r1.fo:r1.do_; const e=q(F,'ROB_'+c); if(e&&x!=null) e.placeholder='上一份：'+f1(x);});
  }
  if(F===5) sv(F,'VesselCondition',L?L.cond:1);
  if(F===6){
    setT(F,'ReportTimeX',defTime(F,'ReportTimeX')); sv(F,'VesselCondition1',L?L.cond:1);
    if(editId){const r=hist.find(x=>x.id===editId); setT(F,'ReportTimeX',mode==='cur'?TODAY+'T12:00':r.time); setT(F,'ReportTime',r.event); sv(F,'ReportType',r.evType); sv(F,'VoyageName',r.voyage); sv(F,'VesselCondition1',r.cond);}
  }
  if(mode==='pro'){
    if(F===3) OILS.forEach(c=>{const e=q(F,c+'_Consumption'); if(e) e.readOnly=true;});
  }
}
/* 在真實欄位上加上標註 */
function ctlDivOf(F,k){
  const ctl=document.getElementById(rid(F,k))||document.getElementById(rid(F,k)+'-Date'); if(!ctl) return null;
  let node=ctl;
  while(node&&node.id!=='Report-'+F){
    const prev=node.previousElementSibling;
    if(prev&&prev.querySelector&&(prev.querySelector('label')||prev.tagName==='LABEL')) return {ctl:node,lab:prev};
    node=node.parentElement;
  }
  const lab=document.querySelector(`#Report-${F} label[for="${ctl.id}"]`);
  return lab?{ctl:lab.parentElement,lab:lab.parentElement}:null;
}
function annotate(F){
  const adj=ADJ[F]||{}, root=document.getElementById('Report-'+F);
  qsa(`#Report-${F} .mk,#Report-${F} .pv-star`).forEach(e=>e.remove());
  qsa(`#Report-${F} .proto-adjf`).forEach(e=>e.classList.remove('proto-adjf','proto-lab'));
  Object.entries(adj).forEach(([k,a])=>{
    if(a.keep) return;
    const pair=ctlDivOf(F,k); if(!pair) return;
    const label=pair.lab.querySelector('label')||pair.lab;
    const word=a.tag==='修 bug'?'修正（現行 bug）':((a.tag==='新增檢查'||a.tag==='規則')?'新增檢查':'調整：'+a.tag.replace('＋',' ＋ '));
    [pair.lab,pair.ctl].forEach(e=>e.classList.add('proto-adjf')); pair.lab.classList.add('proto-lab');
    let html=`<span class="mk" data-cur="${esc(a.cur||'沒有檢查')}" data-pro="${esc(a.pro)}">${word}</span>`;
    if(/必填|不能 0 或空白/.test(a.pro)) html='<span class="pv-star">*</span>'+html;
    const en=label.querySelector('.en');
    if(en) en.insertAdjacentHTML('beforebegin',html); else label.insertAdjacentHTML('beforeend',html);
  });
}
let lastToast=0;
function toast(msg){
  const now=Date.now(); if(now-lastToast<400) return; lastToast=now;
  qsa('.pv-toast').forEach(e=>e.remove());
  const d=document.createElement('div'); d.className='pv-toast'; d.textContent=msg; document.body.appendChild(d); setTimeout(()=>d.remove(),4500);
}
function hint(F,k,text){
  const e=q(F,k);
  if(e&&e.tagName==='INPUT'&&/^ROB_/.test(k)){ e.placeholder=text.replace(/^上一份（[^）]*）：/,'上一份：').replace(/，請重新量測填入$/,''); return; }
  if(text) toast(text);
}
function flash(el){ if(!el) return; el.classList.remove('pv-flash'); void el.offsetWidth; el.classList.add('pv-flash'); setTimeout(()=>el.classList.remove('pv-flash'),2200); }
function focusField(F,key){
  let el=null;
  if(key[0]==='#') el=document.querySelector(key); else { const pr=ctlDivOf(F,key); if(pr){ const fs=pr.ctl.closest('fieldset'); if(fs) fs.classList.remove('proto-col'); el=pr.ctl; } }
  if(!el) return; el.scrollIntoView({behavior:'smooth',block:'center'}); flash(el);
  if(key[0]!=='#'){ const pr=ctlDivOf(F,key); if(pr) flash(pr.lab); }
}
const dm=(d,m)=>(num(d)==null||num(m)==null)?null:num(d)+num(m)/60;
function distNM(la1,lo1,la2,lo2){const R=3440.065,t=Math.PI/180,dl=(la2-la1)*t,dn=(lo2-lo1)*t;const a=Math.sin(dl/2)**2+Math.cos(la1*t)*Math.cos(la2*t)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
function recalc(){
  if(!cur) return; const F=cur.F;
  if(F===2){
    const ev=lastEvt||'';
    OILS.forEach(c=>{
      // 現行：結束定速航行存量 → 自動帶入下錨存量
      if(ev==='Report-2-ROB_'+c+'_EOSP') sv(F,'ROB_'+c+'_DD',g(F,'ROB_'+c+'_EOSP'));
      // 起錨／備俥存量 → 主機停俥存量帶入
      //   現行：起錨優先，而且每次都蓋掉船員手填的停俥存量
      //   調整：最晚階段（備俥優先）；停俥存量空白或還是自動帶入的值才帶入，船員手填的不蓋掉
      if(ev==='Report-2-ROB_'+c+'_AC'||ev==='Report-2-ROB_'+c+'_RSE'){
        const rse=g(F,'ROB_'+c+'_RSE'), ac=g(F,'ROB_'+c+'_AC'), fe=q(F,'ROB_'+c+'_FWE');
        if(mode==='cur') sv(F,'ROB_'+c+'_FWE',ac!==''?ac:rse);
        else if(fe&&(fe.value===''||fe.value===fe.dataset.auto)){const v=rse!==''?rse:ac; fe.value=v; fe.dataset.auto=v;}
      }
    });
    // 現行：航程時間＝結束定速航行時間 − 上一份離港報的開始定速航行時間
    const dep=lastOf(7), eo=getT(F,'EOSP');
    if(dep&&dep.t&&dep.t.COSP&&eo){const h=(new Date(eo)-new Date(dep.t.COSP))/36e5; sv(F,'SeaPassage_TotalTime',h>0?(Math.round(h*100)/100).toFixed(2):'');}
    // 現行：等泊時間＝起錨 − 下錨；等泊總耗油＝下錨存量 − 主機停俥存量；平均＝總耗油 ÷ 時間 × 24
    const d1=getT(F,'Drifting'), d2=getT(F,'AnchorAweigh'), wh=(d1&&d2)?(new Date(d2)-new Date(d1))/36e5:null;
    sv(F,'TotalTime_Waiting',wh>0?(Math.round(wh*100)/100).toFixed(2):'');
    ['FO','DO'].forEach(c=>{
      // 等泊總耗油：現行＝下錨存量 − 主機停俥存量（停俥存量可手改，與起錨不同時就被改變）
      //            調整＝依序判斷（客戶 11/11、11/12 確認）：沒下錨（缺下錨或起錨時間）→ 0；
      //                  有填起錨 → 下錨 − 起錨；沒填起錨 → 下錨 − 備俥存量並標示「估算」；
      //                  備俥也沒填或下錨沒填 → 留空並提示；算出負數 → 留空並提示檢查；停俥存量不參與
      const dd=num(g(F,'ROB_'+c+'_DD')), fw=num(g(F,'ROB_'+c+'_FWE')), ac=num(g(F,'ROB_'+c+'_AC')), rs=num(g(F,'ROB_'+c+'_RSE'));
      let tw=null, est=false, ph='缺少必要計算資料';
      if(mode==='cur') tw=(dd!=null&&fw!=null)?dd-fw:null;
      else if(!d1||!d2) tw=0;
      else if(wh>0&&dd!=null){
        const e=ac!=null?ac:rs;
        if(e==null) ph='請填起錨時存量';
        else{ tw=dd-e; est=(ac==null); if(tw<0){tw=null; est=false; ph='存量有誤，請檢查';} }
      }
      const twe=q(F,'TotalConsumption_'+c+'_Waiting');
      if(twe){
        twe.placeholder=ph;
        let tag=twe.parentNode.querySelector('.proto-est');
        if(est&&!tag){
          tag=document.createElement('span'); tag.className='proto-est'; tag.textContent='估算';
          tag.title='起錨存量未填，以「下錨 − 備俥存量」估算；請補填起錨存量';
          tag.style.cssText='margin-left:6px;padding:1px 8px;border-radius:9px;font-size:.75rem;background:#fff3cd;color:#8a6d00;border:1px solid #e0c36a;white-space:nowrap';
          twe.insertAdjacentElement('afterend',tag);
        } else if(!est&&tag) tag.remove();
      }
      sv(F,'TotalConsumption_'+c+'_Waiting',tw==null?'':f1(tw)); sv(F,'DailyConsumption_'+c+'_Waiting',(tw!=null&&tw!==0&&wh>0)?(tw/wh*24).toFixed(2):'');
      // 現行：航程總耗油＝上港完車存量 − 結束定速航行存量；平均油耗＝總耗油 ÷ 航程時間 × 24
      const a=num(g(F,'ROB_'+c+'_EOSP')), b=num(g(F,'ROB_'+c+'_COSP_LastPort')), t=(a!=null&&b!=null)?b-a:null;
      sv(F,'TotalConsumption_'+c,t==null?'':f1(t));
      const h=num(g(F,'SeaPassage_TotalTime')), ae=q(F,'DailyConsumption_'+c+'_Sailing'); if(ae) ae.value=(t!=null&&h>0)?(t/h*24).toFixed(2):'';
    });
    const h=num(g(F,'SeaPassage_TotalTime')), d=num(g(F,'SeaPassage_TotalDistance')); sv(F,'AverageSpeed',(h>0&&d!=null)?(d/h).toFixed(2):'');
  }
  if(F===1){
    // 現行：前 24 小時耗量＝上一份船報的存量 − 這份存量
    const r=lastRef(null);
    [['FO',r.fo],['DO',r.do_]].forEach(([c,last])=>{const e=q(F,c+'_Consumption'); const s=num(g(F,'ROB_'+c)); if(e&&s!=null&&last!=null) e.value=f1(last-s);});
  }
  if(F===3){
    // 現行：前 24 小時耗量＝上一份船報（日電報或抵港報）的存量 − 這份存量；六種油水都算
    const ld=lastDaily(null);
    OILS.forEach(c=>{const e=q(F,c+'_Consumption'); if(!e) return; const s=num(g(F,'ROB_'+c)), last=ld?num(ld.stk[c]):null; e.value=(s!=null&&last!=null)?f1(last-s):'';});
  }
  if(F===6){
    // 現行：耗量總計＝事發時存量（左）− 重新起航時存量（右）
    OILS.forEach(c=>{const e=q(F,'ROB_'+c+'_Consumption'); if(!e) return; const a=num(g(F,'ROB_'+c)), b=num(g(F,'ROB_'+c+'2')); e.value=(a!=null&&b!=null)?f1(a-b):'';});
  }
  if(F===4){
    // 現行：總作業時間＝完裝／完卸時間與開裝／開卸時間的差
    const a=getT(4,'CWCM'), b=getT(4,'CWCP');
    sv(4,'Total_Working_Hour',(a&&b)?Math.abs((new Date(b)-new Date(a))/36e5).toFixed(2):'');
    // 現行：作業總耗量＝開工存量＋本港補給−離泊位存量；平均耗量＝總耗量÷總作業時間×24
    const wk=num(g(4,'Total_Working_Hour'));
    ['FO','DO'].forEach(c=>{
      const s0=num(g(4,'CommencedWorking_ROB_'+c)), s1=num(g(4,'CompletedWorking_ROB_'+c)), sp=num(g(4,'PortSupply_'+c))||0;
      const tc=(s0!=null&&s1!=null)?s0+sp-s1:null;
      sv(4,'TotalConsumption_'+c,tc==null?'':f1(tc)); sv(4,'AverageConsumption_'+c,(tc!=null&&wk>0)?(tc/wk*24).toFixed(2):'');
    });
    // 調整：開工時間一變，開工存量依規則重新帶入
    if(/CWCM-(Date|Hour|Minute)$/.test(lastEvt||'')) autoOpening();
  }
}
function hints(auto=true){
  if(!cur||mode!=='pro') return; const F=cur.F, V=getV(F), t=cur.type, a=lastOf(4), comp=hasCompletion(), ref=lastRef(null);
  if(F===3) ['FO','DO'].forEach(c=>{const x=c==='FO'?ref.fo:ref.do_; if(x!=null) hint(F,'ROB_'+c,'上一份（'+TN[ref.rep.type]+' '+fmt(ref.rep.time)+'）：'+f1(x)+' 噸，請重新量測填入');});
  if(F===2&&lastOf(7)) hint(F,'ROB_FO_COSP_LastPort','上一份離港報：'+f1(num(lastOf(7).fo_alt))+' 噸');
  if(F===4&&t===7){
    if(a&&a.cond===1&&+V.VesselCondition===2&&comp){ if(auto&&(V.VoyageName===a.voyage||V.VoyageName==='')){sv(F,'VoyageName',String(+a.voyage+1));} hint(F,'VoyageName','已有完工報、卸貨港離港（空載），航次號依規則換成 '+(+a.voyage+1)); }
    else if(a&&+V.VesselCondition===2&&!comp) hint(F,'VoyageName','抵港報是重載、離港報是空載，但還沒有完工報');
  }
}

/* ================= 檢查 ================= */
function rec(type,V){
  const c=+V.VesselCondition||+V.VesselCondition1||0;
  if(type===4){const lat=(cc)=>{for(const s of ['FWE','RSE','AC','DD','EOSP']){if(num(V['ROB_'+cc+'_'+s])>0) return V['ROB_'+cc+'_'+s];} return '';};
    return {type:4,stk:{FO:V.ROB_FO_FWE,DO:V.ROB_DO_FWE,MECYO:V.ROB_MECYO_FWE,MESYLO:V.ROB_MESYLO_FWE,AESYLO:V.ROB_AESYLO_FWE,FW:V.ROB_FW_FWE},stkT:V.FEW,time:V.ReportTime,voyage:V.VoyageName,cond:c,eosp_fo:V.ROB_FO_EOSP,eosp_do:V.ROB_DO_EOSP,fo:lat('FO'),do_:lat('DO'),cosp_fo:V.ROB_FO_COSP_LastPort,cosp_do:V.ROB_DO_COSP_LastPort,hours:V.SeaPassage_TotalTime,avg_fo:V.DailyConsumption_FO_Sailing,avg_do:V.DailyConsumption_DO_Sailing,dF:V.Arrive_Draft_F,dM:V.Arrive_Draft_M,dA:V.Arrive_Draft_A};}
  if(type===7||type===10){const t={};CARRY_T.forEach(k=>t[k]=V[k]); return {type,cs:{FO:V.CommencedWorking_ROB_FO,DO:V.CommencedWorking_ROB_DO,MECYO:V.CommencedWorking_ROB_MECYO,MESYLO:V.CommencedWorking_ROB_MESYLO,AESYLO:V.CommencedWorking_ROB_AESYLO,FW:V.CommencedWorking_FW},cg:{cwcm:V.CWCM,cwcmT:V['CWCM-Type'],cwcp:V.CWCP,cwcpT:V['CWCP-Type'],total:V.TotalCargo,tType:V['TotalCargo-Type'],unit:V['TotalCargo-Unit'],pcs:V['TotalCargo-PCS'],name:V.CargoName},time:V.ReportTime,voyage:V.VoyageName,cond:c,co:{MECYO:V.COSP_ROB_MECYO,MESYLO:V.COSP_ROB_MESYLO,AESYLO:V.COSP_ROB_AESYLO,FW:V.COSP_FW},fo:V.COSP_ROB_FO,fo_alt:V.CompletedWorking_ROB_FO,do_:V.COSP_ROB_DO,do_alt:V.CompletedWorking_ROB_DO,start_fo:V.CommencedWorking_ROB_FO,supply_fo:V.PortSupply_FO,nextPort:V.NextPort,cargo:V.TotalCargo,lsfo:V.LSFO_BunkeringCommenced,t};}
  if(type===2) return {type:2,time:V.ReportTime,voyage:V.VoyageName,cond:c,fo:V.ROB_FO,do_:V.ROB_DO,speed:V.AverageSpeed,hours:V.RunningDistance_Hour,runDist:V.RunningDistance_Day,balance:V.BalanceDistance,lonD:V['Longitude-Degree'],lonM:V['Longitude-Minute'],latD:V['Latitude-Degree'],latM:V['Latitude-Minute'],eta:V.NextPortETA};
  if(type===3) return {type:3,stk:{FO:V.ROB_FO,DO:V.ROB_DO,MECYO:V.ROB_MECYO,MESYLO:V.ROB_MESYLO,AESYLO:V.ROB_AESYLO,FW:V.ROB_FW},time:V.ReportTime,voyage:V.VoyageName,cond:c,work:V.VesselCondition2,fo:V.ROB_FO,do_:V.ROB_DO};
  if(type===6) return {type:6,time:V.ReportTime,voyage:V.VoyageName,cond:c};
  return {type:9,stk:{FO:V.ROB_FO,DO:V.ROB_DO,MECYO:V.ROB_MECYO,MESYLO:V.ROB_MESYLO,AESYLO:V.ROB_AESYLO,FW:V.ROB_FW},stkT:V.ReportTime,time:V.ReportTimeX,event:V.ReportTime,evType:V.ReportType,voyage:V.VoyageName,cond:c};
}
function recentRate(excl){
  const l=[...hist].filter(x=>x.id!==excl&&x.type!==9&&stockFO(x)!=null).sort((a,b)=>a.time<b.time?-1:1);
  if(l.length<2) return null; const a=l[l.length-2], b=l[l.length-1], h=(new Date(b.time)-new Date(a.time))/36e5;
  return h>0?(stockFO(a)-stockFO(b))/h*24:null;
}
function validate(type,r,editId,V){
  const out=[]; const B=(m,k)=>out.push({l:'B',m,k}), W=(m,k)=>out.push({l:'W',m,k});
  const prev=prevRep(editId), ar=lastOf(4), dep=lastOf(7), st=lastRef(editId);
  const TK=type===9?'ReportTimeX':'ReportTime';
  if(!r.time) B('發報時間必填',TK);
  else{
    if(prev&&r.time<prev.time) W('發報時間比上一份報表（'+fmt(prev.time)+'）還早；若是補資料請確認時間正確',TK);
    else if(type!==3&&!editId&&Math.abs(new Date(NOW)-new Date(r.time))/36e5>3) W('發報時間和現在相差超過 3 小時'+(r.time>NOW?'（比現在還晚）':'')+'；若是補資料請確認時間正確',TK);
    if(type===3&&!r.time.endsWith('08:00')) W('日電報發報時間固定 08:00',TK);
    const ev=[V.POB,V.TugLeft,V.DOP].filter(Boolean);
    if(ev.some(x=>x>r.time)) B('發報時間比報表裡最晚的事件時間還早',TK);
  }
  if(type!==9&&!String(r.voyage).trim()) B('航次號空白','VoyageName');
  const pos=(x,l,k)=>{if(!(num(x)>0)) B(l+'不能是 0 或空白',k);};
  const comp=()=>hasCompletion();
  if(type===4){
    pos(r.eosp_fo,'海上航行結束重油存量','ROB_FO_EOSP');pos(r.eosp_do,'海上航行結束輕油存量','ROB_DO_EOSP');
    pos(r.cosp_fo,'上港完車重油存量（上一份離港報的定速航行存量）','ROB_FO_COSP_LastPort');pos(r.cosp_do,'上港完車輕油存量','ROB_DO_COSP_LastPort');
    if(!(num(r.hours)>0)) B('定速航行總時間必填，才能算平均油耗','SeaPassage_TotalTime');
    chainEval(V).issues.forEach(i=>out.push(i));
    if(dep&&r.voyage!==dep.voyage) W('航次號和前一份離港報（'+dep.voyage+'）不同；抵港報不換航次號','VoyageName');
    if(!(num(r.avg_fo)>0)) B('平均重油油耗是空白、0 或負數（請檢查存量有沒有填錯），系統無法計算','DailyConsumption_FO_Sailing');
    if(!r.dF||!r.dM||!r.dA) W('抵港吃水（船首、船中、船尾）有空白','Arrive_Draft_F');
  }
  if(type===7||type===10){
    // 補給與離泊位存量：六種油水都核對（開工存量 ＋ 補給 ≈ 離泊位存量）
    OILS.forEach(c=>{
      const zh=OIL_ZH[c], dp=num(V['CompletedWorking_ROB_'+c]), sp=num(V['PortSupply_'+c]), s0=num(V[c==='FW'?'CommencedWorking_FW':'CommencedWorking_ROB_'+c]);
      const kD='CompletedWorking_ROB_'+c, kP='PortSupply_'+c;
      if(c==='FO'||c==='DO'){ if(!(dp>0)) B('離泊位'+zh+'存量不能是 0 或空白',kD); } else if(dp==null) W('離泊位'+zh+'存量空白',kD);
      if(sp>0){
        if(dp==null||s0==null) W(zh+'補給 '+f1(sp)+' 噸，但開工或離泊位存量缺少，無法核對',kP);
        else{ const inc=dp-s0;
          if(inc<sp-Math.max(0.3,0.05*sp)) W(zh+'補給 '+f1(sp)+' 噸，離泊位存量只比開工多 '+f1(inc)+' 噸',kD);
          else if(inc>sp+1) W(zh+'離泊位存量比「開工存量＋補給」還多 '+f1(inc-sp)+' 噸',kD); }
      } else if(dp!=null&&s0!=null&&dp-s0>Math.max(0.5,0.02*s0)) W(zh+'離泊位存量（'+f1(dp)+'）比開工（'+f1(s0)+'）多，但補給量是 0',kD);
      else if(dp!=null&&s0!=null&&s0-dp>Math.max(5,0.15*s0)) W(zh+'離泊位存量比開工少 '+f1(s0-dp)+' 噸，港內用量偏多',kD);
    });
    if(num(V.PortSupply_DO)>0&&!V.MGO_BunkeringCommenced) W('有輕油補給量，卻沒填加油開始、結束時間','MGO_BunkeringCommenced');
    OILS.forEach(c=>{   // 離泊位 → 備俥 → 定速航行：補給只在港內，之後存量不會增加
      const seq=[['離泊位',V['CompletedWorking_ROB_'+c],'CompletedWorking_ROB_'+c],['備俥',V['RSE_ROB_'+c],'RSE_ROB_'+c],['定速航行',c==='FW'?V.COSP_FW:V['COSP_ROB_'+c],c==='FW'?'COSP_FW':'COSP_ROB_'+c]];
      if(num(V['PortSupply_'+c])>0) return;   // 補給與存量對不上已在上面提醒
      let pv=null,pn=''; seq.forEach(([n,v,k])=>{const x=num(v); if(x==null) return; if(pv!=null&&x>pv+0.05) W(OIL_ZH[c]+n+'存量（'+f1(x)+'）比「'+pn+'」（'+f1(pv)+'）還多；補給只在港內，離泊位之後存量不會增加',k); else{pv=x;pn=n;}});
    });
    {const SEQ=[['RSE','備俥'],['ESB','機器備便'],['POB','引水登船'],['TugAttended','拖輪協助'],['COAA','離泊位或起錨'],['TugCastOff','拖輪纜繩解掉'],['DOP','引水離船'],['TugLeft','拖輪離開'],['COSP','開始定速航行']];
      let pT=null,pN=''; SEQ.forEach(([k,n])=>{const tt=V[k]; if(!tt) return; if(pT&&tt<pT) W(n+'（'+fmt(tt)+'）比「'+pN+'」（'+fmt(pT)+'）還早；開航時間要依序填寫',k); else{pT=tt;pN=n;}});}
    if(type===7){ pos(r.fo,'定速航行重油存量（COSP）','COSP_ROB_FO'); pos(r.do_,'定速航行輕油存量（COSP）','COSP_ROB_DO');
      if(!V.NextPort||!V.NextPortETA) B('下一港與預計抵達時間必填','NextPortETA'); else if(V.NextPortETA<=r.time) B('預計抵達時間比發報時間早','NextPortETA'); }
    const LAB={CWCM:'開裝／開卸',CWCP:'完裝／完卸',COAA:'離泊位或起錨',NextPortETA:'下一港預計抵達',RSE:'備俥',ESB:'機器備便',POB:'引水登船',TugAttended:'拖輪協助',TugCastOff:'拖輪纜繩解掉',DOP:'引水離船',TugLeft:'拖輪離開',COSP:'開始定速航行'};
    const same=dep&&dep.id!==editId?CARRY_T.filter(k=>V[k]&&V[k]===dep.t[k]):[];
    if(type===7&&same.length) W('有 '+same.length+' 個時間欄位和上一份離港報完全相同（'+same.map(k=>LAB[k]||k).join('、')+'），疑似帶入後沒改',same.includes('POB')?'POB':same[0]);
    if(ar){
      if(type===7){
        if(ar.cond===1&&r.cond===2){
          if(!comp()) W('抵港報是重載、離港報是空載，表示這個港有卸貨，但找不到完工報','VesselCondition');
          else if(r.voyage===ar.voyage) W('卸貨港離港報（空載）接在完工報之後，航次號應換成下一個（'+(+ar.voyage+1)+'）','VoyageName');
        } else if(r.cond===1&&r.voyage!==ar.voyage) W('裝貨港離港報（重載）不換航次號，目前和抵港報（'+ar.voyage+'）不同','VoyageName');
        if(r.cond===2&&!comp()&&r.voyage!==ar.voyage) W('沒有完工報就換了航次號','VoyageName');
      }
    }
    if(num(r.supply_fo)>0&&!r.lsfo) W('有重油補給量，卻沒填加油開始、結束時間','LSFO_BunkeringCommenced');
    if(type===7&&comp()) pos(r.start_fo,'開工重油存量','CommencedWorking_ROB_FO');
    if(type===10&&!(num(r.start_fo)>0)) W('開工重油存量空白','CommencedWorking_ROB_FO');
    {const rf=openingRef(V.CWCM); if(rf&&num(r.start_fo)>num(rf.stk.FO)+0.5) W('開工重油存量（'+f1(num(r.start_fo))+'）比上一份報表（'+f1(num(rf.stk.FO))+'）還多；開工前不會補油','CommencedWorking_ROB_FO');}
    if(!(num(V.TotalCargo)>0)&&type===10) W('完工報的總貨量是 0','TotalCargo');
  }
  if(type===2){
    pos(r.fo,'重油存量','ROB_FO'); pos(r.do_,'輕油存量','ROB_DO');
    const np=lastOf(2), hrs=num(r.hours), spd=num(r.speed), dist=num(r.runDist), R=recentRate(editId);
    if(r.time&&!r.time.endsWith('12:00')) W('午報發報時間固定 12:00（船鐘時間）','ReportTime');
    if(np&&r.time){const h=(new Date(r.time)-new Date(np.time))/36e5; if(h<20||h>28) W('和上一份船位報相隔 '+f1(h)+' 小時；午報應每天一份','ReportTime');}
    if(st.rep&&num(r.fo)!=null&&st.fo!=null){
      if(num(r.fo)>st.fo) B('重油存量（'+f1(num(r.fo))+'）比上一份（'+f1(st.fo)+'）還多；航行中不會補油','ROB_FO');
      else if(num(r.fo)===st.fo) W('重油存量和上一份完全一樣；航行中不可能一滴油都沒用','ROB_FO');
      else if(R>0){const cons=st.fo-num(r.fo), exp=R*(hrs>0?hrs:24)/24;
        if(cons>1.6*exp) W('這段時間重油用了 '+f1(cons)+' 噸，比最近的日耗（約 '+f1(exp)+' 噸）高很多','ROB_FO');
        else if(cons<0.4*exp&&spd>3) W('這段時間重油只用了 '+f1(cons)+' 噸，比最近的日耗（約 '+f1(exp)+' 噸）低很多','ROB_FO');}
    }
    if(!(num(r.lonD)>0)||!(num(r.latD)>0)) W('船位是空白（自動帶入沒有資料，例如 VDR 沒訊號），請手動填寫','Longitude-Degree');
    if(!r.eta) W('預計抵達下一港時間空白','NextPortETA'); else if(r.eta<=r.time) W('預計抵達時間（AIS）比發報時間早，可能已過期','NextPortETA');
    if(np&&r.voyage!==np.voyage) W('航次號和上一份船位報（'+np.voyage+'）不同','VoyageName');
  }
  if(type===3){
    pos(r.fo,'重油存量','ROB_FO'); pos(r.do_,'輕油存量','ROB_DO');
    if(!lastDaily(editId)) W('找不到上一份日電報或抵港報，無法帶入存量、也無法計算前 24 小時耗量','ROB_FO');
    ['MECYO','MESYLO','AESYLO','FW'].forEach(c=>{ if(num(V['ROB_'+c])==null) W(OIL_ZH[c]+'存量空白','ROB_'+c); });
    if(st.rep&&num(r.fo)===st.fo&&(new Date(r.time)-new Date(st.rep.time))/36e5>=12) W('重油存量和上一份完全一樣，確認有重新量測？','ROB_FO');
    {const ld=lastDaily(editId); if(ld) OILS.forEach(c=>{const cu=num(V['ROB_'+c]), la=num(ld.stk[c]); if(cu!=null&&la!=null&&cu>la+0.05) W(OIL_ZH[c]+'存量（'+f1(cu)+'）比上一份（'+f1(la)+'）還多，前 24 小時耗量會變成負數（'+f1(la-cu)+'）；日電報沒有補給，請確認','ROB_'+c);});}
    if(num(r.do_)===0&&st.do_>0) W('輕油耗量變成整桶（'+f1(st.do_)+' 噸），存量是 0','ROB_DO');
    if(ar){const code=ar.cond===1?'4':'3'; if(['3','4'].includes(r.work)&&r.work!==code) W('作業狀況和港口角色不一致：抵港報是'+COND[ar.cond]+'（'+role()+'），這裡卻填'+(r.work==='3'?'裝貨':'卸貨'),'VesselCondition2');}
    const core=[...hist].reverse().find(x=>[3,4,7,10].includes(x.type)); if(core&&core.type===7&&lastDaily(editId)) W('離港報之後，不應有日電報',TK);
  }
  if(type===9){
    // 事發時或重新起航時油料存量：左邊事發時、右邊重新起航時，每一列兩個數字並排
    const refS=[...hist].filter(x=>x.id!==editId&&x.stk).sort((a,b)=>(a.stkT||a.time)<(b.stkT||b.time)?-1:1).pop();
    let dev=0, filled=0, rightAny=false;
    OILS.forEach(c=>{
      const ev=num(V['ROB_'+c]), rs=num(V['ROB_'+c+'2']), zh=OIL_ZH[c];
      if(rs!=null) rightAny=true; if(ev!=null) filled++;
      if(ev!=null&&rs!=null&&rs>ev+0.05) W(zh+'：重新起航時存量（右 '+f1(rs)+'）比事發時（左 '+f1(ev)+'）還多；事發時填左邊、重新起航時填右邊，請確認沒有左右填反','ROB_'+c);
      const rf=refS?num(refS.stk[c]):null;
      if(ev!=null&&rf!=null&&Math.abs(ev-rf)>Math.max(1.5,0.4*rf)){ dev++; W(zh+'：事發時存量 '+f1(ev)+' 和最近一份報表（'+f1(rf)+'）差很多，是否把數字填在下一列？','ROB_'+c); }
    });
    if(dev>=2) W('有 '+dev+' 項存量和最近一份報表差很多，疑似一路往下填。事發時（左）、重新起航時（右）要「左右」並排填寫，同一種油水的兩個數字在同一列','ROB_FO');
    if(r.event&&r.time&&r.event>r.time) B('事件發生時間不能比發報時間晚','ReportTime');
    if(editId){const o=hist.find(x=>x.id===editId); if(o&&o.time!==r.time) W('發報時間（'+fmt(r.time)+'）和原本儲存的（'+fmt(o.time)+'）不同','ReportTimeX');}
  }
  return out;
}
/* ================= 存量連鎖：抵港前後各階段的存量要「依時間遞減」 ================= */
const CH=[
 {id:'COSP',zh:'上一港 開始定速航行（COSP）',fo:'ROB_FO_COSP_LastPort',dv:'ROB_DO_COSP_LastPort',tk:null},
 {id:'EOSP',zh:'結束定速航行（EOSP）',fo:'ROB_FO_EOSP',dv:'ROB_DO_EOSP',tk:'EOSP'},
 {id:'DD',zh:'下錨／漂航',fo:'ROB_FO_DD',dv:'ROB_DO_DD',tk:'Drifting',opt:1},
 {id:'AC',zh:'起錨／結束漂航',fo:'ROB_FO_AC',dv:'ROB_DO_AC',tk:'AnchorAweigh',opt:1},
 {id:'RSE',zh:'備俥（RSE）',fo:'ROB_FO_RSE',dv:'ROB_DO_RSE',tk:'RSE'},
 {id:'FWE',zh:'主機停俥（FWE）',fo:'ROB_FO_FWE',dv:'ROB_DO_FWE',tk:'FEW'}
];
function chainEval(V){
  const dep=lastOf(7), issues=[], rows=[];
  const B=(m,k)=>issues.push({l:'B',m,k}), W=(m,k)=>issues.push({l:'W',m,k});
  let prev=null, R=null;
  CH.forEach(e=>{
    const fo=num(V[e.fo]), dv=num(V[e.dv]), t=e.id==='COSP'?((dep&&dep.t&&dep.t.COSP)||''):(V[e.tk]||'');
    if(e.opt&&fo==null&&dv==null&&!t) return;
    if(e.id==='DD'&&!t&&fo!=null&&fo===num(V[CH[1].fo])) return;   // 下錨存量是結束定速航行自動帶入的，沒下錨就略過
    const row={e,t,fo,dv,hours:null,dfo:null,ddv:null,rate:null,st:'',msg:''};
    if(e.id!=='COSP'){
      if(fo!=null&&!t){W(e.zh+'有存量，卻沒有填對應的時間',e.tk);row.st='warn';row.msg='缺時間';}
      if(t&&fo==null){W(e.zh+'有時間，卻沒有填存量',e.fo);row.st='warn';row.msg='缺存量';}
      if(fo===0&&e.id!=='EOSP'){B(e.zh+'的重油存量是 0',e.fo);row.st='bad';row.msg='存量 0';}
    }
    if(prev&&fo!=null&&prev.fo!=null){
      row.dfo=fo-prev.fo; row.ddv=(dv!=null&&prev.dv!=null)?dv-prev.dv:null;
      if(t&&prev.t) row.hours=(new Date(t)-new Date(prev.t))/36e5;
      if(row.hours!=null&&row.hours<0){B(e.zh+'的時間比「'+prev.e.zh+'」還早',e.tk);row.st='bad';row.msg='時間順序顛倒';}
      if(row.dfo>0.05){B(e.zh+'的重油存量（'+f1(fo)+'）比「'+prev.e.zh+'」（'+f1(prev.fo)+'）還多；航行或等泊中不會補油',e.fo);row.st='bad';row.msg='存量增加';}
      if(row.ddv!=null&&row.ddv>0.05) W(e.zh+'的輕油存量比「'+prev.e.zh+'」還多',e.dv);
      if(row.hours>0) row.rate=-row.dfo/row.hours*24;
      if(e.id==='EOSP'&&row.rate!=null&&row.rate>0) R=row.rate;
      if(row.st!=='bad'&&row.rate!=null){
        if(e.id==='EOSP'){ if(row.dfo===0&&row.hours>6){W('航行 '+f1(row.hours)+' 小時，重油存量完全沒變（疑似照抄上一份）',e.fo);row.st='warn';row.msg='存量沒變';} }
        else if(R){ const lim=(e.id==='AC'?0.6:1.6)*R;
          if(row.rate>lim){W(e.zh+'：相隔 '+f1(row.hours)+' 小時重油用了 '+f1(-row.dfo)+' 噸，折算每天 '+f1(row.rate)+' 噸，比航行平均（'+f1(R)+'）高很多'+(e.id==='AC'?'（等泊時主機不是全速）':''),e.fo);row.st='warn';row.msg='折算偏高';} }
      }
      if(!row.st) row.st='ok';
    }
    rows.push(row);
    if(fo!=null) prev={e,fo,dv,t};
  });
  return {rows,issues,R};
}
function renderChain(F,V){
  qsa('#proto-chain-wrap,#proto-chain').forEach(e=>e.remove());
  if(F!==2||mode!=='pro') return;
  const host=qsa('#Report-2 fieldset').find(fs=>fs.querySelector('legend').textContent.includes('主機停俥油料資訊')); if(!host) return;
  const c=chainEval(V), sym={ok:'正常',bad:'錯誤',warn:'請確認',}, d=n=>n==null?'—':(n>0?'+':'')+f1(n);
  const tm=t=>t?t.slice(5,16).replace('-','/').replace('T',' '):'—';
  const rowsHtml=c.rows.map(r=>`<tr><td>${r.e.zh}</td><td>${tm(r.t)}</td><td class="n">${r.fo==null?'—':f1(r.fo)}</td><td class="n">${d(r.dfo)}</td><td class="n">${r.dv==null?'—':f1(r.dv)}</td><td class="n">${d(r.ddv)}</td><td class="n">${r.hours==null?'—':f1(r.hours)}</td><td class="n">${r.rate==null?'—':f1(r.rate)}</td><td class="st ${r.st}">${r.st?sym[r.st]+(r.msg&&r.st!=='ok'?'：'+r.msg:''):'—'}</td></tr>`).join('');
  const div=document.createElement('div'); div.id='proto-chain'; div.className='proto-chain';
  div.classList.add('proto-adjf');
  div.innerHTML=`<div class="pc-h">存量連鎖核對<span class="mk" data-cur="沒有這張表；存量有沒有填對，只能靠船員自己檢查" data-pro="依船員填的時間與存量，自動核對六個階段的存量是否依時間遞減、折算每天耗油是否合理；船員只要看最右邊的「判定」欄">新增表格</span><span>系統依上面填的時間與存量自動算，船員只要看最右邊「判定」</span></div>
   <table><tr><th>階段（依時間順序）</th><th>時間</th><th class="n">重油存量</th><th class="n">重油差</th><th class="n">輕油存量</th><th class="n">輕油差</th><th class="n">相隔(時)</th><th class="n">折算重油(噸/日)</th><th>判定</th></tr>${rowsHtml}</table>
   <div class="pc-n">規則：存量要照時間遞減（沒有補油）；下錨到起錨是等泊，主機不是全速，折算每天耗油應遠低於航行平均${c.R?'（本航段航行平均 '+f1(c.R)+' 噸／日）':''}；沒有下錨就不用填下錨、起錨兩區。</div>`;
  // 放在欄位網格的「整排全寬」位置，不放進單一欄位裡
  const col=host.closest('[class*="col-"]')||host;
  const wrap=document.createElement('div'); wrap.className='col-12'; wrap.id='proto-chain-wrap'; wrap.appendChild(div);
  col.insertAdjacentElement('afterend',wrap);
}
function mark(F,list){
  qsa('.proto-err,.proto-warn,.proto-miss').forEach(e=>{e.classList.remove('proto-err','proto-warn','proto-miss');e.removeAttribute('data-msg');});
  let first=null; const seen={};
  list.forEach(i=>{const pair=ctlDivOf(F,i.k); if(!pair) return;
    const cls=mode==='cur'?'proto-miss':(i.l==='B'?'proto-err':'proto-warn');
    const prev=seen[i.k]; if(prev&&(prev==='B'||i.l!=='B')) return; seen[i.k]=i.l;
    pair.ctl.classList.remove('proto-err','proto-warn','proto-miss'); pair.ctl.classList.add(cls);
    pair.ctl.setAttribute('data-msg',(mode==='cur'?'建議做法會抓到：':(i.l==='B'?'不能送出：':'提醒：'))+i.m);
    const fs=pair.ctl.closest('fieldset'); if(fs) fs.classList.remove('proto-col');
    if(!first&&(i.l==='B'||mode==='cur')) first=pair.ctl;});
  return first;
}

/* ================= 送出（取代現行的 SaveReport） ================= */
const li=a=>'<ul>'+a.map(i=>`<li>${esc(i.m)}</li>`).join('')+'</ul>';
function modal(title,cls,html,btns){
  qs('#pvModalTitle').textContent=title;
  const hd=qs('#pvModalHd'); hd.className='modal-header pv-mh '+cls;
  qs('#pvModalBody').innerHTML=html;
  const ft=qs('#pvModalFt'); ft.innerHTML='';
  btns.forEach(b=>{const x=document.createElement('button');x.type='button';x.className='btn '+(b.pri?'btn-primary':'btn-secondary');x.textContent=b.t;x.onclick=()=>{bootstrap.Modal.getOrCreateInstance(qs('#pvModal')).hide();b.f&&b.f();};ft.appendChild(x);});
  bootstrap.Modal.getOrCreateInstance(qs('#pvModal')).show();
}
window.SaveReport=function(force){
  if(!cur) return; const F=cur.F; let type=cur.type;
  if(F===4){type=+q(4,'ReportType').value||cur.type; cur.type=type;}
  const V=getV(F), r=rec(type,V), issues=validate(type,r,cur.edit,V);
  if(mode==='cur'){
    mark(F,[]);
    if(type===3&&(g(3,'ROB_FO')===''||g(3,'ROB_DO')==='')){ mark(3,[{l:'B',k:g(3,'ROB_FO')===''?'ROB_FO':'ROB_DO'}]); modal('無法送出','bad','<b>現行系統擋下：存量欄位空白。</b><br>（只檢查空白，0 可以通過）',[{t:'關閉'}]); return; }
    save(r);
    let html='<b>已送出。現行系統沒有任何提醒。</b>';
    if(issues.length){ html+='<h6 class="mt-3">建議做法會檢查，但我在現行程式沒看到對應檢查的項目：</h6>'+li(issues)+'<div class="pv-mute">現行系統各報表的檢查，我只確認了部分，其餘需線上實測。</div>'; mark(F,issues); }
    modal('已送出（現行系統）',issues.length?'bad':'ok',html+fuelHTML(),[{t:'關閉'}]); return;
  }
  const Bl=issues.filter(i=>i.l==='B'), Wl=issues.filter(i=>i.l==='W');
  const first=mark(F,issues);
  if(Bl.length){ modal('不能送出','bad','<b>請先修正：</b>'+li(Bl)+(Wl.length?'<h6>另外還有提醒：</h6>'+li(Wl):''),[{t:'回去修改',pri:1,f:()=>first&&first.scrollIntoView({behavior:'smooth',block:'center'})}]); return; }
  if(Wl.length&&!force){ modal('請確認以下情形','warn','<b>沒問題仍可送出：</b>'+li(Wl),[{t:'回去修改'},{t:'確認無誤，送出',pri:1,f:()=>window.SaveReport(true)}]); return; }
  save(r); modal('已送出','ok','<b>已送出。</b>'+(Wl.length?'（已確認提醒）':'')+fuelHTML(),[{t:'關閉',pri:1}]);
};
function save(r){
  if(cur.edit){const o=hist.find(x=>x.id===cur.edit); Object.assign(o,r);}
  else hist.push({id:++seq,...r});
  renderStrip();
}
function fuelCalc(cand){
  const list=[...hist.filter(x=>x.type!==9),...(cand&&cand.type!==9&&cand.time?[{...cand,id:-1}]:[])].sort((a,b)=>a.time<b.time?-1:1);
  const last=list[list.length-1]; if(!last) return null;
  const ars=list.filter(x=>x.type===4), ar=ars[ars.length-1], rate=ar&&num(ar.avg_fo)>0?num(ar.avg_fo):RATE_DEFAULT;
  let stock,note='';
  if(mode==='cur') stock=num(last.fo)||0;
  else{ const s=[...list].reverse().find(x=>stockFO(x)!=null); stock=s?stockFO(s):0; if(s&&s.id!==last.id) note='（最新的'+TN[last.type]+'沒填存量，改用'+TN[s.type]+' '+fmt(s.time)+' 的存量）'; }
  const days=Math.max(0,(stock-MIN_FO)/rate); return {stock,rate,days,note,cls:days<=3?'r':days<=5?'o':'g',last};
}
function fuelBlock(cand){
  const c=fuelCalc(cand); if(!c) return '';
  let extra='';
  if(mode==='cur'&&cand&&cand.type===10&&!(num(cand.fo)>0)) extra='<div class="pv-mute">現行預警讀的是「定速航行存量」，完工報通常沒填，被當成 0。</div>';
  return `<span class="pv-fuel ${c.cls}">重油剩餘 ${f1(c.days)} 天</span><span class="pv-mute">　存量 ${f1(c.stock)} 噸，最低存量 ${MIN_FO} 噸，日耗 ${f1(c.rate)} 噸／日 ${c.note}</span>${extra}`;
}
function fuelHTML(){ const b=fuelBlock(null); return b?`<h6 class="mt-3">燃油加油預警預覽（重油）</h6>${b}`:''; }

/* ================= 示範資料：正確數值與常見填錯情境 ================= */
const D='__default__', CARRY='__carry__', STALE='__stale__';
const PRESETS={
 2:{stage:'noon',title:'船位報（午報）',
  desc:'航行中的午報。上一份午報（10/29 12:00）重油 289.0、輕油 30.9，距離下一港 339.3 浬。今天 10/30 12:00：重油 267.4、輕油 30.8，24 小時用了 21.6 與 0.1 噸；日航程 277.2 浬、航行時間 24 小時、已跑航程 575.0 浬、距離下一港 63.3 浬，都由系統依 VDR／AIS 軌跡自動帶入。',
  ok:{ReportType:2,ReportTime:'2026-10-30T12:00',VoyageName:'25',VesselCondition:1,'Longitude-Degree':120,'Longitude-Minute':5,'Latitude-Degree':22,'Latitude-Minute':40,Course:185,AverageSpeed:11.5,RPM:90,SLIP:8,ROB_FO:267.4,ROB_DO:30.8,ROB_MECYO:5.3,ROB_MESYLO:3.2,ROB_AESYLO:1.8,ROB_FW:43,RunningDistance_Day:277.2,RunningDistance_Hour:24,TotalDistance:575,BalanceDistance:63.3,NextPortETA:'2026-10-30T18:00'},
  errs:[
   {label:'存量忘了填（耗量會變整桶）',desc:'重油、輕油存量沒填。現行系統的耗量欄位預設放上一份的存量（289.0 與 30.9），沒填存量就是整桶；調整後存量必填，耗量填完存量才自動算。',patch:{ROB_FO:D,ROB_DO:D}},
   {label:'存量照抄上一份',desc:'重油存量填成 289.0（和上一份一樣）。24 小時耗量 0，航行中不可能。',patch:{ROB_FO:289.0}},
   {label:'存量小數點打錯（2674）',desc:'267.4 打成 2674。比上一份多，耗量變成負數。',patch:{ROB_FO:2674}},
   {label:'24 小時用油過高（用了 40 噸）',desc:'重油填成 249.0，24 小時用了 40.0 噸，比最近的日耗（約 21 噸）高很多。',patch:{ROB_FO:249.0}},
   {label:'VDR 沒有資料（船位空白）',desc:'自動帶入的船位是空白（VDR 沒訊號）。提醒船員手動填寫；日航程也就算不出來。',patch:{'Longitude-Degree':'','Longitude-Minute':'','Latitude-Degree':'','Latitude-Minute':''}},
   {label:'發報時間不是 12:00',desc:'午報應在 12:00（船鐘時間）發報，這份填成 09:30。只提醒，仍可送出。',patch:{ReportTime:'2026-10-30T09:30'}},
   {label:'發報時間晚於現在（補資料）',desc:'發報時間填成 16:30，比現在（12:15）晚。可能是補資料，所以只提醒，仍可送出。',patch:{ReportTime:'2026-10-30T16:30'}},
   {label:'航次號打錯（26）',desc:'航行中不換航次號，卻填成 26。',patch:{VoyageName:'26'}}
  ]},
 4:{stage:'sea',title:'抵港報',
  desc:'上一港 10/28 10:00 開始定速航行，重油 312.4 噸（系統自動帶入）。10/30 17:30 結束定速航行，262.4 噸，航行 55.5 小時用了 50.0 噸，平均每天 21.6 噸；接著下錨等泊 7 小時，10/31 06:00 主機停俥，258.8 噸。',
  ok:{ReportTime:'2026-10-31T06:30',VoyageName:'25',VesselCondition:1,EOSP:'2026-10-30T17:30',ROB_FO_EOSP:262.4,ROB_DO_EOSP:30.8,Drifting:'2026-10-30T19:00',ROB_FO_DD:261.0,ROB_DO_DD:30.8,AnchorAweigh:'2026-10-31T02:00',ROB_FO_AC:260.2,ROB_DO_AC:30.8,RSE:'2026-10-31T03:00',ROB_FO_RSE:260.0,ROB_DO_RSE:30.8,POB:'2026-10-31T03:30',TugAttended:'2026-10-31T03:40',FirstLineMadeFast:'2026-10-31T05:20',AllLineMadeFast:'2026-10-31T05:40',TugCastOff:'2026-10-31T05:50',DOP:'2026-10-31T05:50',TugLeft:'2026-10-31T06:00',FEW:'2026-10-31T06:00',ROB_FO_FWE:258.8,ROB_DO_FWE:30.6,SeaPassage_TotalTime:55.5,SeaPassage_TotalDistance:638.3,Arrive_Draft_F:5.2,Arrive_Draft_M:5.4,Arrive_Draft_A:5.6,SLIP:8,RPM:90},
  errs:[
   {label:'發報時間：不用改（自動帶入現在時間）',good:true,desc:'船員沒碰發報時間，系統已自動帶入現在時間，所以不用改就是對的（現行是預設今天 12:00）。',patch:{ReportTime:D}},
   {label:'存量填 0',desc:'結束定速航行的重油存量填成 0。算出來「航程用了 312.4 噸」，平均油耗變成每天 135 噸，下面各階段存量也全部變成「增加」。',patch:{ROB_FO_EOSP:0}},
   {label:'存量小數點打錯（2624）',desc:'262.4 打成 2624。比上港完車還多，航程總耗油變成負數，平均油耗是負的。',patch:{ROB_FO_EOSP:2624}},
   {label:'存量照抄上一份（沒更新）',desc:'結束定速航行存量填成和上港完車一樣的 312.4：航行 55.5 小時卻一滴油都沒用，平均油耗 0。',patch:{ROB_FO_EOSP:312.4}},
   {label:'備俥存量比起錨時還多',desc:'起錨 260.2，備俥卻填 263.0。時間往後、存量卻變多，航行中不會補油，一定有一個填錯。',patch:{ROB_FO_RSE:263.0}},
   {label:'下錨時間填在起錨之後',desc:'下錨時間填成 10/31 04:00，晚於起錨 02:00，時間順序顛倒，等泊時間也算不出來。',patch:{Drifting:'2026-10-31T04:00'}},
   {label:'有下錨存量卻沒填下錨時間',desc:'下錨存量有填，但下錨時間空白，系統無法判斷等泊多久。',patch:{Drifting:''}},
   {label:'等泊耗油過高（掉 8 噸）',desc:'下錨 261.0、起錨 253.0：等泊 7 小時用了 8 噸，折算每天 27 噸，比航行平均還快——等泊時主機不是全速，很可能填錯。',patch:{ROB_FO_AC:253.0,ROB_FO_RSE:252.8,ROB_FO_FWE:251.6}},
   {label:'航次號打錯（26）',desc:'抵港報不換航次號，卻填成 26。',patch:{VoyageName:'26'}},
   {label:'沒有下錨（正常情形）',good:true,stage:'sea2',desc:'本港直接靠泊、沒有下錨等泊。下錨存量維持自動帶入的值（等於結束定速航行），起錨區留空；連鎖核對表只核對 結束定速航行 → 備俥 → 主機停俥。等泊耗油：現行用下錨 − 停俥算出 2.8 噸（實際沒等泊）；調整後沒有下錨＝ 0，等泊時間與每日耗油留空。',patch:{ReportTime:'2026-10-30T21:30',Drifting:'',AnchorAweigh:'',ROB_FO_DD:262.4,ROB_DO_DD:30.8,ROB_FO_AC:'',ROB_DO_AC:'',RSE:'2026-10-30T18:30',ROB_FO_RSE:261.6,ROB_DO_RSE:30.8,POB:'2026-10-30T19:00',TugAttended:'2026-10-30T19:10',FirstLineMadeFast:'2026-10-30T20:30',AllLineMadeFast:'2026-10-30T20:40',TugCastOff:'2026-10-30T20:50',DOP:'2026-10-30T20:50',TugLeft:'2026-10-30T21:00',FEW:'2026-10-30T21:00',ROB_FO_FWE:259.6,ROB_DO_FWE:30.6}},
   {label:'停俥存量與起錨不同（等泊只有 2.45 小時）',good:true,desc:'下錨 00:00、起錨 02:27，等泊 2.45 小時，重油 261.0 → 260.8，真正等泊只用 0.2 噸（每天約 2.0 噸）。起錨後進港靠泊又用了 2 噸，主機停俥時船員照實填 258.8。切換「現行／調整後」對照：現行＝下錨 − 停俥＝2.2 噸，折算每天 21.6 噸（被放大，與匯順 07/13 同樣情形）；調整後＝下錨 − 起錨＝0.2 噸，每天 2.0 噸。',patch:{Drifting:'2026-10-31T00:00',AnchorAweigh:'2026-10-31T02:27',ROB_FO_DD:261.0,ROB_FO_AC:260.8,ROB_FO_RSE:260.6,ROB_FO_FWE:258.8}},
   {label:'沒填起錨存量（估算）',good:true,desc:'船員沒填起錨存量（豐順、源順常見）。下錨 261.0、備俥 260.0、停俥 258.8，等泊 7 小時。現行＝下錨 − 停俥＝2.2 噸，折算每天 7.5 噸；調整後＝下錨 − 備俥存量估算＝1.0 噸，每天 3.4 噸，欄位旁標示「估算」，提醒補填起錨存量。',patch:{ROB_FO_AC:''}},
   {label:'起錨與備俥存量都沒填',desc:'起錨、備俥存量都空白。現行仍用下錨 − 停俥算出 2.2 噸；調整後不拿停俥存量代替，等泊耗油留空，欄位提示「請填起錨時存量」。',patch:{ROB_FO_AC:'',ROB_FO_RSE:''}}
  ]},
 3:{stage:'daily2',title:'日電報',
  desc:'卸貨港第二天。上一份日電報（10/31 08:00）：重油 257.6、輕油 30.5、主機汽缸油 5.2、主機系統油 3.1、輔機系統油 1.8、淡水 42.0。今天 11/01 08:00：重油 256.4、輕油 30.4 由船員填；後四項已預先帶入，再依實測改成 5.1／3.1／1.7／41.0。前 24 小時耗量自動算：重油 1.2、輕油 0.1、汽缸油 0.1、主機系統油 0.0、輔機系統油 0.1、淡水 1.0 噸。',
  ok:{ReportTime:'2026-11-01T08:00',VesselCondition1:1,VesselCondition2:4,ROB_FO:256.4,ROB_DO:30.4,ROB_MECYO:5.1,ROB_MESYLO:3.1,ROB_AESYLO:1.7,ROB_FW:41.0,Estimate_Cargo_Discharged:5200,Daily_Cargo_Discharged:1700,Total_Cargo_Discharged:3500,Balance_Cargo_Discharged:1700},
  errs:[
   {label:'存量忘了填（維持預設）',desc:'重油、輕油存量沒填。現行系統預設 0，耗量會變成整桶（257.6 與 30.5 噸）而且可以送出；調整後預設空白，不能送出。',patch:{ROB_FO:D,ROB_DO:D}},
   {label:'存量照抄上一份',desc:'重油存量填成 257.6（和 24 小時前一樣）。耗量 0，看起來像沒用油。',patch:{ROB_FO:257.6}},
   {label:'存量小數點打錯（2564）',desc:'256.4 打成 2564。存量比上一份多，耗量變成負數。',patch:{ROB_FO:2564}},
   {label:'存量比上一份多（耗量變負數）',desc:'預先帶入的主機汽缸油（上一份 5.2）手動改成 5.9，淡水（上一份 42.0）改成 43.0。存量比上一份多，前 24 小時耗量變成 −0.7 與 −1.0 噸；日電報沒有補給，提醒船員確認。',patch:{ROB_MECYO:5.9,ROB_FW:43.0}},
   {label:'作業狀況選成裝貨',desc:'在卸貨港（抵港報是重載），作業狀況卻選「裝貨」。',patch:{VesselCondition2:3}},
   {label:'沒有上一份日電報或抵港報',stage:'nodaily',desc:'系統裡找不到這艘船的上一份日電報或抵港報：後四項存量無法預先帶入，前 24 小時耗量也算不出來，提醒船員確認船報順序。',patch:{ReportTime:'2026-10-31T08:00'}}
  ]},
 10:{stage:'nocomp',title:'完工報',
  desc:'卸貨完成（08:30 開卸、14:50 完卸，總作業時間系統算出 6.33 小時；裝貨也可以填完工報）。開工存量自動帶入：取開工時間（08:30）之前、離開工最近的一份，也就是 10/31 08:00 日電報的存量（重油 257.6、輕油 30.5、汽缸油 5.2、系統油 3.1、輔機系統油 1.8、淡水 42.0；輔機系統油也是同一個規則帶入，不會留空，只有完全找不到可帶入的存量時才要船員自己填）。作業油料資訊由系統自動算：總耗量＝開工存量＋本港補給−離泊位存量（重油 257.6＋0−255.9＝1.7 噸、輕油 30.5−30.4＝0.1 噸），平均耗量＝總耗量÷總作業時間×24（重油 6.45、輕油 0.38 噸／日）。離泊位（完工）、備俥、定速航行的存量由船員填，六種油水都有示意數值（離泊位 255.9 → 備俥 255.8 → 定速航行 255.5；輔機系統油 1.7 → 1.7 → 1.7）。',
  ok:{ReportType:10,ReportTime:'2026-10-31T15:10',VoyageName:'25',VesselCondition:1,'CWCM-Type':2,CWCM:'2026-10-31T08:30','CWCP-Type':2,CWCP:'2026-10-31T14:50','TotalCargo-Type':2,TotalCargo:5200,'TotalCargo-Unit':1,CargoName:'鋼捲（示範）',CompletedWorking_ROB_FO:255.9,CompletedWorking_ROB_DO:30.4,CompletedWorking_ROB_MECYO:5.1,CompletedWorking_ROB_MESYLO:3.1,CompletedWorking_ROB_AESYLO:1.7,CompletedWorking_ROB_FW:40.0,RSE_ROB_FO:255.8,RSE_ROB_DO:30.4,RSE_ROB_MECYO:5.1,RSE_ROB_MESYLO:3.1,RSE_ROB_AESYLO:1.7,RSE_ROB_FW:40.0,COSP_ROB_FO:255.5,COSP_ROB_DO:30.3,COSP_ROB_MECYO:5.0,COSP_ROB_MESYLO:3.0,COSP_ROB_AESYLO:1.7,COSP_FW:39.8},
  errs:[
   {label:'定速航行存量留空（預警改取離泊位存量）',good:true,desc:'完工報還沒開航，定速航行油料資訊留空。現行系統的燃油預警把空白當 0，顯示 0 天；調整後預警取最新「有填存量」的欄位（離泊位 255.9），並說明改用哪一份。',patch:{COSP_ROB_FO:'',COSP_ROB_DO:'',COSP_ROB_MECYO:'',COSP_ROB_MESYLO:'',COSP_ROB_AESYLO:'',COSP_FW:''}},
   {label:'離泊位重油存量沒填',desc:'離泊位（完工）重油存量空白。',patch:{CompletedWorking_ROB_FO:''}},
   {label:'離泊位存量比開工多（沒補油）',desc:'離泊位重油存量填成 270.0，比開工的 257.6 還多，但補給量是 0。',patch:{CompletedWorking_ROB_FO:270.0}},
   {label:'補輕油 10 噸，存量沒增加',desc:'本港補輕油 10 噸，離泊位輕油存量卻還是 30.4（開工 30.5）。所有油水的補給都核對，不只重油。',patch:{PortSupply_DO:10}},
   {label:'補淡水 30 噸，只增加 5 噸',desc:'本港加水 30 噸，離泊位淡水 47.0，只比開工（42.0）多 5 噸。',patch:{PortSupply_FW:30,CompletedWorking_ROB_FW:47}},
   {label:'離泊位主機汽缸油沒填',desc:'離泊位主機汽缸油存量空白。重油、輕油以外的油水也要檢查。',patch:{CompletedWorking_ROB_MECYO:''}},
   {label:'開工存量：特殊報在開工之後（不取）',good:true,stage:'sp',desc:'開工 08:30；作業中 11:10 發生故障停俥（特殊報 11:30）。特殊報在開工之後，開工存量不取它，仍取 08:00 日電報的存量（重油 257.6）。',patch:{}},
   {label:'開工存量：特殊報在開工之前（不自動帶入，只提示）',good:true,stage:'sp',desc:'開工時間 12:00，晚於 11:10 的特殊報。特殊報不一定和開工有關，所以不自動帶入，開工存量仍取 08:00 日電報的存量（重油 257.6）；畫面提示「開工前有一份特殊報（事發 10/31 11:10，重油 256.8），請確認是否要採用」，由船員決定。',patch:{CWCM:'2026-10-31T12:00',CWCP:'2026-10-31T14:50'}}
  ]},
 7:{stage:'done',title:'離港報',
  desc:'卸貨完成、完工報已送出，空載離港。前一份是完工報：開裝／開卸時間、完裝／完卸時間、貨物及完工數量、開航時間紀錄、下一港、開工存量，都直接帶入完工報的資料；船員只要改和完工報不同的地方。補油 40 噸：開工 257.6 → 離泊位 295.9。航次號應換成 26。',
  ok:{ReportType:7,ReportTime:'2026-10-31T17:45',VoyageName:'26',VesselCondition:2,LSFO_BunkeringCommenced:'2026-10-31T15:40',CompletedWorking_ROB_FO:295.9,CompletedWorking_ROB_DO:30.4,CompletedWorking_ROB_MECYO:5.1,CompletedWorking_ROB_MESYLO:3.1,CompletedWorking_ROB_AESYLO:1.7,CompletedWorking_ROB_FW:40.0,RSE_ROB_FO:295.8,RSE_ROB_DO:30.4,RSE_ROB_MECYO:5.1,RSE_ROB_MESYLO:3.1,RSE_ROB_AESYLO:1.7,RSE_ROB_FW:40.0,COSP_ROB_FO:295.4,COSP_ROB_DO:30.3,COSP_ROB_MECYO:5.0,COSP_ROB_MESYLO:3.0,COSP_ROB_AESYLO:1.7,COSP_FW:39.5,PortSupply_FO:40},
  errs:[
   {label:'忘記換航次號（還是 25）',desc:'卸貨港離港報（空載）接在完工報之後，航次號沒有換成 26。',patch:{VoyageName:'25'}},
   {label:'沒有完工報就離港',stage:'nocomp',desc:'這個港有卸貨（抵港重載、離港空載），卻沒有填完工報；前一份是日電報，所以裝卸時間、貨量、開航時間都不會帶入，開工存量改取日電報的存量（規則和完工報相同）。',patch:{NextPort:'高雄港',NextPortETA:'2026-11-01T14:00'}},
   {label:'開航時間順序顛倒',desc:'引水離船填成 17:00，比引水登船 17:00 之後的拖輪纜繩解掉（17:15）還早。開航時間要依序：備俥 → 機器備便 → 引水登船 → 拖輪協助 → 離泊位 → 拖輪纜繩解掉 → 引水離船 → 拖輪離開 → 開始定速航行。',patch:{DOP:'2026-10-31T17:00'}},
   {label:'開航時間沿用上一個港口',desc:'引水登船、備俥、下一港預計抵達等時間，和上一個港口的離港報完全相同（10/28、10/29），疑似沒有更新。',patch:Object.fromEntries(['COAA','RSE','ESB','POB','TugAttended','TugCastOff','DOP','TugLeft','COSP','NextPortETA'].map(k=>[k,CARRY]))},
   {label:'補油了但存量沒增加',desc:'補油量 40 噸，離泊位存量卻填 257.0（比開工 257.6 還少）。',patch:{CompletedWorking_ROB_FO:257.0}},
   {label:'補輕油 10 噸，存量沒增加',desc:'本港補輕油 10 噸，離泊位輕油存量 30.4（開工 30.5）沒有增加。所有油水的補給都核對。',patch:{PortSupply_DO:10}},
   {label:'下一港預計抵達比發報時間早',desc:'下一港預計抵達填成 10/31 10:00，比發報時間 17:45 還早。',patch:{NextPortETA:'2026-10-31T10:00'}}
  ]},
 9:{stage:'noon',title:'特殊情況報',
  desc:'航行中故障停俥：10/30 10:20 事發，11:20 重新起航。每一列兩個數字並排：左邊事發時、右邊重新起航時。上一份午報（10/29 12:00）存量：重油 289.0、輕油 30.9、汽缸油 5.5、系統油 3.3、輔機系統油 1.9、淡水 43.5。耗量總計自動算（左 − 右）：重油 0.2、輕油 0.0、汽缸油 0.0、主機系統油 0.0、輔機系統油 0.0、淡水 0.1 噸。',
  ok:{ReportType:3,ReportTimeX:'2026-10-30T11:40',ReportTime:'2026-10-30T10:20',ERST:'2026-10-30T11:20',VoyageName:'25',VesselCondition1:1,ROB_FO:269.6,ROB_FO2:269.4,ROB_DO:30.8,ROB_DO2:30.8,ROB_MECYO:5.4,ROB_MECYO2:5.4,ROB_MESYLO:3.3,ROB_MESYLO2:3.3,ROB_AESYLO:1.9,ROB_AESYLO2:1.9,ROB_FW:42.6,ROB_FW2:42.5},
  errs:[
   {label:'上下填寫（一路往下填左邊）',desc:'船員把數字一路往下填在左邊：重油事發 269.6 填對，重油重新起航 269.4 卻填到輕油那列，輕油 30.8 填到汽缸油那列……右邊全空。輕油、汽缸油、系統油、淡水的存量都和上一份報表差很多。',patch:{ReportType:7,ROB_FO:269.6,ROB_DO:269.4,ROB_MECYO:30.8,ROB_MESYLO:30.8,ROB_AESYLO:5.4,ROB_FW:5.4,ROB_FO2:'',ROB_DO2:'',ROB_MECYO2:'',ROB_MESYLO2:'',ROB_AESYLO2:'',ROB_FW2:''}},
   {label:'左右填反（重新起航寫在左邊）',desc:'重油左邊填成 269.4、右邊填成 269.6：重新起航時（右）比事發時（左）還多，耗量變成負數。',patch:{ROB_FO:269.4,ROB_FO2:269.6}},
   {label:'只填事發時（右邊事後補填）',good:true,desc:'事件還沒結束，先送出事發時存量，右邊「重新起航時」留空，事情結束後船員再回來補填。右邊空白不提醒、可直接送出，耗量總計等補填後才算出來。',patch:{ReportType:7,ROB_FO2:'',ROB_DO2:'',ROB_MECYO2:'',ROB_MESYLO2:'',ROB_AESYLO2:'',ROB_FW2:''}},
   {label:'修改既有特殊報（發報時間不被改成今天）',good:true,edit:2,noOk:true,stage:'sea',desc:'修改 10/29 02:40 發的特殊報。調整後顯示原本的發報時間；現行系統會顯示成今天 12:00，存檔就蓋掉。',patch:{}},
   {label:'事件發生時間比發報時間晚',edit:2,noOk:true,stage:'sea',desc:'修改既有特殊報時，把事件發生時間改成 10/29 09:00，比發報時間 02:40 還晚。',patch:{ReportTime:'2026-10-29T09:00'}}
  ]}
};
function setAny(F,k,v,t){
  if(v===D) return;                                   // 維持開表單時的預設狀態
  if(v===CARRY){const dep=lastOf(7); setT(F,k,dep.t[k]); return;}
  if(v===STALE){const ar=lastOf(4); sv(F,k,k.includes('FO')?ar.avg_fo:ar.avg_do); return;}
  if(TIMEKEYS[F].includes(k)||document.getElementById(rid(F,k)+'-Date')){setT(F,k,v); return;}
  sv(F,k,v);
}
function applyVals(F,vals,t){
  lastEvt='PRESET'; const late={};
  Object.entries(vals).forEach(([k,v])=>{ if(/^DailyConsumption_(FO|DO)_Sailing$/.test(k)) late[k]=v; else setAny(F,k,v,t); });
  recalc();
  if(F===4&&!('CommencedWorking_ROB_FO' in vals)) autoOpening();
  Object.entries(late).forEach(([k,v])=>setAny(F,k,v,t));
  if(mode==='pro') recalc();
  lastEvt=''; hints(false);
}
function runPreset(t,i,focus){
  const pr=PRESETS[t], e=i>=0?pr.errs[i]:null;
  loadStage((e&&e.stage)||pr.stage);
  curPreset={t,i};
  startForm(t,(e&&('edit' in e))?e.edit:(pr.edit||null),{keepStage:1,keepPreset:1});
  applyVals(FM[t],{...((e&&e.noOk)?{}:pr.ok),...(e?e.patch:{})},t);
  touched=true; liveCheck();
  if(focus) setTimeout(()=>focusField(FM[t],focus),50);
}
function renderSamples(t){
  const box=qs('#proto-samples'); if(!box) return;
  const pr=t&&PRESETS[t]; if(!pr){box.hidden=true;box.innerHTML='';return;}
  const act=curPreset&&curPreset.t===t?curPreset.i:null;
  const btn=(i,l,cls)=>`<button type="button" class="pv-sb ${cls} ${act===i?'on':''}" data-pi="${i}">${l}</button>`;
  box.hidden=false;
  box.innerHTML=`<div class="pv-sm-in"><b>示範資料（含數值）</b>
    <div class="pv-sm-row">${btn(-1,'填入正確資料','ok')}<span class="pv-sm-sep">常見填錯：</span>${pr.errs.map((e,i)=>btn(i,e.label,'err')).join('')}</div>
    <div class="pv-sm-desc">${act!=null?(act===-1?pr.desc:'<b>情境：'+pr.errs[act].label+'</b>　'+pr.errs[act].desc):pr.desc+'　按上方按鈕填入數值，下方「即時檢查」會顯示結果。'}</div></div>`;
  qsa('#proto-samples [data-pi]').forEach(b=>b.onclick=()=>runPreset(t,+b.dataset.pi));
}

/* ================= 即時檢查面板（固定在畫面下方） ================= */
let touched=false;
function liveCheck(){
  if(!cur||qs('#Report-'+cur.F).style.display==='none'){qsa('#proto-chain-wrap,#proto-chain,.pv-skip').forEach(e=>e.remove());return;}
  const F=cur.F; let type=cur.type; if(F===4){type=+g(4,'ReportType')||cur.type; cur.type=type;}
  const V=getV(F), r=rec(type,V), issues=validate(type,r,cur.edit,V);
  mark(F,touched?issues:[]);
  if(F===2){
    renderChain(F,V);
  } else qsa('#proto-chain-wrap,#proto-chain,.pv-skip').forEach(e=>e.remove());
}
function ensureStage(t){
  const core=[...hist].reverse().find(r=>[3,4,7,10].includes(r.type)), pt=core&&core.type;
  const okPrev={2:[7,undefined],4:[7,undefined],3:[4,3],10:[4,3],7:[4,3,10],6:[4,3],9:[7,4,3,10,undefined]};
  if(!okPrev[t].includes(pt)) loadStage({2:'noon',4:'sea',3:'port',10:'port',7:'done',6:'port',9:'sea'}[t]);
}

/* ================= 開啟表單 ================= */
function startForm(t,editId,opts={}){
  if(!opts.keepStage) ensureStage(t);
  if(!opts.keepPreset) curPreset=null;
  touched=!!opts.keepPreset;
  const F=FM[t];
  cur={type:t,edit:editId||null,F};
  showTab('sim'); renderStrip();
  jQuery('#Report-'+F).html(PRISTINE[F]);
  prepareForm(F); initVals(t,editId||null); annotate(F); recalc();
  showReport(F);
  hints(); renderScnBar(); liveCheck();
  window.scrollTo(0,0);
}

/* ================= 與現在系統的差異（頁面上方清單，每項可「前往」） ================= */
const TOUR={
  time:()=>runPreset(4,-1,'ReportTime'),
  special:()=>runPreset(9,PRESETS[9].errs.findIndex(e=>e.label.startsWith('修改既有特殊報')),'ReportTimeX'),
  upd:()=>runPreset(9,-1,'ROB_FO'),
  zero:()=>runPreset(3,0,'ROB_FO'),
  voyage:()=>runPreset(7,-1,'VoyageName'),
  cosp:()=>runPreset(4,-1,'ROB_FO_COSP_LastPort'),
  chain:()=>runPreset(4,-1,'#proto-chain'),
  fwe:()=>runPreset(4,-1,'ROB_FO_FWE'),
  wait:()=>runPreset(4,10,'TotalConsumption_FO_Waiting'),
  skip:()=>runPreset(4,PRESETS[4].errs.findIndex(e=>e.label.startsWith('沒有下錨')),'#proto-chain'),
  daily:()=>runPreset(3,-1,'ROB_FO'),
  comp:()=>runPreset(10,-1,'COSP_ROB_FO'),
  open:()=>runPreset(10,PRESETS[10].errs.findIndex(e=>e.label.startsWith('開工存量：特殊報在開工之前')),'CommencedWorking_ROB_FO'),
  supply:()=>runPreset(10,PRESETS[10].errs.findIndex(e=>e.label.startsWith('補輕油')),'PortSupply_DO'),
  dep:()=>runPreset(7,2,'POB'),
  carry:()=>runPreset(7,-1,'CWCM'),
  noon:()=>runPreset(2,-1,'FO_Consumption')
};
function renderChg(){
  const go=k=>`<button class="go" data-tour="${k}">前往 ›</button>`;
  const grp=[[2,'船位報（午報）'],[4,'抵港報'],[3,'日電報'],[10,'完工報'],[7,'離港報'],[9,'特殊情況報']];
  const scn=grp.map(([t,l])=>`<div class="cl">${l}</div>`+`<div class="sbtn"><button class="sc ok" data-sc="${t}:-1">填入正確資料</button>${PRESETS[t].errs.map((e,i)=>`<button class="sc ${e.good?'ok':'err'}" data-sc="${t}:${i}">${e.label}</button>`).join('')}</div>`).join('');
  const probs=P.map(x=>`<li><b>${x.title}</b>　<span class="sub">現行：${x.cur}</span><button class="go" data-pr="${x.n}">前往 ›</button></li>`).join('');
  qs('#chg').innerHTML=`<div class="ch"><b>與現在系統的差異<span class="sub" style="margin-left:8px;font-weight:400">對照現行 GBMC_Report｜對應「船報填寫檢查項目說明 V0.2」</span></b>
   <span class="ips"><label><input type="checkbox" id="mkOn" checked> 顯示新增標記</label><span class="sub"><span class="mk" style="margin:0">新增檢查</span> 欄位多了一項檢查　<span class="mk" style="margin:0">調整：…</span> 既有欄位的預設值或計算方式改變　<span class="mk" style="margin:0">新增表格</span> 畫面多了一個表格　<span class="mk" style="margin:0">修正</span> 現行 bug；滑鼠移上去看「現行／調整後」</span><button class="btn" id="chgClose">收合</button></span></div>
  <div id="chgBody">
  <div class="cg">
   <div><h4>所有報表（共通）</h4><ul>
    <li>發報時間：開新報表自動帶入現在時間，改成可編輯樣式（現行是灰底「自動填寫」，預設 12:00）；必填，不能比現在晚、不能比上一份早${go('time')}</li>
    <li>特殊報修改時，保留原本的發報時間（現行會被改成今天）${go('special')}</li>
    <li>存量 0 或空白不能儲存；填錯的欄位標紅框，儲存時列出原因${go('zero')}</li>
    <li>航次號：有完工報之後的離港報（空載）才換新，系統自動帶入；抵港報不換${go('voyage')}</li></ul></div>
   <div><h4>抵港報（六個油料區塊）</h4><ul>
    <li>前一港口油料：維持自動帶入上一份離港報的定速航行存量（重油、輕油、主機汽缸油、主機系統油、輔機系統油、淡水，六項都帶入、灰底唯讀）${go('cosp')}</li>
    <li>新增「存量連鎖核對」表：依時間順序核對六個階段的存量、耗油與折算每日耗油${go('chain')}</li>
    <li>現行已自動帶入／計算，維持不變：結束定速航行存量 → 下錨存量；航程時間與距離、平均航速、平均油耗；等泊時間</li>
    <li>等泊耗油改為「下錨存量 − 起錨存量」（現行是下錨 − 主機停俥；停俥存量可手改，與起錨不同時等泊耗油被改變、每日耗油被放大）；沒有下錨＝ 0；沒填起錨存量時改用「下錨 − 備俥存量」估算並標示「估算」，備俥也沒填才留空提示【估算方式待確認】${go('wait')}</li>
    <li>主機停俥存量自動帶入，改取最晚階段（備俥優先；現行是起錨優先）；船員手填的停俥存量不再被起錨存量蓋掉；停俥存量只記錄靠泊後存量，不參與等泊耗油【待確認】${go('fwe')}</li>
    <li>本港沒有下錨／漂航時，下錨、起錨兩區不用填，連鎖核對表自動略過${go('skip')}</li></ul></div>
   <div><h4>船位報／日電報／完工報／離港報</h4><ul>
    <li>日電報：重油、輕油存量預設空白（現行預設 0）、必填；主機汽缸油、主機系統油、輔機系統油、淡水預先帶入上一份日電報或抵港報的存量，找不到上一份時提醒；前 24 小時耗量維持自動算${go('daily')}</li>
    <li>完工報：開工存量依開工時間預先帶入（取開工之前最近、有存量的一份：抵港報主機停俥、移泊報、開工前的日電報；特殊報不自動帶入、只提示）${go('open')}；總作業時間維持自動算；補給與離泊位存量，六種油水都核對${go('supply')}；裝貨也可以填完工報；不需填定速航行存量，燃油預警取最新「有填存量」的欄位${go('comp')}</li>
    <li>船位報（午報）：日航程、航行時間、已跑航程、距離下一港現行已自動算，維持不變；新增發報時間、存量、航次號等檢查${go('noon')}</li>
    <li>離港報：前一份是完工報時，開裝／開卸時間、完裝／完卸時間、貨物及完工數量、開航時間紀錄、開工存量，都直接帶入完工報的資料（現行已帶入，維持）${go('carry')}；沒有完工報時，開工存量規則和完工報相同；開航時間要依序填；有卸貨一定要有完工報${go('dep')}</li>
    <li>特殊報：事發時或重新起航時油料存量要「左右」填（左事發、右重新起航）；填成上下、右邊比左邊多會提醒；右邊空白可直接送出（事後補填）${go('upd')}</li></ul></div>
  </div>
  <details class="pdet"><summary>現行系統查到的問題（${P.length} 項）</summary><ul class="pl">${probs}</ul></details>
  <details class="pdet"><summary>填報流程圖（點報表開啟填寫畫面）</summary><div id="flowBody" class="pv-body"></div></details>
  <div class="cf">示範資料，非真實船報；示範資料只存在此頁，重新整理會還原。截圖或對客戶展示時，可收合本說明並取消「顯示新增標記」。</div>
  </div>`;
  qsa('#chg [data-tour]').forEach(b=>b.onclick=()=>TOUR[b.dataset.tour]());
  qsa('#chg [data-sc]').forEach(b=>b.onclick=()=>{const [t,i]=b.dataset.sc.split(':').map(Number); runPreset(t,i);});
  qsa('#chg [data-pr]').forEach(b=>b.onclick=()=>({1:TOUR.time,2:TOUR.special,3:TOUR.zero,4:TOUR.comp})[+b.dataset.pr]());
  qs('#mkOn').onchange=e=>document.body.classList.toggle('nomk',!e.target.checked);
  qs('#chgClose').onclick=()=>{const b=qs('#chgBody'); b.hidden=!b.hidden; qs('#chgClose').textContent=b.hidden?'展開差異清單':'收合';};
  qs('#chgBody').hidden=true; qs('#chgClose').textContent='展開差異清單';
}

/* ================= 情境列：固定在畫面上方，捲動表單時一直看得到 ================= */
const SCN_FORMS=[[2,'船位報'],[4,'抵港報'],[3,'日電報'],[10,'完工報'],[7,'離港報'],[9,'特殊報']];
let scnOpen=true;
function renderScnBar(){
  const tabs=qs('#scn-tabs'); if(!tabs) return;
  const act=cur?cur.type:null, pr=act&&PRESETS[act];
  tabs.innerHTML=`<span class="sl">情境範例</span>`+SCN_FORMS.map(([t,l])=>`<button class="stab ${act===t?'on':''}" data-st="${t}">${l}</button>`).join('')+`<button class="stog" id="scnTog">${scnOpen?'收合情境列 ▲':'展開情境列 ▼'}</button>`;
  const btns=qs('#scn-btns'), desc=qs('#scn-desc'); btns.hidden=desc.hidden=!scnOpen;
  if(!pr){ btns.innerHTML='<span class="sub">先按上面的表單，會帶入示範數值；也可以自己改數字，再按表單最下方的「儲存」看檢查結果。</span>'; desc.innerHTML=''; }
  else{
    const a=curPreset&&curPreset.t===act?curPreset.i:null;
    btns.innerHTML=`<button class="sc ok ${a===-1?'on':''}" data-sc="${act}:-1">填入正確資料</button>`+pr.errs.map((e,i)=>`<button class="sc ${e.good?'ok':'err'} ${a===i?'on':''}" data-sc="${act}:${i}">${e.label}</button>`).join('');
    desc.innerHTML=a==null?pr.desc:(a===-1?'<b>正確資料</b>　'+pr.desc:'<b>'+pr.errs[a].label+'</b>　'+pr.errs[a].desc);
  }
  qsa('#scn-tabs [data-st]').forEach(b=>b.onclick=()=>runPreset(+b.dataset.st,-1));
  qsa('#scn-btns [data-sc]').forEach(b=>b.onclick=()=>{const [t,i]=b.dataset.sc.split(':').map(Number); runPreset(t,i);});
  qs('#scnTog').onclick=()=>{scnOpen=!scnOpen; renderScnBar();};
}

/* ================= 啟動 ================= */
document.addEventListener('click',e=>{
  const m=e.target.closest('.mk[data-pro]');
  qsa('.pv-pop').forEach(x=>x.remove());
  if(!m) return;
  e.preventDefault(); e.stopPropagation();
  const r=m.getBoundingClientRect(), d=document.createElement('div'); d.className='pv-pop';
  const nl=s=>esc(s).replace(/\n/g,'<br>');
  d.innerHTML=`<div class="pp-t">${esc(m.textContent)}<button type="button" class="pp-x">×</button></div><div class="pp-r"><i>現行</i>${nl(m.dataset.cur||'沒有')}</div><div class="pp-g"><i>調整後</i>${nl(m.dataset.pro)}</div>`;
  document.body.appendChild(d);
  const w=d.offsetWidth; d.style.left=Math.max(8,Math.min(window.scrollX+r.left,window.scrollX+window.innerWidth-w-16))+'px'; d.style.top=(window.scrollY+r.bottom+6)+'px';
  d.querySelector('.pp-x').onclick=ev=>{ev.stopPropagation();d.remove();};
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape') qsa('.pv-pop').forEach(x=>x.remove());});
document.addEventListener('DOMContentLoaded',()=>{
  [1,2,3,4,5,6].forEach(F=>{PRISTINE[F]=jQuery('#Report-'+F).html();});
  qsa("div[id^='Report-']").forEach(d=>{ if(/^Report-\d$/.test(d.id)) d.style.display='none'; });
  // 與現行系統相同：上方「選擇填寫船報」使用 select2
  jQuery('#select2_report_form').select2({placeholder:'請選擇填寫船報',allowClear:false,width:'100%'});
  jQuery('#select2_report_form').on('change',()=>window.SwitchReport());
  jQuery('#ReportVessel').html('<option value="1">示範輪</option>');
  // 現行畫面的「選擇船報」大按鈕
  const RT={'4':4,'3':3,'7':7,'6':6,'9':9};
  qsa("a[id^='NewReportLink-']").forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const m=a.getAttribute('href').match(/RT=(\d+)/); const t=m&&RT[m[1]]; if(t) startForm(t); else modal('雛形說明','warn','船位電報（Noon Report）本雛形未實作；兩岸線正式期沒有使用。',[{t:'關閉'}]);}));
  const frmRoot=qs('#view-sim');
  frmRoot.addEventListener('input',e=>{lastEvt=e.target.id||''; touched=true; recalc(); setTimeout(liveCheck,0);});
  frmRoot.addEventListener('change',e=>{lastEvt=e.target.id||''; recalc(); hints(/VesselCondition|ReportType/.test(lastEvt)); setTimeout(liveCheck,0);});
  renderChg(); renderFlow(); showReport(0); renderStrip(); renderScnBar();
  const pbh=qs('#proto-bar').offsetHeight; qs('#scnbar').style.top=pbh+'px';
  qs('#btnReset').onclick=()=>{loadStage(curStage);cur=null;curPreset=null;touched=false;showReport(0);renderStrip();};
});
