'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminEmpty } from '@/components/admin/AdminEmpty';
import { ArchitectureTemplateEditor } from '@/components/admin/ArchitectureTemplateEditor';
import { CatalogSaveFlag, type CatalogSaveState } from '@/components/admin/CatalogList';
import { ProjectTemplateEditor } from '@/components/admin/ProjectTemplateEditor';
import { useAdminLocale } from '@/components/admin/AdminWorkspace';
import { Group, Text, Area } from '@/components/editors/Fields';
import {
  deleteTemplate,
  fetchTemplate,
  importTemplateSnapshot,
  updateTemplate,
  type ArchitectureTemplateDetail,
  type TemplateDetail,
} from '@/lib/admin/templates';
import type { Architecture } from '@/lib/types';
import type { Template } from '@/lib/templates/types';

export default function AdminTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = useAdminLocale();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tpl, setTpl] = useState<TemplateDetail | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [busyDelete, setBusyDelete] = useState(false);
  const [specText, setSpecText] = useState('');

  const load = useCallback(async () => {
    const data = await fetchTemplate(params.id);
    setTpl(data);
    if (data.kind === 'architecture' && data.spec) {
      setSpecText(JSON.stringify(data.spec, null, 2));
    }
    return data;
  }, [params.id]);

  useEffect(() => {
    load().catch(err => setError(err instanceof Error ? err.message : 'Failed to load template'));
  }, [load]);

  async function save(patch: Parameters<typeof updateTemplate>[1]) {
    if (!tpl) return;
    setSaveState('saving');
    setError(null);
    try {
      await updateTemplate(tpl.id, patch);
      if (tpl.kind === 'architecture') {
        const data = await load();
        if (data) setTpl(data);
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
    } catch (e) {
      setError((e as Error).message);
      setSaveState('error');
    }
  }

  async function onDelete() {
    if (!tpl) return;
    const label = tpl.kind === 'project' ? 'project' : 'architecture';
    if (!window.confirm(`Delete ${label} template "${tpl.id}"? Locked architecture ids re-seed on next ensure.`)) return;
    setBusyDelete(true);
    setError(null);
    try {
      await deleteTemplate(tpl.id);
      router.push('/admin/templates');
    } catch (e) {
      setError((e as Error).message);
      setBusyDelete(false);
    }
  }

  async function onImportJson(file: File) {
    if (!tpl || tpl.kind !== 'project') return;
    const text = await file.text();
    const snapshot = JSON.parse(text) as Architecture;
    setSaveState('saving');
    setError(null);
    try {
      await importTemplateSnapshot(tpl.id, snapshot);
      const data = await load();
      setEditorKey(k => k + 1);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
      if (data) setTpl(data);
    } catch (e) {
      setError((e as Error).message);
      setSaveState('error');
    }
  }

  async function saveArchitectureSpec() {
    if (!tpl || tpl.kind !== 'architecture') return;
    let spec: Template;
    try {
      spec = JSON.parse(specText) as Template;
    } catch {
      setError('Spec JSON is not valid');
      setSaveState('error');
      return;
    }
    await save({ spec });
  }

  if (error && !tpl) {
    return (
      <div className="workspace"><div className="ws-body"><div className="warnbox">{error}</div></div></div>
    );
  }

  if (!tpl) {
    return (
      <div className="workspace"><div className="ws-body"><AdminEmpty>Loading…</AdminEmpty></div></div>
    );
  }

  const displayName = locale === 'fr' ? tpl.nameFr : tpl.nameEn;
  const tagline = locale === 'fr' ? tpl.meta.taglineFr : tpl.meta.taglineEn;

  if (tpl.kind === 'architecture') {
    const arch = tpl as ArchitectureTemplateDetail;
    return (
      <ArchitectureTemplateEditor
        tpl={arch}
        title={displayName}
        subtitle={tagline || 'Hyperscaler pattern — spec stays per-cloud.'}
        specText={specText}
        saveState={saveState}
        error={error}
        actions={(
          <>
            <Link href="/admin/templates" className="btn sm ghost">All templates</Link>
            <button type="button" className="btn sm" disabled={busyDelete} onClick={onDelete}>Delete</button>
          </>
        )}
        onTplChange={next => setTpl(next)}
        onSaveMeta={patch => void save(patch)}
        onSpecChange={v => { setSpecText(v); setSaveState('dirty'); }}
        onSaveSpec={() => void saveArchitectureSpec()}
        onSnapshotError={msg => setError(msg)}
      />
    );
  }

  return (
    <ProjectTemplateEditor
      key={`${tpl.id}-${editorKey}`}
      tpl={tpl}
      editable
      onSnapshotError={msg => setError(msg)}
      header={{
        title: displayName,
        subtitle: tagline || 'Editable project snapshot.',
        badge: (
          <>
            <span className="count">Project</span>
            {tpl.featured && (
              <span className="count" style={{ borderColor: 'var(--brand)', color: 'var(--brand-ink)' }}>Featured</span>
            )}
          </>
        ),
        actions: (
          <>
            <CatalogSaveFlag state={saveState} />
            <Link href="/admin/templates" className="btn sm ghost">All templates</Link>
            <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>Import JSON</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) onImportJson(f); e.target.value = ''; }} />
            <button type="button" className="btn sm" disabled={busyDelete} onClick={onDelete}>Delete</button>
          </>
        ),
      }}
      metadata={(
        <>
          {error && <div className="warnbox" style={{ marginBottom: 14 }}>{error}</div>}

          <Group title="Identity">
            <div className="field"><span>Template ID</span><div className="mono">{tpl.id}</div></div>
            <Text label="Name (EN)" value={tpl.nameEn}
              onChange={v => setTpl({ ...tpl, nameEn: v })}
              onBlur={() => save({ nameEn: tpl.nameEn })} />
            <Text label="Name (FR)" value={tpl.nameFr}
              onChange={v => setTpl({ ...tpl, nameFr: v })}
              onBlur={() => save({ nameFr: tpl.nameFr })} />
            <label className="field">
              <span>Featured (seed + picker priority)</span>
              <button type="button"
                className={`radio${tpl.featured ? ' on' : ''}`}
                onClick={() => save({ featured: !tpl.featured })}>
                <i /> {tpl.featured ? 'Featured template' : 'Not featured'}
              </button>
            </label>
          </Group>

          <Group title="Picker copy">
            <Area label="Tagline (EN)" value={tpl.meta.taglineEn}
              onChange={v => setTpl({ ...tpl, meta: { ...tpl.meta, taglineEn: v } })}
              onBlur={() => save({ meta: { taglineEn: tpl.meta.taglineEn } })} />
            <Area label="Tagline (FR)" value={tpl.meta.taglineFr}
              onChange={v => setTpl({ ...tpl, meta: { ...tpl.meta, taglineFr: v } })}
              onBlur={() => save({ meta: { taglineFr: tpl.meta.taglineFr } })} />
            <Text label="Accent" value={tpl.meta.accent} mono
              onChange={v => setTpl({ ...tpl, meta: { ...tpl.meta, accent: v } })}
              onBlur={() => save({ meta: { accent: tpl.meta.accent } })} />
            <Text label="Icon key" value={tpl.meta.icon} mono
              onChange={v => setTpl({ ...tpl, meta: { ...tpl.meta, icon: v } })}
              onBlur={() => save({ meta: { icon: tpl.meta.icon } })} />
          </Group>

          <Group title="Outline">
            <div className="frow">
              <div className="field"><span>Components</span><div className="mono">{tpl.outline.componentCount}</div></div>
              <div className="field"><span>Flows</span><div className="mono">{tpl.outline.flowCount}</div></div>
            </div>
            <div className="field">
              <span>Sections</span>
              <div className="mono">{tpl.outline.sectionIds.join(', ') || '—'}</div>
            </div>
          </Group>
        </>
      )}
    />
  );
}
