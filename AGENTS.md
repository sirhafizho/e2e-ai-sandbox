# AGENTS.md — Session Protocol for All AI Agents

> This file is auto-loaded by AI coding agents (Claude Code, Devin, Cursor, Copilot, etc.) to establish session behavior, context management, and continuity rules.

---

## Identity & Greeting

**Project:** Forge — Self-Hostable Autonomous Coding Agent
**User:** Hafiz (always address by name)

### Session Start Protocol

Every session MUST begin with:

```
Hello Hafiz! [one-line context: what phase we're in, what happened last session]
```

Then:
1. Read `vault/sessions/` — find the latest session log, summarize current state
2. Read `vault/decisions/Decisions Log.md` — check for recent architectural decisions
3. State your understanding of where we are
4. Confirm or ask what Hafiz wants to work on

### Session End Protocol

Every session MUST end with:

```
Until next time, Hafiz!
```

Before closing:
1. Summarize what was accomplished (bullet points)
2. List open items or blockers
3. Create/update `vault/sessions/Session YYYY-MM-DD.md` with:
   - What was done
   - Decisions made
   - Open questions
   - Next steps (explicit, actionable)
   - Current BMAD phase

---

## Context Management

### Todo Lists (MANDATORY for 3+ step tasks)

Use structured task tracking for any non-trivial work:

| Rule | Description |
|------|-------------|
| **Create before starting** | Plan all steps as a todo list before writing any code |
| **One in-progress at a time** | Only mark one item as `in_progress` |
| **Mark complete immediately** | Don't batch completions — mark done as soon as a step finishes |
| **Add discovered work** | If you find new steps, add them to the list |
| **Never silently drop items** | If a task becomes irrelevant, explicitly remove it with a note |

This mirrors Devin's task tracking — it makes AI work predictable and auditable.

### Context Checkpointing

For long sessions:
1. **Every ~10 tool calls**: mentally assess if context is growing large
2. **At 70% token budget**: start summarizing older conversation turns
3. **At 85% token budget**: checkpoint state to vault and suggest a fresh session
4. **Key discoveries go to vault**: don't rely on conversation memory for important findings
5. **Suggest session splits**: if a task is taking many turns, recommend splitting

### Vault-First Loading

Priority order for understanding project state:
1. `vault/sessions/` (latest) — what happened recently
2. `vault/decisions/` — why things are the way they are
3. `vault/architecture/` — how things are designed
4. `CLAUDE.md` / `AGENTS.md` — project rules and conventions
5. `specs/` — behavioral specifications
6. `docs/` — research and analysis
7. Source code — only when you need exact implementation details

**Never re-read source files if the vault already summarizes them.**

---

## Project Rules

### Development Workflow
- Follow BMAD phases: Analysis -> Planning -> Solutioning -> Implementation
- Never write implementation code without a completed story (`/bmad-dev-story`)
- Quick fixes can use `/bmad-quick-dev`
- All BMAD artifacts go to `_bmad-output/`

### Code Conventions (when we reach implementation)
- TypeScript for all server and shared code
- React + Vite for UI
- pnpm for package management
- Monorepo structure: `packages/server`, `packages/sandbox`, `packages/ui`, `packages/shared`
- SQLite for persistence (no external database)
- Docker for sandbox isolation

### Commit Messages
- Concise, focused on "why" not "what"
- No co-author lines (Hafiz is sole author)
- Use conventional commits when appropriate (feat:, fix:, docs:, etc.)

### Documentation
- Keep specs in `specs/` as behavioral requirements
- Keep research/analysis in `docs/`
- Keep session context in `vault/sessions/`
- Keep architectural decisions in `vault/decisions/`
- Update docs when things change — stale docs are worse than no docs

---

## Anti-Hallucination Measures

These rules exist to reduce AI hallucination and improve session quality:

1. **Named greeting** — forces grounding in real context
2. **Vault-first loading** — prevents fabricating project state
3. **Todo lists** — creates verifiable checkpoints
4. **Session logs** — written evidence of what actually happened
5. **Never assume** — if unsure about project state, read the vault or ask Hafiz
6. **Verify before answering** — check files, run commands, search code before stating facts about the codebase

---

## Quick Reference

| Item | Location |
|------|----------|
| Project overview | `CLAUDE.md` |
| Session protocol | This file (`AGENTS.md`) |
| Architecture | `vault/architecture/Architecture Overview.md` |
| Decisions | `vault/decisions/Decisions Log.md` |
| Latest session | `vault/sessions/` (most recent file) |
| Specs | `specs/` (api, sandbox, tools, agent, knowledge, ui) |
| Research | `docs/research-findings.md` |
| Gap analysis | `docs/devin-vs-sandbox-analysis.md` |
| Devin reference | `docs/devin_harness_engineering.md` |
| TODO | `TODO.md` |
| BMAD | `_bmad/`, `.claude/skills/` |
