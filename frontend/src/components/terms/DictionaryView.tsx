// ============================================================
// DictionaryView —— AI 编码词典浏览视图
// 按 Section 分组、搜索、展开查看完整定义
// ============================================================

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../state/store.js';
import { DICTIONARY_SECTIONS } from '../../data/dictionary.js';
import type { DictionaryEntry } from '../../data/dictionary.js';

interface DictionaryViewProps {
  standalone?: boolean;
}

export function DictionaryView({ standalone }: DictionaryViewProps) {
  const { t } = useTranslation();
  const setView = useUIStore((s) => s.setView);
  const [keyword, setKeyword] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // 搜索过滤
  const filteredSections = useMemo(() => {
    if (!keyword.trim()) return DICTIONARY_SECTIONS;

    const kw = keyword.toLowerCase();
    const result: typeof DICTIONARY_SECTIONS = [];

    for (const section of DICTIONARY_SECTIONS) {
      const matched = section.entries.filter((e) => {
        return (
          e.key.toLowerCase().includes(kw) ||
          e.label.toLowerCase().includes(kw) ||
          e.terms.some((t) => t.toLowerCase().includes(kw)) ||
          e.description.toLowerCase().includes(kw) ||
          e.body.toLowerCase().includes(kw)
        );
      });
      if (matched.length > 0) {
        result.push({ section: section.section, entries: matched });
      }
    }
    return result;
  }, [keyword]);

  // 展开/折叠切换
  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasResults = filteredSections.some((s) => s.entries.length > 0);

  const totalEntries = DICTIONARY_SECTIONS.reduce((a, s) => a + s.entries.length, 0);

  return (
    <div className="dict-view">
      <div className="dict-header">
        {standalone && (
          <button className="dict-back-btn" onClick={() => setView('cards')}>
            &larr; {t('common.backToWorkspaces')}
          </button>
        )}
        <h2>{t('terms.dictTitle')}</h2>
        <p className="dict-desc">
          {t('terms.dictDesc', { count: totalEntries, sections: DICTIONARY_SECTIONS.length })}
        </p>
      </div>

      <input
        className="dict-search"
        type="text"
        placeholder={t('terms.dictSearchPlaceholder')}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      {!hasResults && (
        <div className="dict-empty">{t('terms.dictEmpty')}</div>
      )}

      {filteredSections.map((section) => (
        <div key={section.section} className="dict-section">
          <div className="dict-section-header">
            <span className="dict-section-title">{section.section}</span>
            <span className="dict-count">{t('terms.entryCount', { count: section.entries.length })}</span>
          </div>

          {section.entries.map((entry) => {
            const isExpanded = expandedKeys.has(entry.key);
            return (
              <div
                key={entry.key}
                className={`dict-entry ${isExpanded ? 'expanded' : ''}`}
                onClick={() => toggleExpand(entry.key)}
              >
                <div className="dict-entry-title">
                  <span className="dict-entry-label">{entry.label}</span>
                  <span className="dict-entry-key">{entry.key}</span>
                </div>
                <div className="dict-entry-desc">{entry.description}</div>
                {isExpanded && (
                  <div className="dict-entry-body">{entry.body}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}