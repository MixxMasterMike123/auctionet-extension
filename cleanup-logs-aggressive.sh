#!/bin/bash

# Aggressive console.log cleanup script
# Removes almost all debug logs, keeping only recent debugging, errors, and warnings

echo "🧹 Starting AGGRESSIVE console.log cleanup..."
echo "📊 Before cleanup:"
grep -r "console\.log" modules/ --exclude="*.backup" | wc -l

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
  "modules/sales-analysis-manager.js"
  "modules/api-manager.js"
)

echo "🗑️ Removing old debug logs (keeping only recent debugging + errors/warnings)..."

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  Aggressively cleaning $file..."
    
    # Create backup
    cp "$file" "$file.backup-aggressive" 2>/dev/null || true
    
    # Remove ALL debug emoji logs EXCEPT recent spinner/debugging and errors/warnings
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
    sed -i '' '/console\.log.*💰/d' "$file"   # Money
    sed -i '' '/console\.log.*🎵/d' "$file"   # Music note
    sed -i '' '/console\.log.*🧠/d' "$file"   # Brain
    sed -i '' '/console\.log.*📱/d' "$file"   # Phone
    sed -i '' '/console\.log.*💻/d' "$file"   # Computer
    sed -i '' '/console\.log.*🌐/d' "$file"   # Globe
    sed -i '' '/console\.log.*🚨/d' "$file"   # Siren (keep only the few critical ones)
    sed -i '' '/console\.log.*🎭/d' "$file"   # Theater
    sed -i '' '/console\.log.*🏆/d' "$file"   # Trophy
    sed -i '' '/console\.log.*📜/d' "$file"   # Scroll
    sed -i '' '/console\.log.*🔮/d' "$file"   # Crystal ball
    
    # Remove verbose debugging text patterns
    sed -i '' '/console\.log.*[Dd]ebug/d' "$file"
    sed -i '' '/console\.log.*[Tt]est/d' "$file"
    sed -i '' '/console\.log.*Found.*elements/d' "$file"
    sed -i '' '/console\.log.*Setting up/d' "$file"
    sed -i '' '/console\.log.*Adding.*listener/d' "$file"
    sed -i '' '/console\.log.*Available/d' "$file"
    sed -i '' '/console\.log.*Processing/d' "$file"
    sed -i '' '/console\.log.*Generating/d' "$file"
    sed -i '' '/console\.log.*Extracting/d' "$file"
    sed -i '' '/console\.log.*Building/d' "$file"
    sed -i '' '/console\.log.*Loading/d' "$file"
    sed -i '' '/console\.log.*Starting/d' "$file"
    sed -i '' '/console\.log.*Completed/d' "$file"
    sed -i '' '/console\.log.*Finished/d' "$file"
    sed -i '' '/console\.log.*Initialized/d' "$file"
    sed -i '' '/console\.log.*Connected/d' "$file"
    sed -i '' '/console\.log.*Updated/d' "$file"
    sed -i '' '/console\.log.*Synced/d' "$file"
    sed -i '' '/console\.log.*Restored/d' "$file"
    
    # Remove pattern matching logs
    sed -i '' '/console\.log.*Pattern.*matched/d' "$file"
    sed -i '' '/console\.log.*Testing pattern/d' "$file"
    sed -i '' '/console\.log.*Before:/d' "$file"
    sed -i '' '/console\.log.*After:/d' "$file"
    
    # Remove detailed object logging
    sed -i '' '/console\.log.*Input parameters/d' "$file"
    sed -i '' '/console\.log.*Available data/d' "$file"
    sed -i '' '/console\.log.*Final terms/d' "$file"
    sed -i '' '/console\.log.*Current query/d' "$file"
    
  else
    echo "  ⚠️ File not found: $file"
  fi
done

echo "📊 After cleanup:"
grep -r "console\.log" modules/ --exclude="*.backup*" | wc -l

echo "✅ Aggressive console.log cleanup complete!"
echo ""
echo "📋 Remaining logs should be:"
echo "   - console.error (all errors)"
echo "   - console.warn (all warnings)" 
echo "   - console.log with ❌ (critical errors)"
echo "   - console.log with ⚠️ (warnings)"
echo "   - Recent debugging from spinner/functionality work"
echo ""
echo "🔍 To verify, run: grep -r 'console\.' modules/ --exclude='*.backup*' | head -10" 