/**
 * Page Detector Module
 * Handles page type detection and SPA navigation events for Auctionet Extension
 */

export class PageDetector {
    constructor(onPageChange) {
        this.onPageChange = onPageChange;
        this.lastInitializedHash = '';
        this.mutationObserver = null;
        this.isInitialized = false;
    }

    /**
     * Detect the current page type based on URL and DOM elements
     * @returns {Object} { isSupported: boolean, type: 'edit'|'add'|null, needsRetry: boolean }
     */
    detectPageType() {
        const url = window.location.href;
        const hash = window.location.hash;

        console.log('🔍 Detecting page type:', {
            url,
            hash,
            hasItemTitle: !!document.querySelector('#item_title_sv'),
            itemTitleElement: document.querySelector('#item_title_sv')
        });

        // Check for edit page
        if (url.includes('auctionet.com/admin/') &&
            url.includes('/items/') &&
            url.includes('/edit') &&
            document.querySelector('#item_title_sv')) {
            console.log('✅ Detected EDIT page');
            return { isSupported: true, type: 'edit' };
        }

        // Check for add items page - NEW URL PATTERN
        if (url.includes('auctionet.com/admin/sas/sellers/') &&
            url.includes('/contracts/') &&
            hash === '#new_item') {
            // For new item pages, we don't require #item_title_sv to be present immediately
            // as it might be loaded dynamically. The SPA detection will retry.
            const hasFormElements = document.querySelector('#item_title_sv') ||
                document.querySelector('#new_item') ||
                document.querySelector('.item_form') ||
                document.querySelector('form[action*="items"]');

            if (hasFormElements || document.readyState === 'loading') {
                console.log('✅ Detected ADD page (new pattern)', hasFormElements ? 'with form elements' : 'loading');
                return { isSupported: true, type: 'add' };
            } else {
                console.log('⏳ ADD page detected but form not ready, will retry...');
                // Return supported but mark for retry
                return { isSupported: true, type: 'add', needsRetry: true };
            }
        }

        // Legacy check for old add items URL pattern (fallback)
        if (url.includes('auctionet.com/admin/') &&
            url.includes('/items/new') &&
            document.querySelector('#item_title_sv')) {
            console.log('✅ Detected ADD page (legacy pattern)');
            return { isSupported: true, type: 'add' };
        }

        // Debug why page wasn't detected
        console.log('❌ Page not supported. Checking conditions:');
        console.log('  - URL contains admin:', url.includes('auctionet.com/admin/'));
        console.log('  - URL contains sellers:', url.includes('admin/sas/sellers/'));
        console.log('  - URL contains contracts:', url.includes('/contracts/'));
        console.log('  - Hash is #new_item:', hash === '#new_item');
        console.log('  - Has #item_title_sv element:', !!document.querySelector('#item_title_sv'));

        return { isSupported: false, type: null };
    }

    /**
     * Set up SPA detection listeners (hash change and mutation observer)
     */
    setupSPADetection() {
        console.log('🔄 Setting up SPA detection system...');

        // Hash change listener for SPA navigation
        window.addEventListener('hashchange', () => {
            console.log('🔄 Hash changed to:', window.location.hash);
            if (this.onPageChange) {
                setTimeout(() => this.onPageChange(), 500);
            }
        });

        // MutationObserver to watch for DOM changes (AddItem form appearance)
        this.mutationObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;

            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if AddItem form elements were added
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.querySelector?.('#item_title_sv, .item_form, #new_item') ||
                                node.id === 'item_title_sv' ||
                                node.classList?.contains('item_form')) {
                                shouldCheck = true;
                                break;
                            }
                        }
                    }
                }
            });

            if (shouldCheck) {
                console.log('🔄 DOM change detected, checking for AddItem form...');
                if (this.onPageChange) {
                    setTimeout(() => this.onPageChange(), 500);
                }
            }
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('✅ SPA detection system set up successfully');
    }

    /**
     * Clean up observers
     */
    destroy() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
    }
}
