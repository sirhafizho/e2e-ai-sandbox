import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SelectiveRetention } from '../selective-retention.js';

describe('SelectiveRetention', () => {
  const retention = new SelectiveRetention();

  describe('truncateToolOutput', () => {
    it('should pass through short strings unchanged', () => {
      const result = retention.truncateToolOutput('short output');
      assert.equal(result, 'short output');
    });

    it('should truncate long file content keeping first and last lines', () => {
      const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
      const input = lines.join('\n');

      const result = retention.truncateToolOutput(input) as string;
      assert.ok(result.includes('line 1'));
      assert.ok(result.includes('line 200'));
      assert.ok(result.includes('lines omitted'));
      assert.ok(result.length < input.length);
    });

    it('should deduplicate stack traces', () => {
      const stackTrace = [
        'Error: Something went wrong',
        '    at function1 (/path/to/file.ts:10:5)',
        '    at function2 (/path/to/file.ts:20:5)',
        '    at function1 (/path/to/file.ts:10:5)',
        '    at function2 (/path/to/file.ts:20:5)',
        '    at function3 (/path/to/file.ts:30:5)',
      ].join('\n');

      const result = retention.truncateToolOutput(stackTrace) as string;
      // Should remove duplicate frames
      const occurrences = (result.match(/function1/g) || []).length;
      assert.equal(occurrences, 1);
      assert.ok(result.includes('duplicate stack frame'));
    });

    it('should truncate long shell output keeping last lines', () => {
      const lines = Array.from({ length: 200 }, (_, i) => `output line ${i + 1}`);
      // Make it long enough to trigger truncation
      const input = lines.join('\n').repeat(20);

      const result = retention.truncateToolOutput(input) as string;
      assert.ok(result.length < input.length);
    });

    it('should handle object output with stdout field', () => {
      const longStdout = 'x'.repeat(5000);
      const result = retention.truncateToolOutput({ stdout: longStdout, stderr: '', exitCode: 0 });

      assert.ok(typeof result === 'object');
      const obj = result as Record<string, unknown>;
      assert.ok(obj['_truncated']);
    });

    it('should pass through null and undefined', () => {
      assert.equal(retention.truncateToolOutput(null), null);
      assert.equal(retention.truncateToolOutput(undefined), undefined);
    });

    it('should pass through numbers', () => {
      assert.equal(retention.truncateToolOutput(42), 42);
    });
  });

  describe('classifyMessage', () => {
    it('should classify system messages as always retained', () => {
      const priority = retention.classifyMessage(
        { role: 'system', content: 'You are a helpful assistant' },
        0,
        10,
      );
      assert.equal(priority, 'always');
    });

    it('should classify tool messages as low priority', () => {
      const priority = retention.classifyMessage(
        { role: 'tool' as any, content: 'tool result output' },
        5,
        10,
      );
      assert.equal(priority, 'low');
    });

    it('should classify user/assistant messages as medium', () => {
      const userPriority = retention.classifyMessage(
        { role: 'user', content: 'Hello' },
        0,
        10,
      );
      assert.equal(userPriority, 'medium');

      const assistantPriority = retention.classifyMessage(
        { role: 'assistant', content: 'Hi there' },
        1,
        10,
      );
      assert.equal(assistantPriority, 'medium');
    });
  });
});
