/* Template registry and the resolution algorithm.
 *
 * `instantiate()` turns an abstract template plus a deployment target into an
 * ordinary `Architecture`. Nothing links the result back to the template: the
 * document is editable, exportable and forgettable in the usual way.
 */

import { normalizeArchitecture } from '../defaults';
import type { Architecture, Component, Flow, Section, Technology } from '../types';
import { SERVICES_VERIFIED_ON } from './services';
import {
  LANGS, TARGETS, TARGET_LABELS,
  resolveDeep, t, tList,
  type CloudTarget, type Lang, type ResolvedTarget, type Template, type TemplateSummary
} from './types';

import { serverlessMvp } from './serverless-mvp';
import { saasMultitenant } from './saas-multitenant';
import { rag } from './rag';
import { eventDriven } from './event-driven';
import { monolith } from './monolith';
import { multiService } from './multi-service';

export * from './types';
export { SERVICES, SERVICES_VERIFIED_ON } from './services';

/** Registry order is the order of the picker. Simplest first. */
export const TEMPLATES: Template[] = [
  serverlessMvp, saasMultitenant, rag, eventDriven, monolith, multiService
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find(x => x.id === id);
}

/* ------------------------------------------------------------------ strings */

const DEPLOYMENT_SECTION_ID = 'deployment';

const STR = {
  deploymentTitle:   { en: 'Deployment', fr: 'Déploiement' },
  deploymentSub:     {
    en: 'How each abstract component maps onto {target}. Generated at creation — edit it like any other section.',
    fr: 'Correspondance de chaque composant abstrait sur {target}. Généré à la création — modifiable comme toute autre section.'
  },
  colComponent:      { en: 'Component', fr: 'Composant' },
  colService:        { en: 'Service', fr: 'Service' },
  colNotes:          { en: 'Notes', fr: 'Notes' },
  verified:          {
    en: 'Service names checked on {date}. Vendors rename things — re-read this table before you quote it.',
    fr: 'Noms de services vérifiés le {date}. Les fournisseurs renomment — relis cette table avant de la citer.'
  },
  omitted:           {
    en: 'Not available on {target}, and dropped from this document: {list}.',
    fr: 'Sans équivalent sur {target}, et retirés de ce document : {list}.'
  },
  rewired:           {
    en: 'On {target} this used to go through {list}, which has no equivalent here — the dependency was rewired straight through.',
    fr: 'Sur {target}, cette dépendance passait par {list}, sans équivalent ici — elle a été rebranchée directement.'
  },
  principle:         {
    en: '<b>This is a starting point, not a recommendation.</b> Generated from the “{template}” template for {target} on {date}. Every component still has to be confirmed, renamed or deleted against your actual context. Delete this note once you have reviewed it.',
    fr: '<b>Point de départ, pas une recommandation.</b> Généré depuis le modèle « {template} » pour {target} le {date}. Chaque composant doit encore être confirmé, renommé ou supprimé au regard de ton contexte réel. Supprime cette note une fois la revue faite.'
  },
  kicker:            { en: 'Template: {template} · {target} · {date}', fr: 'Modèle : {template} · {target} · {date}' },
  factTemplate:      { en: 'Template', fr: 'Modèle' },
  factTarget:        { en: 'Deployment target', fr: 'Cible de déploiement' },
  factCreated:       { en: 'Created', fr: 'Créé le' },
  distribution:      {
    en: 'Every component belongs to exactly one scope of responsibility.',
    fr: 'Chaque composant appartient à exactement un périmètre de responsabilité.'
  },
  usedBy:            { en: 'Used by {list}.', fr: 'Utilisé par {list}.' },
  archSubtitle:      {
    en: 'Hover a component to reveal its dependencies, click it for the detail sheet.',
    fr: 'Survole un composant pour révéler ses dépendances, clique pour la fiche détaillée.'
  }
} as const;

const fill = (s: string, vars: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

const list = (items: string[], lang: Lang): string =>
  items.length < 2 ? (items[0] || '')
    : `${items.slice(0, -1).join(', ')} ${lang === 'fr' ? 'et' : 'and'} ${items[items.length - 1]}`;

/* ------------------------------------------------------------- instantiate */

export interface InstantiateOptions {
  target: CloudTarget;
  lang: Lang;
  projectName: string;
  /** ISO date, injected so tests and snapshots stay deterministic. */
  today?: string;
  /** Last check date for vendor service names. Defaults to `SERVICES_VERIFIED_ON`. */
  verifiedOn?: string;
}

export function instantiate(tpl: Template, opts: InstantiateOptions): Architecture {
  const { target, lang, projectName } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const targetLabel = TARGET_LABELS[target][lang];
  const resolved = target === 'agnostic' ? null : target;

  /* 1 — filter ------------------------------------------------------------ */
  const omitted = new Set(
    tpl.components.filter(c => resolved && c.cloud?.[resolved]?.omit).map(c => c.id)
  );
  const kept = tpl.components.filter(c => !omitted.has(c.id));

  /* 2 — merge ------------------------------------------------------------- */
  const overrideOf = (id: string) => {
    const c = tpl.components.find(x => x.id === id);
    return resolved ? c?.cloud?.[resolved] : undefined;
  };
  const displayName = (id: string): string => {
    const c = tpl.components.find(x => x.id === id);
    if (!c) return id;
    const o = overrideOf(id);
    return t(o?.name ?? c.name, lang);
  };

  /* 3 — rewire dependencies through omitted components (Q1: keep the graph
   *     connected, and say so on the component that lost a hop). */
  const originalDeps = new Map(tpl.components.map(c => [c.id, c.deps || []]));
  function through(id: string, seen: Set<string>): string[] {
    if (!omitted.has(id)) return [id];
    if (seen.has(id)) return [];
    seen.add(id);
    return (originalDeps.get(id) || []).flatMap(d => through(d, seen));
  }

  const components: Component[] = kept.map(c => {
    const o = overrideOf(c.id);
    const bridged: string[] = [];
    const deps: string[] = [];
    (c.deps || []).forEach(d => {
      if (!omitted.has(d)) { if (!deps.includes(d)) deps.push(d); return; }
      bridged.push(displayName(d));
      through(d, new Set()).forEach(x => { if (x !== c.id && !deps.includes(x)) deps.push(x); });
    });

    const notes = [
      ...(o?.note ? [t(o.note, lang)] : []),
      ...(bridged.length
        ? [fill(STR.rewired[lang], { target: targetLabel, list: list(bridged, lang) })]
        : []),
      ...tList(c.notes, lang)
    ];

    return {
      id: c.id,
      name: t(o?.name ?? c.name, lang),
      group: c.group,
      layer: c.layer,
      ...(c.icon ? { icon: c.icon } : {}),
      ...(c.badge ? { badge: t(c.badge, lang) } : {}),
      tech: o?.tech ?? (c.tech || []),
      ...(c.role ? { role: t(c.role, lang) } : {}),
      features: tList(c.features, lang),
      notes,
      deps
    };
  });

  /* 4 — flows: a step on a missing component is a lie; a one-step flow is
   *     not a flow. */
  const liveIds = new Set(components.map(c => c.id));
  const flows: Flow[] = (tpl.flows || [])
    .map(f => ({
      id: f.id,
      name: t(f.name, lang),
      ...(f.group ? { group: f.group } : {}),
      ...(f.sub ? { sub: t(f.sub, lang) } : {}),
      ...(f.note ? { note: t(f.note, lang) } : {}),
      steps: f.steps
        .filter(s => liveIds.has(s.component))
        .map(s => ({
          component: s.component,
          title: t(s.title, lang),
          ...(s.description ? { description: t(s.description, lang) } : {})
        }))
    }))
    .filter(f => f.steps.length >= 2);

  /* groups and layers that lost every component would render as empty bands */
  const usedGroups = new Set(components.map(c => c.group));
  const usedLayers = new Set(components.map(c => c.layer));
  const groups = tpl.groups.filter(g => usedGroups.has(g.id)).map(g => ({
    id: g.id, name: t(g.name, lang),
    ...(g.short ? { short: t(g.short, lang) } : {}),
    ...(g.description ? { description: t(g.description, lang) } : {}),
    ...(g.color ? { color: g.color, colorDark: g.colorDark } : {})
  }));
  const layers = tpl.layers.filter(l => usedLayers.has(l.id)).map(l => ({
    id: l.id, name: t(l.name, lang), ...(l.desc ? { desc: t(l.desc, lang) } : {})
  }));

  /* 5 — sections, plus the generated deployment table */
  const sections: Section[] = (tpl.sections || []).map(s => resolveDeep<Section>(s, lang));
  if (resolved) sections.push(deploymentSection(tpl, {
    lang, target: resolved, targetLabel, omitted, displayName, overrideOf,
    verifiedOn: opts.verifiedOn ?? SERVICES_VERIFIED_ON,
  }));

  /* The technology table is a by-product of the resolved components: on a cloud
   * target it is exactly the list of services the document commits to. It is
   * described by the *abstract* component name — on a resolved target the
   * component is already named after the service, and "Caddy: used by Caddy"
   * tells the reader nothing. */
  const abstractNames = new Map(tpl.components.map(c => [c.id, t(c.name, lang)]));
  const technologies = collectTechnologies(components, layers, abstractNames, lang);

  const doc: Architecture = {
    meta: {
      lang,
      name: projectName,
      tagline: t(tpl.tagline, lang),
      version: 'v0.1',
      kicker: fill(STR.kicker[lang], { template: t(tpl.name, lang), target: targetLabel, date: today }),
      title: t(tpl.name, lang),
      intro: t(tpl.intro ?? tpl.tagline, lang),
      facts: [
        { label: STR.factTemplate[lang], value: t(tpl.name, lang) },
        { label: STR.factTarget[lang], value: targetLabel },
        { label: STR.factCreated[lang], value: today }
      ],
      distributionNote: STR.distribution[lang],
      principle: fill(STR.principle[lang], {
        template: t(tpl.name, lang), target: targetLabel, date: today
      }),
      footer: projectName
    },
    theme: { brand: tpl.accent, brandDark: tpl.accentDark, logo: tpl.icon },
    ui: {
      defaultTheme: 'light',
      views: { overview: true, architecture: true, flows: flows.length > 0, stack: technologies.length > 0 },
      tabs: [
        'overview', 'architecture',
        ...sections.map(s => s.id),
        ...(flows.length ? ['flows'] : []),
        ...(technologies.length ? ['stack'] : [])
      ],
      architecture: { subtitle: STR.archSubtitle[lang] }
    },
    groups,
    layers,
    /* No template declares a zone. The six describe *abstract* architectures,
     * and a deployment boundary is the most target-specific thing a diagram can
     * carry — "OpenShift" is an answer to a question the template deliberately
     * leaves to whoever instantiates it. */
    zones: [],
    /* Nor an environment, and for the same reason: how many stages sit between
     * a laptop and production is a fact about an organisation, not about an
     * architecture. */
    environments: [],
    components,
    technologies,
    flows,
    sections,
    decisions: []
  };

  return normalizeArchitecture(doc);
}

/* ------------------------------------------------------- deployment section */

function deploymentSection(tpl: Template, ctx: {
  lang: Lang; target: Exclude<CloudTarget, 'agnostic'>; targetLabel: string;
  omitted: Set<string>; displayName: (id: string) => string;
  overrideOf: (id: string) => { name?: unknown; tech?: string[]; note?: unknown } | undefined;
  verifiedOn: string;
}): Section {
  const { lang, targetLabel, omitted } = ctx;
  const layerOrder = new Map(tpl.layers.map((l, i) => [l.id, i]));

  /* A component whose name was left abstract on purpose still has a mapping —
   * it lives in its technologies. Dropping it here would lose exactly the row
   * a reader looks this table up for. */
  const rows = tpl.components
    .filter(c => !omitted.has(c.id))
    .map(c => ({ c, o: ctx.overrideOf(c.id) }))
    .filter(({ o }) => !!o?.name || !!o?.tech?.length)
    .sort((a, b) => (layerOrder.get(a.c.layer) ?? 0) - (layerOrder.get(b.c.layer) ?? 0))
    .map(({ c, o }) => [
      t(c.name, lang),
      o!.name ? t(o!.name as never, lang) : (o!.tech as string[]).join(' · '),
      o!.note ? t(o!.note as never, lang) : '—'
    ]);

  const dropped = tpl.components.filter(c => omitted.has(c.id)).map(c => t(c.name, lang));
  const notes = [
    fill(STR.verified[lang], { date: ctx.verifiedOn }),
    ...(dropped.length ? [fill(STR.omitted[lang], { target: targetLabel, list: list(dropped, lang) })] : [])
  ];

  return {
    id: DEPLOYMENT_SECTION_ID,
    tab: STR.deploymentTitle[lang],
    type: 'table',
    title: STR.deploymentTitle[lang],
    subtitle: fill(STR.deploymentSub[lang], { target: targetLabel }),
    note: notes.join(' '),
    columns: [
      { label: STR.colComponent[lang], width: '22%' },
      { label: STR.colService[lang], width: '30%' },
      { label: STR.colNotes[lang] }
    ],
    rows
  };
}

/* ------------------------------------------------------------- technologies */

function collectTechnologies(
  components: Component[], layers: { id: string; name: string }[],
  abstractNames: Map<string, string>, lang: Lang
): Technology[] {
  const layerName = new Map(layers.map(l => [l.id, l.name]));
  const byName = new Map<string, { category: string; groups: Set<string>; users: string[] }>();

  components.forEach(c => {
    const user = abstractNames.get(c.id) ?? c.name;
    (c.tech || []).forEach(name => {
      const entry = byName.get(name)
        ?? { category: layerName.get(c.layer) || '', groups: new Set<string>(), users: [] };
      entry.groups.add(c.group);
      if (!entry.users.includes(user)) entry.users.push(user);
      byName.set(name, entry);
    });
  });

  return [...byName.entries()].map(([name, e]) => ({
    name,
    category: e.category,
    description: fill(STR.usedBy[lang], { list: list(e.users.slice(0, 3), lang) }),
    groups: [...e.groups]
  }));
}

/* ---------------------------------------------------------------- summaries */

/** Metadata for the picker: both languages, no component bodies. */
export function templateSummariesFrom(templates: Template[]): TemplateSummary[] {
  return templates.map(tpl => {
    const counts = Object.fromEntries(
      TARGETS.map(target => [
        target,
        target === 'agnostic'
          ? tpl.components.length
          : tpl.components.filter(c => !c.cloud?.[target as ResolvedTarget]?.omit).length
      ])
    ) as TemplateSummary['counts'];

    const both = <T>(pick: (l: Lang) => T) =>
      Object.fromEntries(LANGS.map(l => [l, pick(l)])) as Record<Lang, T>;

    return {
      id: tpl.id,
      kind: 'architecture' as const,
      icon: tpl.icon,
      accent: tpl.accent,
      accentDark: tpl.accentDark,
      name: both(l => t(tpl.name, l)),
      tagline: both(l => t(tpl.tagline, l)),
      whenToUse: both(l => tList(tpl.whenToUse, l)),
      whenNotToUse: both(l => tList(tpl.whenNotToUse, l)),
      supportedTargets: tpl.supportedTargets,
      counts
    };
  });
}

export function templateSummaries(): TemplateSummary[] {
  return templateSummariesFrom(TEMPLATES);
}
