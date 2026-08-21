import { api } from '@/lib/api';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import type { Architecture } from '@/lib/types';
import type { Template } from '@/lib/templates/types';

export type ArchitectureTemplatePatch = {
  nameEn?: string;
  nameFr?: string;
  meta?: {
    icon?: string;
    accent?: string;
    accentDark?: string;
    taglineEn?: string;
    taglineFr?: string;
    whenToUseEn?: string[];
    whenToUseFr?: string[];
    whenNotToUseEn?: string[];
    whenNotToUseFr?: string[];
  };
  spec?: Template;
  /** Agnostic Architecture edit — merged into Template spec; preserves `cloud` by id. */
  snapshot?: Architecture;
};

export type ArchitectureTemplateCreate = {
  id?: string;
  nameEn: string;
  nameFr?: string;
  spec?: Template;
};

export type ArchitectureLibraryState = {
  dirty: boolean;
  publishedAt: string | null;
  templateCount: number;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export function fetchArchitectureTemplateState(options?: { validate?: boolean }): Promise<ArchitectureLibraryState> {
  const qs = options?.validate ? '?validate=1' : '';
  return api.json(`/api/admin/architecture-templates/state${qs}`);
}

export function createArchitectureTemplate(body: ArchitectureTemplateCreate): Promise<{ ok: boolean; id: string }> {
  return api.json('/api/admin/architecture-templates', { method: 'POST', body: JSON.stringify(body) });
}

export function updateArchitectureTemplate(id: string, body: ArchitectureTemplatePatch): Promise<{ ok: boolean; id: string }> {
  return api.json(`/api/admin/architecture-templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteArchitectureTemplate(id: string): Promise<{ ok: boolean; id: string }> {
  return api.json(`/api/admin/architecture-templates/${id}`, { method: 'DELETE' });
}

export async function publishArchitectureTemplates(): Promise<
  | { ok: true; publishedAt: string }
  | { ok: false; error: string; issues: CatalogIssue[] }
> {
  const res = await fetch('/api/admin/architecture-templates/publish', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, publishedAt: body.publishedAt as string };
  return {
    ok: false,
    error: (body.error as string) || res.statusText,
    issues: (body.issues as CatalogIssue[]) ?? [],
  };
}
