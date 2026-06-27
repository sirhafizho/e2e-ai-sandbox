# Story A3.2: Optimize System Prompt for Small Models

> **Sprint:** A3 — 7B Model Tuning | **Priority:** P1 | **Size:** L (3+ hours)
> **Depends on:** A1.1 (knowledge injection should be wired to see the full prompt)

## Problem

The current system prompt in `system-prompt.ts` is generic. 7B models need shorter, more structured, more explicit prompts. A 2000-token system prompt eats 25% of a 8K effective context budget. Need to optimize for token efficiency while keeping the agent functional.

## What Needs to Happen

### 1. Create a separate prompt template for small models

In `system-prompt.ts`, add a small model prompt builder alongside the existing one. Keep the existing prompt for large models untouched:

```typescript
export function buildSystemPrompt(options: SystemPromptOptions): string {
  if (options.isSmallModel) {
    return buildSmallModelPrompt(options);
  }
  return buildLargeModelPrompt(options); // existing logic
}

function buildSmallModelPrompt(options: SystemPromptOptions): string {
  // Terse, structured prompt < 500 tokens
  return `You are Forge, a coding agent. You have tools to interact with a development environment.

RULES:
- Call exactly ONE tool per step
- After tool completes: call another tool OR respond to user
- Never do multiple things at once
- If a command fails, read the error and try a different approach

${buildFewShotExamples()}

Available tools: ${options.toolNames.join(', ')}
Session: ${options.sessionId}
${options.knowledgeContext ? `\nContext:\n${options.knowledgeContext}` : ''}`;
}
```

### 2. Keep prompt under 500 tokens

Remove verbose guidelines and use terse instructions. The small model prompt should focus on:
- Identity (1 line)
- Core rules (4-5 bullet points max)
- Few-shot examples (most important part)
- Tool list
- Injected knowledge context

### 3. Add explicit structured output instructions

Small models need very clear instructions about tool calling behavior:

```
RULES:
- Call exactly ONE tool per step
- After tool completes: call another tool OR respond to user
- Never do multiple things at once
- If a command fails, read the error and try a different approach
```

### 4. Add few-shot tool usage examples

Add examples for the 3 most common tools. Small models learn better from examples than from abstract instructions:

```typescript
function buildFewShotExamples(): string {
  return `EXAMPLES:
User: "Create a hello.js file"
→ Use file_write with path="hello.js" content="console.log('hello')"

User: "Run the tests"
→ Use shell_exec with command="npm test"

User: "Show me the package.json"
→ Use file_read with path="package.json"`;
}
```

### 5. Remove irrelevant tool definitions

Tie into A3.4 (tool filtering) — the small model prompt should only describe tools that are actually available for this turn. This reduces token waste from tool definitions the model won't use.

### 6. Test with Qwen 2.5 Coder 7B

Iterate on the prompt until basic tasks work:
- Create a file → should use `file_write` correctly
- Run a command → should use `shell_exec` correctly
- Read a file → should use `file_read` correctly

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/agent/system-prompt.ts` | Add `buildSmallModelPrompt()`, add `buildFewShotExamples()`, modify `buildSystemPrompt()` to branch on model size |

## Acceptance Criteria

- [ ] Small model system prompt is < 500 tokens
- [ ] Agent can successfully create a file when asked (basic smoke test with 7B)
- [ ] Agent can run a shell command when asked
- [ ] Agent doesn't hallucinate tool names or parameters
- [ ] Large model prompt is unchanged (no regressions)
- [ ] Few-shot examples are included for shell_exec, file_write, file_read
- [ ] Existing tests still pass

## How to Verify

1. Start the server with a 7B model (e.g., `qwen2.5-coder:7b`)
2. Send "Create a file called hello.js with a console.log" — verify the agent uses `file_write`
3. Send "Run ls -la" — verify the agent uses `shell_exec`
4. Send "Show me package.json" — verify the agent uses `file_read`
5. Check server logs to see the system prompt — verify it's short and structured
6. Count tokens in the system prompt — should be < 500
7. Switch to a large model and verify the original verbose prompt is used

## Notes

- This is the highest-impact story for 7B usability. The system prompt is the single biggest lever for making small models work well.
- Prompt engineering for 7B models is iterative. The first version won't be perfect. Plan for 2-3 rounds of adjustment based on testing.
- The few-shot examples should match the exact tool parameter schema. If the examples use wrong parameter names, the model will copy the mistakes.
- Consider adding a "thinking" instruction: "Before calling a tool, briefly state what you're doing and why." This helps 7B models stay on track but costs tokens — test whether it's worth it.
- The `isSmallModel` flag should come from the same detection logic used in A3.1 (`isSmallModel()` helper).
