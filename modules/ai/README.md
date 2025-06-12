# AI Module

Central hub for all AI-related functionality in the Auctionet Extension.

## Structure

### `/core`
- **ai-engine.js** - Central AI engine (replaces scattered AI logic from api-manager.js)
- **model-manager.js** - Model selection & configuration (Haiku vs Sonnet)
- **response-parser.js** - Unified response parsing and validation

### `/services`
- **field-enhancer.js** - Field enhancement (title, description, condition, keywords)
- **artist-detector.js** - Artist detection & verification
- **quality-analyzer.js** - Quality analysis and scoring
- **search-optimizer.js** - Search term generation and optimization

### `/prompts`
- **base-prompts.js** - System prompts & base rules
- **field-prompts.js** - Field-specific prompts
- **category-rules.js** - Category-specific rules (weapons, watches, jewelry, etc.)

### `/config`
- **models.js** - Model configurations and parameters
- **validation-rules.js** - Response validation rules and anti-hallucination checks

## Purpose

This module consolidates all AI functionality that was previously scattered across:
- api-manager.js (94KB → reduced to ~30KB)
- quality-analyzer.js (AI calls extracted)
- add-items-tooltip-manager.js (duplicate AI logic removed)

## Benefits

- ✅ Single source of truth for AI behavior
- ✅ No more conflicting prompts
- ✅ Reusable components across edit/add pages
- ✅ Consistent error handling
- ✅ Easy to maintain and update 