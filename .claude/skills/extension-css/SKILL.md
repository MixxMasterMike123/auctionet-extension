---
name: extension-css
description: Extension CSS architecture, class naming conventions, color palette, dark mode support, and styling patterns. Use when creating or modifying UI components, styling buttons or modals, adding dark mode, or ensuring visual consistency across dashboard, analytics, freetext parser, publication scanner, or any extension panel.
user-invocable: false
---

# Extension CSS Architecture

## File Structure

| File | Scope |
|------|-------|
| `styles.css` | Edit Item page — AI buttons, field highlights, undo buttons, quality UI |
| `styles/components/admin-dashboard.css` | Dashboard KPI cards, pipeline funnel, comment feed |
| `styles/components/analytics.css` | Analytics charts, sparklines, data tables |
| `styles/components/comment-enhancer.css` | Comment badges, filter pills, entity badges |
| `styles/components/add-items-tooltips.css` | Add Item quality indicators, tooltips, warnings |
| `styles/components/freetext-parser.css` | Snabbkatalogisering modal, field panels |
| `styles/components/ai-image-analyzer.css` | Image upload zone, analysis results |
| `styles/components/valuation-request.css` | Valuation assistant panels, email preview |

CSS files are loaded via `manifest.json` content script declarations — no build step, no preprocessor.

## Class Naming Conventions

### Prefix patterns (by feature area)

| Prefix | Feature | Example |
|--------|---------|---------|
| `.ai-` | AI interaction elements | `.ai-assist-button`, `.ai-master-button`, `.ai-updated`, `.ai-processing-section` |
| `.ext-` | Dashboard/admin enhancements | `.ext-kpi-card`, `.ext-pipeline__stage`, `.ext-comment-badge`, `.ext-filter-pill` |
| `.quality-` | Quality scoring UI | `.quality-indicator`, `.quality-score`, `.quality-warnings` |
| `.ai-image-analyzer__` | Image analyzer (BEM) | `.ai-image-analyzer__upload-zone`, `.ai-image-analyzer__preview` |
| `.vr-` | Valuation request | `.vr-group-result__link` |
| `.ad-` | Analytics dashboard | `.ad-top-row__link`, `.ad-kpi-card`, `.ad-bar-row` |
| `.freetext-` | Snabbkatalogisering modal | `.freetext-parser-modal`, `.freetext-textarea`, `.freetext-label` |
| `.enhance-all-` | Enhance All panel/preview | `.enhance-all-panel`, `.enhance-all-preview-modal`, `.enhance-all-tier-btn` |
| `.ext-pubscan__` | Publication scanner (BEM) | `.ext-pubscan__card`, `.ext-pubscan__issue`, `.ext-pubscan__filter-row` |
| `.ext-comment-indicator` | Comment indicator (BEM) | `.ext-comment-indicator__count`, `.ext-comment-indicator--has-comments` |
| `.condition-guide-` / `.guide-` | Condition guide popup | `.condition-guide-popup`, `.guide-section`, `.guide-list-item` |

### BEM pattern (used in newer components)
```
.ai-image-analyzer              — block
.ai-image-analyzer__upload-zone — element
.ai-image-analyzer__upload-zone--dragover — modifier
```

### Older components use flat classes
```
.ai-assist-button
.ai-master-button
.quality-score
```

When adding new components, prefer BEM with a feature prefix.

## Color Palette

### Primary actions
| Color | Hex | Usage |
|-------|-----|-------|
| Blue | `#006ccc` | Standard AI buttons (`.ai-assist-button`) |
| Blue hover | `#0056b3` | Button hover state |
| Blue active | `#004085` | Button active/pressed state |
| Green | `#27ae60` | Master "enhance all" button, success states |
| Green hover | `#229954` | Master button hover |
| Orange | `#D18300` | Title correction button (`title-correct`) |
| Orange hover | `#B17200` | Title correction hover |

### State colors
| Color | Hex | Usage |
|-------|-----|-------|
| Success bg | `#e8f8f5` | `.ai-updated` field background |
| Success border | `#27ae60` | `.ai-updated` field border |
| Warning | `#f39c12` | Quality warnings, medium scores |
| Error/Poor | `#e74c3c` | Low quality scores, errors |
| Good | `#27ae60` | High quality scores |

### Warning severity colors
| Severity | Hex | Usage |
|----------|-----|-------|
| High | `#dc3545` | `.warning-high` — critical quality issues |
| Medium | `#0d6efd` | `.warning-medium` — improvement suggestions |
| Low | `#6c757d` | `.warning-low` — minor notes |

### Amber warning (analytics)
| Color | Hex | Usage |
|-------|-----|-------|
| Amber | `#f59e0b` | Filter bar active state, first-sale rate warnings |
| Amber bg | `rgba(245, 158, 11, 0.1)` | `.ad-sb-filter-bar` background |
| Amber border | `rgba(245, 158, 11, 0.3)` | `.ad-sb-filter-bar` border |
| Amber dark | `#fbbf24` | Dark mode amber variant |

### FAQ hint styling
| Color | Hex | Usage |
|-------|-----|-------|
| FAQ border | `#f59e0b` | `.faq-hint` left border |
| FAQ bg | `#fffbeb` | `.faq-hint` background |
| FAQ text | `#92400e` | `.faq-hint` text color |

### Economy KPI
| Color | Hex | Usage |
|-------|-----|-------|
| Goldenrod | `#b8860b` | `.ad-kpi-grid--economy` border |
| Goldenrod dark | `#d4a854` | Dark mode economy border |

### Dashboard (dark theme support)
The admin dashboard uses Auctionet's existing dark/light theme. The analytics page uses a `.ad-dark` class with full CSS custom property overrides for all `--ad-*` variables.

### KPI card colors (dashboard)
Border-left color modifiers via named classes:
```css
.ext-kpi-card--green   { border-left-color: #28a745; }  /* positive metrics */
.ext-kpi-card--blue    { border-left-color: #006ccc; }  /* neutral/info metrics */
.ext-kpi-card--orange  { border-left-color: #e65100; }  /* warning metrics */
.ext-kpi-card--red     { border-left-color: #dc3545; }  /* alert metrics */
.ext-kpi-card--yellow  { border-left-color: #f0ad4e; }  /* caution metrics */
.ext-kpi-card--purple  { border-left-color: #6f42c1; }  /* special metrics */
```

### Analytics CSS variables (analytics.css)
The analytics dashboard uses a full CSS custom property system with dark mode toggle:
```css
:root {
  --ad-bg: #f8f9fa;        --ad-card-bg: #ffffff;
  --ad-border: #e2e8f0;    --ad-text: #1e293b;
  --ad-accent: #2563eb;    --ad-positive: #16a34a;
  --ad-negative: #dc2626;  --ad-warn: #d97706;
  --ad-bar: #3b82f6;       --ad-shadow: 0 1px 3px rgba(0,0,0,0.08)...;
}
.ad-dark { /* overrides all --ad-* variables for dark theme */ }
```

## Common Patterns

### AI Button with wrapper
```html
<div class="ai-button-wrapper">
  <button class="ai-assist-button" data-field-type="title">AI-forslag</button>
  <button class="ai-assist-button" data-field-type="description">AI-forslag</button>
  <button class="ai-master-button">Forbattra alla</button>
</div>
```

### Field updated state
When AI updates a field, add `.ai-updated` class:
```javascript
field.classList.add('ai-updated');
// To revert:
field.classList.remove('ai-updated');
```

### Loading spinner overlay
Spinners are positioned over fields during AI processing:
```html
<div class="field-spinner-overlay" data-field-type="title">...</div>
```
Parent gets `.field-loading` class during processing.

### Quality score display
```html
<div class="quality-indicator">
  <div class="quality-header">
    <span class="quality-title">Kvalitet</span>
    <div class="quality-score-container">
      <span class="quality-score good|medium|poor">85</span>
    </div>
  </div>
  <div class="quality-warnings">
    <ul><li>Warning text here</li></ul>
  </div>
</div>
```

### Dashboard entity badges
```html
<span class="ext-comment-badge ext-comment-badge--buyer">Kopare</span>
<span class="ext-comment-badge ext-comment-badge--item">Foremal</span>
<span class="ext-comment-badge ext-comment-badge--claim">Reklamation</span>
```

### Filter pills (comment enhancer)
```html
<div class="ext-filter-bar">
  <button class="ext-filter-pill ext-filter-pill--alla ext-filter-pill--active">Alla</button>
  <button class="ext-filter-pill ext-filter-pill--reklamation">Reklamation</button>
  <button class="ext-filter-pill ext-filter-pill--kopare">Kopare</button>
</div>
```

## JS-Injected Styles

Some components inject styles via JavaScript rather than CSS files:
- `admin-dashboard.js` injects `<style>` tags for dynamically generated dashboard elements
- `modules/ui/ui-controller.js` applies inline styles for field highlights and undo buttons
- `modules/enhance-all/enhance-all-manager.js` creates the enhance-all panel DOM with inline styles where needed

When modifying these components, check both the CSS file AND the JS source for styling.

## Advanced UI Patterns

### Dialog system (styles.css)
```html
<div class="dialog-overlay">
  <div class="dialog-content">
    <div class="info-request-form">
      <div class="form-group">...</div>
    </div>
    <div class="dialog-buttons">
      <button class="btn-primary">OK</button>
      <button class="btn-default">Cancel</button>
    </div>
  </div>
</div>
```

### Field loading states
```css
.field-loading          /* state class on parent */
.field-spinner-overlay  /* loading overlay */
.ai-spinner             /* animated spinner */
.field-success          /* success flash animation */
```

### Status indicators
```css
.ai-status-indicator.loading  /* blue (#337ab7) */
.ai-status-indicator.success  /* green */
.ai-status-indicator.error    /* red */
.ai-processing-text           /* processing label */
```

### Artist bio tooltip
```css
.artist-bio-tooltip           /* inline trigger */
.artist-bio-preview.loading   /* loading state */
```

### Image analyzer CSS variables (ai-image-analyzer.css)
Uses a separate variable system from analytics: `var(--bg-white)`, `var(--border-light)`, `var(--color-danger)`, `var(--transition-normal)`, etc. (Bootstrap-like naming, not `--ad-*`)

## Important Rules

1. **No `!important` spam** — only use for overriding Auctionet's own styles when absolutely necessary (`.ai-updated` is an exception)
2. **Max-width constraints** — button wrappers use `max-width: 450px` to stay within form column
3. **Transitions** — use `transition: all 0.3s ease` for interactive elements
4. **Font sizes** — buttons use `12px`, labels use `13px`, stay consistent with Auctionet's admin font sizing
5. **z-index** — extension uses high z-index values (10000+) to layer above Auctionet's own UI. Overlays/modals use 10000–10002, spinners within fields use 9999+. Check existing values in the target CSS file before choosing a z-index
