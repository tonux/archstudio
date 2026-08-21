import { allPresetSectionSpecs, type PresetSection } from '../document/preset';
import { blankSection, normalizeArchitecture, slugify, STARTER_GROUPS, STARTER_LAYERS, blankArchitecture } from '../defaults';
import { db, now, plain, plainAll } from '../db';
import { buildStandaloneHtml } from '../exportHtml';
import type { CatalogIssue } from '../lego/admin-catalog';
import { resolveDeep, type Lang } from '../templates/types';
import type { Architecture, Section, SectionType } from '../types';

export const ADD_SECTIONS_DOMAIN = 'add-sections';

const PLACEHOLDER_MARKERS = ['[…]', 'À estimer', 'To be estimated'];

export type AddSectionPayload = {
  en: Section;
  fr: Section;
};

export type AddSectionCreate = {
  id?: string;
  type: SectionType;
  titleEn: string;
  titleFr?: string;
};

export type AddSectionAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  sectionCount: number;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export type PublishAddSectionsResult =
  | { ok: true; publishedAt: string }
  | { ok: false; issues: CatalogIssue[] };

function getRow<T>(sql: string, ...params: (string | number | null)[]): T | null {
  const raw = db.prepare(sql).get(...params);
  if (!raw) return null;
  return plain<T>(raw);
}

function rows<T>(sql: string, ...values: (string | number | null)[]): T[] {
  return plainAll<T>(db.prepare(sql).all(...values));
}

function parsePayload(raw: string | null): AddSectionPayload {
  if (!raw) throw new Error('add section payload_json is missing');
  const parsed = JSON.parse(raw) as AddSectionPayload;
  return {
    en: normalizeArchitecture({ sections: [parsed.en] }).sections[0] as Section,
    fr: normalizeArchitecture({ sections: [parsed.fr] }).sections[0] as Section,
  };
}

function specToPayload(spec: PresetSection): AddSectionPayload {
  return {
    en: resolveDeep<Section>(spec, 'en'),
    fr: resolveDeep<Section>(spec, 'fr'),
  };
}

function markDirty(): void {
  db.prepare('UPDATE content_domains SET status=?, published_at=published_at WHERE id=?')
    .run('draft', ADD_SECTIONS_DOMAIN);
}

function sectionItemCount(sec: Section): number {
  switch (sec.type) {
    case 'cards': return (sec as { items?: unknown[] }).items?.length ?? 0;
    case 'text': return (sec as { blocks?: unknown[] }).blocks?.length ?? 0;
    case 'timeline': return (sec as { items?: unknown[] }).items?.length ?? 0;
    case 'table': return (sec as { rows?: unknown[] }).rows?.length ?? 0;
    case 'compare': return (sec as { columns?: unknown[] }).columns?.length ?? 0;
    default: return 0;
  }
}

function hasPlaceholder(section: Section): boolean {
  const blob = JSON.stringify(section);
  return PLACEHOLDER_MARKERS.some(m => blob.includes(m));
}

/** Ensures domain + seeds preset library on first run. */
export function ensureAddSectionsDomain(): void {
  const existing = getRow<{ id: string }>('SELECT id FROM content_domains WHERE id=?', ADD_SECTIONS_DOMAIN);
  if (!existing) {
    db.prepare('INSERT INTO content_domains (id, status, published_at) VALUES (?, ?, NULL)')
      .run(ADD_SECTIONS_DOMAIN, 'draft');
  }

  for (const spec of allPresetSectionSpecs()) {
    const row = getRow<{ id: string }>(
      'SELECT id FROM add_sections WHERE domain_id=? AND id=?',
      ADD_SECTIONS_DOMAIN,
      spec.id,
    );
    if (row) continue;
    const payload = specToPayload(spec);
    db.prepare(
      'INSERT INTO add_sections (domain_id, id, type, payload_json) VALUES (?, ?, ?, ?)'
    ).run(ADD_SECTIONS_DOMAIN, spec.id, spec.type, JSON.stringify(payload));
    markDirty();
  }
}

export function listAddSectionsAdmin() {
  ensureAddSectionsDomain();
  const domain = getRow<{ published_at: string | null }>(
    'SELECT published_at FROM content_domains WHERE id=?',
    ADD_SECTIONS_DOMAIN,
  );
  return rows<{ id: string; type: string; payload_json: string }>(
    'SELECT id, type, payload_json FROM add_sections WHERE domain_id=? ORDER BY id',
    ADD_SECTIONS_DOMAIN,
  ).map(row => {
    const { en, fr } = parsePayload(row.payload_json);
    return {
      id: row.id,
      type: row.type as SectionType,
      titleEn: en.title,
      titleFr: fr.title,
      tabEn: en.tab,
      tabFr: fr.tab,
      subtitleEn: en.subtitle,
      subtitleFr: fr.subtitle,
      itemCount: Math.max(sectionItemCount(en), sectionItemCount(fr)),
      publishedAt: domain?.published_at ?? null,
    };
  });
}

export function getAddSectionAdmin(id: string): AddSectionPayload & { id: string; type: SectionType } | null {
  ensureAddSectionsDomain();
  const row = getRow<{ id: string; type: string; payload_json: string }>(
    'SELECT id, type, payload_json FROM add_sections WHERE domain_id=? AND id=?',
    ADD_SECTIONS_DOMAIN,
    id,
  );
  if (!row) return null;
  const payload = parsePayload(row.payload_json);
  return { id: row.id, type: row.type as SectionType, ...payload };
}


function existingSectionIds(): Set<string> {
  return new Set(rows<{ id: string }>(
    'SELECT id FROM add_sections WHERE domain_id=?',
    ADD_SECTIONS_DOMAIN,
  ).map(r => r.id));
}

function slugSectionId(raw: string, taken: Set<string>): string {
  const id = slugify(raw.trim() || 'section', taken);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Section id must be lowercase letters, digits and hyphens');
  return id;
}

/** Create a custom ADD section in the library. */
export function createAddSection(input: AddSectionCreate): string {
  ensureAddSectionsDomain();
  const taken = existingSectionIds();
  const titleEn = input.titleEn.trim();
  if (!titleEn) throw new Error('English title is required');
  const id = input.id?.trim()
    ? slugSectionId(input.id.trim(), new Set())
    : slugSectionId(titleEn, taken);
  if (taken.has(id)) throw new Error(`Section "${id}" already exists`);
  const titleFr = (input.titleFr?.trim() || titleEn).trim();

  const en = blankSection(input.type, taken);
  en.id = id;
  en.title = titleEn;
  en.tab = titleEn;

  const fr = structuredClone(en);
  fr.title = titleFr;
  fr.tab = titleFr;

  db.prepare(
    'INSERT INTO add_sections (domain_id, id, type, payload_json) VALUES (?, ?, ?, ?)'
  ).run(ADD_SECTIONS_DOMAIN, id, input.type, JSON.stringify({ en, fr }));
  markDirty();
  return id;
}

/** Remove a section from the library. Preset rows can be re-seeded on next ensure. */
export function deleteAddSection(id: string): void {
  ensureAddSectionsDomain();
  const result = db.prepare(
    'DELETE FROM add_sections WHERE domain_id=? AND id=?'
  ).run(ADD_SECTIONS_DOMAIN, id);
  if (!result.changes) throw new Error(`section not found: ${id}`);
  markDirty();
}

export function updateAddSection(id: string, body: AddSectionPayload): void {
  ensureAddSectionsDomain();
  if (!getAddSectionAdmin(id)) throw new Error(`section not found: ${id}`);
  if (body.en.id !== id || body.fr.id !== id) throw new Error('section id mismatch');
  db.prepare(
    'UPDATE add_sections SET type=?, payload_json=? WHERE domain_id=? AND id=?'
  ).run(body.en.type, JSON.stringify({
    en: body.en,
    fr: body.fr,
  }), ADD_SECTIONS_DOMAIN, id);
  markDirty();
}

export function validateAddSectionsPublish(): CatalogIssue[] {
  ensureAddSectionsDomain();
  const issues: CatalogIssue[] = [];
  for (const row of rows<{ id: string; payload_json: string }>(
    'SELECT id, payload_json FROM add_sections WHERE domain_id=?',
    ADD_SECTIONS_DOMAIN,
  )) {
    const { en, fr } = parsePayload(row.payload_json);
    for (const [lang, sec] of [['EN', en], ['FR', fr]] as const) {
      if (hasPlaceholder(sec)) {
        issues.push({
          code: 'placeholder_section',
          message: `Section "${row.id}" contains placeholder content (${lang})`,
          entityId: row.id,
          field: lang === 'EN' ? 'en' : 'fr',
        });
      }
    }
  }
  return issues;
}

export function publishAddSections(): PublishAddSectionsResult {
  const issues = validateAddSectionsPublish();
  if (issues.length > 0) return { ok: false, issues };
  const publishedAt = now();
  db.prepare('UPDATE content_domains SET status=?, published_at=? WHERE id=?')
    .run('published', publishedAt, ADD_SECTIONS_DOMAIN);
  return { ok: true, publishedAt };
}

export function getAddSectionsAdminState(options?: { validate?: boolean }): AddSectionAdminState {
  ensureAddSectionsDomain();
  const domain = getRow<{ status: string; published_at: string | null }>(
    'SELECT status, published_at FROM content_domains WHERE id=?',
    ADD_SECTIONS_DOMAIN,
  );
  const sectionCount = getRow<{ n: number }>(
    'SELECT COUNT(*) AS n FROM add_sections WHERE domain_id=?',
    ADD_SECTIONS_DOMAIN,
  )?.n ?? 0;
  const state: AddSectionAdminState = {
    dirty: domain?.status !== 'published',
    publishedAt: domain?.published_at ?? null,
    sectionCount,
  };
  if (!options?.validate) return state;
  const issues = validateAddSectionsPublish();
  return { ...state, issueCount: issues.length, issues };
}

/** Runtime read when domain is published (ISC-M3). */
export function getPublishedAddSection(id: string, lang?: Lang): Section | null {
  ensureAddSectionsDomain();
  const domain = getRow<{ status: string }>(
    'SELECT status FROM content_domains WHERE id=?',
    ADD_SECTIONS_DOMAIN,
  );
  if (domain?.status !== 'published') return null;
  const detail = getAddSectionAdmin(id);
  if (!detail) return null;
  const l: Lang = lang ?? 'en';
  return l === 'fr' ? detail.fr : detail.en;
}

export function buildSectionPreviewHtml(section: Section, lang: 'en' | 'fr'): string {
  const doc = blankArchitecture('Section preview');
  doc.meta.lang = lang;
  doc.meta.title = section.title;
  doc.groups = STARTER_GROUPS();
  doc.layers = STARTER_LAYERS.map(layer => ({ ...layer }));
  doc.sections = [section];
  doc.ui.tabs = [section.id];
  return buildStandaloneHtml(normalizeArchitecture(doc));
}
