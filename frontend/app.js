import { $, $$, formatNumber, download, parseCSV, toCSV, debounce, todayISO } from './utils.js';
import { translatePage, getCurrentLang, t } from './i18n.js';
import { api } from './api.js';
import { state, setSettings, setAllData, totals } from './storage.js';
import { initCharts, refreshCharts, refreshChartTheme } from './charts.js';

// Sidebar toggle
const sidebar = $('#sidebar');
const btnSidebarToggle = $('#btnSidebarToggle');
if (btnSidebarToggle) btnSidebarToggle.addEventListener('click', () => {
  // Toggle between expanded and mini
  if (sidebar.classList.contains('mini')) {
    sidebar.classList.remove('mini');
  } else {
    sidebar.classList.add('mini');
  }
});

// Collapse to mini when clicking outside sidebar on mobile
window.addEventListener('click', (e) => {
  const isInsideSidebar = sidebar.contains(e.target) || (btnSidebarToggle && btnSidebarToggle.contains(e.target));
  if (!isInsideSidebar) {
    sidebar.classList.add('mini');
  }
});

// Routing
const routes = $$('.menu-item');
routes.forEach(btn => btn.addEventListener('click', async () => {
  routes.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const route = btn.getAttribute('data-route');
  $$('.route').forEach(sec => sec.classList.remove('active'));
  const target = `#route-${route}`;
  const section = document.querySelector(target); if (section) section.classList.add('active');
  // Collapse to mini on selection for better content space
  sidebar.classList.add('mini');
  // auto-load views when entering sections
  if (route === 'income') await renderTable('Income', '#incomeTableWrap');
  if (route === 'expense') await renderTable('Expense', '#expenseTableWrap');
  if (route === 'lentborrowed') await renderTable('LentBorrowed', '#lentBorrowedTableWrap');
}));

// Topbar theme and language
const themeToggle = $('#themeToggle');
themeToggle.addEventListener('click', () => toggleTheme());
$('#languageSelect').addEventListener('change', (e) => { setLanguage(e.target.value); });
$('#currencySymbolSelect').addEventListener('change', (e) => { state.settings.currencySymbol = e.target.value; saveSettings(); updateCards(); });

function toggleTheme(target){
  const isLight = document.body.classList.toggle('theme-light');
  document.body.classList.toggle('theme-dark', !isLight);
  state.settings.theme = isLight ? 'light' : 'dark';
  saveSettings(); refreshChartTheme();
}

function setLanguage(lang){ translatePage(lang); state.settings.language = lang; $('#settingsLanguage').value = lang; saveSettings(); }

// Cards update
function updateCards(){
  const { income, expense, balance, cash, credit } = totals();
  const nf = state.settings.numberFormat; const d = state.settings.decimals; const sym = state.settings.currencySymbol;
  $('#totalIncome').textContent = sym + ' ' + formatNumber(income, nf, d);
  $('#totalExpense').textContent = sym + ' ' + formatNumber(expense, nf, d);
  $('#totalBalance').textContent = sym + ' ' + formatNumber(balance, nf, d);
  $('#cashBalance').textContent = sym + ' ' + formatNumber(cash, nf, d);
  $('#creditBalance').textContent = sym + ' ' + formatNumber(credit, nf, d);
}

function iconForAccountType(type){
  const t = String(type||'').toLowerCase();
  if (t.includes('credit')) return 'fa-credit-card';
  if (t.includes('cash')) return 'fa-sack-dollar';
  if (t.includes('bank')) return 'fa-building-columns';
  return 'fa-wallet';
}

function renderAccounts(){
  const wrap = $('#accountsCards'); if (!wrap) return;
  const nf = state.settings.numberFormat; const d = state.settings.decimals; const sym = state.settings.currencySymbol;
  wrap.innerHTML = state.accounts.map(acc => {
    const name = acc['Account Name'] || acc.AccountName || '';
    const type = acc.Type || '';
    const bal = Number(acc.Balance || 0);
    return `
      <div class="card">
        <div class="card-title"><i class="fa-solid ${iconForAccountType(type)}"></i> ${name}</div>
        <div class="card-value">${sym} ${formatNumber(bal, nf, d)}</div>
        <div class="card-meta" style="color: var(--text-dim); font-size: 12px; margin-top: 6px;">${type}</div>
      </div>`;
  }).join('');
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
}

// Modals
const modals = $$('.modal');
const overlay = $('#modalOverlay');
function openModal(id){ overlay.classList.add('show'); $(id).classList.add('show'); }
function closeModals(){ overlay.classList.remove('show'); modals.forEach(m => m.classList.remove('show')); }
overlay.addEventListener('click', closeModals);
$$('.modal .modal-close').forEach(btn => btn.addEventListener('click', closeModals));

// Open modal buttons
$('#btnAddIncome').addEventListener('click', ()=>{ $('#incDate').value = todayISO(); populateAccountSelect($('#incAccountSelect')); toggleCurrencyRow('inc'); openModal('#modalIncome'); });
$('#btnAddExpense').addEventListener('click', ()=>{ $('#expDate').value = todayISO(); populateAccountSelect($('#expAccountSelect')); toggleCurrencyRow('exp'); openModal('#modalExpense'); });
$('#btnAddAccount').addEventListener('click', ()=> openModal('#modalAccount'));
// removed transfer modal open
$('#btnAddLentBorrowed').addEventListener('click', ()=> openModal('#modalLentBorrowed'));

function toggleCurrencyRow(prefix){
  const show = state.settings.multiCurrency;
  $(`#${prefix}CurrencyWrap`).classList.toggle('hidden', !show);
}

// Save handlers
$('#saveIncome').addEventListener('click', async ()=>{
  const row = {
    Date: $('#incDate').value,
    Amount: Number($('#incAmount').value||0),
    Category: $('#incCategory').value,
    Account: $('#incAccountSelect').value,
    Notes: $('#incNotes').value,
    Currency: state.settings.multiCurrency ? ($('#incCurrency').value||state.settings.baseCurrency) : state.settings.baseCurrency
  };
  await api.addIncome(row); await refreshAll(); closeModals();
});
$('#saveExpense').addEventListener('click', async ()=>{
  const row = {
    Date: $('#expDate').value,
    Amount: Number($('#expAmount').value||0),
    Category: $('#expCategory').value,
    Account: $('#expAccountSelect').value,
    Notes: $('#expNotes').value,
    Currency: state.settings.multiCurrency ? ($('#expCurrency').value||state.settings.baseCurrency) : state.settings.baseCurrency
  };
  await api.addExpense(row); await refreshAll(); closeModals();
});
$('#saveAccount').addEventListener('click', async ()=>{
  const row = { AccountName: $('#accName').value, Type: $('#accType').value, Balance: Number($('#accInitialBalance').value||0) };
  await api.addAccount(row); await refreshAll(); closeModals();
});

$('#submitTransferInline').addEventListener('click', async ()=>{
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

$('#saveLentBorrowed').addEventListener('click', async ()=>{
  const row = { Name: $('#lbName').value, Amount: Number($('#lbAmount').value||0), Date: $('#lbDate').value, Type: $('#lbType').value, Notes: $('#lbNotes').value };
  await api.addLentBorrowed(row); await refreshAll(); closeModals();
});

// View buttons
$('#btnViewIncome').addEventListener('click', async ()=> { await renderTable('Income', '#incomeTableWrap'); document.querySelector('#route-income').classList.add('active'); });
$('#btnViewExpense').addEventListener('click', async ()=> { await renderTable('Expense', '#expenseTableWrap'); document.querySelector('#route-expense').classList.add('active'); });
$('#btnViewLentBorrowed').addEventListener('click', async ()=> { await renderTable('LentBorrowed', '#lentBorrowedTableWrap'); document.querySelector('#route-lentborrowed').classList.add('active'); });

async function renderTable(table, wrapSelector){
  const wrap = $(wrapSelector); wrap.classList.remove('hidden');
  const data = await api.getTable(table);
  const rows = data.rows || [];
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const html = `
    <table class="table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r => `<tr>${headers.map(h=>`<td>${r[h]??''}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>`;
  wrap.innerHTML = html;
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

$('#btnExportJSON').addEventListener('click', async ()=>{
  const data = await api.exportBackup(); download(`backup-${Date.now()}.json`, JSON.stringify(data, null, 2));
});
$('#btnExportCSV').addEventListener('click', async ()=>{
  const data = await api.exportBackup();
  const csv = Object.entries(data).map(([name, rows]) => {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const body = rows.map(r => headers.map(h => r[h] ?? '') );
    return [`# ${name}`, toCSV([headers, ...body])].join('\n');
  }).join('\n\n');
  download(`backup-${Date.now()}.csv`, csv, 'text/csv');
});
$('#btnExportXLSX').addEventListener('click', async ()=>{
  const data = await api.exportBackup(); download(`backup-${Date.now()}.json`, JSON.stringify(data, null, 2));
});

$('#btnImportCSV').addEventListener('click', async ()=>{
  const file = $('#inputImportCSV').files?.[0]; if (!file) return;
  const text = await file.text(); const rows = parseCSV(text);
  const target = $('#importTarget').value;
  await api.importCSV(target, rows);
  await refreshAll();
});

$('#btnDataReset').addEventListener('click', async ()=>{ if (!confirm('Clear all transactions?')) return; await api.resetData(); await refreshAll(); });

// Global search
$('#globalSearch').addEventListener('input', debounce(e => {
  const q = (e.target.value||'').toLowerCase();
  $$('.table-wrap table tbody tr').forEach(tr => {
    const text = tr.textContent.toLowerCase(); tr.style.display = text.includes(q) ? '' : 'none';
  });
}, 250));

// Init
async function refreshAll(){
  const data = await api.getAllData();
  setAllData(data);
  applySettingsToUI();
  updateCards();
  renderAccounts();
  renderTransferInline();
  refreshCharts($('.chip.active')?.dataset.filter || 'this_month');
}

function applySettingsToUI(){
  const s = state.settings;
  document.body.classList.toggle('theme-light', s.theme === 'light');
  document.body.classList.toggle('theme-dark', s.theme !== 'light');
  $('#languageSelect').value = s.language; translatePage(s.language);
  $('#currencySymbolSelect').value = s.currencySymbol;
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

window.addEventListener('DOMContentLoaded', async ()=>{
  initCharts();
  try { await refreshAll(); } catch (e) { console.error(e); alert('Configure API URL in frontend/api.js and deploy Apps Script Web App.'); }
});