// ============================================================
// dagreLayout —— 树 -> 确定性坐标布局（纯函数，design.md ADR-003）
// 输入 CardTreeNode[]，输出 { nodes: [{id, position, width, height, depth}], edges: [{source, target}] }
// 未来可无痛替换 elkjs
// ============================================================

import dagre from 'dagre';
import type { CardTreeNode } from '@cogito/shared';

export interface LayoutNode {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  depth: number;
  rootId: string;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 90;
const NODE_SEP = 40;
const RANK_SEP = 70;
const RANK_DIR = 'TB';

// ---- 字符宽度估算（纯函数，无 DOM 测量） ----
// CJK / fullwidth 字符单位 = 1.0，ASCII 字母 = 0.62，数字/空格/半角标点 = 0.5
const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;
const ALPHA_RE = /[a-zA-Z]/;

function charWidth(ch: string): number {
  if (CJK_RE.test(ch)) return 1.0;
  if (ALPHA_RE.test(ch)) return 0.62;
  return 0.5;
}

/** 根据标题文本估算节点尺寸（纯函数、确定性、无 DOM 测量） */
export function estimateNodeSize(title: string): { width: number; height: number } {
  const text = (title || '（无标题）').trim();
  const units = text.split('').reduce((sum, ch) => sum + charWidth(ch), 0);
  const textWidthPx = units * 13;
  const width = Math.max(180, Math.min(400, 36 + textWidthPx));
  const maxLineUnits = (width - 36) / 13;
  const lines = Math.min(Math.ceil(units / maxLineUnits), 2);
  const height = Math.max(90, Math.min(240, 54 + lines * 18));
  return { width, height };
}

interface FlatEntry {
  id: string;
  parentId: string | null;
  depth: number;
  rootId: string;
}

function flattenTree(nodes: CardTreeNode[], collapsedIds?: ReadonlySet<string>): FlatEntry[] {
  const out: FlatEntry[] = [];
  const walk = (list: CardTreeNode[], parentId: string | null, depth: number, rootId: string) => {
    for (const n of list) {
      out.push({ id: n.id, parentId, depth, rootId });
      if (!collapsedIds?.has(n.id)) {
        walk(n.children, n.id, depth + 1, rootId);
      }
    }
  };
  for (const n of nodes) {
    walk([n], null, 0, n.id);
  }
  return out;
}

/** 确定性布局：同一棵树永远输出同一组坐标 */
export function dagreLayout(tree: CardTreeNode[], collapsedIds?: ReadonlySet<string>): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: RANK_DIR, nodesep: NODE_SEP, ranksep: RANK_SEP });

  // Build title map for size estimation
  const titleMap = new Map<string, string>();
  const collectTitles = (nodes: CardTreeNode[]) => {
    for (const n of nodes) {
      titleMap.set(n.id, n.title);
      collectTitles(n.children);
    }
  };
  collectTitles(tree);

  const flat = flattenTree(tree, collapsedIds);
  for (const f of flat) {
    const size = estimateNodeSize(titleMap.get(f.id) ?? '');
    g.setNode(f.id, { width: size.width, height: size.height });
    if (f.parentId) {
      g.setEdge(f.parentId, f.id);
    }
  }

  dagre.layout(g);

  const nodes: LayoutNode[] = flat.map((f) => {
    const pos = g.node(f.id) as { x: number; y: number };
    const size = estimateNodeSize(titleMap.get(f.id) ?? '');
    return {
      id: f.id,
      // dagre 返回中心点，ReactFlow 需要左上角
      position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
      width: size.width,
      height: size.height,
      depth: f.depth,
      rootId: f.rootId,
    };
  });

  const edges: LayoutEdge[] = flat
    .filter((f) => f.parentId !== null)
    .map((f) => ({
      id: `${f.parentId}-${f.id}`,
      source: f.parentId!,
      target: f.id,
    }));

  return { nodes, edges };
}
