# Session — 2026-06-26 (Sprint 6 Complete)

## Summary

Completed all 4 Sprint 6 stories (Snapshots & Browser). Phase 2 is now fully complete (13/13 stories done). Ready for Phase 3 (Web UI).

## What Was Done

### Story 2.2.1: environment.yaml Blueprint Parser
- **Zod schema** for `environment.yaml`: name, base, repos[], setup[], tools[], env{}, health_check[], resources{}
- **parseBlueprint()**: YAML parsing → Zod validation → typed Blueprint
- **loadBlueprint()**: file loading + parsing
- **computeHash()**: SHA-256 of raw YAML content for cache keying
- **snapshotImageTag()**: generates `forge-snapshot:{name}-{hash[:12]}` format
- **18 new tests** (7 schema, 6 parsing, 2 hash, 3 tag)

### Story 2.2.2: Snapshot Builder (YAML → Docker Image)
- **SnapshotBuilder class**: 7-step build pipeline
  1. Create temp container from base image
  2. Clone repos (shallow clone, chown to forge user)
  3. Install tools (mapped to apt-get/installer commands)
  4. Run setup commands (sequential, fail-fast)
  5. Set env vars (written to /etc/environment + profile.d)
  6. Run health checks (all must exit 0)
  7. Commit container as Docker image
- **Cache checking**: skip rebuild if image with matching hash exists
- **Progress callback**: real-time streaming of build status
- **listSnapshots()**: query Docker for forge-snapshot images
- **removeSnapshot()**: delete image by tag
- **inspectSnapshot()**: detailed image info (layers, env, labels)
- **9 new tests** (cache, build, failure, progress, listing)

### Story 2.2.3: Snapshot CLI Commands
- `forge snapshot build [path]` — build from environment.yaml with spinner progress
- `forge snapshot list` — tabular listing with tag, size, creation time
- `forge snapshot prune` — remove all snapshot images
- `forge snapshot inspect <name>` — detailed image info
- `--no-cache` flag for force rebuild
- Follows existing CLI patterns (chalk, ora, Commander.js subcommands)

### Story 2.4.2: Browser Tools (Playwright/Chromium)
- **Dockerfile updated**: Chromium, Playwright deps, font libraries, GitHub CLI
- **6 browser tools** registered:
  - `browser_navigate` — go to URL, return title/URL/status
  - `browser_click` — click element by CSS selector
  - `browser_type` — type text into input by CSS selector
  - `browser_screenshot` — capture PNG, base64-encoded (< 1MB auto-resize)
  - `browser_evaluate` — execute JavaScript in page context
  - `browser_get_text` — extract text from page or specific element
- All tools generate self-contained Playwright scripts executed via container exec
- Screenshot size limiting: auto-resize if > 1MB
- **17 new tests** (6 schema, 9 handler execution, 2 registration)

## Test Summary

| Module | Tests |
|--------|-------|
| ConversationHistory | 22 |
| TokenBudget | 15 |
| TokenEstimator | 8 |
| ErrorRecovery | 27 |
| TodoTracker | 20 |
| ParallelDispatch | 6 |
| Database | 5 |
| SessionStore | 24 |
| IdleMonitor | 7 |
| ContainerManager | 13 |
| ToolRegistry | 10 |
| Tool handlers | 12 |
| Git tools | 11 |
| WebSocket | 4 |
| Blueprint parser | 18 |
| Snapshot builder | 9 |
| Browser tools | 17 |
| **Total** | **235 tests, all passing** |

## Sprint 6 Exit Criteria — All Met

- [x] `environment.yaml` Zod schema validates blueprint format
- [x] SHA-256 hash of YAML used as cache key for Docker images
- [x] `forge snapshot build [path]` builds image from YAML (clone repos, install tools, run setup)
- [x] `forge snapshot list` and `forge snapshot prune` work
- [x] `--no-cache` flag forces rebuild
- [x] Chromium + Playwright installed in sandbox image
- [x] Browser tools: navigate, click, type, screenshot, evaluate, get_text
- [x] Screenshots returned as base64 PNG (< 1MB)

## Phase 2 Exit Criteria — All Met

- [x] Multi-turn conversations with context windowing
- [x] Full WebSocket streaming (all event types from spec)
- [x] Sessions persist in SQLite, can be resumed
- [x] Git workflow: clone → edit → commit → push → create PR
- [x] Environment snapshots: < 5s boot from pre-built images
- [x] Browser automation: navigate, screenshot, interact
- [x] Parallel tool dispatch for independent calls
- [x] Todo tracking visible to user
- [x] Error recovery with escalation
- [x] All new features have tests

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| js-yaml for YAML parsing | Lightweight, well-maintained, sufficient for our needs |
| System Chromium over bundled | Smaller image, Playwright uses system browser via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH |
| Self-contained Playwright scripts per tool call | Simpler than maintaining a persistent browser process; each call is independent |
| Screenshot auto-resize at 1MB | Keeps base64 payloads reasonable for LLM context |
| SnapshotBuilder uses container commit (not Dockerfile) | More flexible — allows dynamic steps, no Dockerfile generation needed |

## Next Steps

1. **Phase 3 begins** — Web UI
2. **Story 3.1.1** — React + Vite app with routing and layout
3. **Story 3.1.2** — Sessions page (list, create, resume, delete)
4. **Story 3.2.1** — Streaming markdown chat with assistant-ui
5. Need to plan Phase 3 sprints (no sprint plan exists yet)

## BMAD State

- **Phase position:** Phase 2 COMPLETE, ready for Phase 3
- **Phase 2 sprints:** 3/3 complete (Sprint 4, 5, 6)
- **Phase 2 stories:** 13/13 complete
- **Next phase:** Phase 3 — Web UI

## Files Modified/Created

| File | Change |
|------|--------|
| `packages/server/src/snapshot/blueprint.ts` | New — Zod schema, YAML parser, hash |
| `packages/server/src/snapshot/snapshot-builder.ts` | New — Docker image build pipeline |
| `packages/server/src/snapshot/index.ts` | New — module exports |
| `packages/server/src/snapshot/__tests__/blueprint.test.ts` | New — 18 tests |
| `packages/server/src/snapshot/__tests__/snapshot-builder.test.ts` | New — 9 tests |
| `packages/server/src/tools/handlers/browser-tools.ts` | New — 6 browser tools |
| `packages/server/src/tools/__tests__/browser-tools.test.ts` | New — 17 tests |
| `packages/server/src/cli/snapshot.ts` | New — CLI snapshot subcommands |
| `packages/server/src/cli/index.ts` | Updated — snapshot command registration |
| `packages/server/src/tools/handlers/index.ts` | Updated — browser tool exports |
| `packages/server/src/tools/register-builtins.ts` | Updated — browser tool registration |
| `packages/server/src/index.ts` | Updated — snapshot module exports |
| `packages/server/package.json` | Updated — added js-yaml dependency |
| `packages/sandbox/Dockerfile` | Updated — Chromium, Playwright, gh CLI |
| `pnpm-lock.yaml` | Updated — new dependencies |
