# Architecture Overview

> Revised 2026-06-24 — expanded from sandbox to full autonomous agent

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Web UI (React + Vite)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Chat     │ │ Terminal  │ │ Browser  │ │ File Tree  │ │
│  │ Panel    │ │ (xterm)   │ │ Viewport │ │ + Editor   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket + REST
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Agent Server (TypeScript / Node.js)        │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Agent Loop (plan → tools → observe → repeat)    │   │
│  │  ├─ Context Manager (summarize, checkpoint)      │   │
│  │  ├─ Todo Tracker (visible task list)             │   │
│  │  └─ Error Recovery (retry, escalate)             │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ LLM Provider │ │ Tool Registry│ │ Knowledge Store│  │
│  │ (unified)    │ │ + Dispatch   │ │ (SQLite)       │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ Session Mgr  │ │ Snapshot Mgr │ │ Secrets Vault  │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ Docker API + exec + stdio
                         ▼
┌─────────────────────────────────────────────────────────┐
│           Docker Sandbox (per-session container)         │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Bash   │ │ Git      │ │ Chromium │ │ Runtimes    │ │
│  │ Shell  │ │ (pre-    │ │ (Play-   │ │ (Python,    │ │
│  │ (multi)│ │  authed) │ │  wright) │ │  Node, Go)  │ │
│  └────────┘ └──────────┘ └──────────┘ └─────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ /workspace (mounted volume — repo + user files)    │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Communication Flow

1. User opens Web UI (localhost:3000 or remote host)
2. User creates/resumes a session
3. Agent Server spawns a Docker container (from base image or snapshot)
4. User sends a message via WebSocket
5. Agent Server injects context (knowledge notes, rules, session history)
6. LLM receives system prompt + tool definitions + context + user message
7. LLM generates tool calls -> Agent Server dispatches to sandbox
8. Output streams back via WebSocket -> displayed in UI (chat, terminal, browser panels)
9. Loop until task complete or user intervenes
10. Session log saved to vault

## Key Components

### Agent Loop
The core plan-act-observe cycle. See [[Agent Loop Spec]] (`specs/agent/agent-loop.md`).
- Parallel tool execution for independent calls
- Context management: auto-summarize, checkpoint, token budget tracking
- Todo tracking for multi-step tasks
- Error recovery with retry and escalation

### LLM Provider Layer
Unified interface to any LLM. Supports:
- Ollama (local)
- OpenAI-compatible endpoints (vLLM, LM Studio, OpenRouter)
- OpenAI direct (GPT-4o, etc.)
- Anthropic direct (Claude)
- Fallback: bash-only mode for models without tool calling

### Tool Registry
20+ built-in tools across categories: shell, file, git, browser, search.
User-extensible with custom tools. See [[Tool Registry Spec]] (`specs/tools/tool-registry.md`).

### Environment Snapshots
Pre-built Docker images from `environment.yaml` blueprints.
Eliminates cold-start time. See [[Docker Sandbox Spec]] (`specs/sandbox/docker-sandbox.md`).

### Knowledge System
Persistent memory: knowledge notes, rules, session history, repo maps.
Stored in SQLite. See [[Knowledge System Spec]] (`specs/knowledge/knowledge-system.md`).

## Design Principles

- **Local-first, cloud-optional** — runs on a laptop with Ollama, scales to a VPS
- **Modular layers** — agent loop, tool harness, sandbox, UI are separable
- **Model-agnostic** — any OpenAI-compatible endpoint
- **Snapshot-driven** — environments pre-build once, sessions boot instantly
- **Knowledge-persistent** — agent remembers across sessions
- **Simple to extend** — adding a tool is adding a function + JSON schema
- **Stream everything** — no blocking waits, all output streams in real-time

## Technology Stack

| Component | Choice |
|-----------|--------|
| Agent server | TypeScript (Node.js) |
| Web framework | Hono |
| UI | React + Vite |
| Terminal | xterm.js |
| Editor | CodeMirror 6 |
| Database | SQLite |
| Docker SDK | dockerode |
| Browser automation | Playwright (inside container) |
| Package manager | pnpm (monorepo) |

## Related Specs

- [[Agent Server API]] — `specs/api/agent-server-api.md`
- [[Docker Sandbox]] — `specs/sandbox/docker-sandbox.md`
- [[Tool Registry]] — `specs/tools/tool-registry.md`
- [[Agent Loop]] — `specs/agent/agent-loop.md`
- [[Knowledge System]] — `specs/knowledge/knowledge-system.md`
- [[Web UI]] — `specs/ui/web-ui.md`

## Key Reference

- [[Decisions Log]] — why we chose what we chose
- `docs/devin-vs-sandbox-analysis.md` — full gap analysis vs Devin
