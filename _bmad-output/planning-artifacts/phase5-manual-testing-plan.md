# Phase 5: Manual Testing & Refinement

> **Goal:** Battle-test Forge through real-world usage until it feels like a Mini Devin SWE product
> **Quality bar:** Ship-ready — confident enough to put on GitHub for strangers to try
> **Process:** Three tracks — Wire & Tune first, then Greenfield testing, then Brownfield testing
> **Estimated time:** 2-3 weeks (flexible — done when it feels right, not on a clock)
> **Audit findings:** See `phase5-audit-findings.md` for the full list of 27 issues found

---

## Why This Phase Exists

Phases 1-4 built Forge with 352 unit tests passing. But a deep audit revealed:
- **The entire knowledge system (Phase 4) is dead code** — built and tested in isolation, never wired into the request flow
- **Critical UI features are disconnected** — browser panel, todo list, file editing
- **The agent flies blind** — no rules, no repo maps, no knowledge notes reach the LLM
- **7B model needs orchestration help** — smaller context window, guided micro-steps, aggressive output compression

This phase fixes the wiring, tunes for the 7B model, then battle-tests with real workflows.

---

## Three Tracks

### Track A: Wire & Tune (PREREQUISITE — do first)

Fix all the built-but-not-wired code. No point testing features that aren't connected.
See detailed task list below.

### Track B: Greenfield Testing (after Track A)

Test with blank workspace tasks (build from scratch). Tests orchestration quality,
UI/UX, tool execution. Does NOT depend on code understanding capabilities.

### Track C: Brownfield Testing (after Track A)

Test with existing repos (clone, explore, fix, commit). Tests knowledge injection,
repo maps, rules loading, context management. Will expose gaps in code understanding.

---

## Track A: Wire & Tune — Detailed Task List

### Sprint A1: Critical Wiring (P0 fixes)

These 5 items block all meaningful testing:

| # | Task | Files | Est. |
|---|------|-------|------|
| A1.1 | **Wire knowledge injection into agent loop** — Call `knowledgeInjector.inject()` before `agentLoop.run()`, pass `knowledgeContext` to `buildSystemPrompt()` | `app.ts`, `ws-handler.ts`, `agent-loop.ts` | M |
| A1.2 | **Wire repo map generation on session creation** — Instantiate `RepoMapGenerator`, call `.generate()` after container health check, populate `RepoMapStore` | `app.ts` | M |
| A1.3 | **Emit todo_update events from agent loop** — Yield `todo_update` after tool completions so UI receives todo list changes | `agent-loop.ts` | S |
| A1.4 | **Wire browser screenshots to UI** — Forward browser tool output as `browser_screenshot` events (or extract from `tool_complete` in UI) | `ws-handler.ts` or `SessionPage.tsx` | S |
| A1.5 | **Accept repo_url in session creation** — Clone repo into container workspace when `repo_url` is provided in POST /api/sessions | `app.ts` | M |

### Sprint A2: Agent Loop Completeness (P0-P1 fixes)

| # | Task | Files | Est. |
|---|------|-------|------|
| A2.1 | **Wire checkpoint creation at 95% token budget** — Call `CheckpointManager.createCheckpoint()` when `shouldCheckpoint()` returns true | `agent-loop.ts` | M |
| A2.2 | **Wire forced summarization at 85%** — Check `shouldForceSummarize()` in budget pressure handler, escalate behavior | `agent-loop.ts` | S |
| A2.3 | **Wire selective retention** — Instantiate `SelectiveRetention` in `ConversationHistory`, apply smart truncation to tool outputs | `conversation-history.ts` | M |
| A2.4 | **Wire idle monitor** — Instantiate in `app.ts`, start background checks, send `idle_warning` via WebSocket | `app.ts` | M |
| A2.5 | **Wire checkpoint restore on session resume** — Load checkpoint in resume flow, inject into system prompt | `app.ts` | S |

### Sprint A3: 7B Model Tuning

| # | Task | Files | Est. |
|---|------|-------|------|
| A3.1 | **Tune effective context window for 7B** — Configure token budget to treat 8-16K as effective limit (not 128K theoretical). Summarize earlier, keep fewer turns | `token-budget.ts`, `agent-loop.ts` | M |
| A3.2 | **Optimize system prompt for small models** — Shorten, make more structured, add explicit tool usage instructions. Test with Qwen 2.5 Coder 7B | `system-prompt.ts` | L |
| A3.3 | **Compress tool output more aggressively** — Use `SelectiveRetention` to extract errors/key info instead of raw output dumps | `selective-retention.ts` | M |
| A3.4 | **Limit tool definitions per turn** — Show only relevant tools based on task phase (e.g., don't show git tools when building from scratch) | `agent-loop.ts`, `system-prompt.ts` | L |
| A3.5 | **Add micro-step hints after tool results** — Inject brief "what to do next" guidance after each tool completion to help 7B stay on track | `agent-loop.ts` | M |

### Sprint A4: UI Feature Completion (P1-P2 fixes)

| # | Task | Files | Est. |
|---|------|-------|------|
| A4.1 | **Add file write REST endpoint + enable editor** — POST/PUT `/api/sessions/:id/files`, set CodeMirror to editable, add save button | `app.ts`, `FilePanel.tsx` | M |
| A4.2 | **Wire terminal multi-tab support** — Enable "New shell tab" button, create new WebSocket per shellId | `TerminalPanel.tsx` | S |
| A4.3 | **Fix session list missing fields** — Return `message_count` or `history_json` in GET /api/sessions | `app.ts` | S |
| A4.4 | **Wire note suggester on session end** — Instantiate `NoteSuggester`, analyze conversation, propose notes | `ws-handler.ts` | M |
| A4.5 | **Wire secrets injection into containers** — Read secrets from store, pass as env vars on container creation | `app.ts` | S |

**Size key:** S = small (< 1 hour), M = medium (1-3 hours), L = large (3+ hours)

---

## Track B: Greenfield Testing

After Track A wiring is complete, test with blank workspace tasks.
These don't need repo understanding — they test tool execution, orchestration, and UI.

### The Loop

```
1. Hafiz runs a greenfield workflow in Forge
2. Notes what's broken, ugly, slow, confusing, or missing
3. Reports findings (bugs, UX issues, agent quality)
4. We fix them
5. Hafiz re-tests
6. Repeat until satisfied
```

### Suggested Greenfield Workflows

These aren't a checklist to grind through — they're suggestions for real-world scenarios that will naturally stress-test every layer.

### Workflow 1: "Build Me Something from Scratch"

> "Create a REST API with Express that has CRUD endpoints for a todo list, with SQLite storage and tests"

**What this tests:**
- Session creation (blank workspace)
- Agent's ability to plan and execute multi-step tasks
- `shell_exec` (npm init, install deps, run tests)
- `file_write` (create multiple files)
- `file_read` (read back to verify)
- Todo tracking (agent should create a plan)
- Chat panel streaming and tool cards
- Terminal panel showing command output
- File panel showing created files

### Workflow 2: "Fix a Bug in an Existing Repo"

> Clone a real repo with a known issue, ask the agent to find and fix it

**What this tests:**
- Session creation with `repo_url`
- Git clone and workspace setup
- `grep` and `find_files` for code exploration
- `file_read` for understanding code
- `file_edit` for targeted changes
- `shell_exec` for running tests
- `git_commit`, `git_push`, `git_create_pr`
- Multi-turn conversation (clarification, iteration)
- Error recovery (if tests still fail)
- Context management with a real codebase

### Workflow 3: "Understand This Codebase"

> Point it at a repo you're unfamiliar with and ask: "What does this project do? Walk me through the architecture."

**What this tests:**
- Code exploration tools (`find_files`, `grep`, `file_read`)
- Agent's ability to synthesize information
- Long responses with good markdown formatting
- Knowledge notes (should it remember findings?)
- Context windowing (lots of file reads)

### Workflow 4: "Refactor This Module"

> Ask the agent to refactor a complex file — extract functions, rename variables, add types

**What this tests:**
- `file_read` then `file_edit` precision
- Multi-edit workflows (does `old_text` matching work reliably?)
- Running linter/typecheck after changes
- Git diff to review changes
- Agent's judgment on what to refactor vs. leave alone

### Workflow 5: "Web Scraping Task"

> "Go to [url], extract the pricing table, and save it as a JSON file"

**What this tests:**
- Browser tools (`browser_navigate`, `browser_screenshot`, `browser_get_text`, `browser_evaluate`)
- Browser panel screenshot display
- Agent combining browser + file tools
- Screenshot auto-resize and display quality

### Workflow 6: "Long Running Session"

> Start a complex task, let it run for 20+ turns, keep adding follow-up requests

**What this tests:**
- Token budget tracking (70%, 85% thresholds)
- Auto-summarization quality
- Checkpoint creation and behavior
- Performance over time (memory leaks? slowdowns?)
- WebSocket stability over long connections
- Todo list accumulation and updates

### Workflow 7: "Resume Where I Left Off"

> Create a session, do some work, close the browser, come back and resume

**What this tests:**
- Session persistence in SQLite
- Session resume flow
- Conversation history reload
- Container state (paused vs. destroyed)
- UI reconnection to existing session
- Idle timeout behavior

### Workflow 8: "Settings and Configuration"

> Change LLM provider, adjust Docker limits, add knowledge notes, manage secrets

**What this tests:**
- Settings page UX (is it intuitive?)
- Provider test connection
- Settings persistence
- Knowledge notes CRUD
- Secrets injection into containers
- Configuration changes taking effect without restart

---

## Track C: Brownfield Testing

After Track A wiring is complete, test with existing repos.
These test knowledge injection, repo maps, rules loading, and the agent's ability to understand code it didn't write.

### Suggested Brownfield Workflows

### Workflow 9: "Fix a Bug in an Existing Repo"

> Clone a real repo with a known issue, ask the agent to find and fix it

**What this tests:**
- Session creation with `repo_url` (A1.5)
- Repo map generation and injection (A1.1, A1.2)
- Rules loading (AGENTS.md, etc.)
- Code exploration with `grep`, `find_files`, `file_read`
- Targeted `file_edit` changes
- Running tests to verify fix
- Git workflow: commit, push, PR
- Multi-turn conversation with context management

### Workflow 10: "Understand This Codebase"

> Point it at a repo and ask: "What does this project do? Walk me through the architecture."

**What this tests:**
- Repo map quality (does the injected structure help the agent orient?)
- Code exploration tool usage
- Agent's ability to synthesize information from many files
- Context windowing under heavy file-read load
- Knowledge note suggestion (should it propose notes from discoveries?)

### Workflow 11: "Add a Feature to an Existing Project"

> Clone a real project, ask the agent to add a specific feature (e.g., "add a /health endpoint")

**What this tests:**
- Understanding existing patterns before writing new code
- File creation + file editing in the context of existing code
- Import management (adding new imports to existing files)
- Running existing tests to check for regressions
- Git diff review before committing

### Brownfield-Specific Quality Checks

- Does the repo map help the 7B model understand the codebase structure?
- Are rules (AGENTS.md) actually influencing agent behavior?
- Does knowledge from previous sessions carry over (session history)?
- Can the agent find relevant code without reading every file?
- Does context management handle large codebases (100+ files)?

---

## Areas to Stress-Test

Beyond the workflows above, these specific areas deserve focused attention:

### Agent Quality
- Does the system prompt produce good agent behavior?
- Does the agent use tools efficiently (not redundant calls)?
- Does it handle ambiguous requests well (ask clarification vs. guess)?
- Are error messages helpful (not raw stack traces)?
- Does todo tracking feel natural and useful?

### UI/UX Polish
- Is the chat panel readable? Markdown rendering correct?
- Do tool cards collapse/expand smoothly?
- Is the terminal panel responsive and usable?
- Does the file panel tree load quickly for large repos?
- Is CodeMirror working well (syntax highlight, scroll, search)?
- Does the browser panel show screenshots clearly?
- Are loading states and spinners in the right places?
- Is the dark theme consistent across all panels?
- Does panel resizing work smoothly?
- Are keyboard shortcuts intuitive (Enter to send, Ctrl+C to cancel)?

### Integration Reliability
- Does WebSocket reconnect gracefully on network blip?
- Are there race conditions between REST and WebSocket?
- Does the UI stay in sync with server state?
- Do session status transitions display correctly?
- Does the stop/cancel button actually stop the agent?

### Performance
- How fast does a session boot (with and without snapshot)?
- Is there noticeable lag in the chat streaming?
- Does the UI feel snappy when switching panels?
- How does it handle large file reads in the file panel?
- Are there memory leaks over long sessions?

### Error Handling
- What happens when Docker isn't running?
- What happens when the LLM provider is unreachable?
- What happens when the container dies mid-task?
- What happens on malformed WebSocket messages?
- Are error messages user-friendly or cryptic?

---

## Bug Classification

When issues are found, classify them:

| Severity | Description | Action |
|----------|-------------|--------|
| **P0 — Blocker** | Feature doesn't work at all, crash, data loss | Fix immediately |
| **P1 — Major** | Feature works but with significant usability issues | Fix before shipping |
| **P2 — Minor** | Cosmetic, small UX annoyance, edge case | Fix if time permits |
| **P3 — Enhancement** | "It would be nice if..." | Add to Phase 6 backlog |

---

## How It Works

### The Loop (Tracks B & C)

```
1. Hafiz runs a real-world workflow in Forge
2. Notes what's broken, ugly, slow, confusing, or missing
3. Reports findings (bugs, UX issues, feature gaps)
4. We fix them (one at a time or in batches)
5. Hafiz re-tests
6. Repeat until satisfied
```

### What "Done" Looks Like

- [ ] **Would I use this myself?** — For real coding work, not just demos
- [ ] **Would I show this to a friend?** — Without apologizing for rough edges
- [ ] **Would I put this on GitHub?** — With a README and screenshots, expecting strangers to try it
- [ ] **Does the agent actually help?** — Not just execute tools, but make good decisions
- [ ] **Is the UI intuitive?** — Someone who's never seen it can figure it out in 2 minutes

---

## Exit Criteria

Phase 5 is complete when:

1. **Track A complete** — All 20 wiring/tuning tasks done, all P0 issues resolved
2. **Track B passed** — At least 3 greenfield workflows run successfully
3. **Track C passed** — At least 2 brownfield workflows run successfully
4. **All P0 and P1 bugs resolved** (from any track)
5. **No known crashes or data loss scenarios**
6. **The UI is visually polished** — consistent theme, no layout jank, proper loading states
7. **Agent behavior is reliable** — it generally does the right thing for common tasks with 7B
8. **Error states are handled gracefully** — no raw stack traces visible to the user
9. **Hafiz says it feels like a product** — the subjective quality bar is met

---

## What This Phase Does NOT Cover

- Multi-user authentication (Phase 6)
- Docker Compose packaging (Phase 6)
- Documentation for external users (Phase 6)
- Plugin/extension system (Phase 6)
- Performance optimization at scale (Phase 6)
- MCP integration (Phase 6)

This phase is about making the single-user experience excellent. Distribution comes after.
