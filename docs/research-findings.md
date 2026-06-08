# Research Findings — AI Agent Sandboxes

Research conducted 2026-06-08. Sources: Cognition AI (Devin), OpenHands docs/papers, SWE-agent/SWE-ReX repos.

## Existing Implementations

### Devin (Cognition AI) — Commercial, Closed Source
- Full terminal (shell access)
- Built-in code editor (IDE)
- Web browser automation
- GitHub integration (clone, read issues, setup environments)
- Testing & debugging (run tests, reproduce bugs)

### OpenHands — Open Source Reference Implementation
- Bash shell — direct OS access
- Jupyter/IPython — Python REPL for interactive execution
- Chromium browser (Playwright) — full web interaction, screenshots, DOM access
- File editor — read/write filesystem
- Docker sandbox — isolated per-session environment
- REST API — agents communicate via event-stream (not MCP)
- Key insight: event-stream + REST is battle-tested and simpler than MCP for this use case

### SWE-agent & SWE-ReX
- Specialized file viewer (100-line windows) — context-efficient
- Integrated linter — syntactic validation before commits
- Multi-backend: Docker, AWS, Modal, Fargate (via SWE-ReX)
- Interactive CLI tools: ipython, gdb, etc.

## Emerging Protocols & Patterns

| Protocol | Transport | Use Case | Maturity |
|----------|-----------|----------|----------|
| MCP (Model Context Protocol) | JSON-RPC 2.0 over stdio/SSE | Tool/resource discovery for LLMs | Growing ecosystem, good for tool catalogs |
| REST + Event-stream (SSE) | HTTP | Agent ↔ sandbox communication | Proven by OpenHands at scale |
| WebSocket | WS | Real-time bidirectional | Good for terminal/browser streaming |

## Design Decisions Informed by Research

1. **Docker over VMs** — Fast, lightweight, sufficient isolation. All major implementations use Docker.
2. **REST + SSE over MCP (initially)** — Simpler, proven. MCP can layer on top later for tool discovery.
3. **Provider-agnostic LLM layer** — Wrap Claude SDK, OpenAI SDK, Ollama HTTP behind unified interface.
4. **Playwright for browser** — Industry standard. Both OpenHands and SWE-agent use it.
5. **Per-session containers** — Clean state per agent run. Workspace mounted as volume for persistence.

## Capability Matrix (What Our Sandbox Needs)

| Capability | Priority | Notes |
|-----------|----------|-------|
| Bash shell | P0 | Core — everything depends on this |
| File read/write | P0 | Core — agent needs filesystem access |
| Git operations | P0 | Clone, commit, push, branch |
| Browser (Playwright) | P1 | Web automation, testing, research |
| Python/Node runtimes | P1 | Execute code, run tests |
| Network access | P1 | curl, wget, API calls |
| Jupyter/REPL | P2 | Nice for iterative exploration |
| GUI rendering | P3 | Screenshot-based or VNC — later |
