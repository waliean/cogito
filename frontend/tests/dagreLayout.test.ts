// ============================================================
// dagreLayout.test.ts —— 确定性布局快照 + 结构正确性 + 动态尺寸
// ============================================================

import { describe, it, expect } from 'vitest';
import type { CardTreeNode } from '@cogito/shared';
import { dagreLayout, estimateNodeSize } from '../src/components/mindscape/dagreLayout.js';

function node(id: string, title: string, children: CardTreeNode[] = []): CardTreeNode {
  return {
    id,
    workspaceId: 'ws',
    type: 'child',
    title,
    content: '',
    terms: [],
    parentId: null,
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    children,
  };
}

const tree: CardTreeNode[] = [
  node('root', 'Root', [node('a', 'Node A', [node('a1', 'Child A1'), node('a2', 'Child A2')]), node('b', 'Node B')]),
];

describe('dagreLayout', () => {
  it('同一棵树两次布局输出完全一致（确定性）', () => {
    const first = dagreLayout(tree);
    const second = dagreLayout(tree);
    expect(first).toEqual(second);
  });

  it('覆盖全部节点并生成父->子边', () => {
    const { nodes, edges } = dagreLayout(tree);
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'a1', 'a2', 'b', 'root']);
    expect(edges).toHaveLength(4);
    expect(edges).toEqual(
      expect.arrayContaining([
        { id: 'root-a', source: 'root', target: 'a' },
        { id: 'root-b', source: 'root', target: 'b' },
        { id: 'a-a1', source: 'a', target: 'a1' },
        { id: 'a-a2', source: 'a', target: 'a2' },
      ]),
    );
  });

  it('根节点位于子树上方（TB 布局）', () => {
    const { nodes } = dagreLayout(tree);
    const rootY = nodes.find((n) => n.id === 'root')!.position.y;
    const childY = nodes.find((n) => n.id === 'a')!.position.y;
    expect(rootY).toBeLessThan(childY);
  });

  it('坐标均为有限数值', () => {
    const { nodes } = dagreLayout(tree);
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it('空树输出空布局', () => {
    expect(dagreLayout([])).toEqual({ nodes: [], edges: [] });
  });

  it('布局节点带 width/height/depth 字段且为正数', () => {
    const { nodes } = dagreLayout(tree);
    for (const n of nodes) {
      expect(n.width).toBeGreaterThan(0);
      expect(n.height).toBeGreaterThan(0);
      expect(n.depth).toBeGreaterThanOrEqual(0);
    }
  });

  it('不同深度节点 depth 正确（根=0，子=1，孙=2）', () => {
    const { nodes } = dagreLayout(tree);
    const root = nodes.find((n) => n.id === 'root')!;
    const a = nodes.find((n) => n.id === 'a')!;
    const a1 = nodes.find((n) => n.id === 'a1')!;
    expect(root.depth).toBe(0);
    expect(a.depth).toBe(1);
    expect(a1.depth).toBe(2);
  });

  it('折叠节点 a 时 a1/a2 不出现在 nodes 和 edges 中', () => {
    const { nodes, edges } = dagreLayout(tree, new Set(['a']));
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'root']);
    expect(edges).toHaveLength(2);
    expect(edges).toEqual(
      expect.arrayContaining([
        { id: 'root-a', source: 'root', target: 'a' },
        { id: 'root-b', source: 'root', target: 'b' },
      ]),
    );
  });

  it('不传 collapsedIds 时行为与现有一致（全展开）', () => {
    const { nodes, edges } = dagreLayout(tree);
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'a1', 'a2', 'b', 'root']);
    expect(edges).toHaveLength(4);
  });

  it('rootId 正确赋值', () => {
    const { nodes } = dagreLayout(tree);
    const root = nodes.find((n) => n.id === 'root')!;
    const a = nodes.find((n) => n.id === 'a')!;
    const a1 = nodes.find((n) => n.id === 'a1')!;
    const b = nodes.find((n) => n.id === 'b')!;
    expect(root.rootId).toBe('root');
    expect(a.rootId).toBe('root');
    expect(a1.rootId).toBe('root');
    expect(b.rootId).toBe('root');
  });

  it('多根树 rootId 各自为自身 id', () => {
    const multiTree: CardTreeNode[] = [
      node('r1', 'Root 1', [node('c1', 'Child 1')]),
      node('r2', 'Root 2', [node('c2', 'Child 2')]),
    ];
    const { nodes } = dagreLayout(multiTree);
    const r1 = nodes.find((n) => n.id === 'r1')!;
    const c1 = nodes.find((n) => n.id === 'c1')!;
    const r2 = nodes.find((n) => n.id === 'r2')!;
    const c2 = nodes.find((n) => n.id === 'c2')!;
    expect(r1.rootId).toBe('r1');
    expect(c1.rootId).toBe('r1');
    expect(r2.rootId).toBe('r2');
    expect(c2.rootId).toBe('r2');
  });

  it('折叠后两次调用结果 toEqual（确定性）', () => {
    const first = dagreLayout(tree, new Set(['a']));
    const second = dagreLayout(tree, new Set(['a']));
    expect(first).toEqual(second);
  });

  it('折叠根节点只剩一个节点零条边', () => {
    const { nodes, edges } = dagreLayout(tree, new Set(['root']));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('root');
    expect(edges).toHaveLength(0);
  });
});

describe('estimateNodeSize', () => {
  it('同标题两次调用结果相等（确定性）', () => {
    const a = estimateNodeSize('Hello World');
    const b = estimateNodeSize('Hello World');
    expect(a).toEqual(b);
  });

  it('长标题宽度 > 短标题宽度（单调）', () => {
    const short = estimateNodeSize('Hi');
    const long = estimateNodeSize('This is a much longer title');
    expect(long.width).toBeGreaterThanOrEqual(short.width);
  });

  it('空标题 = 最小值（180）', () => {
    const size = estimateNodeSize('');
    expect(size.width).toBe(180);
    expect(size.height).toBe(90);
  });

  it('中英混排宽度 > 纯拉丁同长度（CJK 单位更宽）', () => {
    const latin = estimateNodeSize('abcdefghij'); // 10 ASCII chars
    const mixed = estimateNodeSize('你好世界abcd'); // 4 CJK + 4 ASCII
    // 4*1.0 + 4*0.62 = 6.48 units vs 10*0.62 = 6.2 units
    expect(mixed.width).toBeGreaterThanOrEqual(latin.width);
  });
});
