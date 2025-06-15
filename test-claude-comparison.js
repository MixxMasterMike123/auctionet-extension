// Claude 4 Sonnet vs 3.5 Sonnet Comparison Test
// Run this in browser console on any Auctionet page

async function compareClaudeModels() {
  console.log('🚀 Claude Model Comparison Test');
  console.log('================================');
  
  // Test prompts - mix of reasoning, coding, and Swedish auction knowledge
  const testPrompts = [
    {
      name: "Swedish Auction Logic",
      prompt: "En keramikvas är märkt 'Upsala Ekeby'. Förklara kort vad detta betyder för värdering och ge en uppskattning av ålder och stilperiod."
    },
    {
      name: "Math Reasoning", 
      prompt: "If a vase sold for 2,400 SEK including 25% buyer's premium, what was the hammer price?"
    },
    {
      name: "Creative Problem Solving",
      prompt: "Write a haiku about Swedish ceramics that includes the word 'glaze'"
    },
    {
      name: "Code Generation",
      prompt: "Write a JavaScript function that calculates auction estimates with 20% margin above and below a base price"
    }
  ];

  // Get current model from extension
  const currentModel = window.auctionetAssistant?.apiManager?.getCurrentModel?.()?.id || 'unknown';
  console.log(`Current model: ${currentModel}`);
  
  if (!window.auctionetAssistant?.apiManager) {
    console.error('❌ Auctionet Assistant not found. Make sure you\'re on an auction page.');
    return;
  }

  console.log('\n📝 Running test prompts...\n');

  for (let i = 0; i < testPrompts.length; i++) {
    const test = testPrompts[i];
    console.log(`\n🧪 Test ${i + 1}: ${test.name}`);
    console.log(`Prompt: "${test.prompt}"`);
    console.log('⏳ Processing...');
    
    try {
      const startTime = Date.now();
      
      // Use the extension's API manager to make the request
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: window.auctionetAssistant.apiManager.apiKey,
          body: {
            model: currentModel,
            max_tokens: 1000,
            temperature: 0.1,
            messages: [{
              role: 'user',
              content: test.prompt
            }]
          }
        }, (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ Response (${duration}ms):`);
      console.log(response.content[0].text);
      console.log('─'.repeat(50));
      
    } catch (error) {
      console.error(`❌ Error in test ${i + 1}:`, error);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🎯 Test Complete!');
  console.log('Now switch models in extension settings and run again to compare.');
}

// Instructions for user
console.log(`
🔬 CLAUDE MODEL COMPARISON INSTRUCTIONS:

1. First, check your current model:
   - Open extension popup
   - Note which Claude model is selected

2. Run the test:
   compareClaudeModels()

3. Switch models:
   - Change to the other Claude model in settings
   - Run the test again: compareClaudeModels()

4. Compare results:
   - Look for differences in reasoning depth
   - Check response quality and accuracy
   - Note any speed differences

Ready to start? Run: compareClaudeModels()
`);

// Make function available globally
window.compareClaudeModels = compareClaudeModels; 