import { api } from '@/lib/api';
import type { LegoDependencyStrength, LegoIntent, LegoVariant } from '@/lib/lego/types';
import type { ConcernTag } from '@/lib/document/concerns';

export type AdminScope = { id: string; labelEn: string; labelFr: string };

export type AdminDependency = {
  from: string;
  to: string;
  strength: LegoDependencyStrength;
  why_en: string;
  why_fr: string;
  protocol_id: string;
  kind: 'sync' | 'async' | 'batch';
};

export type AdminTechnology = { key: string; en: string; fr: string };

export type ScopeCreateBody = { id?: string; labelEn: string; labelFr: string };
export type IntentCreateBody = { id?: string; label: string; modes?: string[]; shapes?: string[] };
export type VariantCreateBody = {
  id?: string;
  label: string;
  intent: string;
  mode: LegoVariant['mode'];
  maps_to: string;
};
export type TechnologyCreateBody = { key?: string; en: string; fr: string };
export type DependencyCreateBody = {
  from: string;
  to: string;
  strength?: LegoDependencyStrength;
  why_en?: string;
  why_fr?: string;
  protocol_id?: string;
  kind?: 'sync' | 'async' | 'batch';
};
export type BrickCreateBody = {
  id?: string;
  icon?: string;
  layer?: string;
  defaultScope: string;
  roleEn: string;
  roleFr: string;
  purposeEn?: string;
  purposeFr?: string;
  concernTags?: ConcernTag[];
};

export function fetchScopes(): Promise<AdminScope[]> {
  return api.json<{ scopes: AdminScope[] }>('/api/admin/catalog/scopes').then(r => r.scopes);
}

export function createScope(body: ScopeCreateBody): Promise<{ ok: boolean; scopeId: string }> {
  return api.json('/api/admin/catalog/scopes', { method: 'POST', body: JSON.stringify(body) });
}

export function patchScope(id: string, body: { labelEn?: string; labelFr?: string }): Promise<{ ok: boolean; scopeId: string }> {
  return api.json(`/api/admin/catalog/scopes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteScope(id: string): Promise<{ ok: boolean; scopeId: string }> {
  return api.json(`/api/admin/catalog/scopes/${id}`, { method: 'DELETE' });
}

export function fetchIntents(): Promise<LegoIntent[]> {
  return api.json<{ intents: LegoIntent[] }>('/api/admin/catalog/intents').then(r => r.intents);
}

export function fetchIntent(id: string): Promise<LegoIntent> {
  return api.json<{ intent: LegoIntent }>(`/api/admin/catalog/intents/${id}`).then(r => r.intent);
}

export function createIntent(body: IntentCreateBody): Promise<{ ok: boolean; intentId: string }> {
  return api.json('/api/admin/catalog/intents', { method: 'POST', body: JSON.stringify(body) });
}

export function patchIntent(id: string, body: { label?: string; modes?: string[]; shapes?: string[] }): Promise<{ ok: boolean; intentId: string }> {
  return api.json(`/api/admin/catalog/intents/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteIntent(id: string): Promise<{ ok: boolean; intentId: string }> {
  return api.json(`/api/admin/catalog/intents/${id}`, { method: 'DELETE' });
}

export function fetchVariants(): Promise<LegoVariant[]> {
  return api.json<{ variants: LegoVariant[] }>('/api/admin/catalog/variants').then(r => r.variants);
}

export function createVariant(body: VariantCreateBody): Promise<{ ok: boolean; variantId: string }> {
  return api.json('/api/admin/catalog/variants', { method: 'POST', body: JSON.stringify(body) });
}

export function patchVariant(id: string, body: Partial<Pick<LegoVariant, 'label' | 'intent' | 'mode' | 'maps_to'>>): Promise<{ ok: boolean; variantId: string }> {
  return api.json(`/api/admin/catalog/variants/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteVariant(id: string): Promise<{ ok: boolean; variantId: string }> {
  return api.json(`/api/admin/catalog/variants/${id}`, { method: 'DELETE' });
}

export function fetchDependencies(): Promise<AdminDependency[]> {
  return api.json<{ dependencies: AdminDependency[] }>('/api/admin/catalog/dependencies').then(r => r.dependencies);
}

export function createDependency(body: DependencyCreateBody): Promise<{ ok: boolean; from: string; to: string }> {
  return api.json('/api/admin/catalog/dependencies', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function patchDependency(from: string, to: string, body: Partial<Omit<AdminDependency, 'from' | 'to'>>): Promise<{ ok: boolean }> {
  return api.json('/api/admin/catalog/dependencies', {
    method: 'PATCH',
    body: JSON.stringify({ from, to, ...body }),
  });
}

export function deleteDependency(from: string, to: string): Promise<{ ok: boolean; from: string; to: string }> {
  const qs = new URLSearchParams({ from, to });
  return api.json(`/api/admin/catalog/dependencies?${qs}`, { method: 'DELETE' });
}

export function fetchTechnologies(): Promise<AdminTechnology[]> {
  return api.json<{ technologies: Record<string, { en: string; fr: string }> }>('/api/admin/catalog/technologies')
    .then(r => Object.entries(r.technologies).map(([key, value]) => ({ key, en: value.en, fr: value.fr })));
}

export function createTechnology(body: TechnologyCreateBody): Promise<{ ok: boolean; key: string }> {
  return api.json('/api/admin/catalog/technologies', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function patchTechnology(key: string, body: { en?: string; fr?: string }): Promise<{ ok: boolean; key: string }> {
  return api.json(`/api/admin/catalog/technologies/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteTechnology(key: string): Promise<{ ok: boolean; key: string }> {
  return api.json(`/api/admin/catalog/technologies/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

export function createBrick(body: BrickCreateBody): Promise<{ ok: boolean; brickId: string }> {
  return api.json('/api/admin/catalog/bricks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteBrick(id: string): Promise<{ ok: boolean; brickId: string }> {
  return api.json(`/api/admin/catalog/bricks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
