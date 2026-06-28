# Session 2026-06-27 — Sprint A2 Complete (All 5 Stories)

## What Was Done

- **A2.1: Wire checkpoint creation** — `CheckpointManager` added to `AgentLoopOptions`, passed from `app.ts` and `ws-handler.ts`. `handleBudgetPressure()` now calls `shouldCheckpoint()` at 95%+ usage, creates checkpoint via `CheckpointManager.createCheckpoint()`, emits `token_budget` event with `level: 'emergency'` and `checkpoint_id`, then aggressively windows context.
- **A2.2: Wire forced summarization** — `handleBudgetPressure()` now checks `shouldForceSummarize()` at 85% before the existing 70% `shouldSummarize()` check. Three-tier budget pressure: 95% emergency checkpoint → 85% aggressive windowing → 70% gentle windowing.
- **A2.3: Wire selective retention** — `SelectiveRetention` instantiated in `ConversationHistory`. Tool result content is truncated via `truncateToolOutput()` in `addResponseMessages()` before being stored in history. Stack trace deduplication, file content trimming, and shell output extraction now apply automatically.
- **A2.4: Wire idle monitor** — `IdleMonitor` instantiated in `app.ts` with 1-hour timeout, 5-min warning, 24-hour destroy. `wsConnections` map tracks active WebSocket connections. Warning callback sends `idle_warning` events via WS. Monitor starts on app creation, stops on SIGINT/SIGTERM in `start.ts`.
- **A2.5: Wire checkpoint restore** — On session resume (`POST /api/sessions/:id/resume`), `CheckpointManager.loadCheckpoint()` loads the latest checkpoint, `formatForResume()` generates markdown context. Resume context stored in `SessionState.resumeContext` and injected into system prompt on first message (then cleared).

## Files Modified

| File | Stories |
|------|---------|
| `packages/server/src/agent/agent-loop.ts` | A2.1, A2.2 |
| `packages/server/src/agent/conversation-history.ts` | A2.3 |
| `packages/server/src/server/app.ts` | A2.1, A2.4, A2.5 |
| `packages/server/src/server/ws-handler.ts` | A2.1, A2.4, A2.5 |
| `packages/server/src/server/start.ts` | A2.4 |

## Decisions Made

- Three-tier budget pressure in `handleBudgetPressure()`: emergency (95%) → critical (85%) → warning (70%), each returning early after handling
- `lastUserMessage` stored on AgentLoop for checkpoint creation context
- Selective retention applied at `addResponseMessages()` level — UI still sees full tool output, only LLM history is truncated
- `wsConnections` uses a simple `{ send }` interface rather than raw WebSocket reference for decoupling
- Resume context injected once on first message after resume, then cleared from session state

## Tests

- All 30 test suites pass, zero regressions
- Build passes for all packages (server, shared, ui, sandbox)

## Next Steps

1. **Sprint A3** — 7B model tuning (system prompt compression, tool schema optimization, response parsing)
2. **Sprint A4** — UI polish (can run in parallel with A3)
3. After A3+A4, proceed to Track B: Stability & Polish

## Current BMAD Phase

Phase 5: Manual Testing & Refinement — Track A: Wire & Tune — Sprint A2 complete, Sprints A3/A4 ready
