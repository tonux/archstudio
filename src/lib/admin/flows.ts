import { api } from '@/lib/api';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import type { FlowTemplate } from '@/lib/flows/types';

export type AdminFlowListItem = {
  id: string;
  icon: string;
  nameEn: string;
  nameFr: string;
  taglineEn: string;
  taglineFr: string;
  stepCount: number;
  locked: boolean;
  publishedAt?: string | null;
};

export type FlowLibraryState = {
  dirty: boolean;
  publishedAt: string | null;
  patternCount: number;
  issues?: CatalogIssue[];
};

export type FlowPreviewStats = {
  id: string;
  stepCount: number;
  mappableSteps: number;
  matchedOnDemo: number;
};

export function fetchFlowPatterns(): Promise<{ patterns: AdminFlowListItem[] }> {
  return api.json('/api/admin/flows');
}

export function fetchFlowPattern(id: string): Promise<FlowTemplate> {
  return api.json(`/api/admin/flows/${id}`);
}

export function updateFlowPattern(id: string, body: FlowTemplate): Promise<{ ok: boolean }> {
  return api.json(`/api/admin/flows/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function fetchFlowPatternState(options?: { validate?: boolean }): Promise<FlowLibraryState> {
  const qs = options?.validate ? '?validate=1' : '';
  return api.json(`/api/admin/flows/state${qs}`);
}

export async function publishFlowPatterns(): Promise<
  | { ok: true; publishedAt: string }
  | { ok: false; error: string; issues: CatalogIssue[] }
> {
  const res = await fetch('/api/admin/flows/publish', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, publishedAt: (body.publishedAt as string) ?? new Date().toISOString() };
  return {
    ok: false,
    error: (body.error as string) || res.statusText || 'Publish failed',
    issues: (body.issues as CatalogIssue[]) ?? [],
  };
}

export function fetchFlowPatternPreview(id: string, lang: 'en' | 'fr' = 'en'): Promise<FlowPreviewStats> {
  return api.json(`/api/admin/flows/${id}/preview?lang=${lang}`);
}


export type FlowPatternCreatePayload = {
  id?: string;
  icon?: string;
  nameEn: string;
  nameFr?: string;
  taglineEn?: string;
  taglineFr?: string;
};

export function createFlowPattern(body: FlowPatternCreatePayload): Promise<{ ok: boolean; id: string }> {
  return api.json('/api/admin/flows', { method: 'POST', body: JSON.stringify(body) });
}

export function deleteFlowPattern(id: string): Promise<{ ok: boolean; id: string }> {
  return api.json(`/api/admin/flows/${id}`, { method: 'DELETE' });
}
