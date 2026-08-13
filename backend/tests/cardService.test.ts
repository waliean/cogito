// ============================================================
// cardService.test.ts —— 卡片 CRUD、树、工作区关联
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetForTest } from '../src/services/storage.js';
import { createWorkspace, deleteWorkspace, getWorkspace, updateWorkspace } from '../src/services/workspaceService.js';
import {
  createCard,
  updateCard,
  deleteCard,
  getCard,
  getWorkspaceCards,
  getCardTree,
  getChildrenOf,
  generateCard,
} from '../src/services/cardService.js';
import { generateChildCard } from '../src/services/aiService.js';

// mock aiService.generateChildCard（生成编排单测隔离真实 SDK）
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

// ---- 辅助：创建工作区并返回 ----
async function setupWorkspace(name = 'Test WS') {
  return createWorkspace(name);
}

describe('cardService', () => {
  // ========== createCard ==========

  describe('createCard', () => {
    it('should create a root card with parentId=null', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'Root', type: 'child', parentId: null });
      expect(card.parentId).toBeNull();
      expect(card.workspaceId).toBe(ws.id);
      expect(card.type).toBe('child');
      expect(card.title).toBe('Root');
    });

    it('should create a child card under a parent', async () => {
      const ws = await setupWorkspace();
      const root = await createCard(ws.id, { title: 'Root', parentId: null });
      const child = await createCard(ws.id, { title: 'Child', type: 'child', parentId: root.id });
      expect(child.parentId).toBe(root.id);
    });

    it('should create divergent card under given parentId (simplified: no parent resolution)', async () => {
      const ws = await setupWorkspace();
      const root = await createCard(ws.id, { title: 'Root', parentId: null });
      const div = await createCard(ws.id, { title: 'Div', type: 'divergent', parentId: root.id });
      expect(div.parentId).toBe(root.id);
      expect(div.type).toBe('divergent');
    });

    it('should create branch card under given parentId (simplified: no parent resolution)', async () => {
      const ws = await setupWorkspace();
      const root = await createCard(ws.id, { title: 'Root', parentId: null });
      const branch = await createCard(ws.id, { title: 'Branch', type: 'branch', parentId: root.id });
      expect(branch.parentId).toBe(root.id);
      expect(branch.type).toBe('branch');
    });

    it('should reject invalid card type', async () => {
      const ws = await setupWorkspace();
      await expect(
        createCard(ws.id, { type: 'invalid' as any }),
      ).rejects.toMatchObject({ code: 'E_VALIDATION' });
    });

    it('should reject non-existent workspace', async () => {
      await expect(
        createCard('non-existent-ws', { type: 'child' }),
      ).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    });

    it('should reject non-existent parentId', async () => {
      const ws = await setupWorkspace();
      await expect(
        createCard(ws.id, { parentId: 'non-existent-card' }),
      ).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    });

    it('should reject cross-workspace parentId', async () => {
      const ws1 = await setupWorkspace('WS1');
      const ws2 = await setupWorkspace('WS2');
      const otherCard = await createCard(ws2.id, { title: 'Other', parentId: null });
      await expect(
        createCard(ws1.id, { parentId: otherCard.id }),
      ).rejects.toMatchObject({ code: 'E_VALIDATION' });
    });

    it('should allow divergent/branch under any card including root (simplified semantics)', async () => {
      const ws = await setupWorkspace();
      const root = await createCard(ws.id, { title: 'Root', parentId: null });
      const div = await createCard(ws.id, { title: 'Sibling', type: 'divergent', parentId: root.id });
      expect(div.parentId).toBe(root.id);
      // branch also allowed
      const br = await createCard(ws.id, { title: 'Branch2', type: 'branch', parentId: root.id });
      expect(br.parentId).toBe(root.id);
    });
  });

  // ========== updateCard ==========

  describe('updateCard', () => {
    it('should update title and content', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'Old', parentId: null });
      const updated = await updateCard(card.id, { title: 'New', content: 'New content' });
      expect(updated.title).toBe('New');
      expect(updated.content).toBe('New content');
      expect(updated.updatedAt).toBeDefined();
    });

    it('should update type', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'T', parentId: null });
      const updated = await updateCard(card.id, { type: 'divergent' });
      expect(updated.type).toBe('divergent');
    });

    it('should update terms', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'T', parentId: null });
      const terms = [{ term: 'React', definition: 'UI library' }];
      const updated = await updateCard(card.id, { terms });
      expect(updated.terms).toEqual(terms);
    });

    it('should update parentId (move card)', async () => {
      const ws = await setupWorkspace();
      const root = await createCard(ws.id, { title: 'Root', parentId: null });
      const child = await createCard(ws.id, { title: 'Child', parentId: root.id });
      const root2 = await createCard(ws.id, { title: 'Root2', parentId: null });
      const moved = await updateCard(child.id, { parentId: root2.id });
      expect(moved.parentId).toBe(root2.id);
    });

    it('should reject non-existent parentId on update', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'T', parentId: null });
      await expect(
        updateCard(card.id, { parentId: 'non-existent' }),
      ).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    });

    it('should reject invalid type on update', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'T', parentId: null });
      await expect(
        updateCard(card.id, { type: 'bad' as any }),
      ).rejects.toMatchObject({ code: 'E_VALIDATION' });
    });

    it('should reject non-existent card', async () => {
      await expect(
        updateCard('no-such-card', { title: 'X' }),
      ).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    });

    it('should reject self-referencing parentId', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'Self', parentId: null });
      await expect(
        updateCard(card.id, { parentId: card.id }),
      ).rejects.toMatchObject({ code: 'E_CONFLICT' });
    });

    it('should reject cycle (A->B->C, setting A.parentId=C.id)', async () => {
      const ws = await setupWorkspace();
      const a = await createCard(ws.id, { title: 'A', parentId: null });
      const b = await createCard(ws.id, { title: 'B', parentId: a.id });
      const c = await createCard(ws.id, { title: 'C', parentId: b.id });
      await expect(
        updateCard(a.id, { parentId: c.id }),
      ).rejects.toMatchObject({ code: 'E_CONFLICT' });
    });

    it('should reject cross-workspace parentId on update', async () => {
      const ws1 = await setupWorkspace('WS1');
      const ws2 = await setupWorkspace('WS2');
      const card = await createCard(ws1.id, { title: 'Card', parentId: null });
      const otherCard = await createCard(ws2.id, { title: 'Other', parentId: null });
      await expect(
        updateCard(card.id, { parentId: otherCard.id }),
      ).rejects.toMatchObject({ code: 'E_VALIDATION' });
    });
  });

  // ========== deleteCard ==========

  describe('deleteCard', () => {
    it('should delete a card', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'Del', parentId: null });
      await deleteCard(card.id);
      expect(getCard(card.id)).toBeUndefined();
    });

    it('should promote direct children to root on delete', async () => {
      const ws = await setupWorkspace();
      const root = await createCard(ws.id, { title: 'Root', parentId: null });
      const child = await createCard(ws.id, { title: 'Child', parentId: root.id });
      const grandchild = await createCard(ws.id, { title: 'Grandchild', parentId: child.id });

      await deleteCard(child.id);

      // Grandchild should now be root (parentId=null)
      const gc = getCard(grandchild.id);
      expect(gc).toBeDefined();
      expect(gc!.parentId).toBeNull();

      // Root still exists
      expect(getCard(root.id)).toBeDefined();
      // Child is gone
      expect(getCard(child.id)).toBeUndefined();
    });

    it('should reject non-existent card', async () => {
      await expect(deleteCard('no-such-card')).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    });

    it('should remove card from db.cards after delete', async () => {
      const ws = await setupWorkspace();
      const card = await createCard(ws.id, { title: 'Gone', parentId: null });
      const id = card.id;
      await deleteCard(id);
      expect(getCard(id)).toBeUndefined();
    });
  });

  // ========== getCardTree / buildTree ==========

  describe('getCardTree', () => {
    it('should build multi-level tree structure', async () => {
      const ws = await setupWorkspace();
      // Workspace auto-creates a root card
      const roots = getWorkspaceCards(ws.id).filter((c) => c.parentId === null);
      const root = roots[0];
      const c1 = await createCard(ws.id, { title: 'C1', parentId: root.id });
      const c2 = await createCard(ws.id, { title: 'C2', parentId: root.id });
      const gc1 = await createCard(ws.id, { title: 'GC1', parentId: c1.id });

      const tree = getCardTree(ws.id);

      expect(tree).toHaveLength(1);
      const rootNode = tree[0];
      expect(rootNode.id).toBe(root.id);
      expect(rootNode.children).toHaveLength(2);

      const childIds = rootNode.children.map((c) => c.id);
      expect(childIds).toContain(c1.id);
      expect(childIds).toContain(c2.id);

      const c1Node = rootNode.children.find((c) => c.id === c1.id)!;
      expect(c1Node.children).toHaveLength(1);
      expect(c1Node.children[0].id).toBe(gc1.id);
    });

    it('should return empty array for empty workspace', () => {
      const tree = getCardTree('non-existent');
      expect(tree).toEqual([]);
    });

    it('should keep children in parentId-derived order', async () => {
      const ws = await setupWorkspace();
      const roots = getWorkspaceCards(ws.id).filter((c) => c.parentId === null);
      const root = roots[0];
      await createCard(ws.id, { title: 'A', parentId: root.id });
      await createCard(ws.id, { title: 'B', parentId: root.id });

      const tree = getCardTree(ws.id);
      const children = tree[0].children;
      // Order = insertion order (by parentId aggregation)
      expect(children[0].title).toBe('A');
      expect(children[1].title).toBe('B');
    });

    it('should handle dangling parentId by promoting to root', async () => {
      const ws = await setupWorkspace();
      const roots = getWorkspaceCards(ws.id).filter((c) => c.parentId === null);
      const root = roots[0];
      // Create a card normally, then directly mutate its parentId to a non-existent card
      const card = await createCard(ws.id, { title: 'Dangling', parentId: root.id });
      const { mutate } = await import('../src/services/storage.js');
      await mutate((db: any) => {
        const c = db.cards.find((x: any) => x.id === card.id);
        if (c) c.parentId = 'non-existent-dangling';
      });

      const tree = getCardTree(ws.id);
      const danglingNodes = tree.filter((n) => n.title === 'Dangling');
      expect(danglingNodes).toHaveLength(1);
      expect(danglingNodes[0].parentId).toBe('non-existent-dangling');
    });

    it('should handle cycle data without throwing', async () => {
      const ws = await setupWorkspace();
      const { mutate } = await import('../src/services/storage.js');
      const { randomUUID } = await import('node:crypto');
      const idA = randomUUID();
      const idB = randomUUID();
      // Insert A.parentId=B, B.parentId=A (both not root)
      await mutate((db: any) => {
        db.cards.push({
          id: idA,
          workspaceId: ws.id,
          type: 'child',
          title: 'A',
          content: '',
          terms: [],
          parentId: idB,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        db.cards.push({
          id: idB,
          workspaceId: ws.id,
          type: 'child',
          title: 'B',
          content: '',
          terms: [],
          parentId: idA,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      // Should not throw
      const tree = getCardTree(ws.id);
      // Both cards should appear exactly once
      expect(tree.filter((n) => n.id === idA)).toHaveLength(1);
      expect(tree.filter((n) => n.id === idB)).toHaveLength(1);
    });
  });

  // ========== getChildrenOf ==========

  describe('getChildrenOf', () => {
    it('should return direct children', async () => {
      const ws = await setupWorkspace();
      const root = await createCard(ws.id, { title: 'R', parentId: null });
      const c1 = await createCard(ws.id, { title: 'C1', parentId: root.id });
      await createCard(ws.id, { title: 'C2', parentId: root.id });

      const allCards = getWorkspaceCards(ws.id);
      const children = getChildrenOf(allCards, root.id);
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.title)).toContain('C1');
    });
  });
});

describe('workspaceService', () => {
  it('should auto-create a root card on workspace creation', async () => {
    const ws = await createWorkspace('AutoRoot');
    const cards = getWorkspaceCards(ws.id);
    // auto-created root card has parentId=null
    const roots = cards.filter((c) => c.parentId === null);
    expect(roots.length).toBe(1);
    expect(roots[0].title).toBe('AutoRoot');
  });

  it('should cascade delete cards on workspace delete', async () => {
    const ws = await createWorkspace('Cascade');
    // workspace creation already created one root card
    const cards = getWorkspaceCards(ws.id);
    expect(cards.length).toBeGreaterThanOrEqual(1);

    await deleteWorkspace(ws.id);
    // workspace gone
    expect(getWorkspace(ws.id)).toBeUndefined();
    // cards gone
    const remaining = getWorkspaceCards(ws.id);
    expect(remaining).toHaveLength(0);
  });

  it('should rename workspace', async () => {
    const ws = await createWorkspace('Old');
    const updated = await updateWorkspace(ws.id, { name: 'New', description: 'desc' });
    expect(updated.name).toBe('New');
    expect(updated.description).toBe('desc');
    expect(updated.updatedAt).toBeDefined();
  });

  it('should reject empty name on rename', async () => {
    const ws = await createWorkspace('Old');
    await expect(
      updateWorkspace(ws.id, { name: '   ' }),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' });
  });

  it('should reject non-existent workspace rename', async () => {
    await expect(
      updateWorkspace('no-such', { name: 'X' }),
    ).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
  });
});

// ========== generateCard（M2 AI 生成编排） ==========

describe('generateCard', () => {
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
    promptTokens: 100,
    completionTokens: 50,
    latencyMs: 800,
    retried: false,
  };

  beforeEach(() => {
    vi.mocked(generateChildCard).mockReset();
  });

  it('成功：创建子卡(done, type=mode)且父卡回到 done', async () => {
    const ws = await createWorkspace('Gen');
    const root = getWorkspaceCards(ws.id)[0];
    vi.mocked(generateChildCard).mockResolvedValue(AI_OK);

    const child = await generateCard(root.id, 'divergent', undefined, AI);

    expect(child.status).toBe('done');
    expect(child.type).toBe('divergent');
    expect(child.parentId).toBe(root.id);
    expect(child.title).toBe('子主题');
    expect(child.aiMeta?.mode).toBe('divergent');
    expect(child.aiMeta?.model).toBe('deepseek-v4-flash');
    expect(child.aiMeta?.retried).toBe(false);

    const parent = getCard(root.id)!;
    expect(parent.status).toBe('done');
  });

  it('成功：instruction 透传给 aiService', async () => {
    const ws = await createWorkspace('Gen2');
    const root = getWorkspaceCards(ws.id)[0];
    vi.mocked(generateChildCard).mockResolvedValue(AI_OK);

    await generateCard(root.id, 'branch', '关注工程实现', AI);

    const params = vi.mocked(generateChildCard).mock.calls[0][0];
    expect(params.instruction).toBe('关注工程实现');
    expect(params.mode).toBe('branch');
    expect(params.parentTitle).toBe(root.title);
  });

  it('失败：父卡置 failed、aiMeta.error 记录错误码，抛错携带父卡', async () => {
    const ws = await createWorkspace('Gen3');
    const root = getWorkspaceCards(ws.id)[0];
    const err = Object.assign(new Error('timeout'), {
      code: 'E_AI_TIMEOUT',
      statusCode: 504,
      model: 'deepseek-v4-flash',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 30000,
    });
    vi.mocked(generateChildCard).mockRejectedValue(err);

    const caught = await generateCard(root.id, 'child', undefined, AI).catch((e) => e);
    expect(caught.code).toBe('E_AI_TIMEOUT');
    expect(caught.statusCode).toBe(504);
    expect(caught.card).toBeDefined();
    expect(caught.card.status).toBe('failed');
    expect(caught.card.aiMeta.error).toBe('E_AI_TIMEOUT');
    expect(caught.card.aiMeta.model).toBe('deepseek-v4-flash');
  });

  it('processing 中的卡片重复触发生成 -> 409 E_CARD_BUSY，不调用 aiService', async () => {
    const ws = await createWorkspace('Gen4');
    const root = getWorkspaceCards(ws.id)[0];
    await updateCard(root.id, { status: 'processing' });

    await expect(generateCard(root.id, 'child', undefined, AI)).rejects.toMatchObject({
      code: 'E_CARD_BUSY',
      statusCode: 409,
    });
    expect(vi.mocked(generateChildCard)).not.toHaveBeenCalled();
  });

  it('不存在的卡片 -> E_NOT_FOUND', async () => {
    await expect(generateCard('no-such', 'child', undefined, AI)).rejects.toMatchObject({
      code: 'E_NOT_FOUND',
    });
  });

  it('失败后可重试：failed 卡片再次 generate 成功', async () => {
    const ws = await createWorkspace('Gen5');
    const root = getWorkspaceCards(ws.id)[0];

    const err = Object.assign(new Error('rate limited'), {
      code: 'E_AI_RATE_LIMIT',
      statusCode: 429,
      model: 'deepseek-v4-flash',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 1000,
    });
    vi.mocked(generateChildCard).mockRejectedValueOnce(err);
    await generateCard(root.id, 'child', undefined, AI).catch(() => {});
    expect(getCard(root.id)!.status).toBe('failed');

    vi.mocked(generateChildCard).mockResolvedValueOnce(AI_OK);
    const child = await generateCard(root.id, 'child', undefined, AI);
    expect(child.status).toBe('done');
    expect(getCard(root.id)!.status).toBe('done');
  });
});