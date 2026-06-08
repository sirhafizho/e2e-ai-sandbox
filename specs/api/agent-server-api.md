# Spec: Agent ↔ Server API Contract

**Status:** Draft  
**Priority:** P0 — Everything depends on this interface.

## Overview

The Agent Server is the orchestration layer between AI agents (LLMs) and Docker sandboxes. It exposes a REST API with SSE streaming for real-time tool output.

## Behavioral Requirements

### Session Management

1. **Create Session** — Agent requests a new sandbox. Server spawns a Docker container, returns session ID.
2. **Attach to Session** — Agent reconnects to an existing session (resume after disconnect).
3. **Destroy Session** — Explicit teardown. Container stopped and removed.
4. **Session Timeout** — Idle sessions auto-terminate after configurable duration.

### Tool Invocation

1. Agent sends a tool call (e.g., "run shell command `ls -la`").
2. Server validates the tool call against the registry.
3. Server dispatches to the sandbox container.
4. Output streams back via SSE (stdout, stderr, exit code).
5. Final result returned as structured JSON.

### Event Stream

- SSE endpoint per session for real-time output.
- Events: `tool_start`, `tool_output` (chunked), `tool_complete`, `tool_error`, `session_event`.

## API Shape (Draft)

```
POST   /sessions              → Create session
GET    /sessions/:id          → Get session status
DELETE /sessions/:id          → Destroy session
POST   /sessions/:id/tools    → Invoke a tool
GET    /sessions/:id/stream   → SSE event stream
GET    /tools                 → List available tools
GET    /health                → Server health check
```

## Open Questions

- Authentication model (API key? JWT? Local-only so none?)
- Rate limiting (per-session or global?)
- Max concurrent sessions
- Tool timeout defaults (30s? 5min? configurable per-tool?)
