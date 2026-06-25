# Spec: Tool Registry & Dispatch

**Status:** Draft (Revised 2026-06-24)  
**Priority:** P0 — Defines how agents interact with sandbox capabilities.

---

## Overview

Tools are the atomic capabilities exposed to AI agents. Each tool has a schema (name, description, inputs, outputs) and an execution handler that runs inside the sandbox. The registry supports **built-in tools** (shipped with Forge) and **user-defined custom tools** (registered at runtime via config or code).

The tool registry is the single source of truth for what an agent can do. It:

- Validates all tool invocations against JSON Schema before execution
- Routes invocations to the correct handler (Docker exec, Playwright CDP, external API, etc.)
- Streams output back to the agent loop via WebSocket events
- Adapts tool schemas to the format each LLM provider expects (OpenAI function calling, Anthropic tool_use, etc.)

---

## Built-in Tools

### Shell Tools

| Tool | Description | Input | Output | Capabilities |
|------|-------------|-------|--------|--------------|
| `shell_exec` | Execute a shell command | `{command, timeout_ms?, cwd?, shell_id?}` | `{stdout, stderr, exit_code, duration_ms}` | streaming, background |
| `shell_write` | Write to a running process stdin | `{shell_id, text_input?, bytes_input?}` | `{success}` | interactive |

**Notes:**

- Multiple concurrent shells via `shell_id` — each shell maintains its own PID, working directory, and environment variables.
- Background processes supported via a `run_in_background` flag on `shell_exec`. Returns the `shell_id` immediately; use `shell_write` or poll for output.
- Interactive I/O for processes that need stdin input (e.g., `vim`, `python REPL`, `ssh`). Use `shell_write` with `bytes_input` for special characters (`<CR>`, `<ESC>`, `<C-c>`, arrow keys).
- Persistent sessions — env vars, `cwd`, shell history carry across commands within the same `shell_id`.
- Default timeout: 30s. Max timeout: 300s (5 min).

---

### File Tools

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `file_read` | Read file contents | `{path, offset?, limit?}` | `{content, total_lines, truncated}` |
| `file_write` | Write/create a file | `{path, content, create_dirs?}` | `{path, bytes_written}` |
| `file_edit` | Find/replace edit | `{path, old_text, new_text, replace_all?}` | `{path, replacements}` |
| `file_multi_edit` | Batch edits in one file | `{path, edits: [{old_text, new_text}]}` | `{path, total_replacements}` |
| `grep` | Regex search in files | `{pattern, path?, glob?, max_results?, case_insensitive?}` | `{matches: [{file, line, content}]}` |
| `find_files` | Find files by glob | `{pattern, path?}` | `{files: [string]}` |

**Notes:**

- `file_read` supports images — returns base64-encoded content for `png`, `jpg`, `gif`, `webp`, `svg` files.
- `file_read` supports `offset` (1-based line number) and `limit` (number of lines) for reading slices of large files. Default: read entire file up to 20,000 characters.
- `file_edit` requires `old_text` to be **unique** in the file (ambiguous matches are rejected). Use `replace_all: true` to replace every occurrence.
- `file_multi_edit` applies edits sequentially in order — earlier edits can affect the text matched by later edits.
- `grep` is ripgrep-based — fast across large codebases, skips binary files and files > 4 MB.
- `find_files` uses glob patterns with brace expansion (e.g., `**/*.{ts,tsx}`).
- All paths are relative to `/workspace` (the container's working directory).

---

### Git Tools

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `git_status` | Repository status | `{}` | `{branch, staged[], modified[], untracked[]}` |
| `git_diff` | Show diff | `{ref?, staged?}` | `{diff: string}` |
| `git_log` | Show commit history | `{limit?, ref?}` | `{commits: [{sha, message, author, date}]}` |
| `git_commit` | Create a commit | `{message, files?}` | `{sha, message}` |
| `git_push` | Push to remote | `{remote?, branch?}` | `{success, remote, branch}` |
| `git_create_pr` | Create a pull request | `{title, body, base?, head?}` | `{pr_url, pr_number}` |
| `git_pr_status` | Check PR CI status | `{pr_number}` | `{checks: [{name, status, conclusion}], mergeable}` |

**Notes:**

- Git is pre-authenticated in the container via injected credentials (PAT token or SSH key) or the `gh` CLI.
- `git_commit` with no `files` array stages all modified/untracked files (equivalent to `git add -A`).
- `git_create_pr` uses the `gh` CLI under the hood. Requires a GitHub token in the container environment.
- `git_pr_status` polls CI checks with configurable wait — returns the current state of all checks plus a `mergeable` boolean.
- `git_diff` with `staged: true` shows the staged diff; with `ref` shows diff against a specific commit/branch.

---

### Browser Tools [PHASE 2+]

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `browser_navigate` | Go to URL | `{url}` | `{title, url, screenshot?}` |
| `browser_click` | Click an element | `{selector}` | `{success}` |
| `browser_type` | Type into an element | `{selector, text}` | `{success}` |
| `browser_screenshot` | Take screenshot | `{full_page?}` | `{base64_image, width, height}` |
| `browser_evaluate` | Execute JavaScript | `{expression}` | `{result}` |
| `browser_get_text` | Get page text content | `{selector?}` | `{text}` |

**Notes:**

- Chromium controlled via Playwright CDP (Chrome DevTools Protocol) connection to the container's headless browser.
- One browser instance per session, multiple tabs supported (tab management via `browser_navigate` with `new_tab` flag — v2).
- Cookies and auth state persist within the session lifetime.
- Screenshots returned as base64-encoded PNG.
- `browser_evaluate` runs arbitrary JavaScript in the page context — useful for extracting data, manipulating DOM, or debugging.
- `browser_get_text` with no `selector` returns the full page text (`document.body.innerText`).

---

### Search Tools [PHASE 2+]

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `web_search` | Search the internet | `{query, num_results?}` | `{results: [{title, url, snippet}]}` |

**Notes:**

- Search executes on the **server side** (not inside the container) to avoid exposing API keys in the sandbox.
- Default: 5 results. Max: 20.
- Backend is configurable (SearXNG self-hosted, Brave Search API, Google Custom Search, etc.).

---

## Tool Schema Format

Every tool — built-in or custom — is described by a `ToolDefinition`:

```typescript
interface ToolDefinition {
  name: string;                  // Unique identifier (snake_case)
  description: string;           // Human-readable description shown to the LLM
  input_schema: JSONSchema;      // JSON Schema for the input object
  output_schema: JSONSchema;     // JSON Schema for the output object
  capabilities: ToolCapability[];// What special behaviors this tool supports
  timeout_default_ms: number;    // Default timeout if not specified by caller
  timeout_max_ms: number;        // Hard maximum timeout (cannot be exceeded)
  category: ToolCategory;        // Grouping for permissions and routing
}

type ToolCapability = 'streaming' | 'background' | 'interactive';
type ToolCategory = 'shell' | 'file' | 'git' | 'browser' | 'search' | 'custom';
```

### Full Example: `shell_exec`

```json
{
  "name": "shell_exec",
  "description": "Execute a shell command in the sandbox. Supports streaming output, background execution, and persistent shell sessions.",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "The shell command to execute"
      },
      "timeout_ms": {
        "type": "integer",
        "description": "Timeout in milliseconds. Defaults to 30000 (30s). Max 300000 (5 min).",
        "default": 30000,
        "minimum": 1000,
        "maximum": 300000
      },
      "cwd": {
        "type": "string",
        "description": "Working directory for the command. Defaults to /workspace.",
        "default": "/workspace"
      },
      "shell_id": {
        "type": "string",
        "description": "Optional shell session ID to reuse. If omitted, a new session is created."
      },
      "run_in_background": {
        "type": "boolean",
        "description": "If true, start the process in the background and return the shell_id immediately.",
        "default": false
      }
    },
    "required": ["command"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "stdout": {
        "type": "string",
        "description": "Standard output from the command"
      },
      "stderr": {
        "type": "string",
        "description": "Standard error from the command"
      },
      "exit_code": {
        "type": "integer",
        "description": "Process exit code (0 = success)"
      },
      "duration_ms": {
        "type": "integer",
        "description": "Wall-clock execution time in milliseconds"
      },
      "shell_id": {
        "type": "string",
        "description": "The shell session ID (always returned, useful for background processes)"
      }
    },
    "required": ["stdout", "stderr", "exit_code", "duration_ms", "shell_id"]
  },
  "capabilities": ["streaming", "background"],
  "timeout_default_ms": 30000,
  "timeout_max_ms": 300000,
  "category": "shell"
}
```

---

## Tool Dispatch Behavior

The dispatch pipeline handles every tool invocation from request to result:

```
Agent Loop                    Server                         Sandbox Container
    │                           │                                  │
    ├── tool_invoke ──────────> │                                  │
    │   {name, input}           │                                  │
    │                           ├── validate(input, schema)        │
    │                           │   (reject → TOOL_VALIDATION err) │
    │                           │                                  │
    │                           ├── route to handler ────────────> │
    │                           │   shell  → docker exec           │
    │                           │   file   → docker exec / API     │
    │                           │   git    → docker exec (git/gh)  │
    │                           │   browser→ Playwright CDP        │
    │                           │   search → external API (server) │
    │                           │                                  │
    │ <── tool_start ────────── │                                  │
    │ <── tool_output (stream)  │ <── stdout/stderr chunks ─────── │
    │ <── tool_output (stream)  │                                  │
    │ <── tool_complete ──────  │                                  │
    │   {result}                │                                  │
```

### Step-by-Step

1. **Agent loop sends tool invocation** — tool name + input JSON.
2. **Server validates input** against the tool's `input_schema`. If validation fails, reject immediately with a `TOOL_VALIDATION` error (includes which fields failed and why).
3. **Server routes to the appropriate handler:**

   | Category | Handler | Mechanism |
   |----------|---------|-----------|
   | `shell` | Docker exec | `dockerode.exec()` with TTY or stream attach |
   | `file` | Docker exec / Docker API | `cat`, `sed`, file copy via Docker API for write |
   | `git` | Docker exec | `git` and `gh` CLI commands |
   | `browser` | Playwright CDP | WebSocket connection to container's Chromium on port 9222 |
   | `search` | External API | Server-side HTTP call (not from container) |
   | `custom` | Configurable | Inside or outside container depending on tool definition |

4. **Handler streams output** via WebSocket events:
   - `tool_start` — tool execution has begun (includes tool name and invocation ID)
   - `tool_output` — incremental output chunk (stdout, stderr, or structured data)
   - `tool_complete` — final structured result

5. **On completion:** structured result returned to the agent loop, conforming to `output_schema`.

6. **On timeout:** `SIGTERM` sent to the process → 5-second grace period → `SIGKILL`. Partial output is preserved and returned with a `timeout: true` flag in the result.

7. **On error:** error event emitted with error type and message. The agent loop decides whether to retry, use a different approach, or report the failure.

### Error Types

| Error | Description | Retryable? |
|-------|-------------|------------|
| `TOOL_VALIDATION` | Input failed schema validation | No (fix input) |
| `TOOL_NOT_FOUND` | Tool name not in registry | No |
| `TOOL_TIMEOUT` | Execution exceeded timeout | Maybe (increase timeout) |
| `TOOL_EXEC_ERROR` | Handler threw an exception | Maybe |
| `TOOL_PERMISSION_DENIED` | Tool disabled for this session | No |
| `CONTAINER_NOT_RUNNING` | Sandbox container is not available | No (restart session) |

---

## Custom Tool Registration

Users can extend Forge by registering custom tools. Place a `.ts` file in the `tools/` directory of the project root:

### Example: Custom Tool Definition

```typescript
// custom-tools/my-tool.ts
import { ToolDefinition } from '@forge/shared';

export default {
  name: 'my_custom_tool',
  description: 'Does something custom for this project',
  category: 'custom',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      limit: { type: 'integer', description: 'Max results', default: 10 }
    },
    required: ['query']
  },
  output_schema: {
    type: 'object',
    properties: {
      result: { type: 'string' },
      count: { type: 'integer' }
    }
  },
  capabilities: [],
  timeout_default_ms: 30000,
  timeout_max_ms: 300000,
} satisfies ToolDefinition;
```

### Custom Tool Handler

Handlers are registered separately from definitions. A handler is an async function that receives validated input and returns the output:

```typescript
// custom-tools/my-tool.handler.ts
import { ToolHandler } from '@forge/shared';

export const handler: ToolHandler<'my_custom_tool'> = async (input, context) => {
  // context provides: session, container, logger
  const result = await context.container.exec(`my-cli search "${input.query}" --limit ${input.limit}`);
  return {
    result: result.stdout,
    count: parseInt(result.stdout.split('\n').length.toString()),
  };
};
```

Handlers can execute inside the sandbox (via `context.container.exec()`) or outside (via direct Node.js code on the server), depending on the use case.

### Registration Lifecycle

1. On server start, scan `custom-tools/` directory for `*.ts` files.
2. Validate each definition against the `ToolDefinition` schema.
3. Load and bind handlers.
4. Merge custom tools into the registry alongside built-in tools.
5. Custom tools appear in the tool list sent to the LLM with the same schema format as built-ins.

---

## Tool Permissions [PHASE 2+]

Tool access can be restricted on a per-session basis:

- **Default:** all tools enabled.
- **Read-only sessions:** disable `file_write`, `file_edit`, `file_multi_edit`, `git_commit`, `git_push`, `git_create_pr`, `shell_exec` (or restrict shell to read-only commands).
- **No-browser sessions:** disable all `browser_*` tools.
- **Custom restrictions:** any subset of tools can be enabled/disabled.

Configuration via session creation params:

```typescript
interface SessionToolConfig {
  mode: 'allowlist' | 'blocklist';  // Default: blocklist (all enabled, block specific ones)
  tools: string[];                   // Tool names to allow or block
}
```

Example — create a read-only review session:

```json
{
  "mode": "blocklist",
  "tools": ["file_write", "file_edit", "file_multi_edit", "git_commit", "git_push", "git_create_pr"]
}
```

---

## LLM Tool Format Adaptation

The tool registry auto-converts tool schemas to the format each LLM provider expects. This abstraction lives in the agent server so tool definitions are provider-agnostic.

### Format Mapping

| Provider | Format | Conversion |
|----------|--------|------------|
| OpenAI / Ollama | Function calling (`tools` array with `function` type) | `name` → `function.name`, `input_schema` → `function.parameters` |
| Anthropic | Tool use (`tools` array with `input_schema`) | Direct mapping (Anthropic's native format is closest to ours) |
| No tool support | Bash-only prompt | Generate a system prompt section listing available tools with descriptions, instruct the model to output shell commands |

### Conversion Example (OpenAI format)

```json
{
  "type": "function",
  "function": {
    "name": "shell_exec",
    "description": "Execute a shell command in the sandbox.",
    "parameters": {
      "type": "object",
      "properties": {
        "command": { "type": "string", "description": "The shell command to execute" },
        "timeout_ms": { "type": "integer", "default": 30000 }
      },
      "required": ["command"]
    }
  }
}
```

### Conversion Example (Anthropic format)

```json
{
  "name": "shell_exec",
  "description": "Execute a shell command in the sandbox.",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "The shell command to execute" },
      "timeout_ms": { "type": "integer", "default": 30000 }
    },
    "required": ["command"]
  }
}
```

---

## Open Questions

- **Tool composition:** Should one tool be able to call another tool? (e.g., `git_commit` internally calls `shell_exec` with `git commit`). Currently, git tools are thin wrappers around shell commands — is this sufficient, or do we need a formal composition mechanism?
- **Tool versioning:** If tool schemas change between Forge versions, how do we handle backward compatibility? Version field in `ToolDefinition`? Migration layer?
- **Multi-tab browser:** Should `browser_*` tools support explicit tab management (open tab, switch tab, close tab), or is single-tab-at-a-time sufficient for v1?
- **MCP adapter:** Expose Forge tools as MCP (Model Context Protocol) resources so external LLM clients (Claude Desktop, etc.) can use Forge as a tool server? This would make Forge composable with other agent systems.
- **Tool telemetry:** Should we record per-tool execution stats (latency, success rate, usage frequency) for observability and agent loop optimization?
