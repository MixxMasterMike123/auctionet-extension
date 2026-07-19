// unsolds-scraper.js — Content script entry point for /admin/sas/unsolds pages
// Injects SaS Outlet scraper UI for exporting recalled items to the Outlet database

(async function() {
  'use strict';

  // Only activate on unsolds page
  const path = window.location.pathname;
  if (!path.includes('/admin/') || !path.includes('/unsolds')) return;

  // Wait for page to be fully loaded
  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  }

  // Find the unsolds table. Prefer locating it via the item rows (stable
  // test-item-* classes) over the table's own class, which the admin UI
  // redesign may change.
  const findTable = () =>
    document.querySelector('tr[class*="test-item-"]')?.closest('table') ||
    document.querySelector('table.table');

  // The new admin UI renders the table client-side AFTER the load event, so a
  // one-shot check silently misses it — poll for up to 20s instead.
  let table = findTable();
  for (let waited = 0; !table && waited < 20000; waited += 250) {
    await new Promise(r => setTimeout(r, 250));
    table = findTable();
  }
  if (!table) {
    console.warn('[SaS Outlet] No unsolds table found after 20s — toolbar not injected');
    return;
  }

  console.log('[SaS Outlet] Initializing scraper on unsolds page');

  try {
    // Load modules dynamically (Chrome extension pattern — no static imports in content scripts)
    const scraperModule = await import(chrome.runtime.getURL('modules/outlet/outlet-scraper.js'));
    const apiModule = await import(chrome.runtime.getURL('modules/outlet/outlet-api.js'));
    const uiModule = await import(chrome.runtime.getURL('modules/outlet/outlet-ui.js'));

    const scraper = new scraperModule.OutletScraper();
    const api = new apiModule.OutletAPI();
    api.setScraper(scraper);

    function initUI() {
      // Remove previous toolbar if it exists (page navigation)
      const existing = document.querySelector('.ext-outlet-toolbar');
      if (existing) existing.remove();

      // Remove previous checkboxes
      document.querySelectorAll('.ext-outlet-checkbox').forEach(el => el.remove());
      document.querySelectorAll('.ext-outlet-row--selected').forEach(el => {
        el.classList.remove('ext-outlet-row--selected');
      });

      const ui = new uiModule.OutletUI(scraper, api);
      ui.init();
    }

    // Initial setup
    initUI();

    // Re-init when Turbo/PJAX swaps page content (pagination clicks)
    // Auctionet uses Turbo — listen for turbo:load and turbo:render
    document.addEventListener('turbo:load', () => initUI());
    document.addEventListener('turbo:render', () => initUI());

    // Fallback: MutationObserver watching for table replacement
    const container = document.querySelector('[data-pjax-container]') || document.body;
    let reinitTimeout = null;
    const observer = new MutationObserver((mutations) => {
      // Check if table rows changed (pagination swap)
      const hasTableChange = mutations.some(m =>
        m.type === 'childList' &&
        (m.target.matches && m.target.matches('[data-pjax-container]') ||
         m.target.querySelector && m.target.querySelector('table.table, tr[class*="test-item-"]'))
      );

      if (hasTableChange) {
        // Debounce to avoid multiple re-inits
        clearTimeout(reinitTimeout);
        reinitTimeout = setTimeout(() => {
          if (!document.querySelector('.ext-outlet-toolbar')) {
            console.log('[SaS Outlet] Page content changed, re-initializing');
            initUI();
          }
        }, 200);
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    console.log('[SaS Outlet] Scraper ready');
  } catch (error) {
    console.error('[SaS Outlet] Failed to initialize:', error);
  }
})();
