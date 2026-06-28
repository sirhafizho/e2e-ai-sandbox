# Session 2026-06-27 — Sprint A3 + A4 Complete (All 10 Stories)

## What Was Done

### Sprint A3: 7B Model Tuning (5 stories)

- **A3.1: Tune effective context window** — Added `isSmallModel()` helper and `TokenBudget.forSmallModel()` with 16K effective context, aggressive thresholds (50% warning, 70% force-summarize, 85% checkpoint). Both `app.ts` and `ws-handler.ts` now auto-detect small models.
- **A3.2: Optimize system prompt** — `buildSystemPrompt()` now branches: large models get the verbose prompt, small models get a terse < 500 token prompt with structured rules and 3 few-shot examples. `isSmallModel` flag added to `SystemPromptContext`.
- **A3.3: Compress tool output** — Added `compressForModel()` to `SelectiveRetention` with smart extractors for npm install (package count + vulns), test runners (pass/fail summary), and tsc errors. Small models get 30+20 file reads, 20-line grep limits, and last-20-line shell output.
- **A3.4: Limit tool definitions** — New `tool-filter.ts` with `filterToolsForSmallModel()` — small models see 6 essential tools instead of 13+. `AgentLoop` accepts `modelName` option and filters tool definitions (execution still uses full registry).
- **A3.5: Micro-step hints** — After each `run()` completes, small models get a system message hint like `[shell_exec completed. What's the next step?]` with todo progress. Skipped for read/search operations.

### Sprint A4: UI Feature Completion (5 stories)

- **A4.1: File write endpoint + editor** — `PUT /api/sessions/:id/files/write` with base64 encoding and path traversal protection. FilePanel.tsx is now editable with Cmd+S save, yellow modified indicator, and Save button.
- **A4.2: Terminal multi-tab** — TerminalPanel refactored for multi-tab support. Each tab gets its own xterm.js + WebSocket. Plus button creates new tabs, X button closes non-default tabs. Max 5 tabs.
- **A4.3: Session list fields** — `GET /api/sessions` now returns `message_count` (computed server-side) and `context_summary`. UI's `SessionInfo` interface updated, `SessionsPage` uses `message_count` instead of parsing `history_json`. API return type corrected to `{ sessions, total }`.
- **A4.4: Wire note suggester** — `NoteSuggester` instantiated in `app.ts`, passed to ws-handler. After each conversation turn: auto-approves high-confidence (>0.7) notes, emits lower-confidence suggestions as `note_suggestions` WS events. Wrapped in try/catch.
- **A4.5: Secrets injection** — `CreateContainerOptions.env` field added. `app.ts` reads global + repo-scoped secrets from `SecretsStore`, merges them (repo overrides global), and passes as `Env` to Docker. Logs secret key names (not values).

## Files Modified

| File | Stories |
|------|---------|
| `packages/server/src/agent/token-budget.ts` | A3.1 |
| `packages/server/src/agent/system-prompt.ts` | A3.2 |
| `packages/server/src/knowledge/selective-retention.ts` | A3.3 |
| `packages/server/src/agent/tool-filter.ts` | A3.4 (new) |
| `packages/server/src/agent/agent-loop.ts` | A3.4, A3.5 |
| `packages/server/src/agent/conversation-history.ts` | A3.5 |
| `packages/server/src/server/app.ts` | A3.1, A3.2, A4.1, A4.3, A4.4, A4.5 |
| `packages/server/src/server/ws-handler.ts` | A3.1, A3.2, A4.4 |
| `packages/server/src/sandbox/types.ts` | A4.5 |
| `packages/server/src/sandbox/container-manager.ts` | A4.5 |
| `packages/ui/src/components/files/FilePanel.tsx` | A4.1 |
| `packages/ui/src/components/terminal/TerminalPanel.tsx` | A4.2 |
| `packages/ui/src/lib/api.ts` | A4.1, A4.3 |
| `packages/ui/src/pages/SessionsPage.tsx` | A4.3 |

## Decisions Made

- 16K effective context for 7B models (starting point, may tune)
- Few-shot examples in small model prompt match exact tool parameter names
- Tool filtering only affects definitions sent to LLM, not execution registry
- Base64 encoding for file writes (avoids heredoc issues)
- Max 5 terminal tabs (memory consideration)
- Auto-approve notes with confidence > 0.7, emit lower ones as WS events
- Secrets logged by key name only (never values)

## Tests

- All 30 test suites pass, zero regressions
- Typecheck passes for all packages (server, shared, ui, sandbox)
- Build passes for all packages

## Next Steps

1. **Track B** — Greenfield testing (blank workspace tasks)
2. **Track C** — Brownfield testing (existing repos via repo_url)
3. Test 7B model tuning with actual Qwen 2.5 Coder 7B

## Current BMAD Phase

Phase 5: Manual Testing & Refinement — Track A complete (Sprints A1-A4), ready for Track B/C testing
