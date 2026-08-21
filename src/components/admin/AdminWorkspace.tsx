'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { AdminIssuePanel } from './AdminIssuePanel';
import { AdminPageHeader, type AdminPageSearch } from './AdminPageHeader';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';

export type AdminLocale = 'en' | 'fr';

const LOCALE_EVENT = 'admin-locale';

/** Read admin content locale; stays in sync with layout topbar switcher. */
export function useAdminLocale(propLocale?: AdminLocale): AdminLocale {
  const [locale, setLocale] = useState<AdminLocale>(propLocale ?? 'en');

  useEffect(() => {
    if (propLocale) {
      setLocale(propLocale);
      return;
    }
    const read = () => {
      try {
        const stored = localStorage.getItem('admin-locale');
        if (stored === 'en' || stored === 'fr') setLocale(stored);
      } catch { /* private mode */ }
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'admin-locale') read();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCALE_EVENT, read);
    window.addEventListener('focus', read);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LOCALE_EVENT, read);
      window.removeEventListener('focus', read);
    };
  }, [propLocale]);

  return propLocale ?? locale;
}

export function dispatchAdminLocaleChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

export function AdminWorkspace({
  lede,
  search,
  actions,
  error,
  issues,
  bodyStyle,
  children,
}: {
  /** Optional body lede — page title is owned by layout topbar. */
  lede?: string;
  search?: AdminPageSearch;
  actions?: ReactNode;
  error?: string | null;
  issues?: CatalogIssue[] | string[];
  bodyStyle?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className="workspace">
      <AdminPageHeader lede={lede} search={search} actions={actions} />
      <div className="ws-body" style={bodyStyle}>
        {error && <div className="warnbox" style={{ marginBottom: 14 }}>{error}</div>}
        {issues && issues.length > 0 && <AdminIssuePanel issues={issues} />}
        {children}
      </div>
    </div>
  );
}
