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

    // On the full comments listing page, badges are all we need (no floating indicator)
    if (/\/admin\/sas\/comments/.test(path)) {
      console.log(`[CommentEnhancer] Injected entity badges on comments page`);
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
