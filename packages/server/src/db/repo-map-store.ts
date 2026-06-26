import type Database from 'better-sqlite3';

/**
 * Repo map row as stored in SQLite.
 */
export interface RepoMapRow {
  repo: string;
  map_data: string; // JSON string
  file_hashes: string; // JSON string
  generated_at: string;
}

/**
 * RepoMapStore — cached structural overviews of codebases.
 *
 * Stores auto-generated repo maps with file hashes for
 * staleness detection and incremental refresh.
 */
export class RepoMapStore {
  private db: Database.Database;
  private stmtGet!: Database.Statement;
  private stmtUpsert!: Database.Statement;
  private stmtDelete!: Database.Statement;
  private stmtList!: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStatements();
  }

  private prepareStatements(): void {
    this.stmtGet = this.db.prepare(`SELECT * FROM repo_maps WHERE repo = ?`);

    this.stmtUpsert = this.db.prepare(`
      INSERT INTO repo_maps (repo, map_data, file_hashes, generated_at)
      VALUES (@repo, @map_data, @file_hashes, @generated_at)
      ON CONFLICT(repo) DO UPDATE SET
        map_data = @map_data,
        file_hashes = @file_hashes,
        generated_at = @generated_at
    `);

    this.stmtDelete = this.db.prepare(`DELETE FROM repo_maps WHERE repo = ?`);

    this.stmtList = this.db.prepare(`SELECT * FROM repo_maps ORDER BY generated_at DESC`);
  }

  /**
   * Get a repo map by repo identifier.
   */
  get(repo: string): RepoMapRow | undefined {
    return this.stmtGet.get(repo) as RepoMapRow | undefined;
  }

  /**
   * Save or update a repo map.
   */
  save(repo: string, mapData: string, fileHashes: string): RepoMapRow {
    const now = new Date().toISOString();
    const row: RepoMapRow = {
      repo,
      map_data: mapData,
      file_hashes: fileHashes,
      generated_at: now,
    };
    this.stmtUpsert.run(row);
    return row;
  }

  /**
   * Delete a repo map.
   */
  delete(repo: string): boolean {
    const result = this.stmtDelete.run(repo);
    return result.changes > 0;
  }

  /**
   * List all repo maps.
   */
  list(): RepoMapRow[] {
    return this.stmtList.all() as RepoMapRow[];
  }

  /**
   * Check if a repo map is stale by comparing file hashes.
   * Returns true if the cached hashes differ from the provided ones.
   */
  isStale(repo: string, currentHashes: Record<string, string>): boolean {
    const existing = this.get(repo);
    if (!existing) return true;

    try {
      const cached = JSON.parse(existing.file_hashes) as Record<string, string>;
      const currentKeys = Object.keys(currentHashes).sort();
      const cachedKeys = Object.keys(cached).sort();

      if (currentKeys.length !== cachedKeys.length) return true;

      for (let i = 0; i < currentKeys.length; i++) {
        if (currentKeys[i] !== cachedKeys[i]) return true;
        if (currentHashes[currentKeys[i]!] !== cached[cachedKeys[i]!]) return true;
      }

      return false;
    } catch {
      return true;
    }
  }
}
