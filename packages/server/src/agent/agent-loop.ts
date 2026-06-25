import { streamText, dynamicTool, isStepCount, type LanguageModel, type ModelMessage } from 'ai';
import type { ToolRegistry } from '../tools/registry.js';
import type { ContainerManager } from '../sandbox/container-manager.js';
import type { SessionContext, AgentEvent } from './types.js';
import { buildSystemPrompt } from './system-prompt.js';

const MAX_STEPS = 25;

export class AgentLoop {
  private model: LanguageModel;
  private toolRegistry: ToolRegistry;
  private containerManager: ContainerManager;

  constructor(
    model: LanguageModel,
    toolRegistry: ToolRegistry,
    containerManager: ContainerManager,
  ) {
    this.model = model;
    this.toolRegistry = toolRegistry;
    this.containerManager = containerManager;
  }

  async *run(userMessage: string, sessionContext: SessionContext): AsyncGenerator<AgentEvent> {
    const toolSpecs = this.toolRegistry.list();
    const systemPrompt =
      sessionContext.systemPrompt ??
      buildSystemPrompt({
        toolNames: toolSpecs.map((t) => t.name),
        sessionId: sessionContext.sessionId,
      });

    const messages: ModelMessage[] = [{ role: 'user', content: userMessage }];

    // Build AI SDK tool definitions from registry using dynamicTool()
    // for runtime-registered tools with unknown input/output types
    const aiTools: Record<string, ReturnType<typeof dynamicTool>> = {};
    for (const spec of toolSpecs) {
      const toolName = spec.name;
      aiTools[toolName] = dynamicTool({
        description: spec.description,
        inputSchema: spec.inputSchema,
        execute: async (input) => {
          const context = {
            containerId: sessionContext.containerId,
            sessionId: sessionContext.sessionId,
            containerManager: this.containerManager,
          };
          const result = await this.toolRegistry.execute(toolName, input, context);
          return result.output;
        },
      });
    }

    const result = streamText({
      model: this.model,
      system: systemPrompt,
      messages,
      tools: aiTools,
      stopWhen: isStepCount(MAX_STEPS),
    });

    let currentText = '';

    for await (const part of result.stream) {
      switch (part.type) {
        case 'text-delta': {
          currentText += part.text;
          yield {
            type: 'agent_message',
            data: { content: part.text, done: false },
          };
          break;
        }

        case 'tool-call': {
          yield {
            type: 'tool_start',
            data: {
              callId: part.toolCallId,
              toolName: part.toolName,
              inputSummary: JSON.stringify(part.input).slice(0, 200),
            },
          };
          break;
        }

        case 'tool-result': {
          yield {
            type: 'tool_complete',
            data: {
              callId: part.toolCallId,
              output: part.output,
              durationMs: 0,
              isError: false,
            },
          };
          break;
        }

        case 'error': {
          yield {
            type: 'tool_error',
            data: {
              error: String(part.error),
            },
          };
          break;
        }

        case 'finish': {
          yield {
            type: 'agent_message',
            data: { content: '', done: true },
          };
          break;
        }
      }
    }

    yield { type: 'done', data: { totalText: currentText } };
  }
}
