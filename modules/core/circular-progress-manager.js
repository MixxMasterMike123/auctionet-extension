import { escapeHTML } from './html-escape.js';

export class CircularProgressManager {
  constructor() {
    this.tooltips = new Map(); // Store tooltip references for cleanup
    this.isInitialLoad = true; // Track if this is the first time loading circles
  }

  /**
   * Create circular quality indicators with tooltips and animations
   * @param {HTMLElement} container - Container element to append circles to
   * @param {number} overallScore - Overall quality score (0-100)
   * @param {Array} warnings - Array of warning objects
   * @param {boolean} shouldAnimate - Whether to animate from 0% to final scores
   */
  createQualityCircles(container, overallScore, warnings, shouldAnimate = false) {
    
    // Find or create the metrics container
    let metricsContainer = container.querySelector('.quality-metrics');
    
    if (!metricsContainer) {
      const qualityHeader = container.querySelector('.quality-header');
      metricsContainer = document.createElement('div');
      metricsContainer.className = 'quality-metrics';
      
      if (qualityHeader) {
        // Insert right after the existing header
        qualityHeader.insertAdjacentElement('afterend', metricsContainer);
      } else {
        // Fallback: insert at the beginning
        container.insertBefore(metricsContainer, container.firstChild);
      }
    }
    
    // Remove ONLY the "Analyserar..." box and reload icon
    const elementsToRemove = container.querySelectorAll('*');
    elementsToRemove.forEach(el => {
      // Remove reload icons
      if (el.innerHTML && el.innerHTML.includes('🔄') || 
          el.classList && el.classList.contains('reload') ||
          el.style && el.style.cursor === 'pointer' && el.textContent && el.textContent.includes('🔄')) {
        el.remove();
        return;
      }
      
      // Remove only "Analyserar..." text (exact match, not the header)
      if (el.textContent && el.textContent.trim() === 'Analyserar...' && 
          !el.closest('.quality-header')) {
        el.remove();
        return;
      }
    });

    // Calculate all metrics
    const completeness = this.calculateCompleteness(warnings);
    const accuracy = this.calculateAccuracy(warnings);


    // Generate tooltip content
    const tooltipData = [
      this.generateOverallTooltip(overallScore, warnings),
      this.generateCompletenessTooltip(completeness, warnings),
      this.generateAccuracyTooltip(accuracy, warnings)
    ];

    // Create the HTML structure
    this.createCircleHTML(metricsContainer, overallScore, completeness, accuracy);

    // Setup tooltips
    this.setupTooltips(metricsContainer, tooltipData);

    // Smart animation: animate only when explicitly requested and safe
    if (shouldAnimate && !this.isInitialLoad) {
      this.animateCircles(metricsContainer, [
        { score: overallScore, index: 0 },
        { score: completeness, index: 1 },
        { score: accuracy, index: 2 }
      ]);
    } else {
      setTimeout(() => {
        this.setFinalScores(metricsContainer, overallScore, completeness, accuracy);
      }, 100);
    }
    
    // NEW: Ensure "Förbättra alla" button is present
    this.ensureImproveAllButton(container);
    
    // Mark that initial load is complete
    this.isInitialLoad = false;
  }

  /**
   * Ensure the "Förbättra alla" button is present in the quality indicator
   * This preserves the existing functionality after circular progress is added
   */
  ensureImproveAllButton(container) {
    // Check if button already exists
    const existingButton = container.querySelector('.ai-master-button');
    
    if (!existingButton) {
      
      // Create the button with the same structure as the original system
      const button = document.createElement('button');
      button.className = 'ai-assist-button ai-master-button';
      button.type = 'button';
      button.textContent = '⚡ Förbättra alla';
      
      // Find the quality-header and append the button there (not to main container)
      const qualityHeader = container.querySelector('.quality-header');
      if (qualityHeader) {
        qualityHeader.appendChild(button);
      } else {
        // Fallback: append to main container if no quality-header found
        container.appendChild(button);
      }
      
      // CRITICAL: Attach event listener to the newly created button
      this.attachButtonEventListener(button);
      
    }
  }

  /**
   * Attach event listener to the master button
   * This ensures the button works even when created dynamically
   */
  attachButtonEventListener(button) {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Use the global assistant methods to trigger improvement
      if (window.assistant && typeof window.assistant.improveAllFields === 'function') {
        window.assistant.improveAllFields();
      } else if (window.auctionetAssistant && typeof window.auctionetAssistant.improveAllFields === 'function') {
        window.auctionetAssistant.improveAllFields();
      } else if (window.addItemsManager && typeof window.addItemsManager.improveAllFields === 'function') {
        window.addItemsManager.improveAllFields();
      } else {
        // Fallback: dispatch custom event
        document.dispatchEvent(new CustomEvent('ai-improve-all-requested', {
          detail: { source: 'circular-progress-manager' }
        }));
      }
    });
  }

  /**
   * Create the HTML structure for circular progress indicators
   */
  createCircleHTML(container, overallScore, completeness, accuracy) {
    const fullCircumference = this.getCircumference(30);
    
    container.innerHTML = `
      <div class="quality-circle">
        <div class="quality-circle-label">Totalt</div>
        <div class="circular-progress">
          <svg>
            <circle class="bg-circle" cx="35" cy="35" r="30"></circle>
            <circle class="progress-circle ${escapeHTML(this.getScoreClass(overallScore))}" 
                    cx="35" cy="35" r="30"
                    stroke-dasharray="${fullCircumference}"
                    stroke-dashoffset="${fullCircumference}"
                    data-final-score="${escapeHTML(String(overallScore))}"></circle>
          </svg>
          <div class="score-text">0%</div>
        </div>
      </div>
      
      <div class="quality-circle">
        <div class="quality-circle-label">Komplett</div>
        <div class="circular-progress">
          <svg>
            <circle class="bg-circle" cx="35" cy="35" r="30"></circle>
            <circle class="progress-circle ${escapeHTML(this.getScoreClass(completeness))}" 
                    cx="35" cy="35" r="30"
                    stroke-dasharray="${fullCircumference}"
                    stroke-dashoffset="${fullCircumference}"
                    data-final-score="${escapeHTML(String(completeness))}"></circle>
          </svg>
          <div class="score-text">0%</div>
        </div>
      </div>
      
      <div class="quality-circle">
        <div class="quality-circle-label">Noggrannhet</div>
        <div class="circular-progress">
          <svg>
            <circle class="bg-circle" cx="35" cy="35" r="30"></circle>
            <circle class="progress-circle ${escapeHTML(this.getScoreClass(accuracy))}" 
                    cx="35" cy="35" r="30"
                    stroke-dasharray="${fullCircumference}"
                    stroke-dashoffset="${fullCircumference}"
                    data-final-score="${escapeHTML(String(accuracy))}"></circle>
          </svg>
          <div class="score-text">0%</div>
        </div>
      </div>
    `;
  }

  /**
   * Setup tooltip functionality for all circles
   */
  setupTooltips(container, tooltipData) {
    const circles = container.querySelectorAll('.quality-circle');
    
    // Clean up existing tooltips
    this.cleanupTooltips();
    
    circles.forEach((circle, index) => {
      const tooltip = document.createElement('div');
      tooltip.className = 'quality-tooltip';
      tooltip.textContent = tooltipData[index];
      document.body.appendChild(tooltip);
      
      // Store tooltip reference
      this.tooltips.set(circle, tooltip);
      
      const showTooltip = (e) => {
        const rect = circle.getBoundingClientRect();
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const scrollX = window.scrollX || document.documentElement.scrollLeft;
        
        // Position tooltip arrow at top center of circle, tooltip grows upwards
        const tooltipLeft = rect.left + scrollX + (rect.width / 2);
        const tooltipTop = rect.top + scrollY - 15; // More space above circle
        
        tooltip.style.left = `${tooltipLeft}px`;
        tooltip.style.top = `${tooltipTop}px`;
        tooltip.style.transform = 'translate(-50%, -100%)'; // Center horizontally and position above
        tooltip.classList.add('visible');
      };
      
      const hideTooltip = () => {
        tooltip.classList.remove('visible');
      };
      
      circle.addEventListener('mouseenter', showTooltip);
      circle.addEventListener('mouseleave', hideTooltip);
      
      // Store event handlers for cleanup
      circle._showTooltip = showTooltip;
      circle._hideTooltip = hideTooltip;
    });
  }

  /**
   * Animate circles with staggered timing
   */
  animateCircles(container, progressData) {
    setTimeout(() => {
      progressData.forEach((data, i) => {
        setTimeout(() => {
          this.animateCircleToScore(container, i, data.score);
        }, i * 200); // Stagger animations by 200ms
      });
    }, 300); // Wait 300ms before starting animations
  }

  /**
   * Set final scores immediately without animation
   */
  setFinalScores(container, overallScore, completeness, accuracy) {
    
    const circles = container.querySelectorAll('.progress-circle');
    const scoreTexts = container.querySelectorAll('.score-text');
    const scores = [overallScore, completeness, accuracy];
    
    circles.forEach((circle, index) => {
      const finalOffset = this.getDashOffset(30, scores[index]);
      circle.style.strokeDashoffset = finalOffset;
      
      if (scoreTexts[index]) {
        scoreTexts[index].textContent = `${scores[index]}%`;
      }
    });
  }

  /**
   * Animate a single circle to its final score
   */
  animateCircleToScore(container, circleIndex, finalScore) {
    
    const circles = container.querySelectorAll('.progress-circle');
    const scoreTexts = container.querySelectorAll('.score-text');
    
    if (circles[circleIndex] && scoreTexts[circleIndex]) {
      const circle = circles[circleIndex];
      const scoreText = scoreTexts[circleIndex];
      
      // Set up transition
      circle.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
      
      // Animate to final position
      const finalOffset = this.getDashOffset(30, finalScore);
      circle.style.strokeDashoffset = finalOffset;
      
      // Animate score text
      this.animateScoreText(scoreText, 0, finalScore, 1500);
    }
  }

  /**
   * Animate score text counting from start to end
   */
  animateScoreText(element, startScore, endScore, duration) {
    const startTime = performance.now();
    
    const updateScore = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use easing function for smooth animation
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentScore = Math.round(startScore + (endScore - startScore) * easeProgress);
      
      element.textContent = `${currentScore}%`;
      
      if (progress < 1) {
        requestAnimationFrame(updateScore);
      }
    };
    
    requestAnimationFrame(updateScore);
  }

  /**
   * Generate tooltip content for overall score
   */
  generateOverallTooltip(score, warnings) {
    if (score >= 95) {
      return "🎉 Utmärkt kvalitet! Katalogiseringen är nästan perfekt.";
    } else if (score >= 80) {
      return "✨ Bra kvalitet! Några små förbättringar kan göra den perfekt.";
    } else if (score >= 60) {
      return "📝 Genomsnittlig kvalitet. Fyll i saknade fält och kontrollera format för högre betyg.";
    } else {
      return "⚠️ Låg kvalitet. Behöver mer information och formatkorrigeringar för att nå 100%.";
    }
  }

  /**
   * Generate tooltip content for completeness score
   */
  generateCompletenessTooltip(completeness, warnings) {
    if (completeness === 0) {
      return "📝 Alla fält är tomma. Fyll i titel, beskrivning, kondition och sökord.";
    }

    const missingFields = warnings.filter(w => 
      w.issue && (w.issue.includes('saknas') || w.issue.includes('tom') || w.issue.includes('behövs'))
    );
    
    if (completeness >= 95) {
      return "✅ Alla viktiga fält är ifyllda! Katalogiseringen är komplett.";
    } else if (missingFields.length > 0) {
      const suggestions = missingFields.slice(0, 3).map(w => `• ${w.field}: ${w.issue}`).join('\n');
      return `📋 För att nå 100% komplett:\n${suggestions}${missingFields.length > 3 ? '\n• Och fler...' : ''}`;
    } else {
      return "📝 Lägg till mer detaljerad information i beskrivning och fält för att nå 100%.";
    }
  }

  /**
   * Generate tooltip content for accuracy score
   */
  generateAccuracyTooltip(accuracy, warnings) {
    if (accuracy === 0) {
      return "📝 Lägg till information i fälten för att kunna mäta noggrannhet.";
    }

    const formatIssues = warnings.filter(w => 
      w.issue && (w.issue.includes('format') || w.issue.includes('struktur') || w.issue.includes('konstnär'))
    );
    
    if (accuracy >= 95) {
      return "🎯 All information är korrekt formaterad! Perfekt noggrannhet.";
    } else if (formatIssues.length > 0) {
      const suggestions = formatIssues.slice(0, 3).map(w => `• ${w.field}: ${w.issue}`).join('\n');
      return `🔧 För att nå 100% noggrannhet:\n${suggestions}${formatIssues.length > 3 ? '\n• Och fler...' : ''}`;
    } else {
      return "🔍 Kontrollera formatering och struktur på all information för högre noggrannhet.";
    }
  }

  /**
   * Calculate completeness score based on actual field content.
   * Each major field contributes a portion of the total score.
   */
  calculateCompleteness(warnings) {
    // Read actual field content from DOM
    const title = (document.querySelector('#item_title_sv')?.value || '').trim();
    const description = (document.querySelector('#item_description_sv')?.value || '').replace(/<[^>]*>/g, '').trim();
    const condition = (document.querySelector('#item_condition_sv')?.value || '').replace(/<[^>]*>/g, '').trim();
    const keywords = (document.querySelector('#item_hidden_keywords')?.value || '').trim();

    // Check if "Inga anmärkningar" is checked (condition not required)
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') ||
      document.querySelector('input[type="checkbox"]#item_no_remarks') ||
      document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    let completeness = 0;

    // Title: 30 points (most important for search/discovery)
    if (title.length >= 20) {
      completeness += 30;
    } else if (title.length >= 10) {
      completeness += 20;
    } else if (title.length > 0) {
      completeness += 10;
    }

    // Description: 30 points
    if (description.length >= 50) {
      completeness += 30;
    } else if (description.length >= 20) {
      completeness += 20;
    } else if (description.length > 0) {
      completeness += 10;
    }

    // Condition: 20 points
    if (noRemarksChecked) {
      completeness += 20; // Checked "no remarks" counts as complete
    } else if (condition.length >= 25) {
      completeness += 20;
    } else if (condition.length >= 10) {
      completeness += 12;
    } else if (condition.length > 0) {
      completeness += 5;
    }

    // Keywords: 20 points
    const keywordCount = keywords ? keywords.split(/[,\s]+/).filter(k => k.trim().length > 0).length : 0;
    if (keywordCount >= 5) {
      completeness += 20;
    } else if (keywordCount >= 2) {
      completeness += 14;
    } else if (keywordCount >= 1) {
      completeness += 8;
    }

    return Math.max(0, Math.min(100, completeness));
  }

  /**
   * Calculate accuracy score based on formatting/rule warnings.
   * If no content exists, accuracy is 0 (nothing to measure).
   * If content exists, start at 100 and deduct for rule violations.
   */
  calculateAccuracy(warnings) {
    // Read actual field content to determine if there's anything to measure
    const title = (document.querySelector('#item_title_sv')?.value || '').trim();
    const description = (document.querySelector('#item_description_sv')?.value || '').replace(/<[^>]*>/g, '').trim();
    const condition = (document.querySelector('#item_condition_sv')?.value || '').replace(/<[^>]*>/g, '').trim();

    const totalContentLength = title.length + description.length + condition.length;

    // No content = nothing to be accurate about
    if (totalContentLength === 0) {
      return 0;
    }

    let accuracy = 100;

    // Deduct for each warning based on severity
    // High severity = format/content rule violations
    // Medium = structural issues
    // Low = minor suggestions (smaller deduction)
    warnings.forEach(w => {
      if (!w.issue) return;

      // Skip purely informational/positive warnings
      if (w.issue.startsWith('✓')) return;

      if (w.severity === 'high') {
        accuracy -= 12;
      } else if (w.severity === 'medium') {
        accuracy -= 6;
      } else {
        accuracy -= 2;
      }
    });

    return Math.max(0, Math.min(100, accuracy));
  }

  /**
   * Get CSS class for score color coding
   */
  getScoreClass(score) {
    if (score >= 80) return 'good';
    if (score >= 60) return 'medium';
    return 'poor';
  }

  /**
   * Calculate circle circumference
   */
  getCircumference(radius) {
    return 2 * Math.PI * radius;
  }

  /**
   * Calculate dash offset for progress
   */
  getDashOffset(radius, percentage) {
    const circumference = this.getCircumference(radius);
    return circumference - (percentage / 100) * circumference;
  }

  /**
   * Cleanup tooltips and event listeners
   */
  cleanupTooltips() {
    this.tooltips.forEach((tooltip, circle) => {
      // Remove event listeners
      if (circle._showTooltip) {
        circle.removeEventListener('mouseenter', circle._showTooltip);
      }
      if (circle._hideTooltip) {
        circle.removeEventListener('mouseleave', circle._hideTooltip);
      }
      
      // Remove tooltip from DOM
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    });
    
    this.tooltips.clear();
  }

  /**
   * Destroy the component and cleanup resources
   */
  destroy() {
    this.cleanupTooltips();
  }
} 