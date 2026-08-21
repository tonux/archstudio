import { slugify } from '../defaults';
import { db, now, plain, plainAll } from '../db';
import type { CatalogIssue } from '../lego/admin-catalog';
import { SERVICES, SERVICES_VERIFIED_ON, type ServiceRow } from '../templates/services';
import { RESOLVED_TARGETS, type L10n, type ResolvedTarget } from '../templates/types';

export const CLOUD_SERVICES_DOMAIN = 'cloud-services';
export const CLOUD_SERVICES_VERIFIED_KEY = 'cloud-services.verified-on';

export const SEEDED_SERVICE_ROLE_KEYS = Object.keys(SERVICES) as (keyof typeof SERVICES)[];

export type CloudServiceAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  serviceCount: number;
  verifiedOn: string;
  issueCount?: number;
  issues?: CatalogIssue[];
};

export type PublishCloudServicesResult =
  | { ok: true; publishedAt: string }
  | { ok: false; issues: CatalogIssue[] };

export type AdminCloudServiceItem = {
  roleKey: string;
  locked: boolean;
  payload: ServiceRow;
};

export type CloudServiceCreate = {
  roleKey?: string;
  payload?: ServiceRow;
};

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
    .run('draft', CLOUD_SERVICES_DOMAIN);
}

function parseRow(raw: string | null): ServiceRow {
  if (!raw) throw new Error('cloud service payload_json is missing');
  return JSON.parse(raw) as ServiceRow;
}

function blankCell(): ServiceRow[ResolvedTarget] {
  return { name: '' };
}

function blankServiceRow(): ServiceRow {
  return {
    aws: blankCell(),
    gcp: blankCell(),
    azure: blankCell(),
    selfhosted: blankCell(),
  };
}

function cellName(v: L10n | undefined): string {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  return (v.en ?? v.fr ?? '').trim();
}

function validateServiceRow(roleKey: string, payload: ServiceRow): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const target of RESOLVED_TARGETS) {
    const cell = payload[target];
    if (!cell) {
      issues.push({
        code: 'invalid_cloud_service',
        message: `Service "${roleKey}" missing ${target} cell`,
        entityId: roleKey,
        field: target,
      });
      continue;
    }
    if (!cellName(cell.name)) {
      issues.push({
        code: 'invalid_cloud_service',
        message: `Service "${roleKey}" ${target} needs a name`,
        entityId: roleKey,
        field: `${target}.name`,
      });
    }
  }
  return issues;
}

function readVerifiedOn(): string {
  const row = getRow<{ value: string }>('SELECT value FROM settings WHERE key=?', CLOUD_SERVICES_VERIFIED_KEY);
  const value = row?.value?.trim();
  return value || SERVICES_VERIFIED_ON;
}

export function setCloudServicesVerifiedOn(value: string): void {
  const next = value.trim() || SERVICES_VERIFIED_ON;
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run(CLOUD_SERVICES_VERIFIED_KEY, next, now());
  markDirty();
}

/** Ensures domain + seeds every SERVICES role key. Missing locked keys re-seed. */
export function ensureCloudServicesDomain(): void {
  const existing = getRow<{ id: string }>('SELECT id FROM content_domains WHERE id=?', CLOUD_SERVICES_DOMAIN);
  if (!existing) {
    db.prepare('INSERT INTO content_domains (id, status, published_at) VALUES (?, ?, NULL)')
      .run(CLOUD_SERVICES_DOMAIN, 'draft');
  }
  if (!getRow<{ value: string }>('SELECT value FROM settings WHERE key=?', CLOUD_SERVICES_VERIFIED_KEY)) {
    db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    ).run(CLOUD_SERVICES_VERIFIED_KEY, SERVICES_VERIFIED_ON, now());
  }
  for (const roleKey of SEEDED_SERVICE_ROLE_KEYS) {
    const row = getRow<{ role_key: string }>(
      'SELECT role_key FROM cloud_services WHERE domain_id=? AND role_key=?',
      CLOUD_SERVICES_DOMAIN,
      roleKey,
    );
    if (row) continue;
    db.prepare(
      'INSERT INTO cloud_services (domain_id, role_key, payload_json) VALUES (?, ?, ?)'
    ).run(CLOUD_SERVICES_DOMAIN, roleKey, JSON.stringify(SERVICES[roleKey]));
    markDirty();
  }
}

export function isSeededServiceRole(roleKey: string): boolean {
  return (SEEDED_SERVICE_ROLE_KEYS as readonly string[]).includes(roleKey);
}

export function listCloudServicesAdmin(): AdminCloudServiceItem[] {
  ensureCloudServicesDomain();
  return rows<{ role_key: string; payload_json: string }>(
    'SELECT role_key, payload_json FROM cloud_services WHERE domain_id=? ORDER BY role_key',
    CLOUD_SERVICES_DOMAIN,
  ).map(row => ({
    roleKey: row.role_key,
    locked: isSeededServiceRole(row.role_key),
    payload: parseRow(row.payload_json),
  }));
}

export function getCloudServiceAdmin(roleKey: string): AdminCloudServiceItem | null {
  ensureCloudServicesDomain();
  const row = getRow<{ role_key: string; payload_json: string }>(
    'SELECT role_key, payload_json FROM cloud_services WHERE domain_id=? AND role_key=?',
    CLOUD_SERVICES_DOMAIN,
    roleKey,
  );
  if (!row) return null;
  return {
    roleKey: row.role_key,
    locked: isSeededServiceRole(row.role_key),
    payload: parseRow(row.payload_json),
  };
}

export function createCloudService(input: CloudServiceCreate): string {
  ensureCloudServicesDomain();
  const taken = new Set(listCloudServicesAdmin().map(s => s.roleKey));
  const raw = (input.roleKey?.trim() || 'service');
  const camel = raw.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const key = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(camel) ? camel : slugify(raw, taken).replace(/-/g, '_');
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
    throw new Error('role_key must start with a letter and contain only letters, digits and underscores');
  }
  if (taken.has(key)) throw new Error(`cloud service "${key}" already exists`);
  const payload = input.payload ?? blankServiceRow();
  if (input.payload) {
    const issues = validateServiceRow(key, payload);
    if (issues.length > 0) throw new Error(issues[0]!.message);
  }
  db.prepare(
    'INSERT INTO cloud_services (domain_id, role_key, payload_json) VALUES (?, ?, ?)'
  ).run(CLOUD_SERVICES_DOMAIN, key, JSON.stringify(payload));
  markDirty();
  return key;
}

export function deleteCloudService(roleKey: string): void {
  ensureCloudServicesDomain();
  const result = db.prepare(
    'DELETE FROM cloud_services WHERE domain_id=? AND role_key=?'
  ).run(CLOUD_SERVICES_DOMAIN, roleKey);
  if (!result.changes) throw new Error(`cloud service not found: ${roleKey}`);
  markDirty();
}

export function updateCloudService(roleKey: string, payload: ServiceRow): void {
  ensureCloudServicesDomain();
  if (!getCloudServiceAdmin(roleKey)) throw new Error(`cloud service not found: ${roleKey}`);
  const issues = validateServiceRow(roleKey, payload);
  if (issues.length > 0) throw new Error(issues[0]!.message);
  db.prepare(
    'UPDATE cloud_services SET payload_json=? WHERE domain_id=? AND role_key=?'
  ).run(JSON.stringify(payload), CLOUD_SERVICES_DOMAIN, roleKey);
  markDirty();
}

export function validateCloudServicesPublish(): CatalogIssue[] {
  ensureCloudServicesDomain();
  const issues: CatalogIssue[] = [];
  const rowsData = rows<{ role_key: string; payload_json: string }>(
    'SELECT role_key, payload_json FROM cloud_services WHERE domain_id=?',
    CLOUD_SERVICES_DOMAIN,
  );
  for (const expected of SEEDED_SERVICE_ROLE_KEYS) {
    if (!rowsData.some(r => r.role_key === expected)) {
      issues.push({
        code: 'missing_cloud_service',
        message: `Missing seeded cloud service "${expected}"`,
        entityId: expected,
      });
    }
  }
  for (const row of rowsData) {
    issues.push(...validateServiceRow(row.role_key, parseRow(row.payload_json)));
  }
  return issues;
}

export function publishCloudServices(): PublishCloudServicesResult {
  const issues = validateCloudServicesPublish();
  if (issues.length > 0) return { ok: false, issues };
  const publishedAt = now();
  db.prepare('UPDATE content_domains SET status=?, published_at=? WHERE id=?')
    .run('published', publishedAt, CLOUD_SERVICES_DOMAIN);
  return { ok: true, publishedAt };
}

export function getCloudServicesAdminState(options?: { validate?: boolean }): CloudServiceAdminState {
  ensureCloudServicesDomain();
  const domain = getRow<{ status: string; published_at: string | null }>(
    'SELECT status, published_at FROM content_domains WHERE id=?',
    CLOUD_SERVICES_DOMAIN,
  );
  const serviceCount = getRow<{ n: number }>(
    'SELECT COUNT(*) AS n FROM cloud_services WHERE domain_id=?',
    CLOUD_SERVICES_DOMAIN,
  )?.n ?? 0;
  const state: CloudServiceAdminState = {
    dirty: domain?.status !== 'published',
    publishedAt: domain?.published_at ?? null,
    serviceCount,
    verifiedOn: readVerifiedOn(),
  };
  if (!options?.validate) return state;
  const issues = validateCloudServicesPublish();
  return { ...state, issueCount: issues.length, issues };
}

export type PublishedServices = {
  services: Record<string, ServiceRow>;
  verifiedOn: string;
};

/** Runtime table when the domain is published. Null if draft. */
export function getPublishedServices(): PublishedServices | null {
  ensureCloudServicesDomain();
  const domain = getRow<{ status: string }>(
    'SELECT status FROM content_domains WHERE id=?',
    CLOUD_SERVICES_DOMAIN,
  );
  if (domain?.status !== 'published') return null;
  const services: Record<string, ServiceRow> = {};
  for (const row of rows<{ role_key: string; payload_json: string }>(
    'SELECT role_key, payload_json FROM cloud_services WHERE domain_id=?',
    CLOUD_SERVICES_DOMAIN,
  )) {
    services[row.role_key] = parseRow(row.payload_json);
  }
  return { services, verifiedOn: readVerifiedOn() };
}
