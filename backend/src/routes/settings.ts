// ============================================================
// 设置路由 —— /api/settings（design.md 3.3）
// GET 永不返回 Key 明文；PUT apiKey 空串=清除；POST /test 验证连通性
// ============================================================

import { Router } from 'express';
import { ErrorCode } from '@cogito/shared';
import {
  getPublicSettings,
  getEffectiveSettings,
  updateSettings,
  resolveApiKey,
} from '../services/settingsService.js';
import { testConnection } from '../services/aiService.js';
import { appError } from '../services/cardService.js';

const router = Router();

// GET /api/settings
router.get('/', (_req, res) => {
  res.json({ settings: getPublicSettings() });
});

// PUT /api/settings
router.put('/', async (req, res, next) => {
  try {
    const { apiKey, baseUrl, model, temperature, timeoutMs, dictTermStyle } = req.body ?? {};
    const settings = await updateSettings({ apiKey, baseUrl, model, temperature, timeoutMs, dictTermStyle });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/test
router.post('/test', async (req, res, next) => {
  try {
    const settings = getEffectiveSettings();
    const apiKey = resolveApiKey(req.aiApiKey);
    if (!apiKey) {
      throw appError(ErrorCode.NO_API_KEY, 'No API key configured. Please configure it first.');
    }

    res.setTimeout(Math.max(settings.timeoutMs, 60000) + 15000);

    const result = await testConnection({
      apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      temperature: settings.temperature,
      timeoutMs: settings.timeoutMs,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
