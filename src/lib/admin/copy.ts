import { api } from '@/lib/api';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';

export type SystemCopyEntry = {
  key: string;
  en: string;
  fr: string;
  seeded: boolean;
};

export type AdminSystemCopyItem = SystemCopyEntry;

export type SystemCopyAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  keyCount: number;
  issueCount?: number;
  issues?: CatalogIssue[];
};

/** Group prefix for locale navigator (flow. / layer. / meta. / other). */
export function copyKeyGroup(key: string): string {
  const head = key.split('.')[0] ?? '';
  if (head === 'flow' || head === 'layer' || head === 'meta') return head;
  return 'other';
}

export function missingFr(entry: Pick<SystemCopyEntry, 'fr'>): boolean {
  return !entry.fr?.trim();
}

export async function fetchSystemCopy(): Promise<{ entries: SystemCopyEntry[]; keys: SystemCopyEntry[] }> {
  const body = await api.json<{ keys: SystemCopyEntry[] }>('/api/admin/system-copy');
  const keys = body.keys ?? [];
  return { entries: keys, keys };
}

export function fetchSystemCopyState(options?: { validate?: boolean }): Promise<SystemCopyAdminState> {
  const qs = options?.validate ? '?validate=1' : '';
  return api.json(`/api/admin/system-copy/state${qs}`);
}

export function createSystemCopy(body: { key: string; en?: string; fr?: string }): Promise<{ ok: boolean; key: string }> {
  return api.json('/api/admin/system-copy', { method: 'POST', body: JSON.stringify(body) });
}

export function updateSystemCopy(key: string, pair: { en?: string; fr?: string }): Promise<{ ok: boolean; key: string }> {
  return api.json(`/api/admin/system-copy/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify(pair),
  });
}

/** Alias used by Locale admin page. */
export function patchSystemCopy(key: string, pair: { en?: string; fr?: string }): Promise<{ ok: boolean; key: string }> {
  return updateSystemCopy(key, pair);
}

export function deleteSystemCopyKey(key: string): Promise<{ ok: boolean; key: string }> {
  return api.json(`/api/admin/system-copy/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

export async function publishSystemCopy(): Promise<
  | { ok: true; publishedAt: string }
  | { ok: false; error: string; issues: CatalogIssue[] }
> {
  const res = await fetch('/api/admin/system-copy/publish', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, publishedAt: body.publishedAt as string };
  return {
    ok: false,
    error: (body.error as string) || res.statusText || 'Publish failed',
    issues: (body.issues as CatalogIssue[]) ?? [],
  };
}
