# Devin Harness Engineering vs E2E AI Sandbox — Gap Analysis & Overhaul Plan

> **Date:** 2026-06-24
> **Purpose:** Compare what Devin actually builds (from `devin_harness_engineering.md`) against what `e2e-ai-sandbox` planned, identify gaps, assess the landscape, and produce a concrete plan for building a self-hostable "Mini Devin" that anyone can run with local LLMs.

---

## Part 1: Gap Analysis — What Devin Does vs What We Planned

### 1.1 Architecture

| Aspect | Devin (Cloud) | e2e-ai-sandbox (Planned) | Gap |
|--------|--------------|--------------------------|-----|
| **Brain/Agent** | Proprietary LLM in Cognition's cloud, with custom model improvements | Provider-agnostic wrapper (Claude/GPT/Ollama) | We planned the right abstraction. Devin's "Brain" is their moat — we can't replicate proprietary model tuning, but we can offer model choice. **No critical gap.** |
| **Workspace** | Full isolated VM (Ubuntu) per session — shell, browser, IDE, filesystem | Docker container per session — shell, browser, filesystem | Devin uses VMs; we chose Docker. Docker is the right call for self-hosted — faster, lighter, sufficient isolation. **Intentional divergence, not a gap.** |
| **Control plane** | Separate cloud control plane connecting Brain ↔ VM | Agent Server (REST + SSE) connecting LLM ↔ Docker | Architecturally equivalent. We're simpler (no multi-tenant cloud), which is correct for self-hosted. **No gap.** |
| **Desktop UI** | Web app with real-time terminal, browser, code editor tabs | Desktop app (Tauri/Electron) with terminal, browser viewport | Different delivery (web vs native). Both valid. **Minor divergence.** |

### 1.2 Session Lifecycle

| Aspect | Devin | e2e-ai-sandbox | Gap |
|--------|-------|----------------|-----|
| **Snapshots** | Pre-built, frozen VM images. Sessions boot from clean snapshot copy. Repos pre-cloned, deps pre-installed. | No snapshot concept. Container spawned fresh from base image. | **MAJOR GAP.** Snapshots are a killer feature — they eliminate the 2-5 minute "clone repo + install deps" cold start. We need a snapshot/image-caching layer. |
| **Blueprints** | Declarative YAML configs (enterprise → org → repo layers). Define how snapshots are built. | No equivalent. Base image is static. | **MAJOR GAP.** Blueprints let users/teams declare their environment. Without this, every session starts generic. We need at minimum a repo-level `environment.yaml`. |
| **Session boot flow** | Snapshot → VM boots → Brain receives task + context → autonomous loop | API call → Docker container spawns → LLM gets tools → loop | Functionally equivalent once you add snapshots. **Gap is in the snapshot layer, not the boot flow itself.** |
| **Session resume** | Sessions are long-lived, can disconnect/reconnect | Planned but not designed in detail | **MINOR GAP.** Need session state persistence (save container state, reconnect SSE stream). |

### 1.3 Tooling Harness

| Tool Category | Devin | e2e-ai-sandbox | Gap |
|--------------|-------|----------------|-----|
| **File ops** | read, write, edit, MultiEdit, grep | file_read, file_write, file_edit (no MultiEdit, no grep tool) | **MINOR GAP.** Add MultiEdit (batch edits) and a dedicated grep/ripgrep tool. |
| **Shell** | Persistent sessions, multiple shell IDs, background processes, interactive I/O (stdin) | Shell execution with streaming output. No multi-session, no stdin. | **MODERATE GAP.** Need: multiple concurrent shells, background process management, stdin writing to running processes. |
| **Browser** | Full Chrome via CDP, Playwright scripting, real-time desktop view, session persistence | Playwright-based browser tool (navigate, click, type, screenshot, evaluate) | Spec is close. **MINOR GAP** — add cookie/auth persistence and consider a live browser viewport (VNC/screenshot stream). |
| **Git/SCM** | Dedicated tools: create_pr, view_pr, update_pr, pr_checks, ci_job_logs, take_over_pr, fetch_pr_template | Generic git tool with operations: clone, status, diff, commit, push | **MAJOR GAP.** Devin has rich, purpose-built PR/CI tools. Our generic `git` tool is too coarse. Need dedicated PR lifecycle tools and CI monitoring. |
| **Code search** | grep, BM25 tool search, DeepWiki (auto-generated docs), Ask Devin (codebase Q&A) | No code search tools beyond what's in the shell | **MAJOR GAP.** Need at minimum: ripgrep tool, and ideally a semantic code search / repo-map capability (like Aider's tree-sitter maps). |
| **Web search** | Not explicitly documented (browser covers it) | Not planned | **MINOR GAP.** Add a web_search tool for documentation lookup. |

### 1.4 Agentic Loop

| Aspect | Devin | e2e-ai-sandbox | Gap |
|--------|-------|----------------|-----|
| **Loop structure** | Plan → Select tools → Execute (parallel when independent) → Observe → Repeat | Implied but not formally specified | **MODERATE GAP.** Need to formally define the agent loop, especially parallel tool execution and retry/escalation logic. |
| **Context management** | Auto-summarization and checkpointing for long tasks | Not planned | **MAJOR GAP.** Without context management, long tasks will hit token limits and fail. Need checkpoint/summarize mechanism. |
| **Todo tracking** | Built-in task list visible to user | Not planned | **MODERATE GAP.** Easy to add, high UX value. |
| **Error recovery** | Persistent — retries, troubleshoots, only escalates after exhausting options | Not specified | **MODERATE GAP.** Need retry policies, error classification, and escalation rules. |

### 1.5 Knowledge System

| Aspect | Devin | e2e-ai-sandbox | Gap |
|--------|-------|----------------|-----|
| **Knowledge notes** | Persistent contextual notes (user-authored + auto-generated), injected when relevant | Not planned | **MAJOR GAP.** This is how Devin "remembers" across sessions. Critical for quality. |
| **Playbooks** | Reusable procedures for common tasks, treated as strict checklists | Not planned | **MODERATE GAP.** Nice-to-have for v2. |
| **Rules** | Repo/project-specific guidance injected as context | Not planned (but our CLAUDE.md/AGENTS.md serves this role manually) | **MINOR GAP.** Formalize rules injection — read AGENTS.md, .devin/rules, etc. and inject into system prompt. |

### 1.6 Orchestration & Parallelism

| Aspect | Devin | e2e-ai-sandbox | Gap |
|--------|-------|----------------|-----|
| **Child sessions** | Coordinator Devin spawns child VMs for parallel work | Not planned | **MAJOR GAP for v2.** Not needed for MVP, but essential for scaling. |
| **Automations** | Event-driven triggers (GitHub issue labeled → session starts) | Not planned | **v2+ feature.** |
| **Schedules** | Recurring sessions (nightly deps update, etc.) | Not planned | **v2+ feature.** |

### 1.7 Security

| Aspect | Devin | e2e-ai-sandbox | Gap |
|--------|-------|----------------|-----|
| **Session isolation** | VM-level isolation, no cross-session leakage | Docker container isolation, no host filesystem access | **Equivalent for self-hosted use.** Docker is sufficient. |
| **Secrets management** | Scoped secrets (org/user/repo), injected as env vars, redacted in logs | Not planned | **MODERATE GAP.** Need: secrets config, env var injection, log redaction. |
| **Auth** | SSO, SCIM, git auth proxy | Open question in specs (API key? JWT? Local-only?) | **MINOR for self-hosted.** Local-only is fine for v1. Add API key auth for remote access. |

---

## Part 2: Landscape Assessment — Build vs Extend

### 2.1 Key Competitors Analyzed

| Project | Has Sandbox | Local LLM | Maturity | Gap to "Mini Devin" |
|---------|------------|-----------|----------|---------------------|
| **OpenHands** | Docker | Ollama (buggy timeouts) | Very High (78K stars) | Closest, but heavy + Ollama bugs |
| **mini-SWE-agent** | Docker/Podman/etc | Full (LiteLLM) | High (5K stars, used by Meta) | Minimal agent, no UI, no browser |
| **Agent Zero** | Docker + desktop | Via OpenRouter | Medium-High (18K stars) | Close, but opinionated + heavy |
| **Handler.dev** | Docker + Firecracker | Any agent | Medium | Infrastructure only, no agent |
| **Daytona** | Full isolation | Via SDK | Very High (72K stars) | Infrastructure only, AGPL license |
| **Kotakpasir** | Hardened Docker | MCP/HTTP | Low-Medium | Sandbox only, no agent |

### 2.2 The Real Question

**None of these projects are a clean, modular, self-hostable "Mini Devin" that:**
1. Gives you the full loop (agent + sandbox + tools + UI)
2. Works great with local LLMs out of the box
3. Is simple enough to understand and extend
4. Has proper environment snapshots/blueprints
5. Has the knowledge/memory system for cross-session continuity

- **OpenHands** is closest but is becoming a platform (heavy, complex, known Ollama bugs)
- **mini-SWE-agent** is the right philosophy (minimal, extensible) but is just the agent — no sandbox management, no UI, no browser tool
- **Agent Zero** has the Docker sandbox but is opinionated about its multi-agent model

### 2.3 Recommendation: Overhaul the Existing Project

**Don't start a new project. Overhaul `e2e-ai-sandbox` with a new, sharper scope.**

Reasons:
1. The research, ADRs, and specs are solid foundations — they just need to be deepened based on the Devin analysis
2. The Docker + REST/SSE + Playwright decisions are validated by the landscape
3. What's missing is well-defined: snapshots, knowledge system, richer tools, agent loop formalization
4. Starting fresh would re-do 2 weeks of analysis work for no benefit
5. The existing BMAD framework gives us a structured path to implementation

**Rename/rebrand consideration:** The scope should shift from "E2E AI Sandbox" (sounds like a testing tool) to something that communicates "self-hostable autonomous coding agent." Working title: **"Forge"** or **"Workshop"** — but naming can wait.

---

## Part 3: The Overhaul Plan — Building "Mini Devin"

### 3.1 Product Vision (Revised)

> A self-hostable, open-source autonomous coding agent that gives any LLM (cloud or local) a complete development environment — shell, filesystem, browser, git — inside Docker containers, with environment snapshots, a knowledge system, and a clean web UI. Anyone with Docker and Ollama can run their own Devin-like agent on their PC. Anyone with a VPS can host it as a cloud agent for their team.

### 3.2 Core Design Principles

1. **Local-first, cloud-optional** — runs on a laptop with Ollama, scales to a VPS with API keys
2. **Modular layers** — agent loop, tool harness, sandbox runtime, and UI are separable
3. **Model-agnostic** — any OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp, OpenRouter, direct APIs)
4. **Snapshot-driven** — environments pre-build once, sessions boot instantly
5. **Knowledge-persistent** — the agent remembers across sessions via a knowledge store
6. **Simple to extend** — adding a tool is adding a function + a JSON schema

### 3.3 Architecture (Revised)

```
┌─────────────────────────────────────────────────────────┐
│                    Web UI (React)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Chat     │ │ Terminal  │ │ Browser  │ │ File Tree  │ │
│  │ Panel    │ │ (xterm)   │ │ Viewport │ │ + Editor   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket + REST
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Agent Server (TypeScript/Node)              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Agent Loop (plan → tools → observe → repeat)    │   │
│  │  ├─ Context Manager (summarize, checkpoint)      │   │
│  │  ├─ Todo Tracker                                 │   │
│  │  └─ Error Recovery (retry, escalate)             │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ LLM Provider │ │ Tool Registry│ │ Knowledge Store│  │
│  │ (unified)    │ │ + Dispatch   │ │ (notes, rules) │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ Session Mgr  │ │ Snapshot Mgr │ │ Secrets Vault  │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ Docker API + exec + stdio
                         ▼
┌─────────────────────────────────────────────────────────┐
│           Docker Sandbox (per-session container)         │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Bash   │ │ Git      │ │ Chromium │ │ Runtimes    │ │
│  │ Shell  │ │ (pre-    │ │ (Play-   │ │ (Python,    │ │
│  │ (multi)│ │  authed) │ │  wright) │ │  Node, Go)  │ │
│  └────────┘ └──────────┘ └──────────┘ └─────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ /workspace (mounted volume — repo + user files)    │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.4 Component Breakdown

#### Layer 1: Sandbox Runtime
**What:** Docker container lifecycle + environment snapshots
**Inspired by:** Devin's Snapshots + Blueprints, SWE-ReX's backend abstraction

| Component | Description | Priority |
|-----------|-------------|----------|
| Container Manager | Spawn, health-check, teardown Docker containers | P0 |
| Base Image | Ubuntu + Python + Node + Git + Playwright + ripgrep | P0 |
| Workspace Volumes | Mount `/workspace` per session, optional persistence | P0 |
| Snapshot Builder | Build & cache Docker images from `environment.yaml` (repo-level blueprints) | P0 |
| Resource Limits | CPU, memory, disk, network constraints | P1 |
| Security Hardening | No Docker socket, no privileged, outbound-only network, cap-drop | P1 |

**Blueprint format (draft `environment.yaml`):**
```yaml
name: my-project
base: forge-sandbox:latest  # or custom Dockerfile
setup:
  - git clone https://github.com/user/repo /workspace/repo
  - cd /workspace/repo && npm install
  - pip install -r requirements.txt
tools:
  - rust  # additional toolchains to install
  - go
env:
  NODE_ENV: development
resources:
  cpu: 2
  memory: 4GB
  disk: 10GB
```

#### Layer 2: Tool Harness
**What:** The tools the LLM can invoke inside the sandbox
**Inspired by:** Devin's tool harness, but with a plugin-friendly design

**Core tools (P0):**

| Tool | Input | Output | Notes |
|------|-------|--------|-------|
| `shell_exec` | command, timeout, cwd, shell_id | stdout, stderr, exit_code | Multiple concurrent shells, background support, stdin writing |
| `file_read` | path, offset, limit | content, total_lines, truncated | Supports images (base64) |
| `file_write` | path, content, create_dirs | path, bytes_written | |
| `file_edit` | path, old_text, new_text, replace_all | path, replacements | Exact string replacement |
| `file_multi_edit` | path, edits[] | path, total_replacements | Batch edits in one call |
| `grep` | pattern, path, glob, max_results | matches[] | ripgrep-based |
| `find_files` | pattern, path | files[] | Glob-based file discovery |
| `git_status` | — | status | |
| `git_diff` | ref?, staged? | diff | |
| `git_commit` | message, files? | sha | |
| `git_create_pr` | title, body, base?, head? | pr_url, pr_number | Via `gh` CLI or API |
| `git_pr_status` | pr_number | checks[], review_status | CI monitoring |
| `browser_navigate` | url | title, screenshot? | |
| `browser_click` | selector | success | |
| `browser_type` | selector, text | success | |
| `browser_screenshot` | — | base64_image | |
| `browser_evaluate` | js_expression | result | |
| `web_search` | query | results[] | For doc lookup |

**Tool schema format:**
```typescript
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: JSONSchema;
  output_schema: JSONSchema;
  capabilities: ('streaming' | 'background' | 'interactive')[];
  timeout_default_ms: number;
  timeout_max_ms: number;
  execute: (input: any, session: Session) => AsyncGenerator<ToolEvent>;
}
```

**Adding a custom tool:**
```typescript
// tools/my-custom-tool.ts
export const myTool: ToolDefinition = {
  name: 'my_tool',
  description: 'Does something custom',
  input_schema: { type: 'object', properties: { ... }, required: [...] },
  output_schema: { ... },
  capabilities: [],
  timeout_default_ms: 30000,
  timeout_max_ms: 300000,
  async *execute(input, session) {
    const result = await session.exec(`some-command ${input.arg}`);
    yield { type: 'tool_complete', data: result };
  }
};
```

#### Layer 3: Agent Loop
**What:** The orchestration that turns an LLM + tools into an autonomous agent
**Inspired by:** Devin's plan-act-observe loop, but transparent and configurable

```
┌─────────────────────────────────────────────┐
│              Agent Loop                      │
│                                              │
│  1. Receive task (user message)              │
│  2. Inject context:                          │
│     - System prompt + tool definitions       │
│     - Knowledge notes (relevant)             │
│     - Rules (from repo config files)         │
│     - Session history (summarized)           │
│  3. LLM generates response:                 │
│     - Text (shown to user)                   │
│     - Tool calls (executed in sandbox)       │
│  4. Execute tool calls:                      │
│     - Parallel when independent              │
│     - Stream output via WebSocket            │
│  5. Feed results back to LLM                 │
│  6. Repeat until:                            │
│     - LLM says "done"                        │
│     - User intervenes                        │
│     - Token budget exhausted                 │
│     - Max iterations reached                 │
│  7. Context management:                      │
│     - Auto-summarize after N turns           │
│     - Checkpoint before context overflow     │
│     - Preserve tool outputs, discard verbose │
└─────────────────────────────────────────────┘
```

**Key features:**
- **Parallel tool execution:** Batch independent calls (e.g., read 3 files at once)
- **Context windowing:** Summarize old turns to stay within token budget
- **Error recovery:** Retry failed tools (up to 3x), try alternative approaches, escalate to user as last resort
- **Todo tracking:** Maintain a visible task list for multi-step work
- **Streaming:** All LLM output and tool output streams to the UI in real-time

#### Layer 4: LLM Provider
**What:** Unified interface to any LLM
**Inspired by:** LiteLLM's approach, but TypeScript-native

```typescript
interface LLMProvider {
  chat(messages: Message[], tools: ToolDef[], options: ChatOptions): AsyncGenerator<ChatEvent>;
  countTokens(messages: Message[]): number;
  maxContextTokens: number;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
}

// Implementations:
// - OllamaProvider (local, http://localhost:11434)
// - OpenAIProvider (GPT-4o, o1, etc.)
// - AnthropicProvider (Claude)
// - OpenAICompatibleProvider (vLLM, LM Studio, OpenRouter, any compatible endpoint)
```

**For models without tool-calling support:**
- Fall back to "bash-only" mode (like mini-SWE-agent)
- Wrap all tools as bash commands the model can call
- Parse structured output from model responses

#### Layer 5: Knowledge System
**What:** Persistent memory that makes the agent smarter over time
**Inspired by:** Devin's knowledge notes + rules

| Component | Description | Storage |
|-----------|-------------|---------|
| **Knowledge Notes** | User-authored or auto-generated context ("always run lint before committing", "this project uses Prisma for ORM") | SQLite |
| **Rules** | Repo-specific guidance, auto-loaded from `AGENTS.md`, `.devin/rules/`, etc. | Filesystem |
| **Session History** | Compressed logs of past sessions — what was done, decisions made, errors hit | SQLite |
| **Repo Map** | Auto-generated codebase overview (tree-sitter symbol extraction, like Aider) | Cache |

**Knowledge injection flow:**
1. On session start: load all notes tagged for this repo
2. Match notes by relevance (keyword/embedding match against current task)
3. Inject top-K relevant notes into system prompt
4. After session: auto-suggest new notes based on patterns observed

#### Layer 6: Web UI
**What:** Browser-based interface for interacting with the agent
**Decision: Web UI over desktop app (Tauri/Electron)**

Rationale:
- Web UI works for both local use (localhost:3000) and self-hosted cloud (VPS)
- No native binary to distribute
- Simpler to build and iterate
- Users on any OS can access it
- Can still wrap in Tauri later if native app is desired

| Panel | Description |
|-------|-------------|
| **Chat** | Conversation with the agent, markdown rendering, todo list display |
| **Terminal** | xterm.js connected to sandbox shell(s) via WebSocket |
| **Browser** | Live screenshot stream or VNC of sandbox Chromium |
| **Files** | File tree + code editor (Monaco) for the workspace |
| **Settings** | LLM provider config, Docker config, secrets, knowledge notes |

### 3.5 Technology Decisions (Revised)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Agent server** | TypeScript (Node.js) | Best Docker SDK (dockerode), great for streaming (async generators), same language as UI, strong typing |
| **Web framework** | Fastify or Hono | Lightweight, fast, WebSocket support, modern |
| **UI framework** | React + Vite | Widely known, fast dev cycle, rich component ecosystem |
| **Terminal** | xterm.js | Industry standard for web terminals |
| **Code editor** | Monaco | VS Code's editor, rich features |
| **Database** | SQLite (via better-sqlite3 or drizzle) | Zero-config, file-based, perfect for self-hosted |
| **Docker SDK** | dockerode | Mature Node.js Docker client |
| **LLM SDK** | Custom thin wrappers over fetch | Avoid heavy deps; Ollama/OpenAI/Anthropic APIs are simple HTTP |
| **Browser automation** | Playwright (inside container) | Industry standard, CDP support |
| **Package structure** | Monorepo (pnpm workspaces) | Shared types, single repo, atomic commits |
| **Desktop app** | Web-first, Tauri wrapper later (v2) | Web works everywhere; Tauri is optional native packaging |

### 3.6 Phased Implementation Plan

#### Phase 1: Foundation (Weeks 1-3)
**Goal:** A working sandbox you can talk to via CLI

- [ ] **Monorepo scaffold** — `packages/server`, `packages/sandbox`, `packages/shared`
- [ ] **Docker base image** — Dockerfile with Ubuntu + Python + Node + Git + ripgrep + Playwright
- [ ] **Container manager** — create, health-check, exec, teardown
- [ ] **Core tools** — shell_exec, file_read, file_write, file_edit, grep, find_files
- [ ] **Tool registry** — schema validation, dispatch, streaming
- [ ] **LLM provider** — Ollama + OpenAI-compatible provider
- [ ] **Agent loop (basic)** — single-turn: user message → LLM → tool calls → results → LLM → response
- [ ] **CLI interface** — `forge chat` command to interact with the agent
- [ ] **Health check** — `forge doctor` to verify Docker, Ollama, etc.

**Deliverable:** `forge chat "set up a Node.js project with Express and write a hello world server"` works end-to-end.

#### Phase 2: Persistence & Polish (Weeks 4-6)
**Goal:** Multi-turn conversations, snapshots, git tools

- [ ] **Multi-turn agent loop** — conversation history, context windowing
- [ ] **Snapshot builder** — `environment.yaml` → cached Docker image
- [ ] **Session management** — create, list, resume, destroy sessions
- [ ] **Git tools** — git_status, git_diff, git_commit, git_create_pr
- [ ] **Browser tools** — navigate, click, type, screenshot, evaluate
- [ ] **Todo tracking** — visible task list in agent output
- [ ] **Error recovery** — retry logic, alternative approach attempts
- [ ] **Streaming** — all tool output streams in real-time via SSE/WebSocket

**Deliverable:** Agent can clone a repo, understand it, make changes, run tests, and create a PR.

#### Phase 3: Web UI (Weeks 7-9)
**Goal:** Full web interface

- [ ] **Chat panel** — markdown rendering, streaming responses
- [ ] **Terminal panel** — xterm.js connected to sandbox shell
- [ ] **File tree** — browse workspace files, open in Monaco editor
- [ ] **Browser panel** — screenshot stream from sandbox Chromium
- [ ] **Session list** — create, resume, delete sessions
- [ ] **Settings page** — LLM config, Docker config
- [ ] **WebSocket layer** — real-time updates for all panels

**Deliverable:** Open localhost:3000, start a session, watch the agent work in real-time.

#### Phase 4: Knowledge & Intelligence (Weeks 10-12)
**Goal:** Agent gets smarter over time

- [ ] **Knowledge notes** — CRUD API, auto-injection into context
- [ ] **Rules loading** — auto-read AGENTS.md, .devin/rules/, CLAUDE.md from repos
- [ ] **Session history** — compressed logs, searchable
- [ ] **Repo map** — tree-sitter symbol extraction for codebase understanding
- [ ] **Context management** — auto-summarize, checkpoint, token budget tracking
- [ ] **Secrets management** — env var config, injection, log redaction
- [ ] **CI monitoring** — poll GitHub Actions / GitLab CI status

**Deliverable:** Agent remembers preferences, understands codebases deeply, handles long tasks without context overflow.

#### Phase 5: Scale & Distribution (Weeks 13-16)
**Goal:** Ready for others to use

- [ ] **Docker Compose** — one-command setup (`docker compose up`)
- [ ] **Documentation** — README, quickstart, architecture guide
- [ ] **Multi-session** — run multiple agent sessions in parallel
- [ ] **Auth** — API key auth for remote access
- [ ] **Child agents** — coordinator can spawn sub-agents for parallel work
- [ ] **Playbooks** — reusable task templates
- [ ] **Plugin system** — drop-in custom tools
- [ ] **Tauri wrapper** — optional native desktop app
- [ ] **OpenAPI spec** — for programmatic access

**Deliverable:** Anyone can `docker compose up`, point it at their Ollama instance, and have a working autonomous coding agent.

---

## Part 4: What NOT to Build

It's equally important to scope out what we intentionally skip:

| Feature | Devin Has It | We Skip It | Why |
|---------|-------------|------------|-----|
| Enterprise SSO (Okta, SAML) | Yes | Yes | Self-hosted doesn't need enterprise auth for v1 |
| Multi-tenant cloud deployment | Yes | Yes | We're not a SaaS |
| SCIM provisioning | Yes | Yes | Enterprise feature |
| ACU billing/metering | Yes | Yes | No billing model |
| Slack/Jira/Linear integrations | Yes | v2+ | Focus on core agent first |
| DeepWiki (auto-generated docs) | Yes | Use repo-map instead | Simpler, achieves 80% of the value |
| Custom model tuning | Yes (proprietary) | Yes | Can't replicate, model-agnostic is our answer |
| VPN/PrivateLink | Yes | Yes | Self-hosted means it's already on your network |

---

## Part 5: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Local LLMs too weak for autonomous coding | Medium | High | Support cloud APIs too; recommend minimum 27B models; fall back to "assisted" mode where agent suggests but doesn't execute |
| Docker startup too slow | Low | Medium | Snapshot/image caching; container pre-warming pool |
| Context window overflow on long tasks | High | High | Context summarization + checkpointing (this is P0) |
| Browser tool is complex and fragile | Medium | Medium | Start with screenshot-based, add interactive later |
| Scope creep | High | High | Strict phased plan; ship Phase 1 before designing Phase 3 |
| Competition ships faster (OpenHands, etc.) | Medium | Medium | Differentiate on simplicity and local-first. Nobody owns "simple self-hosted Devin" yet. |

---

## Part 6: Recommendation Summary

### Do This:
1. **Overhaul `e2e-ai-sandbox`**, don't start fresh — the research and specs are valuable
2. **Shift to web UI** instead of Tauri/Electron — covers local + cloud use
3. **Add snapshots/blueprints** — this is the biggest gap vs Devin
4. **Build a knowledge system** — cross-session memory is what separates a toy from a tool
5. **TypeScript monorepo** — server + UI in one repo, shared types
6. **Phase 1 target: CLI agent that works** — prove the loop before building UI
7. **Use BMAD** to formalize: product brief → PRD → architecture → epics → stories → implementation

### Don't Do This:
- Don't try to match Devin feature-for-feature — they have 100+ engineers
- Don't build enterprise features (SSO, multi-tenant, billing) — stay self-hosted
- Don't build a desktop app first — web UI is more flexible
- Don't assume local LLMs will be as good as Claude/GPT — support both, recommend cloud for complex tasks
- Don't skip the knowledge system — it's what makes session 10 better than session 1

### Next BMAD Steps:
1. Run `/bmad-product-brief` with this analysis as input — formalize the revised vision
2. Run `/bmad-prd` — create PRD covering Phase 1-3
3. Run `/bmad-create-architecture` — lock in the tech decisions
4. Run `/bmad-create-epics-and-stories` — break Phase 1 into implementable stories
5. Start building

---

*This analysis was produced by comparing `devin_harness_engineering.md` (Devin Cloud architecture), the existing `e2e-ai-sandbox` specs, and a landscape review of 13 open-source agent sandbox projects.*
