// Offscreen document — provides DOMParser for the background service worker.
// Service workers cannot use DOMParser directly, so HTML parsing is delegated here.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'offscreen') return;

  if (request.type === 'parse-publishables') {
    sendResponse(parsePublishablesPage(request.html));
    return;
  }
  if (request.type === 'detect-pages') {
    sendResponse(detectPublishablePages(request.html));
    return;
  }
  if (request.type === 'parse-show-page') {
    sendResponse(parseShowPageForScan(request.html));
    return;
  }
  if (request.type === 'parse-edit-page') {
    sendResponse(parseEditPageFields(request.html));
    return;
  }
});

function parsePublishablesPage(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items = [];

  doc.querySelectorAll('tr').forEach(tr => {
    const imgTd = tr.querySelector('td.square-image');
    if (!imgTd) return;

    const itemLink = tr.querySelector('a[title]');
    if (!itemLink) return;

    const title = (itemLink.getAttribute('title') || '').trim();
    const idMatch = title.match(/^(\d+)\./);
    const itemId = idMatch ? parseInt(idMatch[1]) : null;
    if (!itemId) return;

    const editLink = Array.from(tr.querySelectorAll('a')).find(a =>
      a.textContent.trim() === 'Redigera'
    );
    const editUrl = editLink ? editLink.getAttribute('href') : null;
    const hasImage = !!imgTd.querySelector('img');

    items.push({ itemId, title, editUrl, hasImage });
  });
  return items;
}

function detectPublishablePages(html) {
  const normalized = html.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ');
  const match = normalized.match(/Visar resultat\s+\d+\s*[-–]\s*(\d+)\s+av\s+(\d[\d\s]*)/i);
  if (match) {
    const perPage = parseInt(match[1]);
    const total = parseInt(match[2].replace(/\s/g, ''));
    if (total > 0 && perPage > 0) return Math.ceil(total / perPage);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  let maxPage = 1;
  doc.querySelectorAll('a[href*="page="]').forEach(a => {
    const m = a.getAttribute('href').match(/page=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1]));
  });
  return maxPage;
}

function parseShowPageForScan(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let imageCount = 0;
  doc.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (src.includes('images.auctionet.com') && !src.includes('placeholder')) {
      imageCount++;
    }
  });

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

  return { imageCount, description, condition };
}

function parseEditPageFields(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let keywords = '';
  const kwEl = doc.querySelector('#item_hidden_keywords') ||
               doc.querySelector('input[name*="keywords"]') ||
               doc.querySelector('textarea[name*="keywords"]');
  if (kwEl) {
    const tagName = kwEl.tagName.toLowerCase();
    if (tagName === 'textarea') {
      keywords = (kwEl.textContent || '').trim();
    } else {
      keywords = (kwEl.getAttribute('value') || '').trim();
    }
  }

  let editTitle = '';
  const titleEl = doc.querySelector('#item_title_sv');
  if (titleEl) editTitle = (titleEl.getAttribute('value') || titleEl.textContent || '').trim();

  let artist = '';
  const artistEl = doc.querySelector('#item_artist_name_sv');
  if (artistEl) artist = (artistEl.getAttribute('value') || artistEl.textContent || '').trim();

  let estimate = 0;
  const estEl = doc.querySelector('#item_current_auction_attributes_estimate');
  if (estEl) estimate = parseFloat(estEl.getAttribute('value')) || 0;

  return { keywords, editTitle, artist, estimate };
}
