'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SectionForm } from '@/components/editors/SectionsEditor';
import { CatalogSaveFlag, type CatalogSaveState } from '@/components/admin/CatalogList';
import { PublishBadge } from '@/components/admin/PublishBadge';
import { SectionPreviewPane } from '@/components/admin/SectionPreviewPane';
import { blankArchitecture, STARTER_GROUPS, STARTER_LAYERS } from '@/lib/defaults';
import {
  deleteSection,
  fetchSection,
  fetchSectionState,
  publishSections,
  updateSection,
  type SectionLibraryState,
} from '@/lib/admin/sections';
import type { Architecture, Section } from '@/lib/types';

type ContentLocale = 'en' | 'fr';
type Mut<T> = (fn: (draft: T) => void) => void;

function stubDoc(sec: Section, lang: ContentLocale): Architecture {
  const doc = blankArchitecture('Section editor');
  doc.meta.lang = lang;
  doc.groups = STARTER_GROUPS();
  doc.layers = STARTER_LAYERS.map(layer => ({ ...layer }));
  doc.sections = [sec];
  return doc;
}

function libraryPublishState(state: SectionLibraryState | null): 'draft' | 'modified' | 'published' {
  if (!state) return 'published';
  if (state.dirty) return 'modified';
  if (state.publishedAt) return 'published';
  return 'draft';
}

export default function SectionEditor({ sectionId }: { sectionId: string }) {
  const router = useRouter();
  const [enSection, setEnSection] = useState<Section | null>(null);
  const [frSection, setFrSection] = useState<Section | null>(null);
  const [contentLocale, setContentLocale] = useState<ContentLocale>('en');
  const [libraryState, setLibraryState] = useState<SectionLibraryState | null>(null);
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const dirtyRef = useRef(false);
  const syncingRef = useRef(false);

  const reloadState = useCallback(async () => {
    try {
      setLibraryState(await fetchSectionState());
    } catch {
      /* state endpoint optional during rollout */
    }
  }, []);

  const reloadSection = useCallback(async () => {
    const detail = await fetchSection(sectionId);
    syncingRef.current = true;
    setEnSection(structuredClone(detail.en));
    setFrSection(structuredClone(detail.fr));
    dirtyRef.current = false;
    setSaveState('idle');
    setTimeout(() => { syncingRef.current = false; }, 0);
  }, [sectionId]);

  useEffect(() => {
    Promise.all([reloadSection(), reloadState()])
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load section'));
  }, [reloadSection, reloadState]);

  const activeSection = contentLocale === 'en' ? enSection : frSection;

  const markDirty = useCallback(() => {
    if (syncingRef.current) return;
    dirtyRef.current = true;
    if (saveState !== 'dirty' && saveState !== 'saving') setSaveState('dirty');
  }, [saveState]);

  const setActive: Mut<Section> = useCallback((fn) => {
    if (contentLocale === 'en') {
      setEnSection(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        fn(next);
        return next;
      });
    } else {
      setFrSection(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        fn(next);
        return next;
      });
    }
    markDirty();
  }, [contentLocale, markDirty]);

  useEffect(() => {
    if (!enSection || !frSection || !dirtyRef.current || syncingRef.current) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await updateSection(sectionId, { en: enSection, fr: frSection });
        dirtyRef.current = false;
        setSaveState('saved');
        await reloadState();
        setTimeout(() => setSaveState('idle'), 1200);
      } catch (e) {
        setSaveState('error');
        setError((e as Error).message);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [enSection, frSection, sectionId, reloadState]);

  async function onDelete() {
    if (!window.confirm(`Delete section "${sectionId}" from the ADD library? This cannot be undone.`)) return;
    setBusyDelete(true);
    setError(null);
    try {
      await deleteSection(sectionId);
      router.push('/admin/sections');
    } catch (e) {
      setError((e as Error).message);
      setBusyDelete(false);
    }
  }

  const handlePublish = async () => {
    if (busy) return;
    setBusy(true);
    setPublishIssues([]);
    setError(null);
    try {
      if (dirtyRef.current && enSection && frSection) {
        await updateSection(sectionId, { en: enSection, fr: frSection });
        dirtyRef.current = false;
      }
      const result = await publishSections();
      if (!result.ok) {
        setPublishIssues((result.issues ?? []).map(i => i.message));
        if (result.error) setError(result.error);
        return;
      }
      await reloadState();
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const editorDoc = useMemo(
    () => (activeSection ? stubDoc(activeSection, contentLocale) : null),
    [activeSection, contentLocale],
  );

  const jsonPreview = useMemo(() => {
    if (!activeSection) return '';
    return JSON.stringify(activeSection, null, 2);
  }, [activeSection]);

  if (error && !enSection) {
    return <div className="warnbox" style={{ margin: 22 }}>{error}</div>;
  }

  if (!enSection || !frSection || !editorDoc || !activeSection) {
    return <div className="empty">Loading section…</div>;
  }

  const publishState = libraryPublishState(libraryState);

  return (
    <div className="editor-body">
      <div className="content-main">
        <div className="cpanel">
          <div className="cpanel-head">
            <div>
              <h2 className="mono" style={{ fontSize: 15 }}>{sectionId}</h2>
              <p className="hint">{activeSection.type} section · bilingual ADD block</p>
            </div>
            <div className="cpanel-actions">
              <PublishBadge state={publishState} />
              <CatalogSaveFlag state={saveState} />
              <Link href="/admin/sections" className="btn sm">
                <Icon name="back" size={13} />Library
              </Link>
              <button
                type="button"
                className="btn primary sm"
                disabled={busy || saveState === 'saving'}
                onClick={() => void handlePublish()}
              >
                {busy ? 'Publishing…' : 'Publish library'}
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={busyDelete || saveState === 'saving'}
                onClick={() => void onDelete()}
              >
                Delete
              </button>
            </div>
          </div>

          {error && <div className="warnbox" style={{ marginBottom: 12 }}>{error}</div>}
          {publishIssues.length > 0 && (
            <div className="warnbox" style={{ marginBottom: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {publishIssues.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            </div>
          )}

          <div className="segmented" role="group" aria-label="Content locale" style={{ marginBottom: 14 }}>
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

          <SectionForm doc={editorDoc} sec={activeSection} set={setActive} />

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
                  <span>Section JSON ({contentLocale}, read-only)</span>
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
        <div className="sub mono">{sectionId}</div>
        <h3>Paper preview</h3>
        <SectionPreviewPane
          sectionId={sectionId}
          section={activeSection}
          saveState={saveState}
          variant="compact"
          lang={contentLocale}
        />
      </aside>
    </div>
  );
}
