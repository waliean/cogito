// ============================================================
// TermTooltip —— 术语解释弹层（多实例）
// 支持同时显示多个气泡，每个独立可控
// 每个 tooltip 通过 data-tt-id 与 HTML 元素关联
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTermStore } from '../../state/store.js';

/* ========== 类型定义 ========== */

interface TooltipContent {
  term: string;
  definition?: string;
  workspaceId?: string;
  sourceCardId?: string;
  sourceCardTitle?: string;
}

interface TooltipPosition {
  x: number;
  y: number;
}

interface TooltipInstance {
  id: string;
  content: TooltipContent;
  pos: TooltipPosition;
  pinned: boolean;
  /** 调整后的位置（含视口边界修正，或拖动后的位置） */
  adjusted: TooltipPosition;
}

/* ========== 模块级状态 ========== */

let _instances: TooltipInstance[] = [];
let _setState: ((updater: TooltipInstance[] | ((prev: TooltipInstance[]) => TooltipInstance[])) => void) | null = null;
let _nextId = 0;

const ENTER_DELAY = 150;
const LEAVE_DELAY = 300;

/** 每个元素的 tooltip 定时器 */
const _showTimers = new Map<string, ReturnType<typeof setTimeout>>();
const _hideTimers = new Map<string, ReturnType<typeof setTimeout>>();

function genId(): string {
  return `tt-${++_nextId}`;
}

/**
 * 在鼠标位置显示术语解释弹层（带延迟）
 * @param el 触发事件的 DOM 元素（<mark>），tooltip ID 会存到其 data-tt-id 上
 * @param clientX 鼠标 X 坐标
 * @param clientY 鼠标 Y 坐标
 */
export function showTermTooltip(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  term: string,
  definition?: string,
  extra?: { workspaceId?: string; sourceCardId?: string; sourceCardTitle?: string },
): void {
  if (!el) return;

  let id = el.getAttribute('data-tt-id');
  // 如果已有关联的 tooltip 且隐藏定时器待处理，取消隐藏
  if (id && _hideTimers.has(id)) {
    clearTimeout(_hideTimers.get(id)!);
    _hideTimers.delete(id);
    return;
  }

  // 生成新 ID 并关联到元素
  id = genId();
  el.setAttribute('data-tt-id', id);

  // 取消已有显示定时器
  if (_showTimers.has(id)) {
    clearTimeout(_showTimers.get(id)!);
  }

  _showTimers.set(id, setTimeout(() => {
    _showTimers.delete(id);
    _setState?.((prev: any) => {
      // 如果已存在相同 tooltip，跳过
      if (prev.some((t: any) => t.id === id)) return prev;
      // 新气泡打开时，关闭所有未固定的旧气泡
      const kept = prev.filter((t: any) => t.pinned);
      return [
        ...kept,
        {
          id,
          content: { term, definition, ...extra },
          pos: { x: clientX, y: clientY },
          pinned: false,
          adjusted: { x: 0, y: 0 },
        },
      ];
    });
  }, ENTER_DELAY));
}

/**
 * 隐藏指定元素的 tooltip（带延迟）
 */
export function hideTermTooltip(el: HTMLElement | null): void {
  if (!el) return;
  const id = el.getAttribute('data-tt-id');
  if (!id) return;

  // 取消显示定时器
  if (_showTimers.has(id)) {
    clearTimeout(_showTimers.get(id)!);
    _showTimers.delete(id);
    return;
  }

  // 检查是否已固定
  const inst = _instances.find((t) => t.id === id);
  if (inst?.pinned) return;

  if (_hideTimers.has(id)) return;

  _hideTimers.set(id, setTimeout(() => {
    _hideTimers.delete(id);
    _setState?.((prev) => prev.filter((t) => t.id !== id));
  }, LEAVE_DELAY));
}

/**
 * 立即隐藏所有 tooltip
 */
export function hideTermTooltipImmediate(): void {
  for (const [id, timer] of _showTimers) { clearTimeout(timer); }
  for (const [, timer] of _hideTimers) { clearTimeout(timer); }
  _showTimers.clear();
  _hideTimers.clear();
  _setState?.([]);
}

/* ========== 组件 ========== */

export function TermTooltip() {
  const [instances, setInstances] = useState<TooltipInstance[]>([]);
  const saveTerm = useTermStore((s) => s.save);

  // 同步模块级状态
  useEffect(() => {
    _setState = (updater: any) => {
      setInstances((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        _instances = next;
        return next;
      });
    };
    return () => { _setState = null; _instances = []; };
  }, []);

  if (instances.length === 0) return null;

  return (
    <>
      {instances.map((inst) => (
        <TooltipPortal
          key={inst.id}
          inst={inst}
          saveTerm={saveTerm}
        />
      ))}
    </>
  );
}

/* ========== 单个气泡 ========== */

function TooltipPortal({
  inst,
  saveTerm,
}: {
  inst: TooltipInstance;
  saveTerm: (data: {
    term: string;
    definition: string;
    workspaceId: string;
    sourceCardId?: string;
    sourceCardTitle?: string;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState<TooltipPosition>(inst.adjusted);
  const [pinned, setPinned] = useState(inst.pinned);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // 从全局 store 读取已保存状态，与 TermLibrary / GlossaryView 统一
  const savedTerms = useTermStore((s) => s.savedTerms);
  const isSaved = savedTerms.some((t) => t.term.toLowerCase() === inst.content.term.toLowerCase());

  // 同步外部 pinned 变化
  useEffect(() => {
    setPinned(inst.pinned);
  }, [inst.pinned]);

  // 首次出现时计算位置
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let x = inst.pos.x + 16;
      let y = inst.pos.y - 16;

      if (x + rect.width > vw - 8) x = inst.pos.x - rect.width - 16;
      if (y + rect.height > vh - 8) y = inst.pos.y - rect.height - 16;
      x = Math.max(8, Math.min(x, vw - rect.width - 8));
      y = Math.max(8, Math.min(y, vh - rect.height - 8));

      setAdjusted({ x, y });
      // 同步回模块级状态
      _instances = _instances.map((t) =>
        t.id === inst.id ? { ...t, adjusted: { x, y } } : t,
      );
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // 拖动处理
  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (ev: MouseEvent) => {
      const pos = { x: ev.clientX - dragOffset.current.x, y: ev.clientY - dragOffset.current.y };
      setAdjusted(pos);
      _instances = _instances.map((t) =>
        t.id === inst.id ? { ...t, adjusted: pos } : t,
      );
    };
    const onUp = () => {
      dragging.current = false;
      globalThis.removeEventListener('mousemove', onMove);
      globalThis.removeEventListener('mouseup', onUp);
    };
    globalThis.addEventListener('mousemove', onMove);
    globalThis.addEventListener('mouseup', onUp);
  };

  const handlePin = () => {
    const next = !pinned;
    if (!next) {
      // 取消固定 → 立即消除
      _setState?.((prev: any) => prev.filter((t: any) => t.id !== inst.id));
      return;
    }
    // 固定：通过 _setState 同步更新 React 状态和 _instances
    _setState?.((prev: any) => prev.map((t: any) =>
      t.id === inst.id ? { ...t, pinned: true } : t,
    ));
    setPinned(true);
  };

  const handleSave = async () => {
    const { term, definition, workspaceId, sourceCardId, sourceCardTitle } = inst.content;
    if (!workspaceId) return;
    try {
      await saveTerm({ term, definition: definition || '', workspaceId, sourceCardId, sourceCardTitle });
    } catch { /* silent */ }
  };

  return createPortal(
    <div
      ref={ref}
      className={`term-tooltip ${pinned ? 'pinned' : ''}`}
      style={{
        left: adjusted.x,
        top: adjusted.y,
        cursor: dragging.current ? 'grabbing' : 'default',
      }}
      onMouseEnter={() => {
        if (_hideTimers.has(inst.id)) {
          clearTimeout(_hideTimers.get(inst.id)!);
          _hideTimers.delete(inst.id);
        }
      }}
      onMouseLeave={() => {
        if (!pinned) {
          if (_hideTimers.has(inst.id)) return;
          _hideTimers.set(inst.id, setTimeout(() => {
            _hideTimers.delete(inst.id);
            _setState?.((prev: TooltipInstance[]) => prev.filter((t) => t.id !== inst.id));
          }, LEAVE_DELAY));
        }
      }}
    >
      {/* 拖动条 */}
      <div className="term-tooltip-dragbar" onMouseDown={handleMouseDown}>
        <span className="term-tooltip-drag-icon">⠿</span>
      </div>

      {/* 术语名 */}
      <div className="term-tooltip-term">{inst.content.term}</div>

      {/* 定义 */}
      {inst.content.definition && (
        <div className="term-tooltip-def">{inst.content.definition}</div>
      )}

      {/* 操作栏 */}
      <div className="term-tooltip-actions">
        <button
          className={`term-tooltip-btn ${pinned ? 'active' : ''}`}
          onClick={handlePin}
          title={pinned ? t('terms.tooltipUnpin') : t('terms.tooltipPin')}
        >
          {pinned ? '📌' : '📍'}
        </button>
        {inst.content.workspaceId && (
          <button
            className="term-tooltip-btn"
            onClick={handleSave}
            disabled={isSaved}
            title={isSaved ? t('terms.saved') : t('terms.tooltipSaveTerm')}
          >
            {isSaved ? `✓ ${t('terms.saved')}` : `💾 ${t('terms.save')}`}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}