import { DEFAULT_FLOW_COPY } from '../defaults';
import { db, now, plain, plainAll } from '../db';
import { LAYER_DISPLAY } from '../layers';
import type { CatalogIssue } from '../lego/admin-catalog';

export const SYSTEM_COPY_DOMAIN = 'system-copy';

export type SystemCopyPair = { en: string; fr: string };

export type AdminSystemCopyItem = {
  key: string;
  en: string;
  fr: string;
  seeded: boolean;
};

export type SystemCopyAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  keyCount: number;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export type PublishSystemCopyResult =
  | { ok: true; publishedAt: string }
  | { ok: false; issues: CatalogIssue[] };

const FLOW_FIELDS = Object.keys(DEFAULT_FLOW_COPY.en) as (keyof typeof DEFAULT_FLOW_COPY.en)[];

/** Canonical seed map: flow defaults, layer labels, blank-doc meta. */
export function buildSeededSystemCopy(): Record<string, SystemCopyPair> {
  const seed: Record<string, SystemCopyPair> = {};
  for (const field of FLOW_FIELDS) {
    seed[`flow.default.${field}`] = {
      en: DEFAULT_FLOW_COPY.en[field],
      fr: DEFAULT_FLOW_COPY.fr[field],
    };
  }
  for (const [id, labels] of Object.entries(LAYER_DISPLAY)) {
    seed[`layer.${id}`] = { en: labels.en, fr: labels.fr };
  }
  seed['meta.tagline'] = {
    en: 'Architecture Explorer',
    fr: 'Architecture Explorer',
  };
  return seed;
}

export const SEEDED_SYSTEM_COPY_KEYS = Object.keys(buildSeededSystemCopy());

function getRow<T>(sql: string, ...params: (string | number | null)[]): T | null {
  const raw = db.prepare(sql).get(...params);
  if (!raw) return null;
  return plain<T>(raw);
}

function rows<T>(sql: string, ...values: (string | number | null)[]): T[] {
  return plainAll<T>(db.prepare(sql).all(...values));
}

function markDirty(): void {
  db.prepare('UPDATE content_domains SET status=?, published_at=published_at WHERE id=?')
    .run('draft', SYSTEM_COPY_DOMAIN);
}

function normalizePair(input: SystemCopyPair): SystemCopyPair {
  return {
    en: typeof input.en === 'string' ? input.en : '',
    fr: typeof input.fr === 'string' ? input.fr : '',
  };
}

function validateKey(key: string): void {
  if (!/^[a-z][a-z0-9._-]*$/i.test(key)) {
    throw new Error('system copy key must start with a letter and contain only letters, digits, dots, underscores or hyphens');
  }
}

export function isSeededSystemCopyKey(key: string): boolean {
  return SEEDED_SYSTEM_COPY_KEYS.includes(key);
}

/** Ensures domain + seeds code constants. Missing seeded keys re-seed. */
export function ensureSystemCopyDomain(): void {
  const existing = getRow<{ id: string }>('SELECT id FROM content_domains WHERE id=?', SYSTEM_COPY_DOMAIN);
  if (!existing) {
    db.prepare('INSERT INTO content_domains (id, status, published_at) VALUES (?, ?, NULL)')
      .run(SYSTEM_COPY_DOMAIN, 'draft');
  }
  const seed = buildSeededSystemCopy();
  for (const [key, pair] of Object.entries(seed)) {
    const row = getRow<{ key: string }>(
      'SELECT key FROM system_copy WHERE domain_id=? AND key=?',
      SYSTEM_COPY_DOMAIN,
      key,
    );
    if (row) continue;
    db.prepare(
      'INSERT INTO system_copy (domain_id, key, en, fr) VALUES (?, ?, ?, ?)'
    ).run(SYSTEM_COPY_DOMAIN, key, pair.en, pair.fr);
    markDirty();
  }
}

export function listSystemCopy(): AdminSystemCopyItem[] {
  ensureSystemCopyDomain();
  return rows<{ key: string; en: string; fr: string }>(
    'SELECT key, en, fr FROM system_copy WHERE domain_id=? ORDER BY key',
    SYSTEM_COPY_DOMAIN,
  ).map(row => ({
    key: row.key,
    en: row.en,
    fr: row.fr,
    seeded: isSeededSystemCopyKey(row.key),
  }));
}

export function getSystemCopy(key: string): AdminSystemCopyItem | null {
  ensureSystemCopyDomain();
  const row = getRow<{ key: string; en: string; fr: string }>(
    'SELECT key, en, fr FROM system_copy WHERE domain_id=? AND key=?',
    SYSTEM_COPY_DOMAIN,
    key,
  );
  if (!row) return null;
  return {
    key: row.key,
    en: row.en,
    fr: row.fr,
    seeded: isSeededSystemCopyKey(row.key),
  };
}

export function upsertSystemCopy(key: string, pair: SystemCopyPair): void {
  ensureSystemCopyDomain();
  const trimmed = key.trim();
  validateKey(trimmed);
  const next = normalizePair(pair);
  db.prepare(
    `INSERT INTO system_copy (domain_id, key, en, fr) VALUES (?, ?, ?, ?)
     ON CONFLICT(domain_id, key) DO UPDATE SET en=excluded.en, fr=excluded.fr`
  ).run(SYSTEM_COPY_DOMAIN, trimmed, next.en, next.fr);
  markDirty();
}

export function deleteSystemCopy(key: string): void {
  ensureSystemCopyDomain();
  const result = db.prepare(
    'DELETE FROM system_copy WHERE domain_id=? AND key=?'
  ).run(SYSTEM_COPY_DOMAIN, key);
  if (!result.changes) throw new Error(`system copy key not found: ${key}`);
  markDirty();
}

export function validateSystemCopyPublish(): CatalogIssue[] {
  ensureSystemCopyDomain();
  const issues: CatalogIssue[] = [];
  const present = new Set(
    rows<{ key: string }>('SELECT key FROM system_copy WHERE domain_id=?', SYSTEM_COPY_DOMAIN).map(r => r.key),
  );
  for (const key of SEEDED_SYSTEM_COPY_KEYS) {
    if (!present.has(key)) {
      issues.push({
        code: 'missing_system_copy',
        message: `Missing seeded system copy "${key}"`,
        entityId: key,
      });
    }
  }
  for (const row of listSystemCopy()) {
    if (!row.en.trim()) {
      issues.push({
        code: 'invalid_system_copy',
        message: `System copy "${row.key}" missing English text`,
        entityId: row.key,
        field: 'en',
      });
    }
    if (!row.fr.trim()) {
      issues.push({
        code: 'invalid_system_copy',
        message: `System copy "${row.key}" missing French text`,
        entityId: row.key,
        field: 'fr',
      });
    }
  }
  return issues;
}

export function publishSystemCopy(): PublishSystemCopyResult {
  const issues = validateSystemCopyPublish();
  if (issues.length > 0) return { ok: false, issues };
  const publishedAt = now();
  db.prepare('UPDATE content_domains SET status=?, published_at=? WHERE id=?')
    .run('published', publishedAt, SYSTEM_COPY_DOMAIN);
  return { ok: true, publishedAt };
}

export function getSystemCopyState(options?: { validate?: boolean }): SystemCopyAdminState {
  ensureSystemCopyDomain();
  const domain = getRow<{ status: string; published_at: string | null }>(
    'SELECT status, published_at FROM content_domains WHERE id=?',
    SYSTEM_COPY_DOMAIN,
  );
  const keyCount = getRow<{ n: number }>(
    'SELECT COUNT(*) AS n FROM system_copy WHERE domain_id=?',
    SYSTEM_COPY_DOMAIN,
  )?.n ?? 0;
  const state: SystemCopyAdminState = {
    dirty: domain?.status !== 'published',
    publishedAt: domain?.published_at ?? null,
    keyCount,
  };
  if (!options?.validate) return state;
  const issues = validateSystemCopyPublish();
  return { ...state, issueCount: issues.length, issues };
}

/** Runtime map when domain is published; empty object if still draft. */
export function getPublishedSystemCopy(): Record<string, SystemCopyPair> {
  ensureSystemCopyDomain();
  const domain = getRow<{ status: string }>(
    'SELECT status FROM content_domains WHERE id=?',
    SYSTEM_COPY_DOMAIN,
  );
  if (domain?.status !== 'published') return {};
  const out: Record<string, SystemCopyPair> = {};
  for (const row of rows<{ key: string; en: string; fr: string }>(
    'SELECT key, en, fr FROM system_copy WHERE domain_id=?',
    SYSTEM_COPY_DOMAIN,
  )) {
    out[row.key] = { en: row.en, fr: row.fr };
  }
  return out;
}

/** Draft map for export/import (editable state). */
export function getDraftSystemCopyMap(): Record<string, SystemCopyPair> {
  ensureSystemCopyDomain();
  const out: Record<string, SystemCopyPair> = {};
  for (const row of listSystemCopy()) {
    out[row.key] = { en: row.en, fr: row.fr };
  }
  return out;
}

/** Replace all draft rows (used by bundle replace). Seeded gaps filled by ensure. */
export function replaceSystemCopyMap(map: Record<string, SystemCopyPair>): void {
  ensureSystemCopyDomain();
  db.prepare('DELETE FROM system_copy WHERE domain_id=?').run(SYSTEM_COPY_DOMAIN);
  for (const [key, pair] of Object.entries(map)) {
    const next = normalizePair(pair);
    validateKey(key);
    db.prepare(
      'INSERT INTO system_copy (domain_id, key, en, fr) VALUES (?, ?, ?, ?)'
    ).run(SYSTEM_COPY_DOMAIN, key, next.en, next.fr);
  }
  markDirty();
  ensureSystemCopyDomain();
}
