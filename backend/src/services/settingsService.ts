// ============================================================
// 设置服务 —— settings 的读写与 API Key 解析
// Key 来源优先级（design.md 3.2 + M2 扩展）：
//   X-API-Key 请求头（req.aiApiKey） > settings.apiKey > env DEEPSEEK_API_KEY
// ============================================================

import type { PublicSettings, Settings, TermDictStyle } from '@cogito/shared';
import { getState, mutate } from './storage.js';
import { appError } from './cardService.js';
import { ErrorCode } from '@cogito/shared';

export const DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-flash';
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_TIMEOUT_MS = 60000;
export const DEFAULT_DICT_TERM_STYLE: TermDictStyle = 'italic';

function envApiKey(): string | undefined {
  const key = process.env.DEEPSEEK_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

function toPublic(s: Settings): PublicSettings {
  return {
    hasApiKey: !!s.apiKey || !!envApiKey(),
    baseUrl: s.baseUrl,
    model: s.model,
    temperature: s.temperature,
    timeoutMs: s.timeoutMs,
    dictTermStyle: s.dictTermStyle || DEFAULT_DICT_TERM_STYLE,
  };
}

/** GET /api/settings —— 永不含 Key 明文 */
export function getPublicSettings(): PublicSettings {
  return toPublic(getState().settings);
}

/** 服务端内部全量设置（含 Key） */
export function getEffectiveSettings(): Settings {
  return getState().settings;
}

/**
 * 解析本次请求生效的 API Key。
 * 优先级：header > settings.apiKey > env DEEPSEEK_API_KEY（第三级兜底，M2 扩展）。
 */
export function resolveApiKey(headerKey?: string): string | undefined {
  if (headerKey && headerKey.trim()) return headerKey.trim();
  const stored = getState().settings.apiKey;
  if (stored && stored.trim()) return stored.trim();
  return envApiKey();
}

/** 是否已配置任意可用 Key（设置页/健康检查用） */
export function hasApiKeyConfigured(): boolean {
  return resolveApiKey() !== undefined;
}

/**
 * 更新设置。
 * - apiKey 传空字符串 -> 清除
 * - temperature 钳制 [0, 2]；timeoutMs 钳制 [5000, 300000]
 */
export async function updateSettings(
  patch: Partial<Pick<Settings, 'apiKey' | 'baseUrl' | 'model' | 'temperature' | 'timeoutMs' | 'dictTermStyle'>>,
): Promise<PublicSettings> {
  return mutate((db) => {
    const s = db.settings;

    if (patch.apiKey !== undefined) {
      const key = patch.apiKey.trim();
      s.apiKey = key === '' ? undefined : key;
    }
    if (patch.baseUrl !== undefined) {
      s.baseUrl = patch.baseUrl.trim() || DEFAULT_BASE_URL;
    }
    if (patch.model !== undefined) {
      s.model = patch.model.trim() || DEFAULT_MODEL;
    }
    if (patch.temperature !== undefined) {
      const t = Number(patch.temperature);
      if (!Number.isFinite(t) || t < 0 || t > 2) {
        throw appError(ErrorCode.VALIDATION, 'temperature must be in [0, 2]');
      }
      s.temperature = t;
    }
    if (patch.timeoutMs !== undefined) {
      const t = Number(patch.timeoutMs);
      if (!Number.isFinite(t) || t < 5000 || t > 300000) {
        throw appError(ErrorCode.VALIDATION, 'timeoutMs must be in [5000, 300000]');
      }
      s.timeoutMs = t;
    }

    if (patch.dictTermStyle !== undefined) {
      if (!['italic', 'bold', 'underline'].includes(patch.dictTermStyle)) {
        throw appError(ErrorCode.VALIDATION, 'dictTermStyle must be italic|bold|underline');
      }
      s.dictTermStyle = patch.dictTermStyle;
    }

    return toPublic(s);
  });
}
