import type Database from 'better-sqlite3';

/**
 * Session history row as stored in SQLite.
 */
export interface SessionHistoryRow {
  session_id: string;
  repo: string | null;
  summary: string;
  decisions_made: string; // JSON array
  files_modified: string; // JSON array
  errors_hit: string; // JSON array
  duration_seconds: number;
  model_used: string;
  created_at: string;
}

/**
 * Fields accepted when creating a session history entry.
 */
export interface CreateHistoryInput {
  sessionId: string;
  repo?: string;
  summary: string;
  decisionsMade?: string[];
  filesModified?: string[];
  errorsHit?: string[];
  durationSeconds?: number;
  modelUsed: string;
}

/** Maximum number of history entries to retain per repo. */
const MAX_ENTRIES_PER_REPO = 50;

/**
 * SessionHistoryStore — compressed logs of past sessions for continuity.
 *
 * Each session gets a summary, decisions, modified files, and errors —
 * enough context to answer "what did I do last time?"
 */
export class SessionHistoryStore {
  private db: Database.Database;
  private stmtInsert!: Database.Statement;
  private stmtGetById!: Database.Statement;
  private stmtList!: Database.Statement;
  private stmtListByRepo!: Database.Statement;
  private stmtSearch!: Database.Statement;
  private stmtDelete!: Database.Statement;
  private stmtCountByRepo!: Database.Statement;
  private stmtDeleteOldest!: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStatements();
  }

  private prepareStatements(): void {
    this.stmtInsert = this.db.prepare(`
      INSERT OR REPLACE INTO session_history
        (session_id, repo, summary, decisions_made, files_modified, errors_hit, duration_seconds, model_used, created_at)
      VALUES
        (@session_id, @repo, @summary, @decisions_made, @files_modified, @errors_hit, @duration_seconds, @model_used, @created_at)
    `);

    this.stmtGetById = this.db.prepare(`SELECT * FROM session_history WHERE session_id = ?`);

    this.stmtList = this.db.prepare(
      `SELECT * FROM session_history ORDER BY created_at DESC LIMIT 50`,
    );

    this.stmtListByRepo = this.db.prepare(
      `SELECT * FROM session_history WHERE repo = @repo ORDER BY created_at DESC LIMIT @limit`,
    );

    this.stmtSearch = this.db.prepare(
      `SELECT * FROM session_history WHERE
        (repo = @repo OR @repo IS NULL)
        AND (summary LIKE @query OR decisions_made LIKE @query OR files_modified LIKE @query)
       ORDER BY created_at DESC LIMIT @limit`,
    );

    this.stmtDelete = this.db.prepare(`DELETE FROM session_history WHERE session_id = ?`);

    this.stmtCountByRepo = this.db.prepare(
      `SELECT COUNT(*) as count FROM session_history WHERE repo = ?`,
    );

    this.stmtDeleteOldest = this.db.prepare(
      `DELETE FROM session_history WHERE session_id IN (
        SELECT session_id FROM session_history WHERE repo = ?
        ORDER BY created_at ASC LIMIT ?
      )`,
    );
  }

  /**
   * Create or update a session history entry.
   * Automatically prunes old entries beyond MAX_ENTRIES_PER_REPO.
   */
  create(input: CreateHistoryInput): SessionHistoryRow {
    const now = new Date().toISOString();
    const row: SessionHistoryRow = {
      session_id: input.sessionId,
      repo: input.repo ?? null,
      summary: input.summary,
      decisions_made: JSON.stringify(input.decisionsMade ?? []),
      files_modified: JSON.stringify(input.filesModified ?? []),
      errors_hit: JSON.stringify(input.errorsHit ?? []),
      duration_seconds: input.durationSeconds ?? 0,
      model_used: input.modelUsed,
      created_at: now,
    };

    this.stmtInsert.run(row);

    // Prune old entries if needed
    if (row.repo) {
      const { count } = this.stmtCountByRepo.get(row.repo) as { count: number };
      if (count > MAX_ENTRIES_PER_REPO) {
        this.stmtDeleteOldest.run(row.repo, count - MAX_ENTRIES_PER_REPO);
      }
    }

    return row;
  }

  /**
   * Get a history entry by session ID.
   */
  get(sessionId: string): SessionHistoryRow | undefined {
    return this.stmtGetById.get(sessionId) as SessionHistoryRow | undefined;
  }

  /**
   * List recent session history (up to 50 entries).
   */
  list(): SessionHistoryRow[] {
    return this.stmtList.all() as SessionHistoryRow[];
  }

  /**
   * List history entries for a specific repo.
   */
  listByRepo(repo: string, limit: number = 20): SessionHistoryRow[] {
    return this.stmtListByRepo.all({ repo, limit }) as SessionHistoryRow[];
  }

  /**
   * Search history entries by keyword.
   */
  search(query: string, repo?: string, limit: number = 20): SessionHistoryRow[] {
    return this.stmtSearch.all({
      repo: repo ?? null,
      query: `%${query}%`,
      limit,
    }) as SessionHistoryRow[];
  }

  /**
   * Delete a history entry.
   */
  delete(sessionId: string): boolean {
    const result = this.stmtDelete.run(sessionId);
    return result.changes > 0;
  }

  /**
   * Get the most recent session summary for a repo.
   */
  getLastSummary(repo: string): string | null {
    const rows = this.stmtListByRepo.all({ repo, limit: 1 }) as SessionHistoryRow[];
    return rows[0]?.summary ?? null;
  }
}
