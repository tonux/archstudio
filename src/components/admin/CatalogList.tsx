'use client';

import { type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { AdminPageHeader } from './AdminPageHeader';

export type CatalogSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export function CatalogSplitShell({
  countLabel,
  query,
  onQuery,
  queryPlaceholder,
  error,
  issues,
  list,
  inspector,
  actions,
}: {
  /** Body lede (counts / hint) — chrome title is layout topbar. */
  countLabel: string;
  query?: string;
  onQuery?: (value: string) => void;
  queryPlaceholder?: string;
  error?: string | null;
  issues?: string[];
  list: ReactNode;
  inspector: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AdminPageHeader
        lede={countLabel}
        search={onQuery ? {
          value: query ?? '',
          onChange: onQuery,
          placeholder: queryPlaceholder,
        } : undefined}
        actions={actions}
      />
      {error && <div className="warnbox" style={{ margin: '12px 28px 0' }}>{error}</div>}
      {issues && issues.length > 0 && (
        <div className="warnbox" style={{ margin: '12px 28px 0' }}>{issues.join(' · ')}</div>
      )}
      <div className="editor-body">
        <div className="content-main" style={{ padding: '8px 10px 24px' }}>
          <div className="sect-label" style={{ margin: '4px 6px 8px' }}>
            Catalogue
            <span className="spacer" />
          </div>
          {list}
        </div>
        <aside className="inspector" style={{ overflow: 'auto' }}>
          {inspector}
        </aside>
      </div>
    </div>
  );
}

export function CatalogTreeRow({
  active,
  onClick,
  icon,
  label,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  icon?: string;
  label: string;
  meta?: string;
}) {
  return (
    <button
      type="button"
      className={`tree-row${active ? ' active' : ''}`}
      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
      onClick={onClick}
    >
      {icon
        ? <span className="ficon"><Icon name={icon} size={15} /></span>
        : <span style={{ width: 14 }} />}
      <span className="label mono" style={{ fontSize: 12 }}>{label}</span>
      {meta ? <span className="count">{meta}</span> : null}
    </button>
  );
}

export function CatalogSaveFlag({ state }: { state: CatalogSaveState }) {
  if (state === 'idle') return null;
  const label = { saving: 'Saving…', saved: 'Saved', error: 'Not saved', dirty: 'Editing…' }[state];
  return (
    <span className={`saveflag${state === 'saving' || state === 'dirty' ? ' dirty' : ''}${state === 'error' ? ' error' : ''}`}>
      <i />{label}
    </span>
  );
}

export function CatalogListEmpty({ query, noun }: { query?: string; noun: string }) {
  if (query) return <AdminEmpty>No {noun} matches this search.</AdminEmpty>;
  return <AdminEmpty>Loading {noun}…</AdminEmpty>;
}
