import type { ContainerManager } from '../sandbox/container-manager.js';
import type { RepoMapStore } from '../db/repo-map-store.js';

/**
 * File entry in the repo map.
 */
export interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  language?: string;
  exports?: string[];
  classes?: string[];
  functions?: string[];
}

/**
 * Structured repo map data.
 */
export interface RepoMapData {
  files_count: number;
  tree: string;
  key_exports: string[];
  languages: Record<string, number>;
}

/** File extensions to language mapping. */
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.css': 'css',
  '.html': 'html',
  '.sql': 'sql',
};

/** Directories to ignore during scanning. */
const IGNORE_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.venv', 'venv', 'target', '.cargo', 'vendor',
];

/** Max files to include in map. */
const MAX_FILES = 500;

/** Max depth for tree display. */
const MAX_TREE_DEPTH = 4;

/**
 * RepoMapGenerator — creates lightweight structural overviews of codebases.
 *
 * Uses simple file listing and regex-based export extraction instead of
 * tree-sitter to avoid native dependencies. Generates a tree representation
 * and extracts key exports from common file formats (TS/JS, Python).
 */
export class RepoMapGenerator {
  /**
   * Generate or refresh a repo map from the sandbox container.
   */
  async generate(
    containerId: string,
    containerManager: ContainerManager,
    workspacePath: string = '/workspace',
    repoMapStore?: RepoMapStore,
    repoId?: string,
  ): Promise<RepoMapData> {
    // List all files (excluding ignored dirs)
    const excludeArgs = IGNORE_DIRS.map((d) => `-not -path '*/${d}/*'`).join(' ');
    const findCmd = `find ${JSON.stringify(workspacePath)} -type f ${excludeArgs} 2>/dev/null | head -${MAX_FILES} | sort`;

    const listResult = await containerManager.exec(containerId, findCmd, {
      timeoutMs: 15_000,
    });

    const files = listResult.stdout.trim().split('\n').filter(Boolean);

    // Build tree structure
    const tree = this.buildTree(files, workspacePath);

    // Count languages
    const languages: Record<string, number> = {};
    for (const file of files) {
      const ext = this.getExtension(file);
      const lang = ext ? LANGUAGE_MAP[ext] : undefined;
      if (lang) {
        languages[lang] = (languages[lang] ?? 0) + 1;
      }
    }

    // Extract key exports from a subset of files (first 50 source files)
    const sourceFiles = files
      .filter((f) => {
        const ext = this.getExtension(f);
        return ext && ['.ts', '.tsx', '.js', '.jsx', '.py'].includes(ext);
      })
      .slice(0, 50);

    const keyExports = await this.extractExports(
      containerId,
      containerManager,
      sourceFiles,
    );

    const mapData: RepoMapData = {
      files_count: files.length,
      tree,
      key_exports: keyExports,
      languages,
    };

    // Cache to store if available
    if (repoMapStore && repoId) {
      const fileHashes = await this.computeFileHashes(containerId, containerManager, files.slice(0, 100));
      repoMapStore.save(repoId, JSON.stringify(mapData), JSON.stringify(fileHashes));
    }

    return mapData;
  }

  /**
   * Build an ASCII directory tree from file paths.
   */
  private buildTree(files: string[], basePath: string): string {
    // Build nested structure
    const tree: Record<string, unknown> = {};

    for (const file of files) {
      const relative = file.replace(basePath + '/', '');
      const parts = relative.split('/');

      // Only include up to MAX_TREE_DEPTH
      if (parts.length > MAX_TREE_DEPTH) continue;

      let current = tree;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (i === parts.length - 1) {
          // Leaf file
          current[part] = null;
        } else {
          // Directory
          if (!current[part] || typeof current[part] !== 'object') {
            current[part] = {};
          }
          current = current[part] as Record<string, unknown>;
        }
      }
    }

    return this.renderTree(tree, '');
  }

  private renderTree(node: Record<string, unknown>, prefix: string): string {
    const entries = Object.keys(node).sort((a, b) => {
      // Directories first
      const aIsDir = node[a] !== null;
      const bIsDir = node[b] !== null;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.localeCompare(b);
    });

    const lines: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const name = entries[i]!;
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      if (node[name] !== null && typeof node[name] === 'object') {
        lines.push(`${prefix}${connector}${name}/`);
        lines.push(this.renderTree(node[name] as Record<string, unknown>, prefix + childPrefix));
      } else {
        lines.push(`${prefix}${connector}${name}`);
      }
    }

    return lines.filter(Boolean).join('\n');
  }

  /**
   * Extract exported symbols from source files using regex.
   */
  private async extractExports(
    containerId: string,
    containerManager: ContainerManager,
    files: string[],
  ): Promise<string[]> {
    if (files.length === 0) return [];

    // Use grep to find export patterns across files
    const grepPatterns = [
      'export (function|class|const|let|type|interface|enum) ',
      'export default ',
      'def [a-zA-Z_]',
      'class [A-Z]',
    ].join('|');

    const fileList = files.map((f) => JSON.stringify(f)).join(' ');
    const cmd = `grep -hE '${grepPatterns}' ${fileList} 2>/dev/null | head -100`;

    try {
      const result = await containerManager.exec(containerId, cmd, {
        timeoutMs: 10_000,
      });

      if (result.exitCode !== 0 || !result.stdout.trim()) return [];

      const exports: Set<string> = new Set();

      for (const line of result.stdout.split('\n')) {
        // TypeScript/JavaScript exports
        const tsMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|let|type|interface|enum)\s+(\w+)/);
        if (tsMatch?.[1]) {
          exports.add(tsMatch[1]);
          continue;
        }

        // Python function/class definitions
        const pyFnMatch = line.match(/^def\s+([a-zA-Z_]\w*)/);
        if (pyFnMatch?.[1] && !pyFnMatch[1].startsWith('_')) {
          exports.add(pyFnMatch[1]);
          continue;
        }

        const pyClassMatch = line.match(/^class\s+([A-Z]\w*)/);
        if (pyClassMatch?.[1]) {
          exports.add(pyClassMatch[1]);
        }
      }

      return [...exports].sort().slice(0, 50);
    } catch {
      return [];
    }
  }

  /**
   * Compute SHA-256 hashes for a subset of files (for staleness detection).
   */
  private async computeFileHashes(
    containerId: string,
    containerManager: ContainerManager,
    files: string[],
  ): Promise<Record<string, string>> {
    if (files.length === 0) return {};

    const fileList = files.map((f) => JSON.stringify(f)).join(' ');
    const cmd = `sha256sum ${fileList} 2>/dev/null`;

    try {
      const result = await containerManager.exec(containerId, cmd, {
        timeoutMs: 15_000,
      });

      if (result.exitCode !== 0) return {};

      const hashes: Record<string, string> = {};
      for (const line of result.stdout.trim().split('\n')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          hashes[parts[1]!] = parts[0]!;
        }
      }
      return hashes;
    } catch {
      return {};
    }
  }

  private getExtension(filePath: string): string | null {
    const dotIndex = filePath.lastIndexOf('.');
    if (dotIndex === -1) return null;
    return filePath.slice(dotIndex);
  }
}
