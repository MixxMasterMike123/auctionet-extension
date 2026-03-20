// category-registry.js — Maps Auctionet sub-category IDs to parent category names
// Built from API discovery: querying parent category_id returns items with sub-category IDs

const SUB_TO_PARENT = {
  // Belysning & Lampor (parent: 1)
  2: 1, 3: 1, 4: 1, 5: 1, 124: 1, 125: 1, 203: 1,
  // Glas (parent: 6)
  7: 6, 8: 6, 208: 6, 209: 6,
  // Keramik & Porslin (parent: 9)
  10: 9, 11: 9, 12: 9, 210: 9,
  // Smycken & Ädelstenar (parent: 13)
  14: 13, 48: 13, 104: 13, 106: 13, 107: 13, 109: 13, 111: 13, 112: 13, 115: 13, 118: 13, 259: 13,
  // Möbler (parent: 16)
  17: 16, 18: 16, 19: 16, 20: 16, 22: 16, 23: 16, 24: 16, 279: 16, 280: 16, 281: 16,
  // Konst (parent: 25)
  26: 25, 27: 25, 28: 25, 29: 25, 30: 25, 119: 25,
  // Klockor & Ur (parent: 31)
  15: 31, 32: 31, 33: 31, 34: 31, 110: 31, 127: 31, 258: 31,
  // Mattor & Textil (parent: 35)
  36: 35, 37: 35, 285: 35, 286: 35, 287: 35,
  // Silver & Metall (parent: 38)
  39: 38, 40: 38, 41: 38, 213: 38,
  // Speglar (parent: 42)
  42: 42,
  // Övrigt (parent: 43)
  47: 43, 52: 43, 133: 43,
  // Leksaker (parent: 44)
  211: 44, 212: 44, 274: 44, 275: 44, 276: 44, 277: 44, 278: 44,
  // Mynt, Medaljer & Frimärken (parent: 46)
  128: 46, 131: 46, 135: 46, 136: 46,
  // Vintagekläder & Accessoarer (parent: 49)
  49: 49,
  // Böcker, Kartor & Handskrifter (parent: 50)
  204: 50, 205: 50, 206: 50, 207: 50,
  // Foto, Kameror & Optik (parent: 57)
  66: 57, 71: 57, 72: 57,
  // Allmoge (parent: 58)
  120: 58, 121: 58, 122: 58, 123: 58,
  // Licensvapen (parent: 59)
  60: 59, 61: 59, 62: 59, 63: 59, 65: 59, 67: 59, 68: 59, 69: 59, 70: 59,
  // Asiatika (parent: 117)
  319: 117, 320: 117, 321: 117, 322: 117, 324: 117, 325: 117,
  // Etnografika (parent: 134)
  134: 134, 282: 134, 283: 134, 284: 134,
  // Vapen & Militaria (parent: 137)
  129: 137, 130: 137, 138: 137, 214: 137, 257: 137,
  // Vin & Sprit (parent: 170)
  170: 170,
  // Fordon & Båtar (parent: 249)
  132: 249, 215: 249, 216: 249, 250: 249, 251: 249, 252: 249, 253: 249, 254: 249, 255: 249, 256: 249,
  // Samlarföremål (parent: 261)
  45: 261, 51: 261, 54: 261, 262: 261, 263: 261, 264: 261, 265: 261, 266: 261, 267: 261, 268: 261, 269: 261,
  // Trädgård & Byggnadsvård (parent: 270)
  21: 270, 271: 270, 272: 270, 273: 270,
};

const PARENT_NAMES = {
  1: 'Belysning & Lampor',
  6: 'Glas',
  9: 'Keramik & Porslin',
  13: 'Smycken & Ädelstenar',
  16: 'Möbler',
  25: 'Konst',
  31: 'Klockor & Ur',
  35: 'Mattor & Textil',
  38: 'Silver & Metall',
  42: 'Speglar',
  43: 'Övrigt',
  44: 'Leksaker',
  46: 'Mynt & Medaljer',
  49: 'Vintage & Accessoarer',
  50: 'Böcker & Handskrifter',
  57: 'Foto & Optik',
  58: 'Allmoge',
  59: 'Licensvapen',
  117: 'Asiatika',
  134: 'Etnografika',
  137: 'Vapen & Militaria',
  170: 'Vin & Sprit',
  249: 'Fordon & Båtar',
  261: 'Samlarföremål',
  270: 'Trädgård & Bygg',
};

// All 25 parent category IDs
export const PARENT_CATEGORY_IDS = Object.keys(PARENT_NAMES).map(Number);

// All sub-category IDs (used for sharded fetching — sub-categories give ~96% coverage
// vs ~77% with parent categories, since fewer sub-cats exceed the 10k API cap)
export const SUB_CATEGORY_IDS = Object.keys(SUB_TO_PARENT).map(Number);

export function getParentCategoryId(subCategoryId) {
  return SUB_TO_PARENT[subCategoryId] || subCategoryId;
}

export function getCategoryName(categoryId) {
  const parentId = SUB_TO_PARENT[categoryId] || categoryId;
  return PARENT_NAMES[parentId] || `Kategori ${categoryId}`;
}

export function getAllParentCategories() {
  return Object.entries(PARENT_NAMES).map(([id, name]) => ({
    id: Number(id),
    name,
  }));
}
