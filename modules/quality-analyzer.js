// modules/quality-analyzer.js - Quality Analysis Module
export class QualityAnalyzer {
  constructor() {
    this.dataExtractor = null;
  }

  setDataExtractor(extractor) {
    this.dataExtractor = extractor;
  }

  // Helper method to check for measurements in Swedish format
  hasMeasurements(text) {
    const measurementPatterns = [
      /\d+\s*×\s*\d+\s*×?\s*\d*\s*cm/i,                    // 122 × 45 × 135 cm
      /\d+\s*x\s*\d+\s*x?\s*\d*\s*cm/i,                     // 122 x 45 x 135 cm  
      /(längd|l\.?)\s*\d+\s*cm/i,                           // längd 122 cm
      /(bredd|bred|djup|d\.?)\s*\d+\s*cm/i,                 // djup 45 cm
      /(höjd|h\.?)\s*\d+\s*cm/i,                            // höjd 135 cm
      /mått:.*\d+.*cm/i,                                    // Mått: ... cm
      /\d+\s*cm.*\d+\s*cm/i                                 // Any two measurements with cm
    ];
    
    return measurementPatterns.some(pattern => text.match(pattern));
  }

  analyzeQuality() {
    if (!this.dataExtractor) {
      console.error('Data extractor not set');
      return;
    }

    const data = this.dataExtractor.extractItemData();
    const warnings = [];
    let score = 100;
    
    // Check if "Inga anmärkningar" (No remarks) is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    // Title quality checks
    if (data.title.length < 20) {
      warnings.push({ field: 'Titel', issue: 'För kort - lägg till material och period', severity: 'high' });
      score -= 20;
    }
    if (!data.title.includes(',')) {
      warnings.push({ field: 'Titel', issue: 'Saknar korrekt struktur (KONSTNÄR, Objekt, Material)', severity: 'medium' });
      score -= 15;
    }

    // Description quality checks
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    if (descLength < 50) {
      warnings.push({ field: 'Beskrivning', issue: 'För kort - lägg till detaljer om material, teknik, märkningar', severity: 'high' });
      score -= 25;
    }
    if (!this.hasMeasurements(data.description)) {
      warnings.push({ field: 'Beskrivning', issue: 'Saknar fullständiga mått', severity: 'high' });
      score -= 20;
    }

    // Condition quality checks (skip if "Inga anmärkningar" is checked)
    if (!noRemarksChecked) {
      const condLength = data.condition.replace(/<[^>]*>/g, '').length;
      if (condLength < 20) {
        warnings.push({ field: 'Kondition', issue: 'För vag - specificera typ av slitage och skador', severity: 'high' });
        score -= 20;
      }
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
        warnings.push({ field: 'Kondition', issue: 'Endast "bruksslitage" är otillräckligt - specificera typ av slitage (repor, nagg, fläckar, etc.)', severity: 'high' });
        score -= 25;
      }
      
      // Check for other vague condition terms
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase => 
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      
      if (hasVaguePhrase) {
        warnings.push({ field: 'Kondition', issue: 'Vag konditionsbeskrivning - beskriv specifika skador och var de finns', severity: 'medium' });
        score -= 15;
      }
    } else {
      warnings.push({ field: 'Kondition', issue: '✓ "Inga anmärkningar" markerat - ingen konditionsrapport behövs', severity: 'low' });
    }

    // Keywords quality checks
    const keywordsLength = data.keywords.length;
    const keywordCount = data.keywords ? 
      (data.keywords.includes(',') ? 
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;
    
    if (keywordsLength === 0) {
      warnings.push({ field: 'Sökord', issue: 'Inga dolda sökord - kritiskt för sökbarhet', severity: 'high' });
      score -= 30;
    } else if (keywordCount < 3) {
      warnings.push({ field: 'Sökord', issue: 'För få sökord - lägg till fler relevanta termer', severity: 'high' });
      score -= 20;
    } else if (keywordCount < 6) {
      warnings.push({ field: 'Sökord', issue: 'Bra start - några fler sökord kan förbättra sökbarheten', severity: 'medium' });
      score -= 10;
    } else if (keywordCount > 15) {
      warnings.push({ field: 'Sökord', issue: 'För många sökord kan skada sökbarheten - fokusera på kvalitet över kvantitet', severity: 'medium' });
      score -= 15;
    }
    
    // Check for keyword quality - simplified approach
    if (data.keywords) {
      const keywords = data.keywords.toLowerCase();
      const titleDesc = (data.title + ' ' + data.description + ' ' + data.condition).toLowerCase();
      
      const keywordArray = data.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      const uniqueKeywords = keywordArray.filter(keyword => 
        !titleDesc.includes(keyword.toLowerCase()) || keyword.length <= 3
      );
      
      const uniquePercentage = uniqueKeywords.length / keywordArray.length;
      
      if (uniquePercentage < 0.4) {
        warnings.push({ field: 'Sökord', issue: 'Tips: Många sökord upprepar titel/beskrivning - kompletterande termer kan förbättra sökbarheten', severity: 'low' });
      }
    }

    this.updateQualityIndicator(score, warnings);
  }

  updateQualityIndicator(score, warnings) {
    const scoreElement = document.querySelector('.quality-score');
    const warningsElement = document.querySelector('.quality-warnings');
    
    if (scoreElement) {
      // Add smooth transition effect for score changes
      const currentScore = parseInt(scoreElement.textContent.split('/')[0]) || 0;
      const newScore = score;
      
      if (currentScore !== newScore) {
        scoreElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
          scoreElement.style.transform = 'scale(1)';
        }, 200);
      }
      
      scoreElement.textContent = `${score}/100`;
      scoreElement.className = `quality-score ${score >= 80 ? 'good' : score >= 60 ? 'medium' : 'poor'}`;
    }
    
    if (warningsElement) {
      if (warnings.length > 0) {
        warningsElement.innerHTML = '<ul>' + 
          warnings.map(w => `<li class="warning-${w.severity}"><strong>${w.field}:</strong> ${w.issue}</li>`).join('') +
          '</ul>';
      } else {
        warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
      }
    }
  }

  setupLiveQualityUpdates() {
    console.log('🚀 Setting up live quality monitoring...');
    
    // Debounce function to prevent too frequent updates
    let updateTimeout;
    const debouncedUpdate = (event) => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        console.log('⚡ Live quality update triggered by:', event?.target?.id || event?.target?.tagName || 'unknown field');
        this.analyzeQuality();
      }, 800); // Wait 800ms after user stops typing
    };

    // Use the exact same selectors as extractItemData()
    const fieldsToMonitor = [
      '#item_title_sv',
      '#item_description_sv', 
      '#item_condition_sv',
      '#item_hidden_keywords',
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];

    let monitoredCount = 0;
    fieldsToMonitor.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`✅ Setting up live monitoring for: ${selector}`);
        monitoredCount++;
        
        // Add event listeners for different input types
        if (element.type === 'checkbox') {
          element.addEventListener('change', debouncedUpdate);
          console.log(`✅ Added 'change' listener to checkbox: ${selector}`);
        } else {
          element.addEventListener('input', debouncedUpdate);
          element.addEventListener('paste', debouncedUpdate);
          element.addEventListener('keyup', debouncedUpdate);
          console.log(`✅ Added 'input', 'paste', 'keyup' listeners to: ${selector}`);
        }
        
        // Test immediate trigger
        element.addEventListener('focus', () => {
          console.log(`🎯 Field focused: ${selector}`);
        });
      } else {
        console.warn(`❌ Field not found for live monitoring: ${selector}`);
      }
    });

    // Also monitor for changes in rich text editors (if any)
    const richTextEditors = document.querySelectorAll('[contenteditable="true"]');
    richTextEditors.forEach(editor => {
      console.log('✅ Setting up live monitoring for rich text editor');
      editor.addEventListener('input', debouncedUpdate);
      editor.addEventListener('paste', debouncedUpdate);
      monitoredCount++;
    });

    console.log(`🎯 Live quality monitoring set up for ${monitoredCount} fields`);
    
    // Test if fields exist right now
    console.log('🔍 Field existence check:');
    console.log('Title field:', document.querySelector('#item_title_sv'));
    console.log('Description field:', document.querySelector('#item_description_sv'));
    console.log('Condition field:', document.querySelector('#item_condition_sv'));
    console.log('Keywords field:', document.querySelector('#item_hidden_keywords'));
  }

  assessDataQuality(data, fieldType) {
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const titleLength = data.title.length;
    
    // Check if "Inga anmärkningar" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    
    const qualityScore = this.calculateCurrentQualityScore(data);
    
    const issues = [];
    let needsMoreInfo = false;
    
    // Critical quality thresholds
    if (qualityScore < 30) {
      needsMoreInfo = true;
      issues.push('critical_quality');
    }
    
    // Field-specific quality checks
    switch(fieldType) {
      case 'title':
        if (!data.description.match(/\d{4}|\d{2,4}-tal|1[6-9]\d{2}|20[0-2]\d/i) && !data.artist && descLength < 30) {
          issues.push('period');
          needsMoreInfo = true;
        }
        if (titleLength < 15 && descLength < 25) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        if (data.artist && data.artist.length > 0 && descLength < 20) {
          issues.push('artist_verification');
          needsMoreInfo = true;
        }
        break;
        
      case 'description':
        if (descLength < 25) {
          issues.push('material', 'technique', 'period', 'measurements');
          needsMoreInfo = true;
        }
        if (!this.hasMeasurements(data.description) && descLength < 40) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        break;
        
      case 'condition':
        if (!noRemarksChecked) {
          if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
            issues.push('specific_damage', 'wear_details', 'bruksslitage_vague');
            needsMoreInfo = true;
          }
          if (condLength < 15) {
            issues.push('condition_details');
            needsMoreInfo = true;
          }
          
          const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage'];
          const conditionText = data.condition.toLowerCase();
          const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
          
          if (hasVaguePhrase && condLength < 40) {
            issues.push('vague_condition_terms');
            needsMoreInfo = true;
          }
        }
        break;
        
      case 'keywords':
        if (qualityScore < 20) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        break;
        
      case 'all':
        if (qualityScore < 40) {
          needsMoreInfo = true;
          issues.push('critical_quality');
        }
        if (descLength < 30) {
          issues.push('material', 'technique', 'period');
          needsMoreInfo = true;
        }
        if (!this.hasMeasurements(data.description) && descLength < 50) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        if (!noRemarksChecked && data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
          issues.push('specific_damage');
          needsMoreInfo = true;
        }
        break;
    }
    
    return { needsMoreInfo, missingInfo: issues, qualityScore };
  }

  calculateCurrentQualityScore(data) {
    let score = 100;
    
    // Check if "Inga anmärkningar" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const keywordsLength = data.keywords.length;
    
    if (data.title.length < 20) score -= 20;
    if (descLength < 50) score -= 25;
    
    if (!noRemarksChecked) {
      if (condLength < 20) score -= 20;
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) score -= 25;
      
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase => 
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      
      if (hasVaguePhrase) score -= 15;
    }
    
    if (keywordsLength === 0) score -= 30;
    if (!this.hasMeasurements(data.description)) score -= 20;
    
    return Math.max(0, score);
  }
} 