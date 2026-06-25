import type { z } from 'zod';
import type { ContainerManager } from '../sandbox/index.js';

export interface ToolSpec<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: 'shell' | 'file' | 'git' | 'browser' | 'search' | 'custom';
  inputSchema: z.ZodType<TInput>;
  timeoutMs?: number;
  handler: ToolHandler<TInput, TOutput>;
}

export type ToolHandler<TInput, TOutput> = (
  input: TInput,
  context: ToolContext,
) => Promise<TOutput>;

export interface ToolContext {
  containerId: string;
  sessionId: string;
  containerManager: ContainerManager;
}

export interface ToolExecResult {
  callId: string;
  toolName: string;
  output: unknown;
  isError: boolean;
  durationMs: number;
  errorCode?: string;
}
