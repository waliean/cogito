// ============================================================
// stores.test.ts —— cardStore.generate 乐观/失败刷新 + settingsStore
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCardStore, useWorkspaceStore, useSettingsStore } from '../src/state/store.js';
import * as cardApi from '../src/api/cards.js';
import * as settingsApi from '../src/api/settings.js';

vi.mock('../src/api/cards.js', () => ({
  listCards: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  removeCard: vi.fn(),
  getCard: vi.fn(),
  generateCard: vi.fn(),
  getCardSuggestions: vi.fn(),
  generateTree: vi.fn(),
}));

vi.mock('../src/api/settings.js', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  testSettings: vi.fn(),
}));

function treeNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workspaceId: 'ws1',
    type: 'child',
    title: id,
    content: '',
    terms: [],
    parentId: null,
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    children: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({
    workspaces: [],
    currentId: 'ws1',
    loading: false,
    error: null,
  });
  useCardStore.setState({
    cards: [],
    tree: [],
    selectedId: null,
    generatingId: null,
    loading: false,
    error: null,
    suggestionsByCardId: {},
    suggestionsLoadingId: null,
    suggestionsError: null,
    generateTreeRunning: false,
  });
  useSettingsStore.setState({
    settings: null,
    testing: false,
    lastTest: null,
    error: null,
  });
});

describe('useCardStore.generate', () => {
  it('成功：调用 generateCard，完成后刷新并清空 generatingId', async () => {
    vi.mocked(cardApi.listCards).mockResolvedValue([
      treeNode('root', { status: 'done', children: [treeNode('child1', { status: 'done' })] }),
    ] as never);
    vi.mocked(cardApi.generateCard).mockResolvedValue(treeNode('child1', { status: 'done' }) as never);

    await useCardStore.getState().generate('root', 'divergent', '关注时延');

    expect(cardApi.generateCard).toHaveBeenCalledWith('root', 'divergent', '关注时延');
    expect(useCardStore.getState().generatingId).toBeNull();
    expect(useCardStore.getState().cards.some((c) => c.id === 'child1')).toBe(true);
    expect(useCardStore.getState().error).toBeNull();
  });

  it('成功：无 instruction 时传 undefined', async () => {
    vi.mocked(cardApi.listCards).mockResolvedValue([treeNode('root')] as never);
    vi.mocked(cardApi.generateCard).mockResolvedValue(treeNode('c') as never);

    await useCardStore.getState().generate('root', 'child');
    expect(cardApi.generateCard).toHaveBeenCalledWith('root', 'child', undefined);
  });

  it('失败：清空 generatingId、置 error，并刷新（父卡 failed）', async () => {
    vi.mocked(cardApi.listCards).mockResolvedValue([
      treeNode('root', { status: 'failed', children: [] }),
    ] as never);
    const err = new Error('生成超时');
    (err as any).code = 'E_AI_TIMEOUT';
    vi.mocked(cardApi.generateCard).mockRejectedValue(err);

    await expect(
      useCardStore.getState().generate('root', 'child'),
    ).rejects.toBe(err);

    expect(useCardStore.getState().generatingId).toBeNull();
    expect(useCardStore.getState().error).toContain('生成超时');
    expect(useCardStore.getState().byId('root')?.status).toBe('failed');
  });
});

describe('useSettingsStore', () => {
  it('load 拉取 PublicSettings', async () => {
    vi.mocked(settingsApi.getSettings).mockResolvedValue({
      hasApiKey: true,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      temperature: 0.7,
      timeoutMs: 60000,
    });
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().settings?.hasApiKey).toBe(true);
  });

  it('save 透传 patch', async () => {
    vi.mocked(settingsApi.updateSettings).mockResolvedValue({
      hasApiKey: true,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      temperature: 0.5,
      timeoutMs: 60000,
    });
    await useSettingsStore.getState().save({ apiKey: 'sk-x', temperature: 0.5 });
    expect(settingsApi.updateSettings).toHaveBeenCalledWith({
      apiKey: 'sk-x',
      temperature: 0.5,
    });
    expect(useSettingsStore.getState().settings?.temperature).toBe(0.5);
  });

  it('test 成功写入 lastTest', async () => {
    vi.mocked(settingsApi.testSettings).mockResolvedValue({
      ok: true,
      latencyMs: 42,
      model: 'deepseek-v4-flash',
    });
    await useSettingsStore.getState().test();
    expect(useSettingsStore.getState().testing).toBe(false);
    expect(useSettingsStore.getState().lastTest?.latencyMs).toBe(42);
  });
});

describe('useCardStore.fetchSuggestions', () => {
  it('成功：拉取建议并写入 suggestionsByCardId', async () => {
    vi.mocked(cardApi.getCardSuggestions).mockResolvedValue({
      suggestions: [
        { type: 'child', title: '深入理解', reason: '值得深入' },
        { type: 'divergent', title: '换个角度', reason: '发散思考' },
      ],
      meta: { model: 'test', latencyMs: 100 },
    });

    await useCardStore.getState().fetchSuggestions('card1');

    expect(useCardStore.getState().suggestionsLoadingId).toBeNull();
    expect(useCardStore.getState().suggestionsError).toBeNull();
    expect(useCardStore.getState().suggestionsByCardId['card1']).toHaveLength(2);
    expect(useCardStore.getState().suggestionsByCardId['card1'][0].type).toBe('child');
  });

  it('失败：设置 suggestionsError 并清空 loadingId', async () => {
    vi.mocked(cardApi.getCardSuggestions).mockRejectedValue(new Error('API 超时'));

    await useCardStore.getState().fetchSuggestions('card2');

    expect(useCardStore.getState().suggestionsLoadingId).toBeNull();
    expect(useCardStore.getState().suggestionsError).toContain('API 超时');
  });
});

describe('useCardStore.clearSuggestions', () => {
  it('清空 suggestionsByCardId 和 suggestionsError', () => {
    useCardStore.setState({
      suggestionsByCardId: { card1: [{ type: 'child', title: 'T', reason: 'R' }] },
      suggestionsError: 'Some error',
    });

    useCardStore.getState().clearSuggestions();

    expect(useCardStore.getState().suggestionsByCardId).toEqual({});
    expect(useCardStore.getState().suggestionsError).toBeNull();
  });
});

describe('useCardStore.adoptSuggestion', () => {
  it('调用 generate 并拼接 instruction', async () => {
    vi.mocked(cardApi.listCards).mockResolvedValue([treeNode('root')] as never);
    vi.mocked(cardApi.generateCard).mockResolvedValue(treeNode('c') as never);

    const suggestion = { type: 'branch' as const, title: '新分支', reason: '值得探索新方向' };
    await useCardStore.getState().adoptSuggestion('root', suggestion);

    expect(cardApi.generateCard).toHaveBeenCalledWith('root', 'branch', '新分支。值得探索新方向');
  });
});

describe('useCardStore.generateTree', () => {
  it('成功：调用 generateTree 并刷新树', async () => {
    vi.mocked(cardApi.generateTree).mockResolvedValue({
      rootsProcessed: 2,
      created: 10,
      skipped: 0,
      truncated: false,
      totalCards: 10,
      failures: [],
      meta: { model: 'test', latencyMs: 200 },
    });
    vi.mocked(cardApi.listCards).mockResolvedValue([
      treeNode('root1', { children: [treeNode('c1')] }),
    ] as never);

    const result = await useCardStore.getState().generateTree(2, 3);

    expect(cardApi.generateTree).toHaveBeenCalledWith('ws1', { depth: 2, branchesPerNode: 3 });
    expect(result.created).toBe(10);
    expect(useCardStore.getState().generateTreeRunning).toBe(false);
    expect(useCardStore.getState().tree.length).toBeGreaterThan(0);
  });

  it('失败：清空 running 并置 error', async () => {
    vi.mocked(cardApi.generateTree).mockRejectedValue(new Error('生成失败'));
    vi.mocked(cardApi.listCards).mockResolvedValue([] as never);

    await expect(useCardStore.getState().generateTree(1, 1)).rejects.toThrow('生成失败');
    expect(useCardStore.getState().generateTreeRunning).toBe(false);
    expect(useCardStore.getState().error).toContain('生成失败');
  });
});
