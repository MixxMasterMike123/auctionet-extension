#!/bin/bash

# Ultra-aggressive console.log cleanup script
# Removes almost all debug logs except critical errors and essential warnings

echo "🧹 Starting ULTRA-AGGRESSIVE console.log cleanup..."
echo "📊 Before cleanup:"
grep -r "console\.log" modules/ --exclude="*.backup*" | wc -l

# Files to clean up
FILES=(
  "modules/dashboard-manager-v2.js"
  "modules/search-filter-manager.js" 
  "modules/quality-analyzer.js"
  "modules/inline-brand-validator.js"
  "modules/search-query-ssot.js"
  "modules/brand-validation-manager.js"
  "modules/artist-detection-manager.js"
  "modules/ui/checkbox-manager.js"
  "modules/ui/pill-generator.js"
  "modules/core/term-processor.js"
  "modules/dashboard-manager.js"
  "modules/api-manager.js"
  "modules/sales-analysis-manager.js"
)

# Create backups with -ultra suffix
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "${file}.backup-ultra"
    echo "📑 Backed up $file"
  fi
done

# ULTRA-AGGRESSIVE CLEANUP

# 1. Remove verbose header suggestions logs
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Remove header suggestions debug
    sed -i.bak '/console\.log.*Header suggestions selected/d' "$file"
    sed -i.bak '/console\.log.*Selected: \${selected/d' "$file"
    sed -i.bak '/console\.log.*Unselected: \${Math/d' "$file"
    sed -i.bak '/console\.log.*Total in header/d' "$file"
    
    # Remove detailed term debugging
    sed -i.bak '/console\.log.*Term: "\${term\.term}"/d' "$file"
    sed -i.bak '/console\.log.*Selected (pre-checked)/d' "$file"
    sed -i.bak '/console\.log.*Priority: \${term\.priority}/d' "$file"
    
    # Remove URL debug logs
    sed -i.bak '/console\.log.*Using SSoT query for ALL URLs/d' "$file"
    sed -i.bak '/console\.log.*Historical query that found data/d' "$file"
    sed -i.bak '/console\.log.*Live query that found data/d' "$file"
    sed -i.bak '/console\.log.*Historical:/d' "$file"
    sed -i.bak '/console\.log.*Live:/d' "$file"
    sed -i.bak '/console\.log.*All:/d' "$file"
    
    # Remove less critical warnings
    sed -i.bak '/console\.log.*⚠️.*fallback to legacy/d' "$file"
    sed -i.bak '/console\.log.*⚠️.*attempting recovery/d' "$file"
    sed -i.bak '/console\.log.*⚠️.*please refresh page/d' "$file"
    
    # Remove verbose state logging
    sed -i.bak '/console\.log.*Current Query:/d' "$file"
    sed -i.bak '/console\.log.*Current Terms:/d' "$file"
    sed -i.bak '/console\.log.*Selected terms:/d' "$file"
    sed -i.bak '/console\.log.*Available terms:/d' "$file"
    sed -i.bak '/console\.log.*Metadata:/d' "$file"
    sed -i.bak '/console\.log.*Listeners:/d' "$file"
    
    # Remove initialization logs
    sed -i.bak '/console\.log.*initialized/d' "$file"
    sed -i.bak '/console\.log.*🧠.*initialized/d' "$file"
    
    # Remove debug prints
    sed -i.bak '/console\.log.*DEBUG:/d' "$file"
    sed -i.bak '/console\.log.*DEBUGGING:/d' "$file"
    
    # Clean up backup files
    rm -f "$file.bak"
  fi
done

# Keep only essential logs:
# - ❌ Critical errors
# - ⚠️ Important system warnings
# - 💥 Fatal errors
# - 🚨 Critical alerts
# - Essential system status (🔒)

echo ""
echo "📊 After ultra-aggressive cleanup:"
grep -r "console\.log" modules/ --exclude="*.backup*" | wc -l

echo ""
echo "✅ Ultra-aggressive cleanup complete!" 