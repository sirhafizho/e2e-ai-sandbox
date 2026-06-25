# Sprint Plan — Forge Phase 2

> **Generated:** 2026-06-25
> **Phase:** 2 (Persistence & Polish)
> **Goal:** Agent can clone a repo, understand it, make changes, run tests, and create a PR
> **Deliverable:** Multi-turn sessions with persistence, git workflow, environment snapshots
> **Duration:** 3 sprints (3 weeks)

---

## Sprint 4: Multi-Turn Agent & WebSocket (Week 4)

**Goal:** Agent maintains conversation history across turns, streams events over WebSocket, handles errors gracefully.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 2.1.1 — Conversation history management | Multi-Turn Loop | M | Phase 1 done |
| 2 | 2.5.1 — Full event streaming protocol (WebSocket) | WebSocket | L | 2.1.1 |
| 3 | 2.1.2 — Token budget tracking and context windowing | Multi-Turn Loop | L | 2.1.1 |
| 4 | 2.1.4 — Error recovery with escalation ladder | Multi-Turn Loop | M | 2.1.1 |

**Sprint 4 Exit Criteria:**
- [ ] User can send multiple messages in a session, agent sees full conversation history
- [ ] WebSocket streaming: all event types from spec (greeting, agent_message, tool_start, tool_complete, todo_update, etc.)
- [ ] Client can cancel running agent loop via WebSocket
- [ ] Token counting with budget thresholds (70% warn, 85% auto-summarize)
- [ ] Context windowing: old turns summarized when budget exceeded
- [ ] Retry with exponential backoff for tool failures and LLM rate limits
- [ ] Error escalation: retry → alternative approach → ask user

**Rationale:** Multi-turn is the foundation everything else builds on. WebSocket moves here because real-time streaming is essential for multi-turn UX. Token budgets prevent context overflow in long sessions. Error recovery makes the agent resilient.

**Parallelism:**
- 2.1.2 (token budgets) and 2.1.4 (error recovery) can run in parallel once 2.1.1 is done
- 2.5.1 can start alongside 2.1.2 since it primarily extends the server layer

---

## Sprint 5: Persistence & Git (Week 5)

**Goal:** Sessions persist across server restarts, git workflow tools enable real development tasks.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 2.3.1 — Session CRUD with state persistence (SQLite) | Session Persistence | L | 2.1.1 |
| 2 | 2.4.1 — Git tools (status, diff, log, commit, push, PR) | Git & Browser | L | Phase 1 tools |
| 3 | 2.1.3 — Todo tracking | Multi-Turn Loop | M | 2.1.1, 2.5.1 |
| 4 | 2.3.2 — Idle timeout and auto-cleanup | Session Persistence | S | 2.3.1 |
| 5 | 2.6.1 — Parallel dispatch for independent tool calls | Parallel Tools | M | 2.1.1 |

**Sprint 5 Exit Criteria:**
- [ ] Sessions stored in SQLite (`~/.forge/forge.db`) with create/list/resume/destroy
- [ ] `forge sessions list` and `forge sessions resume <id>` CLI commands work
- [ ] Git tools: `git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_pr`
- [ ] `gh` CLI pre-installed in container for PR creation
- [ ] TodoTracker: add/update/list, only one in_progress at a time, streamed to client
- [ ] Sessions auto-timeout after 1 hour idle, warning at 55 min
- [ ] Independent tool calls dispatched in parallel (up to 10 concurrent)

**Rationale:** Session persistence is critical for real use — you need to resume sessions. Git tools are the highest-value new capability (clone→edit→commit→PR is the core workflow). Todo tracking gives the agent visible task management. Parallel tools improves throughput.

**Parallelism:**
- 2.3.1 (SQLite persistence) and 2.4.1 (git tools) are independent — can run fully in parallel
- 2.1.3 (todos) and 2.6.1 (parallel dispatch) can also run in parallel
- 2.3.2 (idle timeout) starts after 2.3.1 is done

---

## Sprint 6: Snapshots & Browser (Week 6)

**Goal:** Environment snapshots for fast boot, browser automation tools, full E2E validation.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 2.2.1 — `environment.yaml` blueprint parser | Snapshots | M | Phase 1 Dockerfile |
| 2 | 2.2.2 — Snapshot builder (YAML → Docker image) | Snapshots | L | 2.2.1 |
| 3 | 2.2.3 — Snapshot CLI commands | Snapshots | M | 2.2.2 |
| 4 | 2.4.2 — Browser tools (Playwright/Chromium) | Git & Browser | L | Phase 1 tools |

**Sprint 6 Exit Criteria:**
- [ ] `environment.yaml` Zod schema validates blueprint format
- [ ] SHA-256 hash of YAML used as cache key for Docker images
- [ ] `forge snapshot build [path]` builds image from YAML (clone repos, install tools, run setup)
- [ ] `forge snapshot list` and `forge snapshot prune` work
- [ ] Sessions can boot from snapshot images (< 5s boot time)
- [ ] `--no-cache` flag forces rebuild
- [ ] Chromium + Playwright installed in sandbox image
- [ ] Browser tools: navigate, click, type, screenshot, evaluate, get_text
- [ ] Screenshots returned as base64 PNG (< 1MB)

**Rationale:** Snapshots are a killer feature — they turn 2-5 min cold starts into < 5s boots. Browser tools complete the tool suite. Both are self-contained and can be built in parallel.

**Parallelism:**
- 2.2.1 → 2.2.2 → 2.2.3 are sequential (each depends on the previous)
- 2.4.2 (browser tools) is independent — can run in parallel with the snapshot chain

---

## Size Estimates

| Size | Meaning | Typical Duration |
|------|---------|-----------------|
| S | Small — well-defined, < 2 hours | Half day |
| M | Medium — clear scope, some complexity | 1 day |
| L | Large — significant implementation, integration tests | 2 days |

---

## Critical Path

```
2.1.1 → 2.5.1 → 2.1.3 → (Sprint 5 complete)
  M       L        M

2.1.1 → 2.1.2 (parallel with above)
  M       L

2.3.1 → 2.3.2
  L       S

2.2.1 → 2.2.2 → 2.2.3
  M       L        M
```

**Longest chain:** 2.1.1 → 2.5.1 → 2.1.3 + 2.3.1 → 2.3.2 = ~7 working days across 15 available. Good buffer.

---

## Story Implementation Order (Recommended)

For a single developer working sequentially:

1. **2.1.1** — Conversation history management
2. **2.5.1** — WebSocket streaming protocol
3. **2.1.2** — Token budget tracking
4. **2.1.4** — Error recovery
5. **2.3.1** — Session persistence (SQLite)
6. **2.4.1** — Git tools
7. **2.1.3** — Todo tracking
8. **2.3.2** — Idle timeout
9. **2.6.1** — Parallel tool dispatch
10. **2.2.1** — environment.yaml parser
11. **2.2.2** — Snapshot builder
12. **2.2.3** — Snapshot CLI
13. **2.4.2** — Browser tools

---

## Dependencies on Phase 1

All Phase 2 stories assume Phase 1 is complete:
- Container manager, tool registry, LLM provider, agent loop, Hono server, CLI all working
- 35 tests passing
- Docker image building (Ubuntu 24.04, Python 3.12, Node.js 22)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WebSocket complexity with Hono v2 built-in WS | Medium | Medium | Prototype early in Sprint 4; `@hono/node-server` v2 docs are clear |
| Token counting accuracy for Ollama models | Medium | Low | Use approximate counting (chars/4) for local models, exact for cloud |
| SQLite concurrency in multi-session scenario | Low | Medium | Single-writer is fine for self-hosted; WAL mode for read concurrency |
| Chromium adds significant image size | High | Low | Accept larger image (~1.5GB); offer slim image variant without browser |
| Snapshot build time for large repos | Medium | Medium | Stream progress; add `--no-cache` and incremental caching |
| gh CLI authentication in containers | Medium | High | Token injection via env vars; test early in Sprint 5 |

---

## Phase 2 Exit Criteria (All Sprints Complete)

- [ ] Multi-turn conversations with context windowing
- [ ] Full WebSocket streaming (all event types from spec)
- [ ] Sessions persist in SQLite, can be resumed
- [ ] Git workflow: clone → edit → commit → push → create PR
- [ ] Environment snapshots: < 5s boot from pre-built images
- [ ] Browser automation: navigate, screenshot, interact
- [ ] Parallel tool dispatch for independent calls
- [ ] Todo tracking visible to user
- [ ] Error recovery with escalation
- [ ] All new features have tests
