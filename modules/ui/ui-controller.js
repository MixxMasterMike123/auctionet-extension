/**
 * UI Controller Module
 * Handles UI injection, event listeners, and UI updates for Auctionet Extension
 */
import { escapeHTML } from '../core/html-escape.js';

export class UIController {
    constructor(callbacks = {}) {
        this.callbacks = {
            onImproveField: callbacks.onImproveField || (() => { }),
            onImproveAll: callbacks.onImproveAll || (() => { }),
            onAnalyzeQuality: callbacks.onAnalyzeQuality || (() => { }),
            onArtistAction: callbacks.onArtistAction || (() => { }),
            onGetItemData: callbacks.onGetItemData || (() => ({})),
            ...callbacks
        };

        this.isProgrammaticUpdate = false;
    }

    injectUI() {

        // Add assistance button next to each field
        const titleField = document.querySelector('#item_title_sv');
        const descriptionField = document.querySelector('#item_description_sv');
        const conditionField = document.querySelector('#item_condition_sv');
        const keywordsField = document.querySelector('#item_hidden_keywords');


        if (titleField) {
            this.addAIButton(titleField, 'title', 'Förbättra titel');
        }
        if (descriptionField) {
            this.addAIButton(descriptionField, 'description', 'Förbättra beskrivning');
        }
        if (conditionField) {
            this.addAIButton(conditionField, 'condition', 'Förbättra kondition');
        }
        if (keywordsField) {
            this.addAIButton(keywordsField, 'keywords', 'Generera sökord');
        }

        // Add master "Improve All" button
        this.addMasterButton();

        // Attach event listeners
        this.attachEventListeners();
    }

    addMasterButton() {
        // Add quality indicator first, then add button to it
        this.addQualityIndicator();
    }

    addAIButton(field, type, buttonText) {
        const button = document.createElement('button');
        button.className = 'ai-assist-button';
        button.textContent = buttonText;
        button.type = 'button';
        button.dataset.fieldType = type;

        const wrapper = document.createElement('div');
        wrapper.className = 'ai-button-wrapper';
        wrapper.appendChild(button);

        // Position right after the field element
        field.parentNode.insertBefore(wrapper, field.nextSibling);
    }

    addQualityIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'quality-indicator';
        indicator.innerHTML = `
      <div class="quality-header">
        <h4 class="quality-title">Auctionet Kvalitetskontroll</h4>
        <div class="quality-score-container">
          <span class="quality-score">Analyserar...</span>
          <button class="refresh-quality-btn" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
        </div>
        <button class="ai-assist-button ai-master-button" type="button">Förbättra alla fält</button>
      </div>
      <div class="quality-warnings"></div>
    `;

        this.injectStyles();

        // Find sidebar: .grid-col4 on edit pages, fallback to right-side columns on add pages
        const sidebar = document.querySelector('.grid-col4') ||
            document.querySelector('.span4:last-child') ||
            document.querySelector('.sidebar') ||
            document.querySelector('.row-fluid > div:last-child');

        if (sidebar) {
            sidebar.insertBefore(indicator, sidebar.firstChild);

            // Add event listener for manual refresh button
            const refreshButton = indicator.querySelector('.refresh-quality-btn');
            if (refreshButton) {
                refreshButton.addEventListener('click', () => {
                    this.callbacks.onAnalyzeQuality();
                });
            }

            // Set up live quality monitoring
            this.setupLiveQualityUpdates();

            // Initial quality analysis
            this.callbacks.onAnalyzeQuality();
        }
    }

    injectStyles() {
        if (!document.getElementById('quality-indicator-styles')) {
            const style = document.createElement('style');
            style.id = 'quality-indicator-styles';
            style.textContent = `
        .quality-indicator {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 3px;
          padding: 20px;
          margin-bottom: 20px;
        }
        
        .quality-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }
        
        .quality-title {
          margin: 0 0 10px 0;
          font-size: 14px;
          font-weight: 600;
          color: #333;
          text-align: center;
          width: 100%;
        }
        
        .quality-score-container {
          margin-bottom: 12px;
          width: 100%;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .quality-score {
          display: inline-block;
          font-weight: bold;
          padding: 6px 16px;
          border-radius: 3px;
          font-size: 14px;
          min-width: 80px;
          text-align: center;
          transition: all 0.3s ease;
        }
        
        .refresh-quality-btn {
          background: #6c757d;
          color: white;
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .refresh-quality-btn:hover {
          background: #495057;
          transform: rotate(180deg);
        }

        .refresh-quality-btn:active {
          transform: rotate(180deg) scale(0.95);
        }
        
        .quality-score.good {
          background: #d4edda;
          color: #155724;
          border: 2px solid #b8dacc;
        }

        .quality-score.medium {
          background: #fff3cd;
          color: #856404;
          border: 2px solid #f1c40f;
        }

        .quality-score.poor {
          background: #f8d7da;
          color: #721c24;
          border: 2px solid #e74c3c;
        }
        
        .ai-master-button {
          width: 100%;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 600;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .ai-master-button:hover {
          background: #218838;
        }

        .ai-master-button:active {
          background: #1e7e34;
        }
        
        .quality-warnings {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #dee2e6;
        }
        
        .quality-warnings ul {
          margin: 0;
          padding-left: 0;
          list-style: none;
        }
        
        .quality-warnings li {
          margin-bottom: 10px;
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 3px;
          border-left: 4px solid;
        }
        
        .warning-high {
          color: #721c24;
          background-color: #f8d7da;
          border-left-color: #dc3545;
          font-weight: 400;
        }
        
        .warning-medium {
          color: #084298;
          background-color: #cff4fc;
          border-left-color: #0d6efd;
          font-weight: 400;
        }
        
        .warning-low {
          color: #495057;
          background-color: #f8f9fa;
          border-left-color: #6c757d;
          font-style: italic;
        }
        
        .no-warnings {
          color: #155724;
          font-weight: 500;
          text-align: center;
          margin: 0;
          font-size: 14px;
        }
        
        /* Assist Button Styles */
        .ai-button-wrapper {
          margin-top: 0px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        
        .ai-assist-button {
          padding: 6px 12px;
          font-size: 12px;
          background: #006ccc;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-weight: 300;
        }

        .ai-assist-button:hover {
          background: #0056b3;
        }
        
        .ai-assist-button:active {
          background: #004085;
        }
        
        .ai-assist-button[data-field-type="title-correct"] {
          background: #D18300;
        }
        
        .ai-assist-button[data-field-type="title-correct"]:hover {
          background: #B17200;
        }
        
        .ai-assist-button[data-field-type="title-correct"]:active {
          background: #A16600;
        }
        
        .ai-undo-button {
          background: #dc3545;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s ease;
          margin-left: 12px;
        }

        .ai-undo-button:hover {
          background: #c82333;
        }

        .ai-undo-button:active {
          background: #a71e2a;
        }
        
        .ai-updated {
          background-color: #d4edda !important;
          border: 2px solid #28a745 !important;
          transition: all 0.3s ease;
        }
        
        /* Artist Detection Styles */
        .warning-artist-detection {
          background: #e3f2fd;
          border: 1px solid #2196f3;
          border-radius: 3px;
          padding: 12px;
          margin: 8px 0;
        }
        
        .artist-detection-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .confidence-badge {
          background: #2196f3;
          color: white;
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
        }
        
        .artist-reasoning {
          font-style: italic;
          color: #666;
          margin: 8px 0;
          font-size: 13px;
        }
        
        .artist-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        
        .artist-actions button {
          padding: 6px 12px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
        }
        
        .btn-artist-move {
          background: #4caf50;
          color: white;
        }
        
        .btn-artist-move:hover {
          background: #45a049;
        }

        .btn-artist-bio {
          background: #337ab7;
          color: white;
        }

        .btn-artist-bio:hover {
          background: #286090;
        }

        .btn-artist-ignore {
          background: #dc3545;
          color: white;
        }

        .btn-artist-ignore:hover {
          background: #c82333;
        }
      `;
            document.head.appendChild(style);
        }
    }

    attachEventListeners() {
        // Individual field buttons (exclude master button)
        const buttons = document.querySelectorAll('.ai-assist-button:not(.ai-master-button)');

        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const fieldType = e.target.dataset.fieldType;
                if (fieldType) {
                    this.callbacks.onImproveField(fieldType);
                }
            });
        });

        // Master button
        const masterButton = document.querySelector('.ai-master-button');
        if (masterButton) {
            masterButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.callbacks.onImproveAll();
            });
        }
    }

    setupLiveQualityUpdates() {
        let updateTimeout;
        const debouncedUpdate = (event) => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                this.callbacks.onAnalyzeQuality();
            }, 800);
        };

        const fieldsToMonitor = [
            '#item_title_sv',
            '#item_description_sv',
            '#item_condition_sv',
            '#item_hidden_keywords',
            'input[type="checkbox"][value="Inga anmärkningar"]',
            'input[type="checkbox"]#item_no_remarks',
            'input[type="checkbox"][name*="no_remarks"]'
        ];

        fieldsToMonitor.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                if (element.type === 'checkbox') {
                    element.addEventListener('change', debouncedUpdate);
                } else {
                    element.addEventListener('input', debouncedUpdate);
                    element.addEventListener('paste', debouncedUpdate);
                    element.addEventListener('keyup', debouncedUpdate);
                }
            }
        });

        const richTextEditors = document.querySelectorAll('[contenteditable="true"]');
        richTextEditors.forEach(editor => {
            editor.addEventListener('input', debouncedUpdate);
            editor.addEventListener('paste', debouncedUpdate);
        });
    }

    updateQualityIndicator(score, warnings) {
        const scoreElement = document.querySelector('.quality-score');
        const warningsElement = document.querySelector('.quality-warnings');

        if (scoreElement) {
            const currentScore = parseInt(scoreElement.textContent.split('/')[0]) || 0;

            if (currentScore !== score) {
                scoreElement.style.fontWeight = '900';
                setTimeout(() => {
                    scoreElement.style.fontWeight = 'bold';
                }, 200);
            }

            scoreElement.textContent = `${score}/100`;
            scoreElement.className = `quality-score ${score >= 80 ? 'good' : score >= 60 ? 'medium' : 'poor'}`;
        }

        if (warningsElement) {
            if (warnings.length > 0) {
                warningsElement.innerHTML = '<ul>' +
                    warnings.map(w => {
                        if (w.interactive && w.severity === 'artist-detection') {
                            return this.createArtistDetectionWarning(w);
                        } else {
                            return `<li class="warning-${escapeHTML(w.severity)}"><strong>${escapeHTML(w.field)}:</strong> ${escapeHTML(w.issue)}</li>`;
                        }
                    }).join('') +
                    '</ul>';

                this.attachArtistDetectionListeners(warningsElement);
            } else {
                warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
            }
        }
    }

    createArtistDetectionWarning(warning) {
        const artistData = warning.artistData;
        const confidence = Math.round((artistData.confidence || 0.8) * 100);

        return `
      <li class="warning-artist-detection">
        <div class="artist-detection-header">
          <strong>🎨 ${escapeHTML(warning.field)}:</strong> ${escapeHTML(warning.issue)}
          <span class="confidence-badge">${confidence}% säkerhet</span>
        </div>
        <div class="artist-detection-body">
          ${artistData.reasoning ? `<p class="artist-reasoning">${escapeHTML(artistData.reasoning)}</p>` : ''}
          <div class="artist-actions">
            <button class="btn-artist-move" data-artist="${escapeHTML(artistData.detectedArtist)}" data-suggested-title="${escapeHTML(artistData.suggestedTitle || '')}">
              📝 Flytta till konstnärsfält
            </button>
            <button class="btn-artist-bio" data-artist="${escapeHTML(artistData.detectedArtist)}">
              ℹ️ Visa biografi
            </button>
            <button class="btn-artist-ignore" data-artist="${escapeHTML(artistData.detectedArtist)}">
              ❌ Ignorera
            </button>
          </div>
        </div>
      </li>
    `;
    }

    attachArtistDetectionListeners(warningsElement) {
        const moveButtons = warningsElement.querySelectorAll('.btn-artist-move');
        moveButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const artistName = e.target.dataset.artist;
                const suggestedTitle = e.target.dataset.suggestedTitle;
                this.callbacks.onArtistAction('move', { artistName, suggestedTitle });
            });
        });

        const bioButtons = warningsElement.querySelectorAll('.btn-artist-bio');
        bioButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const artistName = e.target.dataset.artist;
                this.callbacks.onArtistAction('bio', { artistName });
            });
        });

        const ignoreButtons = warningsElement.querySelectorAll('.btn-artist-ignore');
        ignoreButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const artistName = e.target.dataset.artist;
                this.callbacks.onArtistAction('ignore', { artistName });
            });
        });
    }

    showLoadingIndicator(fieldType) {

        // Remove any existing loading states
        this.removeFieldLoadingIndicator(fieldType);

        let targetField;
        if (fieldType === 'all') {
            // For "all" - show loading on master button AND all individual fields
            const masterButton = document.querySelector('.ai-master-button');
            if (masterButton) {
                masterButton.textContent = '⏳ Kontrollerar...';
                masterButton.disabled = true;
                masterButton.style.opacity = '0.7';
            }

            // Show loading animation on all fields simultaneously
            const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
            allFieldTypes.forEach(type => {
                this.showLoadingIndicator(type);
            });
            return;
        } else {
            // Get the specific field
            const fieldMap = {
                'title': '#item_title_sv',
                'title-correct': '#item_title_sv',
                'description': '#item_description_sv',
                'condition': '#item_condition_sv',
                'keywords': '#item_hidden_keywords'
            };

            targetField = document.querySelector(fieldMap[fieldType]);
        }

        if (!targetField) {
            console.error(`Target field not found for ${fieldType}`);
            return;
        }

        this.addSpinnerOverlay(targetField, fieldType);
    }

    addSpinnerOverlay(targetField, fieldType) {
        // Add CSS for field spinner overlays if not already added
        if (!document.getElementById('field-spinner-overlay-styles')) {
            const style = document.createElement('style');
            style.id = 'field-spinner-overlay-styles';
            style.textContent = `
        .field-loading { position: relative; }
        .field-loading input, .field-loading textarea { filter: blur(2px); transition: filter 0.3s ease; pointer-events: none; }
        .field-spinner-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; border-radius: 3px; animation: overlayFadeIn 0.3s ease; }
        .ai-spinner { width: 24px; height: 24px; border: 2px solid #e5e7eb; border-top: 2px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .ai-processing-text { margin-left: 12px; font-size: 13px; color: #374151; font-weight: 500; }
        @keyframes overlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .field-success { animation: successFlash 0.6s ease; }
        @keyframes successFlash { 0% { background-color: rgba(34, 197, 94, 0.1); border-color: #22c55e; } 50% { background-color: rgba(34, 197, 94, 0.2); border-color: #28a745; } 100% { background-color: transparent; border-color: initial; } }
      `;
            document.head.appendChild(style);
        }

        let fieldContainer = targetField.parentElement;
        if (fieldContainer.classList.contains('ai-button-wrapper') || fieldContainer.tagName === 'LABEL') {
            fieldContainer = fieldContainer.parentElement;
        }

        const containerStyle = window.getComputedStyle(fieldContainer);
        if (containerStyle.position === 'static') {
            fieldContainer.style.position = 'relative';
        }

        fieldContainer.classList.add('field-loading');

        const overlay = document.createElement('div');
        overlay.className = 'field-spinner-overlay';
        overlay.dataset.fieldType = fieldType;
        overlay.innerHTML = `
      <div class="ai-spinner"></div>
      <div class="ai-processing-text">Förbättrar...</div>
    `;

        const fieldRect = targetField.getBoundingClientRect();
        const containerRect = fieldContainer.getBoundingClientRect();

        const relativeTop = fieldRect.top - containerRect.top;
        const relativeLeft = fieldRect.left - containerRect.left;

        overlay.style.position = 'absolute';
        overlay.style.top = `${relativeTop}px`;
        overlay.style.left = `${relativeLeft}px`;
        overlay.style.width = `${fieldRect.width}px`;
        overlay.style.height = `${fieldRect.height}px`;

        fieldContainer.appendChild(overlay);
    }

    removeFieldLoadingIndicator(fieldType) {
        if (fieldType === 'all') {
            const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
            allFieldTypes.forEach(type => {
                this.removeFieldLoadingIndicator(type);
            });
            return;
        }

        const overlay = document.querySelector(`.field-spinner-overlay[data-field-type="${fieldType}"]`);
        if (overlay) {
            const container = overlay.parentElement;
            container.classList.remove('field-loading');
            overlay.remove();
        }
    }

    showFieldSuccessIndicator(fieldType) {
        this.removeFieldLoadingIndicator(fieldType);

        if (fieldType === 'all') {
            const masterButton = document.querySelector('.ai-master-button');
            if (masterButton) {
                masterButton.textContent = '✅ Klart!';
                setTimeout(() => {
                    masterButton.textContent = '⚡ Förbättra alla';
                    masterButton.disabled = false;
                    masterButton.style.opacity = '1';
                }, 2000);
            }
            return;
        }

        const fieldMap = {
            'title': '#item_title_sv',
            'title-correct': '#item_title_sv',
            'description': '#item_description_sv',
            'condition': '#item_condition_sv',
            'keywords': '#item_hidden_keywords'
        };

        const targetField = document.querySelector(fieldMap[fieldType]);
        if (targetField) {
            targetField.classList.add('field-success');
            setTimeout(() => {
                targetField.classList.remove('field-success');
            }, 600);
        }
    }

    showFieldErrorIndicator(fieldType, message) {
        console.error(`Error for ${fieldType}: ${message}`);
        this.removeFieldLoadingIndicator(fieldType);

        if (fieldType === 'all') {
            const masterButton = document.querySelector('.ai-master-button');
            if (masterButton) {
                masterButton.textContent = '❌ Fel uppstod';
                masterButton.disabled = false;
                masterButton.style.opacity = '1';
                setTimeout(() => {
                    masterButton.textContent = '⚡ Förbättra alla';
                }, 3000);
            }
        }

        alert(`Fel vid förbättring av ${fieldType}: ${message}`);
    }

    addUndoButton(field) {
        const existingUndo = field.parentElement.querySelector('.ai-undo-button');
        if (existingUndo) {
            existingUndo.remove();
        }

        const undoButton = document.createElement('button');
        undoButton.className = 'ai-undo-button';
        undoButton.textContent = '↩ Ångra';
        undoButton.type = 'button';

        // Store original value if not already stored
        if (!field.dataset.originalValue) {
            // This assumes the value BEFORE the change was stored somewhere or we accept the current value as "new"
            // Ideally, the caller should handle value history, but for simple undo:
            // We might need to capture the value BEFORE applying improvement.
            // But here we are adding the button AFTER improvement.
            // So we rely on the caller to have stored it or we just don't support full undo to "pre-AI" state if not handled elsewhere.
            // content.js didn't seem to store it explicitly in `applyImprovement`?
            // Wait, content.js `addUndoButton` used `field.dataset.originalValue`.
            // Where is `originalValue` set?
            // It must be set BEFORE applying improvement.
            // I should add `storeOriginalValue` method or handle it in `applyImprovement`.
        }

        undoButton.addEventListener('click', () => {
            if (field.dataset.originalValue) {
                field.value = field.dataset.originalValue;
                field.classList.remove('ai-updated');
                field.dispatchEvent(new Event('change', { bubbles: true }));
                undoButton.remove();
            }
        });

        field.parentElement.appendChild(undoButton);
    }

    applyImprovement(fieldType, value) {
        const fieldMap = {
            'title': '#item_title_sv',
            'title-correct': '#item_title_sv',
            'description': '#item_description_sv',
            'condition': '#item_condition_sv',
            'keywords': '#item_hidden_keywords'
        };

        const field = document.querySelector(fieldMap[fieldType]);
        if (field && value) {
            this.isProgrammaticUpdate = true;
            try {
                // Store original value before update if not already stored
                if (!field.dataset.originalValue) {
                    field.dataset.originalValue = field.value;
                }

                // Strip unknown-artist phrases that don't belong in non-artist fields
                let finalValue = UIController.stripUnknownArtistTerms(value);
                if (fieldType === 'keywords') {
                    const existingKeywords = field.value.trim();
                    if (existingKeywords) {
                        const existingSet = new Set(
                            existingKeywords.split(',').map(kw => kw.trim().toLowerCase()).filter(kw => kw.length > 0)
                        );
                        const newKeywords = value.split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);
                        const uniqueNew = newKeywords.filter(kw => !existingSet.has(kw.toLowerCase()));
                        finalValue = uniqueNew.length > 0
                            ? existingKeywords + ', ' + uniqueNew.join(', ')
                            : existingKeywords;
                    }
                }

                field.value = finalValue;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.classList.add('ai-updated');

                if (field.tagName.toLowerCase() === 'textarea') {
                    setTimeout(() => {
                        this.autoResizeTextarea(field);
                    }, 50);
                }

                this.addUndoButton(field);
            } finally {
                setTimeout(() => {
                    this.isProgrammaticUpdate = false;
                }, 100);
            }
        }
    }

    autoResizeTextarea(textarea) {
        if (!textarea || textarea.tagName.toLowerCase() !== 'textarea') return;
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
    }
    showInformationRequestDialog(currentData) {
        const dialog = document.createElement('div');
        dialog.className = 'ai-info-request-dialog';
        dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <h3>Mer information behövs för optimal katalogisering</h3>
        <p>För att skapa en professionell katalogisering enligt Auctionets riktlinjer behövs mer specifik information. Vänligen ange följande:</p>
        
        <div class="info-request-form">
          <div class="form-group">
            <label>Material (t.ex. ek, björk, mässing, silver):</label>
            <input type="text" id="ai-material" placeholder="Ange material...">
          </div>
          
          <div class="form-group">
            <label>Tillverkningsteknik (t.ex. handblåst, drejade, gjuten):</label>
            <input type="text" id="ai-technique" placeholder="Ange teknik...">
          </div>
          
          <div class="form-group">
            <label>Märkningar/Stämplar:</label>
            <input type="text" id="ai-markings" placeholder="T.ex. 'Märkt Kosta 1960'">
          </div>
          
          <div class="form-group">
            <label>Specifika skador/slitage:</label>
            <textarea id="ai-damage" placeholder="T.ex. 'Repa 3cm på ovansidan, nagg vid foten'"></textarea>
          </div>
          
          <div class="form-group">
            <label>Övrig information:</label>
            <textarea id="ai-additional" placeholder="Allt annat som kan vara relevant..."></textarea>
          </div>
        </div>
        
        <div class="dialog-buttons">
          <button class="btn btn-primary" id="process-with-info">
            Förbättra med denna information
          </button>
          <button class="btn btn-default" id="process-without-info">
            Fortsätt utan extra information
          </button>
          <button class="btn btn-link" id="cancel-dialog">
            Avbryt
          </button>
        </div>
      </div>
    `;

        document.body.appendChild(dialog);

        // Helper to robustly remove the dialog
        const removeDialog = () => {
            try { dialog.remove(); } catch(e) {}
            document.querySelectorAll('.ai-info-request-dialog').forEach(d => {
                try { d.remove(); } catch(e) {}
            });
        };

        // Add event listeners — use dialog-scoped queries to avoid ID conflicts with host page
        dialog.querySelector('#process-with-info').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Read values BEFORE removing dialog from DOM
            const additionalInfo = {
                material: dialog.querySelector('#ai-material')?.value || '',
                technique: dialog.querySelector('#ai-technique')?.value || '',
                markings: dialog.querySelector('#ai-markings')?.value || '',
                damage: dialog.querySelector('#ai-damage')?.value || '',
                additional: dialog.querySelector('#ai-additional')?.value || ''
            };
            removeDialog();
            if (this.callbacks.onProcessWithInfo) {
                this.callbacks.onProcessWithInfo(additionalInfo);
            }
        });

        dialog.querySelector('#process-without-info').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeDialog();
            if (this.callbacks.onProcessWithoutInfo) {
                this.callbacks.onProcessWithoutInfo();
            }
        });

        dialog.querySelector('#cancel-dialog').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeDialog();
        });

    }

    showFieldSpecificInfoDialog(fieldType, missingInfo, data) {
        const fieldNames = {
            'title': 'titeln',
            'description': 'beskrivningen',
            'condition': 'skicket',
            'keywords': 'nyckelorden',
            'all': 'alla fält'
        };

        const fieldName = fieldNames[fieldType] || fieldType;

        const infoMessages = {
            'basic_info': '📝 Grundläggande information om objektet',
            'material': '🧱 Material (trä, metall, glas, keramik, textil, etc.)',
            'technique': '🔨 Tillverkningsteknik (handgjord, gjuten, målad, etc.)',
            'period': '📅 Tidsperiod eller årtal',
            'measurements': '📏 Mått (längd x bredd x höjd)',
            'specific_damage': '🔍 Specifika skador eller defekter',
            'wear_details': '👀 Detaljer om slitage och användning',
            'condition_details': '🔎 Mer detaljerad skickbeskrivning',
            'bruksslitage_vague': '⚠️ "Bruksslitage" är för vagt - specificera typ av skador',
            'vague_condition_terms': '📋 Vaga konditionstermer - beskriv specifika skador och placering',
            'critical_quality': '⚠️ Grundläggande objektinformation',
            'artist_verification': '👨‍🎨 Verifiering av konstnärsinformation och aktiv period'
        };

        const dialog = document.createElement('div');
        dialog.className = 'ai-info-request-dialog';
        dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <h3>📋 Behöver mer information för ${escapeHTML(fieldName)}</h3>
        <p>Enligt Auctionets kvalitetskrav behövs mer detaljerad information innan ${escapeHTML(fieldName)} kan förbättras.</p>
        
        <div class="missing-info">
          <h4>Lägg till information om:</h4>
          <ul>
            ${missingInfo.map(info => `<li>${escapeHTML(infoMessages[info] || info)}</li>`).join('')}
          </ul>
        </div>
        
        ${this.getFieldSpecificTips(fieldType, data)}
        
        <div class="dialog-buttons">
          <button class="btn btn-link" id="cancel-field-dialog">Avbryt</button>
          <button class="btn btn-default" id="continue-anyway">Fortsätt ändå</button>
        </div>
      </div>
    `;

        document.body.appendChild(dialog);

        // Handle button clicks — use dialog-scoped queries to avoid ID conflicts with host page
        const cancelBtn = dialog.querySelector('#cancel-field-dialog');
        const continueBtn = dialog.querySelector('#continue-anyway');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                removeDialog();
            });
        }

        // Helper to robustly remove the dialog
        const removeDialog = () => {
            try { dialog.remove(); } catch(e) {}
            // Also remove any leftover dialogs of this class
            document.querySelectorAll('.ai-info-request-dialog').forEach(d => {
                try { d.remove(); } catch(e) {}
            });
        };

        if (continueBtn) {
            continueBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                removeDialog();
                if (this.callbacks.onForceImprove) {
                    this.callbacks.onForceImprove(fieldType);
                } else {
                    console.error('onForceImprove callback is not defined!');
                }
            });
        }

        // Close on background click
        dialog.querySelector('.dialog-overlay').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeDialog();
        });

    }

    getFieldSpecificTips(fieldType, data) {
        switch (fieldType) {
            case 'title':
                return `
          <div class="field-tips">
            <h4>💡 Tips för bättre titel:</h4>
            <p>Lägg till information i beskrivningen om material, teknik och tidsperiod för en mer exakt titel enligt Auctionets standarder.</p>
          </div>
        `;
            case 'description':
                return `
          <div class="field-tips">
            <h4>💡 Tips för bättre beskrivning:</h4>
            <p>Inkludera mått, material, tillverkningsteknik och eventuell signering eller märkning för en professionell beskrivning.</p>
          </div>
        `;
            case 'condition':
                return `
          <div class="field-tips">
            <h4>💡 Tips för bättre skickbeskrivning:</h4>
            <p><strong>Undvik vaga termer som "bruksslitage".</strong> Beskriv istället:</p>
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li><strong>Typ av skada:</strong> repor, nagg, sprickor, fläckar, missfärgningar</li>
              <li><strong>Placering:</strong> "vid foten", "på ovansidan", "längs kanten"</li>
              <li><strong>Omfattning:</strong> "mindre", "flera", "genomgående", "ytliga"</li>
              <li><strong>Exempel:</strong> "Mindre repor på ovansidan. Nagg vid fot. Spricka 2cm i glasyr."</li>
            </ul>
          </div>
        `;
            case 'keywords':
                return `
          <div class="field-tips">
            <h4>💡 Tips för bättre nyckelord:</h4>
            <p>Mer detaljerad information i titel och beskrivning ger bättre sökord som inte bara upprepar befintlig text.</p>
          </div>
        `;
            case 'all':
                return `
          <div class="field-tips">
            <h4>💡 Tips för bättre katalogisering:</h4>
            <p>Lägg till mer specifik information i beskrivningen för bättre resultat vid förbättring av alla fält.</p>
          </div>
        `;
            default:
                return '';
        }
    }

    showBiographyModal(artistName, biography) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'artist-bio-modal-overlay';
        modal.innerHTML = `
      <div class="artist-bio-modal">
        <div class="artist-bio-header">
          <h3>🎨 ${escapeHTML(artistName)}</h3>
          <button class="close-bio-modal">&times;</button>
        </div>
        <div class="artist-bio-content">
          <p>${escapeHTML(biography)}</p>
          <div class="bio-actions">
            <button class="btn-add-bio-to-description">📝 Lägg till i beskrivning</button>
            <button class="btn-close-bio">Stäng</button>
          </div>
        </div>
      </div>
    `;

        document.body.appendChild(modal);

        // Add event listeners
        const closeButtons = modal.querySelectorAll('.close-bio-modal, .btn-close-bio');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });

        const addToDescBtn = modal.querySelector('.btn-add-bio-to-description');
        addToDescBtn.addEventListener('click', () => {
            if (this.callbacks.onAddBioToDescription) {
                this.callbacks.onAddBioToDescription(biography);
            }
            document.body.removeChild(modal);
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // Inject styles
        this.injectArtistBioStyles();
    }

    injectArtistBioStyles() {
        if (!document.getElementById('artist-bio-styles')) {
            const style = document.createElement('style');
            style.id = 'artist-bio-styles';
            style.textContent = `
        /* Artist Biography Modal */
        .artist-bio-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
        }

        .artist-bio-modal {
          background: white;
          border-radius: 3px;
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          border: 1px solid #ddd;
        }

        .artist-bio-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #eee;
          background: #f5f5f5;
          border-radius: 3px 3px 0 0;
        }
        
        .artist-bio-header h3 {
          margin: 0;
          color: #333;
        }
        
        .close-bio-modal {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .close-bio-modal:hover {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 50%;
        }
        
        .artist-bio-content {
          padding: 20px;
        }
        
        .artist-bio-content p {
          line-height: 1.6;
          color: #333;
          margin-bottom: 20px;
        }
        
        .bio-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        
        .bio-actions button {
          padding: 8px 16px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.15s ease;
        }

        .btn-add-bio-to-description {
          background: #28a745;
          color: white;
        }

        .btn-add-bio-to-description:hover {
          background: #218838;
        }
        
        .btn-close-bio {
          background: #f5f5f5;
          color: #333;
        }
        
        .btn-close-bio:hover {
          background: #e0e0e0;
        }
      `;
            document.head.appendChild(style);
        }
    }

    /**
     * Remove unknown/unidentified artist phrases from a text value.
     * These terms belong exclusively in the artist field.
     */
    static stripUnknownArtistTerms(text) {
        if (!text || typeof text !== 'string') return text;

        const phrases = [
            'oidentifierad konstnär', 'okänd konstnär', 'okänd mästare',
            'oidentifierad formgivare', 'okänd formgivare', 'oidentifierad upphovsman'
        ];

        let changed = false;
        let cleaned = text;
        for (const phrase of phrases) {
            const regex = new RegExp(
                `[,;–—-]?\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,;–—-]?`,
                'gi'
            );
            const before = cleaned;
            cleaned = cleaned.replace(regex, (match) => {
                const hadLeadingSep = /^[,;–—-]/.test(match.trim());
                const hadTrailingSep = /[,;–—-]$/.test(match.trim());
                return (hadLeadingSep && hadTrailingSep) ? ', ' : ' ';
            });
            if (cleaned !== before) changed = true;
        }

        if (!changed) return text;

        return cleaned
            .replace(/,\s*,/g, ',')
            .replace(/^\s*,\s*/, '')
            .replace(/\s*,\s*$/, '')
            .replace(/[^\S\r\n]{2,}/g, ' ')
            .trim();
    }
}
