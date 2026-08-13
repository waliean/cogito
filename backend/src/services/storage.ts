// ============================================================
// JSON 文件存储 —— 内存缓存 + 原子写队列 + 损坏恢复
// ============================================================

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Workspace, Card, DocumentRecord, Settings, SavedTerm } from '@cogito/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR =
  process.env.DATA_DIR || resolve(__dirname, '..', '..', 'data');
const DB_PATH = resolve(DATA_DIR, 'db.json');
const TMP_PATH = resolve(DATA_DIR, 'db.json.tmp');

// ---- 数据 Schema ----

export interface DbSchema {
  version: 1;
  workspaces: Workspace[];
  cards: Card[];
  documents: DocumentRecord[];
  settings: Settings;
  savedTerms: SavedTerm[];
}

const DEFAULT_SETTINGS: Settings = {
  hasApiKey: false,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  timeoutMs: 60000,
  dictTermStyle: 'italic',
};

const INITIAL_DB: DbSchema = {
  version: 1,
  workspaces: [],
  cards: [],
  documents: [],
  settings: { ...DEFAULT_SETTINGS },
  savedTerms: [],
};

// ---- 内存缓存 ----

let _db: DbSchema | null = null;

// ---- 写队列 ----

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

// ---- 原子写 ----

function atomicWrite(db: DbSchema): void {
  mkdirSync(DATA_DIR, { recursive: true });

  const json = JSON.stringify(db, null, 2);

  // 先写入临时文件
  writeFileSync(TMP_PATH, json, 'utf-8');

  // 验证临时文件是否包含有效的 JSON（防止 tsx watch 热重启中断写入）
  try {
    const tmpContent = readFileSync(TMP_PATH, 'utf-8');
    JSON.parse(tmpContent);
  } catch {
    // 临时文件损坏，直接写入目标路径
    writeFileSync(DB_PATH, json, 'utf-8');
    try { unlinkSync(TMP_PATH); } catch { /* ignore */ }
    return;
  }

  // 使用 copyFileSync 覆盖写入（比 unlink+rename 更可靠，Windows 上更稳定）
  copyFileSync(TMP_PATH, DB_PATH);
  try { unlinkSync(TMP_PATH); } catch { /* ignore */ }
}

// ---- 加载与恢复 ----

function loadDb(): DbSchema {
  if (!existsSync(DB_PATH)) {
    mkdirSync(DATA_DIR, { recursive: true });
    atomicWrite(INITIAL_DB);
    return deepClone(INITIAL_DB);
  }

  try {
    const raw = readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    
    // 基本 schema 校验
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.version === 1 &&
      Array.isArray(parsed.workspaces) &&
      Array.isArray(parsed.cards) &&
      Array.isArray(parsed.documents)
    ) {
      // 迁移：旧数据没有 savedTerms 时补上
      if (!Array.isArray(parsed.savedTerms)) {
        (parsed as DbSchema).savedTerms = [];
      }
      return parsed as DbSchema;
    }
    throw new Error('Invalid db schema');
  } catch {
    // 损坏：备份并重建
    const ts = Date.now();
    const bakPath = resolve(DATA_DIR, `db.json.corrupted-${ts}.bak`);
    try {
      copyFileSync(DB_PATH, bakPath);
    } catch {
      // 忽略备份失败
    }
    
    console.warn(`[storage] db.json corrupted, backed up to ${bakPath}, rebuilding...`);
    atomicWrite(INITIAL_DB);
    return deepClone(INITIAL_DB);
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ---- 公开接口 ----

export function getState(): DbSchema {
  if (!_db) {
    _db = loadDb();
  }
  return _db;
}

export function save(): Promise<void> {
  return enqueueWrite(async () => {
    if (_db) {
      atomicWrite(_db);
    }
  });
}

/**
 * 在锁内修改数据库并持久化。
 * fn 接收当前状态的可变副本，修改后由 mutate 保存。
 */
export async function mutate<T>(fn: (db: DbSchema) => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    enqueueWrite(async () => {
      try {
        const db = getState();
        const result = fn(db);
        atomicWrite(db);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** 等待写队列清空（tsx watch 热重启前确保数据不丢失） */
export async function flushWrites(): Promise<void> {
  await writeQueue;
}

/** 注册优雅关闭，在进程退出前等待写队列完成 */
export function registerGracefulShutdown(): void {
  const handler = async () => {
    console.log('[storage] flushing pending writes before exit...');
    await writeQueue;
  };
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
}

/** 用于测试，重置内存状态 */
export function resetForTest(): void {
  _db = null;
  writeQueue = Promise.resolve();
}