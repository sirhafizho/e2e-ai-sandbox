import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ContainerManager } from '../../sandbox/index.js';
import { ToolRegistry } from '../registry.js';
import { registerBuiltinTools } from '../register-builtins.js';
import type { ToolContext } from '../types.js';

describe('Git tools', () => {
  const manager = new ContainerManager();
  const registry = new ToolRegistry();
  let containerId: string;
  let context: ToolContext;

  before(async () => {
    registerBuiltinTools(registry);
    const info = await manager.create({ sessionId: 'test-git-tools' });
    containerId = info.containerId;
    context = { containerId, sessionId: 'test-git-tools', containerManager: manager };

    // Initialize a git repo in /workspace
    await manager.exec(containerId, 'cd /workspace && git init && git config user.name "Test" && git config user.email "test@test.com"');
    // Create an initial commit
    await manager.exec(containerId, 'cd /workspace && echo "# Test Repo" > README.md && git add . && git commit -m "Initial commit"');
  });

  after(async () => {
    await manager.destroy(containerId);
  });

  // --- Registration ---

  it('should register all git tools', () => {
    const tools = registry.list();
    const gitTools = tools.filter((t) => t.category === 'git');
    assert.ok(gitTools.length >= 7, `Expected at least 7 git tools, got ${gitTools.length}`);

    const names = gitTools.map((t) => t.name);
    assert.ok(names.includes('git_status'));
    assert.ok(names.includes('git_diff'));
    assert.ok(names.includes('git_log'));
    assert.ok(names.includes('git_commit'));
    assert.ok(names.includes('git_push'));
    assert.ok(names.includes('git_create_pr'));
    assert.ok(names.includes('git_pr_status'));
  });

  // --- git_status ---

  describe('git_status', () => {
    it('should show clean status', async () => {
      const result = await registry.execute('git_status', {}, context);
      assert.equal(result.isError, false);
      const output = result.output as { stdout: string; branch: string; clean: boolean };
      assert.ok(output.branch);
      assert.equal(output.clean, true);
    });

    it('should detect dirty working tree', async () => {
      // Create a new file
      await manager.exec(containerId, 'cd /workspace && echo "new file" > dirty.txt');

      const result = await registry.execute('git_status', {}, context);
      const output = result.output as { clean: boolean; stdout: string };
      assert.equal(output.clean, false);
      assert.ok(output.stdout.includes('dirty.txt'));

      // Cleanup
      await manager.exec(containerId, 'cd /workspace && rm dirty.txt');
    });
  });

  // --- git_log ---

  describe('git_log', () => {
    it('should show commit history', async () => {
      const result = await registry.execute('git_log', {}, context);
      assert.equal(result.isError, false);
      const output = result.output as { log: string; entry_count: number };
      assert.ok(output.entry_count >= 1);
      assert.ok(output.log.includes('Initial commit'));
    });

    it('should respect max_count', async () => {
      const result = await registry.execute('git_log', { max_count: 1 }, context);
      const output = result.output as { entry_count: number };
      assert.equal(output.entry_count, 1);
    });
  });

  // --- git_diff ---

  describe('git_diff', () => {
    it('should show empty diff on clean tree', async () => {
      const result = await registry.execute('git_diff', {}, context);
      assert.equal(result.isError, false);
      const output = result.output as { diff: string; files_changed: number };
      assert.equal(output.files_changed, 0);
    });

    it('should show changes in diff', async () => {
      await manager.exec(containerId, 'cd /workspace && echo "modified" >> README.md');

      const result = await registry.execute('git_diff', {}, context);
      const output = result.output as { diff: string; files_changed: number };
      assert.equal(output.files_changed, 1);
      assert.ok(output.diff.includes('modified'));

      // Revert
      await manager.exec(containerId, 'cd /workspace && git checkout README.md');
    });

    it('should show staged diff', async () => {
      await manager.exec(containerId, 'cd /workspace && echo "staged change" >> README.md && git add README.md');

      const result = await registry.execute('git_diff', { staged: true }, context);
      const output = result.output as { diff: string; files_changed: number };
      assert.equal(output.files_changed, 1);
      assert.ok(output.diff.includes('staged change'));

      // Revert
      await manager.exec(containerId, 'cd /workspace && git reset HEAD README.md && git checkout README.md');
    });
  });

  // --- git_commit ---

  describe('git_commit', () => {
    it('should commit staged files', async () => {
      await manager.exec(containerId, 'cd /workspace && echo "new content" > commit-test.txt && git add commit-test.txt');

      const result = await registry.execute('git_commit', { message: 'Add commit-test.txt' }, context);
      assert.equal(result.isError, false);
      const output = result.output as { commit_hash: string; files_changed: number; stdout: string };
      assert.ok(output.commit_hash.length > 0, 'Expected a commit hash');
      assert.equal(output.files_changed, 1);
    });

    it('should commit with -a flag', async () => {
      await manager.exec(containerId, 'cd /workspace && echo "modified again" >> commit-test.txt');

      const result = await registry.execute('git_commit', { message: 'Modify commit-test.txt', all: true }, context);
      assert.equal(result.isError, false);
      const output = result.output as { commit_hash: string };
      assert.ok(output.commit_hash.length > 0);
    });

    it('should commit specific files', async () => {
      await manager.exec(containerId, 'cd /workspace && echo "file a" > a.txt && echo "file b" > b.txt');

      const result = await registry.execute('git_commit', {
        message: 'Add a.txt and b.txt',
        files: ['a.txt', 'b.txt'],
      }, context);
      assert.equal(result.isError, false);
      const output = result.output as { files_changed: number };
      assert.equal(output.files_changed, 2);
    });
  });
});
