# Story A2.1: Wire Checkpoint Creation at 95% Token Budget

> **Sprint:** A2 — Agent Loop Completeness | **Priority:** P0 | **Size:** M (1-3 hours)
> **Depends on:** A1.1 (knowledge injection should be wired so checkpoint restore has context to inject)
> **Audit ref:** P0-08 in `phase5-audit-findings.md`

## Problem

`CheckpointManager` (208 lines, `knowledge/checkpoint-manager.ts`) and `CheckpointStore` (108 lines, `db/checkpoint-store.ts`) are fully built and tested but **never called**. `TokenBudget.shouldCheckpoint()` exists but is **never checked** in the agent loop. When a long session hits 95% token usage, there's no emergency recovery — the context just degrades.

## What Needs to Happen

### 1. Pass CheckpointManager to AgentLoop

Add to `AgentLoopOptions` in `agent-loop.ts`:
```typescript
export interface AgentLoopOptions {
  // ... existing fields ...
  checkpointManager?: CheckpointManager;
  checkpointStore?: CheckpointStore;
}
```

Store in the constructor:
```typescript
this.checkpointManager = options?.checkpointManager ?? null;
```

### 2. Check shouldCheckpoint() in handleBudgetPressure()

In the `handleBudgetPressure()` method (~line 89), after existing budget checks, add:

```typescript
if (this.tokenBudget.shouldCheckpoint() && this.checkpointManager) {
  const checkpoint = this.checkpointManager.createCheckpoint(
    sessionContext.sessionId,
    this.history,
    this.todoTracker,
    originalPrompt,
  );
  
  yield {
    type: 'token_budget' as const,
    data: {
      level: 'emergency' as BudgetLevel,
      usageRatio: this.tokenBudget.getUsageRatio(),
      checkpoint_id: checkpoint.checkpoint_id,
      message: 'Context checkpointed — older context will be evicted',
    },
  };
  
  // Aggressively window after checkpoint
  this.history.applyWindowing(2); // Keep only last 2 turns
}
```

### 3. Pass dependencies from app.ts and ws-handler.ts

Where `AgentLoop` is instantiated (~app.ts:464, ws-handler.ts:108):
```typescript
session.agentLoop = new AgentLoop(model, toolRegistry, containerManager, {
  tokenBudget: TokenBudget.forModel(session.model),
  checkpointManager: new CheckpointManager(checkpointStore),
});
```

## Key Method Signatures

```typescript
// CheckpointManager
class CheckpointManager {
  constructor(store: CheckpointStore)
  createCheckpoint(sessionId, history, todoTracker, originalPrompt): Checkpoint
  loadCheckpoint(sessionId): Checkpoint | null
  formatForResume(checkpoint): string
}

// TokenBudget
class TokenBudget {
  shouldCheckpoint(): boolean    // true at 95%+ usage
  shouldForceSummarize(): boolean // true at 85%+ usage
  shouldSummarize(): boolean     // true at 70%+ usage
}
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/agent/agent-loop.ts` | Add `checkpointManager` to options, check `shouldCheckpoint()` in budget handler |
| `packages/server/src/server/app.ts` | Pass `CheckpointManager` when creating `AgentLoop` |
| `packages/server/src/server/ws-handler.ts` | Same — pass `CheckpointManager` via deps |

## Acceptance Criteria

- [ ] When token budget hits 95%, a checkpoint is created and stored in SQLite
- [ ] A `token_budget` event with `level: 'emergency'` is emitted to the UI
- [ ] Context is aggressively windowed after checkpoint (keep last 2 turns)
- [ ] The agent continues functioning after checkpoint (doesn't crash)
- [ ] Checkpoints are queryable in the `checkpoints` database table
- [ ] Existing tests still pass

## How to Verify

This is hard to trigger naturally with a 7B model (would need a very long session). For testing:
1. Write a test that creates an AgentLoop with a small token budget (e.g., 1000 tokens)
2. Add enough conversation history to push past 95%
3. Verify checkpoint is created
4. Alternatively, temporarily lower the emergency threshold to 50% and run a normal session
