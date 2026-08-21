'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area } from '@/components/editors/Fields';
import { Icon } from '@/components/Icon';
import {
  CatalogListEmpty,
  CatalogSplitShell,
  CatalogTreeRow,
  type CatalogSaveState,
} from '@/components/admin/CatalogList';
import {
  CatalogFormGroup,
  CatalogInspector,
  CatalogInspectorEmpty,
} from '@/components/admin/CatalogFormParts';
import { NewTechnologyDialog } from '@/components/admin/NewCatalogDialogs';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { fetchCatalogState } from '@/lib/admin/catalog';
import {
  deleteTechnology,
  fetchTechnologies,
  patchTechnology,
  type AdminTechnology,
} from '@/lib/admin/catalog-entities';

export default function AdminTechnologiesPage() {
  const [items, setItems] = useState<AdminTechnology[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);

  const load = useCallback(async (preferKey?: string) => {
    try {
      const list = await fetchTechnologies();
      setItems(list);
      setSelected(current => preferKey ?? current ?? list[0]?.key ?? null);
      setError(null);
      const state = await fetchCatalogState().catch(() => null);
      if (state) setCatalogDirty(state.dirty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const current = selected ? items.find(t => t.key === selected) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(t => `${t.key} ${t.en} ${t.fr}`.toLowerCase().includes(q));
  }, [items, query]);

  const save = async () => {
    if (!current) return;
    setSaveState('saving');
    try {
      await patchTechnology(current.key, { en: current.en, fr: current.fr });
      setError(null);
      setSaveState('saved');
      setCatalogDirty(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaveState('error');
    }
  };

  const remove = async () => {
    if (!current) return;
    if (!window.confirm(`Delete technology “${current.key}”?`)) return;
    setDeleting(true);
    try {
      await deleteTechnology(current.key);
      setSaveState('idle');
      const nextKey = items.find(t => t.key !== current.key)?.key ?? null;
      await load(nextKey ?? undefined);
      if (!nextKey) setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <CatalogSplitShell
        countLabel={`${filtered.length} stack description key${filtered.length === 1 ? '' : 's'}`}
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Filter technology keys…"
        error={error}
        actions={
          <>
            <PublishBadge state={catalogDirty ? 'modified' : 'published'} />
            <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size={13} />New technology
            </button>
          </>
        }
        list={
          filtered.length === 0
            ? <CatalogListEmpty query={query} noun="technologies" />
            : filtered.map(item => (
              <CatalogTreeRow
                key={item.key}
                active={selected === item.key}
                onClick={() => { setSelected(item.key); setSaveState('idle'); }}
                icon="terminal"
                label={item.key}
              />
            ))
        }
        inspector={
          !current
            ? <CatalogInspectorEmpty>Select a technology — or create one.</CatalogInspectorEmpty>
            : (
              <CatalogInspector
                entityId={current.key}
                title="Technology"
                subtitle="Glossary copy EN/FR"
                publishState={catalogDirty ? 'modified' : 'published'}
                saveState={saveState}
                onSave={() => void save()}
                onDelete={() => void remove()}
                saveLabel="Save description"
                deleting={deleting}
              >
                <CatalogFormGroup title="Copy">
                  <Area
                    label="Description (EN)"
                    value={current.en}
                    onChange={en => {
                      setItems(list => list.map(t => t.key === current.key ? { ...t, en } : t));
                      setSaveState('dirty');
                    }}
                    minHeight={72}
                  />
                  <Area
                    label="Description (FR)"
                    value={current.fr}
                    onChange={fr => {
                      setItems(list => list.map(t => t.key === current.key ? { ...t, fr } : t));
                      setSaveState('dirty');
                    }}
                    minHeight={72}
                  />
                </CatalogFormGroup>
              </CatalogInspector>
            )
        }
      />
      {creating && (
        <NewTechnologyDialog
          onClose={() => setCreating(false)}
          onCreated={key => {
            setCreating(false);
            void load(key);
            setSaveState('idle');
          }}
        />
      )}
    </>
  );
}
