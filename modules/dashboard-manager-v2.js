// modules/dashboard-manager-v2.js - Clean, Modular Dashboard Manager
// Refactored from the massive 3,146 line dashboard-manager.js

import { PillGenerator } from './ui/pill-generator.js';
import { CheckboxManager } from './ui/checkbox-manager.js';
import { TermProcessor } from './core/term-processor.js';

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
      console.log('⚠️ Fallback to candidate terms from sales data');
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

    
    // Remove existing dashboard
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard) {
      existingDashboard.remove();
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
    
    // NEW: Create smooth dropdown that pushes content down instead of overlaying
    this.createSmoothDropdownDashboard(dashboard);
    
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
            <span class="query-text">"${currentQuery}"</span>
            <span class="query-source">(${querySource})</span>
          </div>
        </div>
        <div class="header-right-section">
          ${headerPillsHTML}
        </div>
        <div class="market-dashboard-source">
          ${salesData.dataSource || 'Auctionet API'}
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
    
    // 2. PRISTREND - Trend section (moved to second position)
    if (salesData.historical?.trendAnalysis) {
      contentHTML += this.generateTrendSection(salesData);
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
    
    // 6. MARKNADSTREND - Insights section (last)
    if (salesData.insights && salesData.insights.length > 0) {
      contentHTML += this.generateInsightsSection(salesData);
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
    const baseUrl = 'https://auctionet.com/sv/search';
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
    
    let trendIcon = '';
    let trendColor = '#6c757d';
    
    if (significantInsight.type === 'price_comparison' && significantInsight.message.includes('höja')) {
      trendIcon = significantInsight.message; // Use the actual insight message
      trendColor = '#dc3545';
    } else {
      trendIcon = significantInsight.message;
      trendColor = '#28a745';
    }
    
    return `
      <div class="market-item market-insights">
        <div class="market-label">Marknadstrend</div>
        <div class="market-value" style="color: ${trendColor};">${trendIcon}</div>
        <div class="market-help">Konstnärsbaserad analys</div>
      </div>`;
  }

  // Generate trend section
  generateTrendSection(salesData) {
    const trend = salesData.historical.trendAnalysis;
    
    let trendIcon = '→';
    let trendColor = '#6c757d';
    
    if (trend.trend === 'rising_strong') {
      trendIcon = '↗️ +' + Math.abs(trend.changePercent) + '%';
      trendColor = '#28a745';
    } else if (trend.trend === 'falling_strong') {
      trendIcon = '↘️ ' + trend.changePercent + '%';
      trendColor = '#dc3545';
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
      console.log('⚠️ CheckboxManager not available - skipping interaction setup');
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

  // Expand header pills to show all terms
  expandHeaderPills() {
    
    const container = document.querySelector('.header-pills-container');
    if (!container) {
      console.log('⚠️ Pills container not found');
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
        margin-bottom: 3px;
        font-weight: 500;
        line-height: 1.2;
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
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 6px;
        font-size: 10px;
        color: #6c757d;
        text-align: center;
        font-style: italic;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
    
  }

  // Debug information
  debug() {
    console.log('  Dashboard created:', this.dashboardCreated);
    console.log('  Current terms:', this.currentTerms.length);
    console.log('  API Manager:', !!this.apiManager);
    console.log('  SearchQuerySSoT:', !!this.searchQuerySSoT);
    console.log('  CheckboxManager:', !!this.checkboxManager);
    
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
    console.log('🧹 DashboardManagerV2: Cleaning up...');
    
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
      console.error('❌ DashboardV2: No .market-data-dashboard element found for spinner!');
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
      <div class="loading-text">${message}</div>
    `;
    
    dashboard.appendChild(overlay);
  }

  // Hide loading state with smooth transition
  hideDashboardLoading() {
    
    const dashboard = document.querySelector('.market-data-dashboard');
    if (!dashboard) {
      console.error('❌ DashboardV2: No .market-data-dashboard element found for hiding spinner!');
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
      console.log('⚠️ DashboardV2: No overlay found, just removing blur');
      // No overlay, just remove blur
      dashboard.classList.remove('dashboard-loading');
    }
    
  }

  // Create smooth dropdown that pushes content down (not overlay)
  createSmoothDropdownDashboard(dashboardElement) {
    // Remove any existing dropdown
    const existingContainer = document.querySelector('.smooth-market-dropdown');
    if (existingContainer) {
      existingContainer.remove();
    }

    // Find the main container to insert above
    const mainContainer = document.querySelector('.container');
    if (!mainContainer) {
      console.error('❌ Main container not found, cannot create smooth dropdown');
      return;
    }

    // Create container that will be inserted into the normal document flow
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'smooth-market-dropdown';
    dropdownContainer.style.cssText = `
      width: 100%;
      overflow: hidden;
      transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      margin-bottom: 20px;
    `;

    // Create toggle bar (always visible, compact)
    const toggleBar = document.createElement('div');
    toggleBar.className = 'market-toggle-bar';
    toggleBar.style.cssText = `
      background: linear-gradient(135deg, #4A90E2 0%, #357ABD 100%);
      color: white;
      padding: 15px 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-weight: 600;
      font-size: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(74, 144, 226, 0.2);
      transition: all 0.3s ease;
      user-select: none;
    `;

    toggleBar.innerHTML = `
      <span class="toggle-icon">📊</span>
      <span class="toggle-text">Marknadsanalys</span>
      <span class="toggle-arrow" style="transition: transform 0.3s ease;">▼</span>
    `;

    // Create content container (initially hidden)
    const contentContainer = document.createElement('div');
    contentContainer.className = 'market-content-container';
    contentContainer.style.cssText = `
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      transform: translateY(-10px);
      transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), 
                  opacity 0.3s ease 0.1s, 
                  transform 0.3s ease 0.1s;
    `;

    // Style the dashboard element to fit nicely
    dashboardElement.style.cssText = `
      margin: 0;
      border-radius: 0 0 8px 8px;
      box-shadow: none;
      background: white;
      border: 1px solid #e0e0e0;
      border-top: none;
    `;

    // Add dashboard to content container
    contentContainer.appendChild(dashboardElement);

    // Add toggle functionality
    let isOpen = false;
    toggleBar.addEventListener('click', () => {
      isOpen = !isOpen;
      
      if (isOpen) {
        // Open - expand content
        const contentHeight = dashboardElement.scrollHeight;
        contentContainer.style.maxHeight = `${contentHeight}px`;
        contentContainer.style.opacity = '1';
        contentContainer.style.transform = 'translateY(0)';
        
        // Update toggle bar
        toggleBar.querySelector('.toggle-arrow').style.transform = 'rotate(180deg)';
        toggleBar.style.background = 'linear-gradient(135deg, #357ABD 0%, #2968A3 100%)';
        toggleBar.style.borderRadius = '8px 8px 0 0';
        
      } else {
        // Close - collapse content
        contentContainer.style.maxHeight = '0';
        contentContainer.style.opacity = '0';
        contentContainer.style.transform = 'translateY(-10px)';
        
        // Update toggle bar
        toggleBar.querySelector('.toggle-arrow').style.transform = 'rotate(0deg)';
        toggleBar.style.background = 'linear-gradient(135deg, #4A90E2 0%, #357ABD 100%)';
        toggleBar.style.borderRadius = '8px';
      }
    });

    // Add hover effects
    toggleBar.addEventListener('mouseenter', () => {
      if (!isOpen) {
        toggleBar.style.transform = 'translateY(-2px)';
        toggleBar.style.boxShadow = '0 4px 15px rgba(74, 144, 226, 0.3)';
      }
    });

    toggleBar.addEventListener('mouseleave', () => {
      if (!isOpen) {
        toggleBar.style.transform = 'translateY(0)';
        toggleBar.style.boxShadow = '0 2px 10px rgba(74, 144, 226, 0.2)';
      }
    });

    // Assemble dropdown
    dropdownContainer.appendChild(toggleBar);
    dropdownContainer.appendChild(contentContainer);

    // Insert into normal document flow (pushes content down)
    mainContainer.parentNode.insertBefore(dropdownContainer, mainContainer);

    console.log('📊 DashboardManagerV2: Created smooth dropdown that pushes content down');
  }
} 