/* SQLite access layer.
 *
 * Uses `node:sqlite`, which ships inside Node 22.5+. No native compilation, no
 * engine download, no ORM: `npm install` stays small and `npm run dev` works on
 * a fresh clone with nothing else installed. The trade-off is hand-written SQL
 * — acceptable for three tables, and the whole surface is in this file plus
 * store.ts. See the README for the Prisma migration path if you outgrow it.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import { applyMigrations } from './migrations';

function resolveDbPath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), 'data', 'studio.db');
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
-- WAL lets one writer and many readers coexist, but a second *writer* still
-- gets SQLITE_BUSY immediately unless it is told to wait. Next runs more than
-- one process against this file — dev server and a build, or several workers —
-- so the honest default is to block briefly rather than fail the request.
PRAGMA busy_timeout = 5000;
-- Deleted content is overwritten with zeros rather than left in a free page.
-- The default is off because zeroing costs writes, and for folders and
-- projects nobody would care — but this file also holds an API key, and
-- "forget my key" has to mean the bytes are gone, not that a row stopped
-- pointing at them. It applies to future deletions only, so settings.ts
-- vacuums when a key changes, to scrub any copy written before this existed.
PRAGMA secure_delete = ON;

CREATE TABLE IF NOT EXISTS folders (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  parent_id  TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  accent      TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  folder_id   TEXT REFERENCES folders(id) ON DELETE SET NULL,
  data        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_folder ON projects(folder_id);

-- One row per settings group, holding JSON. A key-value table rather than
-- columns because this holds operator configuration, not domain data: it grows
-- by whatever the next feature needs to remember, and a migration per field
-- would be a lot of ceremony for a single-user file.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS revisions (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_revisions_project ON revisions(project_id, created_at DESC);

-- Identity. Every table here is new rather than a column on an existing one,
-- which is what lets them land on a database that predates them: the schema
-- above is re-run per connection and CREATE TABLE IF NOT EXISTS is additive,
-- while ALTER TABLE would only ever reach a fresh file. See migrations.ts for
-- when that stops being enough.
--
-- A person is a "principal" whether they signed in with a password or arrived
-- through a proxy that vouched for them, so the two ways of proving it live in
-- separate tables and neither is required.
CREATE TABLE IF NOT EXISTS principals (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);
-- Folded, because "Ada@example.com" and "ada@example.com" are one person and a
-- proxy is free to send either.
CREATE UNIQUE INDEX IF NOT EXISTS idx_principals_email ON principals(lower(email));

CREATE TABLE IF NOT EXISTS auth_credentials (
  principal_id TEXT PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
  hash         TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Server-side rather than a signed token in the cookie. A token cannot be taken
-- away: "remove this person's access" has to mean the next request fails, not
-- that it fails once the token expires. The database is already here, so the
-- reason to reach for statelessness is not present either.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_principal ON sessions(principal_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           TEXT NOT NULL DEFAULT (datetime('now')),
  principal_id TEXT,
  action       TEXT NOT NULL,
  subject      TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);

-- Who froze a version. A side table rather than a column on "revisions", for
-- the reason at the top of this block — and the join is a LEFT one, because
-- every row written before identity existed has no author and that is a fact
-- about the row, not a gap to paper over. ON DELETE SET NULL is deliberate:
-- removing a person must not remove the history of what they did.
CREATE TABLE IF NOT EXISTS revision_authors (
  revision_id  TEXT PRIMARY KEY REFERENCES revisions(id) ON DELETE CASCADE,
  principal_id TEXT REFERENCES principals(id) ON DELETE SET NULL
);

-- Governance.
--
-- A grant is (person, role, scope). Scope is the axis that makes this usable
-- without naming every project: an architect of the Finance domain is an
-- architect of every project that domain owns, and nobody has to keep a list.
CREATE TABLE IF NOT EXISTS roles (
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  scope_kind   TEXT NOT NULL,
  -- Part of the key, so a person can hold the same role in two domains without
  -- one overwriting the other.
  --
  -- Empty string for a global grant, and NOT NULL, because in SQLite two NULLs
  -- are *distinct* inside a PRIMARY KEY: with NULL here, "grant Ada admin"
  -- twice would insert two rows and INSERT OR IGNORE would never fire. That is
  -- the sort of thing nobody notices until a revoke leaves half a grant behind.
  scope_id     TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (principal_id, role, scope_kind, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_roles_principal ON roles(principal_id);

-- Which domain owns a project. A side table rather than a column, for the
-- reason at the top of the identity block, and the reason a domain-scoped
-- grant can reach a project at all.
CREATE TABLE IF NOT EXISTS project_domains (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  domain_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_project_domains_domain ON project_domains(domain_id);

-- A proposal is a candidate document: the whole architecture as someone would
-- like it to be, sitting beside the one that is published.
--
-- Whole rather than a patch, deliberately. The reviewer's question is "what
-- would this change", and the app already answers that better than any patch
-- format could: diffArchitecture over two documents, in sentences. A patch
-- would need a second comparison engine and a merge algorithm, and would still
-- have to be turned back into two documents to be read.
CREATE TABLE IF NOT EXISTS proposals (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id        TEXT REFERENCES principals(id) ON DELETE SET NULL,
  -- What the project looked like when the proposal was opened, so a reviewer
  -- can see what the author actually changed rather than what has drifted
  -- underneath them.
  base_revision_id TEXT REFERENCES revisions(id) ON DELETE SET NULL,
  data             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  title            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_author ON proposals(author_id, status);

CREATE TABLE IF NOT EXISTS proposal_reviews (
  id           TEXT PRIMARY KEY,
  proposal_id  TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  reviewer_id  TEXT REFERENCES principals(id) ON DELETE SET NULL,
  verdict      TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_proposal_reviews ON proposal_reviews(proposal_id);

-- Where a project sits in the cycle the organisation already runs. No gates
-- and no state machine: the phase decides which chapters a document is offered
-- and nothing else. An app that enforced one way of running the ADM would be
-- wrong everywhere.
CREATE TABLE IF NOT EXISTS project_adm (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  phase      TEXT NOT NULL,
  iteration  TEXT
);

-- The Enterprise Continuum, projected onto the folder tree that already
-- exists. Folders nest and already hold projects, which is the whole reason
-- this costs one side table rather than a hierarchy of its own.
CREATE TABLE IF NOT EXISTS folder_kinds (
  folder_id  TEXT PRIMARY KEY REFERENCES folders(id) ON DELETE CASCADE,
  continuum  TEXT NOT NULL
);

-- The enterprise referential.
--
-- The point of the whole thing: an application exists *once*, and several
-- documents cite it. Today the same application drawn in four projects is four
-- boxes that do not know about each other, and nobody can answer "where is it
-- used" — which is the question enterprise architecture is for.
--
-- A closed, small vocabulary someone can hold in their head beats a faithful
-- metamodel nobody fills in. Twelve kinds, grouped by layer: the business ones,
-- the application, the technology standard, and the four motivation kinds that
-- are shared across projects rather than retyped in each. See ea/types.ts.
CREATE TABLE IF NOT EXISTS ea_entities (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  -- The reference an organisation already uses for this thing: APP-0142, the
  -- CMDB id. Optional, because not every capability has one, and unique per
  -- kind when present so an import can match on it instead of on a name.
  code       TEXT,
  name       TEXT NOT NULL,
  -- Capabilities nest (L0/L1/L2), and so do domains. SET NULL rather than
  -- CASCADE: deleting a parent must not silently delete a subtree.
  parent_id  TEXT REFERENCES ea_entities(id) ON DELETE SET NULL,
  -- technology-standard only: adopt / trial / hold / retire.
  status     TEXT,
  -- What the thing itself is doing: planned / live / sunset / retired. A
  -- separate column from status because a decision to retire a technology and
  -- the fact that something still runs on it are the two halves of every
  -- rationalisation question, and one column cannot hold both.
  lifecycle  TEXT,
  criticality TEXT,
  -- Provenance: source is where the row came from when it did not come from
  -- here, external_id is its key over there. Together they are what makes a
  -- second import an update instead of a duplicate, which is the difference
  -- between a referential that can be fed and one that can only be typed.
  source      TEXT,
  external_id TEXT,
  starts_on   TEXT,
  ends_on     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ea_entities_kind ON ea_entities(kind, name);
CREATE INDEX IF NOT EXISTS idx_ea_entities_parent ON ea_entities(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ea_entities_code
  ON ea_entities(kind, lower(code)) WHERE code IS NOT NULL;
-- The index on (source, external_id) is NOT here: this whole block runs before
-- the additive migrations, so on a database that predates those two columns it
-- would fail on every connect. It is created in ensureSchema, once the columns
-- are known to exist.

CREATE TABLE IF NOT EXISTS ea_entity_texts (
  entity_id   TEXT NOT NULL REFERENCES ea_entities(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL CHECK(lang IN ('en', 'fr')),
  description TEXT NOT NULL,
  PRIMARY KEY (entity_id, lang)
);

CREATE TABLE IF NOT EXISTS ea_entity_props (
  entity_id TEXT NOT NULL REFERENCES ea_entities(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (entity_id, key)
);

CREATE TABLE IF NOT EXISTS ea_relations (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  from_id    TEXT NOT NULL REFERENCES ea_entities(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES ea_entities(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ea_relations_edge ON ea_relations(kind, from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_ea_relations_from ON ea_relations(from_id);
CREATE INDEX IF NOT EXISTS idx_ea_relations_to ON ea_relations(to_id);

-- The index, and only the index.
--
-- The rule to keep: the blob in projects.data is the truth, this table is
-- derived from it and can be thrown away and rebuilt by reindex(). It exists so
-- "who cites this entity" is a query instead of a scan of every document.
CREATE TABLE IF NOT EXISTS project_entity_links (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id    TEXT NOT NULL REFERENCES ea_entities(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL,
  role         TEXT NOT NULL,
  PRIMARY KEY (project_id, entity_id, component_id, role)
);
CREATE INDEX IF NOT EXISTS idx_pel_entity ON project_entity_links(entity_id);

-- Also derived. listProjects() used to parse every document to count its
-- components, which is correct at twenty projects and wrong at five hundred.
-- The canary is general: as soon as an answer needs to read every blob, it
-- needs an index instead.
CREATE TABLE IF NOT EXISTS project_stats (
  project_id      TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  component_count INTEGER NOT NULL DEFAULT 0,
  group_count     INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lego_catalog_versions (
  version TEXT PRIMARY KEY,
  seeded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lego_scopes (
  catalog_version TEXT NOT NULL REFERENCES lego_catalog_versions(version) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label_en TEXT NOT NULL,
  label_fr TEXT NOT NULL,
  PRIMARY KEY (catalog_version, id)
);
CREATE TABLE IF NOT EXISTS lego_scope_aliases (
  catalog_version TEXT NOT NULL REFERENCES lego_catalog_versions(version) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  PRIMARY KEY (catalog_version, alias),
  FOREIGN KEY (catalog_version, scope_id) REFERENCES lego_scopes(catalog_version, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lego_bricks (
  catalog_version TEXT NOT NULL REFERENCES lego_catalog_versions(version) ON DELETE CASCADE,
  id TEXT NOT NULL,
  icon TEXT NOT NULL,
  layer_id TEXT NOT NULL,
  default_scope_id TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  PRIMARY KEY (catalog_version, id),
  FOREIGN KEY (catalog_version, default_scope_id) REFERENCES lego_scopes(catalog_version, id)
);
CREATE TABLE IF NOT EXISTS lego_brick_texts (
  catalog_version TEXT NOT NULL,
  brick_id TEXT NOT NULL,
  lang TEXT NOT NULL CHECK(lang IN ('en', 'fr')),
  role TEXT NOT NULL,
  responsibilities_json TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (catalog_version, brick_id, lang),
  FOREIGN KEY (catalog_version, brick_id) REFERENCES lego_bricks(catalog_version, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lego_brick_concern_tags (
  catalog_version TEXT NOT NULL,
  brick_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (catalog_version, brick_id, tag),
  FOREIGN KEY (catalog_version, brick_id) REFERENCES lego_bricks(catalog_version, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lego_concern_tags_brick ON lego_brick_concern_tags(catalog_version, brick_id);
CREATE TABLE IF NOT EXISTS lego_brick_scope_affinities (
  catalog_version TEXT NOT NULL,
  brick_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  PRIMARY KEY (catalog_version, brick_id, scope_id),
  FOREIGN KEY (catalog_version, brick_id) REFERENCES lego_bricks(catalog_version, id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_version, scope_id) REFERENCES lego_scopes(catalog_version, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lego_affinity_scope ON lego_brick_scope_affinities(catalog_version, scope_id);
CREATE TABLE IF NOT EXISTS lego_intents (
  catalog_version TEXT NOT NULL REFERENCES lego_catalog_versions(version) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (catalog_version, id)
);
CREATE TABLE IF NOT EXISTS lego_intent_modes (
  catalog_version TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (catalog_version, intent_id, mode),
  FOREIGN KEY (catalog_version, intent_id) REFERENCES lego_intents(catalog_version, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lego_intent_shapes (
  catalog_version TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  shape TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (catalog_version, intent_id, shape),
  FOREIGN KEY (catalog_version, intent_id) REFERENCES lego_intents(catalog_version, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lego_variants (
  catalog_version TEXT NOT NULL REFERENCES lego_catalog_versions(version) ON DELETE CASCADE,
  id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  label TEXT NOT NULL,
  mode TEXT NOT NULL,
  brick_id TEXT NOT NULL,
  PRIMARY KEY (catalog_version, id),
  FOREIGN KEY (catalog_version, intent_id) REFERENCES lego_intents(catalog_version, id),
  FOREIGN KEY (catalog_version, brick_id) REFERENCES lego_bricks(catalog_version, id)
);
CREATE INDEX IF NOT EXISTS idx_lego_variants_filter ON lego_variants(catalog_version, intent_id, mode, brick_id);
CREATE TABLE IF NOT EXISTS lego_technology_descriptions (
  catalog_version TEXT NOT NULL REFERENCES lego_catalog_versions(version) ON DELETE CASCADE,
  technology_key TEXT NOT NULL,
  lang TEXT NOT NULL CHECK(lang IN ('en', 'fr')),
  description TEXT NOT NULL,
  PRIMARY KEY (catalog_version, technology_key, lang)
);
CREATE TABLE IF NOT EXISTS lego_capability_phrases (
  catalog_version TEXT NOT NULL,
  brick_id TEXT NOT NULL,
  lang TEXT NOT NULL CHECK(lang IN ('en', 'fr')),
  phrase TEXT NOT NULL,
  PRIMARY KEY (catalog_version, brick_id, lang),
  FOREIGN KEY (catalog_version, brick_id) REFERENCES lego_bricks(catalog_version, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lego_dependencies (
  catalog_version TEXT NOT NULL REFERENCES lego_catalog_versions(version) ON DELETE CASCADE,
  from_brick TEXT NOT NULL,
  to_brick TEXT NOT NULL,
  strength TEXT NOT NULL CHECK(strength IN ('required', 'recommended', 'optional')),
  why_en TEXT NOT NULL,
  why_fr TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('sync', 'async', 'batch')),
  PRIMARY KEY (catalog_version, from_brick, to_brick)
);
CREATE INDEX IF NOT EXISTS idx_lego_dependencies_from ON lego_dependencies(catalog_version, from_brick);

CREATE TABLE IF NOT EXISTS admin_catalog_state (
  catalog_version TEXT PRIMARY KEY REFERENCES lego_catalog_versions(version),
  dirty INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin content tables (M2+). Schema only — no runtime wiring in M0.
CREATE TABLE IF NOT EXISTS content_domains (
  id TEXT PRIMARY KEY,
  status TEXT CHECK(status IN ('draft', 'published')),
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS project_templates (
  domain_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name_en TEXT,
  name_fr TEXT,
  meta_json TEXT,
  snapshot_json TEXT,
  sort_order INTEGER,
  featured INTEGER,
  PRIMARY KEY (domain_id, id)
);
CREATE TABLE IF NOT EXISTS add_sections (
  domain_id TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT,
  payload_json TEXT,
  PRIMARY KEY (domain_id, id)
);
CREATE TABLE IF NOT EXISTS flow_patterns (
  domain_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload_json TEXT,
  PRIMARY KEY (domain_id, id)
);
CREATE TABLE IF NOT EXISTS architecture_templates (
  domain_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload_json TEXT,
  PRIMARY KEY (domain_id, id)
);
CREATE TABLE IF NOT EXISTS cloud_services (
  domain_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  payload_json TEXT,
  PRIMARY KEY (domain_id, role_key)
);
CREATE TABLE IF NOT EXISTS system_copy (
  domain_id TEXT NOT NULL,
  key TEXT NOT NULL,
  en TEXT NOT NULL,
  fr TEXT NOT NULL,
  PRIMARY KEY (domain_id, key)
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __studioDb: DatabaseSync | undefined;
  // eslint-disable-next-line no-var
  var __studioMigrated: boolean | undefined;
  // eslint-disable-next-line no-var
  var __studioDbPath: string | undefined;
}

function open(resolvedPath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const db = new DatabaseSync(resolvedPath);
  db.exec(SCHEMA);
  migrateOnce(db);
  return db;
}

/** Applies additive schema (CREATE IF NOT EXISTS). Safe to re-run on a live
 * handle — needed because Next caches the connection on globalThis across HMR,
 * so a new table like `lego_dependencies` would otherwise never appear. */
function ensureSchema(database: DatabaseSync): DatabaseSync {
  database.exec(SCHEMA);
  migrateOnce(database);
  /* Additive migration for DBs created before `purpose` landed on lego_brick_texts. */
  const brickTextCols = plainAll<{ name: string }>(database.prepare('PRAGMA table_info(lego_brick_texts)').all());
  if (brickTextCols.length > 0 && !brickTextCols.some(col => col.name === 'purpose')) {
    database.exec("ALTER TABLE lego_brick_texts ADD COLUMN purpose TEXT NOT NULL DEFAULT ''");
  }
  const projectTplCols = plainAll<{ name: string }>(database.prepare('PRAGMA table_info(project_templates)').all());
  if (projectTplCols.length > 0 && !projectTplCols.some(col => col.name === 'meta_json')) {
    database.exec('ALTER TABLE project_templates ADD COLUMN meta_json TEXT');
  }
  /* The referential's second wave of columns. CREATE TABLE IF NOT EXISTS above
   * only ever reaches a fresh file, so a database that predates them needs each
   * one added by hand — all nullable, so there is nothing to backfill and an
   * interrupted upgrade leaves a readable database. */
  const eaCols = plainAll<{ name: string }>(database.prepare('PRAGMA table_info(ea_entities)').all());
  if (eaCols.length > 0) {
    const have = new Set(eaCols.map(col => col.name));
    for (const col of ['lifecycle', 'criticality', 'source', 'external_id', 'starts_on', 'ends_on']) {
      if (!have.has(col)) database.exec(`ALTER TABLE ea_entities ADD COLUMN ${col} TEXT`);
    }
    /* Created here rather than in SCHEMA for the same reason: the index cannot
     * exist before the columns it reads do. */
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ea_entities_external
      ON ea_entities(lower(source), lower(external_id))
      WHERE source IS NOT NULL AND external_id IS NOT NULL`);
  }
  return database;
}

/* Everything above is CREATE IF NOT EXISTS, which is cheap enough to re-run per
 * connection. Migrations are not: they are a read of the ledger, and on the
 * first call a write lock. ensureSchema() runs on *every* connect(), so without
 * this memo a settled database would pay that read on every request. Cached
 * beside the handle, and for the same reason — HMR replaces the module, not
 * globalThis. */
function migrateOnce(database: DatabaseSync): void {
  if (globalThis.__studioMigrated) return;
  applyMigrations(database);
  globalThis.__studioMigrated = true;
}

/* Cached on globalThis so Next's dev-mode module reloading does not open a new
 * handle on every hot update. SCHEMA still re-runs so additive tables land. */
function connect(): DatabaseSync {
  const resolved = resolveDbPath();
  if (globalThis.__studioDb && globalThis.__studioDbPath === resolved) {
    return ensureSchema(globalThis.__studioDb);
  }
  if (globalThis.__studioDb) {
    try { globalThis.__studioDb.close(); } catch { /* test isolation */ }
    globalThis.__studioDb = undefined;
  }
  globalThis.__studioDbPath = resolved;
  return (globalThis.__studioDb = open(resolved));
}

/* Opened on first query, never at import time.
 *
 * `next build` collects page data by importing every route module. When
 * opening the database was an import-time side effect, that meant a build
 * created `data/studio.db` for no reason — and, with several collection
 * workers racing to run the schema against the same fresh file, intermittently
 * died on `SQLITE_ERROR: database is locked`. It passed locally and on one CI
 * leg while failing on another, which is the signature of a race rather than a
 * bug in the build.
 *
 * The proxy keeps `db.prepare(…)` reading the same everywhere — store.ts is
 * the one file you rewrite if you outgrow this layer, and it should not have
 * to thread a getter through 25 call sites. Methods are bound to the real
 * handle: node:sqlite's natives reject being called on anything else. */
export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, prop, receiver) {
    const real = connect() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  has: (_target, prop) => prop in (connect() as unknown as object),
  getPrototypeOf: () => Object.getPrototypeOf(connect())
});

/* SQLite has no nested transactions, and the operations in this codebase
 * genuinely nest: approving a proposal is `updateProject` followed by
 * `freezeVersion`, and `updateProject` wants a transaction of its own so the
 * document and its derived index move together.
 *
 * So the depth is counted and only the outermost call issues BEGIN and COMMIT.
 * Savepoints would give partial rollback, which sounds better and is not what
 * anyone wants here: if the inner half of publishing a proposal fails, the
 * outer half must not stand either.
 *
 * Not on globalThis: this is per-call-stack state, and the whole point is that
 * it is scoped to one synchronous operation. Awaiting inside `fn` would break
 * it — none of the callers do, and none should. */
let depth = 0;

export function transaction<T>(fn: () => T): T {
  if (depth > 0) { depth++; try { return fn(); } finally { depth--; } }

  db.exec('BEGIN IMMEDIATE');
  depth = 1;
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth = 0;
  }
}

/** Whether a transaction is already open on this call stack.
 *
 *  Exported for one caller: a dry run rolls back by throwing, which only undoes
 *  anything when it owns the outermost transaction. Inside someone else's, the
 *  throw would unwind into *their* rollback and take their work with it — so the
 *  dry run refuses instead of quietly writing. */
export const inTransaction = (): boolean => depth > 0;

export function getDbPath(): string { return resolveDbPath(); }

export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/** node:sqlite returns null-prototype objects; spread them before use in React. */
export const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;
export const plainAll = <T>(rows: unknown[]): T[] => rows.map(r => plain<T>(r));
