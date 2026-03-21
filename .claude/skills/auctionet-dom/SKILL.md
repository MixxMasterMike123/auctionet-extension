---
name: auctionet-dom
description: Auctionet admin page DOM structure — form field IDs, page layouts, key selectors, comment sections, and injection points. Use whenever modifying UI, fixing comment badges, reading form data, or injecting extension elements into Auctionet admin pages.
user-invocable: false
---

# Auctionet Admin DOM Structure

Reference for the DOM elements the extension interacts with across Auctionet's admin pages.

## Edit Item Page (`/admin/*/items/*/edit`)

Entry point: `content-script.js`

### Form Fields (all are `<textarea>` or `<input>`)

| Field | Selector | Type | Notes |
|-------|----------|------|-------|
| Title (SV) | `#item_title_sv` | textarea | Primary field — must exist for page detection |
| Description (SV) | `#item_description_sv` | textarea | Rich text content |
| Condition (SV) | `#item_condition_sv` | textarea | Condition report |
| Artist Name (SV) | `#item_artist_name_sv` | input | Auto-prepended UPPERCASE to title on display |
| Keywords | `#item_hidden_keywords` | textarea | Hidden from public, used for search |
| Category | `#item_category_id` | select | Use `option:checked` for current text value |
| Estimate | `#item_current_auction_attributes_estimate` | input | Lower estimate in SEK |
| Upper Estimate | `#item_current_auction_attributes_upper_estimate` | input | Upper estimate in SEK |
| Reserve | `#item_current_auction_attributes_reserve` | input | Reserve price |
| Accepted Reserve | `#item_current_auction_attributes_accepted_reserve` | input | Seller's accepted reserve |
| No Remarks | `input[type="checkbox"]#item_no_remarks` | checkbox | "Inga anmarkning" checkbox |

### Alternative No Remarks selectors (varies by page version)
```
input[type="checkbox"]#item_no_remarks
#item_no_remarks
input[name="item[no_remarks]"]
input[type="checkbox"][name*="no_remarks"]
```

### Images
- Image URLs are fetched via `fetch-image-base64` message to the background service worker
- CDN domain: `https://images.auctionet.com/` (in background.js `ALLOWED_IMAGE_DOMAINS` allowlist)

### Page Layout — Two-Column Structure
- **Left column**: `.grid-col8` — form fields (title, description, condition, etc.)
- **Right column**: `.grid-col4` / `.sidebar` / `.form-sidebar` — quality score panel, market analysis
- The form fields are typically inside a `<form>` with `action` containing `/items/`

### Injection Points
- AI buttons injected **after** each form field using `field.parentNode.insertBefore(wrapper, field.nextSibling)`
- Quality score panel injected into `.grid-col4` sidebar
- Market analysis panel injected into sidebar
- Chosen library dropdown: `#item_category_id_chosen .chosen-single span` for display value

### Field Container Pattern
Fields are wrapped in parent containers. To find the visual container for a field:
```javascript
let container = field.parentElement;
while (container && container.offsetHeight < 30) {
  container = container.parentElement;
}
```

## Add Item Page (`/admin/sas/sellers/*/contracts/*#new_item`)

Entry point: `content.js`

### Same field IDs as Edit page
The Add Item form uses identical field IDs (`#item_title_sv`, etc.) but they may be loaded dynamically (SPA navigation). The page detector (`modules/core/page-detector.js`) watches for these elements via MutationObserver.

### SPA Detection Selectors
```
#item_title_sv          — primary form indicator
#new_item               — hash target / form container
.item_form              — form wrapper class
form[action*="items"]   — form element
```

### URL Pattern
```
https://auctionet.com/admin/sas/sellers/{id}/contracts/{id}#new_item
```

## Dashboard Page (`/admin/sas`)

Entry point: `admin-dashboard.js`

### Key DOM Elements (scraped, not injected by extension)

| Element | Selector | Content |
|---------|----------|---------|
| Comments list | `#comments ul.unstyled li.comment` | Each `li` contains employee name, entity link, timestamp, body |
| Comment author | `li.comment .employee` | Employee name |
| Commented entity | `li.comment .commented a` | Link to item/buyer/claim |
| Comment timestamp | `li.comment .posted_at` | Posted date |
| Comment body | `li.comment .body` | Comment text |

### Dashboard Scraped Elements

| Element | Selector | Content |
|---------|----------|---------|
| KPI cards container | `.requested-actions` / `.requested-actions__action` | Daily stats |
| Daily goal | `.test-new-items` | "Inskrivet idag" count |
| Pipeline table | `.auction-company-stats table` | Item flow stats |
| Leaderboard | `.test-cataloger-stats` | Cataloger performance table |
| Sidebar nav | `.well--nav-list` | Navigation links with counts |
| Nav items | `.well--nav-list a` | Individual nav links |

### Dashboard Injection Points
- Extension injects KPI cards, pipeline funnel, and comment feed BEFORE the existing page content
- Uses `target.parentNode.insertBefore(container, target)` pattern
- The admin page has a `#comments` section that the extension enhances with filtering and badges

### Comment Feed (Enhanced)
```
.ext-cfeed                     — enhanced comment feed container
.ext-cfeed-item                — individual comment items
.ext-cfeed-item[data-href]     — clickable items (href from page DOM)
.ext-filter-pill               — comment filter pills
.ext-entity-badge              — entity type badges
.ext-entity-badge--buyer|seller|claim|item|invoice|transport  — entity type classes
```

### Admin Mode Gate
Dashboard features require `adminUnlocked` flag in `chrome.storage.sync` (PIN-protected).

## Valuation Request Page (`/admin/sas/valuation_requests/*`)

Entry point: `valuation-request.js`

### Key Selectors (scraped by `valuation-request-assistant.js`)

| Element | Selector | Content |
|---------|----------|---------|
| Customer name | `h1.heading` | "Varderingsforfragan fran Linda" — parsed with regex |
| Customer email | `.span7 a[href^="mailto:"]` | Email address |
| Item images | `.valuation-request-page__image img` | Customer-submitted photos |
| Description | `h2` containing "Vad som ska varderas" + following `<p>` siblings | Free text |
| Language select | `#locale_for_mail` | Email language (sv/en) |
| Accept link | `.test-yes-link` | Accept valuation link |
| Sidebar | `.span5` | Injection point for valuation results |
| Layout container | `.span7` | Main content area |

## Comments Pages (`/admin/*`)

Entry point: `comment-enhancer.js`

### Comments Section
```
#comments                              — main comments container
.comments                              — alternative container
textarea[name="comment[body]"]         — comment input field
li.comment                             — individual comment items
li.comment .commented                  — entity reference within comment
.comments-link-block                   — comments link in page header
```

### Comment Badge Injection
The enhancer injects badge indicators showing comment counts on various admin pages. Badges link to `#comments` anchor.

## Publication Scanner (Background)

The publication scanner (`publication-scanner-bg.js`) fetches admin pages via `fetch()` from the service worker:
- `/admin/sas/publishables` — list of items ready to publish (paginated HTML)
- `/admin/sas/items/{id}/edit` — item edit page (for phase 2 deep scan)
- `/admin/sas/items/{id}` — item show page (for additional data)

These are HTML pages parsed with regex/string matching, not DOM queries (no DOM in service worker).

## Brand Validation UI

```
.brand-spell-wrapper           — wrapper for fields with brand validation
.brand-spell-markers           — marker container for validation feedback
```

## Quality Score UI

```
.quality-metrics               — metrics display
.quality-header                — quality indicator header
.ai-master-button              — master "Enhance All" button
.refresh-quality-btn           — refresh button
.ai-button-wrapper             — wrapper for AI enhancement buttons
.ai-undo-button / .ai-undo-wrapper — undo functionality
```

## Artist Detection UI

```
#ai-tooltip-artist-detection   — artist detection tooltip
.artist-detection-info         — artist info display
```

## Biography Card

```
.kb-card                       — knowledge base card container
.kb-photo-area / .kb-avatar    — photo display
.kb-name / .kb-years / .kb-bio — biography fields
.kb-tags / .kb-works           — additional info
.kb-add-bio-btn                — add biography button
.kb-wrong-person               — feedback indicator
```

## Analytics Page Elements

```
#sidebar / #dashboard          — main analytics containers
#company-select / #company-id-input / #fetch-btn / #refresh-btn  — controls
.ad-kpi-grid                   — KPI grid container
.ad-ai-refresh                 — refresh button in AI insights card
.ad-ai-summary__more           — expand button in insights
```

## Common Patterns

### Dispatching Change Events
After programmatically setting field values, always dispatch a change event:
```javascript
field.value = newValue;
field.dispatchEvent(new Event('change', { bubbles: true }));
```

### Field Data Extraction (canonical source: `modules/data-extractor.js`)
```javascript
{
  category: document.querySelector('#item_category_id option:checked')?.textContent || '',
  title: document.querySelector('#item_title_sv')?.value || '',
  description: document.querySelector('#item_description_sv')?.value || '',
  condition: document.querySelector('#item_condition_sv')?.value || '',
  artist: document.querySelector('#item_artist_name_sv')?.value || '',
  keywords: document.querySelector('#item_hidden_keywords')?.value || '',
  estimate: document.querySelector('#item_current_auction_attributes_estimate')?.value || '',
  upperEstimate: document.querySelector('#item_current_auction_attributes_upper_estimate')?.value || '',
  reserve: document.querySelector('#item_current_auction_attributes_reserve')?.value || '',
  acceptedReserve: document.querySelector('#item_current_auction_attributes_accepted_reserve')?.value || ''
}
```
