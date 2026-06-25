# Session — 2026-06-25 (Sprint 4 Complete)

## Summary

Completed the remaining 2 Sprint 4 stories (2.1.2 and 2.1.4), finishing Sprint 4 in full. All exit criteria met. Ready for Sprint 5.

## What Was Done

### Story 2.1.2: Token Budget Tracking and Context Windowing
- **TokenBudget class**: tracks usage against model context windows with configurable thresholds (70% warning, 85% critical, 95% emergency)
- **TokenEstimator**: approximate token counting (~4 chars/token) sufficient for budget management
- **Model context windows**: lookup table for qwen2.5-coder, llama3.1, gpt-4o, claude-sonnet-4, etc. with 32K default
- **ConversationHistory**: extended with context windowing — identifies turn boundaries, evicts older turns beyond last 3, replaces with summary
- **AgentLoop integration**: checks budget before each LLM call, triggers auto-windowing, emits `token_budget` and `context_windowed` events
- **WebSocket + CLI**: budget events forwarded to clients, `/budget` command shows usage status
- **42 new tests** (91 total after this story)

### Story 2.1.4: Error Recovery with Escalation Ladder
- **ErrorClassifier**: categorizes errors into 8 types based on error message patterns
- **RetryPolicy per category**: tool_timeout (3x, 1/2/4s), command_failed (2x, 0/1s), file_not_found (1x), llm_rate_limit (5x with jitter), llm_server_error (3x, 5/10/20s), permission_denied (0x, immediate escalation), network_error (3x), unknown (1x)
- **withRetry()**: generic async retry utility with exponential backoff, jitter, abort signal, onRetry callback
- **Escalation ladder**: retry → alternative → ask_user → escalate
- **Tool execution**: wrapped with retry in AgentLoop, recovery events emitted
- **buildErrorReport()**: user-friendly error summaries with category-specific recommendations
- **27 new tests** (118 total after this story)

## Test Summary

- ConversationHistory: 22 tests (10 original + 13 windowing)
- TokenBudget: 15 tests
- TokenEstimator: 8 tests
- ErrorRecovery: 27 tests
- ContainerManager: 13 tests
- ToolRegistry: 10 tests
- Tool handlers: 12 tests
- WebSocket: 4 tests
- **Total: 118 tests, all passing**

## Sprint 4 Exit Criteria — All Met

- [x] Multi-turn conversation history
- [x] WebSocket streaming (all event types)
- [x] Cancel via WebSocket
- [x] Token counting with budget thresholds
- [x] Context windowing with auto-summarization
- [x] Retry with exponential backoff
- [x] Error escalation ladder

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Approximate token counting (chars/4) | Good enough for budget management; exact counting requires model-specific tokenizers |
| 15% response reserve | Context window minus 15% = usable budget; matches spec recommendation |
| Extractive summary for windowing | Simple first/last lines approach; LLM-based summarization deferred to when model is available in loop |
| Auto-classify errors by message | Pattern matching on error messages; covers common cases without requiring structured error types |
| withRetry wraps tool execution only | streamText() returns synchronously; errors surface during stream consumption |
| permission_denied = 0 retries | Immediate escalation to user; retrying won't help |

## Open Questions

- Context windowing uses extractive summary — should LLM-based summarization be added later? (deferred)
- Tool retry events are queued and flushed — verify this works well with concurrent tool execution (Sprint 5, Story 2.6.1)

## Next Steps

1. **Sprint 5 begins** — Persistence & Git
2. **Story 2.3.1** — Session CRUD with SQLite persistence
3. **Story 2.4.1** — Git tools (status, diff, log, commit, push, PR)
4. **Story 2.1.3** — Todo tracking
5. **Story 2.3.2** — Idle timeout and auto-cleanup
6. **Story 2.6.1** — Parallel tool dispatch

## BMAD State

- **Phase position:** Phase 2, Sprint 4 complete
- **Sprint 5:** 0/5 stories done
- **Next sprint:** 2.3.1 (SQLite), 2.4.1 (git tools), 2.1.3 (todos), 2.3.2 (idle timeout), 2.6.1 (parallel dispatch)

## Files Modified

| File | Change |
|------|--------|
| `packages/server/src/agent/token-budget.ts` | New — TokenBudget class, model context windows |
| `packages/server/src/agent/token-estimator.ts` | New — approximate token counting |
| `packages/server/src/agent/error-recovery.ts` | New — ErrorClassifier, RetryPolicy, withRetry, escalation ladder |
| `packages/server/src/agent/conversation-history.ts` | Extended — context windowing, turn boundaries, eviction |
| `packages/server/src/agent/agent-loop.ts` | Integrated — token budget checking, windowing, tool retry |
| `packages/server/src/agent/types.ts` | Added — token_budget, context_windowed event types |
| `packages/server/src/agent/index.ts` | Updated — new exports |
| `packages/server/src/cli/chat.ts` | Added — /budget command, budget event display |
| `packages/server/src/server/app.ts` | Updated — pass TokenBudget to AgentLoop |
| `packages/server/src/server/ws-handler.ts` | Updated — forward token_budget, context_windowed events |
| `packages/shared/src/events.ts` | Added — TokenBudgetEvent, ContextWindowedEvent schemas |
| `packages/server/src/agent/__tests__/token-budget.test.ts` | New — 15 tests |
| `packages/server/src/agent/__tests__/token-estimator.test.ts` | New — 8 tests |
| `packages/server/src/agent/__tests__/error-recovery.test.ts` | New — 27 tests |
| `packages/server/src/agent/__tests__/conversation-history.test.ts` | Extended — 13 windowing tests |
