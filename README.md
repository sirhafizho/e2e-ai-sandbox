# E2E AI Sandbox

A local-first desktop app giving AI agents (Claude, GPT, Ollama) full access to Docker-isolated workspaces with shell, browser, filesystem, and network capabilities.

## Vision

- Spawn isolated Docker containers per agent session
- Expose tools (shell, browser, file I/O, git) via REST + SSE API
- Support multiple LLM backends (Claude, OpenAI, Ollama)
- Desktop UI for session management, terminal, and browser viewport

## Architecture

```
AI Agent (LLM)
    │ REST API + SSE
    ▼
Agent Server (tool registry, sessions, event streaming)
    │ Docker socket
    ▼
Docker Sandbox (bash, python, node, git, playwright, network)
    │
Desktop UI (terminal, browser viewport, session manager)
```

## Development Method

This project uses the **BMad Method** (v6.8.0) — a spec-driven, AI-native agile framework.

**Workflow:** Analysis → Planning (PRD) → Solutioning (Architecture + Epics) → Implementation (Sprint cycles)

See `CLAUDE.md` for full workflow instructions.

## Project Structure

```
e2e-ai-sandbox/
├── _bmad/                 # BMAD framework (config, agents, module skills)
├── _bmad-output/          # BMAD artifacts
│   ├── planning-artifacts/    # PRD, architecture, epics
│   └── implementation-artifacts/  # Sprint status, stories
├── .claude/skills/        # 44 BMAD skills for Claude Code
├── vault/                 # Obsidian vault (project memory)
├── specs/                 # Legacy specs (migrating into BMAD)
├── docs/                  # Research, project knowledge
├── src/                   # Implementation (Phase 4)
└── CLAUDE.md              # AI assistant instructions
```

## Status

**BMAD Phase 1 complete (Analysis).** Next: `/bmad-product-brief` → `/bmad-prd`.
