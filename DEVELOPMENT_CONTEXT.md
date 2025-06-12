# 🎯 DEVELOPMENT CONTEXT - Quick Reference

**READ THIS FIRST** - Essential context for all development work on the Auctionet Extension.

> 🤖 **For AI Assistants**: Read `AI_INSTRUCTIONS.md` first to maintain focus and avoid stray expeditions!

## 🚨 PROJECT OVERVIEW

**Extension**: Auctionet Chrome Extension for auction cataloging  
**Main Problem**: Massive, unmaintainable files with scattered AI logic  
**Solution**: Modular architecture with reusable AI components  
**Status**: Phase 1 (Building new architecture) - Foundation + Services layer complete  

## 📊 CURRENT STATE

### **✅ COMPLETED (Steps 1-9)**
- **Model Management**: `modules/ai/config/models.js` + `modules/ai/core/model-manager.js`
- **Response Parsing**: `modules/ai/core/response-parser.js` 
- **Prompt System**: `modules/ai/prompts/` (base, category, field prompts)
- **Orchestration**: `modules/ai/core/prompt-manager.js`
- **Field Enhancement Service**: `modules/ai/services/field-enhancer.js`
- **Artist Detection Service**: `modules/ai/services/artist-detector.js` ✨ **NEW**
- **Quality Analyzer Service**: `modules/ai/services/quality-analyzer.js` ✨ **NEW**
- **Category Classifier Service**: `modules/ai/services/category-classifier.js` ✨ **NEW**
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

---

**For full details**: See `modules/ai/README.md` (Master Plan)  
**For architecture**: See completed modules in `modules/ai/`  
**For integration**: Wait for Phase 2 or discuss next priorities 