import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import * as yaml from 'js-yaml';

// --- Zod Schema for environment.yaml ---

const RepoSchema = z.object({
  url: z.string().url().describe('HTTPS clone URL'),
  path: z.string().describe('Absolute container path (e.g., /workspace/repo)'),
  branch: z.string().optional().describe('Branch to checkout (defaults to default branch)'),
});

const ResourcesSchema = z.object({
  cpu: z.union([z.string(), z.number()]).optional().describe('CPU cores'),
  memory: z.string().optional().describe('Memory (e.g., "4GB")'),
  disk: z.string().optional().describe('Disk space (e.g., "10GB")'),
});

export const BlueprintSchema = z.object({
  name: z.string().min(1).describe('Human-readable snapshot name'),
  base: z
    .string()
    .optional()
    .default('forge-sandbox:base')
    .describe('Base Docker image'),
  repos: z.array(RepoSchema).optional().default([]).describe('Git repositories to clone'),
  setup: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Shell commands to run in order'),
  tools: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Additional tools/languages to install'),
  env: z
    .record(z.string(), z.string())
    .optional()
    .default({})
    .describe('Environment variables to bake into image'),
  health_check: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Commands that must all exit 0 for snapshot validation'),
  resources: ResourcesSchema.optional().describe('Resource hints'),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
export type BlueprintRepo = z.infer<typeof RepoSchema>;
export type BlueprintResources = z.infer<typeof ResourcesSchema>;

// --- Parsing ---

export interface ParseResult {
  blueprint: Blueprint;
  hash: string;
  rawYaml: string;
}

/**
 * Parse and validate an environment.yaml string.
 * Returns the typed blueprint, SHA-256 hash, and raw YAML.
 */
export function parseBlueprint(rawYaml: string): ParseResult {
  const parsed = yaml.load(rawYaml);
  if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
    throw new Error('Invalid YAML: expected a mapping/object at the top level');
  }
  const blueprint = BlueprintSchema.parse(parsed);
  const hash = computeHash(rawYaml);
  return { blueprint, hash, rawYaml };
}

/**
 * Load and parse an environment.yaml file from disk.
 */
export async function loadBlueprint(filePath: string): Promise<ParseResult> {
  const rawYaml = await readFile(filePath, 'utf-8');
  return parseBlueprint(rawYaml);
}

/**
 * Compute the SHA-256 hash of the raw YAML content (used as cache key).
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Generate the Docker image tag for a snapshot.
 * Format: forge-snapshot:{name}-{hash[:12]}
 */
export function snapshotImageTag(name: string, hash: string): string {
  const safeName = name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return `forge-snapshot:${safeName}-${hash.slice(0, 12)}`;
}
