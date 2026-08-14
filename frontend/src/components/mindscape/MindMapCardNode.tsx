// ============================================================
// MindMapCardNode —— ReactFlow 自定义节点（M3）
// 展示卡片标题/类型/状态，点击由 ReactFlow onNodeClick 联动详情
// ============================================================

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Position } from '@xyflow/react';
import type { Card } from '@cogito/shared';
import { useUIStore } from '../../state/store.js';
import { TermText } from '../terms/TermText.js';

interface MindMapNodeData {
  card: Card;
  depth: number;
  childCount: number;
  collapsed: boolean;
  rootColor: number;
  onToggleCollapse: (id: string) => void;
}

export const MindMapCardNode = memo(function MindMapCardNode({
  data,
  selected,
}: {
  data: MindMapNodeData;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const card = data.card;
  if (!card) return null;
  const activeTerm = useUIStore((s) => s.activeTerm);
  const depth = data.depth ?? 0;
  const childCount = data.childCount ?? 0;
  const collapsed = data.collapsed ?? false;
  const rootColor = data.rootColor ?? 0;
  const onToggleCollapse = data.onToggleCollapse;

  return (
    <div className={`mind-node status-${card.status} mind-depth-${Math.min(depth, 2)} mind-root-${rootColor % 8} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="mind-node-badges">
        <span className={`card-type-badge badge-${card.type}`}>{t('cards.type.' + card.type)}</span>
        {childCount > 0 && (
          <button className="mind-collapse-btn" onClick={(e) => { e.stopPropagation(); onToggleCollapse(card.id); }}>
            {collapsed ? '▶' : '▼'} {collapsed ? childCount : ''}
          </button>
        )}
        <span className="mind-node-status">{t('cards.status.' + card.status)}</span>
      </div>
      <div className="mind-node-title">
        <TermText text={card.title || t('common.noTitle')} terms={card.terms ?? []} activeTerm={activeTerm} workspaceId={card.workspaceId} sourceCardId={card.id} />
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});