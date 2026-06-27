import { streamText, dynamicTool, isStepCount, type LanguageModel } from 'ai';
import type { ToolRegistry } from '../tools/registry.js';
import type { ContainerManager } from '../sandbox/container-manager.js';
import type { SessionContext, AgentEvent, AgentEventType } from './types.js';
import { ConversationHistory } from './conversation-history.js';
import { buildSystemPrompt } from './system-prompt.js';
import { TokenBudget, type BudgetLevel } from './token-budget.js';
import { TodoTracker } from './todo-tracker.js';
import { ParallelDispatch } from './parallel-dispatch.js';
import { estimateSystemTokens } from './token-estimator.js';
import { withRetry } from './error-recovery.js';

const MAX_STEPS = 25;

export interface AgentLoopOptions {
  history?: ConversationHistory;
  tokenBudget?: TokenBudget;
  todoTracker?: TodoTracker;
  /** Maximum parallel tool calls (default: 10). */
  maxParallelToolCalls?: number;
  /** Disable retry logic (useful for testing). */
  disableRetry?: boolean;
}

export class AgentLoop {
  private model: LanguageModel;
  private toolRegistry: ToolRegistry;
  private containerManager: ContainerManager;
  private history: ConversationHistory;
  private tokenBudget: TokenBudget | null;
  private todoTracker: TodoTracker;
  private parallelDispatch: ParallelDispatch;
  private disableRetry: boolean;
  /** Queue for error recovery events emitted during tool execution callbacks. */
  private pendingRecoveryEvents: AgentEvent[] = [];

  constructor(
    model: LanguageModel,
    toolRegistry: ToolRegistry,
    containerManager: ContainerManager,
    options?: AgentLoopOptions,
  ) {
    this.model = model;
    this.toolRegistry = toolRegistry;
    this.containerManager = containerManager;
    this.history = options?.history ?? new ConversationHistory();
    this.tokenBudget = options?.tokenBudget ?? null;
    this.todoTracker = options?.todoTracker ?? new TodoTracker();
    this.parallelDispatch = new ParallelDispatch(options?.maxParallelToolCalls ?? 10);
    this.disableRetry = options?.disableRetry ?? false;
  }

  /** Get the conversation history for inspection or persistence. */
  getHistory(): ConversationHistory {
    return this.history;
  }

  /** Get the token budget tracker (null if not configured). */
  getTokenBudget(): TokenBudget | null {
    return this.tokenBudget;
  }

  /** Get the todo tracker for inspection or persistence. */
  getTodoTracker(): TodoTracker {
    return this.todoTracker;
  }

  /**
   * Update the token budget with current usage estimates.
   * Returns the new budget level, or null if no budget is configured.
   */
  private updateBudget(systemPrompt: string, toolCount: number): BudgetLevel | null {
    if (!this.tokenBudget) return null;

    const systemTokens = estimateSystemTokens(systemPrompt, toolCount);
    const historyTokens = this.history.estimateTokens();
    this.tokenBudget.setUsage(systemTokens + historyTokens);

    return this.tokenBudget.level;
  }

  /**
   * Perform context windowing if the token budget requires it.
   * Uses a simple extractive summary (no LLM call) — the evictable content
   * is compressed into key lines and injected as context summary.
   *
   * Yields token_budget and context_windowed events.
   */
  private async *handleBudgetPressure(
    systemPrompt: string,
    toolCount: number,
  ): AsyncGenerator<AgentEvent> {
    if (!this.tokenBudget) return;

    const level = this.updateBudget(systemPrompt, toolCount);
    if (!level) return;

    // Always emit current budget status
    const status = this.tokenBudget.getStatus();
    yield {
      type: 'token_budget',
      data: {
        level: status.level,
        usageRatio: Math.round(status.usageRatio * 100) / 100,
        used: status.used,
        remaining: status.remaining,
        usableBudget: status.usableBudget,
      },
    };

    // Check if windowing is needed
    if (this.tokenBudget.shouldSummarize()) {
      const evictableContent = this.history.getEvictableContent();
      if (!evictableContent) return;

      // Build a simple extractive summary from the evictable content
      const summary = this.buildExtractSummary(evictableContent);
      const messagesBefore = this.history.length;

      const tokensFreed = this.history.applyWindowing(summary);

      // Update budget after windowing
      this.updateBudget(systemPrompt, toolCount);

      yield {
        type: 'context_windowed',
        data: {
          evictedMessages: messagesBefore - this.history.length,
          tokensFreed,
          newLevel: this.tokenBudget.level,
        },
      };
    }
  }

  /**
   * Build a simple extractive summary from conversation content.
   * This is a fallback for when no LLM summarization is available.
   * Keeps the first/last lines and key markers.
   */
  private buildExtractSummary(content: string): string {
    const lines = content.split('\n');
    if (lines.length <= 10) return content;

    // Keep first 3 and last 3 lines, add a count indicator
    const kept = [
      ...lines.slice(0, 3),
      `[... ${lines.length - 6} earlier messages summarized ...]`,
      ...lines.slice(-3),
    ];
    return kept.join('\n');
  }

  async *run(
    userMessage: string,
    sessionContext: SessionContext,
    options?: { abortSignal?: AbortSignal },
  ): AsyncGenerator<AgentEvent> {
    const toolSpecs = this.toolRegistry.list();
    const systemPrompt =
      sessionContext.systemPrompt ??
      buildSystemPrompt({
        toolNames: toolSpecs.map((t) => t.name),
        sessionId: sessionContext.sessionId,
      });

    // Append user message to conversation history
    this.history.addUserMessage(userMessage);

    // Check token budget before sending to LLM — may trigger windowing
    yield* this.handleBudgetPressure(systemPrompt, toolSpecs.length);

    // Build system prompt with context summary and todo list
    let effectiveSystemPrompt = systemPrompt;
    const contextSummary = this.history.getContextSummary();
    if (contextSummary) {
      effectiveSystemPrompt += `\n\n## Previous Context Summary\n${contextSummary}`;
    }
    const todoContext = this.todoTracker.toContext();
    if (todoContext) {
      effectiveSystemPrompt += `\n\n${todoContext}`;
    }

    // Build AI SDK tool definitions from registry using dynamicTool()
    // for runtime-registered tools with unknown input/output types.
    // Tool execution is wrapped with retry logic for resilience.
    const aiTools: Record<string, ReturnType<typeof dynamicTool>> = {};
    for (const spec of toolSpecs) {
      const toolName = spec.name;
      aiTools[toolName] = dynamicTool({
        description: spec.description,
        inputSchema: spec.inputSchema,
        execute: async (input) => {
          // Wrap with parallel dispatch for concurrency limiting
          return this.parallelDispatch.execute(async () => {
            const executeTool = async () => {
              const context = {
                containerId: sessionContext.containerId,
                sessionId: sessionContext.sessionId,
                containerManager: this.containerManager,
              };
              const result = await this.toolRegistry.execute(toolName, input, context);
              return result.output;
            };

            if (this.disableRetry) {
              return executeTool();
            }

            return withRetry(executeTool, {
              onRetry: (event) => {
                this.pendingRecoveryEvents.push({
                  type: 'tool_error',
                  data: {
                    error: event.error,
                    category: event.category,
                    level: event.level,
                    attempt: event.attempt,
                    maxAttempts: event.maxAttempts,
                    retrying: event.level === 'retry',
                    delayMs: event.delayMs,
                  },
                });
              },
              abortSignal: options?.abortSignal,
            });
          });
        },
      });
    }

    // streamText() returns synchronously — errors surface during stream consumption.
    // LLM-level retries are handled by catching stream errors and re-creating the stream.
    const result = streamText({
      model: this.model,
      system: effectiveSystemPrompt,
      messages: this.history.getMessages(),
      tools: aiTools,
      stopWhen: isStepCount(MAX_STEPS),
      abortSignal: options?.abortSignal,
    });

    let currentText = '';

    for await (const part of result.stream) {
      switch (part.type) {
        case 'text-delta': {
          currentText += part.text;
          yield {
            type: 'agent_message',
            data: { content: part.text, done: false },
          };
          break;
        }

        case 'tool-call': {
          yield {
            type: 'tool_start',
            data: {
              callId: part.toolCallId,
              toolName: part.toolName,
              inputSummary: JSON.stringify(part.input).slice(0, 200),
            },
          };
          break;
        }

        case 'tool-result': {
          // Flush any recovery events from retries during tool execution
          for (const evt of this.pendingRecoveryEvents) {
            yield evt;
          }
          this.pendingRecoveryEvents = [];

          yield {
            type: 'tool_complete',
            data: {
              callId: part.toolCallId,
              output: part.output,
              durationMs: 0,
              isError: false,
            },
          };

          // Emit todo state after each tool result so the UI stays current
          {
            const todos = this.todoTracker.list();
            if (todos.length > 0) {
              yield {
                type: 'todo_update' as AgentEventType,
                data: {
                  todos: todos.map((t) => ({ content: t.content, status: t.status })),
                },
              };
            }
          }
          break;
        }

        case 'error': {
          yield {
            type: 'tool_error',
            data: {
              error: String(part.error),
            },
          };
          break;
        }

        case 'finish': {
          yield {
            type: 'agent_message',
            data: { content: '', done: true },
          };
          break;
        }
      }
    }

    // Capture assistant response messages (text + tool calls/results)
    // and append to history for the next turn
    const responseMessages = await result.responseMessages;
    this.history.addResponseMessages(responseMessages);

    // Post-turn budget check — emit updated status
    if (this.tokenBudget) {
      this.updateBudget(systemPrompt, toolSpecs.length);
      const status = this.tokenBudget.getStatus();
      yield {
        type: 'token_budget',
        data: {
          level: status.level,
          usageRatio: Math.round(status.usageRatio * 100) / 100,
          used: status.used,
          remaining: status.remaining,
          usableBudget: status.usableBudget,
        },
      };
    }

    // Final todo update so the UI has the definitive state
    const finalTodos = this.todoTracker.list();
    if (finalTodos.length > 0) {
      yield {
        type: 'todo_update' as AgentEventType,
        data: {
          todos: finalTodos.map((t) => ({ content: t.content, status: t.status })),
        },
      };
    }

    yield { type: 'done', data: { totalText: currentText } };
  }
}
