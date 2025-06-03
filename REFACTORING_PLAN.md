# 🔧 CRITICAL REFACTORING PLAN - Dashboard Manager Decomposition

## **🚨 URGENT: Pill Deselection Bug**

**Current Issue**: `dashboard-manager.js` is 3,146 lines and impossible to debug. User cannot deselect artist pills, and conflicting "Anna" terms are being generated.

**Root Causes**:
1. **Monolithic file** - too big to debug effectively
2. **Multiple "Anna" sources** - AI detects both product name "Anna" and artist "Anna Ehrner"  
3. **Complex HTML generation** spread across multiple methods
4. **SSoT synchronization** buried in massive methods

## **📋 IMMEDIATE REFACTORING STEPS**

### **Step 1: Extract HTML Generation** 
**New file**: `modules/ui/pill-generator.js`
- `generateHeaderPills()`
- `generateCompactPills()`
- `generateExpandedPills()`
- `escapeHTMLAttribute()`

### **Step 2: Extract Checkbox Logic**
**New file**: `modules/ui/checkbox-manager.js`  
- `handleCheckboxChange()`
- `syncCheckboxesWithSSoT()`
- `shouldCheckboxBeSelected()`

### **Step 3: Extract Term Processing**
**New file**: `modules/core/term-processor.js`
- `selectSmartSuggestions()`
- `filterConflictingTerms()` ← **NEW: Fix "Anna" vs "Anna Ehrner" conflict**
- `detectTermType()`

### **Step 4: Extract SSoT Integration**
**New file**: `modules/core/ssot-manager.js`
- `syncWithSSoT()`
- `updateUserSelections()`
- `preserveAIArtists()`

## **🎯 IMMEDIATE FIX STRATEGY**

Instead of continuing to debug the monolithic file, let's:

1. **Extract the pill generation** to a focused module
2. **Add conflict resolution** for multiple "Anna" terms
3. **Simplify the checkbox sync logic**
4. **Make the code debuggable**

## **Expected Outcome**
- ✅ User can deselect artist pills
- ✅ No conflicting "Anna" terms
- ✅ Code is modular and debuggable
- ✅ Future bugs are easier to fix

---

**Next**: Extract `modules/ui/pill-generator.js` first to isolate the HTML generation issues. 