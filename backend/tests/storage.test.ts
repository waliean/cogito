// ============================================================
// storage.test.ts —— 原子写、损坏恢复、读写往返
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetForTest, getState, mutate } from '../src/services/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const TEST_DATA_DIR = process.env.DATA_DIR || resolve(__dirname, '..', 'data');
const TEST_DB = resolve(TEST_DATA_DIR, 'db.json');
const TEST_TMP = resolve(TEST_DATA_DIR, 'db.json.tmp');

function cleanup() {
  for (const f of [TEST_DB, TEST_TMP]) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch { /* ignore */ }
  }
}

beforeEach(() => {
  cleanup();
  resetForTest();
});

afterEach(() => {
  cleanup();
  resetForTest();
});

describe('storage', () => {
  it('should create initial db.json on first load', () => {
    const db = getState();
    expect(db.version).toBe(1);
    expect(db.workspaces).toEqual([]);
    expect(db.cards).toEqual([]);
    expect(db.documents).toEqual([]);
    expect(db.settings.model).toBe('deepseek-v4-flash');
    expect(existsSync(TEST_DB)).toBe(true);
  });

  it('should persist data via mutate', async () => {
    await mutate((db) => {
      db.workspaces.push({
        id: 'ws-1',
        name: 'Test',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    // Reset memory and reload
    resetForTest();
    const db2 = getState();
    expect(db2.workspaces).toHaveLength(1);
    expect(db2.workspaces[0].name).toBe('Test');
  });

  it('should serialize writes (write queue)', async () => {
    const results: number[] = [];

    await Promise.all([
      mutate((db) => {
        db.workspaces.push({
          id: 'ws-a',
          name: 'A',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
        results.push(1);
      }),
      mutate((db) => {
        db.workspaces.push({
          id: 'ws-b',
          name: 'B',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
        results.push(2);
      }),
    ]);

    // Both should have run
    expect(results.length).toBe(2);

    resetForTest();
    const db = getState();
    expect(db.workspaces).toHaveLength(2);
  });

  it('should recover from corrupted db.json', () => {
    // Write garbage
    writeFileSync(TEST_DB, 'not valid json {{{', 'utf-8');

    resetForTest();
    const db = getState();

    // Should recover to initial state
    expect(db.version).toBe(1);
    expect(db.workspaces).toEqual([]);

    // Check .bak was created
    const files = readdirSync(TEST_DATA_DIR);
    const bakFiles = files.filter((f: string) => f.startsWith('db.json.corrupted-'));
    expect(bakFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle atomic write: file exists after write', async () => {
    await mutate((db) => {
      db.workspaces.push({
        id: 'ws-atomic',
        name: 'Atomic',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    const raw = readFileSync(TEST_DB, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.workspaces[0].name).toBe('Atomic');
  });

  it('should not leave tmp file after write', async () => {
    await mutate((db) => {
      db.workspaces.push({
        id: 'ws-tmp',
        name: 'Tmp',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    expect(existsSync(TEST_TMP)).toBe(false);
  });
});