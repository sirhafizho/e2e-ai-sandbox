# Epics & Stories — Forge

> **Generated:** 2026-06-25
> **Source specs:** agent-server-api, docker-sandbox, tool-registry, agent-loop, knowledge-system, web-ui
> **Dependency map:** docs/open-source-dependencies.md
> **Phase guide:** TODO.md

---

## Open Questions Resolved

| Question | Decision | Notes |
|----------|----------|-------|
| Fastify vs Hono | **Hono** | 14KB, native WebSocket, edge-compatible |
| Project name | **Forge** | Confirmed |
| Default LLM for dev | **Qwen 2.5 Coder 7B** via Ollama | Best coding model for M3 16GB (~4.7GB RAM, ~40 tok/s) |
| Fallback LLM | **Llama 3.1 8B** via Ollama | General-purpose alternative |
| Editor component | **CodeMirror 6** (not Monaco) | 5-10x smaller bundle |
| MCP support | **Deferred to v2** | REST + WebSocket first |

---

## Phase 1: Foundation

**Goal:** A working sandbox you can talk to via CLI
**Deliverable:** `forge chat "set up a Node.js project and write a hello world server"` works end-to-end.
**Estimated time:** Weeks 1-3

---

### Epic 1.1: Monorepo & Tooling Setup

Set up the pnpm monorepo, TypeScript configuration, linting, and shared types package. This is the foundation everything else builds on.

#### Story 1.1.1: Initialize pnpm monorepo workspace

**Description:** Create the pnpm workspace with four packages: `server`, `sandbox`, `ui`, `shared`.

**Acceptance Criteria:**
- [ ] `pnpm-workspace.yaml` defines packages: `packages/*`
- [ ] Root `package.json` with workspace scripts (`build`, `dev`, `lint`, `typecheck`)
- [ ] `packages/server/package.json` exists with name `@forge/server`
- [ ] `packages/sandbox/package.json` exists with name `@forge/sandbox`
- [ ] `packages/ui/package.json` exists with name `@forge/ui`
- [ ] `packages/shared/package.json` exists with name `@forge/shared`
- [ ] `pnpm install` succeeds from root
- [ ] `.gitignore` covers `node_modules/`, `dist/`, `.env`

**Dependencies:** None (first story)

---

#### Story 1.1.2: Configure TypeScript, ESLint, and Prettier

**Description:** Set up shared TypeScript config (strict mode), ESLint with TypeScript rules, and Prettier for consistent formatting.

**Acceptance Criteria:**
- [ ] Root `tsconfig.base.json` with strict mode, ES2022 target, composite projects
- [ ] Each package has `tsconfig.json` extending the base
- [ ] ESLint configured with `@typescript-eslint` rules
- [ ] Prettier configured (single config at root)
- [ ] `pnpm lint` runs ESLint across all packages
- [ ] `pnpm typecheck` runs `tsc --noEmit` across all packages
- [ ] `pnpm format` runs Prettier
- [ ] All commands pass on empty packages

**Dependencies:** Story 1.1.1

---

#### Story 1.1.3: Create shared types package (@forge/shared)

**Description:** Define the core shared types that server, sandbox, and UI will all use. These are the contracts between packages.

**Acceptance Criteria:**
- [ ] `@forge/shared` exports TypeScript types for:
  - `Session` (id, status, model, repo, created_at, updated_at)
  - `SessionStatus` enum: `created | booting | ready | running | paused | terminated`
  - `ToolDefinition` (name, description, input_schema, output_schema, category, capabilities)
  - `ToolCategory` enum: `shell | file | git | browser | search | custom`
  - `ToolResult` (call_id, tool_name, output, is_error, duration_ms)
  - `WebSocketEvent` discriminated union (agent_message, tool_start, tool_output, tool_complete, tool_error, session_status)
  - `AgentMessage` (content, role, streaming)
  - `LLMProviderConfig` (type, base_url, api_key, model)
- [ ] Types use Zod schemas where validation is needed (tool inputs)
- [ ] Package builds successfully and is importable by `@forge/server`
- [ ] `pnpm typecheck` passes

**Dependencies:** Story 1.1.2

---

### Epic 1.2: Docker Sandbox Foundation

Build the Docker base image and container manager. This gives the agent an isolated environment to execute code in.

#### Story 1.2.1: Create the Forge base Docker image

**Description:** Build a Dockerfile for the sandbox container with all required runtimes and tools pre-installed.

**Acceptance Criteria:**
- [ ] Dockerfile at `packages/sandbox/Dockerfile`
- [ ] Base: Ubuntu 22.04 (slim)
- [ ] Includes: Python 3.12+, Node.js 22+, Git, curl, wget, jq, ripgrep, fd, tree
- [ ] Includes: pip, npm/pnpm
- [ ] Non-root user `forge` (UID 1000) created
- [ ] `/workspace` directory created, owned by `forge`
- [ ] `docker build -t forge-sandbox:base .` succeeds
- [ ] Container starts and `bash`, `python3`, `node`, `git`, `rg` all respond
- [ ] Image size < 1.5GB (stretch goal: < 1GB)

**Note:** Chromium/Playwright deferred to Phase 2 to keep base image lean.

**Dependencies:** Story 1.1.1

---

#### Story 1.2.2: Container manager — create, health-check, exec, teardown

**Description:** Implement the container lifecycle manager using dockerode. This is the core interface between the agent server and Docker.

**Acceptance Criteria:**
- [ ] `ContainerManager` class in `@forge/server` with methods:
  - `create(options: CreateOptions): Promise<ContainerInfo>` — creates and starts a container
  - `healthCheck(containerId: string): Promise<HealthResult>` — verifies bash, git, node, python
  - `exec(containerId: string, command: string, options?: ExecOptions): Promise<ExecResult>` — runs a command
  - `execStream(containerId: string, command: string): AsyncGenerator<string>` — streams output
  - `destroy(containerId: string): Promise<void>` — stops and removes container
  - `getStatus(containerId: string): Promise<ContainerStatus>` — returns current state
- [ ] `CreateOptions` includes: image, workspace volume path, resource limits
- [ ] Resource limits enforced: CPU (default 2 cores), memory (default 4GB), PID limit (256)
- [ ] Security hardening: cap-drop ALL, no-new-privileges, read-only rootfs with writable `/workspace` and `/tmp`
- [ ] Health check runs within 30s timeout
- [ ] All methods have proper error handling (container not found, Docker not running, etc.)
- [ ] Unit tests with Docker (integration tests)

**Dependencies:** Story 1.2.1, Story 1.1.3

---

#### Story 1.2.3: Workspace volume mounting

**Description:** Set up volume mounting so the container's `/workspace` directory is accessible and persistent during a session.

**Acceptance Criteria:**
- [ ] Container manager creates a Docker volume per session
- [ ] Volume mounted at `/workspace` inside container
- [ ] Files written inside container at `/workspace/` are accessible via the volume
- [ ] Volume cleaned up on container destroy (default behavior)
- [ ] `.forge/` metadata directory created inside `/workspace/` on container start
- [ ] Volume name follows pattern: `forge-workspace-{session_id}`

**Dependencies:** Story 1.2.2

---

### Epic 1.3: Core Tool Registry & Tools

Build the tool registry (schema validation, dispatch) and implement the Phase 1 tools: shell and file operations.

#### Story 1.3.1: Tool registry — schema format, validation, and dispatch

**Description:** Create the tool registry that defines tool schemas, validates inputs, and dispatches tool calls to handlers.

**Acceptance Criteria:**
- [ ] `ToolRegistry` class with methods:
  - `register(tool: ToolDefinition, handler: ToolHandler): void`
  - `list(): ToolDefinition[]`
  - `get(name: string): ToolDefinition | undefined`
  - `execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult>`
- [ ] `ToolHandler` type: `(input: ValidatedInput, context: ToolContext) => Promise<ToolResult> | AsyncGenerator<ToolOutput>`
- [ ] `ToolContext` includes: `containerId`, `sessionId`, `containerManager`
- [ ] Input validated against Zod schema before handler invocation
- [ ] Validation errors return `TOOL_VALIDATION` error type (never reach handler)
- [ ] Unknown tool names return `TOOL_NOT_FOUND` error
- [ ] Timeout enforcement: default 120s, configurable per-tool
- [ ] Tool definitions exported in OpenAI function-calling format for LLM consumption
- [ ] Unit tests for validation, dispatch, and error handling

**Dependencies:** Story 1.1.3

---

#### Story 1.3.2: shell_exec tool

**Description:** Implement the `shell_exec` tool that executes shell commands inside the sandbox container.

**Acceptance Criteria:**
- [ ] Tool registered as `shell_exec` with Zod schema:
  - Input: `{ command: string, shell_id?: string, timeout_ms?: number }`
  - Output: `{ stdout: string, stderr: string, exit_code: number }`
- [ ] Executes command via `containerManager.exec()`
- [ ] Streams output via `containerManager.execStream()` when streaming enabled
- [ ] Supports multiple shell IDs (default: "default")
- [ ] Output trimming: truncate stdout > 200 lines (keep first 100 + last 100 + count)
- [ ] stderr always fully captured (up to 200 lines)
- [ ] Timeout defaults to 120s, respects `timeout_ms` parameter
- [ ] Returns structured result with stdout, stderr, exit_code
- [ ] Integration test: run `echo hello` and `ls /workspace` in container

**Dependencies:** Story 1.3.1, Story 1.2.2

---

#### Story 1.3.3: File tools — file_read, file_write, file_edit

**Description:** Implement the core file manipulation tools.

**Acceptance Criteria:**
- [ ] `file_read` tool:
  - Input: `{ path: string, offset?: number, limit?: number }`
  - Output: `{ content: string, total_lines: number }`
  - Reads files from container's `/workspace`
  - Large file trimming: > 500 lines → first 100 + last 100 + line count
  - Path traversal prevention: reject paths outside `/workspace`
- [ ] `file_write` tool:
  - Input: `{ path: string, content: string }`
  - Output: `{ path: string, bytes_written: number }`
  - Creates parent directories if needed
  - Overwrites existing files
- [ ] `file_edit` tool:
  - Input: `{ path: string, old_string: string, new_string: string, replace_all?: boolean }`
  - Output: `{ path: string, replacements: number }`
  - Fails if `old_string` not found (or not unique when `replace_all` is false)
- [ ] All tools enforce `/workspace` path boundary
- [ ] Integration tests for each tool

**Dependencies:** Story 1.3.1, Story 1.2.2

---

#### Story 1.3.4: Search tools — grep, find_files

**Description:** Implement code search and file discovery tools using ripgrep and glob patterns.

**Acceptance Criteria:**
- [ ] `grep` tool:
  - Input: `{ pattern: string, path?: string, glob?: string, case_insensitive?: boolean, max_results?: number }`
  - Output: `{ matches: Array<{ file: string, line: number, content: string }>, total_matches: number }`
  - Uses `rg` (ripgrep) inside the container
  - Default max results: 100
  - Supports regex patterns
- [ ] `find_files` tool:
  - Input: `{ pattern: string, path?: string }`
  - Output: `{ files: string[], total: number }`
  - Uses `find` or `fd` inside the container
  - Supports glob patterns
  - Default max results: 100
- [ ] Both tools scoped to `/workspace`
- [ ] Integration tests

**Dependencies:** Story 1.3.1, Story 1.2.2

---

### Epic 1.4: LLM Provider Integration

Build the unified LLM provider layer using Vercel AI SDK with Ollama support.

#### Story 1.4.1: Unified LLM provider interface with Vercel AI SDK

**Description:** Set up the Vercel AI SDK with provider adapters for Ollama and OpenAI-compatible endpoints.

**Acceptance Criteria:**
- [ ] `LLMProvider` module in `@forge/server` that wraps Vercel AI SDK
- [ ] `createProvider(config: LLMProviderConfig): LanguageModel` factory function
- [ ] Ollama provider via `@ai-sdk/openai-compatible` pointing at `http://localhost:11434/v1`
- [ ] OpenAI-compatible provider for vLLM, LM Studio, OpenRouter
- [ ] OpenAI direct provider via `@ai-sdk/openai`
- [ ] Anthropic direct provider via `@ai-sdk/anthropic`
- [ ] `chat(model, messages, tools): AsyncGenerator<StreamEvent>` — streaming chat
- [ ] Tool definitions converted from Zod schemas to AI SDK format
- [ ] Tested with Ollama running `qwen2.5-coder:7b` locally
- [ ] Graceful error handling: model not found, Ollama not running, rate limit, etc.

**Dependencies:** Story 1.1.3, Story 1.3.1

---

### Epic 1.5: Basic Agent Loop

Wire everything together: user message → LLM → tool calls → execution → response.

#### Story 1.5.1: Single-turn agent loop

**Description:** Implement the core agent loop that takes a user message, sends it to the LLM with tool definitions, executes any tool calls, and returns the final response.

**Acceptance Criteria:**
- [ ] `AgentLoop` class with method:
  - `run(userMessage: string, sessionContext: SessionContext): AsyncGenerator<AgentEvent>`
- [ ] Constructs system prompt with:
  - Agent identity and capabilities
  - Available tool definitions (from ToolRegistry)
  - Session context (repo info, workspace state)
- [ ] Sends user message + system prompt to LLM via `LLMProvider.chat()`
- [ ] Parses tool calls from LLM response
- [ ] Dispatches tool calls to `ToolRegistry.execute()`
- [ ] Feeds tool results back to LLM for final response
- [ ] Supports multi-step tool use (LLM calls tools, sees results, calls more tools — up to `maxSteps` iterations)
- [ ] Uses Vercel AI SDK's `maxSteps` parameter for automatic multi-step
- [ ] Streams all events: `agent_message`, `tool_start`, `tool_output`, `tool_complete`
- [ ] Max iterations: 25 (configurable, prevents infinite loops)
- [ ] Integration test: ask agent to create a file and verify it exists

**Dependencies:** Story 1.4.1, Story 1.3.2, Story 1.3.3, Story 1.2.2

---

#### Story 1.5.2: Agent server — Hono HTTP + WebSocket

**Description:** Create the Hono web server with REST endpoints and WebSocket support for the agent.

**Acceptance Criteria:**
- [ ] Hono app at `packages/server/src/index.ts`
- [ ] REST endpoints:
  - `POST /api/sessions` — create session (spawns container, returns session ID)
  - `GET /api/sessions` — list sessions
  - `GET /api/sessions/:id` — get session details
  - `DELETE /api/sessions/:id` — destroy session (tears down container)
  - `GET /api/tools` — list available tools and schemas
  - `GET /api/health` — server health (Docker connected, Ollama reachable)
- [ ] WebSocket endpoint:
  - `ws://host/ws/sessions/:id` — bidirectional agent communication
  - Accepts `user_message` events from client
  - Streams `agent_message`, `tool_start`, `tool_output`, `tool_complete`, `tool_error`, `session_status` to client
  - Heartbeat: ping every 30s
- [ ] Session lifecycle: create → container boots → health check → ready → accept messages
- [ ] Error handling with consistent error envelope: `{ error: { code, message, details? } }`
- [ ] Server starts on port 3001 (configurable via `PORT` env var)
- [ ] `pnpm dev` starts the server with hot reload (tsx or similar)

**Dependencies:** Story 1.5.1, Story 1.2.2

---

### Epic 1.6: CLI Interface

The user-facing CLI that makes Forge usable from the terminal.

#### Story 1.6.1: `forge chat` command

**Description:** Interactive CLI command that connects to the agent server and enables conversation.

**Acceptance Criteria:**
- [ ] CLI entry point using Commander.js (or similar)
- [ ] `forge chat [initial-message]` command:
  - Creates a new session via `POST /api/sessions`
  - Connects to WebSocket `ws://localhost:3001/ws/sessions/:id`
  - If `initial-message` provided, sends it immediately
  - Otherwise enters interactive prompt (readline)
  - Streams agent responses to terminal with markdown formatting
  - Shows tool executions with status indicators (spinner → checkmark/cross)
  - User can type follow-up messages
  - Ctrl+C sends cancel, second Ctrl+C exits
  - On exit, destroys session
- [ ] `--model` flag to specify LLM model (default: `qwen2.5-coder:7b`)
- [ ] `--provider` flag to specify provider (default: `ollama`)
- [ ] Output is readable in terminal (proper line wrapping, colors for tool status)

**Dependencies:** Story 1.5.2

---

#### Story 1.6.2: `forge doctor` command

**Description:** Diagnostic command to verify all system requirements are met.

**Acceptance Criteria:**
- [ ] `forge doctor` checks and reports:
  - Docker: installed, running, version
  - Docker image: `forge-sandbox:base` exists (if not, shows build command)
  - Ollama: reachable at `http://localhost:11434`, version
  - Ollama model: `qwen2.5-coder:7b` available (if not, shows pull command)
  - Node.js: version ≥ 22
  - pnpm: installed
  - Available disk space
  - Available RAM
- [ ] Each check shows: checkmark (pass), cross (fail), or warning
- [ ] Actionable fix suggestions for each failure
- [ ] Exit code 0 if all required checks pass, 1 if any required check fails

**Dependencies:** Story 1.5.2

---

### Epic 1.7: End-to-End Integration & Smoke Test

Verify the Phase 1 deliverable works.

#### Story 1.7.1: End-to-end smoke test

**Description:** Verify the full Phase 1 flow works: `forge chat "set up a Node.js project and write a hello world server"`

**Acceptance Criteria:**
- [ ] Running `forge doctor` passes all checks
- [ ] Running `forge chat "create a Node.js project with Express that serves hello world on port 8080"`:
  1. Session creates successfully
  2. Container boots and passes health check
  3. Agent calls `shell_exec` to run `npm init -y`
  4. Agent calls `shell_exec` to install Express
  5. Agent calls `file_write` to create `server.js`
  6. Agent calls `shell_exec` to run the server (background)
  7. Agent responds with a summary of what it did
  8. All steps stream to the terminal in real-time
- [ ] Files actually exist in the container's `/workspace`
- [ ] Server actually runs (verifiable via `curl` in another shell_exec)
- [ ] Session can be destroyed cleanly

**Dependencies:** All Phase 1 stories

---

## Phase 2: Persistence & Polish

**Goal:** Multi-turn conversations, snapshots, git tools
**Deliverable:** Agent can clone a repo, understand it, make changes, run tests, and create a PR.
**Estimated time:** Weeks 4-6

---

### Epic 2.1: Multi-Turn Agent Loop & Context Management

#### Story 2.1.1: Conversation history management

**Acceptance Criteria:**
- [ ] Agent loop maintains conversation history across turns
- [ ] History stored in memory per session (not persisted to DB yet)
- [ ] User can send multiple messages in a session
- [ ] Agent sees all prior messages + tool results when generating responses

---

#### Story 2.1.2: Token budget tracking and context windowing

**Acceptance Criteria:**
- [ ] Token counting via `js-tiktoken` (OpenAI models) and `@anthropic-ai/tokenizer` (Claude)
- [ ] Ollama models use approximate counting (chars / 4 as fallback)
- [ ] Budget thresholds: 70% warning, 85% force-summarize, 95% checkpoint
- [ ] At 85%: auto-summarize all turns except last 3 using the LLM itself
- [ ] Summary replaces original turns in context
- [ ] Tool outputs trimmed per spec (shell: last 100 lines, file: first 100 + last 100)

---

#### Story 2.1.3: Todo tracking

**Acceptance Criteria:**
- [ ] `TodoTracker` class: `add()`, `update()`, `list()`, `toContext()`
- [ ] Agent can create/update todos via tool calls or system instructions
- [ ] Only one item `in_progress` at a time
- [ ] Todo state streamed to client via `todo_update` WebSocket events
- [ ] Todo list injected into LLM context on every turn

---

#### Story 2.1.4: Error recovery with escalation ladder

**Acceptance Criteria:**
- [ ] Retry with exponential backoff (tool timeout: 3x, command fail: 2x, LLM rate limit: 5x)
- [ ] On retry exhaustion: attempt alternative approach
- [ ] On alternative failure: ask user for clarification
- [ ] Permission denied errors never retry
- [ ] Errors formatted clearly for LLM to understand and adapt

---

### Epic 2.2: Environment Snapshots

#### Story 2.2.1: `environment.yaml` blueprint parser

**Acceptance Criteria:**
- [ ] Zod schema for `environment.yaml` format
- [ ] Fields: `name`, `base`, `repos[]`, `setup[]`, `tools[]`, `env{}`, `health_check[]`, `resources{}`
- [ ] Validates YAML and returns typed config or errors
- [ ] SHA-256 hash of YAML content for cache keying

---

#### Story 2.2.2: Snapshot builder — YAML to Docker image

**Acceptance Criteria:**
- [ ] Builds Docker image from `environment.yaml`: clone repos → install tools → run setup → health check → commit
- [ ] Image tagged as `forge-snapshot:{name}-{hash[:12]}`
- [ ] Skips rebuild if image with matching hash exists
- [ ] `--no-cache` flag to force rebuild
- [ ] Build progress streamed to CLI

---

#### Story 2.2.3: Snapshot CLI commands

**Acceptance Criteria:**
- [ ] `forge snapshot build [path]` — build snapshot from YAML
- [ ] `forge snapshot list` — list all snapshots with name, hash, size, created
- [ ] `forge snapshot prune` — remove unused/old snapshots
- [ ] `forge snapshot inspect <name>` — show snapshot details

---

### Epic 2.3: Session Persistence

#### Story 2.3.1: Session CRUD with state persistence

**Acceptance Criteria:**
- [ ] Sessions stored in SQLite (`~/.forge/forge.db`)
- [ ] Create, list, get, resume, destroy operations
- [ ] Session state persisted: container ID, history summary, model, repo, status, timestamps
- [ ] `forge sessions list` CLI command
- [ ] `forge sessions resume <id>` CLI command

---

#### Story 2.3.2: Idle timeout and auto-cleanup

**Acceptance Criteria:**
- [ ] Sessions auto-timeout after 1 hour idle (configurable)
- [ ] Warning event at 55 minutes via WebSocket
- [ ] Container paused on timeout, destroyed after 24 hours
- [ ] Background cleanup loop in server

---

### Epic 2.4: Git & Browser Tools

#### Story 2.4.1: Git tools

**Acceptance Criteria:**
- [ ] Tools: `git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_pr`, `git_pr_status`
- [ ] All execute via `simple-git` inside the container (or `shell_exec` + `git` CLI)
- [ ] `git_create_pr` uses `gh` CLI (pre-installed in container)
- [ ] `git_pr_status` checks CI via `gh` CLI
- [ ] Credential injection via session env vars (GitHub token)

---

#### Story 2.4.2: Browser tools

**Acceptance Criteria:**
- [ ] Tools: `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_evaluate`, `browser_get_text`
- [ ] Chromium + Playwright installed in sandbox image (updated Dockerfile)
- [ ] Playwright controlled via CDP from server
- [ ] `browser_screenshot` returns base64 PNG
- [ ] Screenshots < 1MB (resize/compress if needed)

---

### Epic 2.5: WebSocket Streaming Enhancements

#### Story 2.5.1: Full event streaming protocol

**Acceptance Criteria:**
- [ ] All events from spec implemented: `greeting`, `agent_message`, `tool_start`, `tool_output`, `tool_complete`, `tool_error`, `todo_update`, `session_status`, `idle_warning`, `error`
- [ ] Client-to-server: `user_message`, `cancel`, `terminal_input`
- [ ] `cancel` stops current agent loop iteration
- [ ] Terminal I/O bidirectional via WebSocket

---

### Epic 2.6: Parallel Tool Execution

#### Story 2.6.1: Parallel dispatch for independent tool calls

**Acceptance Criteria:**
- [ ] When LLM returns multiple tool calls, classify as independent or dependent
- [ ] Independent calls dispatched in parallel (up to 10 concurrent)
- [ ] Results aggregated and reordered before returning to LLM
- [ ] Dependent calls run sequentially
- [ ] Configurable max parallel (`maxParallelToolCalls`, default 10)

---

## Phase 3: Web UI

**Goal:** Full web interface
**Deliverable:** Open localhost:3000, start a session, watch the agent work in real-time.
**Estimated time:** Weeks 7-9

---

### Epic 3.1: UI Shell & Session Management

#### Story 3.1.1: React + Vite app with routing and layout

#### Story 3.1.2: Sessions page — list, create, resume, delete

#### Story 3.1.3: Settings page — LLM providers, Docker config

---

### Epic 3.2: Chat Panel

#### Story 3.2.1: Streaming markdown chat with assistant-ui

#### Story 3.2.2: Tool invocation cards (collapsible)

#### Story 3.2.3: Todo list widget

#### Story 3.2.4: Stop/cancel button

---

### Epic 3.3: Terminal Panel

#### Story 3.3.1: xterm.js integration with WebSocket PTY

#### Story 3.3.2: Multi-tab shell support

---

### Epic 3.4: File Panel

#### Story 3.4.1: File tree with react-arborist

#### Story 3.4.2: CodeMirror 6 file viewer/editor

---

### Epic 3.5: Browser Panel

#### Story 3.5.1: Screenshot stream display

---

## Phase 4: Knowledge & Intelligence

**Goal:** Agent gets smarter over time
**Deliverable:** Agent remembers preferences, understands codebases deeply, handles long tasks.
**Estimated time:** Weeks 10-12

---

### Epic 4.1: Knowledge Notes System

#### Story 4.1.1: SQLite schema and CRUD API for knowledge notes
#### Story 4.1.2: Auto-injection into agent context (relevance scoring)
#### Story 4.1.3: Auto-suggestion of notes after sessions

---

### Epic 4.2: Rules Loading

#### Story 4.2.1: Auto-read AGENTS.md, .devin/rules/, CLAUDE.md, .cursorrules
#### Story 4.2.2: Inject into system prompt per-repo with precedence ordering

---

### Epic 4.3: Session History & Repo Maps

#### Story 4.3.1: Session history in SQLite with search
#### Story 4.3.2: Repo map generation via tree-sitter
#### Story 4.3.3: Repo map injection into context

---

### Epic 4.4: Advanced Context Management

#### Story 4.4.1: Checkpointing with resume capability
#### Story 4.4.2: Selective retention strategies

---

### Epic 4.5: Secrets & CI

#### Story 4.5.1: Env var configuration and injection into containers
#### Story 4.5.2: CI monitoring (GitHub Actions status polling)

---

## Phase 5: Scale & Distribution

**Goal:** Ready for others to use
**Deliverable:** Anyone can `docker compose up`, point at Ollama, and have a working autonomous coding agent.
**Estimated time:** Weeks 13-16

---

### Epic 5.1: Docker Compose & Deployment

#### Story 5.1.1: docker-compose.yml for one-command setup
#### Story 5.1.2: Production configuration and health checks

---

### Epic 5.2: Documentation

#### Story 5.2.1: README with quickstart guide
#### Story 5.2.2: Architecture guide
#### Story 5.2.3: Tool authoring guide
#### Story 5.2.4: environment.yaml reference

---

### Epic 5.3: Multi-Session & Auth

#### Story 5.3.1: Multiple concurrent sessions with global limits
#### Story 5.3.2: API key authentication for remote access

---

### Epic 5.4: Extensibility

#### Story 5.4.1: Plugin system for custom tools (auto-discovery)
#### Story 5.4.2: MCP adapter (v2)
#### Story 5.4.3: OpenAPI spec auto-generation

---

## Story Dependency Graph (Phase 1)

```
1.1.1 (monorepo)
  └─> 1.1.2 (TS/ESLint/Prettier)
       └─> 1.1.3 (shared types)
            ├─> 1.3.1 (tool registry)
            │    ├─> 1.3.2 (shell_exec)
            │    ├─> 1.3.3 (file tools)
            │    └─> 1.3.4 (search tools)
            └─> 1.4.1 (LLM provider)

1.2.1 (Dockerfile)
  └─> 1.2.2 (container manager)
       ├─> 1.2.3 (workspace volumes)
       ├─> 1.3.2 (shell_exec) [needs container]
       ├─> 1.3.3 (file tools) [needs container]
       └─> 1.3.4 (search tools) [needs container]

1.3.2 + 1.3.3 + 1.4.1
  └─> 1.5.1 (agent loop)
       └─> 1.5.2 (Hono server)
            ├─> 1.6.1 (forge chat)
            └─> 1.6.2 (forge doctor)

All Phase 1 stories
  └─> 1.7.1 (smoke test)
```

## Sprint Suggestion (Phase 1)

### Sprint 1 (Week 1): Foundation
- Story 1.1.1: Initialize pnpm monorepo
- Story 1.1.2: Configure TS/ESLint/Prettier
- Story 1.1.3: Shared types package
- Story 1.2.1: Forge base Docker image

### Sprint 2 (Week 2): Core Engine
- Story 1.2.2: Container manager
- Story 1.2.3: Workspace volumes
- Story 1.3.1: Tool registry
- Story 1.3.2: shell_exec tool
- Story 1.3.3: File tools
- Story 1.3.4: Search tools

### Sprint 3 (Week 3): Agent & CLI
- Story 1.4.1: LLM provider (Vercel AI SDK + Ollama)
- Story 1.5.1: Single-turn agent loop
- Story 1.5.2: Hono server (REST + WebSocket)
- Story 1.6.1: `forge chat` command
- Story 1.6.2: `forge doctor` command
- Story 1.7.1: End-to-end smoke test
