// ============================================================
// API Key 中间件 —— X-API-Key 头解析（design.md 3.2）
// 规则：请求头 X-API-Key 非空 -> 注入 req.aiApiKey（临时覆盖，不写回存储）
// ============================================================

import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      aiApiKey?: string;
    }
  }
}

export function apiKeyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('X-API-Key');
  if (header && header.trim()) {
    req.aiApiKey = header.trim();
  }
  next();
}
