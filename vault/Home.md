# Forge — Vault Home

> Self-Hostable Autonomous Coding Agent (formerly "E2E AI Sandbox")

**Current Phase:** Phase 3 COMPLETE — UI, integration, polish, settings API, code splitting done
**Last Session:** [[Session 2026-06-26-settings-codesplit]]
**Project Overhauled:** 2026-06-24 — expanded scope from sandbox to full autonomous agent

## Quick Links

- [[Architecture Overview]]
- [[Research Findings]]
- [[Decisions Log]]
- [[BMAD Workflow Reference]]

## Session Start Checklist

1. Greet Hafiz by name
2. Read the latest file in `sessions/` for context
3. Check `decisions/` if making architectural choices
4. Run `/bmad-help` or `/bmad-sprint-status` if using BMAD
5. State your understanding of current project state
6. Log your session at the end (MANDATORY)

## Project Status

| Phase | Status | Key Artifacts |
|-------|--------|---------------|
| Analysis | Done | `docs/research-findings.md`, `docs/devin-vs-sandbox-analysis.md` |
| Planning | Done | `_bmad-output/planning-artifacts/epics-and-stories.md`, `sprint-plan.md` |
| Solutioning | Skipped (covered by analysis) | Specs already detailed enough from overhaul |
| Implementation | Phase 1 DONE (16), Phase 2 DONE (13), Phase 3 DONE (UI + integration + polish + settings API + code splitting) | 258 server tests + UI build |

## Specs Status

| Spec | Status | Path |
|------|--------|------|
| Agent Server API | Draft (revised) | `specs/api/agent-server-api.md` |
| Docker Sandbox + Snapshots | Draft (revised) | `specs/sandbox/docker-sandbox.md` |
| Tool Registry | Draft (revised) | `specs/tools/tool-registry.md` |
| Agent Loop & Context Mgmt | Draft (new) | `specs/agent/agent-loop.md` |
| Knowledge System | Draft (new) | `specs/knowledge/knowledge-system.md` |
| Web UI | Draft (new) | `specs/ui/web-ui.md` |

## Pending Decisions

All major tech decisions resolved. See [[Decisions Log]] ADR-004 through ADR-013.

## Key Reference Docs

- `docs/devin-vs-sandbox-analysis.md` — Gap analysis: Devin vs our project, landscape review, overhaul plan
- `docs/devin_harness_engineering.md` — How Devin Cloud works (reference)
- `docs/research-findings.md` — Original research on OpenHands, SWE-agent, etc.
- `CLAUDE.md` — Project rules, session protocol, tech stack
- `AGENTS.md` — AI agent session protocol (greeting, context, anti-hallucination)
