import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Forge database — SQLite-backed persistence for sessions and conversation history.
 *
 * Default location: ~/.forge/forge.db
 * In tests, use :memory: for isolation.
 */

const MIGRATIONS: string[] = [
  // v1 — Initial schema
  `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'created',
    model TEXT NOT NULL,
    container_id TEXT,
    volume_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    history_json TEXT DEFAULT '[]',
    context_summary TEXT
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  INSERT INTO schema_version (version) VALUES (1);
  `,
  // v2 — Settings table (key-value store for server configuration)
  `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  // v3 — Knowledge notes table
  `
  CREATE TABLE IF NOT EXISTS knowledge_notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    repo_scope TEXT NOT NULL DEFAULT 'global',
    source TEXT NOT NULL DEFAULT 'user' CHECK(source IN ('user', 'auto')),
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_knowledge_notes_repo ON knowledge_notes(repo_scope);
  CREATE INDEX IF NOT EXISTS idx_knowledge_notes_source ON knowledge_notes(source);
  `,
  // v4 — Session history table
  `
  CREATE TABLE IF NOT EXISTS session_history (
    session_id TEXT PRIMARY KEY,
    repo TEXT,
    summary TEXT NOT NULL DEFAULT '',
    decisions_made TEXT NOT NULL DEFAULT '[]',
    files_modified TEXT NOT NULL DEFAULT '[]',
    errors_hit TEXT NOT NULL DEFAULT '[]',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    model_used TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_session_history_repo ON session_history(repo);
  `,
  // v5 — Repo maps table
  `
  CREATE TABLE IF NOT EXISTS repo_maps (
    repo TEXT PRIMARY KEY,
    map_data TEXT NOT NULL DEFAULT '{}',
    file_hashes TEXT NOT NULL DEFAULT '{}',
    generated_at TEXT NOT NULL
  );
  `,
  // v6 — Secrets table and checkpoints table
  `
  CREATE TABLE IF NOT EXISTS secrets (
    repo TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (repo, key)
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);
  `,
];

/**
 * Get the default database path: ~/.forge/forge.db
 */
export function getDefaultDbPath(): string {
  const forgeDir = path.join(os.homedir(), '.forge');
  fs.mkdirSync(forgeDir, { recursive: true });
  return path.join(forgeDir, 'forge.db');
}

/**
 * Open (or create) the Forge SQLite database.
 *
 * @param dbPath - Path to the database file, or ':memory:' for in-memory
 */
export function openDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? getDefaultDbPath();
  const db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run migrations
  applyMigrations(db);

  return db;
}

function applyMigrations(db: Database.Database): void {
  // Check if schema_version table exists
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'`)
    .get() as { name: string } | undefined;

  let currentVersion = 0;

  if (!tableExists) {
    // Fresh database — apply initial migration (creates schema_version table)
    db.exec(MIGRATIONS[0]!);
    currentVersion = 1;
  } else {
    const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
      | { version: number }
      | undefined;
    currentVersion = row?.version ?? 0;
  }

  // Apply any newer migrations
  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]!);
    db.prepare('UPDATE schema_version SET version = ?').run(i + 1);
  }
}
