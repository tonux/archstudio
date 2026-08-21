'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TemplateAddPanel } from '@/components/admin/TemplateAddPanel';
import { TemplateDiagramPanel } from '@/components/admin/TemplateDiagramPanel';
import { TemplateEditorShell, type TemplateEditorTab } from '@/components/admin/TemplateEditorShell';
import { TemplateFlowsPanel } from '@/components/admin/TemplateFlowsPanel';
import { TemplatePreviewPane } from '@/components/admin/TemplatePreviewPane';
import { CatalogSaveFlag, type CatalogSaveState } from '@/components/admin/CatalogList';
import { normalizeArchitecture } from '@/lib/defaults';
import { updateTemplate } from '@/lib/admin/templates';
import type { TemplateDetail } from '@/lib/admin/templates';
import type { Architecture } from '@/lib/types';

type Patch = (fn: (d: Architecture) => Architecture) => void;

export function ProjectTemplateEditor({
  tpl,
  editable,
  metadata,
  header,
  onSnapshotSaved,
  onSnapshotError,
}: {
  tpl: TemplateDetail & { snapshot?: Architecture };
  editable: boolean;
  metadata: ReactNode;
  header: {
    title: string;
    subtitle?: string;
    badge?: ReactNode;
    actions?: ReactNode;
  };
  onSnapshotSaved?: () => void;
  onSnapshotError?: (message: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<Architecture | null>(tpl.snapshot ?? null);
  const [saveState, setSaveState] = useState<CatalogSaveState>('idle');
  const dirtyRef = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    syncingRef.current = true;
    setSnapshot(tpl.snapshot ?? null);
    dirtyRef.current = false;
    const t = setTimeout(() => { syncingRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [tpl.id]); // snapshot resync via `key` from parent after JSON import

  const patch: Patch = useCallback((fn) => {
    if (!editable) return;
    setSnapshot(prev => {
      if (!prev) return prev;
      dirtyRef.current = true;
      return normalizeArchitecture(fn(structuredClone(prev)));
    });
  }, [editable]);

  useEffect(() => {
    if (!editable || !snapshot || !dirtyRef.current || syncingRef.current) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await updateTemplate(tpl.id, { snapshot });
        dirtyRef.current = false;
        setSaveState('saved');
        onSnapshotSaved?.();
        setTimeout(() => setSaveState('idle'), 1200);
      } catch (e) {
        setSaveState('error');
        onSnapshotError?.((e as Error).message);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [snapshot, editable, tpl.id, onSnapshotSaved, onSnapshotError]);

  const readOnly = !editable;
  const doc = snapshot;
  const noopPatch: Patch = () => {};

  const counts = doc
    ? {
        components: doc.components?.length ?? 0,
        sections: doc.sections?.length ?? 0,
        flows: doc.flows?.length ?? 0,
      }
    : { components: tpl.outline.componentCount, sections: tpl.outline.sectionIds.length, flows: tpl.outline.flowCount };

  const readOnlyHint = (
    <>
      Architecture pattern — view only. Edit in <span className="mono">src/lib/templates/</span> or wait for M5.
    </>
  );

  const panels: Partial<Record<TemplateEditorTab, ReactNode>> = doc
    ? {
        diagram: (
          <TemplateDiagramPanel
            doc={doc}
            patch={readOnly ? noopPatch : patch}
            readOnly={readOnly}
            hint={readOnly ? readOnlyHint : undefined}
          />
        ),
        flows: (
          <TemplateFlowsPanel
            doc={doc}
            patch={readOnly ? noopPatch : patch}
            readOnly={readOnly}
            hint={readOnly ? readOnlyHint : undefined}
          />
        ),
        add: (
          <TemplateAddPanel
            doc={doc}
            patch={readOnly ? noopPatch : patch}
            readOnly={readOnly}
            hint={readOnly ? readOnlyHint : undefined}
            onError={onSnapshotError}
          />
        ),
        preview: (
          <TemplatePreviewPane templateId={tpl.id} snapshot={doc} saveState={saveState} variant="full" />
        ),
      }
    : {
        diagram: <div className="empty">No snapshot loaded.</div>,
        flows: <div className="empty">No snapshot loaded.</div>,
        add: <div className="empty">No snapshot loaded.</div>,
        preview: <div className="empty">No snapshot loaded.</div>,
      };

  const actions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {editable && <CatalogSaveFlag state={saveState} />}
      {header.actions}
    </div>
  );

  return (
    <TemplateEditorShell
      templateId={tpl.id}
      title={header.title}
      subtitle={header.subtitle}
      badge={header.badge}
      actions={actions}
      counts={counts}
      metadata={metadata}
      panels={panels}
      inspectorPreview={
        doc ? (
          <div className="inspector-preview">
            <TemplatePreviewPane
              templateId={tpl.id}
              snapshot={doc}
              saveState={saveState}
              variant="compact"
            />
          </div>
        ) : undefined
      }
    />
  );
}
