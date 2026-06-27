# Story A3.3: Compress Tool Output More Aggressively

> **Sprint:** A3 — 7B Model Tuning | **Priority:** P1 | **Size:** M (1-3 hours)
> **Depends on:** A2.3 (selective retention should be wired first)

## Problem

Tool outputs consume too many tokens. `npm install` produces 100+ lines but the model only needs "47 packages installed, 0 vulnerabilities". Test output produces pages but the model only needs "5 passed, 1 failed: test/auth.test.ts:42". Currently, `SelectiveRetention` does basic truncation. Need smarter extraction.

## What Needs to Happen

### 1. Enhance `extractShellSummary()` for common tools

In `selective-retention.ts`, enhance `extractShellSummary()` to recognize and extract key information from common tool outputs:

```typescript
extractShellSummary(output: string, exitCode: number): string {
  // npm/pnpm install
  if (this.isPackageInstall(output)) {
    return this.extractPackageInstallSummary(output);
    // e.g., "47 packages installed, 0 vulnerabilities"
  }

  // Test runners (vitest, jest, mocha)
  if (this.isTestOutput(output)) {
    return this.extractTestSummary(output);
    // e.g., "Tests: 5 passed, 1 failed\nFailed: test/auth.test.ts:42 - expected 200 got 401"
  }

  // Build tools (tsc, esbuild)
  if (this.isBuildOutput(output)) {
    return this.extractBuildSummary(output);
    // e.g., "Build failed: 3 errors\n  src/app.ts:42 - TS2345: ...\n  src/utils.ts:18 - TS2307: ..."
  }

  // Git commands — keep full output (usually small)
  if (this.isGitOutput(output)) {
    return output;
  }

  return this.defaultTruncation(output, exitCode);
}
```

### 2. Add tool-specific output compression

Add a new method `compressForModel()` that applies model-size-aware compression:

```typescript
compressForModel(
  output: string,
  toolName: string,
  exitCode: number,
  isSmallModel: boolean
): string {
  if (!isSmallModel) {
    return this.truncateToolOutput(output, toolName); // existing behavior
  }

  switch (toolName) {
    case 'shell_exec':
      if (exitCode === 0) {
        // Success output is less important — keep last 20 lines
        return this.keepLastN(output, 20);
      } else {
        // Error output is critical — keep first 5 + last 20 + all error/warning lines
        return this.keepErrorContext(output, { head: 5, tail: 20 });
      }

    case 'file_read':
      // For 7B, less is more — 30 + 20 instead of 50 + 50
      return this.headTail(output, 30, 20);

    case 'grep':
      // Keep first 20 matches, not 100
      return this.keepFirstN(output, 20);

    default:
      return this.truncateToolOutput(output, toolName);
  }
}
```

### 3. Make compression configurable

Pass model size information so compression adapts:

```typescript
// In conversation-history.ts, when adding tool results:
const compressed = this.retention.compressForModel(
  toolResult.output,
  toolName,
  exitCode,
  this.isSmallModel,
);
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/knowledge/selective-retention.ts` | Enhance `extractShellSummary()` with pattern matchers for npm/test/build output, add `compressForModel()` method, add helper methods for extraction |

## Acceptance Criteria

- [ ] npm/pnpm install output is compressed to 2-3 lines (package count + vulnerability summary)
- [ ] Test runner output (vitest, jest, mocha) shows pass/fail summary and failed test locations
- [ ] Build errors (tsc, esbuild) show error count and first 3 error messages
- [ ] Git command output is kept in full (usually small already)
- [ ] `file_read` output is trimmed more aggressively for small models (30+20 instead of 50+50)
- [ ] `grep` output is limited to first 20 matches for small models
- [ ] No information loss for error cases (errors and warnings are always preserved)
- [ ] Large models use existing truncation behavior (no regressions)
- [ ] Existing tests still pass

## How to Verify

1. Start the server with a 7B model
2. Send "run npm install" in a project with many dependencies
3. Check the conversation history — should see a 2-3 line summary, not 100+ lines
4. Send "run npm test" in a project with tests
5. Check the conversation history — should see pass/fail summary with failed test locations
6. Send "read package.json" on a large file — should see 30 head + 20 tail lines
7. Compare token usage before and after — should be measurably lower for tool-heavy sessions

## Notes

- This story builds on top of A2.3 (selective retention wiring). The `SelectiveRetention` class should already be instantiated and applied to tool outputs.
- The pattern matching for npm/test/build output should be robust but not over-engineered. Start with simple regex patterns for the most common output formats.
- Error preservation is critical — never compress away error messages, stack traces, or failure details. When in doubt, keep more error context.
- The compression ratios (20 lines for success, 30+20 for file reads) are starting points. May need adjustment based on real-world testing.
- For `shell_exec` with exit code 0, the model usually just needs confirmation that the command succeeded. The last 20 lines typically contain the most relevant output.
