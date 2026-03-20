// ai-insights.js — AI-powered analysis of analytics data via Claude

const SYSTEM_PROMPT = `Du är en erfaren rådgivare för svenska auktionshus. Du analyserar försäljningsdata och ger konstruktiva, handlingsbara insikter med balanserad ton.

Branschkontext:
- Auktionshus på Auctionet är ofta små-medelstora företag med 1-10 anställda
- Volymer varierar kraftigt efter säsong — vår och höst är högsäsong, sommar/jul är lugnt
- Ett typiskt mellanstor hus säljer 5 000–15 000 föremål/år
- "Minbud" = 300 kr är Auctionets lägsta tillåtna slutpris. Andelen vid minbud beror på insamlingsstrategi — hus som tar in dödsbon får naturligt fler lågvärdeföremål
- Intäktsmodell: Köpare betalar klubbat pris + 25% köparprovision. Auctionet tar 6% av totalen (klubbat + provision = klubbat × 1.25). Säljaren betalar 20% provision på klubbat pris + 80 kr fotoavgift. Omsättning = klubbat × 1.175 (efter Auctionets avgift). Nettointäkt = köparprovision + säljprovision + fotoavgift - Auctionet-avgift = klubbat × 0.375 + 80 kr per föremål
- Nettointäkt per föremål är viktigare än bruttomsättning
- Kategorimix beror på husets nisch och upptagningsområde — det är inte alltid fel att ha mycket i en kategori
- YoY-data i fältet "yoy" jämför redan samma period (avslutade månader) för rättvisa jämförelser

Ton och stil:
- Var konstruktiv och lösningsorienterad, inte alarmistisk
- Presentera utmaningar som förbättringsmöjligheter, inte kriser
- Undvik dramatiska ord som "katastrofal", "alarmerande", "kollaps"
- Notera positiva trender och styrkor, inte bara problem
- Om data är begränsad (få månader), var försiktig med slutsatser

Svara ALLTID på svenska. Formatera som JSON med exakt denna struktur:
{
  "strategic_insights": ["...", "..."],
  "action_items": ["...", "..."],
  "risk_alerts": ["...", "..."],
  "opportunities": ["...", "..."]
}

Regler:
- Varje punkt ska vara 1-2 meningar, konkret och specifik med siffror från datan
- Undvik generella råd — var specifik för detta auktionshus och dess data
- Max 4 punkter per kategori, minst 1 per kategori
- risk_alerts kan vara tom array om inga risker identifieras
- Analysera säsongsmönster i månadsdata
- Jämför kategoriers genomsnittspris och volym för att hitta obalanser
- VIKTIGT: Fältet "today" anger dagens datum. Den senaste månaden i datan kan vara ofullständig — dra inga slutsatser från en pågående månad
- Om isOwnHouse=true finns ekonomiska nyckeltal (netRevenue, grossRevenue) — analysera lönsamhet och intäkter. Om isOwnHouse=false, fokusera enbart på marknadsdata (klubbade priser, volymer, kategorier) utan att spekulera om husets ekonomi
- Om adminData finns: totalCommission=faktisk provision, avgVisits=genomsnittliga unika besök per objekt, firstSaleRate=andel av auktionsförsök som säljs vid första försöket (objekt listas upp till 3 gånger). Låg förstagångsförsäljning (<55%) indikerar prissättnings- eller katalogiseringsproblem och kostar lagerdagar
- Svara BARA med JSON, ingen annan text`;

const insightsCache = new Map();

/**
 * Build a compact data summary from pre-computed aggregations.
 * Keeps input tokens low (~800-1200) while giving AI full picture.
 */
export function buildDataSummary({ houseName, year, kpis, prevKpis, yoy, monthly, priceDist, pricePoints, categories, netRevenue, grossRevenue, isOwnHouse, activeFilters, adminTotals, adminCategories }) {
  const summary = {
    today: new Date().toISOString().slice(0, 10),
    company: houseName,
    year,
    isOwnHouse: !!isOwnHouse,
    filters: activeFilters || null,
    kpis: {
      items: kpis.count,
      revenue: kpis.revenue,
      avgPrice: kpis.avgPrice,
      medianPrice: kpis.medianPrice,
    },
    previousYear: prevKpis && prevKpis.count > 0 ? {
      items: prevKpis.count,
      revenue: prevKpis.revenue,
      avgPrice: prevKpis.avgPrice,
    } : null,
    yoy: yoy || null,
    monthly: monthly
      .map((m, i) => ({ month: i + 1, items: m.count, revenue: m.revenue, avg: m.avgPrice }))
      .filter(m => m.items > 0),
    priceDistribution: priceDist.map(d => ({ bracket: d.label, count: d.count, pct: d.pct })),
    pricePoints,
    topCategories: categories.slice(0, 10).map(c => ({
      name: c.name, count: c.count, revenue: c.revenue, avg: c.avgPrice,
    })),
  };

  // Include financial estimates only for own house
  if (isOwnHouse && netRevenue != null) {
    summary.netRevenue = netRevenue;
    summary.grossRevenue = grossRevenue;
  }

  // Include admin auction results data if available
  if (adminTotals) {
    summary.adminData = {
      totalCommission: adminTotals.totalCommission,
      avgVisits: adminTotals.avgVisits,
      firstSaleRate: adminTotals.firstSaleRate,
      totalCount: adminTotals.totalCount,
      soldCount: adminTotals.soldCount,
    };
  }

  return summary;
}

/**
 * Generate cache key from current company + filter state
 */
function cacheKey(companyId, filters) {
  const f = filters || {};
  return `${companyId}_${f.year}_${f.month}_${f.categoryId}_${f.priceMin || ''}_${f.priceMax || ''}`;
}

/**
 * Call Claude to generate insights from the data summary.
 * Returns { strategic_insights, action_items, risk_alerts, opportunities }
 */
export async function generateInsights(dataSummary, companyId, filters) {
  const key = cacheKey(companyId, filters);
  if (insightsCache.has(key)) return insightsCache.get(key);

  const response = await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Timeout — försök igen')), 35000);

    chrome.runtime.sendMessage({
      type: 'anthropic-fetch',
      body: {
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        temperature: 0.2,
        system: [{
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        }],
        messages: [{
          role: 'user',
          content: JSON.stringify(dataSummary),
        }],
      },
    }, (resp) => {
      clearTimeout(timeoutId);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (resp && resp.success) {
        resolve(resp.data);
      } else {
        reject(new Error(resp?.error || 'Okänt fel'));
      }
    });
  });

  // Extract text from response
  const text = response?.content?.[0]?.text || (typeof response === 'string' ? response : '');
  const parsed = parseJSON(text);
  insightsCache.set(key, parsed);
  return parsed;
}

/**
 * Parse JSON from AI response, handling markdown fences
 */
function parseJSON(text) {
  // Try direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // Try extracting from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continue */ }
  }

  // Try extracting any JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch { /* continue */ }
  }

  throw new Error('Kunde inte tolka AI-svaret');
}

/**
 * Clear cached insights (e.g., on data refresh)
 */
export function clearInsightsCache() {
  insightsCache.clear();
}

/**
 * Check if insights are cached for given state
 */
export function getCachedInsights(companyId, filters) {
  return insightsCache.get(cacheKey(companyId, filters)) || null;
}

// Section configuration
const SECTIONS = [
  { key: 'strategic_insights', title: 'Strategiska insikter', icon: '\u{1F4A1}', cls: 'insight' },
  { key: 'action_items', title: '\u00C5tg\u00E4rder', icon: '\u2705', cls: 'action' },
  { key: 'risk_alerts', title: 'Riskvarningar', icon: '\u26A0\uFE0F', cls: 'risk' },
  { key: 'opportunities', title: 'M\u00F6jligheter', icon: '\u{1F680}', cls: 'opportunity' },
];

/**
 * Render the AI insights panel.
 * @param {Object|null} insights - parsed AI response or null
 * @param {boolean} isLoading - show loading state
 * @param {string|null} error - error message
 * @param {Function} onRefresh - callback to re-run analysis
 * @returns {HTMLElement}
 */
export function renderInsightsPanel({ insights, isLoading, error, onRefresh }) {
  const card = document.createElement('div');
  card.className = 'ad-card ad-ai-panel ad-animate';
  card.id = 'ai-insights-panel';

  if (isLoading) {
    card.innerHTML = `
      <div class="ad-card__title">AI-analys <span class="ad-ai-badge">Sonnet 4.5</span></div>
      <div class="ad-ai-loading">
        <div class="ad-ai-shimmer"></div>
        <div class="ad-ai-shimmer ad-ai-shimmer--short"></div>
        <div class="ad-ai-shimmer"></div>
        <div class="ad-ai-shimmer ad-ai-shimmer--short"></div>
      </div>`;
    return card;
  }

  if (error) {
    card.innerHTML = `
      <div class="ad-card__title">AI-analys <span class="ad-ai-badge">Sonnet 4.5</span></div>
      <div class="ad-ai-error">${escHTML(error)}</div>`;
    return card;
  }

  if (!insights) return card;

  let sectionsHTML = '';
  for (const sec of SECTIONS) {
    const items = insights[sec.key];
    if (!items || items.length === 0) continue;

    const listHTML = items.map(item => `<li class="ad-ai-item">${escHTML(item)}</li>`).join('');
    sectionsHTML += `
      <div class="ad-ai-section ad-ai-section--${sec.cls}">
        <div class="ad-ai-section__title">${sec.icon} ${sec.title}</div>
        <ul class="ad-ai-section__list">${listHTML}</ul>
      </div>`;
  }

  card.innerHTML = `
    <div class="ad-card__title">AI-analys <span class="ad-ai-badge">Sonnet 4.5</span></div>
    ${sectionsHTML}
    <div class="ad-ai-footer">
      <button class="ad-ai-refresh">Uppdatera analys</button>
    </div>`;

  const refreshBtn = card.querySelector('.ad-ai-refresh');
  if (refreshBtn && onRefresh) {
    refreshBtn.addEventListener('click', onRefresh);
  }

  return card;
}

/**
 * Render a compact KPI-style summary card for the AI insights.
 * Shows the top finding from each non-empty section as a one-liner.
 */
export function renderInsightsSummaryCard({ insights, isLoading, error }) {
  const card = document.createElement('div');
  card.className = 'ad-ai-summary ad-animate';
  card.id = 'ai-summary-card';

  if (isLoading) {
    card.innerHTML = `
      <div class="ad-ai-summary__header">AI-analys</div>
      <div class="ad-ai-loading">
        <div class="ad-ai-shimmer ad-ai-shimmer--short"></div>
        <div class="ad-ai-shimmer"></div>
      </div>`;
    return card;
  }

  if (error) {
    card.innerHTML = `
      <div class="ad-ai-summary__header">AI-analys</div>
      <div class="ad-ai-error">${escHTML(error)}</div>`;
    return card;
  }

  if (!insights) return card;

  // Pick the first item from each non-empty section as a TL;DR
  let snippetsHTML = '';
  for (const sec of SECTIONS) {
    const items = insights[sec.key];
    if (!items || items.length === 0) continue;
    // Truncate long items to ~120 chars
    let text = items[0];
    if (text.length > 120) text = text.slice(0, 117) + '...';
    snippetsHTML += `<div class="ad-ai-summary__row ad-ai-summary__row--${sec.cls}"><span class="ad-ai-summary__icon">${sec.icon}</span>${escHTML(text)}</div>`;
  }

  card.innerHTML = `
    <div class="ad-ai-summary__header">AI-analys <span class="ad-ai-badge">Sonnet 4.5</span></div>
    ${snippetsHTML}
    <a href="#ai-insights-panel" class="ad-ai-summary__more">Visa fullständig analys</a>`;

  card.querySelector('.ad-ai-summary__more').addEventListener('click', (e) => {
    e.preventDefault();
    const panel = document.getElementById('ai-insights-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return card;
}

function escHTML(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}
