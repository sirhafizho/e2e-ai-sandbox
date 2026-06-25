import { z } from 'zod';

export const ToolCategory = z.enum(['shell', 'file', 'git', 'browser', 'search', 'custom']);
export type ToolCategory = z.infer<typeof ToolCategory>;

export const ToolCapability = z.enum(['streaming', 'background', 'interactive']);
export type ToolCapability = z.infer<typeof ToolCapability>;

export const ToolDefinition = z.object({
  name: z.string(),
  description: z.string(),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
  category: ToolCategory,
  capabilities: z.array(ToolCapability).default([]),
  timeout_default_ms: z.number().int().default(120_000),
  timeout_max_ms: z.number().int().default(300_000),
});
export type ToolDefinition = z.infer<typeof ToolDefinition>;

export const ToolResult = z.object({
  call_id: z.string(),
  tool_name: z.string(),
  output: z.unknown(),
  is_error: z.boolean(),
  duration_ms: z.number().int(),
});
export type ToolResult = z.infer<typeof ToolResult>;
