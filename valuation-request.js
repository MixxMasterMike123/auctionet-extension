// valuation-request.js - Entry script for Valuation Request pages
// Lightweight loader that imports only the modules needed for AI valuation

// Only activate on single valuation request pages (not the list page)
if (/\/valuation_requests\/\d+/.test(window.location.pathname)) {

  // Import required modules
  const imports = [
    import('./modules/add-items-api-bridge.js').then(m => { window.AddItemsAPIBridge = m.AddItemsAPIBridge; }),
    import('./modules/config.js').then(m => { window.CONFIG = m.CONFIG; }),
    import('./modules/refactored/components/ai-image-analyzer.js').then(m => { window.AIImageAnalyzer = m.AIImageAnalyzer; }),
    import('./modules/refactored/ai-rules-system/ai-rules-manager.js').then(m => {
      window.AIRulesManager = m.AIRulesManager;
      const aiRulesManager = new m.AIRulesManager();
      const waitForRules = () => {
        if (aiRulesManager.loaded) {
          window.getAIRulesManager = () => aiRulesManager;
          window.getSystemPrompt = aiRulesManager.getSystemPrompt.bind(aiRulesManager);
          window.getModelSpecificValuationRules = aiRulesManager.getModelSpecificValuationRules.bind(aiRulesManager);
          window.getBrandCorrections = aiRulesManager.getBrandCorrections.bind(aiRulesManager);
          window.getArtistCorrections = aiRulesManager.getBrandCorrections.bind(aiRulesManager);
        } else {
          setTimeout(waitForRules, 200);
        }
      };
      setTimeout(waitForRules, 100);
    }),
    import('./modules/valuation-request-assistant.js').then(m => { window.ValuationRequestAssistant = m.ValuationRequestAssistant; })
  ];

  Promise.all(imports).then(async () => {
    // Wait for API bridge + AI rules to be ready
    const apiBridge = new window.AddItemsAPIBridge();
    await apiBridge.init();

    // Wait for AI rules to load
    await new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        if (window.getSystemPrompt && window.getModelSpecificValuationRules) {
          resolve();
        } else if (++attempts > 100) {
          reject(new Error('Timeout waiting for AI rules'));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Initialize the assistant
    const assistant = new window.ValuationRequestAssistant(apiBridge.getAPIManager());
    assistant.init();

    console.log('[ValuationRequest] AI Valuation Assistant initialized');
  }).catch(error => {
    console.error('[ValuationRequest] Failed to initialize:', error);
  });

}
