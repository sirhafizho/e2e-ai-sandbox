import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CIMonitor } from '../ci-monitor.js';

function createMockContainerManager(responses: Record<string, { stdout: string; exitCode: number }>) {
  return {
    exec: async (_containerId: string, command: string) => {
      // Match git branch
      if (command.includes('git rev-parse')) {
        const resp = responses['branch'] ?? { stdout: 'main', exitCode: 0 };
        return { ...resp, stderr: '', durationMs: 10 };
      }

      // Match gh repo view
      if (command.includes('gh repo view')) {
        const resp = responses['repo'] ?? { stdout: 'user/repo', exitCode: 0 };
        return { ...resp, stderr: '', durationMs: 10 };
      }

      // Match gh run list
      if (command.includes('gh run list')) {
        const resp = responses['runs'] ?? { stdout: '[]', exitCode: 0 };
        return { ...resp, stderr: '', durationMs: 10 };
      }

      // Match gh run view
      if (command.includes('gh run view')) {
        const resp = responses['logs'] ?? { stdout: 'No logs', exitCode: 0 };
        return { ...resp, stderr: '', durationMs: 10 };
      }

      return { stdout: '', stderr: '', exitCode: 1, durationMs: 10 };
    },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('CIMonitor', () => {
  describe('checkStatus', () => {
    it('should report CI status for a repo', async () => {
      const cm = createMockContainerManager({
        branch: { stdout: 'main\n', exitCode: 0 },
        repo: { stdout: 'user/my-app\n', exitCode: 0 },
        runs: {
          stdout: JSON.stringify([
            {
              databaseId: 123,
              name: 'CI',
              status: 'completed',
              conclusion: 'success',
              url: 'https://github.com/user/my-app/actions/runs/123',
              createdAt: '2026-06-26T10:00:00Z',
              headBranch: 'main',
            },
            {
              databaseId: 124,
              name: 'Deploy',
              status: 'completed',
              conclusion: 'failure',
              url: 'https://github.com/user/my-app/actions/runs/124',
              createdAt: '2026-06-26T10:01:00Z',
              headBranch: 'main',
            },
          ]),
          exitCode: 0,
        },
      });

      const monitor = new CIMonitor();
      const result = await monitor.checkStatus('test-container', cm);

      assert.equal(result.repo, 'user/my-app');
      assert.equal(result.branch, 'main');
      assert.equal(result.runs.length, 2);
      assert.equal(result.has_failures, true);
      assert.ok(result.summary.includes('failed'));
      assert.ok(result.summary.includes('Deploy'));
    });

    it('should handle non-git repo gracefully', async () => {
      const cm = createMockContainerManager({
        branch: { stdout: '', exitCode: 128 },
        repo: { stdout: '', exitCode: 1 },
      });

      const monitor = new CIMonitor();
      const result = await monitor.checkStatus('test-container', cm);

      assert.equal(result.runs.length, 0);
      assert.equal(result.has_failures, false);
      assert.ok(result.summary.includes('Not a git'));
    });

    it('should report all passing runs', async () => {
      const cm = createMockContainerManager({
        branch: { stdout: 'main\n', exitCode: 0 },
        repo: { stdout: 'user/my-app\n', exitCode: 0 },
        runs: {
          stdout: JSON.stringify([
            { databaseId: 1, name: 'CI', status: 'completed', conclusion: 'success', url: '', createdAt: '', headBranch: 'main' },
            { databaseId: 2, name: 'Lint', status: 'completed', conclusion: 'success', url: '', createdAt: '', headBranch: 'main' },
          ]),
          exitCode: 0,
        },
      });

      const monitor = new CIMonitor();
      const result = await monitor.checkStatus('test-container', cm);

      assert.equal(result.has_failures, false);
      assert.ok(result.summary.includes('passing'));
    });
  });

  describe('getFailedLogs', () => {
    it('should retrieve failed run logs', async () => {
      const cm = createMockContainerManager({
        logs: { stdout: 'Error: Test failed\n  at test.js:42', exitCode: 0 },
      });

      const monitor = new CIMonitor();
      const logs = await monitor.getFailedLogs('test-container', cm, 123);

      assert.ok(logs.includes('Error: Test failed'));
    });
  });
});
