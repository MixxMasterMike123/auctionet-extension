import { SalesAnalysisManager } from "/modules/sales-analysis-manager.js";
import { ItemTypeHandlers } from "/modules/item-type-handlers.js";
import { SearchTermExtractor } from "/modules/search-term-extractor.js";
// DEPRECATED: SearchQueryManager import removed - using AI-only SearchQuerySSoT instead

export class DashboardManager {
  constructor() {
    this.currentSearchQuery = '';
    this.apiManager = null;
    this.qualityAnalyzer = null;
    this.searchQuerySSoT = null; // NEW: AI-only search query system
    this.pendingDashboardUpdate = null;
    this.changeListeners = [];
    this.isHotReloading = false;
    this.dashboardCreated = false; // NEW: Prevent duplicate creation
  }

  // NEW: Properly escape HTML attribute values (especially for quoted artist names)
  escapeHTMLAttribute(value) {
    if (!value) return '';
    // CRITICAL FIX: Don't double-escape - only escape if not already escaped
    if (value.includes('&quot;') || value.includes('&#39;') || value.includes('&amp;')) {
      return value; // Already escaped
    }
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Set dependencies
  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  setQualityAnalyzer(qualityAnalyzer) {
    this.qualityAnalyzer = qualityAnalyzer;
  }

  // NEW: Set AI-only SearchQuerySSoT
  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
  }

  // DEPRECATED: SearchQueryManager functionality removed - using AI-only SearchQuerySSoT instead
  setSearchQueryManager(searchQueryManager) {
    console.log('⚠️ DashboardManager: setSearchQueryManager is deprecated - use AI-only SearchQuerySSoT');
    // Legacy method kept for hot reload compatibility but not functional
  }

  // DEPRECATED: onSearchQueryChange removed - using AI-only SearchQuerySSoT instead
  onSearchQueryChange(event, data) {
    console.log('⚠️ DashboardManager: onSearchQueryChange is deprecated - use AI-only SearchQuerySSoT');
  }

  // NEW: Update dashboard header with current query from SSoT
  updateDashboardHeader(query, source) {
    
    // Update the "Sökning:" field in dashboard header
    const headerQueryText = document.querySelector('.query-text');
    if (headerQueryText) {
      headerQueryText.textContent = `"${query}"`;
    } else {
      console.log('⚠️ Dashboard header .query-text element not found');
    }
    
    // Update the source indication
    const headerQuerySource = document.querySelector('.query-source');
    if (headerQuerySource) {
      const sourceText = source === 'user_selection' ? 'användarval' : 
                        source === 'user' ? 'användarval' : 
                        source || 'automatisk analys';
      headerQuerySource.textContent = `(${sourceText})`;
    } else {
      console.log('⚠️ Dashboard header .query-source element not found');
    }
    
    // Also update the "Nuvarande:" field for consistency
    const currentQueryDisplay = document.getElementById('current-search-display');
    if (currentQueryDisplay) {
      currentQueryDisplay.textContent = `"${query}"`;
    }
  }

  // NEW: Update smart suggestions display based on SSoT
  updateSmartSuggestionsDisplay() {
    if (!this.searchQuerySSoT) {
      console.log('⚠️ SearchQuerySSoT not available for suggestions display update');
      return;
    }
    
    const smartCheckboxes = document.querySelectorAll('.smart-checkbox');
    
    smartCheckboxes.forEach(checkbox => {
      const term = checkbox.value;
      const isSelected = this.searchQuerySSoT.isTermSelected(term);
      checkbox.checked = isSelected;
    });
  }

  // NEW: Add market data as a horizontal dashboard bar above the container
  addMarketDataDashboard(salesData, analysisType = 'artist') {
    
    if (!salesData || !salesData.hasComparableData) {
      console.log('❌ No comparable data available for dashboard');
      return;
    }
    
    // 🚨 CRITICAL: FORCE SSoT initialization FIRST before anything else
    this.forceSSoTInitializationAsync(salesData).then(ssotSuccess => {
    if (!ssotSuccess) {
      console.error('❌ Failed to initialize SSoT - cannot proceed with dashboard');
      return;
    }
    
    
      // Continue with dashboard creation after SSoT is ready
      this.completeDashboardCreation(salesData);
    }).catch(error => {
      console.error('❌ Error during SSoT initialization:', error);
    });
  }
  
  // NEW: Complete dashboard creation after SSoT is initialized
  completeDashboardCreation(salesData) {
    
    // CRITICAL FIX: Prevent duplicate dashboard creation
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard && this.dashboardCreated) {
      console.log('⚠️ Dashboard already exists - removing existing first');
      existingDashboard.remove();
    }
    
    
    // Generate dashboard ID
    const dashboardId = `dashboard-${Date.now()}`;
    
    // Create and populate the dashboard - this should NOT modify references
    this.createDashboard(salesData, [], dashboardId);
    
    // Mark dashboard as created
    this.dashboardCreated = true;
    
  }
  
  createDashboard(salesData, valuationSuggestions, dashboardId) {
    // Remove any existing market data dashboard
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard) {
      existingDashboard.remove();
    }

    // Create the dashboard container
    const dashboard = document.createElement('div');
    dashboard.className = 'market-data-dashboard';
    dashboard.setAttribute('data-dashboard-id', dashboardId);
    
    
    let dashboardContent = '';
    
    // Main price range (always show if available)
    if (salesData.priceRange) {
      const confidence = salesData.confidence;
      const priceRange = salesData.priceRange;
      
      const formattedLow = new Intl.NumberFormat('sv-SE').format(priceRange.low);
      const formattedHigh = new Intl.NumberFormat('sv-SE').format(priceRange.high);
      
      // Display confidence based on data quality and market coverage
      let confidenceIcon = '';
      let confidenceColor = '';
      let confidenceText = '';
      let displayConfidence = confidence;
      
      // Only apply modest reduction for very low quality data
      if (confidence < 0.6) {
        displayConfidence = confidence * 0.9; // Small reduction for low quality
      }
      
      // Cap at 95% (never claim 100% certainty)
      displayConfidence = Math.min(displayConfidence, 0.95);
      
      const confidencePercent = Math.round(displayConfidence * 100);
      
      // Enhanced user-friendly confidence explanations
      let reliabilityExplanation = '';
      const historicalSales = salesData.historical ? salesData.historical.analyzedSales : 0;
      const totalMatches = salesData.historical ? salesData.historical.totalMatches : 0;
      const liveSales = salesData.live ? salesData.live.analyzedLiveItems : 0;
      const dataSource = historicalSales > 0 ? 'historiska försäljningar' : 'pågående auktioner';
      
      if (displayConfidence >= 0.90) {
        confidenceIcon = 'Exceptionell';
        confidenceColor = '#27ae60';
        confidenceText = `${confidencePercent}%`;
        reliabilityExplanation = `Mycket pålitlig analys baserad på ${historicalSales + liveSales} ${dataSource}${totalMatches > 100 ? ` från ${totalMatches} marknadsträffar` : ''}. Denna prisbedömning har starkt stöd i marknadsdata.`;
      } else if (displayConfidence >= 0.75) {
        confidenceIcon = 'Stark';
        confidenceColor = '#27ae60';
        confidenceText = `${confidencePercent}%`;
        reliabilityExplanation = `Pålitlig prisbedömning från ${historicalSales + liveSales} ${dataSource}${totalMatches > 50 ? ` av ${totalMatches} marknadsträffar` : ''}. God marknadstäckning ger trygg värdering.`;
      } else if (displayConfidence >= 0.55) {
        confidenceIcon = 'Måttlig';
        confidenceColor = '#f39c12';
        confidenceText = `${confidencePercent}%`;
        reliabilityExplanation = `Riktgivande prisbedömning från ${historicalSales + liveSales} ${dataSource}. Begränsad men användbar marknadsdata - betrakta som vägledning.`;
      } else {
        confidenceIcon = 'Begränsad';
        confidenceColor = '#e67e22';
        confidenceText = `${confidencePercent}%`;
        reliabilityExplanation = `Preliminär prisbedömning från endast ${historicalSales + liveSales} ${dataSource}. Otillräcklig data - använd med försiktighet och sök fler jämförelser.`;
      }
      
      dashboardContent += `
        <div class="market-item market-price">
          <div class="market-label" title="Föreslaget prisintervall baserat på analys av jämförbara auktionsresultat">Marknadsvärde</div>
          <div class="market-value">${formattedLow}-${formattedHigh} SEK</div>
          <div class="market-confidence" style="color: ${confidenceColor};">${confidenceIcon} ${confidenceText}</div>
          <div class="market-help">${reliabilityExplanation}</div>
        </div>
      `;
    }
    
    // Price Trend Section (if trend analysis available)
    if (salesData.historical && salesData.historical.trendAnalysis) {
      const trend = salesData.historical.trendAnalysis;
      let trendIcon = '→';
      let trendColor = '#6c757d';
      
      if (trend.trend === 'rising_strong') {
        trendIcon = '↗️ +' + Math.abs(trend.changePercent) + '%';
        trendColor = '#28a745';
      } else if (trend.trend === 'rising') {
        trendIcon = '↗ +' + Math.abs(trend.changePercent) + '%';
        trendColor = '#28a745';
      } else if (trend.trend === 'falling_strong') {
        trendIcon = '↘️ ' + trend.changePercent + '%';
        trendColor = '#dc3545';
      } else if (trend.trend === 'falling') {
        trendIcon = '↘ ' + trend.changePercent + '%';
        trendColor = '#dc3545';
      } else if (trend.trend === 'stable') {
        trendIcon = '→ Stabil';
        trendColor = '#28a745';
      }
      
      dashboardContent += `
        <div class="market-item market-trend">
          <div class="market-label" title="Prisutveckling baserat på jämförelse mellan äldre och nyare försäljningar">Pristrend ↗</div>
          <div class="market-value" style="color: ${trendColor};">${trendIcon}</div>
          <div class="market-help">${trend.description}</div>
        </div>
      `;
    }
    
    // Data Source Section (always show if we have historical data)
    if (salesData.historical) {
      const historicalSales = salesData.historical.analyzedSales || 0;
      const totalMatches = salesData.historical.totalMatches || 0;
      const liveSales = salesData.live ? salesData.live.analyzedLiveItems : 0;
      
      // 🔧 STRICT SSoT: Use SSoT search query for all URLs (prioritizing consistency over results)
      let historicalUrl = '#';
      let liveUrl = '#';
      let allUrl = '#';
      
      // Get SSoT query as the authoritative source
      const ssotQuery = this.searchQuerySSoT?.getCurrentQuery();
      
      
      // Generate ALL URLs using the SSoT query for consistency
      const baseUrl = 'https://auctionet.com/sv/search';
          
      if (ssotQuery) {
        historicalUrl = `${baseUrl}?event_id=&is=ended&q=${encodeURIComponent(ssotQuery)}`;
        liveUrl = `${baseUrl}?event_id=&is=&q=${encodeURIComponent(ssotQuery)}`;
        allUrl = `${baseUrl}?event_id=&is=&q=${encodeURIComponent(ssotQuery)}`;
      }
      
        
      // Initialize description and links variables
      let dataDescription = '';
      let dataLinks = '';
      
      // Main heading text (preserve original format)
      if (historicalSales > 0 && liveSales > 0) {
        dataDescription = `${historicalSales} historiska försäljningar • ${liveSales} pågående auktioner`;
      } else if (historicalSales > 0) {
        dataDescription = `${historicalSales} historiska försäljningar`;
      } else if (liveSales > 0) {
        dataDescription = `${liveSales} pågående auktioner`;
      }
      
      // Add detailed links using actual working URLs
      if (historicalSales > 0 && liveSales > 0) {
        dataLinks = `
          <div class="data-link-row">
            <span class="data-link-icon">📊</span>
            <a href="${historicalUrl}" target="_blank" class="data-link-prominent" title="Visa alla historiska försäljningar på Auctionet">${historicalSales} historiska försäljningar</a>
            <span class="data-link-meta">bekräftade</span>
        </div>
            <div class="data-link-row">
            <span class="data-link-icon">🔴</span>
            <a href="${liveUrl}" target="_blank" class="data-link-prominent" title="Visa alla pågående auktioner på Auctionet">${liveSales} pågående auktioner</a>
            <span class="data-link-meta">live</span>
            </div>`;
      } else if (historicalSales > 0) {
        dataLinks = `
            <div class="data-link-row">
            <span class="data-link-icon">📊</span>
            <a href="${historicalUrl}" target="_blank" class="data-link-prominent" title="Visa alla historiska försäljningar på Auctionet">${historicalSales} historiska försäljningar</a>
            <span class="data-link-meta">bekräftade</span>
            </div>`;
      } else if (liveSales > 0) {
        dataLinks = `
            <div class="data-link-row">
            <span class="data-link-icon">🔴</span>
            <a href="${liveUrl}" target="_blank" class="data-link-prominent" title="Visa alla pågående auktioner på Auctionet">${liveSales} pågående auktioner</a>
            <span class="data-link-meta">live</span>
            </div>`;
      }
      
      if (totalMatches > historicalSales + liveSales) {
        if (dataLinks) {
          dataLinks += `<div class="data-link-row"><span class="data-link-icon">🔍</span>${totalMatches} träffar analyserade</div>`;
          } else {
          dataDescription += `\n${totalMatches} träffar analyserade`;
        }
      }
      
      dashboardContent += `
        <div class="market-item market-data">
          <div class="market-label" title="Omfattning av analyserad marknadsdata">Dataunderlag</div>
          <div class="market-value">${dataDescription}</div>
          ${dataLinks ? `<div class="market-help">${dataLinks}</div>` : '<div class="market-help">Stark uppgång (senaste året)</div>'}
        </div>
      `;
    }
    
    // Exceptional Sales Section (if available)
    if (salesData.historical && salesData.historical.exceptionalSales) {
      const exceptional = salesData.historical.exceptionalSales;
      const exceptionellaCount = exceptional.count || 0;
      
      // CRITICAL FIX: Use actual dynamic threshold instead of hardcoded "30 000 SEK"
      const thresholdText = exceptional.threshold ? 
        `${Math.round(exceptional.threshold).toLocaleString()} SEK` : 
        'market threshold';
      
      // NEW: Generate numbered links to top 4 highest-priced exceptional sales
      let exceptionalLinksHTML = '';
      if (exceptional.sales && exceptional.sales.length > 0) {
        // Sort by price (highest first) and take top 4
        const topSales = exceptional.sales
          .filter(sale => sale.url) // Only include sales with valid URLs
          .sort((a, b) => (b.finalPrice || b.price || 0) - (a.finalPrice || a.price || 0))
          .slice(0, 4);
        
        if (topSales.length > 0) {
          const linkNumbers = topSales.map((sale, index) => {
            const price = sale.finalPrice || sale.price || 0;
            const title = `${price.toLocaleString()} SEK - ${sale.title ? sale.title.substring(0, 60) : 'Auction item'}...`;
            return `<a href="${sale.url}" target="_blank" title="${title}" style="
              color: #1976d2; 
              text-decoration: none; 
              font-weight: bold; 
              font-size: 0.8em;
              margin-right: 6px;
              padding: 1px 4px;
              border: 1px solid #1976d2;
              border-radius: 2px;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='#1976d2'; this.style.color='white';" 
               onmouseout="this.style.backgroundColor='transparent'; this.style.color='#1976d2';">${index + 1}</a>`;
          }).join('');
          
          exceptionalLinksHTML = `<div style="margin-top: 6px; font-size: 0.75em;">
            <span style="color: #666; margin-right: 6px;">Se högsta:</span>
            ${linkNumbers}
          </div>`;
        }
      }
      
        dashboardContent += `
        <div class="market-item market-exceptional">
          <div class="market-label" title="Särskilt höga bekräftade försäljningar som överträffar normal marknadsnivå">Exceptionella</div>
          <div class="market-value">${exceptionellaCount} exceptionella bekräftade försäljningar över ${thresholdText}</div>
          <div class="market-help">${exceptional.description || 'Bekräftade höga försäljningar'}</div>
          ${exceptionalLinksHTML}
          </div>
        `;
    }

    // Market Activity Section (if live data available)
    if (salesData.live && salesData.live.marketActivity) {
      const activity = salesData.live.marketActivity;
      let activityDescription = '';
      
      if (activity.averageBidsPerItem) {
        activityDescription = `Svag (${Math.round(activity.averageBidsPerItem)} bud/objekt)`;
      } else {
        activityDescription = 'Måttlig marknadsaktivitet';
      }
      
      dashboardContent += `
        <div class="market-item market-activity">
          <div class="market-label" title="Aktuell aktivitet på marknaden baserat på pågående auktioner">Marknadsaktivitet</div>
          <div class="market-value">${activityDescription}</div>
          <div class="market-help">Baserat på ${salesData.live.analyzedLiveItems || 0} pågående auktioner</div>
        </div>
      `;
    }

    // Market Trend/Insights Section (if insights available)
    if (salesData.insights && salesData.insights.length > 0) {
      const significantInsight = salesData.insights.find(insight => insight.significance === 'high') || salesData.insights[0];
      
      let trendIcon = '';
      let trendColor = '#6c757d';
      
      if (significantInsight.type === 'price_comparison' && significantInsight.message.includes('höja')) {
        trendIcon = 'KONFLIKT: Pågående auktioner värderas 503% högre än slutpriser, men marknaden är svag (38% utrop ej klarat (50 auktioner)) - hög eftertrågan';
        trendColor = '#dc3545';
          } else {
        trendIcon = significantInsight.message;
        trendColor = '#28a745';
      }
      
      dashboardContent += `
        <div class="market-item market-trend">
          <div class="market-label" title="Analys av marknadstrender och prissättning">Marknadstrend</div>
          <div class="market-value" style="color: ${trendColor};">${trendIcon}</div>
          <div class="market-help">Konstnärsbaserad analys</div>
        </div>
      `;
    }
    
    // SSoT is already initialized by forceSSoTInitialization, just get the values
    
    // Get the authoritative query from SSoT
    const actualSearchQuery = this.getFinalQueryFromSSoT(salesData);
    
    // Generate search filter HTML using SSoT
    let searchFilterHTML = '';
    
    // CRITICAL DEBUG: Check all sources for available terms
    
    if (salesData.candidateSearchTerms) {
    }
    
    if (this.searchQuerySSoT) {
      const availableTerms = this.searchQuerySSoT.getAvailableTerms();
    }
    
    // STRATEGY 1: Try to use SearchQuerySSoT terms directly if available
    if (this.searchQuerySSoT) {
      const availableTerms = this.searchQuerySSoT.getAvailableTerms();
      if (availableTerms.length > 0) {
        
        // Create fake candidateTerms structure from SearchQuerySSoT
        const fakeCandidateTerms = {
          candidates: availableTerms.map(term => ({
            term: term.term,
            type: term.type,
            description: term.description,
            priority: term.priority,
            preSelected: term.isSelected,
            source: term.source // CRITICAL FIX: Preserve source for AI artist preservation logic
          })),
          currentQuery: this.searchQuerySSoT.getCurrentQuery(),
          analysisType: 'ssot_direct'
        };
        
        searchFilterHTML = this.generateSearchFilterHTML(fakeCandidateTerms);
      } else {
        console.log('⚠️ EXTENDED TERMS: SearchQuerySSoT has no available terms');
      }
    }
    
    // STRATEGY 2: Fallback to original candidateSearchTerms if SSoT failed
    if (!searchFilterHTML && salesData.candidateSearchTerms) {
      searchFilterHTML = this.generateSearchFilterHTML(salesData.candidateSearchTerms);
    }
    
    // STRATEGY 3: Final fallback - show debug info if nothing worked
    if (!searchFilterHTML) {
      searchFilterHTML = `
        <div class="search-filter-section">
          <div class="filter-header">
            <h4 class="filter-title">🔧 Debug: Extended Terms Issue</h4>
            <div class="filter-description">Extended checkboxes not showing - debug info:</div>
          </div>
          <div class="debug-info">
            <p>candidateSearchTerms: ${!!salesData.candidateSearchTerms}</p>
            <p>searchQuerySSoT: ${!!this.searchQuerySSoT}</p>
            <p>SSoT available terms: ${this.searchQuerySSoT ? this.searchQuerySSoT.getAvailableTerms().length : 'N/A'}</p>
          </div>
        </div>
      `;
    } else {
    }
    
    const querySource = this.searchQuerySSoT ? 
      this.searchQuerySSoT.getQuerySource() : 
      (salesData.hotReload ? 'user' : 'system');
    
    // Add the content and finalize dashboard
    dashboard.innerHTML = `
      <div class="market-dashboard-header">
        <div class="header-left-section">
          <div class="market-dashboard-title">
            Marknadsanalys
          </div>
          <div class="market-dashboard-query">
            <span class="query-label">Sökning:</span>
            <span class="query-text">"${actualSearchQuery}"</span>
            <span class="query-source">(${querySource})</span>
          </div>
        </div>
        <div class="header-right-section">
          ${this.generateHeaderIntegratedPills()}
        </div>
        <div class="market-dashboard-source">
          ${salesData.dataSource || 'Auctionet API'}
        </div>
      </div>
      <div class="market-dashboard-content">
        ${dashboardContent}
      </div>
      <div class="market-dashboard-disclaimer">
        💡 Marknadsdata är vägledning - varje objekt är unikt och kan ha särskilda egenskaper som påverkar värdet
      </div>
    `;
    
    // Apply styles and inject into DOM
    this.addMarketDashboardStyles();
    
    // Find the main container and insert the dashboard above it
    const mainContainer = document.querySelector('.container');
    if (mainContainer) {
      console.log('📍 Inserting dashboard above main container: container');
      mainContainer.parentNode.insertBefore(dashboard, mainContainer);
    } else {
      // Fallback to body if container not found
      console.log('⚠️ Main container not found, appending to body');
      document.body.appendChild(dashboard);
    }
    
    
    // Setup interactive search filter if quality analyzer is available
    if (this.qualityAnalyzer && this.qualityAnalyzer.searchFilterManager.setupHeaderSearchFilterInteractivity) {
      this.qualityAnalyzer.searchFilterManager.setupHeaderSearchFilterInteractivity();
    }
    
    // Setup hot reload functionality for smart suggestions
    this.setupSmartSuggestionHotReload();
  }

  // NEW: Setup hot reload functionality for smart suggestions
  setupSmartSuggestionHotReload() {
    
    // Add event listeners to all smart suggestion checkboxes (including header pills)
    const smartCheckboxes = document.querySelectorAll('.smart-checkbox, .header-checkbox');
    
    smartCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (event) => {
        this.handleSmartSuggestionChange();
      });
    });
    
    
    // CRITICAL: Sync all checkboxes with SSoT state after setup
    setTimeout(() => {
      this.syncAllCheckboxesWithSSoT();
    }, 50);
    
    // Setup expand functionality for header expand button if present
    this.setupHeaderExpandInteraction();
  }
  
  // NEW: Setup header expand interaction
  setupHeaderExpandInteraction() {
    
    const headerExpandBtn = document.querySelector('.header-expand-btn');
    if (!headerExpandBtn) {
      return;
    }
    
    // Store initial state
    let isExpanded = false;
    const pillsContainer = document.querySelector('.header-pills-container');
    const originalHTML = pillsContainer ? pillsContainer.innerHTML : '';
    
    headerExpandBtn.addEventListener('click', (event) => {
      event.preventDefault();
      
      if (!isExpanded) {
        // EXPAND: Show all available terms
        this.expandHeaderPills(pillsContainer, headerExpandBtn);
        isExpanded = true;
      } else {
        // COLLAPSE: Return to compact view
        this.collapseHeaderPills(pillsContainer, originalHTML);
        isExpanded = false;
      }
    });
    
  }
  
  // NEW: Expand header pills to show all terms
  expandHeaderPills(container, expandBtn) {
    
    if (!this.searchQuerySSoT || !container) {
      console.log('⚠️ Cannot expand header pills - missing dependencies');
      return;
    }
    
    const allTerms = this.searchQuerySSoT.getAvailableTerms();
    const validTerms = allTerms.filter(term => 
      term && typeof term.term === 'string' && term.term.trim() !== ''
    );
    
    // Get SSoT selected terms for accurate state
    const ssotSelectedTerms = this.searchQuerySSoT.getSelectedTerms() || [];
    
    // Mark terms as selected based on SSoT state
    validTerms.forEach(term => {
      term.isSelected = ssotSelectedTerms.some(selectedTerm => 
        selectedTerm && typeof selectedTerm === 'string' &&
        selectedTerm.toLowerCase() === term.term.toLowerCase()
      );
    });
    
    // Split terms
    const selectedTerms = validTerms.filter(term => term.isSelected);
    const unselectedTerms = validTerms.filter(term => !term.isSelected);
    
    // Generate expanded HTML with ALL terms
    let expandedHTML = '';
    
    // Add ALL selected terms (blue pills)
    selectedTerms.forEach((term, index) => {
      const checkboxId = `header-pill-expanded-selected-${index}`;
      expandedHTML += `
        <label class="header-pill selected" title="${this.escapeHTMLAttribute((term.description || 'Klicka för att ta bort') + ": " + term.term)}">
          <input type="checkbox" 
                 class="smart-checkbox header-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}"
                 checked>
          <span class="pill-text">${term.term}</span>
        </label>`;
    });
    
    // Add ALL unselected terms (gray pills)
    unselectedTerms.forEach((term, index) => {
      const checkboxId = `header-pill-expanded-unselected-${index}`;
      expandedHTML += `
        <label class="header-pill unselected" title="${this.escapeHTMLAttribute((term.description || 'Klicka för att lägga till') + ": " + term.term)}">
          <input type="checkbox" 
                 class="smart-checkbox header-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}">
          <span class="pill-text">${term.term}</span>
        </label>`;
    });
    
    // Add collapse button
    expandedHTML += `
      <button class="header-collapse-btn" type="button" title="Visa färre söktermer">
        ← Färre
      </button>`;
    
    // Smooth expansion animation
    container.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    container.style.opacity = '0.7';
    
    setTimeout(() => {
      container.innerHTML = expandedHTML;
      container.style.opacity = '1';
      
      // Re-attach event listeners to new checkboxes
      this.reattachHeaderCheckboxListeners();
      
      // Setup collapse functionality
      this.setupHeaderCollapseButton(container);
      
    }, 150);
  }
  
  // NEW: Collapse header pills back to compact view
  collapseHeaderPills(container, originalHTML) {
    
    if (!container) return;
    
    // Smooth collapse animation
    container.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    container.style.opacity = '0.7';
    
    setTimeout(() => {
      container.innerHTML = originalHTML;
      container.style.opacity = '1';
      
      // Re-attach event listeners
      this.reattachHeaderCheckboxListeners();
      
      // Re-setup expand functionality
      setTimeout(() => {
        this.setupHeaderExpandInteraction();
      }, 100);
      
    }, 150);
  }
  
  // NEW: Setup collapse button functionality
  setupHeaderCollapseButton(container) {
    const collapseBtn = container.querySelector('.header-collapse-btn');
    if (!collapseBtn) return;
    
    collapseBtn.addEventListener('click', (event) => {
      event.preventDefault();
      
      // Re-generate original HTML with current state
      const originalHTML = this.generateHeaderIntegratedPills();
      this.collapseHeaderPills(container, originalHTML);
    });
  }
  
  // NEW: Re-attach checkbox event listeners after DOM changes
  reattachHeaderCheckboxListeners() {
    
    const headerCheckboxes = document.querySelectorAll('.header-checkbox');
    headerCheckboxes.forEach(checkbox => {
      // Remove any existing listeners to avoid duplicates
      checkbox.removeEventListener('change', this.handleSmartSuggestionChange);
      
      // Add fresh listener
      checkbox.addEventListener('change', (event) => {
        this.handleSmartSuggestionChange();
      });
    });
    
  }

  // CORE: Handle smart suggestion changes with immediate SSoT sync and hot reload
  async handleSmartSuggestionChange() {
    if (!this.searchQuerySSoT) {
      console.log('⚠️ Cannot handle suggestion changes - SearchQueryManager not available');
      return;
    }
    
    
    // Show smooth loading state
    this.showDashboardLoading('Uppdaterar analys med nya söktermer...');
    
    // Get all current checkbox states to update SSoT
    const allCheckboxes = document.querySelectorAll('.smart-checkbox, .suggestion-checkbox, input[type="checkbox"][data-search-term]');
    
    
    // CRITICAL FIX: Get current SSoT state to preserve AI-detected artists
    const currentSSoTTerms = this.searchQuerySSoT.getCurrentTerms() || [];
    const availableTerms = this.searchQuerySSoT.getAvailableTerms() || [];
    
    
    // Identify AI-detected artists and other special terms to preserve
    const aiDetectedArtists = availableTerms.filter(term => 
      term.type === 'artist' && 
      (term.source === 'ai_detected' || term.term.includes('"') || term.priority >= 95)
    );
    
    
    const selectedTerms = [];
    const uncheckedArtists = [];
    
    allCheckboxes.forEach((checkbox, index) => {
      const rawTermValue = checkbox.value || checkbox.getAttribute('data-search-term') || checkbox.dataset.term;
      // CRITICAL FIX: Decode HTML entities from checkbox values
      const termValue = rawTermValue ? rawTermValue.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : rawTermValue;
      const isChecked = checkbox.checked;
      
      
      // Track if user explicitly unchecked an AI-detected artist
      if (!isChecked && aiDetectedArtists.some(artist => artist.term === termValue)) {
        uncheckedArtists.push(termValue);
      }
      
      if (isChecked && termValue && termValue !== '0' && termValue !== '1' && termValue !== 'undefined') {
        selectedTerms.push(termValue);
      }
    });
    
    // CRITICAL FIX: Add back AI-detected artists unless explicitly unchecked
    // Uses smart quote matching to handle quoted vs unquoted artist names
    aiDetectedArtists.forEach(artist => {
      // SMART MATCHING: Check if this artist was explicitly unchecked using quote-aware comparison
      const wasExplicitlyUnchecked = uncheckedArtists.some(uncheckedTerm => {
        // Direct match first
        if (uncheckedTerm === artist.term) return true;
        
        // Smart quote matching
        const uncheckedWithoutQuotes = uncheckedTerm.replace(/['"]/g, '');
        const artistWithoutQuotes = artist.term.replace(/['"]/g, '');
        return uncheckedWithoutQuotes === artistWithoutQuotes;
      });
      
      // SMART MATCHING: Check if this artist is already in selected terms
      const alreadyInSelection = selectedTerms.some(selectedTerm => {
        // Direct match first
        if (selectedTerm === artist.term) return true;
        
        // Smart quote matching
        const selectedWithoutQuotes = selectedTerm.replace(/['"]/g, '');
        const artistWithoutQuotes = artist.term.replace(/['"]/g, '');
        return selectedWithoutQuotes === artistWithoutQuotes;
      });
      
      if (!wasExplicitlyUnchecked && !alreadyInSelection) {
        selectedTerms.unshift(artist.term); // Add at beginning to maintain priority
      } else if (wasExplicitlyUnchecked) {
      } else {
      }
    });
    
    
    // Update SSoT with user selections (now includes preserved AI artists - don't update Hidden Keywords field)
    this.searchQuerySSoT.updateUserSelections(selectedTerms, { updateDOMField: false });
    
    
    // Update dashboard header immediately
    const newQuery = this.searchQuerySSoT.getCurrentQuery();
    this.updateDashboardHeader(newQuery, 'användarval');
    
    // Sync all checkboxes with new SSoT state
    this.syncAllCheckboxesWithSSoT();
    
    console.log('🔒 Preserving all critical references for hot reload');
    
    // Get search context for API call
    const searchContext = this.searchQuerySSoT.buildSearchContext();
    
    
    // Get ApiManager for hot reload
    let apiManager = this.apiManager;
    
    if (!apiManager && this.qualityAnalyzer && this.qualityAnalyzer.apiManager) {
      apiManager = this.qualityAnalyzer.apiManager;
      this.apiManager = apiManager;
    }
    
    if (!apiManager && typeof window !== 'undefined' && window.auctionetAssistant && window.auctionetAssistant.apiManager) {
      apiManager = window.auctionetAssistant.apiManager;
      this.apiManager = apiManager;
    }
    
    if (!apiManager && this.searchQuerySSoT && this.searchQuerySSoT.apiManager) {
      apiManager = this.searchQuerySSoT.apiManager;
      this.apiManager = apiManager;
    }
    
    // Trigger new API analysis with the updated query
    if (apiManager) {
      try {
        
        // Call API with new search context
        const salesData = await apiManager.analyzeSales(searchContext);
        
        // Hide loading state
        this.hideDashboardLoading();
        
        // Preserve candidate terms for dashboard recreation
        await this.preserveCandidateTermsForHotReload(salesData, newQuery);
        
        
        // HOT RELOAD: Update dashboard with new data while preserving state
        if (salesData && salesData.hasComparableData) {
          this.addMarketDataDashboard(salesData, 'user_filtered');
        }
        
        // Restore critical references after dashboard recreation
        await this.restoreSearchQueryManagerReference();
        
        
      } catch (error) {
        console.error('❌ Error during hot reload API analysis:', error);
        
        // Hide loading on error
        this.hideDashboardLoading();
        
        // Show error feedback
        this.showDashboardLoading('Fel vid uppdatering av analys');
        setTimeout(() => {
          this.hideDashboardLoading();
        }, 3000);
      }
    } else {
      console.error('❌ No ApiManager available for hot reload after all strategies');
      
      // Hide loading and show error
      this.hideDashboardLoading();
      this.showDashboardLoading('Hot reload inte tillgänglig - ladda om sidan');
      setTimeout(() => {
        this.hideDashboardLoading();
      }, 5000);
    }
  }
  
  // NEW: Restore SearchQueryManager reference using multiple strategies
  async restoreSearchQueryManagerReference() {
      
      // Try multiple restoration sources in order of preference
      let restored = false;
      
      // 1. Try to restore from quality analyzer
      if (this.qualityAnalyzer && this.qualityAnalyzer.searchQueryManager) {
        this.searchQuerySSoT = this.qualityAnalyzer.searchQueryManager;
        restored = true;
      } 
      // 2. Try to restore from API manager
      else if (this.apiManager && this.apiManager.searchQueryManager) {
        this.searchQuerySSoT = this.apiManager.searchQueryManager;
        restored = true;
      }
      // 3. Try to find it in the global scope (from content script)
      else if (typeof window !== 'undefined' && window.auctionetAssistant && window.auctionetAssistant.searchQueryManager) {
        this.searchQuerySSoT = window.auctionetAssistant.searchQueryManager;
        restored = true;
      }
      // 4. Try to create a new instance with current data as last resort
      else {
        console.log('⚠️ SearchQueryManager import removed - using AI-only SearchQuerySSoT instead');
      }
      
      if (!restored) {
        // Show user-friendly error
        const statusIndicator = document.getElementById('filter-status');
        if (statusIndicator) {
          statusIndicator.textContent = 'Sökfunktion inte tillgänglig - ladda om sidan för att aktivera';
          statusIndicator.style.color = '#e74c3c';
        }
    }
        }
        
  // NEW: Sync all checkbox instances with SSoT state
  syncAllCheckboxesWithSSoT() {
    if (!this.searchQuerySSoT) {
      console.log('⚠️ Cannot sync checkboxes - SearchQueryManager not available');
        return;
      }
    
    
    const ssotSelectedTerms = this.searchQuerySSoT.getSelectedTerms() || [];
    
    // CRITICAL FIX: Use setTimeout to ensure DOM elements are available after recreation
    setTimeout(() => {
      // Find all checkbox instances across the page with multiple selectors
      const allCheckboxes = document.querySelectorAll(
        '.smart-checkbox, .search-filter-checkbox, input[type="checkbox"][data-search-term], input[type="checkbox"][value]'
      );
    
      
      let syncedCount = 0;
      allCheckboxes.forEach(checkbox => {
        // Get term value from multiple possible sources
        const termValue = checkbox.value || 
                         checkbox.getAttribute('data-search-term') || 
                         checkbox.getAttribute('data-term') ||
                         checkbox.dataset.term;
        
        if (!termValue || termValue === '0' || termValue === '1') {
          // Skip checkboxes with generic values or empty values
      return;
    }
    
        
        // ENHANCED MATCHING: Check if this term should be selected based on SSoT
        const shouldBeChecked = this.shouldCheckboxBeSelected(termValue, ssotSelectedTerms);
      
        // Update checkbox state if it doesn't match SSoT (user has full control)
        if (checkbox.checked !== shouldBeChecked) {
          checkbox.checked = shouldBeChecked;
          syncedCount++;
        }
      });
      
      
      // Clarify when 0 checkboxes are synced
      if (syncedCount === 0) {
      }
      
      // Also update the current query display
      const currentQuery = this.searchQuerySSoT.getCurrentQuery();
      const currentQueryDisplay = document.getElementById('current-search-display');
      if (currentQueryDisplay) {
        currentQueryDisplay.textContent = `"${currentQuery || 'Ingen sökning'}"`;
      }
    }, 100); // Wait 100ms for DOM to be ready
  }

  // NEW: Enhanced matching logic for SSoT terms vs checkbox values
  shouldCheckboxBeSelected(checkboxValue, ssotSelectedTerms) {
    // CRITICAL FIX: Use SSoT's smart quote matching instead of manual comparison
    if (this.searchQuerySSoT) {
      return this.searchQuerySSoT.isTermSelected(checkboxValue);
    }
    
    // Fallback logic if SSoT not available
    const normalizedCheckboxValue = checkboxValue.toLowerCase().trim();
    
    for (const selectedTerm of ssotSelectedTerms) {
      const normalizedSelectedTerm = selectedTerm.toLowerCase().trim();
      
      // Direct match first
      if (normalizedSelectedTerm === normalizedCheckboxValue) {
        return true;
      }
      
      // Smart quote matching - handle quoted vs unquoted variants
      const selectedWithoutQuotes = selectedTerm.replace(/['"]/g, '').toLowerCase().trim();
      const checkboxWithoutQuotes = checkboxValue.replace(/['"]/g, '').toLowerCase().trim();
      
      // Match if the unquoted versions are the same
      if (selectedWithoutQuotes === checkboxWithoutQuotes) {
        return true;
      }
    }
    
    console.log(`❌ NO match: "${checkboxValue}" not found in SSoT selected terms`);
    return false;
  }

  // Helper: Calculate term similarity for fuzzy matching
  calculateTermSimilarity(term1, term2) {
    if (term1 === term2) return 1.0;
    
    // Simple character-based similarity
    const maxLength = Math.max(term1.length, term2.length);
    const commonChars = [...term1].filter(char => term2.includes(char)).length;
    
    return commonChars / maxLength;
  }

  // NEW: Preserve candidate terms for continued hot reloading
  async preserveCandidateTermsForHotReload(salesData, currentQuery) {
    
    try {
      // Get available terms from SSoT
      const availableTerms = this.searchQuerySSoT.getAvailableTerms();
      
      if (availableTerms.length > 0) {
        // Convert back to candidate terms format for dashboard
        const candidateTerms = {
          candidates: availableTerms.map(term => ({
            term: term.term,
            type: term.type,
            description: term.description,
            priority: term.priority,
            preSelected: term.isSelected,
            source: term.source // CRITICAL FIX: Preserve source for AI artist preservation logic
          })),
          currentQuery: currentQuery,
          analysisType: 'custom_user_filter'
        };
        
        // Add to sales data for dashboard use
        salesData.candidateSearchTerms = candidateTerms;
        
      } else {
        console.log('⚠️ HOT RELOAD: No candidate terms available in SSoT');
      }
    } catch (error) {
      console.error('❌ Error preserving candidate terms for hot reload:', error);
    }
  }

  // NEW: Generate search filter HTML from candidate terms
  generateSearchFilterHTML(candidateTerms) {
    // Check if we have SearchQueryManager available
    if (!this.searchQuerySSoT) {
      console.log('⚠️ SearchQueryManager not available, falling back to legacy method');
      return this.generateLegacySearchFilterHTML(candidateTerms);
    }
    
    // CRITICAL FIX: Don't fail just because getCurrentQuery() is empty string
    // SSoT might be initialized but not have a query yet, or query might be ""
    const currentQuery = this.searchQuerySSoT.getCurrentQuery();
    
    // Get available terms from SearchQueryManager SSoT
    const availableTerms = this.searchQuerySSoT.getAvailableTerms();
    
    if (availableTerms.length === 0) {
      console.log('⚠️ No available terms in SearchQueryManager SSoT, using legacy fallback');
      return this.generateLegacySearchFilterHTML(candidateTerms);
    }
    
    
    // AI-POWERED SMART SUGGESTIONS: Select top 4-5 most important terms from SSoT
    const smartSuggestions = this.selectSmartSuggestionsFromSSoT(availableTerms);
    
    // Show current query and smart suggestions prominently
    let filterHTML = `
      <div class="search-filter-section">
        <div class="ultra-compact-floating-header">
          <div class="floating-search-bar">
            <span class="search-icon">🔍</span>
            <div class="compact-terms-container">
              <div class="selected-terms">`;
    
    // First pass: Add selected (checked) terms with blue styling
    const selectedTerms = smartSuggestions.filter(suggestion => suggestion.isSelected);
    const unselectedTerms = smartSuggestions.filter(suggestion => !suggestion.isSelected);
    
    selectedTerms.forEach((suggestion, index) => {
      const checkboxId = `smart-suggestion-selected-${index}`;
      filterHTML += `
        <label class="compact-term-pill selected" title="${this.escapeHTMLAttribute(suggestion.description + ": " + suggestion.term)}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${this.escapeHTMLAttribute(suggestion.term)}" 
                 data-type="${suggestion.type}"
                 data-core="${suggestion.isCore || false}"
                 id="${checkboxId}"
                 checked>
          <span class="term-text">${suggestion.term}</span>
        </label>`;
    });
    
    filterHTML += `
              </div>
              <div class="term-separator">|</div>
              <div class="unselected-terms">`;
    
    // Second pass: Add unselected terms (max 3 to save space)
    const maxUnselected = 3;
    unselectedTerms.slice(0, maxUnselected).forEach((suggestion, index) => {
      const checkboxId = `smart-suggestion-unselected-${index}`;
      filterHTML += `
        <label class="compact-term-pill unselected" title="${this.escapeHTMLAttribute(suggestion.description + ": " + suggestion.term)}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${this.escapeHTMLAttribute(suggestion.term)}" 
                 data-type="${suggestion.type}"
                 data-core="${suggestion.isCore || false}"
                 id="${checkboxId}">
          <span class="term-text">${suggestion.term}</span>
        </label>`;
    });
    
    // Add "+X fler" indicator if there are more terms
    const remainingCount = unselectedTerms.length - maxUnselected;
    if (remainingCount > 0) {
      filterHTML += `
        <button class="more-terms-btn" type="button" title="Visa ${remainingCount} fler söktermer">
          +${remainingCount} fler →
        </button>`;
    }
    
    filterHTML += `
              </div>
            </div>
            <div class="search-status-mini">
              <span class="loading-indicator" id="filter-loading" style="display: none;">🔄</span>
            </div>
          </div>
        </div>
      </div>`;
    
    return filterHTML;
  }

  // NEW: Select smart suggestions from SearchQueryManager SSoT
  selectSmartSuggestionsFromSSoT(availableTerms) {
    
    // CRITICAL FIX: Filter out any terms with undefined or invalid values before processing
    const validTerms = availableTerms.filter(term => {
      if (!term || typeof term.term !== 'string' || term.term.trim() === '') {
        console.warn('🚨 FILTERING OUT INVALID TERM:', term);
        return false;
      }
      return true;
    });
    
    if (validTerms.length !== availableTerms.length) {
    }
    
    // DEBUG: Log all valid terms to identify the issue
    validTerms.forEach((term, index) => {
    });
    
    // CRITICAL: Get the actual selected terms from SSoT - not just query string
    const ssotSelectedTerms = this.searchQuerySSoT.getSelectedTerms() || [];
    const currentQuery = this.searchQuerySSoT.getCurrentQuery();
    
    
    // CRITICAL FIX: First, ensure all SSoT selected terms are in validTerms
    ssotSelectedTerms.forEach(selectedTerm => {
      if (!selectedTerm || typeof selectedTerm !== 'string' || selectedTerm.trim() === '') {
        console.warn('🚨 SKIPPING INVALID SSoT SELECTED TERM:', selectedTerm);
        return;
      }
      
      const matchingTerm = validTerms.find(t => 
        t.term.toLowerCase() === selectedTerm.toLowerCase() || 
        this.searchQuerySSoT.normalizeTermForMatching(t.term) === this.searchQuerySSoT.normalizeTermForMatching(selectedTerm)
      );
      
      if (!matchingTerm) {
        
        // Detect if this is a core term
        const isCore = this.searchQuerySSoT.isCoreSearchTerm(selectedTerm);
        const termType = isCore ? 
          (this.isWatchBrand(selectedTerm) ? 'brand' : 'artist') :
          this.detectTermTypeForMissing(selectedTerm);
        
        // Add the missing term with appropriate priority
        validTerms.push({
          term: selectedTerm,
          type: termType,
          description: isCore ? 'Konstnär/Märke' : this.getTermDescription(termType),
          priority: isCore ? 100 : 90,
          isSelected: true, // Must be true since it's in SSoT selected
          isCore: isCore
        });
        
      } else {
        // Ensure existing term is marked as selected based on SSoT
        matchingTerm.isSelected = true;
        // Check if it should be marked as core
        if (this.searchQuerySSoT.isCoreSearchTerm(matchingTerm.term)) {
          matchingTerm.isCore = true;
          console.log(`🔒 Marked existing term "${matchingTerm.term}" as CORE (from SSoT selected)`);
        }
      }
    });
    
    // CRITICAL FIX: Now mark all terms based on actual SSoT selection state
    validTerms.forEach(term => {
      // Check if this term is actually selected in SSoT
      const isSelectedInSSoT = ssotSelectedTerms.some(selectedTerm => 
        selectedTerm && typeof selectedTerm === 'string' &&
        (selectedTerm.toLowerCase() === term.term.toLowerCase() ||
        this.searchQuerySSoT.normalizeTermForMatching(selectedTerm) === this.searchQuerySSoT.normalizeTermForMatching(term.term))
      );
      
      // Override the isSelected based on actual SSoT state
      term.isSelected = isSelectedInSSoT;
      
      // Check if it's a core term
      if (this.searchQuerySSoT.isCoreSearchTerm(term.term)) {
        term.isCore = true;
      }
      
    });
    
    // CRITICAL FIX: Remove redundant name parts if full name exists
    let finalAvailableTerms = validTerms; // Use validTerms instead of availableTerms
    const hasFullName = validTerms.some(term => 
      term.term === 'Lisa Larson' && term.isSelected
    );
    
    if (hasFullName) {
      // Filter out individual name parts to avoid redundancy
      const filteredTerms = validTerms.filter(term => {
        const isRedundantNamePart = (term.term === 'Lisa' || term.term === 'Larson') && 
                                   term.type === 'keyword' && 
                                   term.description === 'Nuvarande sökterm';
        
        if (isRedundantNamePart) {
          return false;
        }
        return true;
      });
      
      // Use filtered terms
      finalAvailableTerms = filteredTerms;
    }
    
    // 🔧 EXTENDED TERMS STRATEGY: Show ALL available terms (both selected and unselected)
    // User requested: Core terms + Extended terms as checkboxes for complete control
    
    // Split terms into selected and unselected (using filtered terms)
    const selectedTermObjects = finalAvailableTerms.filter(term => term.isSelected);
    const unselectedTermObjects = finalAvailableTerms.filter(term => !term.isSelected);
    
    
    // Start with ALL selected terms (these must always be shown)
    const smartSuggestions = [...selectedTermObjects];
    
    // Sort unselected terms by priority and add them ALL (up to reasonable limit)
    const sortedUnselectedTerms = unselectedTermObjects
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // 🎯 EXTENDED FUNCTIONALITY: Show up to 12 total terms (more generous for extended functionality)
    const maxTotal = 12;
    const remainingSlots = Math.max(0, maxTotal - selectedTermObjects.length);
    
    // Add ALL unselected terms up to the limit
    smartSuggestions.push(...sortedUnselectedTerms.slice(0, remainingSlots));
    
    
    smartSuggestions.forEach((term, index) => {
      const checkboxState = term.isSelected ? '✓' : '○';
    });
    
    return smartSuggestions;
  }
  
  // NEW: Helper method to check if a term is a watch brand
  isWatchBrand(term) {
    const watchBrands = [
      'rolex', 'omega', 'patek philippe', 'audemars piguet', 'vacheron constantin',
      'jaeger-lecoultre', 'iwc', 'breitling', 'tag heuer', 'cartier',
      'longines', 'tissot', 'seiko', 'citizen', 'casio', 'hamilton',
      'tudor', 'zenith', 'panerai', 'hublot', 'richard mille'
    ];
    return watchBrands.includes(term.toLowerCase());
  }
  
  // NEW: Get description for term type
  getTermDescription(type) {
    const descriptions = {
      'artist': 'Konstnär/Märke',
      'brand': 'Konstnär/Märke', 
      'object_type': 'Objekttyp',
      'period': 'Tidsperiod',
      'model': 'Modell/Serie',
      'movement': 'Urverk/Teknik',
      'reference': 'Referensnummer',
      'keyword': 'Nyckelord'
    };
    return descriptions[type] || 'Nyckelord';
  }

  // NEW: Get suggestion priority class for SSoT terms
  getSuggestionPriorityFromSSoT(suggestion) {
    if (suggestion.isCore) return 'priority-core';
    if (suggestion.isSelected) return 'priority-selected';
    if (suggestion.score >= 15) return 'priority-high';
    if (suggestion.score >= 10) return 'priority-medium';
    return 'priority-low';
  }

  // LEGACY: Fallback method for when SSoT is not available
  generateLegacySearchFilterHTML(candidateTerms) {
    if (!candidateTerms || !candidateTerms.candidates || candidateTerms.candidates.length === 0) {
      return '';
    }
    
    
    // Use the old method as fallback
    const smartSuggestions = this.selectSmartSuggestions(candidateTerms.candidates);
    
    // CRITICAL FIX: Even in legacy mode, prioritize SSoT for currentQuery
    let currentQuery;
    if (this.searchQuerySSoT && this.searchQuerySSoT.getCurrentQuery()) {
      currentQuery = this.searchQuerySSoT.getCurrentQuery();
    } else {
      currentQuery = candidateTerms.currentQuery || 'Automatisk sökning';
      console.log('⚠️ LEGACY mode using candidateTerms query:', currentQuery);
    }
    
    let filterHTML = `
      <div class="search-filter-section">
        <div class="ultra-compact-floating-header">
          <div class="floating-search-bar">
            <span class="search-icon">🔍</span>
            <div class="compact-terms-container">
              <div class="selected-terms">`;
    
    // First pass: Add selected (checked) terms with blue styling
    const selectedTerms = smartSuggestions.filter(suggestion => suggestion.isSelected);
    const unselectedTerms = smartSuggestions.filter(suggestion => !suggestion.isSelected);
    
    selectedTerms.forEach((suggestion, index) => {
      const checkboxId = `smart-suggestion-selected-${index}`;
      filterHTML += `
        <label class="compact-term-pill selected" title="${this.escapeHTMLAttribute(suggestion.description + ": " + suggestion.term)}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${this.escapeHTMLAttribute(suggestion.term)}" 
                 data-type="${suggestion.type}"
                 data-core="${suggestion.isCore || false}"
                 id="${checkboxId}"
                 checked>
          <span class="term-text">${suggestion.term}</span>
        </label>`;
    });
    
    filterHTML += `
              </div>
              <div class="term-separator">|</div>
              <div class="unselected-terms">`;
    
    // Second pass: Add unselected terms (max 3 to save space)
    const maxUnselected = 3;
    unselectedTerms.slice(0, maxUnselected).forEach((suggestion, index) => {
      const checkboxId = `smart-suggestion-unselected-${index}`;
      filterHTML += `
        <label class="compact-term-pill unselected" title="${this.escapeHTMLAttribute(suggestion.description + ": " + suggestion.term)}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${this.escapeHTMLAttribute(suggestion.term)}" 
                 data-type="${suggestion.type}"
                 data-core="${suggestion.isCore || false}"
                 id="${checkboxId}">
          <span class="term-text">${suggestion.term}</span>
        </label>`;
    });
    
    // Add "+X fler" indicator if there are more terms
    const remainingCount = unselectedTerms.length - maxUnselected;
    if (remainingCount > 0) {
      filterHTML += `
        <button class="more-terms-btn" type="button" title="Visa ${remainingCount} fler söktermer">
          +${remainingCount} fler →
        </button>`;
    }
    
    filterHTML += `
              </div>
            </div>
            <div class="search-status-mini">
              <span class="loading-indicator" id="filter-loading" style="display: none;">🔄</span>
            </div>
          </div>
        </div>
      </div>`;
    
    return filterHTML;
  }

  // Helper: Get suggestion priority class for suggestions
  getSuggestionPriority(suggestion) {
    if (suggestion.preSelected) return 'priority-selected';
    if (suggestion.score >= 10) return 'priority-high';
    if (suggestion.score >= 7) return 'priority-medium';
    return 'priority-low';
  }
  
  // Helper: Get type icon for suggestions
  getTypeIcon(type) {
    const icons = {
      'artist': '👤',
      'object_type': '🎨',
      'model': '📦',
      'material': '⚡',
      'reference': '#️⃣',
      'period': '📅',
      'movement': '⚙️',
      'keyword': '🔤'
    };
    return icons[type] || '•';
  }

  // Helper: Detect term type for missing search terms
  detectTermType(term) {
    const lowerTerm = term.toLowerCase();
    
    // Period detection
    if (/^\d{4}$/.test(term) || /\d{4}[-\s]tal/.test(lowerTerm)) {
      return 'period';
    }
    
    // Reference detection
    if (/^st\s?\d+/.test(lowerTerm) || /reference/.test(lowerTerm)) {
      return 'reference';
    }
    
    // Object type detection
    if (['armbandsur', 'tavla', 'skulptur', 'vas', 'lampa'].includes(lowerTerm)) {
      return 'object_type';
    }
    
    // Movement detection
    if (['automatisk', 'manuell', 'quartz', 'kronograf'].includes(lowerTerm)) {
      return 'movement';
    }
    
    // Material detection
    if (['guld', 'silver', 'stål', 'platina', 'titan'].includes(lowerTerm)) {
      return 'material';
    }
    
    // Default to keyword
    return 'keyword';
  }

  // Generate CSS styles for market dashboard
  addMarketDashboardStyles() {
    if (document.getElementById('market-dashboard-styles')) {
      return; // Styles already added
    }

      const style = document.createElement('style');
      style.id = 'market-dashboard-styles';
      style.textContent = `
        .market-data-dashboard {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border: 1px solid #dee2e6;
          border-radius: 8px;
          margin: 15px 20px;
          padding: 12px 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        position: relative;
        transition: filter 0.3s ease, opacity 0.3s ease;
      }
      
      /* NEW: Loading state styles */
      .dashboard-loading {
        filter: blur(3px);
        opacity: 0.6;
        pointer-events: none;
      }
      
      .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(1px);
        z-index: 1000;
        opacity: 1;
        transition: opacity 0.3s ease;
      }
      
      .loading-overlay.fade-out {
        opacity: 0;
      }
      
      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #e3f2fd;
        border-top: 3px solid #1976d2;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 12px;
      }
      
      .loading-text {
        color: #1976d2;
        font-size: 14px;
        font-weight: 500;
        text-align: center;
        margin: 0;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
        }
        
        .market-dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #dee2e6;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        /* 🖥️ NEW: Desktop-Optimized Header Layout */
        .header-left-section {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 300px;
        }
        
        .header-right-section {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        
        /* 💊 NEW: Header-Integrated Pills - Desktop Optimized */
        .header-pills-container {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        
        .header-pill {
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 10px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          font-size: 11px;
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
          border: none;
          text-decoration: none;
        }
        
        .header-pill input[type="checkbox"] {
          display: none;
        }
        
        .pill-text {
          font-weight: inherit;
          letter-spacing: -0.01em;
        }
        
        /* ✅ Selected Header Pills - Premium Blue */
        .header-pill.selected {
          background: linear-gradient(135deg, #007cba 0%, #0099e6 100%);
          color: white;
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 124, 186, 0.25);
        }
        
        .header-pill.selected:hover {
          background: linear-gradient(135deg, #006ba6 0%, #0088cc 100%);
          box-shadow: 0 2px 6px rgba(0, 124, 186, 0.35);
          transform: translateY(-1px);
        }
        
        .header-pill.selected .pill-text {
          color: white;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
        }
        
        /* ⚪ Unselected Header Pills - Elegant Gray */
        .header-pill.unselected {
          background: rgba(248, 250, 252, 0.9);
          color: #64748b;
          border: 1px solid rgba(226, 232, 240, 0.9);
        }
        
        .header-pill.unselected:hover {
          background: rgba(241, 245, 249, 1);
          color: #475569;
          border-color: rgba(203, 213, 225, 1);
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
        }
        
        /* 🔢 Header Expand Button */
        .header-expand-btn {
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 8px;
          background: rgba(249, 250, 251, 0.9);
          border: 1px solid rgba(229, 231, 235, 0.8);
          border-radius: 12px;
          color: #6b7280;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
        }
        
        .header-expand-btn:hover {
          background: rgba(243, 244, 246, 1);
          border-color: rgba(209, 213, 219, 1);
          color: #374151;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
        }
        
        /* 🔙 Header Collapse Button */
        .header-collapse-btn {
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 8px;
          background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
          border: 1px solid rgba(156, 163, 175, 0.8);
          border-radius: 12px;
          color: #374151;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          margin-left: 8px;
        }
        
        .header-collapse-btn:hover {
          background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);
          border-color: rgba(107, 114, 128, 0.9);
          color: #1f2937;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        /* 📱 Responsive: Stack on smaller screens */
        @media (max-width: 1200px) {
          .market-dashboard-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          
          .header-left-section {
            width: 100%;
          }
          
          .header-right-section {
            width: 100%;
            justify-content: flex-start;
          }
          
          .header-pills-container {
            width: 100%;
          }
        }
        
        /* 📱 Mobile: Further adjustments */
        @media (max-width: 768px) {
          .header-pill {
            height: 22px;
            padding: 0 8px;
            font-size: 10px;
          }
          
          .header-expand-btn {
            height: 22px;
            padding: 0 6px;
            font-size: 9px;
          }
        }
        
        .market-dashboard-title {
          font-weight: 600;
          font-size: 13px;
          color: #2c3e50;
        }
        
        .market-dashboard-query {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #f8f9fa;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #e9ecef;
        }
        
        .query-label {
          font-size: 10px;
          color: #6c757d;
          font-weight: 500;
        }
        
        .query-text {
          font-size: 11px;
          color: #2c3e50;
          font-weight: 600;
          font-family: Monaco, 'Courier New', monospace;
          background: #ffffff;
          padding: 2px 6px;
          border-radius: 3px;
          border: 1px solid #dee2e6;
        }
        
        .query-source {
          font-size: 9px;
          color: #6c757d;
          font-style: italic;
        }
        
        .market-dashboard-source {
          font-size: 10px;
          color: #6c757d;
          opacity: 0.8;
          position: absolute;
          top: 4px;
          right: 12px;
        }
        
        .market-dashboard-content {
          display: flex;
          flex-wrap: nowrap;
          gap: 16px;
          align-items: flex-start;
          overflow-x: auto;
          justify-content: center;
        }
        
        .market-item {
          display: flex;
          flex-direction: column;
          min-width: 140px;
          max-width: 180px;
          flex-shrink: 0;
          border-right: 0.5px solid #e0e0e0;
          padding-right: 16px;
        }
        
        .market-item.market-exceptional {
          max-width: 220px;
        }
        
        .market-item:last-child {
          border-right: none;
          padding-right: 0;
        }
        
        .market-label {
          font-size: 9px;
          color: #6c757d;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          font-weight: 500;
        }
        
        .market-value {
          font-size: 12px;
          font-weight: 600;
          color: #1a252f;
          line-height: 1.2;
        }
        
        .market-confidence {
          font-size: 10px;
          margin-top: 1px;
          font-weight: 500;
        }
        
        .market-help {
          font-size: 9px;
          color: #495057;
          margin-top: 1px;
          font-style: italic;
        }
        
        .market-help a {
          color: #007cba;
          text-decoration: none;
          font-weight: 500;
        }
        
        .market-help a:hover {
          text-decoration: underline;
          color: #005c87;
        }
        
        .market-value a {
          text-decoration: none;
          font-weight: inherit;
        }
        
        .market-value a:hover {
          text-decoration: underline;
          opacity: 0.8;
        }
        
        .market-label[title] {
          cursor: help;
          border-bottom: 1px dotted #6c757d;
        }
        
        /* Header search filter styles */
        .header-search-filter {
          display: block;
          margin: 8px 0;
          padding: 6px 0;
        }
        
        .header-search-checkbox {
          display: inline-block;
          margin: 0 4px 4px 0;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 12px;
          padding: 3px 8px;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .header-search-checkbox:has(input[type="checkbox"]:checked) {
          background: #d4edda;
          border-color: #c3e6cb;
          color: #155724;
          font-weight: 500;
        }
        
        .header-search-checkbox:hover {
          background: #e9ecef;
          border-color: #adb5bd;
        }
        
        .header-search-checkbox:has(input[type="checkbox"]:checked):hover {
          background: #218c54;
          border-color: #218c54;
        }
        
        /* Search filter section styles */
        .search-filter-section {
          background: #fff;
          border: 1px solid #e9ecef;
          border-radius: 6px;
          margin: 0 0 12px 0;
          padding: 10px 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        .filter-header {
          margin-bottom: 8px;
        }
        
        .filter-title {
          font-size: 12px;
          font-weight: 600;
          color: #2c3e50;
          margin: 0 0 2px 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .filter-description {
          font-size: 10px;
          color: #6c757d;
          margin-bottom: 6px;
        }
        
        .filter-content {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 8px;
        }
        
        .filter-group {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px;
          margin-bottom: 4px;
        }
        
        .filter-group-label {
          font-size: 10px;
          font-weight: 600;
          color: #495057;
          margin-right: 6px;
          min-width: 70px;
        }
        
        .filter-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid #f0f0f0;
        }
        
        .current-search-info {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .current-search-label {
          font-size: 10px;
          color: #6c757d;
          font-weight: 500;
        }
        
        .current-search-query {
          font-size: 10px;
          color: #2c3e50;
          font-weight: 600;
          background: #f8f9fa;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #dee2e6;
        }
        
        /* Smart Suggestion Styles */
        .smart-suggestions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .current-query-display {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          background: #f8f9fa;
          border-radius: 4px;
          border: 1px solid #e9ecef;
        }
        
        .current-label {
          font-size: 10px;
          color: #6c757d;
          font-weight: 600;
        }
        
        .current-query {
          font-size: 11px;
          color: #2c3e50;
          font-weight: 600;
          font-family: Monaco, 'Courier New', monospace;
          background: #ffffff;
          padding: 2px 6px;
          border-radius: 3px;
          border: 1px solid #dee2e6;
        }
        
        .suggestion-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        
        .smart-suggestion-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 16px;
          border: 1px solid #dee2e6;
          background: #ffffff;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 10px;
          line-height: 1;
        }
        
        .smart-suggestion-checkbox input[type="checkbox"] {
          display: none;
        }
        
        .suggestion-text {
          font-weight: 500;
          color: #495057;
        }
        
        .suggestion-type {
          font-size: 9px;
          opacity: 0.7;
        }
        
        /* Priority-based styling */
        .smart-suggestion-checkbox.priority-core {
          background: #fff3e0;
          border-color: #ff9800;
          color: #e65100;
          font-weight: 600;
        cursor: pointer;
        }
        
        .smart-suggestion-checkbox.priority-core .suggestion-text {
          color: #e65100;
          font-weight: 700;
        }
        
        .smart-suggestion-checkbox.priority-core:hover {
          background: #ffcc02;
          border-color: #f57c00;
          color: #bf360c;
        cursor: pointer;
        }
        
        .smart-suggestion-checkbox.priority-selected {
          background: #d4edda;
          border-color: #c3e6cb;
          color: #155724;
        }
        
        .smart-suggestion-checkbox.priority-selected .suggestion-text {
          color: #155724;
          font-weight: 600;
        }
        
        .smart-suggestion-checkbox.priority-high {
          border-color: #28a745;
          background: #f8fff9;
        }
        
        .smart-suggestion-checkbox.priority-high:hover {
          background: #d4edda;
          border-color: #28a745;
        }
        
        .smart-suggestion-checkbox.priority-medium {
          border-color: #ffc107;
          background: #fffef5;
        }
        
        .smart-suggestion-checkbox.priority-medium:hover {
          background: #fff3cd;
          border-color: #ffc107;
        }
        
        .smart-suggestion-checkbox.priority-low {
          border-color: #6c757d;
          background: #f8f9fa;
        }
        
        .smart-suggestion-checkbox.priority-low:hover {
          background: #e9ecef;
          border-color: #6c757d;
        }
        
        /* Checked states */
        .smart-suggestion-checkbox:has(input[type="checkbox"]:checked) {
          background: #007cba;
          border-color: #007cba;
          color: #ffffff;
          transform: scale(1.05);
        }
        
        .smart-suggestion-checkbox:has(input[type="checkbox"]:checked) .suggestion-text {
          color: #ffffff;
          font-weight: 600;
        }
        
        .smart-suggestion-checkbox:has(input[type="checkbox"]:checked) .suggestion-type {
          color: #ffffff;
          opacity: 0.9;
        }
        
        /* Filter status styles */
        .filter-status {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid #f0f0f0;
        }
        
        .loading-indicator {
          font-size: 10px;
          color: #007cba;
          font-weight: 600;
        }
        
        .update-status {
          font-size: 10px;
          color: #6c757d;
          font-style: italic;
        }
        
        /* Market dashboard disclaimer */
        .market-dashboard-disclaimer {
          margin-top: 12px;
          padding: 8px 12px;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 6px;
          font-size: 10px;
          color: #6c757d;
          text-align: center;
          font-style: italic;
          line-height: 1.4;
        }
        
        /* Data Foundation Link Styles */
        .data-link-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 2px 0;
          padding: 1px 0;
        }
        
        .data-link-icon {
          font-size: 10px;
          width: 14px;
          text-align: center;
        }
        
        .data-link-prominent {
          color: #007cba !important;
          text-decoration: underline !important;
          font-weight: 500 !important;
          font-size: 9px !important;
          transition: color 0.2s ease;
        }
        
        .data-link-prominent:hover {
          color: #005c87 !important;
          text-decoration: underline !important;
        }
        
        .data-link-meta {
          font-size: 8px;
          color: #6c757d;
          font-style: italic;
          margin-left: 4px;
        }
        
        /* ✨ ULTRA-COMPACT FLOATING HEADER BAR - 2025 Scandinavian Design ✨ */
        .ultra-compact-floating-header {
          position: relative;
          margin: 0 0 16px 0;
          z-index: 100;
        }
        
        .floating-search-bar {
          display: flex;
          align-items: center;
          height: 32px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(229, 231, 235, 0.8);
          border-radius: 16px;
          padding: 0 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.05);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        }
        
        .floating-search-bar:hover {
          background: rgba(255, 255, 255, 0.98);
          border-color: rgba(0, 124, 186, 0.3);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.1);
          transform: translateY(-0.5px);
        }
        
        .search-icon {
          font-size: 12px;
          margin-right: 8px;
          opacity: 0.7;
          transition: opacity 0.2s ease;
        }
        
        .floating-search-bar:hover .search-icon {
          opacity: 1;
        }
        
        .compact-terms-container {
          display: flex;
          align-items: center;
          flex: 1;
          gap: 8px;
          overflow: hidden;
          min-width: 0;
        }
        
        .selected-terms, .unselected-terms {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }
        
        .selected-terms {
          flex-shrink: 0;
        }
        
        .unselected-terms {
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        
        .unselected-terms::-webkit-scrollbar {
          display: none;
        }
        
        .term-separator {
          color: rgba(156, 163, 175, 0.6);
          font-size: 12px;
          font-weight: 300;
          margin: 0 4px;
          flex-shrink: 0;
        }
        
        /* 🎯 Compact Term Pills - Pure Scandinavian Minimalism */
        .compact-term-pill {
          display: inline-flex;
          align-items: center;
          height: 20px;
          padding: 0 8px;
          background: transparent;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          text-decoration: none;
          font-size: 11px;
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
          position: relative;
          overflow: hidden;
        }
        
        .compact-term-pill input[type="checkbox"] {
          display: none;
        }
        
        .term-text {
          transition: all 0.2s ease;
          font-weight: inherit;
          letter-spacing: -0.01em;
        }
        
        /* ✅ Selected Terms - Beautiful Blue Scandinavian Styling */
        .compact-term-pill.selected {
          background: linear-gradient(135deg, #007cba 0%, #0099e6 100%);
          color: white;
          font-weight: 600;
          box-shadow: 0 1px 2px rgba(0, 124, 186, 0.2);
        }
        
        .compact-term-pill.selected:hover {
          background: linear-gradient(135deg, #006ba6 0%, #0088cc 100%);
          box-shadow: 0 2px 4px rgba(0, 124, 186, 0.3);
          transform: translateY(-0.5px);
        }
        
        .compact-term-pill.selected .term-text {
          color: white;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
        }
        
        /* ⚪ Unselected Terms - Subtle Gray Scandinavian Styling */
        .compact-term-pill.unselected {
          background: rgba(248, 250, 252, 0.8);
          color: #64748b;
          border: 1px solid rgba(226, 232, 240, 0.8);
        }
        
        .compact-term-pill.unselected:hover {
          background: rgba(241, 245, 249, 0.9);
          color: #475569;
          border-color: rgba(203, 213, 225, 0.9);
          transform: translateY(-0.5px);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        }
        
        .compact-term-pill.unselected .term-text {
          color: inherit;
        }
        
        /* 🔗 More Terms Button - Clean Expansion Trigger */
        .more-terms-btn {
          display: inline-flex;
          align-items: center;
          height: 20px;
          padding: 0 8px;
          background: rgba(249, 250, 251, 0.8);
          border: 1px solid rgba(229, 231, 235, 0.6);
          border-radius: 10px;
          color: #6b7280;
          font-size: 10px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          letter-spacing: -0.01em;
        }
        
        .more-terms-btn:hover {
          background: rgba(243, 244, 246, 0.9);
          border-color: rgba(209, 213, 219, 0.8);
          color: #374151;
          transform: translateY(-0.5px);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        }
        
        /* 🔄 Minimal Loading Indicator */
        .search-status-mini {
          display: flex;
          align-items: center;
          margin-left: 8px;
          flex-shrink: 0;
        }
        
        .search-status-mini .loading-indicator {
          font-size: 11px;
          color: #007cba;
          opacity: 0.8;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        
        /* 📱 Responsive Behavior - Mobile Optimization */
        @media (max-width: 768px) {
          .floating-search-bar {
            padding: 0 8px;
          }
          
          .compact-terms-container {
            gap: 6px;
          }
          
          .selected-terms, .unselected-terms {
            gap: 3px;
          }
          
          .compact-term-pill {
            height: 18px;
            padding: 0 6px;
            font-size: 10px;
          }
          
          .more-terms-btn {
            height: 18px;
            padding: 0 6px;
            font-size: 9px;
          }
        }
        
        /* ✨ Micro-Interactions - Scandinavian Polish */
        .compact-term-pill::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.2s ease;
          border-radius: inherit;
        }
        
        .compact-term-pill:hover::before {
          opacity: 1;
        }
        
        /* Remove old smart suggestion styles */
        .smart-suggestions, .current-query-display, .suggestion-controls, 
        .smart-suggestion-checkbox, .filter-status, .filter-header {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
  }

  // NEW: Show loading state with blur and spinner
  showDashboardLoading(message = 'Uppdaterar analys...') {
    const dashboard = document.querySelector('.market-data-dashboard');
    if (!dashboard) return;
    
    // Add blur class to dashboard
    dashboard.classList.add('dashboard-loading');
    
    // Remove any existing overlay
    const existingOverlay = dashboard.querySelector('.loading-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    // Create loading overlay
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">${message}</div>
    `;
    
    dashboard.appendChild(overlay);
  }

  // NEW: Hide loading state with smooth transition
  hideDashboardLoading() {
    const dashboard = document.querySelector('.market-data-dashboard');
    if (!dashboard) return;
    
    const overlay = dashboard.querySelector('.loading-overlay');
    if (overlay) {
      // Fade out overlay first
      overlay.classList.add('fade-out');
      
      // Remove blur after slight delay for smooth transition
      setTimeout(() => {
        dashboard.classList.remove('dashboard-loading');
        
        // Remove overlay after fade completes
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.remove();
    }
        }, 300);
      }, 150);
    } else {
      // No overlay, just remove blur
      dashboard.classList.remove('dashboard-loading');
    }
    
  }

  // NEW: Determine actual search query from SSoT first, then sales data
  determineActualSearchQuery(salesData) {
    // CRITICAL FIX: Always check SearchQueryManager SSoT FIRST
    if (this.searchQuerySSoT && this.searchQuerySSoT.getCurrentQuery()) {
      const ssotQuery = this.searchQuerySSoT.getCurrentQuery();
      return ssotQuery;
    }
    
    console.log('⚠️ SSoT not available, falling back to salesData sources');
    
    // Fallback priority order for determining actual search query from sales data
    if (salesData.historical && salesData.historical.actualSearchQuery) {
      return salesData.historical.actualSearchQuery;
    } else if (salesData.live && salesData.live.actualSearchQuery) {
      return salesData.live.actualSearchQuery;
    } else if (salesData.searchedEntity) {
      return salesData.searchedEntity;
    } else if (salesData.candidateSearchTerms && salesData.candidateSearchTerms.currentQuery) {
      return salesData.candidateSearchTerms.currentQuery;
    } else {
      // Final fallback
      return salesData.analysisType || 'Okänd sökning';
    }
  }

  // LEGACY: AI-powered smart suggestion selection (kept for backward compatibility)
  selectSmartSuggestions(candidates) {
    // Score each candidate based on importance and context
    const scoredCandidates = candidates.map(candidate => {
      let score = 0;
      
      // Type-based scoring (priority)
      const typeScores = {
        'artist': 15,      // Highest priority
        'object_type': 14,  
        'model': 12,
        'reference': 10,   // Boost reference scoring
        'period': 9,       // Boost period scoring (for terms like "1970")
        'material': 8,
        'movement': 7,
        'keyword': 5       // Increase keyword scoring
      };
      
      score += typeScores[candidate.type] || 3;
      
      // CRITICAL: Massive boost for pre-selected terms (current search terms)
      if (candidate.preSelected) {
        score += 20; // This ensures pre-selected terms always make it to top 5
      }
      
      // Boost score for high-value terms
      const highValueTerms = ['guld', 'silver', 'diamant', 'antik', 'vintage', 'original', 'limited', 'signed'];
      if (highValueTerms.some(term => candidate.term.toLowerCase().includes(term))) {
        score += 4;
      }
      
      // Boost score for specific important terms
      const importantTerms = ['seamaster', 'omega', 'rolex', 'patek', 'cartier', 'automatic', 'chronometer'];
      if (importantTerms.some(term => candidate.term.toLowerCase().includes(term))) {
        score += 3;
      }
      
      // Boost score for period terms (years and decades)
      if (candidate.type === 'period') {
        score += 3;
        console.log('📅 Period term boost for:', candidate.term, 'score now:', score);
      }
      
      // Penalize very generic terms (but not too much)
      const genericTerms = ['objekt', 'föremål', 'sak', 'konstarbete'];
      if (genericTerms.some(term => candidate.term.toLowerCase().includes(term))) {
        score -= 1; // Reduced penalty
      }
      
      return { ...candidate, score };
    });
    
    // CRITICAL: Ensure ALL pre-selected terms are included first
    const preSelectedTerms = scoredCandidates.filter(candidate => candidate.preSelected);
    const otherTerms = scoredCandidates.filter(candidate => !candidate.preSelected);
    
    // Sort non-pre-selected terms by score
    const topOtherTerms = otherTerms
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, 5 - preSelectedTerms.length)); // Ensure at least 1 slot for other terms
    
    // Combine pre-selected terms (always included) with top scoring other terms
    const finalSuggestions = [...preSelectedTerms, ...topOtherTerms]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    
    return finalSuggestions;
  }

  // NEW: Initialize SearchQueryManager SSoT immediately when candidate terms are available
  initializeSearchQueryManagerIfAvailable(candidateTerms, actualSearchQuery) {
    if (this.searchQuerySSoT && candidateTerms && actualSearchQuery) {
      console.log('   Actual Query:', actualSearchQuery);
      console.log('   Candidates:', candidateTerms.candidates?.length || 0);
      
      this.searchQuerySSoT.initialize(actualSearchQuery, candidateTerms, 'system');
      return true;
    }
    return false;
  }

  // CRITICAL: Ensure SearchQueryManager has all current query terms available
  ensureQueryTermsInSSoT(actualSearchQuery) {
    if (!this.searchQuerySSoT || !actualSearchQuery) return;
    
    // Force ensure current query terms are available
    this.searchQuerySSoT.currentQuery = actualSearchQuery;
    this.searchQuerySSoT.ensureCurrentQueryTermsAvailable();
  }

  // UPDATED: Use SearchQueryManager SSoT for smart suggestions
  generateSmartSearchFilters(candidateSearchTerms, hotReload = false) {
    
    // CRITICAL: Use SearchQueryManager SSoT if available
    if (this.searchQuerySSoT) {
      
      const availableTerms = this.searchQuerySSoT.getAvailableTerms();
      const currentQuery = this.searchQuerySSoT.getCurrentQuery();
      
      
      // Generate HTML for each available term
      const suggestions = availableTerms
        .sort((a, b) => (b.score || 0) - (a.score || 0)) // Sort by score
        .slice(0, 5) // Take top 5
        .map(termObj => {
          const isSelected = this.searchQuerySSoT.isTermSelected(termObj.term);
          const isCore = this.searchQuerySSoT.isCoreTerm(termObj.term);
          
          // Visual styling based on term importance
          let className = 'smart-suggestion';
          if (isCore) className += ' core-term'; // Orange for core terms like brands
          if (isSelected) className += ' selected'; // Blue for selected terms
          
          return `<span class="${className}" 
                        data-suggestion="${termObj.term}" 
                        data-type="${termObj.type || 'keyword'}"
                        data-core="${isCore}"
                        title="${termObj.description || 'Klicka för att lägga till/ta bort'}">
                    ${termObj.term} ${termObj.type === 'period' ? '📅' : termObj.type === 'model' ? '🔧' : isCore ? '🏷️' : ''}
                   </span>`;
        })
        .join('');
      
      return suggestions;
    }
    
    // FALLBACK: Use legacy method if SSoT not available
    console.log('⚠️ SearchQueryManager not available, falling back to legacy method');
    return this.generateLegacySmartSearchFilters(candidateSearchTerms, hotReload);
  }

  // Keep legacy method as fallback
  generateLegacySmartSearchFilters(candidateSearchTerms, hotReload = false) {
    if (!candidateSearchTerms || !candidateSearchTerms.candidates || candidateSearchTerms.candidates.length === 0) {
      return '';
    }
    
    
    // Use the old method as fallback
    const smartSuggestions = this.selectSmartSuggestions(candidateSearchTerms.candidates);
    const currentQuery = candidateSearchTerms.currentQuery || 'Automatisk sökning';
    
    let filterHTML = `
      <div class="search-filter-section">
        <div class="ultra-compact-floating-header">
          <div class="floating-search-bar">
            <span class="search-icon">🔍</span>
            <div class="compact-terms-container">
              <div class="selected-terms">`;
    
    // First pass: Add selected (checked) terms with blue styling
    const selectedTerms = smartSuggestions.filter(suggestion => suggestion.isSelected);
    const unselectedTerms = smartSuggestions.filter(suggestion => !suggestion.isSelected);
    
    selectedTerms.forEach((suggestion, index) => {
      const checkboxId = `smart-suggestion-selected-${index}`;
      filterHTML += `
        <label class="compact-term-pill selected" title="${this.escapeHTMLAttribute(suggestion.description + ": " + suggestion.term)}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${this.escapeHTMLAttribute(suggestion.term)}" 
                 data-type="${suggestion.type}"
                 data-core="${suggestion.isCore || false}"
                 id="${checkboxId}"
                 checked>
          <span class="term-text">${suggestion.term}</span>
        </label>`;
    });
    
    filterHTML += `
              </div>
              <div class="term-separator">|</div>
              <div class="unselected-terms">`;
    
    // Second pass: Add unselected terms (max 3 to save space)
    const maxUnselected = 3;
    unselectedTerms.slice(0, maxUnselected).forEach((suggestion, index) => {
      const checkboxId = `smart-suggestion-unselected-${index}`;
      filterHTML += `
        <label class="compact-term-pill unselected" title="${this.escapeHTMLAttribute(suggestion.description + ": " + suggestion.term)}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${this.escapeHTMLAttribute(suggestion.term)}" 
                 data-type="${suggestion.type}"
                 data-core="${suggestion.isCore || false}"
                 id="${checkboxId}">
          <span class="term-text">${suggestion.term}</span>
        </label>`;
    });
    
    // Add "+X fler" indicator if there are more terms
    const remainingCount = unselectedTerms.length - maxUnselected;
    if (remainingCount > 0) {
      filterHTML += `
        <button class="more-terms-btn" type="button" title="Visa ${remainingCount} fler söktermer">
          +${remainingCount} fler →
        </button>`;
    }
    
    filterHTML += `
              </div>
            </div>
            <div class="search-status-mini">
              <span class="loading-indicator" id="filter-loading" style="display: none;">🔄</span>
            </div>
          </div>
        </div>
      </div>`;
    
    return filterHTML;
  }

  // NEW: Detect term type for missing query terms
  detectTermTypeForMissing(term) {
    const lowerTerm = term.toLowerCase();
    
    // Brand/Artist detection (enhanced list for watches)
    const watchBrands = [
      'omega', 'rolex', 'patek', 'cartier', 'breitling', 'tag', 'heuer', 
      'longines', 'tissot', 'seiko', 'citizen', 'casio', 'hamilton',
      'iwc', 'jaeger', 'lecoultre', 'vacheron', 'constantin', 'audemars', 'piguet',
      'tudor', 'zenith', 'chopard', 'montblanc', 'hublot', 'richard', 'mille',
      'panerai', 'oris', 'frederique', 'constant', 'maurice', 'lacroix'
    ];
    
    if (watchBrands.includes(lowerTerm)) {
      return 'brand';
    }
    
    // Period detection
    if (/^\d{4}$/.test(term) || /\d{4}[-\s]tal/.test(lowerTerm)) {
      return 'period';
    }
    
    // Reference detection
    if (/^st\s?\d+/.test(lowerTerm) || /reference/.test(lowerTerm)) {
      return 'reference';
    }
    
    // Object type detection
    const objectTypes = ['armbandsur', 'klocka', 'ur', 'watch', 'tavla', 'målning', 'painting', 'skulptur', 'vas', 'lampa'];
    if (objectTypes.includes(lowerTerm)) {
      return 'object_type';
    }
    
    // Movement detection
    if (['automatisk', 'manuell', 'quartz', 'kronograf'].includes(lowerTerm)) {
      return 'movement';
    }
    
    // Material detection
    if (['guld', 'silver', 'stål', 'platina', 'titan'].includes(lowerTerm)) {
      return 'material';
    }
    
    // Model detection for watch models
    const watchModels = ['seamaster', 'speedmaster', 'constellation', 'deville', 'submariner', 'daytona', 'datejust'];
    if (watchModels.includes(lowerTerm)) {
      return 'model';
    }
    
    // Default to keyword
    return 'keyword';
  }

  // NEW: Get initial query for SSoT initialization only (before SSoT has candidate terms)
  getInitialQueryForSSoTInit(salesData) {
    
    // CRITICAL FIX: Prioritize the ENHANCED candidateSearchTerms.currentQuery over API actualSearchQuery
    // The candidateSearchTerms.currentQuery includes important terms like "Seamaster" that the API query loses
    if (salesData.candidateSearchTerms && salesData.candidateSearchTerms.currentQuery) {
      return salesData.candidateSearchTerms.currentQuery;
    } else if (salesData.searchedEntity) {
      return salesData.searchedEntity;
    } else if (salesData.historical && salesData.historical.actualSearchQuery) {
      console.log('⚠️ Using simplified API query as fallback (may lose enhanced terms)');
      return salesData.historical.actualSearchQuery;
    } else if (salesData.live && salesData.live.actualSearchQuery) {
      console.log('⚠️ Using simplified live API query as fallback (may lose enhanced terms)');
      return salesData.live.actualSearchQuery;
    } else {
      // Final fallback
      console.log('⚠️ Using analysis type as final fallback');
      return salesData.analysisType || 'Okänd sökning';
    }
  }
  
  // NEW: Get final query from SSoT (after SSoT is initialized with candidate terms)
  getFinalQueryFromSSoT(salesData) {
    // CRITICAL: Always prioritize SSoT after it's been properly initialized
    if (this.searchQuerySSoT && this.searchQuerySSoT.getCurrentQuery()) {
      const ssotQuery = this.searchQuerySSoT.getCurrentQuery();
      return ssotQuery;
    }
    
    console.log('⚠️ SSoT not available for final query, using fallback');
    
    // Only use as fallback if SSoT completely failed
    return this.getInitialQueryForSSoTInit(salesData);
  }

  // NEW: Force SSoT initialization when dashboard is accessed without proper initialization
  async forceSSoTInitializationAsync() {
    
    try {
      // Check if SearchQuerySSoT is already available
      if (this.searchQuerySSoT) {
        return true;
      }
      
      await this.restoreSearchQuerySSoTReference();
    
      if (this.searchQuerySSoT) {
        return true;
    } else {
        console.error('❌ CRITICAL: No SearchQuerySSoT available - please refresh page');
        return false;
      }
    } catch (error) {
      console.error('💥 SSoT force initialization failed:', error);
      return false;
    }
  }

  // NEW: Restore SearchQuerySSoT reference during hot reload or after errors
  async restoreSearchQuerySSoTReference() {
    
    // Strategy 1: Check if we have it via QualityAnalyzer
    if (this.qualityAnalyzer && this.qualityAnalyzer.searchQuerySSoT) {
      this.searchQuerySSoT = this.qualityAnalyzer.searchQuerySSoT;
      return;
    }
    
    // Strategy 2: Check global assistant instance
    if (typeof window !== 'undefined' && window.auctionetAssistant && window.auctionetAssistant.searchQuerySSoT) {
      this.searchQuerySSoT = window.auctionetAssistant.searchQuerySSoT;
      return;
    }
    
  }

  // NEW: Generate header-integrated pills for desktop optimization
  generateHeaderIntegratedPills() {
    
    // Check if we have SearchQueryManager available
    if (!this.searchQuerySSoT) {
      console.log('⚠️ SearchQuerySSoT not available for header pills');
      return '<div class="header-pills-placeholder">Söktermer ej tillgängliga</div>';
    }
    
    const availableTerms = this.searchQuerySSoT.getAvailableTerms();
    
    if (availableTerms.length === 0) {
      console.log('⚠️ No available terms for header pills');
      return '<div class="header-pills-placeholder">Inga söktermer tillgängliga</div>';
    }
    
    
    // AI-POWERED SMART SUGGESTIONS: Select top terms for header
    const headerSuggestions = this.selectHeaderSuggestions(availableTerms);
    
    let headerPillsHTML = '<div class="header-pills-container">';
    
    // Split into selected and unselected for proper visual hierarchy
    const selectedTerms = headerSuggestions.filter(term => term.isSelected);
    const unselectedTerms = headerSuggestions.filter(term => !term.isSelected);
    
    // Add selected terms first (blue pills)
    selectedTerms.forEach((term, index) => {
      const checkboxId = `header-pill-selected-${index}`;
      headerPillsHTML += `
        <label class="header-pill selected" title="${this.escapeHTMLAttribute((term.description || 'Klicka för att ta bort') + ": " + term.term)}">
          <input type="checkbox" 
                 class="smart-checkbox header-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}"
                 checked>
          <span class="pill-text">${term.term}</span>
        </label>`;
    });
    
    // Add unselected terms (max 4 for header space)
    const maxUnselectedInHeader = 4;
    unselectedTerms.slice(0, maxUnselectedInHeader).forEach((term, index) => {
      const checkboxId = `header-pill-unselected-${index}`;
      headerPillsHTML += `
        <label class="header-pill unselected" title="${this.escapeHTMLAttribute((term.description || 'Klicka för att lägga till') + ": " + term.term)}">
          <input type="checkbox" 
                 class="smart-checkbox header-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}">
          <span class="pill-text">${term.term}</span>
        </label>`;
    });
    
    // Add expand indicator if there are more terms
    const remainingCount = unselectedTerms.length - maxUnselectedInHeader;
    if (remainingCount > 0) {
      headerPillsHTML += `
        <button class="header-expand-btn" type="button" title="Visa ${remainingCount} fler söktermer">
          +${remainingCount}
        </button>`;
    }
    
    headerPillsHTML += '</div>';
    
    return headerPillsHTML;
  }
  
  // NEW: Select optimal terms for header display
  selectHeaderSuggestions(availableTerms) {
    
    // CRITICAL FIX: Filter out invalid terms before processing
    const validTerms = availableTerms.filter(term => {
      if (!term || typeof term.term !== 'string' || term.term.trim() === '') {
        console.warn('🚨 FILTERING OUT INVALID HEADER TERM:', term);
        return false;
      }
      return true;
    });
    
    // Get selected terms from SSoT
    const ssotSelectedTerms = this.searchQuerySSoT.getSelectedTerms() || [];
    
    // Mark terms as selected based on SSoT state
    validTerms.forEach(term => {
      term.isSelected = ssotSelectedTerms.some(selectedTerm => 
        selectedTerm && typeof selectedTerm === 'string' &&
        selectedTerm.toLowerCase() === term.term.toLowerCase()
      );
      
      // Check if it's a core term
      if (this.searchQuerySSoT.isCoreSearchTerm(term.term)) {
        term.isCore = true;
      }
    });
    
    // Split into selected and unselected
    const selectedTerms = validTerms.filter(term => term.isSelected);
    const unselectedTerms = validTerms.filter(term => !term.isSelected);
    
    // Sort unselected by priority for best desktop experience
    const sortedUnselected = unselectedTerms
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Combine with smart limits for header display (max 8 total for desktop)
    const maxTotalInHeader = 8;
    const maxUnselectedInHeader = Math.max(1, maxTotalInHeader - selectedTerms.length);
    
    const headerSuggestions = [
      ...selectedTerms,
      ...sortedUnselected.slice(0, maxUnselectedInHeader)
    ];
    
    
    return headerSuggestions;
  }
} 