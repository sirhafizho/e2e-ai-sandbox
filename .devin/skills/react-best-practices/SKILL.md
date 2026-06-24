---
name: react-best-practices
description: React performance optimization guidelines. Use when writing, reviewing, or refactoring React code to ensure optimal performance patterns. Triggers on tasks involving React components, data fetching, bundle optimization, or performance improvements.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# React Best Practices for Forge UI

Performance optimization guide for React applications, adapted from Vercel Engineering.

## When to Apply

Reference these guidelines when:
- Writing new React components for the Forge web UI
- Implementing data fetching (WebSocket, REST)
- Reviewing code for performance issues
- Refactoring existing React code
- Optimizing bundle size or load times

## Key Rules by Priority

### 1. Eliminating Waterfalls (CRITICAL)
- Check cheap sync conditions before async operations
- Defer await into branches where actually used
- Use Promise.all() for independent operations
- Use Suspense to stream content progressively

### 2. Bundle Size (CRITICAL)
- Import directly, avoid barrel files
- Use dynamic imports for heavy components (Monaco, xterm.js)
- Load analytics/logging after hydration
- Preload on hover/focus for perceived speed

### 3. Re-render Optimization (MEDIUM)
- Don't subscribe to state only used in callbacks
- Extract expensive work into memoized components
- Use functional setState for stable callbacks
- Use startTransition for non-urgent updates (tool output rendering)
- Use useDeferredValue for expensive renders (terminal output)

### 4. Forge-Specific Patterns
- **WebSocket state**: use refs for high-frequency updates (tool streaming), state for UI-affecting changes
- **Terminal panel**: xterm.js handles its own rendering — don't re-render React on every character
- **Monaco editor**: lazy-load, single instance per session
- **Chat streaming**: use requestAnimationFrame for token-by-token rendering
- **Tool output cards**: virtualize long lists, collapse by default
