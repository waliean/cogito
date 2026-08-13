// ============================================================
// 文档服务 —— multer 校验落盘 + 串行摘要流水线（design.md 6）
// 上传 202 -> 串行队列 -> 提取文本 -> AI 摘要 -> 更新 document
//   -> 自动创建根卡片（sourceDocumentId 关联）
// ============================================================

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import type { DocumentRecord } from '@cogito/shared';
import { ErrorCode } from '@cogito/shared';
import { getState, mutate } from './storage.js';
import { appError, cardDefaults } from './cardService.js';
import { extractText } from '../utils/textExtract.js';
import { summarizeDocument } from './aiService.js';
import { getEffectiveSettings, resolveApiKey } from './settingsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR =
  process.env.DATA_DIR || resolve(__dirname, '..', '..', 'data');
export const UPLOADS_DIR = resolve(DATA_DIR, 'uploads');

mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUMMARY_TEXT_LIMIT = 12000;

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * multer/busboy 对非 UTF-8 文件名按 latin1 解码，中文文件名会变成乱码
 * （如 "附件一…pdf" → "ééä»¶ä¸…pdf"）。还原：latin1 → 原始字节 → UTF-8。
 * 纯 ASCII 名往返无损；解码含 U+FFFD 替换符时回退原名。
 */
function decodeFileName(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
}

// ---- multer 配置 ----

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = extname(decodeFileName(file.originalname)).toLowerCase();
    // 成对一致校验（防伪造类型）：(pdf 扩展名 + pdf MIME) 或 (txt 扩展名 + txt MIME)
    const okPair =
      (ext === '.pdf' && file.mimetype === 'application/pdf') ||
      (ext === '.txt' && file.mimetype === 'text/plain');
    if (!okPair) {
      const err: Error & { code?: string; statusCode?: number } = new Error(
        'Unsupported file type. Only PDF/TXT with matching MIME allowed',
      );
      err.code = ErrorCode.UNSUPPORTED_TYPE;
      err.statusCode = 415;
      return cb(err);
    }
    cb(null, true);
  },
});

// ---- 串行队列（防并发 AI 触发限流） ----

let docQueue: Promise<void> = Promise.resolve();

function enqueue(fn: () => Promise<void>): Promise<void> {
  docQueue = docQueue.then(fn, fn);
  return docQueue;
}

// ---- 文档 CRUD ----

export function getWorkspaceDocuments(workspaceId: string): DocumentRecord[] {
  return getState().documents.filter((d) => d.workspaceId === workspaceId);
}

export function getDocument(id: string): DocumentRecord | undefined {
  return getState().documents.find((d) => d.id === id);
}

/** 创建文档记录 + 落盘上传文件，并启动异步摘要流水线（202） */
export async function createDocument(
  workspaceId: string,
  file: Express.Multer.File,
): Promise<DocumentRecord> {
  const ws = getState().workspaces.find((w) => w.id === workspaceId);
  if (!ws) {
    throw appError(ErrorCode.NOT_FOUND, `Workspace ${workspaceId} not found`);
  }

  const docId = `d_${randomUUID()}`;
  const originalName = decodeFileName(file.originalname);
  const ext = extname(originalName).toLowerCase();
  const storagePath = `uploads/${docId}${ext}`;

  // 原样字节落盘，便于重处理
  writeFileSync(resolve(DATA_DIR, storagePath), file.buffer);

  const doc = await mutate((db) => {
    const record: DocumentRecord = {
      id: docId,
      workspaceId,
      fileName: originalName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath,
      status: 'processing',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.documents.push(record);
    return record;
  });

  // 异步处理，不阻塞响应
  void processDocument(doc.id);
  return doc;
}

/** 删除文档记录 + 上传文件；关联生成的卡片保留（design.md 3.3） */
export async function deleteDocument(id: string): Promise<void> {
  return mutate((db) => {
    const idx = db.documents.findIndex((d) => d.id === id);
    if (idx === -1) {
      throw appError(ErrorCode.NOT_FOUND, `Document ${id} not found`);
    }
    const [doc] = db.documents.splice(idx, 1);
    const abs = resolve(DATA_DIR, doc.storagePath);
    try {
      if (existsSync(abs)) unlinkSync(abs);
    } catch {
      // 忽略删除失败
    }
  });
}

// ---- 摘要流水线 ----

export async function processDocument(docId: string): Promise<void> {
  return enqueue(async () => {
    const doc = getState().documents.find((d) => d.id === docId);
    if (!doc || doc.status !== 'processing') return;

    try {
      const abs = resolve(DATA_DIR, doc.storagePath);
      const buffer = readFileSync(abs);
      const text = await extractText(doc.fileName, buffer);
      const snippet = text.length > SUMMARY_TEXT_LIMIT ? text.slice(0, SUMMARY_TEXT_LIMIT) : text;

      const settings = getEffectiveSettings();
      const apiKey = resolveApiKey();
      if (!apiKey) {
        throw appError(
          ErrorCode.NO_API_KEY,
          'No API key configured. Please configure it in Settings.',
        );
      }

      const result = await summarizeDocument({
        apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        timeoutMs: settings.timeoutMs,
        fileName: doc.fileName,
        textSnippet: snippet,
      });

      const aiMeta = {
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs: result.latencyMs,
        retried: result.retried,
      };

      await mutate((db) => {
        const d = db.documents.find((x) => x.id === docId);
        if (!d) return;
        d.status = 'done';
        d.title = result.title;
        d.summary = result.summary;
        d.terms = result.terms;
        d.aiMeta = aiMeta;
        d.updatedAt = nowISO();

        // 自动创建根卡片（design.md 6.5）
        db.cards.push(
          cardDefaults({
            id: `c_${randomUUID()}`,
            workspaceId: d.workspaceId,
            type: 'child',
            title: result.title,
            content: result.summary,
            terms: result.terms,
            parentId: null,
            status: 'done',
            sourceDocumentId: d.id,
            aiMeta: { ...aiMeta },
          }),
        );
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      await mutate((db) => {
        const d = db.documents.find((x) => x.id === docId);
        if (!d) return;
        d.status = 'failed';
        d.error = e.code ?? ErrorCode.INTERNAL;
        d.updatedAt = nowISO();
      });
    }
  });
}
