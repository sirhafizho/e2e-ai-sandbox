# Spec: Docker Sandbox & Environment Snapshots

**Status:** Draft (Revised 2026-06-24)  
**Priority:** P0 — The execution environment for all agent work.

---

## Overview

Each agent session gets an isolated Docker container with pre-installed tools, runtimes, and browser capabilities. Containers can boot from either:

1. **Generic base image** — a stock sandbox with all core tools pre-installed, or
2. **Snapshot image** — a pre-built Docker image created from an `environment.yaml` blueprint that includes cloned repos, installed dependencies, and project-specific tooling.

Snapshots eliminate cold-start time by pre-cloning repos and pre-installing dependencies. Without them, every session pays a 2–5 minute setup tax. With them, sessions boot in under 5 seconds.

---

## Container Lifecycle

```
CREATING ──> HEALTH_CHECK ──> READY ──> RUNNING ──> PAUSED ──> TEARDOWN
                                          │                       ▲
                                          └───────────────────────┘
```

| State | Description |
|-------|-------------|
| **CREATING** | Container spawned from base or snapshot image, workspace volume mounted. |
| **HEALTH_CHECK** | Container responds to health probe; core tools verified (`bash`, `git`, `node`, `python`). |
| **READY** | Health check passed. Container accepts tool invocations. |
| **RUNNING** | Actively executing tools, streaming output back to the agent server. |
| **PAUSED** | Container paused (`docker pause`), workspace preserved. Can resume instantly. |
| **TEARDOWN** | Container stopped and removed. Workspace volume optionally persisted/archived. |

### Transitions

1. **CREATING → HEALTH_CHECK** — Automatic once container start returns.
2. **HEALTH_CHECK → READY** — All health probes pass within timeout (default 30s).
3. **HEALTH_CHECK → TEARDOWN** — Health check fails after retries; container is torn down.
4. **READY → RUNNING** — First tool invocation received.
5. **RUNNING → PAUSED** — Explicit pause request or idle timeout.
6. **PAUSED → RUNNING** — Resume request (`docker unpause`).
7. **RUNNING → TEARDOWN** — Session ends, max runtime exceeded, or explicit destroy.

---

## Base Image Contents

| Layer | Contents |
|-------|----------|
| OS | Ubuntu 22.04 (slim) |
| Shell | bash, zsh |
| Languages | Python 3.12+, Node.js 22+, Go 1.22+ (optional) |
| Tools | git, curl, wget, jq, ripgrep, fd, tree, htop |
| Browser | Chromium + Playwright |
| Package managers | pip, npm/pnpm, apt |
| Editor tools | None (agent uses file tools, not vim/nano) |

The base image is built and tagged as `forge-sandbox:latest`. It is rebuilt when `Dockerfile.sandbox` changes and versioned with the project.

---

## Environment Snapshots (Blueprints)

> Inspired by Devin's environment blueprints. See ADR-007.

Snapshots are **pre-built Docker images** that contain a ready-to-use development environment — repos already cloned, dependencies already installed, tools already configured.

### Why Snapshots Matter

| Scenario | Boot Time | User Experience |
|----------|-----------|-----------------|
| **Without snapshot** | 2–5 minutes (clone + install) | Frustrating wait every session |
| **With snapshot** | < 5 seconds | Instant start, feels like reopening a project |

For any project a user works on repeatedly, snapshots are the difference between usable and unusable.

### Blueprint Format (`environment.yaml`)

Each project can define an `environment.yaml` that describes its development environment:

```yaml
# environment.yaml — Blueprint for building a snapshot image
name: my-project-env
base: forge-sandbox:latest

repos:
  - url: https://github.com/user/repo
    path: /workspace/repo
    branch: main

setup:
  - cd /workspace/repo && npm install
  - cd /workspace/repo && pip install -r requirements.txt

tools:
  - rust
  - go

env:
  NODE_ENV: development
  DATABASE_URL: "sqlite:///workspace/data.db"

health_check:
  - node --version
  - python3 --version
  - cd /workspace/repo && npm run typecheck

resources:
  cpu: 2
  memory: 4GB
  disk: 10GB
```

#### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable name for the snapshot. |
| `base` | No | Base image to build from. Defaults to `forge-sandbox:latest`. |
| `repos` | No | List of git repositories to clone into the snapshot. |
| `repos[].url` | Yes | Git clone URL (HTTPS). |
| `repos[].path` | Yes | Absolute path inside the container. |
| `repos[].branch` | No | Branch to check out. Defaults to default branch. |
| `setup` | No | Shell commands to run in order (e.g., install dependencies). |
| `tools` | No | Additional tools/languages to install beyond the base image. |
| `env` | No | Environment variables to bake into the snapshot. |
| `health_check` | No | Commands that must all exit 0 for the snapshot to be considered valid. |
| `resources` | No | Resource hints for containers booted from this snapshot. |

### Snapshot Build Process

```
┌─────────────────┐
│  Base Image      │
│  (forge-sandbox) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Clone Repos     │  git clone each repos[] entry
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Install Tools   │  install additional tools[] if any
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Run Setup       │  execute setup[] commands in order
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Set Env Vars    │  bake env[] into the image
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Health Check    │  run health_check[] — all must pass
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Commit Image    │  docker commit → tagged with content hash
└─────────────────┘
```

1. Start a container from the base image.
2. Clone all repos listed in `repos[]`.
3. Install any additional tools from `tools[]`.
4. Run `setup[]` commands in order. If any command fails, the build fails.
5. Set environment variables from `env[]`.
6. Run `health_check[]` commands. All must exit 0 or the build fails.
7. Commit the container as a new Docker image, tagged with the SHA-256 hash of the `environment.yaml` content.
8. Cache the image in the local registry.

### Snapshot Caching

| Property | Value |
|----------|-------|
| **Cache key** | SHA-256 hash of `environment.yaml` file contents |
| **Rebuild trigger** | Any change to `environment.yaml` |
| **Storage** | Local Docker image registry |
| **Naming** | `forge-snapshot:{name}-{hash[:12]}` |

#### CLI Commands

```bash
# Build a snapshot from an environment.yaml
forge snapshot build [path/to/environment.yaml]

# List all cached snapshots
forge snapshot list

# Prune old/unused snapshots
forge snapshot prune

# Inspect a snapshot (show layers, size, age)
forge snapshot inspect <name>

# Force rebuild (ignore cache)
forge snapshot build --no-cache [path/to/environment.yaml]
```

### Differential Builds (v2)

In a future iteration, snapshot builds will support differential updates:

- Detect what changed in `environment.yaml` (e.g., only a new `setup` command added).
- Only re-run changed steps instead of rebuilding from scratch.
- Leverage Docker layer caching where possible.
- Track step hashes individually for fine-grained invalidation.

---

## Resource Limits

| Resource | Default | Configurable | Max |
|----------|---------|--------------|-----|
| CPU | 2 cores | Yes | Host max |
| Memory | 4 GB | Yes | Host max |
| Disk | 10 GB | Yes | 50 GB |
| Network | Outbound only | Can restrict to air-gapped | — |
| Max runtime | 1 hour | Yes | 24 hours |
| Max file size | 100 MB | Yes | 1 GB |

Resource limits are set at container creation time via Docker's `--cpus`, `--memory`, and `--storage-opt` flags. The `resources` field in `environment.yaml` provides defaults that can be overridden at session creation.

---

## Security Boundaries

### Container Isolation

- **No host filesystem access** — only the workspace volume is mounted at `/workspace`.
- **No Docker socket** — prevents container escape; the container cannot manage other containers.
- **No privileged mode** — never run with `--privileged`.
- **Drop all capabilities** — `--cap-drop ALL`, then add back only what's required.
- **Read-only rootfs** — `--read-only`, with writable tmpfs mounts for `/workspace`, `/tmp`, and `/var`.
- **No new privileges** — `--security-opt no-new-privileges`.
- **PID limit** — `--pids-limit 256` (prevents fork bombs).
- **File descriptor limit** — `--ulimit nofile=1024:1024`.

### Network Isolation

- **Default:** Outbound only. No inbound listeners unless explicitly configured.
- **Air-gapped mode:** Fully isolated network (`--network none`) for sensitive work. All dependencies must be pre-installed via snapshot.

### Docker Run Flags (Reference)

```bash
docker run \
  --rm \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 256 \
  --ulimit nofile=1024:1024 \
  --cpus 2 \
  --memory 4g \
  --tmpfs /tmp:size=1g \
  --tmpfs /var:size=512m \
  -v "${WORKSPACE_DIR}:/workspace" \
  --network forge-outbound-only \
  forge-sandbox:latest
```

---

## Workspace Model

```
/workspace/                  ← Mounted volume (read-write)
├── repo/                    ← Cloned repository (or multiple repos)
├── .forge/                  ← Agent metadata, logs
│   ├── session.json         ← Session state
│   └── tool-output/         ← Cached tool outputs
└── (agent-created files)
```

### Behavior

- `/workspace/` is a Docker volume mounted into the container. It persists across tool invocations within a single session.
- The agent clones repos, creates files, runs builds — all within `/workspace/`.
- When booting from a snapshot, `/workspace/` is pre-populated with cloned repos and installed dependencies.

### On Session Destroy

- **Default:** Workspace is deleted with the container.
- **Archive mode:** Workspace is archived to `~/.forge/archives/{session_id}.tar.gz` before deletion.
- **Persist mode:** Workspace volume is retained for reuse in a future session.

---

## Container Pre-warming (v2)

For latency-sensitive deployments, a pool of pre-warmed containers can be maintained:

| Setting | Default | Description |
|---------|---------|-------------|
| `prewarm.enabled` | `false` | Enable the pre-warm pool. |
| `prewarm.count` | `0` | Number of containers to keep ready. |
| `prewarm.snapshot` | `null` | Snapshot image to pre-warm from (uses base image if null). |
| `prewarm.idle_ttl` | `5m` | Time before an idle pre-warmed container is destroyed. |

Pre-warmed containers sit in the READY state, waiting for assignment. When a new session starts, a pre-warmed container is assigned instead of creating a new one — reducing boot time to near zero.

---

## Open Questions

- **GPU passthrough for ML workloads?** — Would require `nvidia-docker` / NVIDIA Container Toolkit. Significant complexity; possibly a v2+ feature.
- **Custom base images (user-defined Dockerfiles beyond `environment.yaml`)?** — Power users may want full Dockerfile control. How does this interact with snapshots?
- **Container checkpoint/restore (CRIU)?** — True session pause/resume that preserves process state, not just filesystem. Docker supports this experimentally.
- **Should we support Podman as an alternative to Docker?** — Podman is rootless by default, which aligns with our security goals. API-compatible but not identical.
