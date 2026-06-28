import { z } from 'zod';
import type { ToolSpec, ToolContext, ToolExecResult, ToolHandler } from './types.js';

const DEFAULT_TIMEOUT_MS = 120_000;

interface RegisteredTool {
  spec: ToolSpec;
  handler: ToolHandler<unknown, unknown>;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register<TInput, TOutput>(spec: ToolSpec<TInput, TOutput>): void {
    if (this.tools.has(spec.name)) {
      throw new Error(`Tool already registered: ${spec.name}`);
    }
    this.tools.set(spec.name, {
      spec: spec as ToolSpec,
      handler: spec.handler as ToolHandler<unknown, unknown>,
    });
  }

  list(): ToolSpec[] {
    return Array.from(this.tools.values()).map((t) => t.spec);
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name)?.spec;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolExecResult> {
    const callId = crypto.randomUUID().slice(0, 8);
    const start = Date.now();

    const registered = this.tools.get(name);
    if (!registered) {
      return {
        callId,
        toolName: name,
        output: { error: `Tool not found: ${name}` },
        isError: true,
        durationMs: Date.now() - start,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    const { spec, handler } = registered;

    // Validate input against Zod schema
    const parseResult = spec.inputSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        callId,
        toolName: name,
        output: {
          error: 'Invalid input',
          details: parseResult.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        isError: true,
        durationMs: Date.now() - start,
        errorCode: 'TOOL_VALIDATION',
      };
    }

    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const output = await Promise.race([
        handler(parseResult.data, context),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Tool timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
      clearTimeout(timer);

      return {
        callId,
        toolName: name,
        output,
        isError: false,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.message.includes('timed out');
      return {
        callId,
        toolName: name,
        output: { error: err instanceof Error ? err.message : String(err) },
        isError: true,
        durationMs: Date.now() - start,
        errorCode: isTimeout ? 'TOOL_TIMEOUT' : 'TOOL_ERROR',
      };
    }
  }

  /**
   * Export tool definitions in OpenAI function-calling format for LLM consumption.
   */
  toFunctionDefinitions(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.list().map((spec) => ({
      type: 'function' as const,
      function: {
        name: spec.name,
        description: spec.description,
        parameters: z.toJSONSchema(spec.inputSchema) as Record<string, unknown>,
      },
    }));
  }
}
