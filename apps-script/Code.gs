/**
 * Balderton Badminton Club — Backend
 * Google Apps Script Web App
 *
 * KC's setup steps:
 *   1. Create Google Sheet at https://sheets.new (name it "Balderton BC")
 *   2. Extensions → Apps Script → paste this whole file → Save
 *   3. Deploy → New deployment → Web app → Execute as "Me" → Who has access "Anyone" → Deploy
 *   4. Copy the Web App URL → paste into index.html + admin.html (search "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE")
 *   5. Send Hermes the URL in Telegram DM
 */

// ============================================================
// CONFIG
// ============================================================
const ADMIN_PASSWORD = 'CHANGE_ME_TO_A_STRONG_PASSWORD';  // <-- KC sets this

const SHEET_NAMES = {
  MEMBERS: 'Members',
  SESSIONS: 'Sessions',
  ATTENDANCE: 'Attendance',
  ACTIVITY: 'Activity',
};

// ============================================================
// ENTRY POINTS
// ============================================================

/**
 * HTTP GET — fetch all data (members, sessions, attendance, activity)
 * Optional: ?pw=ADMIN_PASSWORD for admin access
 */
function doGet(e) {
  try {
    const isAdmin = e && e.parameter && e.parameter.pw === ADMIN_PASSWORD;
    if (e && e.parameter.pw && !isAdmin) {
      return jsonResponse({ error: 'invalid_password' });
    }

    ensureSheetsExist();
    const data = {
      members: readSheet(SHEET_NAMES.MEMBERS),
      sessions: readSheet(SHEET_NAMES.SESSIONS),
      attendance: readSheet(SHEET_NAMES.ATTENDANCE),
    };
    if (isAdmin) {
      data.activity = readSheet(SHEET_NAMES.ACTIVITY).reverse().slice(0, 50);
    }
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

/**
 * HTTP POST — write actions (RSVP, add session, add member)
 * Body: JSON { action, ...args, admin_pw? }
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    switch (action) {
      case 'rsvp':
        return jsonResponse(handleRsvp(body));
      case 'add_session':
        requireAdmin(body);
        return jsonResponse(handleAddSession(body));
      case 'add_member':
        requireAdmin(body);
        return jsonResponse(handleAddMember(body));
      default:
        return jsonResponse({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================================
// HANDLERS
// ============================================================

function handleRsvp(body) {
  const { member_id, member_name, session_id, status } = body;
  if (!member_id || !session_id || !status) {
    return { success: false, error: 'Missing required fields' };
  }
  if (!['yes', 'no', 'maybe'].includes(status)) {
    return { success: false, error: 'Invalid status (must be yes/no/maybe)' };
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ATTENDANCE);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Find existing row for this (member_id, session_id)
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][headers.indexOf('member_id')] === member_id &&
        data[i][headers.indexOf('session_id')] === session_id) {
      rowIndex = i + 1; // 1-indexed for sheet
      break;
    }
  }

  const now = new Date().toISOString();
  if (rowIndex > 0) {
    // Update existing
    sheet.getRange(rowIndex, headers.indexOf('status') + 1).setValue(status);
    sheet.getRange(rowIndex, headers.indexOf('updated_at') + 1).setValue(now);
  } else {
    // Append new row
    sheet.appendRow([member_id, session_id, status, now]);
  }

  // Log activity
  logActivity(member_id, member_name, session_id, status);

  return { success: true };
}

function handleAddSession(body) {
  const { title, date, time, court, location, max_spots } = body;
  if (!date || !time) {
    return { success: false, error: 'Missing date or time' };
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SESSIONS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');

  // Generate next session id
  let maxN = 0;
  for (let i = 1; i < data.length; i++) {
    const id = data[i][idCol];
    if (id && id.startsWith('s')) {
      const n = parseInt(id.slice(1), 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
  }
  const newId = 's' + String(maxN + 1).padStart(2, '0');

  sheet.appendRow([
    newId,
    date,
    time,
    court || '',
    location || '',
    max_spots || 12,
    new Date().toISOString(),
  ]);

  logActivity('admin', 'KC', newId, 'added_session');
  return { success: true, id: newId };
}

function handleAddMember(body) {
  const { name } = body;
  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Name required' };
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MEMBERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');

  let maxN = 0;
  for (let i = 1; i < data.length; i++) {
    const id = data[i][idCol];
    if (id && id.startsWith('m')) {
      const n = parseInt(id.slice(1), 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
  }
  const newId = 'm' + String(maxN + 1).padStart(2, '0');

  sheet.appendRow([newId, name.trim(), new Date().toISOString()]);

  logActivity('admin', 'KC', newId, 'added_member');
  return { success: true, id: newId };
}

// ============================================================
// HELPERS
// ============================================================

function requireAdmin(body) {
  if (!body.admin_pw || body.admin_pw !== ADMIN_PASSWORD) {
    throw new Error('Unauthorized: admin password required');
  }
}

function readSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function logActivity(memberId, memberName, sessionId, action) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ACTIVITY);
  const now = new Date();
  sheet.appendRow([
    now,
    memberId,
    memberName || '',
    sessionId,
    action,
  ]);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this ONCE after pasting into Apps Script to set up the sheet tabs.
 * Then you can delete this function (or leave it; it's safe to re-run).
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schemas = {
    [SHEET_NAMES.MEMBERS]: ['id', 'name', 'created_at'],
    [SHEET_NAMES.SESSIONS]: ['id', 'date', 'time', 'court', 'location', 'max_spots', 'created_at'],
    [SHEET_NAMES.ATTENDANCE]: ['member_id', 'session_id', 'status', 'updated_at'],
    [SHEET_NAMES.ACTIVITY]: ['timestamp', 'member_id', 'member_name', 'session_id', 'action'],
  };

  Object.keys(schemas).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    // Write headers
    sheet.getRange(1, 1, 1, schemas[name].length).setValues([schemas[name]]);
    sheet.getRange(1, 1, 1, schemas[name].length).setFontWeight('bold');
  });

  return 'Setup complete. Sheets: ' + Object.keys(schemas).join(', ');
}

/**
 * Ensure all required sheets exist (called automatically by doGet).
 * Safe to call repeatedly.
 */
function ensureSheetsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const required = [SHEET_NAMES.MEMBERS, SHEET_NAMES.SESSIONS, SHEET_NAMES.ATTENDANCE, SHEET_NAMES.ACTIVITY];
  const missing = required.filter(name => !ss.getSheetByName(name));
  if (missing.length > 0) {
    setupSheets();
  }
}

// ============================================================
// OPTIONAL: seed data helpers (run once)
// ============================================================

function seedDemoData() {
  // Requires you to be in the Sheet context. Don't run from Web App.
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Members
  const memberNames = [
    'Sarah Thompson', 'James Mitchell', 'Oliver Davies', 'Emily Roberts',
    'Harry Patel', 'Charlie Bennett', 'Sophie Clarke', 'Liam Walsh',
  ];
  const membersSheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
  const existing = membersSheet.getLastRow();
  if (existing <= 1) {
    memberNames.forEach((name, i) => {
      const id = 'm' + String(i + 1).padStart(2, '0');
      membersSheet.appendRow([id, name, new Date().toISOString()]);
    });
  }

  // Sessions (next 4 weeks, 3 per week)
  const sessionsSheet = ss.getSheetByName(SHEET_NAMES.SESSIONS);
  const existingSess = sessionsSheet.getLastRow();
  if (existingSess <= 1) {
    const today = new Date();
    let sId = 1;
    for (let week = 0; week < 4; week++) {
      const days = [
        { dow: 5, time: '20:00', title: 'Friday Night Social', max: 12 },  // Fri
        { dow: 6, time: '10:00', title: 'Saturday Morning Drills', max: 10 }, // Sat
        { dow: 0, time: '18:00', title: 'Sunday Evening Mixed Doubles', max: 12 }, // Sun
      ];
      days.forEach(d => {
        const d2 = new Date(today);
        d2.setDate(today.getDate() + week * 7 + ((d.dow - today.getDay() + 7) % 7));
        const dateStr = d2.toISOString().split('T')[0];
        const id = 's' + String(sId++).padStart(2, '0');
        sessionsSheet.appendRow([
          id, dateStr, d.time, 'Court 1', 'Newark Leisure Centre', d.max, new Date().toISOString(),
        ]);
      });
    }
  }

  return 'Seed data added. Check the Sheet.';
}
