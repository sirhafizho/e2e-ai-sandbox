# Session 2026-06-28 — Deep Audit: 3 Rounds, 16 Bugs Fixed

## What Was Done

Full codebase audit using 6 parallel analysis subagents covering all packages (server, UI, shared, tools, knowledge, DB, CLI). Each finding was manually verified against the actual source code before fixing — eliminated false positives from subagent reports.

### Round 1: Core Bugs (7 fixes)

| # | Fix | Severity | File(s) |
|---|-----|----------|---------|
| 1 | **SessionPage WS event handlers never unsubscribed** — all 11 `ws.on()` calls ignored the returned unsubscribe function, causing memory leaks and stale closures on navigation/remount | CRITICAL | SessionPage.tsx |
| 2 | **Registry tool timeout timer leak on error** — `clearTimeout(timer)` only called on success, not in catch block. Timer leaked if handler threw | MEDIUM | registry.ts |
| 3 | **selective-retention truncateShellOutput** — unconditionally truncated text to `MAX_TOOL_OUTPUT_LENGTH` even when line count was within limits, losing output unnecessarily | HIGH | selective-retention.ts |
| 4 | **Snapshot builder Docker stream data loss** — no pending buffer for incomplete multiplex frames spanning chunks (unlike container-manager.ts which had this fix) | MEDIUM | snapshot-builder.ts |
| 5 | **git tools unquoted user inputs** — `input.commit`, `input.path`, `input.branch`, `input.base`, `input.files`, and `cwd` passed directly into shell commands without quoting across 6 git tools | HIGH | git-tools.ts |
| 6 | **ChatMessage CodeBlock setTimeout leak** — copy-to-clipboard timer never cleared, state update on unmount | MEDIUM | ChatMessage.tsx |
| 7 | **SettingsPage setTimeout leak** — saved indicator timer never cleared on component unmount | MEDIUM | SettingsPage.tsx |

### Round 2: Deeper Flow Tracing (4 fixes)

| # | Fix | Severity | File(s) |
|---|-----|----------|---------|
| 8 | **Search tools shell injection** — `grep` and `find_files` patterns/paths not shell-escaped, allowing breakout via special characters | HIGH | search-tools.ts |
| 9 | **Emergency token_budget event missing fields** — emitted raw `usageRatio` without rounding, and lacked `used`, `remaining`, `usableBudget` fields, sending `undefined` to UI | MEDIUM | agent-loop.ts |
| 10 | **enforcePath incomplete traversal check** — only checked for `..` substring, didn't resolve path. Now uses `posix.resolve()` and validates resolved path starts with `/workspace` | MEDIUM | file-tools.ts |
| 11 | **git_status double space** — cosmetic typo in shell command | LOW | git-tools.ts |

### Round 3: JSON.parse Safety (5 fixes)

| # | Fix | Severity | File(s) |
|---|-----|----------|---------|
| 12 | **Knowledge notes API crash** — `JSON.parse(n.tags)` unguarded in GET endpoint, crashes on corrupted data | MEDIUM | app.ts |
| 13 | **Session history API crash** — `JSON.parse()` for `decisions_made`, `files_modified`, `errors_hit` all unguarded | MEDIUM | app.ts |
| 14 | **Note creation response crash** — `JSON.parse(note.tags)` unguarded in POST response | MEDIUM | app.ts |
| 15 | **CLI sessions list crash** — `JSON.parse(s.history_json)` unguarded, crashes CLI on corrupted history | MEDIUM | sessions.ts |
| 16 | **CLI sessions show crash** — same issue for individual session display | MEDIUM | sessions.ts |

## False Positives Identified (from subagent reports)

- **SettingsPage API response unwrapping** — `res.settings.provider` is correct because `api.settings.get()` returns `{ settings: ServerSettings }`, not unwrapped
- **ClientWebSocketEvent missing terminal events** — terminal events use a separate WebSocket endpoint, not the agent WS
- **file_write base64 newline injection** — Node.js `Buffer.toString('base64')` doesn't add newlines, and base64 charset doesn't contain single quotes
- **ci-monitor JSON.parse** — already wrapped in outer try-catch block
- **crypto.randomUUID missing import** — available globally in Node.js 19+ (project uses Node 20+)

## Summary Stats

- **16 bugs fixed** (1 CRITICAL, 3 HIGH, 10 MEDIUM, 2 LOW)
- **1 commit**: `70e57a3`
- **All tests pass** (479/479), **typecheck clean** across all packages
- **12 files modified** across server + UI packages
- **5 false positives identified and eliminated**

## Key Categories

- **Resource leaks** (3 bugs): WS handler unsubscribe, setTimeout cleanup x2
- **Shell injection/escaping** (3 bugs): git tools, grep, find_files
- **Data integrity** (6 bugs): JSON.parse crashes in API, CLI, and agent events
- **Logic errors** (2 bugs): truncation logic, path traversal check
- **Stream data loss** (1 bug): Docker stream multiplex buffering
- **Event field mismatches** (1 bug): emergency token_budget missing fields

## Files Modified

| Package | Files |
|---------|-------|
| `packages/server/src/agent/` | agent-loop.ts |
| `packages/server/src/cli/` | sessions.ts |
| `packages/server/src/knowledge/` | selective-retention.ts |
| `packages/server/src/server/` | app.ts |
| `packages/server/src/snapshot/` | snapshot-builder.ts |
| `packages/server/src/tools/handlers/` | file-tools.ts, git-tools.ts, search-tools.ts |
| `packages/server/src/tools/` | registry.ts |
| `packages/ui/src/components/chat/` | ChatMessage.tsx |
| `packages/ui/src/pages/` | SessionPage.tsx, SettingsPage.tsx |

## Cumulative Bug Fix Count

- Previous sessions: 36 bugs fixed
- This session: 16 bugs fixed
- **Total: 52 bugs fixed** across the E2E system

## Current BMAD Phase

Phase 5: Manual Testing & Refinement — Track A complete, stress testing complete (8 rounds total, 52 fixes)
