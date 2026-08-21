'use client';

import type { ReactNode } from 'react';
import ArchitectureDiagramSurface from '@/components/ArchitectureDiagramSurface';
import type { Architecture } from '@/lib/types';

type Patch = (fn: (d: Architecture) => Architecture) => void;

export function TemplateDiagramPanel({
  doc,
  patch,
  readOnly = false,
  hint,
}: {
  doc: Architecture;
  patch: Patch;
  readOnly?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {(readOnly || hint) && (
        <div className="hint" style={{ margin: '10px 14px 0', flexShrink: 0 }}>
          {hint ?? (
            <>
              Read-only agnostic snapshot. Full per-cloud edits stay under{' '}
              <span className="mono">Advanced</span> JSON.
            </>
          )}
        </div>
      )}
      <ArchitectureDiagramSurface doc={doc} patch={patch} readOnly={readOnly} />
    </div>
  );
}
