# Contributing to Forge

Thanks for your interest in contributing to Forge! This project aims to make autonomous AI coding agents accessible to everyone through a self-hostable, open-source platform.

## How to Contribute

### Reporting Issues

- Use [GitHub Issues](https://github.com/sirhafizho/e2e-ai-sandbox/issues) to report bugs or request features
- Search existing issues before creating a new one
- Include steps to reproduce for bug reports
- Include your environment (OS, Docker version, LLM provider)

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Follow the spec-first approach** — if your change affects architecture, update the relevant spec in `specs/` first
3. **Write tests** for new functionality
4. **Follow existing code conventions** — TypeScript strict mode, existing patterns
5. **Keep PRs focused** — one feature or fix per PR
6. **Update documentation** — if you change behavior, update the relevant docs

### Development Setup

```bash
# Prerequisites
# - Node.js 22+
# - pnpm 9+
# - Docker Desktop (or Docker Engine on Linux)
# - An LLM provider (Ollama for local, or API keys for cloud)

# Clone the repo
git clone https://github.com/sirhafizho/e2e-ai-sandbox.git
cd e2e-ai-sandbox

# Install dependencies (when implementation begins)
pnpm install

# Build the sandbox Docker image
pnpm run sandbox:build

# Start the development server
pnpm run dev

# Run tests
pnpm test
```

### Project Structure

```
packages/
├── server/    # Agent server (TypeScript/Node.js)
├── sandbox/   # Docker image + container manager
├── ui/        # Web UI (React + Vite)
└── shared/    # Shared types and utilities
```

### Coding Standards

- **Language:** TypeScript (strict mode)
- **Style:** Prettier + ESLint (configs in repo root)
- **Commits:** Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- **Tests:** Vitest for unit tests, Playwright for E2E
- **No secrets:** Never commit API keys, tokens, or credentials

### What We're Looking For

#### Good First Issues
Look for issues labeled `good first issue` — these are scoped, well-defined tasks suitable for newcomers.

#### Areas Where Help Is Needed
- **LLM Provider integrations** — adding support for new providers
- **Tool implementations** — new built-in tools for the sandbox
- **Docker optimization** — faster image builds, smaller base images
- **UI components** — terminal panel, browser panel, file tree
- **Documentation** — guides, examples, tutorials
- **Testing** — unit tests, integration tests, E2E tests

### Adding a New Tool

One of the easiest ways to contribute is adding a new tool to the registry:

1. Create a file in `packages/server/src/tools/`
2. Implement the `ToolDefinition` interface (see `specs/tools/tool-registry.md`)
3. Register it in the tool registry
4. Add tests
5. Update `specs/tools/tool-registry.md` with the new tool

### Adding an LLM Provider

1. Implement the `LLMProvider` interface in `packages/server/src/providers/`
2. Add configuration options
3. Test with the agent loop
4. Update docs

## Development Workflow

This project uses the **BMAD Method** for planning and development:

1. **Specs first** — behavioral specs in `specs/` define what to build
2. **Stories** — work is broken into implementable stories via BMAD
3. **Implementation** — code follows the specs
4. **Review** — adversarial code review before merge

For significant changes, please open an issue to discuss the approach before starting work.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
