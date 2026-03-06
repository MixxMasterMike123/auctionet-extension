// analytics.js — Entry point for the standalone analytics dashboard

import { fetchCompanyData } from './modules/analytics/data-fetcher.js';
import { loadCache, getKnownCompanies } from './modules/analytics/data-cache.js';
import {
  filterItems, computeKPIs, computeYoY, computeMonthlyData,
  computePriceDistribution, computeCategoryBreakdown, computePricePoints,
  getAvailableYears,
} from './modules/analytics/data-aggregator.js';
import { getAllParentCategories, getCategoryName } from './modules/analytics/category-registry.js';
import { FilterState } from './modules/analytics/filter-state.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const fmt = n => n.toLocaleString('sv-SE');
const fmtSEK = n => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MSEK`;
  if (n >= 1_000) return `${fmt(n)} kr`;
  return `${n} kr`;
};

// ─── State ────────────────────────────────────────────────

let allItems = [];
let houseName = '';
let currentCompanyId = null;
const filters = new FilterState();

// ─── DOM References ───────────────────────────────────────

const $ = id => document.getElementById(id);
const container = $('dashboard');
const companySelect = $('company-select');
const companyIdInput = $('company-id-input');
const fetchBtn = $('fetch-btn');
const refreshBtn = $('refresh-btn');

// ─── Init ─────────────────────────────────────────────────

async function init() {
  // Load own company ID from settings
  const settings = await chrome.storage.sync.get(['excludeCompanyId']);
  const ownId = settings.excludeCompanyId ? parseInt(settings.excludeCompanyId) : null;

  // Populate company dropdown with known companies
  await populateCompanyDropdown(ownId);

  // Auto-load own company if set
  if (ownId) {
    companySelect.value = ownId;
    await loadCompany(ownId);
  }

  // Event listeners
  companySelect.addEventListener('change', () => {
    const id = parseInt(companySelect.value);
    if (id) loadCompany(id);
  });

  fetchBtn.addEventListener('click', () => {
    const id = parseInt(companyIdInput.value);
    if (id) loadCompany(id, true);
  });

  refreshBtn.addEventListener('click', () => {
    if (currentCompanyId) loadCompany(currentCompanyId, true); // force full re-fetch
  });

  companyIdInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const id = parseInt(companyIdInput.value);
      if (id) loadCompany(id, true);
    }
  });

  // Re-render on filter change
  filters.onChange(() => renderDashboard());
}

async function populateCompanyDropdown(ownId) {
  const known = await getKnownCompanies();
  companySelect.innerHTML = '<option value="">Välj auktionshus...</option>';

  if (ownId && !known.find(k => k.id === ownId)) {
    const ownOpt = document.createElement('option');
    ownOpt.value = ownId;
    ownOpt.textContent = `Mitt företag (ID ${ownId})`;
    companySelect.appendChild(ownOpt);
  }

  for (const co of known) {
    const opt = document.createElement('option');
    opt.value = co.id;
    opt.textContent = co.name;
    companySelect.appendChild(opt);
  }
}

// ─── Load Company ─────────────────────────────────────────

async function loadCompany(companyId, forceRefresh = false) {
  currentCompanyId = companyId;
  companySelect.value = companyId;

  // Try cache first
  if (!forceRefresh) {
    const cached = await loadCache(companyId);
    if (cached && !cached.isExpired) {
      allItems = cached.items;
      houseName = cached.houseName;
      showMeta(cached.ageHours);
      initFilters();
      renderDashboard();
      return;
    }
  }

  // Fetch from API (incremental if cache exists, full if forced)
  showProgress(forceRefresh ? 'Hämtar all data...' : 'Hämtar data...');
  try {
    const result = await fetchCompanyData(companyId, progress => {
      updateProgress(progress);
    }, forceRefresh);
    allItems = result.items;
    houseName = result.houseName;

    // Update dropdown with discovered name
    await populateCompanyDropdown(currentCompanyId);
    companySelect.value = companyId;

    showMeta(0);
    initFilters();
    renderDashboard();
  } catch (err) {
    container.innerHTML = `
      <div class="ad-empty">
        <div class="ad-empty__icon">⚠</div>
        <div class="ad-empty__text">Kunde inte hämta data: ${escHTML(err.message)}</div>
      </div>`;
  }
}

function initFilters() {
  const years = getAvailableYears(allItems);
  const currentYear = new Date().getFullYear();
  // Default to current year if available, otherwise latest
  filters.setYear(years.includes(currentYear) ? currentYear : years[0]);
  filters.setMonth(null);
  filters.setCategoryId(null);
}

// ─── Render ───────────────────────────────────────────────

function renderDashboard() {
  const f = filters.getFilters();
  const items = filterItems(allItems, f);

  // For YoY, get previous year's items with same month/category
  const prevFilters = { ...f, year: f.year - 1 };
  const prevItems = filterItems(allItems, prevFilters);
  const kpis = computeKPIs(items);
  const prevKpis = computeKPIs(prevItems);
  const yoy = computeYoY(kpis, prevKpis);

  const monthly = computeMonthlyData(allItems, f.year);
  const priceDist = computePriceDistribution(items);
  const categories = computeCategoryBreakdown(items);
  const pricePoints = computePricePoints(items);
  const years = getAvailableYears(allItems);

  container.innerHTML = '';

  // Filters
  container.appendChild(renderFilters(years, categories));

  // KPI cards
  container.appendChild(renderKPIs(kpis, yoy));

  if (items.length === 0) {
    container.innerHTML += `
      <div class="ad-empty ad-animate">
        <div class="ad-empty__icon">📊</div>
        <div class="ad-empty__text">Inga sålda föremål för vald period</div>
      </div>`;
    return;
  }

  // Charts row: monthly + price distribution
  container.appendChild(renderChartsRow(monthly, priceDist, f));

  // Category breakdown
  container.appendChild(renderCategoryTable(categories));

  // Price points
  container.appendChild(renderPricePoints(pricePoints, items.length));
}

// ─── Filter Pills ─────────────────────────────────────────

function renderFilters(years, categories) {
  const f = filters.getFilters();
  const div = document.createElement('div');
  div.className = 'ad-filters ad-animate';

  // Year pills
  const yearRow = document.createElement('div');
  yearRow.className = 'ad-filter-row';
  yearRow.innerHTML = `<span class="ad-filter-row__label">År</span>`;
  for (const y of years) {
    const pill = document.createElement('button');
    pill.className = `ad-pill${y === f.year ? ' ad-pill--active' : ''}`;
    pill.textContent = y;
    pill.addEventListener('click', () => filters.setYear(y));
    yearRow.appendChild(pill);
  }
  div.appendChild(yearRow);

  // Month pills
  const monthRow = document.createElement('div');
  monthRow.className = 'ad-filter-row';
  monthRow.innerHTML = `<span class="ad-filter-row__label">Månad</span>`;
  const allBtn = document.createElement('button');
  allBtn.className = `ad-pill${f.month == null ? ' ad-pill--active' : ''}`;
  allBtn.textContent = 'Alla';
  allBtn.addEventListener('click', () => filters.setMonth(null));
  monthRow.appendChild(allBtn);
  for (let m = 0; m < 12; m++) {
    const pill = document.createElement('button');
    pill.className = `ad-pill${m === f.month ? ' ad-pill--active' : ''}`;
    pill.textContent = MONTH_NAMES[m];
    pill.addEventListener('click', () => filters.setMonth(m));
    monthRow.appendChild(pill);
  }
  div.appendChild(monthRow);

  // Category pills
  const catRow = document.createElement('div');
  catRow.className = 'ad-filter-row';
  catRow.innerHTML = `<span class="ad-filter-row__label">Kategori</span>`;
  const allCat = document.createElement('button');
  allCat.className = `ad-pill${f.categoryId == null ? ' ad-pill--active' : ''}`;
  allCat.textContent = 'Alla';
  allCat.addEventListener('click', () => filters.setCategoryId(null));
  catRow.appendChild(allCat);

  // Show only categories that have items, sorted by count
  const activeCats = categories.slice(0, 15);
  for (const cat of activeCats) {
    const pill = document.createElement('button');
    pill.className = `ad-pill${cat.id === f.categoryId ? ' ad-pill--active' : ''}`;
    pill.textContent = cat.name;
    pill.addEventListener('click', () => filters.setCategoryId(cat.id));
    catRow.appendChild(pill);
  }
  div.appendChild(catRow);

  return div;
}

// ─── KPI Cards ────────────────────────────────────────────

function renderKPIs(kpis, yoy) {
  const grid = document.createElement('div');
  grid.className = 'ad-kpi-grid ad-animate';

  const cards = [
    { label: 'Sålda föremål', value: fmt(kpis.count), trend: yoy?.count },
    { label: 'Omsättning', value: fmtSEK(kpis.revenue), trend: yoy?.revenue },
    { label: 'Snittpris', value: fmtSEK(kpis.avgPrice), trend: yoy?.avgPrice },
    { label: 'Medianpris', value: fmtSEK(kpis.medianPrice), trend: yoy?.medianPrice },
  ];

  for (const c of cards) {
    const card = document.createElement('div');
    card.className = 'ad-kpi-card';

    let trendHTML = '';
    if (c.trend != null) {
      const cls = Math.abs(c.trend) < 1 ? 'flat' : (c.trend > 0 ? 'up' : 'down');
      const arrow = c.trend > 1 ? '▲' : c.trend < -1 ? '▼' : '—';
      trendHTML = `<div class="ad-kpi-card__trend ad-kpi-card__trend--${cls}">${arrow} ${Math.abs(c.trend).toFixed(1)}% YoY</div>`;
    }

    card.innerHTML = `
      <div class="ad-kpi-card__label">${escHTML(c.label)}</div>
      <div class="ad-kpi-card__value">${escHTML(c.value)}</div>
      ${trendHTML}`;
    grid.appendChild(card);
  }

  return grid;
}

// ─── Charts Row ───────────────────────────────────────────

function renderChartsRow(monthly, priceDist, f) {
  const row = document.createElement('div');
  row.className = 'ad-charts-row ad-animate';

  // Monthly chart
  const monthCard = document.createElement('div');
  monthCard.className = 'ad-card';
  const maxCount = Math.max(...monthly.map(m => m.count), 1);

  let barsHTML = '';
  for (let i = 0; i < 12; i++) {
    const m = monthly[i];
    const pct = (m.count / maxCount * 100).toFixed(1);
    const isActive = f.month === i;
    barsHTML += `
      <div class="ad-monthly-bar${isActive ? ' ad-monthly-bar--active' : ''}" data-month="${i}">
        <div class="ad-monthly-bar__count">${m.count || ''}</div>
        <div class="ad-monthly-bar__fill" style="height:${pct}%"></div>
        <div class="ad-monthly-bar__label">${MONTH_NAMES[i]}</div>
      </div>`;
  }

  const avgPrices = monthly.filter(m => m.count > 0).map(m => m.avgPrice);
  const avgOverall = avgPrices.length > 0 ? Math.round(avgPrices.reduce((a, b) => a + b, 0) / avgPrices.length) : 0;

  monthCard.innerHTML = `
    <div class="ad-card__title">Månadsöversikt</div>
    <div class="ad-monthly-chart">${barsHTML}</div>
    <div class="ad-monthly-avg">Genomsnittligt snittpris: ${fmtSEK(avgOverall)}</div>`;

  // Click to filter by month
  monthCard.querySelectorAll('.ad-monthly-bar').forEach(bar => {
    bar.addEventListener('click', () => {
      const m = parseInt(bar.dataset.month);
      filters.setMonth(filters.month === m ? null : m);
    });
  });
  row.appendChild(monthCard);

  // Price distribution chart
  const priceCard = document.createElement('div');
  priceCard.className = 'ad-card';
  const maxPct = Math.max(...priceDist.map(d => d.pct), 1);

  let distHTML = '';
  for (const d of priceDist) {
    const barW = (d.pct / maxPct * 100).toFixed(1);
    distHTML += `
      <div class="ad-bar-row">
        <div class="ad-bar-row__label">${escHTML(d.label)}</div>
        <div class="ad-bar-row__track">
          <div class="ad-bar-row__fill" style="width:${barW}%"></div>
        </div>
        <div class="ad-bar-row__count">${fmt(d.count)}</div>
        <div class="ad-bar-row__pct">${d.pct}%</div>
      </div>`;
  }

  priceCard.innerHTML = `
    <div class="ad-card__title">Prisfördelning</div>
    <div class="ad-bar-chart">${distHTML}</div>`;
  row.appendChild(priceCard);

  return row;
}

// ─── Category Table ───────────────────────────────────────

function renderCategoryTable(categories) {
  const card = document.createElement('div');
  card.className = 'ad-card ad-animate';

  const maxCount = Math.max(...categories.map(c => c.count), 1);

  let rowsHTML = '';
  for (const cat of categories) {
    const barW = (cat.count / maxCount * 100).toFixed(1);
    rowsHTML += `
      <div class="ad-cat-row" data-cat-id="${cat.id}">
        <div class="ad-cat-row__name">${escHTML(cat.name)}</div>
        <div class="ad-cat-row__bar">
          <div class="ad-cat-row__bar-fill" style="width:${barW}%"></div>
        </div>
        <div class="ad-cat-row__count">${fmt(cat.count)}</div>
        <div class="ad-cat-row__revenue">${fmtSEK(cat.revenue)}</div>
        <div class="ad-cat-row__avg">${fmt(cat.avgPrice)} kr</div>
      </div>`;
  }

  card.innerHTML = `
    <div class="ad-card__title">
      Kategoriöversikt
    </div>
    <div class="ad-cat-header">
      <span>Kategori</span>
      <span></span>
      <span>Antal</span>
      <span>Omsättning</span>
      <span>Snitt</span>
    </div>
    <div class="ad-cat-table">${rowsHTML}</div>`;

  // Click row to filter by category
  card.querySelectorAll('.ad-cat-row').forEach(row => {
    row.addEventListener('click', () => {
      const catId = parseInt(row.dataset.catId);
      filters.setCategoryId(filters.categoryId === catId ? null : catId);
    });
  });

  return card;
}

// ─── Price Points ─────────────────────────────────────────

function renderPricePoints(pp, total) {
  const card = document.createElement('div');
  card.className = 'ad-card ad-animate';

  card.innerHTML = `
    <div class="ad-card__title">Prispoäng</div>
    <div class="ad-price-points">
      <div class="ad-price-point">
        <div class="ad-price-point__label">Exakt 300 kr (minbud)</div>
        <div class="ad-price-point__bar">
          <div class="ad-price-point__fill ad-price-point__fill--highlight" style="width:${pp.atMinBid.pct}%"></div>
        </div>
        <div class="ad-price-point__pct">${pp.atMinBid.pct}%</div>
      </div>
      <div class="ad-price-point">
        <div class="ad-price-point__label">Under 500 kr totalt</div>
        <div class="ad-price-point__bar">
          <div class="ad-price-point__fill ad-price-point__fill--under" style="width:${pp.under500.pct}%"></div>
        </div>
        <div class="ad-price-point__pct">${pp.under500.pct}%</div>
      </div>
      <div class="ad-price-point">
        <div class="ad-price-point__label">500 kr eller mer</div>
        <div class="ad-price-point__bar">
          <div class="ad-price-point__fill ad-price-point__fill--over" style="width:${pp.over500.pct}%"></div>
        </div>
        <div class="ad-price-point__pct">${pp.over500.pct}%</div>
      </div>
      <div class="ad-price-point">
        <div class="ad-price-point__label">1 000 kr eller mer</div>
        <div class="ad-price-point__bar">
          <div class="ad-price-point__fill ad-price-point__fill--over" style="width:${pp.over1000.pct}%"></div>
        </div>
        <div class="ad-price-point__pct">${pp.over1000.pct}%</div>
      </div>
      <div class="ad-price-point">
        <div class="ad-price-point__label">5 000 kr eller mer</div>
        <div class="ad-price-point__bar">
          <div class="ad-price-point__fill ad-price-point__fill--over" style="width:${pp.over5000.pct}%"></div>
        </div>
        <div class="ad-price-point__pct">${pp.over5000.pct}%</div>
      </div>
    </div>`;

  return card;
}

// ─── Progress ─────────────────────────────────────────────

function showProgress(text) {
  container.innerHTML = `
    <div class="ad-progress">
      <div class="ad-progress__text">${escHTML(text)}</div>
      <div class="ad-progress__bar">
        <div class="ad-progress__fill ad-progress__fill--active" id="progress-fill"></div>
      </div>
      <div class="ad-progress__text" id="progress-detail"></div>
    </div>`;
}

function updateProgress(p) {
  const fill = $('progress-fill');
  const detail = $('progress-detail');
  if (!fill || !detail) return;

  if (p.phase === 'incremental') {
    fill.style.width = `${Math.min((p.page || 1) / 10 * 90, 90)}%`;
    detail.textContent = p.newItems
      ? `Sida ${p.page} — ${p.newItems} nya föremål hittade`
      : 'Söker efter nya föremål...';
  } else if (p.phase === 'direct') {
    fill.style.width = `${Math.min(p.page / 50 * 100, 95)}%`;
    detail.textContent = `Sida ${p.page} — ${fmt(p.itemCount)} föremål hämtade`;
  } else if (p.phase === 'switching-to-sharded') {
    fill.style.width = '5%';
    detail.textContent = `Mer än 10 000 föremål — byter till kategorihämtning...`;
  } else if (p.phase === 'sharded') {
    const pct = Math.min((p.category / p.totalCategories) * 95 + 5, 98);
    fill.style.width = `${pct}%`;
    detail.textContent = `Kategori ${p.category}/${p.totalCategories} — ${fmt(p.itemCount)} föremål hämtade`;
  } else if (p.phase === 'sharded-page') {
    // Per-page update within a category — don't move the bar, just update text
    detail.textContent = `Kategori ${p.category}/${p.totalCategories}, sida ${p.page} — ${fmt(p.itemCount)} föremål`;
  } else if (p.phase === 'saving') {
    fill.style.width = '98%';
    detail.textContent = `Sparar ${fmt(p.itemCount)} föremål...`;
  } else if (p.phase === 'done') {
    fill.style.width = '100%';
    fill.classList.remove('ad-progress__fill--active');
    detail.textContent = p.newItems != null
      ? `Klart! ${p.newItems} nya föremål tillagda (${fmt(p.itemCount)} totalt).`
      : `Klart! ${fmt(p.itemCount)} föremål laddade.`;
  }
}

function showMeta(ageHours) {
  const meta = $('meta-line');
  if (!meta) return;
  if (ageHours === 0) {
    meta.textContent = `${houseName} — Uppdaterad just nu`;
  } else {
    meta.textContent = `${houseName} — Uppdaterad ${ageHours < 1 ? 'nyss' : `${ageHours}h sedan`} • ${fmt(allItems.length)} föremål`;
  }
}

// ─── Util ─────────────────────────────────────────────────

function escHTML(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ─── Start ────────────────────────────────────────────────

init();
