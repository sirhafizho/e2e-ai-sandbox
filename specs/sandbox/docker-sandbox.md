# Spec: Docker Sandbox

**Status:** Draft  
**Priority:** P0 — The execution environment for all agent work.

## Overview

Each agent session gets an isolated Docker container with pre-installed tools, runtimes, and browser capabilities.

## Behavioral Requirements

### Container Lifecycle

1. **Spawn** — Container created from base image, workspace volume mounted, health-checked.
2. **Ready** — Container responds to health probe, tools are available.
3. **Running** — Accepts tool invocations, streams output.
4. **Teardown** — Container stopped, removed. Workspace volume optionally persisted.

### Base Image Contents

| Layer | Contents |
|-------|----------|
| OS | Ubuntu 22.04 (slim) |
| Shell | bash, zsh |
| Languages | Python 3.11+, Node.js 20+, Go (optional) |
| Tools | git, curl, wget, jq, ripgrep, fd |
| Browser | Chromium + Playwright |
| Package managers | pip, npm, apt |

### Resource Limits

| Resource | Default | Configurable |
|----------|---------|-------------|
| CPU | 2 cores | Yes |
| Memory | 4 GB | Yes |
| Disk | 10 GB | Yes |
| Network | Enabled (outbound only) | Can restrict |
| Max runtime | 1 hour | Yes |

### Security Boundaries

- No access to host filesystem (except workspace mount)
- No access to Docker socket (no container escape)
- No privileged mode
- Outbound network only (no inbound listeners unless explicitly opened)
- Optional: fully isolated network (air-gapped mode)

### Workspace Model

- `/workspace/` — Mounted volume, persists across tool invocations within a session
- Agent can clone repos, create files, run builds — all within `/workspace/`
- On session destroy: workspace optionally archived or deleted

## Open Questions

- Pre-warm pool (keep N containers ready for instant start)?
- GPU passthrough for ML workloads?
- Custom base images (user-defined Dockerfiles)?
