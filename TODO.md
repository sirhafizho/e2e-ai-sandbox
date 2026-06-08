# TODO — Spec-First Task Breakdown

## Phase 1: Core Specs (Current)

### API Contract
- [ ] Define agent ↔ server REST API (endpoints, auth, request/response shapes)
- [ ] Define event-stream protocol (SSE for real-time tool output)
- [ ] Define session lifecycle (create, attach, destroy, timeout)
- [ ] Define error model (structured errors, retries, circuit-breaking)

### Docker Sandbox
- [ ] Define base image requirements (languages, tools, Playwright)
- [ ] Define container lifecycle (spawn, health-check, teardown)
- [ ] Define resource limits (CPU, memory, disk, network)
- [ ] Define filesystem mount strategy (workspace volume, read-only tools)
- [ ] Define security boundaries (no host access, network isolation options)

### Tool Dispatch
- [ ] Define tool registry schema (name, description, input/output, capabilities)
- [ ] Define tool invocation protocol (request → execution → stream → result)
- [ ] Define built-in tools: shell, file_read, file_write, browser, git
- [ ] Define tool timeout and cancellation behavior

### Session Model
- [ ] Define session state machine (created → running → paused → terminated)
- [ ] Define multi-agent session support (shared workspace, isolated contexts)
- [ ] Define session persistence (resume after app restart)

## Phase 2: Implementation Scaffolding

- [ ] Choose runtime: Node.js (TypeScript) or Python (FastAPI) for agent server
- [ ] Choose desktop framework: Tauri vs Electron
- [ ] Bootstrap agent server with health endpoint
- [ ] Build Docker sandbox image (Dockerfile)
- [ ] Implement session create/destroy via Docker SDK
- [ ] Wire first tool: shell execution with streaming output

## Phase 3: LLM Integration

- [ ] Provider-agnostic LLM wrapper (Claude, OpenAI, Ollama)
- [ ] Tool-calling adapter (translate tool registry → LLM tool format)
- [ ] Conversation/context management
- [ ] Token budget tracking

## Phase 4: Desktop UI

- [ ] Session list view
- [ ] Terminal emulator (xterm.js)
- [ ] Browser viewport (embedded or screenshot-based)
- [ ] Tool output panel
- [ ] Settings (LLM provider config, Docker config)

## Decisions Pending

- [ ] Tauri vs Electron (leaning Tauri for weight, need to confirm Playwright embed story)
- [ ] REST+SSE vs WebSocket for agent↔server communication
- [ ] Single monorepo or separate packages (server, sandbox, ui)
- [ ] MCP support: add later as alternative protocol alongside REST?
