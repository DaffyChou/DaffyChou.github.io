
// ヾʕ•ᴥ•ʔ 將值四捨五入到小數後兩位
function roundingValue(value) {
    const num = parseFloat(value) || 0;          
    const rounded = Math.round(num * 100) / 100; 
    return rounded.toFixed(2);                   
}
// ヾʕ•ᴥ•ʔ 管理減法運算
function updateMinus(input, startEl, endEl){
    const startValue = parseFloat(startEl.value ?? startEl) || 0;
    const endValue = parseFloat(endEl.value ?? endEl) || 0;
    const newValue = roundingValue(startValue - endValue);

    if (input.value !== newValue) {
        input.value = newValue;
        input.dispatchEvent(new Event('input')); // 手動觸發
        // 閃爍提示
        input.classList.remove('flash');
        void input.offsetWidth;
        input.classList.add('flash');
    }
}
// ヾʕ•ᴥ•ʔ 管理油耗除法運算
function updateDivide (input, startEl, startName, endEl, EndName){
    const startValue = parseFloat(startEl.value ?? startEl) || 0;
    const endValue = parseFloat(endEl.value ?? endEl) || 0;
    let newValue;
    if (endValue <= 0) {
        newValue = `${EndName}資料不符`;
    }else if (startValue < 0){
        newValue = `${startName}資料不符`;
    }else{
        newValue = roundingValue(startValue / endValue * 24);
    }
    if (input.value !== newValue) {
        input.value = newValue;
        // 閃爍提示
        input.classList.remove('flash');
        void input.offsetWidth;
        input.classList.add('flash');
    }
}

// ヾʕ•ᴥ•ʔ 時間差計算機 updateTimeDifference(開始div, 結束時間div, 計算結果欄位, 單位字串)
function updateTimeDifference(startContainer, endContainer, resultInput, unit = 'hours') {
    // 取得時間 input/select
    function getTimeInputs(container) {
        return {
            date: container.querySelector('.pick-single-date'),
            hour: container.querySelector('.time-select-h'),
            min: container.querySelector('.time-select-m'),
            clearBtn: container.querySelector('.clearBtn'),
        };
    }

    const startTime = getTimeInputs(startContainer);
    const endTime = getTimeInputs(endContainer);

    // 轉成 Date 物件
    function getDateTime(timeInputs) {
        const dateStr = timeInputs.date.value || '1970/01/01';
        const hour = parseInt(timeInputs.hour.value) || 0;
        const min = parseInt(timeInputs.min.value) || 0;

        const parts = dateStr.split('/').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2], hour, min);
    }

    // 計算差值
    function calculateDiff() {
        const start = getDateTime(startTime);
        const end = getDateTime(endTime);
        let diff = end.getTime() - start.getTime(); // 毫秒
        if (unit === 'hours') {
            diff = diff / 1000 / 60 / 60;
        } else if (unit === 'minutes') {
            diff = diff / 1000 / 60;
        }
        return Math.round(diff * 100) / 100; // 四捨五入兩位
    }

    // 更新結果
    function updateResult() {
        const newValue = calculateDiff().toFixed(2);
        if (resultInput.value !== newValue) {
            resultInput.value = newValue;

            // 手動觸發事件
            resultInput.dispatchEvent(new Event('input'));
            resultInput.dispatchEvent(new Event('change'));

            // 閃爍提示
            resultInput.classList.remove('flash');
            void resultInput.offsetWidth;
            resultInput.classList.add('flash');
        }
    }
    
    // ==== 監聽所有欄位（日期 + 小時 + 分鐘）====
    [
        ...Object.values(startTime),
        ...Object.values(endTime)
    ].forEach(el => {
        if (!el) return;
        el.addEventListener('input', updateResult);
        el.addEventListener('change', updateResult);
    });

    // ==== 監聽 reset 按鈕 ====
    if (startTime.clearBtn) {
        startTime.clearBtn.addEventListener('click', () => {
            setTimeout(updateResult, 0); // 等 resetTimeSelect 執行完成後更新
        });
    }
    if (endTime.clearBtn) {
        endTime.clearBtn.addEventListener('click', () => {
            setTimeout(updateResult, 0);
        });
    }

    // ==== 監聽 daterangepicker 事件（日期被選取時也要更新）====
    [startTime.date, endTime.date].forEach(dateEl => {
        if (!dateEl) return;

        const $el = $(dateEl);
        const drp = $el.data('daterangepicker');
        if (drp) {
            // 日期改變（例如點選月曆）
            $el.on('apply.daterangepicker', updateResult);
            $el.on('hide.daterangepicker', updateResult);
        }
    });

    // 初始化一次
    updateResult();
}