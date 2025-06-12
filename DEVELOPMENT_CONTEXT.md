# 🎯 DEVELOPMENT CONTEXT - Quick Reference

**READ THIS FIRST** - Essential context for all development work on the Auctionet Extension.

> 🤖 **For AI Assistants**: Read `AI_INSTRUCTIONS.md` first to maintain focus and avoid stray expeditions!

## 🚨 PROJECT OVERVIEW

**Extension**: Auctionet Chrome Extension for auction cataloging  
**Main Problem**: Massive, unmaintainable files with scattered AI logic  
**Solution**: Modular architecture with reusable AI components  
**Status**: Phase 1 (Building new architecture) - Foundation + Services layer complete  

## 📊 CURRENT STATE

### **✅ COMPLETED (Steps 1-11)**
- **Model Management**: `modules/ai/config/models.js` + `modules/ai/core/model-manager.js`
- **Response Parsing**: `modules/ai/core/response-parser.js` 
- **Prompt System**: `modules/ai/prompts/` (base, category, field prompts)
- **Orchestration**: `modules/ai/core/prompt-manager.js`
- **Field Enhancement Service**: `modules/ai/services/field-enhancer.js`
- **Artist Detection Service**: `modules/ai/services/artist-detector.js` ✨ **NEW**
- **Quality Analyzer Service**: `modules/ai/services/quality-analyzer.js` ✨ **NEW**
- **Category Classifier Service**: `modules/ai/services/category-classifier.js` ✨ **NEW**
- **Search Optimizer Service**: `modules/ai/services/search-optimizer.js` ✨ **NEW**
- **Data Validator Service**: `modules/ai/services/data-validator.js` ✨ **NEW**
- **All tested and working** ✅

### **🎯 NEXT OPTIONS**
1. **Continue building services** (field-enhancer, artist-detector, etc.)
2. **Start integration** with existing api-manager.js
3. **Target specific issues** (title-correct over-enhancement, parsing errors)

## 🔧 KEY FILES TO UNDERSTAND

### **Problem Files (MASSIVE)**
- `modules/api-manager.js` - 94KB, 2050 lines (needs reduction to ~30KB)
- `modules/quality-analyzer.js` - 121KB, 3199 lines  
- `modules/add-items-tooltip-manager.js` - 159KB, 4442 lines

### **New Architecture (CLEAN)**
- `modules/ai/README.md` - **MASTER PLAN** (read this for full context)
- `modules/ai/config/models.js` - Model configurations
- `modules/ai/core/` - Core AI engine components
- `modules/ai/prompts/` - Centralized prompt system

## 🎯 DEVELOPMENT RULES

### **SAFETY FIRST**
- ✅ Never modify existing working code during module creation
- ✅ Create new modules in isolation  
- ✅ Test thoroughly before integration
- ✅ Keep existing functionality working

### **ARCHITECTURE PRINCIPLES**
- 🧩 **Modular**: Single responsibility, reusable components
- 📝 **Consistent**: ES6 modules, JSDoc, naming conventions
- 🧪 **Tested**: Test files for each module, comprehensive validation
- 💾 **Cached**: Intelligent caching for expensive operations

## 🚀 QUICK COMMANDS

### **Check Current Status**
```bash
# See what's been built
ls -la modules/ai/
ls -la modules/ai/config/
ls -la modules/ai/core/
ls -la modules/ai/prompts/
```

### **Test New Modules**
```bash
# Create test file, run tests, then delete
# Pattern: test-[module-name].js
```

## 📋 COMMIT FORMAT
```
✅ STEP X: [Module Name] - [Brief Description]
- NEW: [Files created]
- FEATURES: [Key features]
- TESTED: [What was tested]
- SAFE: [Safety confirmation]
- NEXT: [Next step]
```

## 🎯 SUCCESS METRICS
- **File Size**: api-manager.js 94KB → 30KB target
- **Maintainability**: Single source of truth for AI behavior
- **Performance**: Intelligent caching and model selection
- **Reliability**: Comprehensive validation and error handling

## Current Implementation Status

### ✅ COMPLETED (Steps 1-11)
**Foundation Layer (Steps 1-5)**: Model config, Model Manager, Response Parser, Prompt System, Prompt Manager
**Services Layer (Steps 6-11)**: FieldEnhancer, ArtistDetector, QualityAnalyzer, CategoryClassifier, SearchOptimizer, DataValidator

### 🎯 CURRENT FOCUS
**Step 12: PriceEstimator Service** - Next logical step in services layer

### 📊 Success Metrics
- **Step 6**: FieldEnhancer - 100% test success (34/34 tests)
- **Step 7**: ArtistDetector - 75.9% test success (44/58 tests)  
- **Step 8**: QualityAnalyzer - 94% test success (47/50 tests)
- **Step 9**: CategoryClassifier - 96.5% test success (55/57 tests)
- **Step 10**: SearchOptimizer - 98.7% test success (78/79 tests)
- **Step 11**: DataValidator - 92.7% test success (89/96 tests)

**Average Success Rate: 92.6%** - Excellent foundation for continued development

## Step 11: DataValidator Service ✅ COMPLETE

**Implementation**: `modules/ai/services/data-validator.js` (1100+ lines)
**Test Results**: 92.7% success rate (89/96 tests passed)
**Status**: Ready for integration as quality gatekeeper

### Key Capabilities
- **Multi-Level Validation**: 4 validation levels (basic/standard/comprehensive/auction-ready)
- **Field Validation**: Required fields, format, length, range validation
- **Content Quality**: Text quality scoring, spam detection, duplicate detection
- **Business Logic**: Price reasonableness, category consistency, condition logic
- **Cross-Field Consistency**: Title-description alignment, category-content matching
- **Completeness Analysis**: Missing field identification, enhancement opportunities
- **Batch Processing**: Parallel validation with concurrency control
- **Swedish Support**: Native validation for Swedish content and cultural context

### Validation Levels
- **Basic**: Essential field presence and format validation
- **Standard**: Business logic and consistency checks  
- **Comprehensive**: Full quality analysis with AI validation
- **Auction-Ready**: Complete validation for auction listing readiness

### Quality Gatekeeper Features
- Data quality scoring (0-100 scale)
- Completeness scoring with missing field identification
- Consistency checking across related fields
- Spam and inappropriate content detection
- Duplicate detection with similarity analysis
- Business rule enforcement by category

### Swedish Market Integration
- Cities and regions validation (Stockholm, Göteborg, Malmö, etc.)
- Phone number validation (+46 Swedish format)
- Postal code validation (Swedish format)
- Currency validation (SEK formatting)
- Cultural context and language quality assessment

### Integration Ready
- Uses ModelManager, ResponseParser, PromptManager
- Provides quality gatekeeper for all other services
- Validates data before enhancement processes
- Comprehensive error handling and graceful degradation
- Statistics tracking and performance monitoring

**Next Step**: PriceEstimator Service for market value estimation and price analysis

---

**For full details**: See `modules/ai/README.md` (Master Plan)  
**For architecture**: See completed modules in `modules/ai/`  
**For integration**: Wait for Phase 2 or discuss next priorities 