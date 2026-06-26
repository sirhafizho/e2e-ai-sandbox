import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RulesLoader } from '../rules-loader.js';

function createMockContainerManager(
  files: Record<string, string>,
) {
  return {
    exec: async (_containerId: string, command: string) => {
      // Handle cat commands
      const catMatch = command.match(/^cat\s+"([^"]+)"/);
      if (catMatch) {
        const path = catMatch[1]!;
        if (files[path]) {
          return { stdout: files[path], stderr: '', exitCode: 0, durationMs: 10 };
        }
        return { stdout: '', stderr: 'No such file', exitCode: 1, durationMs: 10 };
      }

      // Handle find commands (list directory)
      const findMatch = command.match(/^find\s+"([^"]+)"/);
      if (findMatch) {
        const dir = findMatch[1]!;
        const matching = Object.keys(files)
          .filter((f) => f.startsWith(dir) && f.endsWith('.md'))
          .sort()
          .join('\n');
        return { stdout: matching, stderr: '', exitCode: matching ? 0 : 1, durationMs: 10 };
      }

      return { stdout: '', stderr: '', exitCode: 1, durationMs: 10 };
    },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('RulesLoader', () => {
  let loader: RulesLoader;

  beforeEach(() => {
    loader = new RulesLoader();
  });

  describe('loadRules', () => {
    it('should load AGENTS.md from workspace', async () => {
      const cm = createMockContainerManager({
        '/workspace/AGENTS.md': '# Project Rules\n- Always test your code',
      });

      const rules = await loader.loadRules('test-container', cm);
      assert.equal(rules.length, 1);
      assert.equal(rules[0]!.source, 'AGENTS.md');
      assert.ok(rules[0]!.content.includes('Always test'));
    });

    it('should load multiple rule files', async () => {
      const cm = createMockContainerManager({
        '/workspace/AGENTS.md': '# Agents rules',
        '/workspace/CLAUDE.md': '# Claude rules',
        '/workspace/.cursorrules': 'cursorrules content',
      });

      const rules = await loader.loadRules('test-container', cm);
      assert.equal(rules.length, 3);
      const sources = rules.map((r) => r.source);
      assert.ok(sources.includes('AGENTS.md'));
      assert.ok(sources.includes('CLAUDE.md'));
      assert.ok(sources.includes('.cursorrules'));
    });

    it('should return empty array when no rule files exist', async () => {
      const cm = createMockContainerManager({});
      const rules = await loader.loadRules('test-container', cm);
      assert.equal(rules.length, 0);
    });

    it('should cache results within TTL', async () => {
      let callCount = 0;
      const cm = {
        exec: async () => {
          callCount++;
          return { stdout: 'cached content', stderr: '', exitCode: 0, durationMs: 10 };
        },
      } as any;

      await loader.loadRules('test-container', cm);
      const firstCount = callCount;

      await loader.loadRules('test-container', cm);
      // Should use cache — no additional exec calls
      assert.equal(callCount, firstCount);
    });

    it('should load rules from .devin/rules/ directory', async () => {
      const cm = createMockContainerManager({
        '/workspace/.devin/rules/coding.md': '# Coding rules',
        '/workspace/.devin/rules/testing.md': '# Testing rules',
      });

      const rules = await loader.loadRules('test-container', cm);
      assert.ok(rules.length >= 2);
      const sources = rules.map((r) => r.source);
      assert.ok(sources.some((s) => s.includes('coding.md')));
      assert.ok(sources.some((s) => s.includes('testing.md')));
    });
  });

  describe('formatForPrompt', () => {
    it('should format rules as markdown sections', () => {
      const formatted = loader.formatForPrompt([
        { source: 'AGENTS.md', content: 'Always test your code' },
        { source: 'CLAUDE.md', content: 'Use TypeScript' },
      ]);

      assert.ok(formatted.includes('## Repository Rules'));
      assert.ok(formatted.includes('### AGENTS.md'));
      assert.ok(formatted.includes('### CLAUDE.md'));
      assert.ok(formatted.includes('Always test'));
      assert.ok(formatted.includes('Use TypeScript'));
    });

    it('should return empty string when no rules', () => {
      assert.equal(loader.formatForPrompt([]), '');
    });
  });

  describe('invalidate', () => {
    it('should clear cache for container', async () => {
      let callCount = 0;
      const cm = {
        exec: async () => {
          callCount++;
          return { stdout: '', stderr: '', exitCode: 1, durationMs: 10 };
        },
      } as any;

      await loader.loadRules('test-container', cm);
      const firstCount = callCount;

      loader.invalidate('test-container');
      await loader.loadRules('test-container', cm);
      // Should have made new exec calls after invalidation
      assert.ok(callCount > firstCount);
    });
  });
});
