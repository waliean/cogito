import { describe, it, expect, afterAll } from 'vitest';
import i18n, { resolveLanguage } from '../src/i18n/index.js';
import { describeError } from '../src/utils/errorMessages.js';

describe('resolveLanguage', () => {
  it('returns explicit preference', () => {
    expect(resolveLanguage('zh', 'en-US')).toBe('zh');
    expect(resolveLanguage('en', 'zh-CN')).toBe('en');
  });

  it('follows system locale for "system" preference', () => {
    expect(resolveLanguage('system', 'zh-TW')).toBe('zh');
    expect(resolveLanguage('system', 'en-US')).toBe('en');
    expect(resolveLanguage('system', 'fr-FR')).toBe('en');
  });

  it('treats invalid/undefined preference as system', () => {
    expect(resolveLanguage(undefined, 'zh-CN')).toBe('zh');
    expect(resolveLanguage('fr' as any, 'en-US')).toBe('en');
  });
});

describe('describeError (i18n)', () => {
  afterAll(() => {
    void i18n.changeLanguage('zh');
  });

  it('maps error code to Chinese by default (zh)', () => {
    expect(describeError({ code: 'E_NO_API_KEY' })).toBe(
      '尚未配置 API Key，请在右上角「设置」中配置后重试',
    );
  });

  it('appends backend message for E_AI_ERROR', () => {
    expect(describeError({ code: 'E_AI_ERROR', message: 'backend msg' })).toBe(
      'AI 服务出错：backend msg',
    );
  });

  it('falls back to unknown / raw message', () => {
    expect(describeError(undefined)).toBe('未知错误');
    expect(describeError({ message: 'raw fallback' })).toBe('raw fallback');
  });

  it('switches to English when language is en', async () => {
    await i18n.changeLanguage('en');
    expect(describeError({ code: 'E_NO_API_KEY' })).toBe(
      'No API Key configured. Configure it in the top-right Settings and retry',
    );
    expect(describeError({ code: 'E_AI_ERROR', message: 'backend msg' })).toBe(
      'AI service error: backend msg',
    );
    await i18n.changeLanguage('zh');
  });
});
