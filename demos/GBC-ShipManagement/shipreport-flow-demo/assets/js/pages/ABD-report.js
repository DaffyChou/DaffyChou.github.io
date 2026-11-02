console.log('aBD');

const Total_Time_of_Waiting = document.querySelector('#Total_Time_of_Waiting');
const Time_of_EOSP = document.querySelector('#Time_of_EOSP');
const Time_Of_COSP = document.querySelector('#Time_Of_COSP');
const Anchor_Aweigh_of_last_point = document.querySelector('#Anchor_Aweigh_of_last_point');

const Time_of_RSE = document.querySelector('#Time_of_RSE');

const Total_consumption_of_FO_when_waiting = document.querySelector('#Total_consumption_of_FO_when_waiting');
const ROB_FO_of_EOSP = document.querySelector('#ROB_FO_of_EOSP');
const ROB_FO_of_RSE = document.querySelector('#ROB_FO_of_RSE');

const ROB_DO_of_COSP_Last_Port = document.querySelector('#ROB_DO_of_COSP_Last_Port');
const Total_consumption_of_DO_when_waiting = document.querySelector('#Total_consumption_of_DO_when_waiting');
const ROB_DO_of_EOSP = document.querySelector('#ROB_DO_of_EOSP');
const ROB_DO_of_RSE = document.querySelector('#ROB_DO_of_RSE');

const Total_Time_Using_when_waiting = document.querySelector('#Total_Time_Using_when_waiting');


const Average_Daily_Consumption_of_FO_When_Waiting = document.querySelector('#Average_Daily_Consumption_of_FO_When_Waiting');

const Average_Daily_Consumption_of_DO_When_Waiting = document.querySelector('#Average_Daily_Consumption_of_DO_When_Waiting');


const Total_time_of_Sea_Passage = document.querySelector('#Total_time_of_Sea_Passage');
let Time_of_COSP = 0; // 前一分離港報的COSP時間，需從最新離港報接資料

const Total_Distance_of_Sea_Passage = document.querySelector('#Total_Distance_of_Sea_Passage');
const ROB_FO_of_COSP_Last_Port = document.querySelector('#ROB_FO_of_COSP_Last_Port');

const Total_consumption_of_FO = document.querySelector('#Total_consumption_of_FO');

const Total_consumption_of_DO = document.querySelector('#Total_consumption_of_DO');

const Total_Average_Speed = document.querySelector('#Total_Average_Speed');


const Average_Daily_Consumption_of_FO_when_Sailing = document.querySelector('#Average_Daily_Consumption_of_FO_when_Sailing');

const Average_Daily_Consumption_of_DO_when_Sailing = document.querySelector('#Average_Daily_Consumption_of_DO_when_Sailing');


// ヾʕ•ᴥ•ʔ 等泊時間總計 = 結束海上定速航行時間 - 起錨時間
function updateTotalTimeOfWaiting() {
    updateTimeDifference(
        Time_of_EOSP,
        Anchor_Aweigh_of_last_point, 
        Total_Time_of_Waiting, 
        'hours'
    );
}
updateTotalTimeOfWaiting();

// ヾʕ•ᴥ•ʔ 重油油耗總計 = EOSP存油 - RSE存油
function updateTotalConsumptionOfFOWhenWaiting(){
    updateMinus(
        Total_consumption_of_FO_when_waiting, 
        ROB_FO_of_EOSP, 
        ROB_FO_of_RSE
    )
}
updateTotalConsumptionOfFOWhenWaiting()
ROB_FO_of_EOSP.addEventListener('input', updateTotalConsumptionOfFOWhenWaiting);
ROB_FO_of_RSE.addEventListener('input', updateTotalConsumptionOfFOWhenWaiting);

// ヾʕ•ᴥ•ʔ 輕油油耗總計  = EOSP存油 - RSE存油
function updateTotalConsumptionOfDOWhenWaiting(){
    updateMinus(
        Total_consumption_of_DO_when_waiting, 
        ROB_DO_of_EOSP, 
        ROB_DO_of_RSE
    )
}
updateTotalConsumptionOfDOWhenWaiting()
ROB_DO_of_EOSP.addEventListener('input', updateTotalConsumptionOfDOWhenWaiting);
ROB_DO_of_RSE.addEventListener('input', updateTotalConsumptionOfDOWhenWaiting);

// ヾʕ•ᴥ•ʔ 等泊時總時間(若有) = 結束海上定速航行時間 - 準備備俥時間
function updateTotalTimeUsingWhenWaiting() {
    updateTimeDifference(
        Time_of_EOSP,
        Time_of_RSE, 
        Total_Time_Using_when_waiting, 
        'hours'
    );
}
updateTotalTimeUsingWhenWaiting();


// ヾʕ•ᴥ•ʔ 等泊平均重油 = 等泊重油總計 / 等泊總時間
function updateAverageDailyConsumptionOfFOWhenWaiting() {
    updateDivide (
        Average_Daily_Consumption_of_FO_When_Waiting, 
        Total_consumption_of_FO_when_waiting, 
        '油料',
        Total_Time_Using_when_waiting, 
        '時間'
    );
}
updateAverageDailyConsumptionOfFOWhenWaiting();

// ヾʕ•ᴥ•ʔ 平均輕油 = 等泊輕油總計 / 等泊總時間
function updateAverageDailyConsumptionOfDOWhenWaiting() {
    updateDivide (
        Average_Daily_Consumption_of_DO_When_Waiting, 
        Total_consumption_of_DO_when_waiting, 
        '油料',
        Total_Time_Using_when_waiting, 
        '時間'
    );
}
updateAverageDailyConsumptionOfDOWhenWaiting();

// ヾʕ•ᴥ•ʔ 定速航行期間總重油量 = ROB FO of EOSP - ROB FO of COSP Last Port
function updateTotalConsumptionOfFO(){
    updateMinus(
        Total_consumption_of_FO, 
        ROB_FO_of_EOSP, 
        ROB_FO_of_COSP_Last_Port
    )
}
updateTotalConsumptionOfFO();
ROB_FO_of_EOSP.addEventListener('input', updateTotalConsumptionOfFO);
ROB_FO_of_COSP_Last_Port.addEventListener('input', updateTotalConsumptionOfFO);

// ヾʕ•ᴥ•ʔ 定速航行期間總輕油量 = ROB DO of EOSP - ROB DO of COSP Last Port
function updateTotalConsumptionOfDO(){
    updateMinus(
        Total_consumption_of_DO, 
        ROB_DO_of_EOSP, 
        ROB_DO_of_COSP_Last_Port
    )
}
updateTotalConsumptionOfDO();
ROB_DO_of_EOSP.addEventListener('input', updateTotalConsumptionOfDO);
ROB_DO_of_COSP_Last_Port.addEventListener('input', updateTotalConsumptionOfDO);

// ヾʕ•ᴥ•ʔ 平均航速 = 定速航行總海浬數 / 定速航行總時間
const Total_Distance_Of_Sea_Passage = document.querySelector('#Total_Distance_Of_Sea_Passage');
function updateTotalAverageSpeed() {
    updateDivide (
        Total_Average_Speed, 
        Total_Distance_Of_Sea_Passage, 
        '距離', 
        Total_time_of_Sea_Passage, 
        '時間'
    );
}
updateTotalAverageSpeed();

// ヾʕ•ᴥ•ʔ 平均重油油耗 = 定速航行期間總重油量 / 定速航行總時間
function updateAverageDailyConsumptionOfFOWhenSailing() {
    updateDivide (
        Average_Daily_Consumption_of_FO_when_Sailing, 
        Total_consumption_of_FO, 
        '油料', 
        Total_time_of_Sea_Passage, 
        '時間'
    );
}
updateAverageDailyConsumptionOfFOWhenSailing();

// ヾʕ•ᴥ•ʔ 平均輕油油耗  = 定速航行期間總輕油量 / 定速航行總時間
function updateAverageDailyConsumptionOfDOWhenSailing() {
    updateDivide (
        Average_Daily_Consumption_of_DO_when_Sailing, 
        Total_consumption_of_DO, 
        '油料', 
        Total_time_of_Sea_Passage, 
        '時間'
    );
}
updateAverageDailyConsumptionOfDOWhenSailing();

// ヾʕ•ᴥ•ʔ 定速航行總時間  = 前一份離港報的COSP時間 - 本份抵港報的EOSP時間
function updateTotalTimeOfSeaPassage() {
    updateMinus(
        Total_time_of_Sea_Passage, 
        Time_Of_COSP, 
        Time_of_EOSP
    );
}
updateTotalTimeOfSeaPassage();

// ヾʕ•ᴥ•ʔ 定速航行總海浬數  = 依據AIS等資料抓出航行軌跡加總。