'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { AdminEntityGrid, type AdminGridItem } from '@/components/admin/AdminEntityGrid';
import { AdminWorkspace, useAdminLocale } from '@/components/admin/AdminWorkspace';
import { NewTemplateDialog } from '@/components/admin/NewTemplateDialog';
import { PublishBadge } from '@/components/admin/PublishBadge';
import {
  fetchAllTemplates,
  fetchProjectTemplateState,
  publishProjectTemplates,
  reimportAcmeTemplate,
  type AdminTemplateListItem,
} from '@/lib/admin/templates';
import {
  fetchArchitectureTemplateState,
  publishArchitectureTemplates,
} from '@/lib/admin/architecture';

function templatePublishState(dirty: boolean, publishedAt: string | null): 'draft' | 'modified' | 'published' {
  if (dirty) return 'modified';
  if (publishedAt) return 'published';
  return 'draft';
}

function toGridItems(templates: AdminTemplateListItem[], locale: 'en' | 'fr'): AdminGridItem[] {
  return templates.map(tpl => ({
    href: `/admin/templates/${tpl.id}`,
    icon: tpl.icon,
    accent: tpl.accent,
    title: locale === 'fr' ? tpl.nameFr : tpl.nameEn,
    description: locale === 'fr' ? tpl.taglineFr : tpl.taglineEn,
    count: `${tpl.componentCount} comp · ${tpl.flowCount} flows`,
    badge: (
      <>
        {tpl.kind === 'architecture' && (
          <span className="count">Architecture</span>
        )}
        {tpl.kind === 'project' && tpl.featured && (
          <span className="count" style={{ borderColor: 'var(--brand)', color: 'var(--brand-ink)' }}>Featured</span>
        )}
      </>
    ),
  }));
}

function DomainHead({
  label,
  count,
  dirty,
  publishedAt,
  children,
}: {
  label: string;
  count: number;
  dirty: boolean;
  publishedAt: string | null;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <div className="sect-label" style={{ margin: 0, flex: '1 1 auto' }}>
        {label} · {count}
      </div>
      <PublishBadge state={templatePublishState(dirty, publishedAt)} />
      {!dirty && publishedAt && (
        <span className="hint mono">Published {publishedAt.slice(0, 10)}</span>
      )}
      {children}
    </div>
  );
}

export default function AdminTemplatesPage() {
  const router = useRouter();
  const locale = useAdminLocale();
  const [templates, setTemplates] = useState<AdminTemplateListItem[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [archDirty, setArchDirty] = useState(false);
  const [archPublishedAt, setArchPublishedAt] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    const [list, state, archState] = await Promise.all([
      fetchAllTemplates(),
      fetchProjectTemplateState({ validate: true }),
      fetchArchitectureTemplateState({ validate: true }),
    ]);
    setTemplates(list.templates);
    setDirty(state.dirty);
    setPublishedAt(state.publishedAt);
    setArchDirty(archState.dirty);
    setArchPublishedAt(archState.publishedAt);
    setPublishIssues([
      ...(state.issues ?? []).map(i => i.message),
      ...(archState.issues ?? []).map(i => i.message),
    ]);
  }, []);

  useEffect(() => {
    reload().catch(err => setError(err instanceof Error ? err.message : 'Failed to load templates'));
  }, [reload]);

  async function onPublish() {
    setBusy(true); setError(null);
    try {
      const result = await publishProjectTemplates();
      if (!result.ok) {
        setPublishIssues(result.issues.map(i => i.message));
        setError(result.error);
        return;
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onReimportAcme() {
    setBusy(true); setError(null);
    try {
      await reimportAcmeTemplate();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onPublishArchitecture() {
    setBusy(true); setError(null);
    try {
      const result = await publishArchitectureTemplates();
      if (!result.ok) {
        setPublishIssues(result.issues.map(i => i.message));
        setError(result.error);
        return;
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!templates) return [];
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(tpl => {
      const hay = [tpl.id, tpl.kind, tpl.nameEn, tpl.nameFr, tpl.taglineEn, tpl.taglineFr]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [templates, query]);

  const projectTemplates = filtered.filter(t => t.kind === 'project');
  const architectureTemplates = filtered.filter(t => t.kind === 'architecture');

  return (
    <>
      <AdminWorkspace
        lede="Project snapshots and hyperscaler patterns — edit in the atelier, publish each domain."
        search={{ value: query, onChange: setQuery, placeholder: 'Filter templates…' }}
        error={error}
        issues={publishIssues}
        actions={(
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => setShowNew(true)}>
            Create
          </button>
        )}
      >
        {!templates && !error && <AdminEmpty>Loading templates…</AdminEmpty>}
        {templates && templates.length === 0 && (
          <AdminEmpty>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
              <span>No templates yet.</span>
              <button type="button" className="btn primary sm" disabled={busy} onClick={() => setShowNew(true)}>
                Create
              </button>
            </div>
          </AdminEmpty>
        )}
        {templates && templates.length > 0 && filtered.length === 0 && (
          <AdminEmpty>No template matches this search.</AdminEmpty>
        )}

        {architectureTemplates.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <DomainHead
              label="Architecture templates"
              count={architectureTemplates.length}
              dirty={archDirty}
              publishedAt={archPublishedAt}
            >
              <button type="button" className="btn primary sm" disabled={busy} onClick={onPublishArchitecture}>
                {busy ? 'Publishing…' : 'Publish architecture'}
              </button>
            </DomainHead>
            <AdminEntityGrid items={toGridItems(architectureTemplates, locale)} />
          </div>
        )}

        {projectTemplates.length > 0 && (
          <div>
            <DomainHead
              label="Project templates"
              count={projectTemplates.length}
              dirty={dirty}
              publishedAt={publishedAt}
            >
              <button type="button" className="btn sm" disabled={busy} onClick={onReimportAcme}>
                Re-import Acme
              </button>
              <button type="button" className="btn primary sm" disabled={busy} onClick={onPublish}>
                {busy ? 'Publishing…' : 'Publish project'}
              </button>
            </DomainHead>
            <AdminEntityGrid items={toGridItems(projectTemplates, locale)} />
          </div>
        )}
      </AdminWorkspace>

      {showNew && (
        <NewTemplateDialog
          onClose={() => setShowNew(false)}
          onCreated={id => { setShowNew(false); router.push(`/admin/templates/${id}`); }}
        />
      )}
    </>
  );
}
