/* The ArchiMate Model Exchange File Format, from an architecture document.
 *
 * The Open Group's interchange XML — the one Archi, BiZZdesign and the rest read
 * — rather than any single tool's native file. That is the whole point: the
 * answer to "is our model trapped in your tool" has to be a format nobody here
 * controls.
 *
 * Three things decide whether this is usable or merely present:
 *
 *   1. Direction. `deps` inverts on the way out. See `profile.ts`.
 *   2. Identity. Identifiers are hashes, so a re-export merges instead of
 *      duplicating. See `identity.ts`.
 *   3. Layout. The view reuses `layoutSheet()` — the same geometry draw.io and
 *      the SVG already consume — so the model opens *arranged*. A model that
 *      opens as a heap of boxes in the top-left corner is one nobody looks at
 *      twice, and getting there costs nothing here because the sheet was
 *      already measured elsewhere.
 *
 * Element order inside `<model>` is a schema `xs:sequence`, not a preference:
 * name, documentation, elements, relationships, organizations,
 * propertyDefinitions, views. Importers reject the wrong order.
 *
 * Deliberately out of scope for now: flows, the editorial sections, and the
 * motivation layer. Those arrive with the business layer, and a half-mapped
 * business process is worse than an absent one.
 */
import { envsOf, environmentName } from '../environments';
import { layoutSheet, type Sheet } from '../export/layout';
import { MARK_LABELS } from '../marks';
import { STATE_LABELS } from '../lifecycle';
import type { Architecture, Component } from '../types';

import { archimateId, propertyId } from './identity';
import { stateAt, plateauIndex } from '../plateau';
import { MOTIVATION_LABELS } from '../motivation';
import {
  DEPENDENCY_RELATIONSHIP,
  MOTIVATION_ELEMENT,
  MOTIVATION_RELATIONSHIP,
  PLATEAU_RELATIONSHIP,
  PROCESS_RELATIONSHIP,
  TECHNOLOGY_ELEMENT,
  TECHNOLOGY_RELATIONSHIP,
  ZONE_RELATIONSHIP,
  elementTypeOf,
  zoneElementType,
  type ArchimateElementType,
  type ArchimateRelationshipType,
  type ArchimateSyntheticType
} from './profile';

const NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const SCHEMA_LOCATION =
  'http://www.opengroup.org/xsd/archimate/3.0/ ' +
  'http://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd';

export interface ArchimateOptions {
  /** The project's id. Every identifier is derived from it, so exporting the
   *  same project twice produces the same identifiers and an importer merges. */
  projectId: string;
  /** Names the model when `meta.name` does not. */
  name?: string;
}

/* ------------------------------------------------------------- primitives */

/** XML text. `>` is escaped too: it only *has* to be inside `]]>`, but a
 *  half-escaped document is the kind of thing that works until someone writes
 *  about generics in a role description. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** `<name xml:lang="en">…</name>`, the format's LangString. */
const lang = (tag: string, text: string, l: string) =>
  `<${tag} xml:lang="${l}">${esc(text)}</${tag}>`;

/** #RRGGBB to the format's `r`/`g`/`b` attributes. Returns null for anything
 *  else, so a document carrying a CSS variable or a colour name loses its
 *  styling rather than emitting an invalid attribute. */
function colorAttrs(hex: string | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `r="${(n >> 16) & 255}" g="${(n >> 8) & 255}" b="${n & 255}"`;
}

const round = (n: number) => Math.round(n);

/** A lookup key for an ordered pair of ids. `JSON.stringify` rather than joining
 *  on a separator: ids the editor makes are slugs, but an imported document's
 *  are whatever it shipped with, and any character picked as a joiner is a
 *  character some id can contain — `["a b","c"]` and `["a","b c"]` have to stay
 *  distinct. Quoting is what makes that true without reaching for a NUL. */
const pairKey = (a: string, b: string) => JSON.stringify([a, b]);

/* -------------------------------------------------------------- properties */

/* What the picture cannot carry, carried as data — the same fields the draw.io
 * export puts in Edit Data, for the same reason: an importer's search finds
 * them. Environments get one definition each, named in the document's own
 * words, because "SA" is what the reader is looking for and `env-2` is not. */
const PROPS = {
  studioId: 'Studio id',
  scope: 'Scope',
  layer: 'Layer',
  deployedOn: 'Deployed on',
  badge: 'Badge',
  url: 'URL',
  security: 'Security',
  transition: 'Transition',
  technologies: 'Technologies'
} as const;

interface Prop { name: string; value: string }

function componentProps(c: Component, sheet: Sheet, doc: Architecture): Prop[] {
  const out: Prop[] = [{ name: PROPS.studioId, value: c.id }];

  const scope = sheet.legend.find(g => g.id === c.group);
  if (scope) out.push({ name: PROPS.scope, value: scope.label });
  const layer = sheet.layers.find(l => l.layer.id === c.layer);
  if (layer?.label) out.push({ name: PROPS.layer, value: layer.label });

  if (c.deployedOn) out.push({ name: PROPS.deployedOn, value: c.deployedOn });
  if (c.badge) out.push({ name: PROPS.badge, value: c.badge });
  if (c.url) out.push({ name: PROPS.url, value: c.url });
  if (c.marks?.length) {
    out.push({
      name: PROPS.security,
      value: c.marks.map(m => MARK_LABELS[m][sheet.lang]).join(', ')
    });
  }
  if (c.state) out.push({ name: PROPS.transition, value: STATE_LABELS[c.state][sheet.lang] });
  if (c.tech?.length) out.push({ name: PROPS.technologies, value: c.tech.join(', ') });

  /* Address, version and note in one value: three properties per environment
   * would bury the addresses under their own labels, which is the mistake the
   * draw.io export already avoided. */
  envsOf(c, doc.environments || []).forEach(e => {
    const value = [e.url, e.version, e.note].filter(Boolean).join(' · ');
    if (value) out.push({ name: environmentName(doc.environments || [], e.env), value });
  });

  return out;
}

/* ------------------------------------------------------------------ build */

interface Element {
  id: string;
  type: ArchimateElementType | ArchimateSyntheticType;
  name: string;
  documentation?: string;
  props: Prop[];
}

interface Relationship {
  id: string;
  type: ArchimateRelationshipType;
  source: string;
  target: string;
  name?: string;
  documentation?: string;
}

/** The whole model, as one string. Pure: same document and project id in, same
 *  bytes out — which is what makes the golden file in the test meaningful. */
export function buildArchimateXml(doc: Architecture, opts: ArchimateOptions): string {
  const { projectId } = opts;
  const sheet = layoutSheet(doc);
  const l = sheet.lang;

  const elements: Element[] = [];
  const relationships: Relationship[] = [];

  /* --- components ------------------------------------------------------- */

  const componentId = new Map<string, string>();
  const live = new Set(doc.components.map(c => c.id));

  for (const c of doc.components) {
    const id = archimateId('component', projectId, c.id);
    componentId.set(c.id, id);
    elements.push({
      id,
      type: elementTypeOf(c),
      name: c.name,
      /* The role is the prose an architect wrote about this box; the
       * responsibilities are the list under it. Both belong in documentation —
       * a reader in Archi opens the properties panel expecting sentences. */
      documentation: [c.role, ...(c.features || []), ...(c.notes || [])]
        .filter(Boolean).join('\n') || undefined,
      props: componentProps(c, sheet, doc)
    });
  }

  /* --- zones ------------------------------------------------------------ */

  const zoneId = new Map<string, string>();
  for (const z of doc.zones || []) {
    const id = archimateId('zone', projectId, z.id);
    zoneId.set(z.id, id);
    elements.push({
      id, type: zoneElementType(z.kind), name: z.name,
      documentation: z.note || undefined,
      props: []
    });
  }

  /* Nesting and membership are both containment, and Composition points whole →
   * part. A component names only its innermost zone; the ancestors are implied
   * by the chain of zone-to-zone compositions, so nothing is emitted twice. */
  for (const z of doc.zones || []) {
    if (!z.parent || !zoneId.has(z.parent)) continue;
    relationships.push({
      id: archimateId('composition', projectId, z.parent, z.id),
      type: ZONE_RELATIONSHIP,
      source: zoneId.get(z.parent)!,
      target: zoneId.get(z.id)!
    });
  }
  for (const c of doc.components) {
    if (!c.zone || !zoneId.has(c.zone)) continue;
    relationships.push({
      id: archimateId('composition', projectId, c.zone, c.id),
      type: ZONE_RELATIONSHIP,
      source: zoneId.get(c.zone)!,
      target: componentId.get(c.id)!
    });
  }

  /* --- technologies ----------------------------------------------------- */

  /* The stack table becomes real elements, so "who still runs Java 8" is a
   * question the exported model can answer. Matching is exact on a trimmed,
   * case-folded name and nothing cleverer: a fuzzy match here would invent
   * edges, and an invented edge in an enterprise repository is worse than a
   * missing one. A component's `tech` strings that match no row stay in the
   * Technologies property, where they are still findable. */
  const techKey = (name: string) => name.trim().toLowerCase();
  const techId = new Map<string, string>();
  for (const t of doc.technologies || []) {
    const key = techKey(t.name);
    if (!key || techId.has(key)) continue;
    const id = archimateId('technology', projectId, key);
    techId.set(key, id);
    elements.push({
      id, type: TECHNOLOGY_ELEMENT, name: t.name,
      documentation: [t.category, t.description].filter(Boolean).join(' — ') || undefined,
      props: []
    });
  }
  for (const c of doc.components) {
    for (const name of c.tech || []) {
      const id = techId.get(techKey(name));
      if (!id) continue;
      relationships.push({
        id: archimateId('association', projectId, c.id, techKey(name)),
        type: TECHNOLOGY_RELATIONSHIP,
        source: componentId.get(c.id)!,
        target: id
      });
    }
  }

  /* --- dependencies ----------------------------------------------------- */

  /* The inversion. `A.deps ∋ B` is "A calls B"; ArchiMate's Serving points from
   * the provider to the consumer, so the relationship is B → A. The id is still
   * keyed caller-first, because that is how the document reads and how the view
   * below looks the relationship back up. */
  const servingId = new Map<string, string>();
  for (const c of doc.components) {
    for (const dep of c.deps || []) {
      if (!live.has(dep) || dep === c.id) continue;
      const id = archimateId('serving', projectId, c.id, dep);
      servingId.set(pairKey(c.id, dep), id);
      const link = (c.links || []).find(x => x.to === dep);
      relationships.push({
        id,
        type: DEPENDENCY_RELATIONSHIP,
        source: componentId.get(dep)!,
        target: componentId.get(c.id)!,
        name: link?.protocol || doc.ui?.architecture?.defaultProtocol || undefined,
        documentation: [link?.kind, link?.note, link?.state && STATE_LABELS[link.state][l]]
          .filter(Boolean).join(' · ') || undefined
      });
    }
  }

  /* Capabilities the document cites, from its own imprint — the same frozen
   * copy the viewer renders from, so the exported model names exactly what the
   * exported HTML names. */
  const capabilityId = new Map<string, string>();
  for (const entry of doc.imprint?.entities || []) {
    if (entry.kind !== 'capability') continue;
    const id = archimateId('zone', projectId, 'capability', entry.id);
    capabilityId.set(entry.id, id);
    elements.push({
      id, type: 'Capability', name: entry.name,
      documentation: entry.code || undefined,
      props: []
    });
  }
  /* A component carrying a capability realises it. */
  for (const c of doc.components) {
    for (const cap of c.ea?.capabilities || []) {
      const target = capabilityId.get(cap);
      if (!target) continue;
      relationships.push({
        id: archimateId('composition', projectId, 'carries', c.id, cap),
        type: MOTIVATION_RELATIONSHIP,
        source: componentId.get(c.id)!,
        target
      });
    }
  }

  /* --- motivation, capabilities and flows -------------------------------- */

  /* The three layers this export gained last, and the two vocabularies that
   * simply agree: ArchiMate's motivation elements are the six words
   * `MotivationKind` already uses, and its Capability is the referential's.
   * Nothing here is a mapping decision — it is a transcription. */
  for (const item of doc.motivation?.items || []) {
    const id = archimateId('zone', projectId, 'motivation', item.id);
    elements.push({
      id, type: MOTIVATION_ELEMENT[item.kind] ?? 'Goal',
      name: item.name,
      documentation: [MOTIVATION_LABELS[item.kind], item.text].filter(Boolean).join(' — ') || undefined,
      props: []
    });

    /* Realization runs concrete → abstract: the component realises the goal. */
    for (const ref of item.realizedBy || []) {
      const target = componentId.get(ref) ?? capabilityId.get(ref);
      if (!target) continue;
      relationships.push({
        id: archimateId('composition', projectId, 'realizes', item.id, ref),
        type: MOTIVATION_RELATIONSHIP,
        source: target,
        target: id
      });
    }
  }

  /* A flow is a path across components, told in the business's words. The
   * components serve it — they are not what it is made of. */
  for (const flow of doc.flows || []) {
    if (!flow.steps?.length) continue;
    const id = archimateId('zone', projectId, 'flow', flow.id);
    elements.push({
      id,
      type: flow.kind === 'value-stream' ? 'ValueStream' : 'BusinessProcess',
      name: flow.name,
      documentation: [flow.sub, flow.note].filter(Boolean).join('\n') || undefined,
      props: []
    });
    for (const step of new Set(flow.steps.map(x => x.component))) {
      const from = componentId.get(step);
      if (!from) continue;
      relationships.push({
        id: archimateId('serving', projectId, 'flow', flow.id, step),
        type: PROCESS_RELATIONSHIP,
        source: from,
        target: id
      });
    }
  }

  /* --- plateaus and gaps ------------------------------------------------- */

  /* ArchiMate's Implementation & Migration layer, which is exactly what
   * `Architecture.plateaus` describes. Emitted from the *living* document, not
   * from a projection: a model that only knew one plateau would be a model that
   * lost the trajectory, and the trajectory is the reason the layer exists.
   *
   * `Gap` is the element ArchiMate offers for "what is different between two
   * states". One per step after the first, named for the step it closes, and
   * associated with the plateau it belongs to. */
  const order = plateauIndex(doc);
  const plateauId = new Map<string, string>();
  const plateaus = doc.plateaus || [];

  plateaus.forEach((p, index) => {
    const id = archimateId('zone', projectId, 'plateau', p.id);
    plateauId.set(p.id, id);
    elements.push({
      id, type: 'Plateau', name: p.name,
      documentation: [p.date, p.kind].filter(Boolean).join(' · ') || undefined,
      props: []
    });

    /* What stands at this plateau. */
    for (const c of doc.components) {
      if (stateAt(c.plan, index, order) === null) continue;
      relationships.push({
        id: archimateId('composition', projectId, 'at', p.id, c.id),
        type: PLATEAU_RELATIONSHIP,
        source: id,
        target: componentId.get(c.id)!
      });
    }
  });

  plateaus.slice(1).forEach((p, i) => {
    const previous = plateaus[i];
    const index = i + 1;
    const arriving: string[] = [];
    const leaving: string[] = [];
    for (const c of doc.components) {
      const state = stateAt(c.plan, index, order);
      if (state === 'new') arriving.push(c.name);
      else if (state === 'removed') leaving.push(c.name);
    }
    if (!arriving.length && !leaving.length) return;

    const id = archimateId('zone', projectId, 'gap', p.id);
    elements.push({
      id, type: 'Gap',
      name: `${previous.name} → ${p.name}`,
      documentation: [
        arriving.length ? `Arriving: ${arriving.join(', ')}` : null,
        leaving.length ? `Retired: ${leaving.join(', ')}` : null
      ].filter(Boolean).join('\n') || undefined,
      props: []
    });
    relationships.push({
      id: archimateId('association', projectId, 'gap', p.id),
      type: TECHNOLOGY_RELATIONSHIP,
      source: id,
      target: plateauId.get(p.id)!
    });
  });

  /* --- organizations ---------------------------------------------------- */

  /* A folder tree, and an element belongs to exactly one folder — so components
   * are filed under their layer, which is the drawing's own primary axis, and
   * zones and technologies get a folder each. Scope is a property rather than a
   * folder for the same reason: it is the *other* axis, and a tree can only have
   * one. */
  const folders: { label: string; items: string[] }[] = [];
  for (const lp of sheet.layers) {
    const ids = doc.components
      .filter(c => c.layer === lp.layer.id)
      .map(c => componentId.get(c.id)!);
    if (ids.length) folders.push({ label: lp.label || lp.layer.name || lp.layer.id, items: ids });
  }
  const orphans = doc.components
    .filter(c => !sheet.layers.some(lp => lp.layer.id === c.layer))
    .map(c => componentId.get(c.id)!);
  if (orphans.length) folders.push({ label: 'Unfiled', items: orphans });

  const zoneIds = [...zoneId.values()];
  const techIds = [...techId.values()];
  const migrationIds = elements
    .filter(e => e.type === 'Plateau' || e.type === 'Gap')
    .map(e => e.id);
  const motivationIds = elements
    .filter(e => Object.values(MOTIVATION_ELEMENT).includes(e.type as never))
    .map(e => e.id);
  const businessIds = elements
    .filter(e => e.type === 'Capability' || e.type === 'BusinessProcess' || e.type === 'ValueStream')
    .map(e => e.id);

  /* --- property definitions --------------------------------------------- */

  const definitions: string[] = [];
  const seenProp = new Set<string>();
  const defineProp = (name: string) => {
    if (seenProp.has(name)) return;
    seenProp.add(name);
    definitions.push(
      `    <propertyDefinition identifier="${propertyId(name)}" type="string">\n` +
      `      <name>${esc(name)}</name>\n` +
      `    </propertyDefinition>`
    );
  };
  elements.forEach(e => e.props.forEach(p => defineProp(p.name)));

  /* --- the view --------------------------------------------------------- */

  const viewId = archimateId('view', projectId, 'architecture');
  const nodeId = new Map<string, string>();
  const viewNodes: string[] = [];

  /* Zones first, components after: the exchange format paints in document
   * order, so the boundaries have to be laid down before what sits on them.
   * Flat rather than nested — a nested node's coordinates are relative to its
   * parent, and `layoutSheet` measures in absolute sheet space. The containment
   * is not lost, it is carried by the Composition relationships above, which is
   * where a model should keep it anyway. */
  for (const zp of sheet.zones) {
    const element = zoneId.get(zp.zone.id);
    if (!element) continue;
    const id = archimateId('node', projectId, 'zone', zp.zone.id);
    nodeId.set(`zone:${zp.zone.id}`, id);
    viewNodes.push(viewNode(id, element, zp.box, null));
  }
  for (const np of sheet.nodes) {
    const element = componentId.get(np.component.id);
    if (!element) continue;
    const id = archimateId('node', projectId, 'component', np.component.id);
    nodeId.set(`component:${np.component.id}`, id);
    viewNodes.push(viewNode(id, element, np.box, np.color));
  }

  const viewConnections: string[] = [];
  for (const e of sheet.edges) {
    const rel = servingId.get(pairKey(e.from, e.to));
    const from = nodeId.get(`component:${e.to}`);
    const to = nodeId.get(`component:${e.from}`);
    /* Source and target follow the *relationship*, not the drawing: the
     * connection has to run provider → consumer or an importer refuses it as
     * inconsistent with the relationship it references. */
    if (!rel || !from || !to) continue;
    viewConnections.push(
      `        <connection identifier="${archimateId('connection', projectId, e.from, e.to)}" ` +
      `relationshipRef="${rel}" source="${from}" target="${to}" xsi:type="Relationship"/>`
    );
  }

  /* --- assemble --------------------------------------------------------- */

  const modelName = doc.meta?.name?.trim() || opts.name?.trim() || 'Architecture';
  const out: string[] = [];

  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<model xmlns="${NS}" xmlns:xsi="${XSI}" ` +
    `xsi:schemaLocation="${SCHEMA_LOCATION}" ` +
    `identifier="${archimateId('model', projectId)}">`
  );
  out.push('  ' + lang('name', modelName, l));
  const intro = [doc.meta?.tagline, doc.meta?.intro].filter(Boolean).join('\n\n');
  if (intro) out.push('  ' + lang('documentation', intro, l));

  if (elements.length) {
    out.push('  <elements>');
    for (const e of elements) {
      out.push(`    <element identifier="${e.id}" xsi:type="${e.type}">`);
      out.push('      ' + lang('name', e.name, l));
      if (e.documentation) out.push('      ' + lang('documentation', e.documentation, l));
      if (e.props.length) {
        out.push('      <properties>');
        for (const p of e.props) {
          out.push(`        <property propertyDefinitionRef="${propertyId(p.name)}">`);
          out.push('          ' + lang('value', p.value, l));
          out.push('        </property>');
        }
        out.push('      </properties>');
      }
      out.push('    </element>');
    }
    out.push('  </elements>');
  }

  if (relationships.length) {
    out.push('  <relationships>');
    for (const r of relationships) {
      const open =
        `    <relationship identifier="${r.id}" source="${r.source}" target="${r.target}" ` +
        `xsi:type="${r.type}">`;
      if (!r.name && !r.documentation) {
        out.push(open.replace(/>$/, '/>'));
        continue;
      }
      out.push(open);
      if (r.name) out.push('      ' + lang('name', r.name, l));
      if (r.documentation) out.push('      ' + lang('documentation', r.documentation, l));
      out.push('    </relationship>');
    }
    out.push('  </relationships>');
  }

  if (folders.length || zoneIds.length || techIds.length
      || migrationIds.length || motivationIds.length || businessIds.length) {
    out.push('  <organizations>');
    const item = (label: string, ids: string[]) => {
      out.push('    <item>');
      out.push('      ' + lang('label', label, l));
      ids.forEach(id => out.push(`      <item identifierRef="${id}"/>`));
      out.push('    </item>');
    };
    folders.forEach(f => item(f.label, f.items));
    if (zoneIds.length) item('Zones', zoneIds);
    if (techIds.length) item('Technology', techIds);
    if (motivationIds.length) item('Motivation', motivationIds);
    if (businessIds.length) item('Business & Strategy', businessIds);
    if (migrationIds.length) item('Implementation & Migration', migrationIds);
    out.push('  </organizations>');
  }

  if (definitions.length) {
    out.push('  <propertyDefinitions>');
    out.push(...definitions);
    out.push('  </propertyDefinitions>');
  }

  if (viewNodes.length) {
    out.push('  <views>');
    out.push('    <diagrams>');
    out.push(`      <view identifier="${viewId}" xsi:type="Diagram">`);
    out.push('        ' + lang('name', sheet.title || modelName, l));
    if (sheet.subtitle) out.push('        ' + lang('documentation', sheet.subtitle, l));
    out.push(...viewNodes);
    out.push(...viewConnections);
    out.push('      </view>');
    out.push('    </diagrams>');
    out.push('  </views>');
  }

  out.push('</model>');
  return out.join('\n') + '\n';
}

/** One box in the view. `xsi:type="Element"` is the node that references a model
 *  element, as opposed to a container or a free label. */
function viewNode(
  id: string,
  elementRef: string,
  box: { x: number; y: number; w: number; h: number },
  fill: string | null
): string {
  const open =
    `        <node identifier="${id}" elementRef="${elementRef}" xsi:type="Element" ` +
    `x="${round(box.x)}" y="${round(box.y)}" w="${round(box.w)}" h="${round(box.h)}">`;
  const attrs = colorAttrs(fill || undefined);
  if (!attrs) return open.replace(/>$/, '/>');
  return [
    open,
    '          <style>',
    `            <fillColor ${attrs}/>`,
    '          </style>',
    '        </node>'
  ].join('\n');
}
