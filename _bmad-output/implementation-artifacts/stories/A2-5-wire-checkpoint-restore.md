# Story A2.5: Wire Checkpoint Restore on Session Resume

> **Sprint:** A2 — Agent Loop Completeness | **Priority:** P2 | **Size:** S (< 1 hour)
> **Depends on:** A2.1 (checkpoint creation must work first)
> **Audit ref:** P2-11 in `phase5-audit-findings.md`

## Problem

`CheckpointManager.loadCheckpoint()` and `.formatForResume()` exist but are **never called** on session resume. When a session is resumed (`POST /api/sessions/:id/resume` in app.ts ~line 509), the agent starts with empty context instead of picking up where it left off.

## What Needs to Happen

### 1. Load checkpoint on session resume

In the resume endpoint (~app.ts:509), after the container is resumed:

```typescript
// Load checkpoint if one exists
const checkpointManager = new CheckpointManager(checkpointStore);
const checkpoint = checkpointManager.loadCheckpoint(sessionId);

let resumeContext: string | undefined;
if (checkpoint) {
  resumeContext = checkpointManager.formatForResume(checkpoint);
}
```

### 2. Inject checkpoint context into system prompt

When building the session's system prompt (either in A1.1's knowledge injection, or directly):

```typescript
if (resumeContext) {
  const systemPrompt = buildSystemPrompt({
    toolNames: toolSpecs.map(t => t.name),
    sessionId,
    knowledgeContext: knowledgeContext + '\n\n' + resumeContext,
  });
  // Store in session state so the agent loop uses it
  session.systemPrompt = systemPrompt;
}
```

### 3. Store resume context in session state

The `SessionContext.systemPrompt` field already exists and is optional. Set it on resume so the agent loop picks it up on the next `run()` call.

## Key Method Signatures

```typescript
// CheckpointManager
loadCheckpoint(sessionId: string): Checkpoint | null
formatForResume(checkpoint: Checkpoint): string
// Returns markdown like:
// ## Resumed Session
// **Original task:** Build the auth module
// **Current subtask:** Write tests
// ### Todo List
// - [x] Create auth handler
// - [ ] Write tests
// ### Key Discoveries
// - Auth uses JWT tokens
// ### Files Modified
// - src/auth/handler.ts
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | In POST /api/sessions/:id/resume, load checkpoint and inject into session's system prompt |

## Acceptance Criteria

- [ ] When a session with a checkpoint is resumed, the checkpoint context appears in the system prompt
- [ ] The agent sees: original task, current subtask, todo list, key discoveries, files modified
- [ ] Sessions without checkpoints resume normally (no error)
- [ ] Existing tests still pass

## How to Verify

1. Create a session, send enough messages to trigger a checkpoint (requires A2.1)
2. Pause the session
3. Resume the session
4. Send a message — the agent should reference the checkpoint context (e.g., "I was working on X")
5. Check server logs — the system prompt should contain the "Resumed Session" section

## Notes

- This is a small wiring task — just loading from the store and injecting into the prompt.
- The checkpoint format is human-readable markdown, which works well for LLM injection.
- For now, only the latest checkpoint per session is loaded. Multiple checkpoints could be useful for "go back to checkpoint N" but that's a future feature.
