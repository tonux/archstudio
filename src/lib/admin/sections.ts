import { api } from '@/lib/api';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import type { Section, SectionType } from '@/lib/types';

export type AdminSectionListItem = {
  id: string;
  type: SectionType;
  titleEn: string;
  titleFr: string;
  tabEn?: string;
  tabFr?: string;
  subtitleEn?: string;
  subtitleFr?: string;
  itemCount?: number;
  publishedAt?: string | null;
};

export type AdminSectionDetail = {
  id: string;
  en: Section;
  fr: Section;
};

export type SectionUpdatePayload = {
  en: Section;
  fr: Section;
};

export type SectionLibraryState = {
  dirty: boolean;
  publishedAt: string | null;
  sectionCount: number;
  issues?: CatalogIssue[];
};

export function fetchSections(): Promise<{ sections: AdminSectionListItem[] }> {
  return api.json('/api/admin/sections');
}

export function fetchSection(id: string): Promise<AdminSectionDetail> {
  return api.json(`/api/admin/sections/${id}`);
}

export function updateSection(id: string, body: SectionUpdatePayload): Promise<{ ok: boolean }> {
  return api.json(`/api/admin/sections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function fetchSectionState(options?: { validate?: boolean }): Promise<SectionLibraryState> {
  const qs = options?.validate ? '?validate=1' : '';
  return api.json(`/api/admin/sections/state${qs}`);
}

export async function publishSections(): Promise<
  | { ok: true; publishedAt: string }
  | { ok: false; error: string; issues: CatalogIssue[] }
> {
  const res = await fetch('/api/admin/sections/publish', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, publishedAt: body.publishedAt as string };
  return {
    ok: false,
    error: (body.error as string) || res.statusText || 'Publish failed',
    issues: (body.issues as CatalogIssue[]) ?? [],
  };
}


export type SectionCreatePayload = {
  id?: string;
  type: SectionType;
  titleEn: string;
  titleFr?: string;
};

export function createSection(body: SectionCreatePayload): Promise<{ ok: boolean; id: string }> {
  return api.json('/api/admin/sections', { method: 'POST', body: JSON.stringify(body) });
}

export function deleteSection(id: string): Promise<{ ok: boolean; id: string }> {
  return api.json(`/api/admin/sections/${id}`, { method: 'DELETE' });
}
