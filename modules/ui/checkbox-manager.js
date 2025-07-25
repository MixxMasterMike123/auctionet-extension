// modules/ui/checkbox-manager.js - Clean Checkbox Logic
// Extracted from dashboard-manager.js to make debugging easier

export class CheckboxManager {
  constructor(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
    this.eventListeners = new Map(); // Track listeners for cleanup
  }

  // SAFE HTML entity decoding
  decodeHTMLEntities(value) {
    if (!value) return '';
    
    return value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // Attach event listeners to all checkboxes and labels
  attachCheckboxListeners() {
    
    // Remove existing listeners first to prevent duplicates
    this.removeAllListeners();
    
    // Find all checkbox types
    const allCheckboxes = document.querySelectorAll('.smart-checkbox, .header-checkbox, .suggestion-checkbox');
    
    let attachedCount = 0;
    allCheckboxes.forEach((checkbox, index) => {
      if (!checkbox.dataset.listenerAttached) {
        // Attach change event to checkbox
        const changeHandler = (event) => this.handleCheckboxChange(event);
        checkbox.addEventListener('change', changeHandler);
        
        // Attach click event to the label
        const label = checkbox.closest('label');
        if (label && !label.dataset.labelListenerAttached) {
          const clickHandler = (event) => {
            // Prevent default to avoid double-clicking
            event.preventDefault();
            
            // Toggle the checkbox
            checkbox.checked = !checkbox.checked;
            
            // Trigger change event
            const changeEvent = new Event('change', { bubbles: true });
            checkbox.dispatchEvent(changeEvent);
          };
          
          label.addEventListener('click', clickHandler);
          label.dataset.labelListenerAttached = 'true';
          
          // Track label listener for cleanup
          this.eventListeners.set(label, clickHandler);
        }
        
        // Track checkbox listener for cleanup
        this.eventListeners.set(checkbox, changeHandler);
        checkbox.dataset.listenerAttached = 'true';
        attachedCount++;
      }
    });
    
    return attachedCount;
  }

  // Remove all event listeners
  removeAllListeners() {

    
    let removedCount = 0;
    this.eventListeners.forEach((handler, element) => {
      if (element.tagName === 'INPUT') {
        element.removeEventListener('change', handler);
        delete element.dataset.listenerAttached;
      } else if (element.tagName === 'LABEL') {
        element.removeEventListener('click', handler);
        delete element.dataset.labelListenerAttached;
      }
      removedCount++;
    });
    
    this.eventListeners.clear();
  }

  // Handle checkbox change events
  handleCheckboxChange(event) {
    const checkbox = event.target;
    const rawValue = checkbox.value;
    const decodedValue = this.decodeHTMLEntities(rawValue);
    const isChecked = checkbox.checked;
    
    console.log(`   Raw value: "${rawValue}"`);
    console.log(`   Decoded value: "${decodedValue}"`);
    
    // Get all current checkbox states
    const allSelectedTerms = this.getAllSelectedTerms();
    
    // Update SSoT with new selections (CRITICAL: Don't update hidden keywords field)
    if (this.searchQuerySSoT) {
      this.searchQuerySSoT.updateUserSelections(allSelectedTerms, { updateDOMField: false });
      
      // Trigger dashboard refresh if needed
      this.triggerDashboardRefresh();
    } else {
      console.error('❌ SearchQuerySSoT not available for checkbox handling');
    }
  }

  // Get all currently selected terms from checkboxes
  getAllSelectedTerms() {
    const allCheckboxes = document.querySelectorAll('.smart-checkbox, .header-checkbox, .suggestion-checkbox');
    const selectedTerms = [];
    
    
    allCheckboxes.forEach((checkbox, index) => {
      if (checkbox.checked) {
        const rawValue = checkbox.value;
        const decodedValue = this.decodeHTMLEntities(rawValue);
        
        // Skip invalid or generic values
        if (!decodedValue || decodedValue === '0' || decodedValue === '1' || decodedValue === 'undefined') {
          console.log(`⚠️ Skipping invalid checkbox value: "${rawValue}"`);
          return;
        }
        
        selectedTerms.push(decodedValue);
      }
    });
    
    return selectedTerms;
  }

  // Sync all checkboxes with current SSoT state
  syncAllCheckboxesWithSSoT() {
    if (!this.searchQuerySSoT) {
      console.log('⚠️ Cannot sync checkboxes - SearchQuerySSoT not available');
      return { syncedCount: 0, mismatchCount: 0 };
    }
    
    
    const ssotSelectedTerms = this.searchQuerySSoT.getSelectedTerms() || [];
    
    const allCheckboxes = document.querySelectorAll('.smart-checkbox, .header-checkbox, .suggestion-checkbox');
    
    let syncedCount = 0;
    let mismatchCount = 0;
    
    allCheckboxes.forEach((checkbox, index) => {
      const rawValue = checkbox.value;
      const decodedValue = this.decodeHTMLEntities(rawValue);
      
      // Skip invalid checkboxes
      if (!decodedValue || decodedValue === '0' || decodedValue === '1' || decodedValue === 'undefined') {
        return;
      }
      
      
      // Check if this term should be selected based on SSoT
      const shouldBeChecked = this.shouldCheckboxBeSelected(decodedValue, ssotSelectedTerms);
      
      // Update checkbox state if it doesn't match SSoT
      if (checkbox.checked !== shouldBeChecked) {
        checkbox.checked = shouldBeChecked;
        syncedCount++;
        mismatchCount++;
      } else {
      }
    });
    
    if (syncedCount === 0) {
    }
    
    return { syncedCount, mismatchCount, totalCheckboxes: allCheckboxes.length };
  }

  // Enhanced matching logic for SSoT terms vs checkbox values
  shouldCheckboxBeSelected(checkboxValue, ssotSelectedTerms) {
    // Use SSoT's smart quote matching if available
    if (this.searchQuerySSoT && this.searchQuerySSoT.isTermSelected) {
      const isSelected = this.searchQuerySSoT.isTermSelected(checkboxValue);
      return isSelected;
    }
    
    // Fallback to manual matching
    console.log(`⚠️ Using fallback matching for: "${checkboxValue}"`);
    
    const normalizedCheckboxValue = checkboxValue.toLowerCase().trim();
    
    for (const selectedTerm of ssotSelectedTerms) {
      const normalizedSelectedTerm = selectedTerm.toLowerCase().trim();
      
      // Direct match first
      if (normalizedSelectedTerm === normalizedCheckboxValue) {
        return true;
      }
      
      // Smart quote matching - handle quoted vs unquoted variants
      const selectedWithoutQuotes = selectedTerm.replace(/['"]/g, '').toLowerCase().trim();
      const checkboxWithoutQuotes = checkboxValue.replace(/['"]/g, '').toLowerCase().trim();
      
      if (selectedWithoutQuotes === checkboxWithoutQuotes) {
        return true;
      }
    }
    
    console.log(`❌ NO match: "${checkboxValue}" not found in SSoT selected terms`);
    return false;
  }

  // Trigger dashboard refresh after checkbox changes
  triggerDashboardRefresh() {
    // Emit custom event for dashboard to listen to
    const event = new CustomEvent('checkboxStateChanged', {
      detail: {
        timestamp: Date.now(),
        source: 'checkbox-manager'
      }
    });
    
    document.dispatchEvent(event);
    console.log('📡 Triggered dashboard refresh event');
    
    // CRITICAL: Also trigger search filter manager synchronization
    setTimeout(() => {
      if (window.auctionetExtension?.searchFilterManager) {
        window.auctionetExtension.searchFilterManager.synchronizePillsWithSSoT();
      }
    }, 50);
  }

  // Debug information
  debug() {
    
    const allCheckboxes = document.querySelectorAll('.smart-checkbox, .header-checkbox, .suggestion-checkbox');
    console.log('  Total checkboxes found:', allCheckboxes.length);
    console.log('  Event listeners attached:', this.eventListeners.size);
    
    const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
    console.log('  Currently checked:', checkedCount);
    
    // Show SSoT state
    if (this.searchQuerySSoT) {
      const ssotTerms = this.searchQuerySSoT.getSelectedTerms() || [];
      console.log('  SSoT selected terms:', ssotTerms.length);
      console.log('  SSoT terms:', ssotTerms);
    } else {
      console.log('  SSoT: Not available');
    }
    
    return {
      totalCheckboxes: allCheckboxes.length,
      checkedCheckboxes: checkedCount,
      eventListeners: this.eventListeners.size,
      ssotAvailable: !!this.searchQuerySSoT
    };
  }

  // Cleanup on destruction
  destroy() {
    console.log('🧹 CheckboxManager: Cleaning up...');
    this.removeAllListeners();
    this.searchQuerySSoT = null;
  }
} 