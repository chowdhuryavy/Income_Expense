export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function formatNumber(value, numberFormat = "1,234.56", decimals = 2) {
  const num = Number(value || 0);
  const options = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  if (numberFormat === "1.234,56") {
    return num.toLocaleString("de-DE", options);
  }
  if (numberFormat === "1234.56") {
    return num.toLocaleString("en-US", { ...options, useGrouping: false });
  }
  return num.toLocaleString("en-US", options);
}

export function download(filename, content, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = lines.map(line => line.split(",").map(s => s.trim()))
  return rows;
}

export function toCSV(rows) {
  return rows.map(r => r.map(v => String(v).replace(/"/g, '""')).join(",")).join("\n");
}

export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function debounce(fn, delay = 250) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}