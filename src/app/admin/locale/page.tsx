'use client';

import { useEffect, useMemo, useState } from 'react';
import { Text } from '@/components/editors/Fields';
import { CatalogSaveFlag, CatalogSplitShell, CatalogTreeRow, type CatalogSaveState } from '@/components/admin/CatalogList';
import { PublishBadge } from '@/components/admin/PublishBadge';
import {
  copyKeyGroup,
  fetchSystemCopy,
  fetchSystemCopyState,
  missingFr,
  patchSystemCopy,
  publishSystemCopy,
  type SystemCopyEntry,
} from '@/lib/admin/copy';

const GROUP_ORDER = ['flow', 'layer', 'meta', 'other'] as const;

const GROUP_LABELS: Record<string, string> = {
  flow: 'flow.',
  layer: 'layer.',
  meta: 'meta.',
  other: 'other',
};

function publishBadge(dirty: boolean, publishedAt: string | null): 'draft' | 'modified' | 'published' {
  if (dirty) return 'modified';
  if (publishedAt) return 'published';
  return 'draft';
}

type Grouped = { group: string; items: SystemCopyEntry[] };

function groupEntries(entries: SystemCopyEntry[]): Grouped[] {
  const buckets = new Map<string, SystemCopyEntry[]>();
  for (const entry of entries) {
    const g = copyKeyGroup(entry.key);
    const list = buckets.get(g) ?? [];
    list.push(entry);
    buckets.set(g, list);
  }
  const ordered: Grouped[] = [];
  for (const g of GROUP_ORDER) {
    const items = buckets.get(g);
    if (items?.length) {
      ordered.push({ group: g, items: items.sort((a, b) => a.key.localeCompare(b.key)) });
      buckets.delete(g);
    }
  }
  for (const [g, items] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    ordered.push({ group: g, items: items.sort((a, b) => a.key.localeCompare(b.key)) });
  }
  return ordered;
}

export default function AdminLocalePage() {
  const [items, setItems] = useState<SystemCopyEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    const [list, state] = await Promise.all([
      fetchSystemCopy(),
      fetchSystemCopyState({ validate: true }),
    ]);
    setItems(list.entries);
    setDirty(state.dirty);
    setPublishedAt(state.publishedAt);
    setIssues((state.issues ?? []).map(i => i.message));
    setLoaded(true);
  };

  useEffect(() => {
    reload().catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setLoaded(true);
    });
  }, []);

  const current = selected ? items.find(e => e.key === selected) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(e =>
      `${e.key} ${e.en} ${e.fr}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  const grouped = useMemo(() => groupEntries(filtered), [filtered]);
  const missingFrCount = useMemo(() => items.filter(missingFr).length, [items]);

  const patchLocal = (patch: Partial<Pick<SystemCopyEntry, 'en' | 'fr'>>) => {
    if (!current) return;
    setItems(list => list.map(e => (e.key === current.key ? { ...e, ...patch } : e)));
    setSaveState('dirty');
  };

  const save = async () => {
    if (!current) return;
    setSaveState('saving');
    try {
      await patchSystemCopy(current.key, { en: current.en, fr: current.fr });
      await reload();
      setError(null);
      setSaveState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaveState('error');
    }
  };

  const onPublish = async () => {
    setBusy(true);
    try {
      const result = await publishSystemCopy();
      if (!result.ok) {
        setIssues(result.issues.map(i => i.message));
        setError(result.error);
        return;
      }
      await reload();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const emptyListMessage = !loaded
    ? 'Loading system copy…'
    : query
      ? 'No copy key matches this search.'
      : 'No copy keys — ensure domain seeded';

  return (
    <CatalogSplitShell
      countLabel={
        loaded
          ? `${filtered.length} system copy key${filtered.length === 1 ? '' : 's'}${
              missingFrCount > 0 ? ` · ${missingFrCount} missing FR` : ''
            }`
          : 'System copy — flow defaults, layer labels, meta placeholders'
      }
      query={query}
      onQuery={setQuery}
      queryPlaceholder="Filter copy keys…"
      error={error}
      issues={issues}
      actions={(
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <PublishBadge state={publishBadge(dirty, publishedAt)} />
          <button type="button" className="btn primary sm" disabled={busy} onClick={() => void onPublish()}>
            {busy ? 'Publishing…' : 'Publish system copy'}
          </button>
        </div>
      )}
      list={
        filtered.length === 0
          ? <div className="empty">{emptyListMessage}</div>
          : grouped.map(({ group, items: groupItems }) => (
            <div key={group}>
              <div className="sect-label">{GROUP_LABELS[group] ?? `${group}.`}</div>
              {groupItems.map(entry => (
                <CatalogTreeRow
                  key={entry.key}
                  active={selected === entry.key}
                  onClick={() => { setSelected(entry.key); setSaveState('idle'); }}
                  label={entry.key}
                  meta={missingFr(entry) ? 'FR?' : undefined}
                />
              ))}
            </div>
          ))
      }
      inspector={
        !current
          ? <div className="empty">{items.length === 0 && loaded ? 'No copy keys — ensure domain seeded' : 'Select a copy key'}</div>
          : (
            <>
              <div className="mono sub">{current.key}</div>
              {missingFr(current) && (
                <div className="warnbox" style={{ marginBottom: 12 }} role="status">
                  French string is empty — operators will fall back or show blanks.
                </div>
              )}
              <div className="sect-label">Copy</div>
              <Text
                label="English"
                value={current.en}
                onChange={en => patchLocal({ en })}
                onBlur={() => { if (saveState === 'dirty') void save(); }}
              />
              <Text
                label="Français"
                value={current.fr}
                onChange={fr => patchLocal({ fr })}
                onBlur={() => { if (saveState === 'dirty') void save(); }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn primary" onClick={() => void save()}>Save</button>
                <CatalogSaveFlag state={saveState} />
              </div>
            </>
          )
      }
    />
  );
}
