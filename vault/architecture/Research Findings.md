# Research Findings

Summary of deep research conducted 2026-06-08. Full details: `docs/research-findings.md`

## Key Takeaways

1. **Docker is the standard** — Devin, OpenHands, SWE-agent all use Docker containers for isolation.
2. **REST + SSE is proven** — OpenHands uses event-stream over REST. Simpler than WebSocket for this use case.
3. **Playwright is universal** — Both OpenHands and SWE-agent use Chromium via Playwright.
4. **MCP is complementary, not primary** — Good for tool discovery catalogs. Not the right transport for agent↔sandbox communication.
5. **Per-session containers** — Clean slate per run. Mount workspace volume for persistence.

## Implementations Studied

| System | Type | Key Insight |
|--------|------|-------------|
| [[Devin]] | Commercial | Full IDE + terminal + browser in one agent |
| [[OpenHands]] | Open source | REST event-stream API is battle-tested |
| [[SWE-agent]] | Research | Context-efficient file viewer (100-line windows) |

## What We're Taking

- Docker sandbox model (from all three)
- REST + SSE communication (from OpenHands)
- Playwright browser (from OpenHands)
- Context-efficient file viewing (from SWE-agent)
- Tool registry pattern (from MCP, adapted for REST)
