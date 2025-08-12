# Personal Income & Expense Tracker (Frontend + Google Sheets Backend)

A mobile-first, responsive, advanced tracker app using HTML/CSS/JS (frontend) and Google Sheets via Google Apps Script (backend). Includes accounts, income/expense, transfers, lent/borrowed, settings, multi-language, multi-currency, export/backup, import CSV, and dynamic charts.

## Features (High-level)
- Dark Crystal theme (default) + Light theme toggle; animated UI & icons
- Sidebar navigation; mobile-first responsive layout
- Dashboard cards + 5 interactive charts (bar, pie, line, donut, stacked bar)
- Income & Expense: add via modals, view tables with search/filter/sort
- Accounts: add/update balances live; supports Bank, Cash, Credit Card (negative balance allowed)
- Transfers: from/to accounts with automatic balance adjustments
- Lent & Borrowed: add and view
- Settings: theme, language (EN, AR, BN, HI, NE, + extensible), currency symbol, categories, account types, date/number formats, auto-sync, notifications, multi-currency mode
- Backup & Export (CSV/Excel/JSON) and Import CSV (bulk)
- Search bar (global)
- Real-time sync with Google Sheets via Apps Script REST-like Web App

## Repository Layout
```
/workspace
  ├─ frontend/
  │   ├─ index.html
  │   ├─ styles.css
  │   ├─ app.js
  │   ├─ api.js
  │   ├─ charts.js
  │   ├─ i18n.js
  │   ├─ storage.js
  │   └─ utils.js
  └─ backend/
      ├─ Code.gs
      └─ appsscript.json
```

## Prerequisites
- A Google account with access to Google Sheets & Apps Script
- A Google Sheet named "Personal Tracker" (you provided id). Tabs required (headers in row 1):
  - Income → Date, Amount, Category, Account, Notes, Currency, Rate
  - Expense → Date, Amount, Category, Account, Notes, Currency, Rate
  - Accounts → Account Name, Type, Balance
  - Transfer → From Account, To Account, Amount, Date, Notes, Currency, Rate
  - LentBorrowed → Name, Amount, Date, Type, Notes
  - Settings → Key, Value

Note: Currency/Rate columns are added to support multi-currency. The backend will auto-create missing sheets/headers on first run.

## Backend Setup (Google Apps Script)
1. Open your Google Sheet `Personal Tracker` (`https://docs.google.com/spreadsheets/d/1Y6q_bKHXuWA8aBPhIU_3Tk33zHEkPp-7stJLCBv3lkI`)
2. Extensions → Apps Script → create project.
3. Copy contents of `backend/Code.gs` and `backend/appsscript.json` from this repo into the Apps Script editor (use Project Settings → Show "appsscript.json"; paste).
4. In `Code.gs`, set `SPREADSHEET_ID` to your sheet id: `1Y6q_bKHXuWA8aBPhIU_3Tk33zHEkPp-7stJLCBv3lkI`.
5. Click Deploy → New deployment → Type: Web app
   - Description: Personal Tracker API
   - Execute as: Me
   - Who has access: Anyone
   - Deploy; authorize if prompted.
6. Copy the web app URL (ends with `/exec`).

CORS note: We avoid preflight by sending `application/x-www-form-urlencoded` form bodies. No special headers required.

## Frontend Setup
1. Open `frontend/api.js` and set `API_BASE_URL` to the copied Web App URL (`.../exec`).
2. Serve locally:
   - Option A: Python HTTP server
     ```bash
     cd /workspace/frontend && python3 -m http.server 5173
     ```
     Visit `http://localhost:5173`
   - Option B: Any static server or VSCode/Live Server

The app is a static SPA; no build step required.

## Usage Flow
- Open the app in a browser.
- Use Settings to choose language, currency symbol, date/number formats, enable multi-currency, etc. These persist in Google Sheets.
- Add Accounts first.
- Add Income/Expense using the + buttons (animated modals).
- Use Transfer to move money between accounts; balances update instantly.
- Dashboard shows totals and 5 charts; filters (This Month, Last Month, This Year).
- Backup/Export and Import CSV are in Settings.

## Environment Variables
None required. Configure the Web App URL in `frontend/api.js`.

## Security
- Web app is open (Anyone). For private installs, switch to OAuth-based Apps Script Execution API and add tokens to `api.js`.

## Troubleshooting
- 403 or 401: Ensure Web App is deployed as "Anyone" and you are using the `/exec` URL.
- CORS: Ensure using form encoding; avoid custom headers.
- Sheets missing: The backend auto-creates required tabs and headers.
- Chart not updating: Check console logs; verify API URL.

## License
MIT