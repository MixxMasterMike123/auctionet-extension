// modules/enhance-all/enhance-all-ui.js — UI for "Förbättra alla"
// Button, tier selector, loading state, preview modal

import { determineTier, getTierById, TIER_CONFIG } from './tier-config.js';

export class EnhanceAllUI {
  constructor() {
    this.enhanceAllManager = null;
    this.fieldDistributor = null;
    this._currentResult = null;
    this._currentTier = null;
    this._loadingContainer = null;
    this._previewModal = null;
  }

  setEnhanceAllManager(manager) {
    this.enhanceAllManager = manager;
  }

  setFieldDistributor(distributor) {
    this.fieldDistributor = distributor;
  }

  // ─── Inject the Enhance All button and tier selector ───

  /**
   * Inject the "Förbättra alla" panel into the page
   * Places it in the sidebar (.grid-col4) above the quality indicator
   */
  injectEnhanceAllButton() {
    // Don't inject twice
    if (document.getElementById('enhance-all-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'enhance-all-panel';
    panel.className = 'enhance-all-panel';

    // Read current valuation for auto tier selection
    const valuation = document.querySelector('#item_current_auction_attributes_accepted_reserve')?.value || '';
    const autoTier = determineTier(valuation);

    panel.innerHTML = this._buildPanelHTML(autoTier, valuation);

    // Insert into sidebar after quality indicator (quality first, enhance below)
    const sidebar = document.querySelector('.grid-col4');
    if (sidebar) {
      const qualityIndicator = sidebar.querySelector('.quality-indicator');
      if (qualityIndicator) {
        qualityIndicator.after(panel);
      } else {
        sidebar.insertBefore(panel, sidebar.firstChild);
      }
    } else {
      // Fallback: insert above the form
      const form = document.querySelector('form') || document.querySelector('.grid-col8');
      if (form) {
        form.parentNode.insertBefore(panel, form);
      }
    }

    this._attachPanelListeners(panel);
    this._setupValuationWatcher();
  }

  _buildPanelHTML(autoTier, valuation) {
    const valuationDisplay = valuation ? `${parseInt(valuation).toLocaleString('sv-SE')} kr` : 'ej angivet';
    const tiers = TIER_CONFIG.tiers;

    return `
      <div class="enhance-all-header">
        <span class="enhance-all-icon">&#10024;</span>
        <span class="enhance-all-title">Förbättra alla</span>
      </div>
      <div class="enhance-all-tier-selector">
        <button type="button" class="enhance-all-tier-btn ${autoTier.id === 'tidy' ? 'active' : ''}" data-tier="tidy">
          <span class="tier-label">${tiers.tidy.label}</span>
          <span class="tier-range">&lt; 3 000 kr</span>
        </button>
        <button type="button" class="enhance-all-tier-btn ${autoTier.id === 'enrich' ? 'active' : ''}" data-tier="enrich">
          <span class="tier-label">${tiers.enrich.label}</span>
          <span class="tier-range">3–10 000 kr</span>
        </button>
        <button type="button" class="enhance-all-tier-btn ${autoTier.id === 'full' ? 'active' : ''}" data-tier="full">
          <span class="tier-label">${tiers.full.label}</span>
          <span class="tier-range">&gt; 10 000 kr</span>
        </button>
      </div>
      <div class="enhance-all-auto-label">Auto-vald: ${autoTier.label} (bevakningspris ${valuationDisplay})</div>
      <button type="button" class="enhance-all-run-btn" id="enhance-all-run-btn">
        <span class="enhance-all-run-icon">&#10024;</span> Förbättra alla fält
      </button>
    `;
  }

  _attachPanelListeners(panel) {
    // Tier selector buttons
    const tierBtns = panel.querySelectorAll('.enhance-all-tier-btn');
    tierBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tierBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Update auto-label to show manual override
        const autoLabel = panel.querySelector('.enhance-all-auto-label');
        const tier = getTierById(btn.dataset.tier);
        autoLabel.textContent = `Manuellt vald: ${tier.label}`;
        autoLabel.classList.add('manual-override');
      });
    });

    // Run button
    const runBtn = panel.querySelector('#enhance-all-run-btn');
    runBtn.addEventListener('click', () => this._onRunClick());
  }

  _setupValuationWatcher() {
    // Watch bevakningspris field for changes to auto-update tier
    const valuationField = document.querySelector('#item_current_auction_attributes_accepted_reserve');
    if (valuationField) {
      const updateTier = () => {
        const panel = document.getElementById('enhance-all-panel');
        if (!panel) return;
        // Only update if not manually overridden
        if (panel.querySelector('.enhance-all-auto-label.manual-override')) return;

        const valuation = valuationField.value;
        const autoTier = determineTier(valuation);
        const valuationDisplay = valuation ? `${parseInt(valuation).toLocaleString('sv-SE')} kr` : 'ej angivet';

        // Update active tier
        panel.querySelectorAll('.enhance-all-tier-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.tier === autoTier.id);
        });

        // Update label
        const autoLabel = panel.querySelector('.enhance-all-auto-label');
        autoLabel.textContent = `Auto-vald: ${autoTier.label} (bevakningspris ${valuationDisplay})`;
      };

      valuationField.addEventListener('change', updateTier);
      valuationField.addEventListener('input', updateTier);

      // Re-check after a delay to catch values populated by Auctionet's own JS
      setTimeout(updateTier, 1500);
    }
  }

  async _onRunClick() {
    if (this.enhanceAllManager?.isProcessing) return;

    // If user manually overrode the tier, use that; otherwise pass null
    // so enhance() reads the valuation field at click time (avoids stale init value)
    const panel = document.getElementById('enhance-all-panel');
    const isManualOverride = panel?.querySelector('.enhance-all-auto-label.manual-override');
    const activeBtn = document.querySelector('.enhance-all-tier-btn.active');
    const tierId = isManualOverride ? (activeBtn?.dataset.tier || null) : null;

    // Disable run button during processing
    const runBtn = document.getElementById('enhance-all-run-btn');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.classList.add('processing');
    }

    try {
      await this.enhanceAllManager.enhance(tierId);
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.classList.remove('processing');
      }
    }
  }

  // ─── Loading state ───

  showLoading(tier) {
    this._removeLoading();
    this._currentTier = tier;

    const container = document.createElement('div');
    container.id = 'enhance-all-loading';
    container.className = 'enhance-all-loading';

    const steps = [
      { id: 'extract', label: 'Fält extraherade', status: 'done' },
      { id: 'tier', label: `Nivå ${tier.id === 'tidy' ? '1' : tier.id === 'enrich' ? '2' : '3'} vald (${tier.label})`, status: 'done' },
      { id: 'enhance', label: 'Strukturerar fält...', status: 'pending' }
    ];

    // Add bio step for Tier 2 with a named artist
    const artist = document.querySelector('#item_artist_name_sv')?.value?.trim();
    if (tier.id === 'enrich' && artist && !this._isUnknownArtist(artist)) {
      steps.push({ id: 'bio', label: 'Hämtar makerkontext...', status: 'pending' });
    }

    steps.push({ id: 'preview', label: 'Förbereder förhandsvisning', status: 'pending' });

    container.innerHTML = `
      <div class="enhance-all-loading-header">
        <span class="enhance-all-icon">&#10024;</span> Förbättrar alla fält...
      </div>
      <div class="enhance-all-loading-progress">
        <div class="enhance-all-progress-bar"><div class="enhance-all-progress-fill"></div></div>
      </div>
      <div class="enhance-all-loading-steps">
        ${steps.map(s => `
          <div class="enhance-all-step" data-step="${s.id}">
            <span class="step-icon">${s.status === 'done' ? '&#10003;' : '&#9675;'}</span>
            <span class="step-label">${s.label}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Insert after the enhance-all panel
    const panel = document.getElementById('enhance-all-panel');
    if (panel) {
      panel.after(container);
    }

    this._loadingContainer = container;
    this._updateProgress();
  }

  updateLoadingStep(stepId, status) {
    if (!this._loadingContainer) return;

    const step = this._loadingContainer.querySelector(`[data-step="${stepId}"]`);
    if (!step) return;

    const icon = step.querySelector('.step-icon');
    if (status === 'active') {
      icon.innerHTML = '&#8635;'; // ↻
      step.classList.add('active');
    } else if (status === 'done') {
      icon.innerHTML = '&#10003;'; // ✓
      step.classList.remove('active');
      step.classList.add('done');
    } else if (status === 'skipped') {
      icon.innerHTML = '&#8211;'; // –
      step.classList.remove('active');
      step.classList.add('skipped');
    }

    this._updateProgress();
  }

  _updateProgress() {
    if (!this._loadingContainer) return;
    const steps = this._loadingContainer.querySelectorAll('.enhance-all-step');
    const done = this._loadingContainer.querySelectorAll('.enhance-all-step.done, .enhance-all-step.skipped');
    const pct = steps.length > 0 ? (done.length / steps.length) * 100 : 0;
    const fill = this._loadingContainer.querySelector('.enhance-all-progress-fill');
    if (fill) fill.style.width = `${pct}%`;
  }

  _removeLoading() {
    const existing = document.getElementById('enhance-all-loading');
    if (existing) existing.remove();
    this._loadingContainer = null;
  }

  // ─── Error display ───

  showError(message) {
    this._removeLoading();
    this._removePreview();

    const container = document.createElement('div');
    container.id = 'enhance-all-error';
    container.className = 'enhance-all-error';
    container.innerHTML = `
      <span class="enhance-all-error-icon">&#9888;</span>
      <span>${this._escapeHTML(message)}</span>
      <button type="button" class="enhance-all-error-close" title="Stäng">&#10005;</button>
    `;

    container.querySelector('.enhance-all-error-close').addEventListener('click', () => container.remove());

    const panel = document.getElementById('enhance-all-panel');
    if (panel) panel.after(container);

    // Auto-remove after 8 seconds
    setTimeout(() => container.remove(), 8000);
  }

  // ─── Preview modal ───

  showPreview(result, originalData, tier) {
    this._removeLoading();
    this._removePreview();

    this.updateLoadingStep('preview', 'done');
    this._currentResult = result;

    const modal = document.createElement('div');
    modal.id = 'enhance-all-preview';
    modal.className = 'enhance-all-preview-overlay';

    const tierLabel = `Nivå ${tier.id === 'tidy' ? '1' : tier.id === 'enrich' ? '2' : '3'} (${tier.label})`;

    modal.innerHTML = `
      <div class="enhance-all-preview-modal">
        <div class="enhance-all-preview-header">
          <span>Förbättring — ${tierLabel}</span>
          <button type="button" class="enhance-all-preview-close" title="Stäng">&#10005;</button>
        </div>
        <div class="enhance-all-preview-body">
          ${result._artistDetection ? this._buildArtistDetectionUI(result._artistDetection, result, originalData) : ''}
          ${this._buildFieldPreview('Titel', 'title', result.title, originalData.title)}
          ${this._buildFieldPreview('Beskrivning', 'description', result.description, originalData.description)}
          ${result._noRemarks
            ? this._buildSkippedFieldPreview('Kondition', 'Inga anmärkningar markerad — ej förbättrad')
            : this._buildFieldPreview('Kondition', 'condition', result.condition, originalData.condition)}
          ${this._buildFieldPreview('Nyckelord', 'keywords', result.keywords, originalData.keywords)}
        </div>
        <div class="enhance-all-preview-footer">
          <button type="button" class="enhance-all-btn-secondary" id="enhance-all-cancel">Avbryt</button>
          <button type="button" class="enhance-all-btn-primary" id="enhance-all-accept-selected">Godkänn valda</button>
          <button type="button" class="enhance-all-btn-accent" id="enhance-all-accept-all">Godkänn alla</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this._previewModal = modal;
    this._attachPreviewListeners(modal, result, originalData);
  }

  _buildSkippedFieldPreview(label, reason) {
    return `
      <div class="enhance-all-field-preview" data-field="skipped">
        <div class="field-preview-header">
          <span class="field-preview-label">${label}</span>
          <div class="field-preview-actions">
            <span class="field-preview-unchanged">${this._escapeHTML(reason)}</span>
          </div>
        </div>
      </div>
    `;
  }

  _buildFieldPreview(label, fieldType, newValue, originalValue) {
    const isUnchanged = !newValue || (fieldType === 'title' && newValue === null);
    const displayValue = isUnchanged ? originalValue : newValue;

    return `
      <div class="enhance-all-field-preview" data-field="${fieldType}">
        <div class="field-preview-header">
          <span class="field-preview-label">${label}</span>
          <div class="field-preview-actions">
            ${isUnchanged
              ? '<span class="field-preview-unchanged">Oförändrad</span>'
              : `<label class="field-preview-toggle">
                  <input type="checkbox" checked data-field="${fieldType}">
                  <span class="toggle-label">Godkänn</span>
                </label>`
            }
          </div>
        </div>
        <div class="field-preview-content ${isUnchanged ? 'unchanged' : 'changed'}">
          <pre class="field-preview-text">${this._escapeHTML(displayValue || '(tom)')}</pre>
        </div>
      </div>
    `;
  }

  _buildArtistDetectionUI(detection, result, originalData) {
    const currentArtist = originalData.artist?.trim() || '';
    const artistEmpty = !currentArtist || this._isUnknownArtist(currentArtist);

    if (!artistEmpty) return '';

    return `
      <div class="enhance-all-artist-detection">
        <label class="artist-detection-toggle">
          <input type="checkbox" id="enhance-all-move-artist" checked>
          <span>Flytta <strong>${this._escapeHTML(detection.detectedName)}</strong> till konstnärsfältet</span>
        </label>
        <span class="artist-detection-title-preview">Ny titel: ${this._escapeHTML(detection.suggestedTitle)}</span>
      </div>
    `;
  }

  _attachPreviewListeners(modal, result, originalData) {
    // Close button
    modal.querySelector('.enhance-all-preview-close').addEventListener('click', () => {
      this._removePreview();
    });

    // Cancel button
    modal.querySelector('#enhance-all-cancel').addEventListener('click', () => {
      this._removePreview();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this._removePreview();
    });

    // Escape key to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this._removePreview();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Accept all
    modal.querySelector('#enhance-all-accept-all').addEventListener('click', () => {
      const accepted = { title: true, description: true, condition: true, keywords: true };

      // Handle artist move
      const artistMove = this._getArtistMoveData(modal, result);
      if (artistMove) {
        accepted.artist = true;
        result._artistMove = artistMove;
      }

      this.fieldDistributor.applyResults(result, accepted);
      this._removePreview();
      this._showSuccessNotification(artistMove ? 'Alla fält uppdaterade + konstnär flyttad' : 'Alla fält uppdaterade');
    });

    // Accept selected
    modal.querySelector('#enhance-all-accept-selected').addEventListener('click', () => {
      const checkboxes = modal.querySelectorAll('.field-preview-toggle input[type="checkbox"]');
      const accepted = { title: false, description: false, condition: false, keywords: false };
      checkboxes.forEach(cb => {
        if (cb.checked) {
          accepted[cb.dataset.field] = true;
        }
      });

      // Handle artist move
      const artistMove = this._getArtistMoveData(modal, result);
      if (artistMove) {
        accepted.artist = true;
        result._artistMove = artistMove;
      }

      const count = Object.values(accepted).filter(Boolean).length;
      if (count === 0) {
        this._removePreview();
        return;
      }

      this.fieldDistributor.applyResults(result, accepted);
      this._removePreview();
      this._showSuccessNotification(`${count} fält uppdaterade`);
    });
  }

  /**
   * Check if the artist move checkbox is checked and return move data
   */
  _getArtistMoveData(modal, result) {
    const moveCheckbox = modal.querySelector('#enhance-all-move-artist');
    if (!moveCheckbox?.checked || !result._artistDetection) return null;

    return {
      artistName: result._artistDetection.detectedName,
      suggestedTitle: result._artistDetection.suggestedTitle
    };
  }

  _removePreview() {
    const existing = document.getElementById('enhance-all-preview');
    if (existing) existing.remove();
    this._previewModal = null;
    this._currentResult = null;
  }

  _showSuccessNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'enhance-all-success-notification';
    notification.innerHTML = `<span>&#10003;</span> ${this._escapeHTML(message)}`;

    const panel = document.getElementById('enhance-all-panel');
    if (panel) panel.after(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // ─── Helpers ───

  _isUnknownArtist(name) {
    const lower = name.toLowerCase().trim();
    return lower.includes('okänd') || lower.includes('oidentifierad') ||
      lower === '' || lower === '-';
  }

  _escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
