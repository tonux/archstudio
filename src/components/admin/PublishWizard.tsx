'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCatalogState,
  publishCatalog,
  type CatalogState,
} from '@/lib/admin/catalog';
import {
  fetchProjectTemplateState,
  publishProjectTemplates,
  type ProjectTemplateState,
} from '@/lib/admin/templates';
import {
  fetchArchitectureTemplateState,
  publishArchitectureTemplates,
  type ArchitectureLibraryState,
} from '@/lib/admin/architecture';
import {
  fetchSectionState,
  publishSections,
  type SectionLibraryState,
} from '@/lib/admin/sections';
import {
  fetchFlowPatternState,
  publishFlowPatterns,
  type FlowLibraryState,
} from '@/lib/admin/flows';
import {
  fetchCloudServicesState,
  publishCloudServices,
  type CloudServiceAdminState,
} from '@/lib/admin/cloud';
import {
  fetchSystemCopyState,
  publishSystemCopy,
  type SystemCopyAdminState,
} from '@/lib/admin/copy';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import {
  domainsForScope,
  filterIssuesByScope,
  type PublishDomainSource,
  type PublishScope,
} from '@/lib/admin/publish';
import { IssueList } from '@/components/admin/IssueList';
import { PublishBadge } from '@/components/admin/PublishBadge';

function publishBadgeState(dirty: boolean, publishedAt: string | null): 'draft' | 'modified' | 'published' {
  if (dirty) return 'modified';
  if (publishedAt) return 'published';
  return 'draft';
}

const SCOPE_OPTIONS: { id: PublishScope; label: string; hint: string }[] = [
  { id: 'all', label: 'All', hint: 'Every content domain, in order' },
  { id: 'catalog', label: 'Catalogue', hint: 'Lego bricks, variants, dependencies' },
  { id: 'templates', label: 'Project templates', hint: 'Project template snapshot' },
  { id: 'architecture', label: 'Architecture', hint: 'Architecture templates library' },
  { id: 'sections', label: 'ADD sections', hint: 'Document section presets' },
  { id: 'flows', label: 'Flow patterns', hint: 'Journey pattern library' },
  { id: 'cloud', label: 'Cloud services', hint: 'Provider service matrix' },
  { id: 'system_copy', label: 'System copy', hint: 'Locale strings & layer labels' },
];

type DomainBundle = {
  catalog: CatalogState;
  templates: ProjectTemplateState;
  architecture: ArchitectureLibraryState;
  sections: SectionLibraryState;
  flows: FlowLibraryState;
  cloud: CloudServiceAdminState;
  system_copy: SystemCopyAdminState;
};

type PublishFnResult =
  | { ok: true; publishedAt: string }
  | { ok: false; error?: string; issues: CatalogIssue[] };

async function publishDomain(source: PublishDomainSource): Promise<PublishFnResult> {
  switch (source) {
    case 'catalog':
      return publishCatalog();
    case 'templates':
      return publishProjectTemplates();
    case 'architecture':
      return publishArchitectureTemplates();
    case 'sections':
      return publishSections();
    case 'flows':
      return publishFlowPatterns();
    case 'cloud':
      return publishCloudServices();
    case 'system_copy':
      return publishSystemCopy();
  }
}

function domainLabel(source: PublishDomainSource): string {
  return SCOPE_OPTIONS.find(o => o.id === source)?.label ?? source;
}

function domainSummary(source: PublishDomainSource, bundle: DomainBundle): string {
  switch (source) {
    case 'catalog':
      return `version ${bundle.catalog.version}${bundle.catalog.publishedAt ? ` · last ${bundle.catalog.publishedAt}` : ''}`;
    case 'templates':
      return `${bundle.templates.templateCount} templates${bundle.templates.publishedAt ? ` · last ${bundle.templates.publishedAt}` : ''}`;
    case 'architecture':
      return `${bundle.architecture.templateCount} templates${bundle.architecture.publishedAt ? ` · last ${bundle.architecture.publishedAt}` : ''}`;
    case 'sections':
      return `${bundle.sections.sectionCount} sections${bundle.sections.publishedAt ? ` · last ${bundle.sections.publishedAt}` : ''}`;
    case 'flows':
      return `${bundle.flows.patternCount} patterns${bundle.flows.publishedAt ? ` · last ${bundle.flows.publishedAt}` : ''}`;
    case 'cloud':
      return `${bundle.cloud.serviceCount} services${bundle.cloud.publishedAt ? ` · last ${bundle.cloud.publishedAt}` : ''}`;
    case 'system_copy':
      return `${bundle.system_copy.keyCount} keys${bundle.system_copy.publishedAt ? ` · last ${bundle.system_copy.publishedAt}` : ''}`;
  }
}

function domainDirty(source: PublishDomainSource, bundle: DomainBundle): boolean {
  return bundle[source].dirty;
}

function domainPublishedAt(source: PublishDomainSource, bundle: DomainBundle): string | null {
  return bundle[source].publishedAt;
}

function domainIssues(source: PublishDomainSource, bundle: DomainBundle): CatalogIssue[] {
  return bundle[source].issues ?? [];
}

export function PublishWizard() {
  const [scope, setScope] = useState<PublishScope>('all');
  const [bundle, setBundle] = useState<DomainBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<CatalogIssue[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [catalog, templates, architecture, sections, flows, cloud, system_copy] = await Promise.all([
        fetchCatalogState({ validate: true }),
        fetchProjectTemplateState({ validate: true }),
        fetchArchitectureTemplateState({ validate: true }),
        fetchSectionState({ validate: true }),
        fetchFlowPatternState({ validate: true }),
        fetchCloudServicesState({ validate: true }),
        fetchSystemCopyState({ validate: true }),
      ]);
      setBundle({ catalog, templates, architecture, sections, flows, cloud, system_copy });
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load publish state');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedDomains = useMemo(() => domainsForScope(scope), [scope]);

  const validationIssues = useMemo(() => {
    if (publishIssues.length > 0) return publishIssues;
    if (!bundle) return [];
    return selectedDomains.flatMap(source =>
      filterIssuesByScope(domainIssues(source, bundle), scope, source),
    );
  }, [bundle, scope, selectedDomains, publishIssues]);

  const blocked = validationIssues.length > 0;

  const handlePublish = async () => {
    setBusy(true);
    setPublishError(null);
    setPublishIssues([]);
    setPublishedAt(null);
    try {
      let lastPublished: string | null = null;
      for (const source of selectedDomains) {
        const result = await publishDomain(source);
        if (!result.ok) {
          setPublishIssues(result.issues);
          setPublishError(result.error || `${domainLabel(source)} publish blocked`);
          return;
        }
        lastPublished = result.publishedAt;
      }
      setPublishedAt(lastPublished);
      await load();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setPublishError(null);
    setPublishIssues([]);
    setPublishedAt(null);
    void load();
  };

  if (publishedAt) {
    return (
      <div className="empty" style={{ padding: '32px 0' }}>
        Published successfully
        <div className="mono hint" style={{ marginTop: 8, fontSize: 11 }}>
          {publishedAt}
        </div>
        <button
          type="button"
          className="btn ghost sm"
          style={{ marginTop: 16 }}
          onClick={() => {
            setPublishedAt(null);
            void load();
          }}
        >
          Publish again
        </button>
      </div>
    );
  }

  if (loadError) {
    return <div className="warnbox">{loadError}</div>;
  }

  if (!bundle) {
    return <div className="empty">Loading publish state…</div>;
  }

  return (
    <div className="flowmap">
      <div className="flowmap-row">
        <i className="n">1</i>
        <div className="what" style={{ gridColumn: '2 / -1' }}>
          <b>Scope</b>
          <em>Choose what to publish</em>
          <div className="radio-row" style={{ marginTop: 10 }}>
            {SCOPE_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                className={`radio${scope === option.id ? ' on' : ''}`}
                aria-pressed={scope === option.id}
                onClick={() => {
                  setScope(option.id);
                  setPublishIssues([]);
                }}
              >
                <i /> {option.label}
                <em>{option.hint}</em>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flowmap-row">
        <i className="n">2</i>
        <div className="what" style={{ gridColumn: '2 / -1' }}>
          <b>Validation</b>
          <em>{blocked ? 'Fix issues before publishing' : 'No blocking issues'}</em>
          <div style={{ marginTop: 10 }}>
            {blocked ? (
              <IssueList issues={validationIssues} />
            ) : (
              <p className="hint" style={{ margin: 0 }}>Ready to publish.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flowmap-row">
        <i className="n">3</i>
        <div className="what" style={{ gridColumn: '2 / -1' }}>
          <b>Summary</b>
          <em>What will be published</em>
          <div className="hist" style={{ marginTop: 10, display: 'block', border: '1px solid var(--line)' }}>
            <div className="hist-list" style={{ borderRight: 0 }}>
              {selectedDomains.map(source => (
                <div
                  key={source}
                  className="histrow on"
                  style={{ cursor: 'default', borderLeft: '2px solid var(--brand)' }}
                >
                  <div>
                    <span className="when">{domainLabel(source)}</span>
                    <span className="at" style={{ display: 'block', marginTop: 4 }}>
                      <span className="mono">{domainSummary(source, bundle)}</span>
                    </span>
                  </div>
                  <PublishBadge state={publishBadgeState(domainDirty(source, bundle), domainPublishedAt(source, bundle))} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flowmap-row">
        <i className="n">4</i>
        <div className="what" style={{ gridColumn: '2 / -1' }}>
          <b>Confirm</b>
          <em>{blocked ? 'Resolve validation issues first' : 'Publish when ready'}</em>
          {publishError && (
            <div className="warnbox" style={{ marginTop: 10 }}>{publishError}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn ghost" disabled={busy} onClick={handleCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || blocked}
              onClick={() => void handlePublish()}
            >
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
