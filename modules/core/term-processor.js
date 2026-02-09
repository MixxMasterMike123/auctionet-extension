// modules/core/term-processor.js - Smart Term Processing and Conflict Resolution
// Fixes the "Anna" vs "Anna Ehrner" issue

export class TermProcessor {
  constructor() {
  }

  // CRITICAL: Resolve conflicting terms like "Anna" vs "Anna Ehrner"
  resolveTermConflicts(terms) {
    
    if (!terms || terms.length === 0) return terms;

    // Group terms by potential conflicts
    const conflicts = new Map();
    const resolved = [];

    // Step 1: Identify potential conflicts
    terms.forEach(term => {
      const cleanTerm = term.term.toLowerCase().replace(/['"]/g, '').trim();
      
      if (!conflicts.has(cleanTerm)) {
        conflicts.set(cleanTerm, []);
      }
      conflicts.get(cleanTerm).push(term);
    });

    // Step 2: Resolve conflicts by priority
    conflicts.forEach((conflictingTerms, cleanTerm) => {
      if (conflictingTerms.length === 1) {
        // No conflict
        resolved.push(conflictingTerms[0]);
      } else {
        // Multiple terms conflict - resolve by priority
        conflictingTerms.forEach(t => console.log(`   - "${t.term}" (type: ${t.type}, priority: ${t.priority || 0}, source: ${t.source || 'unknown'})`));
        
        const bestTerm = this.selectBestTermFromConflicts(conflictingTerms);
        resolved.push(bestTerm);
        
      }
    });

    return resolved;
  }

  // Select the best term when multiple terms conflict
  selectBestTermFromConflicts(conflictingTerms) {

    // Priority rules (highest priority wins)
    const priorityRules = [
      // Rule 1: Prefer AI-detected quoted artist names (highest priority)
      term => term.source === 'ai_detected' && term.type === 'artist' && term.term.includes('"') ? 1000 : 0,
      
      // Rule 2: Prefer longer, more specific terms ("Anna Ehrner" > "Anna")
      term => term.term.length * 10,
      
      // Rule 3: Prefer artist/brand types over keywords
      term => term.type === 'artist' ? 500 : term.type === 'brand' ? 400 : term.type === 'keyword' ? 100 : 200,
      
      // Rule 4: Prefer terms that are already selected
      term => term.isSelected ? 300 : 0,
      
      // Rule 5: Prefer terms with explicit priority
      term => term.priority || 0,
      
      // Rule 6: Prefer terms from AI detection over extraction
      term => term.source === 'ai_detected' ? 200 : term.source === 'ai_rules' ? 150 : 50
    ];

    // Calculate total score for each term
    const scoredTerms = conflictingTerms.map(term => {
      const score = priorityRules.reduce((total, rule) => total + rule(term), 0);
      return { term, score };
    });

    // Sort by score (highest first) and return the best
    scoredTerms.sort((a, b) => b.score - a.score);
    const bestTerm = scoredTerms[0].term;
    
    return bestTerm;
  }

  // Enhanced smart suggestion selection with conflict resolution
  selectSmartSuggestions(terms, options = {}) {
    
    if (!terms || terms.length === 0) return [];

    // Step 1: Resolve conflicts first
    const conflictFreeTerms = this.resolveTermConflicts(terms);

    // Step 2: Filter out invalid terms
    const validTerms = conflictFreeTerms.filter(term => {
      if (!term || typeof term.term !== 'string' || term.term.trim() === '') {
        return false;
      }
      return true;
    });

    // Step 3: Split into selected and unselected
    const selectedTerms = validTerms.filter(term => term.isSelected);
    const unselectedTerms = validTerms.filter(term => !term.isSelected);


    // Step 4: Limit suggestions for UI
    const maxTotal = options.maxTotal || 12;
    const maxUnselected = Math.max(1, maxTotal - selectedTerms.length);

    // Sort unselected terms by score/priority
    const sortedUnselected = unselectedTerms
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, maxUnselected);

    // Combine selected (all) + top unselected
    const smartSuggestions = [...selectedTerms, ...sortedUnselected];

    smartSuggestions.forEach((term, index) => {
      const status = term.isSelected ? '✓' : '○';
    });

    return smartSuggestions;
  }

  // Detect term type with enhanced logic
  detectTermType(term) {
    if (!term || typeof term !== 'string') return 'keyword';
    
    const lowerTerm = term.toLowerCase().replace(/['"]/g, '');

    // Enhanced artist detection (names with multiple words)
    if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(term)) {
      return 'artist';
    }

    // Brand detection
    const brands = ['omega', 'rolex', 'patek', 'cartier', 'breitling', 'tag', 'heuer', 'atelje', 'lyktan'];
    if (brands.includes(lowerTerm)) {
      return 'brand';
    }

    // Object type detection
    const objectTypes = ['golvlampa', 'lampa', 'armbandsur', 'klocka', 'ur', 'tavla', 'målning', 'skulptur', 'vas'];
    if (objectTypes.includes(lowerTerm)) {
      return 'object_type';
    }

    // Period detection
    if (/^\d{4}$/.test(term) || /\d{4}[-\s]tal/.test(lowerTerm)) {
      return 'period';
    }

    // Material detection  
    const materials = ['guld', 'silver', 'stål', 'platina', 'metall', 'keramik', 'glas'];
    if (materials.includes(lowerTerm)) {
      return 'material';
    }

    // Default to keyword
    return 'keyword';
  }

  // Get description for term type
  getTermDescription(type) {
    const descriptions = {
      'artist': 'Konstnär/Skapare',
      'brand': 'Märke/Tillverkare',
      'object_type': 'Objekttyp',
      'period': 'Tidsperiod',
      'material': 'Material',
      'keyword': 'Nyckelord'
    };
    return descriptions[type] || 'Sökterm';
  }

  // Calculate priority for term type
  getTermPriority(term, type, isSelected = false, isCore = false) {
    let priority = 0;

    // Base priority by type
    const typePriorities = {
      'artist': 90,
      'brand': 85,
      'object_type': 80,
      'period': 70,
      'material': 65,
      'keyword': 50
    };
    
    priority += typePriorities[type] || 50;

    // Bonus for selection status
    if (isSelected) priority += 100;
    if (isCore) priority += 200;

    // Bonus for quoted artist names (precision terms)
    if (type === 'artist' && term.includes('"')) {
      priority += 150;
    }

    // Bonus for term length (more specific = higher priority)
    priority += Math.min(term.length, 20);

    return priority;
  }

  // Process raw candidate terms into structured format
  processCandidateTerms(candidateTerms, currentQuery = '') {
    
    if (!candidateTerms || !candidateTerms.candidates) {
      return [];
    }

    const processed = candidateTerms.candidates.map(candidate => {
      const term = candidate.term;
      const type = candidate.type || this.detectTermType(term);
      const isSelected = candidate.preSelected || false;
      const isCore = candidate.isCore || false;
      
      return {
        term: term,
        type: type,
        description: candidate.description || this.getTermDescription(type),
        priority: candidate.priority || this.getTermPriority(term, type, isSelected, isCore),
        isSelected: isSelected,
        isCore: isCore,
        score: candidate.score || (isSelected ? 100 : 50),
        source: candidate.source || 'candidate_processing',
        isPrecisionQuoted: term.includes('"')
      };
    });

    
    // Apply conflict resolution to processed terms
    const conflictResolved = this.resolveTermConflicts(processed);
    
    conflictResolved.forEach((term, index) => {
    });
    
    return conflictResolved;
  }

  // Debug term analysis
  debugTermAnalysis(terms) {
    
    const typeGroups = terms.reduce((groups, term) => {
      const type = term.type || 'unknown';
      groups[type] = (groups[type] || 0) + 1;
      return groups;
    }, {});
    
    
    const selectedCount = terms.filter(t => t.isSelected).length;
    
    const conflictGroups = this.findPotentialConflicts(terms);
    
    return {
      totalTerms: terms.length,
      typeDistribution: typeGroups,
      selectedCount: selectedCount,
      potentialConflicts: conflictGroups.size
    };
  }

  // Find potential conflicts for debugging
  findPotentialConflicts(terms) {
    const conflicts = new Map();
    
    terms.forEach(term => {
      const cleanTerm = term.term.toLowerCase().replace(/['"]/g, '').trim();
      
      if (!conflicts.has(cleanTerm)) {
        conflicts.set(cleanTerm, []);
      }
      conflicts.get(cleanTerm).push(term);
    });

    // Filter to only actual conflicts (multiple terms)
    const actualConflicts = new Map();
    conflicts.forEach((conflictingTerms, cleanTerm) => {
      if (conflictingTerms.length > 1) {
        actualConflicts.set(cleanTerm, conflictingTerms);
      }
    });

    return actualConflicts;
  }
} 