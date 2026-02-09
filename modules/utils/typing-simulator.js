/**
 * Typing Simulator - Simulates human typing to trigger autocomplete fields
 * Used for Auctionet artist field to trigger database lookup and autocomplete
 */
export class TypingSimulator {
    constructor() {
        this.defaultDelay = 50; // ms between characters
        this.autocompleteTimeout = 2000; // max wait for autocomplete
    }

    /**
     * Type text into field character-by-character to trigger autocomplete
     * @param {HTMLElement} field - Input field
     * @param {string} text - Text to type
     * @param {number} delayMs - Delay between characters (default: 50ms)
     */
    async typeIntoField(field, text, delayMs = this.defaultDelay) {
        if (!field || !text) return;

        // Clear field and focus
        field.value = '';
        field.focus();


        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            field.value = text.substring(0, i + 1);

            // Trigger all keyboard events that a real user would trigger
            this.dispatchKeyboardEvents(field, char);

            await this.delay(delayMs);
        }

        // Final blur event to ensure autocomplete triggers
        field.dispatchEvent(new Event('blur', { bubbles: true }));
        field.focus(); // Re-focus for autocomplete
    }

    /**
     * Dispatch all keyboard events for a character
     * @param {HTMLElement} field - Input field
     * @param {string} char - Character being typed
     */
    dispatchKeyboardEvents(field, char) {
        const events = [
            new KeyboardEvent('keydown', { bubbles: true, key: char, code: `Key${char.toUpperCase()}` }),
            new KeyboardEvent('keypress', { bubbles: true, key: char, code: `Key${char.toUpperCase()}` }),
            new Event('input', { bubbles: true }),
            new KeyboardEvent('keyup', { bubbles: true, key: char, code: `Key${char.toUpperCase()}` })
        ];

        events.forEach(event => field.dispatchEvent(event));
    }

    /**
     * Wait for autocomplete dropdown to appear
     * @param {number} timeoutMs - Max wait time
     * @returns {Promise<HTMLElement|null>} Dropdown element or null
     */
    async waitForAutocomplete(timeoutMs = this.autocompleteTimeout) {
        // Common autocomplete dropdown selectors
        const selectors = [
            '.autocomplete-dropdown',
            '.ui-autocomplete',
            '.ui-menu',
            '[role="listbox"]',
            '.dropdown-menu',
            '.suggestions',
            '.autocomplete-suggestions',
            '.tt-menu', // Typeahead
            '.select2-results', // Select2
            '.awesomplete ul' // Awesomplete
        ];


        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            for (const selector of selectors) {
                const dropdown = document.querySelector(selector);
                // Check if dropdown exists and is visible
                if (dropdown && dropdown.offsetParent !== null && dropdown.children.length > 0) {
                    return dropdown;
                }
            }
            await this.delay(100);
        }

        return null;
    }

    /**
     * Select first item from autocomplete dropdown
     * @param {HTMLElement} dropdown - Dropdown element
     * @returns {boolean} Success
     */
    selectFirstItem(dropdown) {
        if (!dropdown) return false;

        // Common autocomplete item selectors
        const itemSelectors = [
            '.autocomplete-item:first-child',
            '.ui-menu-item:first-child',
            '.ui-menu-item:first-child a',
            '[role="option"]:first-child',
            'li:first-child',
            '.suggestion:first-child',
            '.tt-suggestion:first-child',
            '.select2-results__option:first-child'
        ];

        for (const selector of itemSelectors) {
            const item = dropdown.querySelector(selector);
            if (item) {

                // Try multiple selection methods
                item.click();
                item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

                // If it's a link, also trigger it
                if (item.tagName === 'A') {
                    item.dispatchEvent(new Event('click', { bubbles: true }));
                }

                return true;
            }
        }

        return false;
    }

    /**
     * Find exact match in autocomplete dropdown
     * @param {HTMLElement} dropdown - Dropdown element
     * @param {string} text - Text to match
     * @returns {HTMLElement|null} Matching item or null
     */
    findExactMatch(dropdown, text) {
        if (!dropdown) return null;

        const items = dropdown.querySelectorAll('li, [role="option"], .autocomplete-item, .suggestion');
        const normalizedText = text.toLowerCase().trim();

        for (const item of items) {
            const itemText = item.textContent.toLowerCase().trim();
            if (itemText.includes(normalizedText) || normalizedText.includes(itemText)) {
                return item;
            }
        }

        return null;
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in content scripts
if (typeof window !== 'undefined') {
    window.TypingSimulator = TypingSimulator;
}
