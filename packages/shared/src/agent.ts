import { z } from 'zod';

export const MessageRole = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRole>;

export const AgentMessage = z.object({
  id: z.string(),
  role: MessageRole,
  content: z.string(),
  timestamp: z.string().datetime(),
});
export type AgentMessage = z.infer<typeof AgentMessage>;

export const LLMProviderType = z.enum(['ollama', 'openai', 'anthropic', 'openai-compatible']);
export type LLMProviderType = z.infer<typeof LLMProviderType>;

export const LLMProviderConfig = z.object({
  type: LLMProviderType,
  base_url: z.string().url().optional(),
  api_key: z.string().optional(),
  model: z.string(),
});
export type LLMProviderConfig = z.infer<typeof LLMProviderConfig>;
