// Test Chrome storage for company exclusion setting
console.log('🔍 Testing Chrome storage for company exclusion...');

// Check what's actually stored
chrome.storage.sync.get(null, (result) => {
  console.log('📦 All Chrome storage contents:', result);
  
  // Specifically check for excludeCompanyId
  chrome.storage.sync.get(['excludeCompanyId'], (excludeResult) => {
    console.log('🚫 excludeCompanyId setting:', excludeResult);
    
    if (excludeResult.excludeCompanyId) {
      console.log('✅ Company exclusion found:', excludeResult.excludeCompanyId);
    } else {
      console.log('❌ No company exclusion setting found');
      console.log('💡 You need to set the company exclusion in the extension popup');
    }
  });
}); 