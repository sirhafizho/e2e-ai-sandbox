import { z } from 'zod';
import type { ToolSpec, ToolContext } from '../types.js';

const MAX_SCREENSHOT_SIZE = 1_000_000; // 1MB base64

/**
 * Helper: run a Playwright script inside the container.
 * Uses the system Chromium set via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
 * The script is a self-contained Node.js script that uses Playwright.
 */
async function runPlaywrightScript(
  containerId: string,
  script: string,
  context: ToolContext,
  timeoutMs = 30_000,
) {
  // Escape the script for bash
  const escaped = script.replace(/'/g, "'\\''");
  const cmd = `node -e '${escaped}'`;
  const result = await context.containerManager.exec(containerId, cmd, {
    timeoutMs,
    env: {
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
    },
  });
  return result;
}

/**
 * Helper: generate Playwright script that reuses a persistent browser session.
 * 
 * On first call, launches a Chromium server and saves its WebSocket endpoint
 * to /tmp/forge-browser-ws. Subsequent calls connect to the running browser.
 * Pages are reused across calls so navigation state persists (click after navigate works).
 */
function playwrightSessionScript(body: string): string {
  return `
const { chromium } = require("playwright");
const fs = require("fs");
const WS_FILE = "/tmp/forge-browser-ws";

async function getOrCreateBrowser() {
  // Try to connect to an existing browser server
  if (fs.existsSync(WS_FILE)) {
    const wsEndpoint = fs.readFileSync(WS_FILE, "utf-8").trim();
    try {
      const browser = await chromium.connectOverCDP(wsEndpoint);
      return { browser, reused: true };
    } catch {
      // Server is stale, clean up and launch fresh
      try { fs.unlinkSync(WS_FILE); } catch {}
    }
  }

  // Launch a new browser server
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium-browser",
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--remote-debugging-port=9222",
    ],
  });
  // Save the CDP endpoint for reuse
  fs.writeFileSync(WS_FILE, "http://127.0.0.1:9222");
  return { browser, reused: false };
}

(async () => {
  const { browser, reused } = await getOrCreateBrowser();

  // Reuse existing page if available, otherwise create one
  let context;
  let page;
  const contexts = browser.contexts();
  if (reused && contexts.length > 0) {
    context = contexts[0];
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
  } else {
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
  }

  try {
    ${body}
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  }
  // Do NOT close the browser — keep it running for subsequent calls
})().catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1); });
`;
}

// --- browser_navigate ---

const BrowserNavigateInput = z.object({
  url: z.string().describe('URL to navigate to'),
});
type BrowserNavigateInput = z.infer<typeof BrowserNavigateInput>;

interface BrowserNavigateOutput {
  title: string;
  url: string;
  status: number | null;
}

export const browserNavigateTool: ToolSpec<BrowserNavigateInput, BrowserNavigateOutput> = {
  name: 'browser_navigate',
  description: 'Navigate to a URL in a headless browser and return the page title and final URL.',
  category: 'browser',
  timeoutMs: 30_000,
  inputSchema: BrowserNavigateInput,
  handler: async (input, context) => {
    const script = playwrightSessionScript(`
    const response = await page.goto(${JSON.stringify(input.url)}, { waitUntil: "domcontentloaded", timeout: 20000 });
    const title = await page.title();
    const url = page.url();
    const status = response ? response.status() : null;
    console.log(JSON.stringify({ title, url, status }));
    `);

    const result = await runPlaywrightScript(context.containerId, script, context);
    if (result.exitCode !== 0) {
      const errMsg = tryParseError(result.stderr) || result.stderr;
      throw new Error(`Navigation failed: ${errMsg}`);
    }

    return JSON.parse(result.stdout.trim());
  },
};

// --- browser_click ---

const BrowserClickInput = z.object({
  selector: z.string().describe('CSS selector of element to click'),
});
type BrowserClickInput = z.infer<typeof BrowserClickInput>;

interface BrowserClickOutput {
  success: boolean;
  selector: string;
}

export const browserClickTool: ToolSpec<BrowserClickInput, BrowserClickOutput> = {
  name: 'browser_click',
  description: 'Click an element on the page identified by a CSS selector.',
  category: 'browser',
  timeoutMs: 15_000,
  inputSchema: BrowserClickInput,
  handler: async (input, context) => {
    const script = playwrightSessionScript(`
    // Need to first navigate or have a page open
    await page.click(${JSON.stringify(input.selector)}, { timeout: 10000 });
    console.log(JSON.stringify({ success: true, selector: ${JSON.stringify(input.selector)} }));
    `);

    const result = await runPlaywrightScript(context.containerId, script, context);
    if (result.exitCode !== 0) {
      throw new Error(`Click failed: ${tryParseError(result.stderr) || result.stderr}`);
    }

    return JSON.parse(result.stdout.trim());
  },
};

// --- browser_type ---

const BrowserTypeInput = z.object({
  selector: z.string().describe('CSS selector of input element'),
  text: z.string().describe('Text to type into the element'),
});
type BrowserTypeInput = z.infer<typeof BrowserTypeInput>;

interface BrowserTypeOutput {
  success: boolean;
  selector: string;
  text: string;
}

export const browserTypeTool: ToolSpec<BrowserTypeInput, BrowserTypeOutput> = {
  name: 'browser_type',
  description: 'Type text into an input element identified by a CSS selector.',
  category: 'browser',
  timeoutMs: 15_000,
  inputSchema: BrowserTypeInput,
  handler: async (input, context) => {
    const script = playwrightSessionScript(`
    await page.fill(${JSON.stringify(input.selector)}, ${JSON.stringify(input.text)}, { timeout: 10000 });
    console.log(JSON.stringify({ success: true, selector: ${JSON.stringify(input.selector)}, text: ${JSON.stringify(input.text)} }));
    `);

    const result = await runPlaywrightScript(context.containerId, script, context);
    if (result.exitCode !== 0) {
      throw new Error(`Type failed: ${tryParseError(result.stderr) || result.stderr}`);
    }

    return JSON.parse(result.stdout.trim());
  },
};

// --- browser_screenshot ---

const BrowserScreenshotInput = z.object({
  url: z.string().optional().describe('URL to navigate to before screenshot (optional if page already loaded)'),
  full_page: z.boolean().optional().default(false).describe('Capture full page instead of viewport'),
});
type BrowserScreenshotInput = z.infer<typeof BrowserScreenshotInput>;

interface BrowserScreenshotOutput {
  base64_image: string;
  width: number;
  height: number;
  url: string;
}

export const browserScreenshotTool: ToolSpec<BrowserScreenshotInput, BrowserScreenshotOutput> = {
  name: 'browser_screenshot',
  description: 'Take a screenshot of the current page or a specific URL. Returns base64-encoded PNG.',
  category: 'browser',
  timeoutMs: 30_000,
  inputSchema: BrowserScreenshotInput,
  handler: async (input, context) => {
    const navLine = input.url
      ? `await page.goto(${JSON.stringify(input.url)}, { waitUntil: "domcontentloaded", timeout: 20000 });`
      : '';

    const script = playwrightSessionScript(`
    ${navLine}
    const screenshot = await page.screenshot({
      fullPage: ${input.full_page ?? false},
      type: "png",
    });
    const base64 = screenshot.toString("base64");
    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    const url = page.url();
    console.log(JSON.stringify({ base64_image: base64, width: viewport.width, height: viewport.height, url }));
    `);

    const result = await runPlaywrightScript(context.containerId, script, context);
    if (result.exitCode !== 0) {
      throw new Error(`Screenshot failed: ${tryParseError(result.stderr) || result.stderr}`);
    }

    const output = JSON.parse(result.stdout.trim());

    // Ensure screenshot is under size limit
    if (output.base64_image.length > MAX_SCREENSHOT_SIZE) {
      // Take a smaller screenshot with reduced quality
      const resizeScript = playwrightSessionScript(`
      ${navLine}
      await page.setViewportSize({ width: 800, height: 450 });
      const screenshot = await page.screenshot({ fullPage: false, type: "png" });
      const base64 = screenshot.toString("base64");
      console.log(JSON.stringify({ base64_image: base64, width: 800, height: 450, url: page.url() }));
      `);
      const resizeResult = await runPlaywrightScript(context.containerId, resizeScript, context);
      if (resizeResult.exitCode === 0) {
        return JSON.parse(resizeResult.stdout.trim());
      }
    }

    return output;
  },
};

// --- browser_evaluate ---

const BrowserEvaluateInput = z.object({
  expression: z.string().describe('JavaScript expression to evaluate in the page context'),
  url: z.string().optional().describe('URL to navigate to before evaluating (optional)'),
});
type BrowserEvaluateInput = z.infer<typeof BrowserEvaluateInput>;

interface BrowserEvaluateOutput {
  result: unknown;
}

export const browserEvaluateTool: ToolSpec<BrowserEvaluateInput, BrowserEvaluateOutput> = {
  name: 'browser_evaluate',
  description: 'Execute a JavaScript expression in the page context and return the result.',
  category: 'browser',
  timeoutMs: 15_000,
  inputSchema: BrowserEvaluateInput,
  handler: async (input, context) => {
    const navLine = input.url
      ? `await page.goto(${JSON.stringify(input.url)}, { waitUntil: "domcontentloaded", timeout: 20000 });`
      : '';

    // Pass expression as a JSON-serialized string to avoid template injection.
    // The expression is evaluated inside page.evaluate via new Function().
    const script = playwrightSessionScript(`
    ${navLine}
    const __expr = ${JSON.stringify(input.expression)};
    const result = await page.evaluate((__e) => {
      return new Function("return (" + __e + ")")();
    }, __expr);
    console.log(JSON.stringify({ result }));
    `);

    const result = await runPlaywrightScript(context.containerId, script, context);
    if (result.exitCode !== 0) {
      throw new Error(`Evaluate failed: ${tryParseError(result.stderr) || result.stderr}`);
    }

    return JSON.parse(result.stdout.trim());
  },
};

// --- browser_get_text ---

const BrowserGetTextInput = z.object({
  selector: z.string().optional().describe('CSS selector to get text from (default: full page body text)'),
  url: z.string().optional().describe('URL to navigate to before getting text (optional)'),
});
type BrowserGetTextInput = z.infer<typeof BrowserGetTextInput>;

interface BrowserGetTextOutput {
  text: string;
}

export const browserGetTextTool: ToolSpec<BrowserGetTextInput, BrowserGetTextOutput> = {
  name: 'browser_get_text',
  description: 'Get the text content of a page or specific element. Without a selector, returns full page text.',
  category: 'browser',
  timeoutMs: 15_000,
  inputSchema: BrowserGetTextInput,
  handler: async (input, context) => {
    const navLine = input.url
      ? `await page.goto(${JSON.stringify(input.url)}, { waitUntil: "domcontentloaded", timeout: 20000 });`
      : '';

    const selectorExpr = input.selector
      ? `await page.textContent(${JSON.stringify(input.selector)}, { timeout: 10000 })`
      : `await page.evaluate(() => document.body.innerText)`;

    const script = playwrightSessionScript(`
    ${navLine}
    const text = ${selectorExpr};
    console.log(JSON.stringify({ text: text || "" }));
    `);

    const result = await runPlaywrightScript(context.containerId, script, context);
    if (result.exitCode !== 0) {
      throw new Error(`Get text failed: ${tryParseError(result.stderr) || result.stderr}`);
    }

    return JSON.parse(result.stdout.trim());
  },
};

// --- Helper ---

function tryParseError(stderr: string): string | null {
  try {
    const parsed = JSON.parse(stderr.trim());
    return parsed.error ?? null;
  } catch {
    return null;
  }
}
