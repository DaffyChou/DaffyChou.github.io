const Cargo_of_Working_Commenced_Loading_or_Discharging = document.querySelector('#Cargo_of_Working_Commenced_Loading_or_Discharging'); // 4-8 開裝時間或開卸時間
const Cargo_of_Working_Complete_Loading_or_Discharging = document.querySelector('#Cargo_of_Working_Complete_Loading_or_Discharging'); // 4-9 完裝時間或完卸時間
const Total_Working_Hour = document.querySelector('#Total_Working_Hour');  // 4-10 總作業時間

const ROB_FO_of_Commenced_Working = document.querySelector('#ROB_FO_of_Commenced_Working'); // 4-11 開工時的重油存油
const ROB_FO_of_EOSP = document.querySelector('#ROB_FO_of_EOSP'); // 4-17 完工時的重油存量
const Total_Consumption_of_FO_When_Working = document.querySelector('#Total_Consumption_of_FO_When_Working');  // 4-23 作業總重油耗

const ROB_DO_of_Commenced_Working = document.querySelector('#ROB_DO_of_Commenced_Working'); // 4-12 開工時的輕油存油
const ROB_DO_of_EOSP = document.querySelector('#ROB_DO_of_EOSP'); // 4-18 完工時的輕油存量
const Total_Consumption_of_DO_When_Working = document.querySelector('#Total_Consumption_of_DO_When_Working'); // 4-24 作業總輕油耗

const Average_Consumption_of_FO_When_Working = document.querySelector('#Average_Consumption_of_FO_When_Working'); // 4-25 作業平均重油油耗

const Average_Consumption_of_DO_When_Working = document.querySelector('#Average_Consumption_of_DO_When_Working');// 4-26 作業平均輕油油耗



// ヾʕ•ᴥ•ʔ 作業總重油耗 = 完工時的重油存量 - 開工時的重油存油
function updateFOConsumption() {
    updateMinus(
        Total_Consumption_of_FO_When_Working,
        ROB_FO_of_Commenced_Working,
        ROB_FO_of_EOSP
    );
}
updateFOConsumption()
ROB_FO_of_Commenced_Working.addEventListener('input', updateFOConsumption);
ROB_FO_of_EOSP.addEventListener('input', updateFOConsumption);

// ヾʕ•ᴥ•ʔ 作業總輕油耗 = 完工時的輕油存量 - 開工時的輕油存油
function updateDOConsumption() {
    updateMinus(
        Total_Consumption_of_DO_When_Working,
        ROB_DO_of_Commenced_Working,
        ROB_DO_of_EOSP
    );
}
updateDOConsumption() 
ROB_DO_of_Commenced_Working.addEventListener('input', updateDOConsumption);
ROB_DO_of_EOSP.addEventListener('input', updateDOConsumption);

// ヾʕ•ᴥ•ʔ 總作業時間 = 完裝時間或完卸時間 - 開裝時間或開卸時間
function updateTotalWorkingHour() {
    updateTimeDifference(
        Cargo_of_Working_Commenced_Loading_or_Discharging,
        Cargo_of_Working_Complete_Loading_or_Discharging, 
        Total_Working_Hour, 
        'hours'
    );
}
updateTotalWorkingHour();

// ヾʕ•ᴥ•ʔ 作業平均重油油耗 = 作業總重油耗 ÷ 總作業時間 ÷ 24

function updateFOAverageConsumption(){
    updateDivide(
        Average_Consumption_of_FO_When_Working,
        Total_Consumption_of_FO_When_Working,
        '油料', 
        Total_Working_Hour, 
        '時間'
    );
}
updateFOAverageConsumption()
Total_Consumption_of_FO_When_Working.addEventListener('input', updateFOAverageConsumption);
Total_Working_Hour.addEventListener('input', updateFOAverageConsumption);

// ヾʕ•ᴥ•ʔ 作業平均輕油油耗 = 作業總輕油耗 ÷ 總作業時間 ÷ 24
function updateDOAverageConsumption(){
    updateDivide(
        Average_Consumption_of_DO_When_Working,
        Total_Consumption_of_DO_When_Working,
        '油料',
        Total_Working_Hour, 
        '時間'
    );
}
updateDOAverageConsumption()
Total_Consumption_of_DO_When_Working.addEventListener('input', updateDOAverageConsumption);
Total_Working_Hour.addEventListener('input', updateDOAverageConsumption);