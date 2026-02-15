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

  // ─── DOM Scraper: Comments ──────────────────────────────────────

  function scrapeComments() {
    const comments = [];
    document.querySelectorAll('#comments ul.unstyled li.comment').forEach(li => {
      const employeeEl = li.querySelector('.employee');
      const commentedEl = li.querySelector('.commented');
      const postedAtEl = li.querySelector('.posted_at');
      const bodyEl = li.querySelector('.body');

      const employee = employeeEl ? employeeEl.textContent.trim() : '';
      const commentedLink = commentedEl ? commentedEl.querySelector('a') : null;
      const commentedText = commentedLink ? commentedLink.textContent.trim() : '';
      const commentedHref = commentedLink ? commentedLink.getAttribute('href') : '';
      const postedAt = postedAtEl ? postedAtEl.textContent.trim() : '';
      const body = bodyEl ? bodyEl.textContent.trim() : '';

      // Determine entity type from href
      let entityType = 'other';
      if (/\/buyers\//.test(commentedHref)) entityType = 'buyer';
      else if (/\/items\//.test(commentedHref)) entityType = 'item';
      else if (/\/return_claims\//.test(commentedHref)) entityType = 'claim';

      comments.push({ employee, commentedText, commentedHref, postedAt, body, entityType });
    });
    return comments;
  }

  function getInitials(name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function getAvatarColor(name) {
    // Deterministic color from name hash
    const colors = ['#006ccc', '#28a745', '#dc3545', '#e65100', '#6f42c1', '#17a2b8', '#d4a017', '#5a6268'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  function relativeTimestamp(postedAtText) {
    // Parse "13 feb 2026 kl. 13:52 CET" or similar
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };
    const match = postedAtText.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})\s+kl\.\s*(\d{1,2}):(\d{2})/);
    if (!match) return postedAtText.replace(/^.*?(?=\d)/, '');
    const [, day, mon, year, hour, min] = match;
    const d = new Date(parseInt(year), months[mon.toLowerCase()] ?? 0, parseInt(day), parseInt(hour), parseInt(min));
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just nu';
    if (diffMins < 60) return `${diffMins} min sedan`;
    if (diffHours < 24) return `${diffHours} tim sedan`;
    if (diffDays === 1) return `Igår ${hour}:${min}`;
    if (diffDays < 7) return `${diffDays} dagar sedan`;
    return `${day} ${mon}`;
  }

  function entityBadgeHTML(type) {
    const badges = {
      buyer: { label: 'Köpare', cls: 'ext-comment-badge--buyer' },
      item: { label: 'Föremål', cls: 'ext-comment-badge--item' },
      claim: { label: 'Reklamation', cls: 'ext-comment-badge--claim' },
      other: { label: 'Övrigt', cls: 'ext-comment-badge--other' }
    };
    const b = badges[type] || badges.other;
    return `<span class="ext-comment-badge ${b.cls}">${b.label}</span>`;
  }

  // ─── 1. KPI Hero Cards ────────────────────────────────────────────

  function renderKPICards() {
    const actions = scrapeRequestedActions();
    const sidebar = scrapeSidebarCounts();

    // ── Row 1: Action items (from Auctionet alerts + sidebar counts) ──
    const actionCards = [];

    actions.forEach(a => {
      let color = 'blue', icon = 'fas fa-bell';
      if (/reklamation|ångerrätt/i.test(a.label)) { color = 'red'; icon = 'fas fa-reply'; }
      else if (/värdering/i.test(a.label)) { color = 'orange'; icon = 'fas fa-balance-scale'; }
      else if (/export/i.test(a.label)) { color = 'yellow'; icon = 'fas fa-globe'; }
      actionCards.push({ ...a, color, icon });
    });

    const keyLabels = ['Opublicerbara', 'Hantera sålda', 'Hantera plocklista', 'Omlistas ej'];
    sidebar.forEach(s => {
      if (keyLabels.some(k => s.label.includes(k))) {
        let color = 'blue', icon = 'fas fa-box';
        if (/opublicer/i.test(s.label)) { color = 'orange'; icon = 'fas fa-ban'; }
        else if (/sålda/i.test(s.label)) { color = 'green'; icon = 'fas fa-check-circle'; }
        else if (/plocklista/i.test(s.label)) { color = 'blue'; icon = 'fas fa-dolly'; }
        else if (/omlistas/i.test(s.label)) { color = 'yellow'; icon = 'fas fa-redo'; }
        actionCards.push({ count: s.count, label: s.label, href: s.href, color, icon });
      }
    });

    // ── Row 2: Insight cards (comments, reklamation tracking) ──
    const insightCards = [];
    const comments = scrapeComments();
    if (comments.length > 0) {
      const today = new Date();
      const todayStr = `${today.getDate()} ${['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'][today.getMonth()]} ${today.getFullYear()}`;
      const todayCount = comments.filter(c => c.postedAt.includes(todayStr)).length;
      insightCards.push({
        count: todayCount > 0 ? todayCount : comments.length,
        label: todayCount > 0 ? 'Kommentarer idag' : 'Senaste kommentarer',
        href: '/admin/sas/comments',
        color: 'blue',
        icon: 'fas fa-comments'
      });

      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };
      const claimComments = comments.filter(c => {
        if (c.entityType !== 'claim') return false;
        const m = c.postedAt.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})\s+kl\.\s*(\d{1,2}):(\d{2})/);
        if (!m) return false;
        const d = new Date(parseInt(m[3]), monthNames[m[2].toLowerCase()] ?? 0, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]));
        return d >= sevenDaysAgo;
      });
      if (claimComments.length > 0) {
        insightCards.push({
          count: claimComments.length,
          label: 'Reklamationskommentarer (7d)',
          href: '/admin/sas/comments?filter=reklamation',
          color: 'red',
          icon: 'fas fa-exclamation-triangle'
        });
      }
    }

    if (actionCards.length === 0 && insightCards.length === 0) return;

    // Helper to render a card
    const cardHTML = (c) => `
      <a class="ext-kpi-card ext-kpi-card--${c.color}" href="${c.href}">
        <div class="ext-kpi-card__icon"><i class="icon ${c.icon}"></i></div>
        <div>
          <div class="ext-kpi-card__count">${c.count}</div>
          <div class="ext-kpi-card__label">${c.label}</div>
        </div>
      </a>
    `;

    const container = document.createElement('div');
    container.className = 'ext-kpi-container ext-animate-in';

    // Row 1: Action items
    if (actionCards.length > 0) {
      const actionGrid = document.createElement('div');
      actionGrid.className = 'ext-kpi-grid ext-kpi-grid--actions';
      actionGrid.innerHTML = actionCards.map(cardHTML).join('');
      container.appendChild(actionGrid);
    }

    // Row 2: Insights
    if (insightCards.length > 0) {
      const insightRow = document.createElement('div');
      insightRow.className = 'ext-kpi-insights';
      insightRow.innerHTML = `
        <div class="ext-kpi-insights__label">
          <i class="icon fas fa-chart-line" style="opacity: 0.4; margin-right: 4px;"></i>Insikter
        </div>
        <div class="ext-kpi-grid ext-kpi-grid--insights">
          ${insightCards.map(cardHTML).join('')}
        </div>
      `;
      container.appendChild(insightRow);
    }

    // Insert before the requested-actions div
    const target = document.querySelector('.requested-actions') || document.querySelector('.view');
    if (target) {
      target.parentNode.insertBefore(container, target);
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

    const kpiContainer = document.querySelector('.ext-kpi-container') || document.querySelector('.ext-kpi-grid');
    if (kpiContainer) {
      kpiContainer.parentNode.insertBefore(widget, kpiContainer.nextSibling);
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

  // ─── 7. Enhanced Comment Feed ──────────────────────────────────────

  function renderCommentFeed() {
    const comments = scrapeComments();
    if (comments.length === 0) return;

    const feedHTML = comments.map(c => {
      const initials = getInitials(c.employee);
      const avatarColor = getAvatarColor(c.employee);
      const relTime = relativeTimestamp(c.postedAt);
      const badge = entityBadgeHTML(c.entityType);
      const truncatedBody = c.body.length > 140 ? c.body.substring(0, 140) + '...' : c.body;

      return `
        <div class="ext-comment-item" data-href="${c.commentedHref || ''}">
          <div class="ext-comment-item__avatar" style="background: ${avatarColor};">${initials}</div>
          <div class="ext-comment-item__content">
            <div class="ext-comment-item__header">
              <span class="ext-comment-item__name">${c.employee}</span>
              ${badge}
              <span class="ext-comment-item__time">${relTime}</span>
            </div>
            <div class="ext-comment-item__entity-text">${c.commentedText}</div>
            <div class="ext-comment-item__body">${truncatedBody}</div>
          </div>
        </div>
      `;
    }).join('');

    const feed = document.createElement('div');
    feed.className = 'ext-comment-feed ext-animate-in';
    feed.innerHTML = `
      <div class="ext-comment-feed__header">
        <span class="ext-comment-feed__title">
          <i class="icon fas fa-comments" style="opacity: 0.5; margin-right: 6px;"></i>
          Senaste kommentarer
        </span>
        <a class="ext-comment-feed__viewall" href="/admin/sas/comments">Visa alla &raquo;</a>
      </div>
      <div class="ext-comment-feed__list">
        ${feedHTML}
      </div>
    `;

    // Click handler: navigate to entity unless user clicked an inner link
    feed.addEventListener('click', function(e) {
      if (e.target.closest('a')) return;
      const item = e.target.closest('.ext-comment-item');
      if (item && item.dataset.href) {
        window.location.href = item.dataset.href;
      }
    });

    // Insert above the original "Allas kommentarer" section
    const origSection = document.querySelector('#comments');
    if (origSection) {
      // Find the parent .well that contains the "Allas kommentarer" heading
      const parentWell = origSection.closest('.well');
      if (parentWell) {
        parentWell.parentNode.insertBefore(feed, parentWell);
        // Hide the original section
        parentWell.style.display = 'none';
      }
    }

    // Also hide "Mina kommentarer" section (the other .well next to it)
    const allWells = document.querySelectorAll('.well');
    allWells.forEach(well => {
      const heading = well.querySelector('h3');
      if (heading && /Mina kommentarer/.test(heading.textContent)) {
        well.style.display = 'none';
      }
    });
  }

  // ─── Initialize ───────────────────────────────────────────────────

  let hasRenderedKPI = false;
  let hasRenderedGoal = false;
  let hasRenderedPipeline = false;
  let hasRenderedInsights = false;
  let hasRenderedInventory = false;
  let hasRenderedLeaderboard = false;
  let hasRenderedComments = false;

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

      // Comment feed — needs #comments with li.comment entries
      if (!hasRenderedComments && document.querySelector('#comments ul.unstyled li.comment')) {
        renderCommentFeed();
        hasRenderedComments = true;
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
          hasRenderedInsights && hasRenderedInventory && hasRenderedLeaderboard &&
          hasRenderedComments) {
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
