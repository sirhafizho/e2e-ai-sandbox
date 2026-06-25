import type { BudgetLevel } from './token-budget.js';

export interface SessionContext {
  sessionId: string;
  containerId: string;
  model: string;
  systemPrompt?: string;
}

export type AgentEventType =
  | 'agent_message'
  | 'tool_start'
  | 'tool_output'
  | 'tool_complete'
  | 'tool_error'
  | 'token_budget'
  | 'context_windowed'
  | 'todo_update'
  | 'done';

export interface AgentEvent {
  type: AgentEventType;
  data: unknown;
}

export interface AgentMessageData {
  content: string;
  done: boolean;
}

export interface ToolStartData {
  callId: string;
  toolName: string;
  inputSummary: string;
}

export interface ToolCompleteData {
  callId: string;
  output: unknown;
  durationMs: number;
  isError: boolean;
}

export interface TokenBudgetData {
  level: BudgetLevel;
  usageRatio: number;
  used: number;
  remaining: number;
  usableBudget: number;
}

export interface ContextWindowedData {
  evictedMessages: number;
  tokensFreed: number;
  newLevel: BudgetLevel;
}

export interface TodoUpdateData {
  todos: Array<{ content: string; status: string }>;
}
