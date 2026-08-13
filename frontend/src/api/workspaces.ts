// ============================================================
// 工作区 API
// ============================================================

import type { Workspace } from '@cogito/shared';
import { api } from './client.js';

interface WorkspaceListResponse {
  workspaces: Workspace[];
}

interface WorkspaceResponse {
  workspace: Workspace;
}

interface ScanResponse {
  result: { found: number; imported: number; skipped: number; files: string[] };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const res = await api.get<WorkspaceListResponse>('/workspaces');
  return res.workspaces;
}

export async function createWorkspace(
  name: string,
  description?: string,
  folderPath?: string,
): Promise<Workspace> {
  const res = await api.post<WorkspaceResponse>('/workspaces', { name, description, folderPath });
  return res.workspace;
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const res = await api.get<WorkspaceResponse>(`/workspaces/${id}`);
  return res.workspace;
}

export async function renameWorkspace(
  id: string,
  patch: { name?: string; description?: string; folderPath?: string | null },
): Promise<Workspace> {
  const res = await api.patch<WorkspaceResponse>(`/workspaces/${id}`, patch);
  return res.workspace;
}

export async function removeWorkspace(id: string): Promise<void> {
  await api.delete(`/workspaces/${id}`);
}

export async function scanWorkspaceFolder(
  id: string,
  folderPath: string,
): Promise<ScanResponse['result']> {
  const res = await api.post<ScanResponse>(`/workspaces/${id}/scan-folder`, { folderPath });
  return res.result;
}

// ---- 文件浏览器 ----

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  ext?: string;
  size?: number;
  imported?: boolean;
  children?: FileTreeNode[];
}

export interface FolderTreeResponse {
  tree: FileTreeNode[];
  rootPath: string | null;
  error?: string;
}

export async function getFolderTree(id: string): Promise<FolderTreeResponse> {
  return api.get<FolderTreeResponse>(`/workspaces/${id}/folder-tree`);
}

export interface FileContentResponse {
  fileName: string;
  ext: string;
  size: number;
  content?: string;
  isPdf?: boolean;
}

export async function getFolderFile(id: string, filePath: string): Promise<FileContentResponse> {
  return api.get<FileContentResponse>(`/workspaces/${id}/folder-file?path=${encodeURIComponent(filePath)}`);
}