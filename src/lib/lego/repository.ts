import { db, plain, plainAll } from '../db';
import { CATALOG_SEED } from './seed-data';
import type { LegoCatalogSnapshot, LegoLanguage } from './types';
import type { ConcernTag } from '../document/concerns';

export const LEGO_CATALOG_VERSION = '2026-08-18.1';
export type { LegoCatalogSnapshot, LegoLanguage } from './types';

function rows<T>(sql: string, ...values: any[]) { return plainAll<T>(db.prepare(sql).all(...values)); }

function catalogBrickIds(): Set<string> {
  return new Set([
    ...Object.keys(CATALOG_SEED.icons),
    ...Object.keys(CATALOG_SEED.rolePhrases),
    ...Object.keys(CATALOG_SEED.roleScopes),
  ]);
}

/** Removes dependency edges whose endpoints are not seeded bricks. */
function pruneOrphanDependencies(): void {
  const version = LEGO_CATALOG_VERSION;
  db.prepare(`
    DELETE FROM lego_dependencies
    WHERE catalog_version=?
      AND (
        from_brick NOT IN (SELECT id FROM lego_bricks WHERE catalog_version=?)
        OR to_brick NOT IN (SELECT id FROM lego_bricks WHERE catalog_version=?)
      )
  `).run(version, version, version);
}

/** Inserts dependency rows when the catalog version already existed before
 * `lego_dependencies` was part of the seed (early return would skip them). */
function ensureDependencyRows(): void {
  ensureMissingDependencies();
}

/** INSERT OR IGNORE valid dependency edges from seed that are not yet in DB. */
function ensureMissingDependencies(): void {
  const brickIds = catalogBrickIds();
  const validDependencies = CATALOG_SEED.dependencies.filter(
    dep => brickIds.has(dep.from) && brickIds.has(dep.to),
  );
  const dependency = db.prepare('INSERT OR IGNORE INTO lego_dependencies VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const value of validDependencies) {
    dependency.run(LEGO_CATALOG_VERSION, value.from, value.to, value.strength, value.why_en, value.why_fr, value.protocol_id, value.kind);
  }
  pruneOrphanDependencies();
}

/** Re-inserts locked scopes missing after admin delete. */
function ensureMissingScopes(): void {
  const scope = db.prepare('INSERT OR IGNORE INTO lego_scopes VALUES (?, ?, ?, ?)');
  for (const [id, en, fr] of CATALOG_SEED.scopes) {
    scope.run(LEGO_CATALOG_VERSION, id, en, fr);
  }
  const alias = db.prepare('INSERT OR IGNORE INTO lego_scope_aliases VALUES (?, ?, ?)');
  for (const [name, id] of Object.entries(CATALOG_SEED.scopeAliases)) {
    alias.run(LEGO_CATALOG_VERSION, name, id);
  }
}

/** Re-inserts seed brick↔scope affinities (requires bricks + scopes present). */
function ensureMissingAffinities(): void {
  const affinity = db.prepare('INSERT OR IGNORE INTO lego_brick_scope_affinities VALUES (?, ?, ?)');
  for (const [brickId, scopeIds] of Object.entries(CATALOG_SEED.roleScopes)) {
    for (const scopeId of scopeIds) affinity.run(LEGO_CATALOG_VERSION, brickId, scopeId);
  }
}

/** Re-inserts locked intents (modes/shapes) missing after admin delete. */
function ensureMissingIntents(): void {
  const intent = db.prepare('INSERT OR IGNORE INTO lego_intents VALUES (?, ?, ?)');
  const mode = db.prepare('INSERT OR IGNORE INTO lego_intent_modes VALUES (?, ?, ?, ?)');
  const shape = db.prepare('INSERT OR IGNORE INTO lego_intent_shapes VALUES (?, ?, ?, ?)');
  for (const value of CATALOG_SEED.intents) {
    intent.run(LEGO_CATALOG_VERSION, value.id, value.label);
    value.modes.forEach((modeValue, position) => mode.run(LEGO_CATALOG_VERSION, value.id, modeValue, position));
    value.shapes?.forEach((shapeValue, position) => shape.run(LEGO_CATALOG_VERSION, value.id, shapeValue, position));
  }
}

/** Re-inserts locked variants missing after admin delete. */
function ensureMissingVariants(): void {
  const variant = db.prepare('INSERT OR IGNORE INTO lego_variants VALUES (?, ?, ?, ?, ?, ?)');
  for (const value of CATALOG_SEED.variants) {
    variant.run(LEGO_CATALOG_VERSION, value.id, value.intent, value.label, value.mode, value.maps_to);
  }
}

/** Re-inserts locked technology descriptions missing after admin delete. */
function ensureMissingTechnologies(): void {
  const technology = db.prepare('INSERT OR IGNORE INTO lego_technology_descriptions VALUES (?, ?, ?, ?)');
  for (const [key, value] of Object.entries(CATALOG_SEED.technologyDescriptions)) {
    technology.run(LEGO_CATALOG_VERSION, key, 'en', value.en);
    technology.run(LEGO_CATALOG_VERSION, key, 'fr', value.fr);
  }
}

/** Inserts brick rows (with texts, phrases, affinities, concern tags) missing from DB. */
function ensureMissingBrickRows(): void {
  const version = LEGO_CATALOG_VERSION;
  const existing = new Set(
    plainAll<{ id: string }>(db.prepare('SELECT id FROM lego_bricks WHERE catalog_version=?').all(version)).map(row => row.id)
  );
  const ids = catalogBrickIds();
  const missing = [...ids].filter(id => !existing.has(id));
  if (missing.length === 0) return;

  const brick = db.prepare('INSERT OR IGNORE INTO lego_bricks VALUES (?, ?, ?, ?, ?, ?)');
  const text = db.prepare('INSERT OR IGNORE INTO lego_brick_texts VALUES (?, ?, ?, ?, ?, ?, ?)');
  const affinity = db.prepare('INSERT OR IGNORE INTO lego_brick_scope_affinities VALUES (?, ?, ?)');
  const phrase = db.prepare('INSERT OR IGNORE INTO lego_capability_phrases VALUES (?, ?, ?, ?)');
  const tag = db.prepare('INSERT OR IGNORE INTO lego_brick_concern_tags VALUES (?, ?, ?)');

  for (const id of missing) {
    brick.run(version, id, CATALOG_SEED.icons[id] || 'box', CATALOG_SEED.layers[id] || 'services', CATALOG_SEED.defaultScopes[id] || 'product', JSON.stringify(CATALOG_SEED.capabilities[id] || []));
    for (const lang of ['en', 'fr'] as const) {
      const metadata = (lang === 'fr' ? CATALOG_SEED.frenchBrickMetadata : CATALOG_SEED.brickMetadata)[id] || { features: [], notes: [] };
      const role = (lang === 'fr' ? CATALOG_SEED.frenchRolePhrases : CATALOG_SEED.rolePhrases)[id] || (lang === 'fr' ? `Fournit la capacité ${id} dans cette architecture.` : `Provides the ${id} capability in this architecture.`);
      text.run(version, id, lang, role, JSON.stringify(metadata.features), JSON.stringify(metadata.notes), '');
      phrase.run(version, id, lang, CATALOG_SEED.roleCapabilities[id]?.[lang] || (lang === 'fr' ? 'la capacité d’architecture sélectionnée' : 'the selected architecture capability'));
    }
    for (const scopeId of CATALOG_SEED.roleScopes[id] || []) affinity.run(version, id, scopeId);
    for (const value of CATALOG_SEED.concernTags[id] || []) tag.run(version, id, value);
  }
}

/** Inserts concern-tag rows when the catalog version already existed before
 * `lego_brick_concern_tags` was part of the seed (early return would skip them). */
function ensureConcernTagRows(): void {
  const count = plain<{ count: number }>(
    db.prepare('SELECT count(*) AS count FROM lego_brick_concern_tags WHERE catalog_version=?').get(LEGO_CATALOG_VERSION)
  )?.count ?? 0;
  if (count > 0) return;
  const tag = db.prepare('INSERT OR IGNORE INTO lego_brick_concern_tags VALUES (?, ?, ?)');
  for (const [brickId, tags] of Object.entries(CATALOG_SEED.concernTags)) {
    for (const value of tags) tag.run(LEGO_CATALOG_VERSION, brickId, value);
  }
}

function seedConcernTags(): void {
  const tag = db.prepare('INSERT OR IGNORE INTO lego_brick_concern_tags VALUES (?, ?, ?)');
  for (const [brickId, tags] of Object.entries(CATALOG_SEED.concernTags)) {
    for (const value of tags) tag.run(LEGO_CATALOG_VERSION, brickId, value);
  }
}

/** Ensures admin publish-tracking row exists for the active catalog version. */
function ensureAdminCatalogState(): void {
  db.prepare(
    'INSERT OR IGNORE INTO admin_catalog_state (catalog_version, dirty, published_at, updated_at) VALUES (?, 0, NULL, datetime(\'now\'))'
  ).run(LEGO_CATALOG_VERSION);
}

/** Seeds once transactionally; runtime callers only read the SQLite snapshot. */
export function ensureLegoCatalog(): void {
  if (db.prepare('SELECT 1 FROM lego_catalog_versions WHERE version=?').get(LEGO_CATALOG_VERSION)) {
    ensureMissingScopes();
    ensureMissingBrickRows();
    ensureMissingAffinities();
    ensureMissingIntents();
    ensureMissingVariants();
    ensureMissingTechnologies();
    ensureMissingDependencies();
    ensureConcernTagRows();
    ensureAdminCatalogState();
    return;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR IGNORE INTO lego_catalog_versions (version) VALUES (?)').run(LEGO_CATALOG_VERSION);
    const scope = db.prepare('INSERT OR IGNORE INTO lego_scopes VALUES (?, ?, ?, ?)');
    for (const [id, en, fr] of CATALOG_SEED.scopes) scope.run(LEGO_CATALOG_VERSION, id, en, fr);
    const alias = db.prepare('INSERT OR IGNORE INTO lego_scope_aliases VALUES (?, ?, ?)');
    for (const [name, id] of Object.entries(CATALOG_SEED.scopeAliases)) alias.run(LEGO_CATALOG_VERSION, name, id);
    const brick = db.prepare('INSERT OR IGNORE INTO lego_bricks VALUES (?, ?, ?, ?, ?, ?)');
    const text = db.prepare('INSERT OR IGNORE INTO lego_brick_texts VALUES (?, ?, ?, ?, ?, ?, ?)');
    const affinity = db.prepare('INSERT OR IGNORE INTO lego_brick_scope_affinities VALUES (?, ?, ?)');
    const phrase = db.prepare('INSERT OR IGNORE INTO lego_capability_phrases VALUES (?, ?, ?, ?)');
    const ids = new Set([...Object.keys(CATALOG_SEED.icons), ...Object.keys(CATALOG_SEED.rolePhrases), ...Object.keys(CATALOG_SEED.roleScopes)]);
    for (const id of ids) {
      brick.run(LEGO_CATALOG_VERSION, id, CATALOG_SEED.icons[id] || 'box', CATALOG_SEED.layers[id] || 'services', CATALOG_SEED.defaultScopes[id] || 'product', JSON.stringify(CATALOG_SEED.capabilities[id] || []));
      for (const lang of ['en', 'fr'] as const) {
        const metadata = (lang === 'fr' ? CATALOG_SEED.frenchBrickMetadata : CATALOG_SEED.brickMetadata)[id] || { features: [], notes: [] };
        const role = (lang === 'fr' ? CATALOG_SEED.frenchRolePhrases : CATALOG_SEED.rolePhrases)[id] || (lang === 'fr' ? `Fournit la capacité ${id} dans cette architecture.` : `Provides the ${id} capability in this architecture.`);
        text.run(LEGO_CATALOG_VERSION, id, lang, role, JSON.stringify(metadata.features), JSON.stringify(metadata.notes), '');
        phrase.run(LEGO_CATALOG_VERSION, id, lang, CATALOG_SEED.roleCapabilities[id]?.[lang] || (lang === 'fr' ? 'la capacité d’architecture sélectionnée' : 'the selected architecture capability'));
      }
      for (const scopeId of CATALOG_SEED.roleScopes[id] || []) affinity.run(LEGO_CATALOG_VERSION, id, scopeId);
    }
    seedConcernTags();
    const intent = db.prepare('INSERT OR IGNORE INTO lego_intents VALUES (?, ?, ?)');
    const mode = db.prepare('INSERT OR IGNORE INTO lego_intent_modes VALUES (?, ?, ?, ?)');
    const shape = db.prepare('INSERT OR IGNORE INTO lego_intent_shapes VALUES (?, ?, ?, ?)');
    for (const value of CATALOG_SEED.intents) {
      intent.run(LEGO_CATALOG_VERSION, value.id, value.label);
      value.modes.forEach((modeValue, position) => mode.run(LEGO_CATALOG_VERSION, value.id, modeValue, position));
      value.shapes?.forEach((shapeValue, position) => shape.run(LEGO_CATALOG_VERSION, value.id, shapeValue, position));
    }
    const variant = db.prepare('INSERT OR IGNORE INTO lego_variants VALUES (?, ?, ?, ?, ?, ?)');
    for (const value of CATALOG_SEED.variants) variant.run(LEGO_CATALOG_VERSION, value.id, value.intent, value.label, value.mode, value.maps_to);
    const technology = db.prepare('INSERT OR IGNORE INTO lego_technology_descriptions VALUES (?, ?, ?, ?)');
    for (const [key, value] of Object.entries(CATALOG_SEED.technologyDescriptions)) {
      technology.run(LEGO_CATALOG_VERSION, key, 'en', value.en); technology.run(LEGO_CATALOG_VERSION, key, 'fr', value.fr);
    }
    ensureDependencyRows();
    ensureAdminCatalogState();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function legoCatalog(lang: LegoLanguage = 'en'): LegoCatalogSnapshot {
  ensureLegoCatalog(); const version = LEGO_CATALOG_VERSION;
  const scopes = rows<{ id: string; label: string }>(`SELECT id, ${lang === 'fr' ? 'label_fr' : 'label_en'} AS label FROM lego_scopes WHERE catalog_version=? ORDER BY rowid`, version);
  const aliases = Object.fromEntries(rows<{ alias: string; scope_id: string }>('SELECT alias, scope_id FROM lego_scope_aliases WHERE catalog_version=?', version).map(row => [row.alias, row.scope_id]));
  const affinities = rows<{ brick_id: string; scope_id: string }>('SELECT brick_id, scope_id FROM lego_brick_scope_affinities WHERE catalog_version=?', version);
  const concernTagsByBrick = rows<{ brick_id: string; tag: ConcernTag }>('SELECT brick_id, tag FROM lego_brick_concern_tags WHERE catalog_version=? ORDER BY rowid', version)
    .reduce<Record<string, ConcernTag[]>>((acc, row) => {
      (acc[row.brick_id] ??= []).push(row.tag);
      return acc;
    }, {});
  const brickRows = rows<{ id: string; icon: string; layer_id: string; default_scope_id: string; capabilities_json: string; role: string; purpose: string; responsibilities_json: string; notes_json: string; phrase: string }>(`SELECT b.id,b.icon,b.layer_id,b.default_scope_id,b.capabilities_json,t.role,t.purpose,t.responsibilities_json,t.notes_json,p.phrase FROM lego_bricks b JOIN lego_brick_texts t ON t.catalog_version=b.catalog_version AND t.brick_id=b.id JOIN lego_capability_phrases p ON p.catalog_version=b.catalog_version AND p.brick_id=b.id AND p.lang=t.lang WHERE b.catalog_version=? AND t.lang=?`, version, lang);
  const bricks = Object.fromEntries(brickRows.map(row => [row.id, {
    id: row.id,
    icon: row.icon,
    layer: row.layer_id,
    defaultScope: row.default_scope_id,
    capabilities: JSON.parse(row.capabilities_json),
    role: row.role,
    purpose: row.purpose || row.role,
    concernTags: [...(concernTagsByBrick[row.id] || [])],
    responsibilities: JSON.parse(row.responsibilities_json),
    notes: JSON.parse(row.notes_json),
    affinities: affinities.filter(value => value.brick_id === row.id).map(value => value.scope_id),
    capabilityPhrase: row.phrase
  }]));
  const intents = rows<{ id: string; label: string }>('SELECT id,label FROM lego_intents WHERE catalog_version=? ORDER BY rowid', version).map(value => ({ ...value, modes: rows<{ mode: string }>('SELECT mode FROM lego_intent_modes WHERE catalog_version=? AND intent_id=? ORDER BY position', version, value.id).map(row => row.mode as LegoCatalogSnapshot['intents'][number]['modes'][number]), shapes: rows<{ shape: string }>('SELECT shape FROM lego_intent_shapes WHERE catalog_version=? AND intent_id=? ORDER BY position', version, value.id).map(row => row.shape) }));
  const variants = rows<{ id: string; intent: string; label: string; mode: LegoCatalogSnapshot['variants'][number]['mode']; maps_to: string }>('SELECT id,intent_id AS intent,label,mode,brick_id AS maps_to FROM lego_variants WHERE catalog_version=? ORDER BY rowid', version);
  const dependencies = rows<LegoCatalogSnapshot['dependencies'][number]>('SELECT from_brick AS "from", to_brick AS "to", strength, why_en, why_fr, protocol_id, kind FROM lego_dependencies WHERE catalog_version=? ORDER BY rowid', version) ?? [];
  const technologyDescriptions = Object.fromEntries(rows<{ technology_key: string; description: string }>('SELECT technology_key,description FROM lego_technology_descriptions WHERE catalog_version=? AND lang=?', version, lang).map(row => [row.technology_key, row.description]));
  return { version, lang, scopes, aliases, bricks, intents, variants, dependencies, technologyDescriptions };
}

export function legoCatalogCounts() {
  ensureLegoCatalog();
  return Object.fromEntries(['lego_scopes', 'lego_bricks', 'lego_intents', 'lego_variants', 'lego_technology_descriptions', 'lego_dependencies'].map(table => [table, plain<{ count: number }>(db.prepare(`SELECT count(*) AS count FROM ${table} WHERE catalog_version=?`).get(LEGO_CATALOG_VERSION)).count]));
}
