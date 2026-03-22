// dashboard-api.js — Client for Auctionet's real-time dashboard API (dashboard.auctionet.com)
// Provides pre-computed KPIs (R12, YTD, weekly trends), live search data, and operational metrics.
// All fetches route through background.js which holds the token securely.

export class DashboardAPI {
  constructor() {
    this.cache = new Map();           // widget -> { data, checksum, fetchedAt }
    this.cacheTTL = 5 * 60 * 1000;   // 5 min default
    this._available = null;           // null = unknown, true/false after first fetch
    this.ALL_WIDGETS = [
      'sas_employees-hammered', 'sas_employees-auctions',
      'sas_employees-new_items', 'sas_employees-cataloger_stats',
      'sas_employees-photographer_stats', 'sas_employees-events',
      'shared-searches', 'sas_employees-searches', 'shared-sessions'
    ];
  }

  // ─── Core Fetch ────────────────────────────────────────────────

  /**
   * Fetch all widgets in a single HTTP call.
   * Returns normalized object or null if unavailable.
   */
  async fetchAll() {
    return this.fetchWidgets(this.ALL_WIDGETS);
  }

  /**
   * Fetch specific widgets. Returns { hammered, auctions, newItems, ... } or null.
   * Uses checksum-based caching: skips re-processing if data hasn't changed.
   */
  async fetchWidgets(types) {
    try {
      const json = await this._fetch(types);
      if (!json?.sources) {
        this._available = false;
        return null;
      }

      this._available = true;
      const result = {};

      for (const [key, value] of Object.entries(json.sources)) {
        const cached = this.cache.get(key);
        if (cached && cached.checksum === value.checksum) {
          // Data unchanged — reuse cached
          result[this._normalize(key)] = cached.data;
        } else {
          // New or changed data
          const data = value.data;
          this.cache.set(key, { data, checksum: value.checksum, fetchedAt: Date.now() });
          result[this._normalize(key)] = data;
        }
      }

      return result;
    } catch (e) {
      console.warn('[DashboardAPI] Fetch failed:', e.message);
      this._available = false;
      return null;
    }
  }

  /** True if token is configured and last fetch succeeded */
  isAvailable() {
    return this._available === true;
  }

  // ─── Accessors (return cached data or fetch) ──────────────────

  async getHammered() { return this._getWidget('sas_employees-hammered', 'hammered'); }
  async getAuctions() { return this._getWidget('sas_employees-auctions', 'auctions'); }
  async getNewItems() { return this._getWidget('sas_employees-new_items', 'newItems'); }
  async getCatalogerStats() { return this._getWidget('sas_employees-cataloger_stats', 'catalogerStats'); }
  async getPhotographerStats() { return this._getWidget('sas_employees-photographer_stats', 'photographerStats'); }
  async getEvents() { return this._getWidget('sas_employees-events', 'events'); }
  async getSearches() {
    const data = await this.fetchWidgets(['shared-searches', 'sas_employees-searches']);
    if (!data) return null;
    return { shared: data.sharedSearches || [], company: data.sasEmployeesSearches || [] };
  }
  async getSessions() { return this._getWidget('shared-sessions', 'sharedSessions'); }

  async _getWidget(widgetKey, normalizedName) {
    const cached = this.cache.get(widgetKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.data;
    }
    const result = await this.fetchWidgets([widgetKey]);
    return result?.[normalizedName] || null;
  }

  // ─── Computed KPIs ────────────────────────────────────────────

  /**
   * Pipeline health: intake → publish → sell rates with bottleneck detection.
   * Requires data from hammered, auctions, and newItems widgets.
   */
  computePipelineHealth(data) {
    const h = data?.hammered;
    const a = data?.auctions;
    const n = data?.newItems;
    if (!h || !a || !n) return null;

    const intakeRate = n.work_day_average || 0;
    const publishRate = a.published_last_seven_days_average || 0;
    const sellRate = h.average_count_last_seven_days || 0;
    const relistRatio = a.previously_unsold_vs_new_ratio_last_seven_days || 0;
    const backlogGrowth = intakeRate - sellRate;

    let bottleneck = null;
    if (publishRate < intakeRate * 0.8) bottleneck = 'publishing';
    else if (sellRate < publishRate * 0.5) bottleneck = 'selling';

    return { intakeRate, publishRate, sellRate, relistRatio, backlogGrowth, bottleneck };
  }

  /**
   * Reserve coverage: % of published items with bids over reserve.
   */
  computeReserveCoverage(data) {
    const a = data?.auctions;
    if (!a || !a.published) return null;
    const rate = (a.published_with_bid_over_reserve / a.published) * 100;
    return { rate: Math.round(rate * 10) / 10, count: a.published_with_bid_over_reserve, total: a.published };
  }

  /**
   * Relisting ratio from auctions widget.
   */
  computeRelistingRatio(data) {
    const a = data?.auctions;
    if (!a) return null;
    return { ratio: a.previously_unsold_vs_new_ratio_last_seven_days || 0 };
  }

  /**
   * Intake vs output balance. ratio > 1 means backlog growing.
   */
  computeIntakeOutputBalance(data) {
    const n = data?.newItems;
    const h = data?.hammered;
    if (!n || !h || !h.average_count_last_seven_days) return null;

    const ratio = n.work_day_average / h.average_count_last_seven_days;
    let status = 'balanced';
    if (ratio > 1.2) status = 'growing';
    else if (ratio < 0.8) status = 'shrinking';

    return { ratio: Math.round(ratio * 100) / 100, status, intake: n.work_day_average, output: h.average_count_last_seven_days };
  }

  /**
   * Demand signals from live search data.
   * Zero-result searches = demand with no supply.
   */
  computeDemandSignals(searches) {
    if (!searches) return null;

    const allSearches = [...(searches.shared || []), ...(searches.company || [])];
    if (allSearches.length === 0) return null;

    const zeroResultTerms = allSearches
      .filter(s => s.count === 0 && !s.ended)
      .map(s => ({ query: s.query, category: s.category }));

    // Aggregate by query term
    const termCounts = new Map();
    for (const s of allSearches) {
      const key = s.query?.toLowerCase();
      if (!key) continue;
      const existing = termCounts.get(key) || { query: s.query, totalCount: 0, searches: 0 };
      existing.totalCount += s.count || 0;
      existing.searches++;
      termCounts.set(key, existing);
    }

    const topTerms = [...termCounts.values()]
      .sort((a, b) => b.searches - a.searches || b.totalCount - a.totalCount)
      .slice(0, 20);

    // Category demand
    const catCounts = new Map();
    for (const s of allSearches) {
      if (!s.category) continue;
      catCounts.set(s.category, (catCounts.get(s.category) || 0) + 1);
    }
    const categoryDemand = [...catCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));

    return { zeroResultTerms, topTerms, categoryDemand };
  }

  /**
   * 12-week trend data from all widgets with *_by_week arrays.
   */
  computeWeeklyTrends(data) {
    if (!data) return null;

    return {
      revenue: data.hammered?.sum_by_week || null,
      publishing: data.auctions?.published_by_week || null,
      intake: data.newItems?.new_items_by_week || null
    };
  }

  /**
   * Revenue per sold item estimated from R12.
   */
  computeR12PerItem(data) {
    const h = data?.hammered;
    if (!h?.r12 || !h?.average_count_last_seven_days) return null;
    const estimatedAnnualCount = h.average_count_last_seven_days * 365;
    return Math.round(h.r12 / estimatedAnnualCount);
  }

  /**
   * Buyer engagement: live buyers per published lot.
   */
  computeBuyerEngagement(data) {
    const sessions = data?.sharedSessions;
    const auctions = data?.auctions;
    if (!sessions?.buyers || !auctions?.published) return null;
    return {
      buyersPerLot: Math.round((sessions.buyers / auctions.published) * 100) / 100,
      buyers: sessions.buyers,
      lots: auctions.published
    };
  }

  // ─── Search History & Trends ──────────────────────────────────

  /**
   * Load accumulated search history from storage and compute trends.
   */
  async getSearchTrends() {
    try {
      const result = await chrome.storage.local.get(['dashboardSearchHistory']);
      const history = result.dashboardSearchHistory || [];
      if (history.length === 0) return null;

      // Count term frequency across all snapshots
      const termFreq = new Map();
      for (const snapshot of history) {
        const allSearches = [...(snapshot.shared || []), ...(snapshot.company || [])];
        for (const s of allSearches) {
          const key = s.q?.toLowerCase();
          if (!key) continue;
          const existing = termFreq.get(key) || { query: s.q, count: 0, zeroCount: 0, snapshots: 0 };
          existing.snapshots++;
          existing.count += s.c || 0;
          if (s.c === 0 && !s.ended) existing.zeroCount++;
          termFreq.set(key, existing);
        }
      }

      const all = [...termFreq.values()];

      // Trending: terms appearing in many recent snapshots
      const trending = all
        .sort((a, b) => b.snapshots - a.snapshots)
        .slice(0, 20);

      // Persistent zero-results: frequently searched but never found
      const zeroResult = all
        .filter(t => t.zeroCount > 0)
        .sort((a, b) => b.zeroCount - a.zeroCount)
        .slice(0, 10);

      // Top all-time by aggregate result count
      const topAllTime = all
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      return { trending, zeroResult, topAllTime, snapshotCount: history.length };
    } catch (e) {
      return null;
    }
  }

  // ─── Internal ─────────────────────────────────────────────────

  async _fetch(widgetTypes) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Dashboard API timeout')), 15000);
      chrome.runtime.sendMessage({
        type: 'dashboard-fetch',
        widgets: widgetTypes
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response?.success) resolve(response.data);
        else reject(new Error(response?.error || 'Dashboard fetch failed'));
      });
    });
  }

  /** Convert widget key to camelCase property name */
  _normalize(key) {
    // 'sas_employees-hammered' -> 'hammered'
    // 'shared-searches' -> 'sharedSearches'
    // 'shared-sessions' -> 'sharedSessions'
    if (key.startsWith('sas_employees-')) {
      const rest = key.slice('sas_employees-'.length);
      return rest.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    }
    if (key.startsWith('shared-')) {
      const rest = key.slice('shared-'.length);
      return 'shared' + rest.charAt(0).toUpperCase() + rest.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    }
    return key.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
  }
}
