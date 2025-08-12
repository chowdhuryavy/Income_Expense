let API_BASE_URL = "https://script.google.com/macros/s/AKfycbxlMJIFbe2BfU0GzYEQJc9vH4ZCM4upQB8qaycKyZ_Mo79HUdVFtZKvmtU1p3nEshuh/exec"; // provided deployment URL

function ensureUrl(){
  if (!API_BASE_URL || API_BASE_URL.includes("YOUR_DEPLOYED")) throw new Error("Configure API_BASE_URL in frontend/api.js");
}

async function get(action, params = {}){
  ensureUrl();
  const url = new URL(API_BASE_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GET ${action} failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function post(action, payload = {}){
  ensureUrl();
  const form = new FormData();
  form.append('action', action);
  form.append('payload', JSON.stringify(payload));
  const res = await fetch(API_BASE_URL, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`POST ${action} failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export const api = {
  ping: () => get('ping'),
  getAllData: () => get('getAllData'),
  getTable: (table) => get('getTable', { table }),
  getSettings: () => get('getSettings'),
  addIncome: (row) => post('addIncome', row),
  addExpense: (row) => post('addExpense', row),
  addAccount: (row) => post('addAccount', row),
  addTransfer: (row) => post('addTransfer', row),
  addLentBorrowed: (row) => post('addLentBorrowed', row),
  updateSettings: (settings) => post('updateSettings', settings),
  exportBackup: () => get('exportBackup'),
  resetData: () => post('resetData'),
  importCSV: (targetTable, rows) => post('importCSV', { targetTable, rows }),
  deleteRow: (table, row) => post('deleteRow', { table, row }),
  updateRow: (table, row, data) => post('updateRow', { table, row, data })
};

export function setApiBaseUrl(url){
  if (typeof url === 'string' && url.startsWith('http')) API_BASE_URL = url;
}