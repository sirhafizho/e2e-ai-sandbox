import type { ToolRegistry } from './registry.js';
import {
  shellExecTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  grepTool,
  findFilesTool,
} from './handlers/index.js';

export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register(shellExecTool);
  registry.register(fileReadTool);
  registry.register(fileWriteTool);
  registry.register(fileEditTool);
  registry.register(grepTool);
  registry.register(findFilesTool);
}
