# Devin Cloud/Web - Harness Engineering: A Detailed Overview

> **Document Purpose:** This document explains how Devin (by Cognition AI) is engineered as an autonomous software engineering agent, covering its architecture, session lifecycle, tooling, orchestration, integrations, and security model.

---

## 1. High-Level Architecture

Devin's architecture consists of two primary components:

### 1.1 The Brain (Cognition's Cloud)
- The **Brain** is the AI reasoning engine that always resides within Cognition's cloud infrastructure.
- It is responsible for interpreting user instructions, planning tasks, making decisions, generating code, and orchestrating tool usage.
- The Brain receives context from the user conversation, injected knowledge, repository state, and tool outputs, then decides the next actions to take.
- It operates on advanced large language models (LLMs) with proprietary architectural and model improvements layered on top.

### 1.2 The Workspace (Dedicated VM)
- Each Devin session runs on its own **isolated Virtual Machine (VM)** — a full Linux (Ubuntu) environment.
- The workspace provides:
  - **A persistent shell** for executing commands (bash, git, npm, docker, etc.)
  - **A browser** (Chrome) for web-based interactions, testing UIs, reading documentation
  - **A code editor / IDE** for reading and writing code with full IDE capabilities
  - **A full filesystem** with access to cloned repositories, tools, and dependencies
- Sessions are fully isolated from each other — no shared filesystem, environment variables, or running processes between sessions.

```
 +-------------------------------+
 |       Cognition Cloud         |
 |  +-------------------------+  |
 |  |     The Brain (AI)      |  |
 |  |  - Task planning        |  |
 |  |  - Code generation      |  |
 |  |  - Tool orchestration   |  |
 |  |  - Decision making      |  |
 |  +----------+--------------+  |
 +-------------|--+--------------+
               |  |
          Control plane
               |  |
 +-------------|--+--------------+
 |  Workspace VM (per session)   |
 |  +--------+ +------+ +-----+ |
 |  | Shell  | |Browser| | IDE | |
 |  +--------+ +------+ +-----+ |
 |  | Filesystem / Repos        ||
 |  +---------------------------+|
 +-------------------------------+
```

---

## 2. Session Lifecycle

### 2.1 Snapshots
- A **snapshot** is a frozen, bootable image of the development environment.
- It contains pre-cloned repositories, installed tools, dependencies, and any configuration specified by the user/org.
- Every session boots from a **fresh copy** of the snapshot — ensuring a clean, reproducible starting state every time.
- Session changes (installed packages, modified files, etc.) do NOT persist back to the snapshot.

### 2.2 Blueprints (Declarative Environment Configuration)
Blueprints are YAML configuration files that define how the snapshot is built. They operate in a layered, composable hierarchy:

```
Build Order:
1. Enterprise blueprint (runs in ~)
   a. initialize
   b. maintenance
2. Org blueprint (runs in ~)
   a. initialize
   b. maintenance
3. Clone all repositories (up to 10 concurrent)
4. For each configured repo (runs in ~/repos/<repo-name>)
   a. initialize
   b. maintenance
5. Health check -> Snapshot is saved
```

- **Enterprise-level:** Global settings applied across the entire enterprise (e.g., VPN configs, shared CLI tools, global Node/Rust versions).
- **Org-level:** Organization-specific configurations (shared dependencies, org-wide secrets references).
- **Repo-level:** Repository-specific setup (install dependencies, build commands, lint/test configuration).
- Layers are **additive** — repo-level commands can use tools installed by higher-level blueprints.
- **Differential builds** can reuse previous snapshots and only rebuild changed workspaces, reducing build times.

### 2.3 Session Boot Flow
```
User sends task
       |
       v
Snapshot is loaded -> Fresh VM boots
       |
       v
Repos are already cloned & dependencies installed
       |
       v
Brain receives task + context (knowledge, rules, secrets)
       |
       v
Brain begins autonomous work loop:
  - Read/search code
  - Plan approach
  - Edit files
  - Run commands
  - Test & verify
  - Create PRs
       |
       v
Session completes or user intervenes
```

---

## 3. Tooling Harness

The Brain orchestrates a rich set of specialized tools. These are the core mechanisms through which Devin interacts with the development environment:

### 3.1 File Operations
| Tool | Purpose |
|------|---------|
| **read** | Read file contents (supports images, notebooks) |
| **write** | Create new files or completely rewrite existing ones |
| **edit** | Precise string-replacement edits in existing files |
| **MultiEdit** | Multiple atomic edits in a single file in one operation |
| **grep** (ripgrep-based) | Fast regex search across codebases with glob filtering |

### 3.2 Shell / Terminal
| Capability | Description |
|------------|-------------|
| **Persistent sessions** | Shell state (env vars, working directory) persists between commands |
| **Multiple shell IDs** | Run parallel shell sessions for independent tasks |
| **Background processes** | Run servers, watchers, or long-running processes in the background |
| **Interactive I/O** | Write to running processes (stdin), handle prompts, send special keys |

### 3.3 Browser
| Capability | Description |
|------------|-------------|
| **Full Chrome browser** | Navigate websites, read docs, test web UIs |
| **CDP endpoint** | Playwright scripting via Chrome DevTools Protocol for automated login flows, data entry |
| **Interactive Desktop** | Users can watch and interact with Devin's browser in real-time via the webapp's "Desktop" tab |
| **Session persistence** | Cookies, auth state persist after scripted actions |

### 3.4 Git & SCM Tools
| Tool | Purpose |
|------|---------|
| **git_create_pr** | Create pull requests with template support |
| **git_view_pr** | View PR diffs, metadata, and comments |
| **git_update_pr** | Update PR descriptions after new commits |
| **git_pr_checks** | Poll CI status with multiple wait modes (all, failure, stage) |
| **git_ci_job_logs** | View detailed logs for failed CI jobs |
| **fetch_pr_template** | Fetch repo's PR template before creating PRs |
| **git_take_over_pr** | Receive live notifications on PRs created outside the session |

### 3.5 Code Search
| Tool | Purpose |
|------|---------|
| **grep** | Regex-based file content search (ripgrep under the hood) |
| **BM25 tool search** | Natural language search for discovering available tools |
| **DeepWiki** | Auto-generated conversational documentation for repositories |
| **Ask Devin** | Codebase Q&A with advanced code search capabilities |

---

## 4. The Agentic Loop (How the Brain Works)

The Brain operates in a continuous **plan-act-observe** loop:

```
                 +------------------+
                 |   Receive Task   |
                 +--------+---------+
                          |
                          v
                 +------------------+
            +--->|   Plan / Reason  |<---+
            |    +--------+---------+    |
            |             |              |
            |             v              |
            |    +------------------+    |
            |    | Select Tool(s)   |    |
            |    +--------+---------+    |
            |             |              |
            |             v              |
            |    +------------------+    |
            |    | Execute Tool(s)  |    |
            |    | (parallel when   |    |
            |    |  independent)    |    |
            |    +--------+---------+    |
            |             |              |
            |             v              |
            |    +------------------+    |
            +----| Observe Results  |----+
                 +--------+---------+
                          |
                     (task done?)
                          |
                          v
                 +------------------+
                 | Report to User   |
                 +------------------+
```

Key behaviors:
- **Parallel tool calling:** Independent tool calls (e.g., reading 3 files) are batched and executed simultaneously for speed.
- **Persistence:** The Brain pushes through errors, retries, and troubleshoots autonomously. It only escalates to the user after exhausting reasonable options.
- **Context management:** Work is automatically summarized and checkpointed, allowing long-running tasks to continue without context loss.
- **Todo tracking:** For multi-step tasks, the Brain maintains a visible task list so users can track progress.

---

## 5. Knowledge System

### 5.1 Knowledge Notes
- Persistent pieces of contextual information about repos, preferences, and workflows.
- Can be **user-authored** (explicit instructions like "always run lint before committing") or **system-generated** (auto-detected patterns).
- Automatically injected into sessions when contextually relevant.
- Managed via tools: `list_knowledge_notes`, `get_knowledge_note`, `suggest_knowledge`.

### 5.2 Playbooks
- Reusable, curated procedures for common tasks (e.g., "REST to GraphQL Migration", "Add Test Coverage").
- Treated as strict checklists — every step is followed in order.
- Can be attached to sessions, automations, and schedules.
- Successful sessions can be turned into new playbooks.

### 5.3 Rules
- Repository or project-specific guidance injected as `<rules>` blocks.
- Can enforce coding standards, security policies, naming conventions, etc.

---

## 6. Orchestration & Parallelism

### 6.1 Managed Devins (Child Sessions)
Devin can act as a **coordinator** and spin up multiple child Devin sessions:

```
  +----------------------------+
  |   Coordinator Session      |
  |   (Parent Devin)           |
  +------+------+---------+----+
         |      |         |
         v      v         v
  +------+  +---+---+  +--+-----+
  | Child |  | Child |  | Child  |
  | VM 1  |  | VM 2  |  | VM 3   |
  +-------+  +-------+  +--------+
  (Module A) (Module B) (Module C)
```

- Each child runs on its **own isolated VM**.
- The coordinator can: spin up sessions, send messages, monitor ACU usage, pause/terminate children.
- Use cases: bulk migrations, parallel test coverage, multi-repo changes.

### 6.2 Automations
- Event-driven automation rules that trigger Devin sessions automatically.
- Examples: auto-start a session when a GitHub issue is labeled, when a PR is opened, or on a schedule.
- Each automation can specify playbooks, ACU limits, and tags.

### 6.3 Schedules
- Recurring or one-time scheduled Devin sessions.
- E.g., nightly dependency updates, weekly security scans, periodic backlog grooming.

---

## 7. Integration Ecosystem

### 7.1 SCM (Source Control) Integrations
- **GitHub** (including GitHub Enterprise Server)
- **GitLab**
- **Bitbucket**
- **Azure DevOps**
- Git is pre-authenticated in the environment — no token embedding needed.

### 7.2 Communication & Workflow
- **Slack:** Trigger and interact with Devin sessions directly from Slack channels.
- **Jira:** Analyze tickets, provide confidence scores, auto-create sessions from issues.
- **Linear:** Similar project management integration.

### 7.3 MCP (Model Context Protocol) Integrations
MCP is an open protocol that allows Devin to connect to external tools and data sources:
- **Built-in MCPs:** Atlassian (Jira/Confluence), Datadog, SonarQube, and many more.
- **Custom MCPs:** Organizations can configure their own MCP servers.
- **48+ connectors** available including Miro, Mixpanel, Honeycomb, Postman, LaunchDarkly, etc.

### 7.4 IDE Extensions
- **Devin Desktop (VS Code-based):** Run Devin directly from your editor, hand off tasks to cloud.
- **CLI:** `/handoff` command transfers local context to a cloud Devin session.

### 7.5 API
- Full REST API for programmatic session management, blueprint configuration, and metrics.
- Enables custom CI/CD integrations, dashboards, and automation pipelines.

---

## 8. Security Architecture

### 8.1 Session Isolation
- Every session runs on its own VM — no cross-session data leakage.
- Sessions start from a clean snapshot; changes don't persist.
- OS temp directories may be wiped between restarts.

### 8.2 Secrets Management
- Secrets are stored securely and injected as environment variables at runtime.
- Scoping: **org-level**, **user-level**, or **repo-level**.
- Secret values appear as `[REDACTED SECRET]` in logs and output — never exposed in plaintext.
- The system auto-substitutes `${SECRET_NAME}` references at runtime.
- Secrets are never written to files, committed to repos, or logged.

### 8.3 Authentication
- **SSO support:** Okta (OIDC), Microsoft Entra ID (OIDC), SAML 2.0, generic OIDC.
- **SCIM provisioning** for automated user lifecycle management.
- Git authentication is handled transparently via an authentication proxy.

### 8.4 Deployment Models
| Model | Description |
|-------|-------------|
| **Enterprise Cloud (Multi-tenant SaaS)** | Shared infrastructure with logical tenant isolation. Brain and workspace in Cognition's cloud. |
| **Customer Dedicated Deployment** | Single-tenant VPC, auto-scaling, customer-isolated environment. Connected via AWS PrivateLink or IPSec tunnel. Data encrypted in transit and at rest. |

### 8.5 Network Security
- **VPN support:** OpenVPN configurations for accessing private/internal endpoints.
- **PrivateLink:** Private IP connectivity from Devin's dedicated deployment to customer internal systems.
- No management ports exposed to the internet.
- TLS for all communication.

### 8.6 Compliance
- Designed for compliance with: **TISAX**, **ISO 27001**, **CIS Benchmarks**, **CSA CCM**, **SOC 2**, **GDPR**, **FedRAMP** (Desktop/GovCloud deployment).

---

## 9. Compute & Resource Management

### 9.1 ACU (Agent Compute Units)
- ACU is the unit of compute consumption for Devin sessions.
- Tracks how much compute a session uses — lower ACU for a task indicates efficiency.
- ACU limits can be set per session, per automation, and per child session.
- Enterprise admins can monitor org-wide ACU consumption.

### 9.2 Session Insights
- Post-session analytics showing ACU usage, message counts, and efficiency metrics.
- Issue timelines for debugging recurring errors.
- Improved prompt suggestions for better task specification.

---

## 10. The User Interaction Model

### 10.1 Conversational Interface
- Users interact with Devin through a chat-based interface (web app, Slack, CLI, or IDE).
- Devin reports progress via messages, shares PR links, preview URLs, and screenshots.
- Users can watch Devin's work in real-time (shell output, code edits, browser activity).

### 10.2 Human-in-the-Loop
- Users can intervene at any time: send messages, take over the terminal, make direct code edits.
- Devin escalates when blocked (missing credentials, ambiguous requirements, architectural conflicts).
- PR approval and merge remain under human control.

### 10.3 Devin Review
- AI-powered code review for PRs.
- Provides intelligent diffs, inline comments, security findings, and AI chat on PRs.
- Supports both GitHub and GitLab.
- Respects repository SECURITY.md for tailored security analysis.

---

## 11. Summary: End-to-End Task Flow

```
1. USER sends task (via Web, Slack, API, CLI, or IDE)
           |
2. BRAIN receives task + injected context (knowledge, rules, secrets)
           |
3. VM boots from snapshot (repos cloned, deps installed)
           |
4. BRAIN enters agentic loop:
   a. Searches & reads codebase (grep, file read, DeepWiki)
   b. Plans approach (todo list visible to user)
   c. Implements changes (edit files, run commands)
   d. Tests & verifies (run tests, lint, typecheck)
   e. Creates PR (with template, description, CI verification)
   f. Monitors CI (polls checks, fixes failures)
           |
5. BRAIN reports completion to user with PR link + preview URLs
           |
6. USER reviews, provides feedback, or merges
```

---

## References

- Devin Documentation: https://docs.devin.ai
- Devin Intro: https://docs.devin.ai/get-started/devin-intro
- Environment & Blueprints: https://docs.devin.ai/onboard-devin/environment/blueprints
- Session Tools: https://docs.devin.ai/work-with-devin/devin-session-tools
- Advanced Capabilities: https://docs.devin.ai/work-with-devin/advanced-capabilities
- Deployment Overview: https://docs.devin.ai/enterprise/deployment/overview
- MCP Integrations: https://docs.devin.ai/work-with-devin/mcp
- Coding Agents 101: https://devin.ai/agents101

---

*This document was compiled based on publicly available Devin documentation and the operational knowledge of the Devin system. For the most up-to-date and authoritative information, please refer to https://docs.devin.ai.*
