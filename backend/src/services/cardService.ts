// ============================================================
// 卡片服务 —— 核心树操作
// children 由 parentId 派生，不冗余存储
// ============================================================

import { randomUUID } from 'node:crypto';
import type { AiMeta, Card, CardType, CardTreeNode, GenerationMode, TermHighlight } from '@cogito/shared';
import { ErrorCode } from '@cogito/shared';
import { getState, mutate } from './storage.js';
import { generateChildCard, type AiCallParams, type AiError } from './aiService.js';

// ---- 错误 ----

class AppError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const STATUS_MAP: Record<string, number> = {
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.VALIDATION]: 400,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.CARD_BUSY]: 409,
  [ErrorCode.NO_API_KEY]: 400,
  [ErrorCode.INVALID_API_KEY]: 401,
  [ErrorCode.AI_RATE_LIMIT]: 429,
  [ErrorCode.AI_ERROR]: 502,
  [ErrorCode.AI_TIMEOUT]: 504,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.UNSUPPORTED_TYPE]: 415,
  [ErrorCode.PDF_NO_TEXT]: 422,
  [ErrorCode.TXT_DECODE]: 422,
  [ErrorCode.INTERNAL]: 500,
};

export function appError(code: string, message: string): AppError {
  return new AppError(code, message, STATUS_MAP[code] ?? 500);
}

// ---- 校验 ----

const VALID_TYPES: CardType[] = ['child', 'divergent', 'branch'];

function nowISO(): string {
  return new Date().toISOString();
}

export function cardDefaults(overrides: Partial<Card> & { id: string; workspaceId: string }): Card {
  return {
    type: 'child',
    title: '',
    content: '',
    terms: [],
    parentId: null,
    status: 'draft',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export interface CreateCardInput {
  parentId?: string | null;
  type?: CardType;
  title?: string;
  content?: string;
  terms?: TermHighlight[];
  status?: Card['status'];
  aiMeta?: Card['aiMeta'];
}

export interface UpdateCardInput {
  title?: string;
  content?: string;
  type?: CardType;
  terms?: TermHighlight[];
  parentId?: string | null;
  status?: Card['status'];
  aiMeta?: Card['aiMeta'];
}

// ---- 树辅助 ----

export function getChildrenOf(cards: Card[], parentId: string | null): Card[] {
  return cards.filter((c) => c.parentId === parentId);
}

export function buildTree(cards: Card[]): CardTreeNode[] {
  const cardMap = new Map<string, Card>();
  for (const c of cards) {
    cardMap.set(c.id, c);
  }

  // Root set: parentId === null OR parentId not in this cards set (dangling ref)
  const roots: Card[] = [];
  for (const c of cards) {
    if (c.parentId === null || !cardMap.has(c.parentId)) {
      roots.push(c);
    }
  }

  const visited = new Set<string>();
  const result: CardTreeNode[] = [];

  function buildSubtree(card: Card): CardTreeNode {
    visited.add(card.id);
    const children = getChildrenOf(cards, card.id).filter((child) => !visited.has(child.id));
    return {
      ...card,
      children: children.map((child) => buildSubtree(child)),
    };
  }

  for (const root of roots) {
    if (!visited.has(root.id)) {
      result.push(buildSubtree(root));
    }
  }

  // Append any remaining unvisited nodes (pure cycle members) in original array order
  for (const c of cards) {
    if (!visited.has(c.id)) {
      result.push({ ...c, children: [] });
    }
  }

  return result;
}

export function getDescendantIds(cards: Card[], parentId: string): string[] {
  const ids: string[] = [];
  const visited = new Set<string>();
  const queue = getChildrenOf(cards, parentId).map((c) => c.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    ids.push(id);
    queue.push(...getChildrenOf(cards, id).map((c) => c.id));
  }
  return ids;
}

// ---- CRUD ----

export function getCard(id: string): Card | undefined {
  return getState().cards.find((c) => c.id === id);
}

export function getWorkspaceCards(workspaceId: string): Card[] {
  return getState().cards.filter((c) => c.workspaceId === workspaceId);
}

export function getRootCards(workspaceId: string): Card[] {
  return getState().cards.filter((c) => c.workspaceId === workspaceId && c.parentId === null);
}

export function getCardTree(workspaceId: string): CardTreeNode[] {
  return buildTree(getWorkspaceCards(workspaceId));
}

/**
 * 创建卡片。
 * 挂载规则（design.md）：
 * - type 是语义标记（child=深入/divergent=发散/branch=分支），挂载位置由调用方决定。
 * - generate 时始终 parentId=父卡 id，type 仅表达生成语义。
 * - 手动建卡时直接使用传入的 parentId（可 null=根卡）。
 */
export async function createCard(
  workspaceId: string,
  input: CreateCardInput,
): Promise<Card> {
  return mutate((db) => {
    // 工作区存在
    const ws = db.workspaces.find((w) => w.id === workspaceId);
    if (!ws) {
      throw appError(ErrorCode.NOT_FOUND, `Workspace ${workspaceId} not found`);
    }

    const type = input.type ?? 'child';
    if (!VALID_TYPES.includes(type)) {
      throw appError(ErrorCode.VALIDATION, `Invalid card type: ${type}`);
    }

    const resolvedParentId = input.parentId ?? null;

    // 验证 parentId 存在（非 null 时）
    if (resolvedParentId !== null) {
      const parent = db.cards.find((c) => c.id === resolvedParentId);
      if (!parent) {
        throw appError(ErrorCode.NOT_FOUND, `Parent card ${resolvedParentId} not found`);
      }
      if (parent.workspaceId !== workspaceId) {
        throw appError(ErrorCode.VALIDATION, 'Parent card belongs to a different workspace');
      }
    }

    const card = cardDefaults({
      id: randomUUID(),
      workspaceId,
      type,
      title: input.title ?? '',
      content: input.content ?? '',
      terms: input.terms ?? [],
      parentId: resolvedParentId,
      status: input.status ?? 'draft',
      aiMeta: input.aiMeta,
    });

    db.cards.push(card);
    return card;
  });
}

/**
 * 更新卡片。
 */
export async function updateCard(id: string, patch: UpdateCardInput): Promise<Card> {
  return mutate((db) => {
    const card = db.cards.find((c) => c.id === id);
    if (!card) {
      throw appError(ErrorCode.NOT_FOUND, `Card ${id} not found`);
    }

    if (patch.title !== undefined) card.title = patch.title;
    if (patch.content !== undefined) card.content = patch.content;
    if (patch.type !== undefined) {
      if (!VALID_TYPES.includes(patch.type)) {
        throw appError(ErrorCode.VALIDATION, `Invalid card type: ${patch.type}`);
      }
      card.type = patch.type;
    }
    if (patch.terms !== undefined) card.terms = patch.terms;
    if (patch.parentId !== undefined) {
      if (patch.parentId !== null) {
        const parent = db.cards.find((c) => c.id === patch.parentId);
        if (!parent) {
          throw appError(ErrorCode.NOT_FOUND, `Parent card ${patch.parentId} not found`);
        }
        if (parent.workspaceId !== card.workspaceId) {
          throw appError(ErrorCode.VALIDATION, 'Parent card belongs to a different workspace');
        }
        if (patch.parentId === id) {
          throw appError(ErrorCode.CONFLICT, 'Cannot set card as its own parent');
        }
        const descendants = getDescendantIds(db.cards, id);
        if (descendants.includes(patch.parentId)) {
          throw appError(ErrorCode.CONFLICT, 'Cannot set a descendant as parent (would create a cycle)');
        }
      }
      card.parentId = patch.parentId;
    }
    if (patch.status !== undefined) card.status = patch.status;
    if (patch.aiMeta !== undefined) card.aiMeta = patch.aiMeta;

    card.updatedAt = nowISO();
    return card;
  });
}

/**
 * 删除卡片（design.md 语义）：
 * 直接子节点 parentId 置 null（提升为根），不静默丢子树。
 * 返回删除的卡片 id。
 */
export async function deleteCard(id: string): Promise<string> {
  return mutate((db) => {
    const idx = db.cards.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw appError(ErrorCode.NOT_FOUND, `Card ${id} not found`);
    }

    // 提升所有直接子节点为根
    for (const child of db.cards) {
      if (child.parentId === id) {
        child.parentId = null;
        child.updatedAt = nowISO();
      }
    }

    db.cards.splice(idx, 1);
    return id;
  });
}

// ---- AI 生成（M2） ----

/**
 * 生成子卡片编排（design.md 3.3 卡片 generate 流程）：
 * 1. 校验父卡存在、status !== 'processing'（否则 409 E_CARD_BUSY）
 * 2. 父卡置 processing 并原子保存
 * 3. 调 aiService（SDK 重试 + 解析重试）
 * 4. 成功 -> 创建子卡（status=done、type=mode、terms 来自模型、aiMeta 记录）
 * 5. 失败 -> 父卡置 failed、aiMeta.error 记录错误码；抛错并携带父卡（供响应体刷新）
 */
export async function generateCard(
  id: string,
  mode: GenerationMode,
  instruction: string | undefined,
  ai: AiCallParams,
): Promise<Card> {
  const parent = getCard(id);
  if (!parent) {
    throw appError(ErrorCode.NOT_FOUND, `Card ${id} not found`);
  }
  if (parent.status === 'processing') {
    throw appError(ErrorCode.CARD_BUSY, `Card ${id} is already processing`);
  }

  // 置 processing（禁止 processing 期间重复触发）
  await updateCard(id, { status: 'processing' });

  try {
    const result = await generateChildCard({
      ...ai,
      mode,
      parentTitle: parent.title,
      parentContent: parent.content,
      instruction,
    });

    const child = await createCard(parent.workspaceId, {
      parentId: id,
      type: mode,
      title: result.title,
      content: result.content,
      terms: result.terms,
      status: 'done',
      aiMeta: {
        model: result.model,
        mode,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs: result.latencyMs,
        retried: result.retried,
      },
    });

    // 父卡处理完成回 done（design.md 2.1 状态机）
    await updateCard(id, { status: 'done' });
    return child;
  } catch (err) {
    const e = err as Partial<AiError> & { message?: string; code?: string; statusCode?: number };
    const aiMeta: AiMeta = {
      model: e.model ?? ai.model,
      mode,
      promptTokens: e.promptTokens ?? 0,
      completionTokens: e.completionTokens ?? 0,
      latencyMs: e.latencyMs ?? 0,
      error: e.code ?? ErrorCode.INTERNAL,
      errorMessage: e.message,
    };
    await updateCard(id, { status: 'failed', aiMeta });

    const failedParent = getCard(id)!;
    const wrapped = new AppError(
      e.code ?? ErrorCode.INTERNAL,
      e.message ?? 'Card generation failed',
      e.statusCode ?? 500,
    );
    (wrapped as AppError & { card?: Card }).card = failedParent;
    throw wrapped;
  }
}