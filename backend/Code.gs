const SPREADSHEET_ID = '1Y6q_bKHXuWA8aBPhIU_3Tk33zHEkPp-7stJLCBv3lkI';
const SHEETS = {
  Income: 'Income',
  Expense: 'Expense',
  Accounts: 'Accounts',
  Transfer: 'Transfer',
  LentBorrowed: 'LentBorrowed',
  Settings: 'Settings'
};

const REQUIRED_HEADERS = {
  Income: ['Date','Amount','Category','Account','Notes','Currency','Rate'],
  Expense: ['Date','Amount','Category','Account','Notes','Currency','Rate'],
  Accounts: ['Account Name','Type','Balance','Card Number','Issuer'],
  Transfer: ['From Account','To Account','Amount','Date','Notes','Currency','Rate'],
  LentBorrowed: ['Name','Amount','Date','Type','Notes','Status'],
  Settings: ['Key','Value']
};

// Memoized Spreadsheet handle
var __SS = null;
function _ss(){ if (__SS) return __SS; __SS = SpreadsheetApp.openById(SPREADSHEET_ID); return __SS; }
function _cache(){ return CacheService.getScriptCache(); }

function ensureSheetsAndHeaders(){
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('initialized') === 'true') return;
  const ss = _ss();
  Object.keys(SHEETS).forEach(key => {
    const name = SHEETS[key];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = sh.getRange(1,1,1,sh.getMaxColumns()).getValues()[0].filter(String);
    const required = REQUIRED_HEADERS[name];
    if (!headers.length) {
      sh.getRange(1,1,1,required.length).setValues([required]);
    } else {
      const missing = required.filter(h => !headers.includes(h));
      if (missing.length){ sh.getRange(1, headers.length+1, 1, missing.length).setValues([missing]); }
    }
  });
  props.setProperty('initialized', 'true');
}

function doGet(e){
  try {
    ensureSheetsAndHeaders();
    const action = (e.parameter.action||'').trim();
    const cache = _cache();
    if (action === 'ping') return _json({ ok: true, time: new Date().toISOString() });
    if (action === 'getAllData'){
      const k = 'getAllData'; const hit = cache.get(k);
      if (hit) return _json(JSON.parse(hit));
      const payload = _getAll(); cache.put(k, JSON.stringify(payload), 60); return _json(payload);
    }
    if (action === 'getTable'){
      const table = e.parameter.table; const k = 'getTable:'+table; const hit = cache.get(k);
      if (hit) return _json({ rows: JSON.parse(hit) });
      const rows = _readTableWithRow(table);
      cache.put(k, JSON.stringify(rows), 60); return _json({ rows });
    }
    if (action === 'getSettings') return _json(_getSettings());
    if (action === 'exportBackup') return _json(_exportBackup());
    return _json({ error: 'Unknown action' });
  } catch (err) {
    return _json({ error: err.message || String(err) });
  }
}

function _invalidateCaches(keys){ const c = _cache(); (keys||[]).forEach(k => c.remove(k)); }
function _invalidateAllCachesFor(table){ const keys = ['getAllData']; if (table) keys.push('getTable:'+table); _invalidateCaches(keys); }

function doPost(e){
  try {
    ensureSheetsAndHeaders();
    const action = (e.parameter.action||'').trim();
    const payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
    if (action === 'addIncome'){ const res = addIncome(payload); _invalidateAllCachesFor('Income'); _invalidateAllCachesFor('Accounts'); return _json(res); }
    if (action === 'addExpense'){ const res = addExpense(payload); _invalidateAllCachesFor('Expense'); _invalidateAllCachesFor('Accounts'); return _json(res); }
    if (action === 'addAccount'){ const res = addAccount(payload); _invalidateAllCachesFor('Accounts'); return _json(res); }
    if (action === 'addTransfer'){ const res = addTransfer(payload); _invalidateAllCachesFor('Transfer'); _invalidateAllCachesFor('Accounts'); return _json(res); }
    if (action === 'addLentBorrowed'){ const res = addLentBorrowed(payload); _invalidateAllCachesFor('LentBorrowed'); return _json(res); }
    if (action === 'settleLentBorrowed'){ const res = settleLentBorrowed(payload); _invalidateAllCachesFor('LentBorrowed'); _invalidateAllCachesFor('Accounts'); return _json(res); }
    if (action === 'updateSettings'){ const res = updateSettings(payload); _invalidateAllCachesFor(); return _json(res); }
    if (action === 'resetData'){ const res = resetData(); _invalidateAllCachesFor(); return _json(res); }
    if (action === 'importCSV'){ const res = importCSV(payload); _invalidateAllCachesFor(payload.targetTable); return _json(res); }
    if (action === 'deleteRow'){ const res = deleteRow(payload); _invalidateAllCachesFor(payload.table); if (payload.table!=='Accounts') _invalidateAllCachesFor('Accounts'); return _json(res); }
    if (action === 'updateRow'){ const res = updateRow(payload); _invalidateAllCachesFor(payload.table); if (payload.table!=='Accounts') _invalidateAllCachesFor('Accounts'); return _json(res); }
    return _json({ error: 'Unknown action' });
  } catch (err) {
    return _json({ error: err.message || String(err) });
  }
}

function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function _readTable(name){
  const ss = _ss(); const sh = ss.getSheetByName(name); if (!sh) return [];
  const range = sh.getDataRange(); const values = range.getValues(); if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(r => r.some(v => v !== '' && v !== null)).map(row => {
    const obj = {}; headers.forEach((h,i) => obj[h] = row[i]); return obj;
  });
}

function _readTableWithRow(name){
  const ss = _ss(); const sh = ss.getSheetByName(name); if (!sh) return [];
  const range = sh.getDataRange(); const values = range.getValues(); if (values.length < 2) return [];
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++){
    const row = values[i];
    if (!row.some(v => v !== '' && v !== null)) continue;
    const obj = { _row: i }; // 1-based data row index (header is 0)
    headers.forEach((h, idx) => obj[h] = row[idx]);
    rows.push(obj);
  }
  return rows;
}

function _appendRow(name, obj){
  const ss = _ss(); const sh = ss.getSheetByName(name);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sh.appendRow(row);
}

function _getSettings(){
  const rows = _readTable(SHEETS.Settings);
  const map = {};
  rows.forEach(r => { map[r.Key] = r.Value; });
  const parsed = {
    theme: map.theme || 'dark',
    language: map.language || 'en',
    currencySymbol: map.currencySymbol || '$',
    dateFormat: map.dateFormat || 'YYYY-MM-DD',
    numberFormat: map.numberFormat || '1,234.56',
    decimals: map.decimals ? Number(map.decimals) : 2,
    autoSync: map.autoSync === 'true',
    notifications: map.notifications === 'true',
    multiCurrency: map.multiCurrency === 'true',
    baseCurrency: map.baseCurrency || 'USD',
    categories: _safeJSON(map.categories, { income: ['Salary','Bonus','Interest'], expense: ['Food','Transport','Rent'] }),
    accountTypes: _safeJSON(map.accountTypes, ['Bank','Cash','Credit Card','Debit Card']),
    dashboardPrefs: _safeJSON(map.dashboardPrefs, { cards: ['total','income','expense','cash','credit','debit'], charts: ['line','bar','pie','donut','stacked'] }),
    themeColors: _safeJSON(map.themeColors, { primary: '#3a7bd5', accent: '#00d2ff' }),
    defaultRange: map.defaultRange || 'this_month',
    defaultTab: map.defaultTab || 'dashboard',
    budgets: _safeJSON(map.budgets, {}),
    notificationThresholds: _safeJSON(map.notificationThresholds, {}),
    archiveMonths: map.archiveMonths ? Number(map.archiveMonths) : 0
  };
  const rates = _safeJSON(map.exchangeRates, {});
  return { settings: parsed, exchangeRates: rates };
}

function updateSettings(settings){
  const flat = {
    theme: settings.theme,
    language: settings.language,
    currencySymbol: settings.currencySymbol,
    dateFormat: settings.dateFormat,
    numberFormat: settings.numberFormat,
    decimals: String(settings.decimals||2),
    autoSync: String(!!settings.autoSync),
    notifications: String(!!settings.notifications),
    multiCurrency: String(!!settings.multiCurrency),
    baseCurrency: settings.baseCurrency,
    categories: JSON.stringify(settings.categories||{}),
    accountTypes: JSON.stringify(settings.accountTypes||[]),
    dashboardPrefs: JSON.stringify(settings.dashboardPrefs||{}),
    themeColors: JSON.stringify(settings.themeColors||{}),
    defaultRange: settings.defaultRange||'this_month',
    defaultTab: settings.defaultTab||'dashboard',
    budgets: JSON.stringify(settings.budgets||{}),
    notificationThresholds: JSON.stringify(settings.notificationThresholds||{}),
    archiveMonths: String(settings.archiveMonths||0)
  };
  const ss = _ss(); const sh = ss.getSheetByName(SHEETS.Settings);
  const existing = _readTable(SHEETS.Settings);
  const keys = Object.keys(flat);
  const map = new Map(existing.map(r => [r.Key, r.Value]));
  keys.forEach(k => map.set(k, flat[k]));
  // Write back: clear and write
  sh.clear(); sh.getRange(1,1,1,2).setValues([["Key","Value"]]);
  const rows = Array.from(map.entries());
  if (rows.length) sh.getRange(2,1,rows.length,2).setValues(rows);
  return { ok: true };
}

function _getAll(){
  const accounts = _readTable(SHEETS.Accounts);
  const income = _readTable(SHEETS.Income);
  const expense = _readTable(SHEETS.Expense);
  const transfer = _readTable(SHEETS.Transfer);
  const lentBorrowed = _readTable(SHEETS.LentBorrowed);
  const { settings, exchangeRates } = _getSettings();
  return { accounts, income, expense, transfer, lentBorrowed, settings, exchangeRates };
}

function addAccount(row){
  // Expect: { AccountName, Type, Balance }
  const name = row.AccountName; if (!name) throw new Error('AccountName required');
  const record = { 'Account Name': name, 'Type': row.Type||'Bank', 'Balance': Number(row.Balance||0), 'Card Number': row['Card Number']||'', 'Issuer': row['Issuer']||'' };
  _appendRow(SHEETS.Accounts, record);
  return { ok: true };
}

function addIncome(row){
  // Update account balance +Amount
  const rate = _ensureRate(row.Currency);
  _appendRow(SHEETS.Income, { 'Date': row.Date, 'Amount': Number(row.Amount||0), 'Category': row.Category||'', 'Account': row.Account||'', 'Notes': row.Notes||'', 'Currency': row.Currency||'', 'Rate': rate });
  _updateAccountBalance(row.Account, +Number(row.Amount||0) * rate);
  return { ok: true };
}

function addExpense(row){
  const rate = _ensureRate(row.Currency);
  _appendRow(SHEETS.Expense, { 'Date': row.Date, 'Amount': Number(row.Amount||0), 'Category': row.Category||'', 'Account': row.Account||'', 'Notes': row.Notes||'', 'Currency': row.Currency||'', 'Rate': rate });
  _updateAccountBalance(row.Account, -Number(row.Amount||0) * rate);
  return { ok: true };
}

function addTransfer(row){
  const rate = _ensureRate(row.Currency);
  _appendRow(SHEETS.Transfer, { 'From Account': row.FromAccount||'', 'To Account': row.ToAccount||'', 'Amount': Number(row.Amount||0), 'Date': row.Date||'', 'Notes': row.Notes||'', 'Currency': row.Currency||'', 'Rate': rate });
  const lock = LockService.getScriptLock(); lock.tryLock(5000);
  try {
    _updateAccountBalance(row.FromAccount, -Number(row.Amount||0) * rate);
    _updateAccountBalance(row.ToAccount, +Number(row.Amount||0) * rate);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function addLentBorrowed(row){
  _appendRow(SHEETS.LentBorrowed, { 'Name': row.Name||'', 'Amount': Number(row.Amount||0), 'Date': row.Date||'', 'Type': row.Type||'', 'Notes': row.Notes||'', 'Status': 'Pending' });
  return { ok: true };
}

function settleLentBorrowed(payload){
  const row = Number(payload.row); const account = payload.accountName;
  if (!row || !account) throw new Error('row/accountName required');
  const sh = _ss().getSheetByName(SHEETS.LentBorrowed);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idxName = headers.indexOf('Name');
  const idxAmt = headers.indexOf('Amount');
  const idxType = headers.indexOf('Type');
  const idxStatus = headers.indexOf('Status');
  const r = row+1; // data row index within 'data' (header at index 0)
  const currentStatus = data[r][idxStatus];
  if (String(currentStatus).toLowerCase() !== 'pending') return { ok: true, message: 'Already settled' };
  const type = data[r][idxType];
  const amount = Number(data[r][idxAmt]||0);
  if ((type||'').toLowerCase() === 'lent'){
    _updateAccountBalance(account, +amount);
    sh.getRange(r+1, idxStatus+1).setValue('Returned');
  } else {
    _updateAccountBalance(account, -amount);
    sh.getRange(r+1, idxStatus+1).setValue('Paid back');
  }
  return { ok: true };
}

function _updateAccountBalance(accountName, delta){
  if (!accountName) return;
  const sh = _ss().getSheetByName(SHEETS.Accounts);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idxName = headers.indexOf('Account Name');
  const idxBal = headers.indexOf('Balance');
  for (let r = 1; r < data.length; r++){
    if (data[r][idxName] === accountName){
      const current = Number(data[r][idxBal] || 0);
      sh.getRange(r+1, idxBal+1).setValue(current + Number(delta||0));
      return;
    }
  }
  // If account not found, create it
  _appendRow(SHEETS.Accounts, { 'Account Name': accountName, 'Type': 'Bank', 'Balance': Number(delta||0) });
}

function resetData(){
  const ss = _ss();
  ;[SHEETS.Income, SHEETS.Expense, SHEETS.Transfer, SHEETS.LentBorrowed].forEach(name => {
    const sh = ss.getSheetByName(name); sh.getRange(2,1,Math.max(0, sh.getLastRow()-1), sh.getLastColumn()).clearContent();
  });
  return { ok: true };
}

function importCSV(payload){
  const { targetTable, rows } = payload;
  if (!SHEETS[targetTable] && !REQUIRED_HEADERS[targetTable]) throw new Error('Invalid target table');
  const headers = REQUIRED_HEADERS[targetTable];
  const sh = _ss().getSheetByName(targetTable);
  const normalized = rows.slice(1).map(r => headers.map((_,i) => r[i]||''));
  if (normalized.length) sh.getRange(sh.getLastRow()+1, 1, normalized.length, headers.length).setValues(normalized);
  return { ok: true };
}

function _safeJSON(text, fallback){ try { return text ? JSON.parse(text) : fallback; } catch(e){ return fallback; } }

function _exportBackup(){
  return {
    Accounts: _readTable(SHEETS.Accounts),
    Income: _readTable(SHEETS.Income),
    Expense: _readTable(SHEETS.Expense),
    Transfer: _readTable(SHEETS.Transfer),
    LentBorrowed: _readTable(SHEETS.LentBorrowed),
    Settings: _readTable(SHEETS.Settings)
  };
}

function _ensureRate(currency){
  const { settings } = _getSettings();
  const base = settings.baseCurrency || 'USD';
  if (!currency || currency === base) return 1;
  // Minimal: Store last used rates in settings.exchangeRates (not auto-fetch here to avoid URLFetch quota every call)
  // You can build a daily trigger to fetch rates and store in settings.
  const map = _getRatesMap();
  if (map[currency]) return Number(map[currency]);
  // As fallback, try fetch live rate once (may require enabling URLFetch)
  try {
    const resp = UrlFetchApp.fetch(`https://api.exchangerate.host/latest?base=${encodeURIComponent(currency)}&symbols=${encodeURIComponent(base)}`, { muteHttpExceptions: true });
    const json = JSON.parse(resp.getContentText());
    const rate = json && json.rates && json.rates[base] ? Number(json.rates[base]) : 1;
    _setRate(currency, rate);
    return rate;
  } catch (e){ return 1; }
}

function _getRatesMap(){
  const sh = _ss().getSheetByName(SHEETS.Settings);
  const rows = _readTable(SHEETS.Settings);
  const rec = rows.find(r => r.Key === 'exchangeRates');
  return _safeJSON(rec && rec.Value, {});
}

function _setRate(curr, rate){
  const sh = _ss().getSheetByName(SHEETS.Settings);
  const rows = _readTable(SHEETS.Settings);
  const map = _getRatesMap(); map[curr] = rate;
  const newRows = rows.filter(r => r.Key !== 'exchangeRates');
  newRows.push({ Key: 'exchangeRates', Value: JSON.stringify(map) });
  sh.clear(); sh.getRange(1,1,1,2).setValues([["Key","Value"]]);
  if (newRows.length){ sh.getRange(2,1,newRows.length,2).setValues(newRows.map(r => [r.Key, r.Value])); }
}

function deleteRow(payload){
  const table = payload.table; const row = Number(payload.row); // 1-based data row index
  if (!table || !row || row < 1) throw new Error('Invalid table/row');
  const sh = _ss().getSheetByName(table);
  const last = sh.getLastRow();
  if (row+1 > last) throw new Error('Row out of range');
  sh.deleteRow(row+1); // +1 for header
  return { ok: true };
}

function updateRow(payload){
  const table = payload.table; const row = Number(payload.row); const data = payload.data || {};
  if (!table || !row || row < 1) throw new Error('Invalid table/row');
  const sh = _ss().getSheetByName(table);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  Object.keys(data).forEach(key => {
    const col = headers.indexOf(key);
    if (col >= 0) sh.getRange(row+1, col+1).setValue(data[key]);
  });
  return { ok: true };
}