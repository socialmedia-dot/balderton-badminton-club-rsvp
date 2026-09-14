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
  SETTINGS: 'Settings',
};

const SETTINGS_DEFAULTS = {
  recurring_enabled: 'on',       // 'on' = auto-create upcoming weekly session rows
  recurring_day: '1',            // 0=Sun 1=Mon ... 6=Sat
  recurring_start: '19:00',
  recurring_end: '21:00',
  recurring_max: '12',
  recurring_location: 'Newark Leisure Centre',
  court_price: '24',             // £ per court per session
  skip_dates: '',                // comma-separated YYYY-MM-DD (bank holidays etc)
};

function getSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const out = Object.assign({}, SETTINGS_DEFAULTS);
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) out[String(data[i][0])] = String(data[i][1]);
  }
  return out;
}

function handleSaveSettings(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
    sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]).setFontWeight('bold');
  }
  const allowed = Object.keys(SETTINGS_DEFAULTS);
  const existing = {};
  const last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, 2).getValues().forEach(function(r, idx) {
      if (r[0]) existing[String(r[0])] = idx + 2; // row number
    });
  }
  allowed.forEach(function(key) {
    if (body[key] === undefined) return;
    const val = String(body[key]);
    if (existing[key]) {
      sheet.getRange(existing[key], 2).setValue(val);
    } else {
      sheet.appendRow([key, val]);
    }
  });
  ensureRecurringSessions(); // regenerate upcoming rows for new schedule
  logActivity('admin', 'KC', 'settings', 'saved_settings');
  return { success: true };
}

function upcomingDatesForDay(dayNum, count) {
  const out = [];
  const today = new Date();
  const cur = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const delta = (Number(dayNum) - cur.getDay() + 7) % 7;
  for (let i = 0; i < count; i++) {
    const d = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + delta + i * 7);
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  return out;
}

function ensureRecurringSessions() {
  const s = getSettings();
  if (s.recurring_enabled !== 'on') return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.SESSIONS);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const ids = {};
  for (let i = 1; i < data.length; i++) { if (data[i][0]) ids[String(data[i][0])] = true; }
  const skips = (s.skip_dates || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean);
  const dates = upcomingDatesForDay(s.recurring_day, 26); // half-year horizon: 26 sessions
  const now = new Date().toISOString();
  dates.forEach(function(dateStr) {
    const id = 'rw-' + dateStr;
    if (ids[id]) return;               // already exists
    if (skips.indexOf(dateStr) !== -1) return; // KC deleted it on purpose
    sheet.appendRow([id, dateStr, s.recurring_start, 'Court 1', s.recurring_location, Number(s.recurring_max) || 12, now]);
  });
}

// ============================================================
// ENTRY POINTS
// ============================================================

/**
 * HTTP GET — fetch all data (members, sessions, attendance, activity)
 * Optional: ?pw=ADMIN_PASSWORD for admin access
 */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;

    // Mutation via GET (Apps Script POST is finicky — use GET with action param)
    if (action) {
      const body = Object.assign({}, e.parameter);  // flatten all params to body

      // RSVP is public (no admin auth required — members submit their own RSVPs)
      if (action === 'rsvp') {
        return jsonResponse(handleRsvp(body));
      }

      // Other mutations require admin password
      try { requireAdmin(body); } catch (err) {
        return jsonResponse({ success: false, error: err.message });
      }
      switch (action) {
        case 'add_member':
          return jsonResponse(handleAddMember(body));
        case 'add_session':
          return jsonResponse(handleAddSession(body));
        case 'delete_member':
          return jsonResponse(handleDeleteMember(body));
        case 'delete_session':
          return jsonResponse(handleDeleteSession(body));
        case 'save_settings':
          return jsonResponse(handleSaveSettings(body));
        default:
          return jsonResponse({ success: false, error: 'Unknown action: ' + action });
      }
    }

    const isAdmin = e && e.parameter && e.parameter.pw === ADMIN_PASSWORD;
    if (e && e.parameter.pw && !isAdmin) {
      return jsonResponse({ error: 'invalid_password' });
    }

    ensureSheetsExist();
    ensureRecurringSessions();
    const data = {
      members: readSheet(SHEET_NAMES.MEMBERS),
      sessions: readSheet(SHEET_NAMES.SESSIONS),
      attendance: readSheet(SHEET_NAMES.ATTENDANCE),
      settings: getSettings(),
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

function handleDeleteMember(body) {
  const { id } = body;
  if (!id) return { success: false, error: 'Missing id' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MEMBERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      logActivity('admin', 'KC', id, 'deleted_member');
      return { success: true };
    }
  }
  return { success: false, error: 'Member not found' };
}

function handleDeleteSession(body) {
  const { id } = body;
  if (!id) return { success: false, error: 'Missing id' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SESSIONS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      // Auto-generated recurring sessions: remember the skip so it stays deleted
      if (id.indexOf('rw-') === 0) {
        const s = getSettings();
        const dateStr = id.slice(3);
        const skips = (s.skip_dates || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean);
        if (skips.indexOf(dateStr) === -1) {
          skips.push(dateStr);
          handleSaveSettings({ skip_dates: skips.join(',') });
        }
      }
      logActivity('admin', 'KC', id, 'deleted_session');
      return { success: true };
    }
  }
  return { success: false, error: 'Session not found' };
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
    headers.forEach((h, i) => {
      let val = row[i];
      // Normalize Date objects to YYYY-MM-DD strings (for 'date' columns)
      if (val instanceof Date && h === 'date') {
        val = Utilities.formatDate(val, 'Europe/London', 'yyyy-MM-dd');
      }
      // Normalize Date objects to HH:mm strings (for 'time' columns)
      else if (val instanceof Date && h === 'time') {
        val = Utilities.formatDate(val, 'Europe/London', 'HH:mm');
      }
      // Normalize Date objects to ISO strings (for any other Date columns)
      else if (val instanceof Date) {
        val = val.toISOString();
      }
      obj[h] = val;
    });
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
