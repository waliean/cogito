// ============================================================
// CardNode —— 单卡节点：type/status 徽标、title、预览、生成操作（M2）
// ============================================================

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card, CardType } from '@cogito/shared';
import { useCardStore, useUIStore } from '../../state/store.js';
import { TermText } from '../terms/TermText.js';

interface CardNodeProps {
  card: Card;
  children?: React.ReactNode;
}

const TYPE_CLASSES: Record<CardType, string> = {
  child: 'badge-child',
  divergent: 'badge-divergent',
  branch: 'badge-branch',
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

export function CardNode({ card, children }: CardNodeProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const selectedId = useCardStore((s) => s.selectedId);
  const generatingId = useCardStore((s) => s.generatingId);
  const select = useCardStore((s) => s.select);
  const generate = useCardStore((s) => s.generate);
  const removeCard = useCardStore((s) => s.removeCard);
  const activeTerm = useUIStore((s) => s.activeTerm);
  const currentWsId = card.workspaceId;

  const isSelected = selectedId === card.id;
  const isGenerating = generatingId === card.id || card.status === 'processing';

  const handleGenerate = async (type: CardType) => {
    if (isGenerating) return;
    try {
      await generate(card.id, type);
    } catch {
      // error handled by store（顶部提示）
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('cards.deleteConfirm'))) return;
    await removeCard(card.id);
  };

  return (
    <div className={`card-node ${isSelected ? 'selected' : ''}`}>
      <div className="card-node-header" onClick={() => select(card.id)}>
        <button
          className="card-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className={`card-type-badge ${TYPE_CLASSES[card.type]}`}>
          {t('cards.type.' + card.type)}
        </span>
        <span className="card-title">
          <TermText text={card.title || t('common.noTitle')} terms={card.terms ?? []} activeTerm={activeTerm} workspaceId={card.workspaceId} sourceCardId={card.id} />
        </span>
        <span className={`card-status status-${card.status}`}>
          {isGenerating && card.status === 'processing' ? t('cards.status.processing') : t('cards.status.' + card.status)}
        </span>
      </div>
      {isSelected && (
        <div className="card-node-actions">
          {card.status === 'failed' ? (
            <button
              className="retry"
              onClick={() => handleGenerate(card.aiMeta?.mode ?? 'child')}
              disabled={isGenerating}
            >
              ↻ {t('cards.regenerate')}
            </button>
          ) : (
            <>
              <button onClick={() => handleGenerate('child')} disabled={isGenerating}>
                {isGenerating ? t('cards.status.processing') : t('cards.addChild')}
              </button>
              <button onClick={() => handleGenerate('divergent')} disabled={isGenerating}>
                {t('cards.addDivergent')}
              </button>
              <button onClick={() => handleGenerate('branch')} disabled={isGenerating}>
                {t('cards.addBranch')}
              </button>
            </>
          )}
          <button onClick={() => select(card.id)}>{t('common.edit')}</button>
          <button className="danger" onClick={handleDelete}>{t('common.delete')}</button>
        </div>
      )}
      {expanded && card.content && (
        <div className="card-node-preview">
          <TermText text={truncate(card.content, 120)} terms={card.terms ?? []} activeTerm={activeTerm} workspaceId={card.workspaceId} sourceCardId={card.id} />
        </div>
      )}
      {expanded && children && (
        <div className="card-children">{children}</div>
      )}
    </div>
  );
}