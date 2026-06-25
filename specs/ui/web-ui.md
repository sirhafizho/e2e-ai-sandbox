# Spec: Web UI

**Status:** Draft  
**Priority:** P1 — The user-facing interface. Built after core agent works.  
**Replaces:** Desktop app (Tauri/Electron) — web UI covers both local and self-hosted cloud use cases.

---

## Overview

- Browser-based interface served at `localhost:3000` (local dev) or any host (self-hosted deployment)
- React + Vite frontend
- Communicates with Agent Server via:
  - **WebSocket** — real-time streaming (agent output, terminal, browser screenshots)
  - **REST** — CRUD operations (sessions, settings, files)
- No native dependencies — runs in any modern browser

---

## Layout

4-panel resizable layout (desktop default):

| Panel | Position | Purpose |
|-------|----------|---------|
| **Chat Panel** | Left (primary, ~50% width) | Conversation with agent |
| **Terminal Panel** | Right-top (~50% width, ~33% height) | Sandbox shell access |
| **Browser Panel** | Right-middle (~50% width, ~33% height) | Sandbox Chromium view |
| **File Panel** | Right-bottom (~50% width, ~33% height) | Workspace file tree + editor |

- Panels are resizable via drag handles
- Panels can be collapsed/expanded individually
- Right-side panels can be reordered by the user
- A panel selector/tab bar allows toggling visibility of each panel

---

## Pages

### Sessions Page (`/`)

- List all sessions (active, paused, completed)
- Create new session (model selector, repo URL or blank workspace, initial prompt)
- Resume / delete existing sessions
- Each session card shows:
  - Status badge (`running` | `paused` | `completed` | `error`)
  - Repository name or "blank workspace"
  - Model provider + model name
  - Duration (wall clock)
  - Last message preview (truncated)
  - Created / last active timestamps
- Sort by: last active, created, status
- Filter by: status, model

### Settings Page (`/settings`)

- **LLM Providers**
  - Ollama: base URL, available models (auto-detected via API)
  - OpenAI-compatible: API key, base URL, model list
  - Anthropic: API key, model list
  - Test connection button per provider
- **Docker Configuration**
  - Docker socket path
  - Default container image
  - Resource limits (CPU, memory, disk)
  - Network mode (isolated / host / custom)
- **Knowledge Notes**
  - List / create / edit / delete knowledge notes
  - Notes injected into agent system prompt
  - Markdown editor for note content
  - Tags for categorization
- **Secrets Management**
  - Key-value secret store
  - Secrets available to agent as environment variables in sandbox
  - Masked display (click to reveal)
  - Never sent to LLM — only injected into container env

### Dashboard Page (`/dashboard`) — v2

- Total sessions run, total tokens used, total cost estimate
- Session history with search
- Model usage breakdown (pie chart)
- Knowledge note suggestions based on repeated patterns
- Average session duration, success rate

---

## Real-time Updates

- One WebSocket connection per active session
- Connection URL: `ws://{host}/ws/sessions/{session_id}`
- Automatic reconnection with exponential backoff

### Event Types

| Event | Payload | Updates |
|-------|---------|---------|
| `agent_message` | `{ content, role, streaming }` | Chat Panel — append/stream message |
| `tool_start` | `{ tool_name, tool_input, call_id }` | Chat Panel — show tool invocation card |
| `tool_output` | `{ call_id, output, is_error }` | Chat Panel — update tool card with result |
| `tool_complete` | `{ call_id, duration_ms }` | Chat Panel — finalize tool card |
| `tool_error` | `{ call_id, error, traceback }` | Chat Panel — show error in tool card |
| `todo_update` | `{ todos: [{ content, status }] }` | Chat Panel — update todo checklist |
| `session_status` | `{ status, reason }` | All panels — update session state |
| `terminal_output` | `{ shell_id, data }` | Terminal Panel — append output |
| `browser_screenshot` | `{ url, screenshot_b64, timestamp }` | Browser Panel — update view |
| `file_changed` | `{ path, change_type }` | File Panel — refresh tree |

---

## Chat Panel — Details

- **Streaming markdown rendering**
  - Use `streamdown` with `remark-gfm`
  - Code blocks with syntax highlighting (`rehype-highlight` or `shiki`)
  - Copy button on every code block
  - Inline code, tables, lists all rendered properly
- **User input**
  - Text input at bottom of panel
  - Send with Enter (Shift+Enter for newline)
  - User can type messages at any time to interrupt/guide the agent
  - Input disabled when session is not active
- **Todo list**
  - Rendered as a collapsible checklist widget
  - Items show status: `pending` (unchecked), `in_progress` (spinner), `completed` (checked)
  - Pinned to top of chat or shown as a floating sidebar widget (user preference)
- **Tool invocations**
  - Shown as collapsible cards inline in the chat
  - Card header: tool icon + tool name + input summary (truncated)
  - Card body (expanded): full input, full output, duration
  - Color-coded: blue (running), green (success), red (error)
  - Long outputs truncated with "Show more" toggle
- **File references**
  - Any file path in agent messages is clickable
  - Clicking opens the file in the File Panel at the referenced line
- **Stop button**
  - Visible when agent is actively working
  - Sends cancel request to Agent Server
  - Agent completes current atomic operation then stops

---

## Terminal Panel — Details

- **xterm.js** with `xterm-addon-fit` for auto-resizing
- WebSocket-backed PTY connection to sandbox shell
  - URL: `ws://{host}/ws/sessions/{session_id}/terminal/{shell_id}`
- **Multiple tabs** — one per `shell_id`
  - Tab bar at top of panel
  - "+" button to open a new shell
  - "x" button to close a shell
  - Active tab highlighted
- **User can type directly** into the terminal
  - Keystrokes sent to sandbox shell via WebSocket
  - Output rendered in real-time
- **Agent's `shell_exec` tool calls** produce output in the corresponding tab
  - If the agent creates a new shell, a new tab appears automatically
- **Scrollback buffer** — configurable (default: 10,000 lines)
- **Copy/paste** support
- **Search within terminal** output (Ctrl+F)

---

## Browser Panel — Details

### Phase 1 (v1): Screenshot Stream

- Displays periodic screenshots from sandbox Chromium
- Refresh interval: every 2 seconds during active browser tool use
- Static (last screenshot) when browser tool is idle
- URL bar at top showing the current page URL
- Navigation controls: back, forward, refresh (send commands to sandbox browser)
- Screenshot rendered as `<img>` scaled to fit panel

### Phase 2 (v2): Interactive Browser (noVNC)

- noVNC client embedded in panel for live browser interaction
- User can click, scroll, type directly in the sandbox browser
- Toggle between "view only" and "interactive" mode
- Agent and user can interact with the browser simultaneously (with conflict resolution)

---

## File Panel — Details

- **Tree view** of `/workspace` filesystem
  - Fetched via REST API: `GET /api/sessions/{session_id}/files?path=/workspace`
  - Lazy-loaded (expand directories on click)
  - Icons by file type (folder, JS, Python, Markdown, etc.)
  - Context menu: rename, delete, create file/folder (v2)
- **CodeMirror 6** for file viewing/editing
  - Opens when a file is selected in the tree
  - Syntax highlighting (auto-detected by file extension)
  - Line numbers, minimap
  - Search within file (Ctrl+F)
  - Read-only by default
  - "Edit" toggle to enable editing
  - "Save" button — writes changes back to sandbox via API: `PUT /api/sessions/{session_id}/files`
- **Breadcrumb bar** showing current file path
- **Tab support** — multiple files open as tabs (v2)

---

## Responsive Design

| Viewport | Layout |
|----------|--------|
| **Desktop** (≥1280px) | Full 4-panel layout, side-by-side |
| **Tablet** (768–1279px) | Chat panel full-width on top, right panels stacked below in a tabbed view |
| **Mobile** (<768px) | Chat panel only, bottom nav to switch to Terminal / Browser / Files (one at a time) |

- Panel sizes persist in `localStorage`
- Layout preference (which panels are visible/hidden) persists in `localStorage`

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | React 18+ | Ecosystem, component libraries, familiarity |
| Build tool | Vite | Fast HMR, ESM-native, simple config |
| Terminal | xterm.js + `xterm-addon-fit` | Industry standard web terminal |
| Code editor | CodeMirror 6 (`@uiw/react-codemirror`) | Modular, 5-10x smaller than Monaco |
| API state | TanStack Query (React Query) | Caching, refetching, optimistic updates |
| UI state | Zustand | Minimal, no boilerplate, good devtools |
| Styling | Tailwind CSS | Utility-first, fast iteration, dark mode support |
| WebSocket | Native `WebSocket` API (+ reconnecting wrapper) | No library needed; lightweight |
| Markdown | `streamdown` + `remark-gfm` + `rehype-highlight` | Streaming-first markdown renderer |
| Routing | React Router v6 | Standard choice |
| Icons | Lucide React | Clean, consistent, tree-shakeable |
| Resizable panels | `react-resizable-panels` | Lightweight, accessible |

---

## API Endpoints (Frontend Expectations)

The frontend expects the Agent Server to expose:

### REST

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions/:id` | Get session details |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `POST` | `/api/sessions/:id/messages` | Send user message |
| `POST` | `/api/sessions/:id/stop` | Stop current agent action |
| `GET` | `/api/sessions/:id/files?path=` | List directory or get file content |
| `PUT` | `/api/sessions/:id/files` | Write file content |
| `GET` | `/api/settings` | Get all settings |
| `PUT` | `/api/settings` | Update settings |
| `GET` | `/api/settings/providers` | List configured LLM providers |
| `POST` | `/api/settings/providers/test` | Test provider connection |

### WebSocket

| Endpoint | Purpose |
|----------|---------|
| `ws://{host}/ws/sessions/:id` | Session event stream (chat, tools, status) |
| `ws://{host}/ws/sessions/:id/terminal/:shell_id` | Terminal PTY connection |

---

## Security Considerations

- **Local mode:** No authentication required (localhost only)
- **Remote/self-hosted mode:**
  - v1: API key passed as `Authorization: Bearer <key>` header
  - v2: Proper authentication (OAuth, SSO, or username/password)
- All WebSocket connections must respect the same auth mechanism
- File API must be scoped to `/workspace` — no path traversal
- Secrets are never exposed in the UI beyond masked display
- Content Security Policy (CSP) headers to prevent XSS

---

## Open Questions

| # | Question | Suggestion |
|---|----------|------------|
| 1 | Dark mode only, or light mode too? | Dark-first. Ship with dark theme, add light as an option in v2. Most dev tools are dark-first. |
| 2 | Authentication for remote access? | API key in v1 (simple, stateless). Proper auth (OAuth/OIDC) in v2. |
| 3 | Should the UI be embeddable as an iframe? | Not in v1. Consider in v2 with `postMessage` API for integration. |
| 4 | Notification support? | Browser notifications for session completion when tab is not focused (v2). |
| 5 | Keyboard shortcuts? | Yes — define a shortcut map (Ctrl+Enter to send, Ctrl+1/2/3/4 to switch panels, Escape to stop agent). |
| 6 | Session sharing / read-only URLs? | v2 feature — useful for demos and collaboration. |
