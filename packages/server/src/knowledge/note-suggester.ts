import type { KnowledgeStore } from '../db/knowledge-store.js';

/**
 * A suggested knowledge note (pending user approval).
 */
export interface SuggestedNote {
  content: string;
  tags: string[];
  repoScope: string;
  confidence: number; // 0.0 - 1.0
  reason: string;
}

/**
 * Patterns to detect in conversation history for auto-suggestion.
 */
interface PatternMatcher {
  name: string;
  /** Regex patterns to search for in messages. */
  patterns: RegExp[];
  /** Tags to assign to the resulting note. */
  tags: string[];
  /** Minimum number of matches required. */
  minMatches: number;
  /** Confidence score for this pattern type. */
  confidence: number;
}

const PATTERN_MATCHERS: PatternMatcher[] = [
  {
    name: 'repeated_correction',
    patterns: [
      /(?:should|must|always|remember to|don't forget to|make sure to)\s+(.+)/gi,
      /(?:no,?\s+)?(?:use|prefer)\s+(\w+)\s+(?:instead of|over|not)\s+(\w+)/gi,
    ],
    tags: ['preference', 'correction'],
    minMatches: 2,
    confidence: 0.8,
  },
  {
    name: 'file_discovery',
    patterns: [
      /(?:found|located|lives|is at|see)\s+(?:in|at)\s+[`"]?([/\w.-]+\.\w+)[`"]?/gi,
      /(?:the|this)\s+(\w+(?:\s+\w+)?)\s+(?:is in|lives in|located at)\s+[`"]?([/\w.-]+)[`"]?/gi,
    ],
    tags: ['codebase', 'location'],
    minMatches: 1,
    confidence: 0.6,
  },
  {
    name: 'tool_preference',
    patterns: [
      /(?:uses?|prefer|chose|selected|adopted)\s+([\w.-]+)\s+(?:for|as|instead)\s+/gi,
      /(?:this project|codebase|repo)\s+(?:uses?|relies on)\s+([\w.-]+)/gi,
    ],
    tags: ['architecture', 'tools'],
    minMatches: 1,
    confidence: 0.7,
  },
  {
    name: 'build_command',
    patterns: [
      /(?:build|test|lint|format|deploy)\s+(?:with|using|via|command)[:.]?\s*[`"]?(.+)[`"]?/gi,
      /run\s+[`"]?((?:npm|pnpm|yarn|cargo|make|go)\s+\w+(?:\s+\w+)?)[`"]?/gi,
    ],
    tags: ['commands', 'workflow'],
    minMatches: 1,
    confidence: 0.7,
  },
];

/**
 * NoteSuggester — analyzes session conversations to propose knowledge notes.
 *
 * After a session ends, this module scans the conversation for patterns
 * like repeated corrections, file discoveries, tool preferences, and
 * build commands. Suggested notes require user approval before persisting.
 */
export class NoteSuggester {
  private knowledgeStore?: KnowledgeStore;

  constructor(knowledgeStore?: KnowledgeStore) {
    this.knowledgeStore = knowledgeStore;
  }

  /**
   * Analyze conversation messages and suggest knowledge notes.
   */
  suggest(
    messages: Array<{ role: string; content: string }>,
    repoScope: string = 'global',
  ): SuggestedNote[] {
    const allText = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => m.content)
      .join('\n');

    const suggestions: SuggestedNote[] = [];

    for (const matcher of PATTERN_MATCHERS) {
      const matches: string[] = [];

      for (const pattern of matcher.patterns) {
        // Reset regex state
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(allText)) !== null) {
          matches.push(match[0]);
        }
      }

      if (matches.length >= matcher.minMatches) {
        // Deduplicate similar matches
        const uniqueMatches = [...new Set(matches.map((m) => m.trim()))];
        const content = this.buildNoteContent(matcher.name, uniqueMatches);

        if (content && !this.isDuplicate(content, repoScope)) {
          suggestions.push({
            content,
            tags: matcher.tags,
            repoScope,
            confidence: Math.min(1.0, matcher.confidence + (uniqueMatches.length - 1) * 0.05),
            reason: `Detected ${matcher.name.replace(/_/g, ' ')} pattern (${uniqueMatches.length} match${uniqueMatches.length > 1 ? 'es' : ''})`,
          });
        }
      }
    }

    // Sort by confidence DESC
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions.slice(0, 5); // Max 5 suggestions per session
  }

  /**
   * Persist an approved suggestion as a knowledge note.
   */
  approve(suggestion: SuggestedNote): boolean {
    if (!this.knowledgeStore) return false;

    this.knowledgeStore.create({
      content: suggestion.content,
      tags: suggestion.tags,
      repoScope: suggestion.repoScope,
      source: 'auto',
    });

    return true;
  }

  private buildNoteContent(patternName: string, matches: string[]): string | null {
    const topMatches = matches.slice(0, 3);

    switch (patternName) {
      case 'repeated_correction':
        return topMatches.join('. ').replace(/\s+/g, ' ').trim();
      case 'file_discovery':
        return `Key files: ${topMatches.join(', ')}`;
      case 'tool_preference':
        return topMatches.join('. ').replace(/\s+/g, ' ').trim();
      case 'build_command':
        return `Build commands: ${topMatches.join('; ')}`;
      default:
        return topMatches.join('. ');
    }
  }

  private isDuplicate(content: string, repoScope: string): boolean {
    if (!this.knowledgeStore) return false;

    const existing = this.knowledgeStore.listByRepo(repoScope);
    const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ');

    return existing.some((note) => {
      const normalizedNote = note.content.toLowerCase().replace(/\s+/g, ' ');
      // Check for significant overlap
      return (
        normalizedNote.includes(normalizedContent) ||
        normalizedContent.includes(normalizedNote) ||
        this.similarity(normalizedNote, normalizedContent) > 0.8
      );
    });
  }

  /** Simple Jaccard similarity between two strings (word-level). */
  private similarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0;
  }
}
