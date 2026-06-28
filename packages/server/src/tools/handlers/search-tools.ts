import { z } from 'zod';
import type { ToolSpec } from '../types.js';

// --- grep ---

const GrepInput = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z.string().optional().describe('Directory or file to search in (default: /workspace)'),
  glob: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts")'),
  case_insensitive: z.boolean().optional().describe('Case-insensitive search'),
  max_results: z.number().int().min(1).max(1000).optional().describe('Max results (default: 100)'),
});
type GrepInput = z.infer<typeof GrepInput>;

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

interface GrepOutput {
  matches: GrepMatch[];
  total_matches: number;
}

export const grepTool: ToolSpec<GrepInput, GrepOutput> = {
  name: 'grep',
  description: 'Search for a regex pattern in files using ripgrep.',
  category: 'search',
  inputSchema: GrepInput,
  handler: async (input, context) => {
    const maxResults = input.max_results ?? 100;
    const searchPath = input.path ?? '/workspace';

    // Shell-escape by wrapping each arg in single quotes (escaping embedded single quotes)
    const esc = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const args = ['rg', '--json', '--max-count', String(maxResults)];
    if (input.case_insensitive) args.push('-i');
    if (input.glob) args.push('-g', esc(input.glob));
    args.push(esc(input.pattern), esc(searchPath));

    const cmd = args.join(' ');
    const result = await context.containerManager.exec(context.containerId, cmd, {
      timeoutMs: 30_000,
    });

    // ripgrep returns exit code 1 when no matches, 2 for errors
    if (result.exitCode === 2) {
      throw new Error(result.stderr.trim() || 'grep search failed');
    }

    const matches: GrepMatch[] = [];
    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as {
          type: string;
          data?: {
            path?: { text?: string };
            line_number?: number;
            lines?: { text?: string };
          };
        };
        if (
          parsed.type === 'match' &&
          parsed.data?.path?.text &&
          parsed.data.line_number &&
          parsed.data.lines?.text
        ) {
          matches.push({
            file: parsed.data.path.text,
            line: parsed.data.line_number,
            content: parsed.data.lines.text.trimEnd(),
          });
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return {
      matches: matches.slice(0, maxResults),
      total_matches: matches.length,
    };
  },
};

// --- find_files ---

const FindFilesInput = z.object({
  pattern: z.string().describe('Glob pattern to match files'),
  path: z.string().optional().describe('Directory to search in (default: /workspace)'),
});
type FindFilesInput = z.infer<typeof FindFilesInput>;

interface FindFilesOutput {
  files: string[];
  total: number;
}

export const findFilesTool: ToolSpec<FindFilesInput, FindFilesOutput> = {
  name: 'find_files',
  description: 'Find files matching a glob pattern using fd.',
  category: 'search',
  inputSchema: FindFilesInput,
  handler: async (input, context) => {
    const searchPath = input.path ?? '/workspace';
    const esc = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const cmd = `fd --glob ${esc(input.pattern)} ${esc(searchPath)} --max-results 100`;

    const result = await context.containerManager.exec(context.containerId, cmd, {
      timeoutMs: 30_000,
    });

    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(result.stderr.trim() || 'find_files search failed');
    }

    const files = result.stdout
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    return {
      files,
      total: files.length,
    };
  },
};
