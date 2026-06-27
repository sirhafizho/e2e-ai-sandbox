# Session 2026-06-27 — Story A1.1: Wire Knowledge Injection

## What Was Done

- **Implemented story A1.1** — wired `KnowledgeInjector.inject()` into both agent loop invocation sites
- **REST endpoint** (`app.ts`): Added `buildSystemPrompt` import, call `knowledgeInjector.inject()` before `agentLoop.run()` in `POST /api/sessions/:id/messages`, pass built system prompt via `SessionContext.systemPrompt`
- **WebSocket handler** (`ws-handler.ts`): Added `KnowledgeInjector` to `WsSessionDeps` interface, imported `buildSystemPrompt`, call `deps.knowledgeInjector.inject()` before `agentLoop.run()` in `user_message` handler, pass system prompt via context
- **WS wiring** (`app.ts`): Pass `knowledgeInjector` in deps when creating WS handlers
- **Used Option A** (simpler) — build system prompt at call site, pass via `SessionContext.systemPrompt`; agent loop already falls back to default if not provided
- **All 44 test suites pass** — zero regressions

## Decisions Made

- Followed story recommendation: Option A (build system prompt at call site) over Option B (inject into AgentLoop constructor)
- `repo: null` and `taskKeywords: []` passed for now — story A1.5 will wire `repo_url` support
- WebSocket path uses optional chaining (`if (deps.knowledgeInjector)`) for backward compatibility with tests that don't provide it

## Files Modified

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | Added `buildSystemPrompt` import; wired `knowledgeInjector.inject()` + `buildSystemPrompt()` before REST `agentLoop.run()`; pass `knowledgeInjector` to WS deps |
| `packages/server/src/server/ws-handler.ts` | Added `buildSystemPrompt` + `KnowledgeInjector` imports; added `knowledgeInjector` to `WsSessionDeps`; wired inject before WS `agentLoop.run()` |

## Open Questions

- None

## Next Steps

1. Continue Sprint A1 — pick next story (A1.2 through A1.5)
2. Recommended: A1.3 (emit todo update events), A1.4 (browser screenshots), A1.5 (accept repo_url) can be done in parallel

## Current BMAD Phase

Phase 5: Manual Testing & Refinement — Track A: Wire & Tune — Sprint A1 story 1 of 5 complete
