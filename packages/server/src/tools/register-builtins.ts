import type { ToolRegistry } from './registry.js';
import {
  shellExecTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  grepTool,
  findFilesTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitCommitTool,
  gitPushTool,
  gitCreatePrTool,
  gitPrStatusTool,
} from './handlers/index.js';

export function registerBuiltinTools(registry: ToolRegistry): void {
  // Shell
  registry.register(shellExecTool);

  // File operations
  registry.register(fileReadTool);
  registry.register(fileWriteTool);
  registry.register(fileEditTool);

  // Search
  registry.register(grepTool);
  registry.register(findFilesTool);

  // Git
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(gitLogTool);
  registry.register(gitCommitTool);
  registry.register(gitPushTool);
  registry.register(gitCreatePrTool);
  registry.register(gitPrStatusTool);
}
