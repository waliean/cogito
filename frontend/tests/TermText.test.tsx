// ============================================================
// TermText.test.tsx —— 术语高亮：匹配/大小写/最长优先/activeTerm/词典术语
// ============================================================

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TermText } from '../src/components/terms/TermText.js';
import { useSettingsStore } from '../src/state/store.js';
import { getDictionaryTerms, mergeWithDictionary, matchTerms, escapeRegExp } from '../src/utils/terms.js';

describe('TermText', () => {
  it('高亮匹配术语并渲染为 mark', () => {
    const html = renderToStaticMarkup(
      <TermText text="Chain-of-Thought 是核心方法" terms={[{ term: 'Chain-of-Thought', definition: '链式思考' }]} />,
    );
    expect(html).toContain('<mark class="term-hl"');
    expect(html).toContain('data-term="Chain-of-Thought"');
    // 定义通过自定义 tooltip 展示（onMouseEnter 调用 showTermTooltip），不再使用原生 title
    expect(html).not.toContain('title="');
  });

  it('大小写不敏感匹配', () => {
    const html = renderToStaticMarkup(
      <TermText text="cot 与 COT 都算" terms={[{ term: 'CoT' }]} />,
    );
    const marks = html.match(/<mark/g)?.length ?? 0;
    expect(marks).toBe(2);
  });

  it('最长优先避免重叠（Long 优先于 Long Term）', () => {
    const html = renderToStaticMarkup(
      <TermText text="Long Term 概念" terms={[{ term: 'Long' }, { term: 'Long Term' }]} />,
    );
    // 只有一次包裹，且是 Long Term
    const marks = html.match(/<mark/g)?.length ?? 0;
    expect(marks).toBe(1);
    expect(html).toContain('<mark class="term-hl" data-term="Long Term"');
  });

  it('activeTerm 只对匹配项加 active class', () => {
    const html = renderToStaticMarkup(
      <TermText
        text="A 与 B"
        terms={[{ term: 'A' }, { term: 'B' }]}
        activeTerm="A"
      />,
    );
    expect(html).toContain('<mark class="term-hl active"');
    expect(html).toContain('class="term-hl"');
  });

  it('无 terms 或空文本原样输出', () => {
    expect(renderToStaticMarkup(<TermText text="plain" terms={[]} />)).toContain('plain');
    expect(renderToStaticMarkup(<TermText text="" terms={[{ term: 'x' }]} />)).toContain('');
  });

  it('词典词条渲染为 span.term-dict（默认 italic 样式）', () => {
    // 默认 dictTermStyle 为 italic（settings 为 null 时用默认值）
    const html = renderToStaticMarkup(
      <TermText text="Token 和上下文窗口" terms={[]} />,
    );
    // 词典词条应渲染为 span.term-dict
    expect(html).toContain('<span class="term-dict term-dict-italic"');
    // 不应出现 mark.term-hl
    expect(html).not.toContain('<mark');
    // 应包含词典术语文本
    expect(html).toContain('data-term="Token"');
    expect(html).toContain('data-term="上下文窗口"');
  });

  it('同文本时卡片术语渲染为 mark.term-hl 而非 span.term-dict', () => {
    // 卡片术语 "Token" 应覆盖词典术语，渲染为 mark 而非 span
    const cardTerms = [{ term: 'Token', definition: '卡片定义' }];
    const html = renderToStaticMarkup(
      <TermText text="Token 和上下文窗口" terms={cardTerms} />,
    );
    // 应渲染为 mark.term-hl
    expect(html).toContain('<mark class="term-hl"');
    expect(html).toContain('data-term="Token"');
    // 不应出现 span.term-dict 包裹 Token
    expect(html).not.toContain('<span class="term-dict"');
  });
});

describe('getDictionaryTerms / mergeWithDictionary', () => {
  it('getDictionaryTerms 返回非空数组', () => {
    const terms = getDictionaryTerms();
    expect(terms.length).toBeGreaterThan(0);
    // 每个 term 应有 dictKey
    for (const t of terms) {
      expect(t.dictKey).toBeTruthy();
    }
  });

  it('mergeWithDictionary + matchTerms 卡片术语优先', () => {
    const cardTerms = [{ term: 'Token', definition: '卡片定义' }];
    const merged = mergeWithDictionary(cardTerms);
    // 走真实路径：sortTerms → buildTermRegex → matchTerms
    const results = matchTerms('Token 和 上下文窗口', merged);
    const tokenMatch = results.find((r) => r.text === 'Token');
    expect(tokenMatch).toBeTruthy();
    expect(tokenMatch!.term.definition).toBe('卡片定义');
    // 卡片术语不应有 dictKey
    expect(tokenMatch!.term.dictKey).toBeUndefined();
  });

  it('mergeWithDictionary 返回的数组包含词典术语', () => {
    const merged = mergeWithDictionary([]);
    expect(merged.length).toBeGreaterThan(0);
    // 至少有一个有 dictKey
    const hasDict = merged.some((t) => t.dictKey);
    expect(hasDict).toBe(true);
  });
});
