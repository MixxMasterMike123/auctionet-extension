/**
 * Artist Field Manager - Handles artist field operations with autocomplete integration
 * Manages moving artists to the artist field and triggering Auctionet's autocomplete
 */
export class ArtistFieldManager {
    constructor(typingSimulator = null) {
        this.typingSimulator = typingSimulator || (window.TypingSimulator ? new window.TypingSimulator() : null);

        // Field selectors
        this.artistFieldSelectors = [
            '#item_artist_name_sv',
            'input[name*="artist"]',
            'input[id*="artist"]',
            'input[placeholder*="konstnär"]',
            'input[placeholder*="artist"]'
        ];

        this.titleFieldSelectors = [
            '#item_title_sv',
            'input[name*="title"]',
            'input[id*="title"]',
            'textarea[name*="title"]',
            'textarea[id*="title"]'
        ];
    }

    /**
     * Find artist field using multiple selectors
     * @returns {HTMLElement|null}
     */
    findArtistField() {
        for (const selector of this.artistFieldSelectors) {
            const field = document.querySelector(selector);
            if (field) return field;
        }
        return null;
    }

    /**
     * Find title field using multiple selectors
     * @returns {HTMLElement|null}
     */
    findTitleField() {
        for (const selector of this.titleFieldSelectors) {
            const field = document.querySelector(selector);
            if (field) return field;
        }
        return null;
    }

    /**
     * Move artist to field with autocomplete integration
     * @param {string} artistName - Artist name to move
     * @param {string} suggestedTitle - Optional suggested title (with artist removed)
     * @param {Object} options - Additional options
     * @returns {Promise<boolean>} Success status
     */
    async moveArtistToField(artistName, suggestedTitle = null, options = {}) {
        try {
            const artistField = this.findArtistField();
            if (!artistField) {
                console.error('Artist field not found');
                return false;
            }


            // Check if typing simulator is available
            if (this.typingSimulator) {
                // Use typing simulation to trigger autocomplete
                await this.moveWithAutocomplete(artistField, artistName);
            } else {
                // Fallback: simple value assignment
                this.moveWithoutAutocomplete(artistField, artistName);
            }

            // Update title if suggested title provided
            if (suggestedTitle && suggestedTitle.trim()) {
                const titleField = this.findTitleField();
                if (titleField) {
                    titleField.value = suggestedTitle;
                    titleField.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }

            // Trigger callbacks if provided
            if (options.onSuccess) {
                options.onSuccess(artistName, suggestedTitle);
            }

            return true;

        } catch (error) {
            console.error('Error moving artist:', error);

            // Fallback to simple value assignment
            const artistField = this.findArtistField();
            if (artistField) {
                artistField.value = artistName;
                artistField.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (options.onError) {
                options.onError(error);
            }

            return false;
        }
    }

    /**
     * Move artist with autocomplete (typing simulation)
     * @param {HTMLElement} artistField - Artist field element
     * @param {string} artistName - Artist name
     */
    async moveWithAutocomplete(artistField, artistName) {
        // Step 1: Simulate typing to trigger autocomplete
        await this.typingSimulator.typeIntoField(artistField, artistName, 50);

        // Step 2: Wait for autocomplete dropdown
        const dropdown = await this.typingSimulator.waitForAutocomplete(2000);

        if (dropdown) {

            // Step 3: Try to find exact match first
            const exactMatch = this.typingSimulator.findExactMatch(dropdown, artistName);
            if (exactMatch) {
                exactMatch.click();
            } else {
                // Fallback: select first item
                const selected = this.typingSimulator.selectFirstItem(dropdown);
                
            }

            // Wait for selection to register
            await this.typingSimulator.delay(300);
        } else {
            // Ensure value is set
            artistField.value = artistName;
            artistField.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * Move artist without autocomplete (fallback)
     * @param {HTMLElement} artistField - Artist field element
     * @param {string} artistName - Artist name
     */
    moveWithoutAutocomplete(artistField, artistName) {
        artistField.value = artistName;

        // Trigger all relevant events
        const events = ['input', 'change', 'blur'];
        events.forEach(eventType => {
            artistField.dispatchEvent(new Event(eventType, { bubbles: true }));
        });
    }

    /**
     * Highlight artist field to show where artist was added
     * @param {number} duration - Duration in ms (default: 2000)
     */
    highlightArtistField(duration = 2000) {
        const artistField = this.findArtistField();
        if (!artistField) return;

        const originalBackground = artistField.style.backgroundColor;
        const originalBorder = artistField.style.border;

        artistField.style.backgroundColor = '#e8f5e8';
        artistField.style.border = '2px solid #4caf50';
        artistField.style.transition = 'all 0.3s ease';

        // Scroll to field if not visible
        artistField.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Reset after duration
        setTimeout(() => {
            artistField.style.backgroundColor = originalBackground;
            artistField.style.border = originalBorder;
        }, duration);
    }

    /**
     * Highlight title field to show it was updated
     * @param {number} duration - Duration in ms (default: 2000)
     */
    highlightTitleField(duration = 2000) {
        const titleField = this.findTitleField();
        if (!titleField) return;

        const originalBackground = titleField.style.backgroundColor;
        const originalBorder = titleField.style.border;

        titleField.style.backgroundColor = '#fff3e0';
        titleField.style.border = '2px solid #ff9800';
        titleField.style.transition = 'all 0.3s ease';

        // Reset after duration
        setTimeout(() => {
            titleField.style.backgroundColor = originalBackground;
            titleField.style.border = originalBorder;
        }, duration);
    }
}

// Export for use in content scripts
if (typeof window !== 'undefined') {
    window.ArtistFieldManager = ArtistFieldManager;
}
