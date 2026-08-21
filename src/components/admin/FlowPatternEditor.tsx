'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Area, Group, IconPicker, Text } from '@/components/editors/Fields';
import { CatalogSaveFlag, type CatalogSaveState } from '@/components/admin/CatalogList';
import { PublishBadge } from '@/components/admin/PublishBadge';
import {
  deleteFlowPattern,
  fetchFlowPattern,
  fetchFlowPatternPreview,
  fetchFlowPatternState,
  fetchFlowPatterns,
  publishFlowPatterns,
  updateFlowPattern,
  type FlowLibraryState,
  type FlowPreviewStats,
} from '@/lib/admin/flows';
import { slugify } from '@/lib/defaults';
import type { FlowHint, FlowTemplate, FlowTemplateStep } from '@/lib/flows/types';
import type { L10n } from '@/lib/templates/types';

type ContentLocale = 'en' | 'fr';
type Mut<T> = (fn: (draft: T) => void) => void;

function asPair(value: L10n | undefined): { en: string; fr: string } {
  if (!value) return { en: '', fr: '' };
  if (typeof value === 'string') return { en: value, fr: value };
  return { en: value.en ?? '', fr: value.fr ?? '' };
}

function loc(value: L10n | undefined, lang: ContentLocale): string {
  return asPair(value)[lang];
}

function setLoc(value: L10n | undefined, lang: ContentLocale, next: string): { en: string; fr: string } {
  return { ...asPair(value), [lang]: next };
}

function csv(values?: string[]): string {
  return (values ?? []).join(', ');
}

function parseCsv(raw: string): string[] {
  return raw.split(',').map(part => part.trim()).filter(Boolean);
}

function hintSignalCount(hint?: FlowHint): number {
  if (!hint) return 0;
  return (['name', 'tech', 'layers', 'icons', 'avoid'] as const)
    .reduce((n, key) => n + (hint[key]?.length ?? 0), 0);
}

function libraryPublishState(state: FlowLibraryState | null): 'draft' | 'modified' | 'published' {
  if (!state) return 'published';
  if (state.dirty) return 'modified';
  if (state.publishedAt) return 'published';
  return 'draft';
}

function localeFromField(field: string | null): ContentLocale | null {
  if (!field) return null;
  if (field.endsWith('.fr')) return 'fr';
  if (field.endsWith('.en')) return 'en';
  return null;
}

function blankStep(taken: string[]): FlowTemplateStep {
  const key = slugify('New step', taken);
  return {
    key,
    title: { en: 'New step', fr: 'Nouvelle étape' },
    hint: { name: [key] },
  };
}

function stepIndexForField(field: string | null, steps: FlowTemplateStep[]): number | null {
  if (!field) return null;
  if (field === 'steps') return 0;
  const indexed = field.match(/^steps\.(\d+)\./);
  if (indexed) return Number(indexed[1]);
  const keyed = field.match(/^steps\.([^.]+)\./);
  if (!keyed) return null;
  const idx = steps.findIndex(step => step.key === keyed[1]);
  return idx >= 0 ? idx : null;
}

function StepEditor({
  step,
  index,
  locale,
  open,
  canRemove,
  isFirst,
  isLast,
  onToggle,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  step: FlowTemplateStep;
  index: number;
  locale: ContentLocale;
  open: boolean;
  canRemove: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onChange: (next: FlowTemplateStep) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const hint: FlowHint = step.hint ?? {};
  const setHint = (field: keyof FlowHint, raw: string) => {
    onChange({ ...step, hint: { ...hint, [field]: parseCsv(raw) } });
  };
  const signals = hintSignalCount(hint);

  return (
    <div className={`elist${open ? ' open' : ''}`}>
      <div className="elist-head">
        <button
          type="button"
          className="iconbtn twist"
          aria-expanded={open}
          onClick={onToggle}
          title={open ? 'Collapse' : 'Expand'}
        >
          <Icon name="chevron" size={14} />
        </button>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', width: 18, textAlign: 'right', flex: 'none' }}>
          {index + 1}
        </span>
        <button type="button" className="elist-name" onClick={onToggle}>
          {loc(step.title, locale) || step.key}
          {step.key ? <em> · {step.key}</em> : null}
        </button>
        <span className="count" title="Hint signals">{signals}</span>
        <button type="button" className="iconbtn" title="Move up" disabled={isFirst} onClick={onMoveUp}>
          <Icon name="chevron" size={13} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <button type="button" className="iconbtn" title="Move down" disabled={isLast} onClick={onMoveDown}>
          <Icon name="chevron" size={13} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <button
          type="button"
          className="iconbtn danger"
          title={canRemove ? 'Remove step' : 'A pattern needs at least two steps'}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      {open && (
        <div className="elist-body">
          <div data-admin-field={`steps.${index}.key`}>
            <label className="field">
              <span>Key</span>
              <input
                className="input"
                value={step.key}
                readOnly
                aria-readonly="true"
                style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)' }}
              />
              <div className="hint">Set from the title when the step is added — then stable.</div>
            </label>
          </div>
          <div data-admin-field={`steps.${step.key}.title`}>
            <Text
              label={`Title (${locale})`}
              value={loc(step.title, locale)}
              onChange={v => onChange({ ...step, title: setLoc(step.title, locale, v) })}
            />
          </div>
          <Area
            label={`Description (${locale})`}
            value={loc(step.description, locale)}
            onChange={v => onChange({ ...step, description: setLoc(step.description, locale, v) })}
            minHeight={72}
          />
          <div data-admin-field={`steps.${step.key}.hint`}>
            <Group title="Hints" hint="Comma-separated signals used at insert time.">
              <div data-admin-field={`steps.${step.key}.hint.name`}>
                <Area label="Name" value={csv(hint.name)} onChange={v => setHint('name', v)} />
              </div>
              <div data-admin-field={`steps.${step.key}.hint.tech`}>
                <Area label="Tech" value={csv(hint.tech)} onChange={v => setHint('tech', v)} />
              </div>
              <div data-admin-field={`steps.${step.key}.hint.layers`}>
                <Area label="Layers" value={csv(hint.layers)} onChange={v => setHint('layers', v)} />
              </div>
              <div data-admin-field={`steps.${step.key}.hint.icons`}>
                <Area label="Icons" value={csv(hint.icons)} onChange={v => setHint('icons', v)} />
              </div>
              <div data-admin-field={`steps.${step.key}.hint.avoid`}>
                <Area label="Avoid" value={csv(hint.avoid)} onChange={v => setHint('avoid', v)} />
              </div>
            </Group>
          </div>
        </div>
      )}
    </div>
  );
}

function BindingInspector({
  patternId,
  pattern,
  locale,
  preview,
  onRefresh,
}: {
  patternId: string;
  pattern: FlowTemplate;
  locale: ContentLocale;
  preview: FlowPreviewStats | null;
  onRefresh: () => void;
}) {
  const mappable = preview?.mappableSteps ?? 0;
  const matched = preview?.matchedOnDemo ?? 0;

  return (
    <aside className="inspector">
      <div className="sub mono">{patternId}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Binding preview</h3>
        <button type="button" className="btn sm" onClick={onRefresh}>Refresh</button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Scored against the Acme demo at insert time.
      </p>

      {preview ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px', fontSize: 13, marginTop: 12 }}>
            <span className="hint">Steps</span>
            <span className="count">{preview.stepCount}</span>
            <span className="hint">Mappable</span>
            <span className="count">{preview.mappableSteps}</span>
            <span className="hint">Matched on demo</span>
            <span className="count">{preview.matchedOnDemo}</span>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            {mappable === 0
              ? 'No mappable steps — add at least one name or tech hint.'
              : `${matched} of ${mappable} mappable steps found a component on the demo canvas.`}
          </p>
        </>
      ) : (
        <p className="hint">Preview unavailable.</p>
      )}

      <div className="insp-sep" />
      <div className="sect-label" style={{ paddingTop: 0 }}>Steps</div>
      <div className="flowmap" style={{ marginTop: 6 }}>
        {pattern.steps.map((step, index) => (
          <div key={`${step.key}-${index}`} className="flowmap-row" style={{ gridTemplateColumns: '20px minmax(0, 1fr)' }}>
            <span className="n">{index + 1}</span>
            <div className="what">
              <b>{loc(step.title, locale) || step.key}</b>
              <em className="mono">{step.key}</em>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function FlowPatternEditor({ patternId }: { patternId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusField = searchParams.get('field');
  const [pattern, setPattern] = useState<FlowTemplate | null>(null);
  const [locked, setLocked] = useState(false);
  const [contentLocale, setContentLocale] = useState<ContentLocale>('en');
  const [libraryState, setLibraryState] = useState<FlowLibraryState | null>(null);
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [preview, setPreview] = useState<FlowPreviewStats | null>(null);
  const [openSteps, setOpenSteps] = useState<Set<number>>(() => new Set([0]));
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const dirtyRef = useRef(false);
  const syncingRef = useRef(false);

  const reloadState = useCallback(async () => {
    try {
      setLibraryState(await fetchFlowPatternState());
    } catch {
      /* state endpoint optional during rollout */
    }
  }, []);

  const reloadPattern = useCallback(async () => {
    const [detail, list] = await Promise.all([
      fetchFlowPattern(patternId),
      fetchFlowPatterns().catch(() => ({ patterns: [] as { id: string; locked: boolean }[] })),
    ]);
    syncingRef.current = true;
    setPattern(structuredClone(detail));
    setLocked(list.patterns.some(item => item.id === patternId && item.locked));
    dirtyRef.current = false;
    setSaveState('idle');
    const focused = stepIndexForField(focusField, detail.steps);
    setOpenSteps(new Set([focused ?? 0]));
    setTimeout(() => { syncingRef.current = false; }, 0);
  }, [patternId, focusField]);

  useEffect(() => {
    Promise.all([reloadPattern(), reloadState()])
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load flow pattern'));
  }, [reloadPattern, reloadState]);

  const reloadPreview = useCallback(async () => {
    try {
      setPreview(await fetchFlowPatternPreview(patternId, contentLocale));
    } catch {
      setPreview(null);
    }
  }, [patternId, contentLocale]);

  useEffect(() => {
    void reloadPreview();
  }, [reloadPreview]);

  useEffect(() => {
    if (saveState === 'saved') void reloadPreview();
  }, [saveState, reloadPreview]);

  useEffect(() => {
    const lang = localeFromField(focusField);
    if (lang) setContentLocale(lang);
  }, [focusField]);

  useEffect(() => {
    if (!focusField || !pattern) return;
    const t = window.setTimeout(() => {
      const root = document.querySelector(`[data-admin-field="${focusField}"]`);
      if (!(root instanceof HTMLElement)) return;
      root.scrollIntoView({ block: 'center', behavior: 'smooth' });
      root.style.outline = '2px solid var(--brand)';
      root.style.outlineOffset = '2px';
      const input = root.querySelector('textarea, input:not([readonly]), select');
      if (input instanceof HTMLElement) input.focus();
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusField, pattern, contentLocale, openSteps]);

  const markDirty = useCallback(() => {
    if (syncingRef.current) return;
    dirtyRef.current = true;
    if (saveState !== 'dirty' && saveState !== 'saving') setSaveState('dirty');
  }, [saveState]);

  const setDraft: Mut<FlowTemplate> = useCallback((fn) => {
    setPattern(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    markDirty();
  }, [markDirty]);

  useEffect(() => {
    if (!pattern || !dirtyRef.current || syncingRef.current) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await updateFlowPattern(patternId, pattern);
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
  }, [pattern, patternId, reloadState]);

  const handlePublish = async () => {
    if (busy) return;
    setBusy(true);
    setPublishIssues([]);
    setError(null);
    try {
      if (dirtyRef.current && pattern) {
        await updateFlowPattern(patternId, pattern);
        dirtyRef.current = false;
      }
      const result = await publishFlowPatterns();
      if (!result.ok) {
        setPublishIssues((result.issues ?? []).map(i => i.message));
        return;
      }
      await reloadState();
      await reloadPreview();
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  async function onDelete() {
    const restore = locked
      ? ' Deleting a catalogue recipe restores the seed on the next load.'
      : ' This cannot be undone.';
    if (!window.confirm(`Delete pattern "${patternId}" from the flow library?${restore}`)) return;
    setBusyDelete(true);
    setError(null);
    try {
      await deleteFlowPattern(patternId);
      router.push('/admin/flows');
    } catch (e) {
      setError((e as Error).message);
      setBusyDelete(false);
    }
  }

  function addStep() {
    const nextIndex = pattern?.steps.length ?? 0;
    setDraft(d => {
      d.steps.push(blankStep(d.steps.map(s => s.key)));
    });
    setOpenSteps(new Set([nextIndex]));
  }

  function removeStep(index: number) {
    if (!pattern || pattern.steps.length <= 2) return;
    const target = pattern.steps[index];
    if (!window.confirm(`Remove step "${target.key}"? A pattern needs at least two steps.`)) return;
    setDraft(d => {
      d.steps.splice(index, 1);
    });
    setOpenSteps(prev => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i === index) continue;
        next.add(i > index ? i - 1 : i);
      }
      return next.size ? next : new Set([0]);
    });
  }

  function moveStep(index: number, delta: number) {
    const dest = index + delta;
    setDraft(d => {
      if (dest < 0 || dest >= d.steps.length) return;
      const [step] = d.steps.splice(index, 1);
      d.steps.splice(dest, 0, step);
    });
    setOpenSteps(prev => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i === index) next.add(dest);
        else if (i === dest) next.add(index);
        else next.add(i);
      }
      return next;
    });
  }

  const jsonPreview = useMemo(() => {
    if (!pattern) return '';
    return JSON.stringify(pattern, null, 2);
  }, [pattern]);

  if (error && !pattern) {
    return <div className="warnbox" style={{ margin: 22 }}>{error}</div>;
  }

  if (!pattern) {
    return <div className="empty">Loading flow pattern…</div>;
  }

  const publishState = libraryPublishState(libraryState);

  return (
    <div className="editor-body">
      <div className="content-main">
        <div className="cpanel">
          <div className="cpanel-head">
            <div>
              <h2 className="mono" style={{ fontSize: 15 }}>{patternId}</h2>
              <p className="hint">
                {pattern.steps.length} steps
                {locked
                  ? ' · catalogue recipe — delete restores seed on next load'
                  : ' · custom pattern'}
              </p>
            </div>
            <div className="cpanel-actions">
              <PublishBadge state={publishState} />
              <CatalogSaveFlag state={saveState} />
              <Link href="/admin/flows" className="btn sm">
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

          <Group title="Identity">
            <div data-admin-field="icon">
              <IconPicker value={pattern.icon} onChange={v => setDraft(d => { d.icon = v; })} />
            </div>
            <div data-admin-field={contentLocale === 'fr' ? 'name.fr' : 'name.en'}>
              <Text
                label={`Name (${contentLocale})`}
                value={loc(pattern.name, contentLocale)}
                onChange={v => setDraft(d => { d.name = setLoc(d.name, contentLocale, v); })}
              />
            </div>
            <div data-admin-field={contentLocale === 'fr' ? 'tagline.fr' : 'tagline.en'}>
              <Text
                label={`Tagline (${contentLocale})`}
                value={loc(pattern.tagline, contentLocale)}
                onChange={v => setDraft(d => { d.tagline = setLoc(d.tagline, contentLocale, v); })}
              />
            </div>
            <Text
              label={`Sub (${contentLocale})`}
              value={loc(pattern.sub, contentLocale)}
              onChange={v => setDraft(d => { d.sub = setLoc(d.sub, contentLocale, v); })}
            />
            <Area
              label={`Note (${contentLocale})`}
              value={loc(pattern.note, contentLocale)}
              onChange={v => setDraft(d => { d.note = setLoc(d.note, contentLocale, v); })}
              minHeight={80}
            />
          </Group>

          <div className="insp-sep" />

          <div data-admin-field="steps">
            <Group title="Steps" hint="Add, remove, or reorder steps. Keys are set from the title when a step is added. At least two steps required.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pattern.steps.map((step, index) => (
                  <StepEditor
                    key={step.key}
                    step={step}
                    index={index}
                    locale={contentLocale}
                    open={openSteps.has(index)}
                    canRemove={pattern.steps.length > 2}
                    isFirst={index === 0}
                    isLast={index === pattern.steps.length - 1}
                    onToggle={() => setOpenSteps(prev => {
                      const next = new Set(prev);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })}
                    onChange={next => setDraft(d => { d.steps[index] = next; })}
                    onMoveUp={() => moveStep(index, -1)}
                    onMoveDown={() => moveStep(index, 1)}
                    onRemove={() => removeStep(index)}
                  />
                ))}
              </div>
              <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={addStep}>
                <Icon name="plus" size={13} />Add step
              </button>
            </Group>
          </div>

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
                  <span>Pattern JSON (read-only)</span>
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

      <BindingInspector
        patternId={patternId}
        pattern={pattern}
        locale={contentLocale}
        preview={preview}
        onRefresh={() => { void reloadPreview(); }}
      />
    </div>
  );
}
