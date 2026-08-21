/* Where the referential and the drawings disagree with the rules this
 * organisation set itself.
 *
 * Every rule here is one somebody could have written on a whiteboard, and every
 * finding names **who can act on it**. A compliance report that lists two
 * hundred violations and no owners is a report that gets filed; the owner is
 * what turns it into work.
 *
 * The rules are not configurable, and that is a decision rather than a gap. Six
 * rules everybody understands beat a rule engine nobody configures — and each
 * of these is derived from data the app already has, so none of them can be
 * true-but-unmeasurable.
 *
 * A finding is not automatically a mistake. A brand-new application has no
 * owner yet and that is fine; the report's job is to make it visible, not to
 * pass judgement. Hence `severity`, and hence the note at the bottom of it.
 */
import { db } from '../db';
import { buildGraph, type Graph } from './graph';
import type { Architecture } from '../types';

export type Severity = 'gap' | 'risk';

export interface Rule {
  id: string;
  title: string;
  /** What the rule asks for, in the words somebody would use in a meeting. */
  says: string;
  severity: Severity;
}

export interface Finding {
  rule: string;
  subject: string;
  detail: string;
  /** Who can act on it. "Nobody" is itself a finding, and says so. */
  owner: string;
  severity: Severity;
}

export const RULES: Rule[] = [
  {
    id: 'owner',
    title: 'Every application has an owner',
    says: 'Somebody is accountable for each application — an actor or a domain.',
    severity: 'risk'
  },
  {
    id: 'capability',
    title: 'Every application carries a capability',
    says: 'An application that supports nothing the business does is either mislabelled or unnecessary.',
    severity: 'gap'
  },
  {
    id: 'retired-tech',
    title: 'Nothing runs on a technology we decided to leave',
    says: 'A component naming a standard marked "retire" is a migration nobody has planned.',
    severity: 'risk'
  },
  {
    id: 'coverage',
    title: 'Every capability is carried by somebody',
    says: 'A capability no application carries is either a gap in the landscape or a gap in the map.',
    severity: 'gap'
  },
  {
    id: 'mapped',
    title: 'Every component belongs to an application',
    says: 'A component citing no application cannot be reasoned about across projects.',
    severity: 'gap'
  },
  {
    id: 'domain',
    title: 'Every project belongs to a domain',
    says: 'A project with no owning domain is a project no domain architect can review.',
    severity: 'gap'
  }
];

const NOBODY = 'nobody yet';

/** Application id → who owns it, resolved to a name. */
function owners(graph: Graph): Map<string, string> {
  const out = new Map<string, string>();

  const declared = db.prepare(
    "SELECT from_id, to_id FROM ea_relations WHERE kind = 'assigned-to'"
  ).all() as { from_id: string; to_id: string }[];
  for (const r of declared) {
    const who = graph.entities.get(r.to_id);
    if (who) out.set(r.from_id, who.name);
  }

  /* And from the drawings: a component citing an application and an owner in
   * the same breath says who owns it, exactly as it says which capability it
   * carries. Most installs will have far more of these than of the declared
   * kind, which is why both count. */
  const drawn = db.prepare(`
    SELECT a.entity_id AS app, o.entity_id AS owner
    FROM project_entity_links a
    JOIN project_entity_links o
      ON o.project_id = a.project_id AND o.component_id = a.component_id
    WHERE a.role = 'app' AND o.role = 'owner'
  `).all() as { app: string; owner: string }[];
  for (const r of drawn) {
    if (out.has(r.app)) continue;
    const who = graph.entities.get(r.owner);
    if (who) out.set(r.app, who.name);
  }

  return out;
}

/** Application id → the capabilities it carries, from both sources. */
function realizations(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (app: string, cap: string) => {
    if (!out.has(app)) out.set(app, new Set());
    out.get(app)!.add(cap);
  };
  (db.prepare("SELECT from_id, to_id FROM ea_relations WHERE kind = 'realizes'").all() as
    { from_id: string; to_id: string }[]).forEach(r => add(r.from_id, r.to_id));
  (db.prepare(`
    SELECT a.entity_id AS app, c.entity_id AS cap
    FROM project_entity_links a
    JOIN project_entity_links c
      ON c.project_id = a.project_id AND c.component_id = a.component_id
    WHERE a.role = 'app' AND c.role = 'capability'
  `).all() as { app: string; cap: string }[]).forEach(r => add(r.app, r.cap));
  return out;
}

/** Every finding, in rule order. */
export function check(graph?: Graph): Finding[] {
  const g = graph ?? buildGraph();
  const out: Finding[] = [];
  const ownerOf = owners(g);
  const carries = realizations();

  const push = (rule: string, subject: string, detail: string, owner: string) => {
    const severity = RULES.find(r => r.id === rule)!.severity;
    out.push({ rule, subject, detail, owner, severity });
  };

  /* 1 & 2 — applications. */
  for (const app of g.nodes.values()) {
    if (!ownerOf.has(app.id)) {
      push('owner', app.name, 'No actor or domain is accountable for it.', NOBODY);
    }
    if (!carries.get(app.id)?.size) {
      push('capability', app.name, 'It carries no capability.', ownerOf.get(app.id) ?? NOBODY);
    }
  }

  /* 3 — anything on a standard somebody decided to leave. Matched exactly on a
   * trimmed, case-folded name, like every other technology question in this
   * app: a fuzzy match would report a migration that does not exist. */
  const retiring = [...g.entities.values()]
    .filter(e => e.kind === 'technology-standard' && e.status === 'retire');
  if (retiring.length) {
    const wanted = new Map(retiring.map(e => [e.name.trim().toLowerCase(), e.name]));
    const projects = db.prepare('SELECT id, name, data FROM projects').all() as
      { id: string; name: string; data: string }[];
    for (const p of projects) {
      let doc: Architecture;
      try { doc = JSON.parse(p.data); } catch { continue; }
      for (const c of doc.components || []) {
        for (const tech of c.tech || []) {
          const named = wanted.get(tech.trim().toLowerCase());
          if (!named) continue;
          const app = c.ea?.app ? g.entities.get(c.ea.app) : undefined;
          push('retired-tech', app?.name ?? `${p.name} · ${c.name}`,
            `Still on ${named}.`, (app && ownerOf.get(app.id)) ?? NOBODY);
        }
      }
    }
  }

  /* 4 — capabilities nobody carries, **rolled up**.
   *
   * A parent whose children are carried is carried. Reporting "Order to cash"
   * as uncovered because only its sub-capabilities have applications would be
   * noise, and noise in a compliance report is exactly what makes it get filed.
   * The capability map counts the same way, and the two must agree or one of
   * them is lying. */
  const carried = new Set<string>();
  carries.forEach(caps => caps.forEach(c => carried.add(c)));

  const parentOf = new Map(
    (db.prepare("SELECT id, parent_id FROM ea_entities WHERE kind = 'capability'").all() as
      { id: string; parent_id: string | null }[])
      .map(r => [r.id, r.parent_id])
  );
  /* Walk each carried capability up to the root, stopping on a repeat: a cycle
   * cannot be stored, but a hand-edited row could still carry one. */
  for (const id of [...carried]) {
    const seen = new Set<string>([id]);
    let at = parentOf.get(id) ?? null;
    while (at && !seen.has(at)) { seen.add(at); carried.add(at); at = parentOf.get(at) ?? null; }
  }

  for (const e of g.entities.values()) {
    if (e.kind !== 'capability' || carried.has(e.id)) continue;
    push('coverage', e.name, 'Neither it nor anything under it is carried.', NOBODY);
  }

  /* 5 — components that map to no application. Counted per project rather than
   * per component: on a solution diagram most components are internal detail,
   * and a hundred findings would bury the five that matter. */
  const projects = db.prepare('SELECT id, name, data FROM projects').all() as
    { id: string; name: string; data: string }[];
  const domains = new Map(
    (db.prepare('SELECT project_id, domain_id FROM project_domains').all() as
      { project_id: string; domain_id: string | null }[])
      .map(r => [r.project_id, r.domain_id])
  );

  for (const p of projects) {
    let doc: Architecture;
    try { doc = JSON.parse(p.data); } catch { continue; }

    const total = (doc.components || []).length;
    const unmapped = (doc.components || []).filter(c => !c.ea?.app).length;
    const domainId = domains.get(p.id);
    const domainName = domainId ? g.entities.get(domainId)?.name : undefined;

    if (total && unmapped) {
      push('mapped', p.name, `${unmapped} of ${total} components map to no application.`,
        domainName ?? NOBODY);
    }
    /* 6 — a project with no owning domain. */
    if (!domainId) push('domain', p.name, 'No domain owns it.', NOBODY);
  }

  return out.sort((a, b) =>
    RULES.findIndex(r => r.id === a.rule) - RULES.findIndex(r => r.id === b.rule)
    || a.subject.localeCompare(b.subject));
}

/** The findings as a table — the shape a computed section needs. */
export function complianceTable(graph?: Graph): {
  columns: string[]; rows: string[][]; note: string; empty: string;
} {
  const findings = check(graph);
  const title = new Map(RULES.map(r => [r.id, r.title]));
  return {
    columns: ['Rule', 'Subject', 'Finding', 'Who can act'],
    rows: findings.map(f => [title.get(f.rule) ?? f.rule, f.subject, f.detail, f.owner]),
    empty: 'Nothing to report. Either everything holds, or there is nothing to check yet.',
    note: 'A finding is not automatically a mistake — a new application has no owner yet, '
      + 'and that is fine. The report makes it visible; deciding is still someone’s job.'
  };
}

/** How many findings each rule has, for a dashboard. */
export function summary(graph?: Graph): { rule: Rule; count: number }[] {
  const findings = check(graph);
  return RULES.map(rule => ({
    rule, count: findings.filter(f => f.rule === rule.id).length
  }));
}
