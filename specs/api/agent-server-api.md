# Spec: Agent Server API Contract

**Status:** Draft (Revised 2026-06-24)  
**Priority:** P0 — Everything depends on this interface.

---

## Overview

The Agent Server is the orchestration layer between AI agents (LLMs) and Docker sandboxes. It exposes a REST API with WebSocket streaming for real-time tool output and UI updates. It also manages sessions, tool dispatch, knowledge injection, and the agentic loop.

**Tech stack:** TypeScript (Node.js), Fastify or Hono, dockerode, SQLite.

**Design principles:**
- Stateless REST for CRUD operations; stateful WebSocket for streaming
- Sessions are the primary unit of isolation (one Docker container per session)
- Tools are internal to the agent loop — the UI never calls tools directly
- All responses follow a consistent envelope format

---

## Session Management

Sessions are the core abstraction. Each session maps 1:1 to a Docker container and an agent loop instance.

### Session Lifecycle

```
created ──▶ booting ──▶ ready ──▶ running ──▶ paused ──▶ terminated
                │                    │          │
                │                    │          └──▶ running (resume)
                │                    └──▶ terminated (error/timeout)
                └──▶ terminated (boot failure)
```

| State | Description |
|-------|-------------|
| `created` | Session record exists, container not yet started |
| `booting` | Docker container is starting, dependencies installing |
| `ready` | Container is up, agent loop is idle, waiting for user input |
| `running` | Agent loop is actively processing (tool calls, LLM inference) |
| `paused` | Agent loop suspended (user requested or idle timeout warning) |
| `terminated` | Session ended — container stopped, workspace optionally archived |

**Auto-timeout:** Idle sessions terminate after a configurable duration (default: 1 hour). A warning event is sent via WebSocket 5 minutes before termination.

### Endpoints

#### `POST /api/sessions` — Create a new session

**Request body:**
```json
{
  "repo_url": "https://github.com/user/repo.git",
  "snapshot_id": "snap_abc123",
  "model": "ollama/deepseek-coder-v2",
  "environment_yaml": "name: my-env\npackages:\n  - python@3.12\n  - node@20"
}
```

All fields are optional. If no `repo_url` or `snapshot_id` is provided, an empty workspace is created.

**Response (`201 Created`):**
```json
{
  "session": {
    "id": "ses_7f3a2b",
    "status": "created",
    "model": "ollama/deepseek-coder-v2",
    "container_id": null,
    "created_at": "2026-06-24T10:30:00Z",
    "ws_url": "ws://localhost:3000/api/sessions/ses_7f3a2b/ws"
  }
}
```

#### `GET /api/sessions` — List all sessions

**Query params:** `?status=ready&limit=20&offset=0`

**Response (`200 OK`):**
```json
{
  "sessions": [
    {
      "id": "ses_7f3a2b",
      "status": "ready",
      "model": "ollama/deepseek-coder-v2",
      "created_at": "2026-06-24T10:30:00Z",
      "last_activity": "2026-06-24T11:15:00Z"
    }
  ],
  "total": 1
}
```

#### `GET /api/sessions/:id` — Get session detail

**Response (`200 OK`):**
```json
{
  "session": {
    "id": "ses_7f3a2b",
    "status": "running",
    "model": "ollama/deepseek-coder-v2",
    "container_id": "d4e5f6a7b8c9",
    "created_at": "2026-06-24T10:30:00Z",
    "last_activity": "2026-06-24T11:15:00Z",
    "history_length": 42,
    "active_tools": ["shell"],
    "workspace": {
      "repo_url": "https://github.com/user/repo.git",
      "branch": "main",
      "snapshot_id": null
    }
  }
}
```

#### `POST /api/sessions/:id/resume` — Resume a paused session

**Response (`200 OK`):**
```json
{
  "session": {
    "id": "ses_7f3a2b",
    "status": "ready"
  }
}
```

#### `DELETE /api/sessions/:id` — Destroy a session

**Query params:** `?archive=true` (optionally archive workspace before destroying)

**Response (`200 OK`):**
```json
{
  "deleted": true,
  "archived": true,
  "archive_id": "arc_x9y8z7"
}
```

#### `POST /api/sessions/:id/messages` — Send a user message

This is the primary way the UI interacts with the agent. Sending a message triggers the agentic loop.

**Request body:**
```json
{
  "content": "Fix the failing tests in src/utils.ts",
  "attachments": []
}
```

**Response (`202 Accepted`):**
```json
{
  "message_id": "msg_a1b2c3",
  "status": "processing"
}
```

The actual agent response streams back via WebSocket events (`agent_message`, `tool_start`, etc.).

#### `GET /api/sessions/:id/messages` — Get conversation history

**Query params:** `?cursor=msg_a1b2c3&limit=50`

**Response (`200 OK`):**
```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "Fix the failing tests in src/utils.ts",
      "timestamp": "2026-06-24T10:31:00Z"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "I'll look at the failing tests...",
      "tool_calls": [
        {
          "call_id": "tc_001",
          "tool_name": "shell",
          "input": {"command": "npm test"},
          "result": {"exit_code": 1, "stdout": "..."},
          "duration_ms": 3200
        }
      ],
      "timestamp": "2026-06-24T10:31:05Z"
    }
  ],
  "cursor": "msg_000",
  "has_more": false
}
```

---

## Tool Invocation (Internal)

Tools are **NOT** directly exposed as API endpoints to the UI. The agent loop calls tools internally. The UI watches tool execution via WebSocket events.

### Internal Dispatch Flow

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────┐
│  Agent Loop  │────▶│  Tool Router  │────▶│  Tool Handler  │────▶│ Sandbox  │
│  (LLM call)  │     │  (validate)   │     │  (dispatch)    │     │ (Docker) │
└─────────────┘     └──────────────┘     └───────────────┘     └──────────┘
       ▲                                          │
       │                                          ▼
       │                                   ┌──────────┐
       └───────────────────────────────────│  Result   │
                                           └──────────┘
```

1. Agent loop (LLM) decides to call a tool
2. Server validates input against the tool's JSON schema
3. Server dispatches to the appropriate handler:
   - **Shell tools** → `docker exec` via dockerode
   - **File tools** → Docker volume read/write
   - **Browser tools** → Playwright CDP connection into container
   - **Git tools** → `docker exec git ...`
4. Output streams back via WebSocket events (`tool_output` chunks)
5. Structured result returned to the agent loop for next LLM call

### Tool Timeout

Each tool has a configurable timeout (default: 120 seconds). Long-running tools (e.g., `npm install`) can have extended timeouts. On timeout, the tool is killed and a `tool_error` event is emitted with `TOOL_TIMEOUT`.

---

## WebSocket Events

### Connection

**Endpoint:** `ws://host/api/sessions/:id/ws`

**Connection params:** `?api_key=xxx` (when auth is enabled)

The WebSocket connection is the primary channel for real-time updates. The UI should connect immediately after creating or resuming a session.

### Events: Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `greeting` | `{message: string}` | Sent on connection — confirms session is alive |
| `agent_message` | `{content: string, role: "assistant", message_id: string, done: boolean}` | Agent text output (streamed token by token; `done: true` on final chunk) |
| `tool_start` | `{tool_name: string, input_summary: string, call_id: string}` | Tool execution has started |
| `tool_output` | `{call_id: string, chunk: string, stream: "stdout" \| "stderr"}` | Streaming output from a running tool |
| `tool_complete` | `{call_id: string, result: object, duration_ms: number}` | Tool finished successfully |
| `tool_error` | `{call_id: string, error: string, code: string, retrying: boolean}` | Tool execution failed |
| `todo_update` | `{todos: [{content: string, status: string}]}` | Agent's task list changed |
| `session_status` | `{status: string, info: string}` | Session state transition (e.g., `ready` → `running`) |
| `idle_warning` | `{minutes_remaining: number}` | Session will auto-terminate soon |
| `error` | `{code: string, message: string}` | Server-level error |

**Example: Full tool execution flow**
```
← greeting        {message: "Session ses_7f3a2b connected"}
→ user_message     {content: "Run the tests"}
← session_status   {status: "running", info: "Processing message"}
← agent_message    {content: "I'll run the test suite for you.", done: true}
← tool_start       {tool_name: "shell", input_summary: "npm test", call_id: "tc_001"}
← tool_output      {call_id: "tc_001", chunk: "PASS src/utils.test.ts\n", stream: "stdout"}
← tool_output      {call_id: "tc_001", chunk: "FAIL src/api.test.ts\n", stream: "stdout"}
← tool_complete    {call_id: "tc_001", result: {exit_code: 1}, duration_ms: 3200}
← agent_message    {content: "One test failed in api.test.ts. Let me look at it...", done: true}
← session_status   {status: "ready", info: "Idle"}
```

### Events: Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `user_message` | `{content: string}` | User sends a message (triggers agent loop) |
| `cancel` | `{}` | Cancel the current agent action (kills active tools, stops LLM generation) |
| `terminal_input` | `{shell_id: string, input: string}` | User types directly in the terminal panel |

### Heartbeat

The server sends a WebSocket `ping` frame every 30 seconds. If no `pong` is received within 10 seconds, the connection is considered dead. Clients should implement automatic reconnection.

---

## REST API — Tools

These endpoints let the UI display available tools and their schemas. Tools are **not invocable** via REST — they are internal to the agent loop.

#### `GET /api/tools` — List all registered tools

**Response (`200 OK`):**
```json
{
  "tools": [
    {
      "name": "shell",
      "description": "Execute a shell command in the sandbox",
      "category": "system",
      "timeout_ms": 120000
    },
    {
      "name": "read_file",
      "description": "Read a file from the workspace",
      "category": "filesystem",
      "timeout_ms": 30000
    },
    {
      "name": "browser_navigate",
      "description": "Navigate to a URL in the headless browser",
      "category": "browser",
      "timeout_ms": 60000
    }
  ]
}
```

#### `GET /api/tools/:name` — Get tool detail and schema

**Response (`200 OK`):**
```json
{
  "tool": {
    "name": "shell",
    "description": "Execute a shell command in the sandbox",
    "category": "system",
    "timeout_ms": 120000,
    "schema": {
      "type": "object",
      "properties": {
        "command": {"type": "string", "description": "The shell command to execute"},
        "shell_id": {"type": "string", "description": "Optional shell session ID for persistent state"},
        "timeout": {"type": "integer", "description": "Optional timeout override in ms"}
      },
      "required": ["command"]
    }
  }
}
```

---

## REST API — Knowledge

The knowledge system provides cross-session memory. Notes, session summaries, and repo maps persist between sessions.

#### `GET /api/knowledge/notes` — List knowledge notes

**Query params:** `?repo=path&tags=bug,architecture&limit=20`

**Response (`200 OK`):**
```json
{
  "notes": [
    {
      "id": "note_001",
      "title": "Auth module uses JWT with RS256",
      "content": "The auth system was refactored to use RS256...",
      "repo": "github.com/user/repo",
      "tags": ["architecture", "auth"],
      "created_at": "2026-06-20T14:00:00Z",
      "session_id": "ses_abc123"
    }
  ],
  "total": 1
}
```

#### `POST /api/knowledge/notes` — Create a note

**Request body:**
```json
{
  "title": "Database migration pattern",
  "content": "This project uses knex migrations stored in /db/migrations...",
  "repo": "github.com/user/repo",
  "tags": ["database", "patterns"]
}
```

**Response (`201 Created`):**
```json
{
  "note": {
    "id": "note_002",
    "title": "Database migration pattern",
    "created_at": "2026-06-24T12:00:00Z"
  }
}
```

#### `DELETE /api/knowledge/notes/:id` — Delete a note

**Response (`200 OK`):**
```json
{
  "deleted": true
}
```

#### `GET /api/knowledge/sessions` — List past session summaries

**Response (`200 OK`):**
```json
{
  "sessions": [
    {
      "id": "ses_abc123",
      "summary": "Fixed auth bug, refactored middleware",
      "repo": "github.com/user/repo",
      "model": "ollama/deepseek-coder-v2",
      "messages_count": 42,
      "duration_minutes": 35,
      "created_at": "2026-06-23T09:00:00Z"
    }
  ]
}
```

#### `GET /api/knowledge/repo-map?repo=path` — Get or refresh repo map

Returns a structural map of the repository (file tree, key symbols, dependencies).

**Response (`200 OK`):**
```json
{
  "repo_map": {
    "repo": "github.com/user/repo",
    "generated_at": "2026-06-24T10:00:00Z",
    "files_count": 156,
    "tree": "src/\n  index.ts\n  utils/\n    auth.ts\n    ...",
    "key_exports": ["createApp", "authMiddleware", "UserModel"],
    "dependencies": {"typescript": "^5.4", "fastify": "^4.26"}
  }
}
```

---

## REST API — Configuration

#### `GET /api/config` — Get current configuration

**Response (`200 OK`):**
```json
{
  "config": {
    "llm": {
      "default_provider": "ollama",
      "default_model": "deepseek-coder-v2",
      "providers": {
        "ollama": {"base_url": "http://localhost:11434", "status": "connected"},
        "openai": {"status": "not_configured"},
        "anthropic": {"status": "not_configured"}
      }
    },
    "docker": {
      "socket": "/var/run/docker.sock",
      "max_containers": 5,
      "default_image": "forge-sandbox:latest"
    },
    "sessions": {
      "idle_timeout_minutes": 60,
      "max_concurrent": 5
    }
  }
}
```

#### `PUT /api/config` — Update configuration

**Request body:** (partial update — only include fields to change)
```json
{
  "llm": {
    "default_model": "gpt-4o"
  },
  "sessions": {
    "idle_timeout_minutes": 120
  }
}
```

**Response (`200 OK`):**
```json
{
  "config": { "..." : "full updated config" }
}
```

#### `GET /api/config/providers` — List available LLM providers and their status

**Response (`200 OK`):**
```json
{
  "providers": [
    {
      "name": "ollama",
      "status": "connected",
      "models": ["deepseek-coder-v2", "llama3.1", "codellama"],
      "base_url": "http://localhost:11434"
    },
    {
      "name": "openai",
      "status": "configured",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "base_url": "https://api.openai.com"
    }
  ]
}
```

#### `POST /api/config/providers/test` — Test an LLM provider connection

**Request body:**
```json
{
  "provider": "ollama",
  "base_url": "http://localhost:11434",
  "api_key": null
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "latency_ms": 45,
  "models_available": ["deepseek-coder-v2", "llama3.1"]
}
```

---

## REST API — Files (Workspace Access)

Direct file access into a session's workspace. Used by the UI's file explorer and editor panels.

#### `GET /api/sessions/:id/files?path=/` — List files in workspace directory

**Response (`200 OK`):**
```json
{
  "path": "/",
  "entries": [
    {"name": "src", "type": "directory", "children_count": 12},
    {"name": "package.json", "type": "file", "size": 1024, "modified": "2026-06-24T10:00:00Z"},
    {"name": "README.md", "type": "file", "size": 2048, "modified": "2026-06-24T09:00:00Z"}
  ]
}
```

#### `GET /api/sessions/:id/files/read?path=/src/index.ts` — Read a file from workspace

**Response (`200 OK`):**
```json
{
  "path": "/src/index.ts",
  "content": "import { createApp } from './app';\n\nconst app = createApp();\napp.listen(3000);",
  "size": 82,
  "encoding": "utf-8"
}
```

#### `PUT /api/sessions/:id/files/write` — Write a file to workspace

**Request body:**
```json
{
  "path": "/src/index.ts",
  "content": "import { createApp } from './app';\n\nconst app = createApp();\napp.listen(8080);"
}
```

**Response (`200 OK`):**
```json
{
  "written": true,
  "path": "/src/index.ts",
  "size": 82
}
```

---

## REST API — Health

#### `GET /api/health` — Server health check

**Response (`200 OK`):**
```json
{
  "status": "healthy",
  "uptime_seconds": 3600,
  "version": "0.1.0",
  "docker": {
    "connected": true,
    "containers_running": 2,
    "containers_max": 5
  },
  "llm": {
    "default_provider": "ollama",
    "status": "connected"
  },
  "database": {
    "status": "connected",
    "sessions_total": 15,
    "sessions_active": 2
  }
}
```

---

## Authentication

Authentication is phased to keep local development frictionless while enabling remote/team usage.

| Version | Mode | Mechanism |
|---------|------|-----------|
| v1 | Local | No auth required when server is bound to `localhost` / `127.0.0.1` |
| v1 | Remote | API key via `X-API-Key` header or `?api_key=` query param |
| v2 | Multi-user | JWT-based auth with user accounts, RBAC |

**API key configuration:**
```json
{
  "auth": {
    "mode": "api_key",
    "keys": [
      {"key": "forge_k_abc123...", "name": "my-laptop", "created_at": "2026-06-24"}
    ]
  }
}
```

**Header format:**
```
X-API-Key: forge_k_abc123...
```

When auth is enabled, all REST endpoints and WebSocket connections require a valid key. Unauthenticated requests receive a `401` with error code `AUTH_REQUIRED`.

---

## Error Model

All errors follow a consistent envelope:

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session ses_abc123 does not exist",
    "details": {}
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `SESSION_NOT_FOUND` | 404 | Session doesn't exist |
| `SESSION_NOT_READY` | 409 | Session is booting or terminated — cannot accept messages |
| `TOOL_NOT_FOUND` | 404 | Unknown tool name |
| `TOOL_TIMEOUT` | 408 | Tool execution exceeded its timeout |
| `TOOL_VALIDATION` | 400 | Tool input failed JSON schema validation |
| `CONTAINER_ERROR` | 500 | Docker container failed to start, crashed, or is unreachable |
| `LLM_ERROR` | 502 | LLM provider returned an error (bad response, context too long, etc.) |
| `LLM_RATE_LIMIT` | 429 | LLM provider rate-limited the request |
| `AUTH_REQUIRED` | 401 | API key missing or invalid |
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Error Response Examples

**Session not found:**
```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session ses_abc123 does not exist",
    "details": {}
  }
}
```

**Tool validation failure:**
```json
{
  "error": {
    "code": "TOOL_VALIDATION",
    "message": "Invalid input for tool 'shell'",
    "details": {
      "field": "command",
      "issue": "Required field missing"
    }
  }
}
```

**LLM rate limit:**
```json
{
  "error": {
    "code": "LLM_RATE_LIMIT",
    "message": "OpenAI rate limit exceeded",
    "details": {
      "provider": "openai",
      "retry_after_seconds": 30
    }
  }
}
```

---

## Rate Limiting

| Scope | Limit | Notes |
|-------|-------|-------|
| Per-session tool concurrency | 10 | Max simultaneous tool executions per session |
| Global concurrent sessions | 5 (configurable) | Max active sessions server-wide |
| LLM requests | Provider-dependent | Respect provider rate limits; queue and retry with backoff |
| REST API | 100 req/min per key | Prevents abuse on remote deployments |
| WebSocket messages | 60 msg/min per connection | Prevents client spam |

When a rate limit is hit, the server returns `429 Too Many Requests` with a `Retry-After` header.

---

## Open Questions

| # | Question | Suggested Answer | Status |
|---|----------|-----------------|--------|
| 1 | WebSocket reconnection strategy? | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s). Server replays missed events from a short buffer. | Proposed |
| 2 | Max message size for user messages? | 100KB (covers large code pastes) | Proposed |
| 3 | Should file upload be supported? | Yes — drag-and-drop files into workspace via multipart upload endpoint. Defer to v1.1. | Deferred |
| 4 | Pagination for conversation history? | Cursor-based (using `message_id` as cursor). Default page size: 50. | Proposed |
| 5 | Should we support multiple WebSocket connections per session? | Yes — for multi-panel UI (terminal + chat). Each gets all events. | Proposed |
| 6 | Snapshot management endpoints? | Needed for save/restore workflow. Defer to dedicated snapshot spec. | Deferred |
| 7 | Webhook/callback support for CI integrations? | Out of scope for v1. | Deferred |
