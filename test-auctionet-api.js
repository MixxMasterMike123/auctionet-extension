// test-auctionet-api.js - Proof of Concept for Auctionet API Integration
// Testing access to 3.65M+ items in Auctionet's archive

async function testAuctionetAPI() {
  console.log('🔍 Testing Auctionet API access...');
  
  // Test different API endpoints and parameters
  const testQueries = [
    // Basic ended auctions
    'https://auctionet.com/api/v2/items.json?is=ended&per_page=5',
    
    // Search for silver items (like our Lars Löfgren example)
    'https://auctionet.com/api/v2/items.json?is=ended&q=silver&per_page=5',
    
    // Search for specific artist/maker
    'https://auctionet.com/api/v2/items.json?is=ended&q=Lars+Löfgren&per_page=5',
    
    // Search for object type
    'https://auctionet.com/api/v2/items.json?is=ended&q=pokal&per_page=5',
    
    // Search with period
    'https://auctionet.com/api/v2/items.json?is=ended&q=1800-tal&per_page=5'
  ];

  for (const [index, url] of testQueries.entries()) {
    try {
      console.log(`\n📡 Test ${index + 1}: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`✅ Response received:`);
      console.log(`📊 Total entries: ${data.pagination?.total_entries || 'unknown'}`);
      console.log(`📄 Current page: ${data.pagination?.current_page || 'unknown'}`);
      console.log(`📚 Total pages: ${data.pagination?.total_pages || 'unknown'}`);
      console.log(`🎯 Items returned: ${data.items?.length || 0}`);
      
      // Analyze first item if available
      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        console.log(`\n🔍 Sample item analysis:`);
        console.log(`📝 Title: ${item.title}`);
        console.log(`💰 Estimate: ${item.estimate} ${item.currency}`);
        console.log(`🔨 Hammered: ${item.hammered}`);
        console.log(`🏠 House: ${item.house}`);
        console.log(`📅 Ends at: ${new Date(item.ends_at * 1000).toLocaleDateString()}`);
        
        // Check for final bid amount
        if (item.bids && item.bids.length > 0) {
          const finalBid = item.bids[0]; // Bids seem to be sorted by timestamp desc
          console.log(`💵 Final bid: ${finalBid.amount} ${item.currency}`);
          console.log(`⏰ Bid timestamp: ${new Date(finalBid.timestamp * 1000).toLocaleString()}`);
        }
        
        // Check for reserve information
        if (item.reserve_met !== null) {
          console.log(`🎯 Reserve met: ${item.reserve_met}`);
          if (item.reserve_amount) {
            console.log(`🔒 Reserve amount: ${item.reserve_amount} ${item.currency}`);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Test ${index + 1} failed:`, error);
    }
    
    // Small delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Function to analyze market data for a specific item
async function analyzeMarketData(searchTerms, objectType = null) {
  console.log(`\n🎯 Analyzing market data for: ${searchTerms.join(' ')}`);
  
  try {
    // Build search query
    const query = searchTerms.join('+');
    const url = `https://auctionet.com/api/v2/items.json?is=ended&q=${encodeURIComponent(query)}&per_page=20`;
    
    console.log(`📡 Searching: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.log('❌ No comparable items found');
      return null;
    }
    
    console.log(`✅ Found ${data.items.length} comparable items out of ${data.pagination.total_entries} total matches`);
    
    // Analyze the results
    const soldItems = data.items.filter(item => item.hammered && item.bids && item.bids.length > 0);
    console.log(`🔨 Actually sold items: ${soldItems.length}`);
    
    if (soldItems.length === 0) {
      console.log('❌ No sold items found in this sample');
      return null;
    }
    
    // Extract final prices
    const prices = soldItems.map(item => {
      const finalBid = item.bids[0]; // Assuming first bid is the winning bid
      return {
        price: finalBid.amount,
        currency: item.currency,
        title: item.title,
        house: item.house,
        date: new Date(finalBid.timestamp * 1000),
        estimate: item.estimate
      };
    });
    
    // Calculate statistics
    const priceValues = prices.map(p => p.price);
    const avgPrice = priceValues.reduce((a, b) => a + b, 0) / priceValues.length;
    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);
    
    console.log(`\n📊 Market Analysis Results:`);
    console.log(`💰 Price range: ${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()} SEK`);
    console.log(`📈 Average price: ${Math.round(avgPrice).toLocaleString()} SEK`);
    
    // Show recent sales
    console.log(`\n🕒 Recent sales:`);
    prices
      .sort((a, b) => b.date - a.date)
      .slice(0, 5)
      .forEach(sale => {
        console.log(`  ${sale.date.toLocaleDateString()}: ${sale.price.toLocaleString()} SEK - ${sale.title.substring(0, 60)}...`);
      });
    
    return {
      totalMatches: data.pagination.total_entries,
      sampleSize: soldItems.length,
      priceRange: { min: minPrice, max: maxPrice },
      averagePrice: avgPrice,
      recentSales: prices.sort((a, b) => b.date - a.date).slice(0, 10)
    };
    
  } catch (error) {
    console.error('❌ Market analysis failed:', error);
    return null;
  }
}

// Test with our Lars Löfgren example
async function testLarsLofgrenExample() {
  console.log('\n🧪 Testing with Lars Löfgren silver example...');
  
  const searchTerms = ['Lars', 'Löfgren', 'silver'];
  const result = await analyzeMarketData(searchTerms, 'POKAL');
  
  if (result) {
    console.log('\n✅ Market analysis successful!');
    console.log(`📊 Found ${result.totalMatches} total matches in Auctionet database`);
    console.log(`🎯 Analyzed ${result.sampleSize} sold items`);
    console.log(`💰 Estimated value range: ${result.priceRange.min.toLocaleString()} - ${result.priceRange.max.toLocaleString()} SEK`);
  }
}

// Run the tests
console.log('🚀 Starting Auctionet API exploration...');
console.log('📚 Testing access to 3.65M+ item archive...');

// Uncomment to run tests:
// testAuctionetAPI();
// testLarsLofgrenExample();

export { testAuctionetAPI, analyzeMarketData, testLarsLofgrenExample }; 