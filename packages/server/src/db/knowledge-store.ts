import type Database from 'better-sqlite3';

/**
 * Knowledge note row as stored in SQLite.
 */
export interface KnowledgeNoteRow {
  id: string;
  content: string;
  tags: string; // JSON array
  repo_scope: string;
  source: 'user' | 'auto';
  created_at: string;
  last_used_at: string | null;
}

/**
 * Fields accepted when creating a knowledge note.
 */
export interface CreateNoteInput {
  content: string;
  tags?: string[];
  repoScope?: string;
  source?: 'user' | 'auto';
}

/**
 * KnowledgeStore — CRUD operations for persistent knowledge notes.
 *
 * Notes are keyed by UUID, scoped to a repo (or 'global'), and
 * tagged for keyword-based relevance matching.
 */
export class KnowledgeStore {
  private db: Database.Database;
  private stmtInsert!: Database.Statement;
  private stmtGetById!: Database.Statement;
  private stmtList!: Database.Statement;
  private stmtListByRepo!: Database.Statement;
  private stmtDelete!: Database.Statement;
  private stmtSearch!: Database.Statement;
  private stmtTouchUsed!: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStatements();
  }

  private prepareStatements(): void {
    this.stmtInsert = this.db.prepare(`
      INSERT INTO knowledge_notes (id, content, tags, repo_scope, source, created_at, last_used_at)
      VALUES (@id, @content, @tags, @repo_scope, @source, @created_at, @last_used_at)
    `);

    this.stmtGetById = this.db.prepare(`SELECT * FROM knowledge_notes WHERE id = ?`);

    this.stmtList = this.db.prepare(`SELECT * FROM knowledge_notes ORDER BY created_at DESC`);

    this.stmtListByRepo = this.db.prepare(
      `SELECT * FROM knowledge_notes WHERE repo_scope = ? OR repo_scope = 'global' ORDER BY created_at DESC`,
    );

    this.stmtDelete = this.db.prepare(`DELETE FROM knowledge_notes WHERE id = ?`);

    this.stmtSearch = this.db.prepare(
      `SELECT * FROM knowledge_notes WHERE (repo_scope = @repo OR repo_scope = 'global')
       AND (content LIKE @query OR tags LIKE @query)
       ORDER BY last_used_at DESC NULLS LAST, created_at DESC
       LIMIT @limit`,
    );

    this.stmtTouchUsed = this.db.prepare(
      `UPDATE knowledge_notes SET last_used_at = @last_used_at WHERE id = @id`,
    );
  }

  /**
   * Create a new knowledge note.
   */
  create(input: CreateNoteInput): KnowledgeNoteRow {
    const now = new Date().toISOString();
    const row: KnowledgeNoteRow = {
      id: `note_${crypto.randomUUID().slice(0, 8)}`,
      content: input.content,
      tags: JSON.stringify(input.tags ?? []),
      repo_scope: input.repoScope ?? 'global',
      source: input.source ?? 'user',
      created_at: now,
      last_used_at: null,
    };

    this.stmtInsert.run(row);
    return row;
  }

  /**
   * Get a note by ID.
   */
  get(id: string): KnowledgeNoteRow | undefined {
    return this.stmtGetById.get(id) as KnowledgeNoteRow | undefined;
  }

  /**
   * List all notes, ordered by created_at DESC.
   */
  list(): KnowledgeNoteRow[] {
    return this.stmtList.all() as KnowledgeNoteRow[];
  }

  /**
   * List notes for a specific repo (includes global notes).
   */
  listByRepo(repo: string): KnowledgeNoteRow[] {
    return this.stmtListByRepo.all(repo) as KnowledgeNoteRow[];
  }

  /**
   * Search notes by keyword within a repo scope.
   */
  search(repo: string, query: string, limit: number = 20): KnowledgeNoteRow[] {
    return this.stmtSearch.all({
      repo,
      query: `%${query}%`,
      limit,
    }) as KnowledgeNoteRow[];
  }

  /**
   * Delete a note by ID.
   */
  delete(id: string): boolean {
    const result = this.stmtDelete.run(id);
    return result.changes > 0;
  }

  /**
   * Mark a note as recently used (updates last_used_at).
   */
  touchUsed(id: string): boolean {
    const now = new Date().toISOString();
    const result = this.stmtTouchUsed.run({ id, last_used_at: now });
    return result.changes > 0;
  }

  /**
   * Find relevant notes for a given repo and task keywords.
   * Returns notes scored by keyword match frequency.
   */
  findRelevant(repo: string, keywords: string[], limit: number = 10): KnowledgeNoteRow[] {
    // Get all notes for this repo scope (including global)
    const candidates = this.listByRepo(repo);
    if (candidates.length === 0 || keywords.length === 0) return candidates.slice(0, limit);

    // Score each note by keyword hits
    const scored = candidates.map((note) => {
      const text = (note.content + ' ' + note.tags).toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) score += 10;
      }

      // Boost recently used notes
      if (note.last_used_at) {
        const daysSinceUsed =
          (Date.now() - new Date(note.last_used_at).getTime()) / (1000 * 60 * 60 * 24);
        score *= Math.exp(-daysSinceUsed / 30);
      }

      return { note, score };
    });

    // Sort by score descending, return top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.note);
  }
}
