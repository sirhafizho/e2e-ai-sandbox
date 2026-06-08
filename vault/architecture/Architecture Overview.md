# Architecture Overview

## System Components

```
┌─────────────────────────────────────────┐
│  AI Agent (Local LLM / Claude / GPT)    │
└────────────┬────────────────────────────┘
             │ JSON-RPC 2.0 / REST API
             ▼
┌─────────────────────────────────────────┐
│  Agent Server (Node.js / Python)        │
│  - Tool registry                        │
│  - Event streaming (SSE)                │
│  - Session management                   │
└────────────┬────────────────────────────┘
             │ Docker socket / stdio
             ▼
┌─────────────────────────────────────────┐
│  Docker Sandbox (per-session)           │
│  ├─ Bash shell                          │
│  ├─ Python / Node.js / Go              │
│  ├─ Git                                 │
│  ├─ Chromium (Playwright)              │
│  ├─ File system (/workspace)           │
│  └─ Network (outbound)                 │
└─────────────────────────────────────────┘

Desktop UI (Tauri or Electron — TBD)
├─ Session manager
├─ Terminal (xterm.js)
├─ Browser viewport
└─ Tool output viewer
```

## Communication Flow

1. User starts a session via Desktop UI
2. Agent Server spawns a Docker sandbox
3. LLM receives system prompt + tool definitions
4. LLM generates tool calls → Agent Server dispatches to sandbox
5. Output streams back via SSE → displayed in UI
6. Loop until task complete or user intervenes

## Key Design Principles

- **Isolation first** — Each session is a fresh container. No cross-contamination.
- **Provider agnostic** — LLM layer wraps multiple providers behind one interface.
- **Spec-driven** — Behavioral specs before code. See [[Decisions Log]].
- **Stream everything** — No blocking waits. All tool output streams in real-time.

## Related Specs

- [[Agent Server API]] — `specs/api/agent-server-api.md`
- [[Docker Sandbox]] — `specs/sandbox/docker-sandbox.md`
- [[Tool Registry]] — `specs/tools/tool-registry.md`
