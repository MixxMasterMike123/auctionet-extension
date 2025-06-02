// modules/artist-detection-test.js - Test script for ArtistDetectionManager SSoT
import { ArtistDetectionManager } from './artist-detection-manager.js';

export class ArtistDetectionTest {
  constructor() {
    this.artistDetectionManager = new ArtistDetectionManager();
    console.log('🧪 ArtistDetectionTest initialized');
  }

  async runTests() {
    console.log('🚀 Running ArtistDetectionManager SSoT tests...');
    
    const testCases = [
      // Informal patterns (like add items page issues)
      {
        title: 'rolf lidberg papper litografi 1947 signerad',
        expected: 'Rolf Lidberg',
        description: 'Informal lowercase entry'
      },
      {
        title: 'Carl Gustaf Malmsten stol ek 1950-tal',
        expected: 'Carl Gustaf Malmsten',
        description: 'Three-word artist name informal'
      },
      
      // All caps patterns (traditional)
      {
        title: 'LISA LARSON. Skulptur, "Storstegaren" brons, signerad och numrerad 327',
        expected: 'LISA LARSON',
        description: 'All caps with period'
      },
      
      // End-of-title patterns (ceramics/design)
      {
        title: 'FAT, stengods, Royal Copenhagen, Danmark. Niels Thorsson',
        expected: 'Niels Thorsson',
        description: 'Artist at end of title'
      },
      
      // Should NOT detect (not artist names)
      {
        title: 'VAS, glas, kristall, Orrefors',
        expected: null,
        description: 'Company name, not artist'
      },
      {
        title: 'TAVLA, olja på duk, landskap med hus',
        expected: null,
        description: 'No artist present'
      }
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
      try {
        console.log(`\n🧪 Testing: "${testCase.title}"`);
        console.log(`📝 Expected: ${testCase.expected || 'null'}`);
        console.log(`📋 Description: ${testCase.description}`);
        
        const result = this.artistDetectionManager.detectMisplacedArtistRuleBased(testCase.title, '');
        const detectedArtist = result ? result.detectedArtist : null;
        
        console.log(`🔍 Detected: ${detectedArtist || 'null'}`);
        
        if (detectedArtist === testCase.expected) {
          console.log('✅ PASS');
          passed++;
        } else {
          console.log('❌ FAIL');
          if (result) {
            console.log('📊 Full result:', result);
          }
          failed++;
        }
      } catch (error) {
        console.error('❌ TEST ERROR:', error);
        failed++;
      }
    }

    console.log(`\n📈 Test Results: ${passed} passed, ${failed} failed`);
    console.log(`🎯 Success rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    
    return { passed, failed, total: passed + failed };
  }

  // Test the confidence calculation
  testConfidenceCalculation() {
    console.log('\n🧪 Testing confidence calculation...');
    
    const testCases = [
      { artist: 'Pablo Picasso', objectType: 'TAVLA', expected: 'high' },
      { artist: 'Lisa Larson', objectType: 'SKULPTUR', expected: 'high' },
      { artist: 'Bruno Mathsson', objectType: 'STOL', expected: 'low' },
      { artist: 'Alvar Aalto', objectType: 'VAS', expected: 'low' }
    ];

    testCases.forEach(testCase => {
      const confidence = this.artistDetectionManager.calculateArtistConfidence(
        testCase.artist, 
        testCase.objectType
      );
      
      console.log(`🎯 ${testCase.artist} + ${testCase.objectType}: ${confidence} (${testCase.expected})`);
    });
  }

  // Test name validation
  testNameValidation() {
    console.log('\n🧪 Testing name validation...');
    
    const testCases = [
      { name: 'Pablo Picasso', expected: true, description: 'Valid artist name' },
      { name: 'Carl Gustaf Malmsten', expected: true, description: 'Valid three-word name' },
      { name: 'papper litografi', expected: false, description: 'Art technique, not name' },
      { name: 'Stockholm Göteborg', expected: false, description: 'City names' },
      { name: 'Royal Copenhagen', expected: false, description: 'Company name' },
      { name: 'A B', expected: false, description: 'Too short words' },
      { name: 'Single', expected: false, description: 'Single word' }
    ];

    testCases.forEach(testCase => {
      const result = this.artistDetectionManager.looksLikePersonName(testCase.name);
      const status = result === testCase.expected ? '✅' : '❌';
      console.log(`${status} "${testCase.name}": ${result} (${testCase.description})`);
    });
  }
} 