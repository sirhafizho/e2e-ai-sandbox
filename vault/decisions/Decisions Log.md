# Decisions Log

Architecture Decision Records for the E2E AI Sandbox.

## ADR-001: Use Docker for Sandbox Isolation

**Date:** 2026-06-08  
**Status:** Accepted  
**Context:** Need isolation between agent sessions. Options: Docker, VMs (Firecracker), or process-level (nsjail).  
**Decision:** Docker containers. Fast startup (~1s), lightweight, sufficient isolation for dev use.  
**Consequences:** No GPU passthrough without nvidia-docker. Acceptable for v1.

## ADR-002: REST + SSE over MCP for Agent Communication

**Date:** 2026-06-08  
**Status:** Accepted  
**Context:** MCP is the emerging standard for LLM tool access. But OpenHands proves REST + event-stream works at scale.  
**Decision:** REST API with SSE streaming as primary protocol. MCP support can layer on top later.  
**Consequences:** Simpler implementation. May need adapter layer if MCP becomes dominant.

## ADR-003: Spec-First Development (BMAD Lightweight)

**Date:** 2026-06-08  
**Status:** Accepted  
**Context:** Greenfield project with complex interactions. Risk of building wrong things.  
**Decision:** Write behavioral specs for critical paths before implementation. Skip specs for trivial UI/config work.  
**Consequences:** Slower start, but catches interface mismatches early. Specs are living docs, not waterfall.

## Pending Decisions

- [ ] **ADR-004:** Desktop framework — Tauri vs Electron
- [ ] **ADR-005:** Agent server language — TypeScript (Node.js) vs Python (FastAPI)
- [ ] **ADR-006:** Monorepo structure — single repo vs multi-package
