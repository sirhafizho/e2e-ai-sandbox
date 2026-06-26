import type { ContainerManager } from '../sandbox/container-manager.js';

/**
 * CI run status from GitHub Actions.
 */
export interface CIRunStatus {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  html_url: string;
  created_at: string;
  head_branch: string;
}

/**
 * CI check result.
 */
export interface CICheckResult {
  repo: string;
  branch: string;
  runs: CIRunStatus[];
  has_failures: boolean;
  summary: string;
}

/**
 * CIMonitor — polls GitHub Actions for CI status.
 *
 * Uses the `gh` CLI (available in the sandbox container) to check
 * the status of GitHub Actions workflows for a given repository.
 */
export class CIMonitor {
  /**
   * Check CI status for the current repo in the container.
   */
  async checkStatus(
    containerId: string,
    containerManager: ContainerManager,
    branch?: string,
  ): Promise<CICheckResult> {
    // Get current branch if not specified
    const effectiveBranch = branch ?? await this.getCurrentBranch(containerId, containerManager);

    // Get repo name
    const repo = await this.getRepoName(containerId, containerManager);

    if (!repo) {
      return {
        repo: 'unknown',
        branch: effectiveBranch ?? 'unknown',
        runs: [],
        has_failures: false,
        summary: 'Not a git repository or gh CLI not available',
      };
    }

    // List recent workflow runs
    const runs = await this.listRuns(containerId, containerManager, effectiveBranch);

    const hasFailures = runs.some((r) => r.conclusion === 'failure');

    const summary = this.buildSummary(runs);

    return {
      repo,
      branch: effectiveBranch ?? 'unknown',
      runs,
      has_failures: hasFailures,
      summary,
    };
  }

  /**
   * Get failed check logs for debugging.
   */
  async getFailedLogs(
    containerId: string,
    containerManager: ContainerManager,
    runId: number,
  ): Promise<string> {
    try {
      const result = await containerManager.exec(
        containerId,
        `cd /workspace && gh run view ${runId} --log-failed 2>/dev/null | tail -100`,
        { timeoutMs: 15_000 },
      );
      return result.exitCode === 0 ? result.stdout : 'Failed to retrieve logs';
    } catch {
      return 'Failed to retrieve logs';
    }
  }

  private async getCurrentBranch(
    containerId: string,
    containerManager: ContainerManager,
  ): Promise<string | null> {
    try {
      const result = await containerManager.exec(
        containerId,
        'cd /workspace && git rev-parse --abbrev-ref HEAD 2>/dev/null',
        { timeoutMs: 5000 },
      );
      return result.exitCode === 0 ? result.stdout.trim() : null;
    } catch {
      return null;
    }
  }

  private async getRepoName(
    containerId: string,
    containerManager: ContainerManager,
  ): Promise<string | null> {
    try {
      const result = await containerManager.exec(
        containerId,
        'cd /workspace && gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null',
        { timeoutMs: 10_000 },
      );
      return result.exitCode === 0 ? result.stdout.trim() : null;
    } catch {
      return null;
    }
  }

  private async listRuns(
    containerId: string,
    containerManager: ContainerManager,
    branch: string | null,
  ): Promise<CIRunStatus[]> {
    try {
      const branchFlag = branch ? `--branch ${JSON.stringify(branch)}` : '';
      const result = await containerManager.exec(
        containerId,
        `cd /workspace && gh run list ${branchFlag} --limit 10 --json databaseId,name,status,conclusion,url,createdAt,headBranch 2>/dev/null`,
        { timeoutMs: 15_000 },
      );

      if (result.exitCode !== 0 || !result.stdout.trim()) return [];

      const runs = JSON.parse(result.stdout) as Array<{
        databaseId: number;
        name: string;
        status: string;
        conclusion: string | null;
        url: string;
        createdAt: string;
        headBranch: string;
      }>;

      return runs.map((r) => ({
        id: r.databaseId,
        name: r.name,
        status: r.status as CIRunStatus['status'],
        conclusion: r.conclusion as CIRunStatus['conclusion'],
        html_url: r.url,
        created_at: r.createdAt,
        head_branch: r.headBranch,
      }));
    } catch {
      return [];
    }
  }

  private buildSummary(runs: CIRunStatus[]): string {
    if (runs.length === 0) return 'No recent CI runs found';

    const failed = runs.filter((r) => r.conclusion === 'failure');
    const passing = runs.filter((r) => r.conclusion === 'success');
    const running = runs.filter((r) => r.status === 'in_progress');

    const parts: string[] = [];
    if (failed.length > 0) {
      parts.push(`${failed.length} failed: ${failed.map((r) => r.name).join(', ')}`);
    }
    if (running.length > 0) {
      parts.push(`${running.length} running: ${running.map((r) => r.name).join(', ')}`);
    }
    if (passing.length > 0) {
      parts.push(`${passing.length} passing`);
    }

    return parts.join(' | ') || 'No runs';
  }
}
