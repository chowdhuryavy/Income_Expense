import { $, $$, formatNumber, download, parseCSV, toCSV, debounce, todayISO } from './utils.js';
import { translatePage, getCurrentLang, t } from './i18n.js';
import { api } from './api.js';
import { state, setSettings, setAllData, totals } from './storage.js';
import * as Charts from './charts.js';

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

function updateTabLabel(route){
  const map = { 'dashboard':'Dashboard','income':'Income','income-view':'Income','expense':'Expense','expense-view':'Expense','accounts':'Accounts','accounts-view':'Accounts','lentborrowed':'Lent & Borrowed','lentborrowed-view':'Lent & Borrowed','transfer':'Transfer','settings':'Settings' };
  const el = document.getElementById('currentTabLabel'); if (el) el.textContent = map[route] || 'Dashboard';
}

window.addEventListener('hashchange', () => {
  const route = location.hash.replace('#','');
  navigateTo(route); updateTabLabel(route);
});

// Routing
const routes = $$('.menu-item');
function resetRouteView(route){
  if (route === 'income'){
    const sec = document.querySelector('#route-income'); if (!sec) return;
    const actions = sec.querySelector('.action-cards'); const filt = sec.querySelector('#incomeFilters'); const tbl = sec.querySelector('#incomeTableWrap');
    if (actions) actions.classList.remove('hidden'); if (filt) filt.classList.add('hidden'); if (tbl) tbl.classList.add('hidden');
  } else if (route === 'expense'){
    const sec = document.querySelector('#route-expense'); if (!sec) return;
    const actions = sec.querySelector('.action-cards'); const filt = sec.querySelector('#expenseFilters'); const tbl = sec.querySelector('#expenseTableWrap');
    if (actions) actions.classList.remove('hidden'); if (filt) filt.classList.add('hidden'); if (tbl) tbl.classList.add('hidden');
  } else if (route === 'lentborrowed'){
    const sec = document.querySelector('#route-lentborrowed'); if (!sec) return;
    const actions = sec.querySelector('.action-cards'); const filt = sec.querySelector('#lentBorrowedFilters'); const tbl = sec.querySelector('#lentBorrowedTableWrap');
    if (actions) actions.classList.remove('hidden'); if (filt) filt.classList.add('hidden'); if (tbl) tbl.classList.add('hidden');
  }
}
routes.forEach(btn => btn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const route = btn.getAttribute('data-route');
  location.hash = route; // triggers hashchange + navigate
  setSidebarExpanded(false);
  closeModals();
  resetRouteView(route);
  updateTabLabel(route);
}));

// Topbar theme and language
const themeToggle = $('#themeToggle');
if (themeToggle) themeToggle.addEventListener('click', () => toggleTheme());

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
  const categoryOptions = (state.settings.categories && (table==='Income' ? state.settings.categories.income : table==='Expense' ? state.settings.categories.expense : [])) || [];
  const accountOptions = state.accounts.map(a => a['Account Name']);
  el.innerHTML = `
    <div class="chips">
      <button class="chip" data-range="this_month">This Month</button>
      <button class="chip" data-range="last_month">Last Month</button>
      <button class="chip" data-range="this_year">This Year</button>
    </div>
    <input type="date" class="input" data-filter-from />
    <input type="date" class="input" data-filter-to />
    <select class="select" data-filter-category><option value="">All Categories</option>${categoryOptions.map(c=>`<option>${c}</option>`).join('')}</select>
    <select class="select" data-filter-account><option value="">All Accounts</option>${accountOptions.map(a=>`<option>${a}</option>`).join('')}</select>
    <input type="search" class="input" placeholder="Search" data-filter-q />
    <button class="btn small" data-apply><i class="fa-solid fa-filter"></i> Apply</button>
    <button class="btn small" data-clear><i class="fa-solid fa-eraser"></i> Clear</button>`;
  const setRange = (range)=>{
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = new Date(now.getFullYear(), now.getMonth()+1, 0);
    if (range === 'last_month'){
      start = new Date(now.getFullYear(), now.getMonth()-1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (range === 'this_year'){
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
    }
    el.querySelector('[data-filter-from]').value = formatLocalDate(start);
    el.querySelector('[data-filter-to]').value = formatLocalDate(end);
  };
  const apply = async ()=>{
    const from = el.querySelector('[data-filter-from]').value;
    const to = el.querySelector('[data-filter-to]').value;
    const q = (el.querySelector('[data-filter-q]').value||'').toLowerCase();
    const cat = el.querySelector('[data-filter-category]').value;
    const acc = el.querySelector('[data-filter-account]').value;
    const wrapSelector = table==='Income' ? '#incomeViewTable' : table==='Expense' ? '#expenseViewTable' : table==='LentBorrowed' ? '#lentBorrowedViewTable' : '#accountsViewTable';
    const wrap = $(wrapSelector);
    const { rows } = await api.getTable(table);
    const filtered = rows.filter(r => {
      const d = new Date(r.Date || r['Date'] || Date.now());
      const inRange = (!from || d >= new Date(from)) && (!to || d <= new Date(to));
      const hay = JSON.stringify(r).toLowerCase();
      const match = !q || hay.includes(q);
      const matchCat = !cat || (r.Category === cat);
      const matchAcc = !acc || (r.Account === acc || r['Account Name'] === acc);
      return inRange && match && matchCat && matchAcc;
    });
    wrap.querySelector('tbody').innerHTML = filtered.map(r => {
      const headers = Object.keys(r).filter(h=>h!=='_row');
      return `<tr data-row="${r._row}">${headers.map(h=>`<td data-key="${h}">${h==='Date'?formatLocalDate(r[h]):(r[h]??'')}</td>`).join('')}<td>
        <button class="btn small" data-edit><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn danger small" data-delete><i class="fa-solid fa-trash"></i> Delete</button>
      </td></tr>`;
    }).join('');
  };
  el.querySelectorAll('.chip').forEach(ch => ch.onclick = ()=>{ el.querySelectorAll('.chip').forEach(c=>c.classList.remove('active')); ch.classList.add('active'); setRange(ch.getAttribute('data-range')); apply(); });
  el.querySelector('[data-apply]').onclick = apply;
  el.querySelector('[data-clear]').onclick = ()=>{ el.querySelector('[data-filter-from]').value=''; el.querySelector('[data-filter-to]').value=''; el.querySelector('[data-filter-q]').value=''; el.querySelector('[data-filter-category]').value=''; el.querySelector('[data-filter-account]').value=''; el.querySelectorAll('.chip').forEach(c=>c.classList.remove('active')); apply(); };
  // default to current month
  setRange('this_month'); apply();
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
    await api.deleteRow('Accounts', found._row); await refreshAll(); showSuccess('Account deleted');
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
    editContext = { mode: 'edit', table: 'Accounts', row: found._row };
    const sab = $('#saveAccount'); if (sab) sab.innerHTML = '<i class="fa-solid fa-check"></i> Update';
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

function withSpinner(btn, fn){
  return async ()=>{
    if (!btn) return fn();
    const original = btn.innerHTML;
    btn.innerHTML = original + ' <span class="spinner"></span>';
    btn.disabled = true;
    try { await fn(); } finally { btn.disabled = false; btn.innerHTML = original; }
  };
}

function showSuccess(message, parentSelector){
  const parent = parentSelector ? document.querySelector(parentSelector) : document.querySelector('.topbar');
  if (!parent) return;
  const div = document.createElement('div');
  div.className = 'alert';
  div.style.margin = '8px 0';
  div.textContent = message;
  parent.parentNode.insertBefore(div, parent.nextSibling);
  setTimeout(()=> div.remove(), 2000);
}

let editContext = { mode: null, table: null, row: null };

// Save handlers with spinner and success
const saveIncomeBtn = $('#saveIncome'); if (saveIncomeBtn) saveIncomeBtn.addEventListener('click', withSpinner(saveIncomeBtn, async ()=>{
  const row = {
    Date: $('#incDate').value,
    Amount: Number($('#incAmount').value||0),
    Category: $('#incCategorySelect').value,
    Account: $('#incAccountSelect').value,
    Notes: $('#incNotes').value,
    Currency: state.settings.multiCurrency ? ($('#incCurrency').value||state.settings.baseCurrency) : state.settings.baseCurrency
  };
  if (editContext.mode === 'edit' && editContext.table === 'Income'){
    await api.updateRow('Income', editContext.row, row);
  } else {
    await api.addIncome(row);
  }
  await refreshAll(); resetIncomeForm(); closeModals(); showSuccess('Income saved'); editContext = { mode: null, table: null, row: null };
}));

const saveExpenseBtn = $('#saveExpense'); if (saveExpenseBtn) saveExpenseBtn.addEventListener('click', withSpinner(saveExpenseBtn, async ()=>{
  const row = {
    Date: $('#expDate').value,
    Amount: Number($('#expAmount').value||0),
    Category: $('#expCategorySelect').value,
    Account: $('#expAccountSelect').value,
    Notes: $('#expNotes').value,
    Currency: state.settings.multiCurrency ? ($('#expCurrency').value||state.settings.baseCurrency) : state.settings.baseCurrency
  };
  if (editContext.mode === 'edit' && editContext.table === 'Expense'){
    await api.updateRow('Expense', editContext.row, row);
  } else {
    await api.addExpense(row);
  }
  await refreshAll(); resetExpenseForm(); closeModals(); showSuccess('Expense saved'); editContext = { mode: null, table: null, row: null };
}));

// Save Account includes card details
const saveAccountBtn = $('#saveAccount'); if (saveAccountBtn) saveAccountBtn.addEventListener('click', withSpinner(saveAccountBtn, async ()=>{
  const row = { AccountName: $('#accName').value, Type: $('#accType').value, Balance: Number($('#accInitialBalance').value||0), 'Card Number': $('#accCardNumber').value, 'Issuer': $('#accIssuer').value };
  if (editContext.mode === 'edit' && editContext.table === 'Accounts'){
    await api.updateRow('Accounts', editContext.row, { 'Account Name': row.AccountName, 'Type': row.Type, 'Balance': row.Balance, 'Card Number': row['Card Number'], 'Issuer': row['Issuer'] });
    showSuccess('Account updated');
  } else {
    await api.addAccount(row); showSuccess('Account saved');
  }
  editContext = { mode: null, table: null, row: null };
  const sab = $('#saveAccount'); if (sab) sab.innerHTML = '<i class="fa-solid fa-check"></i> Save';
  await refreshAll(); closeModals();
}));

const submitTransferBtn = $('#submitTransferInline'); if (submitTransferBtn) submitTransferBtn.addEventListener('click', withSpinner(submitTransferBtn, async ()=>{
  const row = {
    FromAccount: $('#trFromSelect').value,
    ToAccount: $('#trToSelect').value,
    Amount: Number($('#trAmountInline').value||0),
    Date: $('#trDateInline').value,
    Notes: $('#trNotesInline').value,
    Currency: state.settings.multiCurrency ? ($('#trCurrencyInline').value||state.settings.baseCurrency) : state.settings.baseCurrency
  };
  await api.addTransfer(row); await refreshAll(); showSuccess('Transfer completed');
}));

const saveLBBtn = $('#saveLentBorrowed'); if (saveLBBtn) saveLBBtn.addEventListener('click', withSpinner(saveLBBtn, async ()=>{
  const row = { Name: $('#lbName').value, Amount: Number($('#lbAmount').value||0), Date: $('#lbDate').value, Type: $('#lbType').value, Notes: $('#lbNotes').value };
  if (editContext.mode === 'edit' && editContext.table === 'LentBorrowed'){
    await api.updateRow('LentBorrowed', editContext.row, row);
  } else {
    await api.addLentBorrowed(row);
  }
  await refreshAll(); closeModals(); showSuccess('Saved'); editContext = { mode: null, table: null, row: null };
}));

// View buttons also render filters
const viewIncomeBtn = $('#btnViewIncome'); if (viewIncomeBtn) viewIncomeBtn.addEventListener('click', async (e)=> {
  e.stopPropagation();
  location.hash = 'income';
  navigateTo('income');
  await renderTable('Income', '#incomeTableWrap');
  renderFilters('#incomeFilters','Income');
  showSuccess('Income loaded');
});
const viewExpenseBtn = $('#btnViewExpense'); if (viewExpenseBtn) viewExpenseBtn.addEventListener('click', async (e)=> {
  e.stopPropagation();
  location.hash = 'expense';
  navigateTo('expense');
  await renderTable('Expense', '#expenseTableWrap');
  renderFilters('#expenseFilters','Expense');
  showSuccess('Expense loaded');
});
const viewLBBtn = $('#btnViewLentBorrowed'); if (viewLBBtn) viewLBBtn.addEventListener('click', async (e)=> {
  e.stopPropagation();
  location.hash = 'lentborrowed';
  navigateTo('lentborrowed');
  await renderTable('LentBorrowed', '#lentBorrowedTableWrap');
  renderFilters('#lentBorrowedFilters','LentBorrowed');
  showSuccess('Lent/Borrowed loaded');
});

async function renderTable(table, wrapSelector){
  // hide action cards for the current section
  if (wrapSelector.includes('income')){ const actions = document.querySelector('#route-income .action-cards'); if (actions) actions.classList.add('hidden'); }
  if (wrapSelector.includes('expense')){ const actions = document.querySelector('#route-expense .action-cards'); if (actions) actions.classList.add('hidden'); }
  if (wrapSelector.includes('lentBorrowed')){ const actions = document.querySelector('#route-lentborrowed .action-cards'); if (actions) actions.classList.add('hidden'); }
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
    if (del){ if (!confirm('Delete this row?')) return; await api.deleteRow(table, row); await refreshAll(); await renderTable(table, wrapSelector); showSuccess('Deleted'); return; }
    if (ed){
      const getVal = (k) => tr.querySelector(`td[data-key="${k}"]`)?.textContent || '';
      if (table === 'Income'){
        location.hash = 'income'; navigateTo('income');
        $('#incDate').value = getVal('Date'); $('#incAmount').value = getVal('Amount'); $('#incCategorySelect').value = getVal('Category'); populateAccountSelect($('#incAccountSelect')); $('#incAccountSelect').value = getVal('Account'); $('#incNotes').value = getVal('Notes'); editContext = { mode: 'edit', table: 'Income', row }; $('#saveIncome').innerHTML = '<i class="fa-solid fa-check"></i> Update'; openModal('#modalIncome');
      } else if (table === 'Expense'){
        location.hash = 'expense'; navigateTo('expense');
        $('#expDate').value = getVal('Date'); $('#expAmount').value = getVal('Amount'); $('#expCategorySelect').value = getVal('Category'); populateAccountSelect($('#expAccountSelect')); $('#expAccountSelect').value = getVal('Account'); $('#expNotes').value = getVal('Notes'); editContext = { mode: 'edit', table: 'Expense', row }; $('#saveExpense').innerHTML = '<i class="fa-solid fa-check"></i> Update'; openModal('#modalExpense');
      } else if (table === 'LentBorrowed'){
        location.hash = 'lentborrowed'; navigateTo('lentborrowed');
        $('#lbName').value = getVal('Name'); $('#lbAmount').value = getVal('Amount'); $('#lbDate').value = getVal('Date'); $('#lbType').value = getVal('Type'); $('#lbNotes').value = getVal('Notes'); editContext = { mode: 'edit', table: 'LentBorrowed', row }; $('#saveLentBorrowed').innerHTML = '<i class="fa-solid fa-check"></i> Update'; openModal('#modalLentBorrowed');
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
    if (Charts && Charts.refreshCharts) Charts.refreshCharts($('.chip.active')?.dataset.filter || state.settings.defaultRange || 'this_month');
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
  // New settings
  document.querySelectorAll('.chk-card').forEach(cb => { cb.checked = s.dashboardPrefs.cards.includes(cb.value); });
  document.querySelectorAll('.chk-chart').forEach(cb => { cb.checked = s.dashboardPrefs.charts.includes(cb.value); });
  const pc = document.getElementById('settingsPrimaryColor'); if (pc) pc.value = s.themeColors.primary;
  const ac = document.getElementById('settingsAccentColor'); if (ac) ac.value = s.themeColors.accent;
  const dr = document.getElementById('settingsDefaultRange'); if (dr) dr.value = s.defaultRange;
  const dt = document.getElementById('settingsDefaultTab'); if (dt) dt.value = s.defaultTab;
  const bud = document.getElementById('settingsBudgets'); if (bud) bud.value = JSON.stringify(s.budgets||{}, null, 2);
  const thr = document.getElementById('settingsThresholds'); if (thr) thr.value = JSON.stringify(s.notificationThresholds||{}, null, 2);
  const ar = document.getElementById('settingsArchiveMonths'); if (ar) ar.value = s.archiveMonths;
  // Apply dashboard prefs visibility
  const cardMap = { total: '#totalBalance', income: '#totalIncome', expense: '#totalExpense', cash: '#cashBalance', credit: '#creditBalance', debit: '#debitBalance' };
  Object.entries(cardMap).forEach(([key, sel]) => { const el = document.querySelector(sel)?.closest('.card'); if (el) el.style.display = s.dashboardPrefs.cards.includes(key) ? '' : 'none'; });
  const chartMap = { line: '#chartLine', bar: '#chartBar', pie: '#chartPie', donut: '#chartDonut', stacked: '#chartStacked' };
  Object.entries(chartMap).forEach(([key, sel]) => { const el = document.querySelector(sel); if (el) el.style.display = s.dashboardPrefs.charts.includes(key) ? '' : 'none'; });
}

async function saveSettings(){ await api.updateSettings(state.settings); }

// Dashboard filter chips
$$('.filters .chip').forEach(chip => chip.addEventListener('click', () => {
  $$('.filters .chip').forEach(c => c.classList.remove('active')); chip.classList.add('active');
  if (Charts && Charts.refreshCharts) Charts.refreshCharts(chip.dataset.filter);
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

// Accounts view render
function renderAccountsTable(){
  const wrap = $('#accountsViewTable'); if (!wrap) return;
  const headers = ['Account Name','Type','Balance','Card Number','Issuer'];
  const html = `
    <div class="table-toolbar"><button class="btn small" data-back><i class="fa-solid fa-arrow-left"></i> Back to Dashboard</button><div class="spacer"></div><div class="table-title">Accounts</div></div>
    <table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Actions</th></tr></thead><tbody>
      ${state.accounts.map(r => `<tr data-name="${r['Account Name']}">${headers.map(h=>`<td data-key="${h}">${r[h]??''}</td>`).join('')}<td><button class="btn small" data-edit> Edit</button><button class="btn danger small" data-delete> Delete</button></td></tr>`).join('')}
    </tbody></table>`;
  wrap.innerHTML = html;
  const back = wrap.querySelector('[data-back]'); if (back) back.onclick = ()=>{ location.hash='dashboard'; navigateTo('dashboard'); };
  wrap.onclick = async (e)=>{
    const tr = e.target.closest('tr'); if (!tr) return; const name = tr.getAttribute('data-name');
    if (e.target.closest('[data-delete]')){
      const { rows } = await api.getTable('Accounts'); const found = rows.find(r=>r['Account Name']===name); if (found){ if (!confirm('Delete this account?')) return; await api.deleteRow('Accounts', found._row); await refreshAll(); renderAccountsTable(); showSuccess('Account deleted'); }
    } else if (e.target.closest('[data-edit]')){
      const { rows } = await api.getTable('Accounts'); const found = rows.find(r=>r['Account Name']===name); if (found){ openModal('#modalAccount'); $('#accName').value=found['Account Name']; $('#accType').value=found['Type']; $('#accInitialBalance').value=found['Balance']; $('#accCardNumber').value=found['Card Number']||''; $('#accIssuer').value=found['Issuer']||''; editContext={mode:'edit',table:'Accounts',row:found._row}; const sab=$('#saveAccount'); if(sab) sab.innerHTML='<i class="fa-solid fa-check"></i> Update'; }
    }
  };
}

// Bind action cards
function bindActionCards(){
  const addInc = $('#cardAddIncome'); if (addInc) addInc.onclick = ()=> openIncomeModal();
  const viewInc = $('#cardViewIncome'); if (viewInc) viewInc.onclick = ()=> guarded(async ()=>{ location.hash = 'income-view'; navigateTo('income-view'); const wrap = $('#incomeViewTable'); showLoading(wrap); await renderTable('Income', '#incomeViewTable'); renderFilters('#incomeViewFilters','Income'); });
  const addExp = $('#cardAddExpense'); if (addExp) addExp.onclick = ()=> openExpenseModal();
  const viewExp = $('#cardViewExpense'); if (viewExp) viewExp.onclick = ()=> guarded(async ()=>{ location.hash = 'expense-view'; navigateTo('expense-view'); const wrap = $('#expenseViewTable'); showLoading(wrap); await renderTable('Expense', '#expenseViewTable'); renderFilters('#expenseViewFilters','Expense'); });
  const addAcc = $('#cardAddAccount'); if (addAcc) addAcc.onclick = ()=> openModal('#modalAccount');
  const viewAcc = $('#cardViewAccounts'); if (viewAcc) viewAcc.onclick = ()=> guarded(async ()=>{ location.hash = 'accounts-view'; navigateTo('accounts-view'); renderAccountsTable(); });
  const addLB = $('#cardAddLB'); if (addLB) addLB.onclick = ()=> openModal('#modalLentBorrowed');
  const viewLB = $('#cardViewLB'); if (viewLB) viewLB.onclick = ()=> guarded(async ()=>{ location.hash = 'lentborrowed-view'; navigateTo('lentborrowed-view'); const wrap = $('#lentBorrowedViewTable'); showLoading(wrap); await renderTable('LentBorrowed', '#lentBorrowedViewTable'); renderFilters('#lentBorrowedViewFilters','LentBorrowed'); });
}

// Start at dashboard and collapse sidebar
window.addEventListener('DOMContentLoaded', async ()=>{
  if (Charts && Charts.initCharts) await Charts.initCharts();
  location.hash = 'dashboard'; navigateTo('dashboard'); updateTabLabel('dashboard'); setSidebarExpanded(false);
  bindActionButtons();
  bindActionCards();
  try { await refreshAll(); } catch (e) { console.error(e); alert('Configure API URL in frontend/api.js and deploy Apps Script Web App.'); }
});

// Save Settings button
const btnSaveSettings = $('#btnSaveSettings'); if (btnSaveSettings) btnSaveSettings.onclick = async ()=>{
  // collect dashboard prefs
  state.settings.dashboardPrefs.cards = Array.from(document.querySelectorAll('.chk-card:checked')).map(cb=>cb.value);
  state.settings.dashboardPrefs.charts = Array.from(document.querySelectorAll('.chk-chart:checked')).map(cb=>cb.value);
  const pc = document.getElementById('settingsPrimaryColor'); if (pc) state.settings.themeColors.primary = pc.value;
  const ac = document.getElementById('settingsAccentColor'); if (ac) state.settings.themeColors.accent = ac.value;
  const dr = document.getElementById('settingsDefaultRange'); if (dr) state.settings.defaultRange = dr.value;
  const dt = document.getElementById('settingsDefaultTab'); if (dt) state.settings.defaultTab = dt.value;
  const bud = document.getElementById('settingsBudgets'); if (bud) { try { state.settings.budgets = JSON.parse(bud.value||'{}'); } catch {} }
  const thr = document.getElementById('settingsThresholds'); if (thr) { try { state.settings.notificationThresholds = JSON.parse(thr.value||'{}'); } catch {} }
  const ar = document.getElementById('settingsArchiveMonths'); if (ar) state.settings.archiveMonths = Number(ar.value||0);
  await saveSettings(); applySettingsToUI(); showSuccess('Settings saved');
};