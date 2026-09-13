# Balderton Badminton Club — Website Spec

**Last updated**: 2026-09-14
**Owner**: Basco Lee (KC)
**Status**: MVP scaffold
**Cost**: £0/mo (free tier everything)
**GitHub**: https://github.com/<kc-username>/balderton-badminton (TBD)

---

## Goal

Internal club management website for Balderton Badminton Club members
to RSVP for sessions + for the booking manager (KC) to see attendance
and decide how many courts to book each week.

**No public signup. KC manages all members manually.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Members (browser)                                              │
│  ↓ load index.html                                              │
│  ↓ fetch from Google Sheet (public read)                        │
│  ↓ RSVP → POST to Apps Script Web App                           │
└─────────────────────────────────────────────────────────────────┘
                            ↕ JSON
┌─────────────────────────────────────────────────────────────────┐
│  Google Apps Script (Web App)                                   │
│  - doGet() → returns members / sessions / attendance JSON       │
│  - doPost() → writes RSVP, admin password protected             │
│  ↓ reads / writes                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↕ Sheets API
┌─────────────────────────────────────────────────────────────────┐
│  Google Sheet (single workbook, 4 tabs)                          │
│  - Members   | Sessions  | Attendance | Activity                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Admin (KC, browser)                                            │
│  - Same data, password-gated write actions                      │
│  - Court calculator (computed)                                  │
│  - Heatmap (computed)                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Why this stack**:
- £0/mo forever (no servers, no DB, no SaaS)
- KC only needs Google account + GitHub account (already has both)
- Hermes can update data by talking to KC in DM (KC tells Hermes → Hermes curl Apps Script)
- Members don't need accounts (KC pre-loads names; members just pick their name)

---

## Stack

| Layer | Choice | Cost | Why |
|---|---|---|---|
| Frontend | Static HTML + Vue 3 (CDN) + Tailwind (CDN) | £0 | No build step, instant deploy |
| Backend | Google Apps Script Web App | £0 | KC already has Google |
| Database | Google Sheet | £0 | KC can edit directly |
| Hosting | GitHub Pages | £0 | KC has GitHub |
| Auth (admin) | Simple password in URL param | £0 | Internal tool, OK |
| Domain | (free `*.github.io` for now) | £0 | Optional custom domain later |

---

## Sheet Schema

### `Members` tab
| id | name | created_at |
|---|---|---|
| m01 | Sarah Thompson | 2026-09-01 |
| m02 | James Mitchell | 2026-09-01 |
| ... | ... | ... |

### `Sessions` tab
| id | date | time | court | location | max_spots | created_at |
|---|---|---|---|---|---|---|
| s01 | 2026-09-12 | 20:00 | Court 1 | Newark Leisure Centre | 12 | 2026-09-01 |
| s02 | 2026-09-13 | 10:00 | Court 2 | Newark Leisure Centre | 10 | 2026-09-01 |
| ... | ... | ... | ... | ... | ... | ... |

### `Attendance` tab
| member_id | session_id | status | updated_at |
|---|---|---|---|
| m01 | s01 | yes | 2026-09-10 18:30 |
| m02 | s01 | no | 2026-09-10 19:00 |
| ... | ... | ... | ... |

`status` ∈ {`yes`, `no`, `maybe`}

### `Activity` tab (auto-populated by Apps Script)
| timestamp | member_id | session_id | action |
|---|---|---|---|
| 2026-09-10 18:30 | m01 | s01 | marked yes |

---

## Pages

### `index.html` — Member View (public URL)
- **Header**: Club name, member picker dropdown
- **Section: Upcoming Sessions** (next 3)
  - Each session card: date block + title + time/location + attendance bar + RSVP buttons
  - Buttons: I'm in / Can't make it / Maybe
  - One click → POST to Apps Script → state refreshes
- **Section: Past Sessions** (last 4)
  - Read-only, attendance history

### `admin.html` — Admin Dashboard (password-gated)
- **KPI row** (4 cards): Active Members / Sessions This Week / Avg Attendance / Recommended Spend
- **Court Booking Calculator**: per-session breakdown
  - Each session: date | attending | recommended courts | cost | "Book X" button
  - Formula: `recommended_courts = ceil(yes_count / 4)`
- **Weekly Comparison**: 3 options side-by-side (Lean £168 / Recommended £216 / Safe £288)
- **Attendance Heatmap**: members × sessions, colored cells
- **Activity Feed**: last 20 actions
- **Admin actions**: Add Session / Add Member (modals)

---

## Court Calculator Logic

```javascript
function recommendedCourts(yesCount) {
  return Math.ceil(yesCount / 4);  // 4 players per doubles court
}

function weeklyCost(courtCount) {
  return courtCount * 24;  // £24 per court per session
}
```

**Reference scenarios**:
| Yes count | Recommended | Capacity | Buffer |
|---|---|---|---|
| 1–4 | 1 court | 4 | 0 |
| 5–8 | 2 courts | 8 | 0 |
| 9–12 | 3 courts | 12 | 0 |
| 13–16 | 4 courts | 16 | 0 |

**Weekly options** (3 sessions/week):
- **Option A · Lean**: per-session calculated (e.g. 3+2+2 = 7 courts = £168)
- **Option B · Recommended** ⭐: 3 per session (9 courts = £216, +buffer)
- **Option C · Safe**: 4 per session (12 courts = £288, +overkill)

---

## Data Flow

### Member RSVPs
1. Member opens `index.html` (no login)
2. Picks name from dropdown
3. Clicks "I'm in" on a session
4. JS POSTs `{action: 'rsvp', member_id: 'm01', session_id: 's01', status: 'yes', name: 'Sarah Thompson'}`
5. Apps Script writes Attendance row + Activity row
6. Returns `{success: true, updated_attendance: {...}}`
7. JS re-fetches GET → renders updated counts

### Admin updates
1. KC opens `admin.html?pw=<password>`
2. JS checks `pw` matches ADMIN_PASSWORD (in Apps Script)
3. All same flows, but write actions allowed

### KC talks to Hermes
- KC tells Hermes in Telegram DM: "Add session Fri 26 Sep 8pm Court 1 12 spots"
- Hermes curls Apps Script Web App:
  ```
  POST {action: 'add_session', date: '2026-09-26', time: '20:00', court: 'Court 1', location: 'Newark Leisure Centre', max_spots: 12, admin_pw: '<password>'}
  ```
- Apps Script adds row to Sessions + Activity
- Website shows new session within minutes (member refresh)

---

## Setup (KC clicks only)

1. **Create Google Sheet** (1 click): https://sheets.new → name "Balderton BC"
2. **Add Apps Script** (1 click): Extensions → Apps Script → paste `apps-script/Code.gs` → Save → Deploy → New deployment → Web app → "Anyone" access → Copy URL
3. **Update frontend**: KC pastes URL into `index.html` + `admin.html` (or I do it via PR — 1 click approve)
4. **GitHub Pages deploy** (1 click approve): I push to `kc-username/balderton-badminton` repo → KC approves GitHub Pages in repo Settings → live at `https://kc-username.github.io/balderton-badminton/`

**Total KC clicks: 3** (within 3-click threshold ✅)

---

## Open Questions / Future

- [ ] Custom domain `baldertonbc.co.uk`? (optional, +£10/yr)
- [ ] Email reminders to members before sessions? (would need SendGrid, paid)
- [ ] WhatsApp group integration? (would need Twilio, paid)
- [ ] Payment integration for court costs split? (members pre-pay?)

---

## Tech Notes

- All times in UK BST (UTC+1) — `Intl.DateTimeFormat('en-GB')`
- Currency: GBP £ symbol, format `£X.XX`
- Date format: DD/MM/YYYY (UK standard)
- All copy: British English ("RSVP", "courts", "booked")
- No tracking, no analytics, no cookies (GDPR-light)
- Internal use only — no public marketing
