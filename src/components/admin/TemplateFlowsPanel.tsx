'use client';

import type { ReactNode } from 'react';
import FlowsEditor from '@/components/editors/FlowsEditor';
import type { Architecture } from '@/lib/types';

type Patch = (fn: (d: Architecture) => Architecture) => void;

const noopPatch: Patch = () => {};

export function TemplateFlowsPanel({
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
      <FlowsEditor doc={doc} patch={readOnly ? noopPatch : patch} catalog={null} />
    </div>
  );
}
