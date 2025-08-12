let API_BASE_URL = (typeof localStorage !== 'undefined' && localStorage.getItem('API_BASE_URL')) || "https://script.google.com/macros/s/AKfycbxlMJIFbe2BfU0GzYEQJc9vH4ZCM4upQB8qaycKyZ_Mo79HUdVFtZKvmtU1p3nEshuh/exec"; // provided deployment URL

function ensureUrl(){
  if (!API_BASE_URL || !API_BASE_URL.startsWith('http')) throw new Error("Configure API_BASE_URL in frontend/api.js");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000, retries = 2){
  for (let attempt = 0; attempt <= retries; attempt++){
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err){
      clearTimeout(t);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
}

async function get(action, params = {}){
  ensureUrl();
  const url = new URL(API_BASE_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetchWithTimeout(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function post(action, payload = {}){
  ensureUrl();
  const form = new FormData();
  form.append('action', action);
  form.append('payload', JSON.stringify(payload));
  const res = await fetchWithTimeout(API_BASE_URL, { method: 'POST', body: form });
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
  if (typeof url === 'string' && url.startsWith('http')) { API_BASE_URL = url; try { localStorage.setItem('API_BASE_URL', url); } catch {} }
}