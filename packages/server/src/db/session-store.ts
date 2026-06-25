import type Database from 'better-sqlite3';

/**
 * Persistent session row as stored in SQLite.
 */
export interface SessionRow {
  id: string;
  status: string;
  model: string;
  container_id: string | null;
  volume_name: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  history_json: string;
  context_summary: string | null;
}

/**
 * Fields accepted when creating a new session.
 */
export interface CreateSessionInput {
  id: string;
  model: string;
  containerId: string;
  volumeName?: string;
}

/**
 * Fields accepted when updating a session.
 */
export interface UpdateSessionInput {
  status?: string;
  containerId?: string | null;
  volumeName?: string | null;
  historyJson?: string;
  contextSummary?: string | null;
}

/**
 * SessionStore — CRUD operations for persisted sessions.
 *
 * Backed by SQLite via better-sqlite3. All operations are synchronous
 * (better-sqlite3 is sync) but wrapped in a clean API.
 */
export class SessionStore {
  private db: Database.Database;

  // Prepared statements (lazy-initialized)
  private stmtInsert!: Database.Statement;
  private stmtGetById!: Database.Statement;
  private stmtList!: Database.Statement;
  private stmtListActive!: Database.Statement;
  private stmtUpdate!: Database.Statement;
  private stmtDelete!: Database.Statement;
  private stmtUpdateActivity!: Database.Statement;
  private stmtUpdateHistory!: Database.Statement;
  private stmtCount!: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStatements();
  }

  private prepareStatements(): void {
    this.stmtInsert = this.db.prepare(`
      INSERT INTO sessions (id, status, model, container_id, volume_name, created_at, updated_at, last_active_at, history_json, context_summary)
      VALUES (@id, @status, @model, @container_id, @volume_name, @created_at, @updated_at, @last_active_at, @history_json, @context_summary)
    `);

    this.stmtGetById = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`);

    this.stmtList = this.db.prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`);

    this.stmtListActive = this.db.prepare(
      `SELECT * FROM sessions WHERE status NOT IN ('terminated') ORDER BY updated_at DESC`,
    );

    this.stmtUpdate = this.db.prepare(`
      UPDATE sessions SET status = @status, container_id = @container_id, volume_name = @volume_name,
                          updated_at = @updated_at
      WHERE id = @id
    `);

    this.stmtDelete = this.db.prepare(`DELETE FROM sessions WHERE id = ?`);

    this.stmtUpdateActivity = this.db.prepare(`
      UPDATE sessions SET last_active_at = @last_active_at, updated_at = @updated_at WHERE id = @id
    `);

    this.stmtUpdateHistory = this.db.prepare(`
      UPDATE sessions SET history_json = @history_json, context_summary = @context_summary, updated_at = @updated_at WHERE id = @id
    `);

    this.stmtCount = this.db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE status NOT IN ('terminated')`);
  }

  /**
   * Create a new session record.
   */
  create(input: CreateSessionInput): SessionRow {
    const now = new Date().toISOString();
    const row: SessionRow = {
      id: input.id,
      status: 'ready',
      model: input.model,
      container_id: input.containerId,
      volume_name: input.volumeName ?? null,
      created_at: now,
      updated_at: now,
      last_active_at: now,
      history_json: '[]',
      context_summary: null,
    };

    this.stmtInsert.run(row);
    return row;
  }

  /**
   * Get a session by ID. Returns undefined if not found.
   */
  get(id: string): SessionRow | undefined {
    return this.stmtGetById.get(id) as SessionRow | undefined;
  }

  /**
   * List all sessions, ordered by updated_at DESC.
   */
  list(): SessionRow[] {
    return this.stmtList.all() as SessionRow[];
  }

  /**
   * List active (non-terminated) sessions.
   */
  listActive(): SessionRow[] {
    return this.stmtListActive.all() as SessionRow[];
  }

  /**
   * Update session metadata (status, container_id, volume_name).
   */
  update(id: string, input: UpdateSessionInput): boolean {
    const existing = this.get(id);
    if (!existing) return false;

    const now = new Date().toISOString();

    this.stmtUpdate.run({
      id,
      status: input.status ?? existing.status,
      container_id: input.containerId !== undefined ? input.containerId : existing.container_id,
      volume_name: input.volumeName !== undefined ? input.volumeName : existing.volume_name,
      updated_at: now,
    });

    return true;
  }

  /**
   * Update the conversation history for a session.
   */
  updateHistory(id: string, historyJson: string, contextSummary: string | null): boolean {
    const now = new Date().toISOString();
    const result = this.stmtUpdateHistory.run({
      id,
      history_json: historyJson,
      context_summary: contextSummary,
      updated_at: now,
    });
    return result.changes > 0;
  }

  /**
   * Touch last_active_at timestamp.
   */
  touchActivity(id: string): boolean {
    const now = new Date().toISOString();
    const result = this.stmtUpdateActivity.run({
      id,
      last_active_at: now,
      updated_at: now,
    });
    return result.changes > 0;
  }

  /**
   * Delete a session record.
   */
  delete(id: string): boolean {
    const result = this.stmtDelete.run(id);
    return result.changes > 0;
  }

  /**
   * Mark a session as terminated (soft delete — keeps the record).
   */
  terminate(id: string): boolean {
    return this.update(id, { status: 'terminated', containerId: null });
  }

  /**
   * Count active (non-terminated) sessions.
   */
  countActive(): number {
    const row = this.stmtCount.get() as { count: number };
    return row.count;
  }
}
