# Spec: Knowledge System

**Status:** Draft  
**Priority:** P2 (Phase 4) — Cross-session intelligence and persistent memory.

---

## Overview

The knowledge system is how the agent gets smarter over time. It stores persistent context — user preferences, repo patterns, past decisions — and injects relevant pieces into each session automatically. Instead of starting cold every time, the agent carries forward what it has learned.

Inspired by Devin's knowledge notes system.

**Core principle:** Every session should be better than the last because the agent remembers.

---

## Components

### 1. Knowledge Notes

User-authored or auto-generated pieces of context that persist across sessions.

**Examples:**

| Note | Scope | Source |
|------|-------|--------|
| "Always run lint before committing" | Global | User |
| "This project uses Prisma for ORM" | Repo | Auto |
| "Hafiz prefers TypeScript over JavaScript" | Global | User |
| "The auth module lives in `src/core/auth/`" | Repo | Auto |
| "Use `pnpm` not `npm` in this monorepo" | Repo | User |

**Storage schema (`knowledge_notes`):**

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (UUID) | Primary key |
| `content` | TEXT | The note body |
| `tags` | JSON (TEXT[]) | Categorization tags |
| `repo_scope` | TEXT | `global` or repo path (e.g. `~/projects/my-app`) |
| `source` | TEXT | `user` or `auto` |
| `created_at` | DATETIME | When the note was created |
| `last_used_at` | DATETIME | Last time the note was injected into a session |

**Behaviors:**

- **Auto-injection:** On session start, match notes by repo + task keywords, inject top-K into the system prompt
- **Auto-suggestion:** After a session ends, the agent can propose new notes based on patterns it observed (e.g. "you corrected me twice about using `pnpm` — want me to remember that?")
- **Manual CRUD:** Users can create, edit, list, and delete notes via CLI or UI
- **Deduplication:** Before persisting a new note, check for semantic overlap with existing notes

---

### 2. Rules

Repo-specific guidance loaded from the filesystem. These are convention files that many AI tools already support.

**Auto-read from (in precedence order):**

1. `AGENTS.md` (project root)
2. `.devin/rules/` (directory of rule files)
3. `CLAUDE.md` (project root)
4. `.cursorrules` (project root)
5. `.github/copilot-instructions.md`

**Behaviors:**

- Injected into the system prompt on every session for that repo
- Precedence: repo-level rules override global-level rules
- Parsed as markdown — headings become section labels in the prompt
- Cached after first read; re-read only when file mtime changes
- If multiple rule files exist, merge them (later files in the list don't override — all are included)

---

### 3. Session History

Compressed logs of past sessions, enabling continuity and self-reference.

**Storage schema (`session_history`):**

| Column | Type | Description |
|--------|------|-------------|
| `session_id` | TEXT (UUID) | Primary key |
| `repo` | TEXT | Repo path or identifier |
| `summary` | TEXT | One-paragraph summary of what happened |
| `decisions_made` | JSON (TEXT[]) | Key decisions (e.g. "chose REST over GraphQL") |
| `files_modified` | JSON (TEXT[]) | List of files touched |
| `errors_hit` | JSON (TEXT[]) | Errors encountered and how they were resolved |
| `duration` | INTEGER | Session duration in seconds |
| `model_used` | TEXT | LLM model identifier |
| `created_at` | DATETIME | Session start time |

**Behaviors:**

- Searchable — the agent can query "what did I do last time in this repo?"
- Used for continuity — "last session you were working on the auth module"
- Auto-summarized by the LLM at session end (compressed from full conversation)
- Retention: keep last 50 sessions per repo, archive older ones

---

### 4. Repo Map (Codebase Understanding)

Auto-generated structural overview of a codebase so the agent understands the project without reading every file.

Similar to [Aider's repository map](https://aider.chat/docs/repomap.html).

**Extraction (via tree-sitter):**

- Files and directory structure
- Classes and their methods
- Top-level functions
- Exports and imports (dependency graph)
- Key types/interfaces

**Storage schema (`repo_maps`):**

| Column | Type | Description |
|--------|------|-------------|
| `repo` | TEXT | Repo path or identifier |
| `map_data` | JSON | Structured codebase overview |
| `file_hashes` | JSON | Per-file hashes for staleness detection |
| `generated_at` | DATETIME | When the map was last built |

**Behaviors:**

- Cached and refreshed incrementally when files change (compare file hashes)
- Injected as condensed context into the system prompt
- Supports multiple languages via tree-sitter grammars
- Configurable depth — can be a shallow overview or deep extraction
- Large repos: prioritize files near the current task (e.g. same directory, imported files)

---

## Storage

- **Global database:** `~/.forge/knowledge.db`
- **Repo-local database:** `.forge/knowledge.db` (in repo root)
- Engine: SQLite — lightweight, no external dependencies, single-file
- Repo-local DB takes precedence for repo-scoped data; global DB stores cross-repo notes and session history

**Tables:**

| Table | Location | Purpose |
|-------|----------|---------|
| `knowledge_notes` | Global + Repo-local | Persistent context notes |
| `session_history` | Global | Cross-session logs |
| `repo_maps` | Repo-local | Cached codebase structure |

---

## API (Internal)

These are internal service endpoints, not user-facing HTTP APIs.

```
POST   /knowledge/notes          — Create a note
GET    /knowledge/notes          — List notes (filter by repo, tags)
DELETE /knowledge/notes/:id      — Delete a note
POST   /knowledge/notes/suggest  — Auto-suggest notes from session
GET    /knowledge/sessions       — List past sessions
GET    /knowledge/sessions/:id   — Get session detail
GET    /knowledge/repo-map       — Get/refresh repo map
```

**Query parameters for `GET /knowledge/notes`:**

| Param | Type | Description |
|-------|------|-------------|
| `repo` | string | Filter by repo scope |
| `tags` | string[] | Filter by tags |
| `source` | string | `user` or `auto` |
| `limit` | int | Max results (default 20) |

---

## Injection Flow

The full sequence when a session starts:

```
1. Session starts for repo X
2. Load all notes tagged for repo X + global notes
3. Score notes by relevance to current task (keyword match, recency, frequency)
4. Inject top 10 notes into system prompt (configurable via max_injected_notes)
5. Load rules from filesystem (AGENTS.md, .devin/rules/, CLAUDE.md, etc.)
6. Load last session summary for repo X
7. Load repo map (generate if stale or missing)
8. Assemble full system prompt with all context
9. Agent begins with full context — no cold start
```

**Token budget allocation (approximate):**

| Component | Target Budget |
|-----------|--------------|
| Knowledge notes | ~1,500 tokens |
| Rules (AGENTS.md, etc.) | ~2,000 tokens |
| Last session summary | ~500 tokens |
| Repo map | ~2,000 tokens |
| **Total injected context** | **~6,000 tokens** |

---

## Open Questions

- **Relevance scoring:** Embedding-based semantic search vs. keyword matching? Embeddings are more accurate but add a dependency (local model or API call). Keyword matching is simpler and fast. Start with keyword matching, upgrade later?
- **Max notes per session:** Suggest 10–15 injected notes. Needs testing to balance context richness vs. token overhead.
- **Auto-generated note approval:** Should auto-suggested notes require explicit user approval before persisting? Leaning yes — avoids polluting the knowledge base with noise.
- **Stale note handling:** Auto-expire notes after N days unused? Or surface "you have N notes not used in 90 days — review?" Passive cleanup is safer than silent deletion.
- **Conflict resolution:** What happens when a repo-local note contradicts a global note? Repo-local should win, but should the user be notified?
- **Privacy:** Session history contains conversation summaries. Should there be an opt-out or auto-purge policy?
