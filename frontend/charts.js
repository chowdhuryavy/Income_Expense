import { state, filterByDateRange } from './storage.js';

let chLine, chBar, chPie, chDonut, chStacked;

function ensureApex(){
  if (window.ApexCharts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/apexcharts';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ApexCharts'));
    document.head.appendChild(s);
  });
}

function colors(){
  return ['#3a7bd5', '#00d2ff', '#16a34a', '#dc2626', '#f59e0b', '#a855f7'];
}

function themeMode(){ return document.body.classList.contains('theme-light') ? 'light' : 'dark'; }

export async function initCharts(){
  try { await ensureApex(); } catch (e){ console.error(e); return; }
  const optsBase = {
    chart: { foreColor: getComputedStyle(document.body).getPropertyValue('--text').trim(), toolbar: { show: false }, animations: { enabled: true } },
    grid: { borderColor: 'rgba(255,255,255,0.12)' },
    dataLabels: { enabled: false },
    legend: { show: true },
    colors: colors(),
    theme: { mode: themeMode() },
    noData: { text: 'No data', style: { color: getComputedStyle(document.body).getPropertyValue('--text').trim() } }
  };
  chLine = new ApexCharts(document.querySelector('#chartLine'), { ...optsBase, chart: { ...optsBase.chart, type: 'line', sparkline: { enabled: false } }, stroke: { width: 2 }, series: [{ name: 'Net', data: [] }], xaxis: { categories: [] } }); chLine.render();
  chBar = new ApexCharts(document.querySelector('#chartBar'), { ...optsBase, chart: { ...optsBase.chart, type: 'bar', stacked: true }, series: [{ name: 'Income', data: [] }, { name: 'Expense', data: [] }], xaxis: { categories: [] } }); chBar.render();
  chPie = new ApexCharts(document.querySelector('#chartPie'), { ...optsBase, chart: { ...optsBase.chart, type: 'pie' }, labels: [], series: [] }); chPie.render();
  chDonut = new ApexCharts(document.querySelector('#chartDonut'), { ...optsBase, chart: { ...optsBase.chart, type: 'donut' }, labels: [], series: [] }); chDonut.render();
  chStacked = new ApexCharts(document.querySelector('#chartStacked'), { ...optsBase, chart: { ...optsBase.chart, type: 'bar' }, series: [{ name: 'Net', data: [] }], xaxis: { categories: [] } }); chStacked.render();
}

export function refreshCharts(range = 'this_month'){
  if (!chLine) return;
  const inc = filterByDateRange(state.income, range);
  const exp = filterByDateRange(state.expense, range);
  const byMonth = (rows) => {
    const m = new Map(); rows.forEach(r => { const d = new Date(r.Date); if (isNaN(d)) return; const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; m.set(key, (m.get(key)||0) + Number(r.Amount||0)); });
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b));
  };
  const incM = byMonth(inc), expM = byMonth(exp);
  const labels = Array.from(new Set([...incM.map(i=>i[0]), ...expM.map(i=>i[0])])).sort();
  const incData = labels.map(l => (incM.find(([k])=>k===l)?.[1]||0));
  const expData = labels.map(l => (expM.find(([k])=>k===l)?.[1]||0));
  chLine.updateOptions({ xaxis: { categories: labels }, theme: { mode: themeMode() } }); chLine.updateSeries([{ name: 'Net', data: labels.map((_,i)=>incData[i]-expData[i]) }]);
  chBar.updateOptions({ xaxis: { categories: labels }, theme: { mode: themeMode() } }); chBar.updateSeries([{ name: 'Income', data: incData }, { name: 'Expense', data: expData }]);
  const expByCat = new Map(); exp.forEach(r => expByCat.set(r.Category || 'Uncategorized', (expByCat.get(r.Category || 'Uncategorized')||0)+Number(r.Amount||0)));
  const expLabels = Array.from(expByCat.keys()); const expVals = Array.from(expByCat.values());
  chPie.updateOptions({ labels: expLabels.length ? expLabels : ['No data'], theme: { mode: themeMode() } }); chPie.updateSeries(expVals.length ? expVals : [0]);
  const incByCat = new Map(); inc.forEach(r => incByCat.set(r.Category || 'Uncategorized', (incByCat.get(r.Category || 'Uncategorized')||0)+Number(r.Amount||0)));
  const incLabels = Array.from(incByCat.keys()); const incVals = Array.from(incByCat.values());
  chDonut.updateOptions({ labels: incLabels.length ? incLabels : ['No data'], theme: { mode: themeMode() } }); chDonut.updateSeries(incVals.length ? incVals : [0]);
  chStacked.updateOptions({ xaxis: { categories: labels }, theme: { mode: themeMode() } }); chStacked.updateSeries([{ name: 'Net', data: labels.map((_,i)=>incData[i]-expData[i]) }]);
}

export function refreshChartTheme(){ if (!chLine) return; initCharts().then(()=> refreshCharts()); }