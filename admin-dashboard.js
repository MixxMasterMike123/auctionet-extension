// admin-dashboard.js — Visual dashboard enhancements for the Auctionet admin main page
// No AI calls — pure DOM scraping and visualization

(function() {
  'use strict';

  // Only run on the exact /admin/sas page (not subpages)
  const path = window.location.pathname;
  if (!/\/admin\/sas\/?$/.test(path)) return;

  console.log('[AdminDashboard] Initializing dashboard enhancements');

  // ─── Utility ──────────────────────────────────────────────────────

  function parseNumber(str) {
    if (!str) return 0;
    // Handle Swedish number format: "1 413,24" or "1112" or "15,5"
    const cleaned = str.replace(/[^\d,.-]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  }

  function formatSEK(num) {
    return Math.round(num).toLocaleString('sv-SE');
  }

  function pctChange(current, previous) {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  }

  function trendHTML(pct, inverted = false) {
    if (pct === null) return '';
    const isGood = inverted ? pct < 0 : pct > 0;
    const cls = Math.abs(pct) < 1 ? 'ext-trend-flat' : (isGood ? 'ext-trend-up' : 'ext-trend-down');
    const arrow = pct > 1 ? '▲' : pct < -1 ? '▼' : '—';
    return `<span class="ext-insight-card__trend ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  }

  function yoyItemHTML(label, pct, inverted = false) {
    if (pct === null) return '';
    const isGood = inverted ? pct < 0 : pct > 0;
    const cls = Math.abs(pct) < 1 ? 'ext-yoy-flat' : (isGood ? 'ext-yoy-up' : 'ext-yoy-down');
    const arrow = pct > 1 ? '▲' : pct < -1 ? '▼' : '—';
    return `<span class="ext-pipeline__yoy-item ${cls}">${label}: ${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
  }

  // ─── DOM Scrapers ─────────────────────────────────────────────────

  function scrapeRequestedActions() {
    const actions = [];
    document.querySelectorAll('.requested-actions__action').forEach(el => {
      const link = el.querySelector('a');
      const strong = el.querySelector('strong');
      if (!link || !strong) return;
      const text = strong.textContent.trim();
      const countMatch = text.match(/(\d+)/);
      const count = countMatch ? parseInt(countMatch[1]) : 0;
      const label = text.replace(/^\d+\s*/, '');
      const href = link.getAttribute('href');
      actions.push({ count, label, href });
    });
    return actions;
  }

  function scrapeSidebarCounts() {
    const counts = [];
    document.querySelectorAll('.well--nav-list a').forEach(link => {
      const text = link.textContent.trim();
      const countMatch = text.match(/\((\d[\d\s]*)\)\s*$/);
      if (!countMatch) return;
      const count = parseInt(countMatch[1].replace(/\s/g, ''));
      const label = text.replace(/\([\d\s]+\)\s*$/, '').replace(/^\s*/, '').trim();
      // Remove font-awesome icon text artifacts
      const cleanLabel = label.replace(/^\s+/, '');
      const href = link.getAttribute('href');
      counts.push({ count, label: cleanLabel, href });
    });
    return counts;
  }

  function scrapeDailyGoal() {
    const el = document.querySelector('.test-new-items');
    if (!el) return null;
    const text = el.textContent.trim();
    // "Inskrivet idag: 3/20 st : 1 234 SEK"
    const match = text.match(/(\d+)\s*\/\s*(\d+)\s*st\s*:\s*([\d\s]+)\s*SEK/);
    if (!match) return null;
    return {
      current: parseInt(match[1]),
      goal: parseInt(match[2]),
      sek: parseInt(match[3].replace(/\s/g, ''))
    };
  }

  function scrapeFlowStats() {
    const table = document.querySelector('.auction-company-stats table');
    if (!table) return [];
    const rows = [];
    table.querySelectorAll('tbody tr').forEach(tr => {
      const cells = tr.querySelectorAll('th, td');
      if (cells.length < 9) return;
      // Parse avg valuation "1421 / 1511 / 1450" → {sold, unsold, all}
      function parseTriple(str) {
        const parts = str.split('/').map(s => parseNumber(s.trim()));
        return { sold: parts[0] || 0, unsold: parts[1] || 0, all: parts[2] || 0 };
      }
      rows.push({
        period: cells[0].textContent.trim(),
        created: parseNumber(cells[1].textContent),
        published: parseNumber(cells[2].textContent),
        sold: parseNumber(cells[3].textContent),
        recalled: parseNumber(cells[4].textContent),
        recallPct: parseNumber(cells[5].textContent),
        avgValuation: parseTriple(cells[6].textContent),
        avgReserve: parseTriple(cells[7].textContent),
        avgPrice: parseNumber(cells[8].textContent)
      });
    });
    return rows;
  }

  function scrapeCatalogerStats() {
    const table = document.querySelector('.test-cataloger-stats');
    if (!table) return [];
    const catalogers = [];
    table.querySelectorAll('tbody tr').forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 5) return;
      catalogers.push({
        name: cells[0].textContent.trim(),
        today: parseNumber(cells[1].textContent),
        yesterday: parseNumber(cells[2].textContent),
        lastMonth: parseNumber(cells[3].textContent),
        weeklyAvg: parseNumber(cells[4].getAttribute('data-sort-value') || cells[4].textContent),
        monthlyAvg: parseNumber(cells[5].getAttribute('data-sort-value') || cells[5].textContent)
      });
    });
    return catalogers;
  }

  // ─── 1. KPI Hero Cards ────────────────────────────────────────────

  function renderKPICards() {
    const actions = scrapeRequestedActions();
    const sidebar = scrapeSidebarCounts();

    // Map action keywords to colors and icons
    const cardDefs = [];

    // From requested actions
    actions.forEach(a => {
      let color = 'blue', icon = 'fas fa-bell';
      if (/reklamation|ångerrätt/i.test(a.label)) { color = 'red'; icon = 'fas fa-reply'; }
      else if (/värdering/i.test(a.label)) { color = 'orange'; icon = 'fas fa-balance-scale'; }
      else if (/export/i.test(a.label)) { color = 'yellow'; icon = 'fas fa-globe'; }
      cardDefs.push({ ...a, color, icon });
    });

    // Key sidebar counts
    const keyLabels = ['Opublicerbara', 'Hantera sålda', 'Hantera plocklista', 'Omlistas ej'];
    sidebar.forEach(s => {
      if (keyLabels.some(k => s.label.includes(k))) {
        let color = 'blue', icon = 'fas fa-box';
        if (/opublicer/i.test(s.label)) { color = 'orange'; icon = 'fas fa-ban'; }
        else if (/sålda/i.test(s.label)) { color = 'green'; icon = 'fas fa-check-circle'; }
        else if (/plocklista/i.test(s.label)) { color = 'blue'; icon = 'fas fa-dolly'; }
        else if (/omlistas/i.test(s.label)) { color = 'yellow'; icon = 'fas fa-redo'; }
        cardDefs.push({ count: s.count, label: s.label, href: s.href, color, icon });
      }
    });

    if (cardDefs.length === 0) return;

    const grid = document.createElement('div');
    grid.className = 'ext-kpi-grid ext-animate-in';
    grid.innerHTML = cardDefs.map(c => `
      <a class="ext-kpi-card ext-kpi-card--${c.color}" href="${c.href}">
        <div class="ext-kpi-card__icon"><i class="icon ${c.icon}"></i></div>
        <div>
          <div class="ext-kpi-card__count">${c.count}</div>
          <div class="ext-kpi-card__label">${c.label}</div>
        </div>
      </a>
    `).join('');

    // Insert before the requested-actions div
    const target = document.querySelector('.requested-actions') || document.querySelector('.view');
    if (target) {
      target.parentNode.insertBefore(grid, target);
      // Hide the original alerts since we're replacing them
      const origActions = document.querySelector('.requested-actions');
      if (origActions) origActions.style.display = 'none';
    }
  }

  // ─── 2. Daily Goal Progress Ring ──────────────────────────────────

  function renderDailyGoal() {
    const goal = scrapeDailyGoal();
    if (!goal) return;

    const pct = goal.goal > 0 ? Math.min(100, (goal.current / goal.goal) * 100) : 0;
    const r = 26;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    const strokeColor = pct >= 100 ? '#28a745' : pct >= 50 ? '#006ccc' : '#e65100';

    const widget = document.createElement('div');
    widget.className = 'ext-goal-widget ext-animate-in';
    widget.innerHTML = `
      <div class="ext-goal-ring">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle class="ext-goal-ring__track" cx="32" cy="32" r="${r}" />
          <circle class="ext-goal-ring__fill" cx="32" cy="32" r="${r}"
                  stroke="${strokeColor}"
                  stroke-dasharray="${circ}"
                  stroke-dashoffset="${offset}" />
        </svg>
        <div class="ext-goal-ring__text">${goal.current}/${goal.goal}</div>
      </div>
      <div class="ext-goal-info">
        <div class="ext-goal-info__title">Inskrivet idag</div>
        <div class="ext-goal-info__subtitle">${Math.round(pct)}% av dagsmål</div>
        ${goal.sek > 0 ? `<div class="ext-goal-info__sek">${formatSEK(goal.sek)} SEK</div>` : ''}
      </div>
    `;

    const kpiGrid = document.querySelector('.ext-kpi-grid');
    if (kpiGrid) {
      kpiGrid.parentNode.insertBefore(widget, kpiGrid.nextSibling);
    }
  }

  // ─── 3. Pipeline Funnel ───────────────────────────────────────────

  function renderPipelineFunnel() {
    const stats = scrapeFlowStats();
    if (stats.length === 0) return;

    // Use 30-day row for the main funnel
    const row30 = stats.find(r => /30 dag/i.test(r.period));
    if (!row30) return;

    // YoY comparison
    const lastWeek = stats.find(r => /^Förra veckan$/i.test(r.period));
    const lastWeekYoY = stats.find(r => /för ett år sedan/i.test(r.period));

    const stages = [
      { label: 'Inskrivet', count: row30.created, color: '#006ccc' },
      { label: 'Publicerat', count: row30.published, color: '#17a2b8' },
      { label: 'Sålt', count: row30.sold, color: '#28a745' },
      { label: 'Återrop', count: row30.recalled, color: '#dc3545' }
    ];

    // Calculate conversion rates
    const convRates = [];
    convRates.push(row30.created > 0 ? Math.round((row30.published / row30.created) * 100) : 0);
    convRates.push(row30.published > 0 ? Math.round((row30.sold / row30.published) * 100) : 0);
    convRates.push(null); // no conversion for recall

    // YoY items
    let yoyHTML = '';
    if (lastWeek && lastWeekYoY) {
      const items = [
        yoyItemHTML('Inskrivet', pctChange(lastWeek.created, lastWeekYoY.created)),
        yoyItemHTML('Sålt', pctChange(lastWeek.sold, lastWeekYoY.sold)),
        yoyItemHTML('Snittpris', pctChange(lastWeek.avgPrice, lastWeekYoY.avgPrice)),
        yoyItemHTML('Återrop', pctChange(lastWeek.recallPct, lastWeekYoY.recallPct), true)
      ].filter(Boolean);

      if (items.length > 0) {
        yoyHTML = `
          <div class="ext-pipeline__yoy">
            <span style="font-size: 11px; color: #888; font-weight: 600;">Vecka mot vecka (YoY):</span>
            ${items.join('')}
          </div>`;
      }
    }

    const pipeline = document.createElement('div');
    pipeline.className = 'ext-pipeline ext-animate-in';
    pipeline.innerHTML = `
      <div class="ext-pipeline__title">Flöde senaste 30 dagar</div>
      <div class="ext-pipeline__funnel">
        ${stages.map((s, i) => `
          ${i > 0 ? '<span class="ext-pipeline__arrow">›</span>' : ''}
          <div class="ext-pipeline__stage" style="background: ${s.color};">
            <div class="ext-pipeline__stage-count">${s.count.toLocaleString('sv-SE')}</div>
            <div class="ext-pipeline__stage-label">${s.label}</div>
            ${i < convRates.length && convRates[i] !== null ? `<div class="ext-pipeline__stage-rate">${convRates[i]}%</div>` : ''}
          </div>
        `).join('')}
      </div>
      ${yoyHTML}
    `;

    // Insert before the flow stats table
    const statsDiv = document.getElementById('statistics');
    if (statsDiv) {
      statsDiv.parentNode.insertBefore(pipeline, statsDiv);
    }
  }

  // ─── 4. Cataloger Leaderboard Enhancement ─────────────────────────

  function enhanceCatalogerTable() {
    const table = document.querySelector('.test-cataloger-stats');
    if (!table) return;

    const catalogers = scrapeCatalogerStats();
    if (catalogers.length === 0) return;

    // Find max monthly count for bar scaling
    const maxMonth = Math.max(...catalogers.map(c => c.lastMonth), 1);
    const maxMonthlyAvg = Math.max(...catalogers.map(c => c.monthlyAvg), 1);

    // Find top performer (by monthly average)
    const topPerformer = catalogers.reduce((best, c) => c.monthlyAvg > best.monthlyAvg ? c : best, catalogers[0]);

    // Enhance each row
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((tr, i) => {
      if (i >= catalogers.length) return;
      const cat = catalogers[i];
      const cells = tr.querySelectorAll('td');

      // Add top performer badge to name
      if (cat.name === topPerformer.name && topPerformer.monthlyAvg > 0) {
        cells[0].innerHTML += ' <span class="ext-leaderboard-badge">★ Topp</span>';
      }

      // Add bar to last month cell (index 3)
      if (cells[3] && cat.lastMonth > 0) {
        const barWidth = (cat.lastMonth / maxMonth) * 100;
        cells[3].classList.add('ext-bar-cell');
        cells[3].style.position = 'relative';
        const originalText = cells[3].textContent;
        cells[3].innerHTML = `
          <div class="ext-bar-cell__bar" style="width: ${barWidth}%;"></div>
          <span class="ext-bar-cell__value">${originalText}</span>
        `;
      }

      // Color-code zero cells more visibly
      cells.forEach((cell, ci) => {
        if (ci > 0 && cell.textContent.trim() === '0') {
          cell.style.color = '#ccc';
        }
      });
    });
  }

  // ─── 5. Pricing Insights ──────────────────────────────────────────

  function renderPricingInsights() {
    const stats = scrapeFlowStats();
    if (stats.length === 0) return;

    const row7 = stats.find(r => /7 dag/i.test(r.period));
    const row30 = stats.find(r => /30 dag/i.test(r.period));
    const row1y = stats.find(r => /1 år/i.test(r.period));

    if (!row30) return;

    const cards = [];

    // Average price with trend
    if (row30.avgPrice > 0) {
      const trend7vs30 = row7 ? pctChange(row7.avgPrice, row30.avgPrice) : null;
      cards.push(`
        <div class="ext-insight-card">
          <div class="ext-insight-card__label">Snittpris (30 dagar)</div>
          <div class="ext-insight-card__value">${formatSEK(row30.avgPrice)} SEK</div>
          ${row7 ? `<div class="ext-insight-card__detail">7 dagar: ${formatSEK(row7.avgPrice)} SEK ${trendHTML(trend7vs30)}</div>` : ''}
          ${row1y ? `<div class="ext-insight-card__detail">1 år: ${formatSEK(row1y.avgPrice)} SEK</div>` : ''}
        </div>
      `);
    }

    // Valuation accuracy: avg valuation (sold) vs avg price
    if (row30.avgValuation.sold > 0 && row30.avgPrice > 0) {
      const accuracy = (row30.avgPrice / row30.avgValuation.sold) * 100;
      const accuracyColor = accuracy >= 90 && accuracy <= 110 ? '#28a745' : accuracy >= 80 ? '#e65100' : '#dc3545';
      cards.push(`
        <div class="ext-insight-card">
          <div class="ext-insight-card__label">Värderingsträff</div>
          <div class="ext-insight-card__value" style="color: ${accuracyColor}">${accuracy.toFixed(0)}%</div>
          <div class="ext-insight-card__detail">Snittpris ${formatSEK(row30.avgPrice)} vs värdering ${formatSEK(row30.avgValuation.sold)} SEK</div>
        </div>
      `);
    }

    // Reserve coverage: avg reserve vs avg price
    if (row30.avgReserve.sold > 0 && row30.avgPrice > 0) {
      const coverage = (row30.avgPrice / row30.avgReserve.sold) * 100;
      cards.push(`
        <div class="ext-insight-card">
          <div class="ext-insight-card__label">Utropstäckning</div>
          <div class="ext-insight-card__value">${coverage.toFixed(0)}%</div>
          <div class="ext-insight-card__detail">Snittpris ${formatSEK(row30.avgPrice)} vs bevakning ${formatSEK(row30.avgReserve.sold)} SEK</div>
        </div>
      `);
    }

    // Recall rate
    if (row30.recallPct >= 0) {
      const recallColor = row30.recallPct <= 5 ? '#28a745' : row30.recallPct <= 10 ? '#e65100' : '#dc3545';
      const trend = row1y ? pctChange(row30.recallPct, row1y.recallPct) : null;
      cards.push(`
        <div class="ext-insight-card">
          <div class="ext-insight-card__label">Återropsandel (30 dagar)</div>
          <div class="ext-insight-card__value" style="color: ${recallColor}">${row30.recallPct.toFixed(1)}%</div>
          ${row1y ? `<div class="ext-insight-card__detail">1 år: ${row1y.recallPct.toFixed(1)}% ${trendHTML(trend, true)}</div>` : ''}
        </div>
      `);
    }

    if (cards.length === 0) return;

    const grid = document.createElement('div');
    grid.className = 'ext-insights-grid ext-animate-in';
    grid.innerHTML = cards.join('');

    // Insert before the flow stats table
    const statsDiv = document.getElementById('statistics');
    if (statsDiv) {
      statsDiv.parentNode.insertBefore(grid, statsDiv);
    }
  }

  // ─── 6. Inventory Health Summary ──────────────────────────────────

  function renderInventoryHealth() {
    const sidebar = scrapeSidebarCounts();
    if (sidebar.length === 0) return;

    // Extract relevant counts
    function findCount(keyword) {
      const item = sidebar.find(s => s.label.toLowerCase().includes(keyword.toLowerCase()));
      return item ? item.count : 0;
    }

    const opub = findCount('Opublicerbara');
    const sold = findCount('sålda föremål');
    const relistNo = findCount('Omlistas ej');
    const transport = findCount('plocklista');

    const total = opub + sold + relistNo + transport;
    if (total === 0) return;

    const segments = [
      { label: 'Opublicerbara', count: opub, color: '#e65100' },
      { label: 'Sålda att hantera', count: sold, color: '#28a745' },
      { label: 'Omlistas ej', count: relistNo, color: '#f0ad4e' },
      { label: 'Plocklista', count: transport, color: '#006ccc' }
    ].filter(s => s.count > 0);

    const inventory = document.createElement('div');
    inventory.className = 'ext-inventory ext-animate-in';
    inventory.innerHTML = `
      <div class="ext-inventory__title">Lagerstatus</div>
      <div class="ext-inventory__bar">
        ${segments.map(s => `
          <div class="ext-inventory__segment" 
               style="width: ${(s.count / total) * 100}%; background: ${s.color};"
               title="${s.label}: ${s.count}">
            ${s.count}
          </div>
        `).join('')}
      </div>
      <div class="ext-inventory__legend">
        ${segments.map(s => `
          <span class="ext-inventory__legend-item">
            <span class="ext-inventory__legend-dot" style="background: ${s.color};"></span>
            ${s.label} (${s.count})
          </span>
        `).join('')}
      </div>
    `;

    // Insert after pipeline funnel or before stats
    const pipeline = document.querySelector('.ext-pipeline');
    const statsDiv = document.getElementById('statistics');
    if (pipeline) {
      pipeline.parentNode.insertBefore(inventory, pipeline.nextSibling);
    } else if (statsDiv) {
      statsDiv.parentNode.insertBefore(inventory, statsDiv);
    }
  }

  // ─── Initialize ───────────────────────────────────────────────────

  let hasRenderedKPI = false;
  let hasRenderedGoal = false;
  let hasRenderedPipeline = false;
  let hasRenderedInsights = false;
  let hasRenderedInventory = false;
  let hasRenderedLeaderboard = false;

  function tryRenderAll() {
    try {
      // KPI cards — needs .requested-actions (immediate) + sidebar counts (lazy)
      if (!hasRenderedKPI && document.querySelector('.requested-actions')) {
        renderKPICards();
        hasRenderedKPI = true;
      }

      // Daily goal — needs navbar counter (immediate)
      if (!hasRenderedGoal && document.querySelector('.test-new-items')) {
        renderDailyGoal();
        hasRenderedGoal = true;
      }

      // Pipeline funnel — needs #statistics flow table (immediate)
      if (!hasRenderedPipeline && document.querySelector('.auction-company-stats table')) {
        renderPipelineFunnel();
        hasRenderedPipeline = true;
      }

      // Pricing insights — needs same flow table
      if (!hasRenderedInsights && document.querySelector('.auction-company-stats table')) {
        renderPricingInsights();
        hasRenderedInsights = true;
      }

      // Inventory health — needs sidebar nav counts (lazy turbo-frames)
      if (!hasRenderedInventory) {
        const sidebar = scrapeSidebarCounts();
        if (sidebar.length > 0) {
          renderInventoryHealth();
          hasRenderedInventory = true;
        }
      }

      // Cataloger leaderboard — needs cataloger_stats turbo-frame (lazy)
      if (!hasRenderedLeaderboard && document.querySelector('.test-cataloger-stats tbody tr td')) {
        enhanceCatalogerTable();
        hasRenderedLeaderboard = true;
      }
    } catch (error) {
      console.error('[AdminDashboard] Render error:', error);
    }
  }

  function init() {
    console.log('[AdminDashboard] Initializing...');

    // Render immediately with whatever is in the DOM
    tryRenderAll();

    // Watch for turbo-frames and other lazy content arriving.
    // Many sidebar counts and the cataloger table load lazily via turbo-frames
    // that only fire when scrolled into view or after a delay.
    const observer = new MutationObserver(() => {
      tryRenderAll();

      // Stop observing once everything has rendered
      if (hasRenderedKPI && hasRenderedGoal && hasRenderedPipeline &&
          hasRenderedInsights && hasRenderedInventory && hasRenderedLeaderboard) {
        observer.disconnect();
        console.log('[AdminDashboard] All enhancements rendered');
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also retry a few times quickly in case DOM settles after script runs
    setTimeout(tryRenderAll, 200);
    setTimeout(tryRenderAll, 600);
    setTimeout(tryRenderAll, 1500);

    // Safety: disconnect observer after 60s
    setTimeout(() => observer.disconnect(), 60000);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
