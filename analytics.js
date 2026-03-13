// analytics.js — Entry point for the standalone analytics dashboard

import { fetchCompanyData } from './modules/analytics/data-fetcher.js';
import { loadCache, getKnownCompanies } from './modules/analytics/data-cache.js';
import {
  filterItems, filterItemsSamePeriod, computeKPIs, computeYoY, computeMonthlyData,
  computePriceDistribution, computeCategoryBreakdown,
  computePricePoints, getAvailableYears,
} from './modules/analytics/data-aggregator.js';
import { getCategoryName } from './modules/analytics/category-registry.js';
import { FilterState } from './modules/analytics/filter-state.js';
import {
  buildDataSummary, generateInsights, getCachedInsights,
  clearInsightsCache, renderInsightsPanel, renderInsightsSummaryCard,
} from './modules/analytics/ai-insights.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const fmt = n => n.toLocaleString('sv-SE');
const fmtSEK = n => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MSEK`;
  if (n >= 1_000) return `${fmt(n)} kr`;
  return `${n} kr`;
};

/**
 * Auctionet fee structure:
 * - Buyer pays: hammer price + 25% buyer's fee
 * - Auctionet takes: 6% of total (hammer + buyer's fee)
 * - Auction house keeps: remaining buyer's fee + seller commission
 */
const BUYER_FEE_RATE = 0.25;
const AUCTIONET_CUT_RATE = 0.06;
const AVG_SELLER_COMMISSION = 0.125; // Empirical average (~12.5%)

// Derived: Auctionet's cut as fraction of hammer price
const AUCTIONET_CUT_OF_HAMMER = (1 + BUYER_FEE_RATE) * AUCTIONET_CUT_RATE; // 0.075

// Omsättning: total buyer pays minus Auctionet's cut
const GROSS_RATE = (1 + BUYER_FEE_RATE) * (1 - AUCTIONET_CUT_RATE); // 1.175

// Nettointäkt: buyer's fee - Auctionet cut + seller commission
const NET_RATE = BUYER_FEE_RATE - AUCTIONET_CUT_OF_HAMMER + AVG_SELLER_COMMISSION; // 0.300

function estimateNetRevenue(items) {
  let total = 0;
  for (const item of items) {
    total += item.p * NET_RATE;
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
let ownCompanyId = null;
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
  // Migration: excludeCompanyId → ownCompanyId
  const settings = await chrome.storage.sync.get(['excludeCompanyId', 'ownCompanyId']);
  if (settings.excludeCompanyId && !settings.ownCompanyId) {
    await chrome.storage.sync.set({ ownCompanyId: settings.excludeCompanyId });
    await chrome.storage.sync.remove('excludeCompanyId');
    ownCompanyId = parseInt(settings.excludeCompanyId);
  } else {
    ownCompanyId = settings.ownCompanyId ? parseInt(settings.ownCompanyId) : null;
  }

  await populateCompanyDropdown(ownCompanyId);

  if (ownCompanyId) {
    companySelect.value = ownCompanyId;
    await loadCompany(ownCompanyId);
  }

  companySelect.addEventListener('change', () => {
    const id = parseInt(companySelect.value);
    if (id) loadCompany(id);
  });

  fetchBtn.addEventListener('click', async () => {
    const id = parseInt(companyIdInput.value);
    if (!id) return;
    const cached = await loadCache(id);
    loadCompany(id, !cached, !!cached); // full fetch if new, incremental if exists
  });

  refreshBtn.addEventListener('click', () => {
    if (currentCompanyId) loadCompany(currentCompanyId, false, true);
  });

  companyIdInput.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const id = parseInt(companyIdInput.value);
      if (!id) return;
      const cached = await loadCache(id);
      loadCompany(id, !cached, !!cached);
    }
  });

  // Export CSV
  $('export-btn').addEventListener('click', () => {
    if (allItems.length === 0) return;
    exportCSV(filterItems(allItems, filters.getFilters()));
  });

  // AI Insights
  $('ai-btn').addEventListener('click', () => runAIAnalysis());

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

async function loadCompany(companyId, forceRefresh = false, forceIncremental = false) {
  currentCompanyId = companyId;
  companySelect.value = companyId;

  if (!forceRefresh && !forceIncremental) {
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

  showProgress(forceRefresh ? 'Hämtar all data...' : 'Söker nya föremål...');
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

// ─── AI Insights ─────────────────────────────────────────

async function runAIAnalysis(forceRefresh = false) {
  if (allItems.length === 0) return;

  const f = filters.getFilters();
  const filterKey = { year: f.year, month: f.month, categoryId: f.categoryId, priceMin: f.priceRange?.min, priceMax: f.priceRange?.max };

  // Show loading state in both summary card and full panel
  const existingSummary = $('ai-summary-card');
  if (existingSummary) {
    existingSummary.replaceWith(renderInsightsSummaryCard({ isLoading: true }));
  } else {
    // First run — insert summary card after the KPI grid
    const kpiGrid = container.querySelector('.ad-kpi-grid');
    if (kpiGrid) kpiGrid.after(renderInsightsSummaryCard({ isLoading: true }));
  }
  const existing = $('ai-insights-panel');
  if (existing) existing.remove();
  container.appendChild(renderInsightsPanel({ isLoading: true }));

  if (forceRefresh) clearInsightsCache();

  try {
    const items = filterItems(allItems, f);
    const monthly = computeMonthlyData(allItems, f.year);
    const kpis = computeKPIs(items);
    const priceDist = computePriceDistribution(items);
    const pricePoints = computePricePoints(items);
    const categories = computeCategoryBreakdown(items);
    const isOwnHouse = ownCompanyId != null && currentCompanyId === ownCompanyId;
    const netRevenue = isOwnHouse ? estimateNetRevenue(items) : null;
    const grossRevenue = isOwnHouse ? Math.round(kpis.revenue * GROSS_RATE) : null;

    // For AI: compute same-period YoY to avoid misleading comparisons
    const currentYear = new Date().getFullYear();
    let prevKpis, yoy;
    if (f.month != null) {
      // Specific month selected — compare that month across years
      const prevItems = filterItems(allItems, { ...f, year: f.year - 1 });
      prevKpis = computeKPIs(prevItems);
      yoy = computeYoY(kpis, prevKpis);
    } else if (f.year === currentYear) {
      // Current year, no month filter — compare Jan 1 to today in both years
      const currSamePeriod = filterItemsSamePeriod(allItems, f.year, f);
      const prevSamePeriod = filterItemsSamePeriod(allItems, f.year - 1, f);
      const currKpisYoY = computeKPIs(currSamePeriod);
      prevKpis = computeKPIs(prevSamePeriod);
      yoy = prevKpis.count > 0 ? computeYoY(currKpisYoY, prevKpis) : null;
    } else {
      // Historical year — full year comparison is fine
      const prevItems = filterItems(allItems, { ...f, year: f.year - 1 });
      prevKpis = computeKPIs(prevItems);
      yoy = computeYoY(kpis, prevKpis);
    }

    const activeFilters = [];
    if (f.month != null) activeFilters.push(`Månad: ${MONTH_NAMES[f.month]}`);
    if (f.categoryId != null) activeFilters.push(`Kategori: ${getCategoryName(f.categoryId)}`);
    if (f.priceRange) activeFilters.push(`Pris: ${f.priceRange.min}–${f.priceRange.max}`);

    const summary = buildDataSummary({
      houseName, year: f.year, kpis, prevKpis, yoy, monthly,
      priceDist, pricePoints, categories, netRevenue, grossRevenue, isOwnHouse,
      activeFilters: activeFilters.length > 0 ? activeFilters : null,
    });

    const insights = await generateInsights(summary, currentCompanyId, filterKey);

    // Replace loading with results in both summary and full panel
    const summaryCard = $('ai-summary-card');
    if (summaryCard) summaryCard.replaceWith(renderInsightsSummaryCard({ insights }));
    const panel = $('ai-insights-panel');
    if (panel) panel.remove();
    container.appendChild(renderInsightsPanel({
      insights,
      onRefresh: () => runAIAnalysis(true),
    }));
  } catch (err) {
    const errMsg = err.message || 'Kunde inte generera analys';
    const summaryCard = $('ai-summary-card');
    if (summaryCard) summaryCard.replaceWith(renderInsightsSummaryCard({ error: errMsg }));
    const panel = $('ai-insights-panel');
    if (panel) panel.remove();
    container.appendChild(renderInsightsPanel({ error: errMsg }));
  }
}

// ─── Render ───────────────────────────────────────────────

function renderDashboard() {
  const f = filters.getFilters();
  const items = filterItems(allItems, f);

  const monthly = computeMonthlyData(allItems, f.year);
  const kpis = computeKPIs(items);

  // Same-period YoY: for current year without month filter, compare exact same date range
  const currentYear = new Date().getFullYear();
  let prevItems, yoyCurrentItems;
  if (f.year === currentYear && f.month == null) {
    // Compare Jan 1–today in both years for fair partial-month comparison
    yoyCurrentItems = filterItemsSamePeriod(allItems, f.year, f);
    prevItems = filterItemsSamePeriod(allItems, f.year - 1, f);
  } else {
    yoyCurrentItems = items;
    prevItems = filterItems(allItems, { ...f, year: f.year - 1 });
  }
  const prevKpis = computeKPIs(prevItems);
  const yoy = computeYoY(computeKPIs(yoyCurrentItems), prevKpis);
  const priceDist = computePriceDistribution(items);
  const categories = computeCategoryBreakdown(items);

  container.innerHTML = '';

  // KPI cards
  const isOwnHouse = ownCompanyId != null && currentCompanyId === ownCompanyId;
  container.appendChild(renderKPIs(kpis, prevKpis, yoy, items, prevItems, allItems, f, isOwnHouse));

  // AI nugget ticker (fire and forget — Haiku, fast)
  generateNugget(kpis, yoy, items, f);

  // AI summary card (right after KPIs for visibility)
  const filterKey = { year: f.year, month: f.month, categoryId: f.categoryId, priceMin: f.priceRange?.min, priceMax: f.priceRange?.max };
  const cachedInsights = getCachedInsights(currentCompanyId, filterKey);
  if (cachedInsights) {
    container.appendChild(renderInsightsSummaryCard({ insights: cachedInsights }));
  }

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
  if (f.year === currentYear && f.month == null && f.categoryId == null && f.priceRange == null) {
    const prediction = renderPrediction(monthly, kpis);
    if (prediction) container.appendChild(prediction);
  }

  // Restore cached AI insights if available
  if (cachedInsights) {
    container.appendChild(renderInsightsPanel({
      insights: cachedInsights,
      onRefresh: () => runAIAnalysis(true),
    }));
  }
}

// ─── SVG Sparkline ────────────────────────────────────────

function createSparkline(data, formatFn) {
  const values = data.filter(v => v > 0);
  if (values.length < 2) return null;

  const w = 100, h = 28;
  const max = Math.max(...data);
  if (max === 0) return null;

  const coords = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - (v / max) * (h - 4) - 2,
    val: v,
  }));

  const points = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'ad-kpi-card__sparkline');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'var(--ad-bar-light)');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(line);

  // Hover elements (hidden by default)
  const vLine = document.createElementNS(ns, 'line');
  vLine.setAttribute('stroke', 'var(--ad-text-muted)');
  vLine.setAttribute('stroke-width', '0.5');
  vLine.setAttribute('stroke-dasharray', '2,1');
  vLine.setAttribute('y1', '0');
  vLine.setAttribute('y2', String(h));
  vLine.style.display = 'none';
  svg.appendChild(vLine);

  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('r', '2');
  dot.setAttribute('fill', 'var(--ad-accent)');
  dot.style.display = 'none';
  svg.appendChild(dot);

  // Tooltip element (outside SVG, positioned absolutely)
  const tooltip = document.createElement('div');
  tooltip.className = 'ad-sparkline-tip';

  const wrapper = document.createElement('div');
  wrapper.className = 'ad-sparkline-wrap';
  wrapper.appendChild(svg);
  wrapper.appendChild(tooltip);

  wrapper.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const pctX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const svgX = pctX * w;

    // Interpolate Y along the polyline
    const frac = pctX * (coords.length - 1);
    const lo = Math.floor(frac);
    const hi = Math.min(lo + 1, coords.length - 1);
    const t = frac - lo;
    const interpY = coords[lo].y + (coords[hi].y - coords[lo].y) * t;

    vLine.setAttribute('x1', svgX.toFixed(1));
    vLine.setAttribute('x2', svgX.toFixed(1));
    vLine.style.display = '';
    dot.setAttribute('cx', svgX.toFixed(1));
    dot.setAttribute('cy', interpY.toFixed(1));
    dot.style.display = '';

    // Snap label to nearest month
    const idx = Math.round(frac);
    const valStr = formatFn ? formatFn(coords[idx].val) : fmt(coords[idx].val);
    tooltip.textContent = `${MONTH_NAMES[idx]}: ${valStr}`;
    tooltip.style.display = 'block';
    tooltip.style.left = `${pctX * 100}%`;
  });

  wrapper.addEventListener('mouseleave', () => {
    vLine.style.display = 'none';
    dot.style.display = 'none';
    tooltip.style.display = 'none';
  });

  return wrapper;
}

// ─── KPI Cards ────────────────────────────────────────────

function renderKPIs(kpis, prevKpis, yoy, items, prevItems, allItemsRef, f, isOwnHouse) {
  const wrapper = document.createElement('div');

  const atMinBid = items.filter(i => i.p === 300).length;
  const minBidPct = items.length > 0 ? Math.round((atMinBid / items.length) * 1000) / 10 : 0;
  const prevAtMinBid = prevItems.filter(i => i.p === 300).length;
  const prevMinBidPct = prevItems.length > 0 ? Math.round((prevAtMinBid / prevItems.length) * 1000) / 10 : 0;
  const minBidTrend = prevMinBidPct > 0 ? Math.round(((minBidPct - prevMinBidPct) / prevMinBidPct) * 1000) / 10 : null;

  const monthlyForSparkline = computeMonthlyData(allItemsRef, f.year);

  // Row 1: Universal metrics (pure API data, comparable across houses)
  const universalCards = [
    { label: 'Sålda föremål', value: fmt(kpis.count), trend: yoy?.count, sparkData: monthlyForSparkline.map(m => m.count), sparkFmt: v => `${fmt(v)} st` },
    { label: 'Klubbat värde', value: fmtSEK(kpis.revenue), trend: yoy?.revenue, sparkData: monthlyForSparkline.map(m => m.revenue), sparkFmt: fmtSEK },
    { label: 'Snittpris (klubbat)', value: fmtSEK(kpis.avgPrice), trend: yoy?.avgPrice, sparkData: monthlyForSparkline.map(m => m.avgPrice), sparkFmt: fmtSEK },
    { label: 'Andel vid minbud', value: `${minBidPct}%`, trend: minBidTrend, invertTrend: true },
  ];

  wrapper.appendChild(buildKPIGrid(universalCards));

  // Row 2: House-specific financial metrics (only for own house)
  if (isOwnHouse) {
    const netRevenue = estimateNetRevenue(items);
    const prevNetRevenue = estimateNetRevenue(prevItems);
    const netRevYoY = prevNetRevenue > 0 ? Math.round(((netRevenue - prevNetRevenue) / prevNetRevenue) * 1000) / 10 : null;

    const grossRevenue = Math.round(kpis.revenue * GROSS_RATE);
    const prevGrossRevenue = Math.round(prevKpis.revenue * GROSS_RATE);
    const grossYoY = prevGrossRevenue > 0 ? Math.round(((grossRevenue - prevGrossRevenue) / prevGrossRevenue) * 1000) / 10 : null;

    const netPerItem = kpis.count > 0 ? Math.round(netRevenue / kpis.count) : 0;
    const prevNetPerItem = prevKpis.count > 0 ? Math.round(prevNetRevenue / prevKpis.count) : 0;
    const netPerItemYoY = prevNetPerItem > 0 ? Math.round(((netPerItem - prevNetPerItem) / prevNetPerItem) * 1000) / 10 : null;

    const economyCards = [
      { label: 'Omsättning', value: fmtSEK(grossRevenue), trend: grossYoY, sparkData: monthlyForSparkline.map(m => Math.round(m.revenue * GROSS_RATE)), sparkFmt: fmtSEK },
      { label: 'Nettointäkt (uppsk.)', value: fmtSEK(netRevenue), trend: netRevYoY, sparkData: monthlyForSparkline.map(m => Math.round(m.revenue * NET_RATE)), sparkFmt: fmtSEK },
      { label: 'Netto/föremål', value: fmtSEK(netPerItem), trend: netPerItemYoY, sparkData: null },
    ];

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'ad-kpi-section-label';
    sectionLabel.textContent = 'Vår ekonomi';
    wrapper.appendChild(sectionLabel);
    wrapper.appendChild(buildKPIGrid(economyCards, 'ad-kpi-grid--economy'));
  }

  return wrapper;
}

function buildKPIGrid(cards, extraClass) {
  const grid = document.createElement('div');
  grid.className = 'ad-kpi-grid ad-animate' + (extraClass ? ` ${extraClass}` : '');

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

    card.innerHTML = `
      <div class="ad-kpi-card__label">${escHTML(c.label)}</div>
      <div class="ad-kpi-card__value">${escHTML(c.value)}</div>
      ${subtitleHTML}
      ${trendHTML}`;

    if (c.sparkData) {
      const sparkEl = createSparkline(c.sparkData, c.sparkFmt);
      if (sparkEl) card.appendChild(sparkEl);
    }

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
  const infoText = ageHours === 0
    ? `${houseName} — Uppdaterad just nu`
    : `${houseName} — Uppdaterad ${ageHours < 1 ? 'nyss' : `${ageHours}h sedan`} • ${fmt(allItems.length)} föremål`;

  meta.innerHTML = `<div class="ad-nugget" id="nugget-container"></div><span class="ad-meta__info">${escHTML(infoText)}</span>`;
}

// ─── AI Nugget (Haiku motivational ticker) ────────────────

async function generateNugget(kpis, yoy, items, f) {
  const nuggetEl = $('nugget-container');
  if (!nuggetEl || items.length === 0) return;

  const data = {
    house: houseName,
    year: f.year,
    items: kpis.count,
    revenue: kpis.revenue,
    avgPrice: kpis.avgPrice,
    medianPrice: kpis.medianPrice,
    atMinBid: items.filter(i => i.p === 300).length,
    yoy,
  };

  let nuggetQueue = [];

  async function fetchNuggetBatch() {
    const response = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('timeout')), 12000);
      chrome.runtime.sendMessage({
        type: 'anthropic-fetch',
        body: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          temperature: 0.9,
          messages: [{
            role: 'user',
            content: `Ge exakt 5 korta meningar (max 10 ord var) på korrekt svenska, en per rad.

Datan visar försäljningsstatistik för auktionshuset "${houseName}" under ${f.year}. Fälten: items=antal sålda, revenue=totalt klubbat värde (kr), avgPrice=genomsnittligt klubbat pris, medianPrice=medianpris, atMinBid=antal sålda vid lägsta pris (300 kr), yoy=förändring jämfört med föregående år (%).

Regler:
- Referera till rätt årtal (${f.year}), aldrig "förra året"
- Använd BARA siffror från datan — hitta aldrig på
- Skriv siffror med siffror, inte bokstäver
- Formatera stora tal med mellanslag (2 316 660 kr, inte 2316660)
- 3 uppmuntrande meningar om datan, 2 allmänna livsvisdomar
- Positiv och varm ton, men kortfattat — inga utropstecken
- Säg "föremål" eller "objekt", aldrig "varor"
- Variera — inga upprepningar

Data: ${JSON.stringify(data)}`,
          }],
        },
      }, (resp) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (resp?.success) resolve(resp.data);
        else reject(new Error(resp?.error || 'fail'));
      });
    });
    const text = response?.content?.[0]?.text?.trim();
    if (!text) return [];
    return text.split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(l => l.length > 0);
  }

  async function showNextNugget() {
    if (nuggetQueue.length === 0) {
      try { nuggetQueue = await fetchNuggetBatch(); } catch { return; }
    }
    const text = nuggetQueue.shift();
    if (!text || !nuggetEl) return;
    const textEl = document.createElement('span');
    textEl.className = 'ad-nugget__text';
    textEl.textContent = text;
    nuggetEl.innerHTML = '';
    nuggetEl.appendChild(textEl);

    textEl.addEventListener('animationend', () => {
      setTimeout(() => showNextNugget(), 1500);
    });
  }

  showNextNugget();
}

// ─── Util ─────────────────────────────────────────────────

function escHTML(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ─── Start ────────────────────────────────────────────────

init();
