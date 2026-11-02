// =============================================================
// DataTables
// =============================================================
function initDataTable() {
    $('#reportListTable').DataTable({
        lengthChange: false,
        searching: false,
        autoWidth: false,
        pageLength: 10,
                paging: true,
        order: [],
        responsive: true,
        info: true,
        processing:  true,
        destroy: true,
        orderable: false, 
        searchable: false,
    language: {
        processing: '<i class="fa fa-spinner fa-spin fa-3x fa-fw"></i>',
        info: '顯示第 _START_ 到第 _END_ 筆，共 _TOTAL_ 筆資料',
        lengthMenu: '每頁顯示 _MENU_ 筆資料',
        paginate: { previous: '上一頁', next: '下一頁' }
    },
    columnDefs: [
        { targets: [0, -1], orderable: false },
        { targets: [], className: 'text-xl-end pe-4' },
        { targets: [0, 1, 2, -2, -1], responsivePriority: 1 },
        { targets: [4, 5], responsivePriority: 2 },
    ],
    columns: [
        { width: '1px' },
        { width: '100px'  },  //船報類型
        { width: '100px' },  //船名
        { width: '150px' },  //航次
        { width: '100px' },  //填寫人
        { width: '150px' },  //最後修改時間
        { width: '60px' },  //同步狀態
        { width: '60px' },  //操作
    ]
    });
}

// =============================================================
// Daterangepicker
// =============================================================
function initDaterangepicker() {
    // Daterangepicker 初始化
    $('#pickDateRange').daterangepicker({
        opens: 'left',
        autoUpdateInput: false,
        locale: {
        format: 'YYYY/MM/DD',   // 每個日期的格式
        separator: ' - ',  // 連接格式
        cancelLabel: '清除'    
        }
    });
    
    // 使用者選定日期後，手動寫入
    $('#pickDateRange').on('apply.daterangepicker', function(ev, picker) {
        $(this).val(picker.startDate.format('YYYY/MM/DD') + ' - ' + picker.endDate.format('YYYY/MM/DD'));
    });

    // 使用者點「清除」時，恢復為空值 → placeholder 會再出現
    $('#pickDateRange').on('cancel.daterangepicker', function(ev, picker) {
        $(this).val('');
    });
}
$(function() {
    initDataTable();
    initDaterangepicker();
});
