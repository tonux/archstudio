import demo from '../seed/demo.json';
import { blankArchitecture, normalizeArchitecture } from '../defaults';
import { db, now, plain, plainAll } from '../db';
import type { Architecture, Section } from '../types';
import type { CatalogIssue } from '../lego/admin-catalog';
import type { CloudTarget, Lang, TemplateSummary } from '../templates/types';
import { LANGS, TARGETS } from '../templates/types';
import { getArchitectureTemplateAdmin, listArchitectureTemplatesAdmin } from './architecture-templates';

export const PROJECT_TEMPLATES_DOMAIN = 'project-templates';

const ACME_TEMPLATE_ID = 'acme-v1';
const AUTHOR_SECTION_IDS = ['platforms', 'operations', 'roadmap', 'risks'] as const;

export type ProjectTemplateMeta = {
  icon: string;
  accent: string;
  accentDark?: string;
  taglineEn: string;
  taglineFr: string;
  descriptionEn?: string;
  descriptionFr?: string;
  whenToUseEn: string[];
  whenToUseFr: string[];
  whenNotToUseEn: string[];
  whenNotToUseFr: string[];
  /** Project name used by ensureSeed when this template is featured. */
  seedName?: string;
};

export type ProjectTemplateRow = {
  id: string;
  nameEn: string;
  nameFr: string;
  meta: ProjectTemplateMeta;
  snapshot: Architecture;
  sortOrder: number;
  featured: boolean;
};

export type ProjectTemplateAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  templateCount: number;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export type PublishProjectTemplatesResult =
  | { ok: true; publishedAt: string }
  | { ok: false; issues: CatalogIssue[] };

const ACME_META: ProjectTemplateMeta = {
  icon: 'cube',
  accent: '#4F8AC6',
  accentDark: '#00E5FF',
  taglineEn: 'The reference example: a consumer platform and a business platform on separate stacks.',
  taglineFr: 'L\'exemple de référence : une plateforme consommateur et une plateforme pro sur des stacks séparées.',
  descriptionEn: 'The reference example: a consumer platform and a business platform on separate stacks.',
  descriptionFr: 'L\'exemple de référence : une plateforme consommateur et une plateforme pro sur des stacks séparées.',
  whenToUseEn: [
    'You want a dense, print-ready ADD as a starting point.',
    'Two-platform B2C/B2B split with a shared operational core.',
  ],
  whenToUseFr: [
    'Vous voulez un ADD dense et prêt à imprimer comme point de départ.',
    'Séparation B2C/B2B avec un socle opérationnel partagé.',
  ],
  whenNotToUseEn: [
    'You need a single monolith or a blank canvas.',
    'You want hyperscaler-specific service names out of the box.',
  ],
  whenNotToUseFr: [
    'Vous partez d\'une page blanche ou d\'un monolithe unique.',
    'Vous voulez des noms de services cloud prêts à l\'emploi.',
  ],
  seedName: 'Acme — two platforms',
};


function getRow<T>(sql: string, ...params: (string | number | null)[]): T | null {
  const raw = db.prepare(sql).get(...params);
  if (!raw) return null;
  return plain<T>(raw);
}

function rows<T>(sql: string, ...values: (string | number | null)[]): T[] {
  return plainAll<T>(db.prepare(sql).all(...values));
}

function parseMeta(raw: string | null): ProjectTemplateMeta {
  if (!raw) throw new Error('Project template meta_json is missing');
  return JSON.parse(raw) as ProjectTemplateMeta;
}

function parseSnapshot(raw: string | null): Architecture {
  if (!raw) throw new Error('Project template snapshot_json is missing');
  return normalizeArchitecture(JSON.parse(raw));
}

function rowToTemplate(row: {
  id: string;
  name_en: string | null;
  name_fr: string | null;
  meta_json: string | null;
  snapshot_json: string | null;
  sort_order: number | null;
  featured: number | null;
}): ProjectTemplateRow {
  return {
    id: row.id,
    nameEn: row.name_en ?? row.id,
    nameFr: row.name_fr ?? row.name_en ?? row.id,
    meta: parseMeta(row.meta_json),
    snapshot: parseSnapshot(row.snapshot_json),
    sortOrder: row.sort_order ?? 0,
    featured: Boolean(row.featured),
  };
}

/** Ensures the content domain row and seeds Acme on first run. */
export function ensureProjectTemplatesDomain(): void {
  const existing = getRow<{ id: string }>('SELECT id FROM content_domains WHERE id=?', PROJECT_TEMPLATES_DOMAIN);
  if (!existing) {
    db.prepare('INSERT INTO content_domains (id, status, published_at) VALUES (?, ?, NULL)')
      .run(PROJECT_TEMPLATES_DOMAIN, 'draft');
  }

  const acmeRow = getRow<{ id: string; meta_json: string | null; snapshot_json: string | null }>(
    'SELECT id, meta_json, snapshot_json FROM project_templates WHERE domain_id=? AND id=?',
    PROJECT_TEMPLATES_DOMAIN,
    ACME_TEMPLATE_ID,
  );
  if (!acmeRow) {
    importAcmeTemplate();
  } else if (!acmeRow.meta_json || !acmeRow.snapshot_json) {
    writeAcmeSeedRow();
  }
}

function writeAcmeSeedRow(): void {
  const snapshot = demo as unknown as Architecture;
  db.prepare(
    `UPDATE project_templates
     SET name_en=?, name_fr=?, meta_json=?, snapshot_json=?, sort_order=?, featured=?
     WHERE domain_id=? AND id=?`
  ).run(
    'Acme — two platforms',
    'Acme — deux plateformes',
    JSON.stringify(ACME_META),
    JSON.stringify(snapshot),
    0,
    1,
    PROJECT_TEMPLATES_DOMAIN,
    ACME_TEMPLATE_ID,
  );
  markProjectTemplatesDirty();
}

function importAcmeTemplate(): string {
  const snapshot = demo as unknown as Architecture;
  db.prepare(
    `INSERT INTO project_templates
      (domain_id, id, name_en, name_fr, meta_json, snapshot_json, sort_order, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    PROJECT_TEMPLATES_DOMAIN,
    ACME_TEMPLATE_ID,
    'Acme — two platforms',
    'Acme — deux plateformes',
    JSON.stringify(ACME_META),
    JSON.stringify(snapshot),
    0,
    1,
  );
  markProjectTemplatesDirty();
  return ACME_TEMPLATE_ID;
}

function markProjectTemplatesDirty(): void {
  db.prepare(
    'UPDATE content_domains SET status=?, published_at=published_at WHERE id=?'
  ).run('draft', PROJECT_TEMPLATES_DOMAIN);
}

/** Lists all project templates in admin (draft layer). */
export function listProjectTemplatesAdmin(): ProjectTemplateRow[] {
  ensureProjectTemplatesDomain();
  return rows<{
    id: string;
    name_en: string | null;
    name_fr: string | null;
    meta_json: string | null;
    snapshot_json: string | null;
    sort_order: number | null;
    featured: number | null;
  }>(
    'SELECT id, name_en, name_fr, meta_json, snapshot_json, sort_order, featured FROM project_templates WHERE domain_id=? ORDER BY sort_order, id',
    PROJECT_TEMPLATES_DOMAIN,
  ).map(rowToTemplate);
}

/** Returns one admin template by id. */
export function getProjectTemplateAdmin(id: string): ProjectTemplateRow | null {
  ensureProjectTemplatesDomain();
  const row = getRow<{
    id: string;
    name_en: string | null;
    name_fr: string | null;
    meta_json: string | null;
    snapshot_json: string | null;
    sort_order: number | null;
    featured: number | null;
  }>(
    'SELECT id, name_en, name_fr, meta_json, snapshot_json, sort_order, featured FROM project_templates WHERE domain_id=? AND id=?',
    PROJECT_TEMPLATES_DOMAIN,
    id,
  );
  return row ? rowToTemplate(row) : null;
}

/** Published templates only — runtime picker and ensureSeed. */
export function listPublishedProjectTemplates(): ProjectTemplateRow[] {
  ensureProjectTemplatesDomain();
  const domain = getRow<{ status: string }>('SELECT status FROM content_domains WHERE id=?', PROJECT_TEMPLATES_DOMAIN);
  if (domain?.status !== 'published') return [];
  return listProjectTemplatesAdmin();
}

/** Featured published template for ensureSeed. */
export function getFeaturedPublishedProjectTemplate(): ProjectTemplateRow | null {
  const published = listPublishedProjectTemplates();
  return published.find(t => t.featured) ?? published[0] ?? null;
}


/** Returns one published template by id (runtime). */
export function getPublishedProjectTemplate(id: string): ProjectTemplateRow | null {
  ensureProjectTemplatesDomain();
  const domain = getRow<{ status: string }>('SELECT status FROM content_domains WHERE id=?', PROJECT_TEMPLATES_DOMAIN);
  if (domain?.status !== 'published') return null;
  return getProjectTemplateAdmin(id);
}

/** Deep-copies a published snapshot into a new project document. */
export function instantiateProjectTemplate(
  template: ProjectTemplateRow,
  projectName: string,
): Architecture {
  const doc = structuredClone(template.snapshot);
  doc.meta = { ...doc.meta, name: projectName };
  return normalizeArchitecture(doc);
}

export function projectTemplateSummaries(): TemplateSummary[] {
  return listPublishedProjectTemplates().map(tpl => {
    const count = tpl.snapshot.components?.length ?? 0;
    const counts = Object.fromEntries(TARGETS.map(target => [target, count])) as Record<CloudTarget, number>;
    const both = <T>(pick: (lang: Lang) => T) =>
      Object.fromEntries(LANGS.map(lang => [lang, pick(lang)])) as Record<Lang, T>;

    return {
      id: tpl.id,
      kind: 'project' as const,
      icon: tpl.meta.icon,
      accent: tpl.meta.accent,
      accentDark: tpl.meta.accentDark ?? tpl.meta.accent,
      name: both(lang => (lang === 'fr' ? tpl.nameFr : tpl.nameEn)),
      tagline: both(lang => (lang === 'fr' ? tpl.meta.taglineFr : tpl.meta.taglineEn)),
      whenToUse: both(lang => (lang === 'fr' ? tpl.meta.whenToUseFr : tpl.meta.whenToUseEn)),
      whenNotToUse: both(lang => (lang === 'fr' ? tpl.meta.whenNotToUseFr : tpl.meta.whenNotToUseEn)),
      supportedTargets: ['agnostic'],
      counts,
    };
  });
}

function sectionHasPlaceholder(section: Section): boolean {
  const blob = JSON.stringify(section);
  return blob.includes('[…]') || blob.includes('À estimer') || blob.includes('To be estimated');
}

/** Publish validation — ISC-A6 Acme parity + structural checks. */
export function validateProjectTemplatesPublish(): CatalogIssue[] {
  ensureProjectTemplatesDomain();
  const issues: CatalogIssue[] = [];
  const templates = listProjectTemplatesAdmin();

  if (templates.length === 0) {
    issues.push({ code: 'no_templates', message: 'At least one project template is required' });
    return issues;
  }

  const featured = templates.filter(t => t.featured);
  if (featured.length !== 1) {
    issues.push({
      code: 'featured_count',
      message: `Exactly one featured template required (found ${featured.length})`,
      field: 'featured',
    });
  }

  for (const tpl of templates) {
    const { snapshot } = tpl;
    const components = snapshot.components ?? [];
    const groups = new Set((snapshot.groups ?? []).map(g => g.id));

    if (components.length === 0) {
      issues.push({ code: 'no_components', message: 'Template has no components', entityId: tpl.id });
    }

    for (const component of components) {
      if (!groups.has(component.group)) {
        issues.push({
          code: 'invalid_group',
          message: `Component "${component.id}" references unknown group "${component.group}"`,
          entityId: tpl.id,
          field: 'group',
        });
      }
    }

    for (const section of snapshot.sections ?? []) {
      if (sectionHasPlaceholder(section)) {
        issues.push({
          code: 'placeholder_section',
          message: `Section "${section.id}" contains placeholder content`,
          entityId: tpl.id,
          field: 'sections',
        });
      }
    }

    if (tpl.id === ACME_TEMPLATE_ID) {
      if (components.length !== 22) {
        issues.push({
          code: 'acme_component_count',
          message: `Acme template must have 22 components (found ${components.length})`,
          entityId: tpl.id,
        });
      }
      const sectionIds = new Set((snapshot.sections ?? []).map(s => s.id));
      for (const required of AUTHOR_SECTION_IDS) {
        if (!sectionIds.has(required)) {
          issues.push({
            code: 'acme_missing_section',
            message: `Acme template missing author section "${required}"`,
            entityId: tpl.id,
            field: 'sections',
          });
        }
      }
    }
  }

  return issues;
}

export function getProjectTemplatesAdminState(options?: { validate?: boolean }): ProjectTemplateAdminState {
  ensureProjectTemplatesDomain();
  const domain = getRow<{ status: string; published_at: string | null }>(
    'SELECT status, published_at FROM content_domains WHERE id=?',
    PROJECT_TEMPLATES_DOMAIN,
  );
  const templateCount = getRow<{ n: number }>(
    'SELECT COUNT(*) AS n FROM project_templates WHERE domain_id=?',
    PROJECT_TEMPLATES_DOMAIN,
  )?.n ?? 0;
  const state: ProjectTemplateAdminState = {
    dirty: domain?.status !== 'published',
    publishedAt: domain?.published_at ?? null,
    templateCount,
  };
  if (!options?.validate) return state;
  const issues = validateProjectTemplatesPublish();
  return { ...state, issueCount: issues.length, issues };
}

/** Validates and publishes project templates. */
export function publishProjectTemplates(): PublishProjectTemplatesResult {
  const issues = validateProjectTemplatesPublish();
  if (issues.length > 0) return { ok: false, issues };

  const publishedAt = now();
  db.prepare('UPDATE content_domains SET status=?, published_at=? WHERE id=?')
    .run('published', publishedAt, PROJECT_TEMPLATES_DOMAIN);
  return { ok: true, publishedAt };
}


export type AdminTemplateKind = 'project' | 'architecture';

export type AdminTemplateListItem = {
  id: string;
  kind: AdminTemplateKind;
  editable: boolean;
  nameEn: string;
  nameFr: string;
  sortOrder: number;
  featured: boolean;
  componentCount: number;
  sectionCount: number;
  flowCount: number;
  accent: string;
  icon: string;
  taglineEn: string;
  taglineFr: string;
};

const DEFAULT_PROJECT_META: ProjectTemplateMeta = {
  icon: 'cube',
  accent: '#0E7C8A',
  accentDark: '#00E5FF',
  taglineEn: 'A full architecture snapshot ready to instantiate.',
  taglineFr: 'Un snapshot d\'architecture prêt à instancier.',
  whenToUseEn: ['Starting from a documented reference architecture.'],
  whenToUseFr: ['Partir d\'une architecture de référence documentée.'],
  whenNotToUseEn: ['You need hyperscaler-specific service names (use an architecture template).'],
  whenNotToUseFr: ['Vous voulez des noms de services cloud (utilisez un template architecture).'],
};

function slugTemplateId(raw: string): string {
  const id = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!id || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id)) {
    throw new Error('Template id must be lowercase letters, numbers and hyphens');
  }
  return id;
}

function templateExists(id: string): boolean {
  return Boolean(getRow<{ id: string }>(
    'SELECT id FROM project_templates WHERE domain_id=? AND id=?',
    PROJECT_TEMPLATES_DOMAIN,
    id,
  ));
}

/** All templates visible in admin: project snapshots + architecture hyperscaler templates. */
export function listAllAdminTemplates(): AdminTemplateListItem[] {
  const project = listProjectTemplatesAdmin().map(tpl => ({
    id: tpl.id,
    kind: 'project' as const,
    editable: true,
    nameEn: tpl.nameEn,
    nameFr: tpl.nameFr,
    sortOrder: tpl.sortOrder,
    featured: tpl.featured,
    componentCount: tpl.snapshot.components?.length ?? 0,
    sectionCount: tpl.snapshot.sections?.length ?? 0,
    flowCount: tpl.snapshot.flows?.length ?? 0,
    accent: tpl.meta.accent,
    icon: tpl.meta.icon,
    taglineEn: tpl.meta.taglineEn,
    taglineFr: tpl.meta.taglineFr,
  }));

  const arch = listArchitectureTemplatesAdmin().map(tpl => ({
    id: tpl.id,
    kind: 'architecture' as const,
    editable: true,
    nameEn: tpl.nameEn,
    nameFr: tpl.nameFr,
    sortOrder: tpl.sortOrder,
    featured: false as const,
    componentCount: tpl.componentCount,
    sectionCount: tpl.sectionCount,
    flowCount: tpl.flowCount,
    accent: tpl.accent,
    icon: tpl.icon,
    taglineEn: tpl.taglineEn,
    taglineFr: tpl.taglineFr,
  }));

  return [...project.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)), ...arch];
}

export type ProjectTemplateCreate = {
  id: string;
  nameEn: string;
  nameFr?: string;
  meta?: Partial<ProjectTemplateMeta>;
  snapshot?: Architecture;
  featured?: boolean;
  sortOrder?: number;
};

/** Creates a new editable project template. */
export function createProjectTemplate(input: ProjectTemplateCreate): string {
  ensureProjectTemplatesDomain();
  const id = slugTemplateId(input.id);
  if (templateExists(id)) throw new Error(`Project template "${id}" already exists`);
  const nameFr = input.nameFr?.trim() || input.nameEn;
  const snapshot = input.snapshot ? normalizeArchitecture(input.snapshot) : blankArchitecture(input.nameEn);
  const meta: ProjectTemplateMeta = { ...DEFAULT_PROJECT_META, ...input.meta };
  const sortOrder = input.sortOrder ?? (getRow<{ m: number | null }>(
    'SELECT MAX(sort_order) AS m FROM project_templates WHERE domain_id=?',
    PROJECT_TEMPLATES_DOMAIN,
  )?.m ?? -1) + 1;
  const featured = Boolean(input.featured);
  if (featured) {
    db.prepare('UPDATE project_templates SET featured=0 WHERE domain_id=?').run(PROJECT_TEMPLATES_DOMAIN);
  }
  db.prepare(
    `INSERT INTO project_templates
      (domain_id, id, name_en, name_fr, meta_json, snapshot_json, sort_order, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    PROJECT_TEMPLATES_DOMAIN,
    id,
    input.nameEn.trim(),
    nameFr,
    JSON.stringify(meta),
    JSON.stringify(snapshot),
    sortOrder,
    featured ? 1 : 0,
  );
  markProjectTemplatesDirty();
  return id;
}

/** Deletes a project template. Architecture templates (code registry) cannot be deleted here. */
export function deleteProjectTemplate(id: string): void {
  ensureProjectTemplatesDomain();
  if (!templateExists(id)) throw new Error(`Project template "${id}" does not exist`);
  const wasFeatured = getRow<{ featured: number }>(
    'SELECT featured FROM project_templates WHERE domain_id=? AND id=?',
    PROJECT_TEMPLATES_DOMAIN,
    id,
  )?.featured;
  db.prepare('DELETE FROM project_templates WHERE domain_id=? AND id=?').run(PROJECT_TEMPLATES_DOMAIN, id);
  if (wasFeatured) {
    const next = getRow<{ id: string }>(
      'SELECT id FROM project_templates WHERE domain_id=? ORDER BY sort_order, id LIMIT 1',
      PROJECT_TEMPLATES_DOMAIN,
    );
    if (next) {
      db.prepare('UPDATE project_templates SET featured=1 WHERE domain_id=? AND id=?')
        .run(PROJECT_TEMPLATES_DOMAIN, next.id);
    }
  }
  markProjectTemplatesDirty();
}

export { getArchitectureTemplateAdmin };

export type ProjectTemplateUpdate = {
  nameEn?: string;
  nameFr?: string;
  sortOrder?: number;
  featured?: boolean;
  meta?: Partial<ProjectTemplateMeta>;
  snapshot?: Architecture;
};

/** Updates template metadata (not snapshot body in v1). */
export function updateProjectTemplate(id: string, patch: ProjectTemplateUpdate): string {
  ensureProjectTemplatesDomain();
  const current = getProjectTemplateAdmin(id);
  if (!current) throw new Error(`Project template "${id}" does not exist`);

  const nameEn = patch.nameEn ?? current.nameEn;
  const nameFr = patch.nameFr ?? current.nameFr;
  const sortOrder = patch.sortOrder ?? current.sortOrder;
  const featured = patch.featured ?? current.featured;
  const meta: ProjectTemplateMeta = { ...current.meta, ...patch.meta };
  const snapshot = patch.snapshot ? normalizeArchitecture(patch.snapshot) : current.snapshot;

  if (featured) {
    db.prepare('UPDATE project_templates SET featured=0 WHERE domain_id=?').run(PROJECT_TEMPLATES_DOMAIN);
  }

  db.prepare(
    `UPDATE project_templates
     SET name_en=?, name_fr=?, meta_json=?, snapshot_json=?, sort_order=?, featured=?
     WHERE domain_id=? AND id=?`
  ).run(nameEn, nameFr, JSON.stringify(meta), JSON.stringify(snapshot), sortOrder, featured ? 1 : 0, PROJECT_TEMPLATES_DOMAIN, id);

  markProjectTemplatesDirty();
  return id;
}

/** Re-imports Acme snapshot from demo.json (admin repair). */
export function reimportAcmeTemplate(): string {
  ensureProjectTemplatesDomain();
  const exists = getRow<{ id: string }>(
    'SELECT id FROM project_templates WHERE domain_id=? AND id=?',
    PROJECT_TEMPLATES_DOMAIN,
    ACME_TEMPLATE_ID,
  );
  if (exists) writeAcmeSeedRow();
  else importAcmeTemplate();
  return ACME_TEMPLATE_ID;
}

/** Outline shape for ISC-A6 snapshot comparison. */
export function projectTemplateOutline(snapshot: Architecture) {
  return {
    componentCount: snapshot.components?.length ?? 0,
    sectionIds: (snapshot.sections ?? []).map(s => s.id).sort(),
    flowCount: snapshot.flows?.length ?? 0,
  };
}
