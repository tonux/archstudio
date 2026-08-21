import { db, now, plain, plainAll } from '../db';
import { ICON_KEYS, slugify } from '../defaults';
import { isConcernTag, type ConcernTag } from '../document/concerns';
import { CATALOG_SEED } from './seed-data';
import { ensureLegoCatalog, LEGO_CATALOG_VERSION } from './repository';

import type { SeedHostingMode } from './seed-data';
import type { HostingMode, LegoDependencyStrength, LegoIntent, LegoVariant } from './types';

export const LOCKED_SCOPE_IDS = CATALOG_SEED.scopes.map(([id]) => id);
export const LOCKED_INTENT_IDS = CATALOG_SEED.intents.map(intent => intent.id);
export const LOCKED_VARIANT_IDS = CATALOG_SEED.variants.map(variant => variant.id);
export const LOCKED_TECHNOLOGY_KEYS = Object.keys(CATALOG_SEED.technologyDescriptions);
export const LOCKED_BRICK_IDS = [
  ...new Set([
    ...Object.keys(CATALOG_SEED.icons),
    ...Object.keys(CATALOG_SEED.rolePhrases),
    ...Object.keys(CATALOG_SEED.roleScopes),
  ]),
];

export function isLockedScope(id: string): boolean {
  return (LOCKED_SCOPE_IDS as readonly string[]).includes(id);
}

export function isLockedIntent(id: string): boolean {
  return (LOCKED_INTENT_IDS as readonly string[]).includes(id);
}

export function isLockedVariant(id: string): boolean {
  return (LOCKED_VARIANT_IDS as readonly string[]).includes(id);
}

export function isLockedTechnology(key: string): boolean {
  return LOCKED_TECHNOLOGY_KEYS.includes(key);
}

export function isLockedBrick(id: string): boolean {
  return LOCKED_BRICK_IDS.includes(id);
}

function catalogEntityId(raw: string, taken: string[]): string {
  const trimmed = raw.trim();
  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(trimmed) && !taken.includes(trimmed)) return trimmed;
  return slugify(trimmed, taken);
}

export type ScopeAdminUpdate = { labelEn?: string; labelFr?: string };
export type ScopeAdminCreate = { id?: string; labelEn: string; labelFr: string };
export type IntentAdminUpdate = { label?: string; modes?: SeedHostingMode[]; shapes?: string[] };
export type IntentAdminCreate = {
  id?: string;
  label: string;
  modes?: SeedHostingMode[];
  shapes?: string[];
};
export type VariantAdminUpdate = { label?: string; intent?: string; mode?: SeedHostingMode; maps_to?: string };
export type VariantAdminCreate = {
  id?: string;
  label: string;
  intent: string;
  mode: SeedHostingMode;
  maps_to: string;
};
export type DependencyAdminPatch = {
  strength?: LegoDependencyStrength;
  why_en?: string;
  why_fr?: string;
  protocol_id?: string;
  kind?: 'sync' | 'async' | 'batch';
};
export type DependencyAdminCreate = {
  from: string;
  to: string;
  strength?: LegoDependencyStrength;
  why_en?: string;
  why_fr?: string;
  protocol_id?: string;
  kind?: 'sync' | 'async' | 'batch';
};
export type TechnologyDescriptionUpdate = { en?: string; fr?: string };
export type TechnologyAdminCreate = { key?: string; en: string; fr: string };
export type BrickAdminCreate = {
  id?: string;
  icon?: string;
  layer?: string;
  defaultScope: string;
  roleEn: string;
  roleFr: string;
  purposeEn?: string;
  purposeFr?: string;
  concernTags?: ConcernTag[];
};

const HOSTING_MODES = new Set<SeedHostingMode>(['client', 'baas', 'cloud', 'selfhosted']);

function intentExists(intentId: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM lego_intents WHERE catalog_version=? AND id=?')
      .get(LEGO_CATALOG_VERSION, intentId)
  );
}

function variantExists(variantId: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM lego_variants WHERE catalog_version=? AND id=?')
      .get(LEGO_CATALOG_VERSION, variantId)
  );
}

function dependencyExists(from: string, to: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM lego_dependencies WHERE catalog_version=? AND from_brick=? AND to_brick=?')
      .get(LEGO_CATALOG_VERSION, from, to)
  );
}

function validateHostingModes(modes: SeedHostingMode[]): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const mode of modes) {
    if (!HOSTING_MODES.has(mode)) {
      issues.push({ code: 'invalid_mode', message: `Invalid hosting mode "${mode}"`, field: 'modes' });
    }
  }
  return issues;
}

/** Lists catalog scopes with EN/FR labels. */
export function listScopes(): { id: string; labelEn: string; labelFr: string }[] {
  ensureLegoCatalog();
  return rows<{ id: string; label_en: string; label_fr: string }>(
    'SELECT id, label_en, label_fr FROM lego_scopes WHERE catalog_version=? ORDER BY rowid',
    LEGO_CATALOG_VERSION,
  ).map(row => ({ id: row.id, labelEn: row.label_en, labelFr: row.label_fr }));
}

/** Updates a scope label and marks the catalog dirty. */
export function updateScope(scopeId: string, payload: ScopeAdminUpdate): string {
  ensureLegoCatalog();
  if (!scopeExists(scopeId)) throw new Error(`Scope "${scopeId}" does not exist`);
  if (payload.labelEn !== undefined && !payload.labelEn.trim()) throw new Error('English label cannot be empty');
  if (payload.labelFr !== undefined && !payload.labelFr.trim()) throw new Error('French label cannot be empty');

  const current = plain<{ label_en: string; label_fr: string }>(
    db.prepare('SELECT label_en, label_fr FROM lego_scopes WHERE catalog_version=? AND id=?')
      .get(LEGO_CATALOG_VERSION, scopeId)
  );
  db.prepare('UPDATE lego_scopes SET label_en=?, label_fr=? WHERE catalog_version=? AND id=?').run(
    payload.labelEn ?? current.label_en,
    payload.labelFr ?? current.label_fr,
    LEGO_CATALOG_VERSION,
    scopeId,
  );
  markCatalogDirty();
  return scopeId;
}

/** Creates a catalog scope and marks the catalog dirty. */
export function createScope(payload: ScopeAdminCreate): string {
  ensureLegoCatalog();
  if (!payload.labelEn.trim()) throw new Error('English label cannot be empty');
  if (!payload.labelFr.trim()) throw new Error('French label cannot be empty');

  const taken = listScopes().map(scope => scope.id);
  const scopeId = catalogEntityId(payload.id?.trim() || payload.labelEn, taken);
  if (scopeExists(scopeId)) throw new Error(`Scope "${scopeId}" already exists`);

  db.prepare('INSERT INTO lego_scopes (catalog_version, id, label_en, label_fr) VALUES (?, ?, ?, ?)').run(
    LEGO_CATALOG_VERSION,
    scopeId,
    payload.labelEn.trim(),
    payload.labelFr.trim(),
  );
  markCatalogDirty();
  return scopeId;
}

/** Deletes a catalog scope when no brick still uses it as default_scope. Affinities/aliases cascade. */
export function deleteScope(scopeId: string): string {
  ensureLegoCatalog();
  if (!scopeExists(scopeId)) throw new Error(`Scope "${scopeId}" does not exist`);

  const brickRaw = db.prepare('SELECT id FROM lego_bricks WHERE catalog_version=? AND default_scope_id=? LIMIT 1')
    .get(LEGO_CATALOG_VERSION, scopeId);
  if (brickRaw) {
    const brickRef = plain<{ id: string }>(brickRaw);
    throw new Error(`Cannot delete scope "${scopeId}" — still used as default scope by brick "${brickRef.id}"`);
  }

  db.prepare('DELETE FROM lego_scopes WHERE catalog_version=? AND id=?').run(LEGO_CATALOG_VERSION, scopeId);
  markCatalogDirty();
  return scopeId;
}

/** Lists catalog intents. */
export function listIntents(): LegoIntent[] {
  ensureLegoCatalog();
  const version = LEGO_CATALOG_VERSION;
  return rows<{ id: string; label: string }>('SELECT id, label FROM lego_intents WHERE catalog_version=? ORDER BY rowid', version).map(value => ({
    ...value,
    modes: rows<{ mode: string }>('SELECT mode FROM lego_intent_modes WHERE catalog_version=? AND intent_id=? ORDER BY position', version, value.id).map(row => row.mode as HostingMode),
    shapes: rows<{ shape: string }>('SELECT shape FROM lego_intent_shapes WHERE catalog_version=? AND intent_id=? ORDER BY position', version, value.id).map(row => row.shape),
  }));
}

/** Returns one catalog intent by id. */
export function getIntent(intentId: string): LegoIntent | null {
  return listIntents().find(intent => intent.id === intentId) ?? null;
}

/** Updates a catalog intent and marks the catalog dirty. */
export function updateIntent(intentId: string, payload: IntentAdminUpdate): string {
  ensureLegoCatalog();
  if (!intentExists(intentId)) throw new Error(`Intent "${intentId}" does not exist`);
  if (payload.label !== undefined && !payload.label.trim()) throw new Error('Intent label cannot be empty');
  if (payload.modes !== undefined) {
    const modeIssues = validateHostingModes(payload.modes);
    if (modeIssues.length > 0) throw new Error(modeIssues.map(issue => issue.message).join('; '));
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    if (payload.label !== undefined) {
      db.prepare('UPDATE lego_intents SET label=? WHERE catalog_version=? AND id=?')
        .run(payload.label, LEGO_CATALOG_VERSION, intentId);
    }
    if (payload.modes !== undefined) {
      db.prepare('DELETE FROM lego_intent_modes WHERE catalog_version=? AND intent_id=?')
        .run(LEGO_CATALOG_VERSION, intentId);
      const mode = db.prepare('INSERT INTO lego_intent_modes VALUES (?, ?, ?, ?)');
      payload.modes.forEach((modeValue, position) => mode.run(LEGO_CATALOG_VERSION, intentId, modeValue, position));
    }
    if (payload.shapes !== undefined) {
      db.prepare('DELETE FROM lego_intent_shapes WHERE catalog_version=? AND intent_id=?')
        .run(LEGO_CATALOG_VERSION, intentId);
      const shape = db.prepare('INSERT INTO lego_intent_shapes VALUES (?, ?, ?, ?)');
      payload.shapes.forEach((shapeValue, position) => shape.run(LEGO_CATALOG_VERSION, intentId, shapeValue, position));
    }
    markCatalogDirty();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return intentId;
}

/** Creates a catalog intent and marks the catalog dirty. */
export function createIntent(payload: IntentAdminCreate): string {
  ensureLegoCatalog();
  if (!payload.label.trim()) throw new Error('Intent label cannot be empty');
  const modes = payload.modes ?? ['cloud'];
  const modeIssues = validateHostingModes(modes);
  if (modeIssues.length > 0) throw new Error(modeIssues.map(issue => issue.message).join('; '));

  const taken = listIntents().map(intent => intent.id);
  const intentId = catalogEntityId(payload.id?.trim() || payload.label, taken);
  if (intentExists(intentId)) throw new Error(`Intent "${intentId}" already exists`);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO lego_intents (catalog_version, id, label) VALUES (?, ?, ?)')
      .run(LEGO_CATALOG_VERSION, intentId, payload.label.trim());
    const mode = db.prepare('INSERT INTO lego_intent_modes VALUES (?, ?, ?, ?)');
    modes.forEach((modeValue, position) => mode.run(LEGO_CATALOG_VERSION, intentId, modeValue, position));
    if (payload.shapes?.length) {
      const shape = db.prepare('INSERT INTO lego_intent_shapes VALUES (?, ?, ?, ?)');
      payload.shapes.forEach((shapeValue, position) => shape.run(LEGO_CATALOG_VERSION, intentId, shapeValue, position));
    }
    markCatalogDirty();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return intentId;
}

/** Deletes a catalog intent (cascades dependent variants; locked rows re-seed on ensure). */
export function deleteIntent(intentId: string): string {
  ensureLegoCatalog();
  if (!intentExists(intentId)) throw new Error(`Intent "${intentId}" does not exist`);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM lego_variants WHERE catalog_version=? AND intent_id=?')
      .run(LEGO_CATALOG_VERSION, intentId);
    db.prepare('DELETE FROM lego_intent_shapes WHERE catalog_version=? AND intent_id=?')
      .run(LEGO_CATALOG_VERSION, intentId);
    db.prepare('DELETE FROM lego_intent_modes WHERE catalog_version=? AND intent_id=?')
      .run(LEGO_CATALOG_VERSION, intentId);
    db.prepare('DELETE FROM lego_intents WHERE catalog_version=? AND id=?')
      .run(LEGO_CATALOG_VERSION, intentId);
    markCatalogDirty();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return intentId;
}

/** Lists catalog variants. */
export function listVariants(): LegoVariant[] {
  ensureLegoCatalog();
  return rows<{ id: string; intent: string; label: string; mode: LegoVariant['mode']; maps_to: string }>(
    'SELECT id, intent_id AS intent, label, mode, brick_id AS maps_to FROM lego_variants WHERE catalog_version=? ORDER BY rowid',
    LEGO_CATALOG_VERSION,
  );
}

/** Updates a catalog variant and marks the catalog dirty. */
export function updateVariant(variantId: string, payload: VariantAdminUpdate): string {
  ensureLegoCatalog();
  if (!variantExists(variantId)) throw new Error(`Variant "${variantId}" does not exist`);
  if (payload.label !== undefined && !payload.label.trim()) throw new Error('Variant label cannot be empty');
  if (payload.intent !== undefined && !intentExists(payload.intent)) throw new Error(`Intent "${payload.intent}" does not exist`);
  if (payload.maps_to !== undefined && !brickExists(payload.maps_to)) throw new Error(`Brick "${payload.maps_to}" does not exist`);
  if (payload.mode !== undefined && !HOSTING_MODES.has(payload.mode)) throw new Error(`Invalid hosting mode "${payload.mode}"`);

  const current = plain<{ intent_id: string; label: string; mode: LegoVariant['mode']; brick_id: string }>(
    db.prepare('SELECT intent_id, label, mode, brick_id FROM lego_variants WHERE catalog_version=? AND id=?')
      .get(LEGO_CATALOG_VERSION, variantId)
  );
  db.prepare('UPDATE lego_variants SET intent_id=?, label=?, mode=?, brick_id=? WHERE catalog_version=? AND id=?').run(
    payload.intent ?? current.intent_id,
    payload.label ?? current.label,
    payload.mode ?? current.mode,
    payload.maps_to ?? current.brick_id,
    LEGO_CATALOG_VERSION,
    variantId,
  );
  markCatalogDirty();
  return variantId;
}

/** Creates a catalog variant and marks the catalog dirty. */
export function createVariant(payload: VariantAdminCreate): string {
  ensureLegoCatalog();
  if (!payload.label.trim()) throw new Error('Variant label cannot be empty');
  if (!intentExists(payload.intent)) throw new Error(`Intent "${payload.intent}" does not exist`);
  if (!brickExists(payload.maps_to)) throw new Error(`Brick "${payload.maps_to}" does not exist`);
  if (!HOSTING_MODES.has(payload.mode)) throw new Error(`Invalid hosting mode "${payload.mode}"`);

  const taken = listVariants().map(variant => variant.id);
  const variantId = catalogEntityId(payload.id?.trim() || payload.label, taken);
  if (variantExists(variantId)) throw new Error(`Variant "${variantId}" already exists`);

  db.prepare(
    'INSERT INTO lego_variants (catalog_version, id, intent_id, label, mode, brick_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    LEGO_CATALOG_VERSION,
    variantId,
    payload.intent,
    payload.label.trim(),
    payload.mode,
    payload.maps_to,
  );
  markCatalogDirty();
  return variantId;
}

/** Deletes a catalog variant. */
export function deleteVariant(variantId: string): string {
  ensureLegoCatalog();
  if (!variantExists(variantId)) throw new Error(`Variant "${variantId}" does not exist`);
  db.prepare('DELETE FROM lego_variants WHERE catalog_version=? AND id=?')
    .run(LEGO_CATALOG_VERSION, variantId);
  markCatalogDirty();
  return variantId;
}

/** Lists catalog dependency suggestions. */
export function listDependencies() {
  ensureLegoCatalog();
  return rows<{ from: string; to: string; strength: LegoDependencyStrength; why_en: string; why_fr: string; protocol_id: string; kind: 'sync' | 'async' | 'batch' }>(
    'SELECT from_brick AS "from", to_brick AS "to", strength, why_en, why_fr, protocol_id, kind FROM lego_dependencies WHERE catalog_version=? ORDER BY rowid',
    LEGO_CATALOG_VERSION,
  );
}

/** Updates a dependency edge and marks the catalog dirty. */
export function updateDependency(from: string, to: string, patch: DependencyAdminPatch): { from: string; to: string } {
  ensureLegoCatalog();
  if (!dependencyExists(from, to)) throw new Error(`Dependency from "${from}" to "${to}" does not exist`);
  if (!brickExists(from) || !brickExists(to)) throw new Error('Dependency endpoints must reference existing bricks');

  const current = plain<{ strength: LegoDependencyStrength; why_en: string; why_fr: string; protocol_id: string; kind: 'sync' | 'async' | 'batch' }>(
    db.prepare('SELECT strength, why_en, why_fr, protocol_id, kind FROM lego_dependencies WHERE catalog_version=? AND from_brick=? AND to_brick=?')
      .get(LEGO_CATALOG_VERSION, from, to)
  );
  db.prepare(
    'UPDATE lego_dependencies SET strength=?, why_en=?, why_fr=?, protocol_id=?, kind=? WHERE catalog_version=? AND from_brick=? AND to_brick=?'
  ).run(
    patch.strength ?? current.strength,
    patch.why_en ?? current.why_en,
    patch.why_fr ?? current.why_fr,
    patch.protocol_id ?? current.protocol_id,
    patch.kind ?? current.kind,
    LEGO_CATALOG_VERSION,
    from,
    to,
  );
  markCatalogDirty();
  return { from, to };
}

/** Creates a dependency edge and marks the catalog dirty. */
export function createDependency(payload: DependencyAdminCreate): { from: string; to: string } {
  ensureLegoCatalog();
  const from = payload.from.trim();
  const to = payload.to.trim();
  if (!from || !to) throw new Error('from and to are required');
  if (from === to) throw new Error('Dependency endpoints must be different bricks');
  if (!brickExists(from) || !brickExists(to)) throw new Error('Dependency endpoints must reference existing bricks');
  if (dependencyExists(from, to)) throw new Error(`Dependency from "${from}" to "${to}" already exists`);

  const strength = payload.strength ?? 'recommended';
  const kind = payload.kind ?? 'sync';
  if (!['required', 'recommended', 'optional'].includes(strength)) {
    throw new Error(`Invalid strength "${strength}"`);
  }
  if (!['sync', 'async', 'batch'].includes(kind)) {
    throw new Error(`Invalid kind "${kind}"`);
  }

  db.prepare(
    'INSERT INTO lego_dependencies (catalog_version, from_brick, to_brick, strength, why_en, why_fr, protocol_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    LEGO_CATALOG_VERSION,
    from,
    to,
    strength,
    (payload.why_en ?? '').trim() || `Depends on ${to}`,
    (payload.why_fr ?? '').trim() || `Dépend de ${to}`,
    (payload.protocol_id ?? '').trim() || 'http',
    kind,
  );
  markCatalogDirty();
  return { from, to };
}

/** Deletes a dependency edge and marks the catalog dirty. */
export function deleteDependency(from: string, to: string): { from: string; to: string } {
  ensureLegoCatalog();
  if (!dependencyExists(from, to)) throw new Error(`Dependency from "${from}" to "${to}" does not exist`);
  db.prepare('DELETE FROM lego_dependencies WHERE catalog_version=? AND from_brick=? AND to_brick=?')
    .run(LEGO_CATALOG_VERSION, from, to);
  markCatalogDirty();
  return { from, to };
}

/** Lists technology descriptions keyed by technology id. */
export function listTechnologyDescriptions(): Record<string, { en: string; fr: string }> {
  ensureLegoCatalog();
  const version = LEGO_CATALOG_VERSION;
  const keys = rows<{ technology_key: string }>(
    'SELECT DISTINCT technology_key FROM lego_technology_descriptions WHERE catalog_version=? ORDER BY technology_key',
    version,
  ).map(row => row.technology_key);
  const result: Record<string, { en: string; fr: string }> = {};
  for (const key of keys) {
    const en = plain<{ description: string } | undefined>(
      db.prepare('SELECT description FROM lego_technology_descriptions WHERE catalog_version=? AND technology_key=? AND lang=?')
        .get(version, key, 'en')
    )?.description ?? '';
    const fr = plain<{ description: string } | undefined>(
      db.prepare('SELECT description FROM lego_technology_descriptions WHERE catalog_version=? AND technology_key=? AND lang=?')
        .get(version, key, 'fr')
    )?.description ?? '';
    result[key] = { en, fr };
  }
  return result;
}

/** Updates technology descriptions and marks the catalog dirty. */
export function updateTechnologyDescription(key: string, payload: TechnologyDescriptionUpdate): string {
  ensureLegoCatalog();
  if (!key.trim()) throw new Error('Technology key cannot be empty');
  if (payload.en !== undefined && !payload.en.trim()) throw new Error('English description cannot be empty');
  if (payload.fr !== undefined && !payload.fr.trim()) throw new Error('French description cannot be empty');

  const version = LEGO_CATALOG_VERSION;
  const exists = Boolean(
    db.prepare('SELECT 1 FROM lego_technology_descriptions WHERE catalog_version=? AND technology_key=? LIMIT 1')
      .get(version, key)
  );
  if (!exists) throw new Error(`Technology "${key}" does not exist`);

  for (const lang of ['en', 'fr'] as const) {
    const value = lang === 'en' ? payload.en : payload.fr;
    if (value === undefined) continue;
    db.prepare('UPDATE lego_technology_descriptions SET description=? WHERE catalog_version=? AND technology_key=? AND lang=?')
      .run(value, version, key, lang);
  }
  markCatalogDirty();
  return key;
}

/** Creates technology descriptions and marks the catalog dirty. */
export function createTechnologyDescription(payload: TechnologyAdminCreate): string {
  ensureLegoCatalog();
  if (!payload.en.trim()) throw new Error('English description cannot be empty');
  if (!payload.fr.trim()) throw new Error('French description cannot be empty');

  const existing = Object.keys(listTechnologyDescriptions());
  const rawKey = payload.key?.trim() || payload.en.slice(0, 40);
  const key = /^[a-z0-9][a-z0-9 ._-]*$/i.test(rawKey) && !existing.includes(rawKey)
    ? rawKey.toLowerCase()
    : slugify(rawKey, existing);
  if (!key.trim()) throw new Error('Technology key cannot be empty');
  if (existing.includes(key)) throw new Error(`Technology "${key}" already exists`);

  const version = LEGO_CATALOG_VERSION;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      'INSERT INTO lego_technology_descriptions (catalog_version, technology_key, lang, description) VALUES (?, ?, ?, ?)'
    ).run(version, key, 'en', payload.en.trim());
    db.prepare(
      'INSERT INTO lego_technology_descriptions (catalog_version, technology_key, lang, description) VALUES (?, ?, ?, ?)'
    ).run(version, key, 'fr', payload.fr.trim());
    markCatalogDirty();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return key;
}

/** Deletes technology descriptions for a key. */
export function deleteTechnologyDescription(key: string): string {
  ensureLegoCatalog();
  if (!key.trim()) throw new Error('Technology key cannot be empty');
  const exists = Boolean(
    db.prepare('SELECT 1 FROM lego_technology_descriptions WHERE catalog_version=? AND technology_key=? LIMIT 1')
      .get(LEGO_CATALOG_VERSION, key)
  );
  if (!exists) throw new Error(`Technology "${key}" does not exist`);

  db.prepare('DELETE FROM lego_technology_descriptions WHERE catalog_version=? AND technology_key=?')
    .run(LEGO_CATALOG_VERSION, key);
  markCatalogDirty();
  return key;
}

/** Alias for Designer CRUD naming. */
export const createTechnology = createTechnologyDescription;
/** Alias for Designer CRUD naming. */
export const deleteTechnology = deleteTechnologyDescription;

export type CatalogIssue = {
  code: string;
  message: string;
  field?: string;
  entityId?: string;
};

export type BrickAdminUpdate = {
  icon?: string;
  layer?: string;
  defaultScope?: string;
  concernTags?: ConcernTag[];
  purposeEn?: string;
  purposeFr?: string;
  roleEn?: string;
  roleFr?: string;
};

const ICON_KEY_SET = new Set<string>(ICON_KEYS);

function rows<T>(sql: string, ...values: any[]) {
  return plainAll<T>(db.prepare(sql).all(...values));
}

function markCatalogDirty(): void {
  db.prepare(
    'UPDATE admin_catalog_state SET dirty=1, updated_at=? WHERE catalog_version=?'
  ).run(now(), LEGO_CATALOG_VERSION);
}

function brickExists(brickId: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM lego_bricks WHERE catalog_version=? AND id=?')
      .get(LEGO_CATALOG_VERSION, brickId)
  );
}

function scopeExists(scopeId: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM lego_scopes WHERE catalog_version=? AND id=?')
      .get(LEGO_CATALOG_VERSION, scopeId)
  );
}

function readBrickText(brickId: string, lang: 'en' | 'fr'): { role: string; purpose: string } | null {
  const row = plain<{ role: string; purpose: string } | undefined>(
    db.prepare('SELECT role, purpose FROM lego_brick_texts WHERE catalog_version=? AND brick_id=? AND lang=?')
      .get(LEGO_CATALOG_VERSION, brickId, lang)
  );
  return row ?? null;
}

/** Brick-level i18n and field validation before save. */
export function validateAdminBrick(brickId: string, payload: BrickAdminUpdate = {}): CatalogIssue[] {
  ensureLegoCatalog();
  const issues: CatalogIssue[] = [];

  if (!brickExists(brickId)) {
    issues.push({ code: 'brick_not_found', message: `Brick "${brickId}" does not exist`, entityId: brickId });
    return issues;
  }

  if (payload.icon !== undefined && !ICON_KEY_SET.has(payload.icon)) {
    issues.push({ code: 'invalid_icon', message: `Icon "${payload.icon}" is not in ICON_KEYS`, field: 'icon', entityId: brickId });
  }

  if (payload.layer !== undefined && !payload.layer.trim()) {
    issues.push({ code: 'empty_layer', message: 'Layer cannot be empty', field: 'layer', entityId: brickId });
  }

  if (payload.defaultScope !== undefined && !scopeExists(payload.defaultScope)) {
    issues.push({
      code: 'invalid_scope',
      message: `Scope "${payload.defaultScope}" does not exist`,
      field: 'defaultScope',
      entityId: brickId,
    });
  }

  if (payload.concernTags !== undefined) {
    for (const tag of payload.concernTags) {
      if (!isConcernTag(tag)) {
        issues.push({ code: 'invalid_concern_tag', message: `Invalid concern tag "${tag}"`, field: 'concernTags', entityId: brickId });
      }
    }
  }

  const roleEn = payload.roleEn ?? readBrickText(brickId, 'en')?.role ?? '';
  const roleFr = payload.roleFr ?? readBrickText(brickId, 'fr')?.role ?? '';
  if (!roleEn.trim()) {
    issues.push({ code: 'missing_role', message: 'English role is required', field: 'roleEn', entityId: brickId });
  }
  if (!roleFr.trim()) {
    issues.push({ code: 'missing_role', message: 'French role is required', field: 'roleFr', entityId: brickId });
  }

  return issues;
}

/** Updates a catalog brick and marks the catalog dirty. */
export function updateAdminBrick(brickId: string, payload: BrickAdminUpdate): string {
  ensureLegoCatalog();
  const issues = validateAdminBrick(brickId, payload);
  if (issues.length > 0) {
    throw new Error(issues.map(issue => issue.message).join('; '));
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    if (payload.icon !== undefined || payload.layer !== undefined || payload.defaultScope !== undefined) {
      const current = plain<{ icon: string; layer_id: string; default_scope_id: string }>(
        db.prepare('SELECT icon, layer_id, default_scope_id FROM lego_bricks WHERE catalog_version=? AND id=?')
          .get(LEGO_CATALOG_VERSION, brickId)
      );
      db.prepare(
        'UPDATE lego_bricks SET icon=?, layer_id=?, default_scope_id=? WHERE catalog_version=? AND id=?'
      ).run(
        payload.icon ?? current.icon,
        payload.layer ?? current.layer_id,
        payload.defaultScope ?? current.default_scope_id,
        LEGO_CATALOG_VERSION,
        brickId,
      );
    }

    for (const lang of ['en', 'fr'] as const) {
      const roleKey = lang === 'en' ? 'roleEn' : 'roleFr';
      const purposeKey = lang === 'en' ? 'purposeEn' : 'purposeFr';
      if (payload[roleKey] !== undefined || payload[purposeKey] !== undefined) {
        const current = readBrickText(brickId, lang)!;
        db.prepare(
          'UPDATE lego_brick_texts SET role=?, purpose=? WHERE catalog_version=? AND brick_id=? AND lang=?'
        ).run(
          payload[roleKey] ?? current.role,
          payload[purposeKey] ?? current.purpose,
          LEGO_CATALOG_VERSION,
          brickId,
          lang,
        );
      }
    }

    if (payload.concernTags !== undefined) {
      db.prepare('DELETE FROM lego_brick_concern_tags WHERE catalog_version=? AND brick_id=?')
        .run(LEGO_CATALOG_VERSION, brickId);
      const insert = db.prepare('INSERT INTO lego_brick_concern_tags VALUES (?, ?, ?)');
      for (const tag of payload.concernTags) insert.run(LEGO_CATALOG_VERSION, brickId, tag);
    }

    markCatalogDirty();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return brickId;
}

/** Creates a catalog brick with EN/FR texts and marks the catalog dirty. */
export function createAdminBrick(payload: BrickAdminCreate): string {
  ensureLegoCatalog();
  if (!payload.roleEn.trim()) throw new Error('English role is required');
  if (!payload.roleFr.trim()) throw new Error('French role is required');
  if (!scopeExists(payload.defaultScope)) throw new Error(`Scope "${payload.defaultScope}" does not exist`);

  const icon = payload.icon ?? 'box';
  if (!ICON_KEY_SET.has(icon)) throw new Error(`Icon "${icon}" is not in ICON_KEYS`);

  const layer = (payload.layer ?? 'services').trim();
  if (!layer) throw new Error('Layer cannot be empty');

  if (payload.concernTags) {
    for (const tag of payload.concernTags) {
      if (!isConcernTag(tag)) throw new Error(`Invalid concern tag "${tag}"`);
    }
  }

  const taken = rows<{ id: string }>('SELECT id FROM lego_bricks WHERE catalog_version=?', LEGO_CATALOG_VERSION)
    .map(row => row.id);
  const brickId = catalogEntityId(payload.id?.trim() || payload.roleEn.slice(0, 40), taken);
  if (brickExists(brickId)) throw new Error(`Brick "${brickId}" already exists`);

  const version = LEGO_CATALOG_VERSION;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      'INSERT INTO lego_bricks (catalog_version, id, icon, layer_id, default_scope_id, capabilities_json) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(version, brickId, icon, layer, payload.defaultScope, '[]');

    const text = db.prepare(
      'INSERT INTO lego_brick_texts (catalog_version, brick_id, lang, role, responsibilities_json, notes_json, purpose) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const phrase = db.prepare(
      'INSERT INTO lego_capability_phrases (catalog_version, brick_id, lang, phrase) VALUES (?, ?, ?, ?)'
    );
    text.run(version, brickId, 'en', payload.roleEn.trim(), '[]', '[]', (payload.purposeEn ?? payload.roleEn).trim());
    text.run(version, brickId, 'fr', payload.roleFr.trim(), '[]', '[]', (payload.purposeFr ?? payload.roleFr).trim());
    phrase.run(version, brickId, 'en', payload.roleEn.trim());
    phrase.run(version, brickId, 'fr', payload.roleFr.trim());

    if (payload.concernTags?.length) {
      const insert = db.prepare('INSERT INTO lego_brick_concern_tags VALUES (?, ?, ?)');
      for (const tag of payload.concernTags) insert.run(version, brickId, tag);
    }

    markCatalogDirty();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return brickId;
}

/** Deletes a catalog brick (cascades variants/deps; locked rows re-seed on ensure). */
export function deleteAdminBrick(brickId: string): string {
  ensureLegoCatalog();
  if (!brickExists(brickId)) throw new Error(`Brick "${brickId}" does not exist`);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM lego_variants WHERE catalog_version=? AND brick_id=?')
      .run(LEGO_CATALOG_VERSION, brickId);
    db.prepare('DELETE FROM lego_dependencies WHERE catalog_version=? AND (from_brick=? OR to_brick=?)')
      .run(LEGO_CATALOG_VERSION, brickId, brickId);
    db.prepare('DELETE FROM lego_bricks WHERE catalog_version=? AND id=?')
      .run(LEGO_CATALOG_VERSION, brickId);
    markCatalogDirty();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return brickId;
}

/** Variant maps_to issues (ISC-A5). Exported for unit tests — SQLite FK prevents orphan rows in DB. */
export function variantRefIssues(
  variants: { id: string; maps_to: string }[],
  brickIds: Set<string>,
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const variant of variants) {
    if (brickIds.has(variant.maps_to)) continue;
    issues.push({
      code: 'orphan_variant',
      message: `Variant "${variant.id}" maps to missing brick "${variant.maps_to}"`,
      field: 'maps_to',
      entityId: variant.id,
    });
  }
  return issues;
}

/** Dependency endpoint issues. */
export function dependencyRefIssues(
  dependencies: { from_brick: string; to_brick: string }[],
  brickIds: Set<string>,
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const dep of dependencies) {
    if (!brickIds.has(dep.from_brick)) {
      issues.push({
        code: 'orphan_dependency',
        message: `Dependency from missing brick "${dep.from_brick}"`,
        field: 'from',
        entityId: dep.from_brick,
      });
    }
    if (!brickIds.has(dep.to_brick)) {
      issues.push({
        code: 'orphan_dependency',
        message: `Dependency to missing brick "${dep.to_brick}"`,
        field: 'to',
        entityId: dep.to_brick,
      });
    }
  }
  return issues;
}

/** Full-catalog publish validation (ISC-A5 and i18n gates). */
export function validateCatalogPublish(): CatalogIssue[] {
  ensureLegoCatalog();
  const version = LEGO_CATALOG_VERSION;
  const issues: CatalogIssue[] = [];
  const brickIds = new Set(
    rows<{ id: string }>('SELECT id FROM lego_bricks WHERE catalog_version=?', version).map(row => row.id)
  );

  issues.push(
    ...variantRefIssues(
      rows<{ id: string; maps_to: string }>(
        'SELECT id, brick_id AS maps_to FROM lego_variants WHERE catalog_version=?',
        version,
      ),
      brickIds,
    ),
  );

  issues.push(
    ...dependencyRefIssues(
      rows<{ from_brick: string; to_brick: string }>(
        'SELECT from_brick, to_brick FROM lego_dependencies WHERE catalog_version=?',
        version,
      ),
      brickIds,
    ),
  );

  for (const brick of rows<{ id: string }>(
    'SELECT id FROM lego_bricks WHERE catalog_version=?',
    version,
  )) {
    for (const lang of ['en', 'fr'] as const) {
      const text = readBrickText(brick.id, lang);
      if (!text?.role?.trim()) {
        issues.push({
          code: 'missing_role',
          message: `Brick "${brick.id}" missing ${lang.toUpperCase()} role`,
          field: lang === 'en' ? 'roleEn' : 'roleFr',
          entityId: brick.id,
        });
      }
    }
  }

  for (const row of rows<{ brick_id: string; tag: string }>(
    'SELECT brick_id, tag FROM lego_brick_concern_tags WHERE catalog_version=?',
    version,
  )) {
    if (!isConcernTag(row.tag)) {
      issues.push({
        code: 'invalid_concern_tag',
        message: `Brick "${row.brick_id}" has invalid concern tag "${row.tag}"`,
        field: 'concernTags',
        entityId: row.brick_id,
      });
    }
  }

  return issues;
}

export type PublishCatalogResult =
  | { ok: true; publishedAt: string }
  | { ok: false; issues: CatalogIssue[] };

/** Validates and publishes the catalog snapshot. */
export function publishCatalog(): PublishCatalogResult {
  ensureLegoCatalog();
  const issues = validateCatalogPublish();
  if (issues.length > 0) return { ok: false, issues };

  const publishedAt = now();
  db.prepare(
    'UPDATE admin_catalog_state SET dirty=0, published_at=?, updated_at=? WHERE catalog_version=?'
  ).run(publishedAt, publishedAt, LEGO_CATALOG_VERSION);

  return { ok: true, publishedAt };
}

export type CatalogAdminState = {
  dirty: boolean;
  publishedAt: string | null;
  version: string;
  issueCount?: number;
};

/** Returns admin publish state for the active catalog version. */
export function getCatalogAdminState(): CatalogAdminState {
  ensureLegoCatalog();
  const row = plain<{ dirty: number; published_at: string | null } | undefined>(
    db.prepare('SELECT dirty, published_at FROM admin_catalog_state WHERE catalog_version=?')
      .get(LEGO_CATALOG_VERSION)
  );
  return {
    dirty: Boolean(row?.dirty),
    publishedAt: row?.published_at ?? null,
    version: LEGO_CATALOG_VERSION,
  };
}

/** Convenience: admin state; full publish validation only when requested. */
export function getCatalogAdminStateWithIssues(options?: { validate?: boolean }): CatalogAdminState & { issues?: CatalogIssue[] } {
  const state = getCatalogAdminState();
  if (!options?.validate) return state;
  const issues = validateCatalogPublish();
  return { ...state, issueCount: issues.length, issues };
}
