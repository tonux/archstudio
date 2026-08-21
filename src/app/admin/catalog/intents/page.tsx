'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, Text } from '@/components/editors/Fields';
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
  ModeChips,
} from '@/components/admin/CatalogFormParts';
import { NewIntentDialog } from '@/components/admin/NewCatalogDialogs';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { fetchCatalogState } from '@/lib/admin/catalog';
import { deleteIntent, fetchIntents, patchIntent } from '@/lib/admin/catalog-entities';
import type { LegoIntent } from '@/lib/lego/types';

export default function AdminIntentsPage() {
  const [intents, setIntents] = useState<LegoIntent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);

  const load = useCallback(async (preferId?: string) => {
    try {
      const list = await fetchIntents();
      setIntents(list);
      setError(null);
      setSelected(current => preferId ?? current ?? list[0]?.id ?? null);
      const state = await fetchCatalogState().catch(() => null);
      if (state) setCatalogDirty(state.dirty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return intents;
    return intents.filter(intent =>
      `${intent.id} ${intent.label} ${intent.modes.join(' ')}`.toLowerCase().includes(q));
  }, [intents, query]);

  const current = selected ? intents.find(i => i.id === selected) : null;

  const toggleMode = (mode: string) => {
    if (!current) return;
    const has = current.modes.includes(mode as LegoIntent['modes'][number]);
    setIntents(list => list.map(intent => intent.id !== current.id ? intent : {
      ...intent,
      modes: has
        ? intent.modes.filter(m => m !== mode)
        : [...intent.modes, mode as LegoIntent['modes'][number]],
    }));
    setSaveState('dirty');
  };

  const save = async () => {
    if (!current) return;
    setSaveState('saving');
    try {
      await patchIntent(current.id, {
        label: current.label,
        modes: [...current.modes],
        shapes: current.shapes?.length ? [...current.shapes] : [],
      });
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
    if (!window.confirm(`Delete intent “${current.id}”?`)) return;
    setDeleting(true);
    try {
      await deleteIntent(current.id);
      setSaveState('idle');
      const nextId = intents.find(i => i.id !== current.id)?.id ?? null;
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
        countLabel={`${filtered.length} placement intent${filtered.length === 1 ? '' : 's'}`}
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Filter intents…"
        error={error}
        actions={
          <>
            <PublishBadge state={catalogDirty ? 'modified' : 'published'} />
            <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size={13} />New intent
            </button>
          </>
        }
        list={
          filtered.length === 0
            ? <CatalogListEmpty query={query} noun="intents" />
            : filtered.map(intent => (
              <CatalogTreeRow
                key={intent.id}
                active={selected === intent.id}
                onClick={() => { setSelected(intent.id); setSaveState('idle'); }}
                icon="route"
                label={intent.id}
                meta={intent.label}
              />
            ))
        }
        inspector={
          !current
            ? <CatalogInspectorEmpty>Select an intent — or create one.</CatalogInspectorEmpty>
            : (
              <CatalogInspector
                entityId={current.id}
                title="Intent"
                subtitle="Placement + hosting modes"
                publishState={catalogDirty ? 'modified' : 'published'}
                saveState={saveState}
                onSave={() => void save()}
                onDelete={() => void remove()}
                saveLabel="Save intent"
                deleting={deleting}
              >
                <CatalogFormGroup title="Placement">
                  <Text
                    label="Label"
                    value={current.label}
                    onChange={label => {
                      setIntents(list => list.map(i => i.id === current.id ? { ...i, label } : i));
                      setSaveState('dirty');
                    }}
                  />
                  <ModeChips modes={[...current.modes]} onToggle={toggleMode} />
                  <Area
                    label="Shapes (comma-separated)"
                    value={(current.shapes ?? []).join(', ')}
                    onChange={v => {
                      setIntents(list => list.map(i => i.id === current.id
                        ? { ...i, shapes: v.split(',').map(s => s.trim()).filter(Boolean) }
                        : i));
                      setSaveState('dirty');
                    }}
                    minHeight={56}
                    hint="Optional shape filters (e.g. gateway, compute)."
                  />
                </CatalogFormGroup>
              </CatalogInspector>
            )
        }
      />
      {creating && (
        <NewIntentDialog
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
