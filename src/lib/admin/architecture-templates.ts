import { slugify } from '../defaults';
import { db, now, plain, plainAll } from '../db';
import type { CatalogIssue } from '../lego/admin-catalog';
import { instantiate, TEMPLATES, t, tList } from '../templates';
import type {
  CloudTarget,
  L10n,
  Template,
  TemplateComponent,
  TemplateFlow,
  TemplateGroup,
  TemplateLayer,
  TemplateSection,
  TemplateTechnology,
} from '../templates/types';
import type {
  Architecture,
  CardsSection,
  CompareSection,
  Component,
  Flow,
  Group,
  Layer,
  Section,
  TableSection,
  Technology,
  TextSection,
  TimelineSection,
} from '../types';

export const ARCHITECTURE_TEMPLATES_DOMAIN = 'architecture-templates';

export const LOCKED_ARCHITECTURE_TEMPLATE_IDS = [
  'serverless-mvp',
  'saas-multitenant',
  'rag',
  'event-driven',
  'monolith',
  'multi-service',
] as const;

export type LockedArchitectureTemplateId = (typeof LOCKED_ARCHITECTURE_TEMPLATE_IDS)[number];

export type ArchitectureTemplateAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  templateCount: number;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export type PublishArchitectureTemplatesResult =
  | { ok: true; publishedAt: string }
  | { ok: false; issues: CatalogIssue[] };

export type ArchitectureTemplateCreate = {
  id?: string;
  nameEn: string;
  nameFr?: string;
  spec?: Template;
};

export type ArchitectureTemplatePatch = {
  nameEn?: string;
  nameFr?: string;
  meta?: {
    icon?: string;
    accent?: string;
    accentDark?: string;
    taglineEn?: string;
    taglineFr?: string;
    whenToUseEn?: string[];
    whenToUseFr?: string[];
    whenNotToUseEn?: string[];
    whenNotToUseFr?: string[];
  };
  spec?: Template;
  /** Agnostic Architecture edit snapshot — merged into `spec` without wiping `cloud`. */
  snapshot?: Architecture;
};

export type AdminArchitectureListItem = {
  id: string;
  kind: 'architecture';
  editable: true;
  locked: boolean;
  nameEn: string;
  nameFr: string;
  sortOrder: number;
  featured: false;
  componentCount: number;
  sectionCount: number;
  flowCount: number;
  accent: string;
  icon: string;
  taglineEn: string;
  taglineFr: string;
};

function getRow<T>(sql: string, ...params: (string | number | null)[]): T | null {
  const raw = db.prepare(sql).get(...params);
  if (!raw) return null;
  return plain<T>(raw);
}

function rows<T>(sql: string, ...values: (string | number | null)[]): T[] {
  return plainAll<T>(db.prepare(sql).all(...values));
}

function pair(v: L10n | undefined): { en: string; fr: string } {
  if (!v) return { en: '', fr: '' };
  if (typeof v === 'string') return { en: v, fr: v };
  return { en: v.en ?? '', fr: v.fr ?? '' };
}

function markDirty(): void {
  db.prepare('UPDATE content_domains SET status=?, published_at=published_at WHERE id=?')
    .run('draft', ARCHITECTURE_TEMPLATES_DOMAIN);
}

function parseTemplate(raw: string | null): Template {
  if (!raw) throw new Error('architecture template payload_json is missing');
  return JSON.parse(raw) as Template;
}


function sortArchitectureRows<T extends { id: string }>(items: T[]): T[] {
  const lockedOrder = new Map<string, number>(LOCKED_ARCHITECTURE_TEMPLATE_IDS.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = lockedOrder.has(a.id) ? lockedOrder.get(a.id)! : 1000;
    const bi = lockedOrder.has(b.id) ? lockedOrder.get(b.id)! : 1000;
    if (ai !== bi) return ai - bi;
    return a.id.localeCompare(b.id);
  });
}

export function isLockedArchitectureTemplate(id: string): boolean {
  return (LOCKED_ARCHITECTURE_TEMPLATE_IDS as readonly string[]).includes(id);
}

function existingIds(): Set<string> {
  return new Set(rows<{ id: string }>(
    'SELECT id FROM architecture_templates WHERE domain_id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
  ).map(r => r.id));
}

function blankTemplate(id: string, nameEn: string, nameFr: string): Template {
  return {
    id,
    name: { en: nameEn, fr: nameFr },
    tagline: { en: nameEn, fr: nameFr },
    icon: 'cube',
    accent: '#4F8AC6',
    accentDark: '#00E5FF',
    whenToUse: [{ en: 'A custom starting point.', fr: 'Un point de départ personnalisé.' }],
    whenNotToUse: [{ en: 'Not a recommendation.', fr: 'Pas une recommandation.' }],
    supportedTargets: ['agnostic', 'aws', 'gcp', 'azure', 'selfhosted'],
    groups: [{ id: 'app', name: { en: 'Application', fr: 'Application' } }],
    layers: [{ id: 'compute', name: { en: 'Compute', fr: 'Calcul' } }],
    components: [{
      id: 'app',
      name: { en: 'Application', fr: 'Application' },
      group: 'app',
      layer: 'compute',
    }],
  };
}

function validatePayload(tpl: Template, expectedId?: string): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const id = tpl.id?.trim() ?? '';
  if (!id) {
    issues.push({ code: 'invalid_architecture_template', message: 'Template is missing id', field: 'id' });
  } else if (expectedId && id !== expectedId) {
    issues.push({
      code: 'invalid_architecture_template',
      message: `Template id "${id}" does not match row "${expectedId}"`,
      entityId: expectedId,
      field: 'id',
    });
  }
  const name = pair(tpl.name);
  if (!name.en.trim() && !name.fr.trim()) {
    issues.push({
      code: 'invalid_architecture_template',
      message: `Template "${id || expectedId || '?'}" is missing name`,
      entityId: id || expectedId,
      field: 'name',
    });
  }
  if (!Array.isArray(tpl.components) || tpl.components.length < 1) {
    issues.push({
      code: 'invalid_architecture_template',
      message: `Template "${id || expectedId || '?'}" needs at least one component`,
      entityId: id || expectedId,
      field: 'components',
    });
  }
  return issues;
}

/** Ensures domain + seeds the six locked hyperscaler templates from the code registry. */
export function ensureArchitectureTemplatesDomain(): void {
  const existing = getRow<{ id: string }>('SELECT id FROM content_domains WHERE id=?', ARCHITECTURE_TEMPLATES_DOMAIN);
  if (!existing) {
    db.prepare('INSERT INTO content_domains (id, status, published_at) VALUES (?, ?, NULL)')
      .run(ARCHITECTURE_TEMPLATES_DOMAIN, 'draft');
  }
  for (const tpl of TEMPLATES) {
    const row = getRow<{ id: string }>(
      'SELECT id FROM architecture_templates WHERE domain_id=? AND id=?',
      ARCHITECTURE_TEMPLATES_DOMAIN,
      tpl.id,
    );
    if (row) continue;
    db.prepare(
      'INSERT INTO architecture_templates (domain_id, id, payload_json) VALUES (?, ?, ?)'
    ).run(ARCHITECTURE_TEMPLATES_DOMAIN, tpl.id, JSON.stringify(tpl));
    markDirty();
  }
}

export function listArchitectureTemplatesAdmin(): AdminArchitectureListItem[] {
  ensureArchitectureTemplatesDomain();
  return sortArchitectureRows(rows<{ id: string; payload_json: string }>(
    'SELECT id, payload_json FROM architecture_templates WHERE domain_id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
  )).map((row, index) => {
    const tpl = parseTemplate(row.payload_json);
    return {
      id: tpl.id,
      kind: 'architecture' as const,
      editable: true as const,
      locked: isLockedArchitectureTemplate(tpl.id),
      nameEn: t(tpl.name, 'en'),
      nameFr: t(tpl.name, 'fr'),
      sortOrder: 100 + index,
      featured: false as const,
      componentCount: tpl.components.length,
      sectionCount: tpl.sections?.length ?? 0,
      flowCount: tpl.flows?.length ?? 0,
      accent: tpl.accent,
      icon: tpl.icon,
      taglineEn: t(tpl.tagline, 'en'),
      taglineFr: t(tpl.tagline, 'fr'),
    };
  });
}

export function getArchitectureTemplateSpec(id: string): Template | null {
  ensureArchitectureTemplatesDomain();
  const row = getRow<{ payload_json: string }>(
    'SELECT payload_json FROM architecture_templates WHERE domain_id=? AND id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
    id,
  );
  if (!row) return null;
  return parseTemplate(row.payload_json);
}

/** Admin detail: SQLite spec plus an agnostic instantiate snapshot for preview. */
export function getArchitectureTemplateAdmin(id: string) {
  const tpl = getArchitectureTemplateSpec(id);
  if (!tpl) return null;
  return {
    id: tpl.id,
    kind: 'architecture' as const,
    editable: true as const,
    locked: isLockedArchitectureTemplate(tpl.id),
    nameEn: t(tpl.name, 'en'),
    nameFr: t(tpl.name, 'fr'),
    meta: {
      icon: tpl.icon,
      accent: tpl.accent,
      accentDark: tpl.accentDark,
      taglineEn: t(tpl.tagline, 'en'),
      taglineFr: t(tpl.tagline, 'fr'),
      whenToUseEn: tList(tpl.whenToUse, 'en'),
      whenToUseFr: tList(tpl.whenToUse, 'fr'),
      whenNotToUseEn: tList(tpl.whenNotToUse, 'en'),
      whenNotToUseFr: tList(tpl.whenNotToUse, 'fr'),
    },
    supportedTargets: tpl.supportedTargets as CloudTarget[],
    spec: tpl,
    outline: {
      componentCount: tpl.components.length,
      sectionIds: (tpl.sections ?? []).map(s => s.id),
      flowCount: tpl.flows?.length ?? 0,
    },
    snapshot: instantiate(tpl, {
      target: 'agnostic',
      lang: 'en',
      projectName: t(tpl.name, 'en'),
    }),
  };
}

export function createArchitectureTemplate(input: ArchitectureTemplateCreate): string {
  ensureArchitectureTemplatesDomain();
  const taken = existingIds();
  const nameEn = input.nameEn.trim();
  if (!nameEn) throw new Error('English name is required');
  const id = input.id?.trim()
    ? slugify(input.id.trim(), new Set())
    : slugify(nameEn, taken);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error('Template id must be lowercase letters, digits and hyphens');
  }
  if (taken.has(id)) throw new Error(`Architecture template "${id}" already exists`);
  const nameFr = (input.nameFr?.trim() || nameEn).trim();
  const tpl = input.spec
    ? { ...input.spec, id }
    : blankTemplate(id, nameEn, nameFr);
  const issues = validatePayload(tpl, id);
  if (issues.length > 0) throw new Error(issues[0]!.message);
  db.prepare(
    'INSERT INTO architecture_templates (domain_id, id, payload_json) VALUES (?, ?, ?)'
  ).run(ARCHITECTURE_TEMPLATES_DOMAIN, id, JSON.stringify(tpl));
  markDirty();
  return id;
}

export function deleteArchitectureTemplate(id: string): void {
  ensureArchitectureTemplatesDomain();
  const result = db.prepare(
    'DELETE FROM architecture_templates WHERE domain_id=? AND id=?'
  ).run(ARCHITECTURE_TEMPLATES_DOMAIN, id);
  if (!result.changes) throw new Error(`architecture template not found: ${id}`);
  markDirty();
}

/**
 * Merge an edited Architecture snapshot back into a Template spec.
 * Picker meta (id/name/tagline/icon/accents/when*) stays on `current`.
 * Component `cloud` overrides are copied by id when the component still exists.
 *
 * Section conversion is best-effort: Architecture sections are lang-resolved
 * strings while TemplateSection uses L10n. We sync cards/text/timeline/table/
 * compare fields that exist on both shapes and preserve `fr` when the previous
 * section's `en` still matches. Gaps: `doc` slots, index-signature extras, and
 * any viewer-only keys not on TemplateSection are dropped.
 */
export function applyArchitectureSnapshotToSpec(current: Template, snap: Architecture): Template {
  const prevById = new Map(current.components.map(c => [c.id, c]));
  const prevGroups = new Map(current.groups.map(g => [g.id, g]));
  const prevLayers = new Map(current.layers.map(l => [l.id, l]));
  const prevFlows = new Map((current.flows ?? []).map(f => [f.id, f]));
  const prevSections = new Map((current.sections ?? []).map(s => [s.id, s]));

  const groups: TemplateGroup[] = (snap.groups ?? []).map(g => mapGroup(g, prevGroups.get(g.id)));
  const layers: TemplateLayer[] = (snap.layers ?? []).map(l => mapLayer(l, prevLayers.get(l.id)));
  const components: TemplateComponent[] = (snap.components ?? []).map(c =>
    mapComponent(c, prevById.get(c.id)),
  );
  const flows: TemplateFlow[] = (snap.flows ?? []).map(f => mapFlow(f, prevFlows.get(f.id)));
  const sections: TemplateSection[] = (snap.sections ?? [])
    .map(s => mapSection(s, prevSections.get(s.id)))
    .filter((s): s is TemplateSection => s !== null);

  const technologies: TemplateTechnology[] | undefined = snap.technologies?.length
    ? snap.technologies.map(tech => mapTechnology(tech, current.technologies))
    : current.technologies;

  return {
    ...current,
    groups,
    layers,
    components,
    flows,
    sections,
    ...(technologies ? { technologies } : {}),
  };
}

/** Preserve `fr` when previous was `{en,fr}` and `en` still equals the snapshot string. */
function mergeL10n(prev: L10n | undefined, next: string | undefined): L10n {
  const snap = next ?? '';
  if (prev && typeof prev === 'object' && !Array.isArray(prev) && prev.en === snap) {
    return { en: snap, fr: prev.fr };
  }
  return { en: snap, fr: snap };
}

function mergeL10nList(prev: L10n[] | undefined, next: string[] | undefined): L10n[] | undefined {
  if (!next) return undefined;
  return next.map((item, i) => mergeL10n(prev?.[i], item));
}

function mapGroup(g: Group, prev: TemplateGroup | undefined): TemplateGroup {
  return {
    id: g.id,
    name: mergeL10n(prev?.name, g.name),
    ...(g.short !== undefined ? { short: mergeL10n(prev?.short, g.short) } : {}),
    ...(g.description !== undefined ? { description: mergeL10n(prev?.description, g.description) } : {}),
    ...(g.color !== undefined ? { color: g.color } : {}),
    ...(g.colorDark !== undefined ? { colorDark: g.colorDark } : {}),
  };
}

function mapLayer(l: Layer, prev: TemplateLayer | undefined): TemplateLayer {
  return {
    id: l.id,
    name: mergeL10n(prev?.name, l.name),
    ...(l.desc !== undefined ? { desc: mergeL10n(prev?.desc, l.desc) } : {}),
  };
}

function mapComponent(c: Component, prev: TemplateComponent | undefined): TemplateComponent {
  const out: TemplateComponent = {
    id: c.id,
    name: mergeL10n(prev?.name, c.name),
    group: c.group,
    layer: c.layer,
  };
  if (c.icon !== undefined) out.icon = c.icon;
  if (c.badge !== undefined) out.badge = mergeL10n(prev?.badge, c.badge);
  if (c.tech !== undefined) out.tech = c.tech;
  if (c.role !== undefined) out.role = mergeL10n(prev?.role, c.role);
  const features = mergeL10nList(prev?.features, c.features);
  if (features) out.features = features;
  const notes = mergeL10nList(prev?.notes, c.notes);
  if (notes) out.notes = notes;
  if (c.deps !== undefined) out.deps = c.deps;
  if (prev?.cloud) out.cloud = structuredClone(prev.cloud);
  return out;
}

function mapFlow(f: Flow, prev: TemplateFlow | undefined): TemplateFlow {
  const prevSteps = prev?.steps ?? [];
  return {
    id: f.id,
    name: mergeL10n(prev?.name, f.name),
    ...(f.group !== undefined ? { group: f.group } : {}),
    ...(f.sub !== undefined ? { sub: mergeL10n(prev?.sub, f.sub) } : {}),
    ...(f.note !== undefined ? { note: mergeL10n(prev?.note, f.note) } : {}),
    steps: (f.steps ?? []).map((step, i) => ({
      component: step.component,
      title: mergeL10n(prevSteps[i]?.title, step.title),
      ...(step.description !== undefined
        ? { description: mergeL10n(prevSteps[i]?.description, step.description) }
        : {}),
    })),
  };
}

function mapTechnology(tech: Technology, prevList: TemplateTechnology[] | undefined): TemplateTechnology {
  const prev = prevList?.find(p => p.name === tech.name);
  return {
    name: tech.name,
    ...(tech.category !== undefined ? { category: mergeL10n(prev?.category, tech.category) } : {}),
    ...(tech.description !== undefined ? { description: mergeL10n(prev?.description, tech.description) } : {}),
    ...(tech.groups !== undefined ? { groups: tech.groups } : {}),
  };
}

function mapSection(s: Section, prev: TemplateSection | undefined): TemplateSection | null {
  const base = {
    id: s.id,
    type: s.type,
    title: mergeL10n(prev?.title, s.title),
    ...(s.tab !== undefined ? { tab: mergeL10n(prev?.tab, s.tab) } : {}),
    ...(s.subtitle !== undefined ? { subtitle: mergeL10n(prev?.subtitle, s.subtitle) } : {}),
    ...(s.note !== undefined ? { note: mergeL10n(prev?.note, s.note) } : {}),
  };

  switch (s.type) {
    case 'text': {
      const text = s as TextSection;
      const prevText = prev?.type === 'text' ? prev : undefined;
      return {
        ...base,
        type: 'text',
        blocks: (text.blocks ?? []).map((block, i) => {
          const pb = prevText?.blocks?.[i];
          return {
            ...(block.group !== undefined ? { group: block.group } : {}),
            ...(block.title !== undefined ? { title: mergeL10n(pb?.title, block.title) } : {}),
            ...(block.body !== undefined
              ? {
                  body: Array.isArray(block.body)
                    ? block.body.map((line, j) => {
                        const prevBody = pb?.body;
                        const prevLine = Array.isArray(prevBody) ? prevBody[j] : undefined;
                        return mergeL10n(prevLine, line);
                      })
                    : mergeL10n(typeof pb?.body === 'string' || (pb?.body && !Array.isArray(pb.body)) ? pb.body as L10n : undefined, block.body),
                }
              : {}),
          };
        }),
      };
    }
    case 'cards': {
      const cards = s as CardsSection;
      const prevCards = prev?.type === 'cards' ? prev : undefined;
      return {
        ...base,
        type: 'cards',
        items: (cards.items ?? []).map((item, i) => {
          const pi = prevCards?.items?.[i];
          return {
            ...(item.group !== undefined ? { group: item.group } : {}),
            ...(item.icon !== undefined ? { icon: item.icon } : {}),
            title: mergeL10n(pi?.title, item.title),
            ...(item.body !== undefined ? { body: mergeL10n(pi?.body, item.body) } : {}),
            ...(item.bullets !== undefined ? { bullets: mergeL10nList(pi?.bullets, item.bullets) } : {}),
          };
        }),
      };
    }
    case 'timeline': {
      const tl = s as TimelineSection;
      const prevTl = prev?.type === 'timeline' ? prev : undefined;
      return {
        ...base,
        type: 'timeline',
        ...(tl.lineTitle !== undefined ? { lineTitle: mergeL10n(prevTl?.lineTitle, tl.lineTitle) } : {}),
        items: (tl.items ?? []).map((item, i) => {
          const pi = prevTl?.items?.[i];
          return {
            ...(item.group !== undefined ? { group: item.group } : {}),
            ...(item.period !== undefined ? { period: mergeL10n(pi?.period, item.period) } : {}),
            title: mergeL10n(pi?.title, item.title),
            ...(item.bullets !== undefined ? { bullets: mergeL10nList(pi?.bullets, item.bullets) } : {}),
          };
        }),
        ...(tl.aside
          ? {
              aside: tl.aside.map((item, i) => {
                const pi = prevTl?.aside?.[i];
                return {
                  ...(item.group !== undefined ? { group: item.group } : {}),
                  ...(item.icon !== undefined ? { icon: item.icon } : {}),
                  title: mergeL10n(pi?.title, item.title),
                  ...(item.body !== undefined ? { body: mergeL10n(pi?.body, item.body) } : {}),
                  ...(item.bullets !== undefined ? { bullets: mergeL10nList(pi?.bullets, item.bullets) } : {}),
                };
              }),
            }
          : {}),
      };
    }
    case 'table': {
      const table = s as TableSection;
      const prevTable = prev?.type === 'table' ? prev : undefined;
      return {
        ...base,
        type: 'table',
        columns: (table.columns ?? []).map((col, i) => ({
          label: mergeL10n(prevTable?.columns?.[i]?.label, col.label),
          ...(col.width !== undefined ? { width: col.width } : {}),
          ...(col.group !== undefined ? { group: col.group } : {}),
        })),
        rows: (table.rows ?? []).map((row, ri) =>
          row.map((cell, ci) => mergeL10n(prevTable?.rows?.[ri]?.[ci], cell)),
        ),
      };
    }
    case 'compare': {
      const cmp = s as CompareSection;
      const prevCmp = prev?.type === 'compare' ? prev : undefined;
      return {
        ...base,
        type: 'compare',
        columns: (cmp.columns ?? []).map((col, i) => {
          const pc = prevCmp?.columns?.[i];
          return {
            ...(col.group !== undefined ? { group: col.group } : {}),
            ...(col.kicker !== undefined ? { kicker: mergeL10n(pc?.kicker, col.kicker) } : {}),
            title: mergeL10n(pc?.title, col.title),
            ...(col.short !== undefined ? { short: mergeL10n(pc?.short, col.short) } : {}),
            ...(col.pitch !== undefined ? { pitch: mergeL10n(pc?.pitch, col.pitch) } : {}),
            ...(col.rows !== undefined
              ? {
                  rows: col.rows.map((row, ri) =>
                    row.map((cell, ci) => mergeL10n(pc?.rows?.[ri]?.[ci], cell)),
                  ),
                }
              : {}),
            ...(col.bullets !== undefined ? { bullets: mergeL10nList(pc?.bullets, col.bullets) } : {}),
          };
        }),
        ...(cmp.table
          ? {
              table: {
                ...(cmp.table.title !== undefined
                  ? { title: mergeL10n(prevCmp?.table?.title, cmp.table.title) }
                  : {}),
                ...(cmp.table.subtitle !== undefined
                  ? { subtitle: mergeL10n(prevCmp?.table?.subtitle, cmp.table.subtitle) }
                  : {}),
                ...(cmp.table.firstColumn !== undefined
                  ? { firstColumn: mergeL10n(prevCmp?.table?.firstColumn, cmp.table.firstColumn) }
                  : {}),
                rows: (cmp.table.rows ?? []).map((row, ri) =>
                  row.map((cell, ci) => mergeL10n(prevCmp?.table?.rows?.[ri]?.[ci], cell)),
                ),
              },
            }
          : {}),
        ...(cmp.cards
          ? {
              cards: cmp.cards.map((card, i) => {
                const pc = prevCmp?.cards?.[i];
                return {
                  ...(card.group !== undefined ? { group: card.group } : {}),
                  title: mergeL10n(pc?.title, card.title),
                  ...(card.subtitle !== undefined ? { subtitle: mergeL10n(pc?.subtitle, card.subtitle) } : {}),
                  ...(card.bullets !== undefined ? { bullets: mergeL10nList(pc?.bullets, card.bullets) } : {}),
                  ...(card.note !== undefined ? { note: mergeL10n(pc?.note, card.note) } : {}),
                };
              }),
            }
          : {}),
      };
    }
    default:
      return null;
  }
}

export function updateArchitectureTemplate(id: string, patch: ArchitectureTemplatePatch): void {
  ensureArchitectureTemplatesDomain();
  const current = getArchitectureTemplateSpec(id);
  if (!current) throw new Error(`architecture template not found: ${id}`);
  let next: Template;
  if (patch.snapshot) {
    next = applyArchitectureSnapshotToSpec(current, patch.snapshot);
  } else if (patch.spec) {
    next = { ...patch.spec, id };
  } else {
    next = structuredClone(current);
  }
  if (patch.nameEn !== undefined || patch.nameFr !== undefined) {
    const names = pair(next.name);
    next.name = {
      en: patch.nameEn ?? names.en,
      fr: patch.nameFr ?? names.fr,
    };
  }
  if (patch.meta) {
    if (patch.meta.icon !== undefined) next.icon = patch.meta.icon;
    if (patch.meta.accent !== undefined) next.accent = patch.meta.accent;
    if (patch.meta.accentDark !== undefined) next.accentDark = patch.meta.accentDark;
    if (patch.meta.taglineEn !== undefined || patch.meta.taglineFr !== undefined) {
      const tag = pair(next.tagline);
      next.tagline = {
        en: patch.meta.taglineEn ?? tag.en,
        fr: patch.meta.taglineFr ?? tag.fr,
      };
    }
    if (patch.meta.whenToUseEn || patch.meta.whenToUseFr) {
      const en = patch.meta.whenToUseEn ?? tList(next.whenToUse, 'en');
      const fr = patch.meta.whenToUseFr ?? tList(next.whenToUse, 'fr');
      next.whenToUse = en.map((item, i) => ({ en: item, fr: fr[i] ?? item }));
    }
    if (patch.meta.whenNotToUseEn || patch.meta.whenNotToUseFr) {
      const en = patch.meta.whenNotToUseEn ?? tList(next.whenNotToUse, 'en');
      const fr = patch.meta.whenNotToUseFr ?? tList(next.whenNotToUse, 'fr');
      next.whenNotToUse = en.map((item, i) => ({ en: item, fr: fr[i] ?? item }));
    }
  }
  const issues = validatePayload(next, id);
  if (issues.length > 0) throw new Error(issues[0]!.message);
  db.prepare(
    'UPDATE architecture_templates SET payload_json=? WHERE domain_id=? AND id=?'
  ).run(JSON.stringify(next), ARCHITECTURE_TEMPLATES_DOMAIN, id);
  markDirty();
}

export function validateArchitectureTemplatesPublish(): CatalogIssue[] {
  ensureArchitectureTemplatesDomain();
  const issues: CatalogIssue[] = [];
  const rowsData = rows<{ id: string; payload_json: string }>(
    'SELECT id, payload_json FROM architecture_templates WHERE domain_id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
  );
  for (const expectedId of LOCKED_ARCHITECTURE_TEMPLATE_IDS) {
    if (!rowsData.some(r => r.id === expectedId)) {
      issues.push({
        code: 'missing_architecture_template',
        message: `Missing locked architecture template "${expectedId}"`,
        entityId: expectedId,
      });
    }
  }
  for (const row of rowsData) {
    issues.push(...validatePayload(parseTemplate(row.payload_json), row.id));
  }
  return issues;
}

export function publishArchitectureTemplates(): PublishArchitectureTemplatesResult {
  const issues = validateArchitectureTemplatesPublish();
  if (issues.length > 0) return { ok: false, issues };
  const publishedAt = now();
  db.prepare('UPDATE content_domains SET status=?, published_at=? WHERE id=?')
    .run('published', publishedAt, ARCHITECTURE_TEMPLATES_DOMAIN);
  return { ok: true, publishedAt };
}

export function getArchitectureTemplatesAdminState(options?: { validate?: boolean }): ArchitectureTemplateAdminState {
  ensureArchitectureTemplatesDomain();
  const domain = getRow<{ status: string; published_at: string | null }>(
    'SELECT status, published_at FROM content_domains WHERE id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
  );
  const templateCount = getRow<{ n: number }>(
    'SELECT COUNT(*) AS n FROM architecture_templates WHERE domain_id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
  )?.n ?? 0;
  const state: ArchitectureTemplateAdminState = {
    dirty: domain?.status !== 'published',
    publishedAt: domain?.published_at ?? null,
    templateCount,
  };
  if (!options?.validate) return state;
  const issues = validateArchitectureTemplatesPublish();
  return { ...state, issueCount: issues.length, issues };
}

function domainPublished(): boolean {
  ensureArchitectureTemplatesDomain();
  const domain = getRow<{ status: string }>(
    'SELECT status FROM content_domains WHERE id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
  );
  return domain?.status === 'published';
}

/** Runtime read when the domain is published (ISC-M5). Empty if draft. */
export function getPublishedArchitectureTemplates(): Template[] {
  if (!domainPublished()) return [];
  return sortArchitectureRows(rows<{ id: string; payload_json: string }>(
    'SELECT id, payload_json FROM architecture_templates WHERE domain_id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
  )).map(row => parseTemplate(row.payload_json));
}

export function getPublishedArchitectureTemplate(id: string): Template | undefined {
  if (!domainPublished()) return undefined;
  const row = getRow<{ payload_json: string }>(
    'SELECT payload_json FROM architecture_templates WHERE domain_id=? AND id=?',
    ARCHITECTURE_TEMPLATES_DOMAIN,
    id,
  );
  if (!row) return undefined;
  return parseTemplate(row.payload_json);
}
