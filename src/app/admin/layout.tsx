'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Lockup } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { dispatchAdminLocaleChange } from '@/components/admin/AdminWorkspace';

type Locale = 'en' | 'fr';

const OPS_NAV = [
  { href: '/admin/publish', icon: 'upload', label: 'Publish' },
  { href: '/admin/import', icon: 'download', label: 'Import' },
  { href: '/admin/locale', icon: 'globe', label: 'Locale' },
] as const;

const CATALOG_CHILDREN = [
  { href: '/admin/catalog/bricks', icon: 'box', label: 'Briques' },
  { href: '/admin/catalog/scopes', icon: 'map', label: 'Scopes' },
  { href: '/admin/catalog/intents', icon: 'route', label: 'Intents' },
  { href: '/admin/catalog/variants', icon: 'layers', label: 'Variants' },
  { href: '/admin/catalog/dependencies', icon: 'link', label: 'Dependencies' },
  { href: '/admin/catalog/technologies', icon: 'terminal', label: 'Technologies' },
  { href: '/admin/catalog/cloud-services', icon: 'cloud', label: 'Cloud services' },
] as const;

function pathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({ href, icon, label, active, depth = 0 }: {
  href: string; icon: string; label: string; active: boolean; depth?: number;
}) {
  return (
    <Link href={href} className={`tree-row${active ? ' active' : ''}`}
      style={{ textDecoration: 'none', color: 'inherit', paddingLeft: 8 + depth * 14 }}>
      <span style={{ width: 14 }} />
      <span className="ficon"><Icon name={icon} size={15} /></span>
      <span className="label">{label}</span>
    </Link>
  );
}

function CatalogBranch({ pathname }: { pathname: string }) {
  const router = useRouter();
  const onCatalog = pathname === '/admin/catalog' || pathname.startsWith('/admin/catalog/');
  const [open, setOpen] = useState(onCatalog);
  const hubActive = pathname === '/admin/catalog';

  useEffect(() => {
    if (onCatalog) setOpen(true);
  }, [onCatalog]);

  return (
    <>
      <div
        className={`tree-row${hubActive ? ' active' : ''}`}
        style={{ paddingLeft: 8 }}
        role="link"
        tabIndex={0}
        onClick={() => router.push('/admin/catalog')}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/admin/catalog'); } }}
      >
        <span
          className={`caret${open ? ' open' : ''}`}
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        >
          <Icon name="chevron" size={13} />
        </span>
        <span className="ficon"><Icon name="cube" size={15} /></span>
        <span className="label">Catalogue Lego</span>
      </div>
      {open && CATALOG_CHILDREN.map(child => (
        <NavRow
          key={child.href}
          href={child.href}
          icon={child.icon}
          label={child.label}
          depth={1}
          active={pathActive(pathname, child.href)}
        />
      ))}
    </>
  );
}

/** Chrome page title — sole H1-level label for the screen (body toolbars must not repeat). */
function topbarName(pathname: string): string {
  const entity = (re: RegExp) => {
    const m = pathname.match(re);
    return m ? decodeURIComponent(m[1]) : null;
  };
  const brick = entity(/^\/admin\/catalog\/bricks\/([^/]+)$/);
  if (brick) return brick;
  const intent = entity(/^\/admin\/catalog\/intents\/([^/]+)$/);
  if (intent) return intent;
  const template = entity(/^\/admin\/templates\/([^/]+)$/);
  if (template) return template;
  const section = entity(/^\/admin\/sections\/([^/]+)$/);
  if (section) return section;
  const flow = entity(/^\/admin\/flows\/([^/]+)$/);
  if (flow) return flow;
  if (pathname === '/admin') return 'Dashboard';
  if (pathname === '/admin/catalog') return 'Catalogue Lego';
  const child = CATALOG_CHILDREN.find(c => pathActive(pathname, c.href));
  if (child) return child.label;
  if (pathname === '/admin/templates' || pathname.startsWith('/admin/templates/')) return 'Templates';
  if (pathname === '/admin/sections' || pathname.startsWith('/admin/sections/')) return 'ADD';
  if (pathname === '/admin/flows' || pathname.startsWith('/admin/flows/')) return 'Flows';
  if (pathname.startsWith('/admin/publish')) return 'Publish';
  if (pathname.startsWith('/admin/import')) return 'Import';
  if (pathname.startsWith('/admin/locale')) return 'Locale';
  return 'Admin';
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('studio-theme', next); } catch { /* private mode */ }
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('admin-locale');
      if (stored === 'en' || stored === 'fr') setLocale(stored);
    } catch { /* private mode */ }
  }, []);

  const name = useMemo(() => topbarName(pathname), [pathname]);

  const setLocalePersist = (next: Locale) => {
    setLocale(next);
    try { localStorage.setItem('admin-locale', next); } catch { /* private mode */ }
    dispatchAdminLocaleChange();
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <Lockup size={26} sub="Content" />
        </div>

        <div className="sidebar-scroll">
          <NavRow href="/admin" icon="grid" label="Dashboard" active={pathname === '/admin'} />

          <div className="sect-label">Content</div>
          <NavRow href="/admin/templates" icon="file" label="Templates"
            active={pathActive(pathname, '/admin/templates')} />
          <CatalogBranch pathname={pathname} />
          <NavRow href="/admin/sections" icon="folder" label="ADD"
            active={pathActive(pathname, '/admin/sections')} />
          <NavRow href="/admin/flows" icon="route" label="Flows"
            active={pathActive(pathname, '/admin/flows')} />

          <div className="sect-label">Operations</div>
          {OPS_NAV.map(item => (
            <NavRow key={item.href} href={item.href} icon={item.icon} label={item.label}
              active={pathActive(pathname, item.href)} />
          ))}
        </div>

        <div className="sidebar-foot">
          <button className="iconbtn" onClick={toggleTheme} title="Light / dark">
            <Icon name="moon" size={15} />
          </button>
          <span className="footnote">Self-hosted · seed CMS</span>
        </div>
      </aside>

      <main className="editor">
        <div className="topbar">
          <span className="name" role="heading" aria-level={1}>{name}</span>
          <div style={{ flex: 1 }} />
          <div className="segmented" role="group" aria-label="Content locale">
            <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocalePersist('en')}>EN</button>
            <button type="button" aria-pressed={locale === 'fr'} onClick={() => setLocalePersist('fr')}>FR</button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
