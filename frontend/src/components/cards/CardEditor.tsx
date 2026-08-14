// ============================================================
// CardEditor —— 选中卡片：编辑 + AI 生成区 + 元信息（M2）
// 支持折叠收起，节省右侧面板空间
// ============================================================

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardType } from '@cogito/shared';
import { useCardStore, useSettingsStore, useUIStore } from '../../state/store.js';
import { MarkdownView } from './MarkdownView.js';

export function CardEditor() {
  const { t } = useTranslation();
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
        <p>{t('cards.editorEmpty')}</p>
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
        <span className="editor-header-label">{t('cards.editorHeader')}</span>
      </div>
      <div className={`editor-body ${collapsed ? 'collapsed' : ''}`}>
        <input
          className="editor-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('cards.titlePlaceholder')}
        />
        <div className="editor-toolbar">
          <button
            className={`editor-tab ${!preview ? 'active' : ''}`}
            onClick={() => setPreview(false)}
          >
            {t('common.edit')}
          </button>
          <button
            className={`editor-tab ${preview ? 'active' : ''}`}
            onClick={() => setPreview(true)}
          >
            {t('common.preview')}
          </button>
        </div>
        {preview ? (
          <MarkdownView content={content} terms={card.terms} activeTerm={activeTerm} workspaceId={card.workspaceId} sourceCardId={card.id} />
        ) : (
          <textarea
            className="editor-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('cards.contentPlaceholder')}
            rows={10}
          />
        )}

        {card.terms && card.terms.length > 0 && (
          <div className="editor-terms">
            <span className="editor-terms-label">{t('cards.termsLabel')}</span>
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
          <button onClick={handleSave}>{t('common.save')}</button>
          <button className="secondary" onClick={handleCancel}>{t('common.cancel')}</button>
        </div>

        <div className="editor-generate">
          <h4>{t('cards.generateSection')}</h4>
          {!hasKey && (
            <p className="editor-generate-warn">
              {t('cards.noApiKeyWarn')}
            </p>
          )}
          <div className="generate-modes">
            {(['child', 'divergent', 'branch'] as CardType[]).map((m) => (
              <button
                key={m}
                className={`generate-mode ${mode === m ? 'active' : ''}`}
                onClick={() => setMode(m)}
                disabled={isGenerating}
              >
                {t('cards.type.' + m)}
              </button>
            ))}
          </div>
          <textarea
            className="generate-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t('cards.instructionPlaceholder')}
            rows={2}
            disabled={isGenerating}
          />
          <button
            className="generate-btn"
            onClick={() => handleGenerate(mode)}
            disabled={isGenerating || !hasKey}
          >
            {isGenerating ? t('cards.status.processing') : t('cards.generateSubCard', { type: t('cards.type.' + mode) })}
          </button>
        </div>

        {card.aiMeta && (
          <div className="editor-ai-meta">
            <h4>{t('cards.aiMetaTitle')}</h4>
            <ul>
              <li>{t('cards.metaModel', { model: card.aiMeta.model })}</li>
              {card.aiMeta.mode && (
                <li>{t('cards.metaMode', { mode: t('cards.type.' + card.aiMeta.mode, { defaultValue: card.aiMeta.mode }) })}</li>
              )}
              <li>{t('cards.metaTokens', { prompt: card.aiMeta.promptTokens, completion: card.aiMeta.completionTokens })}</li>
              <li>{t('cards.metaLatency', { ms: card.aiMeta.latencyMs })}</li>
              {card.aiMeta.retried && <li>{t('cards.metaRetried')}</li>}
              {card.aiMeta.error && <li className="meta-error">{t('cards.metaErrorCode', { code: card.aiMeta.error })}</li>}
              {card.aiMeta.errorMessage && <li className="meta-error">{t('cards.metaErrorDetail', { detail: card.aiMeta.errorMessage })}</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}