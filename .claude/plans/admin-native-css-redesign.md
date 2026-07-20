# Plan: Admin-Native CSS Redesign

## Context
The extension's UI looks too "polished" and "extension-y" compared to the utilitarian Auctionet admin. Gradients, large border-radius, box-shadows, backdrop-blur, and fancy animations make it stand out instead of blending in. Goal: make every extension element feel like it was built by the Auctionet team.

## Auctionet Admin Design Language
- White backgrounds, light gray (#f5f5f5) secondary
- 1px solid borders (#ddd), NO rounded corners (0-3px max)
- Flat buttons: blue (#337ab7), red (#dc3545), green (#28a745), gray
- NO shadows, NO gradients, NO backdrop-blur, NO fancy animations
- System sans-serif fonts, default letter-spacing
- Bootstrap 3 color palette

## What to Change (5 categories applied everywhere)

| Pattern | Current | Target |
|---------|---------|--------|
| Gradients | `linear-gradient(135deg, ...)` | Flat solid colors |
| Border-radius | 6-12px | 3px max |
| Box-shadows | `0 2px 8px...`, `0 20px 60px...` | None |
| Backdrop-filter | `blur(2-16px)` | None |
| Animations | scale, translateY, cubic-bezier, pulse | Minimal opacity transitions only |
| Letter-spacing | -0.025em, 0.6px | Default |
| Colors | Tailwind (#2563eb, #16a34a) | Bootstrap (#337ab7, #28a745) |

## Phase 1: CSS Files (8 files)

### 1. `styles/components/add-items-tooltips.css` — HIGHEST PRIORITY
Most gradient/shadow violations. Changes:
- `.quality-indicator`: gradient -> `#f8f9fa`, radius 12->3, remove shadow
- `.quality-score.good/medium/poor`: gradients -> flat `#d4edda/#fff3cd/#f8d7da`, radius 20->3, remove shadow
- `.refresh-quality-btn`: gradient -> flat `#6c757d`, remove shadow, remove `transform: rotate(180deg) scale(1.1)`
- `.ai-master-button`: gradient -> `#28a745`, remove shadow, remove `translateY(-1px)`
- `.verification-badge`: gradient -> `#28a745`, remove shadow
- `.correction-notice`: gradient -> `#f0ad4e; color: #333`, remove shadow
- `.popup-header`: gradient -> `#f5f5f5`
- `.artist-bio-popup`: radius 12->3, remove shadow
- `.condition-guide-popup`: radius 8->3, remove shadow, remove backdrop-blur
- `.add-items-tooltip`: radius 8->3, remove shadow, simplify animation to opacity-only
- `.issue-item.artist-option`: gradient -> `#f0f7ff`, remove hover transform/shadow
- Remove all `letter-spacing: -0.025em`

### 2. `styles.css` — Edit page core
- `.ai-status-indicator.loading/success/error`: gradients -> flat `#337ab7/#28a745/#dc3545`
- Remove `@keyframes gradientShift`
- `.warning-valuation` variants: gradients -> flat backgrounds
- `.enhance-all-panel`: gradient -> `#f0fdf4`, radius 8->3
- `.enhance-all-*` components: all radius 6-12 -> 3, remove shadows
- `.enhance-all-run-btn:hover`: remove `translateY(-1px)` and shadow
- `.enhance-all-preview-modal`: radius 12->3, remove shadow
- `.enhance-all-preview-overlay`: remove backdrop-blur
- `.field-spinner-overlay`: remove backdrop-blur, radius 6->3
- `.dialog-content`: radius 8->3, remove shadow
- `.quality-tooltip`: remove shadow
- `.condition-guide-popup-overlay`: remove backdrop-blur
- `.artist-bio-tooltip::after`: radius 12->3, remove backdrop-blur, remove multi-layer shadow
- `.loading-pulse`: simplify or keep (functional)
- Remove `@keyframes popupSlideIn` or simplify to opacity-only
- Remove `letter-spacing: 0.025em` from `.ai-processing-text`

### 3. `styles/components/analytics.css` — Standalone page
- `--ad-radius: 12px` -> `4px`
- `--ad-radius-sm: 8px` -> `3px`
- `--ad-shadow` -> `none` (or `0 1px 2px rgba(0,0,0,0.05)`)
- `--ad-shadow-md` -> `none`
- `--ad-accent: #2563eb` -> `#337ab7`
- `--ad-positive: #16a34a` -> `#28a745`
- `--ad-negative: #dc2626` -> `#dc3545`
- Bar fill gradients -> flat `var(--ad-bar)`
- Remove shimmer on progress fill (keep skeleton shimmer)

### 4. `styles/components/freetext-parser.css`
- `.freetext-parser-modal`: radius 12->3, remove shadow
- `.popup-header`: gradient -> `#f5f5f5`, radius 12->3
- `.modal-footer`: radius 12->3

### 5. `styles/components/admin-dashboard.css` — Already mostly native
- `.ext-kpi-card:hover`: remove shadow (keep border-color change)
- Minor: keep fade-in animation (already subtle)

### 6. `styles/components/comment-enhancer.css`
- `.ext-comment-indicator:hover`: remove shadow
- `.ext-filter-pill`: radius 14->3 (pill -> square)
- `.ext-comment-badge`: radius 9->3
- `.ext-entity-badge`: radius 9->3

### 7. `styles/components/ai-image-analyzer.css`
- Replace all undefined CSS vars with concrete admin-native values
- `var(--radius-lg/md/sm)` -> `3px/3px/2px`
- `var(--color-primary)` -> `#337ab7`
- Remove hover `box-shadow` and `transform: scale(1.1)`

### 8. `styles/components/valuation-request.css`
- `.vr-cluster-group`: radius 6->3
- `.vr-multi-summary`: radius 5->3
- `.vr-group-result`: radius 5->3

## Phase 2: JS Inline Styles (10+ files)

### Critical JS files (inline styles with gradients/shadows/radius):
1. **`modules/ui/ui-controller.js`** — Large inline `<style>` block duplicating CSS patterns. Apply same changes.
2. **`modules/dashboard-manager-v2.js`** — Market analysis panel: `backdrop-filter: blur(16px)`, gradient buttons, radius 10-12px, shadows
3. **`modules/ui/ai-enhancement-ui.js`** — Purple gradient (#667eea) completely off-brand -> `#337ab7`; radius 12-16 -> 3
4. **`admin-item-banner.js`** — Status banners with gradients -> flat colors; radius 12->3; remove backdrop-blur
5. **`modules/core/biography-kb-card.js`** — radius 12-16->3, gradient header -> flat, remove shadow/blur
6. **`modules/core/ui-feedback-manager.js`** — Purple gradient toast -> `#337ab7`; remove shadow/blur
7. **`modules/core/biography-tooltip-manager.js`** — radius 6-12->3, gradient header -> flat
8. **`modules/inline-brand-validator.js`** — radius 8->3, remove shadow
9. **Other minor**: tooltip-manager, tooltip-system-manager, artist-ignore-manager, brand-action-handler, search-filter-manager

## Phase 3: Verification
- Test all 5 page types: edit item, add item, admin dashboard, analytics, valuation request
- Verify modals still darken background (keep `rgba(0,0,0,0.5)` overlay)
- Verify loading spinners still animate (functional, not decorative)
- Verify focus states work for accessibility
- Verify analytics dark mode still works
- Verify all buttons remain distinguishable by color
