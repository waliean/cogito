// ============================================================
// FileExplorer —— 类 VS Code 文件树浏览器
// 显示工作区关联文件夹的文件树，点击预览/导入
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, useDocumentStore, useUIStore } from '../../state/store.js';
import { getFolderTree, getFolderFile } from '../../api/workspaces.js';
import type { FileTreeNode as FileNode } from '../../api/workspaces.js';
import { FileEditor } from './FileEditor.js';

interface FileExplorerProps {
  workspaceId: string;
}

/** 文件图标 */
function FileIcon({ ext }: { ext?: string }) {
  switch (ext) {
    case '.pdf': return <span className="fe-icon fe-pdf">PDF</span>;
    case '.md': return <span className="fe-icon fe-md">MD</span>;
    case '.txt': return <span className="fe-icon fe-txt">TXT</span>;
    default: return <span className="fe-icon fe-file">📄</span>;
  }
}

/** 单棵树节点 */
function TreeNode({
  node,
  depth,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  onSelect: (node: FileNode) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.type === 'folder') {
    return (
      <div className="fe-tree">
        <div
          className="fe-folder"
          style={{ paddingLeft: depth * 16 + 4 }}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="fe-arrow">{expanded ? '▾' : '▸'}</span>
          <span className="fe-folder-icon">📁</span>
          <span className="fe-folder-name">{node.name}</span>
        </div>
        {expanded && node.children?.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="fe-file"
      style={{ paddingLeft: depth * 16 + 22 }}
      onClick={() => onSelect(node)}
      title={node.path}
    >
      <FileIcon ext={node.ext} />
      <span className="fe-file-name">{node.name}</span>
      {node.imported && <span className="fe-imported-mark" title={t('files.imported')}>✓</span>}
    </div>
  );
}

export function FileExplorer({ workspaceId }: FileExplorerProps) {
  const { t } = useTranslation();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [openedFile, setOpenedFile] = useState<{ path: string; name: string } | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const ws = workspaces.find((w) => w.id === workspaceId);
  const scanFolder = useWorkspaceStore((s) => s.scanFolder);
  const upload = useDocumentStore((s) => s.upload);
  const toggleSidebarPanel = useUIStore((s) => s.toggleSidebarPanel);
  const uploading = useDocumentStore((s) => s.uploading);

  // 加载文件树
  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFolderTree(workspaceId);
      if (res.error) {
        setError(res.error);
        setTree([]);
      } else {
        setTree(res.tree);
      }
      setRootPath(res.rootPath);
    } catch {
      setTree([]);
      setRootPath(null);
      setError(t('files.loadTreeError'));
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // 选中文件 → 打开到编辑器
  const handleSelectFile = async (node: FileNode) => {
    setSelectedFile(node);
    setOpenedFile({ path: node.path, name: node.name });
  };

  // 导入文件
  const handleImport = async (node: FileNode) => {
    if (uploading) return;
    setScanMsg(t('files.importing'));
    try {
      // 通过 fetch 获取文件内容并构造 File 对象上传
      const res = await getFolderFile(workspaceId, node.path);
      if (res.isPdf) {
        // PDF 通过扫描文件夹方式导入
        await scanFolder(workspaceId, rootPath!);
      } else if (res.content !== undefined) {
        const blob = new Blob([res.content], { type: 'text/plain' });
        const file = new File([blob], node.name, { type: 'text/plain' });
        await upload(workspaceId, file);
      }
      setScanMsg(t('files.importDone'));
      setTimeout(() => setScanMsg(null), 2000);
      await loadTree();
    } catch {
      setScanMsg(t('files.importFailed'));
      setTimeout(() => setScanMsg(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="fe-container">
        <div className="fe-header">
          <span className="fe-header-title">{t('files.title')}</span>
          <button
            className="fe-refresh"
            onClick={() => toggleSidebarPanel('file')}
            title={t('common.close')}
          >
            ×
          </button>
        </div>
        <div className="fe-loading">{t('files.loadingTree')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fe-container">
        <div className="fe-header">
          <span className="fe-header-title">{t('files.title')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="fe-refresh" onClick={loadTree} title={t('common.refresh')}>↻</button>
            <button className="fe-refresh" onClick={() => toggleSidebarPanel('file')} title={t('common.close')}>×</button>
          </div>
        </div>
        <div className="fe-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="fe-container">
      {/* 文件树 */}
      <div className="fe-header">
        <span className="fe-header-title">
          {t('files.title')}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="fe-refresh" onClick={loadTree} title={t('common.refresh')}>
            ↻
          </button>
          <button className="fe-refresh" onClick={() => toggleSidebarPanel('file')} title={t('common.close')}>
            ×
          </button>
        </div>
      </div>
      <div className="fe-tree-scroll">
        {tree.length === 0 ? (
          <div className="fe-empty-files">
            {ws?.folderPath
              ? t('files.noReadableFiles')
              : t('files.noDocuments')}
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode key={node.path} node={node} depth={0} onSelect={handleSelectFile} />
          ))
        )}
      </div>

      {/* 扫描/导入状态 */}
      {scanMsg && <div className="fe-scan-msg">{scanMsg}</div>}

      {/* 文件预览面板 */}
      {selectedFile && (
        <div className="fe-preview">
          <div className="fe-preview-header">
            <span className="fe-preview-title">
              <FileIcon ext={selectedFile.ext} />
              {selectedFile.name}
            </span>
            <div className="fe-preview-actions">
              <button
                className="fe-open-btn"
                onClick={() => setOpenedFile({ path: selectedFile.path, name: selectedFile.name })}
                title={t('files.openFile')}
              >
                {t('files.open')}
              </button>
              {!selectedFile.imported && (
                <button
                  className="fe-import-btn"
                  onClick={() => handleImport(selectedFile)}
                  disabled={uploading}
                >
                  {uploading ? t('files.importing') : t('files.import')}
                </button>
              )}
              <button
                className="fe-open-btn"
                title={t('files.openInExplorer')}
                onClick={async () => {
                  const api = (window as any).cogitoAPI;
                  if (api?.isElectron) {
                    await api.openFile(selectedFile.path);
                  } else {
                    try { await navigator.clipboard.writeText(selectedFile.path); } catch {}
                  }
                }}
              >
                📂
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 文件编辑器弹层 */}
      {openedFile && (
        <FileEditor
          workspaceId={workspaceId}
          filePath={openedFile.path}
          fileName={openedFile.name}
          onClose={() => setOpenedFile(null)}
        />
      )}
    </div>
  );
}