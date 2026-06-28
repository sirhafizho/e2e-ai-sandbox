# CLAUDE.md — Forge (Self-Hostable Autonomous Coding Agent)

## Project Overview

**Forge** (working title) is a self-hostable, open-source autonomous coding agent that gives any LLM (cloud or local) a complete development environment — shell, filesystem, browser, git — inside Docker containers. Anyone with Docker and Ollama can run their own Devin-like agent on their PC. Anyone with a VPS can host it as a cloud agent for their team.

**Current Phase:** Phase 5 — Manual Testing & Refinement (66 bugs fixed across 11 audit rounds, 479 tests passing).
**Overhauled:** 2026-06-24 — scope expanded from "E2E AI Sandbox" to full autonomous agent with knowledge system, snapshots, and web UI.

---

## Session Protocol (MANDATORY)

### Greeting

**At session start**, always:
1. Greet the user: `"Hello Hafiz! [brief context of where we are]"`
2. Read `vault/sessions/` for the latest session log
3. Read `vault/decisions/Decisions Log.md` if making architectural choices
4. State what you understand the current state to be
5. Ask what Hafiz wants to work on (or confirm if a task was given)

**At task completion**, always:
1. Summarize what was done (bullet points)
2. List any open items or blockers
3. Update the session log in `vault/sessions/`
4. Close with: `"Until next time, Hafiz!"`

### Why the Greeting Matters
The named greeting serves as an **anti-hallucination anchor**. It forces the AI to:
- Confirm it knows who it's talking to
- Ground itself in real project context before acting
- Produce a verifiable "I read the vault" checkpoint

---

## Context Management Rules (MANDATORY)

### Todo List Protocol
Every non-trivial task (3+ steps) MUST use a todo list:
1. **Before starting work**: create the todo list with all planned steps
2. **When starting a step**: mark it `in_progress` (only ONE at a time)
3. **When finishing a step**: mark it `completed` immediately (don't batch)
4. **When discovering new work**: add new items to the list
5. **When blocked**: keep the item `in_progress`, add a new item describing the blocker

This mirrors how Devin's agent loop works — visible task tracking for predictability.

### Context Checkpointing
For long tasks that may approach token limits:
1. After every ~10 tool calls, mentally summarize progress
2. If context is getting large, prioritize: system prompt > recent turns > tool outputs > old conversation
3. Key discoveries and decisions should be written to vault notes, not just held in context
4. If a session is getting very long, suggest splitting into a new session with a handoff note

### Vault-First Context Loading
1. **Read vault session logs FIRST** — they contain compressed context from prior work
2. **Don't re-read specs/code if the vault already summarizes them**
3. **Keep session logs concise** — bullet points, not prose. Link to files rather than quoting them
4. **If a vault note is stale, update it**

---

## BMAD Workflow (MANDATORY)

This project follows the **BMad Method** for all development work.

### Workflow Order

1. **Phase 1 — Analysis:** `/bmad-product-brief` or `/bmad-prfaq` -> research skills
2. **Phase 2 — Planning:** `/bmad-prd` -> `/bmad-ux` (if UI)
3. **Phase 3 — Solutioning:** `/bmad-create-architecture` -> `/bmad-create-epics-and-stories` -> `/bmad-check-implementation-readiness`
4. **Phase 4 — Implementation:** `/bmad-sprint-planning` -> `/bmad-create-story` -> `/bmad-dev-story` -> `/bmad-code-review` (cycle)

### Rules

- **Never skip phases.** Check `/bmad-help` if unsure where we are.
- **Never write implementation code without a completed story.** Use `/bmad-dev-story` to execute.
- **Run each BMAD skill in a fresh context window** to maximize token efficiency.
- **Use `/bmad-sprint-status`** at the start of any session to orient yourself.
- **All BMAD artifacts go to `_bmad-output/`** — planning-artifacts/ and implementation-artifacts/.
- **Quick fixes and small features** can use `/bmad-quick-dev` (unified workflow).

---

## Obsidian Vault as Memory (`vault/`)

The `vault/` directory is an **Obsidian vault** that serves as persistent project memory.

### At Session Start
- Read `vault/sessions/` for the latest session log to understand current state
- Read `vault/decisions/Decisions Log.md` for architectural context
- This replaces expensive re-reading of specs/code

### During a Session
- Log decisions, discoveries, and blockers in the current session file
- Update `vault/architecture/` when system design evolves
- Add new ADRs to `vault/decisions/` when design choices are made

### At Session End (MANDATORY)
Create/update `vault/sessions/Session YYYY-MM-DD.md` with:
- What was done
- Decisions made
- Open questions
- Next steps (explicit, actionable)
- Current BMAD phase position

### Vault Structure
```
vault/
├── Home.md                    # Quick links, project status
├── architecture/              # System design
├── decisions/                 # ADR log
├── sessions/                  # Session logs (primary cross-session context)
└── daily/                     # Optional quick notes
```

---

## Project Structure

```
e2e-ai-sandbox/
├── _bmad/                 # BMAD framework (skills, config, agents)
├── _bmad-output/          # BMAD artifacts (planning + implementation)
├── .claude/skills/        # BMAD skills for Claude Code
├── .devin/                # Devin-specific config and skills
├── vault/                 # Obsidian vault (persistent memory)
├── specs/                 # Behavioral specs
│   ├── api/               # Agent server API contract
│   ├── sandbox/           # Docker sandbox spec
│   ├── tools/             # Tool registry spec
│   ├── agent/             # Agent loop & context management
│   ├── knowledge/         # Knowledge system spec
│   └── ui/                # Web UI spec
├── docs/                  # Research docs, analysis, project knowledge
│   ├── research-findings.md
│   ├── devin-vs-sandbox-analysis.md
│   └── devin_harness_engineering.md (reference)
├── packages/              # pnpm monorepo packages
│   ├── server/            # Agent server (TypeScript/Node)
│   ├── sandbox/           # Docker image + container manager
│   ├── ui/                # Web UI (React + Vite)
│   └── shared/            # Shared types and utilities
├── AGENTS.md              # AI agent session rules (greeting, context, protocol)
├── CLAUDE.md              # This file
└── TODO.md                # Phased implementation plan
```

---

## Technology Stack (Decided)

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Agent server | TypeScript (Node.js) | Best Docker SDK, great streaming, same lang as UI |
| Web framework | Hono | 14KB, native WebSocket, edge-compatible |
| UI framework | React + Vite | Widely known, fast dev cycle |
| Terminal | xterm.js | Industry standard web terminal |
| Code editor | CodeMirror 6 | 5-10x smaller than Monaco, modular |
| Database | SQLite | Zero-config, perfect for self-hosted |
| Docker SDK | dockerode | Mature Node.js Docker client |
| LLM integration | Vercel AI SDK | Unified provider interface, streaming-first, Zod-native tools |
| Browser automation | Playwright (in container) | Industry standard, CDP support |
| Package structure | pnpm monorepo | Shared types, atomic commits |
| Desktop app | Web-first, Tauri later (v2) | Web works everywhere |

---

## Key Decisions (Quick Reference)

- Docker containers for per-session isolation (ADR-001)
- REST + SSE/WebSocket for agent<->sandbox communication (ADR-002)
- BMAD full method adopted (ADR-003)
- Web UI over desktop app — covers local + cloud use (ADR-004)
- TypeScript for agent server (ADR-005)
- pnpm monorepo structure (ADR-006)
- Environment snapshots via cached Docker images from `environment.yaml` (ADR-007)
- Knowledge system with SQLite for cross-session memory (ADR-008)
- Named greeting protocol for anti-hallucination anchoring (ADR-009)

---

## Commands

```bash
# BMAD skills (invoke in Claude Code / Devin)
/bmad-help                 # Where am I? What's next?
/bmad-sprint-status        # Current sprint state
/bmad-product-brief        # Phase 1: define the product
/bmad-prd                  # Phase 2: create PRD
/bmad-create-architecture  # Phase 3: document architecture
/bmad-create-epics-and-stories  # Phase 3: break into work
/bmad-dev-story            # Phase 4: implement a story
/bmad-quick-dev            # Anytime: small feature/fix
```
