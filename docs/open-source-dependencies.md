# Open-Source Dependency Map — Forge

> **Date:** 2026-06-24
> **Purpose:** Map every Forge component to proven open-source libraries. Build on shoulders of giants — don't reinvent the wheel.

---

## Philosophy

For each component, we follow this decision tree:
1. **Is there an open-source library that does 80%+ of what we need?** -> Adopt it
2. **Is there a library that does the right thing but needs a thin wrapper?** -> Wrap it
3. **Does nothing exist?** -> Build it (rare)

---

## The Full Stack — What We Build vs What We Adopt

```
BUILD (our code)          ADOPT (open-source)
─────────────────         ─────────────────────────────
Agent loop glue     <--   Vercel AI SDK (streamText, tools)
Tool handlers       <--   Zod (schemas), dockerode (execution)
Session manager     <--   dockerode (containers)
Snapshot builder    <--   Docker CLI/API (image caching)
Knowledge store     <--   better-sqlite3 + Drizzle ORM
Repo map            <--   tree-sitter (parsing)
Web UI layout       <--   react-resizable-panels
Chat panel          <--   assistant-ui + streamdown
Terminal panel      <--   xterm.js (react-xtermjs)
Editor panel        <--   CodeMirror 6 (@uiw/react-codemirror)
File tree           <--   react-arborist
Git operations      <--   simple-git + octokit
Context management  <--   js-tiktoken (counting), custom (windowing)
```

**Estimated custom code: ~30%** of the system. The rest is assembly.

---

## Layer 1: LLM Provider

### Decision: Vercel AI SDK

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `ai` | Core SDK — `streamText()`, `generateText()`, tool loop | ~34KB | Apache 2.0 |
| `@ai-sdk/openai` | OpenAI provider (GPT-4o, etc.) | ~20KB | Apache 2.0 |
| `@ai-sdk/anthropic` | Anthropic provider (Claude) | ~20KB | Apache 2.0 |
| `@ai-sdk/openai-compatible` | Ollama, vLLM, LM Studio, OpenRouter | ~20KB | Apache 2.0 |

**Why Vercel AI SDK over alternatives:**
- Unified interface across all providers (one `streamText()` call)
- Built-in multi-step tool loop (`maxSteps` parameter)
- Streaming-first (30ms p99 latency)
- 2.8M weekly downloads, actively maintained
- Zod-native tool definitions
- 34-60KB per provider (vs LangChain at 101KB+)

**What we DON'T use:** LangChain.js (too heavy), raw OpenAI SDK (no provider abstraction), LiteLLM JS (needs proxy sidecar)

### Install
```bash
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/openai-compatible
```

---

## Layer 2: Tool Schema & Validation

### Decision: Zod

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `zod` | Schema validation + JSON Schema generation for LLM tools | ~12KB | MIT |

**Why Zod:**
- Vercel AI SDK uses Zod natively for tool definitions
- `z.toJSONSchema()` generates the exact format LLMs need
- 226M weekly downloads — largest validation ecosystem
- Excellent TypeScript inference (`z.infer<typeof schema>`)

**What we DON'T use:** TypeBox (good for Fastify but Zod integrates better with AI SDK), Valibot (smaller but less mature)

### Install
```bash
pnpm add zod
```

---

## Layer 3: Docker / Sandbox

### Decision: dockerode

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `dockerode` | Docker API client — containers, exec, streams, volumes | ~50KB | Apache 2.0 |
| `@types/dockerode` | TypeScript types | dev | MIT |

**Why dockerode:**
- Stream-first design — perfect for real-time tool output
- `container.exec()` with stdout/stderr demuxing
- `container.attach()` with stdin for interactive shells
- Full Docker Remote API coverage
- 2.9M weekly downloads, battle-tested

**What we DON'T use:** E2B (cloud-first, needs Firecracker), Daytona SDK (adds infrastructure layer), Docker Node SDK (less mature streaming)

### Install
```bash
pnpm add dockerode
pnpm add -D @types/dockerode
```

---

## Layer 4: Database / Knowledge

### Decision: better-sqlite3 + Drizzle ORM

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `better-sqlite3` | SQLite engine — fast, synchronous, zero-config | native | MIT |
| `drizzle-orm` | Type-safe ORM layer over SQLite | ~7KB | MIT |
| `drizzle-kit` | Migration CLI | dev | MIT |

**Why this stack:**
- better-sqlite3 is 11.7x faster than node-sqlite3
- Drizzle adds type-safe queries with zero runtime overhead
- SQLite = zero-config, file-based, perfect for self-hosted
- No external database to manage

**What we DON'T use:** Prisma (too heavy, requires engine binary), TypeORM (complex), raw SQL (no type safety)

### Install
```bash
pnpm add better-sqlite3 drizzle-orm
pnpm add -D drizzle-kit @types/better-sqlite3
```

---

## Layer 5: Code Understanding

### Decision: tree-sitter + agentmap

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `tree-sitter` | AST parsing for 100+ languages | native | MIT |
| `tree-sitter-typescript` | TypeScript/JavaScript grammar | native | MIT |
| `tree-sitter-python` | Python grammar | native | MIT |

**For repo mapping (Phase 4):**
| Package | Purpose | License |
|---------|---------|---------|
| `agentmap` | Token-efficient codebase maps for agents (~98% fewer tokens) | MIT |

**Why tree-sitter:**
- node-tree-sitter (native) is fastest for server-side
- Incremental parsing — fast updates on file changes
- Same tech used by GitHub, Neovim, Zed

**What we DON'T use:** web-tree-sitter (WASM, slower on server), ts-morph (TypeScript-only, heavier)

### Install
```bash
pnpm add tree-sitter tree-sitter-typescript tree-sitter-python
```

---

## Layer 6: Token Counting & Context Management

### Decision: js-tiktoken + custom windowing

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `js-tiktoken` | Token counting for OpenAI models | ~1MB/encoding | MIT |
| `@anthropic-ai/tokenizer` | Token counting for Claude | minimal | MIT |

**Context management:** We build a thin custom layer (not a library). The logic is:
1. Count tokens with js-tiktoken
2. At 70% budget: flag for attention
3. At 85% budget: auto-summarize old turns using the LLM itself
4. Always keep: system prompt, last 3 turns, pending tool calls

**Why custom over libraries:** Context management libraries (context-window-planner, ctx-opt) are too opinionated for our agent loop. The logic is ~100 lines of code.

### Install
```bash
pnpm add js-tiktoken @anthropic-ai/tokenizer
```

---

## Layer 7: Git Operations

### Decision: simple-git + octokit

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `simple-git` | Local git operations (status, diff, commit, push) | ~20KB | MIT |
| `octokit` | GitHub API (create PR, check CI, manage issues) | modular | MIT |

**Why simple-git:** Shells out to `git` CLI — simple, reliable, no native bindings. Self-hosted means git is always available.

**Why octokit:** Official GitHub client. Full REST + GraphQL API. Pre-authenticated in GitHub Actions.

**What we DON'T use:** isomorphic-git (pure JS git — 500KB, slower, unnecessary for server-side)

### Install
```bash
pnpm add simple-git octokit
```

---

## Layer 8: Web UI Components

### Chat Panel

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `@assistant-ui/react` | Composable chat UI primitives | ~30KB | MIT |
| `@assistant-ui/react-ai-sdk` | Vercel AI SDK integration | ~10KB | MIT |
| `streamdown` | Streaming markdown rendering (replaces react-markdown) | ~80KB | MIT |

**Why assistant-ui:** Composable, works with Vercel AI SDK natively, streaming-first, 10.7K stars.

### Terminal Panel

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `react-xtermjs` | React wrapper for xterm.js (hooks-based) | ~50KB | MIT |
| `@xterm/addon-fit` | Auto-resize terminal to container | ~5KB | MIT |
| `@xterm/addon-search` | Search within terminal output | ~5KB | MIT |
| `@xterm/addon-webgl` | GPU-accelerated rendering | ~20KB | MIT |

**Why react-xtermjs:** Modern hooks API, actively maintained by Qovery, React 18+ support.

### Code Editor

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `@uiw/react-codemirror` | React wrapper for CodeMirror 6 | ~100KB | MIT |
| `@codemirror/lang-javascript` | JavaScript/TypeScript syntax | ~30KB | MIT |
| `@codemirror/lang-python` | Python syntax | ~20KB | MIT |
| `@codemirror/theme-one-dark` | Dark theme | ~5KB | MIT |

**Why CodeMirror 6 over Monaco:** 5-10x smaller bundle (100KB vs 1-5MB). Modular, tree-shakeable. Monaco is overkill for a file viewer — we're not building an IDE.

### File Tree

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `react-arborist` | Virtualized file tree with drag-drop, rename | ~50KB | MIT |

**Why react-arborist:** Most popular, feature-complete, VSCode-like UX.

### Layout

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `react-resizable-panels` | Resizable 4-panel layout | ~20KB | MIT |

**Why react-resizable-panels:** 31.6M weekly downloads, by Brian Vaughn (React core team). Flexbox-based, nested groups, layout persistence.

### WebSocket

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `react-use-websocket` | React hooks for WebSocket with auto-reconnect | ~15KB | MIT |

**Why react-use-websocket:** Lightweight, auto-reconnect built-in, React-first API.

### Styling

| Package | Purpose | License |
|---------|---------|---------|
| `tailwindcss` | Utility-first CSS | MIT |
| `tailwind-merge` | Smart class merging | MIT |
| `clsx` | Conditional class names | MIT |

### Install (all UI)
```bash
pnpm add @assistant-ui/react @assistant-ui/react-ai-sdk streamdown
pnpm add react-xtermjs @xterm/addon-fit @xterm/addon-search
pnpm add @uiw/react-codemirror @codemirror/lang-javascript @codemirror/theme-one-dark
pnpm add react-arborist react-resizable-panels react-use-websocket
pnpm add tailwindcss tailwind-merge clsx
```

---

## Layer 9: Server Framework

### Decision: Hono

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `hono` | Lightweight web framework (REST + WebSocket) | ~14KB | MIT |
| `@hono/node-server` | Node.js adapter | ~5KB | MIT |
| `@hono/node-ws` | WebSocket support for Node.js | ~5KB | MIT |

**Why Hono over Fastify:**
- Smaller (14KB vs 50KB+)
- Native WebSocket support
- Edge-compatible (works in Cloudflare Workers, Deno, Bun too)
- Growing fast (22K stars)
- Middleware ecosystem (CORS, JWT, etc.)

### Install
```bash
pnpm add hono @hono/node-server @hono/node-ws
```

---

## Layer 10: Browser Automation (inside container)

### Decision: Playwright (already decided, no change)

Playwright runs inside the Docker container, not on the host. No npm package needed on the server — we control it via CDP (Chrome DevTools Protocol) from the server, or via `docker exec` commands.

---

## Summary: Complete Dependency List

### Server (packages/server)
```
ai, @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/openai-compatible
zod
hono, @hono/node-server, @hono/node-ws
dockerode
better-sqlite3, drizzle-orm
simple-git, octokit
js-tiktoken, @anthropic-ai/tokenizer
tree-sitter, tree-sitter-typescript, tree-sitter-python
```

### UI (packages/ui)
```
react, react-dom
@assistant-ui/react, @assistant-ui/react-ai-sdk, streamdown
react-xtermjs, @xterm/addon-fit, @xterm/addon-search
@uiw/react-codemirror, @codemirror/lang-javascript, @codemirror/theme-one-dark
react-arborist
react-resizable-panels
react-use-websocket
tailwindcss, tailwind-merge, clsx
```

### Shared (packages/shared)
```
zod (shared tool schemas and types)
```

---

## What We Actually Build (Custom Code)

| Component | Why Custom | Estimated Size |
|-----------|-----------|---------------|
| Agent loop orchestration | Glue between AI SDK + our tool registry + context management | ~500 lines |
| Tool handlers | Each tool's execute function (shell_exec, file_read, etc.) | ~200 lines/tool |
| Session manager | Container lifecycle + state tracking | ~400 lines |
| Snapshot builder | Docker image caching from environment.yaml | ~300 lines |
| Knowledge store schema | Drizzle schema + query helpers | ~200 lines |
| Context windowing | Summarize + checkpoint logic | ~100 lines |
| WebSocket event layer | Bi-directional event routing | ~300 lines |
| CLI (`forge` command) | Commander-based CLI | ~200 lines |
| UI panels (wiring) | Connecting adopted components to our WebSocket | ~500 lines |

**Total estimated custom code: ~3,000-4,000 lines** for an MVP. The libraries do the heavy lifting.

---

## Cost of Ownership

| Aspect | Our Approach | Alternative (build from scratch) |
|--------|-------------|----------------------------------|
| Lines of custom code | ~3-4K | ~30-50K |
| Dependencies to maintain | ~35 packages | ~5 packages |
| Time to MVP | ~6-8 weeks | ~6-12 months |
| Bus factor risk | Low (popular libraries) | High (all custom) |
| Update burden | pnpm update | Manual patches |

The tradeoff is clear: more dependencies but **10x less custom code and 5x faster to ship**.
