// ============================================================
// DictionaryView —— AI 编码词典浏览视图
// 按 Section 分组、搜索、展开查看完整定义
// ============================================================

import { useState, useMemo } from 'react';
import { useUIStore } from '../../state/store.js';
import { DICTIONARY_SECTIONS } from '../../data/dictionary.js';
import type { DictionaryEntry } from '../../data/dictionary.js';

interface DictionaryViewProps {
  standalone?: boolean;
}

export function DictionaryView({ standalone }: DictionaryViewProps) {
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

  return (
    <div className="dict-view">
      <div className="dict-header">
        {standalone && (
          <button className="dict-back-btn" onClick={() => setView('cards')}>
            &larr; 返回工作区列表
          </button>
        )}
        <h2>AI 编码词典</h2>
        <p className="dict-desc">
          《AI 编码词典》中文汉化版 — 共 {DICTIONARY_SECTIONS.reduce((a, s) => a + s.entries.length, 0)} 个词条，按 {DICTIONARY_SECTIONS.length} 个主题分组
        </p>
      </div>

      <input
        className="dict-search"
        type="text"
        placeholder="搜索词条（中英文关键词）…"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      {!hasResults && (
        <div className="dict-empty">没有匹配的词条</div>
      )}

      {filteredSections.map((section) => (
        <div key={section.section} className="dict-section">
          <div className="dict-section-header">
            <span className="dict-section-title">{section.section}</span>
            <span className="dict-count">{section.entries.length} 个词条</span>
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