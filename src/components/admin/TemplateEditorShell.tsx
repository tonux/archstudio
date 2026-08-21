'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';

export type TemplateEditorTab =
  | 'metadata'
  | 'diagram'
  | 'flows'
  | 'add'
  | 'preview'
  | 'advanced';

export type TemplateEditorTabSpec = { id: TemplateEditorTab; label: string; icon: string };

export const PROJECT_TABS: TemplateEditorTabSpec[] = [
  { id: 'metadata', label: 'Metadata', icon: 'file' },
  { id: 'diagram', label: 'Diagram', icon: 'grid' },
  { id: 'flows', label: 'Flows', icon: 'route' },
  { id: 'add', label: 'ADD', icon: 'folder' },
  { id: 'preview', label: 'Preview', icon: 'eye' },
];

export const ARCHITECTURE_EDITOR_TABS: TemplateEditorTabSpec[] = [
  { id: 'metadata', label: 'Metadata', icon: 'file' },
  { id: 'diagram', label: 'Diagram', icon: 'grid' },
  { id: 'flows', label: 'Flows', icon: 'route' },
  { id: 'add', label: 'ADD', icon: 'folder' },
  { id: 'preview', label: 'Preview', icon: 'eye' },
  { id: 'advanced', label: 'Advanced', icon: 'terminal' },
];

export function TemplateEditorShell({
  templateId,
  title,
  subtitle,
  badge,
  actions,
  counts,
  tab: controlledTab,
  onTabChange,
  metadata,
  panels,
  inspectorPreview,
  placeholder = 'Panel not available.',
  tabs = PROJECT_TABS,
  railHint = 'Edit the project snapshot by tab.',
}: {
  templateId: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  counts?: { components: number; sections: number; flows: number };
  tab?: TemplateEditorTab;
  onTabChange?: (tab: TemplateEditorTab) => void;
  metadata: ReactNode;
  panels?: Partial<Record<TemplateEditorTab, ReactNode>>;
  inspectorPreview?: ReactNode;
  placeholder?: string;
  tabs?: TemplateEditorTabSpec[];
  railHint?: string;
}) {
  const [internalTab, setInternalTab] = useState<TemplateEditorTab>('metadata');
  const tab = controlledTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;

  const tabCounts: Partial<Record<TemplateEditorTab, number>> = counts
    ? { diagram: counts.components, flows: counts.flows, add: counts.sections }
    : {};

  const mainContent = tab === 'metadata'
    ? metadata
    : (panels?.[tab] ?? <div className="empty">{placeholder}</div>);

  const fullBleed = tab === 'preview' || tab === 'diagram';
  const bleedTitle = tab === 'diagram' ? 'Diagram' : 'Preview';
  const bleedSubtitle = tab === 'diagram'
    ? `${title} — architecture canvas`
    : `${title} — rendered ADD export`;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <nav className="content-rail" aria-label="Template editor">
        <div className="sect-label">Template</div>
        {tabs.map(item => {
          const n = tabCounts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={`railitem${tab === item.id ? ' on' : ''}`}
              aria-current={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
              {n !== undefined && <em>{n}</em>}
            </button>
          );
        })}
        <div className="hint" style={{ marginTop: 14 }}>
          {railHint}
        </div>
      </nav>

      <div className="editor-body" style={{ flex: 1 }}>
        <div
          className="content-main"
          style={fullBleed ? {
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            padding: 0,
            overflow: 'hidden',
          } : undefined}
        >
          <div
            className="cpanel"
            style={fullBleed ? {
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              maxWidth: 'none',
              margin: 0,
              width: '100%',
            } : undefined}
          >
            {!fullBleed && (
              <div className="cpanel-head">
                <div>
                  <h2>{title}</h2>
                  {subtitle && <p>{subtitle}</p>}
                </div>
                <div className="cpanel-actions">
                  {badge}
                  {actions}
                </div>
              </div>
            )}
            <div style={fullBleed ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
              {fullBleed ? (
                <>
                  <div className="cpanel-head" style={{ flexShrink: 0, padding: '16px 20px 0' }}>
                    <div>
                      <h2>{bleedTitle}</h2>
                      <p>{bleedSubtitle}</p>
                    </div>
                    <div className="cpanel-actions">
                      {badge}
                      {actions}
                    </div>
                  </div>
                  <div className={tab === 'diagram' ? 'diagram-tab-body' : 'preview-tab-body'}>
                    {mainContent}
                  </div>
                </>
              ) : mainContent}
            </div>
          </div>
        </div>

        {!fullBleed && (
          <aside className="inspector">
            <div className="sub mono">{templateId}</div>
            <h3>Preview</h3>
            {inspectorPreview ?? (
              <p className="hint" style={{ marginBottom: 16 }}>
                Open the Preview tab for the full paper render.
              </p>
            )}
            {counts ? (
              <div className="cgroup">
                <div className="sect-label">Outline</div>
                <div className="field">
                  <span>Components</span>
                  <div className="mono">{counts.components}</div>
                </div>
                <div className="field">
                  <span>Flows</span>
                  <div className="mono">{counts.flows}</div>
                </div>
                <div className="field">
                  <span>Sections</span>
                  <div className="mono">{counts.sections}</div>
                </div>
              </div>
            ) : (
              <div className="empty">No outline loaded.</div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
