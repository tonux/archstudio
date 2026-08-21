'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { SECTION_TYPES } from '@/lib/defaults';
import { fetchSections, type AdminSectionListItem } from '@/lib/admin/sections';
import type { SectionType } from '@/lib/types';

const TYPE_ICONS: Record<SectionType, string> = {
  cards: 'card',
  text: 'file',
  timeline: 'clock',
  table: 'chart',
  compare: 'layers',
};

const TYPE_ORDER: SectionType[] = ['cards', 'text', 'timeline', 'table', 'compare'];

function sectionTitle(item: AdminSectionListItem, locale: 'en' | 'fr'): string {
  return locale === 'fr' ? (item.titleFr || item.id) : (item.titleEn || item.id);
}

function sectionTab(item: AdminSectionListItem, locale: 'en' | 'fr'): string | undefined {
  return locale === 'fr' ? item.tabFr : item.tabEn;
}

export function BlocksDrawer({
  open,
  onClose,
  onPick,
  locale = 'en',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (sectionId: string) => void;
  locale?: 'en' | 'fr';
}) {
  const [sections, setSections] = useState<AdminSectionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<SectionType | 'all'>('all');

  const reload = useCallback(async () => {
    try {
      const data = await fetchSections();
      setSections(data.sections);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setTypeFilter('all');
    reload();
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!sections) return [];
    const q = query.trim().toLowerCase();
    return sections.filter(item => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        item.id,
        item.type,
        item.titleEn,
        item.titleFr,
        item.tabEn,
        item.tabFr,
        item.subtitleEn,
        item.subtitleFr,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [sections, query, typeFilter]);

  const grouped = useMemo(() => {
    const buckets = new Map<SectionType, AdminSectionListItem[]>();
    for (const type of TYPE_ORDER) buckets.set(type, []);
    for (const item of filtered) {
      const list = buckets.get(item.type);
      if (list) list.push(item);
    }
    return TYPE_ORDER
      .map(type => ({ type, items: buckets.get(type) ?? [] }))
      .filter(g => g.items.length > 0);
  }, [filtered]);

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <div
        className="modal wide"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="blocks-drawer-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="blocks-drawer-title">Section library</h2>
            <p className="lede">
              Pick a reusable ADD block — cards and text are the v1 priority.
            </p>
          </div>
          <button type="button" className="btn sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="ws-search inline">
            <Icon name="search" size={14} />
            <input
              className="input"
              placeholder="Filter sections…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="segmented" role="group" aria-label="Filter by type">
            <button
              type="button"
              aria-pressed={typeFilter === 'all'}
              onClick={() => setTypeFilter('all')}
            >
              All
            </button>
            {(['cards', 'text'] as const).map(type => (
              <button
                key={type}
                type="button"
                aria-pressed={typeFilter === type}
                onClick={() => setTypeFilter(type)}
              >
                {SECTION_TYPES.find(t => t.type === type)?.label ?? type}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="warnbox" style={{ marginBottom: 12 }}>{error}</div>}
        {!sections && !error && <div className="empty">Loading library…</div>}
        {sections && filtered.length === 0 && (
          <div className="empty">
            {query || typeFilter !== 'all' ? 'No section matches this filter.' : 'Library is empty.'}
          </div>
        )}

        <div style={{ maxHeight: 'min(60vh, 520px)', overflow: 'auto', paddingRight: 4 }}>
          {grouped.map(({ type, items }) => {
            const meta = SECTION_TYPES.find(t => t.type === type);
            return (
              <div key={type} style={{ marginBottom: 20 }}>
                <div className="sect-label" style={{ marginBottom: 8 }}>
                  {meta?.label ?? type} · {items.length}
                </div>
                <div className="cardlist">
                  {items.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className="pcard"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        border: '1px solid var(--line)',
                        background: 'var(--panel)',
                      }}
                      onClick={() => onPick(item.id)}
                    >
                      <div className="accent" style={{ background: 'var(--brand)' }}>
                        <Icon name={TYPE_ICONS[item.type]} size={14} style={{ stroke: 'var(--on-fill)' }} />
                      </div>
                      <b>{sectionTitle(item, locale)}</b>
                      <p>{sectionTab(item, locale) || item.id}</p>
                      <div className="foot">
                        <span className="mono">{item.id}</span>
                        <span className="count">{item.type}</span>
                        {item.itemCount !== undefined && (
                          <span className="count">{item.itemCount} items</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <Link href="/admin/sections" className="btn sm" onClick={onClose}>
            Manage library
          </Link>
        </div>
      </div>
    </div>
  );
}
