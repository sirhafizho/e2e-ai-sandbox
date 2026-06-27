# Story A3.4: Limit Tool Definitions Per Turn

> **Sprint:** A3 — 7B Model Tuning | **Priority:** P1 | **Size:** L (3+ hours)
> **Depends on:** Nothing

## Problem

Forge registers 13+ tools. Each tool definition in the system prompt costs ~50-100 tokens (name, description, parameter schema). That's 650-1300 tokens just for tool definitions — up to 16% of a 8K context budget. 7B models also get confused when too many tools are available, picking wrong tools or hallucinating parameters.

## What Needs to Happen

### 1. Filter tools based on task context before building tool definitions

In `agent-loop.ts`, before building tool definitions for the LLM call, filter tools based on the current task context:

```typescript
// Before building the tool call
const availableTools = this.isSmallModel
  ? filterToolsForContext(allTools, taskKeywords, sessionState)
  : allTools; // Large models get everything
```

### 2. Create a tool filter function

Create a `filterToolsForContext()` function (possibly in a new file `tool-filter.ts`):

```typescript
export function filterToolsForContext(
  allTools: ToolSpec[],
  taskKeywords: string[],
  sessionState: { hasGitRepo: boolean; browsingRequested: boolean; turnCount: number }
): ToolSpec[] {
  const filtered: ToolSpec[] = [];

  // Always include core tools
  const coreTools = ['shell_exec', 'file_read', 'file_write', 'file_edit'];
  filtered.push(...allTools.filter(t => coreTools.includes(t.name)));

  // Include git tools only if a git repo is detected
  if (sessionState.hasGitRepo) {
    const gitTools = ['git_status', 'git_diff', 'git_commit', 'git_log'];
    filtered.push(...allTools.filter(t => gitTools.includes(t.name)));
  }

  // Include browser tools only if browsing was requested
  if (sessionState.browsingRequested) {
    const browserTools = ['browser_navigate', 'browser_screenshot'];
    filtered.push(...allTools.filter(t => browserTools.includes(t.name)));
  }

  // Include search tools when exploring (early turns or search-related keywords)
  if (sessionState.turnCount < 3 || hasSearchKeywords(taskKeywords)) {
    const searchTools = ['grep', 'find_files'];
    filtered.push(...allTools.filter(t => searchTools.includes(t.name)));
  }

  return filtered;
}
```

### 3. Define tool categories

Organize tools into categories for filtering:

| Category | Tools | When to include |
|----------|-------|-----------------|
| Core (always) | shell_exec, file_read, file_write, file_edit | Always |
| Git (contextual) | git_status, git_diff, git_commit, git_log | When git repo detected |
| Browser (on demand) | browser_navigate, browser_screenshot | When browsing requested |
| Search (contextual) | grep, find_files | When exploring or searching |
| Advanced git (rare) | git_push, git_create_pr, git_pr_status | Only when explicitly needed |

### 4. Alternative simpler approach

If full contextual filtering is too complex, implement a simpler version that just limits to the top 6-8 tools for small models:

```typescript
function getSmallModelTools(allTools: ToolSpec[]): ToolSpec[] {
  const essential = ['shell_exec', 'file_read', 'file_write', 'file_edit', 'grep', 'find_files'];
  return allTools.filter(t => essential.includes(t.name));
}
```

### 5. Progressive disclosure (optional enhancement)

Start with core tools, add more after the first few turns once the task is clearer:

```typescript
function getToolsForTurn(allTools: ToolSpec[], turnCount: number): ToolSpec[] {
  if (turnCount <= 2) return getCoreTools(allTools);      // Start simple
  if (turnCount <= 5) return getCoreAndSearchTools(allTools); // Add search
  return allTools; // Full set after task is established
}
```

### 6. Ensure filtered tools still execute

Tool filtering should only affect what the LLM *sees* in tool definitions. If the LLM somehow calls a filtered tool, it should still execute (don't break tool execution):

```typescript
// In tool execution, use the full registry, not the filtered list
const result = await this.toolRegistry.execute(toolCall.name, toolCall.args);
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/agent/agent-loop.ts` | Before building tool definitions, apply filtering for small models |
| `packages/server/src/agent/tool-filter.ts` | New file — `filterToolsForContext()` function, tool category definitions |

## Acceptance Criteria

- [ ] 7B models see 6-8 tools instead of 13+
- [ ] Core tools (shell_exec, file_read, file_write, file_edit) are always available
- [ ] Git tools appear only when git operations are relevant (git repo detected)
- [ ] Browser tools appear only when browsing is relevant
- [ ] Large models see all tools (no filtering applied)
- [ ] Tool filtering doesn't break tool execution (filtered tools still work if the LLM somehow calls them)
- [ ] Token savings from tool definitions is measurable (~500-800 tokens saved)
- [ ] Existing tests still pass

## How to Verify

1. Start the server with a 7B model
2. Send a simple message like "Create a hello.js file"
3. Check server logs — tool definitions should only include 6-8 tools, not 13+
4. Send a git-related message like "Show me the git status" — verify git tools appear
5. Count tokens used by tool definitions — should be ~50% less than before
6. Switch to a large model — verify all 13+ tools are still available
7. Test that a tool call to a "filtered" tool still executes correctly

## Notes

- Start with the simple approach (fixed essential tool list) and iterate toward contextual filtering if needed. The simple approach covers 80% of the benefit.
- The LLM rarely needs all 13 tools at once. Most turns use 1-2 tools from a predictable subset.
- Tool filtering reduces both token usage AND model confusion. Fewer tools = fewer wrong tool choices.
- Be careful with the tool execution path — filtering should only affect the tool *definitions* sent to the LLM, never the tool *registry* used for execution.
- This story pairs well with A3.2 (system prompt optimization). Fewer tool definitions + shorter prompt = significantly more context for actual work.
