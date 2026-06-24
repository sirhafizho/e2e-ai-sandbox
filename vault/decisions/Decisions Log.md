# Decisions Log

Architecture Decision Records for Forge (formerly E2E AI Sandbox).

## ADR-001: Use Docker for Sandbox Isolation

**Date:** 2026-06-08
**Status:** Accepted
**Context:** Need isolation between agent sessions. Options: Docker, VMs (Firecracker), or process-level (nsjail).
**Decision:** Docker containers. Fast startup (~1s), lightweight, sufficient isolation for dev use.
**Consequences:** No GPU passthrough without nvidia-docker. Acceptable for v1.

## ADR-002: REST + SSE/WebSocket for Agent Communication

**Date:** 2026-06-08
**Revised:** 2026-06-24 (added WebSocket alongside SSE)
**Status:** Accepted
**Context:** MCP is the emerging standard for LLM tool access. But OpenHands proves REST + event-stream works at scale. WebSocket provides bidirectional real-time communication needed for terminal and chat UI.
**Decision:** REST API for CRUD operations. WebSocket for real-time streaming (tool output, agent messages, terminal I/O). MCP support can layer on top later.
**Consequences:** Two protocols to maintain. WebSocket handles the real-time use cases SSE couldn't (bidirectional terminal I/O).

## ADR-003: BMAD Full Method for Development

**Date:** 2026-06-08
**Status:** Accepted
**Context:** Greenfield project with complex interactions. Risk of building wrong things.
**Decision:** Write behavioral specs for critical paths before implementation. Use full BMAD workflow: product brief -> PRD -> architecture -> epics -> stories -> implementation.
**Consequences:** Slower start, but catches interface mismatches early. Specs are living docs, not waterfall.

## ADR-004: Web UI over Desktop App

**Date:** 2026-06-24
**Status:** Accepted
**Context:** Originally planned Tauri or Electron for a native desktop app. After Devin analysis and landscape review, web UI better serves both use cases: running locally (localhost:3000) and self-hosted cloud (VPS access from anywhere).
**Decision:** React + Vite web application. No native desktop binary for v1. Tauri wrapper optional for v2 if native packaging is desired.
**Consequences:**
- Works on any OS without binary distribution
- Covers both local and remote/cloud hosting
- No native OS integrations (file dialogs, system tray) — acceptable tradeoff
- Simpler build/distribute pipeline

## ADR-005: TypeScript (Node.js) for Agent Server

**Date:** 2026-06-24
**Status:** Accepted
**Context:** Debated TypeScript vs Python for the agent server. Both are viable.
**Decision:** TypeScript (Node.js) for the agent server.
**Rationale:**
- Best Docker SDK (dockerode) — mature, well-typed
- Excellent streaming support (async generators, ReadableStream)
- Same language as the web UI — shared types, one toolchain
- Strong typing catches interface mismatches at compile time
- pnpm monorepo keeps everything together
**Consequences:** Python LLM ecosystem (LiteLLM, langchain) not directly usable. We'll write thin HTTP wrappers — Ollama/OpenAI/Anthropic APIs are simple REST calls.

## ADR-006: pnpm Monorepo Structure

**Date:** 2026-06-24
**Status:** Accepted
**Context:** Single repo vs multi-package?
**Decision:** pnpm workspaces monorepo with packages: server, sandbox, ui, shared.
**Rationale:**
- Shared types between server and UI
- Atomic commits across packages
- Single CI/CD pipeline
- pnpm is fast and disk-efficient
**Consequences:** All packages versioned together. Acceptable for this project size.

## ADR-007: Environment Snapshots via Docker Image Caching

**Date:** 2026-06-24
**Status:** Accepted
**Context:** Devin's snapshots are a killer feature — sessions boot from pre-built images with repos cloned and deps installed. Without snapshots, every session cold-starts (2-5 min). With snapshots, boot time is <5 seconds.
**Decision:** Implement snapshots as cached Docker images built from `environment.yaml` blueprints. SHA-256 of the yaml file is the cache key. Rebuild only when the yaml changes.
**Rationale:** Docker's built-in image/layer caching makes this straightforward. No need for custom snapshot infrastructure.
**Consequences:** Requires additional disk space for cached images. Users need to run `forge snapshot build` when they want pre-built environments. Generic sessions still work without snapshots.

## ADR-008: Knowledge System with SQLite

**Date:** 2026-06-24
**Status:** Accepted
**Context:** Devin has a persistent knowledge system (notes, playbooks, rules) that makes the agent smarter over time. Without this, every session starts blank — the agent can't learn from past interactions.
**Decision:** SQLite-based knowledge store with: knowledge notes, session history, repo maps. Rules loaded from filesystem (AGENTS.md, etc.).
**Rationale:**
- SQLite is zero-config, file-based, perfect for self-hosted
- No external database dependency
- Easy to backup (copy a file)
- Sufficient performance for this use case
**Consequences:** No multi-user concurrent writes (acceptable — single-user or low-concurrency self-hosted). Migration story is simple (SQLite is portable).

## ADR-009: Named Greeting Protocol for Anti-Hallucination

**Date:** 2026-06-24
**Status:** Accepted
**Context:** AI agents can hallucinate project state, especially in long sessions or after context switches. Named greetings and vault-first loading force the agent to ground itself in real context.
**Decision:** Every session starts with "Hello Hafiz!" and a context summary from the vault. Every session ends with "Until next time, Hafiz!" and a session log update.
**Rationale:**
- Named addressing forces identity verification
- Vault loading forces real context grounding
- Session logs create auditable history
- This pattern is used in production by Devin (todo tracking, context checkpoints)
**Consequences:** Slightly more ceremony per session. Worth it for consistency and reduced hallucination.
