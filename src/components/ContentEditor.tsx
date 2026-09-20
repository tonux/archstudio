'use client';

/* The half of the document the canvas cannot express: the opening page, the
 * navigation, the flows, the stack table and the editorial sections. Same
 * `patch` as the diagram, same autosave — only a wider surface to type into. */

import { useState } from 'react';
import { Icon } from './Icon';
import DocumentEditor from './editors/DocumentEditor';
import TabsEditor from './editors/TabsEditor';
import FlowsEditor from './editors/FlowsEditor';
import StackEditor from './editors/StackEditor';
import SectionsEditor from './editors/SectionsEditor';
import MotivationEditor from './editors/MotivationEditor';
import { tabRows } from '@/lib/tabs';
import type { LegoCatalogSnapshot } from '@/lib/lego/types';
import type { Notify } from '@/lib/undo';
import type { Architecture } from '@/lib/types';

type Patch = (fn: (d: Architecture) => Architecture) => void;
type PanelId = 'document' | 'tabs' | 'flows' | 'stack' | 'motivation' | 'sections';

const PANELS: { id: PanelId; label: string; icon: string; count?: (d: Architecture) => number }[] = [
  { id: 'document', label: 'Document', icon: 'home' },
  { id: 'tabs',     label: 'Tabs',     icon: 'grid',   count: d => tabRows(d).filter(t => t.visible).length },
  { id: 'flows',    label: 'Flows',    icon: 'route',  count: d => d.flows.length },
  { id: 'stack',    label: 'Tech stack', icon: 'layers', count: d => d.technologies.length },
  /* Between the content and the sections that print it: motivation is authored
     like content, and reaches the page through a section like everything else. */
  { id: 'motivation', label: 'Why',   icon: 'flag',   count: d => d.motivation?.items.length ?? 0 },
  { id: 'sections', label: 'Sections', icon: 'folder', count: d => d.sections.length }
];

export default function ContentEditor({ doc, patch, catalog, notify }: {
  doc: Architecture; patch: Patch; catalog: LegoCatalogSnapshot | null; notify: Notify;
}) {
  const [panel, setPanel] = useState<PanelId>('document');

  return (
    <div className="content-body">
      <nav className="content-rail">
        <div className="sect-label">Content</div>
        {PANELS.map(p => {
          const n = p.count?.(doc);
          return (
            <button key={p.id} className={`railitem${panel === p.id ? ' on' : ''}`}
              onClick={() => setPanel(p.id)} aria-current={panel === p.id}>
              <Icon name={p.icon} size={15} />
              <span>{p.label}</span>
              {n !== undefined && <em>{n}</em>}
            </button>
          );
        })}
        <div className="hint" style={{ marginTop: 14 }}>
          The diagram — components, layers and scopes — lives in the Diagram tab.
        </div>
      </nav>

      <div className="content-main">
        {panel === 'document' && <DocumentEditor doc={doc} patch={patch} />}
        {panel === 'tabs' && <TabsEditor doc={doc} patch={patch} />}
        {panel === 'flows' && <FlowsEditor doc={doc} patch={patch} catalog={catalog} />}
        {panel === 'stack' && <StackEditor doc={doc} patch={patch} />}
        {panel === 'motivation' && <MotivationEditor doc={doc} patch={patch} />}
        {panel === 'sections' && <SectionsEditor doc={doc} patch={patch} notify={notify} />}
      </div>
    </div>
  );
}
