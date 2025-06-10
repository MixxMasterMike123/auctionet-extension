# 🏗️ Architecture Refactoring Plan: Quality Analyzer & Page-Based System

## 🎯 **Objective**
Refactor monolithic `quality-analyzer.js` (3037 lines) into maintainable SSoT components that can be shared across multiple page contexts.

## 📱 **Page-Based Architecture Overview**

```
pages/
├── edit-page-orchestrator.js      (EditPage - main editing interface)
├── add-item-page-orchestrator.js  (Add Item - item creation)
└── items-page-orchestrator.js     (Items List - preview/management)

core/
├── artist-detection-engine.js     (SSoT for artist detection)
├── ai-enhancement-engine.js       (SSoT for AI field enhancement)
├── quality-metrics-engine.js      (SSoT for quality analysis)
├── popup-system-manager.js        (SSoT for all popups/tooltips)
└── market-analysis-engine.js      (SSoT for market data)

shared/
├── field-coordinator.js           (DOM field management)
├── warning-display-system.js      (Warning rendering)
└── user-interaction-handler.js    (Click handlers, events)
```

---

## 🔍 **Phase 1: Quality Analyzer Decomposition**

### **Current Monolith Analysis (3037 lines):**
```javascript
// RESPONSIBILITIES TO EXTRACT:
✅ Artist Detection (lines 412-748)     → ArtistDetectionEngine
✅ Biography Management (lines 944-1050) → BiographyTooltipManager  
✅ Quality Scoring (lines 2734-2787)    → QualityMetricsEngine
✅ Warning Display (lines 2364-2425)    → WarningDisplaySystem
✅ Market Analysis (lines 2831-2871)    → MarketAnalysisEngine
✅ DOM Field Updates (lines 1591-1797)  → FieldCoordinator
✅ Brand Validation (lines 1051-1166)   → BrandValidationEngine
✅ User Interactions (lines 945-1050)   → UserInteractionHandler
```

### **Step 1.1: Extract Core Engines**
```bash
# Create SSoT core components
modules/core/
├── artist-detection-engine.js
├── biography-tooltip-manager.js  
├── quality-metrics-engine.js
├── market-analysis-engine.js
└── brand-validation-engine.js
```

### **Step 1.2: Extract Shared Systems**
```bash
# Create shared utilities
modules/shared/
├── warning-display-system.js
├── field-coordinator.js
├── user-interaction-handler.js
└── popup-system-manager.js
```

### **Step 1.3: Create Quality Analyzer Orchestrator**
```bash
# Slim orchestrator (target: ~200 lines)
modules/quality-analyzer.js  # New streamlined version
```

---

## 🎭 **Phase 2: Page-Based Orchestrators**

### **Page 1: Edit Page Orchestrator**
```javascript
// pages/edit-page-orchestrator.js
import { ArtistDetectionEngine } from '../core/artist-detection-engine.js';
import { QualityMetricsEngine } from '../core/quality-metrics-engine.js';
import { BiographyTooltipManager } from '../core/biography-tooltip-manager.js';

export class EditPageOrchestrator {
  constructor() {
    this.artistDetection = new ArtistDetectionEngine();
    this.qualityMetrics = new QualityMetricsEngine();
    this.biographyManager = new BiographyTooltipManager();
    // ... other core components
  }
  
  async initialize() {
    // Wire up Edit page specific behavior
    // Enable all enhancement features
    // Set up quality scoring
    // Configure market analysis
  }
}
```

### **Page 2: Add Item Page Orchestrator**
```javascript
// pages/add-item-page-orchestrator.js
export class AddItemPageOrchestrator {
  constructor() {
    // Same core components but different configuration
    this.artistDetection = new ArtistDetectionEngine();
    this.qualityMetrics = new QualityMetricsEngine();
    // Maybe disable some features, enable others
  }
  
  async initialize() {
    // Add Item page specific behavior
    // Focus on real-time suggestions
    // Enable guided input
  }
}
```

### **Page 3: Items Page Orchestrator**
```javascript
// pages/items-page-orchestrator.js
export class ItemsPageOrchestrator {
  constructor() {
    // Minimal components for preview/list functionality
    this.qualityMetrics = new QualityMetricsEngine();
    // Maybe just quality indicators, no full editing
  }
  
  async initialize() {
    // Items list specific behavior
    // Quick quality indicators
    // Preview functionality
  }
}
```

---

## 🔧 **Phase 3: SSoT Core Components**

### **3.1: Artist Detection Engine (SSoT)**
```javascript
// core/artist-detection-engine.js
export class ArtistDetectionEngine {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.cache = new Map();
  }
  
  async detectArtist(title, artistField, options = {}) {
    // Core artist detection logic
    // Used by ALL pages
  }
  
  async verifyArtist(artistName) {
    // Haiku model verification
    // Biography generation
  }
}
```

### **3.2: Biography Tooltip Manager (SSoT)**
```javascript
// core/biography-tooltip-manager.js
export class BiographyTooltipManager {
  constructor() {
    this.activeTooltips = new Map();
  }
  
  createBiographyTooltip(element, biography, artistName) {
    // Create clickable biography snippets
    // Handle full biography popups
    // Manage tooltip lifecycle
  }
  
  showFullBiography(biography, artistName) {
    // Modal/alert with full Haiku-generated biography
    // Proper attribution
  }
}
```

### **3.3: Quality Metrics Engine (SSoT)**
```javascript
// core/quality-metrics-engine.js
export class QualityMetricsEngine {
  calculateScore(data, options = {}) {
    // Quality scoring logic
    // Same algorithm across all pages
  }
  
  generateWarnings(data, score) {
    // Warning generation
    // Consistent rules everywhere
  }
}
```

### **3.4: AI Enhancement Engine (SSoT)**
```javascript
// core/ai-enhancement-engine.js
export class AIEnhancementEngine {
  constructor(apiManager) {
    this.apiManager = apiManager;
  }
  
  async enhanceField(fieldType, data) {
    // AI enhancement for any field
    // Used across all pages
  }
}
```

### **3.5: Popup System Manager (SSoT)**
```javascript
// shared/popup-system-manager.js
export class PopupSystemManager {
  createSuggestionPopup(suggestions, element) {
    // Standardized popup creation
    // Consistent styling and behavior
  }
  
  createGuidePopup(content, position) {
    // Help/guide popups
    // Same across all pages
  }
}
```

---

## 🎯 **Phase 4: Dependency Injection System**

### **4.1: Core Container**
```javascript
// core/dependency-container.js
export class DependencyContainer {
  constructor() {
    this.services = new Map();
  }
  
  register(name, factory) {
    this.services.set(name, factory);
  }
  
  get(name) {
    return this.services.get(name)();
  }
}
```

### **4.2: Service Registration**
```javascript
// Initialize all SSoT components once
container.register('artistDetection', () => new ArtistDetectionEngine(apiManager));
container.register('qualityMetrics', () => new QualityMetricsEngine());
container.register('biographyManager', () => new BiographyTooltipManager());
// etc...
```

---

## 📋 **Phase 5: Implementation Steps**

### **Step 5.1: Extract Biography Manager (PRIORITY 1)**
- [ ] Create `core/biography-tooltip-manager.js`
- [ ] Move biography logic from quality-analyzer.js
- [ ] Test biography functionality in isolation
- [ ] Fix current biography bug
- [ ] Integrate back to quality-analyzer.js

### **Step 5.2: Extract Artist Detection Engine**
- [ ] Create `core/artist-detection-engine.js`
- [ ] Move artist detection logic
- [ ] Maintain all existing functionality
- [ ] Test artist detection independently

### **Step 5.3: Extract Quality Metrics Engine**
- [ ] Create `core/quality-metrics-engine.js`
- [ ] Move scoring and warning logic
- [ ] Ensure consistent scoring across pages

### **Step 5.4: Create Page Orchestrators**
- [ ] Create `pages/edit-page-orchestrator.js`
- [ ] Create `pages/add-item-page-orchestrator.js`
- [ ] Create `pages/items-page-orchestrator.js`
- [ ] Wire up core components

### **Step 5.5: Update Content Scripts**
- [ ] Modify `content.js` to detect page type
- [ ] Load appropriate orchestrator
- [ ] Maintain backward compatibility

---

## 🔌 **Phase 6: Page Detection & Loading**

### **6.1: URL-Based Page Detection**
```javascript
// content.js enhancement
function detectPageType() {
  const url = window.location.href;
  
  if (url.includes('/edit/')) {
    return 'edit-page';
  } else if (url.includes('/add/')) {
    return 'add-item-page';
  } else if (url.includes('/items/')) {
    return 'items-page';
  }
  
  return 'unknown';
}

async function loadPageOrchestrator(pageType) {
  switch(pageType) {
    case 'edit-page':
      const { EditPageOrchestrator } = await import('./pages/edit-page-orchestrator.js');
      return new EditPageOrchestrator();
    
    case 'add-item-page':
      const { AddItemPageOrchestrator } = await import('./pages/add-item-page-orchestrator.js');
      return new AddItemPageOrchestrator();
    
    case 'items-page':
      const { ItemsPageOrchestrator } = await import('./pages/items-page-orchestrator.js');
      return new ItemsPageOrchestrator();
  }
}
```

---

## ✅ **Success Criteria**

### **Architecture Goals:**
- [ ] `quality-analyzer.js` reduced from 3037 → ~200 lines
- [ ] SSoT components reusable across all pages
- [ ] Biography functionality working perfectly
- [ ] Zero functionality regression
- [ ] Clear separation of concerns
- [ ] Maintainable codebase

### **Page-Specific Goals:**
- [ ] **Edit Page**: Full enhancement suite
- [ ] **Add Item Page**: Real-time guidance
- [ ] **Items Page**: Quick preview features

### **Developer Experience:**
- [ ] Easy to add new features
- [ ] Clear component boundaries
- [ ] Comprehensive error handling
- [ ] Good performance (lazy loading)

---

## 🚨 **Risk Mitigation**

### **During Refactoring:**
1. **One component at a time** - never break multiple things
2. **Maintain current functionality** - no feature regression
3. **Test each extraction** before moving to next
4. **Keep git commits small** - easy to revert if needed
5. **Biography fix FIRST** - address immediate user issue

### **Testing Strategy:**
1. **Unit test each SSoT component**
2. **Integration test page orchestrators** 
3. **End-to-end test each page type**
4. **Performance test lazy loading**

---

## 🎯 **Immediate Next Action**

**START WITH: Biography Tooltip Manager Extraction**
- This fixes the immediate user-reported bug
- It's a contained component with clear boundaries
- Success here proves the refactoring approach works
- Biography is used across multiple pages (good SSoT candidate)

**Command to begin:**
```bash
# Step 1: Create the biography manager component
touch modules/core/biography-tooltip-manager.js
```

---

## 📝 **Notes**

- **Backward Compatibility**: Maintain existing API during transition
- **Performance**: Use lazy loading for page-specific components
- **Error Boundaries**: Each component should handle its own errors
- **Configuration**: Each orchestrator can configure components differently
- **Analytics**: Track component usage across different pages 