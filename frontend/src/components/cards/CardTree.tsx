// ============================================================
// CardTree —— 递归渲染树形卡片
// ============================================================

import type { CardTreeNode } from '@cogito/shared';
import { CardNode } from './CardNode.js';

interface CardTreeProps {
  nodes: CardTreeNode[];
}

export function CardTree({ nodes }: CardTreeProps) {
  return (
    <div className="card-tree">
      {nodes.map((node) => (
        <CardNode key={node.id} card={node}>
          {node.children.length > 0 && (
            <CardTree nodes={node.children} />
          )}
        </CardNode>
      ))}
    </div>
  );
}