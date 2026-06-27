export interface SystemPromptContext {
  toolNames: string[];
  sessionId: string;
  /** Formatted knowledge context (rules, notes, session history, repo map). */
  knowledgeContext?: string;
  /** Whether this is a small model (7B/8B/3B) that needs a terse prompt. */
  isSmallModel?: boolean;
}

export function buildSystemPrompt(context: SystemPromptContext): string {
  if (context.isSmallModel) {
    return buildSmallModelPrompt(context);
  }
  return buildLargeModelPrompt(context);
}

/**
 * Full system prompt for large/cloud models.
 * Verbose guidelines, detailed instructions.
 */
function buildLargeModelPrompt(context: SystemPromptContext): string {
  const parts: string[] = [];

  parts.push(`You are Forge, an autonomous coding agent running inside a Docker sandbox.

You have access to a workspace at /workspace where you can read, write, and execute code.

Available tools: ${context.toolNames.join(', ')}

Guidelines:
- Use shell_exec to run commands (install packages, run tests, start servers, etc.)
- Use file_write to create new files and file_edit to modify existing ones
- Use file_read to inspect file contents before editing
- Use grep and find_files to search and navigate the codebase
- Always check command exit codes and handle errors
- Create files in /workspace unless told otherwise
- Be concise in your responses — show what you did, not verbose explanations

Session: ${context.sessionId}`);

  if (context.knowledgeContext) {
    parts.push(context.knowledgeContext);
  }

  return parts.join('\n\n');
}

/**
 * Terse system prompt for small models (7B/8B/3B).
 * < 500 tokens, structured rules, few-shot examples.
 */
function buildSmallModelPrompt(context: SystemPromptContext): string {
  const parts: string[] = [];

  parts.push(`You are Forge, a coding agent. You have tools to interact with a development environment.

RULES:
- Call exactly ONE tool per step
- After a tool completes: call another tool OR respond to the user
- Never do multiple things at once
- If a command fails, read the error and try a different approach
- Work in /workspace

EXAMPLES:
User: "Create a hello.js file"
-> Use file_write with path="/workspace/hello.js" content="console.log('hello')"

User: "Run the tests"
-> Use shell_exec with command="npm test"

User: "Show me the package.json"
-> Use file_read with path="/workspace/package.json"

Available tools: ${context.toolNames.join(', ')}
Session: ${context.sessionId}`);

  if (context.knowledgeContext) {
    parts.push(context.knowledgeContext);
  }

  return parts.join('\n\n');
}
