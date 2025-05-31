/**
 * SearchQueryManager - Single Source of Truth for all search query operations
 * Manages search queries, URL generation, context creation, and term analysis
 * 
 * CONSOLIDATED FROM:
 * - item-type-handlers.js (search generation logic)
 * - sales-analysis-manager.js (search context creation)
 * - search-filter-manager.js (query building)
 * - dashboard-manager.js (URL generation)
 * - api-manager.js (URL encoding)
 */

export class SearchQueryManager {
    constructor() {
        // SSoT: Current search query state
        this.currentQuery = '';
        this.selectedTerms = new Set();
        this.availableTerms = [];
        this.coreTerms = new Set(); // Protected terms that should never be removed
        
        // Change listeners for real-time updates
        this.listeners = [];
        
        console.log('🔧 SearchQueryManager initialized as Single Source of Truth');
    }

    /**
     * Initialize the query manager with initial search data
     */
    initialize(initialQuery = '', candidateTerms = null, source = 'system') {
        console.log('🚀 INITIALIZING SearchQueryManager SSoT');
        this.currentQuery = initialQuery;
        
        if (candidateTerms) {
            this.availableTerms = candidateTerms.candidates || [];
            this.identifyCoreTerms();
            this.syncSelectedTermsFromQuery();
        }
        
        this.logState();
        this.notifyListeners('initialize', { 
            query: this.currentQuery, 
            terms: this.availableTerms, 
            source 
        });
    }

    // ========== CONSOLIDATED SEARCH GENERATION METHODS ==========

    /**
     * CONSOLIDATED: Build search query from item type analysis
     * Moved from item-type-handlers.js
     */
    buildQueryFromItemType(objectType, title, description, analysisType = 'freetext') {
        console.log('🔧 SSoT: Building query from item type analysis');
        
        // Import consolidated logic from different item type handlers
        if (this.isJewelryItem(objectType, title, description)) {
            return this.generateJewelrySearch(objectType, title, description);
        } else if (this.isWatchItem(objectType, title, description)) {
            return this.generateWatchSearch(objectType, title, description);
        } else if (this.isAudioEquipment(objectType, title, description)) {
            return this.generateAudioSearch(objectType, title, description);
        } else if (this.isMusicalInstrument(objectType, title, description)) {
            return this.generateMusicalInstrumentSearch(objectType, title, description);
        } else if (this.isCoinItem(objectType, title, description)) {
            return this.generateCoinSearch(objectType, title, description);
        } else if (this.isStampItem(objectType, title, description)) {
            return this.generateStampSearch(objectType, title, description);
        }
        
        // Default search strategy
        return this.generateDefaultSearch(objectType, title, description);
    }

    /**
     * CONSOLIDATED: Build search context for API calls
     * Moved from sales-analysis-manager.js and search-filter-manager.js
     */
    buildSearchContext(artistInfo = null, objectType = '', period = '', technique = '', enhancedTerms = {}, analysisType = 'freetext') {
        console.log('🔧 SSoT: Building search context for API');
        
        const searchContext = {
            primarySearch: this.currentQuery,
            objectType: objectType,
            period: period,
            technique: technique,
            enhancedTerms: enhancedTerms,
            analysisType: analysisType,
            searchTerms: this.currentQuery,
            finalSearch: this.currentQuery
        };
        
        if (artistInfo) {
            searchContext.searchStrategy = artistInfo.searchStrategy;
            searchContext.confidence = artistInfo.confidence;
            searchContext.termCount = artistInfo.termCount;
        }
        
        console.log('📋 SSoT: Generated search context:', searchContext);
        return searchContext;
    }

    /**
     * CONSOLIDATED: Build query from selected candidates
     * Moved from search-filter-manager.js
     */
    buildQueryFromCandidates(selectedCandidates) {
        console.log('🔧 SSoT: Building query from selected candidates');
        return selectedCandidates.join(' ');
    }

    // ========== CONSOLIDATED URL GENERATION ==========

    /**
     * CONSOLIDATED: Generate all Auctionet URLs from SSoT
     * Moved from dashboard-manager.js and api-manager.js
     */
    generateAuctionetUrls(customQuery = null) {
        const queryToUse = customQuery || this.currentQuery;
        const encodedQuery = this.encodeQuery(queryToUse);
        
        return {
            historical: `https://auctionet.com/sv/search?event_id=&is=ended&q=${encodedQuery}`,
            live: `https://auctionet.com/sv/search?event_id=&q=${encodedQuery}`,
            all: `https://auctionet.com/sv/search?q=${encodedQuery}`
        };
    }

    /**
     * CONSOLIDATED: Safely encode queries for URLs
     * Moved from multiple files
     */
    encodeQuery(query = null) {
        const queryToEncode = query || this.currentQuery;
        return encodeURIComponent(queryToEncode);
    }

    // ========== ITEM TYPE DETECTION (consolidated from item-type-handlers.js) ==========
    
    isJewelryItem(objectType, title, description) {
        const jewelryKeywords = [
            'smycke', 'ring', 'halsband', 'armband', 'örhängen', 'brosch', 'berlock',
            'jewelry', 'necklace', 'bracelet', 'earrings', 'pendant', 'brooch',
            'diadem', 'tiara', 'manschettknappar', 'cufflinks'
        ];
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return jewelryKeywords.some(keyword => text.includes(keyword));
    }

    isWatchItem(objectType, title, description) {
        const watchKeywords = [
            'armbandsur', 'fickur', 'klocka', 'tidmätare', 'chronometer', 'stoppur',
            'watch', 'wristwatch', 'pocket watch', 'timepiece', 'chronograph',
            'väckarklocka', 'bordsur', 'väggur', 'golvur', 'mantelur', 'pendel'
        ];
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return watchKeywords.some(keyword => text.includes(keyword));
    }

    isAudioEquipment(objectType, title, description) {
        const audioKeywords = [
            'förstärkare', 'amplifier', 'receiver', 'tuner', 'radio', 'högtalare', 'speaker',
            'skivspelare', 'turntable', 'cd-spelare', 'kassettspelare', 'ljudsystem'
        ];
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return audioKeywords.some(keyword => text.includes(keyword));
    }

    isMusicalInstrument(objectType, title, description) {
        const instrumentKeywords = [
            'piano', 'flygel', 'orgel', 'harmonium', 'gitarr', 'violin', 'viola', 'cello',
            'kontrabas', 'trumpet', 'trombon', 'flöjt', 'klarinett', 'saxofon', 'oboe',
            'instrument', 'musikinstrument'
        ];
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return instrumentKeywords.some(keyword => text.includes(keyword));
    }

    isCoinItem(objectType, title, description) {
        const coinKeywords = [
            'mynt', 'coin', 'pengar', 'sedel', 'banknote', 'valuta', 'currency',
            'öre', 'krona', 'dollar', 'franc', 'mark', 'gulden'
        ];
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return coinKeywords.some(keyword => text.includes(keyword));
    }

    isStampItem(objectType, title, description) {
        const stampKeywords = [
            'frimärke', 'stamp', 'philately', 'filatelie', 'postkort', 'postcard',
            'brevmärke', 'porto'
        ];
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return stampKeywords.some(keyword => text.includes(keyword));
    }

    // ========== SEARCH GENERATION METHODS (consolidated from item-type-handlers.js) ==========
    
    generateJewelrySearch(objectType, title, description) {
        console.log('💍 SSoT: Generating jewelry-specific search');
        
        const brand = this.extractJewelryBrands(title + ' ' + description);
        const material = this.extractJewelryMaterials(title + ' ' + description);
        const gemstone = this.extractGemstones(title + ' ' + description);
        const jewelryType = this.extractJewelryType(objectType, title);
        
        let primarySearch = jewelryType || objectType.toLowerCase();
        let confidence = 0.6;
        let searchStrategy = 'jewelry_basic';
        
        if (brand) {
            primarySearch = `${primarySearch} ${brand}`;
            confidence = 0.8;
            searchStrategy = 'jewelry_brand';
        } else if (material) {
            primarySearch = `${primarySearch} ${material}`;
            confidence = 0.7;
            searchStrategy = 'jewelry_material';
        } else if (gemstone) {
            primarySearch = `${primarySearch} ${gemstone}`;
            confidence = 0.65;
            searchStrategy = 'jewelry_gemstone';
        }
        
        return {
            searchTerms: primarySearch,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: primarySearch.split(' ').length,
            finalSearch: primarySearch
        };
    }

    generateWatchSearch(objectType, title, description) {
        console.log('⌚ SSoT: Generating watch-specific search');
        
        const brand = this.extractWatchBrands(title + ' ' + description);
        const material = this.extractWatchMaterials(title + ' ' + description);
        const watchType = objectType.toLowerCase();
        
        let primarySearch = watchType;
        let confidence = 0.6;
        let searchStrategy = 'watch_basic';
        
        if (brand) {
            primarySearch = `${watchType} ${brand}`;
            confidence = 0.8;
            searchStrategy = 'watch_brand';
        } else if (material) {
            if (material.includes('guld') || material.includes('gold')) {
                primarySearch = `${watchType} guld`;
                confidence = 0.7;
                searchStrategy = 'watch_material';
            } else if (material.includes('silver')) {
                primarySearch = `${watchType} silver`;
                confidence = 0.65;
                searchStrategy = 'watch_material';
            } else if (material.includes('platina') || material.includes('platinum')) {
                primarySearch = `${watchType} platina`;
                confidence = 0.75;
                searchStrategy = 'watch_material';
            }
        }
        
        return {
            searchTerms: primarySearch,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: primarySearch.split(' ').length,
            finalSearch: primarySearch
        };
    }

    generateAudioSearch(objectType, title, description) {
        console.log('🔊 SSoT: Generating audio-specific search');
        
        const brand = this.extractAudioBrands(title + ' ' + description);
        const model = this.extractAudioModel(title + ' ' + description);
        const equipmentType = this.extractAudioType(objectType, title);
        
        let primarySearch = equipmentType || objectType.toLowerCase();
        let confidence = 0.6;
        let searchStrategy = 'audio_basic';
        
        if (brand) {
            primarySearch = `${primarySearch} ${brand}`;
            confidence = 0.8;
            searchStrategy = 'audio_brand';
        } else if (model) {
            primarySearch = `${primarySearch} ${model}`;
            confidence = 0.7;
            searchStrategy = 'audio_model';
        }
        
        return {
            searchTerms: primarySearch,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: primarySearch.split(' ').length,
            finalSearch: primarySearch
        };
    }

    generateMusicalInstrumentSearch(objectType, title, description) {
        console.log('🎼 SSoT: Generating musical instrument search');
        
        const brand = this.extractInstrumentBrands(title + ' ' + description);
        const material = this.extractInstrumentMaterials(title + ' ' + description);
        const instrumentType = objectType.toLowerCase();
        
        let primarySearch = instrumentType;
        let confidence = 0.6;
        let searchStrategy = 'instrument_basic';
        
        if (brand) {
            primarySearch = `${instrumentType} ${brand}`;
            confidence = 0.8;
            searchStrategy = 'instrument_brand';
        } else if (material) {
            primarySearch = `${instrumentType} ${material}`;
            confidence = 0.65;
            searchStrategy = 'instrument_material';
        }
        
        return {
            searchTerms: primarySearch,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: primarySearch.split(' ').length,
            finalSearch: primarySearch
        };
    }

    generateCoinSearch(objectType, title, description) {
        console.log('🪙 SSoT: Generating coin-specific search');
        
        const country = this.extractCountries(title + ' ' + description);
        const denomination = this.extractDenominations(title + ' ' + description);
        const material = this.extractCoinMaterials(title + ' ' + description);
        
        let primarySearch = objectType.toLowerCase();
        let confidence = 0.6;
        let searchStrategy = 'coin_basic';
        
        if (country) {
            primarySearch = `${primarySearch} ${country}`;
            confidence = 0.7;
            searchStrategy = 'coin_country';
        } else if (denomination) {
            primarySearch = `${primarySearch} ${denomination}`;
            confidence = 0.65;
            searchStrategy = 'coin_denomination';
        } else if (material) {
            primarySearch = `${primarySearch} ${material}`;
            confidence = 0.6;
            searchStrategy = 'coin_material';
        }
        
        return {
            searchTerms: primarySearch,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: primarySearch.split(' ').length,
            finalSearch: primarySearch
        };
    }

    generateStampSearch(objectType, title, description) {
        console.log('📮 SSoT: Generating stamp-specific search');
        
        const country = this.extractStampCountries(title + ' ' + description);
        const period = this.extractStampPeriods(title + ' ' + description);
        
        let primarySearch = objectType.toLowerCase();
        let confidence = 0.6;
        let searchStrategy = 'stamp_basic';
        
        if (country) {
            primarySearch = `${primarySearch} ${country}`;
            confidence = 0.75;
            searchStrategy = 'stamp_country';
        } else if (period) {
            primarySearch = `${primarySearch} ${period}`;
            confidence = 0.65;
            searchStrategy = 'stamp_period';
        }
        
        return {
            searchTerms: primarySearch,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: primarySearch.split(' ').length,
            finalSearch: primarySearch
        };
    }

    generateDefaultSearch(objectType, title, description) {
        console.log('🔍 SSoT: Generating default search strategy');
        
        const searchTerms = objectType || title.split(' ').slice(0, 3).join(' ');
        
        return {
            searchTerms: searchTerms,
            confidence: 0.5,
            strategy: 'default',
            termCount: searchTerms.split(' ').length,
            finalSearch: searchTerms
        };
    }

    // ========== EXTRACTION METHODS (consolidated from item-type-handlers.js) ==========
    
    extractJewelryBrands(text) {
        const brands = [
            'cartier', 'tiffany', 'bulgari', 'chopard', 'van cleef', 'graff',
            'harry winston', 'mikimoto', 'boucheron', 'piaget', 'chanel',
            'david yurman', 'georg jensen', 'swarovski', 'pandora'
        ];
        const textLower = text.toLowerCase();
        return brands.find(brand => textLower.includes(brand)) || null;
    }

    extractJewelryMaterials(text) {
        const materials = [
            'guld', 'gold', 'silver', 'platinum', 'platina', 'vitguld', 'rödguld',
            'gelbgold', 'weißgold', 'roségold', '18k', '14k', '9k', 'sterlingsilver'
        ];
        const textLower = text.toLowerCase();
        return materials.find(material => textLower.includes(material)) || null;
    }

    extractGemstones(text) {
        const gemstones = [
            'diamant', 'rubin', 'safir', 'smaragd', 'pärla', 'opal', 'topas',
            'ametist', 'granat', 'akvamarin', 'turmalin', 'citrin'
        ];
        const textLower = text.toLowerCase();
        return gemstones.find(gemstone => textLower.includes(gemstone)) || null;
    }

    extractJewelryType(objectType, title) {
        const typeMap = {
            'ring': 'ring',
            'halsband': 'halsband',
            'armband': 'armband',
            'örhängen': 'örhängen',
            'brosch': 'brosch',
            'berlock': 'berlock'
        };
        const text = `${objectType} ${title}`.toLowerCase();
        for (const [key, value] of Object.entries(typeMap)) {
            if (text.includes(key)) return value;
        }
        return objectType?.toLowerCase() || 'smycke';
    }

    extractWatchBrands(text) {
        const brands = [
            'rolex', 'omega', 'patek philippe', 'audemars piguet', 'vacheron constantin',
            'jaeger-lecoultre', 'cartier', 'breitling', 'tag heuer', 'iwc',
            'panerai', 'tudor', 'longines', 'tissot', 'seiko', 'citizen'
        ];
        const textLower = text.toLowerCase();
        return brands.find(brand => textLower.includes(brand)) || null;
    }

    extractWatchMaterials(text) {
        const materials = [
            'guld', 'gold', 'silver', 'stål', 'steel', 'titan', 'titanium',
            'platina', 'platinum', 'keramik', 'ceramic', '18k', '14k'
        ];
        const textLower = text.toLowerCase();
        return materials.find(material => textLower.includes(material)) || null;
    }

    extractAudioBrands(text) {
        const brands = [
            'technics', 'pioneer', 'marantz', 'yamaha', 'denon', 'onkyo',
            'harman kardon', 'jbl', 'bang & olufsen', 'b&o', 'linn', 'naim',
            'mcintosh', 'mark levinson', 'krell', 'quad', 'kef', 'b&w'
        ];
        const textLower = text.toLowerCase();
        return brands.find(brand => textLower.includes(brand)) || null;
    }

    extractAudioModel(text) {
        const modelPatterns = [
            /\b([A-Z]{2,}\d{2,})\b/g,
            /\b(\d{3,}[A-Z]*)\b/g,
            /\b([A-Z]+\s?\d+[A-Z]*)\b/gi
        ];
        for (const pattern of modelPatterns) {
            const matches = text.match(pattern);
            if (matches && matches[0]) return matches[0].toUpperCase();
        }
        return null;
    }

    extractAudioType(objectType, title) {
        const typeMap = {
            'förstärkare': 'förstärkare',
            'amplifier': 'förstärkare',
            'receiver': 'receiver',
            'tuner': 'tuner',
            'radio': 'radio',
            'högtalare': 'högtalare',
            'speaker': 'högtalare',
            'skivspelare': 'skivspelare',
            'turntable': 'skivspelare'
        };
        const text = `${objectType} ${title}`.toLowerCase();
        for (const [key, value] of Object.entries(typeMap)) {
            if (text.includes(key)) return value;
        }
        return objectType?.toLowerCase() || 'ljud';
    }

    extractInstrumentBrands(text) {
        const brands = [
            'steinway', 'yamaha', 'kawai', 'bösendorfer', 'fazioli', 'blüthner',
            'fender', 'gibson', 'martin', 'taylor', 'stradivarius', 'guarneri'
        ];
        const textLower = text.toLowerCase();
        return brands.find(brand => textLower.includes(brand)) || null;
    }

    extractInstrumentMaterials(text) {
        const materials = [
            'mahogny', 'ek', 'gran', 'lönn', 'palisander', 'ebenholts',
            'silver', 'mässing', 'nickel', 'guld'
        ];
        const textLower = text.toLowerCase();
        return materials.find(material => textLower.includes(material)) || null;
    }

    extractDenominations(text) {
        const denominations = [
            'öre', 'krona', 'kronor', 'dollar', 'cent', 'franc', 'mark',
            'pfennig', 'gulden', 'florin', 'dukat', 'thaler'
        ];
        const textLower = text.toLowerCase();
        return denominations.find(denom => textLower.includes(denom)) || null;
    }

    extractCoinMaterials(text) {
        const materials = [
            'guld', 'silver', 'koppar', 'brons', 'nickel', 'zink', 'järn', 'stål'
        ];
        const textLower = text.toLowerCase();
        return materials.find(material => textLower.includes(material)) || null;
    }

    extractCountries(text) {
        const countries = [
            'sverige', 'norway', 'danmark', 'finland', 'tyskland', 'frankrike',
            'england', 'usa', 'ryssland', 'italien', 'spanien', 'österrike'
        ];
        const textLower = text.toLowerCase();
        return countries.find(country => textLower.includes(country)) || null;
    }

    extractStampCountries(text) {
        return this.extractCountries(text); // Reuse country extraction
    }

    extractStampPeriods(text) {
        const periods = [
            'klassisk', 'modern', 'antik', 'vintage', '1800-tal', '1900-tal',
            'efterkrigs', 'förkrigs', 'mellankrigstid'
        ];
        const textLower = text.toLowerCase();
        return periods.find(period => textLower.includes(period)) || null;
    }

    // ========== LEGACY SSOT METHODS (keeping existing functionality) ==========

    /**
     * Select a term (user action)
     */
    selectTerm(term) {
        console.log('✅ SSoT: User selected term:', term);
        this.selectedTerms.add(term);
        this.rebuildQuery('user');
    }

    /**
     * Deselect a term (user action)
     */
    deselectTerm(term) {
        if (this.coreTerms.has(term)) {
            console.log('🔒 SSoT: Cannot deselect core term:', term);
            return false;
        }
        
        console.log('❌ SSoT: User deselected term:', term);
        this.selectedTerms.delete(term);
        this.rebuildQuery('user');
        return true;
    }

    /**
     * Rebuild the current query from selected terms
     */
    rebuildQuery(source = 'system') {
        const oldQuery = this.currentQuery;
        const rebuiltTerms = Array.from(this.selectedTerms).filter(term => term && term.trim());
        this.currentQuery = rebuiltTerms.join(' ');
        
        console.log('🔧 SSoT: Query rebuilt:');
        console.log('   Old:', oldQuery);
        console.log('   New:', this.currentQuery);
        
        this.notifyListeners('rebuild', { oldQuery, newQuery: this.currentQuery });
    }

    /**
     * Get the current search query (SSoT)
     */
    getCurrentQuery() {
        return this.currentQuery;
    }

    /**
     * Check if a term is currently selected
     */
    isTermSelected(term) {
        return this.selectedTerms.has(term);
    }

    /**
     * Check if a term is a core term (protected)
     */
    isCoreTerm(term) {
        return this.coreTerms.has(term);
    }

    /**
     * Get all available terms for UI display
     */
    getAvailableTerms() {
        return this.availableTerms;
    }

    /**
     * Add a change listener for real-time updates
     */
    addChangeListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove a change listener
     */
    removeChangeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners of changes
     */
    notifyListeners(event, data) {
        this.listeners.forEach(listener => {
            try {
                listener(event, data);
            } catch (error) {
                console.error('Error in SearchQueryManager listener:', error);
            }
        });
    }

    /**
     * Identify core terms that should be protected
     */
    identifyCoreTerms() {
        const coreTypes = ['artist', 'brand', 'object_type'];
        this.coreTerms.clear();
        
        this.availableTerms.forEach(termObj => {
            if (coreTypes.includes(termObj.type)) {
                this.coreTerms.add(termObj.term);
            }
        });
        
        console.log('🔒 SSoT: Identified core terms:', Array.from(this.coreTerms));
    }

    /**
     * Sync selected terms from current query
     */
    syncSelectedTermsFromQuery() {
        this.selectedTerms.clear();
        
        if (!this.currentQuery) return;
        
        const queryTerms = this.currentQuery.toLowerCase().split(' ').filter(t => t.length > 1);
        
        this.availableTerms.forEach(termObj => {
            const termLower = termObj.term.toLowerCase();
            const isInQuery = queryTerms.some(qt => {
                return qt === termLower || 
                       qt.includes(termLower) || 
                       termLower.includes(qt) ||
                       this.normalizeTermForMatching(qt) === this.normalizeTermForMatching(termLower);
            });
            
            if (isInQuery) {
                this.selectedTerms.add(termObj.term);
            }
        });
        
        console.log('🔄 SSoT: Synced selected terms:', Array.from(this.selectedTerms));
    }

    /**
     * Normalize terms for better matching
     */
    normalizeTermForMatching(term) {
        return term.toLowerCase()
                  .replace(/\s+/g, '')
                  .replace(/[^\w\d]/g, '')
                  .replace(/tal$/, ''); // Handle "1970" vs "1970-tal"
    }

    /**
     * Generate search URLs for the current query
     */
    getSearchUrls() {
        return this.generateAuctionetUrls();
    }

    /**
     * Get current state for debugging
     */
    getCurrentState() {
        return {
            query: this.currentQuery,
            selectedTerms: Array.from(this.selectedTerms),
            availableTerms: this.availableTerms.length,
            coreTerms: Array.from(this.coreTerms)
        };
    }

    /**
     * Reset the manager to initial state
     */
    reset() {
        console.log('🔄 RESETTING SearchQueryManager SSoT');
        this.currentQuery = '';
        this.selectedTerms.clear();
        this.availableTerms = [];
        this.coreTerms.clear();
        this.notifyListeners('reset', {});
    }

    /**
     * Debug logging of current state
     */
    logState() {
        console.log('🔍 SearchQueryManager SSoT STATE:');
        console.log('   Current Query:', this.currentQuery);
        console.log('   Selected Terms:', Array.from(this.selectedTerms));
        console.log('   Available Terms:', this.availableTerms.length);
        console.log('   Core Terms:', Array.from(this.coreTerms));
    }

    /**
     * Generate specialized search queries for different item types
     * CONSOLIDATED FROM: item-type-handlers.js
     */
    generateSpecializedSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
        console.log('🔧 SSoT: Generating specialized search for:', objectType);
        
        // Check item type and delegate to appropriate handler
        if (this.isJewelryItem(objectType, title, description)) {
            return this.generateJewelrySearch(objectType, title, description, artistInfo, baseTerms, baseConfidence);
        } else if (this.isWatchItem(objectType, title, description)) {
            return this.generateWatchSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence);
        } else if (this.isAudioEquipment(objectType, title, description)) {
            return this.generateAudioSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence);
        } else if (this.isMusicalInstrument(objectType, title, description)) {
            return this.generateMusicalInstrumentSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence);
        } else if (this.isCoinItem(objectType, title, description)) {
            return this.generateCoinSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence);
        } else if (this.isStampItem(objectType, title, description)) {
            return this.generateStampSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence);
        }
        
        // Default fallback
        return {
            searchTerms: baseTerms || objectType,
            confidence: baseConfidence || 0.5,
            strategy: 'generic',
            termCount: (baseTerms || objectType).split(' ').length,
            hasArtist: !!artistInfo
        };
    }

    // ==================== ITEM TYPE DETECTION ====================
    
    isJewelryItem(objectType, title, description) {
        const jewelryKeywords = [
            'ring', 'halsband', 'armband', 'örhängen', 'brosch', 'berlock',
            'smycke', 'jewelry', 'jewellery', 'necklace', 'bracelet', 'earrings',
            'pendant', 'brooch', 'cufflinks', 'manschettknappar', 'tiara',
            'diadem', 'collier', 'kedja', 'chain'
        ];
        
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return jewelryKeywords.some(keyword => text.includes(keyword));
    }

    isWatchItem(objectType, title, description) {
        const watchKeywords = [
            'armbandsur', 'fickur', 'klocka', 'tidmätare', 'chronometer', 'stoppur',
            'watch', 'wristwatch', 'pocket watch', 'timepiece', 'chronograph',
            'väckarklocka', 'bordsur', 'väggur', 'golvur', 'mantelur', 'pendel'
        ];
        
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return watchKeywords.some(keyword => text.includes(keyword));
    }

    isAudioEquipment(objectType, title, description) {
        const audioKeywords = [
            'förstärkare', 'amplifier', 'receiver', 'tuner', 'radio', 'högtalare',
            'speaker', 'skivspelare', 'turntable', 'cd-spelare', 'kassettspelare',
            'stereo', 'hifi', 'hi-fi', 'ljudanläggning', 'grammofon'
        ];
        
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return audioKeywords.some(keyword => text.includes(keyword));
    }

    isMusicalInstrument(objectType, title, description) {
        const instrumentKeywords = [
            'piano', 'flygel', 'gitarr', 'violin', 'fiol', 'cello', 'kontrabas',
            'trumpet', 'trombon', 'saxofon', 'klarinett', 'flöjt', 'oboe',
            'instrument', 'musikinstrument', 'guitar', 'drums', 'trummor'
        ];
        
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return instrumentKeywords.some(keyword => text.includes(keyword));
    }

    isCoinItem(objectType, title, description) {
        const coinKeywords = [
            'mynt', 'coin', 'medal', 'medalj', 'penning', 'token', 'pollett',
            'commemorative', 'minnesmedalj', 'guldmynt', 'silvermynt'
        ];
        
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return coinKeywords.some(keyword => text.includes(keyword));
    }

    isStampItem(objectType, title, description) {
        const stampKeywords = [
            'frimärke', 'stamp', 'postage', 'postal', 'philatelic', 'filatelistisk',
            'brevmärke', 'porto', 'postmärke'
        ];
        
        const text = `${objectType} ${title} ${description}`.toLowerCase();
        return stampKeywords.some(keyword => text.includes(keyword));
    }

    // ==================== SPECIALIZED SEARCH GENERATORS ====================
    
    generateJewelrySearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
        console.log('💎 SSoT: Generating jewelry-specific search for:', title);
        
        const brand = this.extractJewelryBrands(title + ' ' + description);
        const material = this.extractJewelryMaterials(title + ' ' + description);
        const gemstone = this.extractGemstones(title + ' ' + description);
        const broadPeriod = this.extractBroadPeriod(title + ' ' + description);
        
        let searchStrategy = 'jewelry_basic';
        let confidence = 0.6;
        let primarySearch = objectType.toLowerCase();
        
        // Priority 1: Brand + Type (most important for jewelry)
        if (brand) {
            primarySearch = `${objectType.toLowerCase()} ${brand}`;
            confidence = 0.85;
            searchStrategy = 'jewelry_brand';
        }
        // Priority 2: Material + Type (if no brand but has precious material)
        else if (material) {
            primarySearch = `${objectType.toLowerCase()} ${material}`;
            confidence = 0.75;
            searchStrategy = 'jewelry_material';
        }
        // Priority 3: Gemstone + Type (if no brand/material but has gemstone)
        else if (gemstone) {
            primarySearch = `${objectType.toLowerCase()} ${gemstone}`;
            confidence = 0.7;
            searchStrategy = 'jewelry_gemstone';
        }
        // Priority 4: Period + Type (fallback for antique jewelry)
        else if (broadPeriod) {
            primarySearch = `${objectType.toLowerCase()} ${broadPeriod}`;
            confidence = 0.6;
            searchStrategy = 'jewelry_period';
        }
        
        const searchString = primarySearch;
        
        console.log('💎 SSoT: Jewelry search generated:', {
            brand, material, gemstone, broadPeriod,
            finalSearch: searchString,
            strategy: searchStrategy,
            confidence: Math.min(confidence, 0.9)
        });
        
        return {
            searchTerms: searchString,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: searchString.split(' ').length,
            hasArtist: false,
            isJewelry: true
        };
    }

    generateWatchSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
        console.log('⌚ SSoT: Generating watch-specific search for:', title);
        
        const brand = this.extractWatchBrands(title + ' ' + description);
        const material = this.extractWatchMaterials(title + ' ' + description);
        const broadPeriod = this.extractBroadPeriod(title + ' ' + description);
        
        const watchType = objectType.toLowerCase();
        let searchStrategy = 'watch_basic';
        let confidence = 0.6;
        let primarySearch = watchType;
        
        // Priority 1: Brand + Type (most important for watches)
        if (brand) {
            primarySearch = `${watchType} ${brand}`;
            confidence = 0.8;
            searchStrategy = 'watch_brand';
        }
        // Priority 2: Material + Type (if no brand but has valuable material)
        else if (material) {
            if (material.includes('guld') || material.includes('gold') || material.includes('18k')) {
                primarySearch = `${watchType} guld`;
                confidence = 0.7;
                searchStrategy = 'watch_material';
            } else if (material.includes('silver')) {
                primarySearch = `${watchType} silver`;
                confidence = 0.65;
                searchStrategy = 'watch_material';
            } else if (material.includes('platina') || material.includes('platinum')) {
                primarySearch = `${watchType} platina`;
                confidence = 0.75;
                searchStrategy = 'watch_material';
            }
        }
        // Priority 3: Period + Type (fallback for vintage/antique)
        else if (broadPeriod) {
            primarySearch = `${watchType} ${broadPeriod}`;
            confidence = 0.6;
            searchStrategy = 'watch_period';
        }
        
        const searchString = primarySearch;
        
        console.log('⌚ SSoT: Watch search generated:', {
            brand, material, broadPeriod,
            finalSearch: searchString,
            strategy: searchStrategy,
            confidence: Math.min(confidence, 0.9)
        });
        
        return {
            searchTerms: searchString,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: searchString.split(' ').length,
            hasArtist: false,
            isWatch: true
        };
    }

    generateAudioSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
        console.log('🔊 SSoT: Generating audio-specific search for:', title);
        
        const brand = this.extractAudioBrands(title + ' ' + description);
        const model = this.extractAudioModel(title + ' ' + description);
        const equipmentType = this.extractAudioType(objectType, title);
        const broadPeriod = this.extractBroadPeriod(title + ' ' + description);
        
        let searchStrategy = 'audio_basic';
        let confidence = 0.6;
        let primarySearch = equipmentType || objectType.toLowerCase();
        
        // Priority 1: Brand + Type (most important for audio)
        if (brand) {
            primarySearch = `${primarySearch} ${brand}`;
            confidence = 0.8;
            searchStrategy = 'audio_brand';
        }
        // Priority 2: Model + Type (if no brand but has model)
        else if (model) {
            primarySearch = `${primarySearch} ${model}`;
            confidence = 0.7;
            searchStrategy = 'audio_model';
        }
        // Priority 3: Period + Type (vintage audio is popular)
        else if (broadPeriod) {
            primarySearch = `${primarySearch} ${broadPeriod}`;
            confidence = 0.65;
            searchStrategy = 'audio_period';
        }
        
        const searchString = primarySearch;
        
        console.log('🔊 SSoT: Audio search generated:', {
            brand, model, equipmentType, broadPeriod,
            finalSearch: searchString,
            strategy: searchStrategy,
            confidence: Math.min(confidence, 0.9)
        });
        
        return {
            searchTerms: searchString,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: searchString.split(' ').length,
            hasArtist: false,
            isAudio: true
        };
    }

    generateMusicalInstrumentSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
        console.log('🎵 SSoT: Generating musical instrument search for:', title);
        
        const brand = this.extractInstrumentBrands(title + ' ' + description);
        const material = this.extractInstrumentMaterials(title + ' ' + description);
        const instrumentType = this.extractInstrumentType(objectType, title);
        const broadPeriod = this.extractBroadPeriod(title + ' ' + description);
        
        let searchStrategy = 'instrument_basic';
        let confidence = 0.6;
        let primarySearch = instrumentType;
        
        // Priority 1: Brand + Type (most important for instruments)
        if (brand) {
            primarySearch = `${instrumentType} ${brand}`;
            confidence = 0.8;
            searchStrategy = 'instrument_brand';
        }
        // Priority 2: Material + Type (if no brand but has valuable material)
        else if (material) {
            primarySearch = `${instrumentType} ${material}`;
            confidence = 0.7;
            searchStrategy = 'instrument_material';
        }
        // Priority 3: Period + Type (vintage instruments are valuable)
        else if (broadPeriod) {
            primarySearch = `${instrumentType} ${broadPeriod}`;
            confidence = 0.65;
            searchStrategy = 'instrument_period';
        }
        
        const searchString = primarySearch;
        
        console.log('🎵 SSoT: Musical instrument search generated:', {
            brand, material, instrumentType, broadPeriod,
            finalSearch: searchString,
            strategy: searchStrategy,
            confidence: Math.min(confidence, 0.9)
        });
        
        return {
            searchTerms: searchString,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: searchString.split(' ').length,
            hasArtist: false,
            isInstrument: true
        };
    }

    generateCoinSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
        console.log('🪙 SSoT: Generating coin-specific search for:', title);
        
        const country = this.extractCountries(title + ' ' + description);
        const material = this.extractCoinMaterials(title + ' ' + description);
        const denomination = this.extractDenominations(title + ' ' + description);
        const year = this.extractYears(title + ' ' + description);
        
        let searchStrategy = 'coin_basic';
        let confidence = 0.6;
        let primarySearch = objectType.toLowerCase();
        
        // Priority 1: Country + Type (most important for coins)
        if (country && country.length > 0) {
            primarySearch = `${objectType.toLowerCase()} ${country[0]}`;
            confidence = 0.8;
            searchStrategy = 'coin_country';
        }
        // Priority 2: Material + Type (if no country but has precious material)
        else if (material) {
            primarySearch = `${objectType.toLowerCase()} ${material}`;
            confidence = 0.75;
            searchStrategy = 'coin_material';
        }
        // Priority 3: Year + Type (if no country/material but has year)
        else if (year) {
            primarySearch = `${objectType.toLowerCase()} ${year}`;
            confidence = 0.7;
            searchStrategy = 'coin_year';
        }
        
        const searchString = primarySearch;
        
        console.log('🪙 SSoT: Coin search generated:', {
            country, material, denomination, year,
            finalSearch: searchString,
            strategy: searchStrategy,
            confidence: Math.min(confidence, 0.9)
        });
        
        return {
            searchTerms: searchString,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: searchString.split(' ').length,
            hasArtist: false,
            isCoin: true
        };
    }

    generateStampSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
        console.log('📮 SSoT: Generating stamp-specific search for:', title);
        
        const country = this.extractStampCountries(title + ' ' + description);
        const period = this.extractStampPeriods(title + ' ' + description);
        const collectionType = this.extractStampCollectionTypes(title + ' ' + description);
        
        let searchStrategy = 'stamp_basic';
        let confidence = 0.6;
        let primarySearch = objectType.toLowerCase();
        
        // Priority 1: Country + Type (most important for stamps)
        if (country) {
            primarySearch = `${objectType.toLowerCase()} ${country}`;
            confidence = 0.8;
            searchStrategy = 'stamp_country';
        }
        // Priority 2: Collection Type + Type (if no country but has collection type)
        else if (collectionType) {
            primarySearch = `${objectType.toLowerCase()} ${collectionType}`;
            confidence = 0.7;
            searchStrategy = 'stamp_collection';
        }
        // Priority 3: Period + Type (if no country/collection but has period)
        else if (period) {
            primarySearch = `${objectType.toLowerCase()} ${period}`;
            confidence = 0.65;
            searchStrategy = 'stamp_period';
        }
        
        const searchString = primarySearch;
        
        console.log('📮 SSoT: Stamp search generated:', {
            country, period, collectionType,
            finalSearch: searchString,
            strategy: searchStrategy,
            confidence: Math.min(confidence, 0.9)
        });
        
        return {
            searchTerms: searchString,
            confidence: Math.min(confidence, 0.9),
            strategy: searchStrategy,
            termCount: searchString.split(' ').length,
            hasArtist: false,
            isStamp: true
        };
    }

    // ==================== EXTRACTION METHODS ====================
    // CONSOLIDATED FROM: item-type-handlers.js
    
    extractJewelryBrands(text) {
        const brands = [
            'cartier', 'tiffany', 'bulgari', 'van cleef', 'harry winston',
            'chopard', 'boucheron', 'piaget', 'graff', 'mikimoto',
            'georg jensen', 'david andersen', 'lapponia', 'kalevala',
            'efva attling', 'sophie by sophie', 'maria nilsdotter'
        ];
        
        const text_lower = text.toLowerCase();
        for (const brand of brands) {
            if (text_lower.includes(brand)) {
                return brand;
            }
        }
        return null;
    }

    extractJewelryMaterials(text) {
        const materials = [
            '18k', '14k', '9k', 'guld', 'gold', 'silver', 'silver', 'platina', 'platinum',
            'vitguld', 'rödguld', 'roséguld', 'gelbgold', 'weissgold', 'rotgold'
        ];
        
        const text_lower = text.toLowerCase();
        for (const material of materials) {
            if (text_lower.includes(material)) {
                return material;
            }
        }
        return null;
    }

    extractGemstones(text) {
        const gemstones = [
            'diamant', 'diamond', 'rubin', 'ruby', 'safir', 'sapphire',
            'smaragd', 'emerald', 'pärla', 'pearl', 'opal', 'topas',
            'ametist', 'amethyst', 'citrin', 'citrine', 'granat', 'garnet'
        ];
        
        const text_lower = text.toLowerCase();
        for (const gemstone of gemstones) {
            if (text_lower.includes(gemstone)) {
                return gemstone;
            }
        }
        return null;
    }

    extractWatchBrands(text) {
        const brands = [
            'rolex', 'omega', 'patek philippe', 'audemars piguet', 'vacheron constantin',
            'jaeger-lecoultre', 'iwc', 'breitling', 'tag heuer', 'cartier',
            'longines', 'tissot', 'seiko', 'citizen', 'casio', 'hamilton',
            'tudor', 'zenith', 'panerai', 'hublot', 'richard mille'
        ];
        
        const text_lower = text.toLowerCase();
        for (const brand of brands) {
            if (text_lower.includes(brand)) {
                return brand;
            }
        }
        return null;
    }

    extractWatchMaterials(text) {
        const materials = [
            '18k', '14k', '9k', 'guld', 'gold', 'silver', 'silver', 'platina', 'platinum',
            'stål', 'steel', 'titan', 'titanium', 'keramik', 'ceramic',
            'vitguld', 'rödguld', 'roséguld'
        ];
        
        const text_lower = text.toLowerCase();
        for (const material of materials) {
            if (text_lower.includes(material)) {
                return material;
            }
        }
        return null;
    }

    extractAudioBrands(text) {
        const brands = [
            'technics', 'pioneer', 'marantz', 'yamaha', 'denon', 'onkyo',
            'harman kardon', 'jbl', 'bang & olufsen', 'b&o', 'linn', 'naim',
            'mcintosh', 'mark levinson', 'krell', 'conrad johnson',
            'audio research', 'quad', 'mission', 'kef', 'bowers & wilkins', 'b&w'
        ];
        
        const text_lower = text.toLowerCase();
        for (const brand of brands) {
            if (text_lower.includes(brand)) {
                return brand;
            }
        }
        return null;
    }

    extractAudioModel(text) {
        const modelPatterns = [
            /\b([A-Z]{2,}\d{2,})\b/g,        // Like "SL1200", "CDJ2000"
            /\b(\d{3,}[A-Z]*)\b/g,          // Like "1200", "2000MK2"
            /\b([A-Z]+\s?\d+[A-Z]*)\b/gi    // Like "SL 1200", "PM1"
        ];
        
        for (const pattern of modelPatterns) {
            const matches = text.match(pattern);
            if (matches && matches[0]) {
                return matches[0].toUpperCase();
            }
        }
        return null;
    }

    extractAudioType(objectType, title) {
        const typeMap = {
            'förstärkare': 'förstärkare',
            'amplifier': 'förstärkare',
            'receiver': 'receiver',
            'tuner': 'tuner',
            'radio': 'radio',
            'högtalare': 'högtalare',
            'speaker': 'högtalare',
            'skivspelare': 'skivspelare',
            'turntable': 'skivspelare',
            'cd': 'cd-spelare',
            'kassett': 'kassettspelare'
        };
        
        const text = `${objectType} ${title}`.toLowerCase();
        for (const [key, value] of Object.entries(typeMap)) {
            if (text.includes(key)) {
                return value;
            }
        }
        return objectType?.toLowerCase() || 'ljud';
    }

    extractInstrumentBrands(text) {
        const brands = [
            'steinway', 'yamaha', 'kawai', 'bosendorfer', 'fazioli',
            'fender', 'gibson', 'martin', 'taylor', 'stradivarius',
            'guarneri', 'amati', 'selmer', 'bach', 'conn'
        ];
        
        const text_lower = text.toLowerCase();
        for (const brand of brands) {
            if (text_lower.includes(brand)) {
                return brand;
            }
        }
        return null;
    }

    extractInstrumentMaterials(text) {
        const materials = [
            'mahogny', 'mahogany', 'ek', 'oak', 'lönn', 'maple', 'gran', 'spruce',
            'ebenholts', 'ebony', 'palisander', 'rosewood', 'silver', 'mässing', 'brass'
        ];
        
        const text_lower = text.toLowerCase();
        for (const material of materials) {
            if (text_lower.includes(material)) {
                return material;
            }
        }
        return null;
    }

    extractInstrumentType(objectType, title) {
        const typeMap = {
            'piano': 'piano',
            'flygel': 'flygel',
            'gitarr': 'gitarr',
            'guitar': 'gitarr',
            'violin': 'violin',
            'fiol': 'violin',
            'cello': 'cello',
            'trumpet': 'trumpet',
            'saxofon': 'saxofon'
        };
        
        const text = `${objectType} ${title}`.toLowerCase();
        for (const [key, value] of Object.entries(typeMap)) {
            if (text.includes(key)) {
                return value;
            }
        }
        return objectType?.toLowerCase() || 'instrument';
    }

    extractDenominations(text) {
        const denominations = [
            'öre', 'krona', 'kronor', 'cent', 'euro', 'dollar', 'pound',
            'mark', 'pfennig', 'franc', 'lira', 'yen', 'rubel'
        ];
        
        const text_lower = text.toLowerCase();
        for (const denom of denominations) {
            if (text_lower.includes(denom)) {
                return denom;
            }
        }
        return null;
    }

    extractCoinMaterials(text) {
        const materials = [
            'guld', 'gold', 'silver', 'silver', 'koppar', 'copper', 'brons', 'bronze',
            'nickel', 'zink', 'zinc', 'järn', 'iron', 'platina', 'platinum'
        ];
        
        const text_lower = text.toLowerCase();
        for (const material of materials) {
            if (text_lower.includes(material)) {
                return material;
            }
        }
        return null;
    }

    extractCountries(text) {
        const countries = [
            'sverige', 'sweden', 'norge', 'norway', 'danmark', 'denmark',
            'finland', 'tyskland', 'germany', 'frankrike', 'france',
            'england', 'usa', 'ryssland', 'russia'
        ];
        
        const text_lower = text.toLowerCase();
        const found = [];
        for (const country of countries) {
            if (text_lower.includes(country)) {
                found.push(country);
            }
        }
        return found;
    }

    extractYears(text) {
        const yearPattern = /\b(1[6-9]\d{2}|20[0-2]\d)\b/;
        const match = text.match(yearPattern);
        return match ? match[1] : null;
    }

    extractStampCountries(text) {
        const countries = [
            'sverige', 'sweden', 'norge', 'norway', 'danmark', 'denmark',
            'finland', 'tyskland', 'germany', 'frankrike', 'france',
            'england', 'usa', 'kina', 'china', 'japan'
        ];
        
        const text_lower = text.toLowerCase();
        for (const country of countries) {
            if (text_lower.includes(country)) {
                return country;
            }
        }
        return null;
    }

    extractStampCollectionTypes(text) {
        const types = [
            'samling', 'collection', 'album', 'serie', 'series',
            'block', 'häfte', 'booklet', 'ark', 'sheet'
        ];
        
        const text_lower = text.toLowerCase();
        for (const type of types) {
            if (text_lower.includes(type)) {
                return type;
            }
        }
        return null;
    }

    extractStampPeriods(text) {
        const periods = [
            'klassisk', 'classic', 'modern', 'vintage', 'antik', 'antique',
            '1800-tal', '1900-tal', '2000-tal'
        ];
        
        const text_lower = text.toLowerCase();
        for (const period of periods) {
            if (text_lower.includes(period)) {
                return period;
            }
        }
        return null;
    }

    extractBroadPeriod(text) {
        const periodPatterns = [
            { pattern: /\b(1[6-9]\d{2})\b/, transform: year => `${Math.floor(year / 100)}00-tal` },
            { pattern: /\b(20[0-2]\d)\b/, transform: year => '2000-tal' },
            { pattern: /\b(\d{2,4}-tal)\b/, transform: period => period },
            { pattern: /\b(antik|vintage|klassisk|modern)\b/i, transform: period => period.toLowerCase() }
        ];
        
        for (const { pattern, transform } of periodPatterns) {
            const match = text.match(pattern);
            if (match) {
                const value = isNaN(match[1]) ? match[1] : parseInt(match[1]);
                return transform(value);
            }
        }
        return null;
    }
} 