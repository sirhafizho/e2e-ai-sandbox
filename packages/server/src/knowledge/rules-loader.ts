import type { ContainerManager } from '../sandbox/container-manager.js';

/**
 * Rule files to auto-read from the workspace, in precedence order.
 * All existing files are loaded and merged (not overridden).
 */
const RULE_FILE_PATTERNS = [
  'AGENTS.md',
  '.devin/rules/',
  'CLAUDE.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];

export interface LoadedRule {
  source: string;
  content: string;
}

export interface RulesCache {
  rules: LoadedRule[];
  loadedAt: number;
}

/** Cache TTL — re-read rules after 5 minutes. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * RulesLoader — reads convention/rules files from the sandbox workspace.
 *
 * Auto-reads AGENTS.md, CLAUDE.md, .cursorrules, .devin/rules/, and
 * .github/copilot-instructions.md from the container's /workspace directory.
 * Results are cached with TTL-based invalidation.
 */
export class RulesLoader {
  private cache = new Map<string, RulesCache>();

  /**
   * Load all rules from the workspace.
   * Uses cached results if still fresh, otherwise re-reads from container.
   */
  async loadRules(
    containerId: string,
    containerManager: ContainerManager,
    workspacePath: string = '/workspace',
  ): Promise<LoadedRule[]> {
    const cacheKey = `${containerId}:${workspacePath}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.rules;
    }

    const rules: LoadedRule[] = [];

    for (const pattern of RULE_FILE_PATTERNS) {
      const fullPath = `${workspacePath}/${pattern}`;

      if (pattern.endsWith('/')) {
        // Directory pattern — read all .md files in it
        const dirRules = await this.loadRulesDir(containerId, containerManager, fullPath);
        rules.push(...dirRules);
      } else {
        // Single file pattern
        const content = await this.readFileIfExists(containerId, containerManager, fullPath);
        if (content) {
          rules.push({ source: pattern, content });
        }
      }
    }

    this.cache.set(cacheKey, { rules, loadedAt: Date.now() });
    return rules;
  }

  /**
   * Format loaded rules as a string for system prompt injection.
   */
  formatForPrompt(rules: LoadedRule[]): string {
    if (rules.length === 0) return '';

    const sections = rules.map(
      (r) => `### ${r.source}\n${r.content}`,
    );

    return `## Repository Rules\n\nThe following rules were loaded from the workspace:\n\n${sections.join('\n\n---\n\n')}`;
  }

  /**
   * Invalidate cache for a container/workspace.
   */
  invalidate(containerId: string, workspacePath: string = '/workspace'): void {
    this.cache.delete(`${containerId}:${workspacePath}`);
  }

  private async readFileIfExists(
    containerId: string,
    containerManager: ContainerManager,
    filePath: string,
  ): Promise<string | null> {
    try {
      const result = await containerManager.exec(containerId, `cat ${JSON.stringify(filePath)} 2>/dev/null`, {
        timeoutMs: 5000,
      });
      if (result.exitCode !== 0 || !result.stdout.trim()) return null;
      return result.stdout.trim();
    } catch {
      return null;
    }
  }

  private async loadRulesDir(
    containerId: string,
    containerManager: ContainerManager,
    dirPath: string,
  ): Promise<LoadedRule[]> {
    try {
      // List .md files in directory
      const listResult = await containerManager.exec(
        containerId,
        `find ${JSON.stringify(dirPath)} -maxdepth 1 -name '*.md' -type f 2>/dev/null | sort`,
        { timeoutMs: 5000 },
      );

      if (listResult.exitCode !== 0 || !listResult.stdout.trim()) return [];

      const files = listResult.stdout.trim().split('\n').filter(Boolean);
      const rules: LoadedRule[] = [];

      for (const file of files) {
        const content = await this.readFileIfExists(containerId, containerManager, file);
        if (content) {
          const relativePath = file.replace(/^\/workspace\//, '');
          rules.push({ source: relativePath, content });
        }
      }

      return rules;
    } catch {
      return [];
    }
  }
}
