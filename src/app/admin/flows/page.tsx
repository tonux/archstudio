'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { AdminWorkspace, useAdminLocale } from '@/components/admin/AdminWorkspace';
import { NewFlowDialog } from '@/components/admin/NewFlowDialog';
import { PublishBadge } from '@/components/admin/PublishBadge';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import {
  fetchFlowPatterns,
  fetchFlowPatternState,
  publishFlowPatterns,
  type AdminFlowListItem,
} from '@/lib/admin/flows';

function patternTitle(item: AdminFlowListItem, locale: 'en' | 'fr'): string {
  return locale === 'fr' ? (item.nameFr || item.id) : (item.nameEn || item.id);
}

function patternTagline(item: AdminFlowListItem, locale: 'en' | 'fr'): string | undefined {
  return locale === 'fr' ? item.taglineFr : item.taglineEn;
}

function FlowRow({ item, locale }: { item: AdminFlowListItem; locale: 'en' | 'fr' }) {
  const tagline = patternTagline(item, locale);
  return (
    <Link
      href={`/admin/flows/${item.id}`}
      className="tree-row"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <span className="ficon"><Icon name={item.icon} size={15} /></span>
      <span className="stack">
        <span className="stack-title">{patternTitle(item, locale)}</span>
        {tagline ? <span className="stack-sub">{tagline}</span> : null}
      </span>
      {item.locked ? (
        <span className="count" title="Shipped catalogue recipe">Catalogue</span>
      ) : (
        <span className="count" title="Custom pattern">Custom</span>
      )}
      <span className="count" title={`${item.stepCount} steps`}>
        {item.stepCount}
      </span>
    </Link>
  );
}

export default function AdminFlowsPage() {
  const router = useRouter();
  const locale = useAdminLocale();
  const [patterns, setPatterns] = useState<AdminFlowListItem[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishIssues, setPublishIssues] = useState<CatalogIssue[]>([]);
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    const [list, state] = await Promise.all([
      fetchFlowPatterns(),
      fetchFlowPatternState().catch(() => ({ dirty: false, publishedAt: null, patternCount: 0, issues: [] as CatalogIssue[] })),
    ]);
    setPatterns(list.patterns);
    setDirty(state.dirty);
    setPublishedAt(state.publishedAt);
    setPublishIssues(state.issues ?? []);
  }, []);

  useEffect(() => {
    reload().catch(err => setError(err instanceof Error ? err.message : 'Failed to load flow patterns'));
  }, [reload]);

  async function onPublish() {
    setBusy(true);
    setError(null);
    try {
      const result = await publishFlowPatterns();
      if (!result.ok) {
        setPublishIssues(result.issues ?? []);
        return;
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!patterns) return [];
    const q = query.trim().toLowerCase();
    if (!q) return patterns;
    return patterns.filter(item => {
      const hay = [
        item.id,
        item.icon,
        item.nameEn,
        item.nameFr,
        item.taglineEn,
        item.taglineFr,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [patterns, query]);

  const publishState = dirty ? 'modified' : publishedAt ? 'published' : 'draft';

  return (
    <>
    <AdminWorkspace
      lede="Catalogue recipes plus custom patterns — edit copy, steps, and hints, then publish for insert."
      search={{ value: query, onChange: setQuery, placeholder: 'Filter patterns…' }}
      error={error}
      issues={publishIssues}
      actions={(
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <PublishBadge state={publishState} />
          {!dirty && publishedAt && (
            <span className="hint mono">Published {publishedAt.slice(0, 10)}</span>
          )}
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => setShowNew(true)}>
            New pattern
          </button>
          <button type="button" className="btn primary sm" disabled={busy} onClick={onPublish}>
            {busy ? 'Publishing…' : 'Publish patterns'}
          </button>
        </div>
      )}
    >
      {!patterns && !error && <AdminEmpty>Loading flow patterns…</AdminEmpty>}
      {patterns && filtered.length === 0 && (
        <AdminEmpty>
          {query ? 'No pattern matches this search.' : 'No flow patterns yet.'}
        </AdminEmpty>
      )}

      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map(item => (
            <FlowRow key={item.id} item={item} locale={locale} />
          ))}
        </div>
      )}
    </AdminWorkspace>

      {showNew && (
        <NewFlowDialog
          onClose={() => setShowNew(false)}
          onCreated={id => { setShowNew(false); router.push(`/admin/flows/${id}`); }}
        />
      )}
    </>
  );
}
