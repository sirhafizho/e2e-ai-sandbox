/**
 * Token budget tracking for context window management.
 *
 * Tracks estimated token usage against model context window limits.
 * Triggers actions at configurable thresholds:
 *   - 70%: warning, begin background summarization
 *   - 85%: critical, force summarization
 *   - 95%: emergency, checkpoint and reset
 *
 * Token counts are estimates — exact counts depend on the model's tokenizer.
 * We reserve 15% of the context window for the model's response.
 */

export type BudgetLevel = 'normal' | 'warning' | 'critical' | 'emergency';

export interface TokenBudgetConfig {
  /** Total model context window in tokens. */
  contextWindow: number;
  /** Fraction reserved for model response (default: 0.15). */
  responseReserve?: number;
  /** Warning threshold as fraction of usable budget (default: 0.70). */
  warningThreshold?: number;
  /** Critical threshold as fraction of usable budget (default: 0.85). */
  criticalThreshold?: number;
  /** Emergency threshold as fraction of usable budget (default: 0.95). */
  emergencyThreshold?: number;
}

export interface TokenBudgetStatus {
  /** Total model context window. */
  contextWindow: number;
  /** Usable budget (context window minus response reserve). */
  usableBudget: number;
  /** Current estimated token usage. */
  used: number;
  /** Tokens remaining before hitting usable budget. */
  remaining: number;
  /** Usage as fraction of usable budget (0.0 - 1.0+). */
  usageRatio: number;
  /** Current budget level based on thresholds. */
  level: BudgetLevel;
}

/** Known model context window sizes in tokens. */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Ollama / local models
  'qwen2.5-coder:7b': 32_768,
  'qwen2.5-coder:14b': 32_768,
  'qwen2.5-coder:32b': 32_768,
  'llama3.1:8b': 128_000,
  'llama3.1:70b': 128_000,
  'codellama:7b': 16_384,
  'codellama:13b': 16_384,
  'deepseek-coder-v2:16b': 128_000,
  'mistral:7b': 32_768,

  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'o1': 200_000,
  'o1-mini': 128_000,
  'o3-mini': 200_000,

  // Anthropic
  'claude-sonnet-4-20250514': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
};

/** Default context window when model is unknown. */
const DEFAULT_CONTEXT_WINDOW = 32_768;

/**
 * Look up the context window size for a model identifier.
 * Falls back to DEFAULT_CONTEXT_WINDOW for unknown models.
 */
export function getModelContextWindow(model: string): number {
  // Try exact match first
  if (MODEL_CONTEXT_WINDOWS[model]) {
    return MODEL_CONTEXT_WINDOWS[model];
  }
  // Try prefix match (e.g. "gpt-4o-2024-08-06" matches "gpt-4o")
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(key)) {
      return value;
    }
  }
  return DEFAULT_CONTEXT_WINDOW;
}

export class TokenBudget {
  private contextWindow: number;
  private responseReserve: number;
  private warningThreshold: number;
  private criticalThreshold: number;
  private emergencyThreshold: number;
  private used: number = 0;

  constructor(config: TokenBudgetConfig) {
    this.contextWindow = config.contextWindow;
    this.responseReserve = config.responseReserve ?? 0.15;
    this.warningThreshold = config.warningThreshold ?? 0.70;
    this.criticalThreshold = config.criticalThreshold ?? 0.85;
    this.emergencyThreshold = config.emergencyThreshold ?? 0.95;
  }

  /** Create a TokenBudget from a model name, looking up context window automatically. */
  static forModel(model: string, overrides?: Partial<TokenBudgetConfig>): TokenBudget {
    return new TokenBudget({
      contextWindow: getModelContextWindow(model),
      ...overrides,
    });
  }

  /** Usable token budget (context window minus response reserve). */
  get usableBudget(): number {
    return Math.floor(this.contextWindow * (1 - this.responseReserve));
  }

  /** Current estimated token usage. */
  get tokensUsed(): number {
    return this.used;
  }

  /** Tokens remaining before hitting usable budget. */
  get tokensRemaining(): number {
    return Math.max(0, this.usableBudget - this.used);
  }

  /** Usage as fraction of usable budget. */
  get usageRatio(): number {
    return this.usableBudget > 0 ? this.used / this.usableBudget : 1;
  }

  /** Current budget level based on thresholds. */
  get level(): BudgetLevel {
    const ratio = this.usageRatio;
    if (ratio >= this.emergencyThreshold) return 'emergency';
    if (ratio >= this.criticalThreshold) return 'critical';
    if (ratio >= this.warningThreshold) return 'warning';
    return 'normal';
  }

  /** Set token usage from an exact or estimated count. */
  setUsage(tokens: number): void {
    this.used = tokens;
  }

  /** Add tokens to the current usage count. */
  addUsage(tokens: number): void {
    this.used += tokens;
  }

  /** Record tokens freed by summarization or eviction. */
  reduceUsage(tokens: number): void {
    this.used = Math.max(0, this.used - tokens);
  }

  /** Reset usage to zero. */
  resetUsage(): void {
    this.used = 0;
  }

  /** Check if summarization should be triggered. */
  shouldSummarize(): boolean {
    return this.usageRatio >= this.warningThreshold;
  }

  /** Check if forced summarization is needed. */
  shouldForceSummarize(): boolean {
    return this.usageRatio >= this.criticalThreshold;
  }

  /** Check if emergency checkpoint is needed. */
  shouldCheckpoint(): boolean {
    return this.usageRatio >= this.emergencyThreshold;
  }

  /** Get a full status snapshot. */
  getStatus(): TokenBudgetStatus {
    return {
      contextWindow: this.contextWindow,
      usableBudget: this.usableBudget,
      used: this.used,
      remaining: this.tokensRemaining,
      usageRatio: this.usageRatio,
      level: this.level,
    };
  }
}
