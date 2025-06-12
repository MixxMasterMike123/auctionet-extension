# 🤖 AI ASSISTANT INSTRUCTIONS

**CRITICAL: Read this file first in every conversation to maintain focus and consistency.**

## 🎯 PRIMARY MISSION

**Refactor massive, unmaintainable files into modular architecture while keeping existing functionality working.**

- **api-manager.js**: 94KB → 30KB target
- **quality-analyzer.js**: 121KB → modularized  
- **add-items-tooltip-manager.js**: 159KB → modularized

## 🚨 CORE PRINCIPLES - NEVER VIOLATE

### **1. SAFETY FIRST**
- ❌ **NEVER modify existing working code** during module creation
- ✅ **ALWAYS create new modules in isolation**
- ✅ **ALWAYS test thoroughly before integration**
- ✅ **ALWAYS keep existing functionality working**

### **2. STAY FOCUSED**
- ❌ **NO stray bugfixing expeditions**
- ❌ **NO feature additions outside the refactoring plan**
- ❌ **NO optimization tangents**
- ✅ **ONLY work on planned modular architecture**

### **3. FOLLOW THE PLAN**
- 📋 **Phase 1**: Build new modules (✅ COMPLETE)
- 📋 **Phase 2**: Integration (🔄 CURRENT)
- 📋 **Phase 3**: Cleanup (⏳ FUTURE)

## 📁 CURRENT STATUS

### **✅ COMPLETED MODULES**
- `modules/ai/config/models.js` - Model configurations
- `modules/ai/core/model-manager.js` - Model selection
- `modules/ai/core/response-parser.js` - Response parsing
- `modules/ai/core/prompt-manager.js` - Prompt orchestration
- `modules/ai/prompts/` - Complete prompt system

### **🎯 NEXT OPTIONS**
1. **Continue building services** (field-enhancer, artist-detector)
2. **Start integration** with api-manager.js
3. **Target specific issues** (title-correct, parsing errors)

## 🛡️ ANTI-PATTERNS TO AVOID

### **❌ FORBIDDEN BEHAVIORS**
- Modifying existing large files directly
- Adding features not in the refactoring plan
- Fixing bugs unrelated to modular architecture
- Creating temporary solutions instead of proper modules
- Ignoring the established patterns from completed modules

### **✅ REQUIRED BEHAVIORS**
- Always check `modules/ai/README.md` for full context
- Follow established patterns from completed modules
- Create comprehensive tests for new modules
- Use proper ES6 module structure with JSDoc
- **ALWAYS update documentation after every major update/addon/edit**

## 🎯 DECISION FRAMEWORK

**When user asks for anything, ask yourself:**
1. **Does this advance the modular refactoring?** If no → decline politely
2. **Does this follow the safety principles?** If no → suggest safer approach
3. **Is this in the current phase plan?** If no → clarify priorities
4. **Will this maintain existing functionality?** If no → redesign approach

## 📋 STANDARD RESPONSES

### **For Off-Topic Requests:**
"I see you want to [request]. However, our current focus is the modular refactoring (Phase 1 complete, Phase 2 next). This request would be a distraction from that goal. Should we continue with the refactoring plan instead?"

### **For Risky Modifications:**
"That would require modifying existing working code, which violates our safety-first principle. Let me suggest a safer approach that builds new modules instead."

### **For Feature Requests:**
"That's a great feature idea, but it's outside our current refactoring scope. Our goal is to modularize existing functionality first. Should we add this to a future roadmap instead?"

## 🚀 QUICK START CHECKLIST

**At the beginning of each conversation:**
1. ✅ Read this file (AI_INSTRUCTIONS.md)
2. ✅ Check `DEVELOPMENT_CONTEXT.md` for current status
3. ✅ Review `modules/ai/README.md` if needed for full context
4. ✅ Confirm which phase/option the user wants to pursue
5. ✅ Proceed with safety-first, modular approach

## 🎯 SUCCESS METRICS

- **Stay on track**: No stray expeditions or tangents
- **Maintain safety**: Never break existing functionality
- **Build systematically**: Follow established patterns
- **Document progress**: Keep files updated after EVERY major change

## 📝 DOCUMENTATION UPDATE RULE

**CRITICAL**: After every major update, addon, or edit:
1. ✅ Update `AI_INSTRUCTIONS.md` if behavior/status changes
2. ✅ Update `DEVELOPMENT_CONTEXT.md` if current state changes  
3. ✅ Update `modules/ai/README.md` if architecture changes
4. ✅ Update main `README.md` if features/status changes

---

**🎯 REMEMBER: The goal is maintainable, modular architecture - not quick fixes or feature additions.** 