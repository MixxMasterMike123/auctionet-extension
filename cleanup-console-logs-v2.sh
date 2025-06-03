#!/bin/bash

# Console.log cleanup script v2
# More aggressive cleanup of debug logs

echo "🧹 Starting aggressive console.log cleanup..."
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

echo "🗑️ Removing debug logs (keeping only errors and warnings)..."

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  Cleaning $file..."
    
    # Create backup
    cp "$file" "$file.backup"
    
    # Remove debug emojis (keep only error ❌ and warning ⚠️)
    sed -i '' '/console\.log.*🔍/d' "$file"  # Debug
    sed -i '' '/console\.log.*📋/d' "$file"  # Info
    sed -i '' '/console\.log.*✅/d' "$file"  # Success
    sed -i '' '/console\.log.*🔄/d' "$file"  # Process
    sed -i '' '/console\.log.*🎯/d' "$file"  # Target
    sed -i '' '/console\.log.*📝/d' "$file"  # Note
    sed -i '' '/console\.log.*🚀/d' "$file"  # Launch
    sed -i '' '/console\.log.*🔧/d' "$file"  # Fix
    sed -i '' '/console\.log.*📊/d' "$file"  # Chart
    sed -i '' '/console\.log.*🎨/d' "$file"  # Art
    sed -i '' '/console\.log.*🔗/d' "$file"  # Link
    sed -i '' '/console\.log.*💡/d' "$file"  # Idea
    sed -i '' '/console\.log.*🎉/d' "$file"  # Party
    sed -i '' '/console\.log.*ℹ️/d' "$file"  # Info
    sed -i '' '/console\.log.*🧪/d' "$file"  # Test
    sed -i '' '/console\.log.*🛠️/d' "$file"  # Tools
    sed -i '' '/console\.log.*✨/d' "$file"  # Sparkle
    sed -i '' '/console\.log.*🔥/d' "$file"  # Fire
    sed -i '' '/console\.log.*📈/d' "$file"  # Chart up
    sed -i '' '/console\.log.*📉/d' "$file"  # Chart down
    sed -i '' '/console\.log.*🎵/d' "$file"  # Music
    sed -i '' '/console\.log.*🎪/d' "$file"  # Circus
    sed -i '' '/console\.log.*🌟/d' "$file"  # Star
    sed -i '' '/console\.log.*🤖/d' "$file"  # Robot
    sed -i '' '/console\.log.*🏷️/d' "$file"  # Label
    sed -i '' '/console\.log.*🪑/d' "$file"  # Chair
    sed -i '' '/console\.log.*👤/d' "$file"  # Person
    sed -i '' '/console\.log.*⚖️/d' "$file"  # Scale
    sed -i '' '/console\.log.*🖱️/d' "$file"  # Mouse
    sed -i '' '/console\.log.*💚/d' "$file"  # Green heart
    sed -i '' '/console\.log.*🗑️/d' "$file"  # Trash
    sed -i '' '/console\.log.*➕/d' "$file"   # Plus
    sed -i '' '/console\.log.*🚫/d' "$file"   # Prohibited
    
    # Also remove some plain debug messages (no emojis)
    sed -i '' '/console\.log.*[Dd]ebug/d' "$file"
    sed -i '' '/console\.log.*[Tt]est/d' "$file"
    sed -i '' '/console\.log.*Found.*elements/d' "$file"
    sed -i '' '/console\.log.*Setting up/d' "$file"
    sed -i '' '/console\.log.*Adding.*listener/d' "$file"
    
  else
    echo "  ⚠️ File not found: $file"
  fi
done

echo "📊 After cleanup:"
grep -r "console\.log" modules/ | wc -l

echo "✅ Aggressive console.log cleanup complete!"
echo ""
echo "📋 Remaining logs should be:"
echo "   - console.error (all errors)"
echo "   - console.warn (all warnings)" 
echo "   - console.log with ❌ (critical errors)"
echo "   - console.log with ⚠️ (warnings)"
echo "   - console.log with 💥 (crash errors)"
echo ""
echo "🔍 To verify, run: grep -r 'console\.' modules/ | head -10" 