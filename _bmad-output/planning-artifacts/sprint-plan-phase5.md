# Sprint Plan — Phase 5: Manual Testing & Refinement

> **Generated:** 2026-06-27
> **Phase:** 5 — Manual Testing & Refinement
> **Goal:** Wire all disconnected code, tune for 7B, then battle-test until ship-ready
> **Audit findings:** 27 issues (5 P0, 9 P1, 9 P2, 4 P3) — see `phase5-audit-findings.md`
> **Story files:** `_bmad-output/implementation-artifacts/stories/A*.md`

---

## Track A: Wire & Tune (20 stories, ~4 sprints)

Must complete before testing can begin. Each sprint is independent — any session can pick up a sprint.

### Sprint A1: Critical Wiring (P0 — blocks all testing)

**Goal:** Connect the 5 most critical pieces of dead code so the product actually functions.

| Order | Story | File | Size | Depends On |
|-------|-------|------|------|------------|
| 1 | A1.1 Wire knowledge injection into agent loop | `A1-1-wire-knowledge-injection.md` | M | — |
| 2 | A1.2 Wire repo map generation on session creation | `A1-2-wire-repo-map-generation.md` | M | A1.1 |
| 3 | A1.3 Emit todo_update events from agent loop | `A1-3-emit-todo-update-events.md` | S | — |
| 4 | A1.4 Wire browser screenshots to UI | `A1-4-wire-browser-screenshots-to-ui.md` | S | — |
| 5 | A1.5 Accept repo_url in session creation | `A1-5-accept-repo-url-in-session-creation.md` | M | — |

**Parallelism:** A1.3, A1.4, A1.5 are independent of each other and of A1.1. Only A1.2 depends on A1.1.

**After Sprint A1:** The agent will have knowledge context, the UI will show todos and browser screenshots, and sessions can clone repos.

---

### Sprint A2: Agent Loop Completeness (P0-P1)

**Goal:** Wire the remaining agent loop features — checkpointing, summarization escalation, idle timeout.

| Order | Story | File | Size | Depends On |
|-------|-------|------|------|------------|
| 1 | A2.1 Wire checkpoint creation at 95% token budget | `A2-1-wire-checkpoint-creation.md` | M | A1.1 |
| 2 | A2.2 Wire forced summarization at 85% | `A2-2-wire-forced-summarization.md` | S | — |
| 3 | A2.3 Wire selective retention | `A2-3-wire-selective-retention.md` | M | — |
| 4 | A2.4 Wire idle monitor | `A2-4-wire-idle-monitor.md` | M | — |
| 5 | A2.5 Wire checkpoint restore on resume | `A2-5-wire-checkpoint-restore.md` | S | A2.1 |

**Parallelism:** A2.2, A2.3, A2.4 are all independent. A2.1 and A2.5 are sequential.

**After Sprint A2:** Long sessions will checkpoint gracefully, tool outputs will be intelligently truncated, and idle sessions will timeout.

---

### Sprint A3: 7B Model Tuning

**Goal:** Tune the orchestration layer so the 7B model can actually complete tasks reliably.

| Order | Story | File | Size | Depends On |
|-------|-------|------|------|------------|
| 1 | A3.1 Tune effective context window for 7B | `A3-1-tune-context-window-for-7b.md` | M | A2.2, A2.3 |
| 2 | A3.2 Optimize system prompt for small models | `A3-2-optimize-system-prompt-for-small-models.md` | L | A1.1 |
| 3 | A3.3 Compress tool output more aggressively | `A3-3-compress-tool-output.md` | M | A2.3 |
| 4 | A3.4 Limit tool definitions per turn | `A3-4-limit-tool-definitions.md` | L | — |
| 5 | A3.5 Add micro-step hints after tool results | `A3-5-add-micro-step-hints.md` | M | — |

**Parallelism:** A3.4 and A3.5 are independent of everything. A3.1-A3.3 have soft dependencies on A2 work.

**After Sprint A3:** The 7B model should be able to complete simple tasks (create files, run commands, read code) reliably.

---

### Sprint A4: UI Feature Completion (P1-P2)

**Goal:** Polish the remaining UI gaps so all panels are functional.

| Order | Story | File | Size | Depends On |
|-------|-------|------|------|------------|
| 1 | A4.1 Add file write endpoint + enable editor | `A4-1-add-file-write-endpoint.md` | M | — |
| 2 | A4.2 Wire terminal multi-tab support | `A4-2-wire-terminal-multi-tab.md` | S | — |
| 3 | A4.3 Fix session list missing fields | `A4-3-fix-session-list-fields.md` | S | — |
| 4 | A4.4 Wire note suggester on session end | `A4-4-wire-note-suggester.md` | M | A1.1 |
| 5 | A4.5 Wire secrets injection into containers | `A4-5-wire-secrets-injection.md` | S | — |

**Parallelism:** A4.1, A4.2, A4.3, A4.5 are all independent. Only A4.4 depends on A1.1.

**After Sprint A4:** Users can edit files in the UI, use multiple terminal tabs, see session message counts, get knowledge note suggestions, and have secrets available in containers.

---

## Track B & C: Testing (after Track A)

No formal stories — freeform iteration driven by Hafiz.

### Track B: Greenfield Testing
- Build from scratch tasks (blank workspace)
- Tests: orchestration quality, UI/UX, tool execution
- Suggested workflows in `phase5-manual-testing-plan.md`

### Track C: Brownfield Testing
- Work on existing repos (cloned via repo_url)
- Tests: knowledge injection, repo maps, rules, context management
- Suggested workflows in `phase5-manual-testing-plan.md`

---

## Recommended Execution Order

1. **Start with Sprint A1** — unblocks everything
2. **Then A2 and A4 in parallel** — A2 is agent-side, A4 is UI-side, minimal overlap
3. **Then A3** — tuning works best after all the plumbing is connected
4. **Then Track B** — greenfield testing (simpler, validates core flow)
5. **Then Track C** — brownfield testing (harder, validates knowledge system)

---

## How to Start a New Session

Each story file is self-contained. To start implementing in a fresh session:

1. Pick a story from the sprint you're working on
2. Read the story file: `_bmad-output/implementation-artifacts/stories/A{sprint}-{number}-{name}.md`
3. It contains: problem description, exact files to modify, code locations, acceptance criteria, verification steps
4. Implement, test, commit
5. Mark story as `done` in `sprint-status.yaml`

---

## Definition of Done (per story)

- [ ] All acceptance criteria met
- [ ] `pnpm test` passes (all 352+ tests)
- [ ] `pnpm typecheck` passes
- [ ] No regressions in existing functionality
- [ ] Changes committed with descriptive message
