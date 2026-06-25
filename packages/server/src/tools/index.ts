export { ToolRegistry } from './registry.js';
export type { ToolSpec, ToolHandler, ToolContext, ToolExecResult } from './types.js';
export { registerBuiltinTools } from './register-builtins.js';
export {
  shellExecTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  grepTool,
  findFilesTool,
} from './handlers/index.js';
