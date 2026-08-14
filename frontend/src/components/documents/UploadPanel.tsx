// ============================================================
// UploadPanel —— 文档上传 + 列表 + 轮询 + 重试/删除（M4）
// ============================================================

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentStore, useWorkspaceStore, useUIStore } from '../../state/store.js';
import { usePolling } from '../../hooks/usePolling.js';
import type { DocumentRecord } from '@cogito/shared';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function UploadPanel() {
  const { t } = useTranslation();
  const currentId = useWorkspaceStore((s) => s.currentId);
  const documents = useDocumentStore((s) => s.documents);
  const uploading = useDocumentStore((s) => s.uploading);
  const pollingId = useDocumentStore((s) => s.pollingId);
  const upload = useDocumentStore((s) => s.upload);
  const refreshDocument = useDocumentStore((s) => s.refreshDocument);
  const remove = useDocumentStore((s) => s.remove);
  const retry = useDocumentStore((s) => s.retry);
  const toggleSidebarPanel = useUIStore((s) => s.toggleSidebarPanel);

  const fileRef = useRef<HTMLInputElement>(null);

  usePolling(() => {
    if (pollingId) refreshDocument(pollingId);
  }, !!pollingId);

  const handleUpload = async (file: File | undefined) => {
    if (!file || !currentId || uploading) return;
    try {
      await upload(currentId, file);
    } catch {
      // error shown from store
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="upload-panel">
      <div className="upload-panel-header">
        <span>{t('documents.title')}</span>
        <button className="panel-close" onClick={() => toggleSidebarPanel('doc')}>×</button>
      </div>

      <div className="upload-zone">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt"
          onChange={(e) => handleUpload(e.target.files?.[0])}
          disabled={uploading}
        />
        {uploading && <p className="upload-hint">{t('documents.uploading')}</p>}
      </div>

      {documents.length === 0 && !uploading && (
        <p className="upload-empty">{t('documents.emptyHint')}</p>
      )}

      <ul className="doc-list">
        {documents.map((doc) => (
          <li key={doc.id} className={`doc-item doc-${doc.status}`}>
            <div className="doc-main">
              <span className="doc-title" title={doc.title || doc.fileName}>
                {doc.title || doc.fileName}
              </span>
              <span className="doc-meta">
                {doc.fileName} · {formatSize(doc.sizeBytes)} · {t('documents.status.' + doc.status)}
              </span>
              {doc.status === 'failed' && doc.error && (
                <span className="doc-error">{t('documents.errorCode', { code: doc.error })}</span>
              )}
            </div>
            <div className="doc-actions">
              {doc.status === 'failed' && (
                <button onClick={() => retry(doc.id)}>{t('documents.retry')}</button>
              )}
              <button
                className="danger"
                onClick={() => {
                  if (confirm(t('documents.deleteConfirm', { name: doc.fileName }))) remove(doc.id);
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}