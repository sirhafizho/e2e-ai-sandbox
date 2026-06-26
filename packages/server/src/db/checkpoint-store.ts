import type Database from 'better-sqlite3';

/**
 * Checkpoint row as stored in SQLite.
 */
export interface CheckpointRow {
  checkpoint_id: string;
  session_id: string;
  data: string; // JSON string
  created_at: string;
}

/**
 * CheckpointStore — context snapshots for agent loop resume.
 *
 * When the agent hits token budget emergency (95%+), it saves
 * a checkpoint with task state, todo list, and progress summary.
 * On resume, the checkpoint is loaded to restore context.
 */
export class CheckpointStore {
  private db: Database.Database;
  private stmtInsert!: Database.Statement;
  private stmtGetById!: Database.Statement;
  private stmtGetLatest!: Database.Statement;
  private stmtListBySession!: Database.Statement;
  private stmtDelete!: Database.Statement;
  private stmtDeleteBySession!: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStatements();
  }

  private prepareStatements(): void {
    this.stmtInsert = this.db.prepare(`
      INSERT INTO checkpoints (checkpoint_id, session_id, data, created_at)
      VALUES (@checkpoint_id, @session_id, @data, @created_at)
    `);

    this.stmtGetById = this.db.prepare(`SELECT * FROM checkpoints WHERE checkpoint_id = ?`);

    this.stmtGetLatest = this.db.prepare(
      `SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`,
    );

    this.stmtListBySession = this.db.prepare(
      `SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at DESC`,
    );

    this.stmtDelete = this.db.prepare(`DELETE FROM checkpoints WHERE checkpoint_id = ?`);

    this.stmtDeleteBySession = this.db.prepare(
      `DELETE FROM checkpoints WHERE session_id = ?`,
    );
  }

  /**
   * Save a checkpoint.
   */
  save(sessionId: string, data: string): CheckpointRow {
    const now = new Date().toISOString();
    const row: CheckpointRow = {
      checkpoint_id: `cp_${crypto.randomUUID().slice(0, 8)}`,
      session_id: sessionId,
      data,
      created_at: now,
    };
    this.stmtInsert.run(row);
    return row;
  }

  /**
   * Get a checkpoint by ID.
   */
  get(checkpointId: string): CheckpointRow | undefined {
    return this.stmtGetById.get(checkpointId) as CheckpointRow | undefined;
  }

  /**
   * Get the latest checkpoint for a session.
   */
  getLatest(sessionId: string): CheckpointRow | undefined {
    return this.stmtGetLatest.get(sessionId) as CheckpointRow | undefined;
  }

  /**
   * List all checkpoints for a session.
   */
  listBySession(sessionId: string): CheckpointRow[] {
    return this.stmtListBySession.all(sessionId) as CheckpointRow[];
  }

  /**
   * Delete a checkpoint.
   */
  delete(checkpointId: string): boolean {
    const result = this.stmtDelete.run(checkpointId);
    return result.changes > 0;
  }

  /**
   * Delete all checkpoints for a session.
   */
  deleteBySession(sessionId: string): number {
    const result = this.stmtDeleteBySession.run(sessionId);
    return result.changes;
  }
}
