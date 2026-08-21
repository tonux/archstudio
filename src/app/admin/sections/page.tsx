'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { AdminWorkspace, useAdminLocale } from '@/components/admin/AdminWorkspace';
import { NewSectionDialog } from '@/components/admin/NewSectionDialog';
import { PublishBadge } from '@/components/admin/PublishBadge';
import {
  fetchSections,
  fetchSectionState,
  publishSections,
  type AdminSectionListItem,
} from '@/lib/admin/sections';
import type { SectionType } from '@/lib/types';

const TYPE_ICONS: Record<SectionType, string> = {
  cards: 'card',
  text: 'file',
  timeline: 'clock',
  table: 'chart',
  compare: 'layers',
};

function sectionTitle(item: AdminSectionListItem, locale: 'en' | 'fr'): string {
  return locale === 'fr' ? (item.titleFr || item.id) : (item.titleEn || item.id);
}

function sectionTab(item: AdminSectionListItem, locale: 'en' | 'fr'): string | undefined {
  return locale === 'fr' ? item.tabFr : item.tabEn;
}

function SectionRow({ item, locale }: { item: AdminSectionListItem; locale: 'en' | 'fr' }) {
  return (
    <Link
      href={`/admin/sections/${item.id}`}
      className="tree-row"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <span className="ficon"><Icon name={TYPE_ICONS[item.type]} size={15} /></span>
      <span className="label">{sectionTitle(item, locale)}</span>
      <span className="count mono" style={{ fontSize: 11 }}>
        {item.type}
        {item.itemCount !== undefined ? ` · ${item.itemCount}` : ''}
        {sectionTab(item, locale) ? ` · ${sectionTab(item, locale)}` : ''}
      </span>
    </Link>
  );
}

export default function AdminSectionsPage() {
  const router = useRouter();
  const locale = useAdminLocale();
  const [sections, setSections] = useState<AdminSectionListItem[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    const [list, state] = await Promise.all([
      fetchSections(),
      fetchSectionState().catch(() => ({ dirty: false, publishedAt: null, sectionCount: 0, issues: [] as const })),
    ]);
    setSections(list.sections);
    setDirty(state.dirty);
    setPublishedAt(state.publishedAt);
    setPublishIssues((state.issues ?? []).map(issue => issue.message));
  }, []);

  useEffect(() => {
    reload().catch(err => setError(err instanceof Error ? err.message : 'Failed to load sections'));
  }, [reload]);

  async function onPublish() {
    setBusy(true);
    setError(null);
    try {
      const result = await publishSections();
      if (!result.ok) {
        setPublishIssues((result.issues ?? []).map(i => i.message));
        if (result.error) setError(result.error);
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
    if (!sections) return [];
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(item => {
      const hay = [
        item.id,
        item.type,
        item.titleEn,
        item.titleFr,
        item.tabEn,
        item.tabFr,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [sections, query]);

  const publishState = dirty ? 'modified' : publishedAt ? 'published' : 'draft';

  return (
    <>
    <AdminWorkspace
      lede="Reusable document sections — cards, text, timelines, tables, comparisons."
      search={{ value: query, onChange: setQuery, placeholder: 'Filter sections…' }}
      error={error}
      issues={publishIssues}
      actions={(
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <PublishBadge state={publishState} />
          {!dirty && publishedAt && (
            <span className="hint mono">Published {publishedAt.slice(0, 10)}</span>
          )}
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => setShowNew(true)}>
            New section
          </button>
          <button type="button" className="btn primary sm" disabled={busy} onClick={onPublish}>
            {busy ? 'Publishing…' : 'Publish sections'}
          </button>
        </div>
      )}
    >
      {!sections && !error && <AdminEmpty>Loading sections…</AdminEmpty>}
      {sections && filtered.length === 0 && (
        <AdminEmpty>
          {query ? 'No section matches this search.' : 'No sections in the library yet.'}
        </AdminEmpty>
      )}

      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map(item => (
            <SectionRow key={item.id} item={item} locale={locale} />
          ))}
        </div>
      )}
    </AdminWorkspace>

      {showNew && (
        <NewSectionDialog
          onClose={() => setShowNew(false)}
          onCreated={id => { setShowNew(false); router.push(`/admin/sections/${id}`); }}
        />
      )}
    </>
  );
}
