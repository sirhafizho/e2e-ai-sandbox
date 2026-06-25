import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ContainerManager } from '../../sandbox/index.js';
import { ToolRegistry } from '../registry.js';
import { registerBuiltinTools } from '../register-builtins.js';
import type { ToolContext } from '../types.js';

describe('Built-in tool handlers', () => {
  const manager = new ContainerManager();
  const registry = new ToolRegistry();
  let containerId: string;
  let context: ToolContext;

  before(async () => {
    registerBuiltinTools(registry);
    const info = await manager.create({ sessionId: 'test-tools' });
    containerId = info.containerId;
    context = { containerId, sessionId: 'test-tools', containerManager: manager };
  });

  after(async () => {
    await manager.destroy(containerId);
  });

  // --- shell_exec ---

  describe('shell_exec', () => {
    it('should execute a command and return output', async () => {
      const result = await registry.execute('shell_exec', { command: 'echo hello' }, context);
      assert.equal(result.isError, false);
      const output = result.output as { stdout: string; exit_code: number };
      assert.equal(output.stdout.trim(), 'hello');
      assert.equal(output.exit_code, 0);
    });

    it('should return non-zero exit code', async () => {
      const result = await registry.execute('shell_exec', { command: 'exit 42' }, context);
      assert.equal(result.isError, false);
      const output = result.output as { exit_code: number };
      assert.equal(output.exit_code, 42);
    });

    it('should list workspace contents', async () => {
      const result = await registry.execute('shell_exec', { command: 'ls /workspace' }, context);
      assert.equal(result.isError, false);
    });
  });

  // --- file_write, file_read, file_edit ---

  describe('file tools', () => {
    it('should write a file', async () => {
      const result = await registry.execute(
        'file_write',
        { path: 'test.txt', content: 'hello world' },
        context,
      );
      assert.equal(result.isError, false);
      const output = result.output as { path: string; bytes_written: number };
      assert.equal(output.path, '/workspace/test.txt');
      assert.ok(output.bytes_written > 0);
    });

    it('should read a file', async () => {
      const result = await registry.execute('file_read', { path: 'test.txt' }, context);
      assert.equal(result.isError, false);
      const output = result.output as { content: string; total_lines: number };
      assert.ok(output.content.includes('hello world'));
    });

    it('should create parent directories', async () => {
      const result = await registry.execute(
        'file_write',
        { path: 'deep/nested/dir/file.txt', content: 'nested content' },
        context,
      );
      assert.equal(result.isError, false);

      const readResult = await registry.execute(
        'file_read',
        { path: 'deep/nested/dir/file.txt' },
        context,
      );
      assert.equal(readResult.isError, false);
      const output = readResult.output as { content: string };
      assert.ok(output.content.includes('nested content'));
    });

    it('should edit a file with string replacement', async () => {
      await registry.execute(
        'file_write',
        { path: 'edit-test.txt', content: 'foo bar baz' },
        context,
      );

      const result = await registry.execute(
        'file_edit',
        { path: 'edit-test.txt', old_string: 'bar', new_string: 'qux' },
        context,
      );
      assert.equal(result.isError, false);
      const output = result.output as { replacements: number };
      assert.equal(output.replacements, 1);

      const readResult = await registry.execute('file_read', { path: 'edit-test.txt' }, context);
      const content = (readResult.output as { content: string }).content;
      assert.ok(content.includes('qux'));
      assert.ok(!content.includes('bar'));
    });

    it('should fail editing when string not found', async () => {
      const result = await registry.execute(
        'file_edit',
        { path: 'edit-test.txt', old_string: 'nonexistent', new_string: 'replacement' },
        context,
      );
      assert.equal(result.isError, true);
    });

    it('should reject path traversal', async () => {
      const result = await registry.execute('file_read', { path: '../../etc/passwd' }, context);
      assert.equal(result.isError, true);
    });
  });

  // --- grep, find_files ---

  describe('search tools', () => {
    before(async () => {
      // Create some files to search
      await registry.execute(
        'file_write',
        { path: 'src/main.ts', content: 'export function main() {\n  console.log("hello");\n}\n' },
        context,
      );
      await registry.execute(
        'file_write',
        { path: 'src/utils.ts', content: 'export function helper() {\n  return 42;\n}\n' },
        context,
      );
    });

    it('should grep for a pattern', async () => {
      const result = await registry.execute(
        'grep',
        { pattern: 'function', path: '/workspace/src' },
        context,
      );
      assert.equal(result.isError, false);
      const output = result.output as { matches: Array<{ file: string }>; total_matches: number };
      assert.ok(output.total_matches >= 2);
    });

    it('should grep with glob filter', async () => {
      const result = await registry.execute('grep', { pattern: 'helper', glob: '*.ts' }, context);
      assert.equal(result.isError, false);
      const output = result.output as { matches: Array<{ file: string }>; total_matches: number };
      assert.ok(output.total_matches >= 1);
    });

    it('should find files by pattern', async () => {
      const result = await registry.execute('find_files', { pattern: '*.ts' }, context);
      assert.equal(result.isError, false);
      const output = result.output as { files: string[]; total: number };
      assert.ok(output.total >= 2);
      assert.ok(output.files.some((f) => f.includes('main.ts')));
    });
  });
});
