// modules/auctionet-artist-lookup.js
// Fetch verified artist biographies from Auctionet's artist pages
// Replaces AI-generated biographies to eliminate hallucinations

export class AuctionetArtistLookup {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 14 * 24 * 60 * 60 * 1000; // 14 days (biographies rarely change)
        this.baseUrl = 'https://auctionet.com/sv/artists';
    }

    /**
     * Get artist biography from Auctionet
     * @param {string} artistName - Artist name to look up
     * @returns {Promise<Object|null>} Biography object or null if not found
     */
    async getArtistBiography(artistName) {
        if (!artistName || typeof artistName !== 'string') {
            return null;
        }

        // Check cache first
        const cached = this.getCachedBiography(artistName);
        if (cached) {
            console.log(`📦 Using cached biography for: ${artistName}`);
            return cached;
        }

        try {
            console.log(`🔍 Fetching Auctionet biography for: ${artistName}`);

            // Try to fetch artist page
            const biography = await this.fetchArtistPage(artistName);

            if (biography) {
                // Cache successful result
                this.setCachedBiography(artistName, biography);
                return biography;
            }

            // Cache the "not found" result to avoid repeated lookups
            this.setCachedBiography(artistName, { notFound: true });
            return null;

        } catch (error) {
            console.error(`❌ Error fetching artist biography for ${artistName}:`, error);
            return null;
        }
    }

    /**
   * Fetch and parse artist page from Auctionet
   * @param {string} artistName - Artist name
   * @returns {Promise<Object|null>} Parsed biography or null
   */
    async fetchArtistPage(artistName) {
        // Create URL slug from artist name with different variations
        const slugs = this.createSlugVariations(artistName);

        // Try different URL patterns
        const urlPatterns = [];

        // STRATEGY 1: Try all slug variations without ID first (sometimes works)
        for (const slug of slugs) {
            urlPatterns.push(`${this.baseUrl}/${slug}`);
        }

        // Try all URLs
        for (const url of urlPatterns) {
            try {
                console.log(`🌐 Trying URL: ${url}`);

                const response = await fetch(url);

                if (response.ok) {
                    const html = await response.text();
                    const biography = this.parseBiographyFromHTML(html, artistName);

                    if (biography) {
                        biography.url = url;
                        biography.source = 'auctionet';
                        biography.verified = true;
                        console.log(`✅ Found biography at: ${url}`);
                        return biography;
                    }
                } else {
                    console.log(`⚠️ ${response.status} for ${url}`);
                }
            } catch (error) {
                console.warn(`⚠️ Failed to fetch ${url}:`, error.message);
                continue;
            }
        }

        // STRATEGY 2: Try to find artist ID via items API
        console.log(`🔍 Trying to find artist ID for: ${artistName}`);
        const artistId = await this.findArtistIdViaItemsAPI(artistName);

        if (artistId) {
            console.log(`✅ Found artist ID: ${artistId}`);

            // Try URLs with ID + slug combinations
            for (const slug of slugs) {
                const urlWithId = `${this.baseUrl}/${artistId}-${slug}`;

                try {
                    console.log(`🌐 Trying URL with ID: ${urlWithId}`);

                    const response = await fetch(urlWithId);

                    if (response.ok) {
                        const html = await response.text();
                        const biography = this.parseBiographyFromHTML(html, artistName);

                        if (biography) {
                            biography.url = urlWithId;
                            biography.source = 'auctionet';
                            biography.verified = true;
                            console.log(`✅ Found biography at: ${urlWithId}`);
                            return biography;
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to fetch ${urlWithId}:`, error.message);
                    continue;
                }
            }
        }

        console.log(`❌ No Auctionet page found after trying all strategies`);
        return null;
    }

    /**
   * Try to find artist ID by searching items API
   * @param {string} artistName - Artist name
   * @returns {Promise<number|null>} Artist ID or null
   */
    async findArtistIdViaItemsAPI(artistName) {
        try {
            // Search for items by this artist
            const searchUrl = `https://auctionet.com/api/v2/items.json?q=artist:"${encodeURIComponent(artistName)}"&per_page=1`;

            console.log(`🔍 Searching items API: ${searchUrl}`);

            const response = await fetch(searchUrl);

            if (!response.ok) {
                console.log(`⚠️ Items API returned ${response.status}`);
                return null;
            }

            const data = await response.json();

            // Log what we actually got to debug
            if (data.items && data.items.length > 0) {
                const firstItem = data.items[0];
                console.log(`📊 Item data keys:`, Object.keys(firstItem));
                console.log(`📊 Item artist field:`, firstItem.artist);

                // Try to extract artist ID from item data
                if (firstItem.artist_id) {
                    console.log(`✅ Found artist_id in item: ${firstItem.artist_id}`);
                    return firstItem.artist_id;
                }

                // Try to extract from artist_url if available
                if (firstItem.artist_url) {
                    console.log(`🔗 Found artist_url: ${firstItem.artist_url}`);
                    const match = firstItem.artist_url.match(/\/artists\/(\d+)-/);
                    if (match) {
                        return parseInt(match[1]);
                    }
                }

                // Try to extract from URL field (might contain artist link)
                if (firstItem.url) {
                    console.log(`🔗 Item URL: ${firstItem.url}`);
                }

                // If we have the artist name from API, try direct Auctionet search
                if (firstItem.artist) {
                    console.log(`👤 Artist name from API: "${firstItem.artist}"`);

                    // Last resort: Try to fetch the item page and extract artist link
                    return await this.extractArtistIdFromItemPage(firstItem.url);
                }
            } else {
                console.log(`ℹ️ No items found for artist: ${artistName}`);
            }

            return null;

        } catch (error) {
            console.error(`❌ Error searching items API:`, error);
            return null;
        }
    }

    /**
     * Try to extract artist ID from an item page
     * @param {string} itemUrl - URL of an auction item
     * @returns {Promise<number|null>} Artist ID or null
     */
    async extractArtistIdFromItemPage(itemUrl) {
        if (!itemUrl) return null;

        try {
            console.log(`🔍 Trying to extract artist ID from item page: ${itemUrl}`);

            const response = await fetch(itemUrl);
            if (!response.ok) return null;

            const html = await response.text();

            // Look for artist link in the HTML
            // Pattern: <a href="/sv/artists/62-ardy-struwer">
            const artistLinkMatch = html.match(/href="\/sv\/artists\/(\d+)-[^"]+"/);

            if (artistLinkMatch) {
                const artistId = parseInt(artistLinkMatch[1]);
                console.log(`✅ Extracted artist ID from item page: ${artistId}`);
                return artistId;
            }

            console.log(`⚠️ No artist link found in item page`);
            return null;

        } catch (error) {
            console.error(`❌ Error extracting artist ID from item page:`, error);
            return null;
        }
    }
    /**
     * Parse biography section from Auctionet HTML
     * @param {string} html - HTML content
     * @param {string} artistName - Artist name for validation
     * @returns {Object|null} Parsed biography or null
     */
    parseBiographyFromHTML(html, artistName) {
        try {
            // Create a temporary DOM parser
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Extract artist name from page (usually in h1)
            const nameElement = doc.querySelector('h1');
            const pageName = nameElement ? nameElement.textContent.trim() : null;

            // Extract years (usually near the name)
            const years = this.extractYears(doc);

            // Find biography section
            // Look for h2 with "Biografi" text
            const bioHeaders = Array.from(doc.querySelectorAll('h2, h3'));
            const bioHeader = bioHeaders.find(h => h.textContent.toLowerCase().includes('biografi'));

            if (!bioHeader) {
                console.warn('⚠️ No biography section found on page');
                return null;
            }

            // Extract all text content after biography header until next h2/h3
            let biographyText = '';
            let element = bioHeader.nextElementSibling;

            while (element && !element.matches('h2, h3')) {
                if (element.matches('p')) {
                    const text = element.textContent.trim();
                    if (text && !text.includes('Kontakta oss')) {
                        biographyText += text + '\n\n';
                    }
                } else if (element.matches('h3, h4')) {
                    // Include subsection headers
                    biographyText += '**' + element.textContent.trim() + '**\n\n';
                }
                element = element.nextElementSibling;
            }

            biographyText = biographyText.trim();

            if (!biographyText) {
                console.warn('⚠️ Empty biography text');
                return null;
            }

            return {
                artist: pageName || artistName,
                years: years,
                biography: biographyText,
                source: 'auctionet',
                verified: true,
                fetchedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error parsing biography HTML:', error);
            return null;
        }
    }

    /**
     * Extract birth/death years from page
     * @param {Document} doc - Parsed HTML document
     * @returns {string|null} Years string (e.g., "1939-2023")
     */
    extractYears(doc) {
        // Look for patterns like "1939-2023" or "1939–2023" near the name
        const textContent = doc.body.textContent;

        // Match year patterns: YYYY-YYYY or YYYY–YYYY
        const yearPattern = /(\d{4})[–-](\d{4})/;
        const match = textContent.match(yearPattern);

        if (match) {
            return `${match[1]}–${match[2]}`;
        }

        // Try to find birth year only (for living artists)
        const birthYearPattern = /\b(\d{4})–?\b/;
        const birthMatch = textContent.match(birthYearPattern);

        if (birthMatch) {
            return `${birthMatch[1]}–`;
        }

        return null;
    }

    /**
   * Create URL slug variations from artist name to handle different spellings
   * @param {string} name - Artist name
   * @returns {string[]} Array of possible URL slugs
   */
    createSlugVariations(name) {
        const variations = [];

        // Normalize to lowercase and trim
        let normalized = name.toLowerCase().trim();

        // Version 1: Replace common special characters
        let slug1 = normalized
            .replace(/å/g, 'a')
            .replace(/ä/g, 'a')
            .replace(/ö/g, 'o')
            .replace(/ü/g, 'u')  // German ü
            .replace(/ö/g, 'o')  // German ö
            .replace(/ä/g, 'a')  // German ä
            .replace(/é/g, 'e')
            .replace(/è/g, 'e')
            .replace(/ë/g, 'e')
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');

        variations.push(slug1);

        // Version 2: Try with 'ue' for 'ü' (German alternative spelling)
        let slug2 = normalized
            .replace(/ü/g, 'ue')
            .replace(/ö/g, 'oe')
            .replace(/ä/g, 'ae')
            .replace(/å/g, 'a')
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');

        if (slug2 !== slug1) {
            variations.push(slug2);
        }

        // Version 3: Remove all special chars (most aggressive)
        let slug3 = normalized
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');

        if (slug3 !== slug1 && slug3 !== slug2) {
            variations.push(slug3);
        }

        console.log(`🔤 Generated slug variations for "${name}":`, variations);
        return variations;
    }

    /**
     * Create URL slug from artist name (legacy method, kept for compatibility)
     * @param {string} name - Artist name
     * @returns {string} URL-friendly slug
     */
    createSlug(name) {
        // Use first variation from createSlugVariations
        return this.createSlugVariations(name)[0];
    }

    /**
     * Get cached biography
     * @param {string} artistName - Artist name
     * @returns {Object|null} Cached biography or null
     */
    getCachedBiography(artistName) {
        const cacheKey = artistName.toLowerCase().trim();
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.notFound ? null : cached.data;
        }

        return null;
    }

    /**
     * Set cached biography
     * @param {string} artistName - Artist name
     * @param {Object} biography - Biography object
     */
    setCachedBiography(artistName, biography) {
        const cacheKey = artistName.toLowerCase().trim();
        this.cache.set(cacheKey, {
            data: biography,
            timestamp: Date.now(),
            notFound: biography.notFound || false
        });
    }

    /**
     * Clear cache (useful for testing)
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑️ Artist biography cache cleared');
    }

    /**
     * Get fallback link to Auctionet search
     * @param {string} artistName - Artist name
     * @returns {string} Search URL
     */
    getAuctionetSearchUrl(artistName) {
        return `https://auctionet.com/sv/search?q=artist:"${encodeURIComponent(artistName)}"`;
    }
}
