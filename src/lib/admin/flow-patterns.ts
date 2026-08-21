import { FLOW_CATALOG } from '../flows/catalog';
import { slugify } from '../defaults';
import { db, now, plain, plainAll } from '../db';
import type { CatalogIssue } from '../lego/admin-catalog';
import { resolveDeep, type Lang } from '../templates/types';
import type { FlowPattern, FlowTemplate } from '../flows/types';

export const FLOW_PATTERNS_DOMAIN = 'flow-patterns';

export const LOCKED_FLOW_PATTERN_IDS = FLOW_CATALOG.map(p => p.id);

export type FlowPatternAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  patternCount: number;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export type PublishFlowPatternsResult =
  | { ok: true; publishedAt: string }
  | { ok: false; issues: CatalogIssue[] };

export type FlowPatternCreate = {
  id?: string;
  icon?: string;
  nameEn: string;
  nameFr?: string;
  taglineEn?: string;
  taglineFr?: string;
};

export type AdminFlowListItem = {
  id: string;
  icon: string;
  nameEn: string;
  nameFr: string;
  taglineEn: string;
  taglineFr: string;
  stepCount: number;
  locked: boolean;
  publishedAt?: string | null;
};

function getRow<T>(sql: string, ...params: (string | number | null)[]): T | null {
  const raw = db.prepare(sql).get(...params);
  if (!raw) return null;
  return plain<T>(raw);
}

function rows<T>(sql: string, ...values: (string | number | null)[]): T[] {
  return plainAll<T>(db.prepare(sql).all(...values));
}


export function isLockedFlowPattern(id: string): boolean {
  return LOCKED_FLOW_PATTERN_IDS.includes(id);
}

function existingPatternIds(): Set<string> {
  return new Set(rows<{ id: string }>(
    'SELECT id FROM flow_patterns WHERE domain_id=?',
    FLOW_PATTERNS_DOMAIN,
  ).map(r => r.id));
}

function slugPatternId(raw: string, taken: Set<string>): string {
  const id = slugify(raw.trim() || 'pattern', taken);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Pattern id must be lowercase letters, digits and hyphens');
  return id;
}

function blankPattern(id: string, nameEn: string, nameFr: string, taglineEn: string, taglineFr: string, icon: string): FlowTemplate {
  return {
    id,
    icon,
    name: { en: nameEn, fr: nameFr },
    tagline: { en: taglineEn, fr: taglineFr },
    steps: [
      {
        key: 'start',
        title: { en: 'Start', fr: 'Début' },
        hint: { name: [id, 'start'] },
      },
      {
        key: 'end',
        title: { en: 'End', fr: 'Fin' },
        hint: { name: [id, 'end'] },
      },
    ],
  };
}

function parseTemplate(raw: string | null): FlowTemplate {
  if (!raw) throw new Error('flow pattern payload_json is missing');
  return JSON.parse(raw) as FlowTemplate;
}


function pair(v: { en?: string; fr?: string } | string | undefined): { en: string; fr: string } {
  if (!v) return { en: '', fr: '' };
  if (typeof v === 'string') return { en: v, fr: v };
  return { en: v.en ?? '', fr: v.fr ?? '' };
}

function markDirty(): void {
  db.prepare('UPDATE content_domains SET status=?, published_at=published_at WHERE id=?')
    .run('draft', FLOW_PATTERNS_DOMAIN);
}

function validateTemplate(tpl: FlowTemplate): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const req = (field: string, ok: boolean, message: string) => {
    if (!ok) issues.push({ code: 'invalid_flow_pattern', message, entityId: tpl.id, field });
  };
  req('icon', !!tpl.icon?.trim(), `Pattern "${tpl.id}" needs an icon`);
  req('name.en', !!pair(tpl.name).en.trim(), `Pattern "${tpl.id}" missing English name`);
  req('name.fr', !!pair(tpl.name).fr.trim(), `Pattern "${tpl.id}" missing French name`);
  req('tagline.en', !!pair(tpl.tagline).en.trim(), `Pattern "${tpl.id}" missing English tagline`);
  req('tagline.fr', !!pair(tpl.tagline).fr.trim(), `Pattern "${tpl.id}" missing French tagline`);
  if (!Array.isArray(tpl.steps) || tpl.steps.length < 2) {
    issues.push({ code: 'invalid_flow_pattern', message: `Pattern "${tpl.id}" needs at least two steps`, entityId: tpl.id, field: 'steps' });
    return issues;
  }
  const keys = new Set<string>();
  tpl.steps.forEach((step, i) => {
    if (!step.key?.trim()) {
      issues.push({ code: 'invalid_flow_pattern', message: `Step ${i + 1} in "${tpl.id}" needs a key`, entityId: tpl.id, field: `steps.${i}.key` });
    } else if (keys.has(step.key)) {
      issues.push({ code: 'duplicate_step_key', message: `Duplicate step key "${step.key}" in "${tpl.id}"`, entityId: tpl.id, field: `steps.${i}.key` });
    } else {
      keys.add(step.key);
    }
    if (!pair(step.title).en.trim() || !pair(step.title).fr.trim()) {
      issues.push({ code: 'invalid_flow_pattern', message: `Step "${step.key}" in "${tpl.id}" needs bilingual title`, entityId: tpl.id, field: `steps.${step.key}.title` });
    }
    const hint = step.hint ?? {};
    const hasSignal = [hint.name, hint.tech, hint.layers, hint.icons].some(arr => Array.isArray(arr) && arr.length > 0);
    if (!hasSignal) {
      issues.push({ code: 'invalid_flow_pattern', message: `Step "${step.key}" in "${tpl.id}" needs at least one hint signal`, entityId: tpl.id, field: `steps.${step.key}.hint` });
    }
  });
  return issues;
}

/** Ensures domain + seeds 8 locked patterns from code catalog. */
export function ensureFlowPatternsDomain(): void {
  const existing = getRow<{ id: string }>('SELECT id FROM content_domains WHERE id=?', FLOW_PATTERNS_DOMAIN);
  if (!existing) {
    db.prepare('INSERT INTO content_domains (id, status, published_at) VALUES (?, ?, NULL)')
      .run(FLOW_PATTERNS_DOMAIN, 'draft');
  }
  for (const tpl of FLOW_CATALOG) {
    const row = getRow<{ id: string }>(
      'SELECT id FROM flow_patterns WHERE domain_id=? AND id=?',
      FLOW_PATTERNS_DOMAIN,
      tpl.id,
    );
    if (row) continue;
    db.prepare(
      'INSERT INTO flow_patterns (domain_id, id, payload_json) VALUES (?, ?, ?)'
    ).run(FLOW_PATTERNS_DOMAIN, tpl.id, JSON.stringify(tpl));
    markDirty();
  }
}

export function listFlowPatternsAdmin(): AdminFlowListItem[] {
  ensureFlowPatternsDomain();
  const domain = getRow<{ published_at: string | null }>(
    'SELECT published_at FROM content_domains WHERE id=?',
    FLOW_PATTERNS_DOMAIN,
  );
  return rows<{ id: string; payload_json: string }>(
    'SELECT id, payload_json FROM flow_patterns WHERE domain_id=? ORDER BY id',
    FLOW_PATTERNS_DOMAIN,
  ).map(row => {
    const tpl = parseTemplate(row.payload_json);
    return {
      id: tpl.id,
      icon: tpl.icon,
      nameEn: pair(tpl.name).en,
      nameFr: pair(tpl.name).fr,
      taglineEn: pair(tpl.tagline).en,
      taglineFr: pair(tpl.tagline).fr,
      stepCount: tpl.steps.length,
      locked: isLockedFlowPattern(tpl.id),
      publishedAt: domain?.published_at ?? null,
    };
  });
}

export function getFlowPatternAdmin(id: string): FlowTemplate | null {
  ensureFlowPatternsDomain();
  const row = getRow<{ payload_json: string }>(
    'SELECT payload_json FROM flow_patterns WHERE domain_id=? AND id=?',
    FLOW_PATTERNS_DOMAIN,
    id,
  );
  if (!row) return null;
  return parseTemplate(row.payload_json);
}

export function createFlowPattern(input: FlowPatternCreate): string {
  ensureFlowPatternsDomain();
  const taken = existingPatternIds();
  const nameEn = input.nameEn.trim();
  if (!nameEn) throw new Error('English name is required');
  const id = input.id?.trim()
    ? slugPatternId(input.id.trim(), new Set())
    : slugPatternId(nameEn, taken);
  if (taken.has(id)) throw new Error(`Pattern "${id}" already exists`);
  const nameFr = (input.nameFr?.trim() || nameEn).trim();
  const taglineEn = (input.taglineEn?.trim() || nameEn).trim();
  const taglineFr = (input.taglineFr?.trim() || nameFr).trim();
  const icon = (input.icon?.trim() || 'route');
  const tpl = blankPattern(id, nameEn, nameFr, taglineEn, taglineFr, icon);
  db.prepare(
    'INSERT INTO flow_patterns (domain_id, id, payload_json) VALUES (?, ?, ?)'
  ).run(FLOW_PATTERNS_DOMAIN, id, JSON.stringify(tpl));
  markDirty();
  return id;
}

export function deleteFlowPattern(id: string): void {
  ensureFlowPatternsDomain();
  const result = db.prepare(
    'DELETE FROM flow_patterns WHERE domain_id=? AND id=?'
  ).run(FLOW_PATTERNS_DOMAIN, id);
  if (!result.changes) throw new Error(`flow pattern not found: ${id}`);
  markDirty();
}

export function updateFlowPattern(id: string, body: FlowTemplate): void {
  ensureFlowPatternsDomain();
  if (body.id !== id) throw new Error('flow pattern id mismatch');
  if (!getFlowPatternAdmin(id)) throw new Error(`flow pattern not found: ${id}`);
  const issues = validateTemplate(body);
  if (issues.length > 0) throw new Error(issues[0]!.message);
  db.prepare(
    'UPDATE flow_patterns SET payload_json=? WHERE domain_id=? AND id=?'
  ).run(JSON.stringify(body), FLOW_PATTERNS_DOMAIN, id);
  markDirty();
}

export function validateFlowPatternsPublish(): CatalogIssue[] {
  ensureFlowPatternsDomain();
  const issues: CatalogIssue[] = [];
  const rowsData = rows<{ id: string; payload_json: string }>(
    'SELECT id, payload_json FROM flow_patterns WHERE domain_id=?',
    FLOW_PATTERNS_DOMAIN,
  );
  for (const expectedId of LOCKED_FLOW_PATTERN_IDS) {
    if (!rowsData.some(r => r.id === expectedId)) {
      issues.push({ code: 'missing_flow_pattern', message: `Missing locked pattern "${expectedId}"`, entityId: expectedId });
    }
  }
  for (const row of rowsData) {
    issues.push(...validateTemplate(parseTemplate(row.payload_json)));
  }
  return issues;
}

export function publishFlowPatterns(): PublishFlowPatternsResult {
  const issues = validateFlowPatternsPublish();
  if (issues.length > 0) return { ok: false, issues };
  const publishedAt = now();
  db.prepare('UPDATE content_domains SET status=?, published_at=? WHERE id=?')
    .run('published', publishedAt, FLOW_PATTERNS_DOMAIN);
  return { ok: true, publishedAt };
}

export function getFlowPatternsAdminState(options?: { validate?: boolean }): FlowPatternAdminState {
  ensureFlowPatternsDomain();
  const domain = getRow<{ status: string; published_at: string | null }>(
    'SELECT status, published_at FROM content_domains WHERE id=?',
    FLOW_PATTERNS_DOMAIN,
  );
  const patternCount = getRow<{ n: number }>(
    'SELECT COUNT(*) AS n FROM flow_patterns WHERE domain_id=?',
    FLOW_PATTERNS_DOMAIN,
  )?.n ?? 0;
  const state: FlowPatternAdminState = {
    dirty: domain?.status !== 'published',
    publishedAt: domain?.published_at ?? null,
    patternCount,
  };
  if (!options?.validate) return state;
  const issues = validateFlowPatternsPublish();
  return { ...state, issueCount: issues.length, issues };
}

/** Runtime read when domain is published (ISC-M4). */
export function getPublishedFlowCatalog(lang: Lang): FlowPattern[] {
  ensureFlowPatternsDomain();
  const domain = getRow<{ status: string }>(
    'SELECT status FROM content_domains WHERE id=?',
    FLOW_PATTERNS_DOMAIN,
  );
  if (domain?.status !== 'published') return [];
  return rows<{ payload_json: string }>(
    'SELECT payload_json FROM flow_patterns WHERE domain_id=? ORDER BY id',
    FLOW_PATTERNS_DOMAIN,
  ).map(row => ({
    ...resolveDeep<Omit<FlowPattern, 'source'>>(parseTemplate(row.payload_json), lang),
    source: 'catalog' as const,
  }));
}

export function templateToResolvedPattern(tpl: FlowTemplate, lang: Lang): FlowPattern {
  return {
    ...resolveDeep<Omit<FlowPattern, 'source'>>(tpl, lang),
    source: 'catalog',
  };
}
