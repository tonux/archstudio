/* Reading the capability tree out of the referential.
 *
 * Server-side, and separated from the layout in `src/lib/views/capability-map.ts`
 * for a reason worth stating: the printable document renders in the browser and
 * needs the *column rule*, and if that rule lived beside this query the client
 * bundle would try to pull `node:sqlite` in behind it. The split is not
 * tidiness — it is the boundary between what reads the database and what only
 * reads a tree.
 *
 * The number on each box is what makes the map an analysis rather than a
 * picture. A capability carried by nobody is a gap; one carried by seven
 * applications is a conversation. Without the count it is an org chart.
 */
import { db } from '../db';
import type { CapabilityNode } from '../types';

interface Row { id: string; name: string; code: string | null; parent_id: string | null }

/** Build the tree, with a count per box.
 *
 *  `rootId` narrows it to one subtree — useful when a document is about one
 *  domain and the whole map would be noise.
 *
 *  Server-side: it reads the referential. The result is frozen into the section
 *  at export, which is what lets the map draw offline. */
export function capabilityTree(rootId?: string): CapabilityNode[] {
  const rows = db.prepare(
    "SELECT id, name, code, parent_id FROM ea_entities WHERE kind = 'capability' ORDER BY name COLLATE NOCASE"
  ).all() as unknown as Row[];
  if (!rows.length) return [];

  /* Applications carrying each capability, from both sources — the same two the
   * coverage query trusts: a declared `realizes` relationship, and a component
   * that cites an application and a capability in the same breath. */
  const carried = new Map<string, Set<string>>();
  const add = (cap: string, app: string) => {
    if (!carried.has(cap)) carried.set(cap, new Set());
    carried.get(cap)!.add(app);
  };
  (db.prepare("SELECT from_id, to_id FROM ea_relations WHERE kind = 'realizes'").all() as
    { from_id: string; to_id: string }[]).forEach(r => add(r.to_id, r.from_id));
  (db.prepare(`
    SELECT a.entity_id AS app, c.entity_id AS cap
    FROM project_entity_links a
    JOIN project_entity_links c
      ON c.project_id = a.project_id AND c.component_id = a.component_id
    WHERE a.role = 'app' AND c.role = 'capability'
  `).all() as { app: string; cap: string }[]).forEach(r => add(r.cap, r.app));

  const children = new Map<string, Row[]>();
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const r of rows) {
    const key = r.parent_id && byId.has(r.parent_id) ? r.parent_id : '';
    children.set(key, [...(children.get(key) || []), r]);
  }

  /* A count is inclusive of the subtree, and counts each application once
   * however many boxes under it name that application. "Seven applications
   * carry Sales" has to mean seven applications, not seven mentions. */
  const seen = new Set<string>();
  const build = (row: Row): { node: CapabilityNode; apps: Set<string> } => {
    if (seen.has(row.id)) {
      /* A cycle cannot be stored — `wouldCycle` refuses it — but a hand-edited
       * row could still carry one, and this walk must terminate either way. */
      return { node: { name: row.name, children: [] }, apps: new Set() };
    }
    seen.add(row.id);

    const kids = (children.get(row.id) || []).map(build);
    const apps = new Set<string>(carried.get(row.id) || []);
    kids.forEach(k => k.apps.forEach(a => apps.add(a)));

    const node: CapabilityNode = { name: row.name, children: kids.map(k => k.node) };
    if (row.code) node.code = row.code;
    node.count = apps.size;
    return { node, apps };
  };

  if (rootId) {
    const root = byId.get(rootId);
    return root ? [build(root).node] : [];
  }
  return (children.get('') || []).map(r => build(r).node);
}
