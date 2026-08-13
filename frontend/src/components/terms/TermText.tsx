// ============================================================
// TermText —— 术语高亮渲染（design.md 4.3.1）
// 使用 matchTerms 统一匹配逻辑，最长优先避免重叠
// 高亮术语可点击：点击切换 activeTerm 全局联动高亮
// 词典术语（dictKey）以斜体/加粗/下划线样式突出，悬停弹解释
// ============================================================

import { useMemo, useCallback } from 'react';
import type { TermHighlight } from '@cogito/shared';
import { useUIStore, useSettingsStore } from '../../state/store.js';
import { matchTerms, mergeWithDictionary } from '../../utils/terms.js';
import { showTermTooltip, hideTermTooltip, hideTermTooltipImmediate } from './TermTooltip.js';

interface TermTextProps {
  text: string;
  terms: TermHighlight[];
  activeTerm?: string | null;
  className?: string;
  workspaceId?: string;
  sourceCardId?: string;
}

export function TermText({ text, terms, activeTerm, className, workspaceId, sourceCardId }: TermTextProps) {
  const setActiveTerm = useUIStore((s) => s.setActiveTerm);
  const dictTermStyle = useSettingsStore((s) => s.settings?.dictTermStyle ?? 'italic');

  const handleClick = useCallback(
    (e: React.MouseEvent, termText: string, isDict: boolean) => {
      e.stopPropagation();
      hideTermTooltipImmediate();
      if (isDict) return; // 词典词条不触发 activeTerm
      const next = activeTerm?.toLowerCase() === termText.toLowerCase() ? null : termText;
      setActiveTerm(next);
    },
    [activeTerm, setActiveTerm],
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, termText: string, definition?: string) => {
      const el = e.currentTarget as HTMLElement;
      showTermTooltip(el, e.clientX, e.clientY, termText, definition, {
        workspaceId,
        sourceCardId,
        sourceCardTitle: text,
      });
    },
    [workspaceId, sourceCardId, text],
  );

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    hideTermTooltip(e.currentTarget as HTMLElement);
  }, []);

  const parts = useMemo(() => {
    const mergedTerms = mergeWithDictionary(terms);
    if (!mergedTerms || mergedTerms.length === 0 || !text) return [text];

    const matches = matchTerms(text, mergedTerms);
    if (matches.length === 0) return [text];

    const out: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    for (const m of matches) {
      if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));

      if (m.term.dictKey) {
        // 词典术语：以设置样式突出，不触发 activeTerm
        out.push(
          <span
            key={key++}
            className={`term-dict term-dict-${dictTermStyle}`}
            data-term={m.text}
            onMouseEnter={(e) => handleMouseEnter(e, m.text, m.term.definition)}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => handleClick(e, m.text, true)}
          >
            {m.text}
          </span>,
        );
      } else {
        // 卡片术语：保持现有 mark 高亮
        const isActive =
          activeTerm != null && m.text.toLowerCase() === activeTerm.toLowerCase();
        out.push(
          <mark
            key={key++}
            className={isActive ? 'term-hl active' : 'term-hl'}
            data-term={m.text}
            onMouseEnter={(e) => handleMouseEnter(e, m.text, m.term.definition)}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => handleClick(e, m.text, false)}
          >
            {m.text}
          </mark>,
        );
      }
      lastIndex = m.index + m.text.length;
    }
    if (lastIndex < text.length) out.push(text.slice(lastIndex));
    return out;
  }, [text, terms, activeTerm, handleMouseEnter, handleMouseLeave, handleClick, dictTermStyle]);

  return <span className={className}>{parts}</span>;
}