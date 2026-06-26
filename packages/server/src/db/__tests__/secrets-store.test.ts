import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.js';
import { SecretsStore } from '../secrets-store.js';
import type Database from 'better-sqlite3';

describe('SecretsStore', () => {
  let db: Database.Database;
  let store: SecretsStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new SecretsStore(db);
  });

  describe('set', () => {
    it('should create a secret', () => {
      const secret = store.set('/my-app', 'API_KEY', 'sk-test-123');
      assert.equal(secret.repo, '/my-app');
      assert.equal(secret.key, 'API_KEY');
      assert.equal(secret.value, 'sk-test-123');
      assert.ok(secret.created_at);
    });

    it('should update an existing secret', () => {
      store.set('/my-app', 'API_KEY', 'old-value');
      store.set('/my-app', 'API_KEY', 'new-value');

      const secret = store.get('/my-app', 'API_KEY');
      assert.ok(secret);
      assert.equal(secret.value, 'new-value');
    });
  });

  describe('get', () => {
    it('should retrieve a secret by repo and key', () => {
      store.set('/my-app', 'DB_PASSWORD', 'secret123');
      const secret = store.get('/my-app', 'DB_PASSWORD');
      assert.ok(secret);
      assert.equal(secret.value, 'secret123');
    });

    it('should return undefined for non-existent secret', () => {
      assert.equal(store.get('/my-app', 'NONEXISTENT'), undefined);
    });
  });

  describe('delete', () => {
    it('should delete a secret', () => {
      store.set('/my-app', 'KEY', 'value');
      const deleted = store.delete('/my-app', 'KEY');
      assert.equal(deleted, true);
      assert.equal(store.get('/my-app', 'KEY'), undefined);
    });

    it('should return false for non-existent secret', () => {
      assert.equal(store.delete('/my-app', 'NONEXISTENT'), false);
    });
  });

  describe('listByRepo', () => {
    it('should list all secrets for a repo', () => {
      store.set('/my-app', 'KEY_A', 'val_a');
      store.set('/my-app', 'KEY_B', 'val_b');
      store.set('/other', 'KEY_C', 'val_c');

      const secrets = store.listByRepo('/my-app');
      assert.equal(secrets.length, 2);
      assert.equal(secrets[0]!.key, 'KEY_A');
      assert.equal(secrets[1]!.key, 'KEY_B');
    });
  });

  describe('getEnvMap', () => {
    it('should return key-value map for container injection', () => {
      store.set('/my-app', 'API_KEY', 'sk-123');
      store.set('/my-app', 'DB_URL', 'postgres://localhost');

      const envMap = store.getEnvMap('/my-app');
      assert.equal(envMap['API_KEY'], 'sk-123');
      assert.equal(envMap['DB_URL'], 'postgres://localhost');
    });

    it('should return empty map when no secrets exist', () => {
      const envMap = store.getEnvMap('/empty');
      assert.deepEqual(envMap, {});
    });
  });

  describe('deleteAllForRepo', () => {
    it('should delete all secrets for a repo', () => {
      store.set('/my-app', 'KEY_1', 'val1');
      store.set('/my-app', 'KEY_2', 'val2');
      store.set('/other', 'KEY_3', 'val3');

      const count = store.deleteAllForRepo('/my-app');
      assert.equal(count, 2);
      assert.equal(store.listByRepo('/my-app').length, 0);
      assert.equal(store.listByRepo('/other').length, 1);
    });
  });
});
