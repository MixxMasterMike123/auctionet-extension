// modules/outlet/outlet-scraper.js — DOM parsing for /admin/sas/unsolds page
// Extracts item data from the unsolds table for export to SaS Outlet

export class OutletScraper {
  constructor() {
    this._backgroundFetch = this._backgroundFetch.bind(this);
  }

  // Scrape all visible items from the current unsolds page
  scrapeCurrentPage() {
    const items = [];
    const rows = document.querySelectorAll('tr[class*="test-item-"]');

    for (const row of rows) {
      const item = this._parseRow(row);
      if (item) items.push(item);
    }

    return items;
  }

  // Scrape all pages (batch mode) — fetches HTML via background.js
  async scrapeAllPages(onProgress) {
    const totalPages = this._detectTotalPages();
    const currentPage = this._detectCurrentPage();
    const allItems = [];

    // Scrape current page first (already loaded)
    const currentItems = this.scrapeCurrentPage();
    allItems.push(...currentItems);
    if (onProgress) onProgress(1, totalPages, allItems.length);

    // Fetch remaining pages via background.js
    for (let page = 1; page <= totalPages; page++) {
      if (page === currentPage) continue; // Already scraped

      try {
        const url = this._buildPageUrl(page);
        const html = await this._backgroundFetch(url);
        const pageItems = this._parseHtml(html);
        allItems.push(...pageItems);
        if (onProgress) onProgress(page, totalPages, allItems.length);

        // Small delay to be nice to the server
        await this._sleep(200);
      } catch (error) {
        console.error(`[Outlet] Failed to scrape page ${page}:`, error);
      }
    }

    return allItems;
  }

  // Parse a single table row into an item object
  _parseRow(row) {
    try {
      const classMatch = row.className.match(/test-item-(\d+)/);
      if (!classMatch) return null;

      const itemId = parseInt(classMatch[1]);
      const cells = row.querySelectorAll('td');
      if (cells.length < 7) return null;

      // Cell 0: image + title + edit link
      const imgLink = cells[0].querySelector('a[href*="images.auctionet.com"]');
      const fullImageUrl = imgLink?.getAttribute('href') || '';
      const thumbImg = cells[0].querySelector('img');
      const thumbUrl = thumbImg?.getAttribute('src') || '';

      const titleLink = cells[0].querySelector('p.item-info a[title]');
      const rawTitle = titleLink?.getAttribute('title') || '';
      const title = rawTitle.replace(/^\d+\.\s*/, ''); // Strip "4894862. " prefix

      const editLink = cells[0].querySelector('a[href*="/edit"]');
      const editHref = editLink?.getAttribute('href') || '';
      const editMatch = editHref.match(/sellers\/(\d+)\/contracts\/(\d+)/);
      const sellerId = editMatch ? parseInt(editMatch[1]) : null;
      const contractId = editMatch ? parseInt(editMatch[2]) : null;

      // Cell 1: end time + warehouse location
      const locationPs = cells[1].querySelectorAll('p');
      const warehouseLocation = locationPs.length >= 2 ? locationPs[1].textContent.trim() : '';

      // Cell 2: relisting info + seller contact
      const { sellerName, sellerEmail, sellerPhone } = this._parseSellerInfo(cells[2]);

      // Cells 3-6: numeric values
      const estimate = this._parseNumeric(cells[3]);
      const reserve = this._parseNumeric(cells[4]);
      const highestBid = this._parseNumeric(cells[5]);
      const storageDays = this._parseNumeric(cells[6]);

      return {
        id: itemId,
        title,
        fullImageUrl,
        thumbUrl,
        warehouseLocation,
        sellerId,
        contractId,
        sellerName,
        sellerEmail,
        sellerPhone,
        estimate,
        reserve,
        highestBid,
        storageDays
      };
    } catch (error) {
      console.error('[Outlet] Failed to parse row:', error);
      return null;
    }
  }

  // Extract seller contact info from the relisting/omlistning cell
  _parseSellerInfo(cell) {
    let sellerName = '';
    let sellerEmail = '';
    let sellerPhone = '';

    // Seller info is in a <p> after .test-seller-info
    const sellerInfoLabel = cell.querySelector('.test-seller-info');
    if (!sellerInfoLabel) return { sellerName, sellerEmail, sellerPhone };

    // The actual contact details are in the next <p> sibling
    let detailP = sellerInfoLabel.nextElementSibling;
    while (detailP && detailP.tagName !== 'P') {
      detailP = detailP.nextElementSibling;
    }
    if (!detailP) return { sellerName, sellerEmail, sellerPhone };

    // Name is the first text node (before <br>)
    const firstChild = detailP.firstChild;
    if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
      sellerName = firstChild.textContent.trim();
    }

    // Email from mailto link
    const emailLink = detailP.querySelector('a[href^="mailto:"]');
    if (emailLink) {
      sellerEmail = emailLink.textContent.trim();
    }

    // Phone is typically the last text content after the last <br>
    const childNodes = Array.from(detailP.childNodes);
    for (let i = childNodes.length - 1; i >= 0; i--) {
      const node = childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        // Phone numbers: digits, spaces, dashes, plus signs
        if (text && /[\d\s+-]{7,}/.test(text)) {
          sellerPhone = text;
          break;
        }
      }
    }

    return { sellerName, sellerEmail, sellerPhone };
  }

  // Parse Swedish-formatted numeric cell ("500 SEK" or "1 500 SEK" → number)
  _parseNumeric(cell) {
    if (!cell) return null;
    const text = cell.textContent.replace(/[^\d]/g, '');
    return text ? parseInt(text) : null;
  }

  // Parse HTML string into item array (for batch mode)
  _parseHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const items = [];

    const rows = doc.querySelectorAll('tr[class*="test-item-"]');
    for (const row of rows) {
      const item = this._parseRow(row);
      if (item) items.push(item);
    }

    return items;
  }

  // Detect total number of pages from pagination links
  _detectTotalPages() {
    let maxPage = 1;
    const links = document.querySelectorAll('.pagination a[aria-label*="Sida"]');
    for (const link of links) {
      const match = link.getAttribute('href')?.match(/page=(\d+)/);
      if (match) {
        maxPage = Math.max(maxPage, parseInt(match[1]));
      }
    }
    return maxPage;
  }

  // Detect which page we're currently on
  _detectCurrentPage() {
    const active = document.querySelector('.pagination li.active a[aria-label*="Sida"]');
    if (active) {
      const match = active.getAttribute('href')?.match(/page=(\d+)/);
      if (match) return parseInt(match[1]);
    }
    return 1;
  }

  // Build URL for a specific page, preserving current filter
  _buildPageUrl(page) {
    const url = new URL(window.location.href);
    url.searchParams.set('page', page.toString());
    if (!url.searchParams.has('filter')) {
      url.searchParams.set('filter', 'not_autorelistable');
    }
    return url.toString();
  }

  // Fetch all details from an item's admin show page:
  // - All image URLs
  // - Description (Beskrivning)
  // - Condition report (Konditionsrapport)
  async fetchItemDetails(itemId) {
    try {
      const url = `https://auctionet.com/admin/items/${itemId}`;
      const html = await this._backgroundFetch(url);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Extract all images
      const imageUrls = [];
      doc.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (src.includes('images.auctionet.com') && !src.includes('placeholder')) {
          const parentLink = img.closest('a');
          const fullUrl = parentLink ? (parentLink.getAttribute('href') || '') : '';

          if (fullUrl && fullUrl.includes('images.auctionet.com')) {
            imageUrls.push(fullUrl);
          } else if (src.includes('/thumbs/')) {
            imageUrls.push(src.replace('/thumbs/mini_', '/uploads/'));
          } else {
            imageUrls.push(src);
          }
        }
      });

      // Extract description and condition from details section
      let description = '';
      let condition = '';

      const detailsSection = doc.querySelector('.details-texts') || doc.querySelector('.row.details-texts');
      if (detailsSection) {
        const headings = detailsSection.querySelectorAll('h5');
        headings.forEach(h5 => {
          const label = h5.textContent.trim().toLowerCase();
          const valueDiv = h5.nextElementSibling;
          if (!valueDiv) return;
          const text = valueDiv.textContent.trim();

          if (label.includes('beskrivning')) {
            description = text;
          } else if (label.includes('kondition')) {
            condition = text;
          }
        });
      }

      return {
        imageUrls: [...new Set(imageUrls)],
        description,
        condition
      };
    } catch (error) {
      console.error(`[Outlet] Failed to fetch details for item ${itemId}:`, error);
      return { imageUrls: [], description: '', condition: '' };
    }
  }

  // Fetch admin HTML via background.js (uses session cookies)
  async _backgroundFetch(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'fetch-admin-html', url },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.html);
          } else {
            reject(new Error(response?.error || 'Unknown fetch error'));
          }
        }
      );
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
