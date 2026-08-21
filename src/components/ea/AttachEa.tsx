'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { entityPath, imprintIndex } from '@/lib/ea/imprint';
import { ENTITY_LABELS, type EntitySummary } from '@/lib/ea/types';
import type { Architecture, Component } from '@/lib/types';

/* Attaching a component to the referential, from the inspector.
 *
 * The catalog is fetched once and only when this section is opened: most
 * editing sessions never touch the referential, and a request on every
 * selection would be a cost paid by everyone for a feature used by some.
 *
 * What is *shown* comes from the document's own imprint, not from the fetched
 * catalog — the same source the exported HTML will read. Anything else and the
 * inspector could show a name the export cannot.
 */

type Patch = (fn: (c: Component) => void) => void;

export function AttachEa({ doc, comp, set }: {
  doc: Architecture; comp: Component; set: Patch;
}) {
  const [catalog, setCatalog] = useState<EntitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.json<{ entities: EntitySummary[] }>('/api/ea/entities')
      .then(r => { if (alive) setCatalog(r.entities); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  const index = imprintIndex(doc);
  const ea = comp.ea;

  /* Two sources, merged: what the referential has now, plus whatever this
     document already cites. An entity someone deleted from the referential is
     still in the imprint, and the picker has to keep showing it — otherwise the
     field looks empty while the document says otherwise. */
  const options = (kind: string) => {
    const live = (catalog || []).filter(e => e.kind === kind);
    const known = new Set(live.map(e => e.id));
    const stale = [...index.values()]
      .filter(e => e.kind === kind && !known.has(e.id))
      .map(e => ({ ...e, usedBy: 0, description: undefined } as EntitySummary));
    return [...live, ...stale];
  };

  const label = (e: { id: string; name: string; code?: string }) =>
    (index.has(e.id) ? entityPath(index, e.id) : e.name) + (e.code ? ` · ${e.code}` : '');

  const setOne = (key: 'app' | 'owner', value: string, entity?: EntitySummary) =>
    set(c => {
      const next = { ...(c.ea || {}) };
      if (value) next[key] = value; else delete next[key];
      c.ea = Object.keys(next).length ? next : undefined;
      /* Writing the imprint entry here rather than waiting for the server keeps
         the editor showing the right name straight away. The next save
         overwrites it with whatever the referential says, which is the
         authority — this is only the optimistic half. */
      if (value && entity) rememberInImprint(doc, entity);
    });

  const toggleMany = (key: 'capabilities' | 'objects', id: string, entity?: EntitySummary) =>
    set(c => {
      const next = { ...(c.ea || {}) };
      const list = new Set(next[key] || []);
      if (list.has(id)) list.delete(id); else { list.add(id); if (entity) rememberInImprint(doc, entity); }
      if (list.size) next[key] = [...list]; else delete next[key];
      c.ea = Object.keys(next).length ? next : undefined;
    });

  if (error) return <div className="hint">Referential unavailable — {error}</div>;

  const one = (key: 'app' | 'owner', title: string, kind: string) => {
    const list = options(kind);
    return (
      <label className="field"><span>{title}</span>
        <select className="select" value={ea?.[key] || ''}
          onChange={e => setOne(key, e.target.value, list.find(x => x.id === e.target.value))}>
          <option value="">none</option>
          {list.map(e => <option key={e.id} value={e.id}>{label(e)}</option>)}
        </select>
      </label>
    );
  };

  const many = (key: 'capabilities' | 'objects', title: string, kind: string) => {
    const list = options(kind);
    const on = new Set(ea?.[key] || []);
    if (!list.length) return null;
    return (
      <div className="field">
        <span>{title}</span>
        <div className="chiprow">
          {list.map(e => (
            <button key={e.id} className="chip" aria-pressed={on.has(e.id)}
              onClick={() => toggleMany(key, e.id, e)}>{label(e)}</button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {!catalog && <div className="hint">Loading the referential…</div>}
      {one('app', ENTITY_LABELS.application, 'application')}
      {many('capabilities', 'Capabilities', 'capability')}
      {one('owner', ENTITY_LABELS.actor, 'actor')}
      {many('objects', 'Business objects', 'business-object')}
      <div className="hint">
        Attached here, resolved from the document&rsquo;s own copy — so an exported
        HTML file names them offline, with no referential in reach.
      </div>
    </>
  );
}

/** Put an entity into the document's imprint if it is not there yet.
 *
 *  Optimistic only. The server rewrites the whole imprint from the referential
 *  on every save, so anything wrong here is corrected within one autosave — but
 *  without it the newly picked entity would render as its id until then, which
 *  looks broken. */
function rememberInImprint(doc: Architecture, entity: EntitySummary): void {
  const imprint = doc.imprint || { entities: [] };
  if (imprint.entities.some(e => e.id === entity.id)) return;
  doc.imprint = {
    ...imprint,
    entities: [...imprint.entities, {
      id: entity.id, kind: entity.kind, name: entity.name,
      ...(entity.code ? { code: entity.code } : {}),
      ...(entity.parent ? { parent: entity.parent } : {})
    }].sort((a, b) => a.id.localeCompare(b.id))
  };
}
