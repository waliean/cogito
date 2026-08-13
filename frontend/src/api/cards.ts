// ============================================================
// 卡片 API
// ============================================================

import type { Card, CardTreeNode, GenerateSuggestionsResult, GenerateTreeOptions, GenerateTreeResult } from '@cogito/shared';
import { api } from './client.js';

interface CardListResponse {
  cards: Card[] | CardTreeNode[];
}

interface CardResponse {
  card: Card;
}

interface CardWithChildrenResponse {
  card: Card;
  children: Card[];
}

export interface CreateCardInput {
  parentId?: string | null;
  type?: string;
  title?: string;
  content?: string;
  terms?: { term: string; definition?: string }[];
}

export interface UpdateCardInput {
  title?: string;
  content?: string;
  type?: string;
  terms?: { term: string; definition?: string }[];
  parentId?: string | null;
}

export async function listCards(
  wid: string,
  tree?: boolean,
): Promise<Card[] | CardTreeNode[]> {
  const query = tree ? '?tree=true' : '';
  const res = await api.get<CardListResponse>(`/workspaces/${wid}/cards${query}`);
  return res.cards;
}

export async function getCard(id: string): Promise<CardWithChildrenResponse> {
  return api.get<CardWithChildrenResponse>(`/cards/${id}`);
}

export async function createCard(wid: string, input: CreateCardInput): Promise<Card> {
  const res = await api.post<CardResponse>(`/workspaces/${wid}/cards`, input);
  return res.card;
}

export async function updateCard(id: string, patch: UpdateCardInput): Promise<Card> {
  const res = await api.patch<CardResponse>(`/cards/${id}`, patch);
  return res.card;
}

export async function removeCard(id: string): Promise<void> {
  await api.delete(`/cards/${id}`);
}

export async function generateCard(
  id: string,
  mode: string,
  instruction?: string,
): Promise<Card> {
  const res = await api.post<CardResponse>(`/cards/${id}/generate`, { mode, instruction });
  return res.card;
}

export async function getCardSuggestions(id: string, instruction?: string): Promise<GenerateSuggestionsResult> {
  return api.post<GenerateSuggestionsResult>(`/cards/${id}/suggestions`, { instruction });
}

export async function generateTree(wid: string, opts: GenerateTreeOptions): Promise<GenerateTreeResult> {
  const res = await api.post<{ result: GenerateTreeResult }>(`/workspaces/${wid}/cards/generate-tree`, opts);
  return res.result;
}