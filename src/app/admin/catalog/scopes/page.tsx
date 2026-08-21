'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text } from '@/components/editors/Fields';
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
import { NewScopeDialog } from '@/components/admin/NewCatalogDialogs';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { fetchCatalogState } from '@/lib/admin/catalog';
import {
  deleteScope,
  fetchScopes,
  patchScope,
  type AdminScope,
} from '@/lib/admin/catalog-entities';

export default function AdminScopesPage() {
  const [scopes, setScopes] = useState<AdminScope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);

  const load = useCallback(async (preferId?: string) => {
    try {
      const list = await fetchScopes();
      setScopes(list);
      setError(null);
      setSelected(current => preferId ?? current ?? list[0]?.id ?? null);
      const state = await fetchCatalogState().catch(() => null);
      if (state) setCatalogDirty(state.dirty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scopes');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scopes;
    return scopes.filter(s => `${s.id} ${s.labelEn} ${s.labelFr}`.toLowerCase().includes(q));
  }, [scopes, query]);

  const current = selected ? scopes.find(s => s.id === selected) : null;

  const save = async () => {
    if (!current) return;
    setSaveState('saving');
    try {
      await patchScope(current.id, { labelEn: current.labelEn, labelFr: current.labelFr });
      setSaveState('saved');
      setCatalogDirty(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaveState('error');
    }
  };

  const remove = async () => {
    if (!current) return;
    if (!window.confirm(`Delete scope “${current.id}”?`)) return;
    setDeleting(true);
    try {
      await deleteScope(current.id);
      setSaveState('idle');
      const nextId = scopes.find(s => s.id !== current.id)?.id ?? null;
      await load(nextId ?? undefined);
      if (!nextId) setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <CatalogSplitShell
        countLabel={`${filtered.length} scope${filtered.length === 1 ? '' : 's'}`}
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Filter scopes…"
        error={error}
        actions={
          <>
            <PublishBadge state={catalogDirty ? 'modified' : 'published'} />
            <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size={13} />New scope
            </button>
          </>
        }
        list={
          filtered.length === 0
            ? <CatalogListEmpty query={query} noun="scopes" />
            : filtered.map(scope => (
              <CatalogTreeRow
                key={scope.id}
                active={selected === scope.id}
                onClick={() => { setSelected(scope.id); setSaveState('idle'); }}
                icon="map"
                label={scope.id}
                meta={scope.labelEn}
              />
            ))
        }
        inspector={
          !current
            ? <CatalogInspectorEmpty>Select a scope — or create one.</CatalogInspectorEmpty>
            : (
              <CatalogInspector
                entityId={current.id}
                title="Scope"
                subtitle="Bilingual placement labels"
                publishState={catalogDirty ? 'modified' : 'published'}
                saveState={saveState}
                onSave={() => void save()}
                onDelete={() => void remove()}
                saveLabel="Save scope"
                deleting={deleting}
              >
                <CatalogFormGroup title="Labels" cols={1}>
                  <Text
                    label="Label (EN)"
                    value={current.labelEn}
                    onChange={labelEn => {
                      setScopes(list => list.map(s => s.id === current.id ? { ...s, labelEn } : s));
                      setSaveState('dirty');
                    }}
                  />
                  <Text
                    label="Label (FR)"
                    value={current.labelFr}
                    onChange={labelFr => {
                      setScopes(list => list.map(s => s.id === current.id ? { ...s, labelFr } : s));
                      setSaveState('dirty');
                    }}
                  />
                </CatalogFormGroup>
              </CatalogInspector>
            )
        }
      />
      {creating && (
        <NewScopeDialog
          onClose={() => setCreating(false)}
          onCreated={id => {
            setCreating(false);
            void load(id);
            setSaveState('idle');
          }}
        />
      )}
    </>
  );
}
