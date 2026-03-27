// modules/outlet/outlet-api.js — Supabase REST client for SaS Outlet
// Write-only from extension side: upserts items/sellers, uploads images
// All requests routed through background.js for security (service key never in content script)

export class OutletAPI {
  constructor() {
    this._config = null;
  }

  // Load Supabase config from chrome.storage.local
  async ensureConfig() {
    if (this._config) return this._config;

    const stored = await chrome.storage.local.get(['outletSupabaseUrl', 'outletSupabaseServiceKey']);
    if (!stored.outletSupabaseUrl || !stored.outletSupabaseServiceKey) {
      throw new Error('SaS Outlet ej konfigurerad. Ange Supabase URL och Service Key i extension-popupen.');
    }

    this._config = {
      url: stored.outletSupabaseUrl.replace(/\/$/, ''),
      serviceKey: stored.outletSupabaseServiceKey
    };
    return this._config;
  }

  // Set scraper reference (for fetching all images)
  setScraper(scraper) {
    this._scraper = scraper;
  }

  // Export a batch of scraped items to Supabase
  // Returns { success: number, failed: number, errors: string[] }
  async exportItems(items, onProgress) {
    await this.ensureConfig();
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

        // 2. Fetch all details from item's admin show page (images, description, condition)
        let allImageUrls = [];
        let description = '';
        let condition = '';
        if (this._scraper) {
          const details = await this._scraper.fetchItemDetails(item.id);
          allImageUrls = details.imageUrls;
          description = details.description;
          condition = details.condition;
        }
        // Fallback: use the single image from the unsolds table
        if (allImageUrls.length === 0 && item.fullImageUrl) {
          allImageUrls = [item.fullImageUrl];
        }

        // 3. Upload all images to Supabase Storage
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

        // 4. Upsert item
        await this._upsertItem(item, uploadedUrls, thumbUrl, description, condition);

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

    return this._supabaseRequest('POST', '/rest/v1/sellers', seller, {
      'Prefer': 'resolution=merge-duplicates'
    });
  }

  // Upsert an item record
  async _upsertItem(item, uploadedUrls, thumbUrl, description, condition) {
    const record = {
      id: item.id,
      title: item.title,
      description: description || null,
      condition: condition || null,
      image_url: uploadedUrls[0] || null,
      image_urls: uploadedUrls.length > 0 ? uploadedUrls : null,
      image_thumb_url: thumbUrl,
      original_image_url: item.fullImageUrl || null,
      category: null, // Set later in admin UI
      price: 200,
      original_estimate: item.estimate,
      original_reserve: item.reserve,
      warehouse_location: item.warehouseLocation || null,
      seller_id: item.sellerId,
      contract_id: item.contractId,
      status: 'available',
      scraped_at: new Date().toISOString()
    };

    return this._supabaseRequest('POST', '/rest/v1/items', record, {
      'Prefer': 'resolution=merge-duplicates'
    });
  }

  // Upload an image to Supabase Storage via background.js
  async _uploadImage(itemId, sourceUrl, type) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'supabase-upload-image',
          sourceUrl,
          storagePath: `items/${itemId}/${type}.jpg`,
          bucket: 'item-images'
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

  // Make a Supabase REST API request via background.js
  async _supabaseRequest(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'supabase-fetch',
          method,
          path,
          body,
          extraHeaders
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Supabase request failed'));
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
