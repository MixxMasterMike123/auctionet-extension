# Auctionet AI Cataloging Assistant

AI-powered cataloging assistant for Auctionet using Claude 4 to improve auction item descriptions.

## Features

### Edit Page Enhancement (Existing)
- **AI-powered field improvements** for titles, descriptions, conditions, and keywords
- **Quality analysis** with scoring system and improvement suggestions
- **Real-time quality updates** as you edit fields
- **Undo functionality** for all AI improvements
- **Swedish auction standards** validation

### Add Items Page - Modern Tooltip System (NEW!)
- **🎯 Artist Detection Tooltips** - Automatically detects artist names in titles and offers to move them to the artist field
- **Modern UI Design** - Clean, subtle tooltips that don't disrupt your workflow
- **Smart Positioning** - Tooltips position themselves intelligently relative to form fields
- **Session Memory** - Remembers dismissed tooltips for the current session
- **Debounced Analysis** - Analyzes content 3 seconds after you stop typing to avoid interruptions

## Add Items Tooltip Features

### Artist Detection
- **Automatic Detection**: Identifies artist names placed incorrectly in titles
- **Smart Patterns**: Recognizes various Swedish auction title formats
- **One-Click Fix**: "Flytta" button moves artist to correct field and cleans up title
- **Visual Feedback**: Blue-accented tooltip clearly shows detected artist

### Upcoming Features (Next Steps)
- **AI Description Suggestions** - Generate enhanced descriptions
- **AI Condition Reports** - Smart condition assessment
- **Market Valuation** - AI-powered price estimation
- **Hidden Keywords** - Automatic SEO keyword generation

## Installation

1. Download or clone this repository
2. Open Chrome/Edge and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Get your Anthropic Claude API key from https://console.anthropic.com/
6. Click the extension icon and enter your API key

## Usage

### Edit Pages (Existing)
1. Navigate to any item edit page on Auctionet admin
2. You'll see AI assistance buttons next to each field
3. Click "⚡ Förbättra alla" to improve all fields at once
4. Use individual field buttons for targeted improvements
5. Review and edit the AI suggestions as needed

### Add Items Pages (NEW!)
1. Navigate to the "Add new item" page on Auctionet admin
2. Start filling in the title field
3. If an artist name is detected in the title, you'll see a tooltip: **"KONSTNÄR UPPTÄCKT I TITEL"**
4. Click the blue "Flytta" button to automatically move the artist to the correct field
5. The title will be cleaned up automatically
6. Continue filling out the form - more tooltips will appear as we add new features

## Example: Artist Detection

**Before:**
- Title: `LISA LARSON. Skulptur, "Storstegaren" brons, signerad och numrerad 327`
- Artist: _(empty)_

**After clicking "Flytta":**
- Title: `Skulptur, "Storstegaren" brons, signerad och numrerad 327`
- Artist: `LISA LARSON`

## Technical Architecture

### File Structure
```
modules/
├── add-items-tooltip-manager.js    # NEW: Modern tooltip system for add pages
├── quality-analyzer.js             # Quality analysis and artist detection
├── api-manager.js                  # Claude API integration
├── sales-analysis-manager.js       # Market analysis features
└── search-filter-manager.js        # Search functionality

content.js                          # Main content script (updated)
content-script.js                   # Entry point
manifest.json                       # Extension manifest (updated)
```

### Add Items Tooltip System
- **Modular Design**: Self-contained tooltip manager that reuses existing detection logic
- **Non-Intrusive**: Tooltips appear only when relevant and can be dismissed
- **Responsive Positioning**: Smart positioning that adapts to viewport and field locations
- **Event-Driven**: Debounced analysis prevents performance issues

## API Key

You need a Claude API key from Anthropic. The extension will securely store this in Chrome's sync storage.

## Privacy

- Your API key is stored locally in your browser
- Only item data you're editing is sent to Claude API
- No data is stored on external servers
- All processing happens locally or via direct API calls

## Support

For issues or feature requests, please check the browser console for detailed logs.

## Version History

### v1.1.0 (Latest)
- ✨ **NEW: Add Items Tooltip System**
- 🎯 Artist detection with modern tooltip UI
- 📱 Smart responsive positioning
- 🔄 Real-time field analysis with debouncing
- 🎨 Modern design with glass morphism effects
- 📝 Session-based dismissal memory

### v1.0.0
- Initial release with edit page functionality
- AI-powered field improvements
- Quality analysis system
- Swedish auction standards validation 