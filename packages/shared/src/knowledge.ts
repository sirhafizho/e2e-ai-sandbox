import { z } from 'zod';

// Knowledge Notes

export const KnowledgeNoteSource = z.enum(['user', 'auto']);
export type KnowledgeNoteSource = z.infer<typeof KnowledgeNoteSource>;

export const KnowledgeNote = z.object({
  id: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  repo_scope: z.string(), // 'global' or repo path
  source: KnowledgeNoteSource,
  created_at: z.string(),
  last_used_at: z.string().nullable(),
});
export type KnowledgeNote = z.infer<typeof KnowledgeNote>;

export const CreateKnowledgeNoteInput = z.object({
  content: z.string().min(1, 'Content is required'),
  tags: z.array(z.string()).default([]),
  repo_scope: z.string().default('global'),
  source: KnowledgeNoteSource.default('user'),
});
export type CreateKnowledgeNoteInput = z.infer<typeof CreateKnowledgeNoteInput>;

// Session History

export const SessionHistoryEntry = z.object({
  session_id: z.string(),
  repo: z.string().nullable(),
  summary: z.string(),
  decisions_made: z.array(z.string()),
  files_modified: z.array(z.string()),
  errors_hit: z.array(z.string()),
  duration_seconds: z.number().int(),
  model_used: z.string(),
  created_at: z.string(),
});
export type SessionHistoryEntry = z.infer<typeof SessionHistoryEntry>;

// Repo Map

export const RepoMapEntry = z.object({
  repo: z.string(),
  map_data: z.string(), // JSON string of structured map
  file_hashes: z.string(), // JSON string of hash map
  generated_at: z.string(),
});
export type RepoMapEntry = z.infer<typeof RepoMapEntry>;

// Secrets

export const SecretEntry = z.object({
  repo: z.string(),
  key: z.string(),
  value: z.string(),
  created_at: z.string(),
});
export type SecretEntry = z.infer<typeof SecretEntry>;

// Checkpoint

export const Checkpoint = z.object({
  checkpoint_id: z.string(),
  session_id: z.string(),
  timestamp: z.string(),
  task: z.object({
    original_prompt: z.string(),
    current_subtask: z.string(),
  }),
  todo_list: z.array(z.object({ content: z.string(), status: z.string() })),
  key_discoveries: z.array(z.string()),
  files_modified: z.array(z.string()),
  files_read: z.array(z.string()),
  errors_encountered: z.array(z.string()),
  decisions_made: z.array(z.string()),
  summary: z.string(),
});
export type Checkpoint = z.infer<typeof Checkpoint>;
