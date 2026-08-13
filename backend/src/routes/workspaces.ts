// ============================================================
// 工作区路由 —— /api/v1/workspaces
// ============================================================

import { Router } from 'express';
import { statSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { getWorkspaces, getWorkspace, createWorkspace, updateWorkspace, deleteWorkspace } from '../services/workspaceService.js';
import { getWorkspaceCards, getCardTree } from '../services/cardService.js';
import { scanFolder } from '../services/folderService.js';
import { getState } from '../services/storage.js';

const router = Router();

// 支持的文件扩展名
const SUPPORTED_EXTS = new Set(['.pdf', '.txt', '.md']);

/** 文件树节点 */
interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  ext?: string;
  size?: number;
  /** 该文件是否已导入为文档 */
  imported?: boolean;
  children?: FileTreeNode[];
}

function buildFileTree(dirPath: string, importedNames: Set<string>): FileTreeNode[] {
  const result: FileTreeNode[] = [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => {
      // 文件夹排在前面
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      // 跳过隐藏文件和 node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        const children = buildFileTree(join(dirPath, entry.name), importedNames);
        if (children.length > 0) {
          result.push({
            name: entry.name,
            path: fullPath,
            type: 'folder',
            children,
          });
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          const st = statSync(fullPath);
          result.push({
            name: entry.name,
            path: fullPath,
            type: 'file',
            ext,
            size: st.size,
            imported: importedNames.has(entry.name.toLowerCase()),
          });
        }
      }
    }
  } catch {
    // 权限不足等跳过
  }
  return result;
}

// GET /api/workspaces/:id/folder-tree 返回文件夹文件树
router.get('/:id/folder-tree', (req, res, next) => {
  try {
    const ws = getWorkspace(req.params.id);
    if (!ws) {
      res.status(404).json({ error: { code: 'E_NOT_FOUND', message: 'Workspace not found' } });
      return;
    }
    if (!ws.folderPath) {
      // 没有本地文件夹时，返回已上传的文档作为文件列表
      const docs = getState().documents.filter(
        (d) => d.workspaceId === ws.id && (d.status === 'done' || d.status === 'failed'),
      );
      const tree: FileTreeNode[] = docs.map((d) => ({
        name: d.fileName,
        path: d.fileName,
        type: 'file' as const,
        ext: extname(d.fileName).toLowerCase(),
        size: d.sizeBytes,
        imported: true,
      }));
      res.json({ tree, rootPath: null });
      return;
    }
    // 检查文件夹是否存在
    try {
      if (!statSync(ws.folderPath).isDirectory()) {
        res.json({ tree: [], rootPath: ws.folderPath, error: '路径不是文件夹' });
        return;
      }
    } catch {
      res.json({ tree: [], rootPath: ws.folderPath, error: '文件夹不存在或无法访问' });
      return;
    }
    // 收集已导入文档的文件名（不区分大小写）
    const docs = getState().documents.filter((d) => d.workspaceId === ws.id && (d.status === 'done' || d.status === 'failed'));
    const importedNames = new Set(docs.map((d) => d.fileName.toLowerCase()));
    const tree = buildFileTree(ws.folderPath, importedNames);
    res.json({ tree, rootPath: ws.folderPath });
  } catch (err) {
    next(err);
  }
});

// GET /api/workspaces/:id/folder-file?path=xxx 读取文件内容
router.get('/:id/folder-file', (req, res, next) => {
  try {
    const ws = getWorkspace(req.params.id);
    if (!ws) {
      res.status(404).json({ error: { code: 'E_NOT_FOUND', message: 'Workspace not found' } });
      return;
    }
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: { code: 'E_VALIDATION', message: 'path is required' } });
      return;
    }
    // 安全检查：确保路径在工作区文件夹内
    if (!filePath.startsWith(ws.folderPath || '')) {
      res.status(403).json({ error: { code: 'E_FORBIDDEN', message: 'Path outside workspace folder' } });
      return;
    }
    const ext = extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) {
      res.status(415).json({ error: { code: 'E_UNSUPPORTED_TYPE', message: 'Unsupported file type' } });
      return;
    }
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      res.status(400).json({ error: { code: 'E_VALIDATION', message: 'Not a file' } });
      return;
    }
    const buffer = readFileSync(filePath);
    // 文本文件直接返回内容，PDF 返回 base64 标记
    if (ext === '.pdf') {
      res.json({ fileName: filePath.split(/[\\/]/).pop(), ext, size: stats.size, isPdf: true });
    } else {
      const text = buffer.toString('utf-8');
      res.json({ fileName: filePath.split(/[\\/]/).pop(), ext, size: stats.size, content: text });
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: { code: 'E_NOT_FOUND', message: 'File not found' } });
      return;
    }
    next(err);
  }
});

// PUT /api/workspaces/:id/folder-file 保存文件内容（仅 .txt/.md）
router.put('/:id/folder-file', (req, res, next) => {
  try {
    const ws = getWorkspace(req.params.id);
    if (!ws) {
      res.status(404).json({ error: { code: 'E_NOT_FOUND', message: 'Workspace not found' } });
      return;
    }
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      res.status(400).json({ error: { code: 'E_VALIDATION', message: 'path and content are required' } });
      return;
    }
    // 安全检查
    if (!filePath.startsWith(ws.folderPath || '')) {
      res.status(403).json({ error: { code: 'E_FORBIDDEN', message: 'Path outside workspace folder' } });
      return;
    }
    const ext = extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      res.status(400).json({ error: { code: 'E_VALIDATION', message: 'Cannot edit PDF files' } });
      return;
    }
    if (!SUPPORTED_EXTS.has(ext)) {
      res.status(415).json({ error: { code: 'E_UNSUPPORTED_TYPE', message: 'Unsupported file type' } });
      return;
    }
    writeFileSync(filePath, content, 'utf-8');
    res.json({ ok: true, filePath });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: { code: 'E_NOT_FOUND', message: 'File not found' } });
      return;
    }
    next(err);
  }
});

// GET /api/workspaces
router.get('/', (_req, res, next) => {
  try {
    const workspaces = getWorkspaces();
    res.json({ workspaces });
  } catch (err) {
    next(err);
  }
});

// POST /api/workspaces
router.post('/', async (req, res, next) => {
  try {
    const { name, description, folderPath } = req.body;
    const workspace = await createWorkspace(name, description, folderPath);
    res.status(201).json({ workspace });
  } catch (err) {
    next(err);
  }
});

// GET /api/workspaces/:id
router.get('/:id', (req, res, next) => {
  try {
    const workspace = getWorkspace(req.params.id);
    if (!workspace) {
      res.status(404).json({
        error: { code: 'E_NOT_FOUND', message: `Workspace ${req.params.id} not found` },
      });
      return;
    }
    const tree = req.query.tree === 'true';
    const cards = tree ? getCardTree(workspace.id) : getWorkspaceCards(workspace.id);
    res.json({ workspace, cards });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/workspaces/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, description, folderPath } = req.body;
    const workspace = await updateWorkspace(req.params.id, { name, description, folderPath });
    res.json({ workspace });
  } catch (err) {
    next(err);
  }
});

// POST /api/workspaces/:id/scan-folder 扫描关联文件夹导入文档
router.post('/:id/scan-folder', async (req, res, next) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || !folderPath.trim()) {
      res.status(400).json({
        error: { code: 'E_VALIDATION', message: 'folderPath is required' },
      });
      return;
    }
    const result = await scanFolder(folderPath.trim(), req.params.id);
    res.json({ result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/workspaces/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await deleteWorkspace(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;