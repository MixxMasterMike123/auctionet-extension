# Admin Item Quality Banner Feature

## Overview
This feature adds a quality assessment banner to Auctionet admin item show pages. When the quality score of an item is below 70/100, a prominent banner appears suggesting improvements.

## Files Added/Modified

### 1. `manifest.json`
- Added new content script for admin item show pages
- Uses exclude pattern to avoid conflict with edit pages

### 2. `admin-item-banner.js` (NEW)
- Content script that runs on admin item show pages
- Extracts item data from the page HTML
- Calculates quality score using subset of main extension logic
- Shows banner if score < 70

### 3. `test-admin-banner.html` (NEW)
- Test file with sample admin page HTML
- Useful for testing the data extraction and scoring

## How It Works

### Page Detection (Improved)
- Runs on URLs matching: 
  - `https://auctionet.com/admin/*/items/*`
  - `https://auctionet.com/admin/sas/sellers/*/contracts/*/items/*` (actual Auctionet structure)
- Excludes edit pages: 
  - `https://auctionet.com/admin/*/items/*/edit`
  - `https://auctionet.com/admin/sas/sellers/*/contracts/*/items/*/edit`
- Uses multiple fallback checks:
  - Looks for any table structure
  - Looks for details sections or headings
  - Requires an edit link to be present
- No longer depends on specific CSS classes

### Data Extraction (Robust)
Extracts the following from admin show page using multiple fallback selectors:

- **Title**: 
  - Primary: `.details-texts .heading + .bottom-vspace`
  - Fallbacks: Various heading + div combinations
  - Last resort: Any heading containing "Titel"

- **Description**: 
  - Searches all headings for "beskrivning"
  - Gets content from next sibling element

- **Condition**: 
  - Searches all headings for "kondition"
  - Gets content from next sibling element

- **Artist**: 
  - Searches all tables for "Konstnär" rows
  - Uses multiple table selectors as fallbacks

### Quality Scoring
Uses a subset of the main extension's logic (excludes keywords for UX reasons):
- Title < 14 characters: -15 points
- Description < 35 characters: -20 points
- Condition < 25 characters: -20 points
- Only "bruksslitage": -35 points
- Vague condition phrases: -20 points
- No measurements: -10 points

**Note**: Keywords are intentionally not penalized since they're not visible on admin show pages. This prevents the banner from appearing for items that actually have keywords, which would confuse users who have already optimized their items.

### Banner Display
When score < 70:
- Fixed position banner at top of page
- Orange gradient background with lightning icon
- Shows quality score and main issues (up to 3)
- Direct link to edit page
- Animated entrance and close button
- Responsive design

### Debug Information
The script now provides detailed console logging:
- URL detection results
- Page element detection status
- Data extraction progress
- Final quality score and issues

## Example with Test Data

Using the provided example:
- **Title**: "Taklampa, "Bumling", Ateljé Lyktan, Åhus" (44 chars ✓)
- **Description**: "Guldfärgad metall, diameter ca 48,5 cm, höjd ca 28 cm." (55 chars ✓, has measurements ✓)
- **Condition**: "Bruksslitage, repor, ej funktionstestad." (40 chars ✓)

**Expected Score**: 100 (no penalties) - **No banner shown**

## Troubleshooting

If the banner doesn't appear on an admin item show page:

1. **Check Console**: Open browser developer tools and look for debug messages
2. **URL Check**: Ensure URL contains `/admin/` and `/items/` but not `/edit`
3. **Page Elements**: Verify the page has tables or headings and an edit link
4. **Data Extraction**: Check if title, description, or condition were found
5. **Quality Score**: Confirm the calculated score is below 70

Common debug output:
```
Auctionet Admin Item Banner: Starting initialization...
Current URL: https://auctionet.com/admin/sas/sellers/.../items/123-item-name
Page detection: {isAdminItemPage: true, hasItemTable: true, hasDetailsSection: true, hasEditLink: true}
Found title with selector: .details-texts .heading + .bottom-vspace → "Item Title"
Found description: "Item description..."
Found condition: "Item condition..."
Final extracted data: {title: "...", description: "...", condition: "...", artist: "..."}
Calculated quality score: {score: 45, issues: ["Titel för kort", "Beskrivning för kort"]}
Quality banner shown for score: 45, issues: Titel för kort, Beskrivning för kort
```

## Banner Message
```
⚡ Kvalitetspoäng: [SCORE]/100
Huvudproblem: [ISSUES]
Det finns potential att nå högre priser på detta föremål. 
Klicka på "Redigera föremål" för att se hela analysen.
```

## Installation
The feature is automatically active when you load the extension. Visit any admin item show page to see it in action if the quality score is below 70. 