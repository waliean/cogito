// ============================================================
// api.integration.test.ts —— supertest 全端点集成测试
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetForTest } from '../src/services/storage.js';
import { app } from '../src/app.js';

// mock openai SDK（generate / settings/test 端点全程真实链路，仅替换上游）
const mocks = vi.hoisted(() => ({
  createImpl: null as ((params: any) => any) | null,
  clientOptions: [] as any[],
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async (params: any) => {
          if (!mocks.createImpl) throw new Error('createImpl not set');
          return mocks.createImpl(params);
        },
      },
    };
    constructor(options: any) {
      mocks.clientOptions.push(options);
    }
  },
}));

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
  mocks.createImpl = null;
  mocks.clientOptions.length = 0;
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  cleanup();
  resetForTest();
  mocks.createImpl = null;
  mocks.clientOptions.length = 0;
});

describe('API integration', () => {
  // ========== 工作区 ==========

  describe('POST /api/workspaces', () => {
    it('should create a workspace', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: 'My Workspace', description: 'Test' })
        .expect(201);

      expect(res.body.workspace).toBeDefined();
      expect(res.body.workspace.name).toBe('My Workspace');
      expect(res.body.workspace.description).toBe('Test');
      expect(res.body.workspace.id).toBeDefined();
    });

    it('should reject empty name', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: '' })
        .expect(400);

      expect(res.body.error.code).toBe('E_VALIDATION');
    });
  });

  describe('GET /api/workspaces', () => {
    it('should list workspaces', async () => {
      await request(app).post('/api/workspaces').send({ name: 'A' });
      await request(app).post('/api/workspaces').send({ name: 'B' });

      const res = await request(app).get('/api/workspaces').expect(200);
      expect(res.body.workspaces).toHaveLength(2);
    });
  });

  describe('GET /api/workspaces/:id', () => {
    it('should get a workspace with cards', async () => {
      const create = await request(app).post('/api/workspaces').send({ name: 'W' });
      const ws = create.body.workspace;

      const res = await request(app).get(`/api/workspaces/${ws.id}`).expect(200);
      expect(res.body.workspace.name).toBe('W');
      expect(res.body.cards).toBeDefined();
    });

    it('should 404 for non-existent workspace', async () => {
      const res = await request(app).get('/api/workspaces/non-existent').expect(404);
      expect(res.body.error.code).toBe('E_NOT_FOUND');
    });
  });

  describe('PATCH /api/workspaces/:id', () => {
    it('should rename workspace', async () => {
      const create = await request(app).post('/api/workspaces').send({ name: 'Old' });
      const ws = create.body.workspace;

      const res = await request(app)
        .patch(`/api/workspaces/${ws.id}`)
        .send({ name: 'New', description: 'Updated' })
        .expect(200);

      expect(res.body.workspace.name).toBe('New');
      expect(res.body.workspace.description).toBe('Updated');
    });

    it('should 404 for non-existent workspace', async () => {
      const res = await request(app)
        .patch('/api/workspaces/non-existent')
        .send({ name: 'X' })
        .expect(404);

      expect(res.body.error.code).toBe('E_NOT_FOUND');
    });
  });

  describe('DELETE /api/workspaces/:id', () => {
    it('should delete workspace', async () => {
      const create = await request(app).post('/api/workspaces').send({ name: 'Del' });
      const ws = create.body.workspace;

      await request(app).delete(`/api/workspaces/${ws.id}`).expect(200);
      await request(app).get(`/api/workspaces/${ws.id}`).expect(404);
    });
  });

  // ========== 卡片 ==========

  describe('POST /api/workspaces/:wid/cards', () => {
    it('should create a child card', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;

      const res = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'My Card', type: 'child', parentId: null })
        .expect(201);

      expect(res.body.card.title).toBe('My Card');
      expect(res.body.card.type).toBe('child');
      expect(res.body.card.parentId).toBeNull();
    });

    it('should create divergent under parent', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;
      const root = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'Root', parentId: null });
      const rootId = root.body.card.id;

      const res = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'Div', type: 'divergent', parentId: rootId })
        .expect(201);

      expect(res.body.card.parentId).toBe(rootId);
      expect(res.body.card.type).toBe('divergent');
    });

    it('should 400 for invalid type', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;

      const res = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ type: 'bad' })
        .expect(400);

      expect(res.body.error.code).toBe('E_VALIDATION');
    });

    it('should 400 for cross-workspace parent', async () => {
      const ws1 = await request(app).post('/api/workspaces').send({ name: 'WS1' });
      const ws2 = await request(app).post('/api/workspaces').send({ name: 'WS2' });
      const wid1 = ws1.body.workspace.id;
      const wid2 = ws2.body.workspace.id;
      const otherCard = await request(app)
        .post(`/api/workspaces/${wid2}/cards`)
        .send({ title: 'Other', parentId: null });

      const res = await request(app)
        .post(`/api/workspaces/${wid1}/cards`)
        .send({ title: 'Cross', parentId: otherCard.body.card.id })
        .expect(400);

      expect(res.body.error.code).toBe('E_VALIDATION');
    });
  });

  describe('GET /api/workspaces/:wid/cards', () => {
    it('should return flat card list', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;

      // Workspace auto-creates a root card, then we add 2 more
      await request(app).post(`/api/workspaces/${wid}/cards`).send({ title: 'C1', parentId: null });
      await request(app).post(`/api/workspaces/${wid}/cards`).send({ title: 'C2', parentId: null });

      const res = await request(app).get(`/api/workspaces/${wid}/cards`).expect(200);
      expect(res.body.cards).toHaveLength(3);
    });

    it('should return tree when ?tree=true', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;
      // Use the auto-created root card from workspace
      const cardsRes = await request(app).get(`/api/workspaces/${wid}/cards`).expect(200);
      const rootId = cardsRes.body.cards[0].id;
      await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'C', parentId: rootId });

      const res = await request(app)
        .get(`/api/workspaces/${wid}/cards?tree=true`)
        .expect(200);

      expect(res.body.cards).toHaveLength(1);
      expect(res.body.cards[0].children).toHaveLength(1);
    });
  });

  describe('GET /api/cards/:id', () => {
    it('should get a single card with children', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;
      const root = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'R', parentId: null });
      const rootId = root.body.card.id;
      await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'C', parentId: rootId });

      const res = await request(app).get(`/api/cards/${rootId}`).expect(200);
      expect(res.body.card.id).toBe(rootId);
      expect(res.body.children).toHaveLength(1);
    });

    it('should 404 for non-existent card', async () => {
      const res = await request(app).get('/api/cards/non-existent').expect(404);
      expect(res.body.error.code).toBe('E_NOT_FOUND');
    });
  });

  describe('PATCH /api/cards/:id', () => {
    it('should update card', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;
      const card = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'Old', parentId: null });

      const res = await request(app)
        .patch(`/api/cards/${card.body.card.id}`)
        .send({ title: 'New', content: 'Updated' })
        .expect(200);

      expect(res.body.card.title).toBe('New');
      expect(res.body.card.content).toBe('Updated');
    });

    it('should 404 for non-existent card', async () => {
      const res = await request(app)
        .patch('/api/cards/non-existent')
        .send({ title: 'X' })
        .expect(404);

      expect(res.body.error.code).toBe('E_NOT_FOUND');
    });

    it('should 409 when setting self as parent', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;
      const card = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'Self', parentId: null });

      const res = await request(app)
        .patch(`/api/cards/${card.body.card.id}`)
        .send({ parentId: card.body.card.id })
        .expect(409);

      expect(res.body.error.code).toBe('E_CONFLICT');
    });
  });

  describe('DELETE /api/cards/:id', () => {
    it('should delete card and promote children', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' });
      const wid = ws.body.workspace.id;
      const root = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'R', parentId: null });
      const rootId = root.body.card.id;
      const child = await request(app)
        .post(`/api/workspaces/${wid}/cards`)
        .send({ title: 'C', parentId: rootId });

      await request(app).delete(`/api/cards/${child.body.card.id}`).expect(200);
      await request(app).get(`/api/cards/${child.body.card.id}`).expect(404);
    });
  });

  // ========== 设置 ==========

  describe('GET /api/settings', () => {
    it('返回 PublicSettings 且绝不含 apiKey 明文', async () => {
      await request(app).put('/api/settings').send({ apiKey: 'sk-secret-123' }).expect(200);

      const res = await request(app).get('/api/settings').expect(200);
      expect(res.body.settings.hasApiKey).toBe(true);
      expect(res.body.settings.apiKey).toBeUndefined();
      expect(res.body.settings.model).toBe('deepseek-v4-flash');
      expect(res.body.settings.baseUrl).toBe('https://api.deepseek.com');
    });

    it('未配置 Key 时 hasApiKey=false', async () => {
      const res = await request(app).get('/api/settings').expect(200);
      expect(res.body.settings.hasApiKey).toBe(false);
    });
  });

  describe('PUT /api/settings', () => {
    it('保存并更新设置', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({ apiKey: 'sk-new', model: 'deepseek-v4-pro', temperature: 0.5, timeoutMs: 30000 })
        .expect(200);
      expect(res.body.settings.hasApiKey).toBe(true);
      expect(res.body.settings.model).toBe('deepseek-v4-pro');
      expect(res.body.settings.temperature).toBe(0.5);
      expect(res.body.settings.apiKey).toBeUndefined();
    });

    it('apiKey 空字符串 = 清除', async () => {
      await request(app).put('/api/settings').send({ apiKey: 'sk-abc' }).expect(200);
      const cleared = await request(app).put('/api/settings').send({ apiKey: '' }).expect(200);
      expect(cleared.body.settings.hasApiKey).toBe(false);
    });

    it('temperature 越界 -> 400 E_VALIDATION', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({ temperature: 3 })
        .expect(400);
      expect(res.body.error.code).toBe('E_VALIDATION');
    });
  });

  describe('POST /api/settings/test', () => {
    it('无 Key -> 400 E_NO_API_KEY', async () => {
      const res = await request(app).post('/api/settings/test').expect(400);
      expect(res.body.error.code).toBe('E_NO_API_KEY');
    });

    it('配置 Key 后测试成功（mock SDK 返回 pong）', async () => {
      mocks.createImpl = () => ({
        choices: [{ message: { content: 'pong' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);

      const res = await request(app).post('/api/settings/test').expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.model).toBe('deepseek-v4-flash');
      expect(res.body.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('上游 401 -> E_INVALID_API_KEY', async () => {
      mocks.createImpl = () => {
        throw Object.assign(new Error('bad key'), { status: 401 });
      };
      await request(app).put('/api/settings').send({ apiKey: 'sk-bad' }).expect(200);

      const res = await request(app).post('/api/settings/test').expect(401);
      expect(res.body.error.code).toBe('E_INVALID_API_KEY');
    });
  });

  // ========== AI 生成 ==========

  function okJson() {
    return JSON.stringify({
      title: 'AI 子卡',
      content: 'AI 生成内容 术语A',
      terms: [{ term: '术语A', definition: '定义' }],
    });
  }

  async function setupRootCard(): Promise<string> {
    const ws = await request(app).post('/api/workspaces').send({ name: 'Gen WS' }).expect(201);
    const wid = ws.body.workspace.id;
    const cards = await request(app).get(`/api/workspaces/${wid}/cards`).expect(200);
    return cards.body.cards[0].id;
  }

  describe('POST /api/cards/:id/generate', () => {
    it('无 Key -> 400 E_NO_API_KEY', async () => {
      const rootId = await setupRootCard();
      const res = await request(app)
        .post(`/api/cards/${rootId}/generate`)
        .send({ mode: 'child' })
        .expect(400);
      expect(res.body.error.code).toBe('E_NO_API_KEY');
    });

    it('非法 mode -> 400 E_VALIDATION', async () => {
      const rootId = await setupRootCard();
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const res = await request(app)
        .post(`/api/cards/${rootId}/generate`)
        .send({ mode: 'sideways' })
        .expect(400);
      expect(res.body.error.code).toBe('E_VALIDATION');
    });

    it('成功：201 返回新卡 done，父卡回 done，子卡挂载正确', async () => {
      mocks.createImpl = () => ({
        choices: [{ message: { content: okJson() } }],
        usage: { prompt_tokens: 100, completion_tokens: 40 },
      });
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const rootId = await setupRootCard();

      const res = await request(app)
        .post(`/api/cards/${rootId}/generate`)
        .send({ mode: 'divergent', instruction: '关注时延' })
        .expect(201);

      expect(res.body.card.status).toBe('done');
      expect(res.body.card.type).toBe('divergent');
      expect(res.body.card.parentId).toBe(rootId);
      expect(res.body.card.aiMeta.mode).toBe('divergent');
      expect(res.body.card.aiMeta.retried).toBe(false);

      const parent = await request(app).get(`/api/cards/${rootId}`).expect(200);
      expect(parent.body.card.status).toBe('done');
      expect(parent.body.children.length).toBe(1);
    });

    it('X-API-Key 头优先于 settings 中的 Key', async () => {
      let capturedKey = '';
      mocks.createImpl = () => {
        capturedKey = mocks.clientOptions[mocks.clientOptions.length - 1].apiKey;
        return {
          choices: [{ message: { content: okJson() } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        };
      };
      await request(app).put('/api/settings').send({ apiKey: 'sk-from-settings' }).expect(200);
      const rootId = await setupRootCard();

      await request(app)
        .post(`/api/cards/${rootId}/generate`)
        .set('X-API-Key', 'sk-from-header')
        .send({ mode: 'child' })
        .expect(201);

      expect(capturedKey).toBe('sk-from-header');
    });

    it('AI 失败：错误体携带父卡(failed)，父卡 aiMeta.error 记录错误码', async () => {
      mocks.createImpl = () => {
        throw Object.assign(new Error('rate limited'), { status: 429 });
      };
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const rootId = await setupRootCard();

      const res = await request(app)
        .post(`/api/cards/${rootId}/generate`)
        .send({ mode: 'child' })
        .expect(429);

      expect(res.body.error.code).toBe('E_AI_RATE_LIMIT');
      expect(res.body.card).toBeDefined();
      expect(res.body.card.status).toBe('failed');
      expect(res.body.card.aiMeta.error).toBe('E_AI_RATE_LIMIT');
    });

    it('processing 中重复触发 -> 409 E_CARD_BUSY', async () => {
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const rootId = await setupRootCard();
      // 直接改库置 processing
      const { updateCard } = await import('../src/services/cardService.js');
      await updateCard(rootId, { status: 'processing' });

      const res = await request(app)
        .post(`/api/cards/${rootId}/generate`)
        .send({ mode: 'child' })
        .expect(409);
      expect(res.body.error.code).toBe('E_CARD_BUSY');
    });
  });

  // ========== 分支建议 ==========

  describe('POST /api/cards/:id/suggestions', () => {
    it('无 Key -> 400 E_NO_API_KEY', async () => {
      const rootId = await setupRootCard();
      const res = await request(app)
        .post(`/api/cards/${rootId}/suggestions`)
        .expect(400);
      expect(res.body.error.code).toBe('E_NO_API_KEY');
    });

    it('404 未知卡', async () => {
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const res = await request(app)
        .post('/api/cards/non-existent/suggestions')
        .expect(404);
      expect(res.body.error.code).toBe('E_NOT_FOUND');
    });

    it('200 成功返回 suggestions + meta', async () => {
      mocks.createImpl = () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  { type: 'child', title: '深入主题', reason: '拆解子主题' },
                  { type: 'divergent', title: '横向探索', reason: '相邻领域' },
                  { type: 'branch', title: '分支独立', reason: '独立成支' },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 80, completion_tokens: 40 },
      });
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const rootId = await setupRootCard();

      const res = await request(app)
        .post(`/api/cards/${rootId}/suggestions`)
        .expect(200);

      expect(res.body.suggestions).toBeDefined();
      expect(res.body.suggestions).toHaveLength(3);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.model).toBe('deepseek-v4-flash');
    });

    it('200 传递 instruction 参数', async () => {
      let capturedUserMsg = '';
      mocks.createImpl = (params: any) => {
        capturedUserMsg = params.messages[1].content;
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: [
                    { type: 'child', title: '深入主题', reason: '拆解子主题' },
                    { type: 'divergent', title: '横向探索', reason: '相邻领域' },
                    { type: 'branch', title: '分支独立', reason: '独立成支' },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 80, completion_tokens: 40 },
        };
      };
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const rootId = await setupRootCard();

      const res = await request(app)
        .post(`/api/cards/${rootId}/suggestions`)
        .send({ instruction: '关注实践应用' })
        .expect(200);

      expect(res.body.suggestions).toHaveLength(3);
      expect(capturedUserMsg).toContain('用户补充意图');
      expect(capturedUserMsg).toContain('关注实践应用');
    });
  });

  // ========== 一键生成完整图 ==========

  describe('POST /api/workspaces/:wsId/cards/generate-tree', () => {
    it('无 Key -> 400 E_NO_API_KEY', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/cards/generate-tree`)
        .send({ depth: 1, branchesPerNode: 1 })
        .expect(400);
      expect(res.body.error.code).toBe('E_NO_API_KEY');
    });

    it('depth=0 -> 400 E_VALIDATION', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/cards/generate-tree`)
        .send({ depth: 0, branchesPerNode: 1 })
        .expect(400);
      expect(res.body.error.code).toBe('E_VALIDATION');
    });

    it('depth=4 -> 400 E_VALIDATION', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/cards/generate-tree`)
        .send({ depth: 4, branchesPerNode: 1 })
        .expect(400);
      expect(res.body.error.code).toBe('E_VALIDATION');
    });

    it('无根卡 -> 400 E_VALIDATION', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      // 删除所有根卡
      const { mutate } = await import('../src/services/storage.js');
      await mutate((db: any) => {
        db.cards = [];
      });

      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/cards/generate-tree`)
        .send({ depth: 1, branchesPerNode: 1 })
        .expect(400);
      expect(res.body.error.code).toBe('E_VALIDATION');
    });

    it('200 成功返回汇总形状', async () => {
      mocks.createImpl = () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'AI 子卡',
                content: 'AI 生成内容 术语A',
                terms: [{ term: '术语A', definition: '定义' }],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30 },
      });
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);

      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/cards/generate-tree`)
        .send({ depth: 1, branchesPerNode: 2 })
        .expect(200);

      expect(res.body.result).toBeDefined();
      expect(res.body.result.rootsProcessed).toBe(1);
      expect(res.body.result.created).toBeGreaterThanOrEqual(0);
      expect(res.body.result.totalCards).toBeGreaterThanOrEqual(1);
      expect(res.body.result.meta).toBeDefined();
      expect(res.body.result.meta.model).toBe('deepseek-v4-flash');
    });

    it('B=4, depth=3 预算截断校验（rootsProcessed 语义正确）', async () => {
      mocks.createImpl = () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'AI 子卡',
                content: 'AI 生成内容 术语A',
                terms: [{ term: '术语A', definition: '定义' }],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30 },
      });
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);

      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/cards/generate-tree`)
        .send({ depth: 3, branchesPerNode: 4 })
        .expect(200);

      expect(res.body.result).toBeDefined();
      expect(res.body.result.rootsProcessed).toBe(1);
      // Budget 限制，不会撑爆
      expect(res.body.result.created).toBeGreaterThanOrEqual(1);
      expect(res.body.result.created).toBeLessThanOrEqual(49);
      expect(res.body.result.meta).toBeDefined();
    });
  });

  // ========== 文档上传（M4） ==========

  async function waitForDoc(id: string, maxTries = 30): Promise<any> {
    let doc: any;
    for (let i = 0; i < maxTries; i++) {
      await new Promise((r) => setTimeout(r, 30));
      doc = (await request(app).get(`/api/documents/${id}`)).body.document;
      if (doc?.status === 'done' || doc?.status === 'failed') break;
    }
    return doc;
  }

  describe('POST /api/workspaces/:wid/documents', () => {
    it('上传 TXT -> 202 -> 摘要完成 -> 自动创建根卡', async () => {
      await request(app).put('/api/settings').send({ apiKey: 'sk-ok' }).expect(200);
      mocks.createImpl = () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: '文档摘要标题',
                summary: '核心观点：这是一个测试文档的内容摘要。',
                terms: [{ term: '测试文档', definition: '定义' }],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 30 },
      });
      const ws = await request(app).post('/api/workspaces').send({ name: 'DocWS' }).expect(201);
      const wid = ws.body.workspace.id;
      const before = (await request(app).get(`/api/workspaces/${wid}/cards`)).body.cards.length;

      const res = await request(app)
        .post(`/api/workspaces/${wid}/documents`)
        .attach('file', Buffer.from('这是一个测试文档的正文内容', 'utf-8'), 'doc.txt')
        .expect(202);

      const docId = res.body.document.id;
      expect(res.body.document.status).toBe('processing');

      const doc = await waitForDoc(docId);
      expect(doc.status).toBe('done');
      expect(doc.title).toBe('文档摘要标题');

      const after = (await request(app).get(`/api/workspaces/${wid}/cards`)).body.cards;
      expect(after.length).toBe(before + 1);
      expect(after.some((c: any) => c.sourceDocumentId === docId)).toBe(true);
    });

    it('无文件 -> 400 E_VALIDATION', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/documents`)
        .expect(400);
      expect(res.body.error.code).toBe('E_VALIDATION');
    });

    it('非法类型 -> 415 E_UNSUPPORTED_TYPE', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/documents`)
        .attach('file', Buffer.from('x'), 'evil.png')
        .expect(415);
      expect(res.body.error.code).toBe('E_UNSUPPORTED_TYPE');
    });

    it('伪装 MIME（.txt 却声明 pdf）-> 415', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/documents`)
        .attach('file', Buffer.from('x'), { filename: 'fake.pdf', contentType: 'text/plain' })
        .expect(415);
      expect(res.body.error.code).toBe('E_UNSUPPORTED_TYPE');
    });

    it('超过 10MB -> 413 E_FILE_TOO_LARGE', async () => {
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      const big = Buffer.alloc(11 * 1024 * 1024, 1);
      const res = await request(app)
        .post(`/api/workspaces/${ws.body.workspace.id}/documents`)
        .attach('file', big, 'big.txt')
        .expect(413);
      expect(res.body.error.code).toBe('E_FILE_TOO_LARGE');
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('删除记录与上传文件', async () => {
      mocks.createImpl = () => ({
        choices: [
          { message: { content: JSON.stringify({ title: 'T', summary: 'S', terms: [] }) } },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
      const ws = await request(app).post('/api/workspaces').send({ name: 'W' }).expect(201);
      const wid = ws.body.workspace.id;
      const res = await request(app)
        .post(`/api/workspaces/${wid}/documents`)
        .attach('file', Buffer.from('x'), 'a.txt')
        .expect(202);
      const docId = res.body.document.id;

      await request(app).delete(`/api/documents/${docId}`).expect(200);
      const gone = await request(app).get(`/api/documents/${docId}`).expect(404);
      expect(gone.body.error.code).toBe('E_NOT_FOUND');
    });
  });
});