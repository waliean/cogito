// ============================================================
// AppShell —— 顶栏 + 视图切换 + 侧栏（文件浏览器/文档/术语库）+ 设置面板
// ============================================================

import { useEffect } from 'react';
import { useWorkspaceStore } from '../../state/store.js';
import { useUIStore } from '../../state/store.js';
import { useDocumentStore } from '../../state/store.js';
import type { ViewMode } from '@cogito/shared';
import { SettingsPanel } from '../settings/SettingsPanel.js';
import { UploadPanel } from '../documents/UploadPanel.js';
import { TermLibrary } from '../terms/TermLibrary.js';
import { TermTooltip } from '../terms/TermTooltip.js';
import { FileExplorer } from '../files/FileExplorer.js';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const currentId = useWorkspaceStore((s) => s.currentId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWs = workspaces.find((w) => w.id === currentId);
  const view = useUIStore((s) => s.view);
  const setView = useUIStore((s) => s.setView);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const sidebarPanel = useUIStore((s) => s.sidebarPanel);
  const toggleSidebarPanel = useUIStore((s) => s.toggleSidebarPanel);
  const listDocuments = useDocumentStore((s) => s.list);

  useEffect(() => {
    if (currentId) {
      listDocuments(currentId);
    }
  }, [currentId]);

  const views: { key: ViewMode; label: string }[] = [
    { key: 'cards', label: '卡片' },
    { key: 'mindscape', label: '导图' },
    { key: 'glossary', label: '术语库' },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-title">
          {currentWs?.name ?? 'Cogito'}
        </span>
        <nav className="topbar-nav">
          {views.map((v) => (
            <button
              key={v.key}
              className={`topbar-btn ${view === v.key ? 'active' : ''}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
          <button
            className="topbar-btn"
            onClick={() => setSettingsOpen(true)}
          >
            设置
          </button>
        </nav>
      </header>
      <main className="main-area">
        <aside className="sidebar">
          <button
            className={`sidebar-btn ${sidebarPanel === 'file' ? 'active' : ''}`}
            onClick={() => toggleSidebarPanel('file')}
          >
            文件
          </button>
          <button
            className={`sidebar-btn ${sidebarPanel === 'doc' ? 'active' : ''}`}
            onClick={() => toggleSidebarPanel('doc')}
          >
            文档
          </button>
          <TermLibrary />
        </aside>
        <section className="content">
          {children}
        </section>
      </main>
      {sidebarPanel === 'doc' && (
        <div className="sidebar-drawer">
          <UploadPanel />
        </div>
      )}
      {sidebarPanel === 'file' && currentId && (
        <div className="sidebar-drawer fe-drawer">
          <FileExplorer workspaceId={currentId} />
        </div>
      )}
      {settingsOpen && <SettingsPanel />}
      <TermTooltip />
    </div>
  );
}