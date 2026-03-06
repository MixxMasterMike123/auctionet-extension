// filter-state.js — Reactive filter state with event emitter

export class FilterState {
  constructor() {
    this._state = {
      year: new Date().getFullYear(),
      month: null,       // null = all months, 0-11 for specific month
      categoryId: null,  // null = all categories, parent category ID for specific
    };
    this._listeners = [];
  }

  get year() { return this._state.year; }
  get month() { return this._state.month; }
  get categoryId() { return this._state.categoryId; }

  setYear(year) {
    if (this._state.year === year) return;
    this._state.year = year;
    this._emit();
  }

  setMonth(month) {
    if (this._state.month === month) return;
    this._state.month = month;
    this._emit();
  }

  setCategoryId(categoryId) {
    if (this._state.categoryId === categoryId) return;
    this._state.categoryId = categoryId;
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
