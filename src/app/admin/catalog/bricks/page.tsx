'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';
import { NewBrickDialog } from '@/components/admin/NewCatalogDialogs';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { STARTER_LAYERS } from '@/lib/defaults';
import { fetchCatalogState } from '@/lib/admin/catalog';
import { invalidateLegoCatalogCache, loadLegoCatalog } from '@/lib/lego/client';
import type { LegoBrick, LegoCatalogSnapshot } from '@/lib/lego/types';

function BrickRow({ id, brick }: { id: string; brick: LegoBrick }) {
  return (
    <Link
      href={`/admin/catalog/bricks/${id}`}
      className="tree-row"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <span className="ficon"><Icon name={brick.icon || 'box'} size={15} /></span>
      <span className="label mono" style={{ fontSize: 12 }}>{id}</span>
      <span className="count">{brick.layer} · {brick.defaultScope}</span>
    </Link>
  );
}

export default function AdminBricksPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<LegoCatalogSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);

  const load = useCallback(async () => {
    invalidateLegoCatalogCache();
    try {
      const snap = await loadLegoCatalog('en');
      setCatalog(snap);
      setError(null);
      const state = await fetchCatalogState().catch(() => null);
      if (state) setCatalogDirty(state.dirty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const bricks = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(catalog.bricks)
      .filter(([id, brick]) => {
        if (!q) return true;
        return `${id} ${brick.layer} ${brick.defaultScope} ${brick.role}`.toLowerCase().includes(q);
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [catalog, query]);

  const scopeOpts = useMemo(
    () => (catalog?.scopes ?? []).map(s => ({ value: s.id, label: `${s.id} — ${s.label}` })),
    [catalog],
  );

  const layerOpts = useMemo(() => {
    const ids = new Set(STARTER_LAYERS.map(l => l.id));
    if (catalog) {
      for (const brick of Object.values(catalog.bricks)) ids.add(brick.layer);
    }
    return [...ids].sort().map(id => {
      const starter = STARTER_LAYERS.find(l => l.id === id);
      return { value: id, label: starter ? `${id} — ${starter.name}` : id };
    });
  }, [catalog]);

  return (
    <>
      <AdminWorkspace
        lede={catalog ? `${bricks.length} brick${bricks.length === 1 ? '' : 's'} — open a fiche for form + preview` : 'Loading…'}
        search={{ value: query, onChange: setQuery, placeholder: 'Filter bricks…' }}
        error={error}
        bodyStyle={{ padding: '8px 12px 24px' }}
        actions={
          <>
            <PublishBadge state={catalogDirty ? 'modified' : 'published'} />
            <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size={13} />New brick
            </button>
          </>
        }
      >
        {!error && !catalog && <AdminEmpty>Loading catalog…</AdminEmpty>}
        {!error && catalog && bricks.length === 0 && (
          <AdminEmpty>{query ? 'No brick matches this search.' : 'No bricks in catalog.'}</AdminEmpty>
        )}
        {bricks.map(([id, brick]) => (
          <BrickRow key={id} id={id} brick={brick} />
        ))}
      </AdminWorkspace>
      {creating && (
        <NewBrickDialog
          scopes={scopeOpts}
          layers={layerOpts}
          onClose={() => setCreating(false)}
          onCreated={id => {
            setCreating(false);
            router.push(`/admin/catalog/bricks/${id}`);
          }}
        />
      )}
    </>
  );
}
