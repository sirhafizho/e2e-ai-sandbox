import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserScreenshotTool,
  browserEvaluateTool,
  browserGetTextTool,
} from '../handlers/browser-tools.js';
import type { ToolContext } from '../types.js';

// --- Stub container manager ---

function createMockExecStream(stdout: string, stderr: string, exitCode: number) {
  return {
    start: (_opts: unknown, cb: (err: Error | null, stream: unknown) => void) => {
      const stdoutBuf = Buffer.from(stdout);
      const stderrBuf = Buffer.from(stderr);
      const chunks: Buffer[] = [];
      if (stdoutBuf.length > 0) {
        const header = Buffer.alloc(8);
        header[0] = 1;
        header.writeUInt32BE(stdoutBuf.length, 4);
        chunks.push(Buffer.concat([header, stdoutBuf]));
      }
      if (stderrBuf.length > 0) {
        const header = Buffer.alloc(8);
        header[0] = 2;
        header.writeUInt32BE(stderrBuf.length, 4);
        chunks.push(Buffer.concat([header, stderrBuf]));
      }
      const stream = {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'data') { for (const c of chunks) handler(c); }
          if (event === 'end') { setTimeout(() => handler(), 0); }
        },
      };
      cb(null, stream);
    },
    inspect: async () => ({ ExitCode: exitCode }),
  };
}

function createMockContext(execResults: Array<{ stdout: string; stderr: string; exitCode: number }>): ToolContext {
  let callIndex = 0;
  const mockContainer = {
    id: 'test-container',
    exec: async () => {
      const r = execResults[callIndex] ?? { stdout: '', stderr: '', exitCode: 0 };
      callIndex++;
      return createMockExecStream(r.stdout, r.stderr, r.exitCode);
    },
  };

  return {
    containerId: 'test-container',
    sessionId: 'test-session',
    containerManager: {
      exec: async (containerId: string, command: string, options?: unknown) => {
        const r = execResults[callIndex] ?? { stdout: '', stderr: '', exitCode: 0 };
        callIndex++;
        return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode, durationMs: 100 };
      },
    },
  } as unknown as ToolContext;
}

describe('Browser Tools — schema validation', () => {
  it('browser_navigate has correct tool metadata', () => {
    assert.equal(browserNavigateTool.name, 'browser_navigate');
    assert.equal(browserNavigateTool.category, 'browser');
    assert.ok(browserNavigateTool.description.length > 0);
  });

  it('browser_click has correct tool metadata', () => {
    assert.equal(browserClickTool.name, 'browser_click');
    assert.equal(browserClickTool.category, 'browser');
  });

  it('browser_type has correct tool metadata', () => {
    assert.equal(browserTypeTool.name, 'browser_type');
    assert.equal(browserTypeTool.category, 'browser');
  });

  it('browser_screenshot has correct tool metadata', () => {
    assert.equal(browserScreenshotTool.name, 'browser_screenshot');
    assert.equal(browserScreenshotTool.category, 'browser');
  });

  it('browser_evaluate has correct tool metadata', () => {
    assert.equal(browserEvaluateTool.name, 'browser_evaluate');
    assert.equal(browserEvaluateTool.category, 'browser');
  });

  it('browser_get_text has correct tool metadata', () => {
    assert.equal(browserGetTextTool.name, 'browser_get_text');
    assert.equal(browserGetTextTool.category, 'browser');
  });
});

describe('Browser Tools — handler execution', () => {
  it('browser_navigate returns parsed JSON output on success', async () => {
    const ctx = createMockContext([
      { stdout: '{"title":"Example","url":"https://example.com","status":200}', stderr: '', exitCode: 0 },
    ]);

    const result = await browserNavigateTool.handler({ url: 'https://example.com' }, ctx);
    assert.equal(result.title, 'Example');
    assert.equal(result.url, 'https://example.com');
    assert.equal(result.status, 200);
  });

  it('browser_navigate throws on failure', async () => {
    const ctx = createMockContext([
      { stdout: '', stderr: 'Navigation timeout', exitCode: 1 },
    ]);

    await assert.rejects(
      () => browserNavigateTool.handler({ url: 'https://invalid.test' }, ctx),
      /Navigation failed/,
    );
  });

  it('browser_click returns success on valid click', async () => {
    const ctx = createMockContext([
      { stdout: '{"success":true,"selector":"#btn"}', stderr: '', exitCode: 0 },
    ]);

    const result = await browserClickTool.handler({ selector: '#btn' }, ctx);
    assert.equal(result.success, true);
    assert.equal(result.selector, '#btn');
  });

  it('browser_type returns success on valid input', async () => {
    const ctx = createMockContext([
      { stdout: '{"success":true,"selector":"#input","text":"hello"}', stderr: '', exitCode: 0 },
    ]);

    const result = await browserTypeTool.handler({ selector: '#input', text: 'hello' }, ctx);
    assert.equal(result.success, true);
    assert.equal(result.text, 'hello');
  });

  it('browser_screenshot returns base64 image', async () => {
    const ctx = createMockContext([
      { stdout: '{"base64_image":"iVBORw0KGgo=","width":1280,"height":720,"url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);

    const result = await browserScreenshotTool.handler({}, ctx);
    assert.ok(result.base64_image.length > 0);
    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);
  });

  it('browser_evaluate returns expression result', async () => {
    const ctx = createMockContext([
      { stdout: '{"result":42}', stderr: '', exitCode: 0 },
    ]);

    const result = await browserEvaluateTool.handler({ expression: '1 + 41' }, ctx);
    assert.equal(result.result, 42);
  });

  it('browser_get_text returns page text', async () => {
    const ctx = createMockContext([
      { stdout: '{"text":"Hello World"}', stderr: '', exitCode: 0 },
    ]);

    const result = await browserGetTextTool.handler({}, ctx);
    assert.equal(result.text, 'Hello World');
  });

  it('browser_get_text with selector returns element text', async () => {
    const ctx = createMockContext([
      { stdout: '{"text":"Button Text"}', stderr: '', exitCode: 0 },
    ]);

    const result = await browserGetTextTool.handler({ selector: '.my-button' }, ctx);
    assert.equal(result.text, 'Button Text');
  });

  it('browser_evaluate with url navigates first', async () => {
    const ctx = createMockContext([
      { stdout: '{"result":"https://example.com"}', stderr: '', exitCode: 0 },
    ]);

    const result = await browserEvaluateTool.handler(
      { expression: 'window.location.href', url: 'https://example.com' },
      ctx,
    );
    assert.equal(result.result, 'https://example.com');
  });
});

describe('Browser Tools — all 6 tools registered', () => {
  it('should have unique tool names', () => {
    const tools = [
      browserNavigateTool,
      browserClickTool,
      browserTypeTool,
      browserScreenshotTool,
      browserEvaluateTool,
      browserGetTextTool,
    ];
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    assert.equal(unique.size, 6, `Expected 6 unique tool names, got ${unique.size}`);
  });

  it('all tools have browser category', () => {
    const tools = [
      browserNavigateTool,
      browserClickTool,
      browserTypeTool,
      browserScreenshotTool,
      browserEvaluateTool,
      browserGetTextTool,
    ];
    for (const tool of tools) {
      assert.equal(tool.category, 'browser', `${tool.name} should have browser category`);
    }
  });
});
