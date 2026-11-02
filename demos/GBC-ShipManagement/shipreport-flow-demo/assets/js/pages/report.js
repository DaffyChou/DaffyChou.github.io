// 下拉選單連結跳轉頁面
$('#select2_report_form').on('select2:select', function (e) {
    const url = e.params.data.element.dataset.url || '#';
    location.href = url;
});


// 將目前頁面設為下拉項目預設值
$(document).ready(function() {

    // 1. 取得目前頁面名稱
    const currentPage = window.location.pathname.split('/').pop() + window.location.hash;

    // 2. 初始化 Select2
    $('#select2_report_form').select2({
        placeholder: "請選擇報表",
        allowClear: false,
        width: '100%'
    });

    // 3. 根據 data-url 自動預選對應選項
    // const matchedOption = $(`#select2_report_form option[data-url="${currentPage}"]`);
    const matchedOption = $('#select2_report_form option').filter(function () {
        return $(this).data('url')?.startsWith(currentPage);
    });

    if (matchedOption.length > 0) {
        matchedOption.prop('selected', true);
        $('#select2_report_form').trigger('change'); // 必須，否則 Select2 不會更新
    }
});

$(".select2-dynamic-option-creation").select2({
    tags: true,
    width: '100%'
});   


// 選擇填寫表單
$(document).ready(function() {
    $('#select2_report_form').select2({
        placeholder: "請選擇填寫船報",
        allowClear: false,
        width: '100%',
        fontSize: '16px',
        templateResult: function (data) {
            // optgroup -> no icon, no small text
            if (!data.element) {
            return $('<strong>' + data.text + '</strong>');
            }

            // option -> icon + text + small
            const note = data.element.dataset.note;
            const icon = data.element.dataset.icon || null;

            return $(`
                <div class="px-2 fs-16 d-flex align-items-center">
                ${icon ? `<i class="${icon} me-3 fs-18"></i>` : ""}
                <div class="">
                ${data.text}
                ${note ? `<div class="fs-14 opacity-75">${note}</div>` : ""}
                </div>
                </div>
            `);
            },
        templateSelection: function (data) {
            return data.text;
        }
    });
});

// 輸入數字INPUT

function enforceNumericText(input, options = {}) {
  const allowDecimal = !!options.allowDecimal;
  const allowNegative = !!options.allowNegative;

  const sanitize = (value) => {
    let v = value.replace(/[^\d\.\-]/g, '');

    // 處理負號
    if (allowNegative) {
      v = v.replace(/(?!^)-/g, '');
    } else {
      v = v.replace(/-/g, '');
    }

    // 處理小數點
    if (allowDecimal) {
      const parts = v.split('.');
      if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
    } else {
      v = v.replace(/\./g, '');
    }

    // 防呆
    if (!allowNegative && v.startsWith('-')) v = v.slice(1);
    if (v === '-' && !allowNegative) v = '';
    if (v.indexOf('-') > 0) v = v.replace(/-/g, '');

    return v;
  };

  input.addEventListener('input', () => {
    const caret = input.selectionStart;
    const before = input.value;
    const after = sanitize(before);
    if (before !== after) {
      input.value = after;
      const offset = Math.max(0, caret - (before.length - after.length));
      input.setSelectionRange(offset, offset);
    }
  });

  input.addEventListener('beforeinput', (e) => {
    if (typeof e.data !== 'string') return;
    const test = sanitize(input.value.slice(0, input.selectionStart) + e.data + input.value.slice(input.selectionEnd));
    const wouldChange = test !== (input.value.slice(0, input.selectionStart) + e.data + input.value.slice(input.selectionEnd));
    if (wouldChange && /[^\d\.\-]/.test(e.data)) e.preventDefault();
  });
}

// 依 class 套用
document.querySelectorAll('.onlyInt').forEach(el => enforceNumericText(el)); // 只允許非負整數
document.querySelectorAll('.decimalOK').forEach(el => enforceNumericText(el, { allowDecimal: true, allowNegative: true }));




// 填寫時間函式 ==================================================
function initDatePicker(selector, single = false) {
    $(selector).each(function () {
        const input = this;
        const $input = $(input);

        // ⭐ 正確取得 container（dataset 在這）
        const container = input.closest('.time-input-div');
        const setTime = container?.dataset?.settime;

        // 1️⃣ 初始化 daterangepicker
        $input.daterangepicker({
            singleDatePicker: single,
            showDropdowns: true,
            autoApply: true,
            autoUpdateInput: false,
            locale: {
                format: 'YYYY/MM/DD',
                separator: ' - ',
                cancelLabel: '清除'
            }
        });

        // 2️⃣ 根據 data-setTime 設定預設日期
        if (!setTime) {
            $input.val('');
        } else if (setTime === '1200' || setTime === '0800') {
            $input.val(moment().format('YYYY/MM/DD'));
        } else if (setTime === 'GMT+8') {
            // 假設後端時間存在 container.dataset.backendTime
            const backendTime = container.dataset.backendTime;
            if (backendTime) {
                $input.val(moment(backendTime).format('YYYY/MM/DD'));
            }
        }

        // 3️⃣ daterangepicker apply
        $input.on('apply.daterangepicker', function (ev, picker) {
            if (single) {
                $input.val(picker.startDate.format('YYYY/MM/DD'));
            } else {
                $input.val(
                    picker.startDate.format('YYYY/MM/DD') +
                    ' - ' +
                    picker.endDate.format('YYYY/MM/DD')
                );
            }

            // ⭐ 通知其他計算（你前面已經在用這套）
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // 4️⃣ cancel
        $input.on('cancel.daterangepicker', function () {
            $input.val('');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
}

initDatePicker('.pick-date-range');
initDatePicker('.pick-single-date', true);

// 執行時間函式
$(document).ready(function () {
    const timeInputDivs = document.querySelectorAll('.time-input-div');

    timeInputDivs.forEach((el) => {
        
        
        const clearBtn = el.querySelector('.clearBtn'); //  Clear 按鈕        
        const setNowBtn = el.querySelector('.setNowBtn'); //  Now 按鈕

        /* ========= CLEAR ========= */
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const dateInput = el.querySelector('.pick-single-date');
            const $dateInput = $(dateInput);
            const drp = $dateInput.data('daterangepicker');

            // 清空 input（daterangepicker 允許）
            $dateInput.val('');


            // 根據 data-settime 進行不同重置
            if (!el.dataset.settime) {
                // 1️⃣ 清空日期
                if (dateInput) {                    
                    // 重新初始化 daterangepicker
                    $dateInput.daterangepicker({
                        singleDatePicker: true,
                        autoUpdateInput: false,                    
                        autoApply: true,
                        locale: {
                            format: 'YYYY/MM/DD'
                        }
                    });

                    // 同步內部值
                    if (drp) {
                        drp.startDate = null;
                        drp.endDate = null;
                    }

                    // 如果需要，監聽 daterangepicker 的事件
                    $dateInput.on('apply.daterangepicker', function (ev, picker) {
                        $(this).val(picker.startDate.format('YYYY/MM/DD'));
                    });
                }

                // 2️⃣ 時間重置為 00:00
                resetTimeSelect(el);
            } else if(el.dataset.settime === "1200") {
                // 1️⃣ 日期設為今天
                $dateInput.val(moment().format('YYYY/MM/DD'));
                // 同步內部值
                if (drp) {
                    drp.setStartDate(moment()); 
                    drp.setEndDate(moment());
                }
                // 2️⃣ 時間重置為 12:00
                resetTimeSelect(el);
                el.querySelector('.time-select-h').value = '12';
                el.querySelector('.time-select-m').value = '00';
            } else if(el.dataset.settime === "0800") {
                // 1️⃣ 日期設為今天
                $dateInput.val(moment().format('YYYY/MM/DD'));
                
                // 同步內部值
                if (drp) {
                    drp.setStartDate(moment()); 
                    drp.setEndDate(moment());
                }
                // 2️⃣ 時間重置為 08:00
                resetTimeSelect(el);
                el.querySelector('.time-select-h').value = '08';
                el.querySelector('.time-select-m').value = '00';
            } else if(el.dataset.settime === "GMT+8") {
                // 1️⃣ 日期設為後端給予的值
            }
            
        });

        /* ========= SET NOW ========= */
        setNowBtn.addEventListener('click', (e) => {
            e.preventDefault();

            const dateInput = el.querySelector('.pick-single-date');
            const now = moment();

            if (dateInput) {
                const $dateInput = $(dateInput);
                const drp = $dateInput.data('daterangepicker');

                if (drp) {
                    drp.setStartDate(now);
                    drp.setEndDate(now);
                }

                $dateInput.val(now.format('YYYY/MM/DD'));
            }

            // 同步時間下拉
            const hSelect = el.querySelector('.time-select-h');
            const mSelect = el.querySelector('.time-select-m');

            if (hSelect) hSelect.value = String(now.hour()).padStart(2, '0');
            if (mSelect) mSelect.value = String(now.minute()).padStart(2, '0');
        });
    });

    // 初始化所有時間下拉選單
    initializeTimeSelects();
});

// 初始化時間下拉選單
function initializeTimeSelects() {
    const hourSelectDropdowns = document.querySelectorAll('.time-select-h');
    const minuteSelectDropdowns = document.querySelectorAll('.time-select-m');

    hourSelectDropdowns.forEach(el => {
        el.innerHTML = renderSelectRange(24);
        setDefaultHourValue(el);
    });

    minuteSelectDropdowns.forEach(el => {
        el.innerHTML = renderSelectRange(60);
    });
}

// 重置時間下拉選單
function resetTimeSelect(container) {
    const hourSelect = container.querySelector('.time-select-h');
    const minSelect = container.querySelector('.time-select-m');

    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMin = String(now.getMinutes()).padStart(2, '0');

    // if (hourSelect) {
    //     if (hourSelect.dataset.reset === "0800") {
    //         hourSelect.value = '08';
    //     } else if (hourSelect.dataset.reset === "1200") {
    //         hourSelect.value = '12';
    //     } else if (hourSelect.dataset.reset === "now") {
    //         hourSelect.value = currentHour;
    //         if (minSelect) minSelect.value = currentMin;
    //         return;
    //     } else {
    //         hourSelect.value = '00';
    //     }
    // }
    // if (minSelect) minSelect.value = '00';
}

// 設定預設小時值
function setDefaultHourValue(el) {
    if (el.dataset.reset === "0800") {
        el.value = '08';
    } else if (el.dataset.reset === "1200") {
        el.value = '12';
    }
}

// 產生下拉選單的選項
function renderSelectRange(max) {
    return Array.from({ length: max }, (_, i) => {
        const val = String(i).padStart(2, '0');
        return `<option value="${val}">${val}</option>`;
    }).join('');
}

// End of 填寫時間函式 ==================================================