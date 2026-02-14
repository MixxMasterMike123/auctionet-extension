// modules/dashboard-manager-v2.js - Modular Dashboard Manager

import { PillGenerator } from './ui/pill-generator.js';
import { CheckboxManager } from './ui/checkbox-manager.js';
import { TermProcessor } from './core/term-processor.js';
import { escapeHTML } from './core/html-escape.js';

export class DashboardManagerV2 {
  constructor() {
    // Initialize focused modules
    this.pillGenerator = new PillGenerator();
    this.termProcessor = new TermProcessor();
    this.checkboxManager = null; // Will be initialized when SSoT is available
    
    // Dependencies
    this.apiManager = null;
    this.qualityAnalyzer = null;
    this.searchQuerySSoT = null;
    
    // State
    this.dashboardCreated = false;
    this.currentTerms = [];

    // COST OPTIMIZATION: Callback for deferred market analysis loading
    this.onDashboardOpenCallback = null;
  }

  // Set dependencies
  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  setQualityAnalyzer(qualityAnalyzer) {
    this.qualityAnalyzer = qualityAnalyzer;
  }

  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
    
    // Initialize checkbox manager with SSoT
    if (this.checkboxManager) {
      this.checkboxManager.destroy(); // Clean up old instance
    }
    this.checkboxManager = new CheckboxManager(searchQuerySSoT);
    
  }

  // MAIN: Create dashboard with market data
  addMarketDataDashboard(salesData, analysisType = 'artist') {
    
    // Step 1: Process terms with conflict resolution
    const processedTerms = this.processTermsFromSalesData(salesData);
    
    // Step 2: Create dashboard structure
    this.createDashboardStructure(salesData, processedTerms);
    
    // Step 3: Setup interactions
    this.setupDashboardInteractions();
    
  }

  // Process terms from sales data with conflict resolution
  processTermsFromSalesData(salesData) {
    
    let terms = [];
    
    // Strategy 1: Get terms from SSoT if available
    if (this.searchQuerySSoT) {
      const availableTerms = this.searchQuerySSoT.getAvailableTerms();
      if (availableTerms.length > 0) {
        terms = availableTerms;
      }
    }
    
    // Strategy 2: Fallback to candidate terms from sales data
    if (terms.length === 0 && salesData.candidateSearchTerms) {
      terms = this.termProcessor.processCandidateTerms(salesData.candidateSearchTerms);
    }
    
    // Strategy 3: Emergency fallback
    if (terms.length === 0) {
      const query = this.searchQuerySSoT?.getCurrentQuery() || 'Unknown';
      terms = [{
        term: query,
        type: 'keyword',
        description: 'Aktuell sökning',
        priority: 100,
        isSelected: true,
        isCore: true
      }];
    }
    
    // CRITICAL: Apply conflict resolution
    const conflictResolved = this.termProcessor.resolveTermConflicts(terms);
    
    // Store for later use
    this.currentTerms = conflictResolved;
    
    return conflictResolved;
  }

  // Create the dashboard HTML structure
  createDashboardStructure(salesData, terms) {

    
    // Check if we should preserve the existing dropdown to avoid flickering
    const STORAGE_KEY = 'auctionet_market_analysis_visible';
    const shouldStayOpen = localStorage.getItem(STORAGE_KEY) === 'true';
    const existingContainer = document.querySelector('.market-dropdown-container');
    
    // If dropdown should stay open and exists, lock its height and show spinner
    if (shouldStayOpen && existingContainer) {
      // Lock height to prevent layout shift during content swap
      const currentHeight = existingContainer.offsetHeight;
      if (currentHeight > 0) {
        existingContainer.style.minHeight = currentHeight + 'px';
      }
      this.showSpinnerOverlay(existingContainer);
      // Don't remove existing elements, just update them
    } else {
      // Normal flow - remove existing elements
      const existingButton = document.querySelector('.minimal-market-toggle');
      const existingDashboard = document.querySelector('.market-data-dashboard');
      
      if (existingButton) existingButton.remove();
      if (existingContainer) existingContainer.remove();
      if (existingDashboard) existingDashboard.remove();
    }
    
    // Create new dashboard container
    const dashboard = document.createElement('div');
    dashboard.className = 'market-data-dashboard';
    
    // Generate header with pills
    const headerHTML = this.generateDashboardHeader(salesData, terms);
    
    // Generate market content
    const contentHTML = this.generateMarketContent(salesData);
    
    // Generate disclaimer
    const disclaimerHTML = this.generateDisclaimer();
    
    // Combine all sections
    dashboard.innerHTML = headerHTML + contentHTML + disclaimerHTML;
    
    // Add styles
    this.addMarketDashboardStyles();
    
    // Check if we're updating existing dropdown or creating new one
    if (shouldStayOpen && existingContainer) {
      // Update existing dropdown content
      try {
        this.updateExistingDropdownContent(dashboard, existingContainer);
      } catch (error) {
        console.error('Failed to update existing dropdown, falling back to recreation:', error);
        // Fallback: remove existing and create new
        existingContainer.remove();
        this.createSmoothDropdownDashboard(dashboard);
      }
    } else {
      // Create new dropdown
      this.createSmoothDropdownDashboard(dashboard);
    }
    
    this.dashboardCreated = true;
  }

  // Generate dashboard header with pills
  generateDashboardHeader(salesData, terms) {
    
    const currentQuery = this.searchQuerySSoT?.getCurrentQuery() || 'Unknown search';
    const querySource = this.searchQuerySSoT?.getQuerySource() || 'automatisk';
    
    // Generate pills using the focused pill generator
    const headerPillsHTML = this.pillGenerator.generateHeaderPills(terms, { maxUnselected: 4 });
    
    return `
      <div class="market-dashboard-header">
        <div class="header-left-section">
          <div class="market-dashboard-title">Marknadsanalys</div>
          <div class="market-dashboard-query">
            <span class="query-label">Sökning:</span>
            <span class="query-text">"${escapeHTML(currentQuery)}"</span>
            <span class="query-source">(${escapeHTML(querySource)})</span>
          </div>
          <div class="header-pills-wrapper">
            ${headerPillsHTML}
          </div>
        </div>
        <div class="market-dashboard-source">
          ${escapeHTML(salesData.dataSource || 'Auctionet API')}
        </div>
      </div>`;
  }

  // Generate market content section
  generateMarketContent(salesData) {
    
    let contentHTML = '<div class="market-dashboard-content">';
    
    // 1. MARKNADSVÄRDE - Price range section
    if (salesData.priceRange) {
      contentHTML += this.generatePriceSection(salesData);
    }
    
    // 2. MARKNADSSTATUS - Combined insights + trend (merged from old PRISTREND + MARKNADSTREND)
    if (salesData.insights && salesData.insights.length > 0) {
      contentHTML += this.generateInsightsSection(salesData);
    }
    
    // 3. DATAUNDERLAG - Data foundation section  
    if (salesData.historical) {
      contentHTML += this.generateDataSection(salesData);
    }
    
    // 4. EXCEPTIONELLA - Exceptional Sales section
    if (salesData.historical?.exceptionalSales) {
      contentHTML += this.generateExceptionalSalesSection(salesData);
    }
    
    // 5. MARKNADSAKTIVITET - Market Activity section  
    if (salesData.live?.marketActivity) {
      contentHTML += this.generateMarketActivitySection(salesData);
    }
    
    contentHTML += '</div>';
    return contentHTML;
  }

  // Generate price section
  generatePriceSection(salesData) {
    const priceRange = salesData.priceRange;
    const confidence = salesData.confidence || 0.5;
    
    const formattedLow = new Intl.NumberFormat('sv-SE').format(priceRange.low);
    const formattedHigh = new Intl.NumberFormat('sv-SE').format(priceRange.high);
    
    const displayConfidence = Math.min(confidence, 0.95);
    const confidencePercent = Math.round(displayConfidence * 100);
    
    let confidenceIcon, confidenceColor;
    if (displayConfidence >= 0.75) {
      confidenceIcon = 'Stark';
      confidenceColor = '#27ae60';
    } else if (displayConfidence >= 0.55) {
      confidenceIcon = 'Måttlig';
      confidenceColor = '#f39c12';
    } else {
      confidenceIcon = 'Begränsad';
      confidenceColor = '#e67e22';
    }
    
    return `
      <div class="market-item market-price">
        <div class="market-label">Marknadsvärde</div>
        <div class="market-label-subtitle">Prisintervall från historiska slutpriser</div>
        <div class="market-value">${formattedLow}-${formattedHigh} SEK</div>
        <div class="market-confidence" style="color: ${confidenceColor};">${confidenceIcon} ${confidencePercent}%</div>
        <div class="market-help">Baserat på jämförbara auktionsresultat</div>
      </div>`;
  }

  // Generate data foundation section
  generateDataSection(salesData) {
    const historical = salesData.historical;
    const live = salesData.live;
    
    const historicalSales = historical?.analyzedSales || 0;
    const liveSales = live?.analyzedLiveItems || 0;
    const totalMatches = (historical?.totalMatches || 0) + (live?.totalMatches || 0);
    
    // Generate Auctionet URLs using SSoT query
    const baseUrl = 'https://auctionet.com/sv/search'; // See also CONFIG.URLS.AUCTIONET_SEARCH
    let historicalUrl = baseUrl;
    let liveUrl = baseUrl;
    
    // Get current search query from SSoT for URL generation
    const ssotQuery = this.searchQuerySSoT?.getCurrentQuery();
    if (ssotQuery) {
      historicalUrl = `${baseUrl}?event_id=&is=ended&q=${encodeURIComponent(ssotQuery)}`;
      liveUrl = `${baseUrl}?event_id=&is=&q=${encodeURIComponent(ssotQuery)}`;
    }
    
    // Main description
    let dataDescription = '';
    if (historicalSales > 0 && liveSales > 0) {
      dataDescription = `${historicalSales} historiska försäljningar • ${liveSales} pågående auktioner`;
    } else if (historicalSales > 0) {
      dataDescription = `${historicalSales} historiska försäljningar`;
    } else if (liveSales > 0) {
      dataDescription = `${liveSales} pågående auktioner`;
    }
    
    // Generate clickable links to Auctionet
    let dataLinks = '';
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
    
    // Add total matches if more than individual counts
    if (totalMatches > historicalSales + liveSales && dataLinks) {
      dataLinks += `<div class="data-link-row"><span class="data-link-icon">🔍</span>${totalMatches} träffar analyserade</div>`;
    }
    
    return `
      <div class="market-item market-data">
        <div class="market-label">Dataunderlag</div>
        <div class="market-label-subtitle">Antal analyserade auktioner</div>
        <div class="market-value">${dataDescription}</div>
        ${dataLinks ? `<div class="market-help">${dataLinks}</div>` : '<div class="market-help">Omfattning av analyserad marknadsdata</div>'}
      </div>`;
  }

  // Generate exceptional sales section
  generateExceptionalSalesSection(salesData) {
    const exceptional = salesData.historical.exceptionalSales;
    const exceptionellaCount = exceptional.count || 0;
    
    // Use actual dynamic threshold instead of hardcoded value
    const thresholdText = exceptional.threshold ? 
      `${Math.round(exceptional.threshold).toLocaleString()} SEK` : 
      'market threshold';
    
    // Generate numbered links to top 4 highest-priced exceptional sales
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
    
    return `
      <div class="market-item market-exceptional">
        <div class="market-label">Exceptionella</div>
        <div class="market-value">${exceptionellaCount} exceptionella bekräftade försäljningar över ${thresholdText}</div>
        <div class="market-help">${exceptional.description || 'Bekräftade höga försäljningar'}</div>
        ${exceptionalLinksHTML}
      </div>`;
  }

  // Generate market activity section
  generateMarketActivitySection(salesData) {
    const activity = salesData.live.marketActivity;
    let activityDescription = '';
    
    if (activity.averageBidsPerItem) {
      activityDescription = `Svag (${Math.round(activity.averageBidsPerItem)} bud/objekt)`;
    } else {
      activityDescription = 'Måttlig marknadsaktivitet';
    }
    
    return `
      <div class="market-item market-activity">
        <div class="market-label">Marknadsaktivitet</div>
        <div class="market-value">${activityDescription}</div>
        <div class="market-help">Baserat på ${salesData.live.analyzedLiveItems || 0} pågående auktioner</div>
      </div>`;
  }

  // Generate insights section
  generateInsightsSection(salesData) {
    const significantInsight = salesData.insights.find(insight => insight.significance === 'high') || salesData.insights[0];
    
    const type = significantInsight.type || '';
    const summary = significantInsight.summary || significantInsight.message || '';
    const detail = significantInsight.detail || significantInsight.message || '';
    
    let statusColor;
    switch (type) {
      case 'conflict':      statusColor = '#dc3545'; break;
      case 'market_weakness': statusColor = '#e67e22'; break;
      case 'market_strength': statusColor = '#28a745'; break;
      case 'market_info':    statusColor = '#6c757d'; break;
      case 'price_comparison':
      default:
        if (summary.includes('sänk') || summary.includes('högt')) statusColor = '#e67e22';
        else if (summary.includes('höja') || summary.includes('lågt') || summary.includes('Starkare')) statusColor = '#28a745';
        else if (summary.includes('Svag')) statusColor = '#e67e22';
        else statusColor = '#495057';
        break;
    }
    
    const cleanSummary = summary.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const cleanDetail = detail.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    
    // Build inline historical trend line (folded from the old standalone PRISTREND card)
    let trendLineHTML = '';
    const trend = salesData.historical?.trendAnalysis;
    if (trend && trend.trend && trend.trend !== 'insufficient_data') {
      let trendIcon, trendColor;
      switch (trend.trend) {
        case 'rising_strong':
          trendIcon = '⬆'; trendColor = '#1e7e34'; break;
        case 'rising':
          trendIcon = '↗'; trendColor = '#28a745'; break;
        case 'falling':
          trendIcon = '↘'; trendColor = '#e67e22'; break;
        case 'falling_strong':
          trendIcon = '⬇'; trendColor = '#dc3545'; break;
        case 'stable':
        default:
          trendIcon = '→'; trendColor = '#6c757d'; break;
      }
      const sign = trend.changePercent > 0 ? '+' : '';
      // Extract time span from description (e.g. "11 år tillbaka")
      const timeMatch = trend.description ? trend.description.match(/(\d+\s*(?:år|månader)\s*tillbaka)/) : null;
      const timeSpan = timeMatch ? timeMatch[1] : '';
      trendLineHTML = `<div class="market-trend-inline" style="color: ${trendColor}; font-size: 10px; margin-top: 3px;">${trendIcon} ${sign}${Math.round(trend.changePercent)}% historiskt${timeSpan ? ' (' + escapeHTML(timeSpan) + ')' : ''}</div>`;
    }
    
    // Store insight data for KB card (will be picked up by setupInsightKBCard)
    this._lastInsightData = { type, summary: cleanSummary, detail: cleanDetail, statusColor, salesData };
    
    return `
      <div class="market-item market-insights market-insights-trigger" style="cursor: pointer;">
        <div class="market-label" style="cursor: help; border-bottom: 1px dotted #6c757d;" title="Hovra för värderingsförslag">Marknadsstatus</div>
        <div class="market-label-subtitle">Aktuell marknadsbedömning</div>
        <div class="market-value" style="color: ${escapeHTML(statusColor)};">${escapeHTML(cleanSummary)}</div>
        <div class="market-help market-insight-detail">${escapeHTML(cleanDetail)}</div>
        ${trendLineHTML}
      </div>`;
  }

  // DEPRECATED: Standalone trend card — now folded into generateInsightsSection() as inline trend line
  generateTrendSection(salesData) {
    const trend = salesData.historical.trendAnalysis;
    
    let trendIcon, trendColor;
    
    switch (trend.trend) {
      case 'rising_strong':
        trendIcon = '⬆ +' + Math.abs(trend.changePercent) + '%';
        trendColor = '#1e7e34';
        break;
      case 'rising':
        trendIcon = '↗ +' + Math.abs(trend.changePercent) + '%';
        trendColor = '#28a745';
        break;
      case 'falling':
        trendIcon = '↘ ' + trend.changePercent + '%';
        trendColor = '#e67e22';
        break;
      case 'falling_strong':
        trendIcon = '⬇ ' + trend.changePercent + '%';
        trendColor = '#dc3545';
        break;
      case 'stable':
      default:
        trendIcon = '→ ' + (trend.changePercent > 0 ? '+' : '') + trend.changePercent + '%';
        trendColor = '#6c757d';
        break;
    }
    
    return `
      <div class="market-item market-trend">
        <div class="market-label">Pristrend</div>
        <div class="market-value" style="color: ${trendColor};">${trendIcon}</div>
        <div class="market-help">${trend.description || 'Prisutveckling över tid'}</div>
      </div>`;
  }

  // Generate disclaimer
  generateDisclaimer() {
    return `
      <div class="market-dashboard-disclaimer">
        💡 Marknadsdata är vägledning - varje objekt är unikt och kan ha särskilda egenskaper som påverkar värdet
      </div>`;
  }

  // Setup dashboard interactions
  setupDashboardInteractions() {
    
    if (!this.checkboxManager) {
      return;
    }
    
    // Attach checkbox listeners
    const attachedCount = this.checkboxManager.attachCheckboxListeners();
    
    // Sync checkboxes with SSoT
    setTimeout(() => {
      const syncResult = this.checkboxManager.syncAllCheckboxesWithSSoT();
    }, 100);
    
    // Setup expand/collapse functionality
    this.setupExpandCollapse();
    
    // Setup market insight KB card on hover
    this.setupInsightKBCard();
  }

  // Setup expand/collapse functionality
  setupExpandCollapse() {
    
    const expandBtn = document.querySelector('.header-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        this.expandHeaderPills();
      });
      
    }
  }

  // Setup market insight KB card on the Marknadstrend card
  setupInsightKBCard() {
    // Remove any existing KB card from a previous render
    const existingCard = document.querySelector('.insight-kb-card');
    if (existingCard) existingCard.remove();
    
    const trigger = document.querySelector('.market-insights-trigger');
    if (!trigger || !this._lastInsightData) return;
    
    const data = this._lastInsightData;
    let kbCard = null;
    let hideTimeout = null;
    let isHoveringTrigger = false;
    let isHoveringCard = false;
    let scrollHandler = null;
    
    const positionCard = () => {
      if (!kbCard) return;
      const rect = trigger.getBoundingClientRect();
      const cardWidth = 340;
      let left = rect.left + rect.width / 2 - cardWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - cardWidth - 8));
      kbCard.style.left = `${left}px`;
      
      const cardHeight = kbCard.offsetHeight || 400;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      if (spaceBelow >= cardHeight || spaceBelow >= spaceAbove) {
        kbCard.style.top = `${rect.bottom + 8}px`;
      } else {
        kbCard.style.top = `${rect.top - cardHeight - 8}px`;
      }
      const currentTop = parseFloat(kbCard.style.top);
      const maxTop = window.innerHeight - cardHeight - 8;
      kbCard.style.top = `${Math.max(8, Math.min(currentTop, maxTop))}px`;
    };
    
    const attachScroll = () => {
      if (scrollHandler) return;
      scrollHandler = () => { if (kbCard?.style.visibility === 'visible') positionCard(); };
      window.addEventListener('scroll', scrollHandler, { passive: true });
      window.addEventListener('resize', scrollHandler, { passive: true });
    };
    const detachScroll = () => {
      if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
        window.removeEventListener('resize', scrollHandler);
        scrollHandler = null;
      }
    };
    
    const showCard = () => {
      if (!kbCard) return;
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      positionCard();
      kbCard.style.opacity = '1';
      kbCard.style.visibility = 'visible';
      kbCard.style.transform = 'translateY(0) scale(1)';
      kbCard.style.pointerEvents = 'auto';
      attachScroll();
    };
    
    const scheduleHide = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!isHoveringTrigger && !isHoveringCard && kbCard) {
          kbCard.style.opacity = '0';
          kbCard.style.visibility = 'hidden';
          kbCard.style.transform = 'translateY(6px) scale(0.96)';
          kbCard.style.pointerEvents = 'none';
          detachScroll();
        }
      }, 200);
    };
    
    trigger.addEventListener('mouseenter', () => {
      isHoveringTrigger = true;
      if (kbCard) { showCard(); return; }
      
      kbCard = this.createInsightKBCard(data);
      kbCard.addEventListener('mouseenter', () => {
        isHoveringCard = true;
        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      });
      kbCard.addEventListener('mouseleave', () => {
        isHoveringCard = false;
        scheduleHide();
      });
      showCard();
    });
    
    trigger.addEventListener('mouseleave', () => {
      isHoveringTrigger = false;
      scheduleHide();
    });
  }
  
  // Create the market insight KB card
  createInsightKBCard(data) {
    this.addInsightKBCardStyles();
    
    const { type, summary, detail, statusColor, salesData } = data;
    const priceRange = salesData.priceRange;
    const confidence = salesData.confidence || 0;
    const historical = salesData.historical;
    const live = salesData.live;
    const stats = historical?.statistics || {};
    
    // Read current field values
    const currentEstimate = parseFloat(document.querySelector('#item_current_auction_attributes_estimate')?.value) || 0;
    const currentReserve = parseFloat(document.querySelector('#item_current_auction_attributes_reserve')?.value) || 0;
    
    // Use MEDIAN for suggested valuation (more robust to outliers than average)
    const medianPrice = stats.median || (priceRange ? (priceRange.low + priceRange.high) / 2 : 0);
    
    // Calculate spread ratio to assess data reliability
    const spreadRatio = priceRange ? priceRange.high / Math.max(priceRange.low, 1) : 0;
    const isWideSpread = spreadRatio > 10;   // 10x+ = very unreliable
    const isModerateSpread = spreadRatio > 5; // 5x+ = somewhat unreliable
    
    // AI validation info (needed for discount logic)
    const aiValidated = historical?.aiValidated || false;
    
    // Conservative valuation: apply a discount when data is broad/unreliable.
    // Better to start low and generate bidding wars than overprice and get no bids.
    // AI-validated data is trusted more (tighter, filtered results).
    let valuationDiscount = 1.0; // no discount by default
    if (isWideSpread && !aiValidated) {
      valuationDiscount = 0.75; // 25% discount for very broad unvalidated data
    } else if (isWideSpread && aiValidated) {
      valuationDiscount = 0.85; // 15% discount — AI filtered but still wide
    } else if (isModerateSpread && !aiValidated) {
      valuationDiscount = 0.85; // 15% discount for moderately broad data
    } else if (isModerateSpread && aiValidated) {
      valuationDiscount = 0.90; // 10% discount — AI filtered, moderate spread
    }
    
    const suggestedValuation = Math.max(300, Math.round(medianPrice * valuationDiscount / 100) * 100);
    // Bevakningspris: 80% of market low, but never below 300 SEK (Auctionet minimum starting bid)
    const suggestedReserve = priceRange ? Math.max(300, Math.round(priceRange.low * 0.8 / 100) * 100) : 300;
    
    // Determine data reliability level
    let reliabilityLevel, reliabilityColor, reliabilityText;
    const sampleSize = stats.sampleSize || 0;
    if (isWideSpread || confidence < 0.4) {
      reliabilityLevel = 'low';
      reliabilityColor = '#e74c3c';
      reliabilityText = `Låg — prisintervallet är brett (${Math.round(spreadRatio)}x) — sökorden kanske inte matchar objektet tillräckligt`;
    } else if (isModerateSpread || confidence < 0.6 || sampleSize < 10) {
      reliabilityLevel = 'medium';
      reliabilityColor = '#f39c12';
      reliabilityText = `Måttlig — ${sampleSize < 10 ? 'få jämförelser' : 'visst prisspann'} — använd som vägledning`;
    } else {
      reliabilityLevel = 'high';
      reliabilityColor = '#27ae60';
      reliabilityText = `Hög — tight prisintervall med god datamängd`;
    }
    
    // Format numbers
    const fmt = (n) => new Intl.NumberFormat('sv-SE').format(n);
    
    // Determine status icon
    let statusIcon;
    switch (type) {
      case 'conflict':      statusIcon = '⚠️'; break;
      case 'market_weakness': statusIcon = '📉'; break;
      case 'market_strength': statusIcon = '📈'; break;
      case 'market_info':    statusIcon = 'ℹ️'; break;
      default:               statusIcon = '📊'; break;
    }
    
    // Build data source summary
    const historicalCount = historical?.analyzedSales || 0;
    const liveCount = live?.analyzedLiveItems || 0;
    const totalMatches = (historical?.totalMatches || 0) + (live?.totalMatches || 0);
    let dataSourceText = '';
    if (historicalCount > 0 && liveCount > 0) {
      dataSourceText = `${historicalCount} historiska + ${liveCount} pågående (${totalMatches} hittade)`;
    } else if (historicalCount > 0) {
      dataSourceText = `${historicalCount} historiska försäljningar (${totalMatches} hittade)`;
    } else if (liveCount > 0) {
      dataSourceText = `${liveCount} pågående auktioner`;
    }
    
    // Get the search query used (from SSoT)
    const searchQuery = this.searchQuerySSoT?.getCurrentQuery() || '';
    const querySource = this.searchQuerySSoT?.getQuerySource() || '';
    
    // Build search query info section
    let searchQueryHTML = '';
    if (searchQuery) {
      searchQueryHTML = `
        <div class="insight-kb-query">
          <span class="insight-kb-query-label">Sökning:</span>
          <span class="insight-kb-query-text">"${escapeHTML(searchQuery)}"</span>
        </div>`;
    }
    
    // AI validation details (aiValidated already declared above for discount logic)
    const aiFilteredCount = historical?.aiFilteredCount || null;
    const aiOriginalCount = historical?.aiOriginalCount || null;
    
    // AI-validated data gets a reliability boost
    if (aiValidated && reliabilityLevel === 'low') {
      reliabilityLevel = 'medium';
      reliabilityColor = '#f39c12';
      reliabilityText = `Måttlig — AI-filtrerad data (${aiFilteredCount} av ${aiOriginalCount} bedömda som jämförbara)`;
    } else if (aiValidated && reliabilityLevel === 'medium') {
      reliabilityLevel = 'high';
      reliabilityColor = '#27ae60';
      reliabilityText = `Hög — AI-verifierad data (${aiFilteredCount} av ${aiOriginalCount} bedömda som jämförbara)`;
    } else if (aiValidated) {
      reliabilityText = `Hög — AI-verifierad data med tight prisintervall`;
    }
    
    // Build AI validation badge
    let aiValidationHTML = '';
    if (aiValidated) {
      aiValidationHTML = `
        <div class="insight-kb-ai-badge">
          <span class="insight-kb-ai-icon">✓</span>
          <span class="insight-kb-ai-text">AI-verifierad data — ${aiFilteredCount} av ${aiOriginalCount} resultat bedömda som jämförbara</span>
        </div>`;
    }
    
    // Build reliability indicator
    const reliabilityHTML = `
      <div class="insight-kb-reliability">
        <div class="insight-kb-reliability-bar">
          <div class="insight-kb-reliability-fill" style="width: ${reliabilityLevel === 'high' ? '100' : reliabilityLevel === 'medium' ? '60' : '25'}%; background: ${reliabilityColor};"></div>
        </div>
        <div class="insight-kb-reliability-text" style="color: ${reliabilityColor};">Tillförlitlighet: ${escapeHTML(reliabilityText)}</div>
      </div>`;
    
    // Build statistics section
    let statsHTML = '';
    if (stats.median && stats.min !== undefined && stats.max !== undefined) {
      statsHTML = `
        <div class="insight-kb-stats">
          <div class="insight-kb-stats-row">
            <span>Median (mittpris):</span>
            <span style="font-weight: 600;">${fmt(Math.round(stats.median))} SEK</span>
          </div>
          <div class="insight-kb-stats-row">
            <span>Lägsta–Högsta:</span>
            <span style="font-weight: 600;">${fmt(stats.min)}–${fmt(stats.max)} SEK</span>
          </div>
          <div class="insight-kb-stats-row">
            <span>Medel:</span>
            <span style="font-weight: 600;">${fmt(stats.average)} SEK</span>
          </div>
        </div>`;
    }
    
    // Comparison with current values
    let comparisonHTML = '';
    if (currentEstimate > 0 && priceRange) {
      const diff = ((currentEstimate - suggestedValuation) / suggestedValuation * 100);
      const diffSign = diff > 0 ? '+' : '';
      const diffColor = Math.abs(diff) < 15 ? 'rgba(76,175,80,0.9)' : Math.abs(diff) < 40 ? 'rgba(255,193,7,0.9)' : 'rgba(244,67,54,0.9)';
      comparisonHTML = `
        <div class="insight-kb-comparison">
          <div class="insight-kb-section-title">Jämförelse med ditt utrop</div>
          <div class="insight-kb-comparison-row">
            <span>Ditt utrop:</span>
            <span style="font-weight: 600;">${fmt(currentEstimate)} SEK</span>
          </div>
          <div class="insight-kb-comparison-row">
            <span>Marknadsvärde:</span>
            <span style="font-weight: 600;">${fmt(priceRange.low)}–${fmt(priceRange.high)} SEK</span>
          </div>
          <div class="insight-kb-comparison-row">
            <span>Avvikelse från median:</span>
            <span style="font-weight: 600; color: ${diffColor};">${diffSign}${Math.round(diff)}%</span>
          </div>
        </div>`;
    }
    
    // Build suggestion section — hide buttons for low reliability
    let suggestionHTML = '';
    if (suggestedValuation > 0) {
      const warningNote = reliabilityLevel === 'low' 
        ? `<div class="insight-kb-suggestion-warning">⚠ Bred data — justera sökord i dashboard-pills för bättre träffar</div>` 
        : '';
      const discountNote = valuationDiscount < 1.0 
        ? ` — konservativ (${Math.round((1 - valuationDiscount) * 100)}% rabatt pga brett data)`
        : '';
      suggestionHTML = `
        <div class="insight-kb-suggestion">
          <div class="insight-kb-section-title">Förslag baserat på median (${fmt(Math.round(medianPrice))} SEK)${discountNote}</div>
          ${warningNote}
          <div class="insight-kb-suggestion-grid">
            <div class="insight-kb-suggestion-item">
              <div class="insight-kb-suggestion-label">Värdering</div>
              <div class="insight-kb-suggestion-value">${fmt(suggestedValuation)} SEK</div>
              <button class="insight-kb-apply-btn" data-field="estimate" data-value="${suggestedValuation}" type="button" ${reliabilityLevel === 'low' ? 'title="Låg tillförlitlighet — dubbelkolla innan du applicerar"' : ''}>
                ${currentEstimate > 0 ? 'Uppdatera' : 'Sätt'} värdering
              </button>
            </div>
            <div class="insight-kb-suggestion-item">
              <div class="insight-kb-suggestion-label">Bevakningspris</div>
              <div class="insight-kb-suggestion-value">${fmt(suggestedReserve)} SEK</div>
              <button class="insight-kb-apply-btn" data-field="reserve" data-value="${suggestedReserve}" type="button">
                ${currentReserve > 0 ? 'Uppdatera' : 'Sätt'} bevakningspris
              </button>
            </div>
          </div>
        </div>`;
    }
    
    const card = document.createElement('div');
    card.className = 'insight-kb-card';
    card.innerHTML = `
      <div class="insight-kb-header">
        <div class="insight-kb-icon" style="background: ${statusColor}20; color: ${statusColor};">${statusIcon}</div>
        <div class="insight-kb-title">
          <div class="insight-kb-name" style="color: ${statusColor};">${escapeHTML(summary)}</div>
          <div class="insight-kb-source">${escapeHTML(dataSourceText)}</div>
        </div>
      </div>
      ${searchQueryHTML}
      ${aiValidationHTML}
      ${reliabilityHTML}
      <div class="insight-kb-detail">${escapeHTML(detail)}</div>
      ${statsHTML}
      ${comparisonHTML}
      ${suggestionHTML}
      <div class="insight-kb-footer">
        <span>${aiValidated ? 'AI-verifierad Auctionet-data' : 'Baserat enbart på Auctionet-data'}</span>
      </div>
    `;
    
    card.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      transform: translateY(6px) scale(0.96);
      background: rgba(20, 20, 30, 0.96);
      backdrop-filter: blur(16px);
      color: white;
      padding: 16px 18px 14px;
      border-radius: 14px;
      width: 340px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      white-space: normal;
      word-wrap: break-word;
      box-shadow: 0 8px 40px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.08);
      z-index: 2147483647;
      opacity: 0; visibility: hidden;
      transition: opacity 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.25s cubic-bezier(0.4,0,0.2,1), visibility 0.25s cubic-bezier(0.4,0,0.2,1);
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      text-align: left;
      border: 1px solid rgba(255,255,255,0.06);
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
    `;
    
    // Wire up action buttons
    card.querySelectorAll('.insight-kb-apply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        
        let selector;
        if (field === 'estimate') {
          selector = '#item_current_auction_attributes_estimate';
        } else if (field === 'reserve') {
          selector = '#item_current_auction_attributes_reserve';
        }
        
        const fieldEl = document.querySelector(selector);
        if (fieldEl) {
          fieldEl.value = value;
          fieldEl.dispatchEvent(new Event('input', { bubbles: true }));
          fieldEl.dispatchEvent(new Event('change', { bubbles: true }));
          
          btn.textContent = '✓ Tillagd';
          btn.style.background = 'rgba(76,175,80,0.3)';
          btn.style.borderColor = 'rgba(76,175,80,0.5)';
          btn.disabled = true;
          
          setTimeout(() => {
            btn.textContent = field === 'estimate' ? 'Uppdatera värdering' : 'Uppdatera bevakningspris';
            btn.style.background = 'rgba(255,255,255,0.12)';
            btn.style.borderColor = 'rgba(255,255,255,0.15)';
            btn.disabled = false;
          }, 2000);
        }
      });
    });
    
    document.body.appendChild(card);
    return card;
  }
  
  // Add styles for the insight KB card
  addInsightKBCardStyles() {
    if (document.querySelector('#insight-kb-card-styles')) return;
    const style = document.createElement('style');
    style.id = 'insight-kb-card-styles';
    style.textContent = `
      .insight-kb-card::-webkit-scrollbar { width: 5px; }
      .insight-kb-card::-webkit-scrollbar-track { background: transparent; }
      .insight-kb-card::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
      .insight-kb-card::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
      
      .insight-kb-header {
        display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;
      }
      .insight-kb-icon {
        width: 40px; height: 40px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; flex-shrink: 0;
      }
      .insight-kb-name {
        font-size: 13px; font-weight: 600; line-height: 1.3; margin-bottom: 2px;
      }
      .insight-kb-source {
        font-size: 10px; color: rgba(255,255,255,0.45); line-height: 1.3;
      }
      .insight-kb-query {
        font-size: 11px; margin-bottom: 8px; padding: 5px 10px;
        background: rgba(255,255,255,0.05); border-radius: 6px;
        color: rgba(255,255,255,0.7);
      }
      .insight-kb-query-label {
        color: rgba(255,255,255,0.4); font-size: 10px; margin-right: 4px;
      }
      .insight-kb-query-text {
        font-style: italic; color: rgba(255,255,255,0.8);
      }
      .insight-kb-reliability {
        margin-bottom: 10px;
      }
      .insight-kb-reliability-bar {
        height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px;
        overflow: hidden; margin-bottom: 4px;
      }
      .insight-kb-reliability-fill {
        height: 100%; border-radius: 2px; transition: width 0.3s ease;
      }
      .insight-kb-reliability-text {
        font-size: 10px; line-height: 1.4;
      }
      .insight-kb-detail {
        font-size: 12px; line-height: 1.6; color: rgba(255,255,255,0.85);
        margin-bottom: 12px; padding-bottom: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .insight-kb-stats {
        margin-bottom: 10px; padding-bottom: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .insight-kb-stats-row {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 11px; color: rgba(255,255,255,0.7); padding: 2px 0;
      }
      .insight-kb-suggestion-warning {
        font-size: 10px; color: #f39c12; margin-bottom: 8px;
        padding: 5px 8px; background: rgba(243,156,18,0.1);
        border-radius: 4px; border-left: 2px solid #f39c12;
      }
      .insight-kb-section-title {
        font-size: 10px; color: rgba(255,255,255,0.45); text-transform: uppercase;
        letter-spacing: 0.5px; margin-bottom: 8px; font-weight: 500;
      }
      .insight-kb-comparison {
        margin-bottom: 12px; padding-bottom: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .insight-kb-comparison-row {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 12px; color: rgba(255,255,255,0.8); padding: 3px 0;
      }
      .insight-kb-suggestion { margin-bottom: 10px; }
      .insight-kb-suggestion-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
      }
      .insight-kb-suggestion-item {
        background: rgba(255,255,255,0.06); border-radius: 8px; padding: 10px;
        text-align: center;
      }
      .insight-kb-suggestion-label {
        font-size: 10px; color: rgba(255,255,255,0.45); text-transform: uppercase;
        letter-spacing: 0.3px; margin-bottom: 4px;
      }
      .insight-kb-suggestion-value {
        font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.95);
        margin-bottom: 8px;
      }
      .insight-kb-apply-btn {
        background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9);
        border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
        padding: 5px 10px; font-size: 11px; cursor: pointer;
        transition: all 0.15s ease; width: 100%; font-family: inherit;
      }
      .insight-kb-apply-btn:hover {
        background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.3);
      }
      .insight-kb-footer {
        text-align: center; font-size: 9px; color: rgba(255,255,255,0.3);
        padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);
        font-style: italic;
      }
      
      .insight-kb-ai-badge {
        display: flex; align-items: center; gap: 6px;
        background: rgba(39, 174, 96, 0.15);
        border: 1px solid rgba(39, 174, 96, 0.3);
        border-radius: 6px;
        padding: 6px 10px;
        margin-bottom: 8px;
      }
      .insight-kb-ai-icon {
        color: #27ae60;
        font-weight: 700;
        font-size: 12px;
        flex-shrink: 0;
      }
      .insight-kb-ai-text {
        font-size: 10px;
        color: rgba(39, 174, 96, 0.9);
        line-height: 1.3;
      }
    `;
    document.head.appendChild(style);
  }

  // Expand header pills to show all terms
  expandHeaderPills() {
    
    const container = document.querySelector('.header-pills-container');
    if (!container) {
      return;
    }
    
    // Generate expanded pills
    const expandedHTML = this.pillGenerator.generateExpandedPills(this.currentTerms);
    
    // Update container with smooth animation
    container.style.transition = 'all 0.3s ease';
    container.style.opacity = '0.7';
    
    setTimeout(() => {
      container.innerHTML = expandedHTML;
      container.style.opacity = '1';
      
      // Re-attach listeners to new checkboxes
      if (this.checkboxManager) {
        this.checkboxManager.attachCheckboxListeners();
      }
      
      // Setup collapse button
      this.setupCollapseButton(container);
      
    }, 150);
  }

  // Setup collapse button
  setupCollapseButton(container) {
    const collapseBtn = container.querySelector('.header-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        this.collapseHeaderPills(container);
      });
    }
  }

  // Collapse header pills back to compact view
  collapseHeaderPills(container) {
    
    // Generate compact pills
    const compactHTML = this.pillGenerator.generateHeaderPills(this.currentTerms, { maxUnselected: 4 });
    
    // Update container with smooth animation
    container.style.transition = 'all 0.3s ease';
    container.style.opacity = '0.7';
    
    setTimeout(() => {
      container.innerHTML = compactHTML;
      container.style.opacity = '1';
      
      // Re-attach listeners
      if (this.checkboxManager) {
        this.checkboxManager.attachCheckboxListeners();
      }
      
      // Re-setup expand functionality
      this.setupExpandCollapse();
      
    }, 150);
  }

  // Add dashboard styles (complete CSS from original dashboard-manager.js)
  addMarketDashboardStyles() {
    if (document.getElementById('market-dashboard-styles-v2')) {
      return; // Styles already added
    }

    const style = document.createElement('style');
    style.id = 'market-dashboard-styles-v2';
    style.textContent = `
      /* Market Dashboard Container */
      .market-data-dashboard {
        background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        padding: 16px;
        margin: 12px 0;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.06);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        position: relative;
        transition: filter 0.3s ease, opacity 0.3s ease;
      }
      
      /* Loading State Styles */
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
      
      /* Desktop-Optimized Header Layout — pills next to search query */
      .header-left-section {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 300px;
        flex-wrap: wrap;
      }
      
      .header-pills-wrapper {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }
      
      /* Header-Integrated Pills - Desktop Optimized */
      .header-pills-container {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      
      /* Freetext input for custom search terms */
      .pill-freetext-input {
        height: 24px;
        padding: 0 8px;
        border-radius: 12px;
        border: 1px dashed #cbd5e1;
        background: rgba(248, 250, 252, 0.6);
        font-size: 11px;
        font-weight: 400;
        color: #64748b;
        outline: none;
        width: 80px;
        transition: all 0.2s ease;
      }
      .pill-freetext-input::placeholder {
        color: #94a3b8;
        font-style: italic;
      }
      .pill-freetext-input:focus {
        width: 130px;
        border-color: #007cba;
        border-style: solid;
        background: white;
        color: #1a252f;
        box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.15);
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
        user-select: none;
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
        
        .header-pills-wrapper {
          width: 100%;
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
        line-height: 1.3;
      }
      
      .market-item.market-exceptional {
        max-width: 220px;
      }
      
      /* Ensure consistent spacing for all market item types */
      .market-item.market-price .market-value,
      .market-item.market-data .market-value,
      .market-item.market-exceptional .market-value,
      .market-item.market-activity .market-value,
      .market-item.market-insights .market-value,
      .market-item.market-trend .market-value {
        min-height: 16px;
      }
      
      /* Specific adjustments for sections with complex content */
      .market-item.market-data .market-help {
        margin-top: 3px;
      }
      
      .market-item.market-exceptional .market-help {
        margin-top: 3px;
      }
      
      /* Ensure colored trend values are properly spaced */
      .market-item.market-trend .market-value,
      .market-item.market-insights .market-value {
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      
      /* Clamp insight detail text to 3 lines — full detail shown in KB card on hover */
      .market-insight-detail {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-style: italic;
      }
      
      /* Highlight the insights trigger on hover */
      .market-insights-trigger:hover {
        background: rgba(0,0,0,0.03);
        border-radius: 6px;
      }
      
      /* Ensure consistent vertical alignment for confidence indicators */
      .market-confidence {
        display: block;
        white-space: nowrap;
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
        margin-bottom: 1px;
        font-weight: 500;
        line-height: 1.2;
      }
      .market-label-subtitle {
        font-size: 8px;
        color: #adb5bd;
        margin-bottom: 3px;
        line-height: 1.2;
        font-weight: 400;
      }
      
      .market-value {
        font-size: 12px;
        font-weight: 600;
        color: #1a252f;
        line-height: 1.25;
        margin-bottom: 2px;
      }
      
      .market-confidence {
        font-size: 10px;
        margin-top: 2px;
        margin-bottom: 1px;
        font-weight: 500;
        line-height: 1.2;
      }
      
      .market-help {
        font-size: 9px;
        color: #495057;
        margin-top: 2px;
        font-style: italic;
        line-height: 1.3;
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
      
      /* Data links styling */
      .data-link-row {
        display: flex;
        align-items: center;
        gap: 4px;
        margin: 1px 0;
        font-size: 9px;
        line-height: 1.3;
        min-height: 12px;
      }
      
      .data-link-icon {
        font-size: 8px;
        opacity: 0.7;
        width: 12px;
        text-align: center;
        flex-shrink: 0;
      }
      
      .data-link-prominent {
        color: #007cba !important;
        text-decoration: none;
        font-weight: 600;
        transition: all 0.2s ease;
        line-height: 1.3;
      }
      
      .data-link-prominent:hover {
        color: #005c87 !important;
        text-decoration: underline;
      }
      
      .data-link-meta {
        color: #6c757d;
        font-size: 8px;
        font-style: italic;
        margin-left: 2px;
        line-height: 1.2;
        flex-shrink: 0;
      }
      
      /* Market dashboard disclaimer */
      .market-dashboard-disclaimer {
        margin-top: 12px;
        padding: 8px 12px;
        background: #fff8e1;
        border: 1px solid #ffe082;
        border-radius: 6px;
        font-size: 11px;
        color: #6d4c00;
        text-align: center;
        font-style: italic;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
    
  }

  // Debug information
  debug() {
    
    // Debug modules
    if (this.checkboxManager) {
      this.checkboxManager.debug();
    }
    
    if (this.currentTerms.length > 0) {
      this.termProcessor.debugTermAnalysis(this.currentTerms);
    }
    
    return {
      dashboardCreated: this.dashboardCreated,
      currentTerms: this.currentTerms.length,
      hasApiManager: !!this.apiManager,
      hasSSoT: !!this.searchQuerySSoT,
      hasCheckboxManager: !!this.checkboxManager
    };
  }

  // Cleanup
  destroy() {
    
    if (this.checkboxManager) {
      this.checkboxManager.destroy();
    }
    
    // Remove dashboard from DOM
    const dashboard = document.querySelector('.market-data-dashboard');
    if (dashboard) {
      dashboard.remove();
    }
    
    // Clear references
    this.apiManager = null;
    this.qualityAnalyzer = null;
    this.searchQuerySSoT = null;
    this.checkboxManager = null;
    this.currentTerms = [];
    
  }

  // Show loading state with spinner overlay
  showDashboardLoading(message = 'Uppdaterar analys...') {
    
    const dashboard = document.querySelector('.market-data-dashboard');
    if (!dashboard) {
      console.error('DashboardV2: No .market-data-dashboard element found for spinner!');
      return;
    }
    
    
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
      <div class="loading-text">${escapeHTML(message)}</div>
    `;
    
    dashboard.appendChild(overlay);
  }

  // Hide loading state with smooth transition
  hideDashboardLoading() {
    
    const dashboard = document.querySelector('.market-data-dashboard');
    if (!dashboard) {
      console.error('DashboardV2: No .market-data-dashboard element found for hiding spinner!');
      return;
    }
    
    
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

  // Create minimal floating toggle with smooth dropdown content
  createSmoothDropdownDashboard(dashboardElement) {
    // Remove loading state first
    this.removeMarketAnalysisLoading();
    
    // Remove any existing dropdown elements
    const existingButton = document.querySelector('.minimal-market-toggle');
    const existingDropdownContainer = document.querySelector('.market-dropdown-container');
    if (existingButton) existingButton.remove();
    if (existingDropdownContainer) existingDropdownContainer.remove();

    // Find the main container to insert dropdown content above
    const mainContainer = document.querySelector('.container');
    if (!mainContainer) {
      console.error('Main container not found, cannot create smooth dropdown');
      return;
    }

    // Create minimal floating toggle button (far left, non-intrusive)
    const floatingToggle = document.createElement('button');
    floatingToggle.className = 'minimal-market-toggle';
    floatingToggle.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="transition: transform 0.3s ease;">
        <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    floatingToggle.style.cssText = `
      position: fixed;
      right: 20px;
      top: 20px;
      z-index: 9999;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: white;
      border: 1px solid #e0e0e0;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #333;
      transition: all 0.3s ease;
      font-size: 0;
    `;

    // Check if dashboard should already be open (avoid collapse→expand flash)
    const STORAGE_KEY_INIT = 'auctionet_market_analysis_visible';
    const shouldBeOpen = localStorage.getItem(STORAGE_KEY_INIT) === 'true';

    // Create dropdown content container (in document flow)
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'market-dropdown-container';

    if (shouldBeOpen) {
      // Pre-set to open state so there's no collapse flash
      dropdownContainer.style.cssText = `
        width: 100%;
        max-height: 2000px;
        overflow: hidden;
        margin-bottom: 20px;
        opacity: 1;
        transform: translateY(0);
        transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), 
                    opacity 0.3s ease 0.1s, 
                    transform 0.3s ease 0.1s,
                    margin-bottom 0.5s ease;
      `;
    } else {
      dropdownContainer.style.cssText = `
        width: 100%;
        max-height: 0;
        overflow: hidden;
        margin-bottom: 0;
        opacity: 0;
        transform: translateY(-10px);
        transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), 
                    opacity 0.3s ease 0.1s, 
                    transform 0.3s ease 0.1s,
                    margin-bottom 0.5s ease;
      `;
    }

    // Style the dashboard element (original design)
    dashboardElement.style.cssText = `
      margin: 0;
      border-radius: 8px;
      background: white;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      border: 1px solid #e0e0e0;
    `;

    // Add dashboard to dropdown container
    dropdownContainer.appendChild(dashboardElement);

    // Add toggle functionality with persistent state
    const STORAGE_KEY = 'auctionet_market_analysis_visible';
    
    // Load saved state from localStorage
    let isOpen = localStorage.getItem(STORAGE_KEY) === 'true';
    
    // CRITICAL FIX: Ensure button and dropdown are in sync
    // Force a brief delay to ensure DOM is ready, then apply state
    setTimeout(() => {
      this.applyDropdownState(isOpen, floatingToggle, dropdownContainer, dashboardElement, false);
    }, 10);
    
    floatingToggle.addEventListener('click', () => {
      isOpen = !isOpen;
      
      // Save state to localStorage
      localStorage.setItem(STORAGE_KEY, isOpen.toString());
      
      // Apply visual state
      this.applyDropdownState(isOpen, floatingToggle, dropdownContainer, dashboardElement, true);
      
      // COST OPTIMIZATION: Trigger deferred market analysis when dashboard is opened
      if (isOpen && typeof this.onDashboardOpenCallback === 'function') {
        const callback = this.onDashboardOpenCallback;
        this.onDashboardOpenCallback = null; // Clear to prevent re-running
        // Small delay to let the animation start before loading data
        setTimeout(() => callback(), 150);
      }

      // Verify state after a brief moment
      setTimeout(() => {
        this.verifyDropdownState(isOpen, floatingToggle, dropdownContainer);
      }, 100);
    });

    // Add hover effects to button
    floatingToggle.addEventListener('mouseenter', () => {
      if (!isOpen) {
        floatingToggle.style.transform = 'scale(1.1)';
        floatingToggle.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
        floatingToggle.style.borderColor = '#4A90E2';
      }
    });

    floatingToggle.addEventListener('mouseleave', () => {
      if (!isOpen) {
        floatingToggle.style.transform = 'scale(1)';
        floatingToggle.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.1)';
        floatingToggle.style.borderColor = '#e0e0e0';
      }
    });

    // Add floating button to page
    document.body.appendChild(floatingToggle);

    // Insert dropdown content into normal document flow (pushes content down when expanded)
    mainContainer.parentNode.insertBefore(dropdownContainer, mainContainer);

    // If dashboard should be open on first load, scroll to top so the user sees it
    if (isOpen) {
      setTimeout(() => {
        dropdownContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }

  }

  // Apply dropdown state (open/closed) with optional animation
  applyDropdownState(isOpen, floatingToggle, dropdownContainer, dashboardElement, animate = true) {
    
    // Ensure we have valid elements
    if (!floatingToggle || !dropdownContainer || !dashboardElement) {
      console.error('applyDropdownState: Missing required elements');
      return;
    }
    
    // Ensure SVG exists
    const svg = floatingToggle.querySelector('svg');
    if (!svg) {
      console.error('applyDropdownState: Button SVG not found');
      return;
    }
    
    if (isOpen) {
      // Open - expand content
      const contentHeight = dashboardElement.scrollHeight;
      dropdownContainer.style.maxHeight = `${contentHeight}px`;
      dropdownContainer.style.opacity = '1';
      dropdownContainer.style.transform = 'translateY(0)';
      dropdownContainer.style.marginBottom = '20px';
      
      // Update button - FORCE the state
      svg.style.transform = 'rotate(180deg)';
      floatingToggle.style.background = '#f8f9fa';
      floatingToggle.style.borderColor = '#4A90E2';
      floatingToggle.style.color = '#4A90E2';
      
      // Add visual indicator that it's pinned open
      floatingToggle.title = 'Marknadsanalys (synlig - klicka för att dölja)';
      
      
    } else {
      // Close - collapse content
      dropdownContainer.style.maxHeight = '0';
      dropdownContainer.style.opacity = '0';
      dropdownContainer.style.transform = 'translateY(-10px)';
      dropdownContainer.style.marginBottom = '0';
      
      // Update button - FORCE the state
      svg.style.transform = 'rotate(0deg)';
      floatingToggle.style.background = 'white';
      floatingToggle.style.borderColor = '#e0e0e0';
      floatingToggle.style.color = '#333';
      
      floatingToggle.title = 'Marknadsanalys (dold - klicka för att visa)';
      
    }
    
    // If this is initial load (no animation), ensure immediate display
    if (!animate) {
      // Temporarily disable transitions for instant state
      const originalTransition = dropdownContainer.style.transition;
      const originalSvgTransition = floatingToggle.querySelector('svg').style.transition;
      const originalButtonTransition = floatingToggle.style.transition;
      
      dropdownContainer.style.transition = 'none';
      floatingToggle.querySelector('svg').style.transition = 'none';
      floatingToggle.style.transition = 'none';
      
      // Force reflow
      dropdownContainer.offsetHeight;
      
      // Restore transitions after a brief moment
      setTimeout(() => {
        dropdownContainer.style.transition = originalTransition;
        floatingToggle.querySelector('svg').style.transition = originalSvgTransition;
        floatingToggle.style.transition = originalButtonTransition;
      }, 50);
    }
    
  }

  // Show loading spinner when market analysis is refreshing
  showMarketAnalysisLoading() {
    // Remove any existing loading
    const existingLoading = document.querySelector('.market-analysis-loading');
    if (existingLoading) existingLoading.remove();

    // Find main container
    const mainContainer = document.querySelector('.container');
    if (!mainContainer) return;

    // Create loading container
    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'market-analysis-loading';
    loadingContainer.style.cssText = `
      width: 100%;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 40px 20px;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 15px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;

    // Create spinner
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 32px;
      height: 32px;
      border: 3px solid #f0f0f0;
      border-top: 3px solid #4A90E2;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;

    // Create loading text
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Uppdaterar marknadsanalys...';
    loadingText.style.cssText = `
      color: #666;
      font-size: 16px;
      font-weight: 500;
    `;

    // Add spinner animation if not already present
    if (!document.getElementById('market-loading-spin')) {
      const style = document.createElement('style');
      style.id = 'market-loading-spin';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // Assemble loading container
    loadingContainer.appendChild(spinner);
    loadingContainer.appendChild(loadingText);

    // Insert loading container
    mainContainer.parentNode.insertBefore(loadingContainer, mainContainer);

    // Create floating toggle button in loading state
    this.createLoadingToggleButton();

  }

  // Create floating toggle button in loading state
  createLoadingToggleButton() {
    // Remove any existing button
    const existingButton = document.querySelector('.minimal-market-toggle');
    if (existingButton) existingButton.remove();

    // Create loading toggle button
    const loadingToggle = document.createElement('button');
    loadingToggle.className = 'minimal-market-toggle';
    loadingToggle.innerHTML = `
      <div style="width: 12px; height: 12px; border: 2px solid #f0f0f0; border-top: 2px solid #4A90E2; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
    `;
    loadingToggle.style.cssText = `
      position: fixed;
      right: 20px;
      top: 20px;
      z-index: 9999;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #f8f9fa;
      border: 1px solid #4A90E2;
      cursor: not-allowed;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4A90E2;
      transition: all 0.3s ease;
      font-size: 0;
    `;
    
    loadingToggle.title = 'Uppdaterar marknadsanalys...';
    loadingToggle.disabled = true;

    document.body.appendChild(loadingToggle);
  }

  // Remove loading state
  removeMarketAnalysisLoading() {
    const loadingContainer = document.querySelector('.market-analysis-loading');
    if (loadingContainer) {
      loadingContainer.remove();
    }
  }

  // Verify that button and dropdown states are synchronized
  verifyDropdownState(expectedState, floatingToggle, dropdownContainer) {
    const svg = floatingToggle?.querySelector('svg');
    if (!svg || !dropdownContainer) return;
    
    const buttonRotation = svg.style.transform;
    const containerMaxHeight = dropdownContainer.style.maxHeight;
    const containerOpacity = dropdownContainer.style.opacity;
    
    const buttonLooksOpen = buttonRotation.includes('180deg');
    const containerLooksOpen = containerMaxHeight !== '0px' && containerOpacity !== '0';
    
    
    if (expectedState !== buttonLooksOpen || expectedState !== containerLooksOpen) {
      // Force re-sync
      this.applyDropdownState(expectedState, floatingToggle, dropdownContainer, dropdownContainer.firstChild, false);
    }
  }

  // Show spinner overlay on existing dropdown (no flickering)
  showSpinnerOverlay(existingContainer) {
    
    // Ensure container has position relative for absolute positioning
    if (getComputedStyle(existingContainer).position === 'static') {
      existingContainer.style.position = 'relative';
    }
    
    // Remove any existing overlay
    const existingOverlay = existingContainer.querySelector('.dropdown-spinner-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create spinner overlay
    const overlay = document.createElement('div');
    overlay.className = 'dropdown-spinner-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 15px;
      z-index: 1000;
      border-radius: 8px;
      min-height: 150px;
    `;

    // Create spinner
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 32px;
      height: 32px;
      border: 3px solid #f0f0f0;
      border-top: 3px solid #4A90E2;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;

    // Create loading text
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Uppdaterar marknadsanalys...';
    loadingText.style.cssText = `
      color: #666;
      font-size: 16px;
      font-weight: 500;
    `;

    // Assemble overlay
    overlay.appendChild(spinner);
    overlay.appendChild(loadingText);

    // Add overlay to existing container
    existingContainer.appendChild(overlay);

    // Update button to loading state
    const button = document.querySelector('.minimal-market-toggle');
    if (button) {
      const svg = button.querySelector('svg');
      if (svg) {
        svg.innerHTML = `<div style="width: 12px; height: 12px; border: 2px solid #f0f0f0; border-top: 2px solid #4A90E2; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>`;
      }
      button.disabled = true;
      button.style.cursor = 'not-allowed';
      button.title = 'Uppdaterar marknadsanalys...';
    }

    
    // Force a repaint to ensure overlay is visible
    existingContainer.offsetHeight;
  }

  // Update existing dropdown content (no flickering)
  updateExistingDropdownContent(newDashboard, existingContainer) {
    
    // FIRST: Remove spinner overlay
    const overlay = existingContainer.querySelector('.dropdown-spinner-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    // THEN: Find the existing dashboard inside the container
    let existingDashboard = existingContainer.querySelector('.market-data-dashboard');
    
    // Try alternative selectors if not found
    if (!existingDashboard) {
      existingDashboard = existingContainer.querySelector('div[class*="market"]');
    }
    
    if (!existingDashboard) {
      console.error('Could not find existing dashboard to update');
      
      // FALLBACK: Create new dashboard inside existing container
      existingContainer.appendChild(newDashboard);
      
      // Restore button to normal state
      this.restoreToggleButtonState();
      return;
    }

    // --- Smooth height transition (FLIP technique) ---
    // 0. Save original transition so we can restore it after animation
    const originalTransition = existingContainer.style.transition;

    // 1. Record current height
    const oldHeight = existingContainer.offsetHeight;

    // 2. Swap content
    existingDashboard.innerHTML = newDashboard.innerHTML;
    existingDashboard.className = newDashboard.className;

    // 3. Measure new natural height
    existingContainer.style.minHeight = '';
    existingContainer.style.transition = 'none';
    existingContainer.style.height = 'auto';
    const newHeight = existingContainer.offsetHeight;

    // 4. If heights are the same, skip animation
    if (oldHeight === newHeight) {
      existingContainer.style.height = '';
      existingContainer.style.transition = originalTransition;
    } else {
      // 5. Set back to old height and force reflow
      existingContainer.style.height = oldHeight + 'px';
      existingContainer.style.overflow = 'hidden';
      existingContainer.offsetHeight; // force reflow

      // 6. Add transition and animate to new height
      existingContainer.style.transition = 'height 0.35s ease';
      existingContainer.style.height = newHeight + 'px';

      // 7. After transition completes, release explicit height so it flows naturally
      setTimeout(() => {
        existingContainer.style.height = '';
        existingContainer.style.overflow = '';
        existingContainer.style.transition = originalTransition;
        existingContainer.style.minHeight = '';
      }, 380);
    }

    // Restore button to normal state
    const button = document.querySelector('.minimal-market-toggle');
    if (button) {
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="transition: transform 0.3s ease;">
          <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      button.disabled = false;
      button.style.cursor = 'pointer';
      
      // Ensure button shows correct state (should be open)
      const svg = button.querySelector('svg');
      if (svg) {
        svg.style.transform = 'rotate(180deg)';
      }
      button.style.background = '#f8f9fa';
      button.style.borderColor = '#4A90E2';
      button.style.color = '#4A90E2';
      button.title = 'Marknadsanalys (synlig - klicka för att dölja)';
    }

    // Re-setup KB card hover after content swap
    this.setupInsightKBCard();
  }

  // Restore toggle button to normal open state
  restoreToggleButtonState() {
    const button = document.querySelector('.minimal-market-toggle');
    if (button) {
      const svg = button.querySelector('svg');
      if (svg) {
        // Restore arrow up (open state)
        svg.innerHTML = `<path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      button.disabled = false;
      button.style.cursor = 'pointer';
      button.style.backgroundColor = '#4A90E2';
      button.style.color = 'white';
      button.title = 'Dölj marknadsanalys';
    }
  }
} 