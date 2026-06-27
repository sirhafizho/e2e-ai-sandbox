# TODO — Forge Phased Implementation Plan

> Revised 2026-06-24 — overhauled from spec-first breakdown to full phased plan.
> See `docs/devin-vs-sandbox-analysis.md` for rationale behind this plan.

## Phase 1: Foundation (Weeks 1-3)
**Goal:** A working sandbox you can talk to via CLI

### Monorepo Setup
- [ ] Initialize pnpm workspace with packages: server, sandbox, ui, shared
- [ ] Configure TypeScript (strict mode), ESLint, Prettier
- [ ] Set up shared types package (@forge/shared)

### Docker Sandbox
- [ ] Create Dockerfile: Ubuntu 22.04 + Python 3.12 + Node 22 + Git + ripgrep + Playwright
- [ ] Container manager: create, health-check, exec, teardown (via dockerode)
- [ ] Workspace volume mounting (/workspace)
- [ ] Resource limits (CPU, memory, disk)
- [ ] Security hardening (cap-drop, no-new-privileges, read-only rootfs)

### Core Tools
- [ ] shell_exec — execute commands with streaming output, multiple shell IDs
- [ ] file_read — read files (including images as base64)
- [ ] file_write — write/create files
- [ ] file_edit — find/replace edits
- [ ] grep — ripgrep-based code search
- [ ] find_files — glob-based file discovery

### Tool Registry
- [ ] Tool schema format (name, description, input/output JSON schema)
- [ ] Schema validation on invocation
- [ ] Dispatch to correct handler (docker exec, etc.)
- [ ] Streaming output via events

### LLM Provider
- [ ] Unified LLM interface (chat, countTokens, streaming)
- [ ] Ollama provider (http://localhost:11434)
- [ ] OpenAI-compatible provider (covers vLLM, LM Studio, OpenRouter)

### Agent Loop (Basic)
- [ ] Single-turn: user message -> LLM -> tool calls -> results -> LLM -> response
- [ ] Tool call parsing and execution
- [ ] Result formatting and injection back to LLM

### CLI Interface
- [ ] `forge chat` — interactive conversation with the agent
- [ ] `forge doctor` — verify Docker, Ollama, and system requirements

**Phase 1 Deliverable:** `forge chat "set up a Node.js project and write a hello world server"` works end-to-end.

---

## Phase 2: Persistence & Polish (Weeks 4-6)
**Goal:** Multi-turn conversations, snapshots, git tools

### Multi-Turn Agent Loop
- [ ] Conversation history management
- [ ] Context windowing (auto-summarize after N turns)
- [ ] Token budget tracking (warn at 70%, act at 85%)

### Environment Snapshots
- [ ] `environment.yaml` blueprint format
- [ ] Snapshot builder (yaml -> Docker image)
- [ ] SHA-256 cache keying (rebuild only on change)
- [ ] `forge snapshot build` / `list` / `prune` CLI commands

### Session Management
- [ ] Create, list, resume, destroy sessions
- [ ] Session state persistence (container ID, history, model)
- [ ] Auto-timeout for idle sessions

### Git Tools
- [ ] git_status, git_diff, git_log
- [ ] git_commit (with message)
- [ ] git_push
- [ ] git_create_pr (via gh CLI)
- [ ] git_pr_status (check CI)

### Browser Tools
- [ ] browser_navigate, browser_click, browser_type
- [ ] browser_screenshot (base64 PNG)
- [ ] browser_evaluate (run JavaScript)
- [ ] Playwright CDP connection to container Chromium

### Agent Loop Enhancements
- [ ] Todo tracking (visible task list)
- [ ] Error recovery (retry, alternative approach, escalate)
- [ ] Parallel tool execution (batch independent calls)

### Streaming
- [ ] WebSocket server for real-time output
- [ ] Events: agent_message, tool_start, tool_output, tool_complete, tool_error, todo_update

**Phase 2 Deliverable:** Agent can clone a repo, understand it, make changes, run tests, and create a PR.

---

## Phase 3: Web UI (Weeks 7-9)
**Goal:** Full web interface

### Chat Panel
- [ ] Streaming markdown rendering
- [ ] User input for messages
- [ ] Tool invocation cards (collapsible)
- [ ] Todo list display
- [ ] Stop/cancel button

### Terminal Panel
- [ ] xterm.js integration
- [ ] WebSocket-backed PTY to sandbox shell
- [ ] Multi-tab support (one per shell_id)
- [ ] User can type directly

### File Panel
- [ ] File tree of /workspace
- [ ] Monaco editor for viewing files
- [ ] Search within files
- [ ] User edits saved back to sandbox

### Browser Panel
- [ ] Screenshot stream (every 2s during browser tool use)
- [ ] URL bar showing current page
- [ ] noVNC interactive view (v2)

### Session Management UI
- [ ] Session list: create, resume, delete
- [ ] Session cards with status, model, duration

### Settings Page
- [ ] LLM provider configuration
- [ ] Docker configuration
- [ ] API key management

**Phase 3 Deliverable:** Open localhost:3000, start a session, watch the agent work in real-time.

---

## Phase 4: Knowledge & Intelligence (Weeks 10-12)
**Goal:** Agent gets smarter over time

### Knowledge Notes
- [ ] SQLite schema and CRUD API
- [ ] Auto-injection into context (relevance scoring)
- [ ] Auto-suggestion after sessions
- [ ] User management UI in settings

### Rules Loading
- [ ] Auto-read AGENTS.md, .devin/rules/, CLAUDE.md, .cursorrules
- [ ] Inject into system prompt per-repo
- [ ] Precedence ordering (repo > global)

### Session History
- [ ] Compressed session logs in SQLite
- [ ] Searchable past sessions
- [ ] "Last time in this repo" context injection

### Repo Map
- [ ] Tree-sitter symbol extraction (files, classes, functions)
- [ ] Cached and auto-refreshed
- [ ] Injected as condensed codebase overview

### Context Management (Advanced)
- [ ] Auto-summarization at token thresholds
- [ ] Checkpointing with resume capability
- [ ] Selective retention (keep system prompt + recent turns, summarize rest)

### Secrets Management
- [ ] Env var configuration per repo
- [ ] Injection into containers
- [ ] Redaction in logs and output

### CI Monitoring
- [ ] Poll GitHub Actions status
- [ ] Surface failed check logs

**Phase 4 Deliverable:** Agent remembers preferences, understands codebases deeply, handles long tasks.

---

## Phase 5: Manual Testing & Refinement (Weeks 13-15)
**Goal:** Battle-test Forge through real-world usage until it feels like a Mini Devin SWE product

### Track A: Wire & Tune (do first)
Audit found 27 issues (5 P0, 9 P1, 9 P2, 4 P3). Entire Phase 4 knowledge system is dead code.

#### Sprint A1: Critical Wiring (P0)
- [ ] Wire knowledge injection into agent loop (KnowledgeInjector.inject() never called)
- [ ] Wire repo map generation on session creation (RepoMapGenerator never instantiated)
- [ ] Emit todo_update events from agent loop (UI todo list is empty)
- [ ] Wire browser screenshots to UI (browser panel is dead)
- [ ] Accept repo_url in session creation (can't clone repos)

#### Sprint A2: Agent Loop Completeness (P0-P1)
- [ ] Wire checkpoint creation at 95% token budget
- [ ] Wire forced summarization at 85% threshold
- [ ] Wire selective retention for smart output truncation
- [ ] Wire idle monitor (sessions never timeout)
- [ ] Wire checkpoint restore on session resume

#### Sprint A3: 7B Model Tuning
- [ ] Tune effective context window (8-16K vs 128K theoretical)
- [ ] Optimize system prompt for small models
- [ ] Compress tool output more aggressively
- [ ] Limit tool definitions per turn (phase-based)
- [ ] Add micro-step hints after tool results

#### Sprint A4: UI Feature Completion (P1-P2)
- [ ] Add file write REST endpoint + enable editor
- [ ] Wire terminal multi-tab support
- [ ] Fix session list missing fields
- [ ] Wire note suggester on session end
- [ ] Wire secrets injection into containers

### Track B: Greenfield Testing (blank workspace)
- [ ] Build something from scratch (multi-step task)
- [ ] Refactor a module (precise edits, linting)
- [ ] Web scraping task (browser tools)
- [ ] Long running session (20+ turns, summarization)

### Track C: Brownfield Testing (existing repos)
- [ ] Fix a bug in an existing repo (clone, explore, edit, commit)
- [ ] Understand a codebase (exploration, synthesis)
- [ ] Add a feature to an existing project

### Exit Criteria
- [ ] Track A complete — all 20 wiring tasks done
- [ ] Track B passed — 3+ greenfield workflows successful
- [ ] Track C passed — 2+ brownfield workflows successful
- [ ] All P0 and P1 bugs resolved
- [ ] No known crashes or data loss
- [ ] Hafiz says it feels like a product

**Phase 5 Deliverable:** A polished, reliable single-user experience that feels like a real SWE product.

See: `_bmad-output/planning-artifacts/phase5-manual-testing-plan.md` for full plan.
See: `_bmad-output/planning-artifacts/phase5-audit-findings.md` for detailed audit findings.

---

## Phase 6: Scale & Distribution (Weeks 16-19)
**Goal:** Ready for others to use

### Docker Compose
- [ ] One-command setup: `docker compose up`
- [ ] Includes: agent server, UI, Ollama (optional)

### Documentation
- [ ] README with quickstart
- [ ] Architecture guide
- [ ] Tool authoring guide
- [ ] environment.yaml reference

### Multi-Session
- [ ] Multiple concurrent agent sessions
- [ ] Global session limit (configurable)

### Authentication
- [ ] API key auth for remote access
- [ ] X-API-Key header or query param

### Child Agents (v2)
- [ ] Coordinator can spawn sub-agent sessions
- [ ] Parallel task execution across containers

### Playbooks (v2)
- [ ] Reusable task templates
- [ ] Attach to sessions

### Plugin System
- [ ] Drop-in custom tool files
- [ ] Auto-discovery and registration

### Tauri Wrapper (v2)
- [ ] Optional native desktop app packaging

### OpenAPI Spec
- [ ] Auto-generated from route definitions
- [ ] Enables programmatic access

**Phase 6 Deliverable:** Anyone can `docker compose up`, point at Ollama, and have a working autonomous coding agent.

---

## BMAD Next Steps

Before implementation, complete BMAD planning:
1. [ ] Run `/bmad-product-brief` — formalize the Forge product vision
2. [ ] Run `/bmad-prd` — create full PRD from the brief
3. [ ] Run `/bmad-ux` — design the web UI experience
4. [ ] Run `/bmad-create-architecture` — lock in tech decisions formally
5. [ ] Run `/bmad-create-epics-and-stories` — break Phase 1 into implementable stories
6. [ ] Run `/bmad-check-implementation-readiness` — verify everything is ready
7. [ ] Run `/bmad-sprint-planning` — generate the first sprint
