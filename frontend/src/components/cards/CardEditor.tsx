// ============================================================
// CardEditor —— 选中卡片：编辑 + AI 生成区 + 元信息（M2）
// 支持折叠收起，节省右侧面板空间
// ============================================================

import { useState, useEffect } from 'react';
import type { CardType } from '@cogito/shared';
import { useCardStore, useSettingsStore, useUIStore } from '../../state/store.js';
import { MarkdownView } from './MarkdownView.js';

const MODE_LABELS: Record<CardType, string> = {
  child: '深入',
  divergent: '发散',
  branch: '分支',
};

export function CardEditor() {
  const selectedId = useCardStore((s) => s.selectedId);
  const byId = useCardStore((s) => s.byId);
  const updateCard = useCardStore((s) => s.updateCard);
  const generate = useCardStore((s) => s.generate);
  const generatingId = useCardStore((s) => s.generatingId);
  const hasKey = useSettingsStore((s) => s.settings?.hasApiKey ?? false);
  const activeTerm = useUIStore((s) => s.activeTerm);

  const card = selectedId ? byId(selectedId) : undefined;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [mode, setMode] = useState<CardType>('child');
  const [instruction, setInstruction] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setContent(card.content);
    }
  }, [card?.id]);

  if (!card) {
    return (
      <div className="card-editor empty">
        <p>选择一张卡片进行编辑</p>
      </div>
    );
  }

  const isGenerating = generatingId === card.id || card.status === 'processing';

  const handleSave = async () => {
    await updateCard(card.id, { title, content });
  };

  const handleCancel = () => {
    setTitle(card.title);
    setContent(card.content);
  };

  const handleGenerate = async (m: CardType) => {
    if (isGenerating) return;
    try {
      await generate(card.id, m, instruction.trim() || undefined);
    } catch {
      // error shown in tree top bar
    }
  };

  return (
    <div className="card-editor">
      <div className="editor-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="editor-toggle">{collapsed ? '▸' : '▾'}</span>
        <span className="editor-header-label">内容编辑</span>
      </div>
      <div className={`editor-body ${collapsed ? 'collapsed' : ''}`}>
        <input
          className="editor-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="卡片标题"
        />
        <div className="editor-toolbar">
          <button
            className={`editor-tab ${!preview ? 'active' : ''}`}
            onClick={() => setPreview(false)}
          >
            编辑
          </button>
          <button
            className={`editor-tab ${preview ? 'active' : ''}`}
            onClick={() => setPreview(true)}
          >
            预览
          </button>
        </div>
        {preview ? (
          <MarkdownView content={content} terms={card.terms} activeTerm={activeTerm} workspaceId={card.workspaceId} sourceCardId={card.id} />
        ) : (
          <textarea
            className="editor-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Markdown 内容..."
            rows={10}
          />
        )}

        {card.terms && card.terms.length > 0 && (
          <div className="editor-terms">
            <span className="editor-terms-label">术语：</span>
            {card.terms.map((t) => (
              <button
                key={t.term}
                className={`term-chip ${activeTerm === t.term ? 'active' : ''}`}
                onClick={() => {
                  const next = activeTerm === t.term ? null : t.term;
                  useUIStore.getState().setActiveTerm(next);
                }}
              >
                <span className="term-chip-name">{t.term}</span>
                {t.definition && <span className="term-chip-def">{t.definition}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="editor-actions">
          <button onClick={handleSave}>保存</button>
          <button className="secondary" onClick={handleCancel}>取消</button>
        </div>

        <div className="editor-generate">
          <h4>AI 生成子卡</h4>
          {!hasKey && (
            <p className="editor-generate-warn">
              尚未配置 API Key，生成不可用（请在右上角「设置」中配置）。
            </p>
          )}
          <div className="generate-modes">
            {(Object.keys(MODE_LABELS) as CardType[]).map((m) => (
              <button
                key={m}
                className={`generate-mode ${mode === m ? 'active' : ''}`}
                onClick={() => setMode(m)}
                disabled={isGenerating}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <textarea
            className="generate-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="补充意图（可选）：如「关注推理时延方向」"
            rows={2}
            disabled={isGenerating}
          />
          <button
            className="generate-btn"
            onClick={() => handleGenerate(mode)}
            disabled={isGenerating || !hasKey}
          >
            {isGenerating ? '生成中…' : `生成${MODE_LABELS[mode]}子卡`}
          </button>
        </div>

        {card.aiMeta && (
          <div className="editor-ai-meta">
            <h4>AI 元信息</h4>
            <ul>
              <li>模型：{card.aiMeta.model}</li>
              {card.aiMeta.mode && <li>模式：{MODE_LABELS[card.aiMeta.mode] ?? card.aiMeta.mode}</li>}
              <li>Tokens：{card.aiMeta.promptTokens} / {card.aiMeta.completionTokens}</li>
              <li>耗时：{card.aiMeta.latencyMs}ms</li>
              {card.aiMeta.retried && <li>解析重试：是</li>}
              {card.aiMeta.error && <li className="meta-error">错误码：{card.aiMeta.error}</li>}
              {card.aiMeta.errorMessage && <li className="meta-error">详情：{card.aiMeta.errorMessage}</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
