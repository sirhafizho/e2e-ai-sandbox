# Sprint Plan — Forge Phase 1

> **Generated:** 2026-06-25
> **Phase:** 1 (Foundation)
> **Goal:** A working sandbox you can talk to via CLI
> **Deliverable:** `forge chat "set up a Node.js project and write a hello world server"` works end-to-end
> **Duration:** 3 sprints (3 weeks)

---

## Sprint 1: Foundation (Week 1)

**Goal:** Monorepo scaffolded, Docker image building, shared types defined.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 1.1.1 — Initialize pnpm monorepo workspace | Monorepo Setup | S | — |
| 2 | 1.1.2 — Configure TypeScript, ESLint, Prettier | Monorepo Setup | S | 1.1.1 |
| 3 | 1.1.3 — Create shared types package (@forge/shared) | Monorepo Setup | M | 1.1.2 |
| 4 | 1.2.1 — Create Forge base Docker image | Docker Sandbox | M | 1.1.1 |

**Sprint 1 Exit Criteria:**
- [ ] `pnpm install && pnpm typecheck && pnpm lint` all pass
- [ ] `docker build -t forge-sandbox:base packages/sandbox` succeeds
- [ ] `@forge/shared` exports all core types and is importable by `@forge/server`
- [ ] Container starts and `bash`, `python3`, `node`, `git`, `rg` all respond

**Parallelism:** Stories 1.1.3 and 1.2.1 can run in parallel (both depend on 1.1.1/1.1.2 but not on each other).

---

## Sprint 2: Core Engine (Week 2)

**Goal:** Container manager working, tools implemented and dispatching correctly.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 1.2.2 — Container manager (create, health-check, exec, teardown) | Docker Sandbox | L | 1.2.1, 1.1.3 |
| 2 | 1.2.3 — Workspace volume mounting | Docker Sandbox | S | 1.2.2 |
| 3 | 1.3.1 — Tool registry (schema, validation, dispatch) | Tool Registry | M | 1.1.3 |
| 4 | 1.3.2 — shell_exec tool | Tool Registry | M | 1.3.1, 1.2.2 |
| 5 | 1.3.3 — File tools (file_read, file_write, file_edit) | Tool Registry | M | 1.3.1, 1.2.2 |
| 6 | 1.3.4 — Search tools (grep, find_files) | Tool Registry | S | 1.3.1, 1.2.2 |

**Sprint 2 Exit Criteria:**
- [ ] Container manager can create/destroy containers with health checks
- [ ] Tool registry validates inputs and dispatches to handlers
- [ ] `shell_exec` runs commands in containers and returns output
- [ ] File tools can read/write/edit files in `/workspace`
- [ ] Search tools find files and grep patterns in container
- [ ] All tools have integration tests passing

**Parallelism:**
- 1.3.1 (tool registry) can start while 1.2.2 (container manager) is being built — it only needs containers for integration tests
- 1.3.2, 1.3.3, 1.3.4 can all run in parallel once 1.3.1 and 1.2.2 are done

---

## Sprint 3: Agent & CLI (Week 3)

**Goal:** Full agent loop working, CLI usable, end-to-end smoke test passes.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 1.4.1 — LLM provider (Vercel AI SDK + Ollama) | LLM Provider | M | 1.1.3, 1.3.1 |
| 2 | 1.5.1 — Single-turn agent loop | Agent Loop | L | 1.4.1, 1.3.2, 1.3.3 |
| 3 | 1.5.2 — Hono server (REST + WebSocket) | Agent Loop | L | 1.5.1, 1.2.2 |
| 4 | 1.6.1 — `forge chat` command | CLI | M | 1.5.2 |
| 5 | 1.6.2 — `forge doctor` command | CLI | S | 1.5.2 |
| 6 | 1.7.1 — End-to-end smoke test | Integration | M | All above |

**Sprint 3 Exit Criteria:**
- [ ] LLM provider connects to Ollama and streams responses
- [ ] Agent loop: user message → LLM → tool calls → results → response
- [ ] Hono server exposes REST + WebSocket endpoints
- [ ] `forge doctor` checks Docker, Ollama, model availability
- [ ] `forge chat "create a Node.js hello world server"` works end-to-end
- [ ] All output streams to terminal in real-time

**Parallelism:**
- 1.4.1 (LLM provider) and 1.6.2 (forge doctor) can start early — LLM provider only needs shared types
- 1.6.1 and 1.6.2 can run in parallel (both depend on 1.5.2)

---

## Size Estimates

| Size | Meaning | Typical Duration |
|------|---------|-----------------|
| S | Small — well-defined, < 2 hours | Half day |
| M | Medium — clear scope, some complexity | 1 day |
| L | Large — significant implementation, integration tests | 2 days |

---

## Critical Path

The longest dependency chain determines the minimum time:

```
1.1.1 → 1.1.2 → 1.1.3 → 1.3.1 → 1.3.2 → 1.5.1 → 1.5.2 → 1.6.1 → 1.7.1
  S       S        M       M        M        L        L        M        M
```

**Critical path length:** ~9 working days across 15 working days (3 weeks). This leaves buffer for integration issues and testing.

---

## Story Implementation Order (Recommended)

For a single developer working sequentially, this is the optimal order:

1. **1.1.1** — Initialize monorepo
2. **1.1.2** — TypeScript/ESLint/Prettier config
3. **1.1.3** — Shared types package
4. **1.2.1** — Docker base image (can overlap with 1.1.3)
5. **1.2.2** — Container manager
6. **1.2.3** — Workspace volumes
7. **1.3.1** — Tool registry
8. **1.3.2** — shell_exec tool
9. **1.3.3** — File tools
10. **1.3.4** — Search tools
11. **1.4.1** — LLM provider
12. **1.5.1** — Agent loop
13. **1.5.2** — Hono server
14. **1.6.1** — forge chat CLI
15. **1.6.2** — forge doctor CLI
16. **1.7.1** — End-to-end smoke test

---

## Prerequisites Before Sprint 1

- [ ] Docker installed and running
- [ ] Ollama installed (`brew install ollama`)
- [ ] Ollama model pulled (`ollama pull qwen2.5-coder:7b`)
- [ ] Node.js 22+ installed
- [ ] pnpm installed (`npm install -g pnpm`)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Ollama tool-calling support inconsistent with smaller models | Medium | High | Test early in Sprint 3; fall back to prompt-based tool calling |
| Docker exec streaming complexity | Low | Medium | dockerode has good streaming docs; prototype in Sprint 2 |
| Vercel AI SDK Ollama compatibility | Low | Medium | Test in Sprint 3 Story 1.4.1 before building agent loop |
| Security hardening breaks tool execution | Medium | Low | Start permissive in dev, harden iteratively |
