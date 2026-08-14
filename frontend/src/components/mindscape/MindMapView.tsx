// ============================================================
// MindMapView —— @xyflow/react 思维导图（M3，design.md ADR-003）
// dagre 自动布局；点击节点 -> cardStore.select(id) 联动详情
// ============================================================

import { useMemo, useCallback, useState, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
  type AriaLabelConfig,
} from '@xyflow/react';
import type { Card, CardTreeNode, Suggestion } from '@cogito/shared';
import { useCardStore, useWorkspaceStore, useSettingsStore } from '../../state/store.js';
import { dagreLayout } from './dagreLayout.js';
import { MindMapCardNode } from './MindMapCardNode.js';
import { SuggestionPanel } from './SuggestionPanel.js';
import { GenerateTreeDialog } from './GenerateTreeDialog.js';

const nodeTypes: NodeTypes = {
  card: MindMapCardNode,
};

const STORAGE_PREFIX = 'cogito.mindmap.collapsed.';

// ---- MiniMap 缩放（可拖拽调整大小） ----

const MINIMAP_SIZE_KEY = 'cogito.mindmap.minimapSize';
const MINIMAP_MARGIN = 15; // ReactFlow Panel 默认外边距
const MINIMAP_HANDLE = 14; // 缩放手柄尺寸
const MINIMAP_MIN_W = 140;
const MINIMAP_MIN_H = 100;
const MINIMAP_MAX_W = 520;
const MINIMAP_MAX_H = 400;
const MINIMAP_DEFAULT_W = 200;
const MINIMAP_DEFAULT_H = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function loadMinimapSize(): { width: number; height: number } {
  try {
    const raw = localStorage.getItem(MINIMAP_SIZE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown };
      if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
        return {
          width: clamp(parsed.width, MINIMAP_MIN_W, MINIMAP_MAX_W),
          height: clamp(parsed.height, MINIMAP_MIN_H, MINIMAP_MAX_H),
        };
      }
    }
  } catch { /* ignore */ }
  return { width: MINIMAP_DEFAULT_W, height: MINIMAP_DEFAULT_H };
}

function loadCollapsed(workspaceId: string): Set<string> {
  if (!workspaceId) return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + workspaceId);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveCollapsed(workspaceId: string, set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + workspaceId, JSON.stringify(Array.from(set)));
  } catch { /* ignore */ }
}

function buildChildCountMap(tree: CardTreeNode[]): Map<string, number> {
  const map = new Map<string, number>();
  const walk = (nodes: CardTreeNode[]) => {
    for (const n of nodes) {
      map.set(n.id, n.children.length);
      walk(n.children);
    }
  };
  walk(tree);
  return map;
}

export function MindMapView() {
  const { t } = useTranslation();
  const tree = useCardStore((s) => s.tree);
  const cards = useCardStore((s) => s.cards);
  const select = useCardStore((s) => s.select);
  const selectedId = useCardStore((s) => s.selectedId);
  const loading = useCardStore((s) => s.loading);
  const fetchSuggestions = useCardStore((s) => s.fetchSuggestions);
  const suggestionsLoadingId = useCardStore((s) => s.suggestionsLoadingId);
  const suggestionsByCardId = useCardStore((s) => s.suggestionsByCardId);
  const adoptSuggestion = useCardStore((s) => s.adoptSuggestion);
  const suggestionsError = useCardStore((s) => s.suggestionsError);
  const clearSuggestions = useCardStore((s) => s.clearSuggestions);
  const generateTree = useCardStore((s) => s.generateTree);
  const generateTreeRunning = useCardStore((s) => s.generateTreeRunning);
  const generatingId = useCardStore((s) => s.generatingId);
  const hasApiKey = useSettingsStore((s) => s.settings?.hasApiKey ?? false);
  const workspaceId = useWorkspaceStore((s) => s.currentId) ?? '';

  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(workspaceId));
  const [treeDialogOpen, setTreeDialogOpen] = useState(false);
  const [minimapSize, setMinimapSize] = useState(() => loadMinimapSize());

  // ReactFlow 控件/小地图等内置元素的悬浮提示（title/aria-label）随语言切换
  const ariaLabelConfig = useMemo<Partial<AriaLabelConfig>>(() => ({
    'controls.ariaLabel': t('mindmap.ariaControls'),
    'controls.zoomIn.ariaLabel': t('mindmap.ariaZoomIn'),
    'controls.zoomOut.ariaLabel': t('mindmap.ariaZoomOut'),
    'controls.fitView.ariaLabel': t('mindmap.ariaFitView'),
    'controls.interactive.ariaLabel': t('mindmap.ariaInteractive'),
    'minimap.ariaLabel': t('mindmap.ariaMinimap'),
    'handle.ariaLabel': t('mindmap.ariaHandle'),
  }), [t]);

  // Reload collapsed when workspace changes
  useEffect(() => {
    setCollapsed(loadCollapsed(workspaceId));
  }, [workspaceId]);

  // Persist on change
  useEffect(() => {
    if (!workspaceId) return;
    saveCollapsed(workspaceId, collapsed);
  }, [collapsed, workspaceId]);

  // 持久化 MiniMap 尺寸
  useEffect(() => {
    try {
      localStorage.setItem(MINIMAP_SIZE_KEY, JSON.stringify(minimapSize));
    } catch { /* ignore */ }
  }, [minimapSize]);

  // 拖拽左上角手柄调整 MiniMap 大小（右下角锚点固定）
  const startMinimapResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = minimapSize.width;
    const startH = minimapSize.height;

    const onMove = (ev: PointerEvent) => {
      setMinimapSize({
        width: clamp(startW + (startX - ev.clientX), MINIMAP_MIN_W, MINIMAP_MAX_W),
        height: clamp(startH + (startY - ev.clientY), MINIMAP_MIN_H, MINIMAP_MAX_H),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [minimapSize]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => dagreLayout(tree, collapsed),
    [tree, collapsed],
  );

  const childCountMap = useMemo(() => buildChildCountMap(tree), [tree]);

  const rootColorMap = useMemo(() => {
    const map = new Map<string, number>();
    tree.forEach((root, i) => map.set(root.id, i));
    return map;
  }, [tree]);

  const rfNodes: Node[] = useMemo(
    () =>
      layoutNodes.map((n) => {
        const card = cards.find((c) => c.id === n.id);
        return {
          id: n.id,
          type: 'card',
          position: n.position,
          width: n.width,
          height: n.height,
          selected: n.id === selectedId,
          data: {
            card,
            depth: n.depth,
            childCount: childCountMap.get(n.id) ?? 0,
            collapsed: collapsed.has(n.id),
            rootId: n.rootId,
            rootColor: rootColorMap.get(n.rootId) ?? 0,
            onToggleCollapse: toggleCollapse,
          },
        };
      }),
    [layoutNodes, cards, selectedId, childCountMap, collapsed, rootColorMap, toggleCollapse],
  );

  const rfEdges: Edge[] = useMemo(
    () => layoutEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: 'smoothstep' })),
    [layoutEdges],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      select(node.id);
    },
    [select],
  );

  if (tree.length === 0 && !loading) {
    return (
      <div className="mindmap-container">
        <div className="mindmap-placeholder">{t('mindmap.placeholder')}</div>
      </div>
    );
  }

  return (
    <div className="mindmap-container">
      <div className="mindmap-toolbar">
        <button className="mindmap-toolbar-btn" disabled={!selectedId || suggestionsLoadingId !== null || !hasApiKey}
          title={!hasApiKey ? t('mindmap.apiKeyRequired') : !selectedId ? t('mindmap.selectCardFirst') : t('mindmap.suggestHint')}
          onClick={() => { if (selectedId) fetchSuggestions(selectedId); }}>
          {suggestionsLoadingId !== null ? t('mindmap.suggesting') : t('mindmap.branchSuggestions')}
        </button>
        <button className="mindmap-toolbar-btn" disabled={tree.length === 0 || generateTreeRunning || !hasApiKey}
          title={!hasApiKey ? t('mindmap.apiKeyRequired') : generateTreeRunning ? t('mindmap.generating') : ''}
          onClick={() => setTreeDialogOpen(true)}>
          {generateTreeRunning ? t('mindmap.generating') : t('mindmap.generateTree')}
        </button>
      </div>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        minZoom={0.2}
        maxZoom={2}
        colorMode="dark"
        ariaLabelConfig={ariaLabelConfig}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} />
        <Controls />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeStrokeWidth={3}
          style={{ width: minimapSize.width, height: minimapSize.height }}
          nodeColor={(n) => {
            const card = (n.data as { card?: Card } | undefined)?.card;
            if (card?.status === 'processing') return '#5c9fff';
            if (card?.status === 'failed') return '#ff5252';
            if (card?.status === 'done') return '#4ADE80';
            return '#555';
          }}
        />
        <div
          className="mindmap-minimap-handle"
          title={t('mindmap.resizeMinimap')}
          style={{
            width: MINIMAP_HANDLE,
            height: MINIMAP_HANDLE,
            right: MINIMAP_MARGIN + minimapSize.width - MINIMAP_HANDLE / 2,
            bottom: MINIMAP_MARGIN + minimapSize.height - MINIMAP_HANDLE / 2,
          }}
          onPointerDown={startMinimapResize}
        />
      </ReactFlow>
      {selectedId && (suggestionsLoadingId === selectedId || suggestionsByCardId[selectedId] !== undefined) && (
        <SuggestionPanel cardId={selectedId} suggestions={suggestionsByCardId[selectedId] ?? []}
          loading={suggestionsLoadingId === selectedId} error={suggestionsError}
          onClose={clearSuggestions} onAdopt={(s) => adoptSuggestion(selectedId, s)}
          generating={generatingId === selectedId} />
      )}
      {treeDialogOpen && <GenerateTreeDialog running={generateTreeRunning} onClose={() => setTreeDialogOpen(false)} />}
    </div>
  );
}
