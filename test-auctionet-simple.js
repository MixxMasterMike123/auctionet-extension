// test-auctionet-simple.js - Simple test for Auctionet API module
// Run with: node test-auctionet-simple.js

import { AuctionetAPI } from './modules/auctionet-api.js';

async function testAuctionetAPI() {
    console.log('🔍 Testing Auctionet API Module...\n');
    
    const api = new AuctionetAPI();
    
    // Test case 1: Lars Löfgren (should have good data)
    console.log('📊 Test 1: Lars Löfgren (silversmith)');
    try {
        const result1 = await api.analyzeComparableSales(
            'Lars Löfgren',
            'POKAL',
            '1797',
            'silver',
            'Pokal i silver från 1700-talet'
        );
        
        if (result1) {
            console.log('✅ Success!');
            console.log(`💰 Price range: ${result1.priceRange.low.toLocaleString()}-${result1.priceRange.high.toLocaleString()} SEK`);
            console.log(`🎯 Confidence: ${Math.round(result1.confidence * 100)}%`);
            console.log(`📈 Total matches: ${result1.totalMatches}`);
            console.log(`🔨 Analyzed sales: ${result1.analyzedSales}`);
            
            if (result1.trendAnalysis) {
                console.log(`📊 Trend: ${result1.trendAnalysis.description}`);
            }
        } else {
            console.log('❌ No data returned');
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test case 2: Carl Malmsten (famous Swedish designer)
    console.log('📊 Test 2: Carl Malmsten (furniture designer)');
    try {
        const result2 = await api.analyzeComparableSales(
            'Carl Malmsten',
            'STOL',
            '1950',
            'trä',
            'Stol i trä från 1950-talet'
        );
        
        if (result2) {
            console.log('✅ Success!');
            console.log(`💰 Price range: ${result2.priceRange.low.toLocaleString()}-${result2.priceRange.high.toLocaleString()} SEK`);
            console.log(`🎯 Confidence: ${Math.round(result2.confidence * 100)}%`);
            console.log(`📈 Total matches: ${result2.totalMatches}`);
            console.log(`🔨 Analyzed sales: ${result2.analyzedSales}`);
        } else {
            console.log('❌ No data returned');
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test case 3: Unknown artist (should return null)
    console.log('📊 Test 3: Unknown Artist (should fail gracefully)');
    try {
        const result3 = await api.analyzeComparableSales(
            'Nonexistent Artist XYZ',
            'MÅLNING',
            '2000',
            'olja',
            'Målning som inte finns'
        );
        
        if (result3) {
            console.log('⚠️ Unexpected success - found data for nonexistent artist');
            console.log(`💰 Price range: ${result3.priceRange.low.toLocaleString()}-${result3.priceRange.high.toLocaleString()} SEK`);
        } else {
            console.log('✅ Correctly returned null for unknown artist');
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n🏁 Testing complete!');
}

// Test live auctions
async function testLiveAuctions() {
    console.log('\n🔴 Testing LIVE Auction Analysis...\n');
    
    const api = new AuctionetAPI();
    
    // Test case: Orrefors glass (should have active auctions)
    console.log('🔴 Live Test: Orrefors Glass');
    try {
        const liveResult = await api.analyzeLiveAuctions(
            'Orrefors',
            'VAS',
            '1970',
            'glas',
            'Vas i glas från Orrefors'
        );
        
        if (liveResult) {
            console.log('✅ Live auction data found!');
            console.log(`🔴 Active auctions: ${liveResult.analyzedLiveItems}`);
            console.log(`📊 Total matches: ${liveResult.totalMatches}`);
            
            if (liveResult.currentEstimates) {
                const est = liveResult.currentEstimates;
                console.log(`💰 Current estimates: ${est.low.toLocaleString()}-${est.high.toLocaleString()} SEK (avg: ${Math.round(est.average).toLocaleString()})`);
            }
            
            if (liveResult.currentBids) {
                const bids = liveResult.currentBids;
                console.log(`🔥 Current bids: ${bids.low.toLocaleString()}-${bids.high.toLocaleString()} SEK (avg: ${Math.round(bids.average).toLocaleString()})`);
            }
            
            if (liveResult.marketActivity) {
                const activity = liveResult.marketActivity;
                console.log(`📊 Market activity: ${activity.totalBids} total bids across ${activity.totalItems} items`);
                console.log(`📈 Average bids per item: ${activity.averageBidsPerItem.toFixed(1)}`);
                console.log(`🎯 Reserves met: ${activity.reservesMetPercentage}%`);
            }
            
            console.log(`💡 Market sentiment: ${liveResult.marketSentiment}`);
            
            if (liveResult.liveItems && liveResult.liveItems.length > 0) {
                console.log(`🔴 Most active live items:`);
                liveResult.liveItems.slice(0, 3).forEach((item, index) => {
                    console.log(`  ${index + 1}. ${item.bidCount} bids: ${item.currentBid.toLocaleString()} SEK`);
                    console.log(`     ${item.title} (${item.timeRemaining} left)`);
                    console.log(`     ${item.house} - Reserve ${item.reserveMet ? '✅ MET' : '❌ NOT MET'}`);
                });
            }
        } else {
            console.log('❌ No live auction data found');
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n🏁 Live auction testing complete!');
}

// Run both tests
async function runAllTests() {
    await testAuctionetAPI();
    await testLiveAuctions();
}

// Run the test
runAllTests().catch(console.error); 