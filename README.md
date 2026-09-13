# 🏸 Balderton Badminton Club — Website

Internal club management tool for member RSVPs + admin court booking.

**Cost: £0/mo forever.** No servers, no DB, no SaaS fees.

---

## How it works

```
Member opens website (no login needed)
  → picks name from dropdown
  → clicks "I'm in" / "Can't make it" / "Maybe"
  → writes to Google Sheet via Apps Script
Admin opens admin.html (password)
  → sees attendance counts, court calculator, heatmap, activity
  → adds sessions / members
  → all updates go through same Sheet
```

**Hermes can also update the Sheet for you** — just tell him in Telegram DM
(e.g. "Add Friday 26 Sep 8pm Court 1, 12 spots") and he'll do it for you.

---

## One-time setup (KC, ~3 clicks)

### Step 1 — Create Google Sheet (1 click)
Go to https://sheets.new → name it **"Balderton BC"** → save.

### Step 2 — Add Apps Script (1 click)
1. In the Sheet: **Extensions → Apps Script**
2. Delete any default code
3. **Paste** the entire `apps-script/Code.gs` file
4. **Save** (Ctrl/Cmd+S)
5. Click **Deploy → New deployment**
6. Click gear ⚙ → **Web app**
7. Settings:
   - Description: `Balderton BC Backend`
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy** → copy the Web App URL

### Step 3 — Set admin password
In `apps-script/Code.gs`, change:
```js
const ADMIN_PASSWORD = 'CHANGE_ME_TO_A_STRONG_PASSWORD';
```
Save, then re-deploy (Deploy → Manage deployments → ✏ → New version).

### Step 4 — Send URL to Hermes
DM me in Telegram:
> "Balderton BC URL: https://script.google.com/macros/s/..."

I'll wire up the frontend and push to GitHub.

### Step 5 — Approve GitHub Pages (1 click)
I'll push to a new GitHub repo `kc-username/balderton-badminton`.
You approve the GitHub Pages enable in repo Settings (or I do via PAT).

### Step 6 — Done! 🎉
Site is live at `https://<your-username>.github.io/balderton-badminton/`

---

## File structure

```
web/
├── SPEC.md                    # Full spec
├── README.md                  # This file
├── index.html                 # Member view (no login)
├── app-member.js              # Member Vue logic
├── admin.html                 # Admin dashboard (password)
├── app-admin.js               # Admin Vue logic
└── apps-script/
    ├── Code.gs                # Backend (paste into Apps Script)
    └── appsscript.json        # Apps Script manifest
```

---

## Architecture

- **Frontend**: Static HTML + Vue 3 (CDN) + Tailwind (CDN). No build step.
- **Backend**: Google Apps Script Web App (handles read + write).
- **Database**: Google Sheet (4 tabs: Members / Sessions / Attendance / Activity).
- **Hosting**: GitHub Pages (free, your existing GitHub account).

---

## Court calculator logic

```
recommended_courts = ceil(yes_count / 4)   // 4 players per doubles court
weekly_cost = courts × 24                  // £24 per court per session (your typical rate)
```

**Weekly options**:
- **Lean**: per-session calculated (e.g. 3+2+2 = 7 courts = £168)
- **Recommended** ⭐: 3 per session (9 courts = £216, consistent buffer)
- **Safe**: 4 per session (12 courts = £288, overkill)

Adjust the £24/court rate in `app-admin.js` if your venue differs.

---

## Talking to Hermes for updates

Just message me in Telegram DM, e.g.:

- "Add Sarah Johnson to members"
- "Add session Fri 26 Sep 8pm Court 1, 12 spots"
- "Mark Harry Patel as in for Friday"
- "Change Saturday max spots to 10"

I'll curl the Apps Script endpoint and update the Sheet. Site refreshes within 60s.

---

## Troubleshooting

**"Setup incomplete"** on the site?  
The `API_URL` placeholder wasn't replaced. Send the Apps Script URL to Hermes.

**"Wrong password"** on admin login?  
The `ADMIN_PASSWORD` in `Code.gs` doesn't match what you're typing. Update + re-deploy.

**Sessions not showing?**
The Sheet tabs (Members / Sessions / Attendance / Activity) need to exist.
Run `setupSheets()` from the Apps Script editor (select function → Run).

**Need to add demo data?**
Run `seedDemoData()` from the Apps Script editor. Adds 8 demo members + 12 demo sessions.

---

## Updating the site

KC doesn't need to touch code. Hermes updates the GitHub repo, GitHub Pages auto-deploys within 1 minute.

For non-coders: tell Hermes what you want changed, he does it.

---

## Privacy

- No analytics, no tracking, no cookies
- Internal use only
- All data stays in KC's Google Sheet
- GDPR-compliant (data processor = Google, controller = KC)
