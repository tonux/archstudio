'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { fetchCatalogState } from '@/lib/admin/catalog';
import { fetchCloudServices } from '@/lib/admin/cloud';
import { loadLegoCatalog } from '@/lib/lego/client';

const CARDS = [
  {
    href: '/admin/catalog/bricks',
    icon: 'box',
    label: 'Briques',
    key: 'bricks' as const,
    hint: 'Capability tiles — form + preview',
  },
  {
    href: '/admin/catalog/scopes',
    icon: 'map',
    label: 'Scopes',
    key: 'scopes' as const,
    hint: 'Placement domains EN/FR',
  },
  {
    href: '/admin/catalog/intents',
    icon: 'route',
    label: 'Intents',
    key: 'intents' as const,
    hint: 'What to place + hosting modes',
  },
  {
    href: '/admin/catalog/variants',
    icon: 'layers',
    label: 'Variants',
    key: 'variants' as const,
    hint: 'Intent × mode → brick',
  },
  {
    href: '/admin/catalog/dependencies',
    icon: 'link',
    label: 'Dependencies',
    key: 'dependencies' as const,
    hint: 'Suggestion edges between bricks',
  },
  {
    href: '/admin/catalog/technologies',
    icon: 'terminal',
    label: 'Technologies',
    key: 'technologies' as const,
    hint: 'Stack glossary copy',
  },
  {
    href: '/admin/catalog/cloud-services',
    icon: 'cloud',
    label: 'Cloud services',
    key: 'cloudServices' as const,
    hint: 'Provider catalogue (linked)',
  },
] as const;

type HubCounts = Record<(typeof CARDS)[number]['key'], number>;

export default function AdminCatalogHubPage() {
  const [counts, setCounts] = useState<HubCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadLegoCatalog('en'), fetchCloudServices()])
      .then(([catalog, cloud]) => {
        setCounts({
          bricks: Object.keys(catalog.bricks).length,
          scopes: catalog.scopes.length,
          intents: catalog.intents.length,
          variants: catalog.variants.length,
          dependencies: catalog.dependencies.length,
          technologies: Object.keys(catalog.technologyDescriptions).length,
          cloudServices: cloud.services.length,
        });
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load catalog'));
    fetchCatalogState()
      .then(state => {
        setDirty(state.dirty);
        setPublishedAt(state.publishedAt);
      })
      .catch(() => { /* API may not be ready */ });
  }, []);

  const publishState = dirty ? 'modified' : publishedAt ? 'published' : 'draft';

  return (
    <div className="workspace">
      <AdminPageHeader
        lede="Atelier form surfaces for scopes, intents, variants, bricks, and edges. Create, edit, delete — then publish."
        actions={
          <>
            <PublishBadge state={publishState} />
            <Link href="/admin/publish" className="btn sm">
              <Icon name="upload" size={13} />Publish
            </Link>
          </>
        }
      />
      <div className="ws-body">
        {error && <div className="warnbox" style={{ marginBottom: 14 }}>{error}</div>}
        {!error && !counts && <AdminEmpty>Loading catalog…</AdminEmpty>}
        {counts && (
          <div className="pgrid">
            {CARDS.map(card => (
              <Link
                key={card.href}
                href={card.href}
                className="pcard"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="accent" style={{ background: 'var(--brand)' }}>
                  <Icon name={card.icon} size={14} style={{ stroke: 'var(--on-fill)' }} />
                </div>
                <b>{card.label}</b>
                <span className="hint" style={{ display: 'block', marginTop: 4 }}>{card.hint}</span>
                <div className="foot">
                  <span className="mono">{counts[card.key]}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
