// ============================================================
// AI 服务 —— openai SDK 封装（design.md 第 5 节 / ADR-002）
// JSON 模式、超时、SDK 重试(3) + 解析重试(1)、错误码映射
// ============================================================

import OpenAI from 'openai';
import type { GenerationMode, TermHighlight, Suggestion, GenerateSuggestionsResult } from '@cogito/shared';
import { ErrorCode } from '@cogito/shared';
import { buildGeneratePrompt, GENERATE_RETRY_HINT } from '../prompts/generate.js';
import { buildSummarizePrompt, SUMMARIZE_RETRY_HINT } from '../prompts/summarize.js';
import { buildSuggestionsPrompt, SUGGESTIONS_RETRY_HINT } from '../prompts/suggestions.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const MAX_PARENT_CONTENT_CHARS = 4000;
const MAX_TERMS = 8;

export interface AiCallParams {
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

export interface GenerateChildParams extends AiCallParams {
  mode: GenerationMode;
  parentTitle: string;
  parentContent: string;
  instruction?: string;
}

export interface GeneratedCard {
  title: string;
  content: string;
  terms: TermHighlight[];
}

export interface GenerateResult extends GeneratedCard {
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  retried: boolean;
}

export interface TestResult {
  latencyMs: number;
  model: string;
}

export interface SummarizeParams extends AiCallParams {
  fileName: string;
  textSnippet: string;
}

export interface SummarizeResult {
  title: string;
  summary: string;
  terms: TermHighlight[];
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  retried: boolean;
}

// ---- 错误 ----

export class AiError extends Error {
  code: string;
  statusCode: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    meta: {
      model: string;
      promptTokens: number;
      completionTokens: number;
      latencyMs: number;
    },
  ) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.statusCode = statusCode;
    this.model = meta.model;
    this.promptTokens = meta.promptTokens;
    this.completionTokens = meta.completionTokens;
    this.latencyMs = meta.latencyMs;
  }
}

function mapSdkError(
  err: unknown,
  model: string,
  latencyMs: number,
  promptTokens = 0,
  completionTokens = 0,
): AiError {
  const e = err as { status?: number; name?: string; message?: string; code?: string };
  const meta = { model, promptTokens, completionTokens, latencyMs };

  if (e?.status === 401) {
    return new AiError(ErrorCode.INVALID_API_KEY, 401, 'API key invalid or unauthorized', meta);
  }
  if (e?.status === 429) {
    return new AiError(
      ErrorCode.AI_RATE_LIMIT,
      429,
      'AI service rate limited, please retry later',
      meta,
    );
  }
  if (typeof e?.status === 'number' && e.status >= 500) {
    return new AiError(ErrorCode.AI_ERROR, 502, 'AI upstream service error', meta);
  }

  const isTimeout =
    e?.name === 'APIConnectionTimeoutError' ||
    e?.code === 'ETIMEDOUT' ||
    (typeof e?.message === 'string' && /timeout/i.test(e.message));
  if (isTimeout) {
    return new AiError(ErrorCode.AI_TIMEOUT, 504, 'AI request timed out', meta);
  }

  return new AiError(ErrorCode.AI_ERROR, 502, e?.message ?? 'AI request failed', meta);
}

// ---- 解析与校验（design.md 5.4） ----

function extractJsonObject(raw: string): unknown {
  let text = raw.trim();
  // 剥离 ```json 围栏
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  // 截取首个 { 到最后一个 }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validateGeneratedCard(parsed: unknown): GeneratedCard | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;

  if (typeof p.title !== 'string' || !p.title.trim()) return null;
  if (typeof p.content !== 'string' || !p.content.trim()) return null;

  const terms: TermHighlight[] = [];
  if (Array.isArray(p.terms)) {
    for (const t of p.terms.slice(0, MAX_TERMS)) {
      if (!t || typeof t !== 'object') continue;
      const termVal = (t as Record<string, unknown>).term;
      const defVal = (t as Record<string, unknown>).definition;
      if (typeof termVal !== 'string' || !termVal.trim() || typeof defVal !== 'string') {
        continue;
      }
      const term = termVal.trim();
      // 过滤未逐字出现在 content 中的 term
      if (p.content.includes(term)) {
        terms.push({ term, definition: defVal.trim() });
      }
    }
  }

  return { title: p.title.trim(), content: p.content.trim(), terms };
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length <= maxLen ? text : text.slice(0, maxLen);
}

interface SummarizeDoc {
  title: string;
  summary: string;
  terms: TermHighlight[];
}

function validateSummarizedDoc(parsed: unknown): SummarizeDoc | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;

  if (typeof p.title !== 'string' || !p.title.trim()) return null;
  if (typeof p.summary !== 'string' || !p.summary.trim()) return null;

  const terms: TermHighlight[] = [];
  if (Array.isArray(p.terms)) {
    for (const t of p.terms.slice(0, MAX_TERMS)) {
      if (!t || typeof t !== 'object') continue;
      const termVal = (t as Record<string, unknown>).term;
      const defVal = (t as Record<string, unknown>).definition;
      if (typeof termVal !== 'string' || !termVal.trim() || typeof defVal !== 'string') {
        continue;
      }
      const term = termVal.trim();
      if (p.summary.includes(term)) {
        terms.push({ term, definition: defVal.trim() });
      }
    }
  }

  return { title: p.title.trim(), summary: p.summary.trim(), terms };
}

// ---- 客户端 ----

function createClient(p: AiCallParams): OpenAI {
  return new OpenAI({
    apiKey: p.apiKey,
    baseURL: p.baseUrl || DEFAULT_BASE_URL,
    maxRetries: 3,
    timeout: p.timeoutMs,
  });
}

async function chatComplete(
  client: OpenAI,
  p: AiCallParams,
  system: string,
  user: string,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return client.chat.completions.create({
    model: p.model,
    temperature: p.temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
}

// ---- 公开接口 ----

/** 生成子卡片（同步请求；解析失败重试 1 次） */
export async function generateChildCard(params: GenerateChildParams): Promise<GenerateResult> {
  const client = createClient(params);
  const { system, user } = buildGeneratePrompt({
    mode: params.mode,
    parentTitle: params.parentTitle,
    parentContent: truncate(params.parentContent, MAX_PARENT_CONTENT_CHARS),
    instruction: params.instruction,
  });

  const start = Date.now();

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await chatComplete(client, params, system, user);
  } catch (err) {
    throw mapSdkError(err, params.model, Date.now() - start);
  }

  let parsed = validateGeneratedCard(
    extractJsonObject(completion.choices[0]?.message?.content ?? ''),
  );
  let retried = false;

  if (!parsed) {
    retried = true;
    try {
      const retryCompletion = await chatComplete(
        client,
        params,
        system,
        user + '\n\n' + GENERATE_RETRY_HINT,
      );
      completion = retryCompletion;
      parsed = validateGeneratedCard(
        extractJsonObject(retryCompletion.choices[0]?.message?.content ?? ''),
      );
    } catch (err) {
      throw mapSdkError(err, params.model, Date.now() - start);
    }
  }

  if (!parsed) {
    throw new AiError('AI_RESPONSE_INVALID_JSON', 502, 'AI response was not valid JSON', {
      model: params.model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    });
  }

  return {
    ...parsed,
    model: params.model,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - start,
    retried,
  };
}

/** 设置页「测试连接」：一次极简对话验证连通性 */
export async function testConnection(params: AiCallParams): Promise<TestResult> {
  const client = createClient(params);
  const start = Date.now();
  try {
    await client.chat.completions.create({
      model: params.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    });
    return { latencyMs: Date.now() - start, model: params.model };
  } catch (err) {
    throw mapSdkError(err, params.model, Date.now() - start);
  }
}

/** 文档摘要（design.md 6.5；解析失败重试 1 次） */
export async function summarizeDocument(params: SummarizeParams): Promise<SummarizeResult> {
  const client = createClient(params);
  const { system, user } = buildSummarizePrompt({
    fileName: params.fileName,
    textSnippet: truncate(params.textSnippet, 12000),
  });

  const start = Date.now();

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await chatComplete(client, params, system, user);
  } catch (err) {
    throw mapSdkError(err, params.model, Date.now() - start);
  }

  let parsed = validateSummarizedDoc(
    extractJsonObject(completion.choices[0]?.message?.content ?? ''),
  );
  let retried = false;

  if (!parsed) {
    retried = true;
    try {
      const retryCompletion = await chatComplete(
        client,
        params,
        system,
        user + '\n\n' + SUMMARIZE_RETRY_HINT,
      );
      completion = retryCompletion;
      parsed = validateSummarizedDoc(
        extractJsonObject(retryCompletion.choices[0]?.message?.content ?? ''),
      );
    } catch (err) {
      throw mapSdkError(err, params.model, Date.now() - start);
    }
  }

  if (!parsed) {
    throw new AiError('AI_RESPONSE_INVALID_JSON', 502, 'AI response was not valid JSON', {
      model: params.model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    });
  }

  return {
    ...parsed,
    model: params.model,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - start,
    retried,
  };
}


// ============================================================
// 释义相似性比较（LLM 评判，带缓存）
// ============================================================

export interface CompareDefsParams extends AiCallParams {
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeoutMs: number;
}

export interface CompareDefsResult {
  similar: boolean;
  reason: string;
}

const _compareCache = new Map<string, CompareDefsResult>();

function compareCacheKey(term: string, def1: string, def2: string): string {
  const n1 = def1.trim().toLowerCase().replace(/\s+/g, ' ');
  const n2 = def2.trim().toLowerCase().replace(/\s+/g, ' ');
  return term.toLowerCase() + '|' + n1 + '|' + n2;
}

const COMPARE_SYSTEM_PROMPT = '你是一个专业术语管理助手。判断两个术语释义是否表达相同或相近的含义。\n规则：如果描述同一个概念，similar: true；如果描述不同概念或角度，similar: false。\n只返回 JSON：{"similar": true/false, "reason": "简短原因（中文，≤30字）"}';

export async function compareDefinitions(
  params: CompareDefsParams,
  term: string,
  definition1: string,
  definition2: string,
): Promise<CompareDefsResult> {
  const key = compareCacheKey(term, definition1, definition2);
  const cached = _compareCache.get(key);
  if (cached) return cached;

  const client = createClient(params);
  const userPrompt = '术语：' + term + '\n释义1：' + definition1 + '\n释义2：' + definition2 + '\n\n这两个释义含义是否相同或相近？';

  try {
    const completion = await client.chat.completions.create({
      model: params.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: COMPARE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content ?? '';
    const parsed = extractJsonObject(raw) as Record<string, unknown> | null;
    const result: CompareDefsResult = {
      similar: parsed?.similar === true,
      reason: typeof parsed?.reason === 'string' ? parsed.reason : '',
    };
    _compareCache.set(key, result);
    return result;
  } catch {
    const fallback = { similar: false, reason: 'LLM 评判失败，视为不同释义' };
    _compareCache.set(key, fallback);
    return fallback;
  }
}

export function clearCompareCache(): void {
  _compareCache.clear();
}

// ---- 分支建议 ----

const VALID_SUGGESTION_TYPES = new Set(['child', 'divergent', 'branch']);

export interface GenerateSuggestionsParams extends AiCallParams {
  parentTitle: string;
  parentContent: string;
  instruction?: string;
}

function validateSuggestions(parsed: unknown): Suggestion[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const p = parsed as Record<string, unknown>;
  const raw = p.suggestions;
  if (!Array.isArray(raw)) return [];

  const results: Suggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const type = s.type as string;
    const title = typeof s.title === 'string' ? s.title.trim() : '';
    const reason = typeof s.reason === 'string' ? s.reason.trim() : '';
    if (!VALID_SUGGESTION_TYPES.has(type)) continue;
    if (!title || title.length > 20) continue;
    if (!reason || reason.length > 40) continue;
    results.push({ type: type as Suggestion['type'], title, reason });
  }
  return results;
}

/** 生成分支建议（解析失败重试 1 次） */
export async function generateSuggestions(
  params: GenerateSuggestionsParams,
): Promise<GenerateSuggestionsResult> {
  const client = createClient(params);
  const { system, user } = buildSuggestionsPrompt({
    parentTitle: params.parentTitle,
    parentContent: truncate(params.parentContent, MAX_PARENT_CONTENT_CHARS),
    instruction: params.instruction,
  });

  const start = Date.now();

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await chatComplete(client, params, system, user);
  } catch (err) {
    throw mapSdkError(err, params.model, Date.now() - start);
  }

  let parsed = extractJsonObject(completion.choices[0]?.message?.content ?? '');
  let suggestions = validateSuggestions(parsed);
  let retried = false;

  // H2：不足 3 条或三种 type 不齐 → 重试
  if (suggestions.length < 3) {
    retried = true;
    try {
      const retryCompletion = await chatComplete(
        client,
        params,
        system,
        user + '\n\n' + SUGGESTIONS_RETRY_HINT,
      );
      completion = retryCompletion;
      parsed = extractJsonObject(retryCompletion.choices[0]?.message?.content ?? '');
      suggestions = validateSuggestions(parsed);
    } catch (err) {
      throw mapSdkError(err, params.model, Date.now() - start);
    }
  }

  if (suggestions.length < 1) {
    throw new AiError('AI_RESPONSE_INVALID_JSON', 502, 'AI response was not valid JSON', {
      model: params.model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    });
  }

  return {
    suggestions,
    meta: {
      model: params.model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
      retried,
    },
  };
}
