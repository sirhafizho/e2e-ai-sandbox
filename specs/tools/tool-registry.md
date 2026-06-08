# Spec: Tool Registry & Dispatch

**Status:** Draft  
**Priority:** P0 — Defines how agents interact with sandbox capabilities.

## Overview

Tools are the atomic capabilities exposed to AI agents. Each tool has a schema (name, description, inputs, outputs) and an execution handler that runs inside the sandbox.

## Built-in Tools

### shell
- **Description:** Execute a shell command in the sandbox
- **Input:** `{ command: string, timeout_ms?: number, cwd?: string }`
- **Output:** `{ stdout: string, stderr: string, exit_code: number, duration_ms: number }`
- **Streaming:** Yes (stdout/stderr chunks via SSE)

### file_read
- **Description:** Read a file from the workspace
- **Input:** `{ path: string, offset?: number, limit?: number }`
- **Output:** `{ content: string, total_lines: number, truncated: boolean }`

### file_write
- **Description:** Write content to a file
- **Input:** `{ path: string, content: string, create_dirs?: boolean }`
- **Output:** `{ path: string, bytes_written: number }`

### file_edit
- **Description:** Apply a targeted edit (find/replace) to a file
- **Input:** `{ path: string, old_text: string, new_text: string }`
- **Output:** `{ path: string, replacements: number }`

### browser
- **Description:** Control a Playwright browser instance
- **Input:** `{ action: "navigate" | "click" | "type" | "screenshot" | "evaluate", ... }`
- **Output:** Varies by action (screenshot → base64 image, evaluate → JS result, etc.)

### git
- **Description:** Execute git operations
- **Input:** `{ operation: "clone" | "status" | "diff" | "commit" | "push" | ..., args?: object }`
- **Output:** `{ result: string, success: boolean }`

## Tool Schema Format

```json
{
  "name": "shell",
  "description": "Execute a shell command in the sandbox",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "The command to execute" },
      "timeout_ms": { "type": "number", "default": 30000 },
      "cwd": { "type": "string", "default": "/workspace" }
    },
    "required": ["command"]
  },
  "output_schema": { ... },
  "capabilities": ["streaming"],
  "timeout_default_ms": 30000,
  "timeout_max_ms": 300000
}
```

## Dispatch Behavior

1. Agent sends tool invocation request.
2. Server validates input against schema.
3. Server routes to appropriate handler (Docker exec, Playwright API, etc.).
4. Handler streams output via SSE.
5. On completion, structured result returned.
6. On timeout: SIGTERM → 5s grace → SIGKILL. Partial output preserved.

## Open Questions

- Custom tool registration (user-defined tools via config)?
- Tool composition (one tool calling another)?
- Tool permissions (restrict certain tools per session)?
