/* What changed between two versions of a document.
 *
 * A history panel that lists timestamps is a list of timestamps. The question
 * being asked is always "what did I lose / what did I gain", so this turns two
 * `Architecture` values into sentences a person can read before deciding to
 * restore.
 *
 * Everything is keyed by id, never by position: reordering a layer or dragging
 * a component to another row must not read as "removed then added". Names are
 * resolved from whichever side still has the entity, so a removal can still say
 * what it was called.
 */
import { STATE_LABELS, type Lifecycle } from './lifecycle';
import type {
  Architecture, Component, Flow, Group, Layer, Link, Section, Technology, Zone
} from './types';

export type ChangeKind = 'added' | 'removed' | 'changed';
export type ChangeArea =
  | 'component' | 'dependency' | 'layer' | 'scope' | 'zone' | 'flow' | 'section' | 'stack'
  | 'referential' | 'document';

export interface Change {
  kind: ChangeKind;
  area: ChangeArea;
  /** The entity, in the reader's words — "Payment provider", "API → Postgres". */
  label: string;
  /** What about it changed — "role, technologies", "layer: Services → Data". */
  detail?: string;
}

export interface Diff {
  changes: Change[];
  added: number;
  removed: number;
  changed: number;
  total: number;
}

/* Areas are emitted concrete-first: a component moving matters more than a
 * footer being retyped, and the panel renders them in this order. */
export const AREA_LABELS: Record<ChangeArea, string> = {
  component: 'Components',
  dependency: 'Dependencies',
  layer: 'Layers',
  scope: 'Scopes',
  zone: 'Zones',
  flow: 'Flows',
  section: 'Sections',
  stack: 'Technology table',
  referential: 'Enterprise referential',
  document: 'Document'
};

/* ------------------------------------------------------------------ helpers */

const index = <T extends { id: string }>(xs: T[] | undefined) =>
  new Map((xs || []).map(x => [x.id, x]));

/** Absent and empty are the same thing here — a normalised document fills in
 *  `[]` where an imported one left the key out, and that is not an edit. */
const listSame = (a: unknown[] | undefined, b: unknown[] | undefined) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

const textSame = (a: string | undefined, b: string | undefined) => (a ?? '') === (b ?? '');

const valueSame = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const nameOf = (xs: { id: string; name?: string }[] | undefined, id: string) =>
  (xs || []).find(x => x.id === id)?.name || id;

/** "A → B", the same grammar the diagram uses for an edge. */
const edge = (caller: string, callee: string) => `${caller} → ${callee}`;

/** Unset is a state with a name — "existing" — and a diff that omitted it would
 *  read "transition:  → removed". */
const stateWord = (s: Lifecycle | undefined) => (s ? STATE_LABELS[s].en : 'existing');

/* ---------------------------------------------------------------- component */

const COMPONENT_FIELDS: { key: keyof Component; label: string; list?: true }[] = [
  { key: 'icon', label: 'icon' },
  { key: 'badge', label: 'badge' },
  { key: 'url', label: 'URL' },
  { key: 'deployedOn', label: 'deployment' },
  { key: 'envs', label: 'environments', list: true },
  { key: 'role', label: 'role' },
  { key: 'marks', label: 'security marks', list: true },
  { key: 'tech', label: 'technologies', list: true },
  { key: 'features', label: 'responsibilities', list: true },
  { key: 'notes', label: 'notes', list: true },
  { key: 'archimate', label: 'ArchiMate type' },
  /* Compared as a value rather than spelled out field by field: which
   * capabilities a box carries is one decision, and "capabilities, application"
   * would read as two. What each id *means* is reported once, under the
   * referential, where the names live. */
  { key: 'ea', label: 'referential links' }
];

function componentChanges(from: Architecture, to: Architecture): Change[] {
  const out: Change[] = [];
  const before = index(from.components);
  const after = index(to.components);

  before.forEach((c, id) => {
    if (!after.has(id)) out.push({ kind: 'removed', area: 'component', label: c.name });
  });
  after.forEach((c, id) => {
    if (!before.has(id)) {
      out.push({
        kind: 'added', area: 'component', label: c.name,
        detail: `in ${nameOf(to.layers, c.layer)}`
      });
    }
  });

  after.forEach((b, id) => {
    const a = before.get(id);
    if (!a) return;
    const bits: string[] = [];

    /* The move is named with both sides' own vocabulary: a layer can have been
     * renamed in the same edit, and "Services → Data" is only true if each name
     * comes from the document it belongs to. */
    if (a.layer !== b.layer) {
      bits.push(`layer: ${nameOf(from.layers, a.layer)} → ${nameOf(to.layers, b.layer)}`);
    }
    if (a.group !== b.group) {
      bits.push(`scope: ${nameOf(from.groups, a.group)} → ${nameOf(to.groups, b.group)}`);
    }
    /* Moving a component between zones is a deployment decision — out of the
     * cluster, behind the gateway — so it is named with both sides' own
     * vocabulary the way a layer move is, and "none" is a place. */
    if (a.zone !== b.zone) {
      const where = (doc: Architecture, id?: string) => (id ? nameOf(doc.zones, id) : 'no zone');
      bits.push(`zone: ${where(from, a.zone)} → ${where(to, b.zone)}`);
    }
    /* Spelled out rather than folded into COMPONENT_FIELDS as the word "state":
     * marking a component for removal is the single most consequential edit
     * this format allows, and History is where someone decides whether to undo
     * it. "state" would tell them a field moved; this tells them which way. */
    if (a.state !== b.state) {
      bits.push(`transition: ${stateWord(a.state)} → ${stateWord(b.state)}`);
    }
    for (const f of COMPONENT_FIELDS) {
      const same = f.list
        ? listSame(a[f.key] as unknown[], b[f.key] as unknown[])
        : textSame(a[f.key] as string, b[f.key] as string);
      if (!same) bits.push(f.label);
    }

    const renamed = a.name !== b.name;
    if (!renamed && !bits.length) return;
    out.push({
      kind: 'changed',
      area: 'component',
      label: renamed ? edge(a.name, b.name) : b.name,
      detail: [renamed ? 'renamed' : null, ...bits].filter(Boolean).join(', ') || undefined
    });
  });

  return out;
}

/* --------------------------------------------------------------- dependency */

/* An edge is identified by its two endpoints, joined by a character no id can
 * contain. Ids the editor makes are slugs, but an imported document's are
 * whatever it shipped with — a space or a dash as separator would let
 * `a-b → c` and `a → b-c` collide. Written as an escape so the file stays
 * plain ASCII: a literal NUL in the source makes it binary to every tool that
 * reads it, grep included. */
const SEP = '\u0000';
const edgeKey = (caller: string, callee: string) => `${caller}${SEP}${callee}`;
const edgeEnds = (key: string) => key.split(SEP) as [string, string];

/** Every edge in the document, keyed caller-to-callee. */
function edges(doc: Architecture): Set<string> {
  const live = new Set(doc.components.map(c => c.id));
  const out = new Set<string>();
  doc.components.forEach(c =>
    (c.deps || []).forEach(d => { if (live.has(d)) out.add(edgeKey(c.id, d)); })
  );
  return out;
}

function dependencyChanges(from: Architecture, to: Architecture): Change[] {
  const before = edges(from);
  const after = edges(to);
  const out: Change[] = [];

  /* The annotation on an edge, flattened onto the same key the edge sets use, so "was REST, is now Kafka" is a change on the dependency
   * rather than an invisible edit buried in the caller's fields. */
  const annotations = (doc: Architecture) => {
    const m = new Map<string, Link>();
    doc.components.forEach(c => (c.links || []).forEach(l => m.set(edgeKey(c.id, l.to), l)));
    return m;
  };
  const linksBefore = annotations(from);
  const linksAfter = annotations(to);

  /* A dependency that vanished because its component did is already reported as
   * a removed component — repeating it once per edge would bury the fact. */
  const goneComponent = (id: string) =>
    !index(to.components).has(id) && index(from.components).has(id);
  const newComponent = (id: string) =>
    !index(from.components).has(id) && index(to.components).has(id);

  before.forEach(key => {
    if (after.has(key)) return;
    const [a, b] = edgeEnds(key);
    if (goneComponent(a) || goneComponent(b)) return;
    out.push({
      kind: 'removed', area: 'dependency',
      label: edge(nameOf(from.components, a), nameOf(from.components, b))
    });
  });
  after.forEach(key => {
    if (before.has(key)) return;
    const [a, b] = edgeEnds(key);
    if (newComponent(a) || newComponent(b)) return;
    const how = describe(linksAfter.get(key));
    out.push({
      kind: 'added', area: 'dependency',
      label: edge(nameOf(to.components, a), nameOf(to.components, b)),
      /* Omitted rather than set to undefined: a Change is compared and
       * rendered as data, and an absent key and an empty one are not the
       * same object. */
      ...(how ? { detail: how } : {})
    });
  });

  /* An edge that survived but is now described differently. */
  after.forEach(key => {
    if (!before.has(key)) return;
    const a = linksBefore.get(key);
    const b = linksAfter.get(key);
    if (valueSame(a, b)) return;
    const [caller, callee] = edgeEnds(key);
    out.push({
      kind: 'changed', area: 'dependency',
      label: edge(nameOf(to.components, caller), nameOf(to.components, callee)),
      detail: `${describe(a) ?? 'undescribed'} → ${describe(b) ?? 'undescribed'}`
    });
  });

  return out;
}

/** "REST/HTTPS · async · read replica · removed", or null when the edge says
 *  nothing. The transition mark last, matching `shortLink`. */
function describe(link: Link | undefined): string | null {
  if (!link) return null;
  const bits = [link.protocol, link.kind, link.note, link.state].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

/* -------------------------------------------------------- layers and scopes */

function layerChanges(from: Architecture, to: Architecture): Change[] {
  const out = keyedChanges<Layer>('layer', from.layers, to.layers, (a, b) => {
    const bits: string[] = [];
    if (!textSame(a.desc, b.desc)) bits.push('description');
    return bits;
  });

  /* Order is a property of the whole list, not of any one layer, so it is
   * reported once — and only when the set itself is unchanged, since an add or
   * a delete already explains the new sequence. */
  const beforeIds = from.layers.map(l => l.id);
  const afterIds = to.layers.map(l => l.id);
  const sameSet = beforeIds.length === afterIds.length && beforeIds.every(id => afterIds.includes(id));
  if (sameSet && !valueSame(beforeIds, afterIds)) {
    out.push({
      kind: 'changed', area: 'layer', label: 'Layer order',
      detail: to.layers.map(l => l.name).join(' · ')
    });
  }
  return out;
}

/* A zone's own edits — renamed, retyped, or moved to a different parent. Where
 * its components sit is reported on the components, not here: a zone gaining a
 * member is a fact about the member. */
const zoneChanges = (from: Architecture, to: Architecture) =>
  keyedChanges<Zone>('zone', from.zones, to.zones, (a, b) => {
    const bits: string[] = [];
    if (a.kind !== b.kind) bits.push(`kind: ${a.kind || 'untyped'} → ${b.kind || 'untyped'}`);
    if (a.parent !== b.parent) {
      const inside = (doc: Architecture, id?: string) => (id ? nameOf(doc.zones, id) : 'nothing');
      bits.push(`inside: ${inside(from, a.parent)} → ${inside(to, b.parent)}`);
    }
    if (!textSame(a.note, b.note)) bits.push('note');
    if (!a.stack !== !b.stack) bits.push(b.stack ? 'stacked under its neighbour' : 'given its own band');
    return bits;
  });

const scopeChanges = (from: Architecture, to: Architecture) =>
  keyedChanges<Group>('scope', from.groups, to.groups, (a, b) => {
    const bits: string[] = [];
    if (!textSame(a.short, b.short)) bits.push('short name');
    if (!textSame(a.description, b.description)) bits.push('description');
    if (!textSame(a.color, b.color) || !textSame(a.colorDark, b.colorDark)) bits.push('colour');
    return bits;
  });

/* ---------------------------------------------------------------- flows etc */

const flowChanges = (from: Architecture, to: Architecture) =>
  keyedChanges<Flow>('flow', from.flows, to.flows, (a, b) => {
    const bits: string[] = [];
    if (!textSame(a.sub, b.sub)) bits.push('subtitle');
    if (!textSame(a.note, b.note)) bits.push('note');
    if (a.group !== b.group) bits.push('scope');
    if (!listSame(a.steps, b.steps)) {
      const d = (b.steps?.length || 0) - (a.steps?.length || 0);
      bits.push(d === 0 ? 'steps' : `steps (${d > 0 ? '+' : ''}${d})`);
    }
    return bits;
  });

/** The payload of a section, minus the fields compared by name above it. */
function sectionBody(s: Section): Record<string, unknown> {
  const { id: _i, tab: _t, type: _y, title: _l, subtitle: _s, note: _n, doc: _d, ...rest } = s;
  return rest;
}

const sectionChanges = (from: Architecture, to: Architecture) =>
  keyedChanges<Section>('section', from.sections, to.sections, (a, b) => {
    const bits: string[] = [];
    if (a.type !== b.type) bits.push(`type: ${a.type} → ${b.type}`);
    if (!textSame(a.tab, b.tab)) bits.push('tab name');
    if (!textSame(a.subtitle, b.subtitle)) bits.push('subtitle');
    if (!textSame(a.note, b.note)) bits.push('note');
    if (!textSame(a.doc?.chapter, b.doc?.chapter)) {
      bits.push(`chapter: ${a.doc?.chapter || 'appendix'} → ${b.doc?.chapter || 'appendix'}`);
    }
    if (!valueSame(sectionBody(a), sectionBody(b))) bits.push('content');
    return bits;
  });

/** Sections and flows carry `title`/`name` respectively; both are the label. */
function keyedChanges<T extends { id: string }>(
  area: ChangeArea,
  fromList: T[] | undefined,
  toList: T[] | undefined,
  fields: (a: T, b: T) => string[]
): Change[] {
  const label = (x: T) =>
    (x as { name?: string; title?: string }).name ?? (x as { title?: string }).title ?? x.id;
  const before = index(fromList);
  const after = index(toList);
  const out: Change[] = [];

  before.forEach((x, id) => { if (!after.has(id)) out.push({ kind: 'removed', area, label: label(x) }); });
  after.forEach((x, id) => { if (!before.has(id)) out.push({ kind: 'added', area, label: label(x) }); });

  after.forEach((b, id) => {
    const a = before.get(id);
    if (!a) return;
    const bits = fields(a, b);
    const renamed = label(a) !== label(b);
    if (!renamed && !bits.length) return;
    out.push({
      kind: 'changed', area,
      label: renamed ? edge(label(a), label(b)) : label(b),
      detail: [renamed ? 'renamed' : null, ...bits].filter(Boolean).join(', ') || undefined
    });
  });

  return out;
}

/* ------------------------------------------------------------------- stack */

function stackChanges(from: Architecture, to: Architecture): Change[] {
  const key = (t: Technology) => t.name;
  const before = new Map((from.technologies || []).map(t => [key(t), t]));
  const after = new Map((to.technologies || []).map(t => [key(t), t]));
  const out: Change[] = [];

  before.forEach((t, k) => { if (!after.has(k)) out.push({ kind: 'removed', area: 'stack', label: t.name }); });
  after.forEach((t, k) => { if (!before.has(k)) out.push({ kind: 'added', area: 'stack', label: t.name }); });
  after.forEach((b, k) => {
    const a = before.get(k);
    if (!a) return;
    const bits: string[] = [];
    if (!textSame(a.category, b.category)) bits.push('category');
    if (!textSame(a.description, b.description)) bits.push('description');
    if (!listSame(a.groups, b.groups)) bits.push('scopes');
    if (bits.length) out.push({ kind: 'changed', area: 'stack', label: b.name, detail: bits.join(', ') });
  });

  return out;
}

/* ------------------------------------------------------------ referential */

/* What the document quotes from the enterprise referential.
 *
 * Reported separately from the components that cite it, because a rename in the
 * referential changes every citing document at once and is not an edit anyone
 * made *here*. Seeing "Billing → Invoicing" under its own heading is the
 * difference between "someone reorganised the capability map" and "six
 * components were edited". */
function referentialChanges(from: Architecture, to: Architecture): Change[] {
  const before = new Map((from.imprint?.entities || []).map(e => [e.id, e]));
  const after = new Map((to.imprint?.entities || []).map(e => [e.id, e]));
  const out: Change[] = [];

  const label = (e: { name: string; code?: string }) => (e.code ? `${e.name} (${e.code})` : e.name);

  before.forEach((e, id) => {
    if (!after.has(id)) {
      out.push({ kind: 'removed', area: 'referential', label: label(e), detail: e.kind });
    }
  });
  after.forEach((e, id) => {
    if (!before.has(id)) {
      out.push({ kind: 'added', area: 'referential', label: label(e), detail: e.kind });
    }
  });
  after.forEach((b, id) => {
    const a = before.get(id);
    if (!a) return;
    const bits: string[] = [];
    if (a.name !== b.name) bits.push(`renamed from ${a.name}`);
    if (!textSame(a.code, b.code)) bits.push(`code: ${a.code || 'none'} → ${b.code || 'none'}`);
    if (a.parent !== b.parent) bits.push('moved in the tree');
    if (bits.length) {
      out.push({ kind: 'changed', area: 'referential', label: label(b), detail: bits.join(', ') });
    }
  });

  return out;
}

/* ---------------------------------------------------------------- document */

const META_LABELS: Record<string, string> = {
  lang: 'Language', name: 'Display name', tagline: 'Tagline', version: 'Version',
  kicker: 'Kicker', title: 'Headline', intro: 'Introduction', facts: 'Header facts',
  tiles: 'Key figures', distributionNote: 'Distribution note', principle: 'Guiding principle',
  footer: 'Footer', repo: 'Repository'
};

function documentChanges(from: Architecture, to: Architecture): Change[] {
  const out: Change[] = [];
  const keys = new Set([...Object.keys(from.meta || {}), ...Object.keys(to.meta || {})]);
  keys.forEach(k => {
    const a = (from.meta as Record<string, unknown>)[k];
    const b = (to.meta as Record<string, unknown>)[k];
    if (valueSame(a, b)) return;
    /* An empty string and an absent key are the same document. */
    if ((a ?? '') === '' && (b ?? '') === '') return;
    out.push({ kind: 'changed', area: 'document', label: META_LABELS[k] || k });
  });

  if (!valueSame(from.theme, to.theme)) out.push({ kind: 'changed', area: 'document', label: 'Theme' });

  const tabsBefore = from.ui?.tabs, tabsAfter = to.ui?.tabs;
  if (!listSame(tabsBefore, tabsAfter)) {
    out.push({ kind: 'changed', area: 'document', label: 'Tab bar', detail: (tabsAfter || []).join(' · ') });
  }
  const { tabs: _a, ...uiBefore } = from.ui || {};
  const { tabs: _b, ...uiAfter } = to.ui || {};
  if (!valueSame(uiBefore, uiAfter)) out.push({ kind: 'changed', area: 'document', label: 'Viewer settings' });

  return out;
}

/* -------------------------------------------------------------------- diff */

/** What `to` gained, lost and altered relative to `from`. */
export function diffArchitecture(from: Architecture, to: Architecture): Diff {
  const changes = [
    ...componentChanges(from, to),
    ...dependencyChanges(from, to),
    ...layerChanges(from, to),
    ...scopeChanges(from, to),
    ...zoneChanges(from, to),
    ...flowChanges(from, to),
    ...sectionChanges(from, to),
    ...stackChanges(from, to),
    ...referentialChanges(from, to),
    ...documentChanges(from, to)
  ];

  return {
    changes,
    added: changes.filter(c => c.kind === 'added').length,
    removed: changes.filter(c => c.kind === 'removed').length,
    changed: changes.filter(c => c.kind === 'changed').length,
    total: changes.length
  };
}

/** The changes grouped by area, in the order `AREA_LABELS` declares them. */
export function byArea(diff: Diff): { area: ChangeArea; label: string; changes: Change[] }[] {
  return (Object.keys(AREA_LABELS) as ChangeArea[])
    .map(area => ({ area, label: AREA_LABELS[area], changes: diff.changes.filter(c => c.area === area) }))
    .filter(g => g.changes.length > 0);
}

/** "3 added · 1 removed · 6 changed", or null when the two are identical. */
export function summarise(diff: Diff): string | null {
  if (!diff.total) return null;
  return [
    diff.added ? `${diff.added} added` : null,
    diff.removed ? `${diff.removed} removed` : null,
    diff.changed ? `${diff.changed} changed` : null
  ].filter(Boolean).join(' · ');
}
