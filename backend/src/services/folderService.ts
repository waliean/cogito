// ============================================================
// folderService —— 扫描本地文件夹，导入文档到工作区
// 支持 .pdf / .txt / .md 文件；50MB 上限
// 复制文件到 DataDir/uploads/，创建 DocumentRecord，启动摘要流水线
// ============================================================

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorCode } from '@cogito/shared';
import { getState, mutate } from './storage.js';
import { appError } from './cardService.js';
import { getWorkspace } from './workspaceService.js';
import { processDocument } from './documentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR =
  process.env.DATA_DIR || resolve(__dirname, '..', '..', 'data');
const UPLOADS_DIR = resolve(DATA_DIR, 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 文件夹场景放宽到 50MB
const SUPPORTED_EXTS = new Set(['.pdf', '.txt', '.md']);

function nowISO(): string {
  return new Date().toISOString();
}

export interface ScanResult {
  found: number;
  imported: number;
  skipped: number;
  files: string[];
}

/**
 * 扫描文件夹，导入可读文档到指定工作区。
 * 每个文件会复制到 uploads 目录并创建 DocumentRecord（status: processing），
 * 然后异步启动摘要流水线。
 */
export async function scanFolder(
  folderPath: string,
  workspaceId: string,
): Promise<ScanResult> {
  // 验证工作区存在
  const ws = getWorkspace(workspaceId);
  if (!ws) {
    throw appError(ErrorCode.NOT_FOUND, `Workspace ${workspaceId} not found`);
  }

  // 验证文件夹存在
  try {
    if (!statSync(folderPath).isDirectory()) {
      throw appError(ErrorCode.VALIDATION, `Not a directory: ${folderPath}`);
    }
  } catch (e: any) {
    if (e.code === 'ENOENT' || e.code === 'E_NOT_FOUND') {
      throw appError(ErrorCode.VALIDATION, `Directory not found: ${folderPath}`);
    }
    throw e;
  }

  // 递归扫描文件
  const files: string[] = [];
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
        } else if (st.isFile()) {
          const ext = extname(entry).toLowerCase();
          if (SUPPORTED_EXTS.has(ext) && st.size <= MAX_FILE_SIZE) {
            files.push(full);
          }
        }
      } catch {
        // 跳过权限不足等
      }
    }
  }
  walk(folderPath);

  const result: ScanResult = { found: files.length, imported: 0, skipped: 0, files: [] };

  // 批量导入：每个文件创建 DocumentRecord
  const importPromises = files.map(async (filePath) => {
    const fileName = filePath.split(/[\\/]/).pop() || 'unknown';
    const ext = extname(fileName).toLowerCase();
    const docId = `d_${randomUUID()}`;
    const storagePath = `uploads/${docId}${ext}`;

    try {
      const buffer = readFileSync(filePath);
      // 复制文件到 uploads 目录
      writeFileSync(join(DATA_DIR, storagePath), buffer);

      await mutate((db) => {
        const record = {
          id: docId,
          workspaceId,
          fileName,
          mimeType: ext === '.pdf' ? 'application/pdf' : 'text/plain',
          sizeBytes: buffer.length,
          storagePath,
          status: 'processing' as const,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        db.documents.push(record);
      });

      result.imported++;
      result.files.push(filePath);

      // 启动摘要流水线（不 await，异步处理）
      processDocument(docId).catch(() => {});
    } catch {
      result.skipped++;
    }
  });

  await Promise.allSettled(importPromises);
  return result;
}