// @forge/server — Forge agent server

export { ContainerManager } from './sandbox/index.js';
export type {
  CreateContainerOptions,
  ContainerInfo,
  ContainerStatus,
  HealthResult,
  HealthCheck,
  ExecOptions,
  ExecResult,
} from './sandbox/index.js';

export { ToolRegistry } from './tools/index.js';
export type { ToolSpec, ToolHandler, ToolContext, ToolExecResult } from './tools/index.js';
export { registerBuiltinTools } from './tools/index.js';

export { createProvider } from './llm/index.js';

export { AgentLoop, buildSystemPrompt } from './agent/index.js';
export type { SessionContext, AgentEvent, AgentEventType } from './agent/index.js';

export { createApp, startServer } from './server/index.js';
export type { SessionState, CreateAppOptions } from './server/index.js';

export { openDatabase, getDefaultDbPath, SessionStore, SettingsStore, KnowledgeStore, SessionHistoryStore, RepoMapStore, SecretsStore, CheckpointStore } from './db/index.js';
export type { SessionRow, CreateSessionInput, UpdateSessionInput, ServerSettings, KnowledgeNoteRow, CreateNoteInput, SessionHistoryRow, CreateHistoryInput, RepoMapRow, SecretRow, CheckpointRow } from './db/index.js';

export { KnowledgeInjector, RulesLoader, RepoMapGenerator, NoteSuggester, CheckpointManager, SelectiveRetention, CIMonitor } from './knowledge/index.js';
export type { KnowledgeContext, KnowledgeInjectorDeps, LoadedRule, RepoMapData, SuggestedNote, CheckpointData, RetentionPriority, CIRunStatus, CICheckResult } from './knowledge/index.js';

export {
  BlueprintSchema,
  parseBlueprint,
  loadBlueprint,
  computeHash,
  snapshotImageTag,
  SnapshotBuilder,
} from './snapshot/index.js';
export type {
  Blueprint,
  BlueprintRepo,
  BlueprintResources,
  ParseResult,
  BuildProgress,
  ProgressCallback,
  BuildOptions,
  BuildResult,
  StepResult,
  SnapshotInfo,
  SnapshotDetail,
} from './snapshot/index.js';
