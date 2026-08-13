// ============================================================
// App —— 根组件：工作区列表 / 工作区视图 + 全局设置面板
// ============================================================

import { useEffect, useState, useRef } from 'react';
import {
  useWorkspaceStore,
  useCardStore,
  useUIStore,
  useDocumentStore,
} from './state/store.js';
import { AppShell } from './components/layout/AppShell.js';
import { CardTree } from './components/cards/CardTree.js';
import { CardEditor } from './components/cards/CardEditor.js';
import { MindMapView } from './components/mindscape/MindMapView.js';
import { GlossaryView } from './components/terms/GlossaryView.js';
import { DictionaryView } from './components/terms/DictionaryView.js';
import { SettingsPanel } from './components/settings/SettingsPanel.js';

function WorkspaceList() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const loading = useWorkspaceStore((s) => s.loading);
  const error = useWorkspaceStore((s) => s.error);
  const load = useWorkspaceStore((s) => s.load);
  const create = useWorkspaceStore((s) => s.create);
  const remove = useWorkspaceStore((s) => s.remove);
  const setCurrent = useWorkspaceStore((s) => s.setCurrent);
  const scanFolder = useWorkspaceStore((s) => s.scanFolder);
  const scanResult = useWorkspaceStore((s) => s.scanResult);
  const clearScanResult = useWorkspaceStore((s) => s.clearScanResult);
  const cards = useCardStore((s) => s.cards);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setView = useUIStore((s) => s.setView);

  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await create(name.trim());
    setName('');
  };

  /**
   * 选择文件夹作为工作区：
   * - Electron：cogitoAPI.selectFolder() 返回绝对路径 → 创建工作区（带folderPath）→ 后端扫描导入
   * - 浏览器：webkitdirectory 选择文件夹 → 创建工作区（不带folderPath）→ 前端逐个上传文件
   */
  const handleSelectFolder = async (files?: FileList | null) => {
    const electronApi = (window as any).cogitoAPI;
    let folderPath: string | null = null;
    let fileList: File[] = [];

    if (electronApi?.isElectron) {
      folderPath = await electronApi.selectFolder();
      if (!folderPath) return;
    } else if (files && files.length > 0) {
      fileList = Array.from(files);
      // 浏览器版：只取文件夹名用于显示，不传绝对路径（后端无法读取）
      folderPath = null;
    }

    // 创建名称
    let baseName: string;
    if (electronApi?.isElectron && folderPath) {
      baseName = folderPath.split(/[\\/]/).pop() || folderPath;
    } else if (fileList.length > 0) {
      baseName = fileList[0].webkitRelativePath?.split('/')[0] ?? fileList[0].name;
    } else {
      return;
    }

    try {
      const ws = await create(baseName, `来自文件夹${folderPath ? `：${folderPath}` : ''}`, folderPath ?? undefined);

      if (electronApi?.isElectron && folderPath) {
        // Electron：后端直接扫描本地路径
        await scanFolder(ws.id, folderPath);
      } else if (fileList.length > 0) {
        // 浏览器：上传文件夹中的可读文件
        for (const file of fileList) {
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          if (['pdf', 'txt', 'md'].includes(ext)) {
            try {
              await useDocumentStore.getState().upload(ws.id, file);
            } catch {
              // 单文件失败不中断
            }
          }
        }
      }
    } catch {
      // error shown from store
    }
  };

  // 计算每个工作区的卡片数
  const cardCountByWs = new Map<string, number>();
  for (const c of cards) {
    cardCountByWs.set(c.workspaceId, (cardCountByWs.get(c.workspaceId) ?? 0) + 1);
  }

  const filtered = search
    ? workspaces.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
    : workspaces;

  return (
    <div className="ws-list">
      {/* 顶栏 */}
      <div className="ws-list-topbar">
        <div className="ws-list-brand">
          <span className="ws-list-brand-dot" />
          <h1>Cogito</h1>
        </div>
        <div className="ws-list-actions">
          <button className="topbar-btn" onClick={() => setView('glossary')}>
            术语库
          </button>
          <button className="topbar-btn" onClick={() => setView('dictionary')}>
            词典
          </button>
          <button className="topbar-btn" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
        </div>
      </div>

      {/* 副标题 */}
      <p className="ws-list-sub">
        AI 知识卡片探索工作区
        <span className="ws-list-count">{workspaces.length} 个工作区</span>
      </p>

      {error && <div className="ws-error">{error}</div>}

      {scanResult && (
        <div className="ws-scan-result">
          扫描完成：发现 {scanResult.found} 个文件，导入 {scanResult.imported} 个，
          跳过 {scanResult.skipped} 个
          <button className="ws-scan-close" onClick={clearScanResult}>×</button>
        </div>
      )}

      {/* 创建 + 搜索栏 */}
      <div className="ws-toolbar">
        <div className="ws-create">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="新工作区名称"
            disabled={loading}
          />
          <button onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? '创建中...' : '新建'}
          </button>
          <button
            className="ws-create-folder-btn"
            onClick={() => {
              const electronApi = (window as any).cogitoAPI;
              if (electronApi?.isElectron) {
                handleSelectFolder();
              } else {
                folderInputRef.current?.click();
              }
            }}
            disabled={loading}
            title="选择本地文件夹作为工作区，自动导入 PDF/TXT/Markdown"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            选择文件夹
          </button>
          {/* 浏览器 fallback：webkitdirectory 选择文件夹 */}
          <input
            ref={folderInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              handleSelectFolder(e.target.files);
              e.target.value = '';
            }}
            {...({ webkitdirectory: '' } as any)}
          />
        </div>
        <div className="ws-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索工作区..."
          />
        </div>
      </div>

      {/* 空状态 */}
      {filtered.length === 0 && !loading && (
        <div className="ws-empty">
          {search ? '未找到匹配的工作区' : '暂无工作区，输入名称并点击「新建」，或选择本地文件夹开始探索'}
        </div>
      )}

      {/* 工作区卡片列表 */}
      <div className="ws-grid">
        {/* 新建工作区卡片 */}
        {!search && (
          <div className="ws-card ws-card-new" onClick={() => document.querySelector<HTMLInputElement>('.ws-create input')?.focus()}>
            <div className="ws-card-new-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span>新建工作区</span>
          </div>
        )}
        {filtered.map((ws) => {
          const count = cardCountByWs.get(ws.id) ?? 0;
          const created = new Date(ws.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
          return (
            <div key={ws.id} className="ws-card" onClick={() => setCurrent(ws.id)}>
              <div className="ws-card-top">
                <span className="ws-card-name">{ws.name}</span>
                <button
                  className="ws-card-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`删除工作区「${ws.name}」？`)) remove(ws.id);
                  }}
                  disabled={loading}
                  title="删除工作区"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
              {ws.description && <p className="ws-card-desc">{ws.description}</p>}
              <div className="ws-card-meta">
                <span className="ws-card-stat">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                  {count} 张卡片
                </span>
                <span className="ws-card-date">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {created}
                </span>
              </div>
              {ws.folderPath && (
                <div className="ws-card-folder" title={ws.folderPath}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  {ws.folderPath}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceView() {
  const currentId = useWorkspaceStore((s) => s.currentId);
  const loadCards = useCardStore((s) => s.loadCards);
  const tree = useCardStore((s) => s.tree);
  const error = useCardStore((s) => s.error);
  const clearError = useCardStore((s) => s.clearError);
  const view = useUIStore((s) => s.view);
  const selectedId = useCardStore((s) => s.selectedId);
  const viewSidebarOpen = useUIStore((s) => s.viewSidebarOpen);
  const setViewSidebarOpen = useUIStore((s) => s.setViewSidebarOpen);
  const setCurrent = useWorkspaceStore((s) => s.setCurrent);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWs = workspaces.find((w) => w.id === currentId);

  useEffect(() => {
    if (currentId) {
      loadCards(currentId);
    }
  }, [currentId]);

  // 选中卡片时自动打开右侧栏
  useEffect(() => {
    if (selectedId) {
      setViewSidebarOpen(true);
    }
  }, [selectedId]);

  return (
    <AppShell>
      <div className="ws-header">
        <button className="back-btn" onClick={() => setCurrent(null)}>
          &larr; 工作区列表
        </button>
        {currentWs && <span className="ws-name-header">{currentWs.name}</span>}
      </div>
      {error && (
        <div className="ws-error ws-error-inline">
          {error}
          <button className="ws-error-close" onClick={clearError}>×</button>
        </div>
      )}
      <div className="view-layout">
        <div className="view-main">
          {view === 'cards' ? (
            <CardTree nodes={tree} />
          ) : view === 'mindscape' ? (
            <MindMapView />
          ) : (
            <GlossaryView />
          )}
        </div>
        {selectedId && viewSidebarOpen && (
          <div className="view-sidebar">
            <div className="view-sidebar-header">
              <span className="view-sidebar-title">编辑卡片</span>
              <button
                className="view-sidebar-close"
                onClick={() => setViewSidebarOpen(false)}
                title="关闭右侧栏"
              >
                ×
              </button>
            </div>
            <CardEditor />
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function App() {
  const currentId = useWorkspaceStore((s) => s.currentId);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const view = useUIStore((s) => s.view);

  // 全局术语库视图（不依赖工作区）
  if (view === 'glossary' && !currentId) {
    return (
      <>
        <GlossaryView standalone />
        {settingsOpen && <SettingsPanel />}
      </>
    );
  }

  // 全局词典视图（不依赖工作区）
  if (view === 'dictionary' && !currentId) {
    return (
      <>
        <DictionaryView standalone />
        {settingsOpen && <SettingsPanel />}
      </>
    );
  }

  return (
    <>
      {currentId ? <WorkspaceView /> : <WorkspaceList />}
      {settingsOpen && <SettingsPanel />}
    </>
  );
}