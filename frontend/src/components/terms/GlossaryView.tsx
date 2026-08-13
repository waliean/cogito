// ============================================================
// GlossaryView —— 专业名词解释独立界面
// 按名词分组展示，同名不同义时显示下拉栏标注来源
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import { useTermStore, useWorkspaceStore, useUIStore } from '../../state/store.js';
import { useCardStore } from '../../state/store.js';

interface GlossaryViewProps {
  standalone?: boolean;
}

interface TermGroup {
  /** 术语名（小写 key） */
  key: string;
  /** 显示名（首条记录的 term） */
  name: string;
  /** 所有释义条目 */
  entries: import('@cogito/shared').SavedTerm[];
}

export function GlossaryView({ standalone }: GlossaryViewProps) {
  const { savedTerms, loading, load, remove } = useTermStore();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const cards = useCardStore((s) => s.cards);
  const setView = useUIStore((s) => s.setView);
  const [keyword, setKeyword] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('');
  const [confirmDeleteTerm, setConfirmDeleteTerm] = useState<string | null>(null);
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set());

  // workspace名称映射
  const wsNameMap = useMemo(() => {
    const m = new Map<string, string>();
    workspaces.forEach((ws) => m.set(ws.id, ws.name));
    return m;
  }, [workspaces]);

  useEffect(() => { load(); }, []);

  // 过滤 + 分组
  const groups = useMemo<TermGroup[]>(() => {
    let list = savedTerms;
    if (workspaceFilter) {
      list = list.filter((t) => t.workspaceId === workspaceFilter);
    }
    if (keyword.trim()) {
      const kw = keyword.toLowerCase();
      list = list.filter(
        (t) => t.term.toLowerCase().includes(kw) || t.definition.toLowerCase().includes(kw),
      );
    }

    // 按名词分组
    const map = new Map<string, TermGroup>();
    for (const t of list) {
      const key = t.term.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.entries.push(t);
      } else {
        map.set(key, { key, name: t.term, entries: [t] });
      }
    }
    // 按时间排序（最新的在前）
    return [...map.values()].sort((a, b) => {
      const aLatest = a.entries.reduce((max, e) => e.savedAt > max ? e.savedAt : max, '');
      const bLatest = b.entries.reduce((max, e) => e.savedAt > max ? e.savedAt : max, '');
      return bLatest.localeCompare(aLatest);
    });
  }, [savedTerms, keyword, workspaceFilter]);

  const handleDelete = async (id: string) => {
    await remove(id);
    setConfirmDeleteTerm(null);
  };

  const toggleExpand = (key: string) => {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 未保存的术语
  const unsavedTerms = useMemo(() => {
    const savedSet = new Set(savedTerms.map((t) => t.term.toLowerCase()));
    const map = new Map<string, { term: string; definition?: string; count: number; cardTitle?: string }>();
    for (const card of cards) {
      for (const t of card.terms ?? []) {
        const key = t.term.trim();
        if (!key || savedSet.has(key.toLowerCase())) continue;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { term: key, definition: t.definition, count: 1, cardTitle: card.title });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [savedTerms, cards]);

  return (
    <div className="glossary-view">
      <div className="glossary-header">
        {standalone && (
          <button className="glossary-back-btn" onClick={() => setView('cards')}>
            &larr; 返回工作区列表
          </button>
        )}
        <h2>专业名词库</h2>
        <p className="glossary-desc">已保存的术语及解释，支持按关键词和工作区筛选</p>
      </div>

      <div className="glossary-filters">
        <input
          className="glossary-search"
          type="text"
          placeholder="搜索术语或定义…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select
          className="glossary-ws-select"
          value={workspaceFilter}
          onChange={(e) => setWorkspaceFilter(e.target.value)}
        >
          <option value="">全部工作区</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
      </div>

      {loading && <div className="glossary-loading">加载中…</div>}

      {!loading && groups.length === 0 && (
        <div className="glossary-empty">
          {keyword || workspaceFilter
            ? '没有匹配的术语'
            : '还没有保存任何术语。'}
        </div>
      )}

      {groups.length > 0 && (
        <div className="glossary-list">
          {groups.map((g) => {
            const isExpanded = expandedTerms.has(g.key);
            const visible = isExpanded ? g.entries : g.entries.slice(0, 1);
            const hasMore = g.entries.length > 1;

            return (
              <div key={g.key} className="glossary-group">
                <div className="glossary-group-header">
                  <span className="glossary-item-term">{g.name}</span>
                  <span className="glossary-group-count">{g.entries.length} 个释义</span>
                </div>

                {visible.map((entry) => {
                  const wsName = wsNameMap.get(entry.workspaceId) || '未知工作区';
                  return (
                    <div key={entry.id} className="glossary-item">
                      <div className="glossary-item-def">{entry.definition}</div>
                      <div className="glossary-item-meta">
                        <span>项目：{wsName}</span>
                        {entry.sourceCardTitle && <span>来源：{entry.sourceCardTitle}</span>}
                        <span>保存于：{new Date(entry.savedAt).toLocaleString('zh-CN')}</span>
                      </div>
                      <button
                        className="glossary-item-delete"
                        onClick={() => setConfirmDeleteTerm(entry.id)}
                        title="删除此释义"
                      >
                        ✕
                      </button>
                      {confirmDeleteTerm === entry.id && (
                        <div className="glossary-delete-confirm">
                          <span>确定删除此释义？</span>
                          <button className="glossary-confirm-yes" onClick={() => handleDelete(entry.id)}>删除</button>
                          <button className="glossary-confirm-no" onClick={() => setConfirmDeleteTerm(null)}>取消</button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {hasMore && (
                  <button
                    className="glossary-expand-btn"
                    onClick={() => toggleExpand(g.key)}
                  >
                    {isExpanded
                      ? `收起其他释义`
                      : `展开其他 ${g.entries.length - 1} 个释义`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unsavedTerms.length > 0 && (
        <div className="glossary-unsaved-section">
          <h3>未保存的术语（来自卡片）</h3>
          <div className="glossary-unsaved-list">
            {unsavedTerms.map((t) => (
              <div key={t.term} className="glossary-unsaved-item">
                <span className="glossary-unsaved-term">{t.term}</span>
                {t.definition && <span className="glossary-unsaved-def">{t.definition}</span>}
                <span className="glossary-unsaved-count">{t.count} 张卡片</span>
                <button
                  className="glossary-unsaved-save"
                  onClick={async () => {
                    const wsId = cards.find((c) =>
                      c.terms?.some((ct) => ct.term === t.term),
                    )?.workspaceId;
                    if (wsId) {
                      await useTermStore.getState().save({
                        term: t.term,
                        definition: t.definition || '',
                        workspaceId: wsId,
                        sourceCardTitle: t.cardTitle,
                      });
                    }
                  }}
                >
                  保存
                </button>
              </div>
            ))}
          </div>
          <button
            className="glossary-save-all-btn"
            onClick={async () => {
              const firstCard = cards.find((c) =>
                c.terms?.some((t) => !savedTerms.some((st) => st.term.toLowerCase() === t.term.toLowerCase())),
              );
              if (firstCard) {
                await useTermStore.getState().saveBatch(
                  unsavedTerms.map((t) => ({ term: t.term, definition: t.definition, sourceCardTitle: t.cardTitle })),
                  firstCard.workspaceId,
                );
              }
            }}
          >
            一键保存全部 ({unsavedTerms.length})
          </button>
        </div>
      )}
    </div>
  );
}