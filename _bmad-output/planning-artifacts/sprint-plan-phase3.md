# Sprint Plan — Forge Phase 3

> **Generated:** 2026-06-26
> **Phase:** 3 (Web UI)
> **Goal:** Full web interface — open localhost:3000, start a session, watch the agent work in real-time
> **Deliverable:** React + Vite web app with chat, terminal, file viewer, and browser panels
> **Duration:** 3 sprints (3 weeks)

---

## Sprint 7: UI Shell & Chat (Week 7)

**Goal:** Working React app with session management and streaming chat.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 3.1.1 — React + Vite app with routing and layout | UI Shell | L | Phase 2 done |
| 2 | 3.1.2 — Sessions page (list, create, resume, delete) | UI Shell | L | 3.1.1 |
| 3 | 3.2.1 — Streaming markdown chat with assistant-ui | Chat Panel | L | 3.1.1, WebSocket |
| 4 | 3.2.2 — Tool invocation cards (collapsible) | Chat Panel | M | 3.2.1 |

**Sprint 7 Exit Criteria:**
- [ ] React + Vite app serves at localhost:3000
- [ ] 4-panel resizable layout (chat, terminal placeholder, browser placeholder, files placeholder)
- [ ] React Router with /sessions and /settings routes
- [ ] Sessions page lists/creates/resumes/deletes sessions via REST API
- [ ] Chat panel streams agent messages via WebSocket
- [ ] Markdown rendering with syntax-highlighted code blocks
- [ ] Tool invocations shown as collapsible cards inline in chat
- [ ] Dark theme by default

**Rationale:** The chat experience is the core of the UI. Sessions management + streaming chat cover ~80% of the user interaction.

---

## Sprint 8: Terminal & Files (Week 8)

**Goal:** Working terminal and file viewer panels.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 3.2.3 — Todo list widget | Chat Panel | S | 3.2.1 |
| 2 | 3.2.4 — Stop/cancel button | Chat Panel | S | 3.2.1 |
| 3 | 3.3.1 — xterm.js integration with WebSocket PTY | Terminal | L | 3.1.1 |
| 4 | 3.4.1 — File tree with react-arborist | File Panel | M | 3.1.1 |
| 5 | 3.4.2 — CodeMirror 6 file viewer/editor | File Panel | L | 3.4.1 |

**Sprint 8 Exit Criteria:**
- [ ] Todo list rendered as checklist widget in chat
- [ ] Stop button sends cancel to agent via WebSocket
- [ ] xterm.js terminal panel with WebSocket PTY to sandbox shell
- [ ] File tree shows /workspace directory structure
- [ ] Clicking a file opens it in CodeMirror 6 viewer
- [ ] Syntax highlighting by file extension

---

## Sprint 9: Browser Panel, Settings & Polish (Week 9)

**Goal:** Browser panel, settings page, responsive design, final polish.

| # | Story | Epic | Est. | Depends On |
|---|-------|------|------|------------|
| 1 | 3.5.1 — Screenshot stream display | Browser Panel | M | 3.1.1, browser tools |
| 2 | 3.1.3 — Settings page (LLM providers, Docker config) | UI Shell | L | 3.1.1 |
| 3 | 3.3.2 — Multi-tab shell support | Terminal | M | 3.3.1 |

**Sprint 9 Exit Criteria:**
- [ ] Browser panel shows periodic screenshots from sandbox Chromium
- [ ] URL bar shows current page URL
- [ ] Settings page configures LLM providers with test connection
- [ ] Docker config (image, resource limits) manageable from settings
- [ ] Multiple terminal tabs
- [ ] Responsive layout (desktop, tablet, mobile breakpoints)

---

## Story Implementation Order

1. **3.1.1** — React + Vite app scaffolding
2. **3.1.2** — Sessions page
3. **3.2.1** — Streaming markdown chat
4. **3.2.2** — Tool invocation cards
5. **3.2.3** — Todo list widget
6. **3.2.4** — Stop/cancel button
7. **3.3.1** — xterm.js terminal
8. **3.4.1** — File tree
9. **3.4.2** — CodeMirror file viewer
10. **3.5.1** — Browser screenshot display
11. **3.1.3** — Settings page
12. **3.3.2** — Multi-tab shells

---

## Technology Stack

| Concern | Choice |
|---------|--------|
| Framework | React 18+ |
| Build tool | Vite |
| Terminal | xterm.js + xterm-addon-fit |
| Code editor | CodeMirror 6 (@uiw/react-codemirror) |
| State management | Zustand |
| Server state | TanStack Query (React Query) |
| Styling | Tailwind CSS |
| Routing | React Router v7 |
| Icons | Lucide React |
| Resizable panels | react-resizable-panels |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
