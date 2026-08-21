'use client';

import { type ReactNode } from 'react';
import { Icon } from '@/components/Icon';

export type AdminPageSearch = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Body toolbar under the shell topbar.
 * Chrome title lives in layout `.topbar .name` — never render a competing H1 here.
 */
export function AdminPageHeader({
  lede,
  search,
  actions,
}: {
  lede?: string;
  search?: AdminPageSearch;
  actions?: ReactNode;
}) {
  const tools = (search || actions) ? (
    <div className="ws-head-tools">
      {search && (
        <div className="ws-search">
          <Icon name="search" size={14} />
          <input
            className="input"
            value={search.value}
            placeholder={search.placeholder}
            onChange={e => search.onChange(e.target.value)}
          />
        </div>
      )}
      {actions}
    </div>
  ) : null;

  if (!lede && !tools) return null;

  return (
    <div className={`ws-head admin-head${!lede ? ' admin-head-compact' : ''}`}>
      <div className="ws-head-row">
        {lede && <p className="ws-head-lede">{lede}</p>}
        {tools}
      </div>
    </div>
  );
}
