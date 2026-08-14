// ============================================================
// 错误码 -> 用户友好文案（design.md 5.5）
// 文案统一从 i18n 资源 errors.* 读取（zh.ts / en.ts）
// ============================================================

import i18n from '../i18n/index.js';

export function errorMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return i18n.t(`errors.${code}`, { defaultValue: fallback });
}

/** 从任意 Error/ApiError 提取展示文案，附带后端返回的详细错误信息 */
export function describeError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null | undefined;
  if (!e) return i18n.t('errors.E_UNKNOWN');
  const base = errorMessage(e.code, e.message ?? i18n.t('errors.E_UNKNOWN'));
  // 对于 AI 错误，将后端返回的详细 message 追加到用户友好文案后面
  if (e.code === 'E_AI_ERROR' && e.message && e.message !== base) {
    return i18n.t('commonErrorDetail', { base, detail: e.message });
  }
  return base;
}