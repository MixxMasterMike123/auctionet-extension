// admin-item-banner.js - Content script for admin item show pages
(async function() {
  'use strict';
  
  console.log('Auctionet Admin Item Banner: Starting initialization...');
  
  try {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      console.log('Waiting for DOM to load...');
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }

    // Additional wait to ensure dynamic content is loaded
    console.log('Waiting for dynamic content...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we're on the right page (admin item show page, not edit)
    const url = window.location.href;
    console.log('Current URL:', url);
    
    // More robust page detection - handle the actual Auctionet URL structure
    const isAdminItemPage = url.includes('auctionet.com/admin/') && 
                           url.includes('/items/') && 
                           !url.includes('/edit');
    
    // Look for indicators that this is an item show page
    const hasItemTable = document.querySelector('table.table') || document.querySelector('table');
    const hasDetailsSection = document.querySelector('.details-texts') || 
                             document.querySelector('[class*="detail"]') ||
                             document.querySelector('h5, h3, h4') || // Any heading structure
                             document.querySelector('.heading');
    const hasEditLink = document.querySelector('a[href*="/edit"]');
    
    console.log('Page detection:', {
      isAdminItemPage,
      hasItemTable,
      hasDetailsSection,
      hasEditLink,
      url
    });

    const isCorrectPage = isAdminItemPage && (hasItemTable || hasDetailsSection) && hasEditLink;

    if (!isCorrectPage) {
      console.log('Auctionet Admin Item Banner: Not on an admin item show page');
      return;
    }

    console.log('Auctionet Admin Item Banner: On correct page, initializing...');
    
    // Extract item data from the admin show page
    const itemData = extractItemDataFromShowPage();
    console.log('Extracted item data:', itemData);
    
    if (!itemData.title) {
      console.log('Could not extract item data, aborting');
      return;
    }
    
    // Calculate quality score
    const qualityScore = calculateQualityScore(itemData);
    console.log('Calculated quality score:', qualityScore);
    
    // Show banner if quality is below 71 (catches items missing keywords that would score 70 on edit page)
    if (qualityScore.score < 71) {
      showQualityBanner(qualityScore, itemData);
    }
    
    console.log('Auctionet Admin Item Banner: Initialization complete');
    
  } catch (error) {
    console.error('Auctionet Admin Item Banner: Error during initialization:', error);
  }

  function extractItemDataFromShowPage() {
    const data = {
      title: '',
      description: '',
      condition: '',
      keywords: '',
      artist: ''
    };

    console.log('Starting data extraction...');

    // Extract title from the details section - try multiple selectors
    const titleSelectors = [
      '.details-texts .heading + .bottom-vspace',
      '.details-texts h5 + div',
      '.details-texts .heading + div',
      'h5:contains("Titel") + div',
      '[class*="detail"] h5 + div'
    ];
    
    for (const selector of titleSelectors) {
      const titleElement = document.querySelector(selector);
      if (titleElement && titleElement.textContent.trim()) {
        data.title = titleElement.textContent.trim();
        console.log('Found title with selector:', selector, '→', data.title);
        break;
      }
    }

    // If still no title found, try looking for any heading followed by content
    if (!data.title) {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const heading of headings) {
        if (heading.textContent.includes('Titel') || heading.textContent.includes('titel')) {
          const nextElement = heading.nextElementSibling;
          if (nextElement && nextElement.textContent.trim()) {
            data.title = nextElement.textContent.trim();
            console.log('Found title via heading search:', data.title);
            break;
          }
        }
      }
    }

    // Extract description and condition - try multiple approaches
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, .heading, [class*="heading"]');
    
    for (let i = 0; i < headings.length; i++) {
      const headingText = headings[i].textContent.toLowerCase();
      
      if (headingText.includes('beskrivning') && !data.description) {
        const nextSibling = headings[i].nextElementSibling;
        if (nextSibling) {
          data.description = nextSibling.innerHTML || nextSibling.textContent || '';
          console.log('Found description:', data.description.substring(0, 50) + '...');
        }
      }
      
      if (headingText.includes('kondition') && !data.condition) {
        const nextSibling = headings[i].nextElementSibling;
        if (nextSibling) {
          data.condition = nextSibling.innerHTML || nextSibling.textContent || '';
          console.log('Found condition:', data.condition.substring(0, 50) + '...');
        }
      }
    }

    // Extract artist from table - try multiple table selectors
    const tables = document.querySelectorAll('table, .table, [class*="table"]');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const headerCell = row.querySelector('th, td:first-child, .label, [class*="label"]');
        if (headerCell && headerCell.textContent.includes('Konstnär')) {
          const valueCell = row.querySelector('td:last-child, .value, [class*="value"]') || 
                           row.querySelector('td:not(:first-child)');
          if (valueCell) {
            data.artist = valueCell.textContent.trim();
            if (data.artist === '-') data.artist = '';
            console.log('Found artist:', data.artist);
            break;
          }
        }
      }
      if (data.artist) break;
    }

    // For keywords, we'll assume empty since they're not visible on show page
    data.keywords = '';

    console.log('Final extracted data:', data);
    return data;
  }

  function calculateQualityScore(data) {
    let score = 100;
    const issues = [];
    
    console.log('🔍 Quality scoring debug:');
    console.log('Title:', `"${data.title}" (${data.title.length} chars)`);
    console.log('Description raw:', `"${data.description}"`);
    console.log('Condition raw:', `"${data.condition}"`);
    
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    
    console.log('Description clean:', `"${data.description.replace(/<[^>]*>/g, '')}" (${descLength} chars)`);
    console.log('Condition clean:', `"${data.condition.replace(/<[^>]*>/g, '')}" (${condLength} chars)`);
    
    // Apply same scoring logic as in quality-analyzer.js
    if (data.title.length < 14) {
      score -= 15;
      issues.push('Titel för kort');
      console.log('❌ Title penalty: -15 (too short)');
    }
    
    if (descLength < 35) {
      score -= 20;
      issues.push('Beskrivning för kort');
      console.log('❌ Description penalty: -20 (too short)');
    }
    
    // Condition analysis
    const conditionText = data.condition.toLowerCase();
    const isUnexaminedFramed = /ej\s+examinerad\s+ur\s+ram/i.test(conditionText);
    
    if (!isUnexaminedFramed) {
      if (condLength < 25) {
        score -= 20;
        issues.push('Konditionsrapport för kort');
        console.log('❌ Condition length penalty: -20 (too short)');
      }
      
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i) || 
          conditionText.trim() === 'bruksslitage.' ||
          conditionText.trim() === 'bruksslitage') {
        score -= 35;
        issues.push('Enbart "bruksslitage" i kondition');
        console.log('❌ "Bruksslitage only" penalty: -35');
      }
      
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
      
      if (hasVaguePhrase && condLength < 40) {
        score -= 20;
        issues.push('Vaga uttryck i kondition');
        console.log('❌ Vague condition penalty: -20');
      }
    }
    
    // Check for measurements
    const hasMeasurementsResult = hasMeasurements(data.description);
    console.log('Has measurements:', hasMeasurementsResult);
    if (!hasMeasurementsResult) {
      score -= 10;
      issues.push('Saknar mått');
      console.log('❌ No measurements penalty: -10');
    }
    
    const adminScore = Math.max(0, score);
    console.log('📊 Admin score (without keywords):', adminScore);
    
    // Convert to "edit page equivalent" score
    // Admin scoring: 0-100 (no keywords penalty)
    // Edit scoring: 0-100 (includes 30-point keywords penalty)
    // Formula: editEquivalent = adminScore - 30 (assuming keywords are missing)
    const editEquivalentScore = Math.max(0, adminScore - 30);
    
    console.log('🔄 Edit page equivalent score:', editEquivalentScore);
    console.log('📋 Issues found:', issues);
    
    // Add keywords to issues list since we assume they're missing
    const allIssues = [...issues];
    if (editEquivalentScore < 70) {
      allIssues.push('Troligen saknar nyckelord');
    }
    
    return { 
      score: editEquivalentScore, 
      adminScore: adminScore,
      issues: allIssues 
    };
  }

  function hasMeasurements(text) {
    const measurementPatterns = [
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(diameter|diam\.?|ø)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(längd|bredd|bred|djup|höjd|h\.?|l\.?|d\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /\d+([.,]\d+)?\s*(mm|cm|m)\b/i
    ];
    
    return measurementPatterns.some(pattern => text.match(pattern));
  }

  function getScoreColors(score) {
    // Color grading from red (0) to green (70)
    // Since banner only shows for scores < 70, we map 0-69 to red-green gradient
    
    if (score <= 20) {
      // Critical issues: Deep red
      return {
        background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
        textColor: '#FFFFFF',
        iconColor: '#FEF2F2'
      };
    } else if (score <= 40) {
      // Major issues: Red-orange
      return {
        background: 'linear-gradient(135deg, #EA580C 0%, #DC2626 100%)',
        textColor: '#FFFFFF',
        iconColor: '#FEF2F2'
      };
    } else if (score <= 55) {
      // Moderate issues: Orange
      return {
        background: 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
        textColor: '#FFFFFF',
        iconColor: '#FFFBEB'
      };
    } else {
      // Minor issues: Yellow-green
      return {
        background: 'linear-gradient(135deg, #84CC16 0%, #F59E0B 100%)',
        textColor: '#FFFFFF',
        iconColor: '#F7FEE7'
      };
    }
  }

  function showQualityBanner(qualityResult, itemData) {
    const { score, issues } = qualityResult;
    
    // Find the edit link to construct the edit URL
    const editLink = document.querySelector('a[href*="/edit"]');
    if (!editLink) {
      console.log('Could not find edit link, cannot show banner');
      return;
    }

    // Get dynamic colors based on score
    const colors = getScoreColors(score);

    // Create issues list for display
    const issuesList = issues.length > 0 ? 
      `<br><small>Huvudproblem: ${issues.slice(0, 3).join(', ')}</small>` : '';

    // Create the banner
    const banner = document.createElement('div');
    banner.className = 'auctionet-quality-banner';
    banner.innerHTML = `
      <div class="banner-content">
        <div class="banner-icon">⚡</div>
        <div class="banner-text">
          <strong>Kvalitetspoäng: ${score}/100</strong> <small>(synlig: ${qualityResult.adminScore}/100)</small>${issuesList}<br>
          Det finns potential att nå högre priser på detta föremål. 
          <a href="${editLink.href}" class="banner-link">Klicka på "Redigera föremål"</a> för att se hela analysen.
        </div>
        <button class="banner-close" onclick="this.parentElement.parentElement.style.display='none'" title="Stäng">×</button>
      </div>
    `;

    // Add CSS styles with dynamic colors
    const style = document.createElement('style');
    style.textContent = `
      .auctionet-quality-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: ${colors.background};
        color: ${colors.textColor};
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideDown 0.3s ease-out;
      }
      
      @keyframes slideDown {
        from {
          transform: translateY(-100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      
      .banner-content {
        display: flex;
        align-items: center;
        padding: 15px 20px;
        max-width: 1200px;
        margin: 0 auto;
        gap: 15px;
      }
      
      .banner-icon {
        font-size: 28px;
        flex-shrink: 0;
        animation: pulse 2s infinite;
        color: ${colors.iconColor};
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      .banner-text {
        flex: 1;
        line-height: 1.5;
      }
      
      .banner-text strong {
        font-weight: 600;
        font-size: 16px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      }
      
      .banner-text small {
        opacity: 0.95;
        font-size: 13px;
      }
      
      .banner-link {
        color: ${colors.textColor};
        text-decoration: underline;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      
      .banner-link:hover {
        color: ${colors.iconColor};
        text-decoration: none;
        transform: translateY(-1px);
      }
      
      .banner-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: ${colors.textColor};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s ease;
      }
      
      .banner-close:hover {
        background: rgba(255,255,255,0.3);
        transform: scale(1.1);
      }
      
      /* Adjust page content to account for banner */
      body {
        padding-top: 75px !important;
        transition: padding-top 0.3s ease;
      }
      
      /* Responsive design */
      @media (max-width: 768px) {
        .banner-content {
          padding: 12px 15px;
          gap: 10px;
        }
        
        .banner-icon {
          font-size: 24px;
        }
        
        .banner-text {
          font-size: 14px;
        }
        
        .banner-text strong {
          font-size: 15px;
        }
        
        body {
          padding-top: 70px !important;
        }
      }
    `;

    // Insert banner and styles
    document.head.appendChild(style);
    document.body.insertBefore(banner, document.body.firstChild);
    
    console.log(`Quality banner shown for score: ${score}, issues: ${issues.join(', ')}, colors: ${colors.background}`);
  }

})(); 