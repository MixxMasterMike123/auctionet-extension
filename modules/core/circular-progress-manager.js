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
    console.log('🎯 CircularProgressManager: Creating quality circles', {
      overallScore,
      warningsCount: warnings.length,
      shouldAnimate,
      containerExists: !!container
    });
    
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

    console.log('📊 CircularProgressManager: Calculated scores', {
      overallScore,
      completeness,
      accuracy
    });

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
      console.log('🎬 CircularProgressManager: Starting animations (safe mode)');
      this.animateCircles(metricsContainer, [
        { score: overallScore, index: 0 },
        { score: completeness, index: 1 },
        { score: accuracy, index: 2 }
      ]);
    } else {
      console.log('⚡ CircularProgressManager: Setting scores immediately', {
        shouldAnimate,
        isInitialLoad: this.isInitialLoad,
        reason: shouldAnimate ? 'initial load' : 'animation disabled'
      });
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
      console.log('✅ Adding missing "Förbättra alla" button');
      
      // Create the button with the same structure as the original system
      const button = document.createElement('button');
      button.className = 'ai-assist-button ai-master-button';
      button.type = 'button';
      button.textContent = '⚡ Förbättra alla';
      
      // Append at the end of the container
      container.appendChild(button);
      
      console.log('✅ "Förbättra alla" button added to quality indicator');
    } else {
      console.log('✅ "Förbättra alla" button already exists');
    }
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
            <circle class="progress-circle ${this.getScoreClass(overallScore)}" 
                    cx="35" cy="35" r="30"
                    stroke-dasharray="${fullCircumference}"
                    stroke-dashoffset="${fullCircumference}"
                    data-final-score="${overallScore}"></circle>
          </svg>
          <div class="score-text">0%</div>
        </div>
      </div>
      
      <div class="quality-circle">
        <div class="quality-circle-label">Komplett</div>
        <div class="circular-progress">
          <svg>
            <circle class="bg-circle" cx="35" cy="35" r="30"></circle>
            <circle class="progress-circle ${this.getScoreClass(completeness)}" 
                    cx="35" cy="35" r="30"
                    stroke-dasharray="${fullCircumference}"
                    stroke-dashoffset="${fullCircumference}"
                    data-final-score="${completeness}"></circle>
          </svg>
          <div class="score-text">0%</div>
        </div>
      </div>
      
      <div class="quality-circle">
        <div class="quality-circle-label">Noggrannhet</div>
        <div class="circular-progress">
          <svg>
            <circle class="bg-circle" cx="35" cy="35" r="30"></circle>
            <circle class="progress-circle ${this.getScoreClass(accuracy)}" 
                    cx="35" cy="35" r="30"
                    stroke-dasharray="${fullCircumference}"
                    stroke-dashoffset="${fullCircumference}"
                    data-final-score="${accuracy}"></circle>
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
    console.log('⚡ Setting final scores immediately:', { overallScore, completeness, accuracy });
    
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
    console.log(`🎯 Animating circle ${circleIndex} to ${finalScore}%`);
    
    const circles = container.querySelectorAll('.progress-circle');
    const scoreTexts = container.querySelectorAll('.score-text');
    
    if (circles[circleIndex] && scoreTexts[circleIndex]) {
      const circle = circles[circleIndex];
      const scoreText = scoreTexts[circleIndex];
      
      console.log(`✅ Found circle and text elements for index ${circleIndex}`);
      
      // Set up transition
      circle.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
      
      // Animate to final position
      const finalOffset = this.getDashOffset(30, finalScore);
      console.log(`📐 Setting stroke-dashoffset from ${circle.style.strokeDashoffset} to ${finalOffset}`);
      circle.style.strokeDashoffset = finalOffset;
      
      // Animate score text
      this.animateScoreText(scoreText, 0, finalScore, 1500);
    } else {
      console.warn(`❌ Could not find circle or text elements for index ${circleIndex}`);
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
   * Calculate completeness score based on warnings
   */
  calculateCompleteness(warnings) {
    let completeness = 100;
    
    console.log('🔍 Calculating completeness from warnings:', warnings.length);
    
    warnings.forEach((warning, index) => {
      const deduction = warning.severity === 'high' ? 15 : 
                       warning.severity === 'medium' ? 8 : 3;
      completeness -= deduction;
      
      console.log(`   ${index + 1}. ${warning.field}: "${warning.issue}" (${warning.severity}) → -${deduction}%`);
    });
    
    const finalScore = Math.max(0, completeness);
    console.log(`📊 Final completeness score: ${finalScore}%`);
    
    return finalScore;
  }

  /**
   * Calculate accuracy score based on warnings
   */
  calculateAccuracy(warnings) {
    let accuracy = 100;
    
    const accuracyIssues = warnings.filter(w => 
      w.issue?.includes('struktur') || 
      w.issue?.includes('terminologi') ||
      w.issue?.includes('konstnär') ||
      w.issue?.includes('märke')
    );
    
    accuracyIssues.forEach(warning => {
      if (warning.severity === 'high') {
        accuracy -= 20;
      } else if (warning.severity === 'medium') {
        accuracy -= 10;
      } else {
        accuracy -= 5;
      }
    });
    
    return Math.max(0, accuracy);
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