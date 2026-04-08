/**
 * 預約系統後端 — Google Apps Script (Code.gs)
 * =============================================
 *
 * 部署步驟:
 *  1. 建立一個新的 Google 試算表（用來儲存所有預約紀錄）
 *  2. 在試算表裡：擴充功能 → Apps Script
 *  3. 將此檔案的所有程式碼貼入 Code.gs，覆蓋原有內容
 *  4. 修改下方 CONFIG 的三個欄位
 *  5. 點擊「部署」→「新增部署作業」
 *       類型        : 網頁應用程式
 *       執行身分    : 我 (Me)
 *       存取權      : 所有人 (Anyone)
 *  6. 首次部署需要授權 Google 帳號，請依提示完成
 *  7. 複製部署完成後的「網頁應用程式網址」
 *  8. 貼到 booking.html 的 CONFIG.SCRIPT_URL
 *  9. 確認 booking.html 的 CONFIG.PASSPHRASE 與下方 CONFIG.PASSPHRASE 相同
 */

// ─────────────────────────────────────────────────────────
//  設定區（必填）
// ─────────────────────────────────────────────────────────
const CONFIG = {
  PASSPHRASE:   'DaffyXDXDXD',
  OWNER_EMAIL:  'witch22306@gmail.com',
  OWNER_NAME:   '達菲',
  DURATION_MIN: 60,                     // ← 預設會議時長（分鐘），可自行修改
  SHEET_NAME:   'Bookings',
};
// ─────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════
//  HTTP 進入點
// ══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const d = e.parameter;
    if (d.passphrase !== CONFIG.PASSPHRASE) {
      return respond('Unauthorized');
    }
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

    if (!action || !id || !token) {
      return page('⚠️ 無效的連結', '', '#fffbeb');
    }
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

/**
 * 建立新預約：存入試算表 → 發通知 email 給你
 */
function createBooking(d) {
  const sheet = getSheet();
  const id    = 'BK' + Date.now();
  const token = Utilities.getUuid();
  const tz    = Session.getScriptTimeZone();
  const ts    = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');

  // 欄位順序：ID | 姓名 | Email | 日期 | 時間 | 目的 | 備註 | 狀態 | Token | 行事曆ID | 時間戳記
  sheet.appendRow([id, d.name, d.email, d.date, d.time,
                   d.purpose || '', d.notes || '',
                   'pending', token, '', ts]);

  const base        = ScriptApp.getService().getUrl();
  const approveLink = base + '?action=approve&id=' + id + '&token=' + token;
  const rejectLink  = base + '?action=reject&id='  + id + '&token=' + token;

  GmailApp.sendEmail(
    CONFIG.OWNER_EMAIL,
    '📅 新預約申請 | ' + d.name + '｜' + d.date + ' ' + d.time,
    /* plain text fallback */
    '新預約申請\n姓名: ' + d.name + '\nEmail: ' + d.email +
    '\n日期: ' + d.date + ' ' + d.time +
    '\n目的: ' + (d.purpose || '-') +
    '\n\n✓ 確認: ' + approveLink +
    '\n✗ 婉拒: ' + rejectLink,
    { htmlBody: notifyEmailHtml(d, id, approveLink, rejectLink), name: '預約系統' }
  );

  return respond('ok');
}

/**
 * 確認預約：建立 Google 行事曆事件 → 發確認 email 給對方
 */
function approveBooking(id, token) {
  const { sheet, row, ri } = findRow(id, token);
  if (!row)                 return page('❌ 找不到此預約', '請確認連結是否正確', '#fff5f5');
  if (row[7] !== 'pending') return page('⚠️ 此預約已處理過', '目前狀態: ' + row[7], '#fffbeb');

  // 建立行事曆事件
  const [yr, mo, dy] = row[3].split('-').map(Number);
  const [hr, mn]     = row[4].split(':').map(Number);
  const start = new Date(yr, mo - 1, dy, hr, mn);
  const end   = new Date(start.getTime() + CONFIG.DURATION_MIN * 60000);

  let eventId = '';
  try {
    const ev = CalendarApp.getDefaultCalendar().createEvent(
      '[預約] ' + row[1],
      start,
      end,
      {
        description: '預約人: ' + row[1] + '\nEmail: ' + row[2] +
                     '\n目的: ' + row[5] + '\n備註: ' + row[6],
        guests:      row[2],
        sendInvites: true,
      }
    );
    eventId = ev.getId();
  } catch (calErr) {
    console.error('Calendar error:', calErr);
  }

  // 更新試算表
  sheet.getRange(ri + 1, 8).setValue('approved'); // 狀態
  sheet.getRange(ri + 1, 10).setValue(eventId);   // 行事曆 ID

  // 發確認信
  GmailApp.sendEmail(
    row[2],
    '✅ 預約確認 | ' + row[3] + ' ' + row[4],
    '你的預約已確認！日期: ' + row[3] + ' ' + row[4] +
    '，時長: ' + CONFIG.DURATION_MIN + ' 分鐘。\nGoogle 行事曆邀請已寄出，請記得接受邀請。',
    { htmlBody: confirmEmailHtml(row, id), name: CONFIG.OWNER_NAME }
  );

  return page('✅ 已確認預約', '行事曆邀請已寄至 <b>' + row[2] + '</b>', '#f0fff4');
}

/**
 * 婉拒預約：更新狀態 → 發通知 email 給對方
 */
function rejectBooking(id, token) {
  const { sheet, row, ri } = findRow(id, token);
  if (!row)                 return page('❌ 找不到此預約', '請確認連結是否正確', '#fff5f5');
  if (row[7] !== 'pending') return page('⚠️ 此預約已處理過', '目前狀態: ' + row[7], '#fffbeb');

  sheet.getRange(ri + 1, 8).setValue('rejected');

  GmailApp.sendEmail(
    row[2],
    '📬 預約回覆 | ' + row[3] + ' ' + row[4],
    '很抱歉，你申請的時段 ' + row[3] + ' ' + row[4] + ' 目前無法安排，請嘗試其他時間。',
    { htmlBody: rejectEmailHtml(row, id), name: CONFIG.OWNER_NAME }
  );

  return page('已婉拒此預約', '通知已發送至 <b>' + row[2] + '</b>', '#fff5f5');
}


// ══════════════════════════════════════════════════════════
//  工具函式
// ══════════════════════════════════════════════════════════

/**
 * 依 ID + Token 找到預約列
 * 欄位索引（0-based，對應試算表欄位）:
 *  0:ID  1:姓名  2:Email  3:日期  4:時間  5:目的
 *  6:備註  7:狀態  8:Token  9:行事曆ID  10:時間戳記
 */
function findRow(id, token) {
  const sheet = getSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id && rows[i][8] === token) {
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
    sh.appendRow(['ID', '姓名', 'Email', '日期', '時間', '目的',
                  '備註', '狀態', 'Token', '行事曆ID', '時間戳記']);
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, 11, [140, 80, 160, 80, 60, 200, 140, 70, 280, 200, 150]);
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
  return '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:-apple-system,sans-serif">' +
  '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12)">' +
    '<div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:28px 32px;text-align:center">' +
      '<h2 style="margin:0;color:#fff;font-size:20px">📅 新預約申請</h2>' +
    '</div>' +
    '<div style="padding:28px 32px">' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
        '<tr><td style="padding:7px 0;color:#888;white-space:nowrap;width:55px">姓名</td><td style="padding:7px 0;font-weight:600;color:#222">' + d.name + '</td></tr>' +
        '<tr><td style="padding:7px 0;color:#888">Email</td><td style="padding:7px 0;color:#222">' + d.email + '</td></tr>' +
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

function confirmEmailHtml(row, id) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:-apple-system,sans-serif">' +
  '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12)">' +
    '<div style="background:linear-gradient(135deg,#48bb78,#38a169);padding:28px;text-align:center">' +
      '<h2 style="margin:0;color:#fff;font-size:20px">✅ 預約已確認!</h2>' +
    '</div>' +
    '<div style="padding:28px;text-align:center">' +
      '<p style="font-size:15px;color:#333;margin-bottom:20px">嗨 ' + row[1] + '，你的預約已通過審核！</p>' +
      '<div style="background:#f0fff4;border-radius:12px;padding:18px;text-align:left;font-size:14px">' +
        '<p style="margin:6px 0"><b>📅 日期:</b> ' + row[3] + '</p>' +
        '<p style="margin:6px 0"><b>⏰ 時間:</b> ' + row[4] + '</p>' +
        '<p style="margin:6px 0"><b>⏱ 時長:</b> ' + CONFIG.DURATION_MIN + ' 分鐘</p>' +
      '</div>' +
      '<p style="color:#666;font-size:13px;margin-top:16px">Google 行事曆邀請已寄至你的 Email，請記得接受邀請 📆</p>' +
      '<p style="color:#ccc;font-size:11px;margin-top:12px">預約編號: ' + id + '</p>' +
    '</div>' +
  '</div></body></html>';
}

function rejectEmailHtml(row, id) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:-apple-system,sans-serif">' +
  '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12)">' +
    '<div style="background:linear-gradient(135deg,#a0aec0,#718096);padding:28px;text-align:center">' +
      '<h2 style="margin:0;color:#fff;font-size:20px">📬 預約時段通知</h2>' +
    '</div>' +
    '<div style="padding:28px;text-align:center">' +
      '<p style="font-size:15px;color:#333;margin-bottom:16px">嗨 ' + row[1] + '，</p>' +
      '<p style="color:#555;line-height:1.7;font-size:14px">很抱歉，你申請的時段 <b>' + row[3] + ' ' + row[4] + '</b><br>目前 ' + CONFIG.OWNER_NAME + ' 無法安排，請試試其他時間！</p>' +
      '<p style="color:#ccc;font-size:11px;margin-top:20px">預約編號: ' + id + '</p>' +
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
