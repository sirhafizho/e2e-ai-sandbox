# Story A3.5: Add Micro-Step Hints After Tool Results

> **Sprint:** A3 — 7B Model Tuning | **Priority:** P1 | **Size:** M (1-3 hours)
> **Depends on:** Nothing

## Problem

7B models lose the thread in multi-step tasks. After a tool completes, they often repeat the same tool call or go off track. They need gentle nudging about what to do next. Devin solves this with orchestration-level guidance injected between steps.

## What Needs to Happen

### 1. Inject a brief system-level hint after each tool result

In `agent-loop.ts`, after each tool result is added to conversation history, inject a brief system-level hint before the next LLM call:

```typescript
// After tool result is added to history
if (this.isSmallModel) {
  const hint = buildStepHint(toolName, toolResult, this.todoTracker);
  if (hint) {
    this.history.addSystemMessage(hint);
  }
}
```

### 2. Build context-aware step hints

Implement `buildStepHint()` that generates short, structured hints based on the tool result:

```typescript
function buildStepHint(
  toolName: string,
  result: ToolResult,
  todoTracker?: TodoTracker
): string | null {
  const status = result.exitCode === 0 ? 'success' : 'failed';
  const todoSummary = todoTracker?.getSummary();

  // Skip hint for simple cases to avoid noise
  if (toolName === 'file_read' && result.exitCode === 0) {
    return null; // File read success doesn't need guidance
  }

  let hint = `[Step completed: ${toolName} → ${status}]`;

  if (todoSummary) {
    hint += `\nTodos: ${todoSummary}`;
  }

  if (result.exitCode !== 0) {
    hint += `\nThe command failed. Check the error output and try a different approach.`;
  } else {
    hint += `\nConsider: What's the next step toward completing the user's request?`;
  }

  return hint;
}
```

### 3. Keep hints very short

Hints must be < 50 tokens each. Structure:
- Line 1: What just happened (tool name + result status)
- Line 2: Current todo state (if todos exist)
- Line 3: Gentle guidance based on success/failure

```
[Step completed: shell_exec → exit code 0]
Todos: 1/3 done — next: "Write unit tests"
Consider: What's the next step toward completing the user's request?
```

For failures:
```
[Step completed: shell_exec → failed (exit 1)]
The command failed. Check the error output and try a different approach.
```

### 4. Differentiate hints by success vs failure

Failed tool calls need different guidance than successful ones:

```typescript
function getGuidance(toolName: string, exitCode: number): string {
  if (exitCode !== 0) {
    return 'The command failed. Check the error output and try a different approach.';
  }

  switch (toolName) {
    case 'shell_exec':
      return 'Consider: What\'s the next step toward completing the user\'s request?';
    case 'file_write':
      return 'File written. Consider: verify it works or move to the next task.';
    case 'file_edit':
      return 'File edited. Consider: verify the change works or continue.';
    default:
      return 'Consider: What\'s the next step?';
  }
}
```

### 5. Return null for simple cases

Skip hints when they'd add noise without value:

```typescript
// No hint needed for:
// - file_read success (model just needs to process the content)
// - grep/find_files (model needs to process results, not be told what to do)
// - First tool call (no need to nudge yet)
if (toolName === 'file_read' && exitCode === 0) return null;
if (toolName === 'grep' && exitCode === 0) return null;
if (toolName === 'find_files' && exitCode === 0) return null;
```

### 6. Only enable for small models

Large models (70B+, cloud APIs) don't need hand-holding. Only inject hints for small models:

```typescript
// In agent-loop.ts
if (this.isSmallModel && hint) {
  this.history.addSystemMessage(hint);
}
// Large models skip this entirely
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/agent/agent-loop.ts` | After tool result handling, call `buildStepHint()` and inject into history for small models. Add `buildStepHint()` function (or import from a helper) |

## Acceptance Criteria

- [ ] After each tool completion, a brief hint is injected into the conversation for small models
- [ ] Hints reference the current todo state (if todos exist)
- [ ] Failed tool calls get different hints than successful ones (e.g., "The command failed. Check the error output and try a different approach.")
- [ ] Hints are < 50 tokens each
- [ ] No hints for simple read/search tool successes (file_read, grep, find_files)
- [ ] Large models don't receive hints (no overhead for capable models)
- [ ] Hints don't break the conversation format or confuse the LLM
- [ ] Existing tests still pass

## How to Verify

1. Start the server with a 7B model
2. Send a multi-step task: "Create a Node.js project with an express server and a test"
3. Watch the conversation history in server logs — after each tool call, a hint should appear
4. Verify hints are short (< 50 tokens)
5. Trigger a failure (e.g., "run a command that doesn't exist") — verify the failure hint is different
6. Switch to a large model — verify no hints are injected
7. Check that the agent stays on track better with hints vs without (qualitative test)

## Notes

- This is a lightweight intervention that can significantly improve multi-step task completion for small models. The key is keeping hints brief — verbose hints eat context and can confuse the model.
- The todo tracker integration is optional but valuable. If the agent has a todo list, referencing it in hints helps the model remember what step it's on.
- Hints are injected as system messages, not user messages. This keeps them separate from the actual conversation and signals to the model that they're guidance, not instructions.
- If hints cause the model to generate meta-commentary ("I see the step completed..."), the hint format may need adjustment. Test and iterate.
- Consider adding a `FORGE_DISABLE_HINTS=true` env var for easy A/B testing during development.
