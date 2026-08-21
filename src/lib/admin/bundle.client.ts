import { api } from '@/lib/api';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';

export type BundleImportMode = 'merge' | 'replace';

export type ContentBundle = {
  version: 1;
  exportedAt: string;
  domains: Record<string, unknown>;
};

export type BundleSummary = {
  domains?: ContentBundle['domains'];
  counts?: Record<string, number>;
  exportedAt?: string;
  mode?: BundleImportMode;
};

function countDomain(value: unknown): number {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value as object).length;
  return 0;
}

export function summarizeBundle(bundle: ContentBundle): BundleSummary {
  const counts: Record<string, number> = {};
  for (const [domain, payload] of Object.entries(bundle.domains ?? {})) {
    counts[domain] = countDomain(payload);
  }
  return {
    domains: bundle.domains,
    counts,
    exportedAt: bundle.exportedAt,
  };
}

export function domainEntries(summary: BundleSummary | null | undefined): [string, number][] {
  if (!summary) return [];
  if (summary.counts && Object.keys(summary.counts).length > 0) {
    return Object.entries(summary.counts).sort(([a], [b]) => a.localeCompare(b));
  }
  if (!summary.domains) return [];
  return Object.entries(summary.domains)
    .map(([domain, payload]) => [domain, countDomain(payload)] as [string, number])
    .sort(([a], [b]) => a.localeCompare(b));
}

/** Client export — downloads via blob; summary for Import page. */
export async function exportContentBundle(): Promise<{ blob: Blob; summary: BundleSummary }> {
  const bundle = await api.json<ContentBundle>('/api/admin/bundle');
  const summary = summarizeBundle(bundle);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  return { blob, summary };
}

export async function importContentBundle(
  bundle: unknown,
  mode: BundleImportMode = 'merge',
): Promise<
  | { ok: true; issues: CatalogIssue[]; summary: BundleSummary }
  | { ok: false; error: string; issues: CatalogIssue[] }
> {
  const res = await fetch('/api/admin/bundle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, bundle }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: (body.error as string) || res.statusText || 'Import failed',
      issues: (body.issues as CatalogIssue[]) ?? [],
    };
  }
  const summary: BundleSummary = {
    ...(typeof bundle === 'object' && bundle && 'domains' in bundle
      ? summarizeBundle(bundle as ContentBundle)
      : { counts: {} }),
    mode,
    exportedAt: new Date().toISOString(),
  };
  return { ok: true, issues: (body.issues as CatalogIssue[]) ?? [], summary };
}
