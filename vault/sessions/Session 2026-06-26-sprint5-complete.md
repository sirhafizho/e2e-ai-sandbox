# Session — 2026-06-26 (Sprint 5 Complete)

## Summary

Completed all 5 Sprint 5 stories (Persistence & Git), finishing Sprint 5 in full. All exit criteria met. Ready for Sprint 6.

## What Was Done

### Story 2.3.1: Session CRUD with SQLite Persistence
- **better-sqlite3** added as dependency, WAL mode enabled
- **Database module** (`packages/server/src/db/`): `openDatabase()`, schema migrations, `SessionStore` class
- **SessionStore**: create, get, list, listActive, update, updateHistory, touchActivity, delete, terminate, countActive
- **Server app** (`app.ts`): sessions persisted to SQLite alongside in-memory Map; conversation history saved after each turn
- **Resume endpoint** (`POST /api/sessions/:id/resume`): re-create container, load history from DB
- **CLI commands**: `forge sessions list`, `forge sessions show <id>`, `forge sessions delete <id>`
- **WebSocket handler**: auto-persists history and touches activity after each message
- **29 new tests** (5 database, 24 session-store)

### Story 2.4.1: Git Tools
- **7 git tools** registered: `git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_pr`, `git_pr_status`
- All tools execute via `containerManager.exec()` in the sandbox container
- `git_create_pr` and `git_pr_status` use `gh` CLI (pre-installed in container)
- Output trimming: diffs capped at 500 lines, logs at 50 entries
- **Container manager**: added `pause()` and `unpause()` methods for idle timeout support
- **11 new tests** (integration tests with live Docker container)

### Story 2.1.3: Todo Tracking
- **TodoTracker class**: add/update/remove/list/clear/replaceAll/toContext/toEventPayload
- Enforces **one in_progress at a time** — automatically resets previous
- `toContext()` generates markdown for LLM system prompt injection
- Integrated into **AgentLoop**: todo context appended to system prompt on every turn
- **WebSocket handler**: forwards `todo_update` events to clients
- `todo_update` event type added to AgentEventType
- **20 new tests**

### Story 2.3.2: Idle Timeout and Auto-Cleanup
- **IdleMonitor class**: configurable idle timeout (default 60 min), warning (default 55 min), destroy (default 24h)
- **Warning callback**: fires at warningMinutes, tracked to avoid duplicates
- **Pause phase**: at idle timeout, container paused, session status → 'paused'
- **Destroy phase**: after destroyAfterMs, container destroyed, session terminated
- Skips sessions with status 'running'
- `start()`/`stop()` for background check interval
- **7 new tests** (with stub container manager)

### Story 2.6.1: Parallel Dispatch for Independent Tool Calls
- **ParallelDispatch class**: concurrency-limited task executor
- Configurable `maxParallelToolCalls` (default 10) on AgentLoop
- Tracks totalDispatched, peakConcurrency, currentConcurrency, queueLength
- Error in one task doesn't block the queue
- Integrated into AgentLoop: all tool executions wrapped with `parallelDispatch.execute()`
- **6 new tests**

## Test Summary

- ConversationHistory: 22 tests
- TokenBudget: 15 tests
- TokenEstimator: 8 tests
- ErrorRecovery: 27 tests
- TodoTracker: 20 tests
- ParallelDispatch: 6 tests
- Database: 5 tests
- SessionStore: 24 tests
- IdleMonitor: 7 tests
- ContainerManager: 13 tests
- ToolRegistry: 10 tests
- Tool handlers: 12 tests
- Git tools: 11 tests
- WebSocket: 4 tests
- **Total: 191 tests, all passing**

## Sprint 5 Exit Criteria — All Met

- [x] Sessions stored in SQLite (`~/.forge/forge.db`) with create/list/resume/destroy
- [x] `forge sessions list` and `forge sessions show <id>` CLI commands work
- [x] Git tools: `git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_pr`
- [x] `gh` CLI pre-installed in container for PR creation
- [x] TodoTracker: add/update/list, only one in_progress at a time, streamed to client
- [x] Sessions auto-timeout after 1 hour idle, warning at 55 min
- [x] Independent tool calls dispatched in parallel (up to 10 concurrent)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| better-sqlite3 over sql.js | Native bindings, much faster, synchronous API simplifies code |
| WAL mode for SQLite | Better read concurrency for multi-session scenarios |
| Conversation history stored as JSON | Simpler than normalizing into separate messages table; sufficient for v1 |
| Container pause() instead of stop() | Faster resume, preserves process state; destroy after 24h for cleanup |
| ParallelDispatch wraps tool execute | Transparent to AI SDK; limits actual container command concurrency |
| IdleMonitor uses polling interval | Simple, reliable; WebSocket-based tracking added complexity without benefit |

## Next Steps

1. **Sprint 6 begins** — Snapshots & Browser
2. **Story 2.2.1** — `environment.yaml` blueprint parser
3. **Story 2.2.2** — Snapshot builder (YAML → Docker image)
4. **Story 2.2.3** — Snapshot CLI commands
5. **Story 2.4.2** — Browser tools (Playwright/Chromium)

## BMAD State

- **Phase position:** Phase 2, Sprint 5 complete
- **Sprint 6:** 0/4 stories done
- **Next sprint:** 2.2.1 (YAML parser), 2.2.2 (snapshot builder), 2.2.3 (snapshot CLI), 2.4.2 (browser tools)

## Files Modified/Created

| File | Change |
|------|--------|
| `packages/server/src/db/database.ts` | New — SQLite init, migrations, WAL mode |
| `packages/server/src/db/session-store.ts` | New — SessionStore CRUD class |
| `packages/server/src/db/index.ts` | New — DB module exports |
| `packages/server/src/agent/todo-tracker.ts` | New — TodoTracker class |
| `packages/server/src/agent/parallel-dispatch.ts` | New — ParallelDispatch concurrency limiter |
| `packages/server/src/tools/handlers/git-tools.ts` | New — 7 git tool implementations |
| `packages/server/src/cli/sessions.ts` | New — CLI sessions list/show/delete |
| `packages/server/src/server/idle-monitor.ts` | New — IdleMonitor with warning/pause/destroy |
| `packages/server/src/server/app.ts` | Updated — SQLite integration, resume endpoint |
| `packages/server/src/server/ws-handler.ts` | Updated — history persistence, todo_update events |
| `packages/server/src/agent/agent-loop.ts` | Updated — TodoTracker + ParallelDispatch integration |
| `packages/server/src/agent/types.ts` | Added — todo_update event type, TodoUpdateData |
| `packages/server/src/agent/index.ts` | Updated — new exports |
| `packages/server/src/sandbox/container-manager.ts` | Added — pause() and unpause() methods |
| `packages/server/src/tools/register-builtins.ts` | Updated — git tools registration |
| `packages/server/src/cli/index.ts` | Updated — sessions subcommand |
| `packages/server/src/index.ts` | Updated — DB + SessionState exports |
