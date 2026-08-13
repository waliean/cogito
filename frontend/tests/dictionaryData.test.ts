// ============================================================
// dictionaryData.test.ts —— 词典数据完整性验证
// ============================================================

import { describe, it, expect } from 'vitest';
import { DICTIONARY_SECTIONS } from '../src/data/dictionary.js';
import { escapeRegExp } from '../src/utils/terms.js';

describe('DICTIONARY_SECTIONS 数据完整性', () => {
  it('应有 7 个分组', () => {
    expect(DICTIONARY_SECTIONS.length).toBe(7);
  });

  it('总词条数 >= 60', () => {
    const total = DICTIONARY_SECTIONS.reduce((a, s) => a + s.entries.length, 0);
    expect(total).toBeGreaterThanOrEqual(60);
  });

  it('每条 entry 的 description 非空', () => {
    for (const section of DICTIONARY_SECTIONS) {
      for (const entry of section.entries) {
        expect(entry.description).toBeTruthy();
      }
    }
  });

  it('每条 entry 的 terms.length >= 1', () => {
    for (const section of DICTIONARY_SECTIONS) {
      for (const entry of section.entries) {
        expect(entry.terms.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('terms 中不包含空串', () => {
    for (const section of DICTIONARY_SECTIONS) {
      for (const entry of section.entries) {
        for (const term of entry.terms) {
          expect(term).not.toBe('');
        }
      }
    }
  });

  it('key 唯一', () => {
    const keys = new Set<string>();
    for (const section of DICTIONARY_SECTIONS) {
      for (const entry of section.entries) {
        expect(keys.has(entry.key)).toBe(false);
        keys.add(entry.key);
      }
    }
  });

  it('每条 body 非空', () => {
    for (const section of DICTIONARY_SECTIONS) {
      for (const entry of section.entries) {
        expect(entry.body).toBeTruthy();
      }
    }
  });

  it('所有 entry.terms 中的词都能被 escapeRegExp 安全转义', () => {
    for (const section of DICTIONARY_SECTIONS) {
      for (const entry of section.entries) {
        for (const term of entry.terms) {
          const escaped = escapeRegExp(term);
          // 能被 new RegExp 正常构建
          const re = new RegExp(escaped, 'i');
          expect(re.test(term)).toBe(true);
          // 特殊字符被转义后不应包含原始特殊字符
          if (/[.*+?^${}()|[\]\\]/.test(term)) {
            expect(escaped).not.toBe(term);
          }
        }
      }
    }
  });
});