import { SalesAnalysisManager } from "/modules/sales-analysis-manager.js";
import { ItemTypeHandlers } from "/modules/item-type-handlers.js";
import { SearchTermExtractor } from "/modules/search-term-extractor.js";
import { SearchQueryManager } from "/modules/search-query-manager.js";

export class DashboardManager {
  constructor() {
    this.currentSearchQuery = '';
    this.apiManager = null;
    this.qualityAnalyzer = null;
    this.searchQueryManager = null;
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

  // NEW: Set SearchQueryManager for SSoT usage
  setSearchQueryManager(searchQueryManager) {
    this.searchQueryManager = searchQueryManager;
    console.log('✅ DashboardManager: SearchQueryManager SSoT connected');
    
    // Setup SSoT change listeners
    this.searchQueryManager.addChangeListener((event, data) => {
      this.onSearchQueryChange(event, data);
    });
  }

  // NEW: Handle search query changes from SSoT
  onSearchQueryChange(event, data) {
    console.log('🔄 DashboardManager received SSoT change:', event, data);
    
    // Update legacy currentSearchQuery for backward compatibility
    this.currentSearchQuery = data.query || '';
    
    // Update dashboard header display in real-time
    this.updateDashboardHeader(data.query || '', data.source || 'system');
    
    // Update smart suggestions display
    this.updateSmartSuggestionsDisplay();
  }

  // NEW: Update dashboard header with current query from SSoT
  updateDashboardHeader(query, source) {
    const headerQueryText = document.querySelector('.query-text');
    if (headerQueryText) {
      headerQueryText.textContent = `"${query}"`;
    }
    
    const headerQuerySource = document.querySelector('.query-source');
    if (headerQuerySource) {
      const sourceText = source === 'user' ? 'användarval' : 'automatisk analys';
      headerQuerySource.textContent = `(${sourceText})`;
    }
    
    const currentQueryDisplay = document.getElementById('current-search-display');
    if (currentQueryDisplay) {
      currentQueryDisplay.textContent = `"${query}"`;
    }
  }

  // NEW: Update smart suggestions display based on SSoT
  updateSmartSuggestionsDisplay() {
    if (!this.searchQueryManager) {
      console.log('⚠️ SearchQueryManager not available for suggestions display update');
      return;
    }
    
    const smartCheckboxes = document.querySelectorAll('.smart-checkbox');
    
    smartCheckboxes.forEach(checkbox => {
      const term = checkbox.value;
      const isSelected = this.searchQueryManager.isTermSelected(term);
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
    // CRITICAL FIX: Preserve SearchQueryManager reference during hot reload
    const originalSearchQueryManager = this.searchQueryManager;
    const preservedApiManager = this.apiManager;
    const preservedQualityAnalyzer = this.qualityAnalyzer;
    const isHotReload = this.isHotReloading;
    
    if (isHotReload && originalSearchQueryManager) {
      console.log('🔒 HOT RELOAD: Preserving original SearchQueryManager reference');
    }
    
    // CRITICAL FIX: Prevent duplicate dashboard creation unless it's a hot reload or initialization
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard && !this.isHotReloading && this.dashboardCreated) {
      console.log('⚠️ Dashboard already exists and not hot reloading - removing existing first');
      existingDashboard.remove();
    }
    
    // Reset the flag for this creation cycle
    this.dashboardCreated = false;
    
    console.log('🎯 Creating new dashboard with SSoT-unified data');
    
    // Generate dashboard ID
    const dashboardId = `dashboard-${Date.now()}`;
    
    // Create and populate the dashboard
    this.createDashboard(salesData, [], dashboardId);
    
    // CRITICAL FIX: RESTORE ALL REFERENCES after dashboard recreation
    this.searchQueryManager = originalSearchQueryManager;
    this.apiManager = preservedApiManager;
    this.qualityAnalyzer = preservedQualityAnalyzer;
    this.dashboardCreated = true;
    
    console.log('✅ Restored all critical references after dashboard recreation');
    console.log('🔒 SearchQueryManager restored:', !!this.searchQueryManager);
    console.log('🔒 ApiManager restored:', !!this.apiManager);
    console.log('🔒 QualityAnalyzer restored:', !!this.qualityAnalyzer);
    
    // Mark dashboard as created
    this.isHotReloading = false; // Reset hot reload flag
    
    console.log('✅ Dashboard creation complete with SSoT consistency');
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
      
      // Get auctionet.com URLs from SearchQueryManager SSoT
      let auctionetUrls = null;
      if (this.searchQueryManager) {
        auctionetUrls = this.searchQueryManager.getSearchUrls();
      }
      
      let dataDescription = '';
      if (historicalSales > 0 && liveSales > 0) {
        if (auctionetUrls) {
          dataDescription = `
            <div class="data-link-row">
              <span class="data-link-icon">📊</span>
              <a href="${auctionetUrls.historical}" target="_blank" class="data-link-prominent" title="Visa alla historiska försäljningar på Auctionet">${historicalSales} historiska försäljningar</a>
              <span class="data-link-meta">bekräftade</span>
            </div>
            <div class="data-link-row">
              <span class="data-link-icon">🔴</span>
              <a href="${auctionetUrls.live}" target="_blank" class="data-link-prominent" title="Visa alla pågående auktioner på Auctionet">${liveSales} pågående auktioner</a>
              <span class="data-link-meta">live</span>
            </div>`;
        } else {
          dataDescription = `${historicalSales} historiska försäljningar • ${liveSales} pågående auktioner`;
        }
      } else if (historicalSales > 0) {
        if (auctionetUrls) {
          dataDescription = `
            <div class="data-link-row">
              <span class="data-link-icon">📊</span>
              <a href="${auctionetUrls.historical}" target="_blank" class="data-link-prominent" title="Visa alla historiska försäljningar på Auctionet">${historicalSales} historiska försäljningar</a>
              <span class="data-link-meta">bekräftade</span>
            </div>`;
        } else {
          dataDescription = `${historicalSales} historiska försäljningar`;
        }
      } else if (liveSales > 0) {
        if (auctionetUrls) {
          dataDescription = `
            <div class="data-link-row">
              <span class="data-link-icon">🔴</span>
              <a href="${auctionetUrls.live}" target="_blank" class="data-link-prominent" title="Visa alla pågående auktioner på Auctionet">${liveSales} pågående auktioner</a>
              <span class="data-link-meta">live</span>
            </div>`;
        } else {
          dataDescription = `${liveSales} pågående auktioner`;
        }
      }
      
      if (totalMatches > historicalSales + liveSales) {
        dataDescription += `<div class="data-link-row"><span class="data-link-icon">🔍</span>${totalMatches} träffar analyserade</div>`;
      }
      
      dashboardContent += `
        <div class="market-item market-data">
          <div class="market-label" title="Omfattning av analyserad marknadsdata">Dataunderlag</div>
          <div class="market-value">${dataDescription}</div>
          <div class="market-help">Stark uppgång (senaste året)</div>
        </div>
      `;
    }
    
    // Exceptional Sales Section (if available)
    if (salesData.historical && salesData.historical.exceptionalSales) {
      const exceptional = salesData.historical.exceptionalSales;
      const exceptionellaCount = exceptional.count || 0;
      
      dashboardContent += `
        <div class="market-item market-exceptional">
          <div class="market-label" title="Särskilt höga bekräftade försäljningar som överträffar normal marknadsnivå">Exceptionella</div>
          <div class="market-value">${exceptionellaCount} exceptionella bekräftade försäljningar över 30 000 SEK</div>
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
    if (salesData.candidateSearchTerms) {
      console.log('🔧 Generating search filter HTML with SSoT-unified candidate terms');
      searchFilterHTML = this.generateSearchFilterHTML(salesData.candidateSearchTerms);
    } else {
      console.log('⚠️ No candidateSearchTerms available after SSoT initialization');
    }
    
    const querySource = this.searchQueryManager ? 
      this.searchQueryManager.getQuerySource() : 
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
  
  // NEW: Handle smart suggestion changes with immediate SSoT synchronization
  async handleSmartSuggestionChange() {
    console.log('🔄 Processing smart suggestion change with immediate SSoT sync...');
    
    // CRITICAL FIX: Check if SearchQueryManager is available before proceeding
    if (!this.searchQueryManager) {
      console.error('❌ CHECKBOX SYNC ERROR: SearchQueryManager is null');
      await this.restoreSearchQueryManagerReference();
      
      if (!this.searchQueryManager) {
        console.error('❌ All restoration attempts failed - checkbox sync not possible');
        return;
      }
    }
    
    // Get all currently checked smart suggestions
    const allCheckboxes = document.querySelectorAll('.smart-checkbox');
    const userSelectedTerms = [];
    
    allCheckboxes.forEach(checkbox => {
      if (checkbox.checked) {
        userSelectedTerms.push(checkbox.value);
      }
    });
    
    console.log('👤 User selected terms from checkboxes:', userSelectedTerms);
    
    // Update SearchQueryManager SSoT with user selections
    this.searchQueryManager.updateUserSelections(userSelectedTerms);
    
    // Re-sync all checkboxes to ensure consistency
    this.syncAllCheckboxesWithSSoT();
    
    // Preserve all critical references for hot reload
    console.log('🔒 Preserving all critical references for hot reload');
    const currentQuery = this.searchQueryManager.getCurrentQuery();
    console.log('🔄 SSoT updated query:', currentQuery);
    
    // Get search context for API call
    const searchContext = this.searchQueryManager.buildSearchContext();
    
    console.log('🎯 Triggering new API analysis with SSoT query:', searchContext.primarySearch);
    
    // Trigger new API analysis with the updated query
    if (this.apiManager) {
      try {
        // Update loading status
        const loadingElement = document.getElementById('filter-loading');
        const statusElement = document.getElementById('filter-status');
        
        if (loadingElement) loadingElement.style.display = 'inline';
        if (statusElement) statusElement.textContent = 'Uppdaterar analys med nya söktermer...';
        
        // Call API with new search context
        const salesData = await this.apiManager.analyzeSales(searchContext);
        
        // Hide loading
        if (loadingElement) loadingElement.style.display = 'none';
        if (statusElement) statusElement.textContent = 'Analys uppdaterad';
        
        // Preserve candidate terms for dashboard recreation
        await this.preserveCandidateTermsForHotReload(salesData, currentQuery);
        
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
        const loadingElement = document.getElementById('filter-loading');
        const statusElement = document.getElementById('filter-status');
        
        if (loadingElement) loadingElement.style.display = 'none';
        if (statusElement) {
          statusElement.textContent = 'Fel vid uppdatering av analys';
          statusElement.style.color = '#d32f2f';
        }
      }
    } else {
      console.error('❌ ApiManager not available for hot reload');
    }
  }
  
  // NEW: Restore SearchQueryManager reference using multiple strategies
  async restoreSearchQueryManagerReference() {
    console.log('🔧 Attempting to restore SearchQueryManager reference...');
    
    // Try multiple restoration sources in order of preference
    let restored = false;
    
    // 1. Try to restore from quality analyzer
    if (this.qualityAnalyzer && this.qualityAnalyzer.searchQueryManager) {
      this.searchQueryManager = this.qualityAnalyzer.searchQueryManager;
      console.log('✅ Restored SearchQueryManager reference from quality analyzer');
      restored = true;
    } 
    // 2. Try to restore from API manager
    else if (this.apiManager && this.apiManager.searchQueryManager) {
      this.searchQueryManager = this.apiManager.searchQueryManager;
      console.log('✅ Restored SearchQueryManager reference from API manager');
      restored = true;
    }
    // 3. Try to find it in the global scope (from content script)
    else if (typeof window !== 'undefined' && window.auctionetAssistant && window.auctionetAssistant.searchQueryManager) {
      this.searchQueryManager = window.auctionetAssistant.searchQueryManager;
      console.log('✅ Restored SearchQueryManager reference from global window');
      restored = true;
    }
    // 4. Try to create a new instance with current data as last resort
    else {
      try {
        const SearchQueryManager = await import('/modules/search-query-manager.js').then(m => m.SearchQueryManager);
        this.searchQueryManager = new SearchQueryManager();
        
        // Try to initialize with current dashboard data
        const smartCheckboxes = document.querySelectorAll('.smart-checkbox');
        const terms = Array.from(smartCheckboxes).map(cb => ({
          term: cb.value,
          type: 'unknown',
          description: cb.value,
          priority: 5,
          isSelected: cb.checked
        }));
        
        if (terms.length > 0) {
          this.searchQueryManager.initialize('', { candidates: terms }, 'emergency_restore');
          console.log('✅ Created new SearchQueryManager instance and initialized with current dashboard data');
          restored = true;
        }
      } catch (error) {
        console.error('❌ Failed to create emergency SearchQueryManager instance:', error);
      }
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
    if (!this.searchQueryManager) {
      console.log('⚠️ Cannot sync checkboxes - SearchQueryManager not available');
      return;
    }
    
    console.log('🔄 Syncing ALL checkbox instances with SSoT state...');
    
    const ssotSelectedTerms = this.searchQueryManager.getSelectedTerms() || [];
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
        
        // Check if this term should be selected based on SSoT
        const shouldBeChecked = ssotSelectedTerms.some(selectedTerm => 
          selectedTerm.toLowerCase() === termValue.toLowerCase() ||
          this.searchQueryManager.normalizeTermForMatching(selectedTerm) === this.searchQueryManager.normalizeTermForMatching(termValue)
        );
        
        // Update checkbox state if it doesn't match SSoT (user has full control)
        if (checkbox.checked !== shouldBeChecked) {
          checkbox.checked = shouldBeChecked;
          syncedCount++;
          console.log(`🔧 Synced checkbox "${termValue}": ${shouldBeChecked}`);
        }
      });
      
      console.log(`✅ Synced ${syncedCount} checkboxes with SSoT state`);
      
      // Also update the current query display
      const currentQuery = this.searchQueryManager.getCurrentQuery();
      const currentQueryDisplay = document.getElementById('current-search-display');
      if (currentQueryDisplay) {
        currentQueryDisplay.textContent = `"${currentQuery || 'Ingen sökning'}"`;
      }
    }, 100); // Wait 100ms for DOM to be ready
  }

  // NEW: Preserve candidate terms for continued hot reloading
  async preserveCandidateTermsForHotReload(salesData, currentQuery) {
    console.log('🔧 HOT RELOAD: Preserving candidate terms for continued fine-tuning...');
    
    try {
      // Get available terms from SSoT
      const availableTerms = this.searchQueryManager.getAvailableTerms();
      
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
    if (!this.searchQueryManager) {
      console.log('⚠️ SearchQueryManager not available, falling back to legacy method');
      return this.generateLegacySearchFilterHTML(candidateTerms);
    }
    
    // CRITICAL FIX: Don't fail just because getCurrentQuery() is empty string
    // SSoT might be initialized but not have a query yet, or query might be ""
    const currentQuery = this.searchQueryManager.getCurrentQuery();
    console.log('🔧 SSoT Query from getCurrentQuery():', `"${currentQuery}"`);
    
    // Get available terms from SearchQueryManager SSoT
    const availableTerms = this.searchQueryManager.getAvailableTerms();
    
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
      const coreTitle = suggestion.isCore ? ' (AI-rekommenderad som viktig)' : '';
      
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
          <span class="update-status" id="filter-status">Kryssa i/ur alla termer som du vill - full användarkonroll</span>
        </div>
      </div>`;
    
    return filterHTML;
  }

  // NEW: Select smart suggestions from SearchQueryManager SSoT
  selectSmartSuggestionsFromSSoT(availableTerms) {
    console.log('🧠 AI-selecting smart suggestions from SSoT with', availableTerms.length, 'available terms');
    
    // CRITICAL: Get the actual selected terms from SSoT - not just query string
    const ssotSelectedTerms = this.searchQueryManager.getSelectedTerms() || [];
    const currentQuery = this.searchQueryManager.getCurrentQuery();
    
    console.log('🔍 SSoT selected terms:', ssotSelectedTerms);
    console.log('🔍 Current query string:', currentQuery);
    
    // CRITICAL FIX: First, ensure all SSoT selected terms are in availableTerms
    ssotSelectedTerms.forEach(selectedTerm => {
      const matchingTerm = availableTerms.find(t => 
        t.term.toLowerCase() === selectedTerm.toLowerCase() || 
        this.searchQueryManager.normalizeTermForMatching(t.term) === this.searchQueryManager.normalizeTermForMatching(selectedTerm)
      );
      
      if (!matchingTerm) {
        console.log('🔧 Adding missing SSoT selected term to availableTerms:', selectedTerm);
        
        // Detect if this is a core term
        const isCore = this.searchQueryManager.isCoreSearchTerm(selectedTerm);
        const termType = isCore ? 
          (this.isWatchBrand(selectedTerm) ? 'brand' : 'artist') :
          this.detectTermTypeForMissing(selectedTerm);
        
        // Add the missing term with appropriate priority
        availableTerms.push({
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
        if (this.searchQueryManager.isCoreSearchTerm(matchingTerm.term)) {
          matchingTerm.isCore = true;
          console.log(`🔒 Marked existing term "${matchingTerm.term}" as CORE (from SSoT selected)`);
        }
      }
    });
    
    // CRITICAL FIX: Now mark all terms based on actual SSoT selection state
    availableTerms.forEach(term => {
      // Check if this term is actually selected in SSoT
      const isSelectedInSSoT = ssotSelectedTerms.some(selectedTerm => 
        selectedTerm.toLowerCase() === term.term.toLowerCase() ||
        this.searchQueryManager.normalizeTermForMatching(selectedTerm) === this.searchQueryManager.normalizeTermForMatching(term.term)
      );
      
      // Override the isSelected based on actual SSoT state
      term.isSelected = isSelectedInSSoT;
      
      // Check if it's a core term
      if (this.searchQueryManager.isCoreSearchTerm(term.term)) {
        term.isCore = true;
      }
      
      console.log(`🔧 Term "${term.term}": isSelected=${term.isSelected}, isCore=${term.isCore || false} (based on SSoT)`);
    });
    
    // CRITICAL FIX: New selection strategy - ALWAYS include selected terms first
    const selectedTermObjects = availableTerms.filter(term => term.isSelected);
    const unselectedTermObjects = availableTerms.filter(term => !term.isSelected);
    
    console.log(`📊 Selection strategy: ${selectedTermObjects.length} selected + ${unselectedTermObjects.length} unselected terms available`);
    
    // Start with ALL selected terms (these must always be shown)
    const smartSuggestions = [...selectedTermObjects];
    
    // Add unselected terms sorted by priority until we reach limit
    const sortedUnselectedTerms = unselectedTermObjects
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Add unselected terms up to total limit of 8 (more generous limit)
    const maxTotal = 8;
    const remainingSlots = Math.max(0, maxTotal - selectedTermObjects.length);
    
    smartSuggestions.push(...sortedUnselectedTerms.slice(0, remainingSlots));
    
    console.log('🎯 Selected smart suggestions with SSoT-synced selection state:');
    console.log(`   📌 Selected terms (always shown): ${selectedTermObjects.length}`);
    console.log(`   📋 Additional unselected terms: ${Math.min(remainingSlots, sortedUnselectedTerms.length)}`);
    console.log(`   📊 Total suggestions: ${smartSuggestions.length}`);
    
    smartSuggestions.forEach((term, index) => {
      console.log(`   ${index + 1}. "${term.term}" (${term.type}) - Priority: ${term.priority}, Selected: ${term.isSelected}, Core: ${term.isCore || false}`);
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
    if (this.searchQueryManager && this.searchQueryManager.getCurrentQuery()) {
      currentQuery = this.searchQueryManager.getCurrentQuery();
      console.log('✅ LEGACY mode using SSoT query:', currentQuery);
    } else {
      currentQuery = candidateTerms.currentQuery || 'Automatisk sökning';
      console.log('⚠️ LEGACY mode using candidateTerms query:', currentQuery);
    }
    
    let filterHTML = `
      <div class="search-filter-section">
        <div class="filter-header">
          <h4 class="filter-title">🧠 AI-smarta sökförslag</h4>
          <div class="filter-description">Lägg till relevanta termer för mer exakt analys - uppdateras automatiskt</div>
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
      const disabledAttr = isCore ? 'data-core="true"' : '';
      const coreTitle = isCore ? ' (Kärnsökterm - kan ej tas bort)' : '';
      
      filterHTML += `
        <label class="smart-suggestion-checkbox ${finalPriority} ${coreClass}" 
               title="${suggestion.description || suggestion.term}${coreTitle}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${suggestion.term}" 
                 data-type="${suggestion.type}"
                 ${disabledAttr}
                 ${suggestion.preSelected ? 'checked' : ''}
                 ${isCore ? 'disabled' : ''}>
          <span class="suggestion-text">${suggestion.term}</span>
          <span class="suggestion-type">${icon}</span>
        </label>`;
    });
    
    filterHTML += `
          </div>
        </div>
        <div class="filter-status">
          <span class="loading-indicator" id="filter-loading" style="display: none;">🔄 Uppdaterar analys...</span>
          <span class="update-status" id="filter-status">Kryssa i/ur alla termer som du vill - full användarkonroll</span>
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

  // Add CSS styles for the market dashboard
  addMarketDashboardStyles() {
    if (!document.getElementById('market-dashboard-styles')) {
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
        }
        
        .smart-suggestion-checkbox.priority-core .suggestion-text {
          color: #e65100;
          font-weight: 700;
        }
        
        .smart-suggestion-checkbox.priority-core:hover {
          background: #ffcc02;
          border-color: #f57c00;
          color: #bf360c;
        }
        
        /* CRITICAL FIX: Disabled core terms (cannot be unchecked) */
        .smart-suggestion-checkbox.priority-core:has(input[type="checkbox"]:disabled) {
          background: #ffcc02;
          border-color: #f57c00;
          color: #bf360c;
          cursor: not-allowed;
          opacity: 0.9;
        }
        
        .smart-suggestion-checkbox.priority-core:has(input[type="checkbox"]:disabled) .suggestion-text {
          color: #bf360c;
          font-weight: 700;
        }
        
        .smart-suggestion-checkbox.priority-core:has(input[type="checkbox"]:disabled:checked) {
          background: #ff8f00;
          border-color: #e65100;
          color: #ffffff;
          cursor: not-allowed;
          transform: none; /* Don't scale disabled elements */
        }
        
        .smart-suggestion-checkbox.priority-core:has(input[type="checkbox"]:disabled:checked) .suggestion-text {
          color: #ffffff;
          font-weight: 700;
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
  }

  // Show loading state on dashboard
  showDashboardLoading() {
    const dashboard = document.querySelector('.market-data-dashboard');
    if (dashboard) {
      const loadingDiv = document.createElement('div');
      loadingDiv.id = 'dashboard-loading';
      loadingDiv.innerHTML = `
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-size: 12px; color: #007cba; font-weight: 600; border-radius: 8px; z-index: 1000;">
          🔄 Uppdaterar marknadsanalys...
        </div>`;
      loadingDiv.style.position = 'relative';
      dashboard.style.position = 'relative';
      dashboard.appendChild(loadingDiv);
    }
  }

  // Hide loading state on dashboard
  hideDashboardLoading() {
    const loadingDiv = document.getElementById('dashboard-loading');
    if (loadingDiv) {
      loadingDiv.remove();
    }
  }

  // NEW: Determine actual search query from SSoT first, then sales data
  determineActualSearchQuery(salesData) {
    // CRITICAL FIX: Always check SearchQueryManager SSoT FIRST
    if (this.searchQueryManager && this.searchQueryManager.getCurrentQuery()) {
      const ssotQuery = this.searchQueryManager.getCurrentQuery();
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
    if (this.searchQueryManager && candidateTerms && actualSearchQuery) {
      console.log('🚀 IMMEDIATE SSoT initialization with candidate terms');
      console.log('   Actual Query:', actualSearchQuery);
      console.log('   Candidates:', candidateTerms.candidates?.length || 0);
      
      this.searchQueryManager.initialize(actualSearchQuery, candidateTerms, 'system');
      console.log('✅ SearchQueryManager SSoT initialized BEFORE dashboard creation');
      return true;
    }
    return false;
  }

  // CRITICAL: Ensure SearchQueryManager has all current query terms available
  ensureQueryTermsInSSoT(actualSearchQuery) {
    if (!this.searchQueryManager || !actualSearchQuery) return;
    
    // Force ensure current query terms are available
    this.searchQueryManager.currentQuery = actualSearchQuery;
    this.searchQueryManager.ensureCurrentQueryTermsAvailable();
    console.log('✅ Forced current query terms into SSoT:', actualSearchQuery);
  }

  // UPDATED: Use SearchQueryManager SSoT for smart suggestions
  generateSmartSearchFilters(candidateSearchTerms, hotReload = false) {
    console.log('🔧 Generating smart search filters for dashboard UI');
    
    // CRITICAL: Use SearchQueryManager SSoT if available
    if (this.searchQueryManager) {
      console.log('✅ Using SearchQueryManager SSoT for smart suggestions');
      
      const availableTerms = this.searchQueryManager.getAvailableTerms();
      const currentQuery = this.searchQueryManager.getCurrentQuery();
      
      console.log('📋 SSoT Available Terms:', availableTerms.length);
      console.log('📋 SSoT Current Query:', currentQuery);
      
      // Generate HTML for each available term
      const suggestions = availableTerms
        .sort((a, b) => (b.score || 0) - (a.score || 0)) // Sort by score
        .slice(0, 5) // Take top 5
        .map(termObj => {
          const isSelected = this.searchQueryManager.isTermSelected(termObj.term);
          const isCore = this.searchQueryManager.isCoreTerm(termObj.term);
          
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
          <div class="filter-description">Lägg till relevanta termer för mer exakt analys - uppdateras automatiskt</div>
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
      const disabledAttr = isCore ? 'data-core="true"' : '';
      const coreTitle = isCore ? ' (Kärnsökterm - kan ej tas bort)' : '';
      
      filterHTML += `
        <label class="smart-suggestion-checkbox ${finalPriority} ${coreClass}" 
               title="${suggestion.description || suggestion.term}${coreTitle}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${suggestion.term}" 
                 data-type="${suggestion.type}"
                 ${disabledAttr}
                 ${suggestion.preSelected ? 'checked' : ''}
                 ${isCore ? 'disabled' : ''}>
          <span class="suggestion-text">${suggestion.term}</span>
          <span class="suggestion-type">${icon}</span>
        </label>`;
    });
    
    filterHTML += `
          </div>
        </div>
        <div class="filter-status">
          <span class="loading-indicator" id="filter-loading" style="display: none;">🔄 Uppdaterar analys...</span>
          <span class="update-status" id="filter-status">Kryssa i/ur alla termer som du vill - full användarkonroll</span>
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
    
    // Fallback priority order for initial SSoT initialization
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
  
  // NEW: Get final query from SSoT (after SSoT is initialized with candidate terms)
  getFinalQueryFromSSoT(salesData) {
    // CRITICAL: Always prioritize SSoT after it's been properly initialized
    if (this.searchQueryManager && this.searchQueryManager.getCurrentQuery()) {
      const ssotQuery = this.searchQueryManager.getCurrentQuery();
      console.log('🎯 Using FINAL SSoT query as authoritative source:', ssotQuery);
      return ssotQuery;
    }
    
    console.log('⚠️ SSoT not available for final query, using fallback');
    
    // Only use as fallback if SSoT completely failed
    return this.getInitialQueryForSSoTInit(salesData);
  }

  // NEW: FORCE ALL components to use SSoT ONLY - no more candidateSearchTerms chaos
  async forceSSoTInitializationAsync(salesData) {
    console.log('🚨 FORCING SSoT initialization - eliminating all other search term sources');
    
    // CRITICAL FIX: Ensure SearchQueryManager reference is available
    if (!this.searchQueryManager) {
      console.log('⚠️ SearchQueryManager reference missing - attempting recovery...');
      
      // Recovery Strategy 1: Check if we have it via QualityAnalyzer
      if (this.qualityAnalyzer && this.qualityAnalyzer.searchQueryManager) {
        console.log('🔧 Recovery: Found SearchQueryManager via QualityAnalyzer');
        this.searchQueryManager = this.qualityAnalyzer.searchQueryManager;
      }
      // Recovery Strategy 2: Check if we have it via ApiManager
      else if (this.apiManager && this.apiManager.searchQueryManager) {
        console.log('🔧 Recovery: Found SearchQueryManager via ApiManager');
        this.searchQueryManager = this.apiManager.searchQueryManager;
      }
      // Recovery Strategy 3: Check global assistant instance
      else if (typeof window !== 'undefined' && window.auctionetAssistant && window.auctionetAssistant.searchQueryManager) {
        console.log('🔧 Recovery: Found SearchQueryManager via global assistant');
        this.searchQueryManager = window.auctionetAssistant.searchQueryManager;
      }
      // Recovery Strategy 4: Create emergency instance as last resort
      else {
        console.log('🚨 Recovery: Creating emergency SearchQueryManager instance');
        const { SearchQueryManager } = await import(chrome.runtime.getURL('modules/search-query-manager.js'));
        this.searchQueryManager = new SearchQueryManager();
      }
      
      if (this.searchQueryManager) {
        console.log('✅ SearchQueryManager recovery successful');
      } else {
        console.error('❌ CRITICAL: SearchQueryManager recovery failed completely');
        return false;
      }
    }
    
    // STEP 1: Get basic query from salesData (only for initial SSoT setup)
    let baseQuery = this.getInitialQueryForSSoTInit(salesData);
    console.log('🔧 Base query for SSoT init:', baseQuery);
    
    // STEP 2: If we have candidate terms, extract them ONCE and put into SSoT
    let candidateTermsForSSoT = null;
    
    if (salesData.candidateSearchTerms) {
      console.log('✅ Using existing candidateSearchTerms for SSoT');
      candidateTermsForSSoT = salesData.candidateSearchTerms;
    } else {
      console.log('🔧 No candidateSearchTerms - SSoT will handle term extraction');
      
      // Let SSoT extract its own terms from base data
      if (this.qualityAnalyzer && this.qualityAnalyzer.searchFilterManager) {
        const filterManager = this.qualityAnalyzer.searchFilterManager;
        
        // Extract fresh candidate terms ONCE
        const extractedTerms = filterManager.extractCandidateSearchTerms(
          salesData.title || '',
          salesData.description || '',
          salesData.artistInfo || null,
          baseQuery
        );
        
        candidateTermsForSSoT = extractedTerms;
        console.log('🔧 Extracted candidate terms for SSoT:', candidateTermsForSSoT);
      }
    }
    
    // STEP 3: Initialize SSoT with ALL the terms
    if (this.searchQueryManager) {
      this.searchQueryManager.initialize(
        baseQuery,
        candidateTermsForSSoT,
        salesData.hotReload ? 'user' : 'system'
      );
      console.log('✅ SSoT initialized with candidate terms');
    } else {
      console.error('❌ CRITICAL: SearchQueryManager not available for forced initialization');
      return false;
    }
    
    // STEP 4: Now get the AUTHORITATIVE query from SSoT
    const authoritativeQuery = this.searchQueryManager.getCurrentQuery();
    console.log('🎯 AUTHORITATIVE SSoT query:', authoritativeQuery);
    
    // STEP 5: FORCE all salesData to use SSoT values ONLY
    salesData.searchedEntity = authoritativeQuery;
    
    if (salesData.historical) {
      salesData.historical.actualSearchQuery = authoritativeQuery;
    }
    
    if (salesData.live) {
      salesData.live.actualSearchQuery = authoritativeQuery;
    }
    
    // STEP 6: Create SSoT-based candidateSearchTerms that everything will use
    const ssotTerms = this.searchQueryManager.getAvailableTerms();
    const ssotCandidateTerms = {
      candidates: ssotTerms.map(term => ({
        term: term.term,
        type: term.type,
        description: term.description,
        priority: term.priority,
        preSelected: term.isSelected
      })),
      currentQuery: authoritativeQuery,
      analysisType: salesData.analysisType || 'ssot_forced'
    };
    
    salesData.candidateSearchTerms = ssotCandidateTerms;
    
    // STEP 7: Update all manager references to use SSoT
    if (this.qualityAnalyzer && this.qualityAnalyzer.searchFilterManager) {
      this.qualityAnalyzer.searchFilterManager.lastCandidateSearchTerms = ssotCandidateTerms;
    }
    
    console.log('🚨 FORCED SSoT initialization complete - all components now use same source');
    console.log('🎯 Final authoritative query:', authoritativeQuery);
    console.log('🔧 Available SSoT terms:', ssotTerms.length);
    
    return true;
  }
} 