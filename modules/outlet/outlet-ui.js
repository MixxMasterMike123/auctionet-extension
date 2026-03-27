// modules/outlet/outlet-ui.js — UI overlay for unsolds page
// Adds toolbar, checkboxes, and export controls for SaS Outlet

export class OutletUI {
  constructor(scraper, api) {
    this._scraper = scraper;
    this._api = api;
    this._selectedIds = new Set();
    this._scrapedItems = new Map(); // id → item data
    this._toolbar = null;
    this._isExporting = false;
    this._isScraping = false;
  }

  // Initialize the UI: inject toolbar and checkboxes
  async init() {
    const configured = await this._api.isConfigured();
    this._injectToolbar(configured);
    this._injectCheckboxes();
    this._scrapeCurrentPage();
  }

  // Scrape current page and store items
  _scrapeCurrentPage() {
    const items = this._scraper.scrapeCurrentPage();
    for (const item of items) {
      this._scrapedItems.set(item.id, item);
    }
    this._updateCounts();
  }

  // Inject floating toolbar above the table
  _injectToolbar(configured) {
    const table = document.querySelector('table.table');
    if (!table) return;

    this._toolbar = document.createElement('div');
    this._toolbar.className = 'ext-outlet-toolbar';
    this._toolbar.innerHTML = `
      <div class="ext-outlet-toolbar__header">
        <span class="ext-outlet-toolbar__title">SaS Outlet</span>
        <span class="ext-outlet-toolbar__count" id="ext-outlet-count">0 valda</span>
      </div>
      <div class="ext-outlet-toolbar__actions">
        <button class="ext-outlet-btn ext-outlet-btn--secondary" id="ext-outlet-select-all">
          Markera alla
        </button>
        <button class="ext-outlet-btn ext-outlet-btn--secondary" id="ext-outlet-deselect-all">
          Avmarkera alla
        </button>
        <button class="ext-outlet-btn ext-outlet-btn--secondary" id="ext-outlet-scrape-all"
                title="Skrapa alla sidor (kan ta en stund)">
          Skrapa alla sidor
        </button>
        <button class="ext-outlet-btn ext-outlet-btn--primary" id="ext-outlet-export"
                ${configured ? '' : 'disabled title="Konfigurera Supabase i extension-popupen först"'}>
          Exportera till Outlet
        </button>
      </div>
      <div class="ext-outlet-toolbar__progress" id="ext-outlet-progress" style="display:none">
        <div class="ext-outlet-progress-bar">
          <div class="ext-outlet-progress-bar__fill" id="ext-outlet-progress-fill"></div>
        </div>
        <span class="ext-outlet-progress-text" id="ext-outlet-progress-text"></span>
      </div>
      <div class="ext-outlet-toolbar__status" id="ext-outlet-status"></div>
    `;

    table.parentNode.insertBefore(this._toolbar, table);

    // Bind events
    document.getElementById('ext-outlet-select-all').addEventListener('click', () => this._selectAll());
    document.getElementById('ext-outlet-deselect-all').addEventListener('click', () => this._deselectAll());
    document.getElementById('ext-outlet-scrape-all').addEventListener('click', () => this._scrapeAllPages());
    document.getElementById('ext-outlet-export').addEventListener('click', () => this._exportSelected());
  }

  // Inject a checkbox into each item row
  _injectCheckboxes() {
    const rows = document.querySelectorAll('tr[class*="test-item-"]');
    for (const row of rows) {
      const match = row.className.match(/test-item-(\d+)/);
      if (!match) continue;

      const itemId = parseInt(match[1]);
      const firstCell = row.querySelector('td');
      if (!firstCell) continue;

      const checkbox = document.createElement('label');
      checkbox.className = 'ext-outlet-checkbox';
      checkbox.innerHTML = `
        <input type="checkbox" data-item-id="${itemId}" class="ext-outlet-checkbox__input">
        <span class="ext-outlet-checkbox__mark"></span>
      `;

      firstCell.insertBefore(checkbox, firstCell.firstChild);

      const input = checkbox.querySelector('input');
      input.addEventListener('change', () => {
        if (input.checked) {
          this._selectedIds.add(itemId);
          row.classList.add('ext-outlet-row--selected');
        } else {
          this._selectedIds.delete(itemId);
          row.classList.remove('ext-outlet-row--selected');
        }
        this._updateCounts();
      });
    }
  }

  _selectAll() {
    const checkboxes = document.querySelectorAll('.ext-outlet-checkbox__input');
    for (const cb of checkboxes) {
      cb.checked = true;
      const id = parseInt(cb.dataset.itemId);
      this._selectedIds.add(id);
      cb.closest('tr')?.classList.add('ext-outlet-row--selected');
    }
    this._updateCounts();
  }

  _deselectAll() {
    const checkboxes = document.querySelectorAll('.ext-outlet-checkbox__input');
    for (const cb of checkboxes) {
      cb.checked = false;
      const id = parseInt(cb.dataset.itemId);
      this._selectedIds.delete(id);
      cb.closest('tr')?.classList.remove('ext-outlet-row--selected');
    }
    this._updateCounts();
  }

  _updateCounts() {
    const countEl = document.getElementById('ext-outlet-count');
    if (countEl) {
      const selected = this._selectedIds.size;
      const total = this._scrapedItems.size;
      countEl.textContent = `${selected} valda av ${total} skrapade`;
    }
  }

  // Scrape all pages in batch mode
  async _scrapeAllPages() {
    if (this._isScraping) return;
    this._isScraping = true;

    const btn = document.getElementById('ext-outlet-scrape-all');
    btn.disabled = true;
    btn.textContent = 'Skrapar...';

    this._showProgress();

    try {
      const allItems = await this._scraper.scrapeAllPages((page, total, itemCount) => {
        this._updateProgress(page / total, `Sida ${page}/${total} — ${itemCount} föremål`);
      });

      // Store all scraped items
      for (const item of allItems) {
        this._scrapedItems.set(item.id, item);
      }

      this._setStatus(`Klart! ${this._scrapedItems.size} föremål skrapade från alla sidor.`, 'success');
    } catch (error) {
      this._setStatus(`Fel vid skrapning: ${this._escapeHtml(error.message)}`, 'error');
    } finally {
      this._hideProgress();
      btn.disabled = false;
      btn.textContent = 'Skrapa alla sidor';
      this._isScraping = false;
      this._updateCounts();
    }
  }

  // Export selected items to Supabase
  async _exportSelected() {
    if (this._isExporting || this._selectedIds.size === 0) return;
    this._isExporting = true;

    const exportBtn = document.getElementById('ext-outlet-export');
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporterar...';

    this._showProgress();

    try {
      // Collect selected items that have been scraped
      const itemsToExport = [];
      for (const id of this._selectedIds) {
        const item = this._scrapedItems.get(id);
        if (item) itemsToExport.push(item);
      }

      if (itemsToExport.length === 0) {
        this._setStatus('Inga valda föremål har skrapats. Markera föremål på denna sida eller skrapa alla sidor först.', 'error');
        return;
      }

      const result = await this._api.exportItems(itemsToExport, (current, total, success, failed) => {
        this._updateProgress(
          current / total,
          `${current}/${total} — ${success} ok, ${failed} misslyckade`
        );
      });

      if (result.failed === 0) {
        this._setStatus(`Exporterade ${result.success} föremål till SaS Outlet!`, 'success');
      } else {
        this._setStatus(
          `Exporterade ${result.success} föremål, ${result.failed} misslyckades. ` +
          `Fel: ${result.errors.slice(0, 3).map(e => this._escapeHtml(e)).join('; ')}`,
          'warning'
        );
      }
    } catch (error) {
      this._setStatus(`Exportfel: ${this._escapeHtml(error.message)}`, 'error');
    } finally {
      this._hideProgress();
      exportBtn.disabled = false;
      exportBtn.textContent = 'Exportera till Outlet';
      this._isExporting = false;
    }
  }

  // Progress bar helpers
  _showProgress() {
    const el = document.getElementById('ext-outlet-progress');
    if (el) el.style.display = 'flex';
  }

  _hideProgress() {
    const el = document.getElementById('ext-outlet-progress');
    if (el) el.style.display = 'none';
  }

  _updateProgress(fraction, text) {
    const fill = document.getElementById('ext-outlet-progress-fill');
    const textEl = document.getElementById('ext-outlet-progress-text');
    if (fill) fill.style.width = `${Math.round(fraction * 100)}%`;
    if (textEl) textEl.textContent = text;
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _setStatus(message, type = 'info') {
    const el = document.getElementById('ext-outlet-status');
    if (!el) return;
    el.innerHTML = message;
    el.className = `ext-outlet-toolbar__status ext-outlet-toolbar__status--${type}`;

    // Auto-clear after 10 seconds
    clearTimeout(this._statusTimeout);
    this._statusTimeout = setTimeout(() => {
      el.innerHTML = '';
      el.className = 'ext-outlet-toolbar__status';
    }, 10000);
  }
}
