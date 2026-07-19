// modules/hyperrank/hyperrank-ui.js — UI for HYPERRANK, the opt-in aggressive
// search-rank optimizer. Separate CTA from normal Förbättra/Förbättra alla —
// deliberately styled to read as a distinct, non-default "special mode".
// See .claude/plans/hyperrank-button.md for the full spec.

import { checkRank } from './hyperrank-rank-check.js';

export class HyperrankUI {
  constructor() {
    this.onRun = null;   // callback wired by content-script.js
    this._checking = false;
  }

  /**
   * @param {function} onRun - async () => void, invoked when the HYPERRANK button is pressed
   */
  setOnRun(onRun) {
    this.onRun = onRun;
  }

  injectPanel() {
    if (document.getElementById('hyperrank-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'hyperrank-panel';
    panel.className = 'hyperrank-panel';
    panel.innerHTML = `
      <div class="hyperrank-header">
        <span class="hyperrank-icon">&#9889;</span>
        <span class="hyperrank-title">HYPERRANK</span>
      </div>
      <p class="hyperrank-explainer">
        Skriver om titel, beskrivning och sökord för topplacering i Auctionets sök.
        Avsiktligt aggressiv — kvalitetspoängen kan flagga sökordsöverlapp.
      </p>
      <button type="button" class="hyperrank-run-btn" id="hyperrank-run-btn">
        &#9889; HYPERRANK
      </button>
      <div class="hyperrank-status" id="hyperrank-status"></div>
      <div class="hyperrank-rank-row" id="hyperrank-rank-row" style="display:none;">
        <button type="button" class="hyperrank-rank-btn" id="hyperrank-rank-btn">Kolla placering</button>
        <span class="hyperrank-rank-result" id="hyperrank-rank-result"></span>
      </div>
    `;

    // Insert into sidebar, after .enhance-all-panel if present, else after
    // .quality-indicator, else at the top (mirrors enhance-all-ui.js pattern)
    const sidebar = document.querySelector('.grid-col4');
    if (sidebar) {
      const enhanceAllPanel = sidebar.querySelector('.enhance-all-panel');
      const qualityIndicator = sidebar.querySelector('.quality-indicator');
      if (enhanceAllPanel) {
        enhanceAllPanel.after(panel);
      } else if (qualityIndicator) {
        qualityIndicator.after(panel);
      } else {
        sidebar.insertBefore(panel, sidebar.firstChild);
      }
    } else {
      const form = document.querySelector('form') || document.querySelector('.grid-col8');
      if (form) form.parentNode.insertBefore(panel, form);
    }

    this._injectStyles();
    this._attachListeners(panel);
  }

  _attachListeners(panel) {
    const runBtn = panel.querySelector('#hyperrank-run-btn');
    runBtn.addEventListener('click', async () => {
      if (!this.onRun) return;
      runBtn.disabled = true;
      runBtn.classList.add('processing');
      try {
        await this.onRun();
      } finally {
        runBtn.disabled = false;
        runBtn.classList.remove('processing');
      }
    });

    const rankBtn = panel.querySelector('#hyperrank-rank-btn');
    rankBtn.addEventListener('click', () => this._onCheckRankClick());
  }

  // ─── Status / progress ───

  setStatus(message, kind = 'info') {
    const el = document.getElementById('hyperrank-status');
    if (!el) return;
    el.textContent = message;
    el.className = `hyperrank-status hyperrank-status--${kind}`;
  }

  clearStatus() {
    this.setStatus('', 'info');
  }

  showRankCheckRow() {
    const row = document.getElementById('hyperrank-rank-row');
    if (row) row.style.display = 'flex';
  }

  // ─── Rank check ───

  async _onCheckRankClick() {
    if (this._checking) return;
    this._checking = true;

    const rankBtn = document.getElementById('hyperrank-rank-btn');
    const resultEl = document.getElementById('hyperrank-rank-result');
    if (rankBtn) rankBtn.disabled = true;
    if (resultEl) resultEl.textContent = 'Kollar placering...';

    try {
      const titleField = document.querySelector('#item_title_sv');
      const title = titleField?.value || '';
      const result = await checkRank(title, window.location.href);

      if (!result) {
        if (resultEl) resultEl.textContent = 'Kunde inte kontrollera placering just nu.';
        return;
      }

      const positionText = result.position
        ? `Plats ${result.position} av ${result.totalEntries}`
        : 'Ej bland topp 50 ännu';

      if (resultEl) {
        resultEl.textContent = `${positionText} (uppdateras när objektet omindexerats)`;
      }
    } catch (e) {
      console.warn('[HYPERRANK] Rank check failed:', e);
      if (resultEl) resultEl.textContent = 'Kunde inte kontrollera placering just nu.';
    } finally {
      this._checking = false;
      if (rankBtn) rankBtn.disabled = false;
    }
  }

  // ─── Styles ───

  _injectStyles() {
    if (document.getElementById('hyperrank-styles')) return;
    const style = document.createElement('style');
    style.id = 'hyperrank-styles';
    style.textContent = `
      .hyperrank-panel {
        background: #1a1a2e;
        border: 2px solid #ffb700;
        border-radius: 3px;
        padding: 16px;
        margin-bottom: 20px;
      }

      .hyperrank-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      .hyperrank-icon {
        font-size: 16px;
      }

      .hyperrank-title {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #ffb700;
      }

      .hyperrank-explainer {
        margin: 0 0 12px 0;
        font-size: 12px;
        line-height: 1.4;
        color: #d8d8e8;
      }

      .hyperrank-run-btn {
        width: 100%;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 700;
        background: #ffb700;
        color: #1a1a2e;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .hyperrank-run-btn:hover {
        background: #e6a400;
      }

      .hyperrank-run-btn.processing {
        opacity: 0.7;
        cursor: wait;
      }

      .hyperrank-status {
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.4;
        min-height: 0;
      }

      .hyperrank-status--info { color: #d8d8e8; }
      .hyperrank-status--success { color: #4ade80; }
      .hyperrank-status--error { color: #f87171; }

      .hyperrank-rank-row {
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .hyperrank-rank-btn {
        padding: 6px 12px;
        font-size: 12px;
        background: transparent;
        color: #ffb700;
        border: 1px solid #ffb700;
        border-radius: 3px;
        cursor: pointer;
      }

      .hyperrank-rank-btn:hover {
        background: rgba(255, 183, 0, 0.15);
      }

      .hyperrank-rank-result {
        font-size: 12px;
        color: #d8d8e8;
      }
    `;
    document.head.appendChild(style);
  }
}
