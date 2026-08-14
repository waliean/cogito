// ============================================================
// i18n 初始化 —— react-i18next + i18next（单 translation 命名空间）
// lng 兜底 resolveLanguage('system', navigator.language)
// ============================================================

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LanguagePreference } from '@cogito/shared';
import { zh } from './locales/zh.js';
import { en } from './locales/en.js';

export type ResolvedLang = 'zh' | 'en';

/** 解析语言偏好：'zh'/'en' 直接返回；'system' 或非法值按系统 locale 推导（zh 开头 → zh，否则 en） */
export function resolveLanguage(pref: LanguagePreference | undefined, systemLocale?: string): ResolvedLang {
  if (pref === 'zh') return 'zh';
  if (pref === 'en') return 'en';
  const s = (systemLocale ?? '').toLowerCase();
  return s.startsWith('zh') ? 'zh' : 'en';
}

/** 将界面语言同步到偏好（默认 'system' 时由当前系统 locale 决定） */
export function syncLanguage(pref: LanguagePreference | undefined): ResolvedLang {
  const lang = resolveLanguage(pref, typeof navigator !== 'undefined' ? navigator.language : undefined);
  void i18n.changeLanguage(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = i18n.getFixedT(lang)('app.title');
  }
  const api = (window as any).cogitoAPI;
  api?.setLanguage?.(lang);
  return lang;
}

void i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: resolveLanguage('system', typeof navigator !== 'undefined' ? navigator.language : undefined),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

export default i18n;
