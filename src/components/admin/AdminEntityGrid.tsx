'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/Icon';

export type AdminGridItem = {
  href: string;
  icon: string;
  accent?: string;
  title: string;
  description?: string;
  count?: string | number;
  badge?: ReactNode;
};

export function AdminEntityGrid({ items }: { items: AdminGridItem[] }) {
  return (
    <div className="pgrid">
      {items.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className="pcard"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div className="accent" style={{ background: item.accent ?? 'var(--brand)' }}>
            <Icon name={item.icon} size={14} style={{ stroke: 'var(--on-fill)' }} />
          </div>
          <b>{item.title}</b>
          {item.description && <p>{item.description}</p>}
          <div className="foot">
            {item.count !== undefined && <span className="mono">{item.count}</span>}
            {item.badge}
          </div>
        </Link>
      ))}
    </div>
  );
}
