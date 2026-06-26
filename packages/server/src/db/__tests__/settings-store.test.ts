import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.js';
import { SettingsStore } from '../settings-store.js';
import type Database from 'better-sqlite3';

describe('SettingsStore', () => {
  let db: Database.Database;
  let store: SettingsStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new SettingsStore(db);
  });

  describe('getAll', () => {
    it('should return defaults when no settings exist', () => {
      const settings = store.getAll();
      assert.equal(settings.provider.type, 'ollama');
      assert.equal(settings.provider.model, 'qwen2.5-coder:7b');
      assert.equal(settings.provider.base_url, 'http://localhost:11434');
      assert.equal(settings.provider.api_key, '');
      assert.equal(settings.docker.image, 'forge-sandbox:base');
      assert.equal(settings.docker.cpuLimit, 2);
      assert.equal(settings.docker.memoryLimitGb, 4);
    });
  });

  describe('saveAll', () => {
    it('should save and retrieve provider settings', () => {
      store.saveAll({
        provider: {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: 'sk-test-key',
          model: 'gpt-4o',
        },
      });

      const settings = store.getAll();
      assert.equal(settings.provider.type, 'openai');
      assert.equal(settings.provider.base_url, 'https://api.openai.com/v1');
      assert.equal(settings.provider.api_key, 'sk-test-key');
      assert.equal(settings.provider.model, 'gpt-4o');
      // Docker should still be defaults
      assert.equal(settings.docker.image, 'forge-sandbox:base');
    });

    it('should save and retrieve docker settings', () => {
      store.saveAll({
        docker: {
          image: 'custom-image:latest',
          cpuLimit: 4,
          memoryLimitGb: 8,
        },
      });

      const settings = store.getAll();
      assert.equal(settings.docker.image, 'custom-image:latest');
      assert.equal(settings.docker.cpuLimit, 4);
      assert.equal(settings.docker.memoryLimitGb, 8);
      // Provider should still be defaults
      assert.equal(settings.provider.type, 'ollama');
    });

    it('should save both provider and docker settings', () => {
      const result = store.saveAll({
        provider: {
          type: 'anthropic',
          base_url: 'https://api.anthropic.com',
          api_key: 'sk-ant-test',
          model: 'claude-sonnet-4-20250514',
        },
        docker: {
          image: 'forge-sandbox:custom',
          cpuLimit: 8,
          memoryLimitGb: 16,
        },
      });

      assert.equal(result.provider.type, 'anthropic');
      assert.equal(result.docker.cpuLimit, 8);

      // Verify persistence
      const settings = store.getAll();
      assert.equal(settings.provider.type, 'anthropic');
      assert.equal(settings.docker.cpuLimit, 8);
    });

    it('should merge partial provider updates with existing values', () => {
      store.saveAll({
        provider: {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: 'sk-key-1',
          model: 'gpt-4o',
        },
      });

      // Partial update — only change model
      store.saveAll({
        provider: {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: 'sk-key-1',
          model: 'gpt-4o-mini',
        },
      });

      const settings = store.getAll();
      assert.equal(settings.provider.model, 'gpt-4o-mini');
      assert.equal(settings.provider.api_key, 'sk-key-1');
    });

    it('should return the saved settings', () => {
      const result = store.saveAll({
        provider: {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: 'sk-test',
          model: 'gpt-4o',
        },
      });

      assert.equal(result.provider.type, 'openai');
      assert.equal(result.provider.model, 'gpt-4o');
      // Docker defaults should be included
      assert.equal(result.docker.image, 'forge-sandbox:base');
    });
  });

  describe('persistence', () => {
    it('should survive SettingsStore re-creation on same DB', () => {
      store.saveAll({
        provider: {
          type: 'anthropic',
          base_url: 'https://api.anthropic.com',
          api_key: 'sk-ant-key',
          model: 'claude-sonnet-4-20250514',
        },
      });

      // Create a new SettingsStore on the same DB
      const store2 = new SettingsStore(db);
      const settings = store2.getAll();
      assert.equal(settings.provider.type, 'anthropic');
      assert.equal(settings.provider.api_key, 'sk-ant-key');
    });
  });
});
