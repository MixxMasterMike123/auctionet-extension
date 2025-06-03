#!/bin/bash

# Console.log cleanup script
# Removes verbose debug logging while preserving important error/warning logs

echo "🧹 Starting console.log cleanup..."
echo "📊 Before cleanup:"
grep -r "console\.log" modules/ | wc -l

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
)

# Patterns to REMOVE (debug/verbose logs)
REMOVE_PATTERNS=(
  "console\.log\('🔍[^']*'\);"
  "console\.log\('📋[^']*'\);"
  "console\.log\('✅[^']*'\);"
  "console\.log\('🔄[^']*'\);"
  "console\.log\('🎯[^']*'\);"
  "console\.log\('📝[^']*'\);"
  "console\.log\('🚀[^']*'\);"
  "console\.log\('🔧[^']*'\);"
  "console\.log\('📊[^']*'\);"
  "console\.log\('🎨[^']*'\);"
  "console\.log\('🔗[^']*'\);"
  "console\.log\('💡[^']*'\);"
  "console\.log\('🎉[^']*'\);"
  "console\.log\('ℹ️[^']*'\);"
  "console\.log\('🧪[^']*'\);"
  "console\.log\('🛠️[^']*'\);"
  "console\.log\('✨[^']*'\);"
  "console\.log\('🔥[^']*'\);"
  "console\.log\('📈[^']*'\);"
  "console\.log\('📉[^']*'\);"
  "console\.log\('🎵[^']*'\);"
  "console\.log\('🎪[^']*'\);"
  "console\.log\('🌟[^']*'\);"
)

# Patterns to KEEP (errors, warnings, critical status)
# These will NOT be removed:
# - console.error (all)
# - console.warn (all) 
# - console.log('❌ - errors
# - console.log('⚠️ - warnings
# - console.log('💥 - critical errors

echo "🗑️ Removing verbose debug logs..."

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  Cleaning $file..."
    
    # Remove debug patterns one by one
    for pattern in "${REMOVE_PATTERNS[@]}"; do
      sed -i '' "/$pattern/d" "$file"
    done
    
    # Remove multi-line console.log debug statements
    # This removes entire console.log statements that span multiple lines for debug info
    sed -i '' '/console\.log.*{$/,/^[[:space:]]*});$/d' "$file"
    sed -i '' '/console\.log.*\[$/,/^[[:space:]]*\]);$/d' "$file"
    
  else
    echo "  ⚠️ File not found: $file"
  fi
done

echo "📊 After cleanup:"
grep -r "console\.log" modules/ | wc -l

echo "✅ Console.log cleanup complete!"
echo ""
echo "📋 Remaining logs should be:"
echo "   - Error messages (❌, console.error)"
echo "   - Warnings (⚠️, console.warn)" 
echo "   - Critical status messages"
echo ""
echo "🔍 To verify, run: grep -r 'console\.' modules/ | head -20" 