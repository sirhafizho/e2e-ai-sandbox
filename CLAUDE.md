# CLAUDE.md — E2E AI Sandbox

## Project Overview

E2E AI Sandbox: a local-first desktop app giving AI agents (Claude, GPT, Ollama) full access to Docker-isolated workspaces with shell, browser, filesystem, and network capabilities.

**Current Phase:** BMAD Phase 1 (Analysis) — preparing to enter Phase 2 (Planning).

## BMAD Workflow (MANDATORY)

This project follows the **BMad Method** for all development work. You MUST use BMAD skills for structured work.

### Workflow Order

1. **Phase 1 — Analysis:** `/bmad-product-brief` or `/bmad-prfaq` → research skills
2. **Phase 2 — Planning:** `/bmad-prd` → `/bmad-ux` (if UI)
3. **Phase 3 — Solutioning:** `/bmad-create-architecture` → `/bmad-create-epics-and-stories` → `/bmad-check-implementation-readiness`
4. **Phase 4 — Implementation:** `/bmad-sprint-planning` → `/bmad-create-story` → `/bmad-dev-story` → `/bmad-code-review` (cycle)

### Rules

- **Never skip phases.** Check `/bmad-help` if unsure where we are.
- **Never write implementation code without a completed story.** Use `/bmad-dev-story` to execute.
- **Run each BMAD skill in a fresh context window** to maximize token efficiency.
- **Use `/bmad-sprint-status`** at the start of any session to orient yourself.
- **All BMAD artifacts go to `_bmad-output/`** — planning-artifacts/ and implementation-artifacts/.
- **Quick fixes and small features** can use `/bmad-quick-dev` (unified workflow).

## Obsidian Vault as Memory (`vault/`)

The `vault/` directory is an **Obsidian vault** that serves as persistent project memory. Use it to avoid re-reading large contexts and to maintain continuity across sessions.

### How to Use the Vault

**At session start:**
- Read `vault/sessions/` for the latest session log to understand current state.
- Read `vault/decisions/Decisions Log.md` for architectural context.
- This replaces expensive re-reading of specs/code — the vault is the compressed context.

**During a session:**
- Log decisions, discoveries, and blockers in the current session file.
- Update `vault/architecture/` when system design evolves.
- Add new ADRs to `vault/decisions/` when design choices are made.

**At session end:**
- Create/update `vault/sessions/Session YYYY-MM-DD.md` with:
  - What was done
  - Decisions made
  - Open questions
  - Next steps (explicit, actionable)
- This is the **primary mechanism for cross-session continuity**.

### Vault Structure

```
vault/
├── Home.md                    # Quick links, project status
├── architecture/              # System design (read for context)
├── decisions/                 # ADR log (read for "why" questions)
├── sessions/                  # Session logs (read latest on startup)
└── daily/                     # Optional quick notes
```

### Token Efficiency Rules

1. **Read vault session logs FIRST** — they contain compressed context from prior work.
2. **Don't re-read specs/code if the vault already summarizes them.** Trust the vault for "what" and "why"; only read source files when you need exact implementation details.
3. **Keep session logs concise** — bullet points, not prose. Link to files rather than quoting them.
4. **If a vault note is stale, update it** rather than ignoring it.

## Project Structure

```
e2e-ai-sandbox/
├── _bmad/                 # BMAD framework (skills, config, agents)
├── _bmad-output/          # BMAD artifacts (planning + implementation)
├── .claude/skills/        # 44 BMAD skills for Claude Code
├── vault/                 # Obsidian vault (persistent memory)
├── specs/                 # Behavioral specs (legacy, migrating to BMAD)
├── docs/                  # Research docs, project knowledge
├── src/                   # Implementation code (empty until Phase 4)
├── TODO.md                # Task breakdown (will be replaced by BMAD sprint)
└── CLAUDE.md              # This file
```

## Commands

```bash
# BMAD skills (invoke in Claude Code)
/bmad-help                 # Where am I? What's next?
/bmad-sprint-status        # Current sprint state
/bmad-product-brief        # Phase 1: define the product
/bmad-prd                  # Phase 2: create PRD
/bmad-create-architecture  # Phase 3: document architecture
/bmad-create-epics-and-stories  # Phase 3: break into work
/bmad-dev-story            # Phase 4: implement a story
/bmad-quick-dev            # Anytime: small feature/fix
```

## Key Decisions (Quick Reference)

- Docker containers for per-session isolation (not VMs)
- REST + SSE for agent↔sandbox communication (not MCP initially)
- Playwright for browser automation
- Provider-agnostic LLM layer (Claude, OpenAI, Ollama)
- Pending: Tauri vs Electron, TypeScript vs Python for server
