// analytics.js — Entry point for the standalone analytics dashboard

import { fetchCompanyData } from './modules/analytics/data-fetcher.js';
import { loadCache, getKnownCompanies } from './modules/analytics/data-cache.js';
import {
  filterItems, computeKPIs, computeYoY, computeMonthlyData,
  computePriceDistribution, computeCategoryBreakdown,
  getAvailableYears,
} from './modules/analytics/data-aggregator.js';
import { getCategoryName } from './modules/analytics/category-registry.js';
import { FilterState } from './modules/analytics/filter-state.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const fmt = n => n.toLocaleString('sv-SE');
const fmtSEK = n => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MSEK`;
  if (n >= 1_000) return `${fmt(n)} kr`;
  return `${n} kr`;
};

/**
 * Estimate net revenue per item for the auction house.
 * Buyer fee: 25% on top of hammer price (kept by house)
 * Seller fee: 20% of hammer price (flat 100 SEK if hammer < 500 kr)
 * Photo/handling fee: 80 SEK per sold item
 * Auctionet cut: 6% of hammer price (deducted from house earnings)
 * Net = buyerFee + sellerFee + photoFee - auctionetCut
 */
function estimateNetRevenue(items) {
  let total = 0;
  for (const item of items) {
    const buyerFee = item.p * 0.25;
    const sellerFee = item.p < 500 ? 100 : item.p * 0.20;
    const photoFee = 80;
    const auctionetCut = item.p * 0.06;
    total += buyerFee + sellerFee + photoFee - auctionetCut;
  }
  return Math.round(total);
}

const PRICE_BRACKETS = [
  { label: '300 kr', min: 0, max: 300 },
  { label: '301–500', min: 301, max: 500 },
  { label: '501–1 000', min: 501, max: 1000 },
  { label: '1 001–2 000', min: 1001, max: 2000 },
  { label: '2 001–5 000', min: 2001, max: 5000 },
  { label: '5 001–10 000', min: 5001, max: 10000 },
  { label: '10 000+', min: 10001, max: Infinity },
];

// ─── State ────────────────────────────────────────────────

let allItems = [];
let houseName = '';
let currentCompanyId = null;
const filters = new FilterState();

// ─── DOM References ───────────────────────────────────────

const $ = id => document.getElementById(id);
const sidebar = $('sidebar');
const container = $('dashboard');
const companySelect = $('company-select');
const companyIdInput = $('company-id-input');
const fetchBtn = $('fetch-btn');
const refreshBtn = $('refresh-btn');

// ─── Init ─────────────────────────────────────────────────

async function init() {
  const settings = await chrome.storage.sync.get(['excludeCompanyId']);
  const ownId = settings.excludeCompanyId ? parseInt(settings.excludeCompanyId) : null;

  await populateCompanyDropdown(ownId);

  if (ownId) {
    companySelect.value = ownId;
    await loadCompany(ownId);
  }

  companySelect.addEventListener('change', () => {
    const id = parseInt(companySelect.value);
    if (id) loadCompany(id);
  });

  fetchBtn.addEventListener('click', () => {
    const id = parseInt(companyIdInput.value);
    if (id) loadCompany(id, true);
  });

  refreshBtn.addEventListener('click', () => {
    if (currentCompanyId) loadCompany(currentCompanyId, true);
  });

  companyIdInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const id = parseInt(companyIdInput.value);
      if (id) loadCompany(id, true);
    }
  });

  // Export CSV
  $('export-btn').addEventListener('click', () => {
    if (allItems.length === 0) return;
    exportCSV(filterItems(allItems, filters.getFilters()));
  });

  // Dark mode toggle
  const darkBtn = $('dark-mode-btn');
  const savedTheme = localStorage.getItem('ad-theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('ad-dark');
  }
  darkBtn.addEventListener('click', () => {
    document.documentElement.classList.toggle('ad-dark');
    localStorage.setItem('ad-theme', document.documentElement.classList.contains('ad-dark') ? 'dark' : 'light');
  });

  filters.onChange(() => {
    renderSidebar();
    renderDashboard();
  });
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

  if (!forceRefresh) {
    const cached = await loadCache(companyId);
    if (cached && !cached.isExpired) {
      allItems = cached.items;
      houseName = cached.houseName;
      showMeta(cached.ageHours);
      initFilters();
      renderSidebar();
      renderDashboard();
      return;
    }
  }

  showProgress(forceRefresh ? 'Hämtar all data...' : 'Hämtar data...');
  try {
    const result = await fetchCompanyData(companyId, progress => {
      updateProgress(progress);
    }, forceRefresh);
    allItems = result.items;
    houseName = result.houseName;

    await populateCompanyDropdown(currentCompanyId);
    companySelect.value = companyId;

    showMeta(0);
    initFilters();
    renderSidebar();
    renderDashboard();
  } catch (err) {
    container.innerHTML = `
      <div class="ad-empty">
        <div class="ad-empty__icon">&#x26A0;</div>
        <div class="ad-empty__text">Kunde inte hämta data: ${escHTML(err.message)}</div>
      </div>`;
  }
}

function initFilters() {
  const years = getAvailableYears(allItems);
  const currentYear = new Date().getFullYear();
  filters.setYear(years.includes(currentYear) ? currentYear : years[0]);
  filters.setMonth(null);
  filters.setCategoryId(null);
  filters.setPriceRange(null);
}

// ─── Sidebar ──────────────────────────────────────────────

function renderSidebar() {
  if (allItems.length === 0) { sidebar.innerHTML = ''; return; }

  const f = filters.getFilters();
  const years = getAvailableYears(allItems);

  // Categories with counts (for current year + month only, not price-filtered)
  const catFilterItems = filterItems(allItems, { year: f.year, month: f.month });
  const categories = computeCategoryBreakdown(catFilterItems);

  sidebar.innerHTML = '';

  // ── Year section
  const yearSec = mkSection('AR', 'År');
  const yearGrid = document.createElement('div');
  yearGrid.className = 'ad-sb-year-grid';
  for (const y of years) {
    const btn = document.createElement('button');
    btn.className = `ad-sb-btn${y === f.year ? ' ad-sb-btn--active' : ''}`;
    btn.textContent = y;
    btn.addEventListener('click', () => filters.setYear(y));
    yearGrid.appendChild(btn);
  }
  yearSec.appendChild(yearGrid);
  sidebar.appendChild(yearSec);

  // ── Month section
  const monthSec = mkSection('MANAD', 'Månad');
  const monthGrid = document.createElement('div');
  monthGrid.className = 'ad-sb-month-grid';
  for (let m = 0; m < 12; m++) {
    const btn = document.createElement('button');
    btn.className = `ad-sb-btn${m === f.month ? ' ad-sb-btn--active' : ''}`;
    btn.textContent = MONTH_NAMES[m];
    btn.addEventListener('click', () => filters.setMonth(filters.month === m ? null : m));
    monthGrid.appendChild(btn);
  }
  monthSec.appendChild(monthGrid);
  sidebar.appendChild(monthSec);

  // ── Category section
  const catSec = mkSection('KATEGORI', 'Kategori');
  const catList = document.createElement('div');
  catList.className = 'ad-sb-cat-list';
  for (const cat of categories) {
    const row = document.createElement('label');
    row.className = `ad-sb-cat-row${cat.id === f.categoryId ? ' ad-sb-cat-row--active' : ''}`;
    row.innerHTML = `
      <span class="ad-sb-cat-row__name">${escHTML(cat.name)}</span>
      <span class="ad-sb-cat-row__count">${cat.count}</span>`;
    row.addEventListener('click', () => {
      filters.setCategoryId(filters.categoryId === cat.id ? null : cat.id);
    });
    catList.appendChild(row);
  }
  catSec.appendChild(catList);
  sidebar.appendChild(catSec);

  // ── Price section
  const priceSec = mkSection('PRIS', 'Prisintervall');
  const priceList = document.createElement('div');
  priceList.className = 'ad-sb-price-list';

  // "Alla" option
  const allRow = document.createElement('label');
  allRow.className = `ad-sb-price-row${f.priceRange == null ? ' ad-sb-price-row--active' : ''}`;
  allRow.textContent = 'Alla';
  allRow.addEventListener('click', () => filters.setPriceRange(null));
  priceList.appendChild(allRow);

  for (const b of PRICE_BRACKETS) {
    const row = document.createElement('label');
    const isActive = f.priceRange && f.priceRange.min === b.min && f.priceRange.max === b.max;
    row.className = `ad-sb-price-row${isActive ? ' ad-sb-price-row--active' : ''}`;
    row.textContent = b.label;
    row.addEventListener('click', () => {
      if (isActive) filters.setPriceRange(null);
      else filters.setPriceRange({ min: b.min, max: b.max });
    });
    priceList.appendChild(row);
  }
  priceSec.appendChild(priceList);
  sidebar.appendChild(priceSec);

  // ── Bottom actions
  const bottom = document.createElement('div');
  bottom.className = 'ad-sb-bottom';

  // Active filter summary
  const hasFilters = f.month != null || f.categoryId != null || f.priceRange != null;
  if (hasFilters) {
    const summary = document.createElement('div');
    summary.className = 'ad-sb-summary';
    const parts = [f.year];
    if (f.month != null) parts.push(MONTH_NAMES[f.month]);
    if (f.categoryId != null) parts.push(getCategoryName(f.categoryId));
    if (f.priceRange != null) {
      const br = PRICE_BRACKETS.find(b => b.min === f.priceRange.min);
      if (br) parts.push(br.label);
    }
    summary.textContent = parts.join(' · ');
    bottom.appendChild(summary);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'ad-sb-clear';
    clearBtn.textContent = 'Rensa alla filter';
    clearBtn.addEventListener('click', () => filters.clearAll());
    bottom.appendChild(clearBtn);
  }

  sidebar.appendChild(bottom);
}

function mkSection(id, title) {
  const sec = document.createElement('div');
  sec.className = 'ad-sb-section';
  const header = document.createElement('div');
  header.className = 'ad-sb-section__header';
  header.textContent = title;
  sec.appendChild(header);
  return sec;
}

// ─── Render ───────────────────────────────────────────────

function renderDashboard() {
  const f = filters.getFilters();
  const items = filterItems(allItems, f);

  const prevFilters = { ...f, year: f.year - 1 };
  const prevItems = filterItems(allItems, prevFilters);
  const kpis = computeKPIs(items);
  const prevKpis = computeKPIs(prevItems);
  const yoy = computeYoY(kpis, prevKpis);

  const monthly = computeMonthlyData(allItems, f.year);
  const priceDist = computePriceDistribution(items);
  const categories = computeCategoryBreakdown(items);

  container.innerHTML = '';

  // KPI cards
  container.appendChild(renderKPIs(kpis, prevKpis, yoy, items, prevItems, allItems, f));

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ad-empty ad-animate';
    empty.innerHTML = `
      <div class="ad-empty__icon">&#x1F4CA;</div>
      <div class="ad-empty__text">Inga sålda föremål för vald period</div>`;
    container.appendChild(empty);
    return;
  }

  // Charts row: monthly + price distribution
  container.appendChild(renderChartsRow(monthly, priceDist, f, items));

  // Category breakdown
  container.appendChild(renderCategoryTable(categories));

  // Top 10 most expensive items
  container.appendChild(renderTopItems(items));

  // Yearly prediction (only for current year, no month/category/price filter)
  const currentYear = new Date().getFullYear();
  if (f.year === currentYear && f.month == null && f.categoryId == null && f.priceRange == null) {
    const prediction = renderPrediction(monthly, kpis);
    if (prediction) container.appendChild(prediction);
  }
}

// ─── SVG Sparkline ────────────────────────────────────────

function renderSparklineSVG(data) {
  const values = data.filter(v => v > 0);
  if (values.length < 2) return '';

  const w = 100, h = 28;
  const max = Math.max(...data);
  if (max === 0) return '';

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<svg class="ad-kpi-card__sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="var(--ad-bar-light)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ─── KPI Cards ────────────────────────────────────────────

function renderKPIs(kpis, prevKpis, yoy, items, prevItems, allItemsRef, f) {
  const grid = document.createElement('div');
  grid.className = 'ad-kpi-grid ad-animate';

  const atMinBid = items.filter(i => i.p === 300).length;
  const minBidPct = items.length > 0 ? Math.round((atMinBid / items.length) * 1000) / 10 : 0;
  const prevAtMinBid = prevItems.filter(i => i.p === 300).length;
  const prevMinBidPct = prevItems.length > 0 ? Math.round((prevAtMinBid / prevItems.length) * 1000) / 10 : 0;
  const minBidTrend = prevMinBidPct > 0 ? Math.round(((minBidPct - prevMinBidPct) / prevMinBidPct) * 1000) / 10 : null;

  const netRevenue = estimateNetRevenue(items);
  const prevNetRevenue = estimateNetRevenue(prevItems);
  const netRevYoY = prevNetRevenue > 0 ? Math.round(((netRevenue - prevNetRevenue) / prevNetRevenue) * 1000) / 10 : null;

  const monthlyForSparkline = computeMonthlyData(allItemsRef, f.year);

  const cards = [
    { label: 'Sålda föremål', value: fmt(kpis.count), trend: yoy?.count, sparkData: monthlyForSparkline.map(m => m.count) },
    { label: 'Omsättning', value: fmtSEK(kpis.revenue), trend: yoy?.revenue, sparkData: monthlyForSparkline.map(m => m.revenue) },
    { label: 'Snittpris', value: fmtSEK(kpis.avgPrice), trend: yoy?.avgPrice, sparkData: monthlyForSparkline.map(m => m.avgPrice) },
    { label: 'Nettointäkt (uppsk.)', value: fmtSEK(netRevenue), trend: netRevYoY, sparkData: monthlyForSparkline.map(m => Math.round(m.revenue * 0.39 + m.count * 80)) },
    { label: 'Andel vid minbud', value: `${minBidPct}%`, trend: minBidTrend, invertTrend: true },
  ];

  for (const c of cards) {
    const card = document.createElement('div');
    card.className = 'ad-kpi-card';

    let trendHTML = '';
    if (c.trend != null) {
      let cls = Math.abs(c.trend) < 1 ? 'flat' : (c.trend > 0 ? 'up' : 'down');
      if (c.invertTrend && cls !== 'flat') cls = cls === 'up' ? 'down' : 'up';
      const arrow = c.trend > 1 ? '▲' : c.trend < -1 ? '▼' : '—';
      trendHTML = `<div class="ad-kpi-card__trend ad-kpi-card__trend--${cls}">${arrow} ${Math.abs(c.trend).toFixed(1)}% YoY</div>`;
    }

    const subtitleHTML = c.subtitle ? `<div class="ad-kpi-card__subtitle">${escHTML(c.subtitle)}</div>` : '';
    const sparklineHTML = c.sparkData ? renderSparklineSVG(c.sparkData) : '';

    card.innerHTML = `
      <div class="ad-kpi-card__label">${escHTML(c.label)}</div>
      <div class="ad-kpi-card__value">${escHTML(c.value)}</div>
      ${subtitleHTML}
      ${trendHTML}
      ${sparklineHTML}`;
    grid.appendChild(card);
  }

  return grid;
}

// ─── Charts Row ───────────────────────────────────────────

function renderChartsRow(monthly, priceDist, f, items) {
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
    const tooltipText = m.count > 0
      ? `${MONTH_NAMES[i]}: ${fmt(m.count)} st, ${fmtSEK(m.revenue)}, snitt ${fmtSEK(m.avgPrice)}`
      : `${MONTH_NAMES[i]}: inga föremål`;
    barsHTML += `
      <div class="ad-monthly-bar${isActive ? ' ad-monthly-bar--active' : ''}" data-month="${i}" title="${escHTML(tooltipText)}">
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

  monthCard.querySelectorAll('.ad-monthly-bar').forEach(bar => {
    bar.addEventListener('click', () => {
      const m = parseInt(bar.dataset.month);
      filters.setMonth(filters.month === m ? null : m);
    });
  });
  row.appendChild(monthCard);

  // Price distribution chart with cumulative %
  const priceCard = document.createElement('div');
  priceCard.className = 'ad-card';
  const maxPct = Math.max(...priceDist.map(d => d.pct), 1);

  let cumPct = 0;
  const cumulative = priceDist.map(d => { cumPct += d.pct; return Math.round(cumPct * 10) / 10; });

  let distHTML = '';
  for (let i = 0; i < priceDist.length; i++) {
    const d = priceDist[i];
    const barW = (d.pct / maxPct * 100).toFixed(1);
    const bracket = PRICE_BRACKETS[i];
    const isActive = f.priceRange && bracket && f.priceRange.min === bracket.min;
    distHTML += `
      <div class="ad-bar-row${isActive ? ' ad-bar-row--active' : ''}" data-bracket="${i}">
        <div class="ad-bar-row__label">${escHTML(d.label)}</div>
        <div class="ad-bar-row__track">
          <div class="ad-bar-row__fill" style="width:${barW}%"></div>
        </div>
        <div class="ad-bar-row__count">${fmt(d.count)}</div>
        <div class="ad-bar-row__pct">${d.pct}%</div>
        <div class="ad-bar-row__cum">${cumulative[i]}%</div>
      </div>`;
  }

  const atMinBidPct = items.length > 0 ? Math.round(items.filter(i => i.p === 300).length / items.length * 1000) / 10 : 0;
  const under500Pct = items.length > 0 ? Math.round(items.filter(i => i.p < 500).length / items.length * 1000) / 10 : 0;
  const over1kPct = items.length > 0 ? Math.round(items.filter(i => i.p >= 1000).length / items.length * 1000) / 10 : 0;

  priceCard.innerHTML = `
    <div class="ad-card__title">Prisfördelning</div>
    <div class="ad-bar-chart">${distHTML}</div>
    <div class="ad-price-annotations">
      <span class="ad-price-tag ad-price-tag--warn">Vid minbud: ${atMinBidPct}%</span>
      <span class="ad-price-tag ad-price-tag--warn">Under 500 kr: ${under500Pct}%</span>
      <span class="ad-price-tag ad-price-tag--good">1 000+ kr: ${over1kPct}%</span>
    </div>`;

  // Click price bars to filter
  priceCard.querySelectorAll('.ad-bar-row[data-bracket]').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.bracket);
      const bracket = PRICE_BRACKETS[idx];
      if (!bracket) return;
      const isActive = filters.priceRange && filters.priceRange.min === bracket.min;
      filters.setPriceRange(isActive ? null : { min: bracket.min, max: bracket.max });
    });
  });

  row.appendChild(priceCard);
  return row;
}

// ─── Category Table ───────────────────────────────────────

let catSortField = 'count';
let catSortDir = 'desc';

function sortCategories(categories, field, dir) {
  return [...categories].sort((a, b) => dir === 'desc' ? b[field] - a[field] : a[field] - b[field]);
}

function renderCategoryTable(categories) {
  const card = document.createElement('div');
  card.className = 'ad-card ad-animate';

  const sorted = sortCategories(categories, catSortField, catSortDir);

  function buildRows(cats) {
    let html = '';
    for (const cat of cats) {
      const barW = (cat.count / Math.max(...cats.map(c => c.count), 1) * 100).toFixed(1);
      html += `
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
    return html;
  }

  function sortIcon(f) {
    if (f !== catSortField) return ' <span class="ad-sort-icon">⇅</span>';
    return catSortDir === 'desc' ? ' <span class="ad-sort-icon ad-sort-icon--active">▼</span>' : ' <span class="ad-sort-icon ad-sort-icon--active">▲</span>';
  }

  card.innerHTML = `
    <div class="ad-card__title">Kategoriöversikt</div>
    <div class="ad-cat-header">
      <span>Kategori</span>
      <span></span>
      <span class="ad-cat-header__sortable" data-sort="count">Antal${sortIcon('count')}</span>
      <span class="ad-cat-header__sortable" data-sort="revenue">Oms.${sortIcon('revenue')}</span>
      <span class="ad-cat-header__sortable" data-sort="avgPrice">Snitt${sortIcon('avgPrice')}</span>
    </div>
    <div class="ad-cat-table">${buildRows(sorted)}</div>`;

  card.querySelectorAll('.ad-cat-header__sortable').forEach(header => {
    header.addEventListener('click', e => {
      e.stopPropagation();
      const field = header.dataset.sort;
      if (catSortField === field) {
        catSortDir = catSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        catSortField = field;
        catSortDir = 'desc';
      }
      renderDashboard();
    });
  });

  card.querySelectorAll('.ad-cat-row').forEach(row => {
    row.addEventListener('click', () => {
      const catId = parseInt(row.dataset.catId);
      filters.setCategoryId(filters.categoryId === catId ? null : catId);
    });
  });

  return card;
}

// ─── Top 10 Items ─────────────────────────────────────────

function renderTopItems(items) {
  const card = document.createElement('div');
  card.className = 'ad-card ad-animate';

  const top10 = [...items].sort((a, b) => b.p - a.p).slice(0, 10);

  if (top10.length === 0) {
    card.innerHTML = `<div class="ad-card__title">Dyraste föremål</div><div class="ad-empty__text">Inga föremål</div>`;
    return card;
  }

  const totalTop10Rev = top10.reduce((s, i) => s + i.p, 0);
  const pctOfTotal = items.length > 0 ? Math.round(totalTop10Rev / items.reduce((s, i) => s + i.p, 0) * 1000) / 10 : 0;

  let rowsHTML = '';
  for (let i = 0; i < top10.length; i++) {
    const item = top10[i];
    const date = new Date(item.d * 1000);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const catName = getCategoryName(item.cat);
    rowsHTML += `
      <div class="ad-top-row">
        <div class="ad-top-row__rank">${i + 1}</div>
        <div class="ad-top-row__price">${fmtSEK(item.p)}</div>
        <div class="ad-top-row__cat">${escHTML(catName)}</div>
        <div class="ad-top-row__date">${dateStr}</div>
        <a class="ad-top-row__link" href="https://auctionet.com/sv/search?q=${item.id}" target="_blank" rel="noopener">Visa</a>
      </div>`;
  }

  card.innerHTML = `
    <div class="ad-card__title">Top 10 dyraste föremål <span class="ad-prediction__basis">${pctOfTotal}% av total omsättning</span></div>
    <div class="ad-top-table">${rowsHTML}</div>`;

  return card;
}

// ─── Yearly Prediction ────────────────────────────────────

function renderPrediction(monthly, currentKpis) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const completedMonths = monthly.filter((m, i) => i < currentMonth && m.count > 0).length;

  if (completedMonths < 2) return null;

  const completedData = monthly.filter((m, i) => i < currentMonth && m.count > 0);
  const completedCount = completedData.reduce((s, m) => s + m.count, 0);
  const completedRevenue = completedData.reduce((s, m) => s + m.revenue, 0);

  const factor = 12 / completedMonths;
  const predCount = Math.round(completedCount * factor);
  const predRevenue = Math.round(completedRevenue * factor);
  const predAvg = predCount > 0 ? Math.round(predRevenue / predCount) : 0;

  const card = document.createElement('div');
  card.className = 'ad-card ad-animate';

  card.innerHTML = `
    <div class="ad-card__title">Prognos ${now.getFullYear()} <span class="ad-prediction__basis">baserat på ${completedMonths} avslutade månader</span></div>
    <div class="ad-prediction">
      <div class="ad-prediction__item">
        <div class="ad-prediction__label">Sålda föremål</div>
        <div class="ad-prediction__value">${fmt(predCount)}</div>
        <div class="ad-prediction__actual">Hittills: ${fmt(currentKpis.count)}</div>
      </div>
      <div class="ad-prediction__item">
        <div class="ad-prediction__label">Omsättning</div>
        <div class="ad-prediction__value">${fmtSEK(predRevenue)}</div>
        <div class="ad-prediction__actual">Hittills: ${fmtSEK(currentKpis.revenue)}</div>
      </div>
      <div class="ad-prediction__item">
        <div class="ad-prediction__label">Snittpris</div>
        <div class="ad-prediction__value">${fmtSEK(predAvg)}</div>
        <div class="ad-prediction__actual">Hittills: ${fmtSEK(currentKpis.avgPrice)}</div>
      </div>
    </div>`;

  return card;
}

// ─── CSV Export ───────────────────────────────────────────

function exportCSV(items) {
  const header = 'ID,Pris,Utrop,Reserv,Kategori,Datum\n';
  const rows = items.map(i => {
    const d = new Date(i.d * 1000);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${i.id},${i.p},${i.sb},${i.r},${getCategoryName(i.cat).replace(/,/g, ';')},${date}`;
  }).join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${houseName || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
