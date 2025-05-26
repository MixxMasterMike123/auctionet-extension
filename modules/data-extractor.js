// modules/data-extractor.js - Data Extraction Module
export class DataExtractor {
  extractItemData() {
    return {
      category: document.querySelector('#item_category_id option:checked')?.textContent || '',
      title: document.querySelector('#item_title_sv')?.value || '',
      description: document.querySelector('#item_description_sv')?.value || '',
      condition: document.querySelector('#item_condition_sv')?.value || '',
      artist: document.querySelector('#item_artist_name_sv')?.value || '',
      keywords: document.querySelector('#item_hidden_keywords')?.value || '',
      estimate: document.querySelector('#item_current_auction_attributes_estimate')?.value || '',
      reserve: document.querySelector('#item_current_auction_attributes_reserve')?.value || ''
    };
  }

  isCorrectPage() {
    const url = window.location.href;
    return url.includes('auctionet.com/admin/') && 
           url.includes('/items/') && 
           url.includes('/edit') &&
           document.querySelector('#item_title_sv');
  }
} 