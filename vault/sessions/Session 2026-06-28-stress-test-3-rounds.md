# Session 2026-06-28 — Stress Test: 3 Rounds of Bug Hunting & Fixing

## What Was Done

Three iterative rounds of self-directed QA — auditing every flow, tracing data from entry to exit, fixing bugs, running full test suite between rounds.

### Round 1: Infrastructure & Core Bugs (7 bugs + 3 improvements)

| # | Fix | Severity | File(s) |
|---|-----|----------|---------|
| 1 | **Test hang** — IdleMonitor setInterval leaked in all 5 server tests, preventing process exit | CRITICAL | 5 test files |
| 2 | **Unsafe JSON.parse** in session resume — crashes on malformed history_json | HIGH | app.ts |
| 3 | **Fire-and-forget promises** for repo map generation — unhandled rejections | MEDIUM | app.ts |
| 4 | **CheckpointManager created 3 times** — now single shared instance | MEDIUM | app.ts, ws-handler.ts |
| 5 | **Docker stream data loss** — partial multiplex frames silently dropped | HIGH | container-manager.ts |
| 6 | **Tool timeout timer leak** — Promise.race timer never cleared on success | MEDIUM | registry.ts |
| 7 | **IdleMonitor warningMinutes inverted** — "5 min before" treated as "at 5 min" | HIGH | idle-monitor.ts |
| 8 | **BrowserPanel non-functional buttons** removed (Back/Forward/Refresh) | LOW | BrowserPanel.tsx |
| 9 | **WebSocket heartbeat** added — client pings every 30s, detects dead connections | IMPROVE | websocket.ts, ws-handler.ts |
| 10 | **Server handles client pings** — silently accepts without error event | IMPROVE | ws-handler.ts |

### Round 2: Deep Code Review + Flow Tracing (5 bugs)

| # | Fix | Severity | File(s) |
|---|-----|----------|---------|
| 11 | **Agent loop abort signal gap** — not checked between stream events | HIGH | agent-loop.ts |
| 12 | **Tool call JSON.stringify crash** — malformed/circular inputs crash loop | MEDIUM | agent-loop.ts |
| 13 | **Empty output for small models** — compressForModel returns empty string | LOW | selective-retention.ts |
| 14 | **Terminal PTY reconnect broken** — output piped to dead WebSocket on reconnect | CRITICAL | terminal-handler.ts |
| 15 | **rules-loader path traversal** — workspacePath not validated for `..` | LOW | rules-loader.ts |

### Round 2.5: UI-Server Event Mismatches (4 bugs)

| # | Fix | Severity | File(s) |
|---|-----|----------|---------|
| 16 | **isAgentWorking broken** — UI reads `data.streaming` but server sends `data.done` | CRITICAL | SessionPage.tsx |
| 17 | **Tool cards empty input** — reads `data.tool_input` but server sends `input_summary` | HIGH | SessionPage.tsx |
| 18 | **Tool cards no output** — tool_complete result field ignored, tool_output dead code | HIGH | SessionPage.tsx |
| 19 | **Session resume loses history** — AgentLoop starts empty, LLM has no memory of prior turns | CRITICAL | ws-handler.ts, app.ts, conversation-history.ts |

### Round 3: Full Flow Tracing (3 bugs)

| # | Fix | Severity | File(s) |
|---|-----|----------|---------|
| 20 | **API client type mismatches** — create/get/resume typed as SessionInfo but server wraps in `{ session: {...} }`, causing `navigate(/sessions/undefined)` | CRITICAL | api.ts |
| 21 | **Streaming message flood** — every text-delta chunk creates a new message bubble instead of appending to one | CRITICAL | SessionPage.tsx, store.ts |
| 22 | **note_suggestions invalid type cast** — `as unknown as ServerWebSocketEvent` for non-existent type | MEDIUM | ws-handler.ts |

## Summary Stats

- **22 bugs fixed** (6 CRITICAL, 6 HIGH, 6 MEDIUM, 2 LOW, 2 IMPROVE)
- **3 commits**: `e0d5b5d`, `9c122f3`, `d79f0ba`
- **352/352 tests pass** after every round
- **Typecheck clean**, **build clean** across all packages
- **26 files modified** across server + UI packages

## Key Categories

- **UI-Server contract mismatches** (5 bugs): field names, response wrappers, event semantics
- **Resource leaks** (3 bugs): timers, intervals, stream references
- **Data integrity** (3 bugs): history loss, stream data loss, JSON parse crashes
- **UX-breaking** (3 bugs): navigation to undefined, message flood, stale working indicator
- **Security/safety** (2 bugs): path traversal, abort signal gap

## Files Modified

| Package | Files |
|---------|-------|
| `packages/server/src/agent/` | agent-loop.ts, conversation-history.ts |
| `packages/server/src/knowledge/` | rules-loader.ts, selective-retention.ts |
| `packages/server/src/sandbox/` | container-manager.ts |
| `packages/server/src/server/` | app.ts, ws-handler.ts, idle-monitor.ts, terminal-handler.ts |
| `packages/server/src/server/__tests__/` | all 5 test files |
| `packages/server/src/tools/` | registry.ts |
| `packages/ui/src/components/browser/` | BrowserPanel.tsx |
| `packages/ui/src/lib/` | api.ts, store.ts, websocket.ts |
| `packages/ui/src/pages/` | SessionPage.tsx |

## Open Items

- Track B (Greenfield testing) and Track C (Brownfield testing) are next
- Test with actual 7B model (Qwen 2.5 Coder 7B via Ollama)
- The UI has no handling for `note_suggestions` events yet (feature gap, not a bug)

## Decisions Made

- Streaming messages use accumulation pattern: first chunk → addMessage, subsequent → appendToMessage, done → finalizeStreaming
- API client unwraps `{ session: {...} }` responses with `.then()` for clean consumer API
- Terminal handler tracks `activeWs` per terminal for correct reconnection
- ConversationHistory accepts optional `messages` array in constructor for session resume
- note_suggestions sent via raw `ws.send()` since the event type isn't in the shared schema yet

## Current BMAD Phase

Phase 5: Manual Testing & Refinement — Track A complete (Sprints A1-A4), stress testing complete (3 rounds, 22 fixes), ready for Track B/C testing
