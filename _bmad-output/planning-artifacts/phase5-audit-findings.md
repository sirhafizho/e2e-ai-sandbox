# Phase 5 Audit Findings — What's Built But Not Wired

> **Audit date:** 2026-06-26
> **Scope:** Full codebase audit across server, UI, knowledge, tools, database, CLI
> **Finding:** Significant built-but-not-wired code. The infrastructure is ~80% built but only ~50% actually connected.

---

## Executive Summary

Forge has 352 passing unit tests, but the tests are testing modules in isolation. When you trace the actual request flow (user sends message -> agent responds), many modules that were "completed" in Phases 2-4 are **never actually called**. The entire knowledge system (Phase 4) is essentially dead code in production.

---

## Severity Legend

| Tag | Meaning |
|-----|---------|
| **P0** | Blocks core functionality — must fix before any testing |
| **P1** | Feature doesn't work end-to-end — must fix before ship |
| **P2** | Feature partially works, degraded experience |
| **P3** | Nice to have, can defer |

---

## CATEGORY 1: Knowledge System (ALL of Phase 4 is unwired)

### P0-01: Knowledge Injector never called
- **What:** `KnowledgeInjector` is instantiated in `app.ts:76-81` but `.gather()` / `.inject()` are **never called**
- **Impact:** The agent has ZERO access to: workspace rules (AGENTS.md), knowledge notes, previous session summaries, repo structure maps
- **Fix:** Call `knowledgeInjector.inject()` before `agentLoop.run()`, pass result to `buildSystemPrompt()` as `knowledgeContext`
- **Files:** `app.ts`, `ws-handler.ts`, `agent-loop.ts`

### P0-02: Repo map generator never instantiated
- **What:** `RepoMapGenerator` class exists (289 lines) with tests, but is **never instantiated** in production
- **Impact:** `RepoMapStore` is never populated. When `KnowledgeInjector` tries to read repo maps, the table is empty
- **Fix:** Instantiate `RepoMapGenerator` on session creation, call `.generate()` after container health check
- **Files:** `app.ts`

### P1-03: Rules loader only reachable through KnowledgeInjector
- **What:** `RulesLoader` is created inside `KnowledgeInjector`, but since injector is never called, rules are never loaded
- **Impact:** AGENTS.md, CLAUDE.md, .cursorrules are never read or injected into the system prompt
- **Fix:** Fixed automatically when P0-01 is resolved

### P1-04: Note suggester never instantiated
- **What:** `NoteSuggester` class exists (193 lines) but is **never instantiated** in production
- **Impact:** No auto-suggestion of knowledge notes after sessions
- **Fix:** Instantiate on session end, analyze conversation, propose notes
- **Files:** `ws-handler.ts` (session end hook)

### P1-05: CI monitor never instantiated
- **What:** `CIMonitor` class exists (185 lines) but is **never instantiated** in production
- **Impact:** No CI status awareness. Agent can't check if tests are passing
- **Fix:** Create endpoint `GET /api/sessions/:id/ci-status`, optionally inject into context
- **Files:** `app.ts`

### P1-06: Selective retention never used
- **What:** `SelectiveRetention` class exists (199 lines) for smart output truncation — **never instantiated**
- **Impact:** Tool outputs use crude truncation instead of intelligent trimming (stack trace dedup, error extraction)
- **Fix:** Instantiate in `ConversationHistory`, apply `truncateToolOutput()` when adding tool results
- **Files:** `conversation-history.ts`

---

## CATEGORY 2: Agent Loop Gaps

### P0-07: Todo updates never emitted to UI
- **What:** `TodoTracker` is injected into the system prompt, and `ws-handler.ts` has a `todo_update` event handler, but the agent loop **never yields `todo_update` events**
- **Impact:** UI todo list widget renders but never receives updates. Always shows empty
- **Fix:** Add `yield { type: 'todo_update', data: { todos: this.todoTracker.list() } }` after tool completions
- **Files:** `agent-loop.ts`

### P0-08: Checkpoint creation never triggered
- **What:** `CheckpointManager` exists (208 lines), `CheckpointStore` exists (108 lines), `TokenBudget.shouldCheckpoint()` exists — but **checkpoint creation is never called** at the 95% threshold
- **Impact:** Long sessions that hit token limits will crash or produce garbage instead of gracefully checkpointing
- **Fix:** In agent loop, when `tokenBudget.shouldCheckpoint()` returns true, call `checkpointManager.createCheckpoint()`
- **Files:** `agent-loop.ts`

### P1-09: Forced summarization at 85% never triggered
- **What:** `TokenBudget.shouldForceSummarize()` exists but is **never called**. Only `shouldSummarize()` (70%) is checked
- **Impact:** No escalation between warning (70%) and emergency (95%). Context degrades without intervention
- **Fix:** Check `shouldForceSummarize()` alongside `shouldSummarize()` in the budget pressure handler
- **Files:** `agent-loop.ts`

### P1-10: Summarization is extractive, not LLM-based
- **What:** Context windowing uses `buildExtractSummary()` which does simple line-slicing, not intelligent summarization
- **Impact:** Summaries lose critical context. Spec requires "separate LLM call to produce compressed context"
- **Fix:** Add LLM-based summarization call (can use same model or a lighter one)
- **Files:** `agent-loop.ts`

### P2-11: Checkpoint restoration on resume not implemented
- **What:** `CheckpointManager.loadCheckpoint()` and `.formatForResume()` exist but are never called on session resume
- **Impact:** Resumed sessions start with empty context instead of picking up where they left off
- **Fix:** In resume flow, load checkpoint and inject into system prompt
- **Files:** `app.ts` (resume endpoint)

---

## CATEGORY 3: Server Integration Gaps

### P0-12: Session creation doesn't accept repo_url, snapshot_id, or environment_yaml
- **What:** `POST /api/sessions` only accepts `{ model }`. Spec requires `repo_url`, `snapshot_id`, `environment_yaml`
- **Impact:** Can't create sessions that clone a repo or boot from a snapshot. Every session starts as blank workspace
- **Fix:** Accept additional params, clone repo into container, or boot from snapshot image
- **Files:** `app.ts` (POST /api/sessions)

### P1-13: Idle monitor never instantiated
- **What:** `IdleMonitor` class exists (167 lines) with tests — **never instantiated or started**
- **Impact:** Sessions never auto-timeout. Containers run forever. No idle warnings sent
- **Fix:** Instantiate in `app.ts`, wire warning callback to send WebSocket events
- **Files:** `app.ts`, needs event bus for background -> WebSocket communication

### P1-14: tool_output streaming events not emitted
- **What:** Spec defines `tool_output` event for streaming chunks during tool execution. Agent loop never yields it
- **Impact:** UI only sees tool start and tool complete — no intermediate output during long-running commands
- **Fix:** Modify tool execution in agent loop to yield output chunks
- **Files:** `agent-loop.ts`

### P2-15: Session list API missing history_json field
- **What:** UI expects `history_json` in session list response. Server doesn't return it
- **Impact:** Session cards can't display message counts (gracefully handled with try-catch, but non-functional)
- **Fix:** Include `history_json` (or just `message_count`) in the list response
- **Files:** `app.ts` (GET /api/sessions)

### P2-16: Session detail response missing fields
- **What:** Spec includes `active_tools`, `workspace` in session detail. Not returned
- **Impact:** UI can't show what tools are active or workspace status
- **Files:** `app.ts` (GET /api/sessions/:id)

---

## CATEGORY 4: UI Integration Gaps

### P0-17: Browser screenshot events disconnected from UI
- **What:** UI listens for `browser_screenshot` WebSocket event. Server never sends it. Browser tool returns base64 PNG in `tool_complete`, but UI doesn't extract it
- **Impact:** Browser panel never shows screenshots. It's a dead panel
- **Fix:** Either emit `browser_screenshot` events from agent loop when browser tools complete, or extract screenshot from tool_complete in UI
- **Files:** `ws-handler.ts` or `SessionPage.tsx`

### P1-18: File panel is read-only, no write API
- **What:** CodeMirror editor is set to `readOnly: true`. No `POST/PUT /api/sessions/:id/files` endpoint exists
- **Impact:** Users cannot edit files through the UI. File edits must go through the agent only
- **Fix:** Add REST endpoint for file writes, enable CodeMirror editing, add save button
- **Files:** `app.ts`, `FilePanel.tsx`

### P2-19: Browser navigation buttons non-functional
- **What:** Back, Forward, Refresh buttons in browser panel have no `onClick` handlers
- **Impact:** Browser panel is screenshot-only, no user interaction
- **Fix:** Add click handlers that invoke browser tools or send navigation commands
- **Files:** `BrowserPanel.tsx`

### P2-20: Terminal "New shell tab" button is placeholder
- **What:** Button says "coming soon", has no onClick handler
- **Impact:** Users can't create additional shell tabs
- **Fix:** Wire button to create new terminal WebSocket connection with different shellId
- **Files:** `TerminalPanel.tsx`

---

## CATEGORY 5: Tool Gaps

### P1-21: shell_exec ignores shell_id parameter
- **What:** Input schema accepts `shell_id` but handler ignores it — every call creates a new exec session
- **Impact:** No persistent shell sessions. Environment variables, cwd, command history don't persist between calls
- **Fix:** Add shell session manager that maps shell_id to persistent exec sessions
- **Files:** `shell-exec.ts`, `container-manager.ts`

### P2-22: shell_write tool not implemented
- **What:** Spec defines `shell_write` for interactive stdin. No handler exists, not registered
- **Impact:** Agent can't interact with REPLs, vim, ssh, or other interactive programs
- **Fix:** Create handler using `containerManager.execInteractive()`, register in builtins
- **Files:** New handler + `register-builtins.ts`

### P2-23: file_multi_edit tool not implemented
- **What:** Spec defines `file_multi_edit` for batch edits. No handler exists
- **Impact:** Agent must make multiple `file_edit` calls instead of one batch call
- **Fix:** Create handler that applies sequential edits, register in builtins
- **Files:** New handler + `register-builtins.ts`

### P2-24: web_search tool not implemented
- **What:** Spec defines `web_search` for server-side web searches. No handler exists
- **Impact:** Agent can't search the web for documentation or solutions
- **Fix:** Create server-side handler (SearXNG, Brave, or Google Custom Search)
- **Files:** New handler + `register-builtins.ts`

### P3-25: Browser launches new instance per tool call
- **What:** Each browser tool call starts a fresh Chromium instance. No session persistence
- **Impact:** Cookies, auth state, page state lost between browser tool calls. Very slow
- **Fix:** Implement browser session manager that reuses Playwright instances
- **Files:** `browser-tools.ts`

---

## CATEGORY 6: CLI & Architecture

### P2-26: CLI is standalone, not server-integrated
- **What:** `forge chat` creates its own container and agent loop. Doesn't connect to the server
- **Impact:** CLI sessions aren't persisted, don't benefit from knowledge system, aren't visible in UI
- **Fix:** Add HTTP client to CLI, connect to running server instead of standalone mode
- **Files:** `cli/chat.ts`

### P3-27: Secrets not injected into containers
- **What:** SecretsStore has CRUD API and REST endpoints, but secrets are **never injected as env vars into containers**
- **Impact:** Secrets management exists in settings UI but doesn't actually make secrets available to the agent
- **Fix:** In container creation flow, read secrets from store and pass as env vars
- **Files:** `app.ts` (session creation)

---

## Summary Scoreboard

| Severity | Count | Description |
|----------|-------|-------------|
| **P0** | 5 | Blocks core testing (knowledge injection, todo events, screenshots, session params, checkpoints) |
| **P1** | 9 | Features don't work end-to-end |
| **P2** | 9 | Partially working, degraded experience |
| **P3** | 4 | Nice to have, can defer |
| **Total** | 27 | |

### By Category

| Category | P0 | P1 | P2 | P3 | Total |
|----------|----|----|----|----|-------|
| Knowledge System | 2 | 4 | 0 | 0 | 6 |
| Agent Loop | 2 | 2 | 1 | 0 | 5 |
| Server Integration | 1 | 2 | 2 | 0 | 5 |
| UI Integration | 1 | 1 | 2 | 0 | 4 |
| Tools | 0 | 1 | 3 | 1 | 5 |
| CLI & Architecture | 0 | 0 | 1 | 1 | 2 |

### What Actually Works End-to-End Today

| Feature | Status |
|---------|--------|
| Create blank session, send message, get response | ✅ Works |
| Stream agent text to chat panel | ✅ Works |
| Tool start/complete events in chat | ✅ Works |
| Terminal PTY connection | ✅ Works |
| File tree browsing (read-only) | ✅ Works |
| Settings persistence | ✅ Works |
| Knowledge notes CRUD (via REST) | ✅ Works |
| Secrets CRUD (via REST) | ✅ Works |
| Session history CRUD (via REST) | ✅ Works |
| Error recovery with retry | ✅ Works |
| Parallel tool dispatch | ✅ Works |
| Session persistence to SQLite | ✅ Works |
| All 13 tool handlers execute real commands | ✅ Works |

### What Doesn't Work End-to-End Today

| Feature | Status | Blocker |
|---------|--------|---------|
| Knowledge injection into agent | ❌ Dead code | P0-01, P0-02 |
| Rules loading (AGENTS.md etc.) | ❌ Dead code | P0-01 |
| Repo map generation | ❌ Dead code | P0-02 |
| Todo list updates in UI | ❌ Never emitted | P0-07 |
| Browser panel screenshots | ❌ Disconnected | P0-17 |
| Session creation with repo | ❌ Not implemented | P0-12 |
| Checkpoint at token overflow | ❌ Not triggered | P0-08 |
| Session idle timeout | ❌ Not wired | P1-13 |
| File editing from UI | ❌ Read-only | P1-18 |
| Forced summarization (85%) | ❌ Not triggered | P1-09 |
| Note auto-suggestion | ❌ Never called | P1-04 |
| CI status monitoring | ❌ Never called | P1-05 |
| Streaming tool output | ❌ Not emitted | P1-14 |
| Persistent shell sessions | ❌ Ignored param | P1-21 |
| web_search tool | ❌ Not built | P2-24 |
| shell_write tool | ❌ Not built | P2-22 |
| Multi-tab terminal | ❌ Placeholder | P2-20 |
| Browser navigation | ❌ No handlers | P2-19 |
| Secrets env injection | ❌ Not wired | P3-27 |
