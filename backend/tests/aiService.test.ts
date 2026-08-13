// ============================================================
// aiService.test.ts — prompt 构建、JSON 解析/校验、重试、SDK 错误映射
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorCode } from '@cogito/shared';
import { generateChildCard, testConnection, generateSuggestions, AiError } from '../src/services/aiService.js';
import { buildGeneratePrompt } from '../src/prompts/generate.js';
import { buildSuggestionsPrompt } from '../src/prompts/suggestions.js';

// ---- mock openai SDK ----

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

const BASE = {
  apiKey: 'sk-test',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  timeoutMs: 60000,
};

function okCompletion(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

function sdkError(message: string, attrs: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), attrs);
}

beforeEach(() => {
  mocks.createImpl = null;
  mocks.clientOptions.length = 0;
});

afterEach(() => {
  mocks.createImpl = null;
  mocks.clientOptions.length = 0;
});

describe('buildGeneratePrompt', () => {
  it('构建 system + user，包含模式说明与父卡内容', () => {
    const { system, user } = buildGeneratePrompt({
      mode: 'divergent',
      parentTitle: 'LLM 推理',
      parentContent: '链式思考内容',
      instruction: '关注时延',
    });
    expect(system).toContain('卡片生成引擎');
    expect(system).toContain('只输出一个 JSON 对象');
    expect(user).toContain('【生成模式】divergent');
    expect(user).toContain('从父卡片横向发散');
    expect(user).toContain('LLM 推理');
    expect(user).toContain('链式思考内容');
    expect(user).toContain('关注时延');
  });

  it('无 instruction 时不渲染补充意图段', () => {
    const { user } = buildGeneratePrompt({
      mode: 'child',
      parentTitle: 'T',
      parentContent: 'C',
    });
    expect(user).not.toContain('用户补充意图');
  });
});

describe('generateChildCard', () => {
  it('成功解析 JSON，过滤未出现在 content 中的 term，返回 aiMeta 计数', async () => {
    mocks.createImpl = () =>
      okCompletion(
        JSON.stringify({
          title: '测试主题',
          content: '内容包含 术语A 和 术语B',
          terms: [
            { term: '术语A', definition: '定义A' },
            { term: '不存在的词', definition: '应被过滤' },
          ],
        }),
      );

    const res = await generateChildCard({
      ...BASE,
      mode: 'child',
      parentTitle: '父',
      parentContent: '父内容',
    });

    expect(res.title).toBe('测试主题');
    expect(res.content).toBe('内容包含 术语A 和 术语B');
    expect(res.terms).toEqual([{ term: '术语A', definition: '定义A' }]);
    expect(res.retried).toBe(false);
    expect(res.model).toBe('deepseek-v4-flash');
    expect(res.promptTokens).toBe(100);
    expect(res.completionTokens).toBe(50);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('剥离 ```json 代码块围栏后解析', async () => {
    mocks.createImpl = () =>
      okCompletion('```json\n{"title": "T", "content": "C 词", "terms": [{"term": "词", "definition": "d"}]}\n```');
    const res = await generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' });
    expect(res.title).toBe('T');
    expect(res.terms).toHaveLength(1);
  });

  it('terms 数量钳制 <= 8', async () => {
    const terms = Array.from({ length: 12 }, (_, i) => ({
      term: `词${i}`,
      definition: `定义${i}`,
    }));
    mocks.createImpl = () =>
      okCompletion(JSON.stringify({ title: 'T', content: '内容 ' + terms.map((t) => t.term).join(' '), terms }));
    const res = await generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' });
    expect(res.terms.length).toBeLessThanOrEqual(8);
  });

  it('首次输出非法 JSON -> 解析重试 1 次后成功（retried=true）', async () => {
    let calls = 0;
    mocks.createImpl = () => {
      calls++;
      if (calls === 1) return okCompletion('抱歉，这不是 JSON');
      return okCompletion(JSON.stringify({ title: 'T', content: 'C 词', terms: [{ term: '词', definition: 'd' }] }));
    };
    const res = await generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' });
    expect(calls).toBe(2);
    expect(res.retried).toBe(true);
    expect(res.title).toBe('T');
  });

  it('重试仍非法 JSON -> AI_RESPONSE_INVALID_JSON / 502', async () => {
    mocks.createImpl = () => okCompletion('not json at all');
    await expect(
      generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' }),
    ).rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID_JSON', statusCode: 502 });
  });

  it('SDK 429 -> E_AI_RATE_LIMIT / 429', async () => {
    mocks.createImpl = () => {
      throw sdkError('rate limited', { status: 429 });
    };
    await expect(
      generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' }),
    ).rejects.toMatchObject({ code: ErrorCode.AI_RATE_LIMIT, statusCode: 429 });
  });

  it('SDK 401 -> E_INVALID_API_KEY / 401', async () => {
    mocks.createImpl = () => {
      throw sdkError('invalid key', { status: 401 });
    };
    await expect(
      generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_API_KEY, statusCode: 401 });
  });

  it('SDK 超时 -> E_AI_TIMEOUT / 504', async () => {
    mocks.createImpl = () => {
      throw sdkError('Request timed out', { name: 'APIConnectionTimeoutError' });
    };
    await expect(
      generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' }),
    ).rejects.toMatchObject({ code: ErrorCode.AI_TIMEOUT, statusCode: 504 });
  });

  it('SDK 5xx -> E_AI_ERROR / 502', async () => {
    mocks.createImpl = () => {
      throw sdkError('upstream boom', { status: 500 });
    };
    await expect(
      generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' }),
    ).rejects.toMatchObject({ code: ErrorCode.AI_ERROR, statusCode: 502 });
  });

  it('父卡内容超长截断至 4000 字', async () => {
    let captured = '';
    mocks.createImpl = (params: any) => {
      captured = params.messages[1].content as string;
      return okCompletion(JSON.stringify({ title: 'T', content: 'C', terms: [] }));
    };
    const longContent = 'x'.repeat(5000);
    await generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: longContent });
    expect(captured).toContain('x'.repeat(4000));
    expect(captured).not.toContain('x'.repeat(4001));
  });

  it('客户端配置：baseURL 默认 DeepSeek、maxRetries=3、timeout 透传', async () => {
    mocks.createImpl = () => okCompletion(JSON.stringify({ title: 'T', content: 'C', terms: [] }));
    await generateChildCard({ ...BASE, mode: 'child', parentTitle: 'P', parentContent: 'C' });
    const opts = mocks.clientOptions[0];
    expect(opts.baseURL).toBe('https://api.deepseek.com');
    expect(opts.maxRetries).toBe(3);
    expect(opts.timeout).toBe(60000);
  });
});

describe('testConnection', () => {
  it('成功返回 latencyMs 与 model', async () => {
    mocks.createImpl = () => okCompletion('pong');
    const res = await testConnection(BASE);
    expect(res.model).toBe('deepseek-v4-flash');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('无 Key 由调用方拒绝（SDK 层只映射 401）', async () => {
    mocks.createImpl = () => {
      throw sdkError('unauthorized', { status: 401 });
    };
    await expect(testConnection(BASE)).rejects.toBeInstanceOf(AiError);
  });
});

describe('buildSuggestionsPrompt', () => {
  it('构建 system + user，包含父卡片信息', () => {
    const { system, user } = buildSuggestionsPrompt({
      parentTitle: '机器学习',
      parentContent: '监督学习内容',
    });
    expect(system).toContain('分支建议引擎');
    expect(system).toContain('child');
    expect(system).toContain('divergent');
    expect(system).toContain('branch');
    expect(user).toContain('机器学习');
    expect(user).toContain('监督学习内容');
  });

  it('有 instruction 时追加用户补充意图段', () => {
    const { user } = buildSuggestionsPrompt({
      parentTitle: '机器学习',
      parentContent: '监督学习内容',
      instruction: '重点关注深度学习',
    });
    expect(user).toContain('用户补充意图');
    expect(user).toContain('重点关注深度学习');
  });

  it('无 instruction 时不追加补充意图段', () => {
    const { user } = buildSuggestionsPrompt({
      parentTitle: 'T',
      parentContent: 'C',
    });
    expect(user).not.toContain('用户补充意图');
  });
});

describe('generateSuggestions', () => {
  it('成功解析 JSON，返回 3 条建议', async () => {
    mocks.createImpl = () =>
      okCompletion(
        JSON.stringify({
          suggestions: [
            { type: 'child', title: '监督学习算法', reason: '深入拆解子主题' },
            { type: 'divergent', title: '无监督学习', reason: '探索相邻领域' },
            { type: 'branch', title: '过拟合问题', reason: '独立深入探讨' },
          ],
        }),
      );

    const res = await generateSuggestions({
      ...BASE,
      parentTitle: '机器学习',
      parentContent: '监督学习是机器学习的核心方法',
    });

    expect(res.suggestions).toHaveLength(3);
    expect(res.suggestions[0].type).toBe('child');
    expect(res.suggestions[1].type).toBe('divergent');
    expect(res.suggestions[2].type).toBe('branch');
    expect(res.suggestions[0].title).toBe('监督学习算法');
    expect(res.suggestions[0].reason).toBe('深入拆解子主题');
    expect(res.meta.model).toBe('deepseek-v4-flash');
    expect(res.meta.retried).toBe(false);
  });

  it('宽松过滤：只保留合法条目，不足 3 条触发重试', async () => {
    let calls = 0;
    mocks.createImpl = () => {
      calls++;
      return okCompletion(
        JSON.stringify({
          suggestions: [
            { type: 'child', title: '有效标题', reason: '有效原因不超过四十字' },
            { type: 'invalid', title: '无效类型', reason: '会被过滤' },
            { type: 'child', title: 'title_too_long_1234567890', reason: '标题超长应被过滤' },
            { type: 'divergent', title: '短标题', reason: 'reason_string_that_is_too_long_1234567890123456789012345678901234567890' },
          ],
        }),
      );
    };

    const res = await generateSuggestions({
      ...BASE,
      parentTitle: 'P',
      parentContent: 'C',
    });

    // 不足 3 条 → 触发重试；重试后仍不足 3 条但 ≥1 条 → 返回现有
    expect(calls).toBe(2);
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0].type).toBe('child');
    expect(res.suggestions[0].title).toBe('有效标题');
    expect(res.meta.retried).toBe(true);
  });

  it('不足 3 条触发重试，重试后够 3 条返回正确', async () => {
    let calls = 0;
    mocks.createImpl = () => {
      calls++;
      if (calls === 1) {
        return okCompletion(
          JSON.stringify({
            suggestions: [
              { type: 'child', title: '仅有一条', reason: '不足三条' },
            ],
          }),
        );
      }
      return okCompletion(
        JSON.stringify({
          suggestions: [
            { type: 'child', title: '深入主题', reason: '拆解子主题' },
            { type: 'divergent', title: '横向探索', reason: '相邻领域' },
            { type: 'branch', title: '分支独立', reason: '独立成支' },
          ],
        }),
      );
    };

    const res = await generateSuggestions({
      ...BASE,
      parentTitle: 'P',
      parentContent: 'C',
    });

    expect(calls).toBe(2);
    expect(res.suggestions).toHaveLength(3);
    expect(res.meta.retried).toBe(true);
  });

  it('首次输出非法 -> 重试 1 次后成功', async () => {
    let calls = 0;
    mocks.createImpl = () => {
      calls++;
      if (calls === 1) return okCompletion('不是 JSON');
      return okCompletion(
        JSON.stringify({
          suggestions: [
            { type: 'child', title: '重试成功', reason: '第二次尝试正确' },
            { type: 'divergent', title: '发散主题', reason: '探索相邻方向' },
            { type: 'branch', title: '分支主题', reason: '独立深入探讨' },
          ],
        }),
      );
    };

    const res = await generateSuggestions({
      ...BASE,
      parentTitle: 'P',
      parentContent: 'C',
    });

    expect(calls).toBe(2);
    expect(res.suggestions).toHaveLength(3);
    expect(res.meta.retried).toBe(true);
  });

  it('重试仍非法 -> AI_RESPONSE_INVALID_JSON / 502', async () => {
    mocks.createImpl = () => okCompletion('not json at all');
    await expect(
      generateSuggestions({ ...BASE, parentTitle: 'P', parentContent: 'C' }),
    ).rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID_JSON', statusCode: 502 });
  });

  it('SDK 429 -> E_AI_RATE_LIMIT / 429', async () => {
    mocks.createImpl = () => {
      throw sdkError('rate limited', { status: 429 });
    };
    await expect(
      generateSuggestions({ ...BASE, parentTitle: 'P', parentContent: 'C' }),
    ).rejects.toMatchObject({ code: ErrorCode.AI_RATE_LIMIT, statusCode: 429 });
  });

  it('SDK 401 -> E_INVALID_API_KEY / 401', async () => {
    mocks.createImpl = () => {
      throw sdkError('invalid key', { status: 401 });
    };
    await expect(
      generateSuggestions({ ...BASE, parentTitle: 'P', parentContent: 'C' }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_API_KEY, statusCode: 401 });
  });
});
