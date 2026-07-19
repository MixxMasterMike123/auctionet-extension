// comment-enhancer.js — Universal comment visibility enhancer for all Auctionet admin pages
// Detects comment sections and injects a floating badge near the top of the page
// Ultra-lightweight: no module imports, no AI calls, pure DOM scraping

(async function() {
  'use strict';

  // Skip the main dashboard — it has its own enhanced comment feed
  const path = window.location.pathname;
  if (/\/admin\/sas\/?$/.test(path)) return;
  // Skip login pages
  if (/\/admin\/login/.test(path)) return;

  // Shared comment-UI helpers (getInitials, getAvatarColor, relativeTimestamp,
  // safeHref) and HTML escaping — dynamic import from a classic script,
  // mirrors content-script.js's pattern. Must complete before init() runs
  // since init() (and functions it calls) use these helpers synchronously.
  const { getInitials, getAvatarColor, relativeTimestamp, safeHref } =
    await import(chrome.runtime.getURL('modules/core/comment-ui-helpers.js'));
  const { escapeHTML: escapeHtml } =
    await import(chrome.runtime.getURL('modules/core/html-escape.js'));

  function init() {
    // Find the comment section
    const commentsSection = document.querySelector('#comments') || document.querySelector('.comments');
    if (!commentsSection) return;

    // Always inject entity type badges into comment lists
    injectEntityBadges(commentsSection);

    // Check if the page already has Auctionet's built-in comment badge
    if (document.querySelector('.comments-link-block')) {
      // Page already has a badge — just enhance the comment section header
      enhanceCommentSection(commentsSection);
      return;
    }

    // On the full comments listing page, apply full rich feed design + filter bar
    if (/\/admin\/sas\/comments/.test(path)) {
      renderRichCommentsList(commentsSection);
      renderFilterBar(commentsSection);
      return;
    }

    // Count existing comments
    const commentItems = commentsSection.querySelectorAll('li.comment');
    const commentCount = commentItems.length;

    // Find the best place to inject the badge
    const sidebar = findSidebar();
    if (!sidebar) return;

    // Create and inject the badge
    const badge = createCommentBadge(commentCount);
    injectBadge(badge, sidebar);

    // Enhance the comment section with a heading
    enhanceCommentSection(commentsSection);

  }

  // ─── Entity Type Badges ─────────────────────────────────────────

  function getEntityType(href) {
    if (!href) return null;
    if (/\/buyers\//.test(href)) return { label: 'Köpare', cls: 'ext-entity-badge--buyer' };
    if (/\/sellers\//.test(href)) return { label: 'Säljare', cls: 'ext-entity-badge--seller' };
    if (/\/return_claims\//.test(href)) return { label: 'Reklamation', cls: 'ext-entity-badge--claim' };
    if (/\/items\//.test(href)) return { label: 'Föremål', cls: 'ext-entity-badge--item' };
    if (/\/invoices\//.test(href)) return { label: 'Faktura', cls: 'ext-entity-badge--invoice' };
    if (/\/transport/.test(href)) return { label: 'Transport', cls: 'ext-entity-badge--transport' };
    return null;
  }

  function injectEntityBadges(section) {
    const comments = section.querySelectorAll('li.comment');
    if (comments.length === 0) return;

    comments.forEach(li => {
      const commentedEl = li.querySelector('.commented');
      if (!commentedEl) return;

      // Skip if badge already injected
      if (commentedEl.querySelector('.ext-entity-badge')) return;

      const link = commentedEl.querySelector('a');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      const entity = getEntityType(href);
      if (!entity) return;

      const badge = document.createElement('span');
      badge.className = `ext-entity-badge ${entity.cls}`;
      badge.textContent = entity.label;

      // Insert badge before the link text
      commentedEl.insertBefore(badge, link);
    });
  }

  // ─── Rich Comments List (for /admin/sas/comments page) ──────────

  function renderRichCommentsList(section) {
    const commentItems = section.querySelectorAll('li.comment');
    if (commentItems.length === 0) return;

    // Build rich HTML for each comment
    const richItems = [];
    commentItems.forEach(li => {
      const employeeEl = li.querySelector('.employee');
      const commentedEl = li.querySelector('.commented');
      const postedAtEl = li.querySelector('.posted_at');
      const bodyEl = li.querySelector('.body');

      const employee = employeeEl ? employeeEl.textContent.trim() : 'Okänd';
      const initials = getInitials(employee);
      const avatarColor = getAvatarColor(employee);

      const commentedLink = commentedEl ? commentedEl.querySelector('a') : null;
      const commentedText = commentedLink ? commentedLink.textContent.trim() : '';
      const commentedHref = commentedLink ? commentedLink.getAttribute('href') || '' : '';
      const entity = getEntityType(commentedHref);
      const badgeHTML = entity
        ? `<span class="ext-entity-badge ${entity.cls}">${entity.label}</span>`
        : '';

      const postedAt = postedAtEl ? postedAtEl.textContent.trim() : '';
      const relTime = relativeTimestamp(postedAt);
      const body = bodyEl ? bodyEl.textContent.trim() : '';

      richItems.push(`
        <div class="ext-cfeed-item" data-href="${escapeHtml(safeHref(commentedHref))}">
          <div class="ext-cfeed-item__avatar" style="background: ${avatarColor};">${escapeHtml(initials)}</div>
          <div class="ext-cfeed-item__content">
            <div class="ext-cfeed-item__header">
              <span class="ext-cfeed-item__name">${escapeHtml(employee)}</span>
              ${badgeHTML}
              <span class="ext-cfeed-item__time">${escapeHtml(relTime)}</span>
            </div>
            <div class="ext-cfeed-item__entity-text">${escapeHtml(commentedText)}</div>
            <div class="ext-cfeed-item__body">${escapeHtml(body)}</div>
          </div>
        </div>
      `);
    });

    // Create the rich feed container
    const feed = document.createElement('div');
    feed.className = 'ext-cfeed ext-animate-in';
    feed.innerHTML = richItems.join('');

    // Click handler: navigate to entity unless user clicked an inner link
    feed.addEventListener('click', function(e) {
      // If user clicked a real link inside the body, let it work normally
      if (e.target.closest('a')) return;
      const item = e.target.closest('.ext-cfeed-item');
      if (item && item.dataset.href) {
        window.location.href = item.dataset.href;
      }
    });

    // Replace the original <ul> with our rich feed
    const ul = section.querySelector('ul.unstyled');
    if (ul) {
      ul.style.display = 'none';
      ul.parentNode.insertBefore(feed, ul);
    }
  }

  // ─── Filter Bar (for /admin/sas/comments page) ──────────────────

  function renderFilterBar(section) {
    const feed = section.querySelector('.ext-cfeed');
    if (!feed) return;

    const filters = [
      { key: 'alla', label: 'Alla', cls: '' },
      { key: 'reklamation', label: 'Reklamation', cls: 'ext-entity-badge--claim' },
      { key: 'kopare', label: 'Köpare', cls: 'ext-entity-badge--buyer' },
      { key: 'foremal', label: 'Föremål', cls: 'ext-entity-badge--item' },
      { key: 'saljare', label: 'Säljare', cls: 'ext-entity-badge--seller' },
      { key: 'faktura', label: 'Faktura', cls: 'ext-entity-badge--invoice' },
      { key: 'transport', label: 'Transport', cls: 'ext-entity-badge--transport' }
    ];

    const bar = document.createElement('div');
    bar.className = 'ext-filter-bar ext-animate-in';
    bar.innerHTML = filters.map(f =>
      `<button class="ext-filter-pill ext-filter-pill--${f.key}" data-filter="${f.key}" data-badge-cls="${f.cls}">${f.label}</button>`
    ).join('');

    // Insert above the feed
    feed.parentNode.insertBefore(bar, feed);

    // Filter logic
    let activeFilter = 'alla';

    function applyFilter(key, fromURL) {
      activeFilter = key;
      // Update pill states
      bar.querySelectorAll('.ext-filter-pill').forEach(pill => {
        pill.classList.toggle('ext-filter-pill--active', pill.dataset.filter === key);
      });

      // Show/hide comment items
      const items = feed.querySelectorAll('.ext-cfeed-item');
      const filterDef = filters.find(f => f.key === key);

      items.forEach(item => {
        if (key === 'alla') {
          item.style.display = '';
          return;
        }
        const badge = item.querySelector(`.ext-entity-badge.${filterDef.cls}`);
        item.style.display = badge ? '' : 'none';
      });

      // Update count indicator
      let countEl = bar.querySelector('.ext-filter-count');
      if (key !== 'alla') {
        const visible = feed.querySelectorAll('.ext-cfeed-item:not([style*="display: none"])').length;
        if (!countEl) {
          countEl = document.createElement('span');
          countEl.className = 'ext-filter-count';
          bar.appendChild(countEl);
        }
        countEl.textContent = `${visible} kommentarer`;
        countEl.style.display = '';
      } else if (countEl) {
        countEl.style.display = 'none';
      }

      // Sync filter to URL and pagination links (skip if this was the initial URL-based activation)
      if (!fromURL) {
        syncFilterToURL(key);
      }
    }

    function syncFilterToURL(key) {
      const params = new URLSearchParams(window.location.search);
      if (key === 'alla') {
        params.delete('filter');
      } else {
        params.set('filter', key);
      }
      const qs = params.toString();
      const newURL = window.location.pathname + (qs ? '?' + qs : '');
      history.replaceState(null, '', newURL);

      // Update pagination links to match
      document.querySelectorAll('.pagination a[href]').forEach(a => {
        try {
          const u = new URL(a.href, window.location.origin);
          if (key === 'alla') {
            u.searchParams.delete('filter');
          } else {
            u.searchParams.set('filter', key);
          }
          a.href = u.pathname + u.search;
        } catch (_) {}
      });
    }

    // Click handlers
    bar.addEventListener('click', (e) => {
      const pill = e.target.closest('.ext-filter-pill');
      if (!pill) return;
      applyFilter(pill.dataset.filter);
    });

    // Check URL param for initial filter (e.g. from dashboard card link)
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    if (filterParam && filters.some(f => f.key === filterParam)) {
      // Apply filter visually but mark as fromURL so we don't re-write the URL yet
      applyFilter(filterParam, true);
      // Ensure pagination links carry the filter forward
      syncFilterToURL(filterParam);
    } else {
      applyFilter('alla', true);
      // Strip any stale filter param from pagination links
      syncFilterToURL('alla');
    }
  }

  function findSidebar() {
    // Strategy 1: Right sidebar (.span4) — item, buyer, seller pages
    const sidebar = document.querySelector('.view .span4');
    if (sidebar) return sidebar;

    // Strategy 2: Any sidebar-like container
    const wellNav = document.querySelector('.well--nav-list');
    if (wellNav) return wellNav.parentElement;

    // Strategy 3: Fallback to main content area
    const view = document.querySelector('.view') || document.querySelector('[data-pjax-container]');
    return view;
  }

  function createCommentBadge(count) {
    const badge = document.createElement('a');
    badge.href = '#comments';
    badge.className = 'ext-comment-indicator ext-animate-in';

    if (count > 0) {
      badge.innerHTML = `
        <div class="ext-comment-indicator__icon-wrap">
          <i class="icon fas fa-comment ext-comment-indicator__icon ext-comment-indicator__icon--has-comments"></i>
          <span class="ext-comment-indicator__count">${count}</span>
        </div>
        <div class="ext-comment-indicator__text">
          <span class="ext-comment-indicator__label">${count === 1 ? '1 kommentar' : count + ' kommentarer'}</span>
          <span class="ext-comment-indicator__hint">Klicka för att visa</span>
        </div>
      `;
      badge.classList.add('ext-comment-indicator--has-comments');
    } else {
      badge.innerHTML = `
        <div class="ext-comment-indicator__icon-wrap">
          <i class="icon fas fa-comment ext-comment-indicator__icon"></i>
        </div>
        <div class="ext-comment-indicator__text">
          <span class="ext-comment-indicator__label">Lägg till kommentar</span>
          <span class="ext-comment-indicator__hint">Skriv en intern anteckning</span>
        </div>
      `;
    }

    badge.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector('#comments') || document.querySelector('.comments');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash the comment section briefly
        const commentWell = target.closest('.well');
        if (commentWell) {
          commentWell.style.transition = 'outline-color 0.3s ease';
          commentWell.style.outline = '3px solid rgba(0, 108, 204, 0.3)';
          setTimeout(() => { commentWell.style.outline = ''; }, 2000);
        }
        // Focus the textarea if present
        const textarea = target.querySelector('textarea[name="comment[body]"]');
        if (textarea && count === 0) {
          setTimeout(() => textarea.focus(), 400);
        }
      }
    });

    return badge;
  }

  function injectBadge(badge, sidebar) {
    // Try to inject after the first .well (usually action buttons)
    const firstWell = sidebar.querySelector('.well');
    if (firstWell && firstWell.nextSibling) {
      firstWell.parentNode.insertBefore(badge, firstWell.nextSibling);
      return;
    }

    // Fallback: prepend to sidebar
    sidebar.insertBefore(badge, sidebar.firstChild);
  }

  function enhanceCommentSection(section) {
    // Add a visual heading to the comment section if it lacks one
    const parentWell = section.closest('.well');
    if (!parentWell) return;

    // Check if there's already a heading
    const existingHeading = parentWell.querySelector('h3, h4, h5');
    if (existingHeading) return;

    const heading = document.createElement('h5');
    heading.className = 'heading heading--size-xxs heading--weight-semi-bold';
    heading.style.cssText = 'margin: 0 0 10px 0; color: #333; display: flex; align-items: center; gap: 6px;';
    heading.innerHTML = '<i class="icon fas fa-comments" style="opacity: 0.4; font-size: 13px;"></i> Kommentarer';
    parentWell.insertBefore(heading, parentWell.firstChild);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to let the page finish rendering
    setTimeout(init, 100);
  }
})();
