// ============================================================
// apiClient.test.ts —— X-API-Key 注入、错误码映射、multipart 上传
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, ApiError } from '../src/api/client.js';

function mockFetch(ok: boolean, status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

describe('api client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('localStorage 有 Key 时注入 X-API-Key 头', async () => {
    localStorage.setItem('cogito-settings', JSON.stringify({ apiKey: 'sk-local' }));
    const fetchMock = mockFetch(true, 200, {});
    global.fetch = fetchMock as unknown as typeof fetch;

    await api.get('/health');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('sk-local');
  });

  it('无 Key 时不注入 X-API-Key', async () => {
    const fetchMock = mockFetch(true, 200, {});
    global.fetch = fetchMock as unknown as typeof fetch;

    await api.get('/health');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBeUndefined();
  });

  it('错误响应映射为 ApiError（code/status）', async () => {
    global.fetch = mockFetch(false, 429, {
      error: { code: 'E_AI_RATE_LIMIT', message: 'rate limited' },
    }) as unknown as typeof fetch;

    await expect(api.post('/cards/x/generate')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'E_AI_RATE_LIMIT',
      status: 429,
      message: 'rate limited',
    });
  });

  it('非 JSON 错误体兜底 E_UNKNOWN', async () => {
    global.fetch = mockFetch(false, 502, {}) as unknown as typeof fetch;
    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('upload 使用 FormData 且不设 Content-Type（浏览器自动带 boundary）', async () => {
    localStorage.setItem('cogito-settings', JSON.stringify({ apiKey: 'sk-local' }));
    const fetchMock = mockFetch(true, 202, { document: {} });
    global.fetch = fetchMock as unknown as typeof fetch;

    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.txt');
    await api.upload('/workspaces/w/documents', form);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/workspaces/w/documents');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.headers).not.toHaveProperty('Content-Type');
  });
});

describe('getCardSuggestions', () => {
  it('POST /cards/:id/suggestions with optional instruction', async () => {
    const fetchMock = mockFetch(true, 200, { suggestions: [{ type: 'child', title: '深入理解', reason: '值得深入' }], meta: { model: 'test', latencyMs: 100 } });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getCardSuggestions } = await import('../src/api/cards.js');
    const result = await getCardSuggestions('card1', '请聚焦');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/cards/card1/suggestions');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual({ instruction: '请聚焦' });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].type).toBe('child');
  });

  it('sends empty instruction when omitted', async () => {
    const fetchMock = mockFetch(true, 200, { suggestions: [], meta: { model: 'test', latencyMs: 50 } });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getCardSuggestions } = await import('../src/api/cards.js');
    await getCardSuggestions('card2');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ instruction: undefined });
  });
});

describe('generateTree', () => {
  it('POST /workspaces/:wid/cards/generate-tree and returns result', async () => {
    const apiResult = { result: { rootsProcessed: 2, created: 10, skipped: 0, truncated: false, totalCards: 10, failures: [], meta: { model: 'test', latencyMs: 200 } } };
    const fetchMock = mockFetch(true, 200, apiResult);
    global.fetch = fetchMock as unknown as typeof fetch;

    const { generateTree } = await import('../src/api/cards.js');
    const result = await generateTree('ws1', { depth: 2, branchesPerNode: 3 });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/workspaces/ws1/cards/generate-tree');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual({ depth: 2, branchesPerNode: 3 });
    expect(result.rootsProcessed).toBe(2);
    expect(result.created).toBe(10);
  });
});
