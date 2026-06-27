# Story A1.3: Emit todo_update Events from Agent Loop

> **Sprint:** A1 — Critical Wiring | **Priority:** P0 | **Size:** S (< 1 hour)
> **Depends on:** Nothing
> **Audit ref:** P0-07 in `phase5-audit-findings.md`

## Problem

The `TodoTracker` is initialized in the agent loop (`agent-loop.ts:48`) and its context is injected into the system prompt (`agent-loop.ts:179-182`). The `ws-handler.ts` has a complete handler for `todo_update` events (lines 224-232). The UI has a `TodoList` component that listens for these events.

But the agent loop **never yields `todo_update` events**. The chain is:
- TodoTracker updates internally when the LLM modifies todos ✅
- Agent loop should yield `{ type: 'todo_update', data: { todos } }` ❌ (MISSING)
- WS handler forwards to WebSocket client ✅
- UI renders todo list ✅

## What Needs to Happen

### 1. Yield todo_update after the LLM completes each step

In `agent-loop.ts`, after the `streamText()` result is processed and tool calls complete, yield the current todo state. The best place is after tool results are observed — around where `tool_complete` events are yielded.

Find the section where tool completions are emitted (around line 250-270) and add:

```typescript
// After processing all tool results for this step, emit todo update
const currentTodos = this.todoTracker.list();
if (currentTodos.length > 0) {
  yield {
    type: 'todo_update' as const,
    data: {
      todos: currentTodos.map(t => ({ content: t.content, status: t.status })),
    },
  };
}
```

### 2. Also yield on agent loop completion

Before the `done` event is yielded, emit a final todo update so the UI has the latest state:

```typescript
// Before yielding done
yield {
  type: 'todo_update' as const,
  data: {
    todos: this.todoTracker.list().map(t => ({ content: t.content, status: t.status })),
  },
};
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/agent/agent-loop.ts` | Add `yield { type: 'todo_update', ... }` after tool step completions and before `done` |

## Acceptance Criteria

- [ ] When the agent creates/updates todos, the UI todo list widget shows them in real-time
- [ ] Todo updates appear after each agent step (not only at the end)
- [ ] The `TodoUpdateData` type from `types.ts:58-60` is used correctly
- [ ] If no todos exist, no `todo_update` event is emitted (avoid noise)
- [ ] Existing tests still pass

## How to Verify

1. Start server and UI
2. Open a session in the browser
3. Send a message that would trigger todo creation (e.g., "Create a project with 3 files: index.js, utils.js, and test.js")
4. The todo list widget in the chat panel should show items appearing and updating
5. Check WebSocket messages in browser dev tools — `todo_update` events should appear

## Notes

- This is a small change — just adding yield statements in the right places.
- The `TodoTracker` is already being updated by the LLM via the system prompt instructions. The LLM sees the todo context and may modify it through tool calls. We just need to emit the state changes.
- A subtle issue: the 7B model may not reliably create todos. That's a tuning issue for Sprint A3, not a wiring issue. This story just ensures the pipe is connected.
