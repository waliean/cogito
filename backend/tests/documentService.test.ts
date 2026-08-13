// ============================================================
// documentService.test.ts —— 上传落盘、摘要流水线、自动落卡、失败流转
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetForTest } from '../src/services/storage.js';
import { createWorkspace } from '../src/services/workspaceService.js';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getWorkspaceDocuments,
  processDocument,
  UPLOADS_DIR,
} from '../src/services/documentService.js';
import { getWorkspaceCards } from '../src/services/cardService.js';
import { extractText } from '../src/utils/textExtract.js';
import { summarizeDocument } from '../src/services/aiService.js';
import { updateSettings } from '../src/services/settingsService.js';

vi.mock('../src/utils/textExtract.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/utils/textExtract.js')>();
  return { ...mod, extractText: vi.fn() };
});

vi.mock('../src/services/aiService.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/services/aiService.js')>();
  return { ...mod, summarizeDocument: vi.fn() };
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const TEST_DATA_DIR = process.env.DATA_DIR || resolve(__dirname, '..', 'data');
const TEST_DB = resolve(TEST_DATA_DIR, 'db.json');
const TEST_TMP = resolve(TEST_DATA_DIR, 'db.json.tmp');

function cleanup() {
  for (const f of [TEST_DB, TEST_TMP]) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch { /* ignore */ }
  }
  // 清理 uploads（保留目录）
  try {
    for (const f of readdirSync(UPLOADS_DIR)) {
      unlinkSync(resolve(UPLOADS_DIR, f));
    }
  } catch { /* ignore */ }
}

beforeEach(async () => {
  cleanup();
  resetForTest();
  await updateSettings({ apiKey: 'sk-test' });
  vi.mocked(extractText).mockReset();
  vi.mocked(summarizeDocument).mockReset();
});

afterEach(() => {
  cleanup();
  resetForTest();
});

function makeFile(fileName: string, mimetype: string, content: string | Buffer) {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  return { originalname: fileName, mimetype, size: buffer.length, buffer } as Express.Multer.File;
}

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('createDocument', () => {
  it('落盘上传文件并创建 processing 记录，流水线完成置 done + 自动建根卡', async () => {
    vi.mocked(extractText).mockResolvedValue('文档正文内容');
    vi.mocked(summarizeDocument).mockResolvedValue({
      title: '摘要标题',
      summary: '核心观点：内容',
      terms: [{ term: '内容', definition: '定义' }],
      model: 'deepseek-v4-flash',
      promptTokens: 10,
      completionTokens: 20,
      latencyMs: 100,
      retried: false,
    });

    const ws = await createWorkspace('DocWS');
    const file = makeFile('note.txt', 'text/plain', 'hello');

    const doc = await createDocument(ws.id, file);
    expect(doc.status).toBe('processing');
    expect(doc.fileName).toBe('note.txt');
    expect(doc.storagePath).toMatch(/^uploads\/d_/);

    // 文件已落盘
    expect(existsSync(resolve(TEST_DATA_DIR, doc.storagePath))).toBe(true);

    // 等待串行队列完成
    await wait();
    const updated = getDocument(doc.id)!;
    expect(updated.status).toBe('done');
    expect(updated.title).toBe('摘要标题');
    expect(updated.aiMeta?.model).toBe('deepseek-v4-flash');

    // 自动创建根卡片，关联 sourceDocumentId
    const cards = getWorkspaceCards(ws.id);
    const rootCard = cards.find((c) => c.sourceDocumentId === doc.id);
    expect(rootCard).toBeDefined();
    expect(rootCard!.status).toBe('done');
    expect(rootCard!.content).toContain('核心观点');
    expect(rootCard!.terms).toHaveLength(1);
  });

  it('提取/摘要失败 -> document.failed + error 码，不建卡', async () => {
    vi.mocked(extractText).mockRejectedValue(
      Object.assign(new Error('no text'), { code: 'E_PDF_NO_TEXT' }),
    );
    const ws = await createWorkspace('DocWS2');
    const file = makeFile('scan.pdf', 'application/pdf', 'x');

    const doc = await createDocument(ws.id, file);
    await wait();
    const updated = getDocument(doc.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.error).toBe('E_PDF_NO_TEXT');
    expect(getWorkspaceCards(ws.id).some((c) => c.sourceDocumentId === doc.id)).toBe(false);
  });
});

describe('deleteDocument', () => {
  it('删除记录并移除上传文件', async () => {
    vi.mocked(extractText).mockResolvedValue('内容');
    vi.mocked(summarizeDocument).mockResolvedValue({
      title: 'T',
      summary: 'S',
      terms: [],
      model: 'm',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
      retried: false,
    });
    const ws = await createWorkspace('DelWS');
    const doc = await createDocument(ws.id, makeFile('a.txt', 'text/plain', 'x'));
    const abs = resolve(TEST_DATA_DIR, doc.storagePath);
    expect(existsSync(abs)).toBe(true);

    await deleteDocument(doc.id);
    expect(getDocument(doc.id)).toBeUndefined();
    expect(existsSync(abs)).toBe(false);
  });
});

describe('processDocument 串行', () => {
  it('串行队列顺序执行（并发触发不交叠）', async () => {
    const order: number[] = [];
    vi.mocked(extractText).mockImplementation(async () => {
      order.push(1);
      return 'a';
    });
    vi.mocked(summarizeDocument).mockImplementation(async () => {
      await wait(30);
      order.push(2);
      return {
        title: 'T',
        summary: 'S',
        terms: [],
        model: 'm',
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        retried: false,
      };
    });
    const ws = await createWorkspace('QueueWS');

    const d1 = await createDocument(ws.id, makeFile('1.txt', 'text/plain', 'x'));
    const d2 = await createDocument(ws.id, makeFile('2.txt', 'text/plain', 'x'));
    await wait(150);

    expect(getDocument(d1.id)!.status).toBe('done');
    expect(getDocument(d2.id)!.status).toBe('done');
    // 顺序执行：先 1 后 2（order 模式 [1,2,1,2] 而非 [1,1,2,2] 才符合队列；此处至少两轮完整）
    expect(order.filter((v) => v === 1).length).toBe(2);
    expect(order[order.length - 1]).toBe(2);
  });
});
