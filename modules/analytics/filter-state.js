// filter-state.js — Reactive filter state with event emitter

export class FilterState {
  constructor() {
    this._state = {
      year: new Date().getFullYear(),
      quarter: null,     // null = all quarters, 0-3 for Q1-Q4 (mutually exclusive with month)
      month: null,       // null = all months, 0-11 for specific month
      categoryId: null,  // null = all categories, parent category ID for specific
      priceRange: null,  // null = all prices, { min, max } for specific bracket
    };
    this._listeners = [];
  }

  get year() { return this._state.year; }
  get quarter() { return this._state.quarter; }
  get month() { return this._state.month; }
  get categoryId() { return this._state.categoryId; }
  get priceRange() { return this._state.priceRange; }

  setYear(year) {
    if (this._state.year === year) return;
    this._state.year = year;
    this._emit();
  }

  setQuarter(quarter) {
    if (this._state.quarter === quarter && this._state.month == null) return;
    this._state.quarter = quarter;
    this._state.month = null;
    this._emit();
  }

  setMonth(month) {
    if (this._state.month === month && this._state.quarter == null) return;
    this._state.month = month;
    this._state.quarter = null;
    this._emit();
  }

  setCategoryId(categoryId) {
    if (this._state.categoryId === categoryId) return;
    this._state.categoryId = categoryId;
    this._emit();
  }

  setPriceRange(priceRange) {
    const curr = this._state.priceRange;
    if (curr === priceRange) return;
    if (curr && priceRange && curr.min === priceRange.min && curr.max === priceRange.max) return;
    this._state.priceRange = priceRange;
    this._emit();
  }

  clearAll() {
    this._state.quarter = null;
    this._state.month = null;
    this._state.categoryId = null;
    this._state.priceRange = null;
    this._emit();
  }

  getFilters() {
    return { ...this._state };
  }

  onChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  }

  _emit() {
    const filters = this.getFilters();
    for (const fn of this._listeners) {
      fn(filters);
    }
  }
}
