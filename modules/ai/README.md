# 🎯 AI Module - Master Plan & Architecture Guide

**CRITICAL: READ THIS FIRST** - This file contains the complete architecture plan, current status, and development guidelines. Always consult this before making changes to ensure consistency with the overall refactoring strategy.

## 🚨 CORE PROBLEM STATEMENT

The original codebase suffered from:
- **Massive files**: api-manager.js (94KB, 2050 lines), quality-analyzer.js (121KB, 3199 lines), add-items-tooltip-manager.js (159KB, 4442 lines)
- **Scattered AI logic**: Prompts and rules duplicated across multiple files
- **Conflicting behavior**: Different AI rules in different places
- **Unmaintainable**: "Way too many files" making development counterproductive

## 🎯 REFACTORING STRATEGY

### **Phase 1: Build New Architecture (CURRENT)**
✅ Create modular, reusable AI components  
✅ Establish single source of truth for AI behavior  
✅ Test each component thoroughly before integration  
✅ Keep existing code working during transition  

### **Phase 2: Integration (NEXT)**
🔄 Replace scattered logic with clean module calls  
🔄 Gradually migrate functionality from massive files  
🔄 Test each integration step thoroughly  

### **Phase 3: Cleanup (FUTURE)**
⏳ Remove deprecated code and massive files  
⏳ Optimize performance and memory usage  
⏳ Final testing and documentation  

## 📁 CURRENT ARCHITECTURE

### **✅ COMPLETED MODULES**

#### `/config` - Configuration Layer
- **`models.js`** - Centralized model definitions, field-specific rules, validation functions
  - Model configurations (Haiku, Sonnet, etc.)
  - Field-specific model selection rules
  - Parameter validation and defaults

#### `/core` - Core AI Engine
- **`model-manager.js`** - Intelligent model selection with caching and user preferences
  - Smart model selection based on field type and complexity
  - User preference management with fallbacks
  - Performance caching and validation
  
- **`response-parser.js`** - Unified response parsing and validation
  - Multi-format parsing (single fields, multi-fields, JSON)
  - Intelligent fallback handling
  - Response caching and validation
  
- **`prompt-manager.js`** - Orchestration and optimization
  - Intelligent prompt generation with caching
  - Model recommendations based on item characteristics
  - Complexity analysis and memory management

#### `/services` - Business Logic Services ✨ **NEW**
- **`field-enhancer.js`** - Complete field enhancement orchestration
  - Single and multi-field enhancement workflows
  - Intelligent caching and performance optimization
  - Coordinated enhancement with fallback handling
  - Integration with all core AI infrastructure

- **`artist-detector.js`** - Artist detection and verification service ✨ **NEW**
  - Multi-strategy artist detection (signature, text, style analysis)
  - Artist verification against databases and sources
  - Comprehensive analysis with confidence scoring
  - Intelligent recommendations (accept/review/investigate/no_attribution)
  - Dual caching system for detection and verification

- **`quality-analyzer.js`** - Quality analysis and scoring service ✨ **NEW**
  - Comprehensive quality analysis with multi-dimensional scoring
  - Focused condition assessment with detailed breakdown
  - Market value evaluation with confidence levels
  - Risk assessment and recommendations system
  - Specialized analysis strategies by item type (art, antiques, jewelry, furniture)
  - Triple-cache system (quality/condition/market)
  - Swedish quality standards integration

#### `/prompts` - Prompt System
- **`base-prompts.js`** - Core system prompts and anti-hallucination rules
  - Universal AI behavior rules
  - Brand correction and formatting rules
  - Date speculation prevention
  
- **`category-prompts.js`** - Category-specific rules (weapons, watches, jewelry, historical)
  - Specialized anti-hallucination rules for weapons
  - Watch-specific requirements and function clauses
  - Jewelry and historical item conservative handling
  
- **`field-prompts.js`** - Field-specific prompts for different AI tasks
  - Title, description, condition, keywords prompts
  - Multi-field orchestration
  - Title-correct minimal correction rules

### **🔄 PLANNED MODULES**

#### `/services` - Additional Business Logic Services
- **`search-optimizer.js`** - Search term generation and optimization
- **`category-classifier.js`** - Intelligent category classification

#### `/validation` - Validation Layer
- **`response-validator.js`** - Response validation and quality checks
- **`anti-hallucination.js`** - Hallucination detection and prevention
- **`field-validator.js`** - Field-specific validation rules

#### `/enhancement` - Enhancement Workflows
- **`title-enhancer.js`** - Title enhancement with conservative rules
- **`description-enhancer.js`** - Description enhancement with artist context
- **`condition-enhancer.js`** - Condition report standardization
- **`keyword-generator.js`** - Intelligent keyword generation

## 🎯 DEVELOPMENT GUIDELINES

### **ALWAYS FOLLOW THESE PRINCIPLES:**

1. **🔒 SAFETY FIRST**
   - Never modify existing working code during module creation
   - Create new modules in isolation
   - Test thoroughly before integration
   - Keep existing functionality working

2. **🧩 MODULAR DESIGN**
   - Each module has a single, clear responsibility
   - Modules are reusable across different contexts
   - Clean interfaces with minimal dependencies
   - Comprehensive error handling

3. **📝 CONSISTENT PATTERNS**
   - Use ES6 modules with named exports
   - Include comprehensive JSDoc documentation
   - Follow the established naming conventions
   - Add validation and error handling

4. **🧪 TEST-DRIVEN DEVELOPMENT**
   - Create test files for each new module
   - Test all functionality including edge cases
   - Remove test files after successful validation
   - Document test results in commit messages

5. **💾 INTELLIGENT CACHING**
   - Cache expensive operations (prompt generation, model selection)
   - Provide cache management methods (clear, stats)
   - Use appropriate cache keys and invalidation
   - Monitor memory usage

### **COMMIT MESSAGE FORMAT:**
```
✅ STEP X: [Module Name] - [Brief Description]
- NEW: [New files created]
- FEATURES: [Key features implemented]
- TESTED: [What was tested]
- SAFE: [Safety confirmation]
- BENEFITS: [Benefits achieved]
- NEXT: [Next step]
```

## 🔧 CURRENT STATUS

### **✅ FOUNDATION + SERVICES COMPLETE (Steps 1-8)**
- Model configuration and management ✅
- Response parsing and validation ✅  
- Prompt system and orchestration ✅
- Field enhancement service ✅
- Artist detection service ✅ **NEW**
- Quality analyzer service ✅ **NEW**
- All components tested and working ✅
- No existing code modified ✅

### **🎯 NEXT PRIORITIES**

**Option A: Continue Building Services**
- Create field enhancement services
- Build validation layer
- Add data processing utilities

**Option B: Start Integration**
- Begin connecting to api-manager.js
- Replace scattered prompt logic
- Test integration incrementally

**Option C: Target Specific Issues**
- Fix title-correct over-enhancement
- Resolve field parsing errors
- Optimize performance bottlenecks

## 🚀 INTEGRATION STRATEGY

When ready for integration:

1. **Identify Integration Points**
   - Map current api-manager.js methods to new modules
   - Identify dependencies and call patterns
   - Plan gradual replacement strategy

2. **Create Adapter Layer**
   - Build compatibility layer for existing code
   - Ensure backward compatibility during transition
   - Provide migration path for each component

3. **Incremental Migration**
   - Replace one component at a time
   - Test each replacement thoroughly
   - Keep rollback options available

## 📊 SUCCESS METRICS

- **File Size Reduction**: api-manager.js from 94KB to ~30KB target
- **Code Duplication**: Eliminate duplicate AI logic across files
- **Maintainability**: Single source of truth for AI behavior
- **Performance**: Intelligent caching and model selection
- **Reliability**: Comprehensive validation and error handling

## 🔄 KEEP THIS UPDATED

**IMPORTANT**: Update this file whenever:
- New modules are created or completed
- Architecture decisions are made
- Integration steps are completed
- Problems are identified or solved
- Development priorities change

This file serves as the single source of truth for the entire refactoring effort and should always reflect the current state and future plans. 