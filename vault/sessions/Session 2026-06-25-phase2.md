# Session — 2026-06-25 (Phase 2 Start)

## Summary

Resolved all 4 Phase 1 open items, created Phase 2 sprint plan (3 sprints, 13 stories), and completed the first 2 stories of Sprint 4.

## What Was Done

### Phase 1 Cleanup
1. **AI SDK v7 type cleanup** — `dynamicTool()` + `isStepCount()`, both `as any` casts eliminated
2. **Removed deprecated @hono/node-ws** — `@hono/node-server` v2 has built-in WebSocket
3. **Upgraded sandbox to Ubuntu 24.04** — Python 3.12.3 native, Node.js 22
4. **E2E tested `forge chat` with Ollama** — Pipeline works; qwen2.5-coder:7b outputs tool calls as JSON text (model limitation, not code bug)

### Phase 2 Sprint Planning
- Created `sprint-plan-phase2.md` — 3 sprints across weeks 4-6
- Created `sprint-status.yaml` — tracks all 56 stories across 5 phases

### Story 2.1.1: Conversation History Management
- `ConversationHistory` class: stores `ModelMessage[]`, add/get/clear/summary
- `AgentLoop` maintains history internally, captures `responseMessages` after each turn
- Server creates `AgentLoop` once per session (lazy), history persists across REST requests
- CLI: added `/history` and `/clear` debug commands
- 10 new unit tests

### Story 2.5.1: WebSocket Event Streaming Protocol
- WebSocket endpoint at `/ws/sessions/:id` using `@hono/node-server` v2 + `ws`
- All spec event types: greeting, agent_message, tool_start, tool_output, tool_complete, tool_error, todo_update, session_status, idle_warning, error
- Client events: user_message (triggers agent loop), cancel (AbortController)
- AgentLoop.run() accepts AbortSignal for cancellation
- Heartbeat: ping every 30s
- 4 new WebSocket integration tests

## Test Summary

- ConversationHistory: 10 unit tests
- WebSocket Handler: 4 integration tests
- Previous tests: 35 (ContainerManager, ToolRegistry, tool handlers)
- **Total: 49 tests, all passing**

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `dynamicTool()` for runtime tools | AI SDK docs explicitly recommend for runtime-registered tools |
| Ubuntu 24.04 over deadsnakes PPA | Native Python 3.12, longer support, fewer moving parts |
| Remove @hono/node-ws entirely | Deprecated; @hono/node-server 2.x has built-in WebSocket |
| `ws` library for WebSocket | Required by @hono/node-server v2 built-in WS support |
| AbortController for cancel | Standard pattern; AI SDK streamText accepts abortSignal natively |

## Open Questions

- qwen2.5-coder:7b doesn't use structured function calling — consider JSON-parsing fallback for smaller models
- WebSocket auth (api_key param) deferred — no auth system yet

## Next Steps

1. **Story 2.1.2** — Token budget tracking and context windowing
2. **Story 2.1.4** — Error recovery with escalation ladder
3. Then Sprint 5: Session persistence (SQLite), git tools, todo tracking

## BMAD State

- **Phase position:** Phase 2, Sprint 4 in progress
- **Sprint 4:** 2/4 stories done (2.1.1, 2.5.1)
- **Remaining Sprint 4:** 2.1.2 (token budgets), 2.1.4 (error recovery)

## Files Modified

| File | Change |
|------|--------|
| `packages/server/src/agent/conversation-history.ts` | New — ConversationHistory class |
| `packages/server/src/agent/agent-loop.ts` | History support + AbortSignal |
| `packages/server/src/agent/index.ts` | Export ConversationHistory |
| `packages/server/src/server/ws-handler.ts` | New — WebSocket event handler |
| `packages/server/src/server/app.ts` | WS route + session-scoped AgentLoop |
| `packages/server/src/server/start.ts` | WebSocketServer setup |
| `packages/server/src/cli/chat.ts` | /history + /clear commands |
| `packages/shared/src/events.ts` | 4 new event types |
| `packages/sandbox/Dockerfile` | Ubuntu 22.04 → 24.04 |
| `packages/server/package.json` | +ws, -@hono/node-ws |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Created + updated |
| `_bmad-output/planning-artifacts/sprint-plan-phase2.md` | Created |
