import type Database from 'better-sqlite3';

/**
 * Server settings as persisted in SQLite.
 */
export interface ServerSettings {
  provider: {
    type: 'ollama' | 'openai' | 'anthropic' | 'openai-compatible';
    base_url: string;
    api_key: string;
    model: string;
  };
  docker: {
    image: string;
    cpuLimit: number;
    memoryLimitGb: number;
  };
}

const DEFAULT_SETTINGS: ServerSettings = {
  provider: {
    type: 'ollama',
    base_url: 'http://localhost:11434',
    api_key: '',
    model: 'qwen2.5-coder:7b',
  },
  docker: {
    image: 'forge-sandbox:base',
    cpuLimit: 2,
    memoryLimitGb: 4,
  },
};

/**
 * SettingsStore — key-value configuration persistence.
 *
 * Stores server configuration in SQLite. Each top-level key
 * (provider, docker) is stored as a separate row with a JSON value.
 */
export class SettingsStore {
  private db: Database.Database;
  private stmtGet: Database.Statement;
  private stmtUpsert: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.stmtGet = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    this.stmtUpsert = this.db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, @updated_at)
      ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at
    `);
  }

  /**
   * Get all settings, merged with defaults for any missing keys.
   */
  getAll(): ServerSettings {
    const provider = this.getKey('provider');
    const docker = this.getKey('docker');
    return {
      provider: provider
        ? { ...DEFAULT_SETTINGS.provider, ...(JSON.parse(provider) as Partial<ServerSettings['provider']>) }
        : { ...DEFAULT_SETTINGS.provider },
      docker: docker
        ? { ...DEFAULT_SETTINGS.docker, ...(JSON.parse(docker) as Partial<ServerSettings['docker']>) }
        : { ...DEFAULT_SETTINGS.docker },
    };
  }

  /**
   * Save all settings (partial update — merges with existing).
   */
  saveAll(settings: Partial<ServerSettings>): ServerSettings {
    const current = this.getAll();
    const now = new Date().toISOString();

    if (settings.provider) {
      const merged = { ...current.provider, ...settings.provider };
      this.stmtUpsert.run({ key: 'provider', value: JSON.stringify(merged), updated_at: now });
      current.provider = merged;
    }
    if (settings.docker) {
      const merged = { ...current.docker, ...settings.docker };
      this.stmtUpsert.run({ key: 'docker', value: JSON.stringify(merged), updated_at: now });
      current.docker = merged;
    }

    return current;
  }

  /**
   * Get a single key's raw JSON value.
   */
  private getKey(key: string): string | undefined {
    const row = this.stmtGet.get(key) as { value: string } | undefined;
    return row?.value;
  }
}
