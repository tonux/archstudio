'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';
import { IssueList } from '@/components/admin/IssueList';
import { PublishBadge, type PublishState } from '@/components/admin/PublishBadge';
import { fetchArchitectureTemplateState } from '@/lib/admin/architecture';
import { fetchCatalogState } from '@/lib/admin/catalog';
import { fetchCloudServicesState } from '@/lib/admin/cloud';
import { fetchSystemCopyState } from '@/lib/admin/copy';
import { fetchFlowPatternState } from '@/lib/admin/flows';
import { fetchSectionState } from '@/lib/admin/sections';
import { fetchProjectTemplateState } from '@/lib/admin/templates';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';

type DomainRow = {
  id: string;
  label: string;
  href: string;
  status: PublishState;
  publishedAt: string | null;
  count: string | null;
  issues: CatalogIssue[];
};

function publishState(dirty: boolean, publishedAt: string | null): PublishState {
  if (dirty) return 'modified';
  if (publishedAt) return 'published';
  return 'draft';
}

function formatPublishedAt(iso: string | null): string | null {
  if (!iso) return null;
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

async function settled<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export default function AdminDashboardPage() {
  const [domains, setDomains] = useState<DomainRow[] | null>(null);
  const [issues, setIssues] = useState<CatalogIssue[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [catalog, projectTpl, archTpl, sections, flows, cloud, copy] = await Promise.all([
        settled(fetchCatalogState({ validate: true })),
        settled(fetchProjectTemplateState({ validate: true })),
        settled(fetchArchitectureTemplateState({ validate: true })),
        settled(fetchSectionState()),
        settled(fetchFlowPatternState()),
        settled(fetchCloudServicesState({ validate: true })),
        settled(fetchSystemCopyState({ validate: true })),
      ]);

      if (cancelled) return;

      const rows: DomainRow[] = [];

      if (catalog) {
        rows.push({
          id: 'catalog',
          label: 'Catalogue Lego',
          href: '/admin/catalog',
          status: publishState(catalog.dirty, catalog.publishedAt),
          publishedAt: catalog.publishedAt,
          count: catalog.version ? `v${catalog.version}` : null,
          issues: catalog.issues ?? [],
        });
      }

      if (projectTpl) {
        rows.push({
          id: 'project-templates',
          label: 'Project templates',
          href: '/admin/templates',
          status: publishState(projectTpl.dirty, projectTpl.publishedAt),
          publishedAt: projectTpl.publishedAt,
          count: `${projectTpl.templateCount} templates`,
          issues: projectTpl.issues ?? [],
        });
      }

      if (archTpl) {
        rows.push({
          id: 'architecture-templates',
          label: 'Architecture templates',
          href: '/admin/templates',
          status: publishState(archTpl.dirty, archTpl.publishedAt),
          publishedAt: archTpl.publishedAt,
          count: `${archTpl.templateCount} templates`,
          issues: archTpl.issues ?? [],
        });
      }

      if (sections) {
        rows.push({
          id: 'sections',
          label: 'ADD sections',
          href: '/admin/sections',
          status: publishState(sections.dirty, sections.publishedAt),
          publishedAt: sections.publishedAt,
          count: `${sections.sectionCount} sections`,
          issues: sections.issues ?? [],
        });
      }

      if (flows) {
        rows.push({
          id: 'flows',
          label: 'Flow patterns',
          href: '/admin/flows',
          status: publishState(flows.dirty, flows.publishedAt),
          publishedAt: flows.publishedAt,
          count: `${flows.patternCount} patterns`,
          issues: flows.issues ?? [],
        });
      }

      if (cloud) {
        rows.push({
          id: 'cloud',
          label: 'Cloud services',
          href: '/admin/catalog/cloud-services',
          status: publishState(cloud.dirty, cloud.publishedAt),
          publishedAt: cloud.publishedAt,
          count: `${cloud.serviceCount} services`,
          issues: cloud.issues ?? [],
        });
      }

      if (copy) {
        rows.push({
          id: 'system-copy',
          label: 'System copy',
          href: '/admin/locale',
          status: publishState(copy.dirty, copy.publishedAt),
          publishedAt: copy.publishedAt,
          count: `${copy.keyCount} keys`,
          issues: copy.issues ?? [],
        });
      }

      const allIssues = rows.flatMap(r => r.issues);
      setDomains(rows);
      setIssues(allIssues);
    })();

    return () => { cancelled = true; };
  }, []);

  const loading = domains === null || issues === null;
  const hasIssues = (issues?.length ?? 0) > 0;

  return (
    <AdminWorkspace
      lede="Publish health across content domains — validation issues that block release."
      actions={
        !loading && hasIssues ? (
          <Link href="/admin/publish" className="btn primary sm">
            Review and publish
          </Link>
        ) : (
          <Link href="/admin/publish" className="btn sm">
            Publish wizard
          </Link>
        )
      }
    >
      {loading ? (
        <AdminEmpty>Loading…</AdminEmpty>
      ) : (
        <>
          {/* 1. Domain publish health — compact operator list, not KPI cards */}
          <div className="sect-label">Publish health</div>
          {domains.length === 0 ? (
            <AdminEmpty>No domain state available.</AdminEmpty>
          ) : (
            <div className="hist" role="list" style={{ marginBottom: 24 }}>
              {domains.map(row => {
                const when = formatPublishedAt(row.publishedAt);
                return (
                  <div
                    key={row.id}
                    className="histrow"
                    role="listitem"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                      padding: '10px 0',
                    }}
                  >
                    <Link
                      href={row.href}
                      style={{
                        flex: '1 1 160px',
                        textDecoration: 'none',
                        color: 'inherit',
                        fontWeight: 500,
                      }}
                    >
                      {row.label}
                    </Link>
                    <PublishBadge state={row.status} />
                    {row.count && (
                      <span className="count mono">{row.count}</span>
                    )}
                    {row.status === 'published' && when && (
                      <span className="hint mono" style={{ marginLeft: 'auto' }}>
                        {when}
                      </span>
                    )}
                    {row.status !== 'published' && (
                      <span className="hint mono" style={{ marginLeft: 'auto' }}>
                        —
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. Issues — primary (ISC-UX-A2) */}
          <div className="sect-label">Publish issues</div>
          {hasIssues ? (
            <div style={{ marginBottom: 24 }}>
              <IssueList issues={issues!} title="Blocking validation" />
              <p style={{ marginTop: 14 }}>
                <Link href="/admin/publish" className="btn primary sm">
                  Review and publish
                </Link>
              </p>
            </div>
          ) : (
            <AdminEmpty>
              No publish issues. All validated domains are clean.
            </AdminEmpty>
          )}

          {/* 3. Quick links — secondary text row */}
          <div style={{ marginTop: 28 }}>
            <div className="sect-label">Quick links</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <Link href="/admin/publish" className="btn sm">Publish wizard</Link>
              <Link href="/admin/import" className="btn sm">Import / Export</Link>
              <Link href="/admin/templates" className="btn sm">Templates</Link>
              <Link href="/admin/catalog" className="btn sm">Catalogue</Link>
              <Link href="/admin/sections" className="btn sm">ADD sections</Link>
              <Link href="/admin/flows" className="btn sm">Flows</Link>
              <Link href="/admin/locale" className="btn sm">Locale</Link>
            </div>
          </div>
        </>
      )}
    </AdminWorkspace>
  );
}
