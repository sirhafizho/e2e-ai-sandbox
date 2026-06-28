import { z } from 'zod';
import { posix } from 'node:path';
import type { ToolSpec } from '../types.js';

const MAX_READ_LINES = 500;
const KEEP_LINES = 100;

function enforcePath(inputPath: string): string {
  // Normalize and ensure path is under /workspace
  const prefixed = inputPath.startsWith('/workspace') ? inputPath : `/workspace/${inputPath}`;
  const resolved = posix.resolve(prefixed);
  if (!resolved.startsWith('/workspace/') && resolved !== '/workspace') {
    throw new Error(`Path traversal not allowed: ${resolved} is outside /workspace`);
  }
  return resolved;
}

// --- file_read ---

const FileReadInput = z.object({
  path: z.string().describe('File path (relative to /workspace or absolute)'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Line offset to start reading from (0-based)'),
  limit: z.number().int().min(1).optional().describe('Number of lines to read'),
});
type FileReadInput = z.infer<typeof FileReadInput>;

interface FileReadOutput {
  content: string;
  total_lines: number;
}

export const fileReadTool: ToolSpec<FileReadInput, FileReadOutput> = {
  name: 'file_read',
  description: 'Read the contents of a file from the workspace.',
  category: 'file',
  inputSchema: FileReadInput,
  handler: async (input, context) => {
    const path = enforcePath(input.path);
    const cmd = `cat -n "${path}"`;

    const result = await context.containerManager.exec(context.containerId, cmd);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Failed to read file: ${path}`);
    }

    const allLines = result.stdout.split('\n');
    const totalLines = allLines.length;

    let lines = allLines;
    if (input.offset !== undefined || input.limit !== undefined) {
      const start = input.offset ?? 0;
      const end = input.limit ? start + input.limit : undefined;
      lines = allLines.slice(start, end);
    } else if (totalLines > MAX_READ_LINES) {
      const head = allLines.slice(0, KEEP_LINES);
      const tail = allLines.slice(-KEEP_LINES);
      const omitted = totalLines - KEEP_LINES * 2;
      lines = [...head, `\n... (${omitted} lines omitted) ...\n`, ...tail];
    }

    return {
      content: lines.join('\n'),
      total_lines: totalLines,
    };
  },
};

// --- file_write ---

const FileWriteInput = z.object({
  path: z.string().describe('File path (relative to /workspace or absolute)'),
  content: z.string().describe('Content to write to the file'),
});
type FileWriteInput = z.infer<typeof FileWriteInput>;

interface FileWriteOutput {
  path: string;
  bytes_written: number;
}

export const fileWriteTool: ToolSpec<FileWriteInput, FileWriteOutput> = {
  name: 'file_write',
  description: 'Write content to a file in the workspace. Creates parent directories if needed.',
  category: 'file',
  inputSchema: FileWriteInput,
  handler: async (input, context) => {
    const path = enforcePath(input.path);

    // Create parent directory
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      await context.containerManager.exec(context.containerId, `mkdir -p "${dir}"`);
    }

    // Use base64 encoding for robust content transfer — avoids all shell escaping issues
    const base64Content = Buffer.from(input.content, 'utf-8').toString('base64');
    const cmd = `echo '${base64Content}' | base64 -d > "${path}" && wc -c < "${path}"`;
    const result = await context.containerManager.exec(context.containerId, cmd);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Failed to write file: ${path}`);
    }

    return {
      path,
      bytes_written: parseInt(result.stdout.trim(), 10) || input.content.length,
    };
  },
};

// --- file_edit ---

const FileEditInput = z.object({
  path: z.string().describe('File path (relative to /workspace or absolute)'),
  old_string: z.string().describe('The exact string to find and replace'),
  new_string: z.string().describe('The replacement string'),
  replace_all: z.boolean().optional().describe('Replace all occurrences (default: false)'),
});
type FileEditInput = z.infer<typeof FileEditInput>;

interface FileEditOutput {
  path: string;
  replacements: number;
}

export const fileEditTool: ToolSpec<FileEditInput, FileEditOutput> = {
  name: 'file_edit',
  description:
    'Edit a file by replacing an exact string match. Fails if old_string is not found or not unique (unless replace_all is true).',
  category: 'file',
  inputSchema: FileEditInput,
  handler: async (input, context) => {
    const path = enforcePath(input.path);

    // Read current content
    const readResult = await context.containerManager.exec(context.containerId, `cat "${path}"`);
    if (readResult.exitCode !== 0) {
      throw new Error(readResult.stderr.trim() || `File not found: ${path}`);
    }

    const content = readResult.stdout;
    const occurrences = content.split(input.old_string).length - 1;

    if (occurrences === 0) {
      throw new Error(`String not found in ${path}: "${input.old_string.slice(0, 100)}"`);
    }

    if (!input.replace_all && occurrences > 1) {
      throw new Error(
        `String found ${occurrences} times in ${path}. Use replace_all: true or provide a more specific string.`,
      );
    }

    const newContent = input.replace_all
      ? content.replaceAll(input.old_string, input.new_string)
      : content.replace(input.old_string, input.new_string);

    const replacements = input.replace_all ? occurrences : 1;

    // Write back using base64 to avoid shell escaping issues
    const base64Content = Buffer.from(newContent, 'utf-8').toString('base64');
    const writeCmd = `echo '${base64Content}' | base64 -d > "${path}"`;
    const writeResult = await context.containerManager.exec(context.containerId, writeCmd);

    if (writeResult.exitCode !== 0) {
      throw new Error(writeResult.stderr.trim() || `Failed to write file: ${path}`);
    }

    return {
      path,
      replacements,
    };
  },
};
