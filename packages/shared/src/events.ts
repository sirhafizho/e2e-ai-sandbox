import { z } from 'zod';
import { SessionStatus } from './session.js';

// Server -> Client events

export const GreetingEvent = z.object({
  type: z.literal('greeting'),
  message: z.string(),
});
export type GreetingEvent = z.infer<typeof GreetingEvent>;

export const AgentMessageEvent = z.object({
  type: z.literal('agent_message'),
  content: z.string(),
  role: z.literal('assistant'),
  message_id: z.string(),
  done: z.boolean(),
});
export type AgentMessageEvent = z.infer<typeof AgentMessageEvent>;

export const ToolStartEvent = z.object({
  type: z.literal('tool_start'),
  tool_name: z.string(),
  input_summary: z.string(),
  call_id: z.string(),
});
export type ToolStartEvent = z.infer<typeof ToolStartEvent>;

export const ToolOutputEvent = z.object({
  type: z.literal('tool_output'),
  call_id: z.string(),
  chunk: z.string(),
  stream: z.enum(['stdout', 'stderr']),
});
export type ToolOutputEvent = z.infer<typeof ToolOutputEvent>;

export const ToolCompleteEvent = z.object({
  type: z.literal('tool_complete'),
  call_id: z.string(),
  result: z.record(z.string(), z.unknown()),
  duration_ms: z.number().int(),
});
export type ToolCompleteEvent = z.infer<typeof ToolCompleteEvent>;

export const ToolErrorEvent = z.object({
  type: z.literal('tool_error'),
  call_id: z.string(),
  error: z.string(),
  code: z.string(),
  retrying: z.boolean(),
});
export type ToolErrorEvent = z.infer<typeof ToolErrorEvent>;

export const TodoUpdateEvent = z.object({
  type: z.literal('todo_update'),
  todos: z.array(z.object({ content: z.string(), status: z.string() })),
});
export type TodoUpdateEvent = z.infer<typeof TodoUpdateEvent>;

export const SessionStatusEvent = z.object({
  type: z.literal('session_status'),
  status: SessionStatus,
  info: z.string(),
});
export type SessionStatusEvent = z.infer<typeof SessionStatusEvent>;

export const IdleWarningEvent = z.object({
  type: z.literal('idle_warning'),
  minutes_remaining: z.number(),
});
export type IdleWarningEvent = z.infer<typeof IdleWarningEvent>;

export const ErrorEvent = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});
export type ErrorEvent = z.infer<typeof ErrorEvent>;

export const ServerWebSocketEvent = z.discriminatedUnion('type', [
  GreetingEvent,
  AgentMessageEvent,
  ToolStartEvent,
  ToolOutputEvent,
  ToolCompleteEvent,
  ToolErrorEvent,
  TodoUpdateEvent,
  SessionStatusEvent,
  IdleWarningEvent,
  ErrorEvent,
]);
export type ServerWebSocketEvent = z.infer<typeof ServerWebSocketEvent>;

// Client -> Server events

export const UserMessageEvent = z.object({
  type: z.literal('user_message'),
  content: z.string(),
});
export type UserMessageEvent = z.infer<typeof UserMessageEvent>;

export const CancelEvent = z.object({
  type: z.literal('cancel'),
});
export type CancelEvent = z.infer<typeof CancelEvent>;

export const ClientWebSocketEvent = z.discriminatedUnion('type', [UserMessageEvent, CancelEvent]);
export type ClientWebSocketEvent = z.infer<typeof ClientWebSocketEvent>;
