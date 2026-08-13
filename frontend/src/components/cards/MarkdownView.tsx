// ============================================================
// MarkdownView —— markdown-it 渲染 + TreeWalker 术语高亮
// （design.md 4.3.2：仅包裹文本节点，不解析任何 HTML，无新增 XSS 面）
// 词典术语（dictKey）以 span.term-dict 渲染，不包 mark
// 悬停显示自定义弹层解释（替代原生 title）
// 使用 matchTerms 统一匹配逻辑
// ============================================================

import { useMemo, useRef, useEffect } from 'react';
import MarkdownIt from 'markdown-it';
import type { TermHighlight } from '@cogito/shared';
import { useSettingsStore } from '../../state/store.js';
import { matchTerms, mergeWithDictionary } from '../../utils/terms.js';
import { showTermTooltip, hideTermTooltip, hideTermTooltipImmediate } from '../terms/TermTooltip.js';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

interface MarkdownViewProps {
  content: string;
  terms?: TermHighlight[];
  activeTerm?: string | null;
  workspaceId?: string;
  sourceCardId?: string;
}

export function MarkdownView({ content, terms, activeTerm, workspaceId, sourceCardId }: MarkdownViewProps) {
  const html = useMemo(() => md.render(content || ''), [content]);
  const ref = useRef<HTMLDivElement>(null);
  const dictTermStyle = useSettingsStore((s) => s.settings?.dictTermStyle ?? 'italic');

  useEffect(() => {
    const el = ref.current;
    if (!el || !terms || terms.length === 0) return;

    const mergedTerms = mergeWithDictionary(terms);

    // 清理上次包裹的 mark 和 span
    el.querySelectorAll('mark.term-hl, span.term-dict').forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent ?? ''));
    });

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    for (const node of textNodes) {
      const text = node.nodeValue ?? '';
      const matches = matchTerms(text, mergedTerms);
      if (matches.length === 0) continue;

      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of matches) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));

        if (m.term.dictKey) {
          // 词典术语：span 样式
          const span = document.createElement('span');
          span.className = `term-dict term-dict-${dictTermStyle}`;
          span.dataset.term = m.text;
          span.addEventListener('mouseenter', (e) => {
            showTermTooltip(e.currentTarget as HTMLElement, e.clientX, e.clientY, m.text, m.term.definition, {
              workspaceId,
              sourceCardId,
              sourceCardTitle: undefined,
            });
          });
          span.addEventListener('mouseleave', (e) => {
            hideTermTooltip(e.currentTarget as HTMLElement);
          });
          span.addEventListener('click', () => {
            hideTermTooltipImmediate();
          });
          span.textContent = m.text;
          frag.appendChild(span);
        } else {
          // 卡片术语：mark 高亮
          const isActive =
            activeTerm != null && m.text.toLowerCase() === activeTerm.toLowerCase();
          const mark = document.createElement('mark');
          mark.className = 'term-hl' + (isActive ? ' active' : '');
          mark.dataset.term = m.text;
          mark.addEventListener('mouseenter', (e) => {
            showTermTooltip(e.currentTarget as HTMLElement, e.clientX, e.clientY, m.text, m.term.definition, {
              workspaceId,
              sourceCardId,
              sourceCardTitle: undefined,
            });
          });
          mark.addEventListener('mouseleave', (e) => {
            hideTermTooltip(e.currentTarget as HTMLElement);
          });
          mark.addEventListener('click', () => {
            hideTermTooltipImmediate();
          });
          mark.textContent = m.text;
          frag.appendChild(mark);
        }
        last = m.index + m.text.length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (frag.childNodes.length > 0) node.parentNode?.replaceChild(frag, node);
    }

    // 清理：组件卸载时移除事件监听
    return () => {
      el.querySelectorAll('mark.term-hl, span.term-dict').forEach((m) => {
        const clone = document.createTextNode(m.textContent ?? '');
        m.replaceWith(clone);
      });
    };
  }, [html, terms, activeTerm, dictTermStyle]);

  return <div ref={ref} className="markdown-view" dangerouslySetInnerHTML={{ __html: html }} />;
}