import { api } from '@/lib/api';

export type CatalogIssue = {
  code: string;
  message: string;
  field?: string;
  entityId?: string;
};

export type CatalogState = {
  dirty: boolean;
  publishedAt: string | null;
  version: string;
  issues?: CatalogIssue[];
};

export type BrickPatchBody = {
  icon: string;
  layer: string;
  defaultScope: string;
  concernTags: string[];
  purposeEn: string;
  purposeFr: string;
  roleEn: string;
  roleFr: string;
};

export function fetchCatalogState(options?: { validate?: boolean }): Promise<CatalogState> {
  const qs = options?.validate ? '?validate=1' : '';
  return api.json<CatalogState>(`/api/admin/catalog/state${qs}`);
}

export function patchBrick(
  id: string,
  body: BrickPatchBody
): Promise<{ ok: boolean; brickId: string }> {
  return api.json(`/api/admin/catalog/bricks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function createBrick(body: {
  id?: string;
  icon?: string;
  layer?: string;
  defaultScope: string;
  roleEn: string;
  roleFr: string;
  purposeEn?: string;
  purposeFr?: string;
  concernTags?: string[];
}): Promise<{ ok: boolean; brickId: string }> {
  return api.json('/api/admin/catalog/bricks', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function deleteBrick(id: string): Promise<{ ok: boolean; brickId: string }> {
  return api.json(`/api/admin/catalog/bricks/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export type PublishResult =
  | { ok: true; publishedAt: string }
  | { ok: false; error: string; issues: CatalogIssue[] };

export async function publishCatalog(): Promise<PublishResult> {
  const res = await fetch('/api/admin/catalog/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, publishedAt: body.publishedAt as string };
  return {
    ok: false,
    error: (body.error as string) || res.statusText,
    issues: (body.issues as CatalogIssue[]) ?? []
  };
}
