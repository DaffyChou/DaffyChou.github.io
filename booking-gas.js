/**
 * 預約系統後端 — Google Apps Script (Code.gs)
 * =============================================
 *
 * 部署步驟:
 *  1. 建立一個新的 Google 試算表（用來儲存所有預約紀錄）
 *  2. 在試算表裡：擴充功能 → Apps Script
 *  3. 將此檔案的所有程式碼貼入 Code.gs，覆蓋原有內容
 *  4. 修改下方 CONFIG 的設定
 *  5. 點擊「部署」→「新增部署作業」
 *       類型        : 網頁應用程式
 *       執行身分    : 我 (Me)
 *       存取權      : 所有人 (Anyone)
 *  6. 首次部署需要授權，依提示完成
 *  7. 複製部署網址 → 貼到 booking.html 的 SCRIPT_URL
 */

// ─────────────────────────────────────────────────────────
//  設定區
// ─────────────────────────────────────────────────────────
const CONFIG = {
  PASSPHRASE:   'DaffyXDXDXD',
  OWNER_EMAIL:  'witch22306@gmail.com',
  OWNER_NAME:   '達菲',
  DURATION_MIN: 60,           // 預設會議時長（分鐘），可自行修改
  SHEET_NAME:   'Bookings',
};
// ─────────────────────────────────────────────────────────

/*
 * 試算表欄位結構（0-based index）:
 *  0:ID  1:姓名  2:電話  3:LINE ID  4:日期  5:時間
 *  6:目的  7:備註  8:狀態  9:Token  10:行事曆ID  11:時間戳記
 */


// ══════════════════════════════════════════════════════════
//  HTTP 進入點
// ══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const d = e.parameter;
    if (d.passphrase !== CONFIG.PASSPHRASE) return respond('Unauthorized');
    return createBooking(d);
  } catch (err) {
    console.error('doPost error:', err);
    return respond('Error: ' + err.message);
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const id     = e.parameter.id;
    const token  = e.parameter.token;
    if (!action || !id || !token) return page('⚠️ 無效的連結', '', '#fffbeb');
    if (action === 'approve') return approveBooking(id, token);
    if (action === 'reject')  return rejectBooking(id, token);
    return page('⚠️ 未知操作', '', '#fffbeb');
  } catch (err) {
    console.error('doGet error:', err);
    return page('❌ 發生錯誤', err.message, '#fff5f5');
  }
}


// ══════════════════════════════════════════════════════════
//  核心邏輯
// ══════════════════════════════════════════════════════════

/** 建立新預約：存入試算表 → 發通知 email 給你 */
function createBooking(d) {
  const sheet = getSheet();
  const id    = 'BK' + Date.now();
  const token = Utilities.getUuid();
  const tz    = Session.getScriptTimeZone();
  const ts    = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    id, d.name, d.phone || '', d.line || '',
    d.date, d.time, d.purpose || '', d.notes || '',
    'pending', token, '', ts
  ]);

  const base        = ScriptApp.getService().getUrl();
  const approveLink = base + '?action=approve&id=' + id + '&token=' + token;
  const rejectLink  = base + '?action=reject&id='  + id + '&token=' + token;

  GmailApp.sendEmail(
    CONFIG.OWNER_EMAIL,
    '【新預約申請】' + d.name + '｜' + d.date + ' ' + d.time,
    '新預約\n姓名: ' + d.name +
    (d.phone ? '\n電話: ' + d.phone : '') +
    (d.line  ? '\nLINE: ' + d.line  : '') +
    '\n日期: ' + d.date + ' ' + d.time +
    '\n目的: ' + (d.purpose || '-') +
    '\n\n✓ 確認: ' + approveLink +
    '\n✗ 婉拒: ' + rejectLink,
    { htmlBody: notifyEmailHtml(d, id, approveLink, rejectLink), name: '預約系統' }
  );

  return respond('ok');
}

/** 確認預約：建立 Google 行事曆事件 */
function approveBooking(id, token) {
  const { sheet, row, ri } = findRow(id, token);
  if (!row)                 return page('❌ 找不到此預約', '請確認連結是否正確', '#fff5f5');
  if (row[8] !== 'pending') return page('⚠️ 此預約已處理過', '目前狀態: ' + row[8], '#fffbeb');

  // 建立行事曆事件（0:ID 1:姓名 2:電話 3:LINE 4:日期 5:時間 6:目的 7:備註）
  // Sheets 會把日期、時間欄位自動轉成 Date 物件，需先轉回字串
  const tz      = Session.getScriptTimeZone();
  const dateStr = (row[4] instanceof Date)
    ? Utilities.formatDate(row[4], tz, 'yyyy-MM-dd')
    : String(row[4]);
  const timeStr = (row[5] instanceof Date)
    ? Utilities.formatDate(row[5], tz, 'HH:mm')
    : String(row[5]);

  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const [hr, mn]     = timeStr.split(':').map(Number);
  const start = new Date(yr, mo - 1, dy, hr, mn);
  const end   = new Date(start.getTime() + CONFIG.DURATION_MIN * 60000);

  const ev = CalendarApp.getDefaultCalendar().createEvent(
    '[預約] ' + row[1],
    start, end,
    {
      description:
        '預約人: ' + row[1] +
        (row[2] ? '\n電話: '    + row[2] : '') +
        (row[3] ? '\nLINE ID: ' + row[3] : '') +
        '\n目的: ' + row[6] +
        (row[7] ? '\n備註: '    + row[7] : ''),
    }
  );
  const eventId = ev.getId();

  // 更新試算表
  sheet.getRange(ri + 1, 9).setValue('approved');
  sheet.getRange(ri + 1, 11).setValue(eventId);

  const contact = [row[2] ? '電話 ' + row[2] : '', row[3] ? 'LINE ' + row[3] : '']
                    .filter(Boolean).join('、') || '（對方未留聯絡方式）';

  return page('✅ 已確認預約', '行事曆事件已建立<br>記得聯絡對方：' + contact, '#f0fff4');
}

/** 婉拒預約：更新狀態 */
function rejectBooking(id, token) {
  const { sheet, row, ri } = findRow(id, token);
  if (!row)                 return page('❌ 找不到此預約', '請確認連結是否正確', '#fff5f5');
  if (row[8] !== 'pending') return page('⚠️ 此預約已處理過', '目前狀態: ' + row[8], '#fffbeb');

  sheet.getRange(ri + 1, 9).setValue('rejected');

  const contact = [row[2] ? '電話 ' + row[2] : '', row[3] ? 'LINE ' + row[3] : '']
                    .filter(Boolean).join('、') || '（對方未留聯絡方式）';

  return page('已婉拒此預約', '記得告知對方：' + contact, '#fff5f5');
}


// ══════════════════════════════════════════════════════════
//  工具函式
// ══════════════════════════════════════════════════════════

/**
 * 依 ID + Token 找到預約列
 * 欄位 9（index）= Token
 */
function findRow(id, token) {
  const sheet = getSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id && rows[i][9] === token) {
      return { sheet: sheet, row: rows[i], ri: i };
    }
  }
  return { sheet: sheet, row: null, ri: -1 };
}

/** 取得（或建立）試算表頁籤 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh   = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.appendRow(['ID', '姓名', '電話', 'LINE ID', '日期', '時間',
                  '目的', '備註', '狀態', 'Token', '行事曆ID', '時間戳記']);
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, 12, [140, 80, 110, 120, 80, 60, 200, 140, 70, 280, 200, 150]);
  }
  return sh;
}

function respond(text) {
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.TEXT);
}


// ══════════════════════════════════════════════════════════
//  Email 模板
// ══════════════════════════════════════════════════════════

function notifyEmailHtml(d, id, approveLink, rejectLink) {
  const contactRows =
    (d.phone ? '<tr><td style="padding:7px 0;color:#888;white-space:nowrap;width:65px">電話</td><td style="padding:7px 0;font-weight:600;color:#222">' + d.phone + '</td></tr>' : '') +
    (d.line  ? '<tr><td style="padding:7px 0;color:#888">LINE ID</td><td style="padding:7px 0;font-weight:600;color:#222">' + d.line + '</td></tr>' : '');

  return '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:-apple-system,sans-serif">' +
  '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12)">' +
    '<div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:28px 32px;text-align:center">' +
      '<h2 style="margin:0;color:#fff;font-size:20px">新預約申請</h2>' +
    '</div>' +
    '<div style="padding:28px 32px">' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
        '<tr><td style="padding:7px 0;color:#888;white-space:nowrap;width:65px">姓名</td><td style="padding:7px 0;font-weight:600;color:#222">' + d.name + '</td></tr>' +
        contactRows +
        '<tr><td style="padding:7px 0;color:#888">日期</td><td style="padding:7px 0;color:#222">' + d.date + '</td></tr>' +
        '<tr><td style="padding:7px 0;color:#888">時間</td><td style="padding:7px 0;color:#222">' + d.time + '</td></tr>' +
        '<tr><td style="padding:7px 0;color:#888">目的</td><td style="padding:7px 0;color:#222">' + (d.purpose || '-') + '</td></tr>' +
        (d.notes ? '<tr><td style="padding:7px 0;color:#888">備註</td><td style="padding:7px 0;color:#222">' + d.notes + '</td></tr>' : '') +
      '</table>' +
      '<div style="margin-top:28px;display:flex;gap:12px">' +
        '<a href="' + approveLink + '" style="flex:1;display:block;text-align:center;padding:14px;background:#48bb78;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">✓ 確認接受</a>' +
        '<a href="' + rejectLink  + '" style="flex:1;display:block;text-align:center;padding:14px;background:#fc8181;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">✗ 婉拒</a>' +
      '</div>' +
      '<p style="text-align:center;color:#ccc;font-size:11px;margin-top:14px">預約編號: ' + id + '</p>' +
    '</div>' +
  '</div></body></html>';
}

function page(title, detail, bg) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f2f5;font-family:-apple-system,sans-serif}' +
    '.box{background:' + (bg || '#fff') + ';border-radius:18px;padding:40px 36px;text-align:center;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,.12)}' +
    'h2{font-size:22px;margin-bottom:12px;color:#222}p{color:#666;font-size:14px;line-height:1.6}small{display:block;margin-top:20px;color:#bbb;font-size:12px}</style>' +
    '</head><body><div class="box"><h2>' + title + '</h2><p>' + detail + '</p><small>你可以關閉此視窗</small></div></body></html>'
  );
}
