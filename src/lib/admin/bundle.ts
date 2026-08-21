import { blankArchitecture } from '../defaults';
import { db, plainAll } from '../db';
import type { CatalogIssue } from '../lego/admin-catalog';
import type { ServiceRow } from '../templates/services';
import type { Template } from '../templates/types';
import type { FlowTemplate } from '../flows/types';
import type { Architecture, SectionType } from '../types';
import {
  ADD_SECTIONS_DOMAIN,
  ensureAddSectionsDomain,
  type AddSectionPayload,
} from './add-sections';
import {
  ARCHITECTURE_TEMPLATES_DOMAIN,
  ensureArchitectureTemplatesDomain,
} from './architecture-templates';
import {
  CLOUD_SERVICES_DOMAIN,
  ensureCloudServicesDomain,
} from './cloud-services';
import {
  FLOW_PATTERNS_DOMAIN,
  ensureFlowPatternsDomain,
} from './flow-patterns';
import {
  PROJECT_TEMPLATES_DOMAIN,
  ensureProjectTemplatesDomain,
  type ProjectTemplateMeta,
  type ProjectTemplateRow,
} from './project-templates';
import {
  getDraftSystemCopyMap,
  ensureSystemCopyDomain,
  replaceSystemCopyMap,
  upsertSystemCopy,
  type SystemCopyPair,
} from './system-copy';

export type ContentBundle = {
  version: 1;
  exportedAt: string;
  domains: {
    /** Skipped in v1 — lego catalog has its own versioning (see note in export). */
    catalog?: unknown;
    'project-templates'?: ProjectTemplateRow[];
    'add-sections'?: Array<{ id: string; type: SectionType; payload: AddSectionPayload }>;
    'flow-patterns'?: FlowTemplate[];
    'architecture-templates'?: Template[];
    'cloud-services'?: Array<{ roleKey: string; payload: ServiceRow }>;
    'system-copy'?: Record<string, SystemCopyPair>;
  };
};

export type ImportContentBundleResult =
  | { ok: true; issues: CatalogIssue[] }
  | { ok: false; issues: CatalogIssue[] };

function rows<T>(sql: string, ...values: (string | number | null)[]): T[] {
  return plainAll<T>(db.prepare(sql).all(...values));
}

function markDomainDirty(domainId: string): void {
  db.prepare('UPDATE content_domains SET status=?, published_at=published_at WHERE id=?')
    .run('draft', domainId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dumpProjectTemplates(): ProjectTemplateRow[] {
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
  ).map(row => ({
    id: row.id,
    nameEn: row.name_en ?? '',
    nameFr: row.name_fr ?? '',
    meta: row.meta_json ? (JSON.parse(row.meta_json) as ProjectTemplateMeta) : {
      icon: 'cube',
      accent: '#0E7C8A',
      taglineEn: '',
      taglineFr: '',
      whenToUseEn: [],
      whenToUseFr: [],
      whenNotToUseEn: [],
      whenNotToUseFr: [],
    },
    snapshot: row.snapshot_json
      ? (JSON.parse(row.snapshot_json) as Architecture)
      : blankArchitecture(row.id),
    sortOrder: row.sort_order ?? 0,
    featured: !!row.featured,
  }));
}

function dumpAddSections(): Array<{ id: string; type: SectionType; payload: AddSectionPayload }> {
  ensureAddSectionsDomain();
  return rows<{ id: string; type: string; payload_json: string }>(
    'SELECT id, type, payload_json FROM add_sections WHERE domain_id=? ORDER BY id',
    ADD_SECTIONS_DOMAIN,
  ).map(row => ({
    id: row.id,
    type: row.type as SectionType,
    payload: JSON.parse(row.payload_json) as AddSectionPayload,
  }));
}

function dumpFlowPatterns(): FlowTemplate[] {
  ensureFlowPatternsDomain();
  return rows<{ payload_json: string }>(
    'SELECT payload_json FROM flow_patterns WHERE domain_id=? ORDER BY id',
    FLOW_PATTERNS_DOMAIN,
  ).map(row => JSON.parse(row.payload_json) as FlowTemplate);
}

function dumpArchitectureTemplates(): Template[] {
  ensureArchitectureTemplatesDomain();
  return rows<{ payload_json: string }>(
    'SELECT payload_json FROM architecture_templates WHERE domain_id=? ORDER BY id',
    ARCHITECTURE_TEMPLATES_DOMAIN,
  ).map(row => JSON.parse(row.payload_json) as Template);
}

function dumpCloudServices(): Array<{ roleKey: string; payload: ServiceRow }> {
  ensureCloudServicesDomain();
  return rows<{ role_key: string; payload_json: string }>(
    'SELECT role_key, payload_json FROM cloud_services WHERE domain_id=? ORDER BY role_key',
    CLOUD_SERVICES_DOMAIN,
  ).map(row => ({
    roleKey: row.role_key,
    payload: JSON.parse(row.payload_json) as ServiceRow,
  }));
}

/** Dump draft rows for each admin content domain. Catalog skipped (own versioning). */
export function exportContentBundle(): ContentBundle {
  ensureSystemCopyDomain();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    domains: {
      // catalog: intentionally omitted — lego catalog uses catalog_version + publish flow
      'project-templates': dumpProjectTemplates(),
      'add-sections': dumpAddSections(),
      'flow-patterns': dumpFlowPatterns(),
      'architecture-templates': dumpArchitectureTemplates(),
      'cloud-services': dumpCloudServices(),
      'system-copy': getDraftSystemCopyMap(),
    },
  };
}

function importSystemCopy(
  map: Record<string, SystemCopyPair>,
  mode: 'merge' | 'replace',
  issues: CatalogIssue[],
): void {
  if (mode === 'replace') {
    replaceSystemCopyMap(map);
    return;
  }
  for (const [key, pair] of Object.entries(map)) {
    if (!pair || typeof pair.en !== 'string' || typeof pair.fr !== 'string') {
      issues.push({
        code: 'invalid_bundle_system_copy',
        message: `system-copy "${key}" needs en and fr strings`,
        entityId: key,
      });
      continue;
    }
    upsertSystemCopy(key, { en: pair.en, fr: pair.fr });
  }
}

function importProjectTemplates(items: unknown, mode: 'merge' | 'replace', issues: CatalogIssue[]): void {
  if (!Array.isArray(items)) {
    issues.push({ code: 'invalid_bundle_domain', message: 'project-templates must be an array' });
    return;
  }
  ensureProjectTemplatesDomain();
  if (mode === 'replace') {
    db.prepare('DELETE FROM project_templates WHERE domain_id=?').run(PROJECT_TEMPLATES_DOMAIN);
  }
  for (const raw of items) {
    if (!isRecord(raw) || typeof raw.id !== 'string') {
      issues.push({ code: 'invalid_bundle_row', message: 'project-templates row missing id' });
      continue;
    }
    const id = raw.id;
    const nameEn = typeof raw.nameEn === 'string' ? raw.nameEn : '';
    const nameFr = typeof raw.nameFr === 'string' ? raw.nameFr : '';
    const meta = raw.meta ?? {};
    const snapshot = raw.snapshot ?? {};
    const sortOrder = typeof raw.sortOrder === 'number' ? raw.sortOrder : 0;
    const featured = raw.featured ? 1 : 0;
    db.prepare(
      `INSERT INTO project_templates (domain_id, id, name_en, name_fr, meta_json, snapshot_json, sort_order, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(domain_id, id) DO UPDATE SET
         name_en=excluded.name_en,
         name_fr=excluded.name_fr,
         meta_json=excluded.meta_json,
         snapshot_json=excluded.snapshot_json,
         sort_order=excluded.sort_order,
         featured=excluded.featured`
    ).run(
      PROJECT_TEMPLATES_DOMAIN,
      id,
      nameEn,
      nameFr,
      JSON.stringify(meta),
      JSON.stringify(snapshot),
      sortOrder,
      featured,
    );
  }
  markDomainDirty(PROJECT_TEMPLATES_DOMAIN);
  ensureProjectTemplatesDomain();
}

function importAddSections(items: unknown, mode: 'merge' | 'replace', issues: CatalogIssue[]): void {
  if (!Array.isArray(items)) {
    issues.push({ code: 'invalid_bundle_domain', message: 'add-sections must be an array' });
    return;
  }
  ensureAddSectionsDomain();
  if (mode === 'replace') {
    db.prepare('DELETE FROM add_sections WHERE domain_id=?').run(ADD_SECTIONS_DOMAIN);
  }
  for (const raw of items) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.type !== 'string' || !raw.payload) {
      issues.push({ code: 'invalid_bundle_row', message: 'add-sections row needs id, type, payload' });
      continue;
    }
    db.prepare(
      `INSERT INTO add_sections (domain_id, id, type, payload_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(domain_id, id) DO UPDATE SET type=excluded.type, payload_json=excluded.payload_json`
    ).run(ADD_SECTIONS_DOMAIN, raw.id, raw.type, JSON.stringify(raw.payload));
  }
  markDomainDirty(ADD_SECTIONS_DOMAIN);
  ensureAddSectionsDomain();
}

function importFlowPatterns(items: unknown, mode: 'merge' | 'replace', issues: CatalogIssue[]): void {
  if (!Array.isArray(items)) {
    issues.push({ code: 'invalid_bundle_domain', message: 'flow-patterns must be an array' });
    return;
  }
  ensureFlowPatternsDomain();
  if (mode === 'replace') {
    db.prepare('DELETE FROM flow_patterns WHERE domain_id=?').run(FLOW_PATTERNS_DOMAIN);
  }
  for (const raw of items) {
    if (!isRecord(raw) || typeof raw.id !== 'string') {
      issues.push({ code: 'invalid_bundle_row', message: 'flow-patterns row missing id' });
      continue;
    }
    db.prepare(
      `INSERT INTO flow_patterns (domain_id, id, payload_json) VALUES (?, ?, ?)
       ON CONFLICT(domain_id, id) DO UPDATE SET payload_json=excluded.payload_json`
    ).run(FLOW_PATTERNS_DOMAIN, raw.id, JSON.stringify(raw));
  }
  markDomainDirty(FLOW_PATTERNS_DOMAIN);
  ensureFlowPatternsDomain();
}

function importArchitectureTemplates(items: unknown, mode: 'merge' | 'replace', issues: CatalogIssue[]): void {
  if (!Array.isArray(items)) {
    issues.push({ code: 'invalid_bundle_domain', message: 'architecture-templates must be an array' });
    return;
  }
  ensureArchitectureTemplatesDomain();
  if (mode === 'replace') {
    db.prepare('DELETE FROM architecture_templates WHERE domain_id=?').run(ARCHITECTURE_TEMPLATES_DOMAIN);
  }
  for (const raw of items) {
    if (!isRecord(raw) || typeof raw.id !== 'string') {
      issues.push({ code: 'invalid_bundle_row', message: 'architecture-templates row missing id' });
      continue;
    }
    db.prepare(
      `INSERT INTO architecture_templates (domain_id, id, payload_json) VALUES (?, ?, ?)
       ON CONFLICT(domain_id, id) DO UPDATE SET payload_json=excluded.payload_json`
    ).run(ARCHITECTURE_TEMPLATES_DOMAIN, raw.id, JSON.stringify(raw));
  }
  markDomainDirty(ARCHITECTURE_TEMPLATES_DOMAIN);
  ensureArchitectureTemplatesDomain();
}

function importCloudServices(items: unknown, mode: 'merge' | 'replace', issues: CatalogIssue[]): void {
  if (!Array.isArray(items)) {
    issues.push({ code: 'invalid_bundle_domain', message: 'cloud-services must be an array' });
    return;
  }
  ensureCloudServicesDomain();
  if (mode === 'replace') {
    db.prepare('DELETE FROM cloud_services WHERE domain_id=?').run(CLOUD_SERVICES_DOMAIN);
  }
  for (const raw of items) {
    if (!isRecord(raw) || typeof raw.roleKey !== 'string' || !raw.payload) {
      issues.push({ code: 'invalid_bundle_row', message: 'cloud-services row needs roleKey and payload' });
      continue;
    }
    db.prepare(
      `INSERT INTO cloud_services (domain_id, role_key, payload_json) VALUES (?, ?, ?)
       ON CONFLICT(domain_id, role_key) DO UPDATE SET payload_json=excluded.payload_json`
    ).run(CLOUD_SERVICES_DOMAIN, raw.roleKey, JSON.stringify(raw.payload));
  }
  markDomainDirty(CLOUD_SERVICES_DOMAIN);
  ensureCloudServicesDomain();
}

/**
 * Import a v1 content bundle into draft domains. Never auto-publishes.
 * merge = upsert provided rows; replace = wipe domain then load bundle (seeds reappear via ensure).
 */
export function importContentBundle(
  bundle: unknown,
  options: { mode: 'merge' | 'replace' },
): ImportContentBundleResult {
  const issues: CatalogIssue[] = [];
  if (!isRecord(bundle)) {
    return { ok: false, issues: [{ code: 'invalid_bundle', message: 'bundle must be an object' }] };
  }
  if (bundle.version !== 1) {
    return { ok: false, issues: [{ code: 'invalid_bundle_version', message: 'bundle.version must be 1' }] };
  }
  if (!isRecord(bundle.domains)) {
    return { ok: false, issues: [{ code: 'invalid_bundle', message: 'bundle.domains must be an object' }] };
  }

  const domains = bundle.domains;
  const mode = options.mode;

  if (domains['system-copy'] !== undefined) {
    if (!isRecord(domains['system-copy'])) {
      issues.push({ code: 'invalid_bundle_domain', message: 'system-copy must be a key→{en,fr} map' });
    } else {
      importSystemCopy(domains['system-copy'] as Record<string, SystemCopyPair>, mode, issues);
    }
  }
  if (domains['project-templates'] !== undefined) {
    importProjectTemplates(domains['project-templates'], mode, issues);
  }
  if (domains['add-sections'] !== undefined) {
    importAddSections(domains['add-sections'], mode, issues);
  }
  if (domains['flow-patterns'] !== undefined) {
    importFlowPatterns(domains['flow-patterns'], mode, issues);
  }
  if (domains['architecture-templates'] !== undefined) {
    importArchitectureTemplates(domains['architecture-templates'], mode, issues);
  }
  if (domains['cloud-services'] !== undefined) {
    importCloudServices(domains['cloud-services'], mode, issues);
  }
  if (domains.catalog !== undefined) {
    issues.push({
      code: 'bundle_catalog_skipped',
      message: 'catalog domain is not imported in v1 — use admin catalog publish separately',
    });
  }

  const blocking = issues.filter(i => i.code !== 'bundle_catalog_skipped');
  if (blocking.length > 0) return { ok: false, issues };
  return { ok: true, issues };
}
