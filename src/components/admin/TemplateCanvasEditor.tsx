'use client';

import { CardList, Group, IconPicker, Panel, Text } from '@/components/editors/Fields';
import { PALETTE, PALETTE_DARK, slugify } from '@/lib/defaults';
import { displayLayerLabel } from '@/lib/layers';
import type { Architecture, Component, Group as Scope, Layer } from '@/lib/types';

type Patch = (fn: (d: Architecture) => Architecture) => void;

export function TemplateCanvasEditor({ doc, patch, readOnly }: { doc: Architecture; patch: Patch; readOnly?: boolean }) {
  const noop = () => {};
  const p = readOnly ? ((_fn: (d: Architecture) => Architecture) => noop()) as Patch : patch;

  return (
    <Panel title="Canvas"
      subtitle="Scopes, layers and components — the architecture diagram skeleton.">

      <Group title={`Scopes (${doc.groups.length})`}>
        <CardList<Scope>
          items={doc.groups}
          onChange={next => p(d => { d.groups = next; return d; })}
          addLabel="Add scope"
          empty="No scope yet."
          blank={() => {
            const i = doc.groups.length;
            const name = `Scope ${i + 1}`;
            return {
              id: slugify(name, doc.groups.map(g => g.id)),
              name,
              short: name,
              color: PALETTE[i % PALETTE.length],
              colorDark: PALETTE_DARK[i % PALETTE_DARK.length],
            };
          }}
          summary={g => g.name}
          render={(g, set) => (
            <>
              <div className="frow">
                <Text label="Name" value={g.name}
                  onChange={v => set(x => { x.name = v; x.short = v; })} />
                <label className="field"><span>Colour</span>
                  <input type="color" className="swatch" value={g.color || PALETTE[0]}
                    disabled={readOnly}
                    onChange={e => set(x => { x.color = e.target.value; })} />
                </label>
              </div>
            </>
          )}
        />
      </Group>

      <Group title={`Layers (${doc.layers.length})`}>
        <CardList<Layer>
          items={doc.layers}
          onChange={next => p(d => { d.layers = next; return d; })}
          addLabel="Add layer"
          empty="No layer yet."
          blank={() => {
            const name = `Layer ${doc.layers.length + 1}`;
            return { id: slugify(name, doc.layers.map(l => l.id)), name };
          }}
          summary={l => displayLayerLabel(l.name === l.id ? l.id : l.name)}
          render={(l, set) => (
            <Text label="Name" value={l.name}
              onChange={v => set(x => { x.name = v; })} />
          )}
        />
      </Group>

      <Group title={`Components (${doc.components.length})`}>
        <CardList<Component>
          items={doc.components}
          onChange={next => p(d => { d.components = next; return d; })}
          addLabel="Add component"
          empty="No component yet."
          blank={() => {
            const name = `Component ${doc.components.length + 1}`;
            const group = doc.groups[0]?.id ?? 'core';
            const layer = doc.layers[0]?.id ?? 'services';
            return {
              id: slugify(name, doc.components.map(c => c.id)),
              name,
              group,
              layer,
              icon: 'box',
            };
          }}
          summary={c => c.name}
          badge={c => <span className="count mono">{c.id}</span>}
          render={(c, set) => (
            <>
              <Text label="Name" value={c.name} onChange={v => set(x => { x.name = v; })} />
              <div className="frow">
                <label className="field"><span>Scope</span>
                  <select className="select" value={c.group} disabled={readOnly}
                    onChange={e => set(x => { x.group = e.target.value; })}>
                    {doc.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>Layer</span>
                  <select className="select" value={c.layer} disabled={readOnly}
                    onChange={e => set(x => { x.layer = e.target.value; })}>
                    {doc.layers.map(l => (
                      <option key={l.id} value={l.id}>{displayLayerLabel(l.name === l.id ? l.id : l.name)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <IconPicker label="Icon" value={c.icon || 'box'}
                onChange={v => set(x => { x.icon = v; })} />
              <Text label="Role" value={c.role || ''}
                onChange={v => set(x => { x.role = v || undefined; })} />
            </>
          )}
        />
      </Group>
    </Panel>
  );
}
