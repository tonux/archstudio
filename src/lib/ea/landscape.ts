/* The application landscape, generated.
 *
 * The best reuse in the whole roadmap, and it is almost free: an application
 * landscape *is* the banded diagram this app has always drawn, with the layers
 * renamed. Domains are the bands, applications are the cards, and the edges are
 * the cross-project dependency graph that phase 4 already derives from drawings
 * somebody made months ago.
 *
 * So this produces an ordinary `Architecture` — exactly what
 * `templates/instantiate()` produces — and everything downstream is unchanged:
 * the canvas draws it, the SVG exports it, the printable document prints it,
 * ArchiMate exports it, and the referential citations are already on every card
 * so the analysis screen can answer questions about it.
 *
 * A snapshot, not a live view. It is a project like any other from the moment
 * it is created, and someone will move a card. That is the right trade: a
 * regenerated view nobody can annotate is a view nobody uses.
 */
import { blankArchitecture, slugify } from '../defaults';
import { buildGraph } from './graph';
import { listEntities, listRelations } from './repository';
import type { Architecture, Component, Layer, Group } from '../types';
import type { ComponentEa, ImprintEntity } from './types';

/** One band per domain, or one band for everything when no domain is declared.
 *
 *  Ownership is what a landscape is read by — "whose applications are these" —
 *  and it is the axis the drawing can afford, since scope is already spoken for
 *  by colour. An application with no owning domain lands in "Unassigned",
 *  which is a finding rather than a tidy-up. */
const UNASSIGNED = 'unassigned';

export function buildLandscape(name = 'Application landscape'): Architecture {
  const doc = blankArchitecture(name);
  doc.meta.tagline = 'Generated from the referential';
  doc.meta.intro =
    'Every application in the referential, banded by the domain that owns it, '
    + 'with the dependencies your project diagrams already draw between them. '
    + 'A snapshot: edit it like any other project.';

  const entities = listEntities();
  const apps = entities.filter(e => e.kind === 'application');
  if (!apps.length) return doc;

  const graph = buildGraph();

  /* Which domain owns each application: an `assigned-to` relationship pointing
   * at a domain. Actors are owners too, but a person is not a band. */
  const domains = new Map(entities.filter(e => e.kind === 'domain').map(e => [e.id, e]));
  const ownerOf = new Map<string, string>();
  for (const rel of listRelations()) {
    if (rel.kind !== 'assigned-to' || !domains.has(rel.to)) continue;
    ownerOf.set(rel.from, rel.to);
  }

  /* Bands, in the referential's own order, and only the ones that hold
   * something — an empty band is a row of nothing on a tall sheet. */
  const used = new Set([...apps.map(a => ownerOf.get(a.id) ?? UNASSIGNED)]);
  const layers: Layer[] = [...domains.values()]
    .filter(d => used.has(d.id))
    .map(d => ({ id: d.id, name: d.name, ...(d.description ? { desc: d.description } : {}) }));
  if (used.has(UNASSIGNED)) {
    layers.push({ id: UNASSIGNED, name: 'Unassigned', desc: 'No domain owns these yet' });
  }
  doc.layers = layers;

  /* Colour carries whether an application is drawn anywhere. That is the one
   * distinction a landscape most needs and the diagrams cannot show: an
   * application nobody has drawn is either new or forgotten, and the map should
   * not make it look like the rest. */
  const groups: Group[] = [
    { id: 'drawn', name: 'Drawn somewhere', short: 'Drawn' },
    { id: 'undrawn', name: 'Not drawn yet', short: 'Undrawn' }
  ];
  doc.groups = groups;

  const imprint: ImprintEntity[] = [];
  /* referential id → the local component id in this document, and back. Both
   * directions are needed and both are built once: the edges below are keyed
   * by entity and the cards by component. */
  const localOf = new Map<string, string>();
  const entityOf = new Map<string, string>();
  const taken: string[] = [];

  doc.components = apps.map(app => {
    const id = slugify(app.code || app.name, taken);
    taken.push(id);
    localOf.set(app.id, id);
    entityOf.set(id, app.id);

    imprint.push({
      id: app.id, kind: 'application', name: app.name,
      ...(app.code ? { code: app.code } : {})
    });

    const node = graph.nodes.get(app.id);
    const drawn = (node?.drawnIn.size ?? 0) > 0;
    const ea: ComponentEa = { app: app.id };

    const c: Component = {
      id, name: app.name,
      group: drawn ? 'drawn' : 'undrawn',
      layer: ownerOf.get(app.id) ?? UNASSIGNED,
      icon: 'cube',
      ...(app.code ? { badge: app.code } : {}),
      ...(app.description ? { role: app.description } : {}),
      tech: [], features: [], notes: [], deps: [],
      ea
    };
    if (!drawn) c.notes = ['No project diagram draws this application.'];
    return c;
  });

  /* The edges, straight from the cross-project graph. Nothing new is authored:
   * a dependency between two applications is one somebody drew between two
   * components months ago, in a project that knew nothing about this map. */
  doc.components = doc.components.map(c => {
    const entity = entityOf.get(c.id);
    if (!entity) return c;
    const deps = (graph.out.get(entity) || [])
      .map(e => localOf.get(e.to))
      .filter((x): x is string => !!x && x !== c.id);
    return { ...c, deps: [...new Set(deps)] };
  });

  doc.imprint = { takenAt: new Date().toISOString().slice(0, 10), entities: imprint };

  /* The capability map and the coverage table, ready to print. A landscape
   * without them is a picture; with them it is the two findings a committee
   * actually acts on. */
  doc.sections = [
    {
      id: 'capability-map', tab: 'Capabilities', type: 'capability-map',
      title: 'Capability map', roots: [],
      doc: { chapter: '2.8' }, computed: { query: 'capability-map' }
    },
    {
      id: 'coverage', tab: 'Coverage', type: 'table',
      title: 'Capability coverage', columns: [], rows: [],
      doc: { chapter: '2.9' }, computed: { query: 'coverage' }
    }
  ] as never;

  return doc;
}
