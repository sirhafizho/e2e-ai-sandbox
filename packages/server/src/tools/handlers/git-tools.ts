import { z } from 'zod';
import type { ToolSpec } from '../types.js';

const MAX_DIFF_LINES = 500;
const MAX_LOG_ENTRIES = 50;

function trimLines(output: string, maxLines: number): string {
  const lines = output.split('\n');
  if (lines.length <= maxLines) return output;
  const keep = Math.floor(maxLines / 2);
  const head = lines.slice(0, keep);
  const tail = lines.slice(-keep);
  return [...head, `\n... (${lines.length - keep * 2} lines omitted) ...\n`, ...tail].join('\n');
}

// --- git_status ---

const GitStatusInput = z.object({
  path: z.string().optional().describe('Path within /workspace to check status (default: /workspace)'),
});
type GitStatusInput = z.infer<typeof GitStatusInput>;

interface GitStatusOutput {
  stdout: string;
  branch: string;
  clean: boolean;
}

export const gitStatusTool: ToolSpec<GitStatusInput, GitStatusOutput> = {
  name: 'git_status',
  description: 'Show the working tree status (branch, staged, unstaged, untracked files).',
  category: 'git',
  inputSchema: GitStatusInput,
  handler: async (input, context) => {
    const cwd = input.path ?? '/workspace';
    const result = await context.containerManager.exec(
      context.containerId,
      `cd '${cwd.replace(/'/g, "'\\''")}' && git status`,
    );

    // Extract branch name
    const branchMatch = result.stdout.match(/On branch (.+)/);
    const branch = branchMatch?.[1] ?? 'unknown';
    const clean = result.stdout.includes('nothing to commit');

    return { stdout: result.stdout, branch, clean };
  },
};

// --- git_diff ---

const GitDiffInput = z.object({
  staged: z.boolean().optional().describe('Show staged changes (--cached)'),
  path: z.string().optional().describe('Limit diff to specific file or directory'),
  commit: z.string().optional().describe('Compare against a specific commit'),
});
type GitDiffInput = z.infer<typeof GitDiffInput>;

interface GitDiffOutput {
  diff: string;
  files_changed: number;
}

export const gitDiffTool: ToolSpec<GitDiffInput, GitDiffOutput> = {
  name: 'git_diff',
  description: 'Show changes between working tree and index, or between commits.',
  category: 'git',
  inputSchema: GitDiffInput,
  handler: async (input, context) => {
    let cmd = 'cd /workspace && git diff';
    if (input.staged) cmd += ' --cached';
    if (input.commit) cmd += ` '${input.commit.replace(/'/g, "'\\''")}'`;
    if (input.path) cmd += ` -- '${input.path.replace(/'/g, "'\\''")}'`;

    const result = await context.containerManager.exec(context.containerId, cmd);

    // Count files changed from diff stat
    const statResult = await context.containerManager.exec(
      context.containerId,
      `cd /workspace && git diff --stat${input.staged ? ' --cached' : ''}${input.commit ? ` '${input.commit.replace(/'/g, "'\\''")}'` : ''}${input.path ? ` -- '${input.path.replace(/'/g, "'\\''")}'` : ''}`,
    );
    const filesMatch = statResult.stdout.match(/(\d+) files? changed/);
    const filesChanged = filesMatch ? parseInt(filesMatch[1]!, 10) : 0;

    return {
      diff: trimLines(result.stdout, MAX_DIFF_LINES),
      files_changed: filesChanged,
    };
  },
};

// --- git_log ---

const GitLogInput = z.object({
  max_count: z.number().int().min(1).max(100).optional().describe('Max entries to show (default: 20)'),
  oneline: z.boolean().optional().describe('Use one-line format (default: true)'),
  path: z.string().optional().describe('Limit log to specific file or directory'),
});
type GitLogInput = z.infer<typeof GitLogInput>;

interface GitLogOutput {
  log: string;
  entry_count: number;
}

export const gitLogTool: ToolSpec<GitLogInput, GitLogOutput> = {
  name: 'git_log',
  description: 'Show commit log history.',
  category: 'git',
  inputSchema: GitLogInput,
  handler: async (input, context) => {
    const max = Math.min(input.max_count ?? 20, MAX_LOG_ENTRIES);
    const format = (input.oneline ?? true) ? '--oneline' : '--format=medium';
    let cmd = `cd /workspace && git log ${format} -n ${max}`;
    if (input.path) cmd += ` -- '${input.path.replace(/'/g, "'\\''")}'`;

    const result = await context.containerManager.exec(context.containerId, cmd);
    const entries = result.stdout.trim().split('\n').filter(Boolean);

    return { log: result.stdout, entry_count: entries.length };
  },
};

// --- git_commit ---

const GitCommitInput = z.object({
  message: z.string().min(1).describe('Commit message'),
  all: z.boolean().optional().describe('Stage all modified/deleted files before commit (-a)'),
  files: z.array(z.string()).optional().describe('Specific files to stage before commit'),
});
type GitCommitInput = z.infer<typeof GitCommitInput>;

interface GitCommitOutput {
  stdout: string;
  commit_hash: string;
  files_changed: number;
}

export const gitCommitTool: ToolSpec<GitCommitInput, GitCommitOutput> = {
  name: 'git_commit',
  description: 'Stage and commit changes to the local repository.',
  category: 'git',
  inputSchema: GitCommitInput,
  handler: async (input, context) => {
    // Stage files if requested
    if (input.files && input.files.length > 0) {
      const fileList = input.files.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(' ');
      await context.containerManager.exec(
        context.containerId,
        `cd /workspace && git add ${fileList}`,
      );
    }

    // Build commit command
    const escapedMsg = input.message.replace(/'/g, "'\\''");
    let cmd = `cd /workspace && git commit`;
    if (input.all) cmd += ' -a';
    cmd += ` -m '${escapedMsg}'`;

    const result = await context.containerManager.exec(context.containerId, cmd);

    // Extract commit hash
    const hashMatch = result.stdout.match(/\[[\w/]+ ([a-f0-9]+)\]/);
    const commitHash = hashMatch?.[1] ?? '';

    // Count files changed
    const filesMatch = result.stdout.match(/(\d+) files? changed/);
    const filesChanged = filesMatch ? parseInt(filesMatch[1]!, 10) : 0;

    return {
      stdout: result.stdout,
      commit_hash: commitHash,
      files_changed: filesChanged,
    };
  },
};

// --- git_push ---

const GitPushInput = z.object({
  remote: z.string().optional().describe('Remote name (default: origin)'),
  branch: z.string().optional().describe('Branch name (default: current branch)'),
  force: z.boolean().optional().describe('Force push (--force-with-lease)'),
  set_upstream: z.boolean().optional().describe('Set upstream tracking (-u)'),
});
type GitPushInput = z.infer<typeof GitPushInput>;

interface GitPushOutput {
  stdout: string;
  stderr: string;
  success: boolean;
}

export const gitPushTool: ToolSpec<GitPushInput, GitPushOutput> = {
  name: 'git_push',
  description: 'Push commits to a remote repository.',
  category: 'git',
  inputSchema: GitPushInput,
  handler: async (input, context) => {
    const remote = input.remote ?? 'origin';
    let cmd = `cd /workspace && git push '${remote.replace(/'/g, "'\\''")}'`;
    if (input.branch) cmd += ` '${input.branch.replace(/'/g, "'\\''")}'`;
    if (input.force) cmd += ' --force-with-lease';
    if (input.set_upstream) cmd += ' -u';

    const result = await context.containerManager.exec(context.containerId, cmd);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.exitCode === 0,
    };
  },
};

// --- git_create_pr ---

const GitCreatePrInput = z.object({
  title: z.string().min(1).describe('Pull request title'),
  body: z.string().optional().describe('Pull request body/description'),
  base: z.string().optional().describe('Base branch (default: main)'),
  draft: z.boolean().optional().describe('Create as draft PR'),
});
type GitCreatePrInput = z.infer<typeof GitCreatePrInput>;

interface GitCreatePrOutput {
  stdout: string;
  url: string;
  number: number;
}

export const gitCreatePrTool: ToolSpec<GitCreatePrInput, GitCreatePrOutput> = {
  name: 'git_create_pr',
  description: 'Create a pull request on GitHub using the gh CLI.',
  category: 'git',
  inputSchema: GitCreatePrInput,
  handler: async (input, context) => {
    const escapedTitle = input.title.replace(/'/g, "'\\''");
    let cmd = `cd /workspace && gh pr create --title '${escapedTitle}'`;

    if (input.body) {
      const escapedBody = input.body.replace(/'/g, "'\\''");
      cmd += ` --body '${escapedBody}'`;
    }

    if (input.base) cmd += ` --base '${input.base.replace(/'/g, "'\\''")}'`;
    if (input.draft) cmd += ' --draft';

    const result = await context.containerManager.exec(context.containerId, cmd);

    if (result.exitCode !== 0) {
      throw new Error(`gh pr create failed: ${result.stderr || result.stdout}`);
    }

    // Extract PR URL and number from output
    const urlMatch = result.stdout.match(/(https:\/\/github\.com\/[^\s]+\/pull\/(\d+))/);
    const url = urlMatch?.[1] ?? result.stdout.trim();
    const number = urlMatch?.[2] ? parseInt(urlMatch[2], 10) : 0;

    return { stdout: result.stdout.trim(), url, number };
  },
};

// --- git_pr_status ---

const GitPrStatusInput = z.object({
  number: z.number().int().optional().describe('PR number to check (default: current branch PR)'),
});
type GitPrStatusInput = z.infer<typeof GitPrStatusInput>;

interface GitPrStatusOutput {
  stdout: string;
  state: string;
  checks_passing: boolean;
}

export const gitPrStatusTool: ToolSpec<GitPrStatusInput, GitPrStatusOutput> = {
  name: 'git_pr_status',
  description: 'Check the status of a pull request (state, CI checks) using the gh CLI.',
  category: 'git',
  inputSchema: GitPrStatusInput,
  handler: async (input, context) => {
    let cmd = 'cd /workspace && gh pr view';
    if (input.number) cmd += ` ${input.number}`;
    cmd += ' --json state,statusCheckRollup,title,url';

    const result = await context.containerManager.exec(context.containerId, cmd);

    if (result.exitCode !== 0) {
      throw new Error(`gh pr view failed: ${result.stderr || result.stdout}`);
    }

    let state = 'unknown';
    let checksPassing = false;

    try {
      const data = JSON.parse(result.stdout);
      state = data.state ?? 'unknown';
      const checks = data.statusCheckRollup ?? [];
      checksPassing = checks.length === 0 || checks.every(
        (c: { conclusion: string }) => c.conclusion === 'SUCCESS' || c.conclusion === 'NEUTRAL',
      );
    } catch {
      // If parsing fails, return raw output
    }

    return { stdout: result.stdout, state, checks_passing: checksPassing };
  },
};
