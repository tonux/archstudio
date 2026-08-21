'use client';

import { useState, type ReactNode } from 'react';
import SectionsEditor from '@/components/editors/SectionsEditor';
import { BlocksDrawer } from '@/components/admin/BlocksDrawer';
import { fetchSection } from '@/lib/admin/sections';
import { slugify } from '@/lib/defaults';
import { registerSectionTab } from '@/lib/tabs';
import type { Architecture } from '@/lib/types';

type Patch = (fn: (d: Architecture) => Architecture) => void;

const noopPatch: Patch = () => {};

export function TemplateAddPanel({
  doc,
  patch,
  readOnly = false,
  hint,
  onError,
}: {
  doc: Architecture;
  patch: Patch;
  readOnly?: boolean;
  hint?: ReactNode;
  onError?: (message: string) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const effective = readOnly ? noopPatch : patch;

  return (
    <div className="cpanel-body">
      {(readOnly || hint) && (
        <div className="hint" style={{ marginBottom: 14 }}>
          {hint ?? (
            <>
              Read-only agnostic snapshot. Full per-cloud edits stay under{' '}
              <span className="mono">Advanced</span> JSON.
            </>
          )}
        </div>
      )}
      {!readOnly && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn sm" onClick={() => setDrawerOpen(true)}>
            From library
          </button>
        </div>
      )}
      <SectionsEditor doc={doc} patch={effective} />
      {!readOnly && (
        <BlocksDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          locale={doc.meta?.lang === 'fr' ? 'fr' : 'en'}
          onPick={async (id) => {
            try {
              const detail = await fetchSection(id);
              const lang = doc.meta?.lang === 'fr' ? 'fr' : 'en';
              const source = lang === 'fr' ? detail.fr : detail.en;
              patch(d => {
                const taken = d.sections.map(s => s.id);
                let newId = source.id;
                if (taken.includes(newId)) {
                  newId = slugify(`${source.id}-copy`, taken);
                }
                const copy = structuredClone({ ...source, id: newId });
                d.sections.push(copy);
                registerSectionTab(d, newId);
                return d;
              });
            } catch (e) {
              onError?.((e as Error).message);
            } finally {
              setDrawerOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}
