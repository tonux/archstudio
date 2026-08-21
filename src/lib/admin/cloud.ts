import { api } from '@/lib/api';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import type { ServiceRow } from '@/lib/templates/services';

export type AdminCloudServiceItem = {
  roleKey: string;
  locked: boolean;
  payload: ServiceRow;
};

export type CloudServiceAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  serviceCount: number;
  verifiedOn: string;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export function fetchCloudServices(): Promise<{ services: AdminCloudServiceItem[] }> {
  return api.json('/api/admin/cloud-services');
}

export function fetchCloudServicesState(options?: { validate?: boolean }): Promise<CloudServiceAdminState> {
  const qs = options?.validate ? '?validate=1' : '';
  return api.json(`/api/admin/cloud-services/state${qs}`);
}

export function createCloudService(body: { roleKey?: string; payload?: ServiceRow }): Promise<{ ok: boolean; roleKey: string }> {
  return api.json('/api/admin/cloud-services', { method: 'POST', body: JSON.stringify(body) });
}

export function updateCloudService(key: string, payload: ServiceRow): Promise<{ ok: boolean; roleKey: string }> {
  return api.json(`/api/admin/cloud-services/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ payload }),
  });
}

export function deleteCloudService(key: string): Promise<{ ok: boolean; roleKey: string }> {
  return api.json(`/api/admin/cloud-services/${key}`, { method: 'DELETE' });
}

export function patchCloudServicesVerifiedOn(verifiedOn: string): Promise<CloudServiceAdminState> {
  return api.json('/api/admin/cloud-services/state', {
    method: 'PATCH',
    body: JSON.stringify({ verifiedOn }),
  });
}

export async function publishCloudServices(): Promise<
  | { ok: true; publishedAt: string }
  | { ok: false; error: string; issues: CatalogIssue[] }
> {
  const res = await fetch('/api/admin/cloud-services/publish', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, publishedAt: body.publishedAt as string };
  return {
    ok: false,
    error: (body.error as string) || res.statusText,
    issues: (body.issues as CatalogIssue[]) ?? [],
  };
}
