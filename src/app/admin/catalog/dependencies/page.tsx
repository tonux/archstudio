'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, Choice, Text } from '@/components/editors/Fields';
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
  DEPENDENCY_KINDS,
  DEPENDENCY_STRENGTHS,
} from '@/components/admin/CatalogFormParts';
import { NewDependencyDialog } from '@/components/admin/NewCatalogDialogs';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { fetchCatalogState } from '@/lib/admin/catalog';
import {
  deleteDependency,
  fetchDependencies,
  patchDependency,
  type AdminDependency,
} from '@/lib/admin/catalog-entities';
import { loadLegoCatalog } from '@/lib/lego/client';

export default function AdminDependenciesPage() {
  const [deps, setDeps] = useState<AdminDependency[]>([]);
  const [bricks, setBricks] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);

  const edgeKey = (dep: AdminDependency) => `${dep.from}\0${dep.to}`;

  const load = useCallback(async (preferKey?: string) => {
    try {
      const [list, catalog] = await Promise.all([fetchDependencies(), loadLegoCatalog('en')]);
      setDeps(list);
      setBricks(Object.keys(catalog.bricks).sort());
      setSelectedKey(current => preferKey ?? current ?? (list[0] ? edgeKey(list[0]) : null));
      setError(null);
      const state = await fetchCatalogState().catch(() => null);
      if (state) setCatalogDirty(state.dirty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const current = selectedKey
    ? deps.find(d => edgeKey(d) === selectedKey) ?? null
    : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deps;
    return deps.filter(dep =>
      `${dep.from} ${dep.to} ${dep.strength} ${dep.protocol_id}`.toLowerCase().includes(q));
  }, [deps, query]);

  const patchCurrent = (patch: Partial<AdminDependency>) => {
    if (!current) return;
    setDeps(list => list.map(d => edgeKey(d) === selectedKey ? { ...d, ...patch } : d));
    setSaveState('dirty');
  };

  const save = async () => {
    if (!current) return;
    setSaveState('saving');
    try {
      await patchDependency(current.from, current.to, {
        strength: current.strength,
        why_en: current.why_en,
        why_fr: current.why_fr,
        protocol_id: current.protocol_id,
        kind: current.kind,
      });
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
    if (!window.confirm(`Delete dependency ${current.from} → ${current.to}?`)) return;
    setDeleting(true);
    try {
      await deleteDependency(current.from, current.to);
      setSaveState('idle');
      const next = deps.find(d => edgeKey(d) !== selectedKey);
      await load(next ? edgeKey(next) : undefined);
      if (!next) setSelectedKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <CatalogSplitShell
        countLabel={`${filtered.length} suggestion edge${filtered.length === 1 ? '' : 's'}`}
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Filter from, to, or protocol…"
        error={error}
        actions={
          <>
            <PublishBadge state={catalogDirty ? 'modified' : 'published'} />
            <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size={13} />New dependency
            </button>
          </>
        }
        list={
          filtered.length === 0
            ? <CatalogListEmpty query={query} noun="dependencies" />
            : filtered.map(dep => (
              <CatalogTreeRow
                key={edgeKey(dep)}
                active={selectedKey === edgeKey(dep)}
                onClick={() => { setSelectedKey(edgeKey(dep)); setSaveState('idle'); }}
                icon="link"
                label={`${dep.from} → ${dep.to}`}
                meta={dep.strength}
              />
            ))
        }
        inspector={
          !current
            ? <CatalogInspectorEmpty>Select a dependency — or create one.</CatalogInspectorEmpty>
            : (
              <CatalogInspector
                entityId={`${current.from} → ${current.to}`}
                title="Dependency"
                subtitle="Suggestion edge"
                publishState={catalogDirty ? 'modified' : 'published'}
                saveState={saveState}
                onSave={() => void save()}
                onDelete={() => void remove()}
                saveLabel="Save dependency"
                deleting={deleting}
              >
                <CatalogFormGroup title="Edge">
                  <Choice
                    label="Strength"
                    value={current.strength}
                    onChange={strength => patchCurrent({ strength: strength as AdminDependency['strength'] })}
                    options={DEPENDENCY_STRENGTHS}
                  />
                  <Text
                    label="Protocol id"
                    mono
                    value={current.protocol_id}
                    onChange={protocol_id => patchCurrent({ protocol_id })}
                  />
                  <Choice
                    label="Kind"
                    value={current.kind}
                    onChange={kind => patchCurrent({ kind: kind as AdminDependency['kind'] })}
                    options={DEPENDENCY_KINDS}
                  />
                  <Area
                    label="Why (EN)"
                    value={current.why_en}
                    onChange={why_en => patchCurrent({ why_en })}
                    minHeight={56}
                  />
                  <Area
                    label="Why (FR)"
                    value={current.why_fr}
                    onChange={why_fr => patchCurrent({ why_fr })}
                    minHeight={56}
                  />
                </CatalogFormGroup>
              </CatalogInspector>
            )
        }
      />
      {creating && (
        <NewDependencyDialog
          bricks={bricks}
          onClose={() => setCreating(false)}
          onCreated={(from, to) => {
            setCreating(false);
            void load(`${from}\0${to}`);
            setSaveState('idle');
          }}
        />
      )}
    </>
  );
}
