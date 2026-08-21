'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Area, Choice, IconPicker, Group } from '@/components/editors/Fields';
import { BrickPreviewPane } from '@/components/admin/BrickPreviewPane';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { STARTER_LAYERS } from '@/lib/defaults';
import { TAG_TO_PRESET, type ConcernTag } from '@/lib/document/concerns';
import {
  fetchCatalogState,
  patchBrick,
  publishCatalog,
  type CatalogIssue,
  type CatalogState
} from '@/lib/admin/catalog';
import { deleteBrick } from '@/lib/admin/catalog-entities';
import { invalidateLegoCatalogCache, loadLegoCatalog } from '@/lib/lego/client';
import type { LegoBrick, LegoCatalogSnapshot } from '@/lib/lego/types';

const ALL_CONCERN_TAGS = Object.keys(TAG_TO_PRESET) as ConcernTag[];

type ContentLocale = 'en' | 'fr';
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type BrickDraft = {
  icon: string;
  layer: string;
  defaultScope: string;
  concernTags: ConcernTag[];
  purposeEn: string;
  purposeFr: string;
  roleEn: string;
  roleFr: string;
};

function draftFromCatalog(en: LegoBrick, fr: LegoBrick): BrickDraft {
  return {
    icon: en.icon,
    layer: en.layer,
    defaultScope: en.defaultScope,
    concernTags: [...en.concernTags],
    purposeEn: en.purpose || en.role,
    purposeFr: fr.purpose || fr.role,
    roleEn: en.role,
    roleFr: fr.role
  };
}

function SaveFlag({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const label = { saving: 'Saving…', saved: 'Saved', error: 'Not saved', dirty: 'Editing…' }[state];
  return (
    <span className={`saveflag${state === 'saving' || state === 'dirty' ? ' dirty' : ''}${state === 'error' ? ' error' : ''}`}>
      <i />{label}
    </span>
  );
}

function layerOptions(catalog: LegoCatalogSnapshot) {
  const fromBricks = new Set(Object.values(catalog.bricks).map(b => b.layer));
  for (const layer of STARTER_LAYERS) fromBricks.add(layer.id);
  return [...fromBricks].sort().map(id => {
    const starter = STARTER_LAYERS.find(l => l.id === id);
    return { value: id, label: starter ? `${id} — ${starter.name}` : id };
  });
}

function IssuesBox({ issues }: { issues: CatalogIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="warnbox" style={{ margin: '0 0 12px' }}>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${i}`}>
            {issue.message}
            {issue.field && <span className="hint"> — field: {issue.field}</span>}
            {issue.entityId && <span className="mono" style={{ fontSize: 11 }}> ({issue.entityId})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BrickEditor({ brickId }: { brickId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusField = searchParams.get('field');
  const [enCatalog, setEnCatalog] = useState<LegoCatalogSnapshot | null>(null);
  const [frCatalog, setFrCatalog] = useState<LegoCatalogSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<BrickDraft | null>(null);
  const [contentLocale, setContentLocale] = useState<ContentLocale>('en');
  useEffect(() => {
    if (!focusField || !draft) return;
    if (focusField === 'roleFr' || focusField === 'purposeFr') setContentLocale('fr');
    if (focusField === 'roleEn' || focusField === 'purposeEn') setContentLocale('en');
    const t = window.setTimeout(() => {
      const root = document.querySelector(`[data-admin-field="${focusField}"]`);
      if (!(root instanceof HTMLElement)) return;
      root.scrollIntoView({ block: 'center', behavior: 'smooth' });
      root.style.outline = '2px solid var(--brand)';
      root.style.outlineOffset = '2px';
      const input = root.querySelector('textarea, input, select, button.tagchip');
      if (input instanceof HTMLElement) input.focus();
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusField, draft]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [catalogState, setCatalogState] = useState<CatalogState | null>(null);
  const [publishIssues, setPublishIssues] = useState<CatalogIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reloadCatalogs = useCallback(async () => {
    invalidateLegoCatalogCache();
    const [en, fr] = await Promise.all([loadLegoCatalog('en'), loadLegoCatalog('fr')]);
    setEnCatalog(en);
    setFrCatalog(fr);
    const enBrick = en.bricks[brickId];
    const frBrick = fr.bricks[brickId];
    if (enBrick && frBrick) setDraft(draftFromCatalog(enBrick, frBrick));
  }, [brickId]);

  const reloadCatalogState = useCallback(async () => {
    try {
      setCatalogState(await fetchCatalogState());
    } catch {
      /* API may not be ready yet — badge falls back to Published */
    }
  }, []);

  useEffect(() => {
    Promise.all([loadLegoCatalog('en'), loadLegoCatalog('fr')])
      .then(([en, fr]) => {
        setEnCatalog(en);
        setFrCatalog(fr);
        const enBrick = en.bricks[brickId];
        const frBrick = fr.bricks[brickId];
        if (!enBrick || !frBrick) return;
        setDraft(draftFromCatalog(enBrick, frBrick));
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load catalog'));
    reloadCatalogState();
  }, [brickId, reloadCatalogState]);

  const enBrick = enCatalog?.bricks[brickId];
  const layerOpts = useMemo(
    () => (enCatalog ? layerOptions(enCatalog) : []),
    [enCatalog]
  );
  const scopeOpts = useMemo(
    () => (enCatalog?.scopes ?? []).map(s => ({ value: s.id, label: s.label })),
    [enCatalog]
  );

  const jsonPreview = useMemo(() => {
    if (!draft || !enBrick) return '';
    const merged: LegoBrick = {
      ...enBrick,
      icon: draft.icon,
      layer: draft.layer,
      defaultScope: draft.defaultScope,
      concernTags: draft.concernTags,
      purpose: draft.purposeEn,
      role: draft.roleEn
    };
    return JSON.stringify(merged, null, 2);
  }, [draft, enBrick]);

  const handleSave = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaveState('saving');
    setPublishIssues([]);
    try {
      await patchBrick(brickId, draft);
      await reloadCatalogs();
      await reloadCatalogState();
      setSaveState('saved');
      return true;
    } catch (err) {
      setSaveState('error');
      return false;
    }
  };

  const handlePublish = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setPublishIssues([]);
    try {
      const saved = await handleSave();
      if (!saved) return;
      const result = await publishCatalog();
      if (!result.ok) {
        setPublishIssues(result.issues);
        return;
      }
      await reloadCatalogState();
      await reloadCatalogs();
    } catch (err) {
      setPublishIssues([{
        code: 'publish_error',
        message: err instanceof Error ? err.message : 'Publish failed'
      }]);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy || deleting) return;
    if (!window.confirm(`Delete brick “${brickId}”? Variants and dependencies that reference it must be removed first.`)) return;
    setDeleting(true);
    setPublishIssues([]);
    try {
      await deleteBrick(brickId);
      invalidateLegoCatalogCache();
      router.push('/admin/catalog/bricks');
    } catch (err) {
      setPublishIssues([{
        code: 'delete_error',
        message: err instanceof Error ? err.message : 'Delete failed',
      }]);
      setDeleting(false);
    }
  };

  const markDirty = () => {
    if (saveState !== 'dirty') setSaveState('dirty');
  };

  if (error) {
    return <div className="warnbox" style={{ margin: 22 }}>{error}</div>;
  }

  if (!enCatalog || !frCatalog) {
    return <div className="empty">Loading brick…</div>;
  }

  if (!enBrick || !draft) {
    return (
      <>
        <div className="empty">Brick not found: {brickId}</div>
        <div style={{ padding: '0 22px 24px' }}>
          <Link href="/admin/catalog/bricks" className="btn sm">
            <Icon name="back" size={13} />Back to briques
          </Link>
        </div>
      </>
    );
  }

  const toggleConcern = (tag: ConcernTag) => {
    markDirty();
    setDraft(d => {
      if (!d) return d;
      const has = d.concernTags.includes(tag);
      return {
        ...d,
        concernTags: has
          ? d.concernTags.filter(t => t !== tag)
          : [...d.concernTags, tag]
      };
    });
  };

  const purpose = contentLocale === 'en' ? draft.purposeEn : draft.purposeFr;
  const role = contentLocale === 'en' ? draft.roleEn : draft.roleFr;
  const setPurpose = (v: string) => {
    markDirty();
    setDraft(d => d && ({
      ...d,
      ...(contentLocale === 'en' ? { purposeEn: v } : { purposeFr: v })
    }));
  };
  const setRole = (v: string) => {
    markDirty();
    setDraft(d => d && ({
      ...d,
      ...(contentLocale === 'en' ? { roleEn: v } : { roleFr: v })
    }));
  };

  return (
    <div className="editor-body">
      <div className="content-main">
        <div className="cpanel">
          <div className="cpanel-head">
            <div>
              <h2 className="mono" style={{ fontSize: 15 }}>{brickId}</h2>
              <p className="hint">{enBrick.capabilityPhrase || 'Lego brick'}</p>
            </div>
            <div className="cpanel-actions">
              <PublishBadge state={catalogState?.dirty ? 'modified' : 'published'} />
              <SaveFlag state={saveState} />
              <button
                type="button"
                className="btn primary"
                disabled={saveState === 'saving' || busy || deleting}
                onClick={() => void handleSave()}
              >
                Save draft
              </button>
              <button
                type="button"
                className="btn"
                disabled={saveState === 'saving' || busy || deleting}
                onClick={() => void handlePublish()}
              >
                Publish catalogue
              </button>
              <button
                type="button"
                className="btn"
                disabled={saveState === 'saving' || busy || deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>

          <IssuesBox issues={publishIssues} />

          <Group title="Metadata" data-admin-field="metadata">
            <IconPicker
              value={draft.icon}
              onChange={icon => { markDirty(); setDraft(d => d && { ...d, icon }); }}
            />
            <div data-admin-field="layer">
            <Choice
              label="Layer"
              value={draft.layer}
              onChange={layer => { markDirty(); setDraft(d => d && { ...d, layer }); }}
              options={layerOpts}
            />
            </div>
            <div data-admin-field="defaultScope">
            <Choice
              label="Default scope"
              value={draft.defaultScope}
              onChange={defaultScope => { markDirty(); setDraft(d => d && { ...d, defaultScope }); }}
              options={scopeOpts}
            />
            </div>
            <div className="field" data-admin-field="concernTags">
              <span>Concern tags</span>
              <div className="chiprow">
                {ALL_CONCERN_TAGS.map(tag => {
                  const active = draft.concernTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className="tagchip"
                      aria-pressed={active}
                      style={active ? { borderColor: 'var(--brand)', color: 'var(--brand-ink)' } : undefined}
                      onClick={() => toggleConcern(tag)}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </Group>

          <Group title="Content">
            <div className="segmented" role="group" aria-label="Content locale" style={{ marginBottom: 12 }}>
              <button
                type="button"
                aria-pressed={contentLocale === 'en'}
                onClick={() => setContentLocale('en')}
              >
                EN
              </button>
              <button
                type="button"
                aria-pressed={contentLocale === 'fr'}
                onClick={() => setContentLocale('fr')}
              >
                FR
              </button>
            </div>
            <div data-admin-field={contentLocale === 'en' ? 'purposeEn' : 'purposeFr'}>
            <Area
              label={`Purpose (${contentLocale})`}
              value={purpose}
              onChange={v => setPurpose(v)}
              minHeight={72}
              hint="One- or two-sentence catalog purpose for ADD and glossary."
            />
            </div>
            <div data-admin-field={contentLocale === 'en' ? 'roleEn' : 'roleFr'}>
            <Area
              label={`Role (${contentLocale})`}
              value={role}
              onChange={v => setRole(v)}
              minHeight={56}
              hint="Legacy role prose — used when purpose is empty at placement."
            />
            </div>
          </Group>

          <div className="insp-sep" />

          <div className={`elist${advancedOpen ? ' open' : ''}`}>
            <div className="elist-head">
              <button
                type="button"
                className="iconbtn twist"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen(o => !o)}
                title={advancedOpen ? 'Collapse' : 'Expand'}
              >
                <Icon name="chevron" size={14} />
              </button>
              <button type="button" className="elist-name" onClick={() => setAdvancedOpen(o => !o)}>
                Advanced
              </button>
            </div>
            {advancedOpen && (
              <div className="elist-body">
                <label className="field">
                  <span>Brick JSON (read-only)</span>
                  <textarea
                    className="textarea"
                    readOnly
                    value={jsonPreview}
                    style={{ minHeight: 220, fontFamily: 'var(--mono)', fontSize: 11 }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className="inspector">
        <div className="sub mono">{brickId}</div>
        <h3>Preview</h3>
        <BrickPreviewPane
          brickId={brickId}
          draft={draft}
          capabilityPhrase={enBrick.capabilityPhrase}
          lang={contentLocale}
        />
      </aside>
    </div>
  );
}
