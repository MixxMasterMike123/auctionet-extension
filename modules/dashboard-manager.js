import { SalesAnalysisManager } from "/modules/sales-analysis-manager.js";
import { ItemTypeHandlers } from "/modules/item-type-handlers.js";
import { SearchTermExtractor } from "/modules/search-term-extractor.js";

export class DashboardManager {
  constructor() {
    this.pendingDashboardUpdate = null;
  }

  // Set dependencies
  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  setQualityAnalyzer(qualityAnalyzer) {
    this.qualityAnalyzer = qualityAnalyzer;
  }

  // NEW: Add market data as a horizontal dashboard bar above the container
  addMarketDataDashboard(salesData, valuationSuggestions = []) {
    // Check if dashboard display is enabled
    if (!this.apiManager.showDashboard) {
      console.log('📊 Dashboard display is disabled in settings - skipping dashboard creation');
      return;
    }
    
    // DEBUG: Log the full salesData to understand what we're working with
    console.log('🔍 DEBUG: Full salesData for dashboard:', JSON.stringify(salesData, null, 2));
    
    // Add debouncing to prevent conflicts from parallel analyses
    const dashboardId = `dashboard-${salesData.analysisType}-${Date.now()}`;
    
    // Clear any pending dashboard updates
    if (this.pendingDashboardUpdate) {
      clearTimeout(this.pendingDashboardUpdate);
    }
    
    // PRIORITY SYSTEM: Artist analyses always take priority over freetext
    const isArtistAnalysis = salesData.analysisType === 'artist' || salesData.analysisType === 'artist_enriched';
    const isBrandAnalysis = salesData.analysisType === 'brand';
    const isFreetextAnalysis = salesData.analysisType === 'freetext';
    const isCustomFilter = salesData.analysisType === 'custom_user_filter';
    
    // Check if there's an existing dashboard and what type it is
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard) {
      const existingId = existingDashboard.getAttribute('data-dashboard-id');
      const existingType = existingId ? existingId.split('-')[1] : 'unknown';
      
      console.log(`🔄 Existing dashboard type: ${existingType}, new type: ${salesData.analysisType}`);
      
      // Custom filters should replace any existing dashboard (user explicitly requested new search)
      if (isCustomFilter) {
        console.log('🎯 CUSTOM FILTER REPLACEMENT: User-selected terms replacing existing dashboard');
        existingDashboard.remove();
        this.createDashboard(salesData, valuationSuggestions, dashboardId);
        return;
      }
      
      // Artist/Brand analyses should ALWAYS replace freetext analyses
      if ((isArtistAnalysis || isBrandAnalysis) && existingType === 'freetext') {
        console.log('🎯 PRIORITY REPLACEMENT: Artist/Brand analysis replacing freetext dashboard');
        existingDashboard.remove();
        // Create immediately without delay
        this.createDashboard(salesData, valuationSuggestions, dashboardId);
        return;
      }
      
      // Don't let freetext replace artist/brand analyses
      if (isFreetextAnalysis && (existingType === 'artist' || existingType === 'brand')) {
        console.log('🚫 BLOCKING: Freetext analysis attempting to replace artist/brand dashboard - ignoring');
        return; // Don't create freetext dashboard if artist/brand already exists
      }
    }
    
    // For enriched artist analyses, remove old dashboard immediately but keep artist detection visible
    if (salesData.analysisType === 'artist_enriched' || salesData.enrichedWith) {
      if (existingDashboard) {
        console.log('🔄 Smoothly replacing dashboard for enriched analysis');
        existingDashboard.style.opacity = '0.5'; // Fade out old dashboard
        existingDashboard.style.transition = 'opacity 0.3s ease';
        
        // Remove after fade animation
        setTimeout(() => {
          if (existingDashboard.parentNode) {
            existingDashboard.parentNode.removeChild(existingDashboard);
          }
        }, 300);
      }
      
      // Create new dashboard immediately without delay
      this.createDashboard(salesData, valuationSuggestions, dashboardId);
    } else if (isArtistAnalysis || isBrandAnalysis || isCustomFilter) {
      // Artist, brand, and custom filter analyses get immediate priority
      console.log('🎯 Creating priority analysis dashboard immediately');
      this.createDashboard(salesData, valuationSuggestions, dashboardId);
        } else {
      // For freetext analyses, use small delay to allow artist detection to complete
      console.log('⏳ Delaying freetext dashboard creation to allow artist detection');
      this.pendingDashboardUpdate = setTimeout(() => {
        // Double-check that no artist analysis has started in the meantime
        const currentDashboard = document.querySelector('.market-data-dashboard');
        if (currentDashboard) {
          const currentId = currentDashboard.getAttribute('data-dashboard-id');
          const currentType = currentId ? currentId.split('-')[1] : 'unknown';
          
          if (currentType === 'artist' || currentType === 'brand') {
            console.log('🚫 Artist/Brand dashboard now exists - cancelling freetext dashboard');
            return;
          }
        }
        
        this.createDashboard(salesData, valuationSuggestions, dashboardId);
      }, 1000); // Increased delay to give AI detection more time
    }
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
    
    
    // Historical trend (NEW: prominently displayed)
    if (salesData.historical && salesData.historical.trendAnalysis && salesData.historical.trendAnalysis.trend !== 'insufficient_data') {
      const trend = salesData.historical.trendAnalysis;
      let trendIcon = '';
      let trendColor = '';
      let trendText = '';
      let helpText = '';
      
      // Calculate timeframe from historical sales data
      let timeframeText = '';
      let detailedTimeframe = '';
      if (salesData.historical.recentSales && salesData.historical.recentSales.length > 0) {
        const salesDates = salesData.historical.recentSales
          .map(sale => new Date(sale.date))
          .filter(date => !isNaN(date));
        
        if (salesDates.length > 1) {
          const oldestDate = new Date(Math.min(...salesDates));
          const newestDate = new Date(Math.max(...salesDates));
          const yearSpan = newestDate.getFullYear() - oldestDate.getFullYear();
          
          if (yearSpan >= 2) {
            timeframeText = ` (senaste ${yearSpan}+ år)`;
            detailedTimeframe = `under de senaste ${yearSpan}+ åren`;
          } else if (yearSpan >= 1) {
            timeframeText = ` (senaste ${yearSpan}-${yearSpan + 1} år)`;
            detailedTimeframe = `under det senaste året`;
          } else {
            timeframeText = ` (senaste året)`;
            detailedTimeframe = `under det senaste året`;
          }
        }
      }
      
      // Data quality indicators
      const dataQuality = salesData.historical.analyzedSales >= 10 ? 'pålitliga' : 'begränsade';
      const sampleSize = salesData.historical.analyzedSales;
      
      // Quality icon based on data amount and timeframe
      let qualityIcon = '';
      if (salesData.historical.analyzedSales >= 10) {
        qualityIcon = ' 📊'; // Good data amount
      } else if (salesData.historical.analyzedSales >= 5) {
        qualityIcon = ' 📈'; // Moderate data
      } else {
        qualityIcon = ' ⚠️'; // Limited data
      }
      
      // Enhanced user-friendly explanations
      if (trend.changePercent > 15) {
        trendIcon = '🔥';
        trendColor = '#e74c3c';
        trendText = `+${trend.changePercent}% högre priser${timeframeText}`;
        helpText = `Stark uppgång: Senare försäljningar säljs i genomsnitt ${trend.changePercent}% högre än tidigare ${detailedTimeframe}. Baserat på ${sampleSize} ${dataQuality} försäljningar - marknadens värdering stiger.`;
      } else if (trend.changePercent < -15) {
        trendIcon = '📉';
        trendColor = '#3498db';
        trendText = `${trend.changePercent}% lägre priser${timeframeText}`;
        helpText = `Tydlig nedgång: Senare försäljningar säljs i genomsnitt ${Math.abs(trend.changePercent)}% lägre än tidigare ${detailedTimeframe}. Baserat på ${sampleSize} ${dataQuality} försäljningar - marknadens värdering faller.`;
      } else if (Math.abs(trend.changePercent) <= 5) {
        trendIcon = '📊';
        trendColor = '#27ae60';
        trendText = `Stabil prisutveckling${timeframeText}`;
        helpText = `Mycket stabil marknad: Endast ${Math.abs(trend.changePercent)}% förändring i genomsnittspris ${detailedTimeframe}. Baserat på ${sampleSize} ${dataQuality} försäljningar - konsekvent värdering över tid.`;
      } else {
        const direction = trend.changePercent > 0 ? 'högre' : 'lägre';
        const directionWord = trend.changePercent > 0 ? 'uppgång' : 'nedgång';
        const sign = trend.changePercent > 0 ? '+' : '';
        trendIcon = trend.changePercent > 0 ? '📈' : '📉';
        trendColor = trend.changePercent > 0 ? '#f39c12' : '#3498db';
        trendText = `${sign}${trend.changePercent}% ${direction} priser${timeframeText}`;
        helpText = `Måttlig ${directionWord}: Senare försäljningar visar ${Math.abs(trend.changePercent)}% ${direction} genomsnittspris än tidigare ${detailedTimeframe}. Baserat på ${sampleSize} ${dataQuality} försäljningar - tydlig men lugn utveckling.`;
      }
      
      dashboardContent += `
        <div class="market-item market-historical-trend">
          <div class="market-label" title="Prisutveckling baserat på jämförelse mellan äldre och nyare försäljningar från historisk auktionsdata">Pristrend ${trendIcon}${qualityIcon}</div>
          <div class="market-value" style="color: ${trendColor}; font-weight: 600;">${trendText}</div>
          <div class="market-help">${helpText}</div>
        </div>
      `;
      console.log('✅ Added user-friendly historical trend display with detailed explanations');
    }

    // Exceptional sales (NEW: show high-value sales above normal range)
    if (salesData.historical && salesData.historical.exceptionalSales) {
      const exceptional = salesData.historical.exceptionalSales;
      
      let exceptionText = '';
      let helpText = exceptional.description;
      
      // Show ALL exceptional sales as numbered clickable links
      if (exceptional.count === 1) {
        const sale = exceptional.sales[0];
        const formattedPrice = new Intl.NumberFormat('sv-SE').format(sale.price);
        
        if (sale.url) {
          exceptionText = `<a href="${sale.url}" target="_blank" style="color: #e67e22; text-decoration: none; font-weight: 600;" title="Visa: ${sale.title} (${formattedPrice} SEK)">${formattedPrice} SEK</a>`;
        } else {
          exceptionText = `${formattedPrice} SEK`;
        }
        
        if (sale.priceVsValuation && exceptional.valuationBased) {
          helpText = `${sale.priceVsValuation}% av din värdering`;
        } else {
          helpText = `${sale.priceVsMedian}% av median`;
        }
      } else {
        // Multiple sales - show as numbered clickable links
        const numberedLinks = exceptional.sales.map((sale, index) => {
          const saleNumber = index + 1;
          const formattedPrice = new Intl.NumberFormat('sv-SE').format(sale.price);
          const shortTitle = sale.title.length > 80 ? sale.title.substring(0, 80) + '...' : sale.title;
          
          if (sale.url) {
            return `<a href="${sale.url}" target="_blank" style="color: #e67e22; text-decoration: none; font-weight: 600; margin-right: 6px; padding: 2px 6px; background: #fff3e0; border: 1px solid #e67e22; border-radius: 12px; font-size: 10px;" title="${shortTitle} - ${formattedPrice} SEK (${sale.house})">${saleNumber}</a>`;
          } else {
            return `<span style="margin-right: 6px; padding: 2px 6px; background: #f5f5f5; border: 1px solid #ccc; border-radius: 12px; font-size: 10px;" title="${shortTitle} - ${formattedPrice} SEK">${saleNumber}</span>`;
          }
        }).join('');
        
        exceptionText = `${exceptional.count} st höga`;
        
        // Create expandable section with numbered links
        const avgPrice = Math.round(exceptional.sales.reduce((sum, sale) => sum + sale.price, 0) / exceptional.sales.length);
        const priceRange = `${new Intl.NumberFormat('sv-SE').format(Math.min(...exceptional.sales.map(s => s.price)))}-${new Intl.NumberFormat('sv-SE').format(Math.max(...exceptional.sales.map(s => s.price)))} SEK`;
        
        if (exceptional.valuationBased) {
          const avgVsValuation = Math.round(exceptional.sales.reduce((sum, sale) => sum + (sale.priceVsValuation || 0), 0) / exceptional.sales.length);
          helpText = `${priceRange} • snitt ${avgVsValuation}% av värdering • <span class="exceptional-sales-toggle" style="cursor: pointer; color: #3498db; text-decoration: underline;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">visa alla</span><div style="display: none; margin-top: 8px; line-height: 1.6; padding: 6px; background: #f8f9fa; border-radius: 4px;">${numberedLinks}</div>`;
        } else {
          helpText = `${priceRange} • snitt ${new Intl.NumberFormat('sv-SE').format(avgPrice)} SEK • <span class="exceptional-sales-toggle" style="cursor: pointer; color: #3498db; text-decoration: underline;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">visa alla</span><div style="display: none; margin-top: 8px; line-height: 1.6; padding: 6px; background: #f8f9fa; border-radius: 4px;">${numberedLinks}</div>`;
        }
      }
      
      dashboardContent += `
        <div class="market-item market-exceptional">
          <div class="market-label" title="${exceptional.description}">Exceptionella ⭐</div>
          <div class="market-value" style="color: #e67e22; font-weight: 600;">${exceptionText}</div>
          <div class="market-help">${helpText}</div>
        </div>
      `;
      console.log('✅ Added exceptional sales display with numbered clickable links');
    }

    // Data foundation (NEW: show analyzed sales and data source)
    if (salesData.historical || salesData.live) {
      // DEBUG: Log search queries being used for links
      console.log('🔗 Dashboard link search queries:');
      if (salesData.historical?.actualSearchQuery) {
        console.log(`   Historical: "${salesData.historical.actualSearchQuery}"`);
      }
      if (salesData.live?.actualSearchQuery) {
        console.log(`   Live: "${salesData.live.actualSearchQuery}"`);
      }
      
      let dataIcon = '📊';
      let dataText = '';
      let helpText = '';
      
      const historicalCount = salesData.historical ? salesData.historical.analyzedSales || 0 : 0;
      const historicalTotal = salesData.historical ? salesData.historical.totalMatches || 0 : 0;
      const liveCount = salesData.live ? salesData.live.analyzedLiveItems || 0 : 0;
      const liveTotal = salesData.live ? salesData.live.totalMatches || 0 : 0;
      
      // Create detailed text showing API hits vs analyzed
      if (historicalCount > 0 && liveCount > 0) {
        // Both historical and live data
        const totalAnalyzed = historicalCount + liveCount;
        const totalFound = historicalTotal + liveTotal;
        
        dataText = `${totalAnalyzed} träffar (${totalFound} med prisdata)`;
        
        let historicalLink = `${historicalCount} historiska`;
        let liveLink = `${liveCount} pågående`;
        
        // Add clickable links with API context
        if (salesData.historical.actualSearchQuery) {
          const encodedQuery = encodeURIComponent(salesData.historical.actualSearchQuery);
          const historicalUrl = `https://auctionet.com/sv/search?event_id=&is=ended&q=${encodedQuery}`;
          historicalLink = `<a href="${historicalUrl}" target="_blank" style="color: #2c3e50; text-decoration: none; font-weight: 600;" title="Visa ${historicalTotal} historiska träffar för '${salesData.historical.actualSearchQuery}'">${historicalCount} historiska</a>`;
        }
        
        if (salesData.live.actualSearchQuery) {
          const encodedQuery = encodeURIComponent(salesData.live.actualSearchQuery);
          const liveUrl = `https://auctionet.com/sv/search?event_id=&q=${encodedQuery}`;
          liveLink = `<a href="${liveUrl}" target="_blank" style="color: #2c3e50; text-decoration: none; font-weight: 600;" title="Visa ${liveTotal} pågående träffar för '${salesData.live.actualSearchQuery}'">${liveCount} pågående</a>`;
        }
        
        helpText = `${historicalLink} (${historicalTotal} analyserade), ${liveLink}`;
      } else if (historicalCount > 0) {
        // Only historical data
        dataText = `${historicalCount} historiska träffar (${historicalTotal} med prisdata)`;
        
        if (salesData.historical.actualSearchQuery) {
          const encodedQuery = encodeURIComponent(salesData.historical.actualSearchQuery);
          const historicalUrl = `https://auctionet.com/sv/search?event_id=&is=ended&q=${encodedQuery}`;
          dataText = `<a href="${historicalUrl}" target="_blank" style="color: #2c3e50; text-decoration: none; font-weight: 600;" title="Visa alla ${historicalTotal} historiska träffar för '${salesData.historical.actualSearchQuery}'">${historicalCount} historiska träffar</a>`;
          helpText = `(${historicalTotal} analyserade)`;
        } else {
          helpText = 'bekräftade försäljningar';
        }
      } else if (liveCount > 0) {
        // Only live data
        dataText = `${liveCount} pågående (${liveTotal} träffar)`;
        
        if (salesData.live.actualSearchQuery) {
          const encodedQuery = encodeURIComponent(salesData.live.actualSearchQuery);
          const liveUrl = `https://auctionet.com/sv/search?event_id=&q=${encodedQuery}`;
          dataText = `<a href="${liveUrl}" target="_blank" style="color: #2c3e50; text-decoration: none; font-weight: 600;" title="Visa alla ${liveTotal} pågående träffar för '${salesData.live.actualSearchQuery}'">${liveCount} pågående</a>`;
          helpText = `(${liveTotal} träffar)`;
        } else {
          helpText = 'aktiva auktioner';
        }
      }
      
      // Enhanced quality indicators based on data depth and API coverage
      const totalAnalyzed = historicalCount + liveCount;
      const totalFound = historicalTotal + liveTotal;
      const analysisRatio = totalFound > 0 ? (totalAnalyzed / totalFound) : 1;
      
      if (totalAnalyzed >= 50 && analysisRatio > 0.8) {
        dataIcon = '🎯'; // Excellent: Many items + high coverage
      } else if (totalAnalyzed >= 20 && totalFound >= 100) {
        dataIcon = '📊'; // Very good: Good sample + large market
      } else if (totalAnalyzed >= 10 && totalFound >= 50) {
        dataIcon = '📈'; // Good: Decent sample + moderate market
      } else if (totalAnalyzed >= 5) {
        dataIcon = '📉'; // Moderate: Small but usable sample
      } else if (totalAnalyzed >= 3) {
        dataIcon = '⚠️'; // Limited: Minimal data
      } else {
        dataIcon = '❗'; // Poor: Very limited data
      }
      
      if (dataText) {
        dashboardContent += `
          <div class="market-item market-data-foundation">
            <div class="market-label" title="Antal analyserade försäljningar från API-sökning som ligger till grund för analysen">Dataunderlag ${dataIcon}</div>
            <div class="market-value" style="font-weight: 600;">${dataText}</div>
            <div class="market-help">${helpText}</div>
          </div>
        `;
        console.log('✅ Added enhanced data foundation display with API coverage details');
      }
    }

    // Market activity (NEW: show current market strength)
    if (salesData.live && salesData.live.marketActivity) {
      const activity = salesData.live.marketActivity;
      let activityIcon = '';
      let activityColor = '';
      let activityText = '';
      let helpText = '';
      
      const reserveMetPercentage = activity.reservesMetPercentage || 0;
      const avgBids = activity.averageBidsPerItem || 0;
      
      if (reserveMetPercentage >= 80) {
        activityIcon = '🔥';
        activityColor = '#e74c3c';
        activityText = 'Stark marknad';
        helpText = `${reserveMetPercentage}% når utrop`;
      } else if (reserveMetPercentage >= 60) {
        activityIcon = '📈';
        activityColor = '#f39c12';
        activityText = 'Måttlig marknad';
        helpText = `${reserveMetPercentage}% når utrop`;
      } else if (reserveMetPercentage >= 30) {
        activityIcon = '📊';
        activityColor = '#3498db';
        activityText = 'Svag marknad';
        helpText = `${reserveMetPercentage}% när utrop`;
      } else {
        activityIcon = '❄️';
        activityColor = '#95a5a6';
        activityText = 'Mycket svag';
        helpText = `${reserveMetPercentage}% når utrop`;
      }
      
      // Look for market activity insights with links
      let enhancedHelpText = helpText;
      if (salesData.insights) {
        const marketInsight = salesData.insights.find(insight => 
          insight.type === 'market_strength' || insight.type === 'market_weakness' || insight.type === 'market_info'
        );
        
        if (marketInsight && marketInsight.message.includes('<a href=')) {
          // Extract the auction link part from the insight message
          const linkMatch = marketInsight.message.match(/\(<a href="[^"]+">(\d+\s+auktioner)<\/a>\)/);
          if (linkMatch) {
            const fullLinkHTML = marketInsight.message.match(/\(<a href="[^"]+"[^>]*>\d+\s+auktioner<\/a>\)/)[0];
            enhancedHelpText = `${reserveMetPercentage}% når utrop ${fullLinkHTML.replace(/^\(|\)$/g, '')}`;
          }
        }
      }
      
      dashboardContent += `
        <div class="market-item market-activity">
          <div class="market-label" title="Andel pågående auktioner som når sina utrop - indikerar marknadsstyrka">Marknadsaktivitet ${activityIcon}</div>
          <div class="market-value" style="color: ${activityColor}; font-weight: 600;">${activityText}</div>
          <div class="market-help">${enhancedHelpText}</div>
        </div>
      `;
      console.log('✅ Added market activity display with enhanced links');
    }

    // Market sentiment/trend (NEW: comprehensive market direction analysis)
    if (salesData.live || salesData.historical) {
      let sentimentIcon = '';
      let sentimentColor = '';
      let sentimentText = '';
      let helpText = '';
      
      // Combine historical trend and live sentiment for comprehensive analysis
      const hasHistoricalTrend = salesData.historical?.trendAnalysis?.trend !== 'insufficient_data';
      const hasLiveSentiment = salesData.live?.marketSentiment;
      const historicalTrend = salesData.historical?.trendAnalysis;
      const liveSentiment = salesData.live?.marketSentiment;
      const liveActivity = salesData.live?.marketActivity;
      
      // Complex conditional logic based on available data
      if (hasHistoricalTrend && hasLiveSentiment) {
        // Both historical and live data available - most comprehensive analysis
        const historicalRising = historicalTrend.changePercent > 10;
        const historicalFalling = historicalTrend.changePercent < -10;
        const liveStrong = liveSentiment === 'strong';
        const liveWeak = liveSentiment === 'weak';
        const reserveMet = liveActivity?.reservesMetPercentage || 0;
        
        if (historicalRising && liveStrong) {
          sentimentIcon = '🚀';
          sentimentColor = '#27ae60';
          sentimentText = 'STARK UPPGÅNG';
          helpText = `historiskt +${historicalTrend.changePercent}%, ${reserveMet}% når utrop - marknadens hetaste segment`;
        } else if (historicalRising && liveWeak) {
          sentimentIcon = '⚠️';
          sentimentColor = '#f39c12';
          sentimentText = 'KONFLIKT';
          helpText = `historiskt +${historicalTrend.changePercent}% men svag nuvarande efterfrågan (${reserveMet}% når utrop) - möjlig vändning`;
        } else if (historicalFalling && liveStrong) {
          sentimentIcon = '🔄';
          sentimentColor = '#3498db';
          sentimentText = 'ÅTERHÄMTNING';
          helpText = `efter historisk nedgång ${historicalTrend.changePercent}% nu stark aktivitet (${reserveMet}% når utrop)`;
        } else if (historicalFalling && liveWeak) {
          sentimentIcon = '📉';
          sentimentColor = '#e74c3c';
          sentimentText = 'NEDGÅNG FORTSÄTTER';
          helpText = `historiskt ${historicalTrend.changePercent}%, nuvarande svag efterfrågan - marknad i brytpunkt`;
        } else if (liveSentiment === 'moderate' || liveSentiment === 'neutral') {
          if (Math.abs(historicalTrend.changePercent) <= 5) {
            sentimentIcon = '📊';
            sentimentColor = '#34495e';
            sentimentText = 'STABIL MARKNAD';
            helpText = `balanserad utveckling, ${reserveMet}% når utrop - förutsägbar prisnivå`;
          } else {
            const direction = historicalTrend.changePercent > 0 ? 'UPPÅT' : 'NEDÅT';
            sentimentIcon = historicalTrend.changePercent > 0 ? '📈' : '📉';
            sentimentColor = '#95a5a6';
            sentimentText = `MÅTTLIG TREND ${direction}`;
            helpText = `${historicalTrend.changePercent > 0 ? '+' : ''}${historicalTrend.changePercent}% historiskt, måttlig nuvarande aktivitet`;
          }
        }
      } else if (hasHistoricalTrend && !hasLiveSentiment) {
        // Only historical data available
        const dataQuality = salesData.historical.analyzedSales >= 10 ? 'pålitlig' : 'begränsad';
        
        if (historicalTrend.changePercent > 20) {
          sentimentIcon = '🔥';
          sentimentColor = '#e74c3c';
          sentimentText = 'STARK HISTORISK UPPGÅNG';
          helpText = `+${historicalTrend.changePercent}% prisutveckling (${dataQuality} data) - inga pågående auktioner för bekräftelse`;
        } else if (historicalTrend.changePercent < -20) {
          sentimentIcon = '❄️';
          sentimentColor = '#3498db';
          sentimentText = 'STARK HISTORISK NEDGÅNG';
          helpText = `${historicalTrend.changePercent}% prisutveckling (${dataQuality} data) - marknaden behöver nya signaler`;
        } else if (Math.abs(historicalTrend.changePercent) <= 5) {
          sentimentIcon = '📊';
          sentimentColor = '#27ae60';
          sentimentText = 'HISTORISKT STABIL';
          helpText = `minimal förändring (${dataQuality} historiska data) - konsekvent prissättning över tid`;
        } else {
          const direction = historicalTrend.changePercent > 0 ? 'UPPÅT' : 'NEDÅT';
          sentimentIcon = historicalTrend.changePercent > 0 ? '📈' : '📉';
          sentimentColor = '#f39c12';
          sentimentText = `MÅTTLIG TREND ${direction}`;
          helpText = `${historicalTrend.changePercent > 0 ? '+' : ''}${historicalTrend.changePercent}% utveckling (${dataQuality} data) - stabil riktning`;
        }
      } else if (!hasHistoricalTrend && hasLiveSentiment) {
        // Only live data available
        const reserveMet = liveActivity?.reservesMetPercentage || 0;
        const bidActivity = liveActivity?.averageBidsPerItem || 0;
        
        switch (liveSentiment) {
          case 'strong':
            sentimentIcon = '🔥';
            sentimentColor = '#27ae60';
            sentimentText = 'STARK NUVARANDE EFTERFRÅGAN';
            helpText = `${reserveMet}% når utrop, ${bidActivity.toFixed(1)} bud/auktion - mycket aktiv marknad`;
            break;
          case 'moderate':
            sentimentIcon = '📈';
            sentimentColor = '#f39c12';
            sentimentText = 'MÅTTLIG AKTIVITET';
            helpText = `${reserveMet}% når utrop - normal marknadsaktivitet för segmentet`;
            break;
          case 'weak':
            sentimentIcon = '📉';
            sentimentColor = '#e67e22';
            sentimentText = 'SVAG EFTERFRÅGAN';
            helpText = `endast ${reserveMet}% når utrop - köparmarknaden väntar`;
            break;
          case 'neutral':
          default:
            sentimentIcon = '📊';
            sentimentColor = '#3498db';
            sentimentText = 'NEUTRAL MARKNAD';
            helpText = `${reserveMet}% når utrop - avvaktande marknadssituation`;
            break;
        }
      } else {
        // No trend data available
        sentimentIcon = '❓';
        sentimentColor = '#95a5a6';
        sentimentText = 'OTILLRÄCKLIG DATA';
        helpText = 'för få försäljningar för trendanalys - behöver fler marknadsignaler';
      }
      
      dashboardContent += `
        <div class="market-item market-sentiment">
          <div class="market-label" title="Omfattande trendanalys som kombinerar historisk prisutveckling med nuvarande marknadsaktivitet">Marknadstrend ${sentimentIcon}</div>
          <div class="market-value" style="color: ${sentimentColor}; font-weight: 600;">${sentimentText}</div>
          <div class="market-help">${helpText}</div>
        </div>
      `;
      console.log('✅ Added comprehensive market trend analysis with conditional logic');
    }
    
    // Complete the dashboard creation and setup
    this.completeDashboardCreation(dashboard, dashboardContent, salesData, valuationSuggestions);
  }

  // Helper method to complete dashboard creation (separated for readability)
  completeDashboardCreation(dashboard, dashboardContent, salesData, valuationSuggestions) {
    // Generate search filter HTML if candidate terms are available
    let searchFilterHTML = '';
    if (this.qualityAnalyzer && this.qualityAnalyzer.searchFilterManager.lastCandidateSearchTerms) {
      searchFilterHTML = this.generateSearchFilterHTML(this.qualityAnalyzer.searchFilterManager.lastCandidateSearchTerms);
    }
    
    // Determine the actual search query used
    let actualSearchQuery = '';
    let querySource = '';
    
    if (salesData.historical && salesData.historical.actualSearchQuery) {
      actualSearchQuery = salesData.historical.actualSearchQuery;
      querySource = 'historisk data';
    } else if (salesData.live && salesData.live.actualSearchQuery) {
      actualSearchQuery = salesData.live.actualSearchQuery;
      querySource = 'pågående auktioner';
    } else {
      // Fallback to entity name or analysis type
      actualSearchQuery = salesData.searchedEntity || salesData.analysisType || 'Okänd sökning';
      querySource = 'automatisk analys';
    }
    
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
    
    console.log('🎉 Dashboard successfully added to DOM!');
    console.log('📊 Dashboard element:', dashboard);
    
    // Setup interactive search filter if quality analyzer is available
    if (this.qualityAnalyzer && this.qualityAnalyzer.searchFilterManager.setupHeaderSearchFilterInteractivity) {
      this.qualityAnalyzer.searchFilterManager.setupHeaderSearchFilterInteractivity();
    }
    
    // NEW: Setup hot reload functionality for smart suggestions
    this.setupSmartSuggestionHotReload();
  }

  // NEW: Setup hot reload functionality for smart suggestions
  setupSmartSuggestionHotReload() {
    console.log('🔥 Setting up hot reload for smart suggestions');
    
    // Add event listeners to all smart suggestion checkboxes
    const smartCheckboxes = document.querySelectorAll('.smart-checkbox');
    
    smartCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (event) => {
        console.log('🔥 Smart suggestion changed:', event.target.value, 'checked:', event.target.checked);
        this.handleSmartSuggestionChange();
      });
    });
    
    console.log(`✅ Hot reload setup complete for ${smartCheckboxes.length} smart suggestions`);
  }
  
  // NEW: Handle smart suggestion changes with hot reload
  async handleSmartSuggestionChange() {
    console.log('🔄 Processing smart suggestion change with hot reload...');
    
    // Show loading indicator
    const loadingIndicator = document.getElementById('filter-loading');
    const statusIndicator = document.getElementById('filter-status');
    const currentQueryDisplay = document.getElementById('current-search-display');
    
    if (loadingIndicator) loadingIndicator.style.display = 'inline';
    if (statusIndicator) statusIndicator.textContent = 'Analyserar ny sökning...';
    
    // Collect selected terms
    const smartCheckboxes = document.querySelectorAll('.smart-checkbox');
    const selectedTerms = [];
    
    smartCheckboxes.forEach(checkbox => {
      if (checkbox.checked) {
        selectedTerms.push(checkbox.value);
      }
    });
    
    console.log('🎯 Selected terms for hot reload:', selectedTerms);
    
    if (selectedTerms.length === 0) {
      console.log('⚠️ No terms selected - keeping current search');
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      if (statusIndicator) statusIndicator.textContent = 'Välj minst en term för analys';
      return;
    }
    
    try {
      // Build new search query
      const newQuery = selectedTerms.join(' ');
      console.log('🔥 HOT RELOAD: New search query:', newQuery);
      
      // Update current query display
      if (currentQueryDisplay) {
        currentQueryDisplay.textContent = `"${newQuery}"`;
      }
      
      // Get current item data (assuming we have access to this)
      if (!this.qualityAnalyzer) {
        console.error('❌ Quality analyzer not available for hot reload');
        return;
      }
      
      const dataExtractor = this.qualityAnalyzer.dataExtractor;
      if (!dataExtractor) {
        console.error('❌ Data extractor not available for hot reload');
        return;
      }
      
      const data = dataExtractor.extractItemData();
      
      // Create custom search context for user-selected terms
      const customSearchContext = {
        primarySearch: newQuery,
        objectType: this.qualityAnalyzer.extractObjectType(data.title),
        period: this.qualityAnalyzer.extractPeriod(data.title) || this.qualityAnalyzer.extractPeriod(data.description),
        technique: this.qualityAnalyzer.extractTechnique(data.title, data.description),
        analysisType: 'custom_user_filter',
        hotReload: true // Flag to indicate this is a hot reload
      };
      
      console.log('🔥 HOT RELOAD: Custom search context:', customSearchContext);
      
      // Show dashboard loading
      this.showDashboardLoading();
      
      // Call API with custom search for hot reload
      const filteredSalesData = await this.apiManager.analyzeSales(customSearchContext);
      
      // Add analysis metadata
      filteredSalesData.analysisType = 'custom_user_filter';
      filteredSalesData.searchedEntity = newQuery;
      filteredSalesData.searchContext = customSearchContext;
      filteredSalesData.hotReload = true;
      
      console.log('🔥 HOT RELOAD: New sales data received:', filteredSalesData);
      
      // Update dashboard with new data
      this.addMarketDataDashboard(filteredSalesData);
      
      // Update status
      if (statusIndicator) {
        statusIndicator.textContent = `Analys uppdaterad med "${newQuery}"`;
      }
      
      console.log('🔥 HOT RELOAD: Dashboard successfully updated!');
      
    } catch (error) {
      console.error('❌ HOT RELOAD ERROR:', error);
      
      if (statusIndicator) {
        statusIndicator.textContent = 'Fel vid uppdatering - försök igen';
      }
    } finally {
      // Hide loading indicator
      if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
  }

  // NEW: Generate search filter HTML from candidate terms
  generateSearchFilterHTML(candidateTerms) {
    if (!candidateTerms || !candidateTerms.candidates || candidateTerms.candidates.length === 0) {
      return '';
    }
    
    console.log('🔧 Generating smart search filter with', candidateTerms.candidates.length, 'candidate terms');
    
    // AI-POWERED SMART SUGGESTIONS: Select top 4-5 most important terms
    const smartSuggestions = this.selectSmartSuggestions(candidateTerms.candidates);
    
    // Show current query and smart suggestions prominently
    let filterHTML = `
      <div class="search-filter-section">
        <div class="filter-header">
          <h4 class="filter-title">🧠 AI-smarta sökförslag</h4>
          <div class="filter-description">Lägg till relevanta termer för mer exakt analys - uppdateras automatiskt</div>
        </div>
        <div class="smart-suggestions">
          <div class="current-query-display">
            <span class="current-label">Nuvarande:</span>
            <span class="current-query" id="current-search-display">"${candidateTerms.currentQuery}"</span>
          </div>
          <div class="suggestion-controls">`;
    
    // Generate smart suggestion checkboxes
    smartSuggestions.forEach((suggestion, index) => {
      const checkboxId = `smart-suggestion-${index}`;
      const isChecked = suggestion.preSelected ? 'checked' : '';
      const priority = this.getSuggestionPriority(suggestion);
      
      filterHTML += `
        <label class="smart-suggestion-checkbox ${priority}" title="${suggestion.description}: ${suggestion.term}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${suggestion.term}" 
                 data-type="${suggestion.type}"
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
          <span class="update-status" id="filter-status">Klicka på förslag för att förfina sökningen</span>
        </div>
      </div>`;
    
    return filterHTML;
  }
  
  // NEW: AI-powered smart suggestion selection
  selectSmartSuggestions(candidates) {
    // Score each candidate based on importance and context
    const scoredCandidates = candidates.map(candidate => {
      let score = 0;
      
      // Type-based scoring (priority)
      const typeScores = {
        'artist': 10,      // Highest priority
        'object_type': 9,  
        'model': 8,
        'material': 7,
        'reference': 6,
        'period': 5,
        'movement': 4,
        'keyword': 3       // Lowest priority
      };
      
      score += typeScores[candidate.type] || 1;
      
      // Boost score if already pre-selected (current algorithm chose it)
      if (candidate.preSelected) {
        score += 5;
      }
      
      // Boost score for high-value terms
      const highValueTerms = ['guld', 'silver', 'diamant', 'antik', 'vintage', 'original', 'limited', 'signed'];
      if (highValueTerms.some(term => candidate.term.toLowerCase().includes(term))) {
        score += 3;
      }
      
      // Penalize very generic terms
      const genericTerms = ['objekt', 'föremål', 'sak', 'konstarbete'];
      if (genericTerms.some(term => candidate.term.toLowerCase().includes(term))) {
        score -= 2;
      }
      
      return { ...candidate, score };
    });
    
    // Sort by score and select top 5
    const topSuggestions = scoredCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    console.log('🧠 AI-selected smart suggestions:', topSuggestions.map(s => `${s.term} (${s.score})`));
    
    return topSuggestions;
  }
  
  // Helper: Get suggestion priority class for styling
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
} 