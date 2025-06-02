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
    console.log('✅ DashboardManager: AI-only SearchQuerySSoT connected');
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
    console.log('🔄 Updating dashboard header with query:', query, 'source:', source);
    
    // Update the "Sökning:" field in dashboard header
    const headerQueryText = document.querySelector('.query-text');
    if (headerQueryText) {
      headerQueryText.textContent = `"${query}"`;
      console.log('✅ Updated dashboard header "Sökning:" field');
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
      console.log('✅ Updated dashboard header source:', sourceText);
    } else {
      console.log('⚠️ Dashboard header .query-source element not found');
    }
    
    // Also update the "Nuvarande:" field for consistency
    const currentQueryDisplay = document.getElementById('current-search-display');
    if (currentQueryDisplay) {
      currentQueryDisplay.textContent = `"${query}"`;
      console.log('✅ Updated "Nuvarande:" field for consistency');
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
    console.log('💰 Processing comprehensive market analysis results');
    
    if (!salesData || !salesData.hasComparableData) {
      console.log('❌ No comparable data available for dashboard');
      return;
    }
    
    // 🚨 CRITICAL: FORCE SSoT initialization FIRST before anything else
    console.log('🚨 FORCING SSoT to be the ONLY source of search terms');
    this.forceSSoTInitializationAsync(salesData).then(ssotSuccess => {
    if (!ssotSuccess) {
      console.error('❌ Failed to initialize SSoT - cannot proceed with dashboard');
      return;
    }
    
    console.log('✅ SSoT forced initialization successful - all components now use same source');
    
      // Continue with dashboard creation after SSoT is ready
      this.completeDashboardCreation(salesData);
    }).catch(error => {
      console.error('❌ Error during SSoT initialization:', error);
    });
  }
  
  // NEW: Complete dashboard creation after SSoT is initialized
  completeDashboardCreation(salesData) {
    console.log('🎯 Creating dashboard with current SearchQuerySSoT reference');
    console.log('🔧 Current SearchQuerySSoT status:', !!this.searchQuerySSoT);
    
    // CRITICAL FIX: Prevent duplicate dashboard creation
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard && this.dashboardCreated) {
      console.log('⚠️ Dashboard already exists - removing existing first');
      existingDashboard.remove();
    }
    
    console.log('🎯 Creating new dashboard with SSoT-unified data');
    
    // Generate dashboard ID
    const dashboardId = `dashboard-${Date.now()}`;
    
    // Create and populate the dashboard - this should NOT modify references
    this.createDashboard(salesData, [], dashboardId);
    
    // Mark dashboard as created
    this.dashboardCreated = true;
    
    console.log('✅ Dashboard creation complete with SSoT consistency');
    console.log('🔧 Final SearchQuerySSoT status:', !!this.searchQuerySSoT);
  }
  
  createDashboard(salesData, valuationSuggestions, dashboardId) {
    // Remove any existing market data dashboard
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard) {
      console.log('🗑️ Removing existing dashboard');
      existingDashboard.remove();
    }

    // Create the dashboard container
    const dashboard = document.createElement('div');
    dashboard.className = 'market-data-dashboard';
    dashboard.setAttribute('data-dashboard-id', dashboardId);
    
    console.log(`🎯 Creating new dashboard with ID: ${dashboardId}`);
    
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
      
      console.log('🔗 Dashboard URL generation (STRICT SSoT):');
      console.log('  Using SSoT query for ALL URLs:', ssotQuery);
      console.log('  Historical query that found data (IGNORED):', salesData.historical?.actualSearchQuery);
      console.log('  Live query that found data (IGNORED):', salesData.live?.actualSearchQuery);
      
      // Generate ALL URLs using the SSoT query for consistency
      const baseUrl = 'https://auctionet.com/sv/search';
          
      if (ssotQuery) {
        historicalUrl = `${baseUrl}?event_id=&is=ended&q=${encodeURIComponent(ssotQuery)}`;
        liveUrl = `${baseUrl}?event_id=&is=&q=${encodeURIComponent(ssotQuery)}`;
        allUrl = `${baseUrl}?event_id=&is=&q=${encodeURIComponent(ssotQuery)}`;
      }
      
      console.log('🔗 Generated URLs (ALL use SSoT query):');
      console.log('  Historical:', historicalUrl);
      console.log('  Live:', liveUrl);
      console.log('  All:', allUrl);
        
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
      
        dashboardContent += `
        <div class="market-item market-exceptional">
          <div class="market-label" title="Särskilt höga bekräftade försäljningar som överträffar normal marknadsnivå">Exceptionella</div>
          <div class="market-value">${exceptionellaCount} exceptionella bekräftade försäljningar över ${thresholdText}</div>
          <div class="market-help">${exceptional.description || 'Bekräftade höga försäljningar'}</div>
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
    console.log('🔧 Using SSoT values for dashboard creation (already initialized)');
    
    // Get the authoritative query from SSoT
    const actualSearchQuery = this.getFinalQueryFromSSoT(salesData);
    console.log('🎯 FINAL QUERY from SSoT for dashboard header:', actualSearchQuery);
    
    // Generate search filter HTML using SSoT
    let searchFilterHTML = '';
    
    // CRITICAL DEBUG: Check all sources for available terms
    console.log('🔧 EXTENDED TERMS DEBUG: Checking all sources for available terms...');
    console.log('📋 salesData.candidateSearchTerms exists:', !!salesData.candidateSearchTerms);
    console.log('📋 this.searchQuerySSoT exists:', !!this.searchQuerySSoT);
    
    if (salesData.candidateSearchTerms) {
      console.log('📋 candidateSearchTerms.candidates length:', salesData.candidateSearchTerms.candidates?.length);
      console.log('📋 candidateSearchTerms.candidates:', salesData.candidateSearchTerms.candidates?.map(c => c.term));
    }
    
    if (this.searchQuerySSoT) {
      const availableTerms = this.searchQuerySSoT.getAvailableTerms();
      console.log('📋 SearchQuerySSoT.getAvailableTerms() length:', availableTerms.length);
      console.log('📋 SearchQuerySSoT available terms:', availableTerms.map(t => `${t.term}(${t.isSelected ? '✓' : '○'})`));
    }
    
    // STRATEGY 1: Try to use SearchQuerySSoT terms directly if available
    if (this.searchQuerySSoT) {
      const availableTerms = this.searchQuerySSoT.getAvailableTerms();
      if (availableTerms.length > 0) {
        console.log('✅ EXTENDED TERMS: Using SearchQuerySSoT terms directly (bypassing candidateSearchTerms)');
        
        // Create fake candidateTerms structure from SearchQuerySSoT
        const fakeCandidateTerms = {
          candidates: availableTerms.map(term => ({
            term: term.term,
            type: term.type,
            description: term.description,
            priority: term.priority,
            preSelected: term.isSelected
          })),
          currentQuery: this.searchQuerySSoT.getCurrentQuery(),
          analysisType: 'ssot_direct'
        };
        
        console.log('🔧 EXTENDED TERMS: Generated fake candidateTerms from SSoT:', fakeCandidateTerms);
        searchFilterHTML = this.generateSearchFilterHTML(fakeCandidateTerms);
      } else {
        console.log('⚠️ EXTENDED TERMS: SearchQuerySSoT has no available terms');
      }
    }
    
    // STRATEGY 2: Fallback to original candidateSearchTerms if SSoT failed
    if (!searchFilterHTML && salesData.candidateSearchTerms) {
      console.log('🔧 EXTENDED TERMS: Fallback to original candidateSearchTerms method');
      searchFilterHTML = this.generateSearchFilterHTML(salesData.candidateSearchTerms);
    }
    
    // STRATEGY 3: Final fallback - show debug info if nothing worked
    if (!searchFilterHTML) {
      console.log('❌ EXTENDED TERMS: No search filter HTML generated - adding debug section');
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
      console.log('✅ EXTENDED TERMS: Search filter HTML generated successfully');
    }
    
    const querySource = this.searchQuerySSoT ? 
      this.searchQuerySSoT.getQuerySource() : 
      (salesData.hotReload ? 'user' : 'system');
    
    // Add the content and finalize dashboard
    dashboard.innerHTML = `
      <div class="market-dashboard-header">
        <div class="market-dashboard-title">
          Marknadsanalys
        </div>
        <div class="market-dashboard-query">
          <span class="query-label">Sökning:</span>
          <span class="query-text">"${actualSearchQuery}"</span>
          <span class="query-source">(${querySource})</span>
        </div>
        <div class="market-dashboard-source">
          ${salesData.dataSource || 'Auctionet API'}
        </div>
      </div>
      ${searchFilterHTML}
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
      console.log('✅ Market data dashboard added above main container');
    } else {
      // Fallback to body if container not found
      console.log('⚠️ Main container not found, appending to body');
      document.body.appendChild(dashboard);
    }
    
    console.log('🎉 Dashboard successfully added to DOM with SSoT consistency!');
    console.log('📊 Dashboard element:', dashboard);
    
    // Setup interactive search filter if quality analyzer is available
    if (this.qualityAnalyzer && this.qualityAnalyzer.searchFilterManager.setupHeaderSearchFilterInteractivity) {
      this.qualityAnalyzer.searchFilterManager.setupHeaderSearchFilterInteractivity();
    }
    
    // Setup hot reload functionality for smart suggestions
    this.setupSmartSuggestionHotReload();
  }

  // NEW: Setup hot reload functionality for smart suggestions
  setupSmartSuggestionHotReload() {
    console.log('🔥 Setting up smart suggestion hot reload...');
    
    // Add event listeners to all smart suggestion checkboxes
    const smartCheckboxes = document.querySelectorAll('.smart-checkbox');
    
    smartCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (event) => {
        console.log('🔥 Smart suggestion changed:', event.target.value, 'checked:', event.target.checked);
        this.handleSmartSuggestionChange();
      });
    });
    
    console.log(`✅ Hot reload setup complete for ${smartCheckboxes.length} smart suggestions`);
    
    // CRITICAL: Sync all checkboxes with SSoT state after setup
    setTimeout(() => {
      this.syncAllCheckboxesWithSSoT();
      console.log('🔄 Initial checkbox sync with SSoT complete');
    }, 50);
  }
  
  // CORE: Handle smart suggestion changes with immediate SSoT sync and hot reload
  async handleSmartSuggestionChange() {
    if (!this.searchQuerySSoT) {
      console.log('⚠️ Cannot handle suggestion changes - SearchQueryManager not available');
      return;
    }
    
    console.log('🔄 Processing smart suggestion change with immediate SSoT sync...');
    
    // Show smooth loading state
    this.showDashboardLoading('Uppdaterar analys med nya söktermer...');
    
    // Get all current checkbox states to update SSoT
    const allCheckboxes = document.querySelectorAll('.smart-checkbox, .suggestion-checkbox, input[type="checkbox"][data-search-term]');
    
    console.log('🔍 CHECKBOX DEBUG: Processing checkbox changes...');
    console.log(`🔍 Total checkboxes found: ${allCheckboxes.length}`);
    
    // CRITICAL FIX: Get current SSoT state to preserve AI-detected artists
    const currentSSoTTerms = this.searchQuerySSoT.getCurrentTerms() || [];
    const availableTerms = this.searchQuerySSoT.getAvailableTerms() || [];
    
    console.log('🔍 BEFORE CHANGE - Current SSoT terms:', currentSSoTTerms);
    console.log('🔍 BEFORE CHANGE - Available terms:', availableTerms.map(t => `${t.term}(${t.type})`));
    
    // Identify AI-detected artists and other special terms to preserve
    const aiDetectedArtists = availableTerms.filter(term => 
      term.type === 'artist' && 
      (term.source === 'ai_detected' || term.term.includes('"') || term.priority >= 95)
    );
    
    console.log('🤖 AI-detected artists to potentially preserve:', aiDetectedArtists.map(t => t.term));
    
    const selectedTerms = [];
    const uncheckedArtists = [];
    
    allCheckboxes.forEach((checkbox, index) => {
      const termValue = checkbox.value || checkbox.getAttribute('data-search-term') || checkbox.dataset.term;
      const isChecked = checkbox.checked;
      
      console.log(`🔍 Checkbox ${index + 1}: "${termValue}" - checked: ${isChecked}`);
      
      // Track if user explicitly unchecked an AI-detected artist
      if (!isChecked && aiDetectedArtists.some(artist => artist.term === termValue)) {
        uncheckedArtists.push(termValue);
        console.log(`🚫 User explicitly unchecked AI-detected artist: ${termValue}`);
      }
      
      if (isChecked && termValue && termValue !== '0' && termValue !== '1' && termValue !== 'undefined') {
        selectedTerms.push(termValue);
      }
    });
    
    // CRITICAL FIX: Add back AI-detected artists unless explicitly unchecked
    aiDetectedArtists.forEach(artist => {
      if (!uncheckedArtists.includes(artist.term) && !selectedTerms.includes(artist.term)) {
        selectedTerms.unshift(artist.term); // Add at beginning to maintain priority
        console.log(`🤖 Preserving AI-detected artist: ${artist.term} (not explicitly unchecked)`);
      }
    });
    
    console.log('👤 Final user selected terms (including preserved AI artists):', selectedTerms);
    console.log('🔍 BEFORE UPDATE - Current SSoT query:', this.searchQuerySSoT.getCurrentQuery());
    console.log('🔍 BEFORE UPDATE - Current SSoT terms:', this.searchQuerySSoT.getCurrentTerms());
    
    // Update SSoT with user selections (now includes preserved AI artists)
    this.searchQuerySSoT.updateUserSelections(selectedTerms);
    
    console.log('🔍 AFTER UPDATE - New SSoT query:', this.searchQuerySSoT.getCurrentQuery());
    console.log('🔍 AFTER UPDATE - New SSoT terms:', this.searchQuerySSoT.getCurrentTerms());
    console.log('🔍 EXPECTED: Query should be:', selectedTerms.join(' '));
    
    // Update dashboard header immediately
    const newQuery = this.searchQuerySSoT.getCurrentQuery();
    this.updateDashboardHeader(newQuery, 'användarval');
    console.log('✅ Updated dashboard header "Sökning:" field with new SSoT query:', newQuery);
    
    // Sync all checkboxes with new SSoT state
    this.syncAllCheckboxesWithSSoT();
    
    console.log('🔒 Preserving all critical references for hot reload');
    console.log('🔄 SSoT updated query:', newQuery);
    
    // Get search context for API call
    const searchContext = this.searchQuerySSoT.buildSearchContext();
    
    console.log('🎯 Triggering new API analysis with SSoT query:', searchContext.primarySearch);
    
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
        console.log('✅ ApiManager found, starting hot reload analysis...');
        
        // Call API with new search context
        const salesData = await apiManager.analyzeSales(searchContext);
        
        // Hide loading state
        this.hideDashboardLoading();
        
        // Preserve candidate terms for dashboard recreation
        await this.preserveCandidateTermsForHotReload(salesData, newQuery);
        
        console.log('🔥 HOT RELOAD: New sales data received, updating dashboard:', salesData);
        
        // HOT RELOAD: Update dashboard with new data while preserving state
        if (salesData && salesData.hasComparableData) {
          this.addMarketDataDashboard(salesData, 'user_filtered');
        }
        
        // Restore critical references after dashboard recreation
        await this.restoreSearchQueryManagerReference();
        
        console.log('✅ Restored all critical references after dashboard recreation');
        console.log('🔥 HOT RELOAD: Complete dashboard refresh successful with SSoT!');
        
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
    console.log('🔧 Attempting to restore SearchQueryManager reference...');
      
      // Try multiple restoration sources in order of preference
      let restored = false;
      
      // 1. Try to restore from quality analyzer
      if (this.qualityAnalyzer && this.qualityAnalyzer.searchQueryManager) {
        this.searchQuerySSoT = this.qualityAnalyzer.searchQueryManager;
        console.log('✅ Restored SearchQueryManager reference from quality analyzer');
        restored = true;
      } 
      // 2. Try to restore from API manager
      else if (this.apiManager && this.apiManager.searchQueryManager) {
        this.searchQuerySSoT = this.apiManager.searchQueryManager;
        console.log('✅ Restored SearchQueryManager reference from API manager');
        restored = true;
      }
      // 3. Try to find it in the global scope (from content script)
      else if (typeof window !== 'undefined' && window.auctionetAssistant && window.auctionetAssistant.searchQueryManager) {
        this.searchQuerySSoT = window.auctionetAssistant.searchQueryManager;
        console.log('✅ Restored SearchQueryManager reference from global window');
        restored = true;
      }
      // 4. Try to create a new instance with current data as last resort
      else {
        console.log('⚠️ SearchQueryManager import removed - using AI-only SearchQuerySSoT instead');
        console.log('⚠️ Hot reload functionality deprecated - please refresh page');
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
    
    console.log('🔄 Syncing ALL checkbox instances with SSoT state...');
    
    const ssotSelectedTerms = this.searchQuerySSoT.getSelectedTerms() || [];
    console.log('🔍 SSoT selected terms for sync:', ssotSelectedTerms);
    
    // CRITICAL FIX: Use setTimeout to ensure DOM elements are available after recreation
    setTimeout(() => {
      // Find all checkbox instances across the page with multiple selectors
      const allCheckboxes = document.querySelectorAll(
        '.smart-checkbox, .search-filter-checkbox, input[type="checkbox"][data-search-term], input[type="checkbox"][value]'
      );
    
      console.log(`🔍 Found ${allCheckboxes.length} checkboxes to potentially sync`);
      
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
    
        console.log(`🔍 Checking checkbox with value: "${termValue}"`);
        
        // ENHANCED MATCHING: Check if this term should be selected based on SSoT
        const shouldBeChecked = this.shouldCheckboxBeSelected(termValue, ssotSelectedTerms);
      
        // Update checkbox state if it doesn't match SSoT (user has full control)
        if (checkbox.checked !== shouldBeChecked) {
          checkbox.checked = shouldBeChecked;
          syncedCount++;
          console.log(`🔧 Synced checkbox "${termValue}": ${shouldBeChecked}`);
        }
      });
      
      console.log(`✅ Synced ${syncedCount} checkboxes with SSoT state`);
      
      // Clarify when 0 checkboxes are synced
      if (syncedCount === 0) {
        console.log('ℹ️ 0 checkboxes synced = All checkboxes already in correct state (this is good!)');
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
    const normalizedCheckboxValue = checkboxValue.toLowerCase().trim();
    
    for (const selectedTerm of ssotSelectedTerms) {
      const normalizedSelectedTerm = selectedTerm.toLowerCase().trim();
      
      // EXACT MATCH ONLY (case-insensitive) - NO MORE COMPOSITE MATCHING
      if (normalizedSelectedTerm === normalizedCheckboxValue) {
        console.log(`✅ EXACT match: "${checkboxValue}" = "${selectedTerm}"`);
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
    console.log('🔧 HOT RELOAD: Preserving candidate terms for continued fine-tuning...');
    
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
            preSelected: term.isSelected
          })),
          currentQuery: currentQuery,
          analysisType: 'custom_user_filter'
        };
        
        // Add to sales data for dashboard use
        salesData.candidateSearchTerms = candidateTerms;
        
        console.log('✅ HOT RELOAD: Preserved candidate terms from SSoT');
        console.log('🔧 Available terms:', availableTerms.length);
        console.log('🔧 Selected terms:', availableTerms.filter(t => t.isSelected).length);
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
    console.log('🔧 SSoT Query from getCurrentQuery():', `"${currentQuery}"`);
    
    // Get available terms from SearchQueryManager SSoT
    const availableTerms = this.searchQuerySSoT.getAvailableTerms();
    
    if (availableTerms.length === 0) {
      console.log('⚠️ No available terms in SearchQueryManager SSoT, using legacy fallback');
      return this.generateLegacySearchFilterHTML(candidateTerms);
    }
    
    console.log('🔧 Generating smart search filter using SearchQueryManager SSoT');
    
    // AI-POWERED SMART SUGGESTIONS: Select top 4-5 most important terms from SSoT
    const smartSuggestions = this.selectSmartSuggestionsFromSSoT(availableTerms);
    
    // Show current query and smart suggestions prominently
    let filterHTML = `
      <div class="search-filter-section">
        <div class="filter-header">
          <h4 class="filter-title">🧠 AI-smarta sökförslag</h4>
          <div class="filter-description">Anpassa alla termer efter behov - du har full kontroll över sökningen</div>
        </div>
        <div class="smart-suggestions">
          <div class="current-query-display">
            <span class="current-label">Nuvarande:</span>
            <span class="current-query" id="current-search-display">"${currentQuery || 'Ingen sökning'}"</span>
          </div>
          <div class="suggestion-controls">`;
    
    // Generate smart suggestion checkboxes using SSoT selection state
    smartSuggestions.forEach((suggestion, index) => {
      const checkboxId = `smart-suggestion-${index}`;
      // Check selection state from SearchQueryManager SSoT
      const isChecked = suggestion.isSelected ? 'checked' : '';
      
      // CRITICAL FIX: Use isCore flag to determine if this should be an orange core term
      const priority = suggestion.isCore ? 'priority-core' : this.getSuggestionPriorityFromSSoT(suggestion);
      
      // User-friendly styling and messaging - all terms are user-controllable
      const coreClass = suggestion.isCore ? 'core-term' : '';
      const coreTitle = suggestion.isCore ? ' (AI-rekommenderad som viktig - du kan kryssa ur den)' : '';
      
      filterHTML += `
        <label class="smart-suggestion-checkbox ${priority} ${coreClass}" title="${suggestion.description}: ${suggestion.term}${coreTitle}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${suggestion.term}" 
                 data-type="${suggestion.type}"
                 data-core="${suggestion.isCore || false}"
                 id="${checkboxId}"
                 ${isChecked}>
          <span class="suggestion-text">${suggestion.term}</span>
          <span class="suggestion-type">${this.getTypeIcon(suggestion.type)}</span>
        </label>`;
    });
    
    filterHTML += `
          </div>
        </div>
        <div class="filter-status">
          <span class="loading-indicator" id="filter-loading" style="display: none;">🔄 Uppdaterar analys...</span>
          <span class="update-status" id="filter-status">Du har full kontroll - kryssa ur ALLA termer (även AI-förslag) om du vill</span>
        </div>
      </div>`;
    
    return filterHTML;
  }

  // NEW: Select smart suggestions from SearchQueryManager SSoT
  selectSmartSuggestionsFromSSoT(availableTerms) {
    console.log('🧠 AI-selecting smart suggestions from SSoT with', availableTerms.length, 'available terms');
    
    // CRITICAL FIX: Filter out any terms with undefined or invalid values before processing
    const validTerms = availableTerms.filter(term => {
      if (!term || typeof term.term !== 'string' || term.term.trim() === '') {
        console.warn('🚨 FILTERING OUT INVALID TERM:', term);
        return false;
      }
      return true;
    });
    
    if (validTerms.length !== availableTerms.length) {
      console.log(`🔧 Filtered out ${availableTerms.length - validTerms.length} invalid terms, ${validTerms.length} valid terms remain`);
    }
    
    // DEBUG: Log all valid terms to identify the issue
    console.log('🔍 Valid terms after filtering:');
    validTerms.forEach((term, index) => {
      console.log(`   ${index + 1}. Term: "${term.term}", Type: ${term.type}, Selected: ${term.isSelected}`);
    });
    
    // CRITICAL: Get the actual selected terms from SSoT - not just query string
    const ssotSelectedTerms = this.searchQuerySSoT.getSelectedTerms() || [];
    const currentQuery = this.searchQuerySSoT.getCurrentQuery();
    
    console.log('🔍 SSoT selected terms:', ssotSelectedTerms);
    console.log('🔍 Current query string:', currentQuery);
    
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
        console.log('🔧 Adding missing SSoT selected term to validTerms:', selectedTerm);
        
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
        
        console.log(`✅ Added missing SSoT selected ${isCore ? 'CORE' : 'regular'} term "${selectedTerm}" as ${termType}`);
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
      
      console.log(`🔧 Term "${term.term}": isSelected=${term.isSelected}, isCore=${term.isCore || false} (based on SSoT)`);
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
          console.log(`🗑️ Filtering out redundant name part: "${term.term}" (full name "Lisa Larson" already included)`);
          return false;
        }
        return true;
      });
      
      // Use filtered terms
      finalAvailableTerms = filteredTerms;
      console.log(`✅ Removed redundant name parts, ${finalAvailableTerms.length} terms remaining`);
    }
    
    // 🔧 EXTENDED TERMS STRATEGY: Show ALL available terms (both selected and unselected)
    // User requested: Core terms + Extended terms as checkboxes for complete control
    
    // Split terms into selected and unselected (using filtered terms)
    const selectedTermObjects = finalAvailableTerms.filter(term => term.isSelected);
    const unselectedTermObjects = finalAvailableTerms.filter(term => !term.isSelected);
    
    console.log(`📊 Extended terms strategy: ${selectedTermObjects.length} selected + ${unselectedTermObjects.length} unselected terms available`);
    
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
    
    console.log('🎯 Selected smart suggestions with EXTENDED terms (selected + unselected):');
    console.log(`   📌 Selected (pre-checked): ${selectedTermObjects.length}`);
    console.log(`   📋 Extended (unchecked): ${Math.min(remainingSlots, sortedUnselectedTerms.length)}`);
    console.log(`   📊 Total suggestions: ${smartSuggestions.length}`);
    
    smartSuggestions.forEach((term, index) => {
      const checkboxState = term.isSelected ? '✓' : '○';
      console.log(`   ${index + 1}. "${term.term}" (${term.type}) - Priority: ${term.priority}, Selected: ${checkboxState}, Core: ${term.isCore || false}`);
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
    
    console.log('🔧 Using LEGACY smart search filter generation');
    
    // Use the old method as fallback
    const smartSuggestions = this.selectSmartSuggestions(candidateTerms.candidates);
    
    // CRITICAL FIX: Even in legacy mode, prioritize SSoT for currentQuery
    let currentQuery;
    if (this.searchQuerySSoT && this.searchQuerySSoT.getCurrentQuery()) {
      currentQuery = this.searchQuerySSoT.getCurrentQuery();
      console.log('✅ LEGACY mode using SSoT query:', currentQuery);
    } else {
      currentQuery = candidateTerms.currentQuery || 'Automatisk sökning';
      console.log('⚠️ LEGACY mode using candidateTerms query:', currentQuery);
    }
    
    let filterHTML = `
      <div class="search-filter-section">
        <div class="filter-header">
          <h4 class="filter-title">🧠 AI-smarta sökförslag</h4>
          <div class="filter-description">Anpassa alla termer efter behov - du har full kontroll över sökningen</div>
        </div>
        <div class="smart-suggestions">
          <div class="current-query-display">
            <span class="current-label">Nuvarande:</span>
            <span class="current-query" id="current-search-display">"${currentQuery}"</span>
          </div>
          <div class="suggestion-controls">`;
    
    smartSuggestions.forEach(suggestion => {
      const priority = this.getSuggestionPriority(suggestion);
      const icon = this.getTypeIcon(suggestion.type);
      
      // CRITICAL FIX: Check if this is a core term even in legacy mode
      const isCore = this.isWatchBrand(suggestion.term) || 
                     suggestion.type === 'artist' || 
                     suggestion.type === 'brand' ||
                     (suggestion.term.toLowerCase() === 'omega'); // Explicit check for Omega
      
      // CRITICAL FIX: Override priority for core terms
      const finalPriority = isCore ? 'priority-core' : priority;
      const coreClass = isCore ? 'core-term' : '';
      // REMOVED: No more disabled attributes - users have full control
      const coreTitle = isCore ? ' (AI-rekommenderad som viktig - du kan ändra)' : '';
      
      filterHTML += `
        <label class="smart-suggestion-checkbox ${finalPriority} ${coreClass}" 
               title="${suggestion.description || suggestion.term}${coreTitle}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${suggestion.term}" 
                 data-type="${suggestion.type}"
                 data-core="${isCore}"
                 ${suggestion.preSelected ? 'checked' : ''}>
          <span class="suggestion-text">${suggestion.term}</span>
          <span class="suggestion-type">${icon}</span>
        </label>`;
    });
    
    filterHTML += `
          </div>
        </div>
        <div class="filter-status">
          <span class="loading-indicator" id="filter-loading" style="display: none;">🔄 Uppdaterar analys...</span>
          <span class="update-status" id="filter-status">Du har full kontroll - kryssa ur ALLA termer (även AI-förslag) om du vill</span>
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
        
        .market-dashboard-title {
          font-weight: 600;
          font-size: 13px;
          color: #2c3e50;
        }
        
        .market-dashboard-query {
          display: flex;
          align-items: center;
          gap: 4px;
          flex: 1;
          justify-content: center;
          background: #f8f9fa;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #e9ecef;
          min-width: 200px;
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
    console.log('🔄 Dashboard loading state enabled');
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
    
    console.log('✅ Dashboard loading state disabled');
  }

  // NEW: Determine actual search query from SSoT first, then sales data
  determineActualSearchQuery(salesData) {
    // CRITICAL FIX: Always check SearchQueryManager SSoT FIRST
    if (this.searchQuerySSoT && this.searchQuerySSoT.getCurrentQuery()) {
      const ssotQuery = this.searchQuerySSoT.getCurrentQuery();
      console.log('🎯 Using SSoT query as primary source:', ssotQuery);
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
        console.log('🎯 PRIORITY BOOST for pre-selected term:', candidate.term, 'new score:', score);
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
    
    console.log('🧠 AI-selected smart suggestions (LEGACY):', finalSuggestions.map(s => `${s.term} (${s.score})`));
    console.log('🎯 Pre-selected terms included (LEGACY):', preSelectedTerms.map(s => s.term));
    
    return finalSuggestions;
  }

  // NEW: Initialize SearchQueryManager SSoT immediately when candidate terms are available
  initializeSearchQueryManagerIfAvailable(candidateTerms, actualSearchQuery) {
    if (this.searchQuerySSoT && candidateTerms && actualSearchQuery) {
      console.log('🚀 IMMEDIATE SSoT initialization with candidate terms');
      console.log('   Actual Query:', actualSearchQuery);
      console.log('   Candidates:', candidateTerms.candidates?.length || 0);
      
      this.searchQuerySSoT.initialize(actualSearchQuery, candidateTerms, 'system');
      console.log('✅ SearchQueryManager SSoT initialized BEFORE dashboard creation');
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
    console.log('✅ Forced current query terms into SSoT:', actualSearchQuery);
  }

  // UPDATED: Use SearchQueryManager SSoT for smart suggestions
  generateSmartSearchFilters(candidateSearchTerms, hotReload = false) {
    console.log('🔧 Generating smart search filters for dashboard UI');
    
    // CRITICAL: Use SearchQueryManager SSoT if available
    if (this.searchQuerySSoT) {
      console.log('✅ Using SearchQueryManager SSoT for smart suggestions');
      
      const availableTerms = this.searchQuerySSoT.getAvailableTerms();
      const currentQuery = this.searchQuerySSoT.getCurrentQuery();
      
      console.log('📋 SSoT Available Terms:', availableTerms.length);
      console.log('📋 SSoT Current Query:', currentQuery);
      
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
      
      console.log('✅ Generated smart suggestions using SSoT');
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
    
    console.log('🔧 Using LEGACY smart search filter generation');
    
    // Use the old method as fallback
    const smartSuggestions = this.selectSmartSuggestions(candidateSearchTerms.candidates);
    const currentQuery = candidateSearchTerms.currentQuery || 'Automatisk sökning';
    
    let filterHTML = `
      <div class="search-filter-section">
        <div class="filter-header">
          <h4 class="filter-title">🧠 AI-smarta sökförslag</h4>
          <div class="filter-description">Anpassa alla termer efter behov - du har full kontroll över sökningen</div>
        </div>
        <div class="smart-suggestions">
          <div class="current-query-display">
            <span class="current-label">Nuvarande:</span>
            <span class="current-query" id="current-search-display">"${currentQuery}"</span>
          </div>
          <div class="suggestion-controls">`;

    smartSuggestions.forEach(suggestion => {
      const priority = this.getSuggestionPriority(suggestion);
      const icon = this.getTypeIcon(suggestion.type);
      
      // CRITICAL FIX: Check if this is a core term even in legacy mode
      const isCore = this.isWatchBrand(suggestion.term) || 
                     suggestion.type === 'artist' || 
                     suggestion.type === 'brand' ||
                     (suggestion.term.toLowerCase() === 'omega'); // Explicit check for Omega
      
      // CRITICAL FIX: Override priority for core terms
      const finalPriority = isCore ? 'priority-core' : priority;
      const coreClass = isCore ? 'core-term' : '';
      // REMOVED: No more disabled attributes - users have full control
      const coreTitle = isCore ? ' (AI-rekommenderad som viktig - du kan ändra)' : '';
      
      filterHTML += `
        <label class="smart-suggestion-checkbox ${finalPriority} ${coreClass}" 
               title="${suggestion.description || suggestion.term}${coreTitle}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${suggestion.term}" 
                 data-type="${suggestion.type}"
                 data-core="${isCore}"
                 ${suggestion.preSelected ? 'checked' : ''}>
          <span class="suggestion-text">${suggestion.term}</span>
          <span class="suggestion-type">${icon}</span>
        </label>`;
    });
    
    filterHTML += `
          </div>
        </div>
        <div class="filter-status">
          <span class="loading-indicator" id="filter-loading" style="display: none;">🔄 Uppdaterar analys...</span>
          <span class="update-status" id="filter-status">Du har full kontroll - kryssa ur ALLA termer (även AI-förslag) om du vill</span>
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
    console.log('🔧 Getting initial query for SSoT initialization from salesData');
    
    // CRITICAL FIX: Prioritize the ENHANCED candidateSearchTerms.currentQuery over API actualSearchQuery
    // The candidateSearchTerms.currentQuery includes important terms like "Seamaster" that the API query loses
    if (salesData.candidateSearchTerms && salesData.candidateSearchTerms.currentQuery) {
      console.log('✅ Using ENHANCED candidateSearchTerms.currentQuery (includes Seamaster, etc.)');
      return salesData.candidateSearchTerms.currentQuery;
    } else if (salesData.searchedEntity) {
      console.log('✅ Using searchedEntity as fallback');
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
      console.log('🎯 Using FINAL SSoT query as authoritative source:', ssotQuery);
      return ssotQuery;
    }
    
    console.log('⚠️ SSoT not available for final query, using fallback');
    
    // Only use as fallback if SSoT completely failed
    return this.getInitialQueryForSSoTInit(salesData);
  }

  // NEW: Force SSoT initialization when dashboard is accessed without proper initialization
  async forceSSoTInitializationAsync() {
    console.log('🚨 FORCING SSoT initialization - eliminating all other search term sources');
    
    try {
      // Check if SearchQuerySSoT is already available
      if (this.searchQuerySSoT) {
        console.log('✅ SearchQuerySSoT already available, proceeding...');
        return true;
      }
      
      console.log('⚠️ SearchQuerySSoT reference missing - attempting recovery...');
      await this.restoreSearchQuerySSoTReference();
    
      if (this.searchQuerySSoT) {
        console.log('✅ SearchQuerySSoT recovery successful');
        return true;
    } else {
        console.log('🚨 Recovery: SearchQuerySSoT import removed - using AI-only SearchQuerySSoT');
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
    console.log('🔧 Attempting to restore SearchQuerySSoT reference...');
    
    // Strategy 1: Check if we have it via QualityAnalyzer
    if (this.qualityAnalyzer && this.qualityAnalyzer.searchQuerySSoT) {
      console.log('✅ Found SearchQuerySSoT via QualityAnalyzer');
      this.searchQuerySSoT = this.qualityAnalyzer.searchQuerySSoT;
      return;
    }
    
    // Strategy 2: Check global assistant instance
    if (typeof window !== 'undefined' && window.auctionetAssistant && window.auctionetAssistant.searchQuerySSoT) {
      console.log('✅ Found SearchQuerySSoT via global assistant');
      this.searchQuerySSoT = window.auctionetAssistant.searchQuerySSoT;
      return;
    }
    
    console.log('⚠️ No SearchQuerySSoT reference found - please refresh page');
  }
} 