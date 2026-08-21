/* The five questions.
 *
 * These are the ones a company buys an enterprise architecture tool for, and
 * until the referential existed none of them had an answer that did not begin
 * with "open every diagram and look":
 *
 *   1. If I decommission this, who breaks?
 *   2. Which applications carry this capability?
 *   3. Where is a capability carried by nobody, or by seven things at once?
 *   4. Who is still on a technology we decided to leave?
 *   5. What has nobody filled in?
 *
 * Every one returns a table — columns and rows — for a reason that is not
 * laziness. The answers have to leave: a standalone HTML file cannot carry a
 * query engine, so a question is resolved on the server at export time and
 * lands in the document as an ordinary table, frozen and dated. A reader six
 * months later gets the answer as it stood, which is the correct semantics for
 * a deliverable and impossible with a live query.
 */
import { db } from '../db';
import { buildGraph, walkDependents, type Graph } from './graph';
import type { EntityKind, StandardStatus } from './types';

export interface QueryResult {
  /** A sentence, not a title: what this table is asserting. */
  title: string;
  columns: string[];
  rows: string[][];
  /** Shown under the table when there is nothing to show. An empty result is
   *  usually the good news, and "no rows" does not say which. */
  empty: string;
  /** Anything the reader needs in order to trust the numbers. */
  note?: string;
}

export const QUERIES = [
  'dependents', 'capability', 'coverage', 'standard', 'orphans'
] as const;
export type QueryName = (typeof QUERIES)[number];

export const isQueryName = (v: unknown): v is QueryName =>
  typeof v === 'string' && (QUERIES as readonly string[]).includes(v);

export const QUERY_LABELS: Record<QueryName, string> = {
  dependents: 'Impact of decommissioning',
  capability: 'Applications carrying a capability',
  coverage: 'Capability coverage',
  standard: 'Who still uses a technology',
  orphans: 'What nobody filled in'
};

export const QUERY_BLURBS: Record<QueryName, string> = {
  dependents: 'Everything that would feel it if one application stopped answering, and how far away it is.',
  capability: 'Which applications carry a capability — including everything under it in the tree.',
  coverage: 'Where a capability is carried by nobody, and where several applications carry the same one.',
  standard: 'Applications and components still on a given technology, wherever they are drawn.',
  orphans: 'Components with no application, applications with no capability, entities nobody cites.'
};

/** Whether a query needs a subject, and of which kind. */
export const QUERY_SUBJECT: Record<QueryName, EntityKind | null> = {
  dependents: 'application',
  capability: 'capability',
  coverage: null,
  standard: 'technology-standard',
  orphans: null
};

const name = (graph: Graph, id: string) => graph.entities.get(id)?.name ?? id;
const code = (graph: Graph, id: string) => graph.entities.get(id)?.code ?? '';

/* ------------------------------------------------------------- 1. impact */

export function dependents(graph: Graph, id: string): QueryResult {
  const subject = graph.entities.get(id);
  const found = walkDependents(graph, id);

  return {
    title: `If ${subject?.name ?? id} stopped answering`,
    columns: ['Application', 'Code', 'Hops away', 'Through'],
    rows: found
      .sort((a, b) => a.depth - b.depth || name(graph, a.id).localeCompare(name(graph, b.id)))
      .map(r => [
        name(graph, r.id),
        code(graph, r.id),
        String(r.depth),
        /* The path is read the way the impact travels: from the thing that
         * breaks, back to the thing that broke. */
        r.path.slice().reverse().map(x => name(graph, x)).join(' → ')
      ]),
    empty: 'Nothing depends on it. Either it is a leaf, or nobody has drawn what calls it.',
    note: 'Derived from the dependencies drawn in every project, plus any "serves" '
      + 'relationship declared in the referential.'
  };
}

/* --------------------------------------------------------- 2. capability */

/** A capability and everything under it. The question is almost never about one
 *  leaf: "who carries Sales" means Sales and all of its children. */
function subtree(rootId: string): Set<string> {
  const all = db.prepare('SELECT id, parent_id FROM ea_entities').all() as
    { id: string; parent_id: string | null }[];
  const children = new Map<string, string[]>();
  all.forEach(r => {
    if (r.parent_id) children.set(r.parent_id, [...(children.get(r.parent_id) || []), r.id]);
  });

  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const child of children.get(stack.pop()!) || []) {
      if (out.has(child)) continue;   // a cycle cannot be stored, but a hand-edited row could
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

/** Application id → the capabilities it carries.
 *
 *  Two sources, both real. A `realizes` relationship is somebody's assertion in
 *  the referential; a component citing an application *and* a capability in the
 *  same breath is the same claim, made by whoever drew the diagram. Most
 *  installs will have far more of the second than the first, which is why both
 *  count. */
function realizations(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (app: string, cap: string) => {
    if (!out.has(app)) out.set(app, new Set());
    out.get(app)!.add(cap);
  };

  const declared = db.prepare("SELECT from_id, to_id FROM ea_relations WHERE kind = 'realizes'")
    .all() as { from_id: string; to_id: string }[];
  declared.forEach(r => add(r.from_id, r.to_id));

  /* Straight from the index: a component that cites an application and a
   * capability says the one carries the other. */
  const drawn = db.prepare(`
    SELECT a.entity_id AS app, c.entity_id AS cap
    FROM project_entity_links a
    JOIN project_entity_links c
      ON c.project_id = a.project_id AND c.component_id = a.component_id
    WHERE a.role = 'app' AND c.role = 'capability'
  `).all() as { app: string; cap: string }[];
  drawn.forEach(r => add(r.app, r.cap));

  return out;
}

export function applicationsForCapability(graph: Graph, id: string): QueryResult {
  const wanted = subtree(id);
  const by = realizations();
  const subject = graph.entities.get(id);

  const rows: string[][] = [];
  for (const [app, caps] of by) {
    const hit = [...caps].filter(c => wanted.has(c));
    if (!hit.length) continue;
    const node = graph.entities.get(app);
    if (!node) continue;
    rows.push([
      node.name,
      node.code ?? '',
      hit.map(c => name(graph, c)).sort().join(', '),
      String(node.drawnIn.size)
    ]);
  }

  return {
    title: `Applications carrying ${subject?.name ?? id}`,
    columns: ['Application', 'Code', 'Capability', 'Drawn in'],
    rows: rows.sort((a, b) => a[0].localeCompare(b[0])),
    empty: 'No application carries it. That is either a gap or a capability nobody has mapped yet.',
    note: wanted.size > 1
      ? `Includes the ${wanted.size - 1} capabilities under it.`
      : undefined
  };
}

/* ----------------------------------------------------------- 3. coverage */

export function capabilityCoverage(graph: Graph): QueryResult {
  const by = realizations();
  const perCapability = new Map<string, string[]>();
  for (const [app, caps] of by) {
    for (const cap of caps) perCapability.set(cap, [...(perCapability.get(cap) || []), app]);
  }

  const caps = [...graph.entities.values()].filter(e => e.kind === 'capability');
  const rows = caps.map(cap => {
    const apps = perCapability.get(cap.id) || [];
    /* Three is the line, and it is a judgement rather than a measurement: two
     * applications on one capability is usually a front and a back, three is
     * usually a conversation nobody has had. The reader gets the count either
     * way and can disagree. */
    const verdict = apps.length === 0 ? 'Nobody' : apps.length >= 3 ? 'Overlap' : '';
    return [
      cap.name,
      String(apps.length),
      verdict,
      apps.map(a => name(graph, a)).sort().join(', ')
    ];
  });

  return {
    title: 'Capability coverage',
    columns: ['Capability', 'Applications', 'Flag', 'Which'],
    rows: rows.sort((a, b) => Number(a[1]) - Number(b[1]) || a[0].localeCompare(b[0])),
    empty: 'No capabilities in the referential yet.',
    note: 'Carried by nobody is a gap; three or more is worth a conversation.'
  };
}

/* ----------------------------------------------------------- 4. standard */

export function standardUsage(graph: Graph, id: string): QueryResult {
  const subject = graph.entities.get(id);
  const label = subject?.name ?? id;
  const rows: string[][] = [];

  /* Declared: an application the referential says uses this. */
  const declared = db.prepare(
    "SELECT from_id FROM ea_relations WHERE kind = 'uses-standard' AND to_id = ?"
  ).all(id) as { from_id: string }[];
  for (const r of declared) {
    const node = graph.entities.get(r.from_id);
    if (node) rows.push([node.name, node.code ?? '', 'declared', '']);
  }

  /* Drawn: a component whose technology list names it. This is where the data
   * actually is in an install that has been drawing diagrams for a year and has
   * declared nothing — and it is why this query is worth having on day one.
   *
   * Matched on a trimmed, case-folded name and nothing looser. The same rule as
   * the ArchiMate export: a fuzzy match here would report an application as
   * being on a technology it is not, which is the sort of finding that gets a
   * tool thrown out. */
  const wanted = label.trim().toLowerCase();
  const docs = db.prepare('SELECT id, name, data FROM projects').all() as
    { id: string; name: string; data: string }[];
  const seen = new Set(rows.map(r => r[0]));

  for (const p of docs) {
    let doc;
    try { doc = JSON.parse(p.data); } catch { continue; }
    for (const c of doc.components || []) {
      if (!(c.tech || []).some((t: string) => t.trim().toLowerCase() === wanted)) continue;
      const appId = c.ea?.app as string | undefined;
      const app = appId ? graph.entities.get(appId) : undefined;
      const who = app?.name ?? '(no application)';
      const key = `${who}${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([who, app?.code ?? '', `drawn · ${p.name}`, c.name]);
    }
  }

  return {
    title: `Still on ${label}${subject?.status ? ` (${subject.status})` : ''}`,
    columns: ['Application', 'Code', 'Evidence', 'Component'],
    rows: rows.sort((a, b) => a[0].localeCompare(b[0]) || a[3].localeCompare(b[3])),
    empty: `Nothing is on ${label}.`,
    note: 'Declared comes from the referential; drawn comes from a component naming it '
      + 'in its technologies, matched exactly.'
  };
}

/** Every standard with a decision that makes it worth chasing. */
export function retiringStandards(): { id: string; name: string; status: StandardStatus }[] {
  return db.prepare(
    "SELECT id, name, status FROM ea_entities WHERE kind = 'technology-standard' "
    + "AND status IN ('retire', 'hold') ORDER BY status, name"
  ).all() as { id: string; name: string; status: StandardStatus }[];
}

/* ------------------------------------------------------------ 5. orphans */

export function orphans(graph: Graph): QueryResult {
  const rows: string[][] = [];
  const by = realizations();

  /* An entity in the referential that no document cites. Not automatically
   * wrong — it may be new — but it is the list to read before believing a
   * coverage number. */
  const cited = new Set(
    (db.prepare('SELECT DISTINCT entity_id FROM project_entity_links').all() as
      { entity_id: string }[]).map(r => r.entity_id)
  );
  for (const e of graph.entities.values()) {
    if (!cited.has(e.id)) rows.push([e.kind, e.name, 'Cited by no project']);
  }

  /* An application nobody says carries anything. */
  for (const app of graph.nodes.values()) {
    if (!by.get(app.id)?.size) rows.push(['application', app.name, 'Carries no capability']);
  }

  /* An application with no owner, from either source. */
  const owned = new Set([
    ...(db.prepare("SELECT from_id FROM ea_relations WHERE kind = 'assigned-to'").all() as
      { from_id: string }[]).map(r => r.from_id),
    ...(db.prepare(`
      SELECT DISTINCT a.entity_id AS id FROM project_entity_links a
      JOIN project_entity_links o
        ON o.project_id = a.project_id AND o.component_id = a.component_id
      WHERE a.role = 'app' AND o.role = 'owner'
    `).all() as { id: string }[]).map(r => r.id)
  ]);
  for (const app of graph.nodes.values()) {
    if (!owned.has(app.id)) rows.push(['application', app.name, 'Has no owner']);
  }

  /* A component drawn in a project that belongs to no application. On a
   * landscape that is a finding; on a solution diagram it is normal, so the
   * count is reported per project rather than per component. */
  const docs = db.prepare('SELECT id, name, data FROM projects').all() as
    { id: string; name: string; data: string }[];
  for (const p of docs) {
    let doc;
    try { doc = JSON.parse(p.data); } catch { continue; }
    const total = (doc.components || []).length;
    const unmapped = (doc.components || []).filter((c: { ea?: { app?: string } }) => !c.ea?.app).length;
    if (unmapped && total) {
      rows.push(['project', p.name, `${unmapped} of ${total} components map to no application`]);
    }
  }

  return {
    title: 'What nobody filled in',
    columns: ['Kind', 'Name', 'Gap'],
    rows: rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
    empty: 'Nothing missing. Either the referential is complete, or it is empty.',
    note: 'A gap is not automatically a mistake. It is the list to read before trusting '
      + 'any of the other four.'
  };
}

/* ------------------------------------------------------------- dispatch */

/** Run one query by name. The single entry point the route and the export both
 *  use, so a computed section and a screen can never drift apart. */
export function runQuery(query: QueryName, subject?: string, graph?: Graph): QueryResult {
  const g = graph ?? buildGraph();
  switch (query) {
    case 'dependents':
      return subject ? dependents(g, subject) : needsSubject('an application');
    case 'capability':
      return subject ? applicationsForCapability(g, subject) : needsSubject('a capability');
    case 'coverage':
      return capabilityCoverage(g);
    case 'standard':
      return subject ? standardUsage(g, subject) : needsSubject('a technology standard');
    case 'orphans':
      return orphans(g);
  }
}

const needsSubject = (what: string): QueryResult => ({
  title: 'Nothing chosen',
  columns: [], rows: [],
  empty: `Choose ${what} first.`
});
