// admin-dashboard.js — Visual dashboard enhancements for the Auctionet admin main page
// Pure DOM scraping, rendering, and cache display.
// Publication scan logic runs in background service worker (publication-scanner-bg.js).

(async function() {
  'use strict';

  // Only run on the exact /admin/sas page (not subpages)
  const path = window.location.pathname;
  if (!/\/admin\/sas\/?$/.test(path)) return;

  // Admin mode gate: skip all enhancements unless unlocked via PIN
  try {
    const { adminUnlocked } = await chrome.storage.sync.get('adminUnlocked');
    if (!adminUnlocked) {
      return;
    }
  } catch (e) {
    return;
  }


  // ─── Utility ──────────────────────────────────────────────────────

  // True while this content script can still reach the extension. After the
  // extension is reloaded/updated, old content scripts in already-open tabs
  // lose their context; touching chrome.* then throws "Extension context
  // invalidated". Guard background-event listeners with this so they fail
  // silently (the user just reloads the page to get a fresh context).
  function extensionAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }

  // Send a message without ever throwing "Extension context invalidated"
  // (happens when an old content script outlives an extension reload). Returns
  // a promise of the response, or null if the context is gone / errored.
  function safeSendMessage(msg) {
    if (!extensionAlive()) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(msg, resp => {
          void chrome.runtime.lastError; // swallow async context errors
          resolve(resp ?? null);
        });
      } catch (e) {
        resolve(null); // synchronous "context invalidated"
      }
    });
  }

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
    // Redesigned overview (2026): reminders are <a class="test-requested-action-*">
    // links inside "Viktiga påminnelser", each containing "<count> <label>" text.
    const actions = [];
    document.querySelectorAll('a[class*="test-requested-action"]').forEach(link => {
      const text = link.textContent.trim();
      const countMatch = text.match(/(\d+)/);
      const count = countMatch ? parseInt(countMatch[1]) : 0;
      const label = text.replace(/^\D*\d+\s*/, '').trim();
      const href = link.getAttribute('href');
      if (!label) return;
      actions.push({ count, label, href });
    });
    return actions;
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

  async function renderKPICards() {
    const actions = scrapeRequestedActions();

    // ── Row 1: Action items (from Auctionet "Viktiga påminnelser" alerts) ──
    // Note: the sidebar count cards were removed in the 2026 redesign — the new
    // left nav (.site-menu) no longer exposes per-section counts to scrape.
    const actionCards = [];

    actions.forEach(a => {
      let color = 'blue', icon = 'fas fa-bell';
      if (/reklamation|ångerrätt/i.test(a.label)) { color = 'red'; icon = 'fas fa-reply'; }
      else if (/värdering/i.test(a.label)) { color = 'orange'; icon = 'fas fa-balance-scale'; }
      else if (/export/i.test(a.label)) { color = 'yellow'; icon = 'fas fa-globe'; }
      else if (/omlist/i.test(a.label)) { color = 'yellow'; icon = 'fas fa-redo'; }
      actionCards.push({ ...a, color, icon });
    });

    // ── Row 2: Insight cards (daily stats, comments, reklamation tracking) ──
    const insightCards = [];

    // Daily registration count
    const dailyStats = scrapeDailyGoal();
    if (dailyStats) {
      const sekLabel = dailyStats.sek > 0 ? ` · ${formatSEK(dailyStats.sek)} SEK` : '';
      insightCards.push({
        count: dailyStats.current,
        label: `Inskrivet idag${sekLabel}`,
        href: '#',
        color: 'green',
        icon: 'fas fa-pen'
      });
    }

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

    // High-value items with issues (from publication scan cache)
    try {
      const scanCache = await new Promise(resolve => {
        chrome.storage.local.get(PUB_SCAN_CACHE_KEY, r => resolve(r[PUB_SCAN_CACHE_KEY]));
      });
      if (scanCache && scanCache.highValueWithIssues > 0) {
        insightCards.push({
          count: scanCache.highValueWithIssues,
          label: 'Högvärde med fel',
          href: '#ext-pubscan',
          color: 'purple',
          icon: 'fas fa-gem'
        });
      }
    } catch (e) { /* no scan cache */ }

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

    // Insert at the top of the overview content. The legacy .requested-actions
    // container no longer exists (2026 redesign moved reminders into
    // "Viktiga påminnelser"), so anchor to the first heading inside .view and
    // place our cards above it. Native reminders are left in place.
    const view = document.querySelector('.view');
    const firstHeading = view ? view.querySelector('h2') : null;
    if (firstHeading && firstHeading.parentNode) {
      firstHeading.parentNode.insertBefore(container, firstHeading);
    } else if (view) {
      view.insertBefore(container, view.firstChild);
    }
  }

  // Daily registration count is rendered inline within renderKPICards
  // (via scrapeDailyGoal). The former Pipeline Funnel, Cataloger Leaderboard,
  // Pricing Insights and Inventory Health widgets were removed in the 2026
  // Auctionet redesign — their on-page data sources no longer exist; those
  // metrics now live in Auctionet's own "Datainsikter" Metabase embed.

  // ─── 2. Dashboard API: Fixed Sidebar ──────────────────────────────

  function fmtMSEK(n) { return (n / 1000000).toFixed(1).replace('.', ',') + 'M'; }

  function sidebarSparkline(values, width = 160, height = 28, formatFn) {
    if (!values || values.length < 2) return '';
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const topPad = 14; // Room for tooltip text above the line
    const botPad = 3;
    const totalH = height + topPad;
    const fmt = formatFn || (v => formatSEK(Math.round(v)));

    const coords = values.map((v, i) => ({
      x: (i / (values.length - 1)) * width,
      y: totalH - ((v - min) / range) * (height - botPad) - botPad,
      val: v
    }));

    const polyline = coords.map(c => `${c.x},${c.y}`).join(' ');

    const hoverPoints = coords.map((c) => {
      const anchor = c.x < 30 ? 'start' : c.x > width - 30 ? 'end' : 'middle';
      return `
        <circle cx="${c.x}" cy="${c.y}" r="10" fill="transparent" class="ext-sb__spark-hit"/>
        <circle cx="${c.x}" cy="${c.y}" r="0" fill="#006ccc" class="ext-sb__spark-dot"/>
        <text x="${c.x}" y="${c.y - 6}" text-anchor="${anchor}" class="ext-sb__spark-tip">${fmt(c.val)}</text>
      `;
    }).join('');

    return `<svg class="ext-sb__spark" viewBox="0 0 ${width} ${totalH}" width="${width}" height="${totalH}" style="overflow:visible">
      <polyline points="${polyline}" fill="none" stroke="#006ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${coords[coords.length-1].x}" cy="${coords[coords.length-1].y}" r="2.5" fill="#006ccc"/>
      ${hoverPoints}
    </svg>`;
  }

  function buildSidebarHTML(data, dashboardAPI) {
    const h = data.hammered;
    const a = data.auctions;
    const n = data.newItems;
    const s = data.sharedSessions;
    const shared = data.sharedSearches || [];
    const company = data.sasEmployeesSearches || [];

    let html = '';

    // ── Header ──
    html += `
      <div class="ext-sb__header">
        <span class="ext-sb__title">Live</span>
        <button class="ext-sb__toggle" title="Dölj">&#x25B6;</button>
      </div>
    `;

    // ── Hero KPIs ──
    if (h) {
      html += `<div class="ext-sb__section">`;
      if (h.r12) html += `
        <div class="ext-sb__kpi">
          <span class="ext-sb__kpi-label">R12</span>
          <span class="ext-sb__kpi-value">${fmtMSEK(h.r12)}</span>
        </div>`;
      if (h.ytd) html += `
        <div class="ext-sb__kpi">
          <span class="ext-sb__kpi-label">YTD</span>
          <span class="ext-sb__kpi-value">${fmtMSEK(h.ytd)}</span>
        </div>`;
      html += `</div>`;
    }

    // ── Sessions ──
    if (s?.buyers) {
      html += `
        <div class="ext-sb__section">
          <div class="ext-sb__sessions">
            <span class="ext-da-pulse"></span>
            <span class="ext-sb__kpi-value">${s.buyers.toLocaleString('sv-SE')}</span>
            <span class="ext-sb__kpi-label">köpare</span>
          </div>
          <div class="ext-sb__sub">${s.employees || 0} anställda online</div>
        </div>
      `;
    }

    // ── Sparklines ──
    if (h) {
      html += `<div class="ext-sb__section">`;
      if (h.average_price_by_day_last_week) {
        html += `
          <div class="ext-sb__spark-row">
            <div class="ext-sb__spark-label">Snittpris 7d</div>
            ${sidebarSparkline(h.average_price_by_day_last_week, 160, 28, v => formatSEK(Math.round(v)) + ' kr')}
            <div class="ext-sb__spark-value">${formatSEK(h.average_price_today || 0)} SEK</div>
          </div>`;
      }
      if (a?.published_by_week) {
        html += `
          <div class="ext-sb__spark-row">
            <div class="ext-sb__spark-label">Publicering 12v</div>
            ${sidebarSparkline(a.published_by_week, 160, 28, v => Math.round(v) + ' st')}
            <div class="ext-sb__spark-value">${a.published_last_seven_days_average || 0}/dag</div>
          </div>`;
      }
      if (n?.new_items_by_week) {
        html += `
          <div class="ext-sb__spark-row">
            <div class="ext-sb__spark-label">Inleverans 12v</div>
            ${sidebarSparkline(n.new_items_by_week, 160, 28, v => Math.round(v) + ' st')}
            <div class="ext-sb__spark-value">${n.work_day_average || 0}/dag</div>
          </div>`;
      }
      if (h.sum_by_week) {
        html += `
          <div class="ext-sb__spark-row">
            <div class="ext-sb__spark-label">Omsättning 12v</div>
            ${sidebarSparkline(h.sum_by_week, 160, 28, v => formatSEK(Math.round(v)) + ' kr')}
            <div class="ext-sb__spark-value">${formatSEK(h.last_seven_days_average || 0)}/dag</div>
          </div>`;
      }
      html += `</div>`;
    }

    // ── Pipeline health pills ──
    const pipeline = dashboardAPI.computePipelineHealth(data);
    const reserve = dashboardAPI.computeReserveCoverage(data);
    const balance = dashboardAPI.computeIntakeOutputBalance(data);

    if (pipeline) {
      const relistCls = pipeline.relistRatio < 20 ? 'green' : pipeline.relistRatio < 35 ? 'amber' : 'red';
      const reserveCls = reserve && reserve.rate > 40 ? 'green' : reserve && reserve.rate > 20 ? 'amber' : 'red';
      const balanceCls = !balance ? 'muted' : balance.status === 'balanced' ? 'green' : balance.status === 'growing' ? 'amber' : 'blue';
      const balanceText = !balance ? '—' : balance.status === 'growing' ? `+${pipeline.backlogGrowth}/dag` : balance.status === 'shrinking' ? `${pipeline.backlogGrowth}/dag` : 'Balanserad';

      html += `
        <div class="ext-sb__section">
          <div class="ext-sb__section-title">PIPELINE</div>
          <div class="ext-sb__pills">
            <span class="ext-sb__pill ext-sb__pill--${relistCls}">${pipeline.relistRatio}% omlistat</span>
            ${reserve ? `<span class="ext-sb__pill ext-sb__pill--${reserveCls}">${reserve.rate}% reserv</span>` : ''}
            <span class="ext-sb__pill ext-sb__pill--${balanceCls}">${balanceText}</span>
          </div>
        </div>
      `;
    }

    // ── Live searches ──
    const allSearches = [...shared, ...company];
    if (allSearches.length > 0) {
      const zeroResults = allSearches.filter(s => s.count === 0 && !s.ended);
      const activeSearches = allSearches.filter(s => s.count > 0 && !s.ended).sort((a, b) => b.count - a.count).slice(0, 8);

      let searchItems = '';

      if (zeroResults.length > 0) {
        searchItems += `<div class="ext-sb__search-group">Nollresultat</div>`;
        for (const s of zeroResults.slice(0, 5)) {
          searchItems += `<div class="ext-sb__search ext-sb__search--zero">${escapeHTML(s.query)}<span>0</span></div>`;
        }
      }

      if (activeSearches.length > 0) {
        searchItems += `<div class="ext-sb__search-group">Populärt</div>`;
        for (const s of activeSearches) {
          searchItems += `<div class="ext-sb__search">${escapeHTML(s.query)}<span>${s.count.toLocaleString('sv-SE')}</span></div>`;
        }
      }

      if (searchItems) {
        html += `
          <div class="ext-sb__section ext-sb__section--scroll">
            <div class="ext-sb__section-title">SÖKNINGAR</div>
            <div class="ext-sb__searches">${searchItems}</div>
          </div>
        `;
      }
    }

    // ── Footer ──
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    html += `<div class="ext-sb__footer">Uppdaterad ${timeStr}</div>`;

    return html;
  }

  function createDashboardSidebar(data, dashboardAPI) {
    const sidebar = document.createElement('aside');
    sidebar.className = 'ext-sb';
    sidebar.id = 'ext-dashboard-sidebar';
    sidebar.innerHTML = buildSidebarHTML(data, dashboardAPI);
    document.body.appendChild(sidebar);

    // Reserve space on the right for the panel
    document.body.classList.add('ext-has-sidebar');

    // Restore collapsed state. Panel is right-anchored: collapsed shows ◀
    // ("show"), expanded shows ▶ ("hide → slide off the right edge").
    chrome.storage.sync.get('sidebarCollapsed', (result) => {
      if (result.sidebarCollapsed) {
        sidebar.classList.add('ext-sb--collapsed');
        document.body.classList.add('ext-sidebar-collapsed');
        const btn = sidebar.querySelector('.ext-sb__toggle');
        if (btn) btn.innerHTML = '&#x25C0;';
      }
    });

    // Toggle handler
    sidebar.addEventListener('click', (e) => {
      const btn = e.target.closest('.ext-sb__toggle');
      if (!btn) return;

      const isCollapsed = sidebar.classList.toggle('ext-sb--collapsed');
      document.body.classList.toggle('ext-sidebar-collapsed', isCollapsed);
      btn.innerHTML = isCollapsed ? '&#x25C0;' : '&#x25B6;';
      chrome.storage.sync.set({ sidebarCollapsed: isCollapsed });
    });
  }

  function refreshSidebarContent(data, dashboardAPI) {
    const sidebar = document.getElementById('ext-dashboard-sidebar');
    if (!sidebar) return;
    // Preserve collapsed state
    const isCollapsed = sidebar.classList.contains('ext-sb--collapsed');
    sidebar.innerHTML = buildSidebarHTML(data, dashboardAPI);
    if (isCollapsed) {
      sidebar.classList.add('ext-sb--collapsed');
      const btn = sidebar.querySelector('.ext-sb__toggle');
      if (btn) btn.innerHTML = '&#x25C0;'; // collapsed on the right → ◀ "show"
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

  // ─── 8. Publication Queue Scanner ────────────────────────────────

  // Scan logic runs in background service worker (publication-scanner-bg.js).
  // Dashboard only reads cached results and renders them.
  const PUB_SCAN_CACHE_KEY = 'publicationScanResults';
  const PUB_SCAN_IGNORED_KEY = 'publicationScanIgnored'; // { itemId: true }
  const PUB_SCAN_STICKY_KEY = 'publicationScanStickyErrors';
  const PUB_SCAN_LOCAL_WHITELIST_KEY = 'pubScanLocalWhitelist'; // { word: true } — instant local mirror of confirmed words
  const PUB_SCAN_HIGH_VALUE_THRESHOLD = 3000; // SEK — items at or above this estimate are "high value"

  function getPublicationInsertTarget() {
    return document.querySelector('.ext-warehouse')
      || document.querySelector('.ext-inventory')
      || document.querySelector('.ext-pipeline')
      || document.getElementById('statistics');
  }

  function escapeHTML(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function truncateTitle(title, max) {
    if (!title) return '';
    // Strip leading item ID like "4901772. "
    const clean = title.replace(/^\d+\.\s*/, '');
    if (clean.length <= max) return clean;
    return clean.substring(0, max) + '...';
  }

  function relativeTimeFromISO(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'just nu';
    if (diffMins < 60) return `${diffMins} min sedan`;
    if (diffHours < 24) return `${diffHours} tim sedan`;
    const timeStr = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) + ' ' + timeStr;
  }

  function renderPublicationLoading(progressText) {
    let container = document.querySelector('.ext-pubscan');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ext-pubscan ext-animate-in';
      const target = getPublicationInsertTarget();
      if (target) target.parentNode.insertBefore(container, target.nextSibling);
      else return;
    }
    container.innerHTML = `
      <div class="ext-pubscan__card">
        <div class="ext-pubscan__header">
          <span class="ext-pubscan__title">📋 Publiceringskontroll</span>
        </div>
        <div class="ext-pubscan__loading">
          <div class="ext-pubscan__spinner"></div>
          <span>${escapeHTML(progressText || 'Skannar...')}</span>
        </div>
      </div>
    `;
  }

  function renderPublicationEmpty() {
    let container = document.querySelector('.ext-pubscan');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ext-pubscan ext-animate-in';
      const target = getPublicationInsertTarget();
      if (target) target.parentNode.insertBefore(container, target.nextSibling);
      else return;
    }
    container.innerHTML = `
      <div class="ext-pubscan__card">
        <div class="ext-pubscan__header">
          <span class="ext-pubscan__title">📋 Publiceringskontroll</span>
          <button class="ext-pubscan__run" title="Kör skanning">Kör nu ↻</button>
        </div>
        <div class="ext-pubscan__body">
          <div class="ext-pubscan__empty">Klicka på Kör nu för att skanna</div>
        </div>
      </div>
    `;
    container.querySelector('.ext-pubscan__run')?.addEventListener('click', () => triggerPublicationScan());
  }

  async function renderPublicationResults(data) {
    let container = document.querySelector('.ext-pubscan');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ext-pubscan ext-animate-in';
      container.id = 'ext-pubscan';
      const target = getPublicationInsertTarget();
      if (target) target.parentNode.insertBefore(container, target.nextSibling);
      else return;
    }

    // Load ignored items set (L1: local + L2: Supabase shared)
    let ignoredItems = {};
    try {
      const stored = await new Promise(resolve => chrome.storage.local.get(PUB_SCAN_IGNORED_KEY, r => resolve(r[PUB_SCAN_IGNORED_KEY])));
      if (stored) ignoredItems = stored;
    } catch (e) { /* no ignored items */ }
    // Merge with shared ignored list (Cloudflare Worker; returns a flat array of item_ids)
    try {
      const resp = await safeSendMessage({ type: 'spellcheck-fetch', method: 'GET', path: '/ignored' });
      const sharedIgnored = resp?.success ? resp.data : [];
      if (Array.isArray(sharedIgnored)) {
        let merged = false;
        for (const id of sharedIgnored) {
          if (!ignoredItems[id]) { ignoredItems[id] = true; merged = true; }
        }
        if (merged) await new Promise(resolve => chrome.storage.local.set({ [PUB_SCAN_IGNORED_KEY]: ignoredItems }, resolve));
      }
    } catch (e) { /* backend not configured — use local only */ }

    // Separate ignored from active
    const activeCritical = (data.critical || []).filter(item => !ignoredItems[item.itemId]);
    const activeWarnings = (data.warnings || []).filter(item => !ignoredItems[item.itemId]);
    const ignoredCritical = (data.critical || []).filter(item => ignoredItems[item.itemId]);
    const ignoredWarnings = (data.warnings || []).filter(item => ignoredItems[item.itemId]);
    const ignoredCount = ignoredCritical.length + ignoredWarnings.length;

    const passedCount = (data.passed || 0);
    const timeStr = new Date(data.scannedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const relTime = relativeTimeFromISO(data.scannedAt);

    // Build unified groups: group ALL active items by each issue string, using per-issue severity
    // Deduplicate: an item can appear in both activeCritical and activeWarnings, so dedupe by itemId
    const seenItemIds = new Set();
    const allItemsWithIssues = [...activeCritical, ...activeWarnings].filter(item => {
      if (seenItemIds.has(item.itemId)) return false;
      seenItemIds.add(item.itemId);
      return true;
    });
    const issueGroups = {}; // { issueText: { severity: 'critical'|'warning', items: [] } }
    allItemsWithIssues.forEach(item => {
      item.issues.forEach(issue => {
        const isSpell = issue && typeof issue === 'object' && Array.isArray(issue.spellWords);
        // Group ALL spelling issues under one "Stavfel" header (each item has a
        // different word combo, so grouping by the full text would make every
        // item its own singleton group). Per-word chips live on the inner rows.
        const issueText = isSpell ? 'Stavfel' : (typeof issue === 'string' ? issue : issue.text);
        const issueSeverity = typeof issue === 'string' ? item.severity : issue.severity;
        if (!issueGroups[issueText]) issueGroups[issueText] = { severity: issueSeverity, items: [] };
        issueGroups[issueText].items.push(item);
      });
    });

    // Derive header counts from groups so they match what the user sees
    const criticalItemIds = new Set();
    const warningItemIds = new Set();
    Object.values(issueGroups).forEach(group => {
      const idSet = group.severity === 'critical' ? criticalItemIds : warningItemIds;
      group.items.forEach(item => idSet.add(item.itemId));
    });
    // Items in both critical and warning groups count as critical only
    warningItemIds.forEach(id => { if (criticalItemIds.has(id)) warningItemIds.delete(id); });
    const criticalCount = criticalItemIds.size;
    const warningCount = warningItemIds.size;
    const allGood = criticalCount === 0 && warningCount === 0;

    // Helper to render a single issue row
    function issueRowHTML(item, cssModifier, showIgnore = true) {
      const showHref = item.showUrl || (item.editUrl ? item.editUrl.replace(/\/edit$/, '') : '');
      // Separate spelling errors (per-word actionable) from other issues (text only).
      const spellWords = item.issues
        .flatMap(i => (i && typeof i === 'object' && Array.isArray(i.spellWords)) ? i.spellWords : []);
      const nonSpellLabels = item.issues
        .filter(i => !(i && typeof i === 'object' && Array.isArray(i.spellWords)))
        .map(i => typeof i === 'string' ? i : i.text)
        .join(' + ');

      // Per-word ✓ chips: confirming a word as correct whitelists ONLY that word,
      // leaving any real typos on the same item still flagged. De-dupe by word.
      const seenWords = new Set();
      const spellChips = spellWords.filter(sw => {
        const k = (sw.word || '').toLowerCase();
        if (!k || seenWords.has(k)) return false;
        seenWords.add(k); return true;
      }).map(sw => `
        <span class="ext-pubscan__spell-chip ext-pubscan__spell-ok" data-word="${escapeHTML(sw.word)}" data-confidence="${escapeHTML(sw.confidence || 'near-edit')}" data-item-id="${item.itemId}" data-tooltip="Rätt ord — lägg till i ordlistan" role="button" tabindex="0">
          <span class="ext-pubscan__spell-word">${escapeHTML(sw.word)}</span>
          <span class="ext-pubscan__spell-arrow">→</span>
          <span class="ext-pubscan__spell-sugg">${escapeHTML(sw.correction || '')}</span>
          <span class="ext-pubscan__spell-check">✓</span>
        </span>
      `).join('');
      const spellRow = spellChips
        ? `<div class="ext-pubscan__spell-chips" data-spell-words="${escapeHTML(JSON.stringify(spellWords))}">${spellChips}</div>`
        : '';

      const ignoreBtn = showIgnore
        ? `<span class="ext-pubscan__ignore-btn" data-item-id="${item.itemId}" title="Ignorera hela föremålet (lär inget)">✕</span>`
        : `<span class="ext-pubscan__unignore-btn" data-item-id="${item.itemId}" title="Sluta ignorera">↩</span>`;
      const estimateLabel = item.estimate >= PUB_SCAN_HIGH_VALUE_THRESHOLD
        ? `<span class="ext-pubscan__estimate">💎 ${formatSEK(item.estimate)} SEK</span>`
        : (item.estimate > 0 ? `<span class="ext-pubscan__estimate">${formatSEK(item.estimate)} SEK</span>` : '');
      // The non-spell label, or a generic "Stavfel" header when only spelling issues exist.
      const headerText = nonSpellLabels || (spellChips ? 'Stavfel' : '');
      return `
        <div class="ext-pubscan__issue-row" data-item-id="${item.itemId}">
          <a class="ext-pubscan__issue ext-pubscan__issue--${cssModifier}" href="${escapeHTML(showHref)}">
            <div class="ext-pubscan__issue-main">
              <span class="ext-pubscan__issue-text">${escapeHTML(headerText)}</span>
              ${estimateLabel}
              ${item.editUrl ? `<span class="ext-pubscan__edit-link" data-href="${escapeHTML(item.editUrl)}">Redigera →</span>` : ''}
            </div>
            <div class="ext-pubscan__issue-title">"${escapeHTML(truncateTitle(item.title, 40))}"</div>
          </a>
          ${ignoreBtn}
          ${spellRow}
        </div>
      `;
    }

    // Keywords insight (not an error, just info)
    const kwNote = (data.missingKeywords > 0)
      ? `<span class="ext-pubscan__stat ext-pubscan__stat--info">🔑 ${data.missingKeywords} utan sökord</span>`
      : '';

    // High-value items with issues
    const highValueItems = allItemsWithIssues.filter(item => item.estimate >= PUB_SCAN_HIGH_VALUE_THRESHOLD);
    const hvNote = highValueItems.length > 0
      ? `<span class="ext-pubscan__stat ext-pubscan__stat--highvalue">💎 ${highValueItems.length} högvärde med fel</span>`
      : '';

    // Build ignored items section (used in both allGood and issues branches)
    const ignoredHTML = ignoredCount > 0 ? `
      <div class="ext-pubscan__ignored-section">
        <div class="ext-pubscan__ignored-toggle">
          <span class="ext-pubscan__ignored-label">Visa ignorerade (${ignoredCount})</span>
          <span class="ext-pubscan__ignored-arrow">▼</span>
        </div>
        <div class="ext-pubscan__ignored-items" style="display: none;">
          ${[...ignoredCritical, ...ignoredWarnings].map(item => {
            const isCrit = ignoredCritical.includes(item);
            return issueRowHTML(item, isCrit ? 'critical' : 'warning', false);
          }).join('')}
        </div>
      </div>
    ` : '';

    let bodyHTML;
    if (allGood) {
      bodyHTML = `<div class="ext-pubscan__allgood">Allt ser bra ut ✅ ${kwNote}</div>${ignoredHTML}`;
    } else {
      // Build group rows — each is a clickable filter
      const groupEntries = Object.entries(issueGroups);
      // Sort: critical groups first, then warning groups
      groupEntries.sort((a, b) => {
        if (a[1].severity === b[1].severity) return 0;
        return a[1].severity === 'critical' ? -1 : 1;
      });

      // Build each group: header row + inline items (hidden by default)
      const groupsHTML = groupEntries.map(([issue, group], idx) => {
        const dot = group.severity === 'critical' ? '🔴' : '🟡';
        const cssModifier = group.severity === 'critical' ? 'critical' : 'warning';
        return `
          <div class="ext-pubscan__filter-group">
            <div class="ext-pubscan__filter-row" data-group-idx="${idx}">
              <span class="ext-pubscan__filter-dot">${dot}</span>
              <span class="ext-pubscan__filter-label">${escapeHTML(issue)}</span>
              <span class="ext-pubscan__filter-count">(${group.items.length})</span>
              <span class="ext-pubscan__filter-arrow">▼</span>
            </div>
            <div class="ext-pubscan__filter-items" data-group-items="${idx}" style="display: none;">
              ${group.items.map(item => issueRowHTML(item, cssModifier)).join('')}
            </div>
          </div>
        `;
      }).join('');

      // "Visa alla" group at the top — uses deduplicated active items
      const allaHTML = `
        <div class="ext-pubscan__filter-group">
          <div class="ext-pubscan__filter-row ext-pubscan__filter-row--alla" data-group-idx="all">
            <span class="ext-pubscan__filter-dot">📋</span>
            <span class="ext-pubscan__filter-label">Visa alla</span>
            <span class="ext-pubscan__filter-count">(${allItemsWithIssues.length})</span>
            <span class="ext-pubscan__filter-arrow">▼</span>
          </div>
          <div class="ext-pubscan__filter-items" data-group-items="all" style="display: none;">
            ${allItemsWithIssues.map(item => {
              const isCritical = criticalItemIds.has(item.itemId);
              return issueRowHTML(item, isCritical ? 'critical' : 'warning');
            }).join('')}
          </div>
        </div>
      `;

      // "Högvärde" group — high-value items with issues, sorted by estimate descending
      const hvGroupHTML = highValueItems.length > 0 ? (() => {
        const sorted = [...highValueItems].sort((a, b) => (b.estimate || 0) - (a.estimate || 0));
        return `
          <div class="ext-pubscan__filter-group">
            <div class="ext-pubscan__filter-row ext-pubscan__filter-row--highvalue" data-group-idx="highvalue">
              <span class="ext-pubscan__filter-dot">💎</span>
              <span class="ext-pubscan__filter-label">Högvärde (≥ ${formatSEK(PUB_SCAN_HIGH_VALUE_THRESHOLD)} SEK) med fel</span>
              <span class="ext-pubscan__filter-count">(${highValueItems.length})</span>
              <span class="ext-pubscan__filter-arrow">▼</span>
            </div>
            <div class="ext-pubscan__filter-items" data-group-items="highvalue" style="display: none;">
              ${sorted.map(item => {
                const isCritical = criticalItemIds.has(item.itemId);
                return issueRowHTML(item, isCritical ? 'critical' : 'warning');
              }).join('')}
            </div>
          </div>
        `;
      })() : '';

      bodyHTML = `
        <div class="ext-pubscan__summary">
          ${criticalCount > 0 ? `<span class="ext-pubscan__stat ext-pubscan__stat--critical">🔴 ${criticalCount} kritiska</span>` : ''}
          ${warningCount > 0 ? `<span class="ext-pubscan__stat ext-pubscan__stat--warning">🟡 ${warningCount} varningar</span>` : ''}
          <span class="ext-pubscan__stat ext-pubscan__stat--passed">✅ ${passedCount} OK</span>
          ${kwNote}
          ${hvNote}
        </div>
        <div class="ext-pubscan__filters">
          ${allaHTML}
          ${hvGroupHTML}
          ${groupsHTML}
        </div>
        ${ignoredHTML}
      `;
    }

    // Load sticky errors (published items with unresolved spelling errors)
    let stickyErrors = {};
    try {
      const stored = await new Promise(resolve => chrome.storage.local.get(PUB_SCAN_STICKY_KEY, r => resolve(r[PUB_SCAN_STICKY_KEY])));
      if (stored) stickyErrors = stored;
    } catch (e) { /* no sticky errors */ }

    // Filter to only published items (not still in publishable queue) and not ignored
    const publishedSticky = Object.values(stickyErrors).filter(e => e.isPublished && !ignoredItems[e.itemId]);
    let stickyHTML = '';
    if (publishedSticky.length > 0) {
      // Sort by firstDetectedAt (newest first)
      publishedSticky.sort((a, b) => (b.firstDetectedAt || 0) - (a.firstDetectedAt || 0));
      const stickyRowsHTML = publishedSticky.map(entry => {
        const showHref = entry.showUrl || (entry.editUrl ? entry.editUrl.replace(/\/edit$/, '') : '');
        const issueLabels = entry.issues.map(i => typeof i === 'string' ? i : i.text).join(' + ');
        const publishedAgo = entry.publishedAt ? relativeTimeFromISO(new Date(entry.publishedAt).toISOString()) : '';
        const estimateLabel = entry.estimate >= PUB_SCAN_HIGH_VALUE_THRESHOLD
          ? `<span class="ext-pubscan__estimate">💎 ${formatSEK(entry.estimate)} SEK</span>`
          : (entry.estimate > 0 ? `<span class="ext-pubscan__estimate">${formatSEK(entry.estimate)} SEK</span>` : '');
        return `
          <div class="ext-pubscan__issue-row ext-pubscan__issue-row--sticky" data-item-id="${entry.itemId}">
            <a class="ext-pubscan__issue ext-pubscan__issue--critical" href="${escapeHTML(showHref)}">
              <div class="ext-pubscan__issue-main">
                <span class="ext-pubscan__issue-text">${escapeHTML(issueLabels)}</span>
                <span class="ext-pubscan__published-badge">Publicerad${publishedAgo ? ' ' + escapeHTML(publishedAgo) : ''}</span>
                ${estimateLabel}
                ${entry.editUrl ? `<span class="ext-pubscan__edit-link" data-href="${escapeHTML(entry.editUrl)}">Redigera \u2192</span>` : ''}
              </div>
              <div class="ext-pubscan__issue-title">"${escapeHTML(truncateTitle(entry.title, 40))}"</div>
            </a>
            <span class="ext-pubscan__ignore-btn ext-pubscan__ignore-btn--sticky" data-item-id="${entry.itemId}" data-sticky="true" title="Ignorera">✕</span>
          </div>
        `;
      }).join('');

      const lastChecked = publishedSticky.reduce((latest, e) => Math.max(latest, e.lastCheckedAt || 0), 0);
      const lastCheckedStr = lastChecked ? relativeTimeFromISO(new Date(lastChecked).toISOString()) : '';

      stickyHTML = `
        <div class="ext-pubscan__sticky-section">
          <div class="ext-pubscan__sticky-header">
            <span class="ext-pubscan__sticky-title">🔴 Publicerade med kvarst\u00e5ende stavfel (${publishedSticky.length})</span>
            ${lastCheckedStr ? `<span class="ext-pubscan__sticky-meta">Kontrollerad ${escapeHTML(lastCheckedStr)}</span>` : ''}
          </div>
          <div class="ext-pubscan__sticky-items">
            ${stickyRowsHTML}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="ext-pubscan__card">
        <div class="ext-pubscan__header">
          <div>
            <span class="ext-pubscan__title">📋 Publiceringskontroll</span>
            <div class="ext-pubscan__meta">
              Senast skannad: ${timeStr} (${relTime}) · ${data.totalItems} föremål granskade
            </div>
          </div>
          <button class="ext-pubscan__run" title="Kör skanning">Kör nu ↻</button>
        </div>
        <div class="ext-pubscan__body">
          ${bodyHTML}
          ${stickyHTML}
        </div>
      </div>
    `;

    // Highlight nav sidebar link based on scan results
    updatePublishableNavLink(criticalCount, warningCount);

    // Wire up button
    container.querySelector('.ext-pubscan__run')?.addEventListener('click', () => triggerPublicationScan());

    // Wire up "Redigera" links
    container.querySelectorAll('.ext-pubscan__edit-link[data-href]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = link.dataset.href;
      });
    });

    // Wire up filter group rows — click to expand/collapse inline
    container.querySelectorAll('.ext-pubscan__filter-row').forEach(row => {
      row.addEventListener('click', () => {
        const group = row.closest('.ext-pubscan__filter-group');
        const panel = group?.querySelector('.ext-pubscan__filter-items');
        if (!panel) return;

        const isVisible = panel.style.display !== 'none';

        // Close all other groups
        container.querySelectorAll('.ext-pubscan__filter-group').forEach(g => {
          const p = g.querySelector('.ext-pubscan__filter-items');
          const r = g.querySelector('.ext-pubscan__filter-row');
          if (p) p.style.display = 'none';
          if (r) {
            r.classList.remove('ext-pubscan__filter-row--active');
            const arrow = r.querySelector('.ext-pubscan__filter-arrow');
            if (arrow) arrow.textContent = '▼';
          }
        });

        // Toggle this group open (if it was closed)
        if (!isVisible) {
          panel.style.display = 'block';
          row.classList.add('ext-pubscan__filter-row--active');
          const arrow = row.querySelector('.ext-pubscan__filter-arrow');
          if (arrow) arrow.textContent = '▲';
        }
      });
    });

    // Wire up "Visa ignorerade" toggle
    const ignoredToggle = container.querySelector('.ext-pubscan__ignored-toggle');
    if (ignoredToggle) {
      ignoredToggle.addEventListener('click', () => {
        const items = container.querySelector('.ext-pubscan__ignored-items');
        const arrow = ignoredToggle.querySelector('.ext-pubscan__ignored-arrow');
        if (!items) return;
        const isVisible = items.style.display !== 'none';
        items.style.display = isVisible ? 'none' : 'block';
        if (arrow) arrow.textContent = isVisible ? '▼' : '▲';
      });
    }

    // Wire up per-word ✓ chips — confirm one word as correct → shared whitelist.
    // Only that word is whitelisted; other flags on the same item are untouched.
    const spellOkBtns = container.querySelectorAll('.ext-pubscan__spell-ok');
    spellOkBtns.forEach(btn => {
      const confirmWord = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const word = btn.dataset.word;
        if (!word || btn.dataset.done) return;
        btn.dataset.done = '1'; // guard against double-fire (click + keydown)
        const confidence = btn.dataset.confidence || 'near-edit';
        // Record locally too, so this browser stops flagging the word immediately
        // (the background whitelist refreshes on its own ~30-min cycle).
        try {
          const stored = await new Promise(resolve => chrome.storage.local.get(PUB_SCAN_LOCAL_WHITELIST_KEY, r => resolve(r[PUB_SCAN_LOCAL_WHITELIST_KEY])));
          const local = stored || {};
          local[word.toLowerCase()] = true;
          await new Promise(resolve => chrome.storage.local.set({ [PUB_SCAN_LOCAL_WHITELIST_KEY]: local }, resolve));
        } catch (e) { /* local cache optional */ }
        // Shared whitelist — Cloudflare Worker (fire-and-forget, confidence-tiered)
        safeSendMessage({ type: 'spellcheck-fetch', method: 'POST', path: '/whitelist', body: { word, confidence } });
        // Optimistic UI: drop this chip; if it was the last one on the row, fade the row.
        const chip = btn.closest('.ext-pubscan__spell-chip');
        const chipRow = btn.closest('.ext-pubscan__spell-chips');
        if (chip) chip.remove();
        if (chipRow && chipRow.querySelectorAll('.ext-pubscan__spell-chip').length === 0) {
          chipRow.remove();
        }
      };
      btn.addEventListener('click', confirmWord);
      // Keyboard accessibility: Enter/Space activates the chip too.
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') confirmWord(e);
      });
    });

    // Wire up ignore buttons (✕) — add item to ignored set and re-render
    container.querySelectorAll('.ext-pubscan__ignore-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const itemId = btn.dataset.itemId;
        if (!itemId) return;
        try {
          // Add to ignored set (L1: local)
          const stored = await new Promise(resolve => chrome.storage.local.get(PUB_SCAN_IGNORED_KEY, r => resolve(r[PUB_SCAN_IGNORED_KEY])));
          const ignored = stored || {};
          ignored[itemId] = true;
          await new Promise(resolve => chrome.storage.local.set({ [PUB_SCAN_IGNORED_KEY]: ignored }, resolve));
          // L2: Shared ignored list — Cloudflare Worker (fire-and-forget)
          // NB: item-level ignore silences the whole item but learns NOTHING —
          // a single valid word must never hide a real typo elsewhere on the
          // same item. Word learning is the per-word ✓ chip, handled separately.
          safeSendMessage({ type: 'spellcheck-fetch', method: 'POST', path: '/ignored', body: { item_id: parseInt(itemId) } });
          // Also remove from sticky errors if present
          if (btn.dataset.sticky) {
            const stickyStored = await new Promise(resolve => chrome.storage.local.get(PUB_SCAN_STICKY_KEY, r => resolve(r[PUB_SCAN_STICKY_KEY])));
            const sticky = stickyStored || {};
            delete sticky[itemId];
            await new Promise(resolve => chrome.storage.local.set({ [PUB_SCAN_STICKY_KEY]: sticky }, resolve));
          }
          // Re-render with same scan data
          await renderPublicationResults(data);
        } catch (err) {
          console.error('[AdminDashboard] Failed to ignore item:', err);
        }
      });
    });

    // Wire up unignore buttons (↩) — remove item from ignored set and re-render
    container.querySelectorAll('.ext-pubscan__unignore-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const itemId = btn.dataset.itemId;
        if (!itemId) return;
        try {
          const stored = await new Promise(resolve => chrome.storage.local.get(PUB_SCAN_IGNORED_KEY, r => resolve(r[PUB_SCAN_IGNORED_KEY])));
          const ignored = stored || {};
          delete ignored[itemId];
          await new Promise(resolve => chrome.storage.local.set({ [PUB_SCAN_IGNORED_KEY]: ignored }, resolve));
          // L2: Remove from shared ignored list — Cloudflare Worker (fire-and-forget)
          safeSendMessage({ type: 'spellcheck-fetch', method: 'DELETE', path: `/ignored?item_id=${encodeURIComponent(itemId)}` });
          // Re-render with same scan data
          await renderPublicationResults(data);
        } catch (err) {
          console.error('[AdminDashboard] Failed to unignore item:', err);
        }
      });
    });
  }

  // Highlight the "Publicerbara föremål" nav link red/green based on scan results
  function updatePublishableNavLink(criticalCount, warningCount) {
    const navLink = document.querySelector('a[href="/admin/sas/publishables"]');
    if (!navLink) return;

    // Remove any previous badge
    const oldBadge = navLink.querySelector('.ext-pubscan-nav-badge');
    if (oldBadge) oldBadge.remove();

    const hasCritical = criticalCount > 0;
    const hasWarnings = warningCount > 0;
    const icon = navLink.querySelector('i');

    // Remove previous scroll arrow
    const oldArrow = navLink.querySelector('.ext-pubscan-nav-arrow');
    if (oldArrow) oldArrow.remove();

    if (hasCritical || hasWarnings) {
      const issueColor = hasCritical ? '#dc3545' : '#e65100';
      navLink.style.color = issueColor;
      navLink.style.fontWeight = '600';
      if (icon) icon.style.color = issueColor;
      // Badge: critical shows count, warnings-only just a subtle nudge
      const badge = document.createElement('span');
      badge.className = 'ext-pubscan-nav-badge';
      badge.textContent = hasCritical ? ` (${criticalCount} 🔴)` : ' (⚠)';
      badge.style.cssText = `font-size: 11px; color: ${issueColor};`;
      navLink.appendChild(badge);
      // Scroll-down arrow to jump to scanner panel
      const arrow = document.createElement('span');
      arrow.className = 'ext-pubscan-nav-arrow';
      arrow.textContent = ' ↓';
      arrow.title = 'Visa publiceringskontroll';
      arrow.style.cssText = 'cursor: pointer; font-size: 14px; color: #006ccc; font-weight: 900; text-decoration: none;';
      arrow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const scrollToPanel = () => {
          const panel = document.querySelector('.ext-pubscan');
          if (!panel) return;
          const y = panel.getBoundingClientRect().top + window.scrollY - 20;
          window.scrollTo({ top: y, behavior: 'smooth' });
        };
        scrollToPanel();
        setTimeout(scrollToPanel, 500);
        setTimeout(scrollToPanel, 1200);
      });
      navLink.appendChild(arrow);
    } else {
      navLink.style.color = '';
      navLink.style.fontWeight = '';
      if (icon) icon.style.color = '';
    }
  }

  // ─── Publication Scanner: trigger & init ──────────────────────

  function triggerPublicationScan() {
    // If results are already showing, keep them visible and just add an inline spinner
    const header = document.querySelector('.ext-pubscan__header');
    const runBtn = header?.querySelector('.ext-pubscan__run');
    if (runBtn && !header.querySelector('.ext-pubscan__inline-progress')) {
      runBtn.disabled = true;
      runBtn.style.opacity = '0.5';
      const progress = document.createElement('span');
      progress.className = 'ext-pubscan__inline-progress';
      progress.innerHTML = '<span class="ext-pubscan__spinner"></span> Skannar...';
      header.insertBefore(progress, runBtn);
    } else if (!header) {
      // No results yet — show the full loading screen
      renderPublicationLoading('Startar skanning...');
    }
    safeSendMessage({ type: 'run-publication-scan' });
  }

  async function initPublicationScanner() {
    try {
      const cached = await new Promise(resolve => {
        chrome.storage.local.get(PUB_SCAN_CACHE_KEY, r => resolve(r[PUB_SCAN_CACHE_KEY]));
      });
      if (cached && cached._version === 7) {
        await renderPublicationResults(cached);
      } else {
        // Cache missing or from older version — discard and show empty
        if (cached) chrome.storage.local.remove(PUB_SCAN_CACHE_KEY);
        renderPublicationEmpty();
      }
    } catch (e) {
      console.error('[AdminDashboard] Publication scanner init failed:', e);
      renderPublicationEmpty();
    }
  }

  // Listen for background scan completion or failure — reload cache and re-render
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'publication-scan-complete' || message.type === 'publication-scan-failed' || message.type === 'sticky-recheck-complete') {
      (async () => {
        try {
          const cached = await new Promise(resolve =>
            chrome.storage.local.get(PUB_SCAN_CACHE_KEY, r => resolve(r[PUB_SCAN_CACHE_KEY]))
          );
          if (cached && cached._version === 7) {
            await renderPublicationResults(cached);
          } else {
            renderPublicationEmpty();
          }
        } catch (e) {
          console.error('[AdminDashboard] Failed to render after scan:', e);
          renderPublicationEmpty();
        }
      })();
    }
  });

  // Listen for scan progress updates from background service worker
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!extensionAlive()) return; // stale context after extension reload
    if (area === 'local' && changes.publicationScanProgress) {
      const progress = changes.publicationScanProgress.newValue;
      if (progress) {
        // Update inline progress if results are visible, otherwise full loading screen
        const inlineProgress = document.querySelector('.ext-pubscan__inline-progress');
        if (inlineProgress) {
          inlineProgress.innerHTML = `<span class="ext-pubscan__spinner"></span> ${escapeHTML(progress)}`;
        } else {
          renderPublicationLoading(progress);
        }
      }
    }
  });

  // Auto-rescan when tab becomes visible after being idle for 10+ minutes
  let pubScanLastVisible = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const idleMinutes = (Date.now() - pubScanLastVisible) / 60000;
      if (idleMinutes >= 10) {
        safeSendMessage({ type: 'run-publication-scan' });
      }
    }
    pubScanLastVisible = Date.now();
  });

  // ─── 9. Warehouse Cost Widget ────────────────────────────────────

  const WAREHOUSE_CACHE_KEY = 'warehouseCostCache';
  const WAREHOUSE_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
  const WAREHOUSE_FEE_PER_DAY = 100; // SEK

  async function fetchWarehouseCosts() {
    // Check cache first
    try {
      const cached = await new Promise(resolve => {
        chrome.storage.local.get(WAREHOUSE_CACHE_KEY, r => resolve(r[WAREHOUSE_CACHE_KEY]));
      });
      if (cached && (Date.now() - cached.timestamp) < WAREHOUSE_CACHE_TTL) {
        renderWarehouseCosts(cached, true);
        return;
      }
    } catch (e) { /* no cache, fetch fresh */ }

    // Show loading state
    renderWarehouseLoading();

    try {
      const result = await fetchSoldsPages('to_be_collected');

      const data = {
        timestamp: Date.now(),
        items: result.items,
        totalItems: result.totalItems,
        totalDays: result.totalDays
      };

      // Cache results
      chrome.storage.local.set({ [WAREHOUSE_CACHE_KEY]: data });
      renderWarehouseCosts(data, false);
    } catch (error) {
      console.error('[AdminDashboard] Warehouse cost fetch failed:', error);
      renderWarehouseError(error.message);
    }
  }

  async function fetchSoldsPages(filter) {
    const baseUrl = `/admin/sas/solds?filter=${filter}`;
    const firstPageHtml = await fetchPageHtml(baseUrl);

    const totalPages = detectTotalPages(firstPageHtml);

    // Parse first page
    const items = parseWarehouseTable(firstPageHtml);

    // Fetch remaining pages concurrently (batches of 5)
    if (totalPages > 1) {
      const pageNumbers = [];
      for (let p = 2; p <= totalPages; p++) pageNumbers.push(p);

      const batchSize = 5;
      for (let i = 0; i < pageNumbers.length; i += batchSize) {
        const batch = pageNumbers.slice(i, i + batchSize);
        const pages = await Promise.all(
          batch.map(p => fetchPageHtml(`${baseUrl}&page=${p}`))
        );
        pages.forEach(html => items.push(...parseWarehouseTable(html)));
      }
    }

    const totalDays = items.reduce((sum, item) => sum + item.auctionHouseDays, 0);
    return { totalItems: items.length, totalDays, items };
  }

  function detectTotalPages(html) {
    // Strategy 1: "Visar resultat 1 - 30 av 337" (handles &nbsp; as \u00a0)
    const normalized = html.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ');
    const resultMatch = normalized.match(/Visar resultat\s+\d+\s*[-–]\s*\d+\s+av\s+(\d[\d\s]*)/i);
    if (resultMatch) {
      const total = parseInt(resultMatch[1].replace(/\s/g, ''));
      if (total > 0) return Math.ceil(total / 30);
    }

    // Strategy 2: find highest page number in pagination links
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    let maxPage = 1;
    doc.querySelectorAll('a[href*="page="]').forEach(a => {
      const m = a.getAttribute('href').match(/page=(\d+)/);
      if (m) maxPage = Math.max(maxPage, parseInt(m[1]));
    });
    if (maxPage > 1) return maxPage;

    // Strategy 3: look for .pagination links with page numbers
    doc.querySelectorAll('.pagination a, .pagination span, nav a').forEach(el => {
      const num = parseInt(el.textContent.trim());
      if (!isNaN(num) && num > maxPage) maxPage = num;
    });

    return maxPage;
  }

  async function fetchPageHtml(url) {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  }

  function parseWarehouseTable(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return [];

    // Auto-detect column indices from table headers
    let daysColIdx = -1;
    let sluttidColIdx = -1;
    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, i) => {
      const text = th.textContent.trim().toLowerCase();
      if (text.includes('lagerdagar')) daysColIdx = i;
      if (text.includes('sluttid')) sluttidColIdx = i;
    });

    // Fallback: scan all cells for the "NN / NN" pattern if header detection failed
    const rows = table.querySelectorAll('tbody tr');
    if (daysColIdx === -1 && rows.length > 0) {
      const firstRowCells = rows[0].querySelectorAll('td');
      for (let i = 0; i < firstRowCells.length; i++) {
        if (/\d+\s*\/\s*\d+/.test(firstRowCells[i].textContent.trim())) {
          daysColIdx = i;
          break;
        }
      }
    }

    const items = [];
    rows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) return;

      const titleLink = tr.querySelector('a[href*="/items/"]');
      const title = titleLink ? titleLink.textContent.trim() : '';
      const url = titleLink ? titleLink.getAttribute('href') : '';

      // Warehouse days from detected column
      let auctionHouseDays = 0;
      if (daysColIdx >= 0 && cells[daysColIdx]) {
        const daysText = cells[daysColIdx].textContent.trim();
        const daysMatch = daysText.match(/(\d+)\s*\/\s*(\d+)/);
        if (daysMatch) auctionHouseDays = parseInt(daysMatch[1]);
      }

      // Sluttid (auction end date) from detected column
      let endDate = null;
      if (sluttidColIdx >= 0 && cells[sluttidColIdx]) {
        endDate = parseSwedishDate(cells[sluttidColIdx].textContent.trim());
      }

      let buyer = '';
      cells.forEach(cell => {
        const buyerLink = cell.querySelector('a[href*="/buyers/"]');
        if (buyerLink) buyer = buyerLink.textContent.trim();
      });

      items.push({ title, url, buyer, auctionHouseDays, endDate: endDate ? endDate.getTime() : null });
    });

    return items;
  }

  function parseSwedishDate(text) {
    // Handles "20 feb 2026 13:52" or "20 feb 2026 kl. 13:52" etc.
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };
    const m = text.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
    if (!m) return null;
    const monthIdx = months[m[2].toLowerCase()];
    if (monthIdx === undefined) return null;
    return new Date(parseInt(m[3]), monthIdx, parseInt(m[1]));
  }

  function getWarehouseInsertTarget() {
    return document.querySelector('.ext-inventory')
      || document.querySelector('.ext-pipeline')
      || document.getElementById('statistics');
  }

  function renderWarehouseLoading() {
    let container = document.querySelector('.ext-warehouse');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ext-warehouse ext-animate-in';
      const target = getWarehouseInsertTarget();
      if (target) target.parentNode.insertBefore(container, target.nextSibling);
      else return;
    }
    container.innerHTML = `
      <div class="ext-warehouse__loading">
        <div class="ext-warehouse__spinner"></div>
        <span>Hämtar lagerkostnader...</span>
      </div>
    `;
  }

  function renderWarehouseError(message) {
    const container = document.querySelector('.ext-warehouse');
    if (!container) return;
    container.innerHTML = `
      <div class="ext-warehouse__error">
        Kunde inte hämta data: ${escHTML(message)}
        <button class="ext-warehouse__retry" onclick="this.closest('.ext-warehouse').remove()">Försök igen</button>
      </div>
    `;
  }

  function renderWarehouseCosts(data, fromCache) {
    const allItems = data.items;
    const now = Date.now();
    const MS_PER_DAY = 86400000;

    function bucketStats(items) {
      const days = items.reduce((s, i) => s + i.auctionHouseDays, 0);
      return { count: items.length, days, cost: days * WAREHOUSE_FEE_PER_DAY };
    }

    const items30d = allItems.filter(i => i.endDate && (now - i.endDate) <= 30 * MS_PER_DAY);
    const items90d = allItems.filter(i => i.endDate && (now - i.endDate) <= 90 * MS_PER_DAY);

    const bucket30 = bucketStats(items30d);
    const bucket90 = bucketStats(items90d);
    const bucketAll = bucketStats(allItems);

    const cacheTime = new Date(data.timestamp);
    const timeStr = cacheTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const dateStr = cacheTime.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

    let container = document.querySelector('.ext-warehouse');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ext-warehouse ext-animate-in';
      const target = getWarehouseInsertTarget();
      if (target) target.parentNode.insertBefore(container, target.nextSibling);
      else return;
    }

    container.innerHTML = `
      <div class="ext-warehouse__card">
        <div class="ext-warehouse__primary">
          <div class="ext-warehouse__label">Lagerkostnader (30 dagar)</div>
          <div class="ext-warehouse__amount">${formatSEK(bucket30.cost)} SEK</div>
          <div class="ext-warehouse__detail">${bucket30.count} föremål · ${formatSEK(bucket30.days)} dagar</div>
        </div>
        <div class="ext-warehouse__secondary">
          <div class="ext-warehouse__sub">
            <span class="ext-warehouse__sub-label">90 dagar</span>
            <span class="ext-warehouse__sub-value">${formatSEK(bucket90.cost)} SEK</span>
            <span class="ext-warehouse__sub-detail">${bucket90.count} st · ${formatSEK(bucket90.days)}d</span>
          </div>
          <div class="ext-warehouse__sub">
            <span class="ext-warehouse__sub-label">Totalt</span>
            <span class="ext-warehouse__sub-value">${formatSEK(bucketAll.cost)} SEK</span>
            <span class="ext-warehouse__sub-detail">${bucketAll.count} st · ${formatSEK(bucketAll.days)}d</span>
          </div>
          <div class="ext-warehouse__meta">
            ${fromCache ? 'Cachad' : 'Uppd.'} ${dateStr} ${timeStr}
            <button class="ext-warehouse__refresh" title="Uppdatera">↻</button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('.ext-warehouse__refresh')?.addEventListener('click', () => {
      chrome.storage.local.remove(WAREHOUSE_CACHE_KEY);
      fetchWarehouseCosts();
    });
  }

  // ─── Dashboard API initialization ──────────────────────────────────

  let _dashboardAPIInstance = null;

  async function initDashboardAPI() {
    try {
      const mod = await import(chrome.runtime.getURL('modules/dashboard-api.js'));
      _dashboardAPIInstance = new mod.DashboardAPI();
      const data = await _dashboardAPIInstance.fetchAll();
      if (data) {
        createDashboardSidebar(data, _dashboardAPIInstance);
        dashboardAPILastRefresh = Date.now();
      }
    } catch (e) {
      // Dashboard API unavailable — all features degrade gracefully
      console.warn('[AdminDashboard] Dashboard API init failed:', e.message);
    }
  }

  // Auto-refresh sidebar on tab visibility change
  let dashboardAPILastRefresh = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && _dashboardAPIInstance) {
      const idleMinutes = (Date.now() - dashboardAPILastRefresh) / 60000;
      if (idleMinutes >= 5) {
        dashboardAPILastRefresh = Date.now();
        const data = await _dashboardAPIInstance.fetchAll();
        if (data) refreshSidebarContent(data, _dashboardAPIInstance);
      }
    }
  });

  // ─── Initialize ───────────────────────────────────────────────────

  let hasRenderedKPI = false;
  let hasRenderedComments = false;
  let hasStartedWarehouseFetch = false;
  let hasStartedPublicationScan = false;
  let hasRenderedDashboardAPI = false;

  function tryRenderAll() {
    try {
      // KPI cards — built from "Viktiga påminnelser" reminder links plus
      // insight cards (daily goal, comments). Wait until at least one real
      // signal is present so we don't render an empty set on first paint.
      const kpiReady = document.querySelector('a[class*="test-requested-action"]') ||
                       document.querySelector('#comments ul.unstyled li.comment') ||
                       document.querySelector('.test-new-items');
      if (!hasRenderedKPI && kpiReady) {
        renderKPICards();
        hasRenderedKPI = true;
      }

      // Pipeline funnel, Pricing insights, Inventory health and the Cataloger
      // leaderboard were removed in the 2026 redesign: their data sources
      // (.auction-company-stats table, .well--nav-list counts, .test-cataloger-stats)
      // no longer exist on the page — those metrics now live in Auctionet's own
      // Metabase analytics embed (#statistics turbo-frame).

      // Comment feed — needs #comments with li.comment entries
      if (!hasRenderedComments && document.querySelector('#comments ul.unstyled li.comment')) {
        renderCommentFeed();
        hasRenderedComments = true;
      }

      // Dashboard API sections — start after KPI cards are in place
      if (!hasRenderedDashboardAPI && hasRenderedKPI) {
        hasRenderedDashboardAPI = true;
        initDashboardAPI();
      }

      // Warehouse costs — start once the page has basic structure
      if (!hasStartedWarehouseFetch && hasRenderedKPI) {
        hasStartedWarehouseFetch = true;
        fetchWarehouseCosts();
      }

      // Publication scanner — start after warehouse widget is placed
      if (!hasStartedPublicationScan && hasStartedWarehouseFetch) {
        hasStartedPublicationScan = true;
        initPublicationScanner();
      }
    } catch (error) {
      console.error('[AdminDashboard] Render error:', error);
    }
  }

  function init() {

    // Render immediately with whatever is in the DOM
    tryRenderAll();

    // Watch for turbo-frames and other lazy content arriving.
    // Many sidebar counts and the cataloger table load lazily via turbo-frames
    // that only fire when scrolled into view or after a delay.
    const observer = new MutationObserver(() => {
      tryRenderAll();

      // Stop observing once everything has rendered
      if (hasRenderedKPI && hasRenderedComments &&
          hasStartedWarehouseFetch && hasStartedPublicationScan &&
          hasRenderedDashboardAPI) {
        observer.disconnect();
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
