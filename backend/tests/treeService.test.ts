// ============================================================
// treeService.test.ts —— 一键生成完整图 BFS 增量扩展
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetForTest } from '../src/services/storage.js';
import { createWorkspace } from '../src/services/workspaceService.js';
import { createCard, getWorkspaceCards, getCard } from '../src/services/cardService.js';
import { generateChildCard } from '../src/services/aiService.js';
import { generateTree } from '../src/services/treeService.js';

// mock aiService.generateChildCard
vi.mock('../src/services/aiService.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/services/aiService.js')>();
  return {
    ...mod,
    generateChildCard: vi.fn(),
  };
});

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

const AI = {
  apiKey: 'sk-test',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  timeoutMs: 60000,
};

const AI_OK = {
  title: '子主题',
  content: '内容 术语X',
  terms: [{ term: '术语X', definition: '定义' }],
  model: 'deepseek-v4-flash',
  promptTokens: 50,
  completionTokens: 30,
  latencyMs: 500,
  retried: false,
};

describe('generateTree', () => {
  beforeEach(() => {
    vi.mocked(generateChildCard).mockReset();
  });

  it('success: depth=2, B=1, single root, creates linear chain', async () => {
    vi.mocked(generateChildCard).mockResolvedValue(AI_OK);
    const ws = await createWorkspace('Linear');
    const roots = getWorkspaceCards(ws.id).filter((c) => c.parentId === null);
    expect(roots).toHaveLength(1);

    const result = await generateTree(ws.id, { depth: 2, branchesPerNode: 1 }, AI);

    // depth=2, B=1: 根1子卡 + 子卡1孙卡 = 2
    expect(result.rootsProcessed).toBe(1);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.failures).toHaveLength(0);
  });

  it('success: depth=2, B=3, single root, creates children recursively', async () => {
    vi.mocked(generateChildCard).mockResolvedValue(AI_OK);
    const ws = await createWorkspace('TreeTest');
    const roots = getWorkspaceCards(ws.id).filter((c) => c.parentId === null);
    expect(roots).toHaveLength(1);

    const result = await generateTree(ws.id, { depth: 2, branchesPerNode: 3 }, AI);

    // Root has no children → generates 3 children at depth 1
    // Each of those children also has no children → generates 3 each at depth 2 = 9
    // Total: 3 + 9 = 12
    expect(result.rootsProcessed).toBe(1);
    expect(result.created).toBe(12);
    expect(result.skipped).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.failures).toHaveLength(0);
    expect(result.meta.model).toBe('deepseek-v4-flash');

    // Verify the created cards are children of root
    const allCards = getWorkspaceCards(ws.id);
    const rootCard = allCards.find((c) => c.parentId === null)!;
    const children = allCards.filter((c) => c.parentId === rootCard.id);
    expect(children).toHaveLength(3);
    for (const child of children) {
      expect(child.type).toBe('child');
      expect(child.status).toBe('done');
      expect(child.parentId).toBe(rootCard.id);
    }
  });

  it('skips roots that already have children', async () => {
    vi.mocked(generateChildCard).mockResolvedValue(AI_OK);
    const ws = await createWorkspace('TreeTest');
    const roots = getWorkspaceCards(ws.id).filter((c) => c.parentId === null);
    // Add a child to the root
    await createCard(ws.id, { parentId: roots[0].id, title: 'Existing', type: 'child' });

    const result = await generateTree(ws.id, { depth: 1, branchesPerNode: 2 }, AI);
    // Root has children → skipped → rootsProcessed=0（H1：只计非 skipped 根）
    expect(result.rootsProcessed).toBe(0);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('continues on single card failure and collects failures', async () => {
    const ws = await createWorkspace('TreeTest');
    const roots = getWorkspaceCards(ws.id).filter((c) => c.parentId === null);

    // First call fails, second succeeds
    vi.mocked(generateChildCard)
      .mockRejectedValueOnce(Object.assign(new Error('AI timeout'), { code: 'E_AI_TIMEOUT' }))
      .mockResolvedValue(AI_OK);

    const result = await generateTree(ws.id, { depth: 1, branchesPerNode: 2 }, AI);
    expect(result.created).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].parentId).toBe(roots[0].id);
    expect(result.failures[0].code).toBe('E_AI_TIMEOUT');
  });

  it('VALIDATION: no root cards', async () => {
    // Create workspace and delete its auto-created root card
    const ws = await createWorkspace('Empty');
    // Delete all cards to make it truly empty
    const { mutate } = await import('../src/services/storage.js');
    await mutate((db: any) => {
      db.cards = [];
    });

    await expect(
      generateTree(ws.id, { depth: 1, branchesPerNode: 2 }, AI),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' });
  });

  it('VALIDATION: depth out of range', async () => {
    const ws = await createWorkspace('DepthTest');

    await expect(
      generateTree(ws.id, { depth: 0, branchesPerNode: 2 }, AI),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' });

    await expect(
      generateTree(ws.id, { depth: 4, branchesPerNode: 2 }, AI),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' });

    await expect(
      generateTree(ws.id, { depth: 1.5, branchesPerNode: 2 }, AI),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' });
  });

  it('VALIDATION: branchesPerNode out of range', async () => {
    const ws = await createWorkspace('BranchTest');

    await expect(
      generateTree(ws.id, { depth: 1, branchesPerNode: 0 }, AI),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' });

    await expect(
      generateTree(ws.id, { depth: 1, branchesPerNode: 5 }, AI),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' });
  });

  it('VALIDATION: already at 50 cards', async () => {
    const ws = await createWorkspace('Full');
    // Add 49 more cards (1 already exists from workspace creation)
    for (let i = 0; i < 49; i++) {
      await createCard(ws.id, { title: `Card ${i}`, type: 'child', parentId: null });
    }

    const allCards = getWorkspaceCards(ws.id);
    expect(allCards).toHaveLength(50);

    await expect(
      generateTree(ws.id, { depth: 1, branchesPerNode: 1 }, AI),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' });
  });

  it('budget truncated: close to 50 cards', async () => {
    vi.mocked(generateChildCard).mockResolvedValue(AI_OK);
    const ws = await createWorkspace('Budget');
    // Add 48 cards, leaving room for 1 more (49 total, budget=1)
    for (let i = 0; i < 48; i++) {
      await createCard(ws.id, { title: `Card ${i}`, type: 'child', parentId: null });
    }

    const result = await generateTree(ws.id, { depth: 2, branchesPerNode: 3 }, AI);
    // Only 1 can be created due to budget
    expect(result.created).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('NOT_FOUND: non-existent workspace', async () => {
    await expect(
      generateTree('non-existent', { depth: 1, branchesPerNode: 2 }, AI),
    ).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
  });
});