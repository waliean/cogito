// ============================================================
// 工作区服务
// ============================================================

import { randomUUID } from 'node:crypto';
import type { Workspace } from '@cogito/shared';
import { ErrorCode } from '@cogito/shared';
import { getState, mutate } from './storage.js';
import { appError, cardDefaults } from './cardService.js';

function nowISO(): string {
  return new Date().toISOString();
}

export function getWorkspaces(): Workspace[] {
  return getState().workspaces;
}

export function getWorkspace(id: string): Workspace | undefined {
  return getState().workspaces.find((w) => w.id === id);
}

/**
 * 创建工作区并自动创建根卡。
 */
export async function createWorkspace(
  name: string,
  description?: string,
  folderPath?: string,
): Promise<Workspace> {
  return mutate((db) => {
    if (!name || !name.trim()) {
      throw appError(ErrorCode.VALIDATION, 'Workspace name is required');
    }

    const ws: Workspace = {
      id: randomUUID(),
      name: name.trim(),
      description: description?.trim() || undefined,
      folderPath: folderPath?.trim() || undefined,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    db.workspaces.push(ws);

    // 自动创建根卡
    const rootCard = cardDefaults({
      id: randomUUID(),
      workspaceId: ws.id,
      title: ws.name,
      content: '',
      parentId: null,
    });
    db.cards.push(rootCard);

    return ws;
  });
}

/**
 * 更新工作区（改名/改描述/改文件夹路径）。
 */
export async function updateWorkspace(
  id: string,
  patch: { name?: string; description?: string; folderPath?: string | null },
): Promise<Workspace> {
  return mutate((db) => {
    const ws = db.workspaces.find((w) => w.id === id);
    if (!ws) {
      throw appError(ErrorCode.NOT_FOUND, `Workspace ${id} not found`);
    }

    if (patch.name !== undefined) {
      if (!patch.name || !patch.name.trim()) {
        throw appError(ErrorCode.VALIDATION, 'Workspace name is required');
      }
      ws.name = patch.name.trim();
    }
    if (patch.description !== undefined) {
      ws.description = patch.description.trim() || undefined;
    }
    if (patch.folderPath !== undefined) {
      // null / 空串 = 解除文件夹关联
      ws.folderPath = patch.folderPath ? patch.folderPath.trim() : undefined;
    }
    ws.updatedAt = nowISO();
    return ws;
  });
}

/**
 * 删除工作区，级联删除所有卡片和文档。
 */
export async function deleteWorkspace(id: string): Promise<void> {
  return mutate((db) => {
    const idx = db.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) {
      throw appError(ErrorCode.NOT_FOUND, `Workspace ${id} not found`);
    }

    // 级联删除卡片
    db.cards = db.cards.filter((c) => c.workspaceId !== id);
    // 级联删除文档（修复现有 bug）
    db.documents = db.documents.filter((d) => d.workspaceId !== id);
    db.workspaces.splice(idx, 1);
  });
}