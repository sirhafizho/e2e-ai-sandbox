# Story A2.2: Wire Forced Summarization at 85% Threshold

> **Sprint:** A2 — Agent Loop Completeness | **Priority:** P1 | **Size:** S (< 1 hour)
> **Depends on:** Nothing
> **Audit ref:** P1-09 in `phase5-audit-findings.md`

## Problem

`TokenBudget.shouldForceSummarize()` returns true at 85% usage but is **never called**. Only `shouldSummarize()` (70%) is checked in `handleBudgetPressure()` (~line 112). There's no escalation between warning (70%) and emergency (95%).

## What Needs to Happen

In `agent-loop.ts`, in the `handleBudgetPressure()` method, add a check for forced summarization. Currently the code around line 112 is:

```typescript
if (this.tokenBudget.shouldSummarize()) {
  // ... windowing logic ...
}
```

Change to:

```typescript
if (this.tokenBudget.shouldForceSummarize()) {
  // Critical: aggressive windowing — keep only last 2 turns
  const evicted = this.history.applyWindowing(2);
  if (evicted > 0) {
    yield {
      type: 'context_windowed' as const,
      data: { evictedMessages: evicted, tokensFreed: /* estimate */, newLevel: 'critical' },
    };
  }
} else if (this.tokenBudget.shouldSummarize()) {
  // Warning: gentle windowing — keep last 3 turns (existing behavior)
  const evicted = this.history.applyWindowing(3);
  // ... existing logic ...
}
```

The key difference: forced summarization at 85% keeps fewer turns (2 vs 3) and is more aggressive about eviction.

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/agent/agent-loop.ts` | Add `shouldForceSummarize()` check before `shouldSummarize()` in `handleBudgetPressure()` |

## Acceptance Criteria

- [ ] At 85% token usage, aggressive windowing triggers (keeps 2 turns instead of 3)
- [ ] A `context_windowed` event is emitted with the correct level
- [ ] At 70%, normal windowing still works (keeps 3 turns)
- [ ] The two thresholds don't conflict (85% check comes first)
- [ ] Existing tests still pass

## Notes

- This is a small change — just adding an additional condition branch in the existing budget pressure handler.
- The forced summarization keeps 2 turns instead of 3, giving more room before the 95% emergency checkpoint.
