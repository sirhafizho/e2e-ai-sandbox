/**
 * Error recovery with escalation ladder.
 *
 * Classifies errors, applies retry policies with exponential backoff,
 * and escalates through: retry → alternative approach → ask user.
 *
 * Error categories and their retry policies are based on the agent
 * loop spec (specs/agent/agent-loop.md).
 */

export type ErrorCategory =
  | 'tool_timeout'
  | 'command_failed'
  | 'file_not_found'
  | 'llm_rate_limit'
  | 'llm_server_error'
  | 'permission_denied'
  | 'network_error'
  | 'unknown';

export type EscalationLevel = 'retry' | 'alternative' | 'ask_user' | 'escalate';

export interface RetryPolicy {
  /** Maximum number of retry attempts. */
  maxRetries: number;
  /** Base delay in milliseconds. */
  baseDelayMs: number;
  /** Backoff multiplier (delay doubles each attempt by default). */
  backoffMultiplier: number;
  /** Whether to add random jitter to prevent thundering herd. */
  jitter: boolean;
}

export interface ErrorRecoveryEvent {
  category: ErrorCategory;
  level: EscalationLevel;
  attempt: number;
  maxAttempts: number;
  error: string;
  delayMs?: number;
}

/** Retry policies per error category (from spec). */
const RETRY_POLICIES: Record<ErrorCategory, RetryPolicy> = {
  tool_timeout: { maxRetries: 3, baseDelayMs: 1000, backoffMultiplier: 2, jitter: false },
  command_failed: { maxRetries: 2, baseDelayMs: 0, backoffMultiplier: 2, jitter: false },
  file_not_found: { maxRetries: 1, baseDelayMs: 0, backoffMultiplier: 1, jitter: false },
  llm_rate_limit: { maxRetries: 5, baseDelayMs: 2000, backoffMultiplier: 2, jitter: true },
  llm_server_error: { maxRetries: 3, baseDelayMs: 5000, backoffMultiplier: 2, jitter: false },
  permission_denied: { maxRetries: 0, baseDelayMs: 0, backoffMultiplier: 1, jitter: false },
  network_error: { maxRetries: 3, baseDelayMs: 2000, backoffMultiplier: 2, jitter: false },
  unknown: { maxRetries: 1, baseDelayMs: 1000, backoffMultiplier: 2, jitter: false },
};

/**
 * Classify an error into a category for retry policy lookup.
 */
export function classifyError(error: unknown): ErrorCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // LLM API errors
  if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
    return 'llm_rate_limit';
  }
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('internal server error') || message.includes('service unavailable')) {
    return 'llm_server_error';
  }

  // Network errors
  if (message.includes('econnrefused') || message.includes('enotfound') || message.includes('etimedout') || message.includes('fetch failed') || message.includes('network')) {
    return 'network_error';
  }

  // Permission errors
  if (message.includes('permission denied') || message.includes('eacces') || message.includes('forbidden') || message.includes('401') || message.includes('403')) {
    return 'permission_denied';
  }

  // File errors
  if (message.includes('enoent') || message.includes('no such file') || message.includes('file not found') || message.includes('not found')) {
    return 'file_not_found';
  }

  // Tool/command errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'tool_timeout';
  }
  if (message.includes('exit code') || message.includes('non-zero') || message.includes('command failed')) {
    return 'command_failed';
  }

  return 'unknown';
}

/** Get the retry policy for an error category. */
export function getRetryPolicy(category: ErrorCategory): RetryPolicy {
  return RETRY_POLICIES[category];
}

/**
 * Calculate the delay for a retry attempt.
 * Uses exponential backoff with optional jitter.
 */
const MAX_RETRY_DELAY_MS = 60_000; // Cap at 1 minute

export function calculateRetryDelay(policy: RetryPolicy, attempt: number): number {
  if (policy.baseDelayMs === 0) return 0;

  const raw = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt);
  const delay = Math.min(raw, MAX_RETRY_DELAY_MS);

  if (policy.jitter) {
    // Add random jitter: 0.5x to 1.5x the calculated delay
    const jitterFactor = 0.5 + Math.random();
    return Math.floor(delay * jitterFactor);
  }

  return Math.floor(delay);
}

/**
 * Determine the current escalation level based on retry attempts.
 */
export function getEscalationLevel(category: ErrorCategory, attempt: number): EscalationLevel {
  const policy = getRetryPolicy(category);

  // Permission denied: immediately ask user
  if (category === 'permission_denied') return 'ask_user';

  // Still within retry budget
  if (attempt < policy.maxRetries) return 'retry';

  // Exhausted retries: suggest alternative approach
  if (attempt === policy.maxRetries) return 'alternative';

  // Beyond alternative: escalate to user
  return 'escalate';
}

/** Sleep for a given number of milliseconds, with optional abort support. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new Error('Aborted')); return; }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => { clearTimeout(timer); reject(signal.reason ?? new Error('Aborted')); };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Execute a function with retry logic.
 *
 * @param fn - The async function to execute
 * @param options - Configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    /** Error category to apply policy for. If not provided, classifies on first error. */
    category?: ErrorCategory;
    /** Override the default retry policy. */
    policy?: Partial<RetryPolicy>;
    /** Callback for each retry attempt (for logging/events). */
    onRetry?: (event: ErrorRecoveryEvent) => void;
    /** AbortSignal to cancel retries. */
    abortSignal?: AbortSignal;
  } = {},
): Promise<T> {
  let category = options.category;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {

      // Classify on first error if not provided
      if (!category) {
        category = classifyError(error);
      }

      const basePolicy = getRetryPolicy(category);
      const policy: RetryPolicy = { ...basePolicy, ...options.policy };
      const level = getEscalationLevel(category, attempt);

      // Notify about the retry/escalation
      if (options.onRetry) {
        const delayMs = level === 'retry' ? calculateRetryDelay(policy, attempt) : undefined;
        options.onRetry({
          category,
          level,
          attempt,
          maxAttempts: policy.maxRetries,
          error: error instanceof Error ? error.message : String(error),
          delayMs,
        });
      }

      // Check if we should stop retrying
      if (level !== 'retry') {
        throw error;
      }

      // Check abort signal before and after sleep
      if (options.abortSignal?.aborted) {
        throw error;
      }

      // Wait before retrying (sleep respects abort signal)
      const delayMs = calculateRetryDelay(policy, attempt);
      if (delayMs > 0) {
        try {
          await sleep(delayMs, options.abortSignal);
        } catch {
          // Sleep was aborted — re-throw the original tool error
          throw error;
        }
      }

      attempt++;
    }
  }
}

/**
 * Build a user-friendly error report for escalation.
 * Includes what failed, why, what was tried, and recommendations.
 */
export function buildErrorReport(
  category: ErrorCategory,
  error: unknown,
  attempts: number,
): string {
  const message = error instanceof Error ? error.message : String(error);
  const policy = getRetryPolicy(category);

  const lines = [
    `**Error:** ${message}`,
    `**Category:** ${category}`,
    `**Attempts:** ${attempts + 1}/${policy.maxRetries + 1}`,
  ];

  // Add category-specific recommendations
  switch (category) {
    case 'llm_rate_limit':
      lines.push('**Recommendation:** Wait a moment and try again, or switch to a different model/provider.');
      break;
    case 'llm_server_error':
      lines.push('**Recommendation:** The LLM provider may be experiencing issues. Try again later or switch providers.');
      break;
    case 'network_error':
      lines.push('**Recommendation:** Check your network connection and verify the LLM endpoint is reachable.');
      break;
    case 'permission_denied':
      lines.push('**Recommendation:** Check file permissions or authentication credentials.');
      break;
    case 'file_not_found':
      lines.push('**Recommendation:** Verify the file path exists. Use find_files to search for the correct location.');
      break;
    case 'tool_timeout':
      lines.push('**Recommendation:** The command may be taking too long. Try breaking it into smaller steps.');
      break;
    case 'command_failed':
      lines.push('**Recommendation:** Check the command output for details about what went wrong.');
      break;
    default:
      lines.push('**Recommendation:** Review the error details and try a different approach.');
  }

  return lines.join('\n');
}
