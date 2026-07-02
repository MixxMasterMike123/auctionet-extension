// modules/outlet/outlet-api.js — SaS Outlet data client (Cloudflare Worker)
// Write-only from extension side: upserts items/sellers, uploads images.
// All requests routed through background.js for security (the API token
// never reaches content scripts). Backend: workers/outlet-api (D1 + R2).

export class OutletAPI {
  constructor() {
    this._config = null;
  }

  // Load outlet API config from chrome.storage.local
  async ensureConfig() {
    if (this._config) return this._config;

    const stored = await chrome.storage.local.get(['outletApiUrl', 'outletApiToken']);
    if (!stored.outletApiUrl || !stored.outletApiToken) {
      throw new Error('SaS Outlet ej konfigurerad. Ange Worker-URL och API-token i extension-popupen.');
    }

    this._config = {
      url: stored.outletApiUrl.replace(/\/$/, ''),
      token: stored.outletApiToken
    };
    return this._config;
  }

  // Set scraper reference (for fetching all images)
  setScraper(scraper) {
    this._scraper = scraper;
  }

  // Export a batch of scraped items to the outlet backend
  // Returns { success: number, failed: number, errors: string[] }
  async exportItems(items, onProgress) {
    await this.ensureConfig();

    // Verify we're talking to the right backend BEFORE writing anything —
    // catches a mispasted URL (e.g. the site Worker instead of the data API).
    const health = await this._outletRequest('GET', '/health').catch(() => null);
    if (!health || health.service !== 'sas-outlet-api') {
      throw new Error(
        'Fel backend-URL: hälsokontrollen svarade inte som sas-outlet-api. ' +
        'Kontrollera Outlet API URL i extension-popupen (ska vara Workerns URL, ' +
        't.ex. https://sas-outlet-api.<konto>.workers.dev).'
      );
    }

    let success = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        // 1. Upsert seller
        if (item.sellerId) {
          await this._upsertSeller(item);
        }

        // 2. Fetch all details from item's edit page (images, description, condition, category)
        let allImageUrls = [];
        let description = '';
        let condition = '';
        let category = '';
        if (this._scraper) {
          const details = await this._scraper.fetchItemDetails(item);
          allImageUrls = details.imageUrls;
          description = details.description;
          condition = details.condition;
          category = details.category;
        }
        // Fallback: use the single image from the unsolds table
        if (allImageUrls.length === 0 && item.fullImageUrl) {
          allImageUrls = [item.fullImageUrl];
        }

        // 3. Upload all images to R2 (the Worker fetches from the CDN itself)
        const uploadedUrls = [];
        for (let imgIdx = 0; imgIdx < allImageUrls.length; imgIdx++) {
          try {
            const suffix = imgIdx === 0 ? 'full' : `img_${imgIdx + 1}`;
            const publicUrl = await this._uploadImage(item.id, allImageUrls[imgIdx], suffix);
            uploadedUrls.push(publicUrl);
          } catch (imgError) {
            console.warn(`[Outlet] Image ${imgIdx + 1} upload failed for item ${item.id}:`, imgError);
          }
        }

        // Upload thumbnail separately
        let thumbUrl = null;
        if (item.thumbUrl) {
          try {
            thumbUrl = await this._uploadImage(item.id, item.thumbUrl, 'thumb');
          } catch (e) {
            // Non-critical
          }
        }

        // 4. Upsert item — the Worker only applies `status` to NEW rows and
        // enforces the 2000 kr valuation cap server-side, so a re-export can
        // never overwrite a curated status.
        await this._upsertItem(item, uploadedUrls, thumbUrl, description, condition, category);

        success++;
      } catch (error) {
        failed++;
        errors.push(`Item ${item.id}: ${error.message}`);
        console.error(`[Outlet] Failed to export item ${item.id}:`, error);
      }

      if (onProgress) onProgress(i + 1, items.length, success, failed);
    }

    return { success, failed, errors };
  }

  // Upsert a seller record
  async _upsertSeller(item) {
    const seller = {
      id: item.sellerId,
      name: item.sellerName || 'Okänd säljare',
      email: item.sellerEmail || null,
      phone: item.sellerPhone || null
    };

    return this._outletRequest('POST', '/sellers', seller);
  }

  // Check if item already exists in the outlet DB (404 → null → false)
  async _itemExists(itemId) {
    const data = await this._outletRequest('GET', `/items/${itemId}`);
    return data !== null;
  }

  // Upsert an item record — only include fields with values to avoid overwriting with null
  async _upsertItem(item, uploadedUrls, thumbUrl, description, condition, category) {
    const record = {
      id: item.id,
      title: item.title,
      price: 200
    };

    // Suggested status for NEW items — the Worker ignores this for existing
    // rows and downgrades over-cap valuations to 'ignored'.
    const needsApproval = (item.reserve || 0) > 300;
    record.status = needsApproval ? 'pending_approval' : 'available';

    // Only set fields that have actual values — never overwrite existing data with null
    if (description) record.description = description;
    if (condition) record.condition = condition;
    if (uploadedUrls.length > 0) {
      record.image_url = uploadedUrls[0];
      record.image_urls = uploadedUrls;
    }
    if (thumbUrl) record.image_thumb_url = thumbUrl;
    if (item.fullImageUrl) record.original_image_url = item.fullImageUrl;
    if (category) record.category = category;
    // != null: _parseNumeric returns null for missing, but 0 is a real value
    if (item.estimate != null) record.original_estimate = item.estimate;
    if (item.reserve != null) record.original_reserve = item.reserve;
    if (item.warehouseLocation) record.warehouse_location = item.warehouseLocation;
    if (item.sellerId) record.seller_id = item.sellerId;
    if (item.contractId) record.contract_id = item.contractId;

    return this._outletRequest('POST', '/items', record);
  }

  // Upload an image via background.js — the Worker pulls from the CDN
  async _uploadImage(itemId, sourceUrl, type) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'outlet-upload-image',
          sourceUrl,
          itemId,
          imageType: type
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.publicUrl);
          } else {
            reject(new Error(response?.error || 'Image upload failed'));
          }
        }
      );
    });
  }

  // Make an outlet API request via background.js
  async _outletRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'outlet-fetch',
          method,
          path,
          body
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Outlet API request failed'));
          }
        }
      );
    });
  }

  // Check if config is set up
  async isConfigured() {
    try {
      await this.ensureConfig();
      return true;
    } catch (e) {
      return false;
    }
  }
}
