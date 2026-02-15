// comment-enhancer.js — Universal comment visibility enhancer for all Auctionet admin pages
// Detects comment sections and injects a floating badge near the top of the page
// Ultra-lightweight: no module imports, no AI calls, pure DOM scraping

(function() {
  'use strict';

  // Skip the main dashboard — it has its own enhanced comment feed
  const path = window.location.pathname;
  if (/\/admin\/sas\/?$/.test(path)) return;
  // Skip login pages
  if (/\/admin\/login/.test(path)) return;

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

    // On the full comments listing page, apply full rich feed design
    if (/\/admin\/sas\/comments/.test(path)) {
      renderRichCommentsList(commentsSection);
      console.log(`[CommentEnhancer] Enhanced comments listing page`);
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

    console.log(`[CommentEnhancer] Injected badge (${commentCount} comments) on ${path}`);
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

  function getInitials(name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function getAvatarColor(name) {
    const colors = ['#006ccc', '#28a745', '#dc3545', '#e65100', '#6f42c1', '#17a2b8', '#d4a017', '#5a6268'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  function relativeTimestamp(postedAtText) {
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
      const body = bodyEl ? bodyEl.innerHTML.trim() : '';

      richItems.push(`
        <div class="ext-cfeed-item">
          <div class="ext-cfeed-item__avatar" style="background: ${avatarColor};">${initials}</div>
          <div class="ext-cfeed-item__content">
            <div class="ext-cfeed-item__header">
              <span class="ext-cfeed-item__name">${employee}</span>
              ${badgeHTML}
              <span class="ext-cfeed-item__time">${relTime}</span>
            </div>
            ${commentedHref ? `<a class="ext-cfeed-item__entity" href="${commentedHref}">${commentedText}</a>` : ''}
            <div class="ext-cfeed-item__body">${body}</div>
          </div>
        </div>
      `);
    });

    // Create the rich feed container
    const feed = document.createElement('div');
    feed.className = 'ext-cfeed ext-animate-in';
    feed.innerHTML = richItems.join('');

    // Replace the original <ul> with our rich feed
    const ul = section.querySelector('ul.unstyled');
    if (ul) {
      ul.style.display = 'none';
      ul.parentNode.insertBefore(feed, ul);
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
          commentWell.style.transition = 'box-shadow 0.3s ease';
          commentWell.style.boxShadow = '0 0 0 3px rgba(0, 108, 204, 0.3)';
          setTimeout(() => { commentWell.style.boxShadow = ''; }, 2000);
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
