// ============================================================
// terms.ts —— 术语存储 API 客户端
// ============================================================

import type { SavedTerm } from '@cogito/shared';
import { api } from './client.js';

export interface TermListResponse {
  terms: SavedTerm[];
}

/**
 * 查询已保存的术语
 * @param workspaceId 可选，按工作区过滤
 * @param keyword 可选，按关键词搜索
 */
export async function fetchTerms(workspaceId?: string, keyword?: string): Promise<SavedTerm[]> {
  const params = new URLSearchParams();
  if (workspaceId) params.set('workspaceId', workspaceId);
  if (keyword) params.set('keyword', keyword);
  const qs = params.toString();
  const res = await api.get<TermListResponse>(`/terms${qs ? `?${qs}` : ''}`);
  return res.terms;
}

/**
 * 保存单个术语
 */
export async function saveTerm(data: {
  term: string;
  definition: string;
  workspaceId: string;
  sourceCardId?: string;
  sourceCardTitle?: string;
}): Promise<SavedTerm> {
  return api.post('/terms', data);
}

/**
 * 批量保存术语
 */
export async function saveTermsBatch(
  terms: { term: string; definition?: string; sourceCardId?: string; sourceCardTitle?: string }[],
  workspaceId: string,
): Promise<{ saved: number; terms: SavedTerm[] }> {
  return api.post('/terms/batch', { terms, workspaceId });
}

/**
 * 删除术语
 */
export async function deleteTerm(id: string): Promise<void> {
  await api.delete(`/terms/${id}`);
}