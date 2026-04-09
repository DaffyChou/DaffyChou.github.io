/**
 * 預約系統後端 — Google Apps Script (Code.gs)
 * =============================================
 * 部署步驟:
 *  1. 在 Google 試算表：擴充功能 → Apps Script
 *  2. 貼入此檔案內容，覆蓋 Code.gs，Ctrl+S 儲存
 *  3. 部署 → 管理部署作業 → 鉛筆 → 建立新版本 → 部署
 */

// ─────────────────────────────────────────────────────────
//  設定區
// ─────────────────────────────────────────────────────────
const CONFIG = {
  OWNER_EMAIL:    'witch22306@gmail.com',
  OWNER_NAME:     '達菲',
  DURATION_MIN:   60,
  SHEET_NAME:     'Bookings',
  CONTACTS_SHEET: 'Contacts',
  ADMIN_PASSWORD: 'YOUR_ADMIN_PW',   // ← 改成你的管理員密碼（用於 admin.html 登入）
};
// ─────────────────────────────────────────────────────────

/*
 * Bookings 欄位（0-based）:
 *   0:ID 1:姓名 2:電話 3:LINE 4:日期 5:時間 6:目的 7:備註 8:狀態 9:Token 10:行事曆ID 11:時間戳記
 *
 * Contacts 欄位（0-based）:
 *   0:ID 1:名字 2:密語 3:電話 4:LINE ID 5:啟用 6:建立時間
 */


// ══════════════════════════════════════════════════════════
//  HTTP 進入點
// ══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const d = e.parameter;
    if (!getContactByPassphrase(d.passphrase)) return respond('Unauthorized');
    return createBooking(d);
  } catch (err) {
    console.error('doPost:', err);
    return respond('Error: ' + err.message);
  }
}

function doGet(e) {
  try {
    const p      = e.parameter;
    const action = p.action;

    // HTML 頁面操作
    if (action === 'approve') return approveBooking(p.id, p.token);
    if (action === 'reject')  return rejectBooking(p.id, p.token);

    // JSON API — 聯絡人驗證
    if (action === 'getContact')    return jsonRes(apiGetContact(p));

    // JSON API — 管理員操作（聯絡人）
    if (action === 'listContacts')     return jsonRes(apiListContacts(p));
    if (action === 'addContact')       return jsonRes(apiAddContact(p));
    if (action === 'updateContact')    return jsonRes(apiUpdateContact(p));
    if (action === 'deleteContact')    return jsonRes(apiDeleteContact(p));
    if (action === 'toggleContact')    return jsonRes(apiToggleContact(p));
    // JSON API — 管理員操作（預約）
    if (action === 'listBookings')     return jsonRes(apiListBookings(p));
    if (action === 'approveBookingApi') return jsonRes(apiApproveBooking(p));
    if (action === 'rejectBookingApi')  return jsonRes(apiRejectBooking(p));

    return page('⚠️ 無效的連結', '', '#fffbeb');
  } catch (err) {
    console.error('doGet:', err);
    return page('❌ 發生錯誤', err.message, '#fff5f5');
  }
}


// ══════════════════════════════════════════════════════════
//  預約邏輯
// ══════════════════════════════════════════════════════════

function createBooking(d) {
  const sheet = getBookingsSheet();
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
    '\n\n確認: ' + approveLink +
    '\n婉拒: ' + rejectLink,
    { htmlBody: notifyEmailHtml(d, id, approveLink, rejectLink), name: '預約系統' }
  );

  return respond('ok');
}

function approveBooking(id, token) {
  const { sheet, row, ri } = findBookingRow(id, token);
  if (!row)                 return page('找不到此預約', '請確認連結是否正確', '#fff5f5');
  if (row[8] !== 'pending') return page('此預約已處理過', '目前狀態: ' + row[8], '#fffbeb');

  const tz      = Session.getScriptTimeZone();
  const dateStr = (row[4] instanceof Date)
    ? Utilities.formatDate(row[4], tz, 'yyyy-MM-dd') : String(row[4]);
  const timeStr = (row[5] instanceof Date)
    ? Utilities.formatDate(row[5], tz, 'HH:mm') : String(row[5]);

  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const [hr, mn]     = timeStr.split(':').map(Number);
  const start = new Date(yr, mo - 1, dy, hr, mn);
  const end   = new Date(start.getTime() + CONFIG.DURATION_MIN * 60000);

  const ev = CalendarApp.getDefaultCalendar().createEvent(
    '[預約] ' + row[1], start, end,
    {
      description:
        '預約人: ' + row[1] +
        (row[2] ? '\n電話: '    + row[2] : '') +
        (row[3] ? '\nLINE ID: ' + row[3] : '') +
        '\n目的: ' + row[6] +
        (row[7] ? '\n備註: '    + row[7] : ''),
    }
  );

  sheet.getRange(ri + 1, 9).setValue('approved');
  sheet.getRange(ri + 1, 11).setValue(ev.getId());

  const contact = [row[2] ? '電話 ' + row[2] : '', row[3] ? 'LINE ' + row[3] : '']
                    .filter(Boolean).join('、') || '（對方未留聯絡方式）';

  return page('✅ 已確認預約', '行事曆事件已建立<br>記得聯絡對方：' + contact, '#f0fff4');
}

function rejectBooking(id, token) {
  const { sheet, row, ri } = findBookingRow(id, token);
  if (!row)                 return page('找不到此預約', '請確認連結是否正確', '#fff5f5');
  if (row[8] !== 'pending') return page('此預約已處理過', '目前狀態: ' + row[8], '#fffbeb');

  sheet.getRange(ri + 1, 9).setValue('rejected');

  const contact = [row[2] ? '電話 ' + row[2] : '', row[3] ? 'LINE ' + row[3] : '']
                    .filter(Boolean).join('、') || '（對方未留聯絡方式）';

  return page('已婉拒此預約', '記得告知對方：' + contact, '#fff5f5');
}


// ══════════════════════════════════════════════════════════
//  預約 API（管理後台用）
// ══════════════════════════════════════════════════════════

function apiListBookings(p) {
  if (!checkAdmin(p)) return { ok: false, error: '密碼錯誤' };
  const tz   = Session.getScriptTimeZone();
  const rows = getBookingsSheet().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const dateStr = (rows[i][4] instanceof Date)
      ? Utilities.formatDate(rows[i][4], tz, 'yyyy-MM-dd') : String(rows[i][4]);
    const timeStr = (rows[i][5] instanceof Date)
      ? Utilities.formatDate(rows[i][5], tz, 'HH:mm') : String(rows[i][5]);
    list.push({
      id:      rows[i][0],
      name:    rows[i][1],
      phone:   rows[i][2],
      line:    rows[i][3],
      date:    dateStr,
      time:    timeStr,
      purpose: rows[i][6],
      notes:   rows[i][7],
      status:  rows[i][8],
      token:   rows[i][9],
      calId:   rows[i][10],
      ts:      rows[i][11],
    });
  }
  // 最新的排最前面
  list.reverse();
  return { ok: true, bookings: list };
}

function apiApproveBooking(p) {
  if (!checkAdmin(p)) return { ok: false, error: '密碼錯誤' };
  if (!p.id || !p.token) return { ok: false, error: '缺少參數' };

  const { sheet, row, ri } = findBookingRow(p.id, p.token);
  if (!row)                 return { ok: false, error: '找不到此預約' };
  if (row[8] !== 'pending') return { ok: false, error: '此預約已處理過（' + row[8] + '）' };

  const tz      = Session.getScriptTimeZone();
  const dateStr = (row[4] instanceof Date)
    ? Utilities.formatDate(row[4], tz, 'yyyy-MM-dd') : String(row[4]);
  const timeStr = (row[5] instanceof Date)
    ? Utilities.formatDate(row[5], tz, 'HH:mm') : String(row[5]);

  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const [hr, mn]     = timeStr.split(':').map(Number);
  const start = new Date(yr, mo - 1, dy, hr, mn);
  const end   = new Date(start.getTime() + CONFIG.DURATION_MIN * 60000);

  const ev = CalendarApp.getDefaultCalendar().createEvent(
    '[預約] ' + row[1], start, end,
    {
      description:
        '預約人: ' + row[1] +
        (row[2] ? '\n電話: '    + row[2] : '') +
        (row[3] ? '\nLINE ID: ' + row[3] : '') +
        '\n目的: ' + row[6] +
        (row[7] ? '\n備註: '    + row[7] : ''),
    }
  );

  sheet.getRange(ri + 1, 9).setValue('approved');
  sheet.getRange(ri + 1, 11).setValue(ev.getId());
  return { ok: true };
}

function apiRejectBooking(p) {
  if (!checkAdmin(p)) return { ok: false, error: '密碼錯誤' };
  if (!p.id || !p.token) return { ok: false, error: '缺少參數' };

  const { sheet, row, ri } = findBookingRow(p.id, p.token);
  if (!row)                 return { ok: false, error: '找不到此預約' };
  if (row[8] !== 'pending') return { ok: false, error: '此預約已處理過（' + row[8] + '）' };

  sheet.getRange(ri + 1, 9).setValue('rejected');
  return { ok: true };
}


// ══════════════════════════════════════════════════════════
//  聯絡人 API
// ══════════════════════════════════════════════════════════

function apiGetContact(p) {
  if (!p.passphrase) return { ok: false };
  const c = getContactByPassphrase(p.passphrase);
  if (!c) return { ok: false };
  return { ok: true, name: c.name, phone: c.phone, line: c.line };
}

function apiListContacts(p) {
  if (!checkAdmin(p)) return { ok: false, error: '密碼錯誤' };
  const rows     = getContactsSheet().getDataRange().getValues();
  const contacts = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    contacts.push({
      id:         rows[i][0],
      name:       rows[i][1],
      passphrase: rows[i][2],
      phone:      rows[i][3],
      line:       rows[i][4],
      enabled:    rows[i][5],
    });
  }
  return { ok: true, contacts };
}

function apiAddContact(p) {
  if (!checkAdmin(p))              return { ok: false, error: '密碼錯誤' };
  if (!p.name || !p.passphrase)   return { ok: false, error: '名字和密語為必填' };

  const sheet = getContactsSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === p.passphrase && rows[i][5] === true) {
      return { ok: false, error: '此密語已被使用' };
    }
  }

  const id = 'CON' + Date.now();
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([id, p.name, p.passphrase, p.phone || '', p.line || '', true, ts]);
  return { ok: true, id };
}

function apiUpdateContact(p) {
  if (!checkAdmin(p)) return { ok: false, error: '密碼錯誤' };
  if (!p.id)          return { ok: false, error: '缺少 ID' };

  const sheet = getContactsSheet();
  const rows  = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== p.id) continue;

    // 密語唯一性檢查
    if (p.passphrase) {
      for (let j = 1; j < rows.length; j++) {
        if (j !== i && rows[j][2] === p.passphrase && rows[j][5] === true) {
          return { ok: false, error: '此密語已被其他人使用' };
        }
      }
      sheet.getRange(i + 1, 3).setValue(p.passphrase);
    }
    if (p.name  !== undefined && p.name  !== '') sheet.getRange(i + 1, 2).setValue(p.name);
    if (p.phone !== undefined) sheet.getRange(i + 1, 4).setValue(p.phone);
    if (p.line  !== undefined) sheet.getRange(i + 1, 5).setValue(p.line);
    return { ok: true };
  }
  return { ok: false, error: '找不到此聯絡人' };
}

function apiDeleteContact(p) {
  if (!checkAdmin(p)) return { ok: false, error: '密碼錯誤' };
  const sheet = getContactsSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === p.id) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: '找不到此聯絡人' };
}

function apiToggleContact(p) {
  if (!checkAdmin(p)) return { ok: false, error: '密碼錯誤' };
  const sheet = getContactsSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === p.id) {
      const newVal = !rows[i][5];
      sheet.getRange(i + 1, 6).setValue(newVal);
      return { ok: true, enabled: newVal };
    }
  }
  return { ok: false, error: '找不到此聯絡人' };
}


// ══════════════════════════════════════════════════════════
//  工具函式
// ══════════════════════════════════════════════════════════

function getContactByPassphrase(passphrase) {
  if (!passphrase) return null;
  const rows = getContactsSheet().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === passphrase && rows[i][5] === true) {
      return { id: rows[i][0], name: rows[i][1], phone: rows[i][3], line: rows[i][4] };
    }
  }
  return null;
}

function checkAdmin(p) {
  return p.adminpw === CONFIG.ADMIN_PASSWORD;
}

function getBookingsSheet() {
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

function getContactsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh   = ss.getSheetByName(CONFIG.CONTACTS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.CONTACTS_SHEET);
    sh.appendRow(['ID', '名字', '密語', '電話', 'LINE ID', '啟用', '建立時間']);
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, 7, [140, 80, 130, 110, 120, 60, 150]);
  }
  return sh;
}

function findBookingRow(id, token) {
  const sheet = getBookingsSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id && rows[i][9] === token) {
      return { sheet, row: rows[i], ri: i };
    }
  }
  return { sheet, row: null, ri: -1 };
}

function respond(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

function jsonRes(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
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


// ══════════════════════════════════════════════════════════
//  Email 模板
// ══════════════════════════════════════════════════════════

function notifyEmailHtml(d, id, approveLink, rejectLink) {
  const contactRows =
    (d.phone ? '<tr><td style="padding:7px 0;color:#888;white-space:nowrap;width:65px">電話</td><td style="padding:7px 0;font-weight:600;color:#222">' + d.phone + '</td></tr>' : '') +
    (d.line  ? '<tr><td style="padding:7px 0;color:#888">LINE ID</td><td style="padding:7px 0;font-weight:600;color:#222">' + d.line  + '</td></tr>' : '');

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
        '<a href="' + approveLink + '" style="flex:1;display:block;text-align:center;padding:14px;background:#48bb78;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">確認接受</a>' +
        '<a href="' + rejectLink  + '" style="flex:1;display:block;text-align:center;padding:14px;background:#fc8181;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">婉拒</a>' +
      '</div>' +
      '<p style="text-align:center;color:#ccc;font-size:11px;margin-top:14px">預約編號: ' + id + '</p>' +
    '</div>' +
  '</div></body></html>';
}
