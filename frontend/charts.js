import { state, totals, filterByDateRange } from './storage.js';

let chartLine, chartBar, chartPie, chartDonut, chartStacked;

function baseChartOptions() {
  const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim();
  const gridColor = 'rgba(255,255,255,0.12)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: textColor, font: { size: 10 } } } },
    layout: { padding: 4 },
    backgroundColor: 'transparent',
    scales: {
      x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
      y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } }
    },
    elements: {
      point: { radius: 1.5 },
      line: { borderWidth: 1.5 },
      bar: { borderWidth: 0 }
    }
  };
}

export function initCharts(){
  const ctxLine = document.getElementById('chartLine');
  const ctxBar = document.getElementById('chartBar');
  const ctxPie = document.getElementById('chartPie');
  const ctxDonut = document.getElementById('chartDonut');
  const ctxStacked = document.getElementById('chartStacked');

  chartLine = new Chart(ctxLine, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Net', data: [], borderColor: '#3a7bd5', backgroundColor: 'rgba(58,123,213,.2)', fill: true }] },
    options: baseChartOptions()
  });
  chartBar = new Chart(ctxBar, {
    type: 'bar',
    data: { labels: [], datasets: [
      { label: 'Income', data: [], backgroundColor: 'rgba(22,163,74,.7)' },
      { label: 'Expense', data: [], backgroundColor: 'rgba(220,38,38,.7)' }
    ] },
    options: { ...baseChartOptions(), scales: { x: { stacked: true, ticks: { maxRotation: 0 } }, y: { stacked: true } } }
  });
  chartPie = new Chart(ctxPie, {
    type: 'pie', data: { labels: [], datasets: [{ data: [], backgroundColor: ['#3a7bd5','#00d2ff','#16a34a','#dc2626','#f59e0b','#a855f7'] }] }, options: baseChartOptions()
  });
  chartDonut = new Chart(ctxDonut, {
    type: 'doughnut', data: { labels: [], datasets: [{ data: [], backgroundColor: ['#60a5fa','#34d399','#f472b6','#fbbf24','#a78bfa','#f87171'] }] }, options: baseChartOptions()
  });
  chartStacked = new Chart(ctxStacked, {
    type: 'bar', data: { labels: [], datasets: [{ label: 'Net', data: [], backgroundColor: 'rgba(0,210,255,.6)' }] }, options: baseChartOptions()
  });
}

export function refreshCharts(range = 'this_month'){
  const inc = filterByDateRange(state.income, range);
  const exp = filterByDateRange(state.expense, range);

  const byMonth = (rows) => {
    const m = new Map();
    rows.forEach(r => { const d = new Date(r.Date || r.date); const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; m.set(key, (m.get(key)||0) + Number(r.Amount||0)); });
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b));
  };

  const incM = byMonth(inc), expM = byMonth(exp);
  const labels = Array.from(new Set([...incM.map(i=>i[0]), ...expM.map(i=>i[0])])).sort();
  const incData = labels.map(l => (incM.find(([k])=>k===l)?.[1]||0));
  const expData = labels.map(l => (expM.find(([k])=>k===l)?.[1]||0));

  chartLine.data.labels = labels; chartLine.data.datasets[0].data = labels.map((l, idx)=> (incData[idx] - expData[idx])); chartLine.update();
  chartBar.data.labels = labels; chartBar.data.datasets[0].data = incData; chartBar.data.datasets[1].data = expData; chartBar.update();

  const expByCat = new Map(); exp.forEach(r => expByCat.set(r.Category, (expByCat.get(r.Category)||0)+Number(r.Amount||0)));
  const pieLabels = Array.from(expByCat.keys()); const pieData = Array.from(expByCat.values());
  chartPie.data.labels = pieLabels; chartPie.data.datasets[0].data = pieData; chartPie.update();

  const incByCat = new Map(); inc.forEach(r => incByCat.set(r.Category, (incByCat.get(r.Category)||0)+Number(r.Amount||0)));
  const donutLabels = Array.from(incByCat.keys()); const donutData = Array.from(incByCat.values());
  chartDonut.data.labels = donutLabels; chartDonut.data.datasets[0].data = donutData; chartDonut.update();

  chartStacked.data.labels = labels; chartStacked.data.datasets[0].data = labels.map((l, idx)=> (incData[idx] - expData[idx])); chartStacked.update();
}

export function refreshChartTheme(){
  const opts = baseChartOptions();
  [chartLine, chartBar, chartPie, chartDonut, chartStacked].forEach(ch => { if (!ch) return; ch.options = { ...ch.options, ...opts }; ch.update(); });
}