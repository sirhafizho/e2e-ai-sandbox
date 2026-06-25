import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ToolRegistry } from '../registry.js';
import type { ToolSpec, ToolContext } from '../types.js';
import { ContainerManager } from '../../sandbox/index.js';

const mockContext: ToolContext = {
  containerId: 'test-container',
  sessionId: 'test-session',
  containerManager: new ContainerManager(),
};

function createTestTool(
  overrides: {
    name?: string;
    timeoutMs?: number;
    handler?: (input: { msg: string }, context: ToolContext) => Promise<string>;
  } = {},
): ToolSpec<{ msg: string }, string> {
  return {
    name: overrides.name ?? 'test_tool',
    description: 'A test tool',
    category: 'custom',
    inputSchema: z.object({ msg: z.string() }),
    timeoutMs: overrides.timeoutMs,
    handler: overrides.handler ?? (async (input) => `echo: ${input.msg}`),
  };
}

describe('ToolRegistry', () => {
  it('should register and retrieve a tool', () => {
    const registry = new ToolRegistry();
    const tool = createTestTool();
    registry.register(tool);

    assert.ok(registry.has('test_tool'));
    assert.equal(registry.get('test_tool')?.name, 'test_tool');
  });

  it('should list all registered tools', () => {
    const registry = new ToolRegistry();
    registry.register(createTestTool({ name: 'tool_a' }));
    registry.register(createTestTool({ name: 'tool_b' }));

    const tools = registry.list();
    assert.equal(tools.length, 2);
    assert.ok(tools.some((t) => t.name === 'tool_a'));
    assert.ok(tools.some((t) => t.name === 'tool_b'));
  });

  it('should reject duplicate tool names', () => {
    const registry = new ToolRegistry();
    registry.register(createTestTool());
    assert.throws(() => registry.register(createTestTool()), /already registered/);
  });

  it('should execute a tool with valid input', async () => {
    const registry = new ToolRegistry();
    registry.register(createTestTool());

    const result = await registry.execute('test_tool', { msg: 'hello' }, mockContext);
    assert.equal(result.isError, false);
    assert.equal(result.output, 'echo: hello');
    assert.equal(result.toolName, 'test_tool');
    assert.ok(result.callId.length > 0);
    assert.ok(result.durationMs >= 0);
  });

  it('should return TOOL_NOT_FOUND for unknown tools', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute('nonexistent', {}, mockContext);
    assert.equal(result.isError, true);
    assert.equal(result.errorCode, 'TOOL_NOT_FOUND');
  });

  it('should return TOOL_VALIDATION for invalid input', async () => {
    const registry = new ToolRegistry();
    registry.register(createTestTool());

    const result = await registry.execute('test_tool', { msg: 123 }, mockContext);
    assert.equal(result.isError, true);
    assert.equal(result.errorCode, 'TOOL_VALIDATION');
  });

  it('should return TOOL_VALIDATION when required fields are missing', async () => {
    const registry = new ToolRegistry();
    registry.register(createTestTool());

    const result = await registry.execute('test_tool', {}, mockContext);
    assert.equal(result.isError, true);
    assert.equal(result.errorCode, 'TOOL_VALIDATION');
  });

  it('should handle tool execution errors', async () => {
    const registry = new ToolRegistry();
    registry.register(
      createTestTool({
        handler: async (): Promise<string> => {
          throw new Error('tool crashed');
        },
      }),
    );

    const result = await registry.execute('test_tool', { msg: 'hi' }, mockContext);
    assert.equal(result.isError, true);
    assert.equal(result.errorCode, 'TOOL_ERROR');
  });

  it('should enforce tool timeout', async () => {
    const registry = new ToolRegistry();
    registry.register(
      createTestTool({
        timeoutMs: 100,
        handler: async (): Promise<string> => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return 'too late';
        },
      }),
    );

    const result = await registry.execute('test_tool', { msg: 'hi' }, mockContext);
    assert.equal(result.isError, true);
    assert.equal(result.errorCode, 'TOOL_TIMEOUT');
  });

  it('should export tool definitions in OpenAI function-calling format', () => {
    const registry = new ToolRegistry();
    registry.register(createTestTool());

    const defs = registry.toFunctionDefinitions();
    assert.equal(defs.length, 1);
    assert.equal(defs[0]?.type, 'function');
    assert.equal(defs[0]?.function.name, 'test_tool');
    assert.equal(defs[0]?.function.description, 'A test tool');
    assert.ok(defs[0]?.function.parameters);
  });
});
