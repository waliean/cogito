// ============================================================
// SuggestionPanel —— AI 分支建议浮动面板
// ============================================================

import { useTranslation } from 'react-i18next';
import type { Suggestion } from '@cogito/shared';
import { useCardStore } from '../../state/store.js';

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
  const { t } = useTranslation();
  const cardTitle = useCardStore((s) => s.byId(cardId)?.title);
  const title = cardTitle || t('cards.unknownCard');

  const handleRetry = () => {
    useCardStore.getState().fetchSuggestions(cardId);
  };

  return (
    <div className="suggestion-panel">
      <div className="suggestion-panel-header">
        <span>{t('mindmap.suggestionsFor', { title })}</span>
        <button className="panel-close" onClick={onClose}>×</button>
      </div>

      {loading && (
        <div className="suggestion-loading">{t('mindmap.analyzing')}</div>
      )}

      {error && (
        <div className="suggestion-error">
          <span>{error}</span>
          <button onClick={handleRetry} className="suggestion-retry-btn">{t('common.retry')}</button>
        </div>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <div className="suggestion-empty">{t('mindmap.noSuggestions')}</div>
      )}

      {!loading && !error && suggestions.map((s, i) => (
        <div key={i} className="suggestion-item">
          <span className={`suggestion-mode-badge mode-${s.type}`}>
            {t('cards.type.' + s.type, { defaultValue: s.type })}
          </span>
          <div className="suggestion-title">{s.title}</div>
          <div className="suggestion-reason">{s.reason}</div>
          <button
            className="suggestion-adopt-btn"
            disabled={generating}
            onClick={() => onAdopt(s)}
          >
            {generating ? t('mindmap.generating') : t('mindmap.adopt')}
          </button>
        </div>
      ))}
    </div>
  );
}