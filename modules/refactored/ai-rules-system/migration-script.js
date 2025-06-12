/**
 * AI Rules Migration Script
 * 
 * This script migrates scattered AI rules from api-manager.js to the new
 * centralized AI Rules System, removing ~700 lines of duplicated code.
 */

// Import the AI Rules Manager
// Note: In browser environment, this will be available globally
const { getAIRulesManager, buildPrompt, getCategoryPrompt } = 
    typeof window !== 'undefined' ? window : require('./ai-rules-manager.js');

/**
 * Migrate api-manager.js to use the new AI Rules System
 * This replaces the massive getSystemPrompt() and getUserPrompt() functions
 */
class APIManagerMigration {
    
    /**
     * Replace the old getSystemPrompt() method
     * OLD: ~100 lines of hardcoded rules
     * NEW: Single call to global system
     */
    static getSystemPrompt() {
        // Get the extracted system prompt from the global rules
        const manager = getAIRulesManager();
        return manager.rules.extractedRules.apiManager.systemPrompt;
    }
    
    /**
     * Replace the old getUserPrompt() method
     * OLD: ~400 lines of complex logic
     * NEW: Clean, maintainable prompt building
     */
    static getUserPrompt(itemData, fieldType) {
        // Build the base information section
        const baseInfo = this.buildBaseInfo(itemData);
        
        // Get category-specific rules
        const categoryRules = this.getCategorySpecificRules(itemData);
        
        // Build field-specific prompt
        const fieldPrompt = this.getFieldSpecificPrompt(fieldType, itemData);
        
        return `${baseInfo}\n\n${categoryRules}\n\n${fieldPrompt}`;
    }
    
    /**
     * Build base information section
     */
    static buildBaseInfo(itemData) {
        return `
FÖREMÅLSINFORMATION:
Kategori: ${itemData.category}
Nuvarande titel: ${itemData.title}
Nuvarande beskrivning: ${itemData.description}
Kondition: ${itemData.condition}
Konstnär/Formgivare: ${itemData.artist}
Värdering: ${itemData.estimate} SEK

VIKTIGT FÖR TITEL: ${itemData.artist ? 
  'Konstnär/formgivare-fältet är ifyllt (' + itemData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet. FÖRSTA ORDET I TITELN SKA VARA PROPER KAPITALISERAT (första bokstaven versal, resten gemener) eftersom konstnären läggs till i versaler automatiskt. Exempel: "Skulpturer" INTE "SKULPTURER" och INTE "skulpturer".' : 
  'Konstnär/formgivare-fältet är tomt, så inkludera konstnärens namn i titeln om det är känt. FÖRSTA ORDET I TITELN SKA VARA VERSALER (uppercase).'}

KRITISKT - KONSTNÄR I MITTEN/SLUTET AV TITEL:
• Om konstnärsnamn förekommer i MITTEN eller SLUTET av titeln (inte först) - BEHÅLL det där
• Detta gäller när OBJEKTET är huvudsaken, inte konstnären
• Korrigera stavfel i konstnärsnamnet men behåll positionen
• FÖRSTA ORDET ska vara VERSALER (objektnamnet)
• EXEMPEL: "SERVISDELAR, 24 delar, porslin, Stig Lindberg, 'Spisa Ribb', Gustavsberg. 1900-tal."
• Konstnären stannar i titeln när den INTE är i början

KRITISKT - BEHÅLL OSÄKERHETSMARKÖRER I TITEL:
Om nuvarande titel innehåller ord som "troligen", "tillskriven", "efter", "stil av", "möjligen", "typ" - BEHÅLL dessa exakt. De anger juridisk osäkerhet och får ALDRIG tas bort eller ändras.

ANTI-HALLUCINATION INSTRUKTIONER:
• Lägg ALDRIG till information som inte finns i källdata
• Uppfinn ALDRIG tidsperioder, material, mått eller skador
• Förbättra ENDAST språk, struktur och terminologi
• Om information saknas - utelämna eller använd osäkerhetsmarkörer`;
    }
    
    /**
     * Replace the old getCategorySpecificRules() method
     * OLD: ~200 lines of hardcoded category detection and rules
     * NEW: Clean call to global system
     */
    static getCategorySpecificRules(itemData) {
        // Use the global system to get category rules
        const category = this.detectCategory(itemData);
        if (category) {
            return getCategoryPrompt(category);
        }
        return '';
    }
    
    /**
     * Detect category from item data
     * Simplified version of the complex detection logic
     */
    static detectCategory(itemData) {
        const category = itemData.category?.toLowerCase() || '';
        const title = itemData.title?.toLowerCase() || '';
        const description = itemData.description?.toLowerCase() || '';
        
        // Detect weapons and militaria
        const weaponKeywords = ['vapen', 'svärd', 'kniv', 'bajonett', 'militaria', 'krigshistoria'];
        const titleWeaponKeywords = ['svärd', 'bajonett', 'kniv', 'dolk', 'yxa', 'spjut', 'gevär', 'pistol'];
        
        if (weaponKeywords.some(keyword => category.includes(keyword)) ||
            titleWeaponKeywords.some(keyword => title.includes(keyword)) ||
            description.includes('vapen') || description.includes('militär')) {
            return 'weapons';
        }
        
        // Detect watches/timepieces
        if (category.includes('armbandsur') || category.includes('klocka') ||
            title.includes('armbandsur') || title.includes('klocka')) {
            return 'watches';
        }
        
        // Detect historical items
        const historicalKeywords = ['antikviteter', 'arkeologi', 'etnografika', 'historiska', 'kulturhistoria'];
        const titleHistoricalKeywords = ['antik', 'historisk', 'forntid', 'medeltid', 'vikinga', 'bronsålder'];
        
        if (historicalKeywords.some(keyword => category.includes(keyword)) ||
            titleHistoricalKeywords.some(keyword => title.includes(keyword))) {
            return 'historical';
        }
        
        // Detect jewelry
        const jewelryKeywords = ['smycken', 'guld', 'silver', 'diamant', 'ädelsten'];
        const titleJewelryKeywords = ['ring', 'halsband', 'armband', 'brosch', 'örhängen'];
        
        if (jewelryKeywords.some(keyword => category.includes(keyword)) ||
            titleJewelryKeywords.some(keyword => title.includes(keyword))) {
            return 'jewelry';
        }
        
        return null;
    }
    
    /**
     * Get field-specific prompt based on field type
     */
    static getFieldSpecificPrompt(fieldType, itemData) {
        const manager = getAIRulesManager();
        
        switch(fieldType) {
            case 'all':
            case 'all-sparse':
                return manager.rules.promptTemplates.fieldSpecific.all;
                
            case 'title':
                return manager.rules.promptTemplates.fieldSpecific.title;
                
            case 'description':
                return manager.rules.promptTemplates.fieldSpecific.description;
                
            case 'condition':
                return manager.rules.promptTemplates.fieldSpecific.condition;
                
            case 'keywords':
                return manager.rules.promptTemplates.fieldSpecific.keywords;
                
            case 'search_query':
                return `You are an expert auction search optimizer. Generate 2-3 optimal search terms for finding comparable items.

TITLE: "${itemData.title}"
DESCRIPTION: "${itemData.description}"

GUIDELINES:
1. PRIORITY: Brand/Manufacturer → Model → Category
2. NEVER use years, conditions, technical specs, or materials (unless luxury)
3. BE CONSERVATIVE: Better few good results than many mixed
4. EXAMPLES:
   - "SYNTHESIZER, Yamaha DX7..." → ["Yamaha", "DX7"] 
   - "ROLEX Submariner..." → ["Rolex", "Submariner"]
   - "RING, 18k gold..." → ["18k gold", "ring"]

Return JSON only:
{
  "searchTerms": ["term1", "term2"],
  "reasoning": "Brief explanation", 
  "confidence": 0.9
}`;
                
            default:
                return manager.rules.promptTemplates.fieldSpecific.all;
        }
    }
    
    /**
     * Migration statistics
     */
    static getMigrationStats() {
        return {
            linesRemoved: {
                getSystemPrompt: 100,
                getUserPrompt: 400,
                getCategorySpecificRules: 200,
                total: 700
            },
            filesAffected: ['modules/api-manager.js'],
            benefitsAchieved: [
                'Single source of truth for AI rules',
                'Eliminated code duplication',
                'Improved maintainability',
                'Global access to rules',
                'Performance optimization with caching'
            ]
        };
    }
}

// Export for use in api-manager.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManagerMigration;
} else {
    window.APIManagerMigration = APIManagerMigration;
}

console.log('🔄 AI Rules Migration Script loaded');
console.log('📊 Migration will remove ~700 lines from api-manager.js');
console.log('✅ Ready to migrate to centralized AI Rules System'); 