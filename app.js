/* ============================================================
   THE LEDGER — application logic
   ============================================================ */

const STORAGE_KEY = 'ledger.localEdits.v1';
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Editorial chart palette
const PALETTE = {
  ink: '#1a1612',
  paper: '#f3ede1',
  paper2: '#ece4d3',
  rule: '#b9ad94',
  ruleSoft: '#d3c8af',
  inkSoft: '#3a342c',
  inkMute: '#6b6354',
  accent: '#7a1f1f',
  accentSoft: '#a83838',
  green: '#2f5a3a',
  gold: '#8a6f1c',
  goldLight: '#e8b04d',
};

// ============== STATE ==============
let baseData = [];     // from data.json (historical, immutable here)
let localEdits = {};   // keyed by 'YYYY-MM' -> entry
let mergedData = [];   // baseData merged with localEdits, sorted ascending
let charts = {};       // chart instances
let trendWindow = 12;  // months window for trends tab

// ============== UTILITIES ==============
const fmtZAR = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const n = Math.round(v);
  return 'R\u00A0' + n.toLocaleString('en-ZA');
};
const fmtZARShort = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return 'R\u00A0' + (v/1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return 'R\u00A0' + (v/1_000).toFixed(0) + 'k';
  return 'R\u00A0' + Math.round(v);
};
const fmtPct = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return (v * 100).toFixed(1) + '%';
};
const fmtSigned = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const sign = v >= 0 ? '+' : '−';
  return sign + ' R\u00A0' + Math.round(Math.abs(v)).toLocaleString('en-ZA');
};
const monthKey = (y, m) => `${y}-${String(m).padStart(2,'0')}`;
const monthLabel = (y, m, full = false) =>
  `${full ? MONTH_NAMES[m-1] : MONTH_SHORT[m-1]} ${y}`;

// ============== DATA LOADING ==============
async function loadData() {
  const res = await fetch('data.json');
  baseData = await res.json();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) localEdits = JSON.parse(stored);
  } catch (e) {
    console.warn('Could not load local edits', e);
    localEdits = {};
  }

  rebuildMerged();
}

function rebuildMerged() {
  const map = {};
  for (const row of baseData) {
    map[monthKey(row.year, row.month)] = { ...row, _source: 'base' };
  }
  for (const [key, row] of Object.entries(localEdits)) {
    map[key] = { ...row, _source: 'local' };
  }
  mergedData = Object.values(map).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localEdits));
  } catch (e) {
    alert('Could not save to browser storage: ' + e.message);
  }
}

// ============== TABS ==============
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.getElementById('panel-' + target).classList.add('active');
      // Charts need re-render when their panel becomes visible
      if (target === 'overview') renderOverview();
      if (target === 'trends') renderTrends();
      if (target === 'history') renderHistory();
    });
  });
}

// ============== MASTHEAD ==============
function renderMasthead() {
  const today = new Date();
  const dl = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('dateline').textContent = `— ${dl} · monthly accounts —`;
  document.getElementById('footerYear').textContent = today.getFullYear();
  if (mergedData.length > 0) {
    const first = mergedData[0];
    document.getElementById('estYear').textContent = first.year;
  }
}

// ============== OVERVIEW ==============
function renderOverview() {
  if (mergedData.length === 0) return;

  const latest = mergedData[mergedData.length - 1];
  const last12 = mergedData.slice(-12);
  const last13 = mergedData.slice(-13, -1); // excluding latest

  document.getElementById('latestMonth').textContent = monthLabel(latest.year, latest.month, true);
  document.getElementById('latestMonthLabel').textContent = monthLabel(latest.year, latest.month, true);
  document.getElementById('latestIncome').textContent = fmtZAR(latest.income);
  document.getElementById('latestSurplus').textContent = fmtZAR(latest.surplus ?? computeSurplus(latest));
  document.getElementById('latestSavings').textContent = fmtZAR(latest.savings);

  // Deltas vs 12-mo trailing avg (excluding latest)
  const avg = (arr, k) => {
    const xs = arr.map(r => r[k]).filter(v => typeof v === 'number');
    return xs.length ? xs.reduce((a,b) => a+b, 0) / xs.length : null;
  };
  const baseFor = last13.length ? last13 : last12.slice(0, -1);
  const avgIncome = avg(baseFor, 'income');
  const avgSurplus = avg(baseFor, 'surplus');
  const avgSavings = avg(baseFor, 'savings');

  const setDelta = (id, latestVal, avgVal) => {
    const el = document.getElementById(id);
    if (avgVal === null || latestVal === undefined) { el.textContent = '—'; return; }
    const diff = latestVal - avgVal;
    el.textContent = fmtSigned(diff);
    el.classList.toggle('up', diff >= 0);
    el.classList.toggle('down', diff < 0);
  };
  setDelta('deltaIncome', latest.income, avgIncome);
  setDelta('deltaSurplus', latest.surplus, avgSurplus);
  setDelta('deltaSavings', latest.savings, avgSavings);

  // Lifetime metrics
  const totalIncome = mergedData.reduce((s, r) => s + (r.income || 0), 0);
  const totalSaved = mergedData.reduce((s, r) => s + (r.savings || 0), 0);
  const surpluses = mergedData.map(r => r.surplus).filter(v => typeof v === 'number');
  const avgSurplusAll = surpluses.length ? surpluses.reduce((a,b) => a+b, 0) / surpluses.length : 0;
  const first = mergedData[0];
  const last = latest;

  document.getElementById('totalIncome').textContent = fmtZARShort(totalIncome);
  document.getElementById('totalIncomeSub').textContent = `over ${mergedData.length} months`;
  document.getElementById('totalSaved').textContent = fmtZARShort(totalSaved);
  document.getElementById('totalSavedSub').textContent = `${((totalSaved/totalIncome)*100).toFixed(1)}% save rate`;
  document.getElementById('avgSurplus').textContent = fmtZAR(avgSurplusAll);
  document.getElementById('monthsTracked').textContent = mergedData.length;
  document.getElementById('monthsTrackedSub').textContent =
    `${monthLabel(first.year, first.month)} → ${monthLabel(last.year, last.month)}`;

  drawIncomeSurplusChart();
  drawAllocationChart(latest);
}

function computeSurplus(row) {
  if (typeof row.surplus === 'number') return row.surplus;
  const disp = row.disposable ?? ((row.income || 0) - (row.fixed_expenses || 0));
  const allocations = (row.car_maintenance || 0) + (row.medical_aid || 0) + (row.petrol || 0) +
    (row.spending || 0) + (row.savings || 0) + (row.retirement || 0) + (row.clothing || 0) +
    (row.holiday || 0) + (row.cellphone || 0);
  return disp - allocations;
}

function drawIncomeSurplusChart() {
  const last24 = mergedData.slice(-24);
  const labels = last24.map(r => monthLabel(r.year, r.month));
  const incomeData = last24.map(r => r.income || 0);
  const surplusData = last24.map(r => r.surplus || 0);

  const ctx = document.getElementById('chartIncomeSurplus');
  if (charts.incomeSurplus) charts.incomeSurplus.destroy();
  charts.incomeSurplus = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: PALETTE.ink,
          borderRadius: 0,
          categoryPercentage: 0.85,
          barPercentage: 0.92,
        },
        {
          label: 'Surplus',
          data: surplusData,
          backgroundColor: PALETTE.accent,
          borderRadius: 0,
          categoryPercentage: 0.85,
          barPercentage: 0.92,
        },
      ],
    },
    options: chartBaseOptions(),
  });
}

function drawAllocationChart(row) {
  const fields = [
    { k: 'savings', label: 'Savings', color: PALETTE.ink },
    { k: 'spending', label: 'Spending', color: PALETTE.accent },
    { k: 'medical_aid', label: 'Medical aid', color: PALETTE.gold },
    { k: 'petrol', label: 'Petrol', color: PALETTE.green },
    { k: 'car_maintenance', label: 'Car maint.', color: PALETTE.accentSoft },
    { k: 'retirement', label: 'Retirement', color: PALETTE.goldLight },
    { k: 'cellphone', label: 'Cellphone', color: PALETTE.inkMute },
    { k: 'insurance', label: 'Insurance', color: PALETTE.inkSoft },
  ];
  const data = fields.map(f => row[f.k] || 0);
  const labels = fields.map(f => f.label);
  const colors = fields.map(f => f.color);

  const ctx = document.getElementById('chartAllocation');
  if (charts.allocation) charts.allocation.destroy();
  charts.allocation = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: PALETTE.paper2,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: PALETTE.inkSoft,
            font: { family: "'Fraunces', serif", size: 12, style: 'italic' },
            padding: 10,
            boxWidth: 12,
            boxHeight: 12,
          },
        },
        tooltip: tooltipStyle(),
      },
    },
  });
}

// ============== TRENDS ==============
function renderTrends() {
  drawTrendsChart();
  drawSavingsRateChart();
  drawAnnualChart();
}

function getWindowedData() {
  if (trendWindow === 0) return mergedData;
  return mergedData.slice(-trendWindow);
}

function drawTrendsChart() {
  const data = getWindowedData();
  const labels = data.map(r => monthLabel(r.year, r.month));
  const ctx = document.getElementById('chartTrends');
  if (charts.trends) charts.trends.destroy();
  charts.trends = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: data.map(r => r.income || 0),
          borderColor: PALETTE.ink,
          backgroundColor: 'rgba(26,22,18,0.06)',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: PALETTE.ink,
          fill: true,
        },
        {
          label: 'Fixed expenses',
          data: data.map(r => r.fixed_expenses || 0),
          borderColor: PALETTE.gold,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 4],
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: PALETTE.gold,
          fill: false,
        },
        {
          label: 'Surplus',
          data: data.map(r => r.surplus || 0),
          borderColor: PALETTE.accent,
          backgroundColor: 'rgba(122,31,31,0.08)',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: PALETTE.accent,
          fill: true,
        },
      ],
    },
    options: chartBaseOptions(),
  });
}

function drawSavingsRateChart() {
  const data = getWindowedData();
  const labels = data.map(r => monthLabel(r.year, r.month));
  const rate = data.map(r => (r.income > 0 ? ((r.savings || 0) + (r.retirement || 0)) / r.income : 0));
  const ctx = document.getElementById('chartSavingsRate');
  if (charts.savingsRate) charts.savingsRate.destroy();
  charts.savingsRate = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Savings rate',
        data: rate,
        borderColor: PALETTE.green,
        backgroundColor: 'rgba(47,90,58,0.12)',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: PALETTE.green,
        fill: true,
      }],
    },
    options: {
      ...chartBaseOptions(),
      scales: {
        ...chartBaseOptions().scales,
        y: {
          ...chartBaseOptions().scales.y,
          ticks: {
            ...chartBaseOptions().scales.y.ticks,
            callback: (v) => (v * 100).toFixed(0) + '%',
          },
        },
      },
      plugins: {
        ...chartBaseOptions().plugins,
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            label: (ctx) => 'Savings rate: ' + (ctx.parsed.y * 100).toFixed(1) + '%',
          },
        },
      },
    },
  });
}

function drawAnnualChart() {
  // Aggregate by year (only complete enough years)
  const byYear = {};
  for (const r of mergedData) {
    if (!byYear[r.year]) byYear[r.year] = { income: 0, savings: 0, retirement: 0, count: 0 };
    byYear[r.year].income += (r.income || 0);
    byYear[r.year].savings += (r.savings || 0);
    byYear[r.year].retirement += (r.retirement || 0);
    byYear[r.year].count += 1;
  }
  const years = Object.keys(byYear).sort();
  const incomeData = years.map(y => byYear[y].income);
  const savedData = years.map(y => byYear[y].savings + byYear[y].retirement);

  const ctx = document.getElementById('chartAnnual');
  if (charts.annual) charts.annual.destroy();
  charts.annual = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: PALETTE.ink,
          borderRadius: 0,
        },
        {
          label: 'Saved + retirement',
          data: savedData,
          backgroundColor: PALETTE.accent,
          borderRadius: 0,
        },
      ],
    },
    options: chartBaseOptions(),
  });
}

function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          color: PALETTE.inkSoft,
          font: { family: "'Fraunces', serif", size: 12, style: 'italic' },
          padding: 14,
          boxWidth: 12,
          boxHeight: 12,
        },
      },
      tooltip: tooltipStyle(),
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: true, color: PALETTE.rule },
        ticks: {
          color: PALETTE.inkMute,
          font: { family: "'JetBrains Mono', monospace", size: 10 },
          maxRotation: 45,
          minRotation: 0,
          autoSkip: true,
          autoSkipPadding: 12,
        },
        border: { color: PALETTE.rule },
      },
      y: {
        grid: { color: PALETTE.ruleSoft, drawBorder: false },
        ticks: {
          color: PALETTE.inkMute,
          font: { family: "'JetBrains Mono', monospace", size: 10 },
          callback: (v) => fmtZARShort(v),
        },
        border: { display: false },
      },
    },
  };
}

function tooltipStyle() {
  return {
    backgroundColor: PALETTE.ink,
    titleColor: PALETTE.paper,
    titleFont: { family: "'Fraunces', serif", style: 'italic', weight: '600', size: 13 },
    bodyColor: PALETTE.paper,
    bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
    borderColor: PALETTE.accent,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 0,
    displayColors: true,
    boxWidth: 8,
    boxHeight: 8,
    callbacks: {
      label: (ctx) => `${ctx.dataset.label}: ${fmtZAR(ctx.parsed.y)}`,
    },
  };
}

function setupTrendControls() {
  document.querySelectorAll('.window-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.window-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      trendWindow = parseInt(btn.dataset.window);
      renderTrends();
    });
  });
}

// ============== HISTORY ==============
function renderHistory(filter = '') {
  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = '';

  // Show most recent first
  const sorted = [...mergedData].reverse();
  const filtered = filter
    ? sorted.filter(r => String(r.year).includes(filter) || monthLabel(r.year, r.month, true).toLowerCase().includes(filter.toLowerCase()))
    : sorted;

  document.getElementById('historyCount').textContent =
    `${filtered.length} of ${mergedData.length} months`;

  for (const r of filtered) {
    const tr = document.createElement('tr');
    const saveRate = r.income > 0 ? ((r.savings || 0) + (r.retirement || 0)) / r.income : 0;
    const isLocal = r._source === 'local';
    tr.innerHTML = `
      <td class="month-cell ${isLocal ? 'local-tag' : ''}">${monthLabel(r.year, r.month, true)}</td>
      <td class="num">${fmtZAR(r.income)}</td>
      <td class="num">${fmtZAR(r.fixed_expenses)}</td>
      <td class="num">${fmtZAR(r.disposable)}</td>
      <td class="num">${fmtZAR(r.savings)}</td>
      <td class="num">${fmtZAR(r.spending)}</td>
      <td class="num">${fmtZAR(r.surplus)}</td>
      <td class="num">${fmtPct(saveRate)}</td>
      <td><button class="row-action" data-key="${monthKey(r.year, r.month)}">edit</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.row-action').forEach(btn => {
    btn.addEventListener('click', () => loadIntoForm(btn.dataset.key));
  });
}

function setupHistorySearch() {
  document.getElementById('historySearch').addEventListener('input', (e) => {
    renderHistory(e.target.value.trim());
  });
}

// ============== ENTRY FORM ==============
function setupEntryForm() {
  const form = document.getElementById('entryForm');

  // Pre-fill year/month with next month after latest
  if (mergedData.length > 0) {
    const last = mergedData[mergedData.length - 1];
    let y = last.year, m = last.month + 1;
    if (m > 12) { m = 1; y += 1; }
    form.year.value = y;
    form.month.value = m;
  }

  // Live calculator
  form.addEventListener('input', updateFormSummary);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = collectFormData();
    if (!data) return;

    const key = monthKey(data.year, data.month);
    localEdits[key] = data;
    saveLocal();
    rebuildMerged();

    showFormMessage(`Saved ${monthLabel(data.year, data.month, true)}.`, 'ok');
    renderMasthead();
    renderOverview();
    updateDataCounts();
  });

  document.getElementById('clearForm').addEventListener('click', () => {
    form.reset();
    updateFormSummary();
    showFormMessage('', '');
  });

  updateFormSummary();
}

function collectFormData() {
  const form = document.getElementById('entryForm');
  const num = (name) => {
    const v = parseFloat(form[name].value);
    return isNaN(v) ? 0 : v;
  };

  const year = parseInt(form.year.value);
  const month = parseInt(form.month.value);
  const income = parseFloat(form.income.value);

  if (!year || !month || isNaN(income)) {
    showFormMessage('Please fill in year, month, and income.', 'error');
    return null;
  }

  const insurance = num('insurance');
  const medical_aid = num('medical_aid');
  const cellphone_fixed = num('cellphone'); // treated as fixed in this form

  // Replicating the spreadsheet: Total Fixed = insurance + medical_aid + bank_charges
  // (cellphone in original sheet was sometimes fixed, sometimes allocation; we keep it under fixed here)
  const bank_charges = num('bank_charges');
  const fixed_expenses = insurance + medical_aid + bank_charges + cellphone_fixed;
  const disposable = income - fixed_expenses;

  const car_maintenance = num('car_maintenance');
  const petrol = num('petrol');
  const spending = num('spending');
  const savings = num('savings');
  const retirement = num('retirement');
  const clothing = num('clothing');
  const holiday = num('holiday');

  const allocations = car_maintenance + petrol + spending + savings + retirement + clothing + holiday;
  const surplus = disposable - allocations;

  return {
    year, month, income,
    insurance, medical_aid, bank_charges, cellphone: cellphone_fixed,
    fixed_expenses, disposable,
    car_maintenance, petrol, spending, savings, retirement, clothing, holiday,
    surplus,
  };
}

function updateFormSummary() {
  const data = collectFormDataSilent();
  document.getElementById('calcFixed').textContent = fmtZAR(data.fixed_expenses);
  document.getElementById('calcDisposable').textContent = fmtZAR(data.disposable);
  document.getElementById('calcSurplus').textContent = fmtZAR(data.surplus);
}

function collectFormDataSilent() {
  const form = document.getElementById('entryForm');
  const num = (name) => {
    const v = parseFloat(form[name].value);
    return isNaN(v) ? 0 : v;
  };
  const income = num('income');
  const fixed = num('insurance') + num('medical_aid') + num('bank_charges') + num('cellphone');
  const disposable = income - fixed;
  const allocations = num('car_maintenance') + num('petrol') + num('spending') +
    num('savings') + num('retirement') + num('clothing') + num('holiday');
  return { fixed_expenses: fixed, disposable, surplus: disposable - allocations };
}

function loadIntoForm(key) {
  const row = mergedData.find(r => monthKey(r.year, r.month) === key);
  if (!row) return;

  // Switch to entry tab
  document.querySelector('[data-tab="entry"]').click();

  const form = document.getElementById('entryForm');
  form.year.value = row.year;
  form.month.value = row.month;
  form.income.value = row.income ?? '';
  form.insurance.value = row.insurance ?? '';
  form.cellphone.value = row.cellphone ?? '';
  form.medical_aid.value = row.medical_aid ?? '';
  form.bank_charges.value = row.bank_charges ?? '';
  form.car_maintenance.value = row.car_maintenance ?? '';
  form.petrol.value = row.petrol ?? '';
  form.spending.value = row.spending ?? '';
  form.savings.value = row.savings ?? '';
  form.retirement.value = row.retirement ?? '';
  form.clothing.value = row.clothing ?? '';
  form.holiday.value = row.holiday ?? '';

  updateFormSummary();
  showFormMessage(`Editing ${monthLabel(row.year, row.month, true)}.`, 'ok');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showFormMessage(msg, kind) {
  const el = document.getElementById('formMessage');
  el.textContent = msg;
  el.classList.remove('error');
  if (kind === 'error') el.classList.add('error');
  if (msg && kind === 'ok') {
    setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
  }
}

// ============== DATA TAB ==============
function setupDataTab() {
  document.getElementById('exportBtn').addEventListener('click', exportData);

  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', importData);

  document.getElementById('clearLocalBtn').addEventListener('click', () => {
    if (Object.keys(localEdits).length === 0) {
      alert('No local edits to clear.');
      return;
    }
    if (confirm(`Clear ${Object.keys(localEdits).length} local edit(s)? This cannot be undone unless you've exported.`)) {
      localEdits = {};
      saveLocal();
      rebuildMerged();
      renderOverview();
      renderHistory();
      updateDataCounts();
    }
  });

  updateDataCounts();
}

function updateDataCounts() {
  document.getElementById('localCount').textContent = Object.keys(localEdits).length;
  document.getElementById('baseCount').textContent = baseData.length;
}

function exportData() {
  // Export the merged dataset (so user has one canonical file to commit)
  const payload = mergedData.map(r => {
    const { _source, sheet_name, ...rest } = r;
    return rest;
  });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ledger-data-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!Array.isArray(parsed)) throw new Error('Expected an array of months.');

      // Replace localEdits with everything from the file that isn't already
      // identical in baseData. This way, after Export → Import (round-trip),
      // we don't bloat localStorage.
      const baseMap = {};
      for (const r of baseData) baseMap[monthKey(r.year, r.month)] = r;

      const newLocal = {};
      for (const r of parsed) {
        if (typeof r.year !== 'number' || typeof r.month !== 'number') continue;
        const key = monthKey(r.year, r.month);
        const base = baseMap[key];
        // Quick check: if it's not in base, or differs from base, store as local
        const differs = !base || JSON.stringify({...base, sheet_name: undefined, _source: undefined}) !==
                                  JSON.stringify({...r, sheet_name: undefined, _source: undefined});
        if (differs) newLocal[key] = r;
      }
      localEdits = newLocal;
      saveLocal();
      rebuildMerged();
      renderOverview();
      renderHistory();
      updateDataCounts();
      alert(`Imported. ${Object.keys(newLocal).length} month(s) saved as local edits.`);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset
}

// ============== INIT ==============
async function init() {
  await loadData();
  renderMasthead();
  setupTabs();
  setupTrendControls();
  setupHistorySearch();
  setupEntryForm();
  setupDataTab();
  renderOverview();
}

init().catch(err => {
  console.error(err);
  alert('Could not load dashboard: ' + err.message);
});
