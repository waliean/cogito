// ============================================================
// SuggestionPanel —— AI 分支建议浮动面板
// ============================================================

import type { Suggestion } from '@cogito/shared';
import { useCardStore } from '../../state/store.js';

const MODE_LABELS: Record<string, string> = {
  child: '深入',
  divergent: '发散',
  branch: '分支',
};

interface SuggestionPanelProps {
  cardId: string;
  suggestions: Suggestion[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onAdopt: (s: Suggestion) => void;
  generating: boolean;
}

export function SuggestionPanel({
  cardId,
  suggestions,
  loading,
  error,
  onClose,
  onAdopt,
  generating,
}: SuggestionPanelProps) {
  const cardTitle = useCardStore((s) => s.byId(cardId)?.title ?? '（未知卡片）');

  const handleRetry = () => {
    useCardStore.getState().fetchSuggestions(cardId);
  };

  return (
    <div className="suggestion-panel">
      <div className="suggestion-panel-header">
        <span>分支建议 · {cardTitle}</span>
        <button className="panel-close" onClick={onClose}>×</button>
      </div>

      {loading && (
        <div className="suggestion-loading">AI 正在分析卡片…</div>
      )}

      {error && (
        <div className="suggestion-error">
          <span>{error}</span>
          <button onClick={handleRetry} className="suggestion-retry-btn">重试</button>
        </div>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <div className="suggestion-empty">暂无建议</div>
      )}

      {!loading && !error && suggestions.map((s, i) => (
        <div key={i} className="suggestion-item">
          <span className={`suggestion-mode-badge mode-${s.type}`}>
            {MODE_LABELS[s.type] ?? s.type}
          </span>
          <div className="suggestion-title">{s.title}</div>
          <div className="suggestion-reason">{s.reason}</div>
          <button
            className="suggestion-adopt-btn"
            disabled={generating}
            onClick={() => onAdopt(s)}
          >
            {generating ? '生成中…' : '采纳生成'}
          </button>
        </div>
      ))}
    </div>
  );
}