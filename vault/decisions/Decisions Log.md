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

## ADR-010: Hono over Fastify for Web Framework

**Date:** 2026-06-25
**Status:** Accepted
**Context:** ADR-005 left the web framework as "Fastify or Hono." After dependency analysis, Hono is the better fit.
**Decision:** Hono for the agent server web framework.
**Rationale:**
- 14KB vs Fastify's 50KB+
- Native WebSocket support via `@hono/node-ws`
- Edge-compatible (Cloudflare Workers, Deno, Bun) — future-proofs deployment options
- Growing ecosystem (22K stars), middleware for CORS, JWT, etc.
**Consequences:** Less middleware ecosystem than Fastify, but sufficient for our needs. If we outgrow Hono, migration to Fastify is straightforward (similar API patterns).

## ADR-011: CodeMirror 6 over Monaco for Editor Component

**Date:** 2026-06-25
**Status:** Accepted
**Context:** Original choice was Monaco (VS Code's editor). After dependency analysis, CodeMirror 6 is more appropriate.
**Decision:** CodeMirror 6 via `@uiw/react-codemirror` for the file viewer/editor panel.
**Rationale:**
- 5-10x smaller bundle (100KB vs 1-5MB)
- Modular, tree-shakeable — only load what we need
- We're building a file viewer with light editing, not a full IDE
- Monaco is overkill for our use case
**Consequences:** No IntelliSense or advanced IDE features. Acceptable — the agent does the coding, the UI is for viewing/reviewing.

## ADR-012: Vercel AI SDK for LLM Provider Layer

**Date:** 2026-06-25
**Status:** Accepted
**Context:** Originally planned "custom thin HTTP wrappers" for LLM integration. Vercel AI SDK provides everything we need out of the box.
**Decision:** Use Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`).
**Rationale:**
- Unified `streamText()` call across all providers
- Built-in multi-step tool loop (`maxSteps` parameter)
- Streaming-first (30ms p99 latency)
- Zod-native tool definitions — no manual JSON Schema conversion
- 2.8M weekly downloads, actively maintained
- 34-60KB per provider (vs LangChain at 101KB+)
**Consequences:** Dependency on Vercel's SDK. Risk is low — it's Apache 2.0 licensed and widely adopted. If abandoned, the provider adapters are thin enough to replace.

## ADR-013: Qwen 2.5 Coder 7B as Default Local LLM

**Date:** 2026-06-25
**Status:** Accepted
**Context:** Forge targets self-hosted users running local LLMs. Need a default model recommendation for development and testing that works well on consumer hardware (M3 Mac, 16GB RAM).
**Decision:** Default local model: `qwen2.5-coder:7b` via Ollama. Fallback: `llama3.1:8b`.
**Rationale:**
- ~4.7GB RAM at Q4_K_M quantization — comfortable headroom on 16GB
- ~40 tok/s on M3 — usable for interactive coding
- Purpose-built for code generation (trained on code corpora)
- Strong tool-calling/function-calling support
- Available via `ollama pull qwen2.5-coder:7b`
**Consequences:** Smaller model = lower quality than cloud models. Acceptable for development and self-hosted use. Users can always configure larger models or cloud providers.

## ADR-014: External AI Tool Integration Strategy (Three-Tier)

**Date:** 2026-06-25
**Status:** Proposed (future epic, post-Phase 1)
**Context:** Forge should work not only as a standalone agent but also as a **sandbox backend for external AI tools** (Copilot, Claude Code, Cursor, etc.). Key use case: user works with company-provided AI tools during the day, then Forge + local LLM picks up remaining tasks (bug fixes, small features) overnight at home — a "night shift agent" pattern.
**Decision:** Three-tier integration strategy, each building on the last:

1. **Tier 1 — Remote Dev Environment (v1):** SSH server in sandbox containers. Users connect via VS Code Remote, JetBrains Gateway, or SSH. External AI tools run inside the container transparently. Zero integration effort — just needs a working sshd in the Docker image.

2. **Tier 2 — MCP Server Interface (v1.5/v2):** Forge exposes an MCP server that advertises sandbox tools (`run_command`, `read_file`, `write_file`, `browse_url`, `create_snapshot`). External AI tools that support MCP (Claude Code, Cursor, etc.) can discover and use Forge's sandbox for execution. Thin adapter over the existing REST/WebSocket tool API.

3. **Tier 3 — Agent Task Delegation (v2+):** External tools delegate entire tasks to Forge's agent loop. Forge spins up a container, clones the repo, runs its own agent with a local or cloud LLM, and reports results. Full autonomy mode.

**Rationale:**
- Tier 1 requires almost no new code — SSH is standard in dev containers
- Tier 2 leverages MCP (already noted as deferred in ADR-002) and builds directly on our existing tool execution API
- Tier 3 is the core product itself — by the time we reach v2, the agent loop already exists
- Each tier is independently useful and increases Forge's value as an integration layer
**Consequences:**
- Tier 1: Must include sshd and basic dev tooling in the base Docker image (already planned)
- Tier 2: Need to implement an MCP server package — estimate 1 new epic with 3-4 stories
- Tier 3: Requires a task queue / delegation API — larger effort but builds on completed agent loop
- This positions Forge uniquely in the market: not just another coding agent, but a **sandbox-as-a-service for any AI tool**
