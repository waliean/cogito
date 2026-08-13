// ============================================================
// terms.ts —— 术语存储 API（CRUD + 批量 + 过滤）
// 去重规则：同一名词 + 相同/近似释义 → 只保存一次，不论来源和项目
// ============================================================

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { SavedTerm } from '@cogito/shared';
import { getState, mutate } from '../services/storage.js';
import { compareDefinitions } from '../services/aiService.js';
import type { CompareDefsParams } from '../services/aiService.js';
import { resolveApiKey, getEffectiveSettings } from '../services/settingsService.js';

const router = Router();

/** 规范化释义文本，用于初步比对 */
function normalizeDef(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[。，！？；：、.!,?;:]+$/, '');
}

/** 构建 LLM 比较参数（从请求中提取 API Key 和设置） */
function buildCompareParams(req: any): CompareDefsParams | null {
  const apiKey = resolveApiKey(req.aiApiKey);
  if (!apiKey) return null;
  const settings = getEffectiveSettings();
  return {
    apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: 0.1,
    timeoutMs: 10000,
  };
}

/** 检查是否已存在相同名词 + 相同/近似释义（先用规范化比对，再用 LLM 评判） */
async function isDuplicate(
  term: string,
  definition: string,
  compareParams: CompareDefsParams | null,
): Promise<SavedTerm | undefined> {
  const sameName = getState().savedTerms.filter(
    (t) => t.term.toLowerCase() === term.toLowerCase(),
  );
  if (sameName.length === 0) return undefined;

  const ndef = normalizeDef(definition);

  // 第一步：规范化比对
  for (const existing of sameName) {
    if (normalizeDef(existing.definition) === ndef) {
      return existing;
    }
  }

  // 第二步：如果启用了 LLM，对释义不同的条目做 LLM 评判
  if (compareParams) {
    for (const existing of sameName) {
      try {
        const result = await compareDefinitions(compareParams, term, definition, existing.definition);
        if (result.similar) {
          return existing;
        }
      } catch {
        // LLM 失败，继续下一个
      }
    }
  }

  return undefined;
}

/**
 * GET /api/terms — 查询已保存的术语
 * 支持 ?workspaceId=xxx 按工作区过滤, ?keyword=xxx 按关键词搜索
 */
router.get('/', (req, res) => {
  const { workspaceId, keyword } = req.query;
  let terms = getState().savedTerms;

  if (typeof workspaceId === 'string' && workspaceId) {
    terms = terms.filter((t) => t.workspaceId === workspaceId);
  }
  if (typeof keyword === 'string' && keyword) {
    const kw = keyword.toLowerCase();
    terms = terms.filter(
      (t) => t.term.toLowerCase().includes(kw) || t.definition.toLowerCase().includes(kw),
    );
  }

  // 按保存时间降序排列
  terms = [...terms].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  res.json({ terms });
});

/**
 * POST /api/terms — 保存单个术语
 * 去重：同一名词 + 相同/近似释义 → 只保存一次，不论来源和项目
 */
router.post('/', async (req, res, next) => {
  try {
    const { term, definition, workspaceId, sourceCardId, sourceCardTitle } = req.body;
    if (!term || !definition || !workspaceId) {
      return res.status(400).json({
        error: { code: 'E_VALIDATION', message: 'term, definition, workspaceId are required' },
      });
    }

    // 去重检查
    const compareParams = buildCompareParams(req);
    const dup = await isDuplicate(term, definition, compareParams);
    if (dup) {
      return res.json(dup);
    }

    const saved: SavedTerm = {
      id: randomUUID(),
      term,
      definition,
      workspaceId,
      sourceCardId: sourceCardId || undefined,
      sourceCardTitle: sourceCardTitle || undefined,
      savedAt: new Date().toISOString(),
    };

    await mutate((db) => {
      db.savedTerms.push(saved);
    });

    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/terms/batch — 批量保存术语
 * 逐条去重，只保存真正新增的条目
 */
router.post('/batch', async (req, res, next) => {
  try {
    const { terms, workspaceId } = req.body;
    if (!Array.isArray(terms) || !workspaceId) {
      return res.status(400).json({
        error: { code: 'E_VALIDATION', message: 'terms[] and workspaceId are required' },
      });
    }

    const now = new Date().toISOString();
    const toSave: SavedTerm[] = [];
    const compareParams = buildCompareParams(req);

    for (const t of terms) {
      // 去重检查（包括已确定要保存的批次内条目）
      const batchDup = toSave.find(
        (st) => st.term.toLowerCase() === (t.term || '').toLowerCase() && normalizeDef(st.definition) === normalizeDef(t.definition || ''),
      );
      if (batchDup) continue;
      const existingDup = await isDuplicate(t.term || '', t.definition || '', compareParams);
      if (existingDup) continue;

      toSave.push({
        id: randomUUID(),
        term: t.term,
        definition: t.definition || '',
        workspaceId,
        sourceCardId: t.sourceCardId || undefined,
        sourceCardTitle: t.sourceCardTitle || undefined,
        savedAt: now,
      });
    }

    await mutate((db) => {
      db.savedTerms.push(...toSave);
    });

    res.status(201).json({ saved: toSave.length, terms: toSave });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/terms/:id — 删除单个术语
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let removed = false;

    await mutate((db) => {
      const idx = db.savedTerms.findIndex((t) => t.id === id);
      if (idx !== -1) {
        db.savedTerms.splice(idx, 1);
        removed = true;
      }
    });

    if (!removed) {
      return res.status(404).json({
        error: { code: 'E_NOT_FOUND', message: 'Term not found' },
      });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;