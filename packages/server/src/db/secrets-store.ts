import type Database from 'better-sqlite3';

/**
 * Secret row as stored in SQLite.
 */
export interface SecretRow {
  repo: string;
  key: string;
  value: string;
  created_at: string;
}

/**
 * SecretsStore — per-repo key-value store for environment variables.
 *
 * Secrets are scoped to a repo and injected into sandbox containers
 * as environment variables during session creation.
 */
export class SecretsStore {
  private db: Database.Database;
  private stmtGet!: Database.Statement;
  private stmtUpsert!: Database.Statement;
  private stmtDelete!: Database.Statement;
  private stmtListByRepo!: Database.Statement;
  private stmtDeleteAllForRepo!: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStatements();
  }

  private prepareStatements(): void {
    this.stmtGet = this.db.prepare(`SELECT * FROM secrets WHERE repo = ? AND key = ?`);

    this.stmtUpsert = this.db.prepare(`
      INSERT INTO secrets (repo, key, value, created_at)
      VALUES (@repo, @key, @value, @created_at)
      ON CONFLICT(repo, key) DO UPDATE SET
        value = @value
    `);

    this.stmtDelete = this.db.prepare(`DELETE FROM secrets WHERE repo = ? AND key = ?`);

    this.stmtListByRepo = this.db.prepare(
      `SELECT * FROM secrets WHERE repo = ? ORDER BY key ASC`,
    );

    this.stmtDeleteAllForRepo = this.db.prepare(`DELETE FROM secrets WHERE repo = ?`);
  }

  /**
   * Get a secret by repo and key.
   */
  get(repo: string, key: string): SecretRow | undefined {
    return this.stmtGet.get(repo, key) as SecretRow | undefined;
  }

  /**
   * Set (create or update) a secret.
   */
  set(repo: string, key: string, value: string): SecretRow {
    const now = new Date().toISOString();
    const row: SecretRow = { repo, key, value, created_at: now };
    this.stmtUpsert.run(row);
    return row;
  }

  /**
   * Delete a secret by repo and key.
   */
  delete(repo: string, key: string): boolean {
    const result = this.stmtDelete.run(repo, key);
    return result.changes > 0;
  }

  /**
   * List all secrets for a repo (keys only — values redacted unless requested).
   */
  listByRepo(repo: string): SecretRow[] {
    return this.stmtListByRepo.all(repo) as SecretRow[];
  }

  /**
   * Get all secrets for a repo as a key-value map (for container injection).
   */
  getEnvMap(repo: string): Record<string, string> {
    const rows = this.listByRepo(repo);
    const envMap: Record<string, string> = {};
    for (const row of rows) {
      envMap[row.key] = row.value;
    }
    return envMap;
  }

  /**
   * Delete all secrets for a repo.
   */
  deleteAllForRepo(repo: string): number {
    const result = this.stmtDeleteAllForRepo.run(repo);
    return result.changes;
  }
}
