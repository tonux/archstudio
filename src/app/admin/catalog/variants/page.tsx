'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Choice, Text } from '@/components/editors/Fields';
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
  HOSTING_MODE_OPTIONS,
} from '@/components/admin/CatalogFormParts';
import { NewVariantDialog } from '@/components/admin/NewCatalogDialogs';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { fetchCatalogState } from '@/lib/admin/catalog';
import { deleteVariant, fetchVariants, patchVariant } from '@/lib/admin/catalog-entities';
import { loadLegoCatalog } from '@/lib/lego/client';
import type { LegoVariant } from '@/lib/lego/types';

export default function AdminVariantsPage() {
  const [variants, setVariants] = useState<LegoVariant[]>([]);
  const [intents, setIntents] = useState<string[]>([]);
  const [bricks, setBricks] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);

  const load = useCallback(async (preferId?: string) => {
    try {
      const [v, catalog] = await Promise.all([fetchVariants(), loadLegoCatalog('en')]);
      setVariants(v);
      setIntents([...new Set([...v.map(x => x.intent), ...catalog.intents.map(i => i.id)])].sort());
      setBricks(Object.keys(catalog.bricks).sort());
      setSelected(current => preferId ?? current ?? v[0]?.id ?? null);
      setError(null);
      const state = await fetchCatalogState().catch(() => null);
      if (state) setCatalogDirty(state.dirty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter(v => v.id.includes(q) || v.label.toLowerCase().includes(q) || v.maps_to.includes(q));
  }, [variants, filter]);

  const current = selected ? variants.find(v => v.id === selected) : null;

  const patchCurrent = (patch: Partial<LegoVariant>) => {
    if (!current) return;
    setVariants(list => list.map(v => v.id === current.id ? { ...v, ...patch } : v));
    setSaveState('dirty');
  };

  const save = async () => {
    if (!current) return;
    setSaveState('saving');
    try {
      await patchVariant(current.id, {
        label: current.label, intent: current.intent, mode: current.mode, maps_to: current.maps_to,
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
    if (!window.confirm(`Delete variant “${current.id}”?`)) return;
    setDeleting(true);
    try {
      await deleteVariant(current.id);
      setSaveState('idle');
      const nextId = variants.find(v => v.id !== current.id)?.id ?? null;
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
        countLabel={`${filtered.length} of ${variants.length} placement choices`}
        query={filter}
        onQuery={setFilter}
        queryPlaceholder="Filter id, label, or brick…"
        error={error}
        actions={
          <>
            <PublishBadge state={catalogDirty ? 'modified' : 'published'} />
            <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size={13} />New variant
            </button>
          </>
        }
        list={
          filtered.length === 0
            ? <CatalogListEmpty query={filter} noun="variants" />
            : filtered.map(v => (
              <CatalogTreeRow
                key={v.id}
                active={selected === v.id}
                onClick={() => { setSelected(v.id); setSaveState('idle'); }}
                icon="layers"
                label={v.id}
                meta={v.maps_to}
              />
            ))
        }
        inspector={
          !current
            ? <CatalogInspectorEmpty>Select a variant — or create one.</CatalogInspectorEmpty>
            : (
              <CatalogInspector
                entityId={current.id}
                title="Variant"
                subtitle="Intent × mode → brick"
                publishState={catalogDirty ? 'modified' : 'published'}
                saveState={saveState}
                onSave={() => void save()}
                onDelete={() => void remove()}
                saveLabel="Save variant"
                deleting={deleting}
              >
                <CatalogFormGroup title="Mapping">
                  <Text label="Label" value={current.label} onChange={label => patchCurrent({ label })} />
                  <Choice
                    label="Intent"
                    value={current.intent}
                    onChange={intent => patchCurrent({ intent })}
                    options={intents.map(i => ({ value: i, label: i }))}
                  />
                  <Choice
                    label="Mode"
                    value={current.mode}
                    onChange={mode => patchCurrent({ mode: mode as LegoVariant['mode'] })}
                    options={HOSTING_MODE_OPTIONS.map(m => ({ value: m.value, label: m.label }))}
                  />
                  <Choice
                    label="Maps to brick"
                    value={current.maps_to}
                    onChange={maps_to => patchCurrent({ maps_to })}
                    options={bricks.map(b => ({ value: b, label: b }))}
                  />
                </CatalogFormGroup>
              </CatalogInspector>
            )
        }
      />
      {creating && (
        <NewVariantDialog
          intents={intents}
          bricks={bricks}
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
