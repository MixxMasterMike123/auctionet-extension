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

  // Verify the unsolds table exists
  const table = document.querySelector('table.table');
  if (!table) return;

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
         m.target.querySelector && m.target.querySelector('table.table'))
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
