'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CatalogSaveFlag, type CatalogSaveState } from '@/components/admin/CatalogList';
import { TemplateAddPanel } from '@/components/admin/TemplateAddPanel';
import { TemplateDiagramPanel } from '@/components/admin/TemplateDiagramPanel';
import {
  ARCHITECTURE_EDITOR_TABS,
  TemplateEditorShell,
  type TemplateEditorTab,
} from '@/components/admin/TemplateEditorShell';
import { TemplateFlowsPanel } from '@/components/admin/TemplateFlowsPanel';
import { TemplatePreviewPane } from '@/components/admin/TemplatePreviewPane';
import { Area, Group, Text } from '@/components/editors/Fields';
import { normalizeArchitecture } from '@/lib/defaults';
import { updateTemplate, type ArchitectureTemplateDetail } from '@/lib/admin/templates';
import type { Architecture } from '@/lib/types';

type Patch = (fn: (d: Architecture) => Architecture) => void;

export function ArchitectureTemplateEditor({
  tpl,
  title,
  subtitle,
  specText,
  saveState,
  error,
  actions,
  onTplChange,
  onSaveMeta,
  onSpecChange,
  onSaveSpec,
  onSnapshotError,
}: {
  tpl: ArchitectureTemplateDetail;
  title?: string;
  subtitle?: string;
  specText: string;
  saveState: CatalogSaveState;
  error?: string | null;
  actions: ReactNode;
  onTplChange: (next: ArchitectureTemplateDetail) => void;
  onSaveMeta: (patch: {
    nameEn?: string;
    nameFr?: string;
    meta?: Partial<ArchitectureTemplateDetail['meta']>;
  }) => void;
  onSpecChange: (value: string) => void;
  onSaveSpec: () => void;
  onSnapshotError?: (message: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<Architecture | null>(tpl.snapshot ?? null);
  const [snapshotSave, setSnapshotSave] = useState<CatalogSaveState>('idle');
  const dirtyRef = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    syncingRef.current = true;
    setSnapshot(tpl.snapshot ?? null);
    dirtyRef.current = false;
    const t = setTimeout(() => { syncingRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [tpl.id]);

  const patch: Patch = useCallback((fn) => {
    setSnapshot(prev => {
      if (!prev) return prev;
      dirtyRef.current = true;
      return normalizeArchitecture(fn(structuredClone(prev)));
    });
  }, []);

  useEffect(() => {
    if (!snapshot || !dirtyRef.current || syncingRef.current) return;
    setSnapshotSave('saving');
    const t = setTimeout(async () => {
      try {
        /* Forge accepts snapshot→spec on architecture PATCH in parallel; same
         * client shape as project templates. */
        await updateTemplate(tpl.id, { snapshot });
        dirtyRef.current = false;
        setSnapshotSave('saved');
        setTimeout(() => setSnapshotSave('idle'), 1200);
      } catch (e) {
        setSnapshotSave('error');
        onSnapshotError?.((e as Error).message);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [snapshot, tpl.id, onSnapshotError]);

  const displaySave: CatalogSaveState =
    snapshotSave === 'saving' || snapshotSave === 'error' || snapshotSave === 'dirty'
      ? snapshotSave
      : snapshotSave === 'saved' && saveState === 'idle'
        ? 'saved'
        : saveState;

  const counts = snapshot
    ? {
        components: snapshot.components?.length ?? 0,
        sections: snapshot.sections?.length ?? 0,
        flows: snapshot.flows?.length ?? 0,
      }
    : {
        components: tpl.outline.componentCount,
        sections: tpl.outline.sectionIds.length,
        flows: tpl.outline.flowCount,
      };

  const snapshotPanels: Partial<Record<TemplateEditorTab, ReactNode>> = snapshot
    ? {
        diagram: (
          <TemplateDiagramPanel doc={snapshot} patch={patch} />
        ),
        flows: (
          <TemplateFlowsPanel doc={snapshot} patch={patch} />
        ),
        add: (
          <TemplateAddPanel doc={snapshot} patch={patch} onError={onSnapshotError} />
        ),
        preview: (
          <TemplatePreviewPane
            templateId={tpl.id}
            snapshot={snapshot}
            saveState={displaySave}
            variant="full"
          />
        ),
      }
    : {
        diagram: <div className="empty">No agnostic snapshot loaded.</div>,
        flows: <div className="empty">No agnostic snapshot loaded.</div>,
        add: <div className="empty">No agnostic snapshot loaded.</div>,
        preview: <div className="empty">No agnostic snapshot to preview.</div>,
      };

  return (
    <TemplateEditorShell
      templateId={tpl.id}
      title={title ?? tpl.nameEn}
      subtitle={subtitle || tpl.meta.taglineEn || 'Hyperscaler pattern — spec stays per-cloud.'}
      badge={<span className="count">Architecture</span>}
      actions={(
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <CatalogSaveFlag state={displaySave} />
          {actions}
        </div>
      )}
      counts={counts}
      tabs={ARCHITECTURE_EDITOR_TABS}
      railHint="Diagram · Flows · ADD edit the agnostic snapshot. Per-cloud overrides stay under Advanced JSON."
      metadata={(
        <>
          {error && <div className="warnbox" style={{ marginBottom: 14 }}>{error}</div>}
          <Group title="Identity">
            <div className="field"><span>Template ID</span><div className="mono">{tpl.id}</div></div>
            <Text
              label="Name (EN)"
              value={tpl.nameEn}
              onChange={v => onTplChange({ ...tpl, nameEn: v })}
              onBlur={() => onSaveMeta({ nameEn: tpl.nameEn })}
            />
            <Text
              label="Name (FR)"
              value={tpl.nameFr}
              onChange={v => onTplChange({ ...tpl, nameFr: v })}
              onBlur={() => onSaveMeta({ nameFr: tpl.nameFr })}
            />
            <div className="field">
              <span>Targets</span>
              <div className="mono">{tpl.supportedTargets.join(', ') || '—'}</div>
            </div>
          </Group>
          <Group title="Picker copy">
            <Area
              label="Tagline (EN)"
              value={tpl.meta.taglineEn}
              onChange={v => onTplChange({ ...tpl, meta: { ...tpl.meta, taglineEn: v } })}
              onBlur={() => onSaveMeta({ meta: { taglineEn: tpl.meta.taglineEn } })}
            />
            <Area
              label="Tagline (FR)"
              value={tpl.meta.taglineFr}
              onChange={v => onTplChange({ ...tpl, meta: { ...tpl.meta, taglineFr: v } })}
              onBlur={() => onSaveMeta({ meta: { taglineFr: tpl.meta.taglineFr } })}
            />
            <div className="frow">
              <Text
                label="Accent"
                value={tpl.meta.accent}
                mono
                onChange={v => onTplChange({ ...tpl, meta: { ...tpl.meta, accent: v } })}
                onBlur={() => onSaveMeta({ meta: { accent: tpl.meta.accent } })}
              />
              <Text
                label="Icon key"
                value={tpl.meta.icon}
                mono
                onChange={v => onTplChange({ ...tpl, meta: { ...tpl.meta, icon: v } })}
                onBlur={() => onSaveMeta({ meta: { icon: tpl.meta.icon } })}
              />
            </div>
          </Group>
          <Group title="Outline">
            <div className="frow">
              <div className="field"><span>Components</span><div className="mono">{counts.components}</div></div>
              <div className="field"><span>Flows</span><div className="mono">{counts.flows}</div></div>
            </div>
            <div className="field">
              <span>Sections</span>
              <div className="mono">{tpl.outline.sectionIds.join(', ') || '—'}</div>
            </div>
          </Group>
        </>
      )}
      panels={{
        ...snapshotPanels,
        advanced: (
          <>
            {error && <div className="warnbox" style={{ marginBottom: 14 }}>{error}</div>}
            <Group title="Template spec">
              <p className="hint" style={{ marginBottom: 10 }}>
                Full JSON including per-cloud overrides. Saving here does not go through the project canvas.
              </p>
              <Area
                label="Spec"
                value={specText}
                minHeight={320}
                onChange={onSpecChange}
              />
              <button type="button" className="btn primary sm" onClick={onSaveSpec}>
                Save spec
              </button>
            </Group>
          </>
        ),
      }}
      inspectorPreview={
        snapshot ? (
          <div className="inspector-preview">
            <TemplatePreviewPane
              templateId={tpl.id}
              snapshot={snapshot}
              saveState={displaySave}
              variant="compact"
            />
          </div>
        ) : undefined
      }
    />
  );
}
