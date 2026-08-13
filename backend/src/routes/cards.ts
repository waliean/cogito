// ============================================================
// 卡片路由 —— /api/v1/workspaces/:wsId/cards 与 /api/v1/cards/:id
// ============================================================

import { Router } from 'express';
import {
  createCard,
  updateCard,
  deleteCard,
  getCard,
  getWorkspaceCards,
  getCardTree,
  getChildrenOf,
  generateCard,
  appError,
} from '../services/cardService.js';
import { getState } from '../services/storage.js';
import { getEffectiveSettings, resolveApiKey } from '../services/settingsService.js';
import { ErrorCode } from '@cogito/shared';
import { generateSuggestions } from '../services/aiService.js';
import { generateTree } from '../services/treeService.js';

const router = Router();

const VALID_MODES = ['child', 'divergent', 'branch'];

// GET /api/v1/workspaces/:wsId/cards
router.get('/workspaces/:wsId/cards', (req, res, next) => {
  try {
    const tree = req.query.tree === 'true';
    const cards = tree
      ? getCardTree(req.params.wsId)
      : getWorkspaceCards(req.params.wsId);
    res.json({ cards });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/workspaces/:wsId/cards
router.post('/workspaces/:wsId/cards', async (req, res, next) => {
  try {
    const { parentId, type, title, content, terms } = req.body;
    const card = await createCard(req.params.wsId, {
      parentId: parentId ?? null,
      type,
      title,
      content,
      terms,
    });
    res.status(201).json({ card });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/cards/:id
router.get('/cards/:id', (req, res, next) => {
  try {
    const card = getCard(req.params.id);
    if (!card) {
      res.status(404).json({
        error: { code: 'E_NOT_FOUND', message: `Card ${req.params.id} not found` },
      });
      return;
    }
    // 附带 children
    const allCards = getState().cards.filter((c) => c.workspaceId === card.workspaceId);
    const children = getChildrenOf(allCards, card.id);
    res.json({ card, children });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/cards/:id
router.patch('/cards/:id', async (req, res, next) => {
  try {
    const { title, content, type, terms, parentId } = req.body;
    const card = await updateCard(req.params.id, {
      title,
      content,
      type,
      terms,
      parentId,
    });
    res.json({ card });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/cards/:id
router.delete('/cards/:id', async (req, res, next) => {
  try {
    await deleteCard(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/cards/:id/generate —— AI 生成子卡（design.md 3.3）
router.post('/cards/:id/generate', async (req, res, next) => {
  try {
    const { mode, instruction } = req.body ?? {};
    if (!VALID_MODES.includes(mode)) {
      throw appError(ErrorCode.VALIDATION, `Invalid generation mode: ${mode}`);
    }

    const settings = getEffectiveSettings();
    const apiKey = resolveApiKey(req.aiApiKey);
    if (!apiKey) {
      throw appError(ErrorCode.NO_API_KEY, 'No API key configured. Please configure it in Settings.');
    }

    // Express 兜底超时（SDK 60s + 余量）
    res.setTimeout(Math.max(settings.timeoutMs, 60000) + 30000);

    const card = await generateCard(req.params.id, mode, instruction, {
      apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      temperature: settings.temperature,
      timeoutMs: settings.timeoutMs,
    });
    res.status(201).json({ card });
  } catch (err) {
    const e = err as { card?: unknown; code?: string; message?: string; statusCode?: number };
    // 失败语义：响应体携带父卡（status=failed），便于前端刷新
    if (e && e.card) {
      return res.status(e.statusCode ?? 500).json({
        error: { code: e.code ?? ErrorCode.INTERNAL, message: e.message ?? 'Generation failed' },
        card: e.card,
      });
    }
    next(err);
  }
});

// POST /api/v1/cards/:id/suggestions —— 分支建议（只读，不修改卡片状态）
router.post('/cards/:id/suggestions', async (req, res, next) => {
  try {
    const card = getCard(req.params.id);
    if (!card) {
      throw appError(ErrorCode.NOT_FOUND, `Card ${req.params.id} not found`);
    }

    const { instruction } = req.body ?? {};

    const settings = getEffectiveSettings();
    const apiKey = resolveApiKey(req.aiApiKey);
    if (!apiKey) {
      throw appError(ErrorCode.NO_API_KEY, 'No API key configured. Please configure it in Settings.');
    }

    res.setTimeout(Math.max(settings.timeoutMs, 60000) + 30000);

    const result = await generateSuggestions({
      apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      temperature: settings.temperature,
      timeoutMs: settings.timeoutMs,
      parentTitle: card.title,
      parentContent: card.content,
      instruction,
    });

    res.json({ suggestions: result.suggestions, meta: result.meta });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/workspaces/:wsId/cards/generate-tree —— 一键生成完整图
router.post('/workspaces/:wsId/cards/generate-tree', async (req, res, next) => {
  try {
    const wsId = req.params.wsId;

    // 校验 workspace 存在
    const state = getState();
    const ws = state.workspaces.find((w) => w.id === wsId);
    if (!ws) {
      throw appError(ErrorCode.NOT_FOUND, `Workspace ${wsId} not found`);
    }

    const settings = getEffectiveSettings();
    const apiKey = resolveApiKey(req.aiApiKey);
    if (!apiKey) {
      throw appError(ErrorCode.NO_API_KEY, 'No API key configured. Please configure it in Settings.');
    }

    const depth = req.body.depth ?? 2;
    const branchesPerNode = req.body.branchesPerNode ?? 3;

    // 预估调用数以计算超时（C4：正确几何级数和）
    const roots = getState().cards.filter(
      (c) => c.workspaceId === wsId && c.parentId === null,
    );
    const budget = 50 - getState().cards.filter((c) => c.workspaceId === wsId).length;
    function sumGeometric(r: number, depth: number): number {
      if (r === 1) return depth;
      return (Math.pow(r, depth + 1) - r) / (r - 1);
    }
    const estimatedCalls = Math.max(
      1,
      roots.length * Math.min(
        budget,
        Math.round(sumGeometric(branchesPerNode, depth)),
      ),
    );

    res.setTimeout(Math.min(settings.timeoutMs * Math.max(1, estimatedCalls), 300000) + 30000);

    const result = await generateTree(
      wsId,
      { depth, branchesPerNode },
      {
        apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        timeoutMs: settings.timeoutMs,
      },
    );

    res.json({ result });
  } catch (err) {
    next(err);
  }
});

export default router;