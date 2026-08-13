// ============================================================
// Express 应用组装 —— 供 index.ts 与 supertest 测试共享
// ============================================================

import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import workspaceRoutes from './routes/workspaces.js';
import cardRoutes from './routes/cards.js';
import settingsRoutes from './routes/settings.js';
import documentRoutes from './routes/documents.js';
import termRoutes from './routes/terms.js';
import { apiKeyMiddleware } from './middleware/apiKey.js';
import { hasApiKeyConfigured } from './services/settingsService.js';
import { ErrorCode } from '@cogito/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || resolve(__dirname, '..', 'data');
const UPLOADS_DIR = resolve(DATA_DIR, 'uploads');

// 初始化数据目录
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(apiKeyMiddleware);

// ---- 路由 ----
// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    ai: { configured: hasApiKeyConfigured() },
    time: new Date().toISOString(),
  });
});

// 数据目录路径（用于前端"打开文件夹"功能）
app.get('/api/data-path', (_req, res) => {
  res.json({ path: DATA_DIR });
});

// 工作区 / 卡片 / 设置 / 文档
app.use('/api/workspaces', workspaceRoutes);
app.use('/api', cardRoutes);
app.use('/api', documentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/terms', termRoutes);

// ---- 前端静态托管（生产模式：Electron/便携版）----
// FRONTEND_DIST 指向 frontend/dist；命中 SPA fallback 到 index.html
const frontendDist = process.env.FRONTEND_DIST
  ? resolve(process.env.FRONTEND_DIST)
  : resolve(__dirname, '..', '..', 'frontend', 'dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/).*/i, (_req, res) => {
    res.sendFile(resolve(frontendDist, 'index.html'));
  });
}

// 404 兜底
app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: 'E_NOT_FOUND',
      message: 'Requested resource not found',
    },
  });
});

// 统一错误处理中间件
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // multer 错误映射（design.md 6.1）
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: { code: ErrorCode.FILE_TOO_LARGE, message: 'File exceeds 10MB limit' },
        });
      }
      return res.status(400).json({
        error: { code: ErrorCode.VALIDATION, message: err.message },
      });
    }

    console.error('[ERROR]', err.message, err.code ?? '');

    const statusCode = err.statusCode ?? 500;
    const code = err.code ?? 'E_INTERNAL';
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
      error: { code, message },
    });
  },
);

export { app, DATA_DIR };