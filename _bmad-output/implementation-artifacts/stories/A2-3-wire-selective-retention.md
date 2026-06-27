# Story A2.3: Wire Selective Retention for Smart Output Truncation

> **Sprint:** A2 — Agent Loop Completeness | **Priority:** P1 | **Size:** M (1-3 hours)
> **Depends on:** Nothing
> **Audit ref:** P1-06 in `phase5-audit-findings.md`

## Problem

`SelectiveRetention` (199 lines, `knowledge/selective-retention.ts`) provides intelligent truncation of tool outputs — stack trace deduplication, error extraction from shell output, smart file content trimming. But it's **never instantiated**. Tool outputs use crude truncation (first 100 + last 100 lines) instead.

For a 7B model, every wasted token matters. Smart truncation means the model sees the important parts of tool output (errors, key results) instead of raw dumps.

## What Needs to Happen

### 1. Instantiate SelectiveRetention in ConversationHistory

In `conversation-history.ts`, import and instantiate:

```typescript
import { SelectiveRetention } from '../knowledge/selective-retention.js';

export class ConversationHistory {
  private retention = new SelectiveRetention();
  // ...
}
```

### 2. Apply truncation when adding tool results

In the method that adds tool results to history (look for where tool outputs are appended to the messages array), apply:

```typescript
const truncatedOutput = this.retention.truncateToolOutput(toolResult.output, toolName);
```

### 3. Use retention priorities during context windowing

In `applyWindowing()`, use `classifyMessage()` to decide eviction order:

```typescript
// Instead of evicting oldest first, evict low-priority messages first
const priority = this.retention.classifyMessage(message, index, totalMessages);
// 'always' = never evict, 'high' = evict last, 'medium' = evict middle, 'low' = evict first
```

## Key Method Signatures (from selective-retention.ts)

```typescript
class SelectiveRetention {
  // Truncate tool output intelligently
  truncateToolOutput(output: string, toolName?: string): string
  
  // Classify a message for retention priority
  classifyMessage(message: Message, index: number, total: number): 'always' | 'high' | 'medium' | 'low'
  
  // Deduplicate stack trace frames
  deduplicateStackTrace(text: string): string
  
  // Extract key info from shell output (errors, warnings, test results)
  extractShellSummary(output: string, exitCode: number): string
}
```

Truncation rules (from the implementation):
- Stack traces: deduplicate frames, keep first + last + count
- File content: keep first 50 + last 50 lines (vs current 100+100)
- Shell output: keep last 50 lines + extract errors
- Object/JSON: cap at 2000 chars
- Tool results tagged as 'low' priority for eviction

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/agent/conversation-history.ts` | Import `SelectiveRetention`, instantiate, apply truncation in tool result handling, use priorities in windowing |

## Acceptance Criteria

- [ ] Tool outputs are intelligently truncated before being added to conversation history
- [ ] Stack traces in tool output are deduplicated
- [ ] Shell output preserves error lines and test results while trimming verbose output
- [ ] File content reads are trimmed to first 50 + last 50 lines (not 100+100)
- [ ] Context windowing evicts low-priority messages (old tool outputs) before high-priority ones
- [ ] Existing tests still pass

## How to Verify

1. Send a message that produces verbose shell output (e.g., "run npm install" in a large project)
2. Check the conversation history — output should be truncated intelligently
3. Compare token usage before and after — should be measurably lower
4. Trigger a command that produces a stack trace — frames should be deduplicated

## Notes

- This story has a big impact on 7B model performance. Less wasted context = better reasoning.
- The truncation should be applied at the point where tool results enter the conversation history, NOT when building the system prompt (too late by then).
- Be careful not to break the `tool_complete` events sent to the UI — those should still contain the full output. Only the conversation history (what the LLM sees) should be truncated.
