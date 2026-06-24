# Forge

**Self-hostable, open-source autonomous coding agent.**

Give any LLM — local or cloud — a complete development environment with shell, filesystem, browser, and git inside Docker containers. Run your own Devin-like agent on your PC with Ollama, or host it on a VPS for your team.

> **Status:** Pre-implementation (specs complete, entering BMAD Phase 2 — Planning). Contributions welcome!

---

## Why Forge?

Autonomous coding agents like Devin are powerful but closed-source, expensive, and cloud-only. Existing open-source alternatives are either too complex (OpenHands), too minimal (mini-SWE-agent), or don't support local LLMs well.

**Forge fills the gap:**

| Feature | Devin | OpenHands | Forge |
|---------|-------|-----------|-------|
| Self-hostable | No | Yes | **Yes** |
| Local LLM (Ollama) | No | Buggy | **First-class** |
| Cloud LLM (GPT, Claude) | Yes | Yes | **Yes** |
| Docker sandbox | VM | Docker | **Docker** |
| Environment snapshots | Yes | No | **Yes** |
| Knowledge/memory system | Yes | No | **Yes** |
| Web UI | Yes | Yes | **Yes** |
| Simple to extend | No | Complex | **Yes** |
| Open source | No | MIT | **MIT** |

## What It Does

```
You: "Clone my-app repo, fix the failing tests, and create a PR"

Forge:
  1. Boots a Docker container with your repo pre-cloned (via snapshot)
  2. Reads the codebase using ripgrep and file tools
  3. Identifies failing tests and traces the bug
  4. Edits the code to fix it
  5. Runs tests to verify
  6. Commits and creates a pull request
  7. Reports back with the PR link
```

All inside an isolated container. Your host machine stays clean.

## Architecture

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
│  │ (unified)    │ │ (20+ tools)  │ │ (SQLite)       │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ Docker API
                         ▼
┌─────────────────────────────────────────────────────────┐
│           Docker Sandbox (per-session container)         │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Bash   │ │ Git      │ │ Chromium │ │ Python,     │ │
│  │ Shells │ │          │ │ (Play-   │ │ Node, Go    │ │
│  │ (multi)│ │          │ │  wright) │ │             │ │
│  └────────┘ └──────────┘ └──────────┘ └─────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ /workspace (your code lives here)                  │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Key Features

### Model Agnostic
Works with any LLM via a unified provider interface:
- **Local:** Ollama (Qwen2.5-Coder, DeepSeek, CodeLlama, Llama 3)
- **Cloud:** OpenAI (GPT-4o), Anthropic (Claude), OpenRouter
- **Any OpenAI-compatible endpoint:** vLLM, LM Studio, llama.cpp

### 20+ Built-in Tools
| Category | Tools |
|----------|-------|
| **Shell** | Execute commands, multiple concurrent shells, background processes, stdin |
| **Files** | Read, write, edit, multi-edit, grep (ripgrep), find |
| **Git** | Status, diff, log, commit, push, create PR, check CI |
| **Browser** | Navigate, click, type, screenshot, evaluate JS |
| **Search** | Web search for documentation lookup |

### Environment Snapshots
Pre-build your development environment once, boot in seconds:

```yaml
# environment.yaml
name: my-project
repos:
  - url: https://github.com/user/repo
    path: /workspace/repo
setup:
  - cd /workspace/repo && npm install
```

```bash
forge snapshot build environment.yaml   # Build once (~2 min)
forge chat --snapshot my-project        # Boot in <5 seconds
```

### Knowledge System
The agent gets smarter over time:
- **Knowledge notes** — persistent context ("this project uses Prisma", "always run lint")
- **Rules** — auto-loaded from AGENTS.md, .cursorrules, etc.
- **Session history** — compressed logs of past sessions
- **Repo map** — auto-generated codebase overview via tree-sitter

### Context Management
Handles long tasks without hitting token limits:
- Auto-summarization of old conversation turns
- Checkpointing with resume capability
- Token budget tracking with configurable thresholds
- Visible todo list for multi-step tasks

## Quick Start

> **Note:** Implementation is in progress. These commands represent the target UX.

### Prerequisites
- Docker Desktop (or Docker Engine on Linux)
- Node.js 22+
- An LLM provider:
  - **Local:** [Ollama](https://ollama.ai) with a coding model (`ollama pull qwen2.5-coder:27b`)
  - **Cloud:** API key for OpenAI, Anthropic, or OpenRouter

### Install

```bash
# Clone the repo
git clone https://github.com/sirhafizho/e2e-ai-sandbox.git
cd e2e-ai-sandbox

# Install dependencies
pnpm install

# Build the sandbox Docker image
pnpm run sandbox:build

# Start the server + UI
pnpm run dev
```

### Using Docker Compose (Simplest)

```bash
docker compose up
# Open http://localhost:3000
```

### CLI Mode

```bash
# Chat with the agent
forge chat "set up a new Express API with TypeScript and write tests"

# Use a specific model
forge chat --model ollama/qwen2.5-coder:27b "fix the auth bug in src/auth.ts"

# Use a snapshot
forge chat --snapshot my-project "add dark mode to the settings page"
```

## Configuration

```bash
# Set your LLM provider
forge config set llm.provider ollama
forge config set llm.model qwen2.5-coder:27b

# Or use cloud providers
forge config set llm.provider openai
forge config set llm.api_key sk-...

# Check everything works
forge doctor
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Agent server | TypeScript, Node.js, Fastify/Hono |
| Web UI | React, Vite, xterm.js, Monaco Editor |
| Database | SQLite (zero-config) |
| Docker SDK | dockerode |
| Browser automation | Playwright (inside container) |
| Package manager | pnpm (monorepo) |
| Sandbox | Docker containers (Ubuntu 22.04) |

## Project Structure

```
e2e-ai-sandbox/
├── packages/
│   ├── server/          # Agent server + agent loop + tool registry
│   ├── sandbox/         # Dockerfile + container manager
│   ├── ui/              # React web UI
│   └── shared/          # Shared TypeScript types
├── specs/               # Behavioral specifications
│   ├── agent/           # Agent loop & context management
│   ├── api/             # REST + WebSocket API contract
│   ├── knowledge/       # Knowledge system
│   ├── sandbox/         # Docker sandbox + snapshots
│   ├── tools/           # Tool registry (20+ tools)
│   └── ui/              # Web UI spec
├── docs/                # Research & analysis
├── vault/               # Project memory (Obsidian vault)
├── AGENTS.md            # AI agent session rules
├── CLAUDE.md            # Project instructions
├── CONTRIBUTING.md      # How to contribute
└── LICENSE              # MIT
```

## Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| **1. Foundation** | Docker sandbox, core tools, LLM provider, CLI agent loop | Planned |
| **2. Persistence** | Multi-turn conversations, snapshots, git/browser tools | Planned |
| **3. Web UI** | Chat, terminal, browser, file panels | Planned |
| **4. Knowledge** | Notes, rules, session history, repo maps, context management | Planned |
| **5. Distribution** | Docker Compose, docs, multi-session, plugins, auth | Planned |

See [TODO.md](TODO.md) for the detailed task breakdown.

## Inspired By

- [Devin](https://devin.ai) — the vision of an autonomous coding agent (closed source)
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) — open-source agent platform
- [mini-SWE-agent](https://github.com/princeton-nlp/SWE-agent) — minimal, proven agent architecture
- [Aider](https://github.com/paul-gauthier/aider) — git-first AI pair programming

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where help is especially welcome:
- LLM provider integrations
- New tools for the sandbox
- Docker image optimization
- Web UI components
- Documentation and tutorials

## License

[MIT](LICENSE) - use it, fork it, build on it.

---

**Forge** is built by [sirhafizho](https://github.com/sirhafizho). If you find it useful, give it a star!
