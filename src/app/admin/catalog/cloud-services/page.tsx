'use client';

import { useEffect, useMemo, useState } from 'react';
import { Group, Text } from '@/components/editors/Fields';
import { CatalogSaveFlag, CatalogSplitShell, CatalogTreeRow, type CatalogSaveState } from '@/components/admin/CatalogList';
import { NewCloudServiceDialog } from '@/components/admin/NewCloudServiceDialog';
import { PublishBadge } from '@/components/admin/PublishBadge';
import {
  deleteCloudService,
  fetchCloudServices,
  fetchCloudServicesState,
  patchCloudServicesVerifiedOn,
  publishCloudServices,
  updateCloudService,
  type AdminCloudServiceItem,
} from '@/lib/admin/cloud';
import type { L10n } from '@/lib/templates/types';
import { RESOLVED_TARGETS, TARGET_LABELS, t } from '@/lib/templates/types';
import type { ServiceCell, ServiceRow } from '@/lib/templates/services';

function locPair(value: L10n | undefined): { en: string; fr: string } {
  if (!value) return { en: '', fr: '' };
  if (typeof value === 'string') return { en: value, fr: value };
  return { en: value.en ?? '', fr: value.fr ?? '' };
}

function fromPair(en: string, fr: string): L10n {
  if (en === fr) return en;
  return { en, fr };
}

function publishBadge(dirty: boolean, publishedAt: string | null): 'draft' | 'modified' | 'published' {
  if (dirty) return 'modified';
  if (publishedAt) return 'published';
  return 'draft';
}

export default function AdminCloudServicesPage() {
  const [items, setItems] = useState<AdminCloudServiceItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [verifiedOn, setVerifiedOn] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [showNew, setShowNew] = useState(false);

  const reload = async () => {
    const [list, state] = await Promise.all([
      fetchCloudServices(),
      fetchCloudServicesState({ validate: true }),
    ]);
    setItems(list.services);
    setDirty(state.dirty);
    setPublishedAt(state.publishedAt);
    setVerifiedOn(state.verifiedOn);
    setIssues((state.issues ?? []).map(i => i.message));
  };

  useEffect(() => {
    reload().catch(err => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const current = selected ? items.find(s => s.roleKey === selected) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(s => s.roleKey.toLowerCase().includes(q));
  }, [items, query]);

  const patchCell = (target: keyof ServiceRow, patch: Partial<ServiceCell>) => {
    if (!current) return;
    setItems(list => list.map(item => {
      if (item.roleKey !== current.roleKey) return item;
      return {
        ...item,
        payload: {
          ...item.payload,
          [target]: { ...item.payload[target], ...patch },
        },
      };
    }));
    setSaveState('dirty');
  };

  const save = async () => {
    if (!current) return;
    setSaveState('saving');
    try {
      await updateCloudService(current.roleKey, current.payload);
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
      const result = await publishCloudServices();
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

  const onDelete = async () => {
    if (!current) return;
    if (!window.confirm(`Delete cloud service "${current.roleKey}"? Seeded keys re-seed on next ensure.`)) return;
    setBusy(true);
    try {
      await deleteCloudService(current.roleKey);
      setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CatalogSplitShell
        countLabel={`${filtered.length} role${filtered.length === 1 ? '' : 's'} — hyperscaler correspondence table`}
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Filter role keys…"
        error={error}
        issues={issues}
        actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <PublishBadge state={publishBadge(dirty, publishedAt)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="hint" style={{ margin: 0 }}>verifiedOn</span>
              <input
                className="input mono"
                style={{ width: 132, fontSize: 12 }}
                value={verifiedOn}
                aria-label="Services verified on"
                onChange={e => setVerifiedOn(e.target.value)}
                onBlur={() => {
                  void patchCloudServicesVerifiedOn(verifiedOn).then(state => {
                    setDirty(state.dirty);
                    setVerifiedOn(state.verifiedOn);
                  }).catch(err => setError(err instanceof Error ? err.message : 'Update failed'));
                }}
              />
            </div>
            <button type="button" className="btn sm" disabled={busy} onClick={() => setShowNew(true)}>
              New role
            </button>
            <button type="button" className="btn primary sm" disabled={busy} onClick={() => void onPublish()}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        )}
        list={
          filtered.length === 0
            ? <div className="empty">{query ? 'No role matches this search.' : 'Loading cloud services…'}</div>
            : filtered.map(item => (
              <CatalogTreeRow
                key={item.roleKey}
                active={selected === item.roleKey}
                onClick={() => { setSelected(item.roleKey); setSaveState('idle'); }}
                label={item.roleKey}
                meta={item.locked ? 'seed' : 'custom'}
              />
            ))
        }
        inspector={
          !current
            ? <div className="empty">Select a service role</div>
            : (
              <>
                <div className="mono sub">{current.roleKey}</div>
                <div className="sect-label">Correspondence</div>
                <div className="frow">
                  {RESOLVED_TARGETS.map(target => {
                    const cell = current.payload[target];
                    const names = locPair(cell.name);
                    return (
                      <Group key={target} title={TARGET_LABELS[target].en}>
                        <Text
                          label="Name (EN)"
                          value={names.en}
                          onChange={en => patchCell(target, { name: fromPair(en, names.fr) })}
                        />
                        <Text
                          label="Name (FR)"
                          value={names.fr}
                          onChange={fr => patchCell(target, { name: fromPair(names.en, fr) })}
                        />
                        <Text
                          label="Tech (csv)"
                          value={(cell.tech ?? []).join(', ')}
                          onChange={csv => patchCell(target, {
                            tech: csv.split(',').map(s => s.trim()).filter(Boolean),
                          })}
                        />
                      </Group>
                    );
                  })}
                </div>
                <p className="hint">Display example: {t(current.payload.aws.name, 'en')}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="btn primary" onClick={() => void save()}>Save cells</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => void onDelete()}>Delete</button>
                  <CatalogSaveFlag state={saveState} />
                </div>
              </>
            )
        }
      />
      {showNew && (
        <NewCloudServiceDialog
          onClose={() => setShowNew(false)}
          onCreated={roleKey => { setShowNew(false); setSelected(roleKey); void reload(); }}
        />
      )}
    </>
  );
}
