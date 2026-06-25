# Spec: Agent Loop & Context Management

**Status:** Draft
**Priority:** P0 — The core orchestration that makes the agent autonomous.

---

## Overview

The agent loop is the **plan-act-observe cycle** that turns an LLM + tools into an autonomous coding agent. It receives a user task, injects context, calls the LLM, executes tool calls, feeds results back, and repeats until done.

This is Forge's beating heart. Everything else — UI, sandbox, tools — exists to serve this loop.

**Core responsibilities:**
- Orchestrate multi-step task execution without human babysitting
- Manage context window efficiently across long sessions
- Execute tools in parallel where possible
- Recover from errors gracefully
- Keep the user informed at every step

> **Implementation Note:** The LLM_GENERATE state uses Vercel AI SDK's `streamText()` function with `maxSteps` for automatic multi-step tool calling. Provider abstraction (OpenAI, Anthropic, Ollama) is handled by the AI SDK's provider adapters. Tool definitions use Zod schemas, which the AI SDK converts to the correct LLM format automatically. See `docs/open-source-dependencies.md` Layer 1 for details.

---

## Loop Structure — State Machine

The agent loop is a formal state machine with 7 states:

```
┌──────────────┐
│ RECEIVE_TASK │ ◄── user message / resumed session
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ INJECT_CONTEXT   │ ◄── system prompt, tools, rules, history
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ LLM_GENERATE     │ ◄── model produces text and/or tool calls
└──────┬───────────┘
       │
       ├──── text only ──────────────────┐
       │                                 │
       ▼                                 ▼
┌──────────────────┐           ┌─────────────────┐
│ EXECUTE_TOOLS    │           │ DECISION         │
└──────┬───────────┘           └──────┬──────────┘
       │                              │
       ▼                              ├── continue → goto LLM_GENERATE
┌──────────────────┐                  ├── ask_user → pause, await input
│ OBSERVE_RESULTS  │                  └── done     → EXIT
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ DECISION         │
└──────────────────┘
```

### State Descriptions

| State | Input | Action | Output |
|---|---|---|---|
| **RECEIVE_TASK** | User message or resumed session | Parse intent, set task context | Task object |
| **INJECT_CONTEXT** | Task + session state | Assemble system prompt, tool defs, knowledge notes, rules (AGENTS.md), summarized history | Full prompt payload |
| **LLM_GENERATE** | Prompt payload | Call LLM API, stream response to UI | Text response + optional tool calls |
| **EXECUTE_TOOLS** | Tool call list | Dispatch to sandbox, run in parallel where safe | Tool results (stdout, stderr, exit codes, artifacts) |
| **OBSERVE_RESULTS** | Tool results | Format results, append to conversation, trim if needed | Updated conversation history |
| **DECISION** | LLM output + task state | LLM evaluates: more work needed? blocked? done? | Loop control signal |
| **EXIT** | Done signal | Summarize work, update todo, log session | Final response to user |

### Loop Invariants

- The loop **always** terminates (max iterations enforced)
- Every tool execution **always** produces an observable result (even on failure)
- The user **always** sees what the agent is doing (streaming, not batched)
- Context size **never** exceeds model limit (auto-summarization triggers before overflow)

---

## Context Injection — What Goes into the Prompt

At `INJECT_CONTEXT`, the prompt is assembled in this order:

| Section | Source | Token Priority | Eviction Order |
|---|---|---|---|
| System prompt | Hardcoded template | **Always retained** | Never evicted |
| Tool definitions | Tool registry | **Always retained** | Never evicted |
| Rules | Repo `AGENTS.md` / config | **Always retained** | Never evicted |
| Knowledge notes | `vault/` relevant notes | High | Summarized after 70% budget |
| Todo list | Agent state | High | Never evicted |
| Pending tool calls | Runtime state | **Always retained** | Never evicted |
| Last 3 turns | Conversation history | **Always retained** | Never evicted |
| Session history | Older turns | Medium | Summarized first |
| Tool outputs | Execution results | Low | Truncated aggressively |

### Injection Priority Rules

1. **Never evict:** system prompt, tool defs, rules, last 3 turns, pending tool calls, todo list
2. **Summarize first:** older session history (turns 4+)
3. **Truncate second:** verbose tool outputs (large file reads, long shell output)
4. **Drop last:** stale knowledge notes no longer relevant to current task

---

## Parallel Tool Execution

When the LLM returns multiple tool calls in a single response, classify and execute:

### Classification

| Category | Example | Execution |
|---|---|---|
| **Independent** | Read file A, read file B, read file C | Parallel — `Promise.all()` |
| **Dependent** | Write file, then run tests | Sequential — ordered execution |
| **Mixed** | Read 3 files, then write based on results | Parallel reads, then sequential write |

### Rules

- Default assumption: **all tool calls from a single LLM response are independent** unless explicitly ordered
- The LLM can signal dependency by wrapping calls in a sequence block (future: dependency graph)
- Parallel execution uses the sandbox's concurrent capabilities (multiple Docker exec streams)
- **Max parallel calls:** 10 (configurable, prevents sandbox overload)
- Results are **aggregated** and returned to the LLM as a single batch in the original call order

### Streaming During Parallel Execution

- Each parallel tool streams its output independently via WebSocket
- UI displays all parallel streams simultaneously (split view or interleaved with labels)
- Completion order may differ from call order — results are reordered before sending to LLM

---

## Context Management (CRITICAL)

This is how Forge survives long tasks without hitting token limits or losing coherence.

### Token Budget Tracking [PHASE 2+]

```
Model Context Window (e.g., 200K tokens)
├── Reserved: system prompt + tools + rules     (~5-10K)
├── Reserved: last 3 turns + pending calls      (~5-15K)
├── Available: working context                  (remaining)
│   ├── 0-70%   → Normal operation
│   ├── 70-85%  → WARNING: begin summarization
│   └── 85-100% → CRITICAL: force summarization + checkpoint
```

| Threshold | Action |
|---|---|
| **< 70%** | Normal operation, no intervention |
| **70%** | Log warning, begin background summarization of oldest turns |
| **85%** | Force-summarize all turns except last 3, truncate tool outputs |
| **95%** | Emergency: checkpoint and reset context, resume from checkpoint |

### Auto-Summarization [PHASE 2+]

- **Trigger:** every N turns (configurable, default: 10) OR when token usage hits 70%
- **What gets summarized:** all turns older than the last 3
- **Summarization prompt:** separate LLM call that produces a compressed context block
- **Format:** structured summary containing:
  - Task progress (what's been done, what's remaining)
  - Key discoveries (file locations, patterns found, errors encountered)
  - Decisions made and rationale
  - Current state of the todo list
- **The summary replaces the original turns** — originals are archived to session log, not kept in context

### Checkpointing [PHASE 2+]

Before context overflow (at 95% threshold), save a checkpoint:

```json
{
  "checkpoint_id": "uuid",
  "timestamp": "ISO-8601",
  "task": {
    "original_prompt": "user's original request",
    "current_subtask": "what the agent was working on"
  },
  "todo_list": [...],
  "key_discoveries": [
    "src/api/routes.ts contains the endpoint definitions",
    "Tests are in __tests__/ using vitest"
  ],
  "files_modified": ["src/api/routes.ts", "src/api/handlers.ts"],
  "files_read": ["README.md", "package.json"],
  "errors_encountered": [...],
  "decisions_made": [...],
  "summary": "compressed narrative of progress so far"
}
```

- Checkpoint saved to: `vault/sessions/checkpoints/`
- On resume: checkpoint is injected as context in `INJECT_CONTEXT`
- User is notified: "Context was getting large — I've checkpointed and resumed. No work was lost."

### Selective Retention

**Always in context (never evicted):**
- System prompt + tool definitions
- Repository rules (AGENTS.md)
- Current todo list
- Last 3 conversation turns
- All pending/in-flight tool calls

**Summarized when space is needed:**
- Older conversation turns → compressed summary block
- Previous tool outputs → key findings only

**Truncated aggressively:**
- Large file reads → first/last N lines + summary
- Long shell output → last 50 lines + error extraction
- Stack traces → deduplicated, first occurrence only

### Output Trimming Rules

| Tool Output Type | Max Size | Trimming Strategy |
|---|---|---|
| File read (< 500 lines) | Full | No trimming |
| File read (500+ lines) | 200 lines | First 100 + last 100 + line count note |
| Shell output (success) | 100 lines | Last 100 lines |
| Shell output (error) | 200 lines | Full stderr + last 50 stdout |
| Search results | 50 matches | First 50 + total count |
| Directory listing | 100 entries | First 100 + total count |

---

## Todo Tracking

The agent maintains a visible, real-time task list for multi-step work.

### Data Model

```typescript
interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

type TodoList = TodoItem[];
```

### Rules

- **One `in_progress` at a time** — finish current before starting next
- **Mark complete immediately** after finishing — don't batch completions
- **Create todos proactively** when a task has 3+ steps
- **Update in real-time** — every status change pushes to UI via WebSocket
- **Remove irrelevant items** — if a task becomes unnecessary, delete it (don't leave stale items)
- **Break down complex tasks** — prefer specific, actionable items over vague descriptions

### When to Create a Todo List

| Scenario | Create Todo? |
|---|---|
| Multi-step feature implementation | Yes |
| User provides multiple tasks | Yes |
| Task requires 3+ distinct actions | Yes |
| Single file edit | No |
| Informational question | No |
| One-command execution | No |

### Example

```json
[
  {"content": "Read existing auth module to understand current structure", "status": "completed"},
  {"content": "Add OAuth2 provider configuration to config.ts", "status": "completed"},
  {"content": "Implement token refresh middleware", "status": "in_progress"},
  {"content": "Write tests for OAuth2 flow", "status": "pending"},
  {"content": "Update API documentation", "status": "pending"}
]
```

---

## Error Recovery

The agent must never silently fail. Every error is visible to the user.

### Recovery Strategy (Escalation Ladder)

```
Tool Failure
    │
    ▼
Retry (up to 3x with exponential backoff)
    │ still failing?
    ▼
Alternative Approach (different tool, different method)
    │ still failing?
    ▼
Ask User for Clarification
    │ user can't help?
    ▼
Escalate — explain what was tried, ask for help
```

### Retry Policy

| Failure Type | Max Retries | Backoff | Notes |
|---|---|---|---|
| Tool timeout | 3 | 1s, 2s, 4s | Increase timeout on retry |
| Command failed (non-zero exit) | 2 | 0s, 1s | Check error output before retry |
| File not found | 1 | 0s | Search for correct path, then retry |
| LLM API error (rate limit) | 5 | 2s, 4s, 8s, 16s, 32s | Exponential with jitter |
| LLM API error (server) | 3 | 5s, 10s, 20s | May switch provider if available |
| Permission denied | 0 | — | Ask user immediately |
| Network error | 3 | 2s, 4s, 8s | Check connectivity |

### Wrong Approach Detection

- If the same tool call fails 2+ times with the same error → stop retrying, try different approach
- If the agent is stuck in a loop (same actions repeated 3+ times) → pause, reassess, explain to user
- If test failures increase after a fix attempt → revert changes, explain, ask user

### Error Reporting

Every error surfaced to the user includes:
1. **What failed** — the specific tool call or action
2. **Why it failed** — error message, exit code, relevant output
3. **What was tried** — retry attempts, alternative approaches
4. **What's recommended** — agent's suggestion for next steps

---

## Greeting Protocol

### Session Start

When a new session begins, the agent:

1. Loads session context (vault, AGENTS.md, previous session logs)
2. Greets the user by name:

```
Hello Hafiz!

Here's what I see:
- Repository: e2e-ai-sandbox (Node.js/TypeScript)
- Branch: feature/agent-loop
- Last session: worked on context management spec
- Open items: 2 pending todos from last session

What would you like to work on?
```

3. If resuming from checkpoint:

```
Hello Hafiz!

I'm resuming from where we left off:
- Task: implementing OAuth2 middleware
- Progress: 3/5 steps complete
- Last action: wrote token refresh logic in src/auth/refresh.ts

Ready to continue — next up is writing tests. Shall I proceed?
```

### Task Completion

When a task is finished, the agent:

1. Summarizes what was accomplished
2. Lists files changed
3. Notes any open items or follow-ups
4. Greets goodbye:

```
All done! Here's what I did:
- Added OAuth2 provider config to src/config.ts
- Implemented token refresh middleware in src/auth/refresh.ts
- Wrote 12 tests (all passing) in src/auth/__tests__/oauth2.test.ts
- Updated API docs in docs/auth.md

Open items:
- [ ] Consider adding rate limiting to token refresh endpoint
- [ ] Review token expiry edge cases with team

Until next time, Hafiz!
```

---

## Session Lifecycle Integration

### On Session Start

```
1. Load vault/sessions/ → find latest session log
2. Read AGENTS.md → extract repo-specific rules
3. Load vault/decisions/ → recent architectural decisions
4. Load knowledge notes relevant to likely tasks
5. Initialize empty todo list (or restore from checkpoint)
6. Greet user
```

### During Session

```
For each loop iteration:
  1. Stream all LLM output to UI (text + tool calls)
  2. Stream all tool output to UI (stdout/stderr)
  3. Update todo list in real-time
  4. Track token usage, trigger summarization if needed
  5. Log significant events (decisions, errors, file changes)
```

### On Session End

```
1. Summarize session work
2. Create/update vault/sessions/Session YYYY-MM-DD.md:
   - What was done (bullet points)
   - Decisions made (with rationale)
   - Files modified (with brief description)
   - Open questions
   - Next steps (explicit, actionable)
3. Save checkpoint if task is incomplete
4. Goodbye greeting
```

### Session Log Format

```markdown
# Session 2025-01-15

## Summary
Implemented agent loop state machine and context management.

## Done
- Defined 7-state loop: RECEIVE → INJECT → GENERATE → EXECUTE → OBSERVE → DECIDE → EXIT
- Wrote context budget tracking with 70/85/95% thresholds
- Implemented auto-summarization trigger logic

## Decisions
- Auto-summarization triggers on BOTH token count and turn count (whichever hits first)
- Checkpoint format uses JSON, stored in vault/sessions/checkpoints/

## Files Modified
- specs/agent/agent-loop.md — full behavioral spec
- src/agent/loop.ts — state machine skeleton

## Open Questions
- Max parallel tool calls: 10 or higher?
- Should checkpoint restore be automatic or require user confirmation?

## Next Steps
- [ ] Implement EXECUTE_TOOLS parallel dispatch
- [ ] Build auto-summarization prompt template
- [ ] Wire up WebSocket streaming for tool output
```

---

## Configuration

All loop parameters are configurable per-deployment:

| Parameter | Default | Description |
|---|---|---|
| `maxIterations` | 50 | Max loop iterations before forced escalation |
| `summarizationTurnThreshold` | 10 | Summarize after this many turns |
| `tokenWarningThreshold` | 0.70 | Begin summarization at this % of context window |
| `tokenCriticalThreshold` | 0.85 | Force summarization at this % |
| `tokenEmergencyThreshold` | 0.95 | Checkpoint and reset at this % |
| `maxParallelToolCalls` | 10 | Max simultaneous tool executions |
| `toolRetryMax` | 3 | Default max retries for failed tools |
| `toolRetryBackoffMs` | 1000 | Base backoff for tool retries (doubled each retry) |
| `outputTrimMaxLines` | 200 | Max lines kept from tool output |
| `checkpointDir` | `vault/sessions/checkpoints/` | Where checkpoints are saved |
| `sessionLogDir` | `vault/sessions/` | Where session logs are saved |
| `greetingName` | `"Hafiz"` | User's name for greetings |

---

## Open Questions

| # | Question | Proposed Answer | Status |
|---|---|---|---|
| 1 | Max iterations per task before forcing escalation? | 50 — generous for complex tasks, prevents infinite loops | Proposed |
| 2 | Should auto-summarization trigger on token count or turn count? | Both — whichever threshold is hit first | Proposed |
| 3 | Should the agent autonomously create git commits, or always ask first? | Default: ask first. Configurable to auto-commit with `autoCommit: true` | Proposed |
| 4 | Should checkpoint restore be automatic or require user confirmation? | Automatic with notification — minimize friction | Open |
| 5 | How to handle multi-model sessions (e.g., switch from Claude to GPT mid-task)? | Checkpoint and resume with new model — context format must be model-agnostic | Open |
| 6 | Should summarization use the same model or a cheaper/faster one? | Cheaper model (e.g., Haiku/GPT-4o-mini) to save cost and latency | Proposed |
| 7 | Max context window percentage actually usable (reserve for response)? | Reserve 15% for model response — so "100%" in our budget = 85% of true window | Proposed |

---

## Dependencies

- **Sandbox (Docker):** EXECUTE_TOOLS dispatches to containerized environments
- **LLM Provider Layer:** LLM_GENERATE calls through provider-agnostic abstraction
- **WebSocket Server:** streams tool output and todo updates to UI
- **Vault (Obsidian):** session logs, checkpoints, knowledge notes
- **Tool Registry:** defines available tools and their schemas for INJECT_CONTEXT
