# Auctionet AI Cataloging Assistant

A Chrome/Brave browser extension that enhances auction item cataloging using AI, specifically designed for Auctionet's platform.

## 🎯 Features

- **AI-powered text enhancement** for titles, descriptions, condition reports, and keywords
- **Cost-effective model selection** (Claude 3.5 Sonnet vs Claude 4.0 Sonnet)
- **Anti-hallucination system** prevents AI from inventing information
- **Quality assessment** blocks improvements when source data is too sparse
- **Swedish auction standards** compliance
- **Professional UI** with elegant loading animations
- **Field-specific feedback** messages

## 🏗️ Architecture

### Modular Design
- `content-script.js` - Main coordinator with dynamic module loading
- `modules/ui-manager.js` - UI components and interactions
- `modules/api-manager.js` - Claude API integration and response parsing
- `modules/quality-analyzer.js` - Data quality assessment and validation
- `modules/data-extractor.js` - Form data extraction utilities
- `modules/config.js` - Model configuration and settings
- `background.js` - Service worker for CORS-free API calls
- `popup.html/js` - Extension popup for API key and model management

### Key Technologies
- **Manifest V3** Chrome Extension
- **ES6 Modules** with dynamic imports
- **Anthropic Claude API** (3.5 and 4.0 Sonnet models)
- **Chrome Storage API** for settings persistence

## 💰 Cost Optimization

| Model | Cost per 1M tokens | Use Case |
|-------|-------------------|----------|
| Claude 3.5 Sonnet | ~$3 | Daily cataloging (80% savings) |
| Claude 4.0 Sonnet | ~$15 | High-value items, complex cases |

**Annual cost example (100 improvements/day):**
- Claude 3.5: ~$108/year
- Claude 4.0: ~$540/year

## 🛡️ Anti-Hallucination Features

1. **Quality Assessment**: Analyzes source data completeness
2. **Information Dialogs**: Requests specific missing information
3. **Conservative Prompting**: Instructs AI to only enhance, never invent
4. **Uncertainty Preservation**: Maintains terms like "troligen", "tillskriven"
5. **Validation System**: Checks output quality and requests corrections

## 🚀 Installation

1. **Download/Clone** this repository
2. **Open Chrome/Brave** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in top right)
4. **Click "Load unpacked"** and select the extension folder
5. **Configure API Key** via the extension popup
6. **Select Model** (Claude 3.5 or 4.0) in popup

## ⚙️ Configuration

### API Key Setup
1. Get Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
2. Click extension icon in browser toolbar
3. Enter API key and save
4. Select preferred Claude model

### Model Selection
- **Claude 3.5 Sonnet**: Default, cost-effective
- **Claude 4.0 Sonnet**: Premium, more conservative

## 📋 Usage Workflow

### Recommended Process:
1. **Cataloger adds basic data** to all fields (keywords, short phrases)
2. **Click AI enhancement buttons** (⚡) next to fields
3. **Review and adjust** AI suggestions
4. **Use "Förbättra alla"** for complete enhancement

### Field-Specific Improvements:
- **Title**: Follows Swedish auction standards (max 60 chars)
- **Description**: Professional terminology and structure
- **Condition**: Specific, factual condition reporting
- **Keywords**: SEO-optimized search terms

## 🎨 UI Features

- **Elegant loading animations** with pulsing dots and gradient effects
- **Field-specific feedback** messages in Swedish
- **Quality indicators** with scoring system
- **Professional styling** that integrates with Auctionet's interface

## 🔧 Development

### File Structure
```
auctionet-extension-cors-fixed/
├── manifest.json              # Extension manifest
├── content-script.js          # Main content script
├── background.js              # Service worker
├── popup.html/js/css          # Extension popup
├── styles.css                 # UI styling
├── modules/                   # Modular components
│   ├── ui-manager.js
│   ├── api-manager.js
│   ├── quality-analyzer.js
│   ├── data-extractor.js
│   └── config.js
└── README.md                  # This file
```

### Key Classes
- `AuctionetCatalogingAssistant` - Main coordinator
- `UIManager` - UI components and interactions
- `APIManager` - Claude API integration
- `QualityAnalyzer` - Data quality assessment
- `DataExtractor` - Form data extraction

## 🧪 Testing

### Manual Testing
1. Navigate to Auctionet item edit page
2. Add basic information to fields
3. Test individual field improvements
4. Test "Förbättra alla" functionality
5. Verify quality assessment dialogs
6. Test model switching

### Quality Checks
- Anti-hallucination prevention
- Swedish terminology compliance
- Uncertainty marker preservation
- Professional formatting

## 📈 Performance

- **Modular loading**: 82% reduction in main file size
- **Dynamic imports**: Better performance and maintainability
- **Efficient API usage**: Smart retry logic and error handling
- **User feedback**: Real-time status indicators

## 🔒 Security

- **API key storage**: Secure Chrome storage
- **CORS handling**: Background script for API calls
- **Input validation**: Sanitized data processing
- **Error handling**: Graceful failure modes

## 📝 Version History

### Current Version
- Modular architecture with dynamic imports
- Cost-effective Claude 3.5 Sonnet integration
- Enhanced UI with elegant animations
- Field-specific feedback messages
- Comprehensive anti-hallucination system

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📄 License

Private project for Auctionet internal use.

## 🆘 Support

For issues or questions, contact the development team.

---

**Built with ❤️ for professional auction cataloging** 