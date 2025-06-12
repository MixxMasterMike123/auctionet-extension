# 🎯 Auctionet AI Cataloging Assistant

AI-powered cataloging assistant for Auctionet using Claude AI to improve auction item descriptions with professional Swedish auction standards.

## 🚀 Current Status

**Phase 1: Modular Architecture** ✅ **COMPLETE**  
- Core AI infrastructure built and tested
- Modular, maintainable codebase established
- Ready for integration with existing functionality

**Phase 2: Integration** 🔄 **NEXT**  
- Gradual migration from monolithic files
- Backward compatibility maintained
- Performance optimization

## ✨ Features

### 🎨 AI-Powered Enhancement
- **Smart field improvements** for titles, descriptions, conditions, and keywords
- **Category-specific rules** for weapons, watches, jewelry, historical items
- **Anti-hallucination protection** prevents AI from adding false information
- **Field-specific model selection** (Haiku for corrections, Sonnet for complex tasks)

### 🔍 Quality Analysis
- **Professional quality scoring** with Swedish auction standards
- **Real-time validation** and improvement suggestions
- **Brand correction** and terminology standardization
- **Conservative enhancement** for specialized categories

### 🎯 Artist Detection
- **Intelligent artist detection** from titles and descriptions
- **Artist verification** with biographical context
- **Smart field management** with automatic artist placement

### 📊 Market Analysis
- **Comparable sales analysis** from Auctionet data
- **Live auction monitoring** for current market trends
- **Price estimation** with confidence scoring
- **Market sentiment analysis**

## 🏗️ Architecture

### **New Modular System** (Phase 1 Complete)
```
modules/ai/
├── config/models.js              # Model configurations & field rules
├── core/
│   ├── model-manager.js          # Intelligent model selection
│   ├── response-parser.js        # Unified response parsing
│   └── prompt-manager.js         # Prompt orchestration
└── prompts/
    ├── base-prompts.js           # Core system prompts
    ├── category-prompts.js       # Category-specific rules
    └── field-prompts.js          # Field-specific prompts
```

### **Legacy Files** (Being Refactored)
```
modules/
├── api-manager.js                # 94KB → Target: 30KB
├── quality-analyzer.js           # 121KB → Being modularized
└── add-items-tooltip-manager.js  # 159KB → Being modularized
```

## 🛠️ Installation

1. **Download** or clone this repository
2. **Chrome Extensions**: Go to `chrome://extensions/`
3. **Enable** "Developer mode"
4. **Load unpacked** and select the extension folder
5. **API Key**: Get your Anthropic Claude API key from https://console.anthropic.com/
6. **Configure**: Click the extension icon and enter your API key

## 📖 Usage

### Edit Pages
1. Navigate to any item edit page on Auctionet admin
2. Use AI assistance buttons next to each field
3. Click "⚡ Förbättra alla" to improve all fields at once
4. Review and edit AI suggestions as needed

### Add Items Pages
1. Navigate to "Add new item" page
2. Fill in fields - AI tooltips will appear with suggestions
3. Use artist detection and field enhancement features
4. Follow quality guidance for professional cataloging

## 🔧 Development

### **Current Development Guidelines**
- **Safety First**: Never modify working code during module creation
- **Modular Design**: Single responsibility, reusable components
- **Test-Driven**: Comprehensive testing before integration
- **Documentation**: Keep `modules/ai/README.md` updated

### **For Developers**
- **Master Plan**: See `modules/ai/README.md` for complete architecture
- **Quick Reference**: See `DEVELOPMENT_CONTEXT.md` for essential context
- **Current Status**: Phase 1 complete, ready for Phase 2 integration

## 🔐 Privacy & Security

- **Local Storage**: API key stored securely in Chrome sync storage
- **Direct API**: Only item data sent directly to Claude API
- **No External Storage**: No data stored on external servers
- **Local Processing**: All processing happens locally or via direct API calls

## 📊 Success Metrics

- **File Size Reduction**: api-manager.js from 94KB to ~30KB target
- **Code Maintainability**: Single source of truth for AI behavior
- **Performance**: Intelligent caching and model selection
- **Reliability**: Comprehensive validation and error handling

## 🎯 Version History

### v2.0.0 (In Development)
- 🏗️ **Modular Architecture**: Complete AI infrastructure refactoring
- 🧠 **Smart Model Selection**: Field-specific model optimization
- 🛡️ **Anti-Hallucination**: Enhanced protection against false information
- ⚡ **Performance**: Intelligent caching and optimization

### v1.2.0 (Current Stable)
- 📋 **Category-Specific Guidance**: Professional condition reporting
- 🎯 **Artist Detection**: Enhanced artist identification
- 🔧 **Bug Fixes**: Artist move functionality and tooltip improvements

### v1.0.0
- 🚀 **Initial Release**: Basic AI enhancement functionality
- 📝 **Quality Analysis**: Swedish auction standards validation

## 🆘 Support

- **Documentation**: Check `modules/ai/README.md` for technical details
- **Development**: See `DEVELOPMENT_CONTEXT.md` for current status
- **Issues**: Check browser console for detailed logs
- **Architecture**: Modular system designed for maintainability

---

**🎯 This extension is actively being refactored into a maintainable, modular architecture while preserving all existing functionality.** 