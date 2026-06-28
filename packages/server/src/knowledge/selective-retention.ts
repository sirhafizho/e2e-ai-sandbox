import type { ModelMessage } from 'ai';

/**
 * Retention priority levels for different content types.
 */
export type RetentionPriority = 'always' | 'high' | 'medium' | 'low';

/**
 * Content categories with their retention priorities.
 */
export const RETENTION_RULES: Record<string, RetentionPriority> = {
  'system_prompt': 'always',
  'tool_definitions': 'always',
  'repository_rules': 'always',
  'todo_list': 'always',
  'pending_tool_calls': 'always',
  'last_3_turns': 'always',
  'knowledge_notes': 'high',
  'older_turns': 'medium',
  'tool_outputs': 'low',
};

/** Maximum lines for truncated file content (per side: head/tail). */
const MAX_FILE_LINES = 50;
/** Reduced file content lines for small models. */
const SMALL_MODEL_FILE_HEAD = 30;
const SMALL_MODEL_FILE_TAIL = 20;

/** Maximum lines for truncated shell output. */
const MAX_SHELL_LINES = 50;

/** Maximum length for individual tool output strings. */
const MAX_TOOL_OUTPUT_LENGTH = 2000;

/** Maximum grep matches to keep for small models. */
const SMALL_MODEL_MAX_GREP_LINES = 20;

/**
 * SelectiveRetention — strategies for intelligently trimming context.
 *
 * Implements the retention policies from the spec:
 * - Always retained: system prompt, tool defs, rules, todo, last 3 turns
 * - Summarized when needed: older turns, tool outputs
 * - Truncated aggressively: large file reads, long shell output, stack traces
 */
export class SelectiveRetention {
  /**
   * Truncate a tool output string using content-aware strategies.
   * Keeps the most useful parts while reducing token count.
   */
  truncateToolOutput(output: unknown): unknown {
    if (typeof output !== 'string') {
      return typeof output === 'object'
        ? this.truncateObjectOutput(output)
        : output;
    }

    const text = output;

    // Stack trace deduplication
    if (this.isStackTrace(text)) {
      return this.deduplicateStackTrace(text);
    }

    // File content: keep first/last N lines
    if (text.split('\n').length > MAX_FILE_LINES * 2) {
      return this.truncateFileContent(text);
    }

    // Shell output: keep last N lines + error extraction
    if (text.length > MAX_TOOL_OUTPUT_LENGTH) {
      return this.truncateShellOutput(text);
    }

    return text;
  }

  /**
   * Truncate object output (e.g., JSON tool results).
   */
  private truncateObjectOutput(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;

    const str = JSON.stringify(obj);
    if (str.length <= MAX_TOOL_OUTPUT_LENGTH) return obj;

    // If the object has a 'stdout' field (shell exec result), truncate it
    if (typeof obj === 'object' && 'stdout' in (obj as Record<string, unknown>)) {
      const result = obj as Record<string, unknown>;
      return {
        ...result,
        stdout: this.truncateShellOutput(String(result['stdout'] ?? '')),
        _truncated: true,
      };
    }

    // Generic truncation: convert to string and trim
    return str.slice(0, MAX_TOOL_OUTPUT_LENGTH) + '\n[...truncated]';
  }

  /**
   * Detect if text looks like a stack trace.
   */
  private isStackTrace(text: string): boolean {
    const stackPatterns = [
      /^\s+at\s+/m,
      /Traceback \(most recent call last\)/,
      /^\s+File "/m,
      /Error:\s+.+\n\s+at /,
    ];
    return stackPatterns.some((p) => p.test(text));
  }

  /**
   * Deduplicate repeated stack frames.
   * Keeps the first occurrence of each unique frame.
   */
  private deduplicateStackTrace(text: string): string {
    const lines = text.split('\n');
    const seen = new Set<string>();
    const result: string[] = [];
    let skipped = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('at ') || trimmed.startsWith('File "')) {
        if (seen.has(trimmed)) {
          skipped++;
          continue;
        }
        seen.add(trimmed);
      }
      result.push(line);
    }

    if (skipped > 0) {
      result.push(`[${skipped} duplicate stack frame(s) removed]`);
    }

    return result.join('\n');
  }

  /**
   * Truncate file content: keep first N and last N lines.
   */
  private truncateFileContent(text: string): string {
    const lines = text.split('\n');
    if (lines.length <= MAX_FILE_LINES * 2) return text;

    const firstLines = lines.slice(0, MAX_FILE_LINES);
    const lastLines = lines.slice(-MAX_FILE_LINES);
    const omitted = lines.length - MAX_FILE_LINES * 2;

    return [
      ...firstLines,
      `\n[... ${omitted} lines omitted ...]\n`,
      ...lastLines,
    ].join('\n');
  }

  /**
   * Truncate shell output: keep last N lines + extract errors.
   */
  private truncateShellOutput(text: string): string {
    const lines = text.split('\n');
    if (lines.length <= MAX_SHELL_LINES) {
      // Short output — only trim by character length if truly oversized
      if (text.length <= MAX_TOOL_OUTPUT_LENGTH) return text;
      return text.slice(0, MAX_TOOL_OUTPUT_LENGTH) + '\n[...truncated]';
    }

    // Extract error lines first
    const errorLines = lines.filter((l) =>
      /error|fail|exception|warn/i.test(l),
    ).slice(0, 10);

    // Keep last N lines
    const lastLines = lines.slice(-MAX_SHELL_LINES);

    const parts: string[] = [];

    if (errorLines.length > 0) {
      parts.push('[Extracted errors/warnings:]');
      parts.push(...errorLines);
      parts.push('');
    }

    parts.push(`[Last ${MAX_SHELL_LINES} of ${lines.length} lines:]`);
    parts.push(...lastLines);

    return parts.join('\n');
  }

  /**
   * Model-size-aware compression for tool outputs.
   * Small models get more aggressive compression to save context tokens.
   */
  compressForModel(
    output: unknown,
    toolName: string,
    exitCode: number,
    smallModel: boolean,
  ): unknown {
    if (!smallModel) {
      return this.truncateToolOutput(output);
    }

    // Handle empty/null outputs for small models with clear indicators
    if (output === null || output === undefined) {
      return exitCode === 0 ? '[No output]' : '[Error with no output]';
    }

    if (typeof output === 'string' && output.trim() === '') {
      return exitCode === 0 ? '[No output]' : '[Error with no output]';
    }

    if (typeof output !== 'string') {
      return this.truncateToolOutput(output);
    }

    switch (toolName) {
      case 'shell_exec':
        return this.compressShellForSmallModel(output, exitCode);
      case 'file_read':
        return this.compressFileForSmallModel(output);
      case 'grep':
        return this.compressGrepForSmallModel(output);
      default:
        return this.truncateToolOutput(output);
    }
  }

  /**
   * Compress shell output for small models.
   * Success: last 20 lines. Failure: first 5 + last 20 + error lines.
   */
  private compressShellForSmallModel(output: string, exitCode: number): string {
    // Try smart extraction for known tool outputs first
    const smartSummary = this.extractShellSummary(output);
    if (smartSummary) return smartSummary;

    const lines = output.split('\n');
    if (lines.length <= 20) return output;

    if (exitCode === 0) {
      return `[... ${lines.length - 20} lines omitted ...]\n` + lines.slice(-20).join('\n');
    }

    // Failure: head + tail + error lines
    const head = lines.slice(0, 5);
    const tail = lines.slice(-20);
    const errorLines = lines.filter((l) => /error|fail|exception|warn/i.test(l)).slice(0, 10);

    const parts: string[] = [];
    parts.push(...head);
    if (errorLines.length > 0) {
      parts.push('[Extracted errors:]');
      parts.push(...errorLines);
    }
    parts.push(`[... last 20 of ${lines.length} lines:]`);
    parts.push(...tail);
    return parts.join('\n');
  }

  /**
   * Compress file reads for small models (30 head + 20 tail).
   */
  private compressFileForSmallModel(output: string): string {
    const lines = output.split('\n');
    if (lines.length <= SMALL_MODEL_FILE_HEAD + SMALL_MODEL_FILE_TAIL) return output;

    const head = lines.slice(0, SMALL_MODEL_FILE_HEAD);
    const tail = lines.slice(-SMALL_MODEL_FILE_TAIL);
    const omitted = lines.length - SMALL_MODEL_FILE_HEAD - SMALL_MODEL_FILE_TAIL;
    return [...head, `\n[... ${omitted} lines omitted ...]\n`, ...tail].join('\n');
  }

  /**
   * Compress grep results for small models (first 20 matches).
   */
  private compressGrepForSmallModel(output: string): string {
    const lines = output.split('\n');
    if (lines.length <= SMALL_MODEL_MAX_GREP_LINES) return output;
    return lines.slice(0, SMALL_MODEL_MAX_GREP_LINES).join('\n')
      + `\n[... ${lines.length - SMALL_MODEL_MAX_GREP_LINES} more matches omitted]`;
  }

  /**
   * Extract a structured summary from known shell command outputs.
   * Returns null if the output doesn't match any known pattern.
   */
  private extractShellSummary(output: string): string | null {
    // npm/pnpm install
    if (/added \d+ package/i.test(output) || /packages are looking for funding/i.test(output)) {
      const addedMatch = output.match(/added (\d+) package/i);
      const vulnMatch = output.match(/(\d+) vulnerabilit/i);
      const parts = [];
      if (addedMatch) parts.push(`${addedMatch[1]} packages installed`);
      if (vulnMatch) parts.push(`${vulnMatch[1]} vulnerabilities`);
      else parts.push('0 vulnerabilities');
      return parts.join(', ');
    }

    // Test runners (vitest, jest, mocha)
    if (/Tests?:?\s+\d+\s+(passed|failed)/i.test(output) ||
        /Test Suites?:?\s+\d+/i.test(output) ||
        /✓|✗|PASS|FAIL/i.test(output)) {
      const lines = output.split('\n');
      // Keep summary lines (usually near the end)
      const summaryLines = lines.filter((l) =>
        /Tests?:?\s+\d+/i.test(l) || /Test Suites?:/i.test(l) ||
        /passed|failed|pending/i.test(l) || /FAIL\s/i.test(l),
      ).slice(0, 5);
      // Keep failed test details
      const failLines = lines.filter((l) =>
        /FAIL|✗|×|Error:|AssertionError/i.test(l),
      ).slice(0, 5);
      return [...new Set([...summaryLines, ...failLines])].join('\n') || null;
    }

    // TypeScript compilation errors
    if (/error TS\d+/i.test(output)) {
      const lines = output.split('\n');
      const errorLines = lines.filter((l) => /error TS\d+/i.test(l)).slice(0, 5);
      const totalErrors = errorLines.length;
      const summaryMatch = output.match(/Found (\d+) error/i);
      const summary = summaryMatch ? `Build failed: ${summaryMatch[1]} errors` : `Build failed: ${totalErrors}+ errors`;
      return [summary, ...errorLines].join('\n');
    }

    return null;
  }

  /**
   * Classify a message's retention priority.
   */
  classifyMessage(message: ModelMessage, _index: number, _total: number): RetentionPriority {
    // Tool results are low priority
    if (message.role === 'tool') return 'low';

    // System messages are always retained
    if (message.role === 'system') return 'always';

    // User/assistant messages are medium (will be summarized)
    return 'medium';
  }
}
