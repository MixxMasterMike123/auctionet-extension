# AI Rules Engine - 100% Reusable Component

## Overview

The AI Rules Engine is a completely refactored, modular component that handles all AI-powered search term extraction and rule application for the Auctionet extension. It replaces the original `ai-search-rules.js` with a clean, maintainable, and highly reusable architecture.

## Key Features

- **100% Reusable**: Can be used across different parts of the application
- **AI-Powered**: Intelligent term extraction using Claude API
- **Rule-Based Fallback**: Reliable fallback when AI is unavailable
- **Caching**: Performance optimization with intelligent caching
- **Swedish Market Expertise**: Specialized for Swedish auction market
- **Statistics Tracking**: Built-in usage analytics
- **Backward Compatible**: Drop-in replacement for existing code

## Architecture

```
modules/refactored/ai-rules/
├── ai-rules-engine.js      # Core engine implementation
├── ai-rules-wrapper.js     # Compatibility wrapper
└── README.md              # This documentation
```

## Usage

### Basic Usage (Recommended)

```javascript
import { applySearchRules } from './modules/refactored/ai-rules/ai-rules-wrapper.js';

// Same interface as before - no code changes needed!
const inputData = {
  title: "Niels Thorsson Royal Copenhagen fat",
  description: "Beautiful ceramic dish",
  artist: "Niels Thorsson",
  aiArtist: "",
  excludeArtist: null
};

const result = await applySearchRules(inputData);
console.log(result.searchTerms); // ["Niels Thorsson", "Royal Copenhagen", "fat"]
```

### Advanced Usage

```javascript
import { AIRulesEngine } from './modules/refactored/ai-rules/ai-rules-engine.js';

// Create dedicated engine instance
const engine = new AIRulesEngine(apiManager);

// Apply rules with options
const result = await engine.applyRules(inputData, {
  skipCache: false,
  maxTerms: 5
});

// Get statistics
const stats = engine.getStatistics();
console.log(`Cache hit rate: ${stats.cacheHitRate * 100}%`);
```

## API Reference

### AIRulesEngine Class

#### Constructor
```javascript
new AIRulesEngine(apiManager = null)
```

#### Main Methods

**`applyRules(inputData, options = {})`**
- Main method for term extraction
- Returns: `Promise<Object>` with extracted terms and metadata

**`getStatistics()`**
- Returns usage statistics
- Returns: `Object` with cache hits, AI calls, etc.

**`updateRules(ruleCategory, updates)`**
- Update rule configuration
- Parameters: `ruleCategory` (string), `updates` (object)

**`getRules()`**
- Get current rule configuration
- Returns: `Object` with all rules

**`clearCache()`**
- Clear the internal cache

### Wrapper Functions (Backward Compatibility)

**`applySearchRules(inputData)`**
- Original function interface
- Returns: `Promise<Object>` with search terms

**`updateRule(ruleCategory, updates)`**
- Original function interface

**`getCurrentRules()`**
- Original function interface
- Returns: `Object` with current rules

**`AI_SEARCH_RULES`**
- Original constant, now dynamically generated

## Input Data Format

```javascript
const inputData = {
  title: "Item title",           // Required
  description: "Description",    // Optional
  artist: "Artist name",         // Optional - highest priority
  aiArtist: "AI detected",       // Optional
  excludeArtist: "Ignore this"   // Optional - artist to exclude
};
```

## Output Format

```javascript
{
  success: true,
  searchTerms: ["term1", "term2"],      // Pre-selected terms for search
  preSelectedTerms: ["term1", "term2"], // Same as searchTerms
  candidateTerms: ["term3", "term4"],   // Additional candidate terms
  allTerms: ["term1", "term2", "term3", "term4"], // All terms
  query: "term1 term2",                 // Space-joined query
  reasoning: "Applied rules: ...",      // Explanation
  confidence: 0.85,                     // Confidence score (0-1)
  source: "ai_with_rules",              // Source of extraction
  appliedRules: ["artist_field", "brand"], // Rules that were applied
  totalTerms: 4,                        // Total number of terms
  metadata: {                           // Additional metadata
    processingTime: 150,
    cacheKey: "...",
    timestamp: "2024-01-01T12:00:00Z",
    rulesVersion: "2.0.0"
  }
}
```

## Rule System

### Rule Priority (High to Low)

1. **Artist Field** (Priority 100) - Always include if filled
2. **Brand Recognition** (Priority 90) - Known luxury brands
3. **Object Type** (Priority 80) - Specific object types
4. **Model Numbers** (Priority 75) - Model/pattern identifiers
5. **Materials** (Priority 50) - Luxury materials prioritized

### Known Brands

- **Furniture**: Dux, Källemo, Lammhults, Svenskt Tenn
- **Ceramics**: Royal Copenhagen, Arabia, Rörstrand, Gustavsberg
- **Watches**: Omega, Rolex, Breitling, TAG Heuer
- **Electronics**: Yamaha, Roland, Korg, Moog
- **Glass**: Orrefors, Kosta Boda, Målerås

### Object Types

- **Furniture**: bord, stol, fåtölj, soffa, skåp, lampa
- **Watches**: armbandsur, fickur, klocka
- **Ceramics**: fat, skål, vas, tallrik, kopp
- **Electronics**: synthesizer, piano, flygel
- **Art**: skulptur, målning, lithografi, etsning

## Performance Features

### Caching
- 30-minute cache expiry
- Automatic cache key generation
- Cache statistics tracking

### Statistics Tracking
```javascript
const stats = engine.getStatistics();
// {
//   rulesApplied: 150,
//   aiCallsMade: 45,
//   cacheHits: 105,
//   cacheMisses: 45,
//   fallbacksUsed: 2,
//   cacheSize: 50,
//   cacheHitRate: 0.7
// }
```

## Migration Guide

### From Original ai-search-rules.js

**No changes needed!** The wrapper provides 100% backward compatibility:

```javascript
// Old code - still works!
import { applySearchRules, AI_SEARCH_RULES } from './modules/ai-search-rules.js';

// New code - same interface!
import { applySearchRules, AI_SEARCH_RULES } from './modules/refactored/ai-rules/ai-rules-wrapper.js';
```

### Updating Import Paths

1. **Simple replacement**:
   ```javascript
   // Change this:
   import { applySearchRules } from './modules/ai-search-rules.js';
   
   // To this:
   import { applySearchRules } from './modules/refactored/ai-rules/ai-rules-wrapper.js';
   ```

2. **For new features**:
   ```javascript
   import { AIRulesEngine, getAIRulesStatistics } from './modules/refactored/ai-rules/ai-rules-wrapper.js';
   ```

## Error Handling

The engine includes multiple fallback layers:

1. **AI Failure**: Falls back to rule-based extraction
2. **Rule Failure**: Falls back to basic term splitting
3. **Complete Failure**: Returns minimal viable result

All errors are logged but don't break the application.

## Testing

The engine is designed to be easily testable:

```javascript
// Create test instance
const engine = new AIRulesEngine(mockApiManager);

// Test with mock data
const result = await engine.applyRules({
  title: "Test item",
  artist: "Test Artist"
});

// Verify results
assert(result.success);
assert(result.searchTerms.includes("Test Artist"));
```

## Future Enhancements

- Rule configuration UI
- Machine learning rule optimization
- A/B testing framework
- Real-time rule adjustment
- Performance monitoring dashboard

## Support

For questions or issues with the AI Rules Engine:

1. Check the console for detailed logging
2. Use `getStatistics()` to diagnose performance issues
3. Enable debug mode for detailed tracing
4. Review the fallback chain for error handling 