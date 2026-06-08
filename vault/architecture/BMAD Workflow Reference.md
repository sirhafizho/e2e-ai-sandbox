# BMAD Workflow Reference

Quick reference for the BMad Method as configured in this project.

## Phase Flow

```
Phase 1: Analysis (optional, exploratory)
  └─ /bmad-product-brief OR /bmad-prfaq
  └─ /bmad-market-research, /bmad-domain-research, /bmad-technical-research

Phase 2: Planning (REQUIRED)
  └─ /bmad-prd (create PRD)
  └─ /bmad-ux (if UI-heavy — yes for us)

Phase 3: Solutioning (REQUIRED)
  └─ /bmad-create-architecture
  └─ /bmad-create-epics-and-stories
  └─ /bmad-check-implementation-readiness (gate check)

Phase 4: Implementation (REQUIRED)
  └─ /bmad-sprint-planning
  └─ Loop: /bmad-create-story → /bmad-dev-story → /bmad-code-review
  └─ /bmad-retrospective (per epic)
```

## Agents

| Agent | Persona | Role |
|-------|---------|------|
| Mary | Analyst | Strategic research, evidence-grounded discovery |
| John | PM | Jobs-to-be-Done, user value first |
| Sally | UX Designer | Empathy + rigor, starts simple |
| Winston | Architect | Boring tech, trade-offs over verdicts |
| Paige | Tech Writer | Structured docs, clarity |
| Amelia | Developer | Test-first, no fluff, precision |

## Key Rules

- Each skill runs in a **fresh context window** (saves tokens)
- Artifacts output to `_bmad-output/planning-artifacts/` or `implementation-artifacts/`
- Use `/bmad-help` when lost
- Use `/bmad-quick-dev` for small scope bypassing full ceremony

## Artifact Locations

- PRD: `_bmad-output/planning-artifacts/prd.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Epics/Stories: `_bmad-output/planning-artifacts/epics-and-stories.md`
- Sprint Status: `_bmad-output/implementation-artifacts/sprint-status.md`
- Stories: `_bmad-output/implementation-artifacts/stories/`
