// ============================================================
// 文档 API
// ============================================================

import type { DocumentRecord } from '@cogito/shared';
import { api } from './client.js';

interface DocumentListResponse {
  documents: DocumentRecord[];
}

interface DocumentResponse {
  document: DocumentRecord;
}

export async function listDocuments(wid: string): Promise<DocumentRecord[]> {
  const res = await api.get<DocumentListResponse>(`/workspaces/${wid}/documents`);
  return res.documents;
}

export async function uploadDocument(wid: string, file: File): Promise<DocumentRecord> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.upload<DocumentResponse>(`/workspaces/${wid}/documents`, form);
  return res.document;
}

export async function getDocument(id: string): Promise<DocumentRecord> {
  const res = await api.get<DocumentResponse>(`/documents/${id}`);
  return res.document;
}

export async function removeDocument(id: string): Promise<void> {
  await api.delete(`/documents/${id}`);
}

export async function retryDocument(id: string): Promise<DocumentRecord> {
  const res = await api.post<DocumentResponse>(`/documents/${id}/retry`);
  return res.document;
}
