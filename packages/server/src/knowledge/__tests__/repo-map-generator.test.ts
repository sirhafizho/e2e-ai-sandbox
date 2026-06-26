import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RepoMapGenerator } from '../repo-map-generator.js';

function createMockContainerManager(responses: Record<string, { stdout: string; exitCode: number }>) {
  const calls: string[] = [];

  return {
    exec: async (_containerId: string, command: string) => {
      calls.push(command);

      // Match find command for file listing
      if (command.startsWith('find ')) {
        const resp = responses['find'] ?? { stdout: '', exitCode: 0 };
        return { stdout: resp.stdout, stderr: '', exitCode: resp.exitCode, durationMs: 10 };
      }

      // Match grep command for exports
      if (command.startsWith('grep ')) {
        const resp = responses['grep'] ?? { stdout: '', exitCode: 0 };
        return { stdout: resp.stdout, stderr: '', exitCode: resp.exitCode, durationMs: 10 };
      }

      // Match sha256sum command for hashes
      if (command.startsWith('sha256sum ')) {
        const resp = responses['sha256sum'] ?? { stdout: '', exitCode: 0 };
        return { stdout: resp.stdout, stderr: '', exitCode: resp.exitCode, durationMs: 10 };
      }

      return { stdout: '', stderr: '', exitCode: 1, durationMs: 10 };
    },
    calls,
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('RepoMapGenerator', () => {
  describe('generate', () => {
    it('should generate a repo map from file listing', async () => {
      const cm = createMockContainerManager({
        find: {
          stdout: [
            '/workspace/src/index.ts',
            '/workspace/src/utils/helpers.ts',
            '/workspace/package.json',
            '/workspace/README.md',
          ].join('\n'),
          exitCode: 0,
        },
        grep: {
          stdout: [
            'export function createApp()',
            'export class UserService',
            'export const DEFAULT_CONFIG',
          ].join('\n'),
          exitCode: 0,
        },
      });

      const generator = new RepoMapGenerator();
      const result = await generator.generate('test-container', cm);

      assert.equal(result.files_count, 4);
      assert.ok(result.tree.includes('src/'));
      assert.ok(result.tree.includes('index.ts'));
      assert.ok(result.tree.includes('package.json'));
      assert.ok(result.key_exports.includes('createApp'));
      assert.ok(result.key_exports.includes('UserService'));
      assert.ok(result.languages['typescript']! >= 2);
    });

    it('should handle empty workspace', async () => {
      const cm = createMockContainerManager({
        find: { stdout: '', exitCode: 0 },
      });

      const generator = new RepoMapGenerator();
      const result = await generator.generate('test-container', cm);

      assert.equal(result.files_count, 0);
      assert.equal(result.tree, '');
      assert.equal(result.key_exports.length, 0);
    });

    it('should count language distribution', async () => {
      const cm = createMockContainerManager({
        find: {
          stdout: [
            '/workspace/app.ts',
            '/workspace/utils.ts',
            '/workspace/test.py',
            '/workspace/styles.css',
            '/workspace/config.json',
          ].join('\n'),
          exitCode: 0,
        },
        grep: { stdout: '', exitCode: 1 },
      });

      const generator = new RepoMapGenerator();
      const result = await generator.generate('test-container', cm);

      assert.equal(result.languages['typescript'], 2);
      assert.equal(result.languages['python'], 1);
      assert.equal(result.languages['css'], 1);
      assert.equal(result.languages['json'], 1);
    });
  });
});
