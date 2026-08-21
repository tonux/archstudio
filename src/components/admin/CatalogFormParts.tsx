'use client';

import { type ReactNode } from 'react';
import { Group, Panel } from '@/components/editors/Fields';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { CatalogSaveFlag, type CatalogSaveState } from '@/components/admin/CatalogList';
import { PublishBadge, type PublishState } from '@/components/admin/PublishBadge';

export const HOSTING_MODE_OPTIONS = [
  { value: 'client', label: 'client' },
  { value: 'baas', label: 'baas' },
  { value: 'cloud', label: 'cloud' },
  { value: 'selfhosted', label: 'selfhosted' },
] as const;

export const DEPENDENCY_STRENGTHS = [
  { value: 'required', label: 'required' },
  { value: 'recommended', label: 'recommended' },
  { value: 'optional', label: 'optional' },
];

export const DEPENDENCY_KINDS = [
  { value: 'sync', label: 'sync' },
  { value: 'async', label: 'async' },
  { value: 'batch', label: 'batch' },
];

/** Toggle chips for hosting modes — Atelier `.tagchip`, not segmented wrap. */
export function ModeChips({
  modes,
  onToggle,
}: {
  modes: string[];
  onToggle: (mode: string) => void;
}) {
  return (
    <div className="field">
      <span>Hosting modes</span>
      <div className="chiprow">
        {HOSTING_MODE_OPTIONS.map(mode => {
          const active = modes.includes(mode.value);
          return (
            <button
              key={mode.value}
              type="button"
              className="tagchip"
              aria-pressed={active}
              style={active ? { borderColor: 'var(--brand)', color: 'var(--brand-ink)' } : undefined}
              onClick={() => onToggle(mode.value)}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Inspector chrome: id + Panel head + Groups + Save/Delete footer. */
export function CatalogInspector({
  entityId,
  title,
  subtitle,
  publishState,
  saveState,
  onSave,
  onDelete,
  saveLabel = 'Save',
  deleteLabel = 'Delete',
  deleting,
  deleteDisabledReason,
  children,
}: {
  entityId: string;
  title: string;
  subtitle?: string;
  publishState?: PublishState;
  saveState: CatalogSaveState;
  onSave: () => void;
  onDelete?: () => void;
  saveLabel?: string;
  deleteLabel?: string;
  deleting?: boolean;
  deleteDisabledReason?: string | null;
  children: ReactNode;
}) {
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      actions={
        <>
          {publishState ? <PublishBadge state={publishState} /> : null}
          <CatalogSaveFlag state={saveState} />
        </>
      }
    >
      <div className="mono sub" style={{ marginBottom: 10 }}>{entityId}</div>
      {children}
      <div className="insp-sep" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <button
          type="button"
          className="btn primary"
          disabled={saveState === 'saving' || deleting}
          onClick={onSave}
        >
          {saveState === 'saving' ? 'Saving…' : saveLabel}
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn"
            disabled={Boolean(deleteDisabledReason) || deleting || saveState === 'saving'}
            title={deleteDisabledReason ?? undefined}
            onClick={onDelete}
          >
            {deleting ? 'Deleting…' : deleteLabel}
          </button>
        )}
        {deleteDisabledReason && (
          <span className="hint" style={{ flex: '1 1 160px' }}>{deleteDisabledReason}</span>
        )}
        {onDelete && !deleteDisabledReason && (
          <span className="hint" style={{ flex: '1 1 200px' }}>
            Seeded ids reappear after catalog ensure.
          </span>
        )}
      </div>
    </Panel>
  );
}

export function CatalogInspectorEmpty({ children }: { children?: ReactNode }) {
  return <AdminEmpty>{children ?? 'Select an item to edit.'}</AdminEmpty>;
}

export function CatalogFormGroup({
  title,
  hint,
  cols,
  children,
}: {
  title?: string;
  hint?: string;
  cols?: number;
  children: ReactNode;
}) {
  return (
    <Group title={title} hint={hint} cols={cols}>
      {children}
    </Group>
  );
}
