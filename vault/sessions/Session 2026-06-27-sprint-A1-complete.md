# Session 2026-06-27 — Sprint A1 Complete (All 5 Stories)

## What Was Done

- **A1.1: Wire knowledge injection** — `KnowledgeInjector.inject()` now called before `agentLoop.run()` in both REST and WebSocket handlers. System prompt includes workspace rules, knowledge notes, session history, and repo maps.
- **A1.2: Wire repo map generation** — `RepoMapGenerator` instantiated in `app.ts`, fire-and-forget `generate()` after container health check on both session creation and resume. Uses repo_url as cache key when available.
- **A1.3: Emit todo_update events** — Agent loop now yields `todo_update` events after each tool result and before `done`. TodoTracker state flows through WS handler to UI.
- **A1.4: Wire browser screenshots** — `tool_complete` events containing `base64_image` or `screenshot` fields now also emit `browser_screenshot` WebSocket events. Added `BrowserScreenshotEvent` to shared event schema.
- **A1.5: Accept repo_url** — `POST /api/sessions` accepts `repo_url` and `branch`, clones into `/workspace`. Added `repo` to SessionState. Knowledge injection uses `session.repo` as scope. UI has repo URL + branch inputs in session creation form.

## Files Modified

| File | Stories |
|------|---------|
| `packages/server/src/server/app.ts` | A1.1, A1.2, A1.5 |
| `packages/server/src/server/ws-handler.ts` | A1.1, A1.4, A1.5 |
| `packages/server/src/agent/agent-loop.ts` | A1.3 |
| `packages/shared/src/events.ts` | A1.4 |
| `packages/ui/src/lib/api.ts` | A1.5 |
| `packages/ui/src/pages/SessionsPage.tsx` | A1.5 |

## Decisions Made

- A1.1: Used Option A (build system prompt at call site) — less invasive
- A1.4: Added `BrowserScreenshotEvent` to shared schema for type safety rather than using a cast
- A1.5: Used `JSON.stringify()` for shell-safe quoting of repo_url/branch in clone commands
- Repo map generation uses repo_url as cache key when available, falls back to sessionId

## Tests

- All 44 test suites pass, zero regressions

## Next Steps

1. **Sprint A2** — Context management wiring (checkpoints, forced summarization, selective retention, idle monitor, checkpoint restore)
2. Sprint A2 stories are independent of each other — can be parallelized
3. After A2, proceed to A3 (7B model tuning) and A4 (UI polish) in parallel

## Current BMAD Phase

Phase 5: Manual Testing & Refinement — Track A: Wire & Tune — Sprint A1 complete, Sprint A2 ready to start
