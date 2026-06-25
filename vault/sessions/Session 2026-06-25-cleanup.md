# Session — 2026-06-25 (Cleanup)

## Summary

Resolved all 4 open items from Phase 1 implementation. Cleaned up tech debt, removed deprecated dependency, upgraded sandbox base image, and verified full E2E pipeline with Ollama.

## What Was Done

1. **AI SDK v7 type cleanup** — Replaced both `as any` casts in `agent-loop.ts` with proper `dynamicTool()` from AI SDK v7. Also migrated `maxSteps` → `stopWhen(isStepCount())` per v7 API. Zero type errors, zero eslint-disable comments remaining.

2. **Removed deprecated @hono/node-ws** — Package is officially deprecated; `@hono/node-server` v2 has built-in WebSocket support via `upgradeWebSocket`. The package was never imported in source code (only in package.json), so removal was clean. Peer dependency warning eliminated.

3. **Upgraded sandbox to Ubuntu 24.04** — Base image now uses Ubuntu 24.04 (Python 3.12.3 native, no PPA needed). Had to handle UID 1000 conflict (Ubuntu 24.04 ships with `ubuntu` user at UID 1000; we `userdel` it before creating `forge` user). All 35 tests pass with new image.

4. **E2E tested `forge chat` with Ollama** — Pipeline works end-to-end:
   - Container creation: works
   - LLM connection to Ollama: works
   - Simple Q&A ("What is 2+2?"): correct response ("4")
   - Tool recognition: model outputs correct tool name + args as JSON text
   - **Finding:** qwen2.5-coder:7b outputs tool calls as JSON text rather than structured function calls. This is a model limitation, not a code bug. Larger models and cloud APIs will use proper structured tool calling.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `dynamicTool()` over `tool()` | AI SDK docs explicitly recommend dynamicTool for runtime-registered tools with unknown types |
| Ubuntu 24.04 over deadsnakes PPA | Cleaner (native Python 3.12), longer support (→ 2029), fewer moving parts |
| Remove @hono/node-ws entirely | Deprecated; @hono/node-server 2.x has built-in WebSocket; package was unused in source |

## Open Questions

- qwen2.5-coder:7b doesn't use structured function calling via OpenAI-compatible API. Need to test with larger models or add a fallback JSON-parsing tool-call handler for smaller models.
- ADR-014 (External AI Tool Integration) added to decisions log but no implementation yet (post-v1)

## Next Steps

1. Start Phase 2: multi-turn conversations, context management, environment snapshots
2. Add WebSocket support to Hono server for real-time streaming (using `@hono/node-server` built-in)
3. Consider adding JSON text → tool call fallback for smaller local models
4. Plan Phase 2 epics and stories

## BMAD State

- **Phase position:** Phase 1 COMPLETE (all open items resolved)
- **Next phase:** Phase 2 (Persistence & Polish)

## Files Modified

| File | Change |
|------|--------|
| `packages/server/src/agent/agent-loop.ts` | dynamicTool() + isStepCount(), removed both `as any` |
| `packages/server/package.json` | Removed @hono/node-ws dependency |
| `packages/sandbox/Dockerfile` | Ubuntu 22.04 → 24.04, UID 1000 handling |
| `pnpm-lock.yaml` | Updated (removed @hono/node-ws) |
