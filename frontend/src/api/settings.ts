// ============================================================
// 设置 API
// ============================================================

import type { PublicSettings, TermDictStyle, LanguagePreference } from '@cogito/shared';
import { api } from './client.js';

export interface SettingsPatch {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  dictTermStyle?: TermDictStyle;
  language?: LanguagePreference;
}

interface SettingsResponse {
  settings: PublicSettings;
}

export interface TestSettingsResult {
  ok: boolean;
  latencyMs: number;
  model: string;
}

export async function getSettings(): Promise<PublicSettings> {
  const res = await api.get<SettingsResponse>('/settings');
  return res.settings;
}

export async function updateSettings(patch: SettingsPatch): Promise<PublicSettings> {
  const res = await api.put<SettingsResponse>('/settings', patch);
  return res.settings;
}

export async function testSettings(): Promise<TestSettingsResult> {
  return api.post<TestSettingsResult>('/settings/test');
}

export interface DataPathResult {
  path: string;
}

export async function getDataPath(): Promise<DataPathResult> {
  return api.get<DataPathResult>('/data-path');
}
