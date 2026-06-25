import { z } from 'zod';
import type { ToolSpec } from '../types.js';

const MAX_OUTPUT_LINES = 200;
const KEEP_LINES = 100;

export const ShellExecInput = z.object({
  command: z.string().describe('The shell command to execute'),
  timeout_ms: z.number().int().min(1000).max(300_000).optional().describe('Timeout in ms'),
  shell_id: z.string().optional().describe('Shell session ID (default: "default")'),
});
type ShellExecInput = z.infer<typeof ShellExecInput>;

interface ShellExecOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}

function trimOutput(output: string, maxLines: number): string {
  const lines = output.split('\n');
  if (lines.length <= maxLines) return output;

  const head = lines.slice(0, KEEP_LINES);
  const tail = lines.slice(-KEEP_LINES);
  const omitted = lines.length - KEEP_LINES * 2;

  return [...head, `\n... (${omitted} lines omitted) ...\n`, ...tail].join('\n');
}

export const shellExecTool: ToolSpec<ShellExecInput, ShellExecOutput> = {
  name: 'shell_exec',
  description:
    'Execute a shell command in the sandbox container. Returns stdout, stderr, and exit code.',
  category: 'shell',
  inputSchema: ShellExecInput,
  handler: async (input, context) => {
    const result = await context.containerManager.exec(context.containerId, input.command, {
      timeoutMs: input.timeout_ms,
    });

    return {
      stdout: trimOutput(result.stdout, MAX_OUTPUT_LINES),
      stderr: trimOutput(result.stderr, MAX_OUTPUT_LINES),
      exit_code: result.exitCode,
    };
  },
};
