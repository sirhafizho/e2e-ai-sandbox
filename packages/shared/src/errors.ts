import { z } from 'zod';

export const ErrorCode = z.enum([
  'SESSION_NOT_FOUND',
  'SESSION_NOT_READY',
  'TOOL_NOT_FOUND',
  'TOOL_TIMEOUT',
  'TOOL_VALIDATION',
  'CONTAINER_ERROR',
  'LLM_ERROR',
  'LLM_RATE_LIMIT',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
