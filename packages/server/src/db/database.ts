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

const SCHEMA_VERSION = 1;

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

  INSERT INTO schema_version (version) VALUES (${SCHEMA_VERSION});
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

  if (!tableExists) {
    // Fresh database — apply all migrations
    db.exec(MIGRATIONS[0]!);
    return;
  }

  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;
  const currentVersion = row?.version ?? 0;

  // Apply any newer migrations
  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]!);
    db.prepare('UPDATE schema_version SET version = ?').run(i + 1);
  }
}
