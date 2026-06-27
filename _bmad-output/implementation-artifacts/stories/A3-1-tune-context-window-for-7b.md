# Story A3.1: Tune Effective Context Window for 7B

> **Sprint:** A3 — 7B Model Tuning | **Priority:** P1 | **Size:** M (1-3 hours)
> **Depends on:** A2.2, A2.3 (summarization and retention should be wired first)

## Problem

Qwen 2.5 Coder 7B has 128K context window on paper but quality degrades sharply past ~8-16K tokens. The current `TokenBudget` uses the model's theoretical max. Need to configure it to treat 8-16K as the effective limit so summarization and checkpointing kick in much sooner.

## What Needs to Happen

### 1. Add "effective context" concept to TokenBudget

In `token-budget.ts`, add a concept of "effective context" separate from "model max context". Add a static method that uses 16K as the budget ceiling regardless of the model's declared context:

```typescript
static forSmallModel(modelName: string): TokenBudget {
  // Use 16K as effective context regardless of model's declared 128K
  const effectiveContext = 16_384;
  return new TokenBudget(effectiveContext, {
    warningThreshold: 0.50,       // 50% instead of 70%
    forceSummarizeThreshold: 0.70, // 70% instead of 85%
    checkpointThreshold: 0.85,     // 85% instead of 95%
  });
}
```

### 2. Use smaller budget for 7B models at instantiation sites

In `app.ts` and `ws-handler.ts` where `TokenBudget.forModel()` is called (~line 464 and ~line 108), use the smaller budget for 7B models:

```typescript
const tokenBudget = isSmallModel(session.model)
  ? TokenBudget.forSmallModel(session.model)
  : TokenBudget.forModel(session.model);
```

Could check if model name contains "7b" or if context <= 32768:

```typescript
function isSmallModel(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return lower.includes('7b') || lower.includes('8b') || lower.includes('3b');
}
```

### 3. Adjust thresholds for small models

For small models, use more aggressive thresholds that trigger summarization and checkpointing earlier:

| Threshold | Large Model | Small Model |
|-----------|-------------|-------------|
| Warning | 70% | 50% |
| Force Summarize | 85% | 70% |
| Checkpoint | 95% | 85% |

This gives more headroom for the model to work effectively within its quality zone.

### 4. Keep fewer turns for small models

Keep last 2 turns instead of 3 for small models (context is precious):

```typescript
// In applyWindowing or handleBudgetPressure
const keepTurns = this.isSmallModel ? 2 : 3;
this.history.applyWindowing(keepTurns);
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/agent/token-budget.ts` | Add `forSmallModel()` static method, support custom thresholds, add `isSmallModel()` helper |
| `packages/server/src/server/app.ts` | Use `forSmallModel()` when creating `TokenBudget` for 7B models (~line 464) |
| `packages/server/src/server/ws-handler.ts` | Same — use `forSmallModel()` via deps (~line 108) |

## Acceptance Criteria

- [ ] 7B models use ~16K effective context window, not 128K
- [ ] Summarization triggers earlier for small models (50% warning, 70% force-summarize, 85% checkpoint)
- [ ] Model quality stays good within the configured window
- [ ] Larger models (70B+, cloud APIs) still use full context with original thresholds
- [ ] Small model windowing keeps 2 turns instead of 3
- [ ] Existing tests still pass

## How to Verify

1. Start the server with a 7B model (e.g., `qwen2.5-coder:7b`)
2. Send a few messages and check server logs for token budget events
3. Verify that summarization warnings appear much sooner than with a large model
4. Confirm the effective budget is ~16K, not 128K
5. Switch to a large model and verify original thresholds still apply

## Notes

- This is the foundational story for 7B tuning — most other A3 stories depend on context being properly constrained first.
- The 16K effective context is a starting point. It may need tuning up or down based on real-world testing with Qwen 2.5 Coder 7B.
- The `isSmallModel()` check should be simple string matching for now. A model registry with metadata would be cleaner but is overkill for this sprint.
- Consider making the effective context configurable via environment variable (e.g., `FORGE_EFFECTIVE_CONTEXT=16384`) for easy experimentation.
