// ============================================================
// terms.ts —— 术语工具函数（共享给 TermText / MarkdownView）
// ============================================================

import type { TermHighlight } from '@cogito/shared';
import { DICTIONARY_SECTIONS } from '../data/dictionary.js';

/**
 * 转义字符串中的正则特殊字符
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 对 TermHighlight 数组去重并按长度降序排列
 * 最长优先确保匹配不会重叠（如 "Long Term" 优先于 "Long"）
 */
export function sortTerms(terms: TermHighlight[]): TermHighlight[] {
  return [...new Map(terms.map((t) => [t.term, t])).values()].sort(
    (a, b) => b.term.length - a.term.length,
  );
}

/**
 * 从排序后的术语构建全局不区分大小写的正则
 */
export function buildTermRegex(terms: TermHighlight[]): RegExp {
  const sorted = sortTerms(terms);
  return new RegExp(sorted.map((t) => escapeRegExp(t.term)).join('|'), 'gi');
}

/** 一次匹配结果 */
export interface TermMatch {
  /** 匹配的文本 */
  text: string;
  /** 匹配在原字符串中的位置 */
  index: number;
  /** 匹配到的术语对象（含定义） */
  term: TermHighlight;
}

/**
 * 对文本执行最长优先的术语匹配，返回所有匹配结果
 * 统一 TermText(React) 和 MarkdownView(TreeWalker) 的匹配逻辑
 */
export function matchTerms(text: string, terms: TermHighlight[]): TermMatch[] {
  if (!text || !terms || terms.length === 0) return [];
  const unique = sortTerms(terms);
  const regex = buildTermRegex(terms);
  const results: TermMatch[] = [];
  for (const match of text.matchAll(regex)) {
    const matched = unique.find((t) => t.term.toLowerCase() === match[0].toLowerCase());
    if (matched) {
      results.push({ text: match[0], index: match.index ?? 0, term: matched });
    }
  }
  return results;
}

/* ========== 词典术语集成 ========== */

/** 模块级缓存 */
let _dictTerms: TermHighlight[] | null = null;

/**
 * 将 DICTIONARY_SECTIONS 展开为 TermHighlight 数组（含 dictKey）
 */
export function getDictionaryTerms(): TermHighlight[] {
  if (_dictTerms) return _dictTerms;
  _dictTerms = [];
  for (const section of DICTIONARY_SECTIONS) {
    for (const entry of section.entries) {
      for (const term of entry.terms) {
        _dictTerms.push({
          term,
          definition: entry.description,
          dictKey: entry.key,
        });
      }
    }
  }
  return _dictTerms;
}

/**
 * 将卡片术语与词典术语合并，卡片术语优先（同文本时保留卡片定义）
 */
export function mergeWithDictionary(terms: TermHighlight[]): TermHighlight[] {
  // 词典术语在前，卡片术语在后，使 sortTerms 的 Map 去重保留卡片（最后写入）
  return [...getDictionaryTerms(), ...terms];
}