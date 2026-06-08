# E2E AI Sandbox

An end-to-end AI agent sandbox — a local-first development environment that gives AI agents (Claude, GPT, Ollama, etc.) full access to a Docker-isolated workspace with shell, browser, filesystem, and network capabilities.

## Vision

Build a desktop application that:
- Spawns isolated Docker containers per agent session
- Exposes tools (shell, browser, file I/O, git) via a REST + event-stream API
- Supports multiple LLM backends (Claude, OpenAI, Ollama)
- Provides a desktop UI for session management, terminal emulation, and browser viewport

## Architecture

```
┌─────────────────────────────────────────┐
│  AI Agent (Local LLM / Claude / GPT)    │
└────────────┬────────────────────────────┘
             │ JSON-RPC 2.0 / REST API
             ▼
┌─────────────────────────────────────────┐
│  Agent Server (Node.js / Python)        │
│  - Tool registry                        │
│  - Event streaming                      │
│  - Session management                   │
└────────────┬────────────────────────────┘
             │ Docker socket / stdio
             ▼
┌─────────────────────────────────────────┐
│  Docker Sandbox (per-session)           │
│  ├─ Bash shell (full CLI access)       │
│  ├─ Python/Node/Langs (runtime env)    │
│  ├─ Git (repo management)              │
│  ├─ Chromium (Playwright)              │
│  ├─ File system (read/write)           │
│  └─ Network access (curl, wget, etc.)  │
└─────────────────────────────────────────┘

Desktop/Mac UI (TBD: Tauri or Electron)
├─ Session manager
├─ Tool output viewer
├─ Terminal emulator (xterm)
└─ Browser viewport
```

## Development Methodology

This project uses **lightweight BMAD** (Behavior-Mapping & Artifact-Driven) — spec-first development for critical paths:
- Agent ↔ Sandbox API contract
- Tool dispatch system
- Session isolation model

Specs live in `specs/` and are mirrored in the Obsidian vault (`vault/`) for human navigation.

## Project Structure

```
e2e-ai-sandbox/
├── specs/           # BMAD behavioral specs (source of truth)
│   ├── api/         # Agent-server API contracts
│   ├── sandbox/     # Docker sandbox behavior
│   ├── tools/       # Tool definitions and dispatch
│   └── ui/          # Desktop UI specs (later)
├── docs/            # Research, ADRs, notes
├── vault/           # Obsidian vault (sessions, decisions, architecture)
├── src/             # Implementation (empty until specs are approved)
└── TODO.md          # Spec-first task breakdown
```

## Status

**Phase: Specification** — No implementation yet. Defining contracts and behaviors first.
