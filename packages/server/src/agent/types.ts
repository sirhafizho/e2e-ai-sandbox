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
