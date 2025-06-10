// modules/core/title-cleanup-utility.js - Dedicated Title Cleanup Utility
// Handles comprehensive cleanup of titles after artist names are moved to artist field

export class TitleCleanupUtility {
  constructor() {
    // Common Swedish auction object types for fallback detection
    this.objectTypes = [
      'SKULPTUR', 'TAVLA', 'LITOGRAFI', 'ARMBANDSUR', 'VAS', 'TALLRIK', 
      'BAJONETT', 'MÅLNING', 'TECKNING', 'GRAFIK', 'KERAMIK', 'GLAS', 'SILVER',
      'RING', 'HALSBAND', 'ARMBAND', 'ÖRHÄNGEN', 'BROSCH', 'KLOCKA',
      'MATTA', 'KUDDE', 'TEXTIL', 'BOK', 'KARTA', 'HANDSKRIFT',
      'MÖBEL', 'STOL', 'BORD', 'SKÅP', 'SPEGEL', 'LAMPA'
    ];
    
    // Patterns for extracting object types from mixed content
    this.objectTypePatterns = [
      /^([A-ZÅÄÖÜ]+)(?:\s|,)/,  // First word in caps
      /\b([A-ZÅÄÖÜ]{3,})\b/,    // Any caps word 3+ chars
    ];
  }

  /**
   * Main cleanup function - removes artist from title and cleans up leftover punctuation
   * @param {string} originalTitle - The original title containing the artist
   * @param {string} artistName - The artist name to remove
   * @param {Object} options - Optional configuration
   * @returns {string} - Cleaned title without artist
   */
  cleanTitleAfterArtistRemoval(originalTitle, artistName, options = {}) {
    if (!originalTitle || typeof originalTitle !== 'string') {
      console.warn('⚠️ TitleCleanupUtility: Invalid original title provided');
      return originalTitle || '';
    }
    
    if (!artistName || typeof artistName !== 'string' || artistName.trim().length === 0) {
      console.warn('⚠️ TitleCleanupUtility: Invalid artist name provided');
      return originalTitle;
    }
    
    const cleanArtistName = artistName.trim();
    console.log('🧹 TitleCleanupUtility: Starting cleanup');
    console.log(`📝 Original title: "${originalTitle}"`);
    console.log(`👤 Artist to remove: "${cleanArtistName}"`);
    
    try {
      // Step 1: Remove artist using comprehensive patterns
      let cleanedTitle = this.removeArtistFromTitle(originalTitle, cleanArtistName);
      
      // Step 2: Clean up leftover punctuation and spacing
      cleanedTitle = this.cleanupLeftoverPunctuation(cleanedTitle);
      
      // Step 3: Handle edge cases and provide fallbacks
      cleanedTitle = this.handleEdgeCases(cleanedTitle, originalTitle, options);
      
      // Step 4: Apply Swedish auction formatting standards
      cleanedTitle = this.applyFormattingStandards(cleanedTitle);
      
      console.log(`✅ TitleCleanupUtility: Cleanup complete: "${cleanedTitle}"`);
      return cleanedTitle;
      
    } catch (error) {
      console.error('❌ TitleCleanupUtility: Error during cleanup:', error);
      return originalTitle; // Return original on error
    }
  }

  /**
   * Remove artist name from title using multiple patterns
   */
  removeArtistFromTitle(title, artistName) {
    // Create regex-safe artist name (escape special characters)
    const escapedArtist = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const artistPattern = escapedArtist.replace(/\s+/g, '\\s+');
    
    let result = title;
    
    // Pattern 1: Artist at beginning with punctuation
    result = result.replace(new RegExp(`^${artistPattern}[.,\\-:;]?\\s*`, 'i'), '');
    
    // Pattern 2: Artist at beginning without punctuation
    result = result.replace(new RegExp(`^${artistPattern}\\s+`, 'i'), '');
    
    // Pattern 3: Artist anywhere in title (exact match)
    result = result.replace(new RegExp(`\\b${artistPattern}\\b`, 'i'), '');
    
    // Pattern 4: Artist with comma separation
    result = result.replace(new RegExp(`,\\s*${artistPattern}\\s*,?`, 'i'), ',');
    
    // Pattern 5: Artist at end with preceding punctuation
    result = result.replace(new RegExp(`[.,\\-:;]\\s*${artistPattern}\\s*$`, 'i'), '');
    
    console.log(`🔄 After artist removal: "${result}"`);
    return result;
  }

  /**
   * Clean up leftover punctuation and spacing issues
   */
  cleanupLeftoverPunctuation(title) {
    let result = title;
    
    // Remove leading punctuation and spaces
    result = result.replace(/^[.,\-:;\s]+/, '');
    
    // Remove trailing punctuation clusters (but preserve single periods)
    result = result.replace(/[.,\-:;]{2,}\s*$/, '');
    
    // Fix multiple consecutive commas
    result = result.replace(/,{2,}/g, ',');
    
    // Fix comma + period combinations  
    result = result.replace(/,\s*\./g, '.');
    
    // Fix comma + dash combinations
    result = result.replace(/,\s*-\s*/g, ', ');
    
    // Fix period + comma combinations
    result = result.replace(/\.\s*,/g, ',');
    
    // Clean up multiple spaces
    result = result.replace(/\s{2,}/g, ' ');
    
    // Remove orphaned punctuation (punctuation not followed by content)
    result = result.replace(/^[.,\-:;]\s*$/, '');
    
    // Clean up spaces around remaining punctuation
    result = result.replace(/\s+([.,\-:;])/g, '$1');
    result = result.replace(/([.,\-:;])\s+/g, '$1 ');
    
    // Final trim
    result = result.trim();
    
    console.log(`🔧 After punctuation cleanup: "${result}"`);
    return result;
  }

  /**
   * Handle edge cases and provide intelligent fallbacks
   */
  handleEdgeCases(cleanedTitle, originalTitle, options) {
    // Case 1: Title became empty or too short
    if (!cleanedTitle || cleanedTitle.length < 2) {
      console.log('🔄 Title too short, extracting object type...');
      const extractedType = this.extractObjectType(originalTitle);
      return extractedType || (options.defaultObjectType || 'Objekt');
    }
    
    // Case 2: Title is only punctuation
    if (/^[.,\-:;\s]+$/.test(cleanedTitle)) {
      console.log('🔄 Title only punctuation, extracting object type...');
      const extractedType = this.extractObjectType(originalTitle);
      return extractedType || (options.defaultObjectType || 'Objekt');
    }
    
    // Case 3: Title starts with lowercase after cleanup (fix capitalization)
    if (cleanedTitle.length > 0 && cleanedTitle[0] === cleanedTitle[0].toLowerCase()) {
      console.log('🔄 Fixing capitalization...');
      cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
    }
    
    // Case 4: Title has lost meaningful content (only articles/prepositions left)
    const meaningfulWords = cleanedTitle.split(/\s+/).filter(word => 
      word.length > 2 && 
      !['och', 'på', 'i', 'av', 'med', 'för', 'som', 'till', 'från'].includes(word.toLowerCase())
    );
    
    if (meaningfulWords.length === 0) {
      console.log('🔄 No meaningful words left, extracting object type...');
      const extractedType = this.extractObjectType(originalTitle);
      return extractedType || (options.defaultObjectType || 'Objekt');
    }
    
    return cleanedTitle;
  }

  /**
   * Extract object type from original title for fallback purposes
   */
  extractObjectType(title) {
    if (!title) return null;
    
    const upperTitle = title.toUpperCase();
    
    // Check for exact matches of known object types
    for (const type of this.objectTypes) {
      if (upperTitle.includes(type)) {
        // Return with proper capitalization (first letter caps, rest lowercase)
        return type.charAt(0) + type.slice(1).toLowerCase();
      }
    }
    
    // Try pattern matching for object types
    for (const pattern of this.objectTypePatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const candidate = match[1];
        if (candidate.length >= 3 && candidate.length <= 15) {
          return candidate.charAt(0) + candidate.slice(1).toLowerCase();
        }
      }
    }
    
    console.log('🔍 Could not extract object type from title');
    return null;
  }

  /**
   * Apply Swedish auction formatting standards
   */
  applyFormattingStandards(title) {
    if (!title) return title;
    
    let result = title;
    
    // Ensure proper spacing after commas
    result = result.replace(/,(?!\s)/g, ', ');
    
    // Ensure proper spacing around quotes
    result = result.replace(/"\s*([^"]+)\s*"/g, '"$1"');
    
    // Capitalize words after commas (Swedish auction standard)
    result = result.replace(/(,\s*)([a-zåäöü])/g, (match, comma, letter) => {
      return comma + letter.toUpperCase();
    });
    
    // Preserve uncertainty markers in exact case
    const uncertaintyMarkers = ['troligen', 'tillskriven', 'efter', 'stil av', 'möjligen', 'typ'];
    uncertaintyMarkers.forEach(marker => {
      const regex = new RegExp(`\\b${marker}\\b`, 'gi');
      result = result.replace(regex, marker);
    });
    
    console.log(`🎨 After formatting standards: "${result}"`);
    return result;
  }

  /**
   * Validate that a title meets minimum quality standards
   */
  validateCleanedTitle(title, originalTitle) {
    const validation = {
      isValid: true,
      warnings: [],
      suggestions: []
    };
    
    if (!title || title.length < 3) {
      validation.isValid = false;
      validation.warnings.push('Title too short after cleanup');
    }
    
    if (title === originalTitle) {
      validation.warnings.push('No changes made to title');
    }
    
    if (/^[^a-zåäöüA-ZÅÄÖÜ]*$/.test(title)) {
      validation.isValid = false;
      validation.warnings.push('Title contains no alphabetic characters');
    }
    
    const meaningfulWordCount = title.split(/\s+/).filter(word => 
      word.length > 2 && !/^[.,\-:;]+$/.test(word)
    ).length;
    
    if (meaningfulWordCount < 1) {
      validation.isValid = false;
      validation.warnings.push('No meaningful words in cleaned title');
    }
    
    return validation;
  }

  /**
   * Utility method for testing the cleanup function
   */
  static runTests() {
    const utility = new TitleCleanupUtility();
    
    const testCases = [
      {
        description: 'Basic artist at beginning with comma',
        original: 'LISA LARSON, Skulptur, brons',
        artist: 'LISA LARSON',
        expected: 'Skulptur, brons'
      },
      {
        description: 'Artist at beginning with period',
        original: 'LISA LARSON. Skulptur, brons',
        artist: 'LISA LARSON', 
        expected: 'Skulptur, brons'
      },
      {
        description: 'Artist at end',
        original: 'Skulptur, brons, LISA LARSON',
        artist: 'LISA LARSON',
        expected: 'Skulptur, brons'
      },
      {
        description: 'Double comma leftover',
        original: 'LISA LARSON,, Skulptur',
        artist: 'LISA LARSON',
        expected: 'Skulptur'
      },
      {
        description: 'Mixed punctuation leftover',
        original: 'LISA LARSON,. - Skulptur',
        artist: 'LISA LARSON',
        expected: 'Skulptur'
      },
      {
        description: 'Only artist name',
        original: 'LISA LARSON',
        artist: 'LISA LARSON',
        expected: 'Objekt' // Should fallback
      },
      {
        description: 'Artist in middle',
        original: 'Skulptur, LISA LARSON, brons',
        artist: 'LISA LARSON',
        expected: 'Skulptur, brons'
      },
      {
        description: 'Complex title with quotes',
        original: 'ROLEX, Submariner, "Date", LISA LARSON, stål',
        artist: 'LISA LARSON',
        expected: 'ROLEX, Submariner, "Date", stål'
      }
    ];
    
    console.log('🧪 Running TitleCleanupUtility tests...');
    
    testCases.forEach((test, index) => {
      const result = utility.cleanTitleAfterArtistRemoval(test.original, test.artist);
      const passed = result === test.expected;
      
      console.log(`Test ${index + 1}: ${test.description}`);
      console.log(`  Input: "${test.original}" (remove: "${test.artist}")`);
      console.log(`  Expected: "${test.expected}"`);
      console.log(`  Got: "${result}"`);
      console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}`);
      console.log('');
    });
  }
}

// Export convenience function for direct use
export function cleanTitleAfterArtistRemoval(originalTitle, artistName, options = {}) {
  const utility = new TitleCleanupUtility();
  return utility.cleanTitleAfterArtistRemoval(originalTitle, artistName, options);
}

// Export for testing
export function runTitleCleanupTests() {
  TitleCleanupUtility.runTests();
} 