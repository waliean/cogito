// ============================================================
// 树生成服务 —— 一键生成完整知识图谱（design.md 扩展）
// BFS 增量扩展：已有子卡的节点跳过，不递归子树
// ============================================================

import type { Card, GenerateTreeOptions, GenerateTreeResult, GenerateTreeFailure, AiMeta } from '@cogito/shared';
import { ErrorCode } from '@cogito/shared';
import { getState } from './storage.js';
import {
  appError,
  createCard,
  getChildrenOf,
  getRootCards,
  getWorkspaceCards,
} from './cardService.js';
import { generateChildCard, type AiCallParams } from './aiService.js';

const MAX_TOTAL_CARDS = 50;
const MAX_PARENT_CONTENT_CHARS = 4000;

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length <= maxLen ? text : text.slice(0, maxLen);
}

/**
 * 一键生成完整知识图谱（BFS 增量扩展）。
 * 算法：
 * 1. 校验 workspace 存在、depth/branchesPerNode 范围
 * 2. 取全部根卡，校验非空且未超预算
 * 3. BFS 队列逐层扩展：已有子卡的节点跳过，每节点生成 branchesPerNode 个子卡
 * 4. 达到预算或队列耗尽停止
 */
export async function generateTree(
  workspaceId: string,
  options: GenerateTreeOptions,
  ai: AiCallParams,
): Promise<GenerateTreeResult> {
  // ---- 1. 校验 workspace ----
  const db = getState();
  const ws = db.workspaces.find((w) => w.id === workspaceId);
  if (!ws) {
    throw appError(ErrorCode.NOT_FOUND, `Workspace ${workspaceId} not found`);
  }

  // ---- 2. 校验参数范围 ----
  const depth = options.depth;
  const branchesPerNode = options.branchesPerNode;

  if (!Number.isInteger(depth) || depth < 1 || depth > 3) {
    throw appError(ErrorCode.VALIDATION, 'depth must be an integer in [1, 3]');
  }
  if (!Number.isInteger(branchesPerNode) || branchesPerNode < 1 || branchesPerNode > 4) {
    throw appError(ErrorCode.VALIDATION, 'branchesPerNode must be an integer in [1, 4]');
  }

  // ---- 3. 校验根卡 ----
  const roots = getRootCards(workspaceId);
  if (roots.length === 0) {
    throw appError(ErrorCode.VALIDATION, 'Workspace has no root cards to expand');
  }

  // ---- 4. 预算 ----
  const allCards = getWorkspaceCards(workspaceId);
  const currentTotal = allCards.length;
  if (currentTotal >= MAX_TOTAL_CARDS) {
    throw appError(ErrorCode.VALIDATION, `Already at ${MAX_TOTAL_CARDS} cards`);
  }
  const budget = MAX_TOTAL_CARDS - currentTotal;

  // ---- 5. BFS ----
  type QueueItem = { card: Card; depth: number };
  const queue: QueueItem[] = roots.map((card) => ({ card, depth: 1 }));

  let created = 0;
  let skipped = 0;
  let rootsProcessedCount = 0;
  let truncated = false;
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalLatency = 0;
  let anyRetried = false;
  const failures: GenerateTreeFailure[] = [];

  // 本地卡片列表，避免每次循环查全量（M1 优化）
  const localCards: Card[] = [...allCards];

  while (queue.length > 0 && created < budget) {
    const { card, depth: currentDepth } = queue.shift()!;

    // 已有子卡 → 跳过（增量语义，不递归子树）
    if (getChildrenOf(localCards, card.id).length > 0) {
      skipped++;
      continue;
    }

    // 根节点实际处理计数（H1：只计非 skipped 的根）
    if (card.parentId === null) {
      rootsProcessedCount++;
    }

    const n = Math.min(branchesPerNode, budget - created);

    for (let i = 0; i < n; i++) {
      // C1：AI 调用失败 → 收集 failures 继续；createCard 失败 → 传播
      let result: Awaited<ReturnType<typeof generateChildCard>>;
      try {
        result = await generateChildCard({
          ...ai,
          mode: 'child',
          parentTitle: card.title,
          parentContent: truncate(card.content, MAX_PARENT_CONTENT_CHARS),
        });
      } catch (err) {
        const e = err as { code?: string; message?: string };
        failures.push({
          parentId: card.id,
          parentTitle: card.title,
          code: e.code ?? ErrorCode.INTERNAL,
          message: e.message ?? 'Generation failed',
        });
        continue; // 继续下一个子卡
      }

      let child: Card;
      try {
        child = await createCard(workspaceId, {
          parentId: card.id,
          type: 'child',
          title: result.title,
          content: result.content,
          terms: result.terms,
          status: 'done',
          aiMeta: {
            model: result.model,
            mode: 'child',
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            latencyMs: result.latencyMs,
            retried: result.retried,
          },
        });
      } catch (dbErr) {
        // 数据库/编程错误传播给路由（5xx）
        throw dbErr;
      }

      // M1：新卡加入本地列表
      localCards.push(child);
      created++;

      totalPrompt += result.promptTokens;
      totalCompletion += result.completionTokens;
      totalLatency += result.latencyMs;
      if (result.retried) anyRetried = true;

      // 若当前深度未达指定深度，将子卡入队
      if (currentDepth < depth) {
        queue.push({ card: child, depth: currentDepth + 1 });
      }
    }
  }

  // ---- 7. 截断判断 ----
  if (created >= budget && queue.length > 0) {
    truncated = true;
  }

  // ---- 8. 返回 ----
  return {
    rootsProcessed: rootsProcessedCount,
    created,
    skipped,
    truncated,
    totalCards: currentTotal + created,
    failures,
    meta: {
      model: ai.model,
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      latencyMs: totalLatency,
      retried: anyRetried,
    },
  };
}