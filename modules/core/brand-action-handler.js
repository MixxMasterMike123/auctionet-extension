/**
 * Brand Action Handler - SSoT Component
 * Extracted from quality-analyzer.js
 * Handles brand validation results and correction click handlers
 */
import { escapeHTML } from './html-escape.js';

export class BrandActionHandler {
  constructor() {
    this.brandValidationManager = null;
    this.dataExtractor = null;
    this.feedbackManager = null;

    // Callbacks to parent orchestrator
    this._onUpdateQualityIndicator = null;
    this._onCalculateScore = null;
    this._onReanalyze = null;
  }

  /**
   * Set dependencies
   */
  setDependencies({ brandValidationManager, dataExtractor, feedbackManager }) {
    this.brandValidationManager = brandValidationManager;
    this.dataExtractor = dataExtractor;
    this.feedbackManager = feedbackManager;
  }

  /**
   * Set callbacks for parent orchestrator interactions
   */
  setCallbacks({ onUpdateQualityIndicator, onCalculateScore, onReanalyze }) {
    this._onUpdateQualityIndicator = onUpdateQualityIndicator;
    this._onCalculateScore = onCalculateScore;
    this._onReanalyze = onReanalyze;
  }

  /**
   * Handle brand validation results — convert issues to warnings and update UI
   */
  async handleBrandValidationResult(brandIssues, data, currentWarnings, currentScore) {
    if (!brandIssues || brandIssues.length === 0) {
      return {
        brandIssues: [],
        warnings: currentWarnings,
        score: currentScore
      };
    }

    for (const issue of brandIssues) {
      const brandWarning = this.brandValidationManager.generateBrandWarning(issue);

      const existingBrandWarningIndex = currentWarnings.findIndex(w => w.isBrandWarning);
      if (existingBrandWarningIndex >= 0) {
        currentWarnings[existingBrandWarningIndex] = brandWarning;
      } else {
        currentWarnings.push(brandWarning);
      }
    }

    // Update quality display with animation after brand validation
    const latestData = this.dataExtractor.extractItemData();
    const recalculatedScore = this._onCalculateScore ? this._onCalculateScore(latestData) : currentScore;
    if (this._onUpdateQualityIndicator) {
      this._onUpdateQualityIndicator(recalculatedScore, currentWarnings, true);
    }

    // Setup click handlers for brand corrections
    setTimeout(() => {
      this.setupBrandCorrectionHandlers();
    }, 100);

    return {
      brandIssues: brandIssues,
      warnings: currentWarnings,
      score: currentScore
    };
  }

  /**
   * Set up click handlers for brand correction elements
   */
  setupBrandCorrectionHandlers() {
    const brandElements = document.querySelectorAll('.clickable-brand');

    brandElements.forEach(element => {
      if (element.dataset.handlerAttached) return;
      if (element.dataset.corrected === 'true') return;

      element.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const originalBrand = element.dataset.original;
        const suggestedBrand = element.dataset.suggested;

        try {
          const data = this.dataExtractor.extractItemData();

          const escapedBrand = originalBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const updatedTitle = data.title.replace(
            new RegExp(`\\b${escapedBrand}\\b`, 'gi'),
            suggestedBrand
          );

          const titleFieldSelectors = [
            '#item_title_sv', '#item_title',
            'input[name*="title"]', 'input[id*="title"]',
            'textarea[name*="title"]', 'textarea[id*="title"]'
          ];

          let titleField = null;
          for (const selector of titleFieldSelectors) {
            titleField = document.querySelector(selector);
            if (titleField) break;
          }

          if (!titleField) {
            if (this.feedbackManager) {
              this.feedbackManager.showErrorFeedback(element, 'Kunde inte uppdatera titelfältet');
            }
            return;
          }

          titleField.value = updatedTitle;

          try {
            titleField.dispatchEvent(new Event('input', { bubbles: true }));
            titleField.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (eventError) {
            // Silently handle event errors
          }

          // Visual feedback
          try {
            element.style.backgroundColor = '#e8f5e8';
            element.innerHTML = `${escapeHTML(suggestedBrand)} ✓`;
            element.style.textDecoration = 'none';
            element.style.cursor = 'default';
            element.style.color = '#28a745';

            const warningItem = element.closest('li');
            if (warningItem) {
              warningItem.style.opacity = '0.6';
              warningItem.style.backgroundColor = '#f8f9fa';
              warningItem.style.border = '1px solid #e8f5e8';
              warningItem.style.borderRadius = '4px';
              warningItem.style.padding = '8px';
              warningItem.style.transition = 'all 0.3s ease';

              const correctedBadge = document.createElement('span');
              correctedBadge.innerHTML = ' <small style="color: #28a745; font-weight: 600;">✓ RÄTTAT</small>';
              warningItem.appendChild(correctedBadge);
            }

            element.dataset.corrected = 'true';

            if (this.feedbackManager) {
              this.feedbackManager.showSuccessFeedback(element, `Märke rättat till "${suggestedBrand}"`);
            }
          } catch (uiError) {
            // Still continue even if UI feedback fails
          }

          // Re-run analysis after a short delay
          try {
            setTimeout(() => {
              if (this._onReanalyze) this._onReanalyze();
            }, 500);
          } catch (analysisError) {
            // Silently handle analysis errors
          }

        } catch (error) {
          console.error('Critical error during brand correction:', error);
          if (this.feedbackManager) {
            this.feedbackManager.showErrorFeedback(element, 'Fel vid rättning av märke');
          }
        }
      });

      element.dataset.handlerAttached = 'true';
    });
  }
}
