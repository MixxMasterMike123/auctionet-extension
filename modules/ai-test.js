// modules/ai-test.js - Test the new AI-only search query system
// This file is for testing and can be removed later

import { AISearchQueryGenerator } from './ai-search-query-generator.js';
import { SearchQuerySSoT } from './search-query-ssot.js';

// Mock API manager for testing
class MockApiManager {
  async callAI(prompt) {
    console.log('🧪 MOCK AI: Simulating AI response for prompt...');
    console.log('📝 Prompt preview:', prompt.substring(0, 200) + '...');
    
    // Simulate AI response for DX7 synthesizer
    const mockResponse = {
      success: true,
      data: `{
        "searchTerms": ["Yamaha", "DX7"],
        "reasoning": "Prioritized brand (Yamaha) and specific model (DX7) for optimal market data. Excluded year 1983 and technical specs per guidelines.",
        "confidence": 0.9
      }`
    };
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('✅ MOCK AI: Response generated');
    return mockResponse;
  }
}

// Test function
export async function testAISearchGeneration() {
  console.log('🧪 Starting AI Search Query Generation Test...');
  console.log('=' .repeat(50));
  
  const mockApiManager = new MockApiManager();
  const ssot = new SearchQuerySSoT(mockApiManager);
  
  // Test data - the problematic DX7 synthesizer
  const testTitle = "SYNTHESIZER, Yamaha DX7 Programmable Algorithm Synthesizer, Japan. 1983 - 1987.";
  const testDescription = "61 tangenter. MIDI Through, MIDI Input, MIDI Output. Längd 104,";
  
  console.log('📝 Test Input:');
  console.log('   Title:', testTitle);
  console.log('   Description:', testDescription);
  console.log('');
  
  try {
    // Generate AI query
    const result = await ssot.generateAndSetQuery(testTitle, testDescription);
    
    console.log('✅ AI Generation Result:');
    console.log('   Query:', result.query);
    console.log('   Search Terms:', result.searchTerms);
    console.log('   Reasoning:', result.reasoning);
    console.log('   Confidence:', result.confidence);
    console.log('   Source:', result.source);
    console.log('');
    
    // Test search context building
    const searchContext = ssot.buildSearchContext();
    console.log('🔧 Search Context:');
    console.log('   Primary Search:', searchContext.primarySearch);
    console.log('   Search Terms:', searchContext.searchTerms);
    console.log('   Final Search:', searchContext.finalSearch);
    console.log('');
    
    // Validate the query (this will make a real API call)
    console.log('🔍 Validating query on Auctionet...');
    const validation = await ssot.validateCurrentQuery();
    console.log('   Valid:', validation.valid);
    console.log('   Has Results:', validation.hasResults);
    console.log('   Total Matches:', validation.totalMatches);
    console.log('   Test URL:', validation.testUrl);
    console.log('');
    
    // Get status
    const status = ssot.getStatus();
    console.log('📊 SSoT Status:');
    console.log('   Has Query:', status.hasQuery);
    console.log('   Terms Count:', status.termsCount);
    console.log('   Listeners:', status.listenersCount);
    console.log('   Cache Stats:', status.cacheStats);
    
    console.log('');
    console.log('✅ Test completed successfully!');
    console.log('=' .repeat(50));
    
    return { success: true, result, validation, status };
    
  } catch (error) {
    console.error('💥 Test failed:', error);
    console.log('=' .repeat(50));
    return { success: false, error };
  }
}

// Export for use in other modules
export { MockApiManager }; 