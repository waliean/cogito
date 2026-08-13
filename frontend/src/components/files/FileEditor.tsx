// ============================================================
// FileEditor —— 文件编辑器（打开/查看/编辑/保存本地文件）
// 支持 .txt / .md 编辑，.pdf 只读预览
// ============================================================

import { useState, useEffect } from 'react';
import { getFolderFile } from '../../api/workspaces.js';
import type { FileContentResponse } from '../../api/workspaces.js';
import { api } from '../../api/client.js';

interface FileEditorProps {
  workspaceId: string;
  filePath: string;
  fileName: string;
  onClose: () => void;
}

export function FileEditor({ workspaceId, filePath, fileName, onClose }: FileEditorProps) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPdf, setIsPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const isEditable = ext !== 'pdf';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFolderFile(workspaceId, filePath)
      .then((res) => {
        if (cancelled) return;
        if (res.isPdf) {
          setIsPdf(true);
          setContent('[PDF 文件 — 只读，不可编辑]');
          setOriginalContent('');
        } else {
          const text = res.content ?? '';
          setContent(text);
          setOriginalContent(text);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('无法读取文件');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [workspaceId, filePath]);

  const handleSave = async () => {
    if (!isEditable || content === originalContent) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/workspaces/${workspaceId}/folder-file`, { path: filePath, content });
      setOriginalContent(content);
      setSaving(false);
    } catch (e: any) {
      setError(e.message ?? '保存失败');
      setSaving(false);
    }
  };

  const hasChanges = content !== originalContent;

  return (
    <div className="file-editor-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="file-editor">
        {/* 顶栏 */}
        <div className="file-editor-topbar">
          <div className="file-editor-info">
            <span className="fe-icon fe-${ext}">
              {ext === 'pdf' ? 'PDF' : ext === 'md' ? 'MD' : 'TXT'}
            </span>
            <span className="file-editor-name">{fileName}</span>
            {hasChanges && <span className="file-editor-dirty">● 未保存</span>}
          </div>
          <div className="file-editor-actions">
            {isEditable && (
              <>
                <button
                  className={`file-editor-tab ${!preview ? 'active' : ''}`}
                  onClick={() => setPreview(false)}
                >
                  编辑
                </button>
                <button
                  className={`file-editor-tab ${preview ? 'active' : ''}`}
                  onClick={() => setPreview(true)}
                >
                  预览
                </button>
                <button
                  className="file-editor-save"
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </>
            )}
            <button className="file-editor-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && <div className="file-editor-error">{error}</div>}

        {/* 正文 */}
        <div className="file-editor-body">
          {loading ? (
            <div className="file-editor-loading">加载中…</div>
          ) : isPdf ? (
            <div className="file-editor-pdf-placeholder">
              <div className="fe-pdf-icon">PDF</div>
              <p className="fe-pdf-text">PDF 文件为只读，无法在此编辑</p>
              <p className="fe-pdf-hint">可点击「导入」将 PDF 内容转为 AI 摘要卡片</p>
            </div>
          ) : preview ? (
            <div className="file-editor-preview">
              <pre className="file-editor-preview-content">{content}</pre>
            </div>
          ) : (
            <textarea
              className="file-editor-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="file-editor-statusbar">
          <span>{fileName}</span>
          <span>
            {isEditable
              ? `${content.split('\n').length} 行 · ${content.length} 字符`
              : '只读'}
          </span>
          {hasChanges && isEditable && (
            <span className="file-editor-unsaved">有未保存的修改</span>
          )}
        </div>
      </div>
    </div>
  );
}