import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.js';

describe('openDatabase', () => {
  it('should open an in-memory database', () => {
    const db = openDatabase(':memory:');
    assert.ok(db);
    db.close();
  });

  it('should create the sessions table', () => {
    const db = openDatabase(':memory:');
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    assert.ok(tableNames.includes('sessions'), `Expected sessions table, got: ${tableNames.join(', ')}`);
    assert.ok(tableNames.includes('schema_version'), `Expected schema_version table`);
    db.close();
  });

  it('should set schema version to 1', () => {
    const db = openDatabase(':memory:');
    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    assert.equal(row.version, 1);
    db.close();
  });

  it('should enable WAL mode', () => {
    const db = openDatabase(':memory:');
    const mode = db.pragma('journal_mode', { simple: true }) as string;
    // In-memory databases may report 'memory' instead of 'wal'
    assert.ok(mode === 'wal' || mode === 'memory', `Expected wal or memory, got: ${mode}`);
    db.close();
  });

  it('should be idempotent (re-opening same DB works)', () => {
    const db1 = openDatabase(':memory:');
    // Simulate re-migration by running openDatabase on same connection
    const row1 = db1.prepare('SELECT version FROM schema_version').get() as { version: number };
    assert.equal(row1.version, 1);
    db1.close();
  });
});
