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
input[type="checkbox"][value="Inga anmarkning"]
input[type="checkbox"][name*="no_remarks"]
```

### Images
- Item images are in the page DOM, typically within `.item-images` or similar containers
- Image URLs from CDN: `https://images.auctionet.com/`

### Page Layout — Injection Points
- The extension injects AI buttons **after** each form field using `field.parentNode.insertBefore(wrapper, field.nextSibling)`
- Quality score panel is injected near the top of the form
- Market analysis dashboard is injected as a sidebar or below the form
- The form fields are typically inside a `<form>` with `action` containing `/items/`

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

### Dashboard Injection Points
- Extension injects KPI cards, pipeline funnel, and comment feed BEFORE the existing page content
- Uses `target.parentNode.insertBefore(container, target)` pattern
- The admin page has a `#comments` section that the extension enhances with filtering and badges

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
