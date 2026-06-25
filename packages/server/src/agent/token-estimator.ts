import type { ModelMessage } from 'ai';

/**
 * Approximate token estimation for context budget tracking.
 *
 * Uses a simple heuristic: ~4 characters per token for English text,
 * which is a reasonable approximation for most models (GPT, Claude, Llama).
 *
 * For exact counts you'd need model-specific tokenizers (tiktoken for OpenAI,
 * sentencepiece for Llama, etc.), but approximate counting is sufficient for
 * budget management — the thresholds have enough margin to absorb the error.
 */

const CHARS_PER_TOKEN = 4;

/** Overhead per message for role tokens, formatting, separators. */
const MESSAGE_OVERHEAD_TOKENS = 4;

/** Estimate tokens for a string. */
export function estimateStringTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for a single ModelMessage.
 * Handles both string content and structured content arrays.
 */
export function estimateMessageTokens(message: ModelMessage): number {
  let tokens = MESSAGE_OVERHEAD_TOKENS; // role + separators

  if (typeof message.content === 'string') {
    tokens += estimateStringTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (typeof part === 'string') {
        tokens += estimateStringTokens(part);
      } else if (typeof part === 'object' && part !== null) {
        if ('text' in part && typeof part.text === 'string') {
          tokens += estimateStringTokens(part.text);
        } else if ('toolName' in part) {
          // Tool call: name + serialized args
          tokens += estimateStringTokens(
            JSON.stringify(part),
          );
        } else if ('result' in part) {
          // Tool result
          tokens += estimateStringTokens(
            typeof part.result === 'string'
              ? part.result
              : JSON.stringify(part.result),
          );
        } else {
          // Other structured content
          tokens += estimateStringTokens(JSON.stringify(part));
        }
      }
    }
  }

  return tokens;
}

/** Estimate total tokens for an array of messages. */
export function estimateMessagesTokens(messages: ModelMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

/**
 * Estimate tokens for the system prompt + tool definitions.
 * This represents the "fixed cost" that's always in the context.
 */
export function estimateSystemTokens(systemPrompt: string, toolCount: number): number {
  // System prompt tokens
  let tokens = estimateStringTokens(systemPrompt);
  // Each tool definition averages ~100-200 tokens (name, description, schema)
  tokens += toolCount * 150;
  return tokens;
}
