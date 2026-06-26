import type { KnowledgeStore, KnowledgeNoteRow } from '../db/knowledge-store.js';
import type { SessionHistoryStore } from '../db/session-history-store.js';
import type { RepoMapStore } from '../db/repo-map-store.js';
import type { ContainerManager } from '../sandbox/container-manager.js';
import { RulesLoader, type LoadedRule } from './rules-loader.js';

/** Maximum number of knowledge notes to inject into context. */
const MAX_INJECTED_NOTES = 10;

/**
 * Assembled knowledge context ready for injection into the system prompt.
 */
export interface KnowledgeContext {
  /** Matched knowledge notes for this repo/task. */
  notes: KnowledgeNoteRow[];
  /** Loaded rules from workspace files. */
  rules: LoadedRule[];
  /** Summary of the most recent session for this repo. */
  lastSessionSummary: string | null;
  /** Cached repo map (structured overview). */
  repoMap: string | null;
}

export interface KnowledgeInjectorDeps {
  knowledgeStore?: KnowledgeStore;
  sessionHistoryStore?: SessionHistoryStore;
  repoMapStore?: RepoMapStore;
  containerManager?: ContainerManager;
}

/**
 * KnowledgeInjector — assembles relevant context from knowledge stores
 * and workspace rules, then formats it for injection into the agent's
 * system prompt.
 *
 * This is the central coordination point for Phase 4's context injection.
 */
export class KnowledgeInjector {
  private knowledgeStore?: KnowledgeStore;
  private sessionHistoryStore?: SessionHistoryStore;
  private repoMapStore?: RepoMapStore;
  private containerManager?: ContainerManager;
  private rulesLoader: RulesLoader;

  constructor(deps: KnowledgeInjectorDeps) {
    this.knowledgeStore = deps.knowledgeStore;
    this.sessionHistoryStore = deps.sessionHistoryStore;
    this.repoMapStore = deps.repoMapStore;
    this.containerManager = deps.containerManager;
    this.rulesLoader = new RulesLoader();
  }

  /**
   * Gather all relevant knowledge for a session.
   */
  async gather(
    containerId: string | null,
    repo: string | null,
    taskKeywords: string[] = [],
  ): Promise<KnowledgeContext> {
    const [notes, rules, lastSessionSummary, repoMap] = await Promise.all([
      this.gatherNotes(repo, taskKeywords),
      this.gatherRules(containerId),
      this.gatherSessionHistory(repo),
      this.gatherRepoMap(repo),
    ]);

    return { notes, rules, lastSessionSummary, repoMap };
  }

  /**
   * Format gathered knowledge context as a string for system prompt injection.
   */
  format(context: KnowledgeContext): string {
    const sections: string[] = [];

    // Rules (always retained, never evicted)
    if (context.rules.length > 0) {
      sections.push(this.rulesLoader.formatForPrompt(context.rules));
    }

    // Knowledge notes (high priority)
    if (context.notes.length > 0) {
      const notesText = context.notes
        .map((n) => {
          const tags = JSON.parse(n.tags) as string[];
          const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
          const scope = n.repo_scope === 'global' ? '' : ` (${n.repo_scope})`;
          return `- ${n.content}${tagStr}${scope}`;
        })
        .join('\n');
      sections.push(`## Knowledge Notes\n\n${notesText}`);
    }

    // Last session summary (medium priority)
    if (context.lastSessionSummary) {
      sections.push(`## Previous Session\n\n${context.lastSessionSummary}`);
    }

    // Repo map (medium priority)
    if (context.repoMap) {
      sections.push(`## Repository Structure\n\n${context.repoMap}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Convenience method: gather + format in one call.
   */
  async inject(
    containerId: string | null,
    repo: string | null,
    taskKeywords: string[] = [],
  ): Promise<string> {
    const context = await this.gather(containerId, repo, taskKeywords);
    return this.format(context);
  }

  private async gatherNotes(repo: string | null, keywords: string[]): Promise<KnowledgeNoteRow[]> {
    if (!this.knowledgeStore) return [];
    const effectiveRepo = repo ?? 'global';
    const notes = this.knowledgeStore.findRelevant(effectiveRepo, keywords, MAX_INJECTED_NOTES);

    // Touch usage timestamps for injected notes
    for (const note of notes) {
      this.knowledgeStore.touchUsed(note.id);
    }

    return notes;
  }

  private async gatherRules(containerId: string | null): Promise<LoadedRule[]> {
    if (!containerId || !this.containerManager) return [];
    return this.rulesLoader.loadRules(containerId, this.containerManager);
  }

  private async gatherSessionHistory(repo: string | null): Promise<string | null> {
    if (!this.sessionHistoryStore || !repo) return null;
    return this.sessionHistoryStore.getLastSummary(repo);
  }

  private async gatherRepoMap(repo: string | null): Promise<string | null> {
    if (!this.repoMapStore || !repo) return null;
    const map = this.repoMapStore.get(repo);
    if (!map) return null;

    try {
      const data = JSON.parse(map.map_data) as {
        tree?: string;
        key_exports?: string[];
        files_count?: number;
      };
      const parts: string[] = [];
      if (data.files_count) parts.push(`${data.files_count} files`);
      if (data.tree) parts.push(`\`\`\`\n${data.tree}\n\`\`\``);
      if (data.key_exports?.length) {
        parts.push(`Key exports: ${data.key_exports.join(', ')}`);
      }
      return parts.join('\n\n');
    } catch {
      return null;
    }
  }
}
