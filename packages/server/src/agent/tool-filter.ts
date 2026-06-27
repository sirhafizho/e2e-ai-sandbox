/**
 * Tool filtering for small models.
 *
 * Reduces the number of tool definitions sent to 7B/8B models to save
 * context tokens and reduce confusion. The full tool registry is still
 * used for execution — filtering only affects what the LLM sees.
 */

import type { ToolSpec } from '../tools/types.js';

/** Core tools always available to all models. */
const ESSENTIAL_TOOLS = [
  'shell_exec',
  'file_read',
  'file_write',
  'file_edit',
  'grep',
  'find_files',
];

/** Git tools — included when git operations are relevant. */
const GIT_TOOLS = [
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
];

/** Browser tools — included only when browsing is relevant. */
const BROWSER_TOOLS = [
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_screenshot',
  'browser_evaluate',
  'browser_get_text',
];

/**
 * Filter tool definitions for small models.
 * Returns a subset of tools to reduce token usage and model confusion.
 *
 * Tool filtering only affects the definitions sent to the LLM.
 * The tool registry still executes any tool the LLM calls.
 */
export function filterToolsForSmallModel(allTools: ToolSpec[]): ToolSpec[] {
  // Simple approach: keep only the essential 6 tools.
  // This covers ~90% of use cases and saves ~500-800 tokens.
  return allTools.filter((t) => ESSENTIAL_TOOLS.includes(t.name));
}

/**
 * Contextual tool filtering (more sophisticated).
 * Adds git/browser tools based on session state.
 */
export function filterToolsForContext(
  allTools: ToolSpec[],
  options: {
    hasGitRepo?: boolean;
    browsingRequested?: boolean;
  } = {},
): ToolSpec[] {
  const allowedNames = new Set(ESSENTIAL_TOOLS);

  if (options.hasGitRepo) {
    for (const t of GIT_TOOLS) allowedNames.add(t);
  }

  if (options.browsingRequested) {
    for (const t of BROWSER_TOOLS) allowedNames.add(t);
  }

  return allTools.filter((t) => allowedNames.has(t.name));
}
