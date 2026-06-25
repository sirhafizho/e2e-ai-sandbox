import type { ModelMessage } from 'ai';

/**
 * Manages conversation history for a session.
 *
 * Stores messages as AI SDK ModelMessage objects so they can be passed
 * directly to streamText(). Handles appending user messages, capturing
 * assistant responses (including tool calls/results), and providing
 * the full history for the next LLM turn.
 */
export class ConversationHistory {
  private messages: ModelMessage[] = [];

  /** Total number of messages in history. */
  get length(): number {
    return this.messages.length;
  }

  /** Add a user message to history. */
  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  /**
   * Add assistant response messages to history.
   * These come from streamText().responseMessages and may include
   * assistant text, tool calls, and tool results.
   */
  addResponseMessages(messages: ModelMessage[]): void {
    this.messages.push(...messages);
  }

  /** Get all messages for passing to streamText(). */
  getMessages(): ModelMessage[] {
    return [...this.messages];
  }

  /** Clear all history. */
  clear(): void {
    this.messages = [];
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
