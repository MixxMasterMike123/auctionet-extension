// admin-item-banner.js - Content script for admin item show pages
(async function() {
  'use strict';
  
  try {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }

    // Additional wait to ensure dynamic content is loaded
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we're on the right page (admin item show page, not edit)
    const url = window.location.href;
    
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
    
    const isCorrectPage = isAdminItemPage && (hasItemTable || hasDetailsSection) && hasEditLink;

    if (!isCorrectPage) {
      return;
    }
    
    // Extract item data from the admin show page
    const itemData = extractItemDataFromShowPage();
    
    if (!itemData.title) {
      return;
    }
    
    // Calculate quality score
    const qualityScore = calculateQualityScore(itemData);
    
    // Show banner if quality is below 71 (catches items missing keywords that would score 70 on edit page)
    if (qualityScore.score < 71) {
      showQualityBanner(qualityScore, itemData);
    }
    
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

        }
      }
      
      if (headingText.includes('kondition') && !data.condition) {
        const nextSibling = headings[i].nextElementSibling;
        if (nextSibling) {
          data.condition = nextSibling.innerHTML || nextSibling.textContent || '';

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

            break;
          }
        }
      }
      if (data.artist) break;
    }

    // For keywords, we'll assume empty since they're not visible on show page
    data.keywords = '';


    return data;
  }

  function calculateQualityScore(data) {
    let score = 100;
    const issues = [];
    
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    
    // Apply same scoring logic as in quality-analyzer.js
    if (data.title.length < 14) {
      score -= 15;
      issues.push('Titel för kort');
    }
    
    if (descLength < 35) {
      score -= 20;
      issues.push('Beskrivning för kort');
    }
    
    // Condition analysis
    const conditionText = data.condition.toLowerCase();
    const isUnexaminedFramed = /ej\s+examinerad\s+ur\s+ram/i.test(conditionText);
    
    if (!isUnexaminedFramed) {
      if (condLength < 25) {
        score -= 20;
        issues.push('Konditionsrapport för kort');
      }
      
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i) || 
          conditionText.trim() === 'bruksslitage.' ||
          conditionText.trim() === 'bruksslitage') {
        score -= 35;
        issues.push('Enbart "bruksslitage" i kondition');
      }
      
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
      
      if (hasVaguePhrase && condLength < 40) {
        score -= 20;
        issues.push('Vaga uttryck i kondition');
      }
    }
    
    // Check for measurements
    const hasMeasurementsResult = hasMeasurements(data.description);
    if (!hasMeasurementsResult) {
      score -= 10;
      issues.push('Saknar mått');
    }
    
    const adminScore = Math.max(0, score);
    
    // Convert to "edit page equivalent" score
    // Admin scoring: 0-100 (no keywords penalty)
    // Edit scoring: 0-100 (includes 30-point keywords penalty)
    // Formula: editEquivalent = adminScore - 30 (assuming keywords are missing)
    const editEquivalentScore = Math.max(0, adminScore - 30);
    
    // Add keywords to issues list since we assume they're missing
    const allIssues = [...issues];
    if (editEquivalentScore < 70) {
      allIssues.push('Troligen saknas nyckelord');
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
    // Modern 2025 dashboard color palette
    
    if (score <= 20) {
      // Critical: Modern red with sophistication
      return {
        background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
        borderColor: '#ef4444',
        textColor: '#7f1d1d',
        iconColor: '#ef4444',
        buttonBg: '#ef4444',
        buttonText: '#ffffff'
      };
    } else if (score <= 40) {
      // Major: Modern amber with warmth
      return {
        background: 'linear-gradient(135deg, #fffbeb 0%, #fed7aa 100%)',
        borderColor: '#f59e0b',
        textColor: '#92400e',
        iconColor: '#f59e0b',
        buttonBg: '#f59e0b',
        buttonText: '#ffffff'
      };
    } else if (score <= 55) {
      // Moderate: Modern blue with trust
      return {
        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        borderColor: '#3b82f6',
        textColor: '#1e40af',
        iconColor: '#3b82f6',
        buttonBg: '#3b82f6',
        buttonText: '#ffffff'
      };
    } else {
      // Minor: Modern emerald with success
      return {
        background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
        borderColor: '#10b981',
        textColor: '#065f46',
        iconColor: '#10b981',
        buttonBg: '#10b981',
        buttonText: '#ffffff'
      };
    }
  }

  function showQualityBanner(qualityResult, itemData) {
    const { score, issues } = qualityResult;
    
    // Find the edit link to construct the edit URL
    const editLink = document.querySelector('a[href*="/edit"]');
    if (!editLink) {
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

    // Add CSS styles - modern 2025 dashboard design
    const style = document.createElement('style');
    style.textContent = `
      .auctionet-quality-banner {
        position: relative;
        background: ${colors.background};
        color: ${colors.textColor};
        border: 1px solid ${colors.borderColor};
        border-radius: 12px;
        margin: 0px 20px 20px 20px;
        padding: 0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Display', Roboto, sans-serif;
        animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        backdrop-filter: blur(8px);
      }
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      .banner-content {
        display: flex;
        align-items: flex-start;
        padding: 20px 24px;
        gap: 16px;
      }
      
      .banner-icon {
        font-size: 20px;
        color: ${colors.iconColor};
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 2px;
      }
      
      .banner-text {
        flex: 1;
        line-height: 1.5;
      }
      
      .banner-text strong {
        font-weight: 600;
        font-size: 15px;
        color: ${colors.textColor};
        display: block;
        margin-bottom: 4px;
      }
      
      .banner-text small {
        color: ${colors.textColor};
        opacity: 0.75;
        font-size: 13px;
        font-weight: 500;
      }
      
      .banner-link {
        background: ${colors.buttonBg};
        color: ${colors.buttonText};
        text-decoration: none;
        font-weight: 600;
        padding: 8px 16px;
        border-radius: 8px;
        border: none;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 12px;
        font-size: 13px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        letter-spacing: 0.01em;
        text-shadow: none;
      }
      
      .banner-link:hover {
        background: ${colors.buttonBg};
        color: ${colors.buttonText};
        text-decoration: none;
        text-shadow: none;
        opacity: 0.9;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      
      .banner-link:active {
        transform: translateY(0);
        opacity: 1;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
      
      .banner-close {
        background: rgba(0, 0, 0, 0.05);
        border: none;
        color: ${colors.textColor};
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s ease;
        opacity: 0.6;
      }
      
      .banner-close:hover {
        background: rgba(0, 0, 0, 0.1);
        opacity: 1;
        transform: scale(1.05);
      }
      
      /* Responsive design */
      @media (max-width: 768px) {
        .auctionet-quality-banner {
          margin: 0px 15px 15px 15px;
          border-radius: 10px;
        }
        
        .banner-content {
          padding: 16px 18px;
          gap: 12px;
        }
        
        .banner-icon {
          font-size: 18px;
          width: 20px;
          height: 20px;
        }
        
        .banner-text strong {
          font-size: 14px;
        }
        
        .banner-text small {
          font-size: 12px;
        }
        
        .banner-link {
          padding: 7px 14px;
          font-size: 12px;
          margin-top: 10px;
        }
        
        .banner-close {
          width: 26px;
          height: 26px;
          font-size: 13px;
        }
      }
    `;

    // Insert banner in the document flow after navigation
    document.head.appendChild(style);
    
    // Find the best insertion point - after navbar but before main content
    const insertionPoints = [
      '.navbar.navbar-fixed-top',
      '.navbar-fixed-top',
      '.navbar',
      '.container'
    ];
    
    let insertionTarget = null;
    for (const selector of insertionPoints) {
      const element = document.querySelector(selector);
      if (element) {
        insertionTarget = element;
        break;
      }
    }
    
    if (insertionTarget) {
      // Insert after the navigation element
      insertionTarget.parentNode.insertBefore(banner, insertionTarget.nextSibling);
    } else {
      // Fallback: insert at beginning of container
      const container = document.querySelector('.container');
      if (container) {
        container.insertBefore(banner, container.firstChild);
      } else {
        // Last resort: insert at beginning of body
        document.body.insertBefore(banner, document.body.firstChild);
      }
    }
    
  }

})(); 