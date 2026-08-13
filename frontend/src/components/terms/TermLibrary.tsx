// ============================================================
// TermLibrary —— 术语库（design.md 4.3.3）
// 聚合当前工作区全部卡片 terms 去重计数；点击联动高亮
// 悬停显示术语所在卡片预览 + 定义解释
// 新增：保存术语到库、搜索过滤
// ============================================================

import { useMemo, useState } from 'react';
import { useCardStore, useUIStore, useTermStore } from '../../state/store.js';

interface TermEntry {
  term: string;
  definition?: string;
  count: number;
  cardTitles: string[];
  /** 来源卡片 ID（用于保存时关联） */
  sourceCardId?: string;
  workspaceId?: string;
}

export function TermLibrary() {
  const cards = useCardStore((s) => s.cards);
  const activeTerm = useUIStore((s) => s.activeTerm);
  const setActiveTerm = useUIStore((s) => s.setActiveTerm);
  const [hoveredTerm, setHoveredTerm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const savedTerms = useTermStore((s) => s.savedTerms);
  const save = useTermStore((s) => s.save);
  const saveBatch = useTermStore((s) => s.saveBatch);

  // 已保存的术语名集合（用于判断是否已保存）
  const savedSet = useMemo(
    () => new Set(savedTerms.map((t) => t.term.toLowerCase())),
    [savedTerms],
  );

  const terms = useMemo<TermEntry[]>(() => {
    const map = new Map<string, TermEntry>();
    for (const card of cards) {
      for (const t of card.terms ?? []) {
        const key = t.term.trim();
        if (!key) continue;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          if (!existing.cardTitles.includes(card.title)) {
            existing.cardTitles.push(card.title);
          }
          if (!existing.definition && t.definition) {
            existing.definition = t.definition;
          }
        } else {
          map.set(key, {
            term: key,
            definition: t.definition,
            count: 1,
            cardTitles: [card.title],
            sourceCardId: card.id,
            workspaceId: card.workspaceId,
          });
        }
      }
    }
    let list = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 50);

    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          (t.definition && t.definition.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [cards, searchQuery]);

  const hoveredData = hoveredTerm ? terms.find((t) => t.term === hoveredTerm) : null;

  const handleSaveTerm = async (entry: TermEntry) => {
    if (!entry.workspaceId) return;
    await save({
      term: entry.term,
      definition: entry.definition || '',
      workspaceId: entry.workspaceId,
      sourceCardId: entry.sourceCardId,
      sourceCardTitle: entry.cardTitles[0],
    });
  };

  const handleSaveAll = async () => {
    const unsaved = terms.filter((t) => !savedSet.has(t.term.toLowerCase()));
    if (unsaved.length === 0 || !unsaved[0].workspaceId) return;
    await saveBatch(
      unsaved.map((t) => ({
        term: t.term,
        definition: t.definition,
        sourceCardId: t.sourceCardId,
        sourceCardTitle: t.cardTitles[0],
      })),
      unsaved[0].workspaceId,
    );
  };

  if (terms.length === 0) {
    return (
      <div className="term-library empty">
        <span className="term-library-title">术语库</span>
        <p className="term-library-hint">
          {searchQuery ? '没有匹配的术语' : '生成卡片后自动聚合术语'}
        </p>
      </div>
    );
  }

  return (
    <div className="term-library">
      <span className="term-library-title">术语库</span>
      <span className="term-library-hint">{terms.length} 个术语，点击可高亮全局</span>

      {/* 搜索框 */}
      <input
        className="term-library-search"
        type="text"
        placeholder="搜索术语…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="term-library-list">
        {terms.map((t) => {
          const isSaved = savedSet.has(t.term.toLowerCase());
          return (
            <button
              key={t.term}
              className={`term-lib-item ${activeTerm === t.term ? 'active' : ''}`}
              onClick={() => setActiveTerm(activeTerm === t.term ? null : t.term)}
              onMouseEnter={() => setHoveredTerm(t.term)}
              onMouseLeave={() => setHoveredTerm(null)}
            >
              <span className="term-lib-name">{t.term}</span>
              <span className="term-lib-meta">
                {t.definition && <span className="term-lib-def">{t.definition}</span>}
                <span className="term-lib-count">{t.count}</span>
                {!isSaved && (
                  <span
                    className="term-lib-save"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveTerm(t);
                    }}
                    title="保存到术语库"
                  >
                    💾
                  </span>
                )}
                {isSaved && <span className="term-lib-saved" title="已保存">✓</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* 一键保存全部 */}
      {terms.some((t) => !savedSet.has(t.term.toLowerCase())) && (
        <button className="term-lib-save-all" onClick={handleSaveAll}>
          一键保存全部未保存术语
        </button>
      )}

      {/* 悬停预览弹层 */}
      {hoveredData && hoveredData.cardTitles.length > 0 && (
        <div className="term-preview term-preview-enter">
          {hoveredData.definition && (
            <div className="term-preview-def">
              <span className="term-preview-label">定义</span>
              <p>{hoveredData.definition}</p>
            </div>
          )}
          <div className="term-preview-title">
            出现在 {hoveredData.count} 张卡片：
          </div>
          <ul className="term-preview-list">
            {hoveredData.cardTitles.slice(0, 5).map((title, i) => (
              <li key={i}>{title}</li>
            ))}
            {hoveredData.cardTitles.length > 5 && (
              <li className="term-preview-more">
                …还有 {hoveredData.cardTitles.length - 5} 张
              </li>
            )}
          </ul>
        </div>
      )}
      {activeTerm && (
        <button className="term-clear" onClick={() => setActiveTerm(null)}>
          清除高亮
        </button>
      )}
    </div>
  );
}