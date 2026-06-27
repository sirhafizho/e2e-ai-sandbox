import type { ModelMessage } from 'ai';
import { estimateMessagesTokens } from './token-estimator.js';
import { SelectiveRetention } from '../knowledge/selective-retention.js';

/**
 * Manages conversation history for a session.
 *
 * Stores messages as AI SDK ModelMessage objects so they can be passed
 * directly to streamText(). Handles appending user messages, capturing
 * assistant responses (including tool calls/results), and providing
 * the full history for the next LLM turn.
 *
 * Supports context windowing: older turns can be replaced with a compressed
 * summary to stay within token budgets. The last N turns are always retained.
 */

/** Number of recent turns always retained during context windowing. */
const DEFAULT_RETAINED_TURNS = 3;

export class ConversationHistory {
  private messages: ModelMessage[] = [];
  /** Summary of evicted older turns, injected as context. */
  private contextSummary: string | null = null;
  /** Number of recent turns to always keep. */
  private retainedTurns: number;
  /** Selective retention for smart tool output truncation. */
  private retention = new SelectiveRetention();

  constructor(options?: { retainedTurns?: number; messages?: ModelMessage[] }) {
    this.retainedTurns = options?.retainedTurns ?? DEFAULT_RETAINED_TURNS;
    if (options?.messages) {
      this.messages = [...options.messages];
    }
  }

  /** Total number of messages in history. */
  get length(): number {
    return this.messages.length;
  }

  /** Whether a context summary exists from prior windowing. */
  get hasSummary(): boolean {
    return this.contextSummary !== null;
  }

  /** Add a user message to history. */
  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  /** Add a system message to history (used for micro-step hints). */
  addSystemMessage(content: string): void {
    this.messages.push({ role: 'system', content });
  }

  /**
   * Add assistant response messages to history.
   * These come from streamText().responseMessages and may include
   * assistant text, tool calls, and tool results.
   *
   * Tool result content is truncated using SelectiveRetention to
   * reduce token usage (stack trace dedup, file content trimming, etc).
   */
  addResponseMessages(messages: ModelMessage[]): void {
    for (const msg of messages) {
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        // Truncate tool result content while preserving message structure
        const truncatedContent = msg.content.map((part) => {
          if (typeof part === 'object' && part !== null && 'result' in part) {
            const toolPart = part as { type: string; toolCallId: string; toolName: string; result: unknown };
            return { ...toolPart, result: this.retention.truncateToolOutput(toolPart.result) };
          }
          return part;
        });
        this.messages.push({ ...msg, content: truncatedContent as typeof msg.content });
      } else {
        this.messages.push(msg);
      }
    }
  }

  /** Get all messages for passing to streamText(). */
  getMessages(): ModelMessage[] {
    return [...this.messages];
  }

  /** Get the context summary if one exists (for injection into system prompt). */
  getContextSummary(): string | null {
    return this.contextSummary;
  }

  /** Estimate total tokens for all messages in history. */
  estimateTokens(): number {
    return estimateMessagesTokens(this.messages);
  }

  /** Clear all history and any context summary. */
  clear(): void {
    this.messages = [];
    this.contextSummary = null;
  }

  /**
   * Identify a "turn boundary" — find the message index where the last N
   * user-initiated turns begin. A turn starts with a user message.
   *
   * Returns the index of the first message to retain, or 0 if there aren't
   * enough turns to warrant windowing.
   */
  findTurnBoundary(): number {
    let turnCount = 0;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i]!.role === 'user') {
        turnCount++;
        if (turnCount >= this.retainedTurns) {
          return i;
        }
      }
    }
    return 0; // Not enough turns to window
  }

  /**
   * Apply context windowing: replace older turns with a summary.
   *
   * This is the "dumb" windowing that just drops old turns — no LLM call.
   * For LLM-based summarization, the AgentLoop calls this after getting
   * a summary from the model.
   *
   * @param summary - Compressed summary of evicted turns (from LLM or simple extraction)
   * @returns Number of tokens freed (estimated)
   */
  applyWindowing(summary: string): number {
    const boundary = this.findTurnBoundary();
    if (boundary === 0) return 0; // Nothing to window

    const evictedMessages = this.messages.slice(0, boundary);
    const evictedTokens = estimateMessagesTokens(evictedMessages);

    // Merge with existing summary if one exists
    this.contextSummary = this.contextSummary
      ? `${this.contextSummary}\n\n${summary}`
      : summary;

    // Keep only the retained messages
    this.messages = this.messages.slice(boundary);

    return evictedTokens;
  }

  /**
   * Build a text representation of the messages that would be evicted
   * during windowing. Useful for passing to an LLM for summarization.
   */
  getEvictableContent(): string {
    const boundary = this.findTurnBoundary();
    if (boundary === 0) return '';

    const evictable = this.messages.slice(0, boundary);
    const lines: string[] = [];

    for (const msg of evictable) {
      const role = msg.role.toUpperCase();
      if (typeof msg.content === 'string') {
        lines.push(`[${role}]: ${msg.content}`);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (typeof part === 'object' && part !== null && 'text' in part) {
            lines.push(`[${role}]: ${part.text}`);
          } else if (typeof part === 'object' && part !== null && 'toolName' in part) {
            lines.push(`[${role} TOOL CALL]: ${(part as { toolName: string }).toolName}`);
          } else if (typeof part === 'object' && part !== null && 'result' in part) {
            const result = (part as { result: unknown }).result;
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            lines.push(`[TOOL RESULT]: ${resultStr.slice(0, 500)}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /** Estimate tokens for the evictable portion of history. */
  estimateEvictableTokens(): number {
    const boundary = this.findTurnBoundary();
    if (boundary === 0) return 0;
    return estimateMessagesTokens(this.messages.slice(0, boundary));
  }

  /**
   * Get a summary of the conversation for debugging/logging.
   * Returns role + content preview for each message.
   */
  getSummary(): Array<{ role: string; preview: string }> {
    return this.messages.map((msg) => {
      let preview: string;
      if (typeof msg.content === 'string') {
        preview = msg.content.slice(0, 100);
      } else if (Array.isArray(msg.content)) {
        const textPart = msg.content.find(
          (p) => typeof p === 'object' && 'type' in p && p.type === 'text',
        );
        preview = textPart && 'text' in textPart ? String(textPart.text).slice(0, 100) : '[non-text]';
      } else {
        preview = '[complex]';
      }
      return { role: msg.role, preview };
    });
  }
}
