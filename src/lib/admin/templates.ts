import { api } from '@/lib/api';
import type { Architecture } from '@/lib/types';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import type { AdminTemplateKind, ProjectTemplateCreate, ProjectTemplateMeta, ProjectTemplateUpdate } from '@/lib/admin/project-templates';
import type { Template } from '@/lib/templates/types';

export type AdminTemplateListItem = {
  id: string;
  kind: AdminTemplateKind;
  editable: boolean;
  nameEn: string;
  nameFr: string;
  sortOrder: number;
  featured: boolean;
  componentCount: number;
  sectionCount: number;
  flowCount: number;
  accent: string;
  icon: string;
  taglineEn: string;
  taglineFr: string;
};

export type ProjectTemplateDetail = {
  kind: 'project';
  editable: true;
  id: string;
  nameEn: string;
  nameFr: string;
  sortOrder: number;
  featured: boolean;
  meta: ProjectTemplateMeta;
  outline: { componentCount: number; sectionIds: string[]; flowCount: number };
  snapshot?: Architecture;
};

export type ArchitectureTemplateDetail = {
  kind: 'architecture';
  editable: true;
  locked?: boolean;
  id: string;
  nameEn: string;
  nameFr: string;
  meta: ProjectTemplateMeta & {
    whenToUseEn: string[];
    whenToUseFr: string[];
    whenNotToUseEn: string[];
    whenNotToUseFr: string[];
  };
  supportedTargets: string[];
  spec?: Template;
  outline: { componentCount: number; sectionIds: string[]; flowCount: number };
  snapshot?: Architecture;
};

export type TemplateDetail = ProjectTemplateDetail | ArchitectureTemplateDetail;

export type ProjectTemplateState = {
  dirty: boolean;
  publishedAt: string | null;
  templateCount: number;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export function fetchProjectTemplateState(options?: { validate?: boolean }): Promise<ProjectTemplateState> {
  const qs = options?.validate ? '?validate=1' : '';
  return api.json<ProjectTemplateState>(`/api/admin/templates/state${qs}`);
}

export function fetchAllTemplates(): Promise<{ templates: AdminTemplateListItem[] }> {
  return api.json('/api/admin/templates');
}

export function fetchProjectTemplates(): Promise<{ templates: AdminTemplateListItem[] }> {
  return fetchAllTemplates();
}

export function fetchTemplate(id: string): Promise<TemplateDetail> {
  return api.json(`/api/admin/templates/${id}`);
}

export function createTemplate(body: ProjectTemplateCreate): Promise<{ ok: boolean; id: string }> {
  return api.json('/api/admin/templates', { method: 'POST', body: JSON.stringify(body) });
}

export function updateTemplate(
  id: string,
  body: ProjectTemplateUpdate & { spec?: Template; snapshot?: Architecture },
): Promise<{ ok: boolean; id: string }> {
  return api.json(`/api/admin/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteTemplate(id: string): Promise<{ ok: boolean; id: string }> {
  return api.json(`/api/admin/templates/${id}`, { method: 'DELETE' });
}

export function importTemplateSnapshot(id: string, snapshot: Architecture): Promise<{ ok: boolean; id: string }> {
  return updateTemplate(id, { snapshot });
}

export async function publishProjectTemplates(): Promise<
  | { ok: true; publishedAt: string }
  | { ok: false; error: string; issues: CatalogIssue[] }
> {
  const res = await fetch('/api/admin/templates/publish', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, publishedAt: body.publishedAt as string };
  return {
    ok: false,
    error: (body.error as string) || res.statusText,
    issues: (body.issues as CatalogIssue[]) ?? [],
  };
}

export function reimportAcmeTemplate(): Promise<{ ok: boolean; id: string }> {
  return api.json('/api/admin/templates/reimport-acme', { method: 'POST' });
}
