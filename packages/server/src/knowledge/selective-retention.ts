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

/** Maximum lines for truncated file content. */
const MAX_FILE_LINES = 50;

/** Maximum lines for truncated shell output. */
const MAX_SHELL_LINES = 50;

/** Maximum length for individual tool output strings. */
const MAX_TOOL_OUTPUT_LENGTH = 2000;

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
      return text.slice(0, MAX_TOOL_OUTPUT_LENGTH);
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
