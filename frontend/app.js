import { $, $$, formatNumber, download, parseCSV, toCSV, debounce, todayISO } from './utils.js';
import { translatePage, getCurrentLang, t } from './i18n.js';
import { api } from './api.js';
import { state, setSettings, setAllData, totals } from './storage.js';
import { initCharts, refreshCharts, refreshChartTheme } from './charts.js';

// Sidebar toggle
const sidebar = $('#sidebar');
const overlayEl = $('#screenOverlay');
const btnSidebarToggle = $('#btnSidebarToggle');
function setSidebarExpanded(expanded){
  if (expanded){
    sidebar.classList.remove('collapsed');
    document.body.classList.add('sidebar-open');
    if (overlayEl) overlayEl.classList.add('show');
  } else {
    sidebar.classList.add('collapsed');
    document.body.classList.remove('sidebar-open');
    if (overlayEl) overlayEl.classList.remove('show');
  }
}
if (btnSidebarToggle) btnSidebarToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const expanded = sidebar.classList.contains('collapsed');
  setSidebarExpanded(expanded);
});

if (overlayEl) overlayEl.addEventListener('click', () => setSidebarExpanded(false));

// Collapse to mini when clicking outside sidebar and topbar
window.addEventListener('click', (e) => {
  const topbar = document.querySelector('.topbar');
  const isInsideSidebar = sidebar.contains(e.target);
  const isInsideTopbar = topbar && topbar.contains(e.target);
  if (!isInsideSidebar && !isInsideTopbar) {
    setSidebarExpanded(false);
  }
});

// Simple hash router
function navigateTo(route){
  if (!route) route = 'dashboard';
  const routeBtns = $$('.menu-item');
  routeBtns.forEach(b => b.classList.remove('active'));
  const match = routeBtns.find(b => b.getAttribute('data-route') === route);
  if (match) match.classList.add('active');
  $$('.route').forEach(sec => sec.classList.remove('active'));
  const section = document.querySelector(`#route-${route}`);
  if (section) section.classList.add('active');
}

window.addEventListener('hashchange', () => {
  const route = location.hash.replace('#','');
  navigateTo(route);
});

// Routing
const routes = $$('.menu-item');
routes.forEach(btn => btn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const route = btn.getAttribute('data-route');
  location.hash = route; // triggers hashchange + navigate
  setSidebarExpanded(false);
  closeModals();
  try {
    if (route === 'income') await renderTable('Income', '#incomeTableWrap');
    if (route === 'expense') await renderTable('Expense', '#expenseTableWrap');
    if (route === 'lentborrowed') await renderTable('LentBorrowed', '#lentBorrowedTableWrap');
  } catch (err) { console.warn('Navigation data load failed:', err); }
}));

// Topbar theme and language
const themeToggle = $('#themeToggle');
if (themeToggle) themeToggle.addEventListener('click', () => toggleTheme());
const langSel = $('#languageSelect'); if (langSel) langSel.addEventListener('change', (e) => { setLanguage(e.target.value); });
const currSel = $('#currencySymbolSelect'); if (currSel) currSel.addEventListener('change', (e) => { state.settings.currencySymbol = e.target.value; saveSettings(); updateCards(); });

// Compact header controls
const btnLang = $('#btnLang');
if (btnLang) btnLang.onclick = ()=>{
  const langs = ['en','ar','bn','hi','ne'];
  const current = state.settings.language || 'en';
  const idx = (langs.indexOf(current)+1) % langs.length;
  const next = langs[idx];
  setLanguage(next);
  btnLang.textContent = next.toUpperCase().slice(0,1);
};
const btnCurr = $('#btnCurr');
if (btnCurr) btnCurr.onclick = ()=>{
  const symbols = ['$', '€', '£', '₹', '৳', '₨', 'QR', '¥', '₩'];
  const current = state.settings.currencySymbol || '$';
  const idx = (symbols.indexOf(current)+1) % symbols.length;
  const next = symbols[idx];
  state.settings.currencySymbol = next; btnCurr.textContent = next; saveSettings(); updateCards();
};

// Save Settings button
const btnSaveSettings = $('#btnSaveSettings'); if (btnSaveSettings) btnSaveSettings.onclick = ()=> saveSettings();

function toggleTheme(target){
  const isLight = document.body.classList.toggle('theme-light');
  document.body.classList.toggle('theme-dark', !isLight);
  state.settings.theme = isLight ? 'light' : 'dark';
  saveSettings(); refreshChartTheme();
}

function setLanguage(lang){ translatePage(lang); state.settings.language = lang; $('#settingsLanguage').value = lang; saveSettings(); }

// Cards update
function updateCards(){
  const { income, expense, cash, credit, debit } = totals();
  const balance = computeAccountsTotal();
  const nf = state.settings.numberFormat; const d = state.settings.decimals; const sym = state.settings.currencySymbol;
  $('#totalIncome').textContent = sym + ' ' + formatNumber(income, nf, d);
  $('#totalExpense').textContent = sym + ' ' + formatNumber(expense, nf, d);
  $('#totalBalance').textContent = sym + ' ' + formatNumber(balance, nf, d);
  $('#cashBalance').textContent = sym + ' ' + formatNumber(cash, nf, d);
  $('#creditBalance').textContent = sym + ' ' + formatNumber(credit, nf, d);
  const debitEl = $('#debitBalance'); if (debitEl) debitEl.textContent = sym + ' ' + formatNumber(debit, nf, d);
}

function iconForAccountType(type){
  const t = String(type||'').toLowerCase();
  if (t.includes('credit')) return 'fa-credit-card';
  if (t.includes('cash')) return 'fa-sack-dollar';
  if (t.includes('bank')) return 'fa-building-columns';
  return 'fa-wallet';
}

function formatLocalDate(dStr){
  if (!dStr) return '';
  const d = new Date(dStr);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Filters
function renderFilters(containerSelector, table){
  const el = $(containerSelector); if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `
    <input type="date" class="input" data-filter-from />
    <input type="date" class="input" data-filter-to />
    <input type="search" class="input" placeholder="Search" data-filter-q />
    <button class="btn small" data-apply><i class="fa-solid fa-filter"></i> Apply</button>
    <button class="btn small" data-clear><i class="fa-solid fa-eraser"></i> Clear</button>`;
  const apply = async ()=>{
    const from = el.querySelector('[data-filter-from]').value;
    const to = el.querySelector('[data-filter-to]').value;
    const q = (el.querySelector('[data-filter-q]').value||'').toLowerCase();
    const wrapSelector = table==='Income' ? '#incomeTableWrap' : table==='Expense' ? '#expenseTableWrap' : '#lentBorrowedTableWrap';
    const wrap = $(wrapSelector);
    // fetch fresh and filter on client
    const { rows } = await api.getTable(table);
    const filtered = rows.filter(r => {
      // date
      const d = new Date(r.Date);
      const inRange = (!from || d >= new Date(from)) && (!to || d <= new Date(to));
      const hay = JSON.stringify(r).toLowerCase();
      const match = !q || hay.includes(q);
      return inRange && match;
    });
    wrap.querySelector('tbody').innerHTML = filtered.map(r => {
      const headers = Object.keys(r).filter(h=>h!=='_row');
      return `<tr data-row="${r._row}">${headers.map(h=>`<td data-key="${h}">${h==='Date'?formatLocalDate(r[h]):(r[h]??'')}</td>`).join('')}<td>
        <button class="btn small" data-edit><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn danger small" data-delete><i class="fa-solid fa-trash"></i> Delete</button>
      </td></tr>`;
    }).join('');
  };
  el.querySelector('[data-apply]').onclick = apply;
  el.querySelector('[data-clear]').onclick = ()=>{ el.querySelector('[data-filter-from]').value=''; el.querySelector('[data-filter-to]').value=''; el.querySelector('[data-filter-q]').value=''; apply(); };
}

function renderAccounts(){
  const wrap = $('#accountsCards'); if (!wrap) return;
  const nf = state.settings.numberFormat; const d = state.settings.decimals; const sym = state.settings.currencySymbol;
  wrap.innerHTML = state.accounts.map(acc => {
    const name = acc['Account Name'] || acc.AccountName || '';
    const type = acc.Type || '';
    const bal = Number(acc.Balance || 0);
    const issuer = acc['Issuer'] || '';
    const cardNumber = (acc['Card Number'] != null) ? String(acc['Card Number']) : '';
    const last4 = cardNumber ? cardNumber.slice(-4) : '';
    return `
      <div class="card">
        <div class="card-title"><i class="fa-solid ${iconForAccountType(type)}"></i> ${name}</div>
        <div class="card-value">${sym} ${formatNumber(bal, nf, d)}</div>
        <div class="card-meta" style="color: var(--text-dim); font-size: 12px; margin-top: 6px;">${type}${issuer?` • ${issuer}`:''}${last4?` • ${last4}`:''}</div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button class="btn small" data-edit-account data-name="${name}"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn danger small" data-delete-account data-name="${name}"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      </div>`;
  }).join('');
  // bind account actions
  wrap.querySelectorAll('[data-delete-account]').forEach(btn => btn.onclick = async (e)=>{
    const name = e.currentTarget.getAttribute('data-name');
    const { rows } = await api.getTable('Accounts');
    const found = rows.find(r => r['Account Name'] === name);
    if (!found) return;
    if (!confirm('Delete this account?')) return;
    await api.deleteRow('Accounts', found._row); await refreshAll();
  });
  wrap.querySelectorAll('[data-edit-account]').forEach(btn => btn.onclick = async (e)=>{
    const name = e.currentTarget.getAttribute('data-name');
    const { rows } = await api.getTable('Accounts');
    const found = rows.find(r => r['Account Name'] === name);
    if (!found) return;
    openModal('#modalAccount');
    $('#accName').value = found['Account Name'];
    $('#accType').value = found['Type'];
    $('#accInitialBalance').value = found['Balance'];
    $('#accCardNumber').value = found['Card Number']||'';
    $('#accIssuer').value = found['Issuer']||'';
  });
}

function populateAccountSelect(select){
  if (!select) return;
  const opts = state.accounts.map(a => `<option value="${a['Account Name']}">${a['Account Name']}</option>`).join('');
  select.innerHTML = `<option value="" disabled selected>Select Account</option>${opts}`;
}

function renderTransferInline(){
  populateAccountSelect($('#trFromSelect'));
  populateAccountSelect($('#trToSelect'));
  $('#trDateInline').value = todayISO();
  const show = state.settings.multiCurrency; $('#trCurrencyWrapInline').classList.toggle('hidden', !show);
  const swap = $('#btnSwapAccounts');
  if (swap) swap.onclick = ()=>{
    const from = $('#trFromSelect'); const to = $('#trToSelect');
    const tmp = from.value; from.value = to.value; to.value = tmp;
  };
}

function populateCategorySelect(select, type){
  if (!select) return;
  const list = (state.settings.categories && state.settings.categories[type]) || [];
  const opts = list.map(c => `<option value="${c}">${c}</option>`).join('');
  select.innerHTML = `<option value="" disabled selected>Select ${type} category</option>${opts}`;
}

// Modals
const modals = $$('.modal');
const overlay = $('#modalOverlay');
function openModal(id){
  if (overlay) { overlay.classList.remove('hidden'); overlay.classList.add('show'); }
  const el = $(id); if (el) { el.classList.remove('hidden'); el.classList.add('show'); }
}
function closeModals(){
  if (overlay) { overlay.classList.remove('show'); overlay.classList.add('hidden'); }
  modals.forEach(m => { m.classList.remove('show'); m.classList.add('hidden'); });
}
if (overlay) overlay.addEventListener('click', closeModals);
$$('.modal .modal-close').forEach(btn => btn.addEventListener('click', closeModals));

// Open modal buttons
function openIncomeModal(){ $('#incDate').value = todayISO(); populateAccountSelect($('#incAccountSelect')); populateCategorySelect($('#incCategorySelect'),'income'); toggleCurrencyRow('inc'); openModal('#modalIncome'); }
function openExpenseModal(){ $('#expDate').value = todayISO(); populateAccountSelect($('#expAccountSelect')); populateCategorySelect($('#expCategorySelect'),'expense'); toggleCurrencyRow('exp'); openModal('#modalExpense'); }
const addIncomeBtn = $('#btnAddIncome'); if (addIncomeBtn) addIncomeBtn.addEventListener('click', (e)=>{ e.stopPropagation(); location.hash = 'income'; navigateTo('income'); openIncomeModal(); });
const addExpenseBtn = $('#btnAddExpense'); if (addExpenseBtn) addExpenseBtn.addEventListener('click', (e)=>{ e.stopPropagation(); location.hash = 'expense'; navigateTo('expense'); openExpenseModal(); });
const addAccountBtn = $('#btnAddAccount'); if (addAccountBtn) addAccountBtn.addEventListener('click', (e)=>{ e.stopPropagation(); location.hash = 'accounts'; openModal('#modalAccount'); });
const addLBBtn = $('#btnAddLentBorrowed'); if (addLBBtn) addLBBtn.addEventListener('click', ()=> openModal('#modalLentBorrowed'));

function toggleCurrencyRow(prefix){
  const show = state.settings.multiCurrency;
  $(`#${prefix}CurrencyWrap`).classList.toggle('hidden', !show);
}

// Save handlers
function resetIncomeForm(){ $('#incAmount').value=''; $('#incNotes').value=''; $('#incCategorySelect').selectedIndex=0; $('#incAccountSelect').selectedIndex=0; }
function resetExpenseForm(){ $('#expAmount').value=''; $('#expNotes').value=''; $('#expCategorySelect').selectedIndex=0; $('#expAccountSelect').selectedIndex=0; }

const saveIncomeBtn = $('#saveIncome'); if (saveIncomeBtn) saveIncomeBtn.addEventListener('click', async ()=>{
  const row = {
    Date: $('#incDate').value,
    Amount: Number($('#incAmount').value||0),
    Category: $('#incCategorySelect').value,
    Account: $('#incAccountSelect').value,
    Notes: $('#incNotes').value,
    Currency: state.settings.multiCurrency ? ($('#incCurrency').value||state.settings.baseCurrency) : state.settings.baseCurrency
  };
  await api.addIncome(row); await refreshAll(); resetIncomeForm(); closeModals();
});
const saveExpenseBtn = $('#saveExpense'); if (saveExpenseBtn) saveExpenseBtn.addEventListener('click', async ()=>{
  const row = {
    Date: $('#expDate').value,
    Amount: Number($('#expAmount').value||0),
    Category: $('#expCategorySelect').value,
    Account: $('#expAccountSelect').value,
    Notes: $('#expNotes').value,
    Currency: state.settings.multiCurrency ? ($('#expCurrency').value||state.settings.baseCurrency) : state.settings.baseCurrency
  };
  await api.addExpense(row); await refreshAll(); resetExpenseForm(); closeModals();
});

// Save Account includes card details
const saveAccountBtn = $('#saveAccount'); if (saveAccountBtn) saveAccountBtn.addEventListener('click', async ()=>{
  const row = { AccountName: $('#accName').value, Type: $('#accType').value, Balance: Number($('#accInitialBalance').value||0), 'Card Number': $('#accCardNumber').value, 'Issuer': $('#accIssuer').value };
  await api.addAccount(row); await refreshAll(); closeModals();
});

const submitTransferBtn = $('#submitTransferInline'); if (submitTransferBtn) submitTransferBtn.addEventListener('click', async ()=>{
  const row = {
    FromAccount: $('#trFromSelect').value,
    ToAccount: $('#trToSelect').value,
    Amount: Number($('#trAmountInline').value||0),
    Date: $('#trDateInline').value,
    Notes: $('#trNotesInline').value,
    Currency: state.settings.multiCurrency ? ($('#trCurrencyInline').value||state.settings.baseCurrency) : state.settings.baseCurrency
  };
  await api.addTransfer(row); await refreshAll();
});

const saveLBBtn = $('#saveLentBorrowed'); if (saveLBBtn) saveLBBtn.addEventListener('click', async ()=>{
  const row = { Name: $('#lbName').value, Amount: Number($('#lbAmount').value||0), Date: $('#lbDate').value, Type: $('#lbType').value, Notes: $('#lbNotes').value };
  await api.addLentBorrowed(row); await refreshAll(); closeModals();
});

// View buttons also render filters
const viewIncomeBtn = $('#btnViewIncome'); if (viewIncomeBtn) viewIncomeBtn.addEventListener('click', async (e)=> {
  e.stopPropagation();
  location.hash = 'income';
  navigateTo('income');
  await renderTable('Income', '#incomeTableWrap');
  renderFilters('#incomeFilters','Income');
});
const viewExpenseBtn = $('#btnViewExpense'); if (viewExpenseBtn) viewExpenseBtn.addEventListener('click', async (e)=> {
  e.stopPropagation();
  location.hash = 'expense';
  navigateTo('expense');
  await renderTable('Expense', '#expenseTableWrap');
  renderFilters('#expenseFilters','Expense');
});
const viewLBBtn = $('#btnViewLentBorrowed'); if (viewLBBtn) viewLBBtn.addEventListener('click', async (e)=> {
  e.stopPropagation();
  location.hash = 'lentborrowed';
  navigateTo('lentborrowed');
  await renderTable('LentBorrowed', '#lentBorrowedTableWrap');
  renderFilters('#lentBorrowedFilters','LentBorrowed');
});

async function renderTable(table, wrapSelector){
  const wrap = $(wrapSelector); wrap.classList.remove('hidden');
  let data;
  try { data = await api.getTable(table); } catch (e){ console.error('Failed to load table', table, e); wrap.innerHTML = `<div style="padding:12px;">Failed to load ${table}</div>`; return; }
  const rows = data.rows || [];
  const headers = rows.length ? Object.keys(rows[0]).filter(h => h !== '_row') : [];
  const toolbar = `<div class="table-toolbar"><button class="btn small" data-back><i class="fa-solid fa-arrow-left"></i> Back to Dashboard</button><div class="spacer"></div><div class="table-title">${table}</div></div>`;
  const html = `
    ${toolbar}
    <table class="table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Actions</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr data-row="${r._row}">${headers.map(h=>`<td data-key="${h}">${h==='Date'?formatLocalDate(r[h]):(r[h]??'')}</td>`).join('')}<td>
          <button class="btn small" data-edit><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn danger small" data-delete><i class="fa-solid fa-trash"></i> Delete</button>
        </td></tr>`).join('')}
      </tbody>
    </table>`;
  wrap.innerHTML = html;
  const backBtn = wrap.querySelector('[data-back]');
  if (backBtn) backBtn.addEventListener('click', () => { location.hash = 'dashboard'; navigateTo('dashboard'); });
  // delegate clicks for edit/delete so it still works after filtering
  wrap.onclick = async (e)=>{
    const del = e.target.closest('[data-delete]');
    const ed = e.target.closest('[data-edit]');
    if (!del && !ed) return;
    const tr = e.target.closest('tr'); const row = Number(tr.getAttribute('data-row'));
    if (del){ if (!confirm('Delete this row?')) return; await api.deleteRow(table, row); await refreshAll(); await renderTable(table, wrapSelector); return; }
    if (ed){
      const getVal = (k) => tr.querySelector(`td[data-key="${k}"]`)?.textContent || '';
      if (table === 'Income'){
        location.hash = 'income'; navigateTo('income');
        $('#incDate').value = getVal('Date'); $('#incAmount').value = getVal('Amount'); $('#incCategorySelect').value = getVal('Category'); populateAccountSelect($('#incAccountSelect')); $('#incAccountSelect').value = getVal('Account'); $('#incNotes').value = getVal('Notes'); openModal('#modalIncome');
      } else if (table === 'Expense'){
        location.hash = 'expense'; navigateTo('expense');
        $('#expDate').value = getVal('Date'); $('#expAmount').value = getVal('Amount'); $('#expCategorySelect').value = getVal('Category'); populateAccountSelect($('#expAccountSelect')); $('#expAccountSelect').value = getVal('Account'); $('#expNotes').value = getVal('Notes'); openModal('#modalExpense');
      } else if (table === 'LentBorrowed'){
        location.hash = 'lentborrowed'; navigateTo('lentborrowed');
        $('#lbName').value = getVal('Name'); $('#lbAmount').value = getVal('Amount'); $('#lbDate').value = getVal('Date'); $('#lbType').value = getVal('Type'); $('#lbNotes').value = getVal('Notes'); openModal('#modalLentBorrowed');
      }
    }
  };
}

// Override totals balance logic to prevent double counting
import { state as __stateRef } from './storage.js';
function computeAccountsTotal(){
  return (__stateRef.accounts || []).reduce((a, acc) => a + Number(acc.Balance || 0), 0);
}

// Settings panel wiring
$('#settingsThemeDark').addEventListener('click', ()=>{ if (document.body.classList.contains('theme-light')) toggleTheme(); });
$('#settingsThemeLight').addEventListener('click', ()=>{ if (!document.body.classList.contains('theme-light')) toggleTheme(); });
$('#settingsLanguage').addEventListener('change', e => setLanguage(e.target.value));
$('#settingsCurrencySymbol').addEventListener('input', e => { state.settings.currencySymbol = e.target.value; saveSettings(); updateCards(); });
$('#settingsDateFormat').addEventListener('change', e => { state.settings.dateFormat = e.target.value; saveSettings(); });
$('#settingsNumberFormat').addEventListener('change', e => { state.settings.numberFormat = e.target.value; saveSettings(); updateCards(); });
$('#settingsAutoSync').addEventListener('change', e => { state.settings.autoSync = e.target.checked; saveSettings(); });
$('#settingsNotifications').addEventListener('change', e => { state.settings.notifications = e.target.checked; saveSettings(); });
$('#settingsMultiCurrency').addEventListener('change', e => { state.settings.multiCurrency = e.target.checked; saveSettings(); });
$('#settingsBaseCurrency').addEventListener('change', e => { state.settings.baseCurrency = e.target.value; saveSettings(); });
$('#settingsCategories').addEventListener('input', debounce(e => { try { state.settings.categories = JSON.parse(e.target.value); saveSettings(); } catch {} }, 600));
$('#settingsAccountTypes').addEventListener('input', e => { state.settings.accountTypes = e.target.value.split(',').map(s=>s.trim()).filter(Boolean); saveSettings(); });

const btnExportJSON = $('#btnExportJSON'); if (btnExportJSON) btnExportJSON.addEventListener('click', async ()=>{
  const data = await api.exportBackup(); download(`backup-${Date.now()}.json`, JSON.stringify(data, null, 2));
});
const btnExportCSV = $('#btnExportCSV'); if (btnExportCSV) btnExportCSV.addEventListener('click', async ()=>{
  const data = await api.exportBackup();
  const csv = Object.entries(data).map(([name, rows]) => {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const body = rows.map(r => headers.map(h => r[h] ?? '') );
    return [`# ${name}`, toCSV([headers, ...body])].join('\n');
  }).join('\n\n');
  download(`backup-${Date.now()}.csv`, csv, 'text/csv');
});
const btnExportXLSX = $('#btnExportXLSX'); if (btnExportXLSX) btnExportXLSX.addEventListener('click', async ()=>{
  const data = await api.exportBackup(); download(`backup-${Date.now()}.json`, JSON.stringify(data, null, 2));
});

const btnImportCSV = $('#btnImportCSV'); if (btnImportCSV) btnImportCSV.addEventListener('click', async ()=>{
  const file = $('#inputImportCSV').files?.[0]; if (!file) return;
  const text = await file.text(); const rows = parseCSV(text);
  const target = $('#importTarget').value;
  await api.importCSV(target, rows);
  await refreshAll();
});

const btnDataReset = $('#btnDataReset'); if (btnDataReset) btnDataReset.addEventListener('click', async ()=>{ if (!confirm('Clear all transactions?')) return; await api.resetData(); await refreshAll(); });

// Global search
const globalSearch = $('#globalSearch'); if (globalSearch) globalSearch.addEventListener('input', debounce(e => {
  const q = (e.target.value||'').toLowerCase();
  $$('.table-wrap table tbody tr').forEach(tr => {
    const text = tr.textContent.toLowerCase(); tr.style.display = text.includes(q) ? '' : 'none';
  });
}, 250));

// Init
async function refreshAll(){
  try {
    const data = await api.getAllData();
    setAllData(data);
    applySettingsToUI();
    updateCards();
    renderAccounts();
    renderTransferInline();
    refreshCharts($('.chip.active')?.dataset.filter || 'this_month');
  } catch (e){
    console.error('Failed to fetch data', e);
    const dash = document.querySelector('#route-dashboard');
    if (dash){
      const id = 'api-error';
      if (!document.getElementById(id)){
        const div = document.createElement('div'); div.id = id;
        div.style.cssText = 'margin:10px 0;padding:10px;border:1px solid rgba(255,255,255,.2);border-radius:10px;background:rgba(255,0,0,.1)';
        div.innerHTML = 'Cannot reach backend. <button id="btnSetApiUrl" class="btn small" style="margin-left:8px;">Set API URL</button>';
        dash.prepend(div);
        const btn = div.querySelector('#btnSetApiUrl'); if (btn) btn.onclick = ()=>{ const url = prompt('Enter Web App URL (ends with /exec)'); if (url) { try { import('./api.js').then(m => m.setApiBaseUrl(url)); location.reload(); } catch {} } };
      }
    }
  }
}

function applySettingsToUI(){
  const s = state.settings;
  document.body.classList.toggle('theme-light', s.theme === 'light');
  document.body.classList.toggle('theme-dark', s.theme !== 'light');
  if (langSel) langSel.value = s.language; translatePage(s.language);
  if (currSel) currSel.value = s.currencySymbol;
  $('#settingsLanguage').value = s.language;
  $('#settingsCurrencySymbol').value = s.currencySymbol;
  $('#settingsDateFormat').value = s.dateFormat;
  $('#settingsNumberFormat').value = s.numberFormat;
  $('#settingsAutoSync').checked = s.autoSync;
  $('#settingsNotifications').checked = s.notifications;
  $('#settingsMultiCurrency').checked = s.multiCurrency;
  $('#settingsBaseCurrency').value = s.baseCurrency;
  $('#settingsCategories').value = JSON.stringify(s.categories, null, 2);
  $('#settingsAccountTypes').value = s.accountTypes.join(',');
}

async function saveSettings(){ await api.updateSettings(state.settings); }

// Dashboard filter chips
$$('.filters .chip').forEach(chip => chip.addEventListener('click', () => {
  $$('.filters .chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); refreshCharts(chip.dataset.filter);
}));

function bindActionButtons(){
  const addIncomeBtn = $('#btnAddIncome'); if (addIncomeBtn) addIncomeBtn.onclick = (e)=>{ e.stopPropagation(); location.hash = 'income'; navigateTo('income'); openIncomeModal(); };
  const addExpenseBtn = $('#btnAddExpense'); if (addExpenseBtn) addExpenseBtn.onclick = (e)=>{ e.stopPropagation(); location.hash = 'expense'; navigateTo('expense'); openExpenseModal(); };
  const addAccountBtn = $('#btnAddAccount'); if (addAccountBtn) addAccountBtn.onclick = (e)=>{ e.stopPropagation(); location.hash = 'accounts'; navigateTo('accounts'); openModal('#modalAccount'); };
  const viewIncomeBtn = $('#btnViewIncome'); if (viewIncomeBtn) viewIncomeBtn.onclick = async (e)=>{ e.stopPropagation(); location.hash = 'income'; navigateTo('income'); openIncomeModal(); };
  const viewExpenseBtn = $('#btnViewExpense'); if (viewExpenseBtn) viewExpenseBtn.onclick = async (e)=>{ e.stopPropagation(); location.hash = 'expense'; navigateTo('expense'); openExpenseModal(); };
  const viewLBBtn = $('#btnViewLentBorrowed'); if (viewLBBtn) viewLBBtn.onclick = async (e)=>{ e.stopPropagation(); location.hash = 'lentborrowed'; navigateTo('lentborrowed'); openIncomeModal(); };
}

function showLoading(target){ if (!target) return; target.innerHTML = '<div style="padding:12px; opacity:.8;">Loading...</div>'; }
let requestLock = false;
async function guarded(fn){ if (requestLock) return; requestLock = true; try { await fn(); } finally { requestLock = false; } }

// Bind action cards
function bindActionCards(){
  const addInc = $('#cardAddIncome'); if (addInc) addInc.onclick = ()=> openIncomeModal();
  const viewInc = $('#cardViewIncome'); if (viewInc) viewInc.onclick = ()=> guarded(async ()=>{ const wrap = $('#incomeTableWrap'); showLoading(wrap); await renderTable('Income', '#incomeTableWrap'); renderFilters('#incomeFilters','Income'); });
  const addExp = $('#cardAddExpense'); if (addExp) addExp.onclick = ()=> openExpenseModal();
  const viewExp = $('#cardViewExpense'); if (viewExp) viewExp.onclick = ()=> guarded(async ()=>{ const wrap = $('#expenseTableWrap'); showLoading(wrap); await renderTable('Expense', '#expenseTableWrap'); renderFilters('#expenseFilters','Expense'); });
  const addAcc = $('#cardAddAccount'); if (addAcc) addAcc.onclick = ()=> openModal('#modalAccount');
  const viewAcc = $('#cardViewAccounts'); if (viewAcc) viewAcc.onclick = ()=> guarded(async ()=>{ /* Accounts already visible as cards; future table view can be added */ });
  const addLB = $('#cardAddLB'); if (addLB) addLB.onclick = ()=> openModal('#modalLentBorrowed');
  const viewLB = $('#cardViewLB'); if (viewLB) viewLB.onclick = ()=> guarded(async ()=>{ const wrap = $('#lentBorrowedTableWrap'); showLoading(wrap); await renderTable('LentBorrowed', '#lentBorrowedTableWrap'); renderFilters('#lentBorrowedFilters','LentBorrowed'); });
}

window.addEventListener('DOMContentLoaded', async ()=>{
  initCharts();
  navigateTo(location.hash.replace('#','') || 'dashboard');
  bindActionButtons();
  bindActionCards();
  try { await refreshAll(); } catch (e) { console.error(e); alert('Configure API URL in frontend/api.js and deploy Apps Script Web App.'); }
});