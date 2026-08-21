import { canonicalise, cleanDeployedOn } from './deployment';
import { envEntryIsEmpty } from './environments';
import { isLifecycle } from './lifecycle';
import { normalizeMarks } from './marks';
import { isZoneKind } from './zones';
import { LINK_KINDS, PROTOCOL_LABEL_MODES, linkIsEmpty } from './links';
import { displayLayerLabel } from './layers';
import { syncGatedPresetSections } from './document/preset';
import { isBrickId } from './lego/bricks';
import { buildCatalogSnapshot } from './lego/seed-data';
import type {
  Architecture, EnvEntry, Environment, Flow, Group, Link, Section, SectionType, Ui, Zone
} from './types';

/* The Atelier scope palette: five cool hues, `oklch(0.62 0.11 h)` for
 * h = 200, 250, 290, 340, 150, lifted to L .72 / C .12 on a marine ground.
 * Equal lightness and equal chroma are the point — no scope dominates the
 * diagram, and every chip clears 3:1 against white (3.45–3.84), so the printed
 * page survives with background graphics on.
 *
 * Five, not six. A sixth group wraps to the first hue and the two become
 * indistinguishable, which is the honest ceiling for a categorical palette
 * built by hue rotation alone.
 *
 * Known trade-off, measured rather than assumed. Two things work against
 * separation here: lightness is held constant, and the five hues sit on a cool
 * arc rather than the full circle, which puts 250° and 290° only 40° apart.
 * Adjacent pairs measure ΔE 7.4 (OKLab×100) for normal vision, falling to 1.4
 * under deuteranopia and 1.9 under protanopia — both at 250°/290° — and 2.4
 * under tritanopia at 200°/250°. Widening the arc or spreading lightness is a
 * different palette, not a tweak. Scope is never carried by colour alone in
 * either medium — the diagram labels every card, and the legend and the
 * inventory table both name the scope in text — so this degrades rather than
 * fails. Change the hues or the L values below if you need the separation more
 * than the cool cast. */
export const PALETTE = ['#0099A0', '#4F8AC6', '#857AC4', '#B26B9B', '#519962'];
export const PALETTE_DARK = ['#14BBC2', '#67AAED', '#A497EA', '#D686BC', '#69BA7C'];

export const ICON_KEYS = [
  'cube', 'mobile', 'web', 'globe', 'scan', 'server', 'hub', 'plug', 'users', 'folder',
  'chat', 'db', 'bolt', 'box', 'chart', 'card', 'sms', 'mail', 'bell', 'map', 'bug',
  'docker', 'shield', 'cloud', 'cloudup', 'git', 'eye', 'save', 'lock', 'route',
  'cog', 'clock', 'flag', 'alert', 'key', 'layers', 'terminal', 'ai'
] as const;

/* Folders are workspace furniture, not scopes, so the set ends on a neutral
 * rather than reaching for a sixth hue the scope palette does not have. */
export const FOLDER_COLORS = [...PALETTE, '#6B8296'];

export function paintGroups(groups: Group[]): Group[] {
  return groups.map((g, i) => ({
    ...g,
    color: g.color || PALETTE[i % PALETTE.length],
    colorDark: g.colorDark || PALETTE_DARK[i % PALETTE_DARK.length]
  }));
}

/** Classic four-band layout used by templates and history-diff fixtures.
 * New blank projects stay empty; this pack is opt-in. */
export const STARTER_LAYERS = [
  { id: 'clients', name: 'Client channels', desc: 'Web · Mobile' },
  { id: 'services', name: 'Services & APIs', desc: 'Business logic' },
  { id: 'data', name: 'Data & storage', desc: 'OLTP · Cache · Objects' },
  { id: 'infra', name: 'Infrastructure', desc: 'Supports everything above' }
];

export const STARTER_GROUPS = () => paintGroups([
  { id: 'core', name: 'Core', short: 'Core' },
  { id: 'vendor', name: 'Third parties', short: 'Vendors' }
]);

/** Prefill when the author adds a flow or step by hand (and short journeys). */
export const DEFAULT_FLOW_COPY = {
  en: {
    name: 'New flow',
    firstStep: 'First step',
    nextStep: 'Next step',
    newStep: 'New step',
    sub: 'Consumer · under an hour',
    note: 'What breaks if a step fails, who owns the recovery.',
    stepDescription: 'What this step does.'
  },
  fr: {
    name: 'Nouveau parcours',
    firstStep: 'Première étape',
    nextStep: 'Étape suivante',
    newStep: 'Nouvelle étape',
    sub: 'Consommateur · moins d’une heure',
    note: 'Ce qui casse si une étape échoue, et qui reprend.',
    stepDescription: 'Ce que fait cette étape.'
  }
} as const;

export function flowCopy(lang?: string) {
  return lang === 'fr' ? DEFAULT_FLOW_COPY.fr : DEFAULT_FLOW_COPY.en;
}

/** Fill missing subtitle, side note, and step descriptions — never overwrite authored copy. */
export function fillFlowDefaults(flow: Flow, lang?: string): Flow {
  const copy = flowCopy(lang);
  return {
    ...flow,
    sub: flow.sub?.trim() ? flow.sub : copy.sub,
    note: flow.note?.trim() ? flow.note : copy.note,
    steps: (flow.steps || []).map(step => ({
      ...step,
      description: step.description?.trim() ? step.description : copy.stepDescription
    }))
  };
}

/** Manual "Add a flow" seed: no phantom step when the canvas is empty. */
export function blankManualFlow(doc: Architecture): Flow {
  const copy = flowCopy(doc.meta.lang);
  const seeds = doc.components.slice(0, 2);
  return {
    id: slugify('flow', doc.flows.map(flow => flow.id)),
    name: copy.name,
    group: seeds[0]?.group,
    sub: copy.sub,
    note: copy.note,
    steps: seeds.map((component, index) => ({
      component: component.id,
      title: index === 0 ? copy.firstStep : copy.nextStep,
      description: copy.stepDescription
    }))
  };
}

/** Remove a component and its inbound edges. Empty flows stay — they are being authored. */
export function deleteComponent(doc: Architecture, componentId: string): void {
  doc.components = doc.components.filter(component => component.id !== componentId)
    .map(component => {
      const deps = (component.deps || []).filter(id => id !== componentId);
      const links = component.links?.filter(link => link.to !== componentId);
      return { ...component, deps, links: links?.length ? links : undefined };
    });
  doc.flows = doc.flows.map(flow => ({
    ...flow,
    steps: flow.steps.filter(step => step.component !== componentId)
  }));
  pruneUnusedLayersAndScopes(doc);
  syncGatedPresetSections(doc);
}

/** A new project starts empty on the diagram — layers and scopes appear when
 * bricks are placed or the author adds them in the palette. Content headings
 * for Flows / Tech stack ship with usable defaults. */
export function blankArchitecture(name = 'New architecture'): Architecture {
  return {
    meta: {
      lang: 'en',
      name,
      tagline: 'Architecture Explorer',
      title: name,
      intro: '',
      facts: []
    },
    theme: { brand: '#0E7C8A', brandDark: '#00E5FF', logo: 'cube' },
    ui: {
      defaultTheme: 'light',
      views: { overview: true, architecture: true, flows: true, stack: true },
      flowSpeedMs: 1500,
      flows: {
        title: 'Flows',
        subtitle: 'End-to-end journeys — which component takes over at each step.'
      },
      stack: {
        title: 'Tech stack',
        subtitle: 'Everything running in production, filterable by category and scope.'
      }
    },
    groups: [],
    layers: [],
    zones: [],
    environments: [],
    components: [],
    technologies: [],
    flows: [],
    sections: [],
    decisions: []
  };
}

/** Drop layers and scopes that no remaining component references. */
export function pruneUnusedLayersAndScopes(doc: Architecture): void {
  const usedLayers = new Set(doc.components.map(component => component.layer));
  const usedGroups = new Set(doc.components.map(component => component.group));
  doc.layers = doc.layers.filter(layer => usedLayers.has(layer.id));
  doc.groups = doc.groups.filter(group => usedGroups.has(group.id));
  const remainingGroups = new Set(doc.groups.map(group => group.id));
  doc.technologies = doc.technologies.map(technology => ({
    ...technology,
    groups: technology.groups?.filter(group => remainingGroups.has(group))
  }));
}

/** Fill in anything an imported or older document is missing. */
export function normalizeArchitecture(input: Partial<Architecture>): Architecture {
  const base = blankArchitecture(input.meta?.name || 'Imported architecture');
  const groups = input.groups !== undefined ? input.groups : base.groups;
  const layers = input.layers !== undefined ? input.layers : base.layers;
  const doc: Architecture = {
    ...base,
    ...input,
    meta: { ...base.meta, ...(input.meta || {}) },
    theme: { ...base.theme, ...(input.theme || {}) },
    ui: {
      ...base.ui,
      ...(input.ui || {}),
      views: { ...base.ui.views, ...(input.ui?.views || {}) },
      flows: { ...base.ui.flows, ...(input.ui?.flows || {}) },
      stack: { ...base.ui.stack, ...(input.ui?.stack || {}) },
      architecture: normalizeArchitectureUi(input.ui?.architecture),
      flowSpeedMs: input.ui?.flowSpeedMs ?? base.ui.flowSpeedMs
    },
    groups: paintGroups(groups),
    layers: layers.map(layer => {
      const lang = input.meta?.lang === 'fr' ? 'fr' : 'en';
      const slugName = !layer.name || layer.name === layer.id || /^[a-z0-9_-]+$/.test(layer.name);
      return {
        ...layer,
        name: slugName ? displayLayerLabel(layer.id, lang) : displayLayerLabel(layer.name, lang)
      };
    }),
    zones: normalizeZones(input.zones),
    environments: normalizeEnvironments(input.environments),
    components: input.components || [],
    technologies: input.technologies || [],
    flows: input.flows || [],
    sections: input.sections || [],
    decisions: input.decisions ?? []
  };

  const groupIds = new Set(doc.groups.map(g => g.id));
  const layerIds = new Set(doc.layers.map(l => l.id));
  const zoneIds = new Set(doc.zones.map(z => z.id));
  const envIds = new Set(doc.environments.map(e => e.id));
  const compIds = new Set(doc.components.map(c => c.id));

  const lang = doc.meta.lang === 'fr' ? 'fr' : 'en';
  const catalog = buildCatalogSnapshot(lang);

  doc.components = doc.components.map(c => {
    const deps = (c.deps || []).filter(d => compIds.has(d) && d !== c.id);
    const brickId = (c.brick && isBrickId(c.brick) ? c.brick : undefined)
      || (c.role && isBrickId(c.role) ? c.role : undefined);
    const brick = brickId ? catalog.bricks[brickId] : undefined;
    return {
      ...c,
      brick: c.brick ?? brickId,
      purpose: c.purpose || brick?.purpose,
      concernTags: c.concernTags?.length
        ? c.concernTags
        : (brick?.concernTags?.length ? [...brick.concernTags] : undefined),
      group: groupIds.has(c.group) ? c.group : (doc.groups[0]?.id ?? c.group),
      layer: layerIds.has(c.layer) ? c.layer : (doc.layers[0]?.id ?? c.layer),
      /* A scope and a layer fall back to the first one, because a component has
       * to be somewhere. A zone does not: unzoned is a real answer, and the
       * only honest one for a pointer to a zone that is gone. */
      zone: c.zone && zoneIds.has(c.zone) ? c.zone : undefined,
      deployedOn: cleanDeployedOn(c.deployedOn),
      envs: normalizeEnvs(c.envs, envIds),
      tech: c.tech || [],
      features: c.features || [],
      notes: c.notes || [],
      /* An invented mark would fall through every switch in three renderers and
       * silently draw as "already there", which is the one reading a transition
       * diagram must never give by accident. */
      state: isLifecycle(c.state) ? c.state : undefined,
      marks: normalizeMarks(c.marks),
      deps,
      links: normalizeLinks(c.links, deps)
    };
  });

  /* One spelling per platform, document-wide. Done here rather than per
   * component because it is the only pass that sees them all — and a free-text
   * field that splits under case is a filter that hides half of what it says it
   * is showing. */
  canonicalise(doc.components);

  /* A step pointing at a deleted component would crash the viewer, so those go.
   * A flow with no steps left is kept: it is almost always one being authored,
   * and dropping it here would delete the user's work on the next autosave. */
  doc.flows = doc.flows
    .map(f => ({ ...f, steps: (f.steps || []).filter(s => compIds.has(s.component)) }))
    .map(f => fillFlowDefaults(f, lang));

  /* Add missing gated chapters / drop stale ones — do not refresh bodies, or
   * every autosave would wipe edits in Sections. Place/delete pass refresh. */
  syncGatedPresetSections(doc, undefined, { refresh: false });
  return doc;
}

/** Keep the zones that are well formed, and cut the two things that would hang
 *  a renderer: a `parent` pointing at nothing, and a cycle.
 *
 *  A cycle is the dangerous one. Every surface walks the ancestry of a zone to
 *  decide what a box contains and how far to inset it, so `a → b → a` is an
 *  infinite loop in three renderers rather than a wrong drawing. `ancestry()`
 *  also stops on a repeat, so this is the second of two guards, not the only
 *  one — but it is the one that makes the stored document sane, which is what
 *  the editor and the export both read back. */
/** The declared environments: an id and a name, once each, in the order they
 *  were written. That order is the pipeline — dev, SA, prod — and every table
 *  downstream reads its columns from it, so it is never re-sorted here. */
function normalizeEnvironments(input: Environment[] | undefined): Environment[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Environment[] = [];
  for (const e of input) {
    if (!e || typeof e.id !== 'string' || !e.id || seen.has(e.id)) continue;
    seen.add(e.id);
    const clean: Environment = { id: e.id, name: e.name?.trim() || e.id };
    if (e.note?.trim()) clean.note = e.note.trim();
    out.push(clean);
  }
  return out;
}

/** A component's entries: one per declared environment, none blank, no pointers
 *  at an environment that is gone.
 *
 *  An entry naming an environment and saying nothing else *is* dropped here even
 *  though it would be a real answer, because there is no way to have authored it
 *  on purpose — the editor writes an entry only when a field is filled in, and
 *  clears it when the last one empties. Returns `undefined` when nothing
 *  survives, so a document that names no environment exports exactly as it did
 *  before the field existed. */
function normalizeEnvs(input: EnvEntry[] | undefined, envIds: Set<string>): EnvEntry[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const seen = new Set<string>();
  const out: EnvEntry[] = [];
  for (const e of input) {
    if (!e || typeof e.env !== 'string' || !envIds.has(e.env) || seen.has(e.env)) continue;
    const clean: EnvEntry = { env: e.env };
    if (e.url?.trim()) clean.url = e.url.trim();
    if (e.version?.trim()) clean.version = e.version.trim();
    if (e.note?.trim()) clean.note = e.note.trim();
    if (envEntryIsEmpty(clean)) continue;
    seen.add(e.env);
    out.push(clean);
  }
  return out.length ? out : undefined;
}

function normalizeZones(input: Zone[] | undefined): Zone[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const clean: Zone[] = [];

  for (const z of input) {
    if (!z || typeof z.id !== 'string' || !z.id || seen.has(z.id)) continue;
    seen.add(z.id);
    const out: Zone = { id: z.id, name: z.name?.trim() || z.id };
    if (isZoneKind(z.kind)) out.kind = z.kind;
    if (z.note?.trim()) out.note = z.note.trim();
    if (typeof z.parent === 'string' && z.parent && z.parent !== z.id) out.parent = z.parent;
    /* Only `true` is kept. The flag asks for a shelf; whether it gets one is
     * `bandPlan`'s call, so storing anything richer here would be storing a
     * decision this pass is in no position to make. */
    if (z.stack === true) out.stack = true;
    clean.push(out);
  }

  /* Parents are resolved in a second pass: a zone may be declared before the one
   * it sits inside, and dropping a forward reference would make the order of the
   * array meaningful, which it is not. */
  const ids = new Set(clean.map(z => z.id));
  const by = new Map(clean.map(z => [z.id, z]));
  for (const z of clean) {
    if (!z.parent) continue;
    if (!ids.has(z.parent)) { delete z.parent; continue; }
    const walked = new Set<string>([z.id]);
    let at = by.get(z.parent);
    while (at) {
      if (walked.has(at.id)) { delete z.parent; break; }
      walked.add(at.id);
      at = at.parent ? by.get(at.parent) : undefined;
    }
  }

  return clean;
}

/** Clean the diagram's own options.
 *
 *  Only the protocol convention needs it: a blank `defaultProtocol` would turn
 *  labels on and then print "All calls are  unless…", and an invented
 *  `protocolLabels` would fall through every switch in three renderers.
 *  Returns `undefined` when the author has set nothing, so `ui.architecture`
 *  stays absent from the JSON rather than appearing as an empty object. */
function normalizeArchitectureUi(arch: Ui['architecture']): Ui['architecture'] {
  if (!arch) return undefined;
  const out: NonNullable<Ui['architecture']> = { ...arch };
  const fallback = arch.defaultProtocol?.trim();
  if (fallback) out.defaultProtocol = fallback; else delete out.defaultProtocol;
  if (!arch.protocolLabels || !PROTOCOL_LABEL_MODES.includes(arch.protocolLabels)) {
    delete out.protocolLabels;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Keep only the annotations that describe a dependency this component still
 *  has: one per target, none empty, no invented kinds.
 *
 *  `deps` decides which edges exist and `links` only describes them, so the
 *  two can never disagree — deleting a dependency takes its annotation with
 *  it, and an import carrying a link to nowhere loses it here rather than
 *  surfacing as a phantom row in the inspector. Returns `undefined` when
 *  nothing survives, so a document that uses none of this exports exactly as
 *  it did before the field existed. */
function normalizeLinks(links: Link[] | undefined, deps: string[]): Link[] | undefined {
  if (!links?.length) return undefined;
  const allowed = new Set(deps);
  const seen = new Set<string>();
  const out: Link[] = [];

  for (const l of links) {
    if (!l || typeof l.to !== 'string' || !allowed.has(l.to) || seen.has(l.to)) continue;
    const clean: Link = { to: l.to };
    if (l.kind && LINK_KINDS.includes(l.kind)) clean.kind = l.kind;
    if (l.protocol?.trim()) clean.protocol = l.protocol.trim();
    if (l.note?.trim()) clean.note = l.note.trim();
    if (isLifecycle(l.state)) clean.state = l.state;
    if (linkIsEmpty(clean)) continue;
    seen.add(l.to);
    out.push(clean);
  }

  return out.length ? out : undefined;
}

/* ---------------------------------------------------------------- sections */

export const SECTION_TYPES: { type: SectionType; label: string; blurb: string }[] = [
  { type: 'cards',    label: 'Cards',     blurb: 'A grid of titled cards with bullet points — the workhorse.' },
  { type: 'timeline', label: 'Timeline',  blurb: 'Dated phases down a line, with optional cards alongside.' },
  { type: 'table',    label: 'Table',     blurb: 'Free-form rows and columns, e.g. risks and their mitigations.' },
  { type: 'compare',  label: 'Compare',   blurb: 'Two or more poles side by side, plus a comparison table.' },
  { type: 'text',     label: 'Text',      blurb: 'Prose blocks — the least structured of the five.' }
];

/** A new section of `type`, with an id unique within `taken`. */
export function blankSection(type: SectionType, taken: Iterable<string>): Section {
  const label = SECTION_TYPES.find(s => s.type === type)?.label ?? 'Section';
  const base = { id: slugify(label, taken), tab: label, type, title: label, subtitle: '' };
  switch (type) {
    case 'cards':    return { ...base, items: [] };
    case 'timeline': return { ...base, lineTitle: '', items: [], aside: [] };
    case 'table':    return { ...base, columns: [{ label: 'Column' }, { label: 'Column' }], rows: [] };
    case 'compare':  return { ...base, columns: [] };
    case 'text':     return { ...base, blocks: [] };
  }
}

/** Turn a display name into a stable, URL-safe id, unique within `taken`. */
export function slugify(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base = (name || 'item')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'item';
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
