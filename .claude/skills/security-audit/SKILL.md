---
name: security-audit
description: Security audit and vulnerability testing for the Auctionet Chrome Extension — XSS, injection, API key exposure, CSP, message passing, DOM manipulation, and OWASP top 10 checks. Use when reviewing code for security flaws, hardening the extension, testing for XSS or injection vulnerabilities, or auditing API key handling and message passing security.
user-invocable: true
argument-hint: "focus area (e.g. 'XSS', 'API key', 'message passing', 'full audit')"
---

# Security Audit Skill

## Purpose

Systematic security review of the Auctionet Chrome Extension. Identifies vulnerabilities across the extension's attack surface: DOM manipulation, message passing, API key handling, external data processing, and content injection.

## Audit Methodology

When invoked, perform a targeted or full security audit depending on the user's focus area. Follow this checklist structure:

### 1. XSS and DOM Injection

The extension injects content into Auctionet admin pages. Every DOM insertion is an XSS vector.

**What to check:**
- All uses of `innerHTML`, `insertAdjacentHTML`, `outerHTML` — verify input is escaped
- The extension uses `modules/core/html-escape.js` (`escapeHTML()`) — confirm it's used on ALL user-supplied or API-returned data before DOM insertion
- Template literals that build HTML strings — look for unescaped interpolations
- `document.createElement` + `textContent` is safe; `innerHTML` with unescaped data is not
- AI responses from Claude are untrusted data — they must be escaped before rendering
- **HTML attribute values** — `data-href`, `title`, `href` attributes in template literals must also be escaped (quotes can break out of attributes)
- **`innerHTML +=` pattern** — reads and re-parses existing HTML, risky if content changes. Prefer `insertAdjacentHTML` or `createElement` + `append`
- **Reading page HTML and re-injecting** — `bodyEl.innerHTML` from page DOM re-inserted into extension HTML is a potential XSS sink even if "trusted"

**Common patterns to grep for:**
```
innerHTML
insertAdjacentHTML
outerHTML
document.write
```

**Safe patterns (no action needed):**
```
textContent =
createElement(
escapeHTML(
```

### 2. API Key Security

The Anthropic API key is the most sensitive asset.

**What to check:**
- Key stored in `chrome.storage.local` (not `sync`) — verified in background.js
- Key never sent to content scripts or exposed in DOM
- Key never logged to console (search for `console.log` near API key references)
- Key not included in error messages sent back to content scripts
- `sendResponse` from background.js should never include the API key
- Popup's "Test Connection" flow: key passed via message, used, then discarded

**Grep patterns:**
```
apiKey
anthropicApiKey
x-api-key
```

### 3. Message Passing Security

Chrome runtime messaging between content scripts and background service worker.

**What to check:**
- `sender.id` verification in background.js message handler — only accept messages from own extension
- No `chrome.runtime.onMessageExternal` listener (would allow cross-extension messaging)
- Message types are validated before processing
- No wildcard or permissive origin checks
- Content scripts should not blindly trust message responses from background

**Grep patterns:**
```
onMessage
onMessageExternal
sendMessage
sender.id
sender.url
```

### 4. External Data Handling

Data from Auctionet API, Wikipedia API, and AI responses.

**What to check:**
- Auctionet API responses parsed as JSON, not injected as HTML
- Wikipedia API responses (artist info, images) — URLs validated against allowlist
- Image fetch domain allowlisting (`ALLOWED_IMAGE_DOMAINS` in background.js)
- AI/Claude responses treated as untrusted — escaped before DOM insertion
- No `eval()` or `Function()` on external data
- No `javascript:` URLs constructed from external data

**Grep patterns:**
```
eval(
new Function(
javascript:
ALLOWED_IMAGE_DOMAINS
```

### 5. Content Security Policy (CSP)

**What to check:**
- `manifest.json` CSP directives — should not allow `unsafe-eval` or `unsafe-inline`
- No remote script loading (`script-src` should be `self` only)
- `connect-src` should be limited to required API endpoints

### 6. Storage Security

**What to check:**
- Sensitive data in `chrome.storage.local` (not `sync`)
- No sensitive data in `localStorage` (accessible to page scripts)
- `localStorage` IS used for non-sensitive data (UI state, cache, artist ignore lists) — this is correct but verify nothing sensitive leaks there
- Cache data does not contain sensitive user information beyond what's needed
- Storage keys are namespaced to avoid collision

**Grep patterns:**
```
localStorage
chrome.storage.sync
chrome.storage.local
sessionStorage
```

### 7. Permission Scope

**What to check in manifest.json:**
- Permissions are minimal (principle of least privilege)
- Host permissions limited to required domains
- No overly broad permissions like `<all_urls>` or `tabs` without need
- `activeTab` preferred over broad host permissions where possible

### 8. URL and Navigation Security

**What to check:**
- No `window.open()` with user-controlled URLs without validation
- No `location.href` assignments from untrusted data
- Links created from external data use `rel="noopener noreferrer"`
- URL construction uses `new URL()` for validation, not string concatenation

**Grep patterns:**
```
window.open
location.href
location.assign
target="_blank"
```

### 9. Fetch and Network Requests

**What to check:**
- All fetch calls use HTTPS (no HTTP)
- No credentials sent to unexpected domains
- CORS handling is correct
- AbortController timeouts are in place (prevent hung requests)
- No SSRF vectors (user-controlled URLs passed to fetch)

### 10. Third-Party and Supply Chain

**What to check:**
- No external CDN scripts loaded at runtime
- No third-party dependencies that could be compromised
- All code is first-party (vanilla JS, no npm packages)
- No dynamic script injection from remote sources

## Output Format

For each finding, report:

```
### [SEVERITY] Finding Title

**Location:** file.js:line
**Category:** XSS / API Key / Message Passing / etc.
**Risk:** What could an attacker do?
**Evidence:** The vulnerable code snippet
**Fix:** Recommended remediation
```

Severity levels:
- **CRITICAL** — Exploitable now, leads to key theft or arbitrary code execution
- **HIGH** — Exploitable with some conditions, data exposure or privilege escalation
- **MEDIUM** — Defense-in-depth gap, exploitable in specific scenarios
- **LOW** — Best practice violation, no immediate exploit path
- **INFO** — Observation, no security impact but worth noting

## How to Run

1. If focus area specified, audit only that category
2. If "full audit", work through all 10 categories systematically
3. Use Grep extensively to find patterns across the codebase
4. Read suspicious files in full to understand context
5. Report findings with severity, location, and fix recommendations
6. Summarize with a security posture assessment
