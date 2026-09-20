/* Importing the referential from a spreadsheet.
 *
 * This lands before the ArchiMate import, deliberately. The first thing any
 * company has is not a `.xml` model — it is a spreadsheet somebody maintains,
 * exported from a CMDB or typed by hand, and a referential nobody can get their
 * existing list into is a referential nobody fills in.
 *
 * The parser is small on purpose and it is honest about what it did: every row
 * comes back as created, updated, or skipped-with-a-reason. Nothing is written
 * until the caller says so, so the UI can show the outcome first — the same
 * shape as the AI analysis review screen, and for the same reason: an import
 * that silently invents twelve entities is worse than one that refuses.
 *
 * Two shapes of file, told apart by their header. One lists *things*, the other
 * lists *relationships between them*, and they are separate files rather than
 * one wide one because a row that is sometimes an entity and sometimes an edge
 * is a row nobody can validate. Relationships mattered enough to be worth a
 * second file: without them the referential can hold a landscape but not say
 * anything about it, and half the queries that read it have only one of their
 * two sources filled in.
 */
import { inTransaction, transaction } from '../db';
import {
  CRITICALITIES, ENTITY_KINDS, isCriticality, isEntityKind, isLifecycle,
  isStandardStatus, LIFECYCLES, LIFECYCLE_KINDS, CRITICALITY_KINDS,
  NESTING_KINDS, RELATION_KINDS, STANDARD_STATUSES,
  type Criticality, type EntityKind, type EntityLifecycle, type RelationKind,
  type StandardStatus
} from './types';
import {
  createEntity, createRelation, entityByCode, entityBySource, listEntities,
  listRelations, updateEntity
} from './repository';

export interface CsvRow {
  line: number;
  kind?: string;
  code?: string;
  name?: string;
  parent?: string;
  status?: string;
  lifecycle?: string;
  criticality?: string;
  description?: string;
  source?: string;
  externalid?: string;
  startson?: string;
  endson?: string;
}

export interface RelationRow {
  line: number;
  relation?: string;
  from?: string;
  to?: string;
  note?: string;
}

export type Outcome = 'created' | 'updated' | 'skipped';

export interface RowResult {
  line: number;
  outcome: Outcome;
  /** Why, when it was skipped. Always a sentence, never a code. */
  reason?: string;
  name?: string;
  id?: string;
}

export interface ImportReport {
  created: number;
  updated: number;
  skipped: number;
  rows: RowResult[];
  /** Columns in the file that this importer does not read, named so nobody
   *  wonders why their fourth column had no effect. */
  ignoredColumns: string[];
  /** Which of the two files this was. */
  shape: CsvShape;
  /** True when nothing was written and this is only what *would* happen. */
  preview?: boolean;
}

export type CsvShape = 'entities' | 'relations';

/* Header spellings are normalised to these. `external_id`, `externalId` and
 * `external id` are the same column — a spreadsheet exported from three
 * different tools spells it three ways, and refusing two of them would be
 * pedantry dressed as validation. */
const ENTITY_COLUMNS = [
  'kind', 'code', 'name', 'parent', 'status', 'lifecycle', 'criticality',
  'description', 'source', 'externalid', 'startson', 'endson'
];

const RELATION_COLUMNS = ['relation', 'from', 'to', 'note'];

const normalizeHeader = (h: string): string =>
  h.trim().toLowerCase().replace(/[\s_-]+/g, '');

const normalizeValue = (v: string): string =>
  v.trim().toLowerCase().replace(/[\s_]+/g, '-');

/** RFC 4180 enough: quoted fields, doubled quotes inside them, commas and
 *  newlines inside quotes, and a BOM at the front because that is what a
 *  spreadsheet writes. Not a general CSV library, and not pretending to be. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',' || ch === ';') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  /* A trailing newline should not become a row of one empty string. */
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

export interface ReadResult {
  shape: CsvShape;
  /** Entity rows. Empty when the file was a relations file. */
  rows: CsvRow[];
  /** Relation rows. Empty when the file was an entity file. */
  relations: RelationRow[];
  ignoredColumns: string[];
}

/** Rows keyed by column name, from a header line. Column order is the file's
 *  business, not ours.
 *
 *  The shape is decided by the header rather than by asking the user, because
 *  the header already says it: a file with `from` and `to` is a list of edges
 *  and nothing else sensibly is. */
export function readRows(text: string): ReadResult {
  const table = parseCsv(text);
  if (!table.length) {
    return { shape: 'entities', rows: [], relations: [], ignoredColumns: [] };
  }

  /* Matched on the normalised spelling, *reported* on the file's own. Losing
   * the original would make the one thing this list is for — telling somebody
   * which of their columns had no effect — name a column they cannot find. */
  const raw = table[0].map(h => h.trim());
  const header = raw.map(normalizeHeader);
  const shape: CsvShape =
    header.includes('from') && header.includes('to') ? 'relations' : 'entities';
  const known = shape === 'relations' ? RELATION_COLUMNS : ENTITY_COLUMNS;
  const ignoredColumns = raw.filter((h, i) => h && !known.includes(header[i]));

  const read = <T extends { line: number }>(base: (i: number) => T): T[] =>
    table.slice(1).map((cells, i) => {
      const row = base(i);
      header.forEach((name, col) => {
        if (!known.includes(name)) return;
        const value = (cells[col] ?? '').trim();
        if (value) (row as unknown as Record<string, unknown>)[name] = value;
      });
      return row;
    });

  return shape === 'relations'
    ? { shape, rows: [], relations: read(i => ({ line: i + 2 } as RelationRow)), ignoredColumns }
    : { shape, rows: read(i => ({ line: i + 2 } as CsvRow)), relations: [], ignoredColumns };
}

/* ------------------------------------------------------------- dry run */

class Rollback extends Error {
  constructor(readonly report: ImportReport) { super('dry run'); }
}

/** Run an import and throw the result away, keeping only the report.
 *
 *  The preview is the import: same matching, same validation, same order, and
 *  then a rollback. A second implementation that *predicted* the outcome would
 *  be a second place for the rules to live, and the first time the two
 *  disagreed the preview would be worse than none — it is read precisely by
 *  people deciding whether to trust the file. */
function dryRun(run: () => ImportReport): ImportReport {
  if (inTransaction()) {
    throw new Error('A preview cannot run inside another transaction.');
  }
  try {
    transaction(() => { throw new Rollback(run()); });
  } catch (e) {
    if (e instanceof Rollback) return { ...e.report, preview: true };
    throw e;
  }
  /* `transaction` either returns or throws, and the body above always throws. */
  throw new Error('unreachable');
}

export interface ImportOptions {
  /** Report what would happen and write nothing. */
  preview?: boolean;
}

/** One entry point for a pasted file, whichever of the two shapes it is. */
export function importCsv(text: string, opts: ImportOptions = {}): ImportReport {
  const { shape, rows, relations, ignoredColumns } = readRows(text);
  return shape === 'relations'
    ? importRelationRows(relations, ignoredColumns, opts)
    : importRows(rows, ignoredColumns, opts);
}

const tally = (
  results: RowResult[], ignoredColumns: string[], shape: CsvShape
): ImportReport => ({
  created: results.filter(r => r.outcome === 'created').length,
  updated: results.filter(r => r.outcome === 'updated').length,
  skipped: results.filter(r => r.outcome === 'skipped').length,
  rows: results,
  ignoredColumns,
  shape
});

/* ------------------------------------------------------------- entities */

/** Apply the rows.
 *
 *  Matching runs in three steps, most specific first: the source's own key when
 *  the file carries one, then `code`, then an exact name within the same kind.
 *  Nothing fuzzier: a near-match that silently updates the wrong application is
 *  the failure mode that makes people distrust the whole referential.
 *
 *  Parents are resolved in a second pass, because a file is free to list a
 *  child before its parent and demanding otherwise would be an arbitrary rule
 *  for whoever maintains the spreadsheet. */
export function importRows(
  rows: CsvRow[], ignoredColumns: string[] = [], opts: ImportOptions = {}
): ImportReport {
  if (opts.preview) return dryRun(() => importRows(rows, ignoredColumns));

  const results: RowResult[] = [];
  const byKey = new Map<string, string>();

  const key = (kind: string, code?: string, name?: string) =>
    code ? `${kind}code:${code.toLowerCase()}` : `${kind}name:${(name || '').toLowerCase()}`;

  /* Existing rows, so a re-import of the same file updates rather than
   * duplicates — which is what makes the spreadsheet usable as the source. */
  for (const e of listEntities()) {
    byKey.set(key(e.kind, e.code, e.name), e.id);
    if (e.code) byKey.set(key(e.kind, undefined, e.name), e.id);
  }

  const pending: { row: CsvRow; id: string }[] = [];

  for (const row of rows) {
    const skip = (reason: string) => results.push({ line: row.line, outcome: 'skipped', reason });

    if (!row.name) { skip('No name.'); continue; }
    if (!row.kind) { skip('No kind. Expected one of: ' + ENTITY_KINDS.join(', ') + '.'); continue; }

    const kind = normalizeValue(row.kind);
    if (!isEntityKind(kind)) {
      skip(`"${row.kind}" is not a kind. Expected one of: ${ENTITY_KINDS.join(', ')}.`);
      continue;
    }

    /* Each closed vocabulary is checked the same way and refuses the row rather
     * than dropping the value: a spreadsheet that says "Adopted" meant
     * something, and silently storing nothing would hide the typo until someone
     * ran a report on it. */
    const status = readEnum<StandardStatus>(row.status, isStandardStatus);
    if (row.status && !status) {
      skip(`"${row.status}" is not a status. Expected ${STANDARD_STATUSES.join(', ')}.`);
      continue;
    }
    if (status && kind !== 'technology-standard') {
      skip('Only a technology standard carries a status.');
      continue;
    }

    const lifecycle = readEnum<EntityLifecycle>(row.lifecycle, isLifecycle);
    if (row.lifecycle && !lifecycle) {
      skip(`"${row.lifecycle}" is not a lifecycle. Expected ${LIFECYCLES.join(', ')}.`);
      continue;
    }
    if (lifecycle && !LIFECYCLE_KINDS.includes(kind)) {
      skip(`A ${kind} has no lifecycle of its own. Only ${LIFECYCLE_KINDS.join(', ')} do.`);
      continue;
    }

    const criticality = readEnum<Criticality>(row.criticality, isCriticality);
    if (row.criticality && !criticality) {
      skip(`"${row.criticality}" is not a criticality. Expected ${CRITICALITIES.join(', ')}.`);
      continue;
    }
    if (criticality && !CRITICALITY_KINDS.includes(kind)) {
      skip(`A ${kind} does not carry a criticality.`);
      continue;
    }

    if (row.parent && !NESTING_KINDS.includes(kind)) {
      skip(`A ${kind} does not nest. Only ${NESTING_KINDS.join(', ')} do.`);
      continue;
    }
    if (row.externalid && !row.source) {
      skip('An external id needs a source to be unique in. Add a source column.');
      continue;
    }

    /* The source's key wins over code and name, because it is the only
     * identifier that survives somebody renaming the thing over there. */
    const existing =
      (row.source && row.externalid ? entityBySource(row.source, row.externalid)?.id : undefined)
      ?? (row.code ? entityByCode(kind, row.code)?.id ?? byKey.get(key(kind, row.code)) : undefined)
      ?? (row.code ? undefined : byKey.get(key(kind, undefined, row.name)));

    const fields = {
      name: row.name,
      code: row.code ?? null,
      status: status ?? null,
      lifecycle: lifecycle ?? null,
      criticality: criticality ?? null,
      description: row.description ?? null,
      source: row.source ?? null,
      externalId: row.externalid ?? null,
      startsOn: row.startson ?? null,
      endsOn: row.endson ?? null
    };

    try {
      if (existing) {
        updateEntity(existing, fields);
        byKey.set(key(kind, row.code, row.name), existing);
        byKey.set(key(kind, undefined, row.name), existing);
        results.push({ line: row.line, outcome: 'updated', name: row.name, id: existing });
        if (row.parent) pending.push({ row, id: existing });
      } else {
        const made = createEntity({ kind, ...fields, code: row.code, name: row.name });
        byKey.set(key(kind, row.code, row.name), made.id);
        byKey.set(key(kind, undefined, row.name), made.id);
        results.push({ line: row.line, outcome: 'created', name: row.name, id: made.id });
        if (row.parent) pending.push({ row, id: made.id });
      }
    } catch (e) {
      skip(e instanceof Error ? e.message : 'Could not be written.');
    }
  }

  /* Second pass: parents by code or by name, now that everything the file
   * declares exists. A parent the file never mentions is not an error worth
   * failing the row for — the entity is real, it is simply at the top. */
  for (const { row, id } of pending) {
    const kind = normalizeValue(row.kind || '') as EntityKind;
    const parent = byKey.get(key(kind, row.parent)) ?? byKey.get(key(kind, undefined, row.parent));
    if (!parent) {
      const at = results.find(r => r.line === row.line);
      if (at) at.reason = `Parent "${row.parent}" was not in this file. Left at the top level.`;
      continue;
    }
    try {
      updateEntity(id, { parent });
    } catch (e) {
      const at = results.find(r => r.line === row.line);
      if (at) at.reason = e instanceof Error ? e.message : 'Parent refused.';
    }
  }

  return tally(results, ignoredColumns, 'entities');
}

const readEnum = <T>(raw: string | undefined, ok: (v: unknown) => v is T): T | undefined => {
  if (!raw) return undefined;
  const v = normalizeValue(raw);
  return ok(v) ? v : undefined;
};

/* ------------------------------------------------------------ relations */

/** How a relations file names an end.
 *
 *  Three spellings, because three kinds of organisation write this file. A bare
 *  code is what a CMDB export gives; `kind:name` is what somebody types by hand
 *  and is the only unambiguous form; a bare name is what a first spreadsheet
 *  always looks like. Ambiguity is reported rather than guessed — two
 *  applications called "Billing" is exactly when a guess does damage. */
function resolveEnd(raw: string, all: { id: string; kind: EntityKind; code?: string; name: string }[]):
  { id: string } | { problem: string } {
  const value = raw.trim();
  if (!value) return { problem: 'Empty.' };

  const colon = value.indexOf(':');
  if (colon > 0) {
    const kind = normalizeValue(value.slice(0, colon));
    const rest = value.slice(colon + 1).trim().toLowerCase();
    if (isEntityKind(kind)) {
      const inKind = all.filter(e => e.kind === kind);
      const hit = inKind.filter(e => e.code?.toLowerCase() === rest || e.name.toLowerCase() === rest);
      if (hit.length === 1) return { id: hit[0].id };
      if (hit.length > 1) return { problem: `"${value}" matches ${hit.length} rows.` };
      return { problem: `No ${kind} called "${value.slice(colon + 1).trim()}".` };
    }
  }

  const lower = value.toLowerCase();
  const byCode = all.filter(e => e.code?.toLowerCase() === lower);
  if (byCode.length === 1) return { id: byCode[0].id };
  if (byCode.length > 1) return { problem: `Code "${value}" is used by ${byCode.length} kinds. Write it as kind:code.` };

  const byName = all.filter(e => e.name.toLowerCase() === lower);
  if (byName.length === 1) return { id: byName[0].id };
  if (byName.length > 1) return { problem: `"${value}" matches ${byName.length} rows. Write it as kind:name.` };

  return { problem: `Nothing here is called "${value}".` };
}

/** Apply a relations file.
 *
 *  Every end has to already exist. A relations file that could create entities
 *  would be an entity file with extra steps, and one typo in it would fill the
 *  referential with near-duplicates that look like real rows. */
export function importRelationRows(
  rows: RelationRow[], ignoredColumns: string[] = [], opts: ImportOptions = {}
): ImportReport {
  if (opts.preview) return dryRun(() => importRelationRows(rows, ignoredColumns));

  const results: RowResult[] = [];
  const all = listEntities();
  const already = new Set(listRelations().map(r => `${r.kind}|${r.from}|${r.to}`));

  for (const row of rows) {
    const skip = (reason: string) => results.push({ line: row.line, outcome: 'skipped', reason });

    if (!row.relation) {
      skip(`No relation. Expected one of: ${RELATION_KINDS.join(', ')}.`);
      continue;
    }
    const kind = normalizeValue(row.relation);
    if (!isRelationKindLocal(kind)) {
      skip(`"${row.relation}" is not a relationship. Expected one of: ${RELATION_KINDS.join(', ')}.`);
      continue;
    }
    if (!row.from || !row.to) { skip('Both from and to are needed.'); continue; }

    const from = resolveEnd(row.from, all);
    if ('problem' in from) { skip(`from: ${from.problem}`); continue; }
    const to = resolveEnd(row.to, all);
    if ('problem' in to) { skip(`to: ${to.problem}`); continue; }

    const signature = `${kind}|${from.id}|${to.id}`;
    const label = `${row.from} ${kind} ${row.to}`;
    if (already.has(signature)) {
      /* Already there, which is what a second run of the same file looks like.
       * Reported as `updated` rather than skipped: nothing was wrong with the
       * row, and a report full of red on a re-import teaches people to ignore
       * the report. */
      results.push({ line: row.line, outcome: 'updated', name: label });
      continue;
    }

    try {
      const made = createRelation(kind, from.id, to.id, row.note);
      already.add(signature);
      results.push({ line: row.line, outcome: 'created', name: label, id: made.id });
    } catch (e) {
      skip(e instanceof Error ? e.message : 'Could not be written.');
    }
  }

  return tally(results, ignoredColumns, 'relations');
}

const isRelationKindLocal = (v: string): v is RelationKind =>
  (RELATION_KINDS as string[]).includes(v);

/* ------------------------------------------------------------ templates */

/** The header the importer reads, as a file someone can start from. */
export const CSV_TEMPLATE =
  'kind,code,name,parent,status,lifecycle,criticality,description,source,external_id,starts_on,ends_on\n' +
  'capability,,Sales,,,,,,,,,\n' +
  'capability,,Billing,Sales,,,,Issuing and collecting invoices,,,,\n' +
  'business-process,,Invoice a customer,,,live,high,,,,,\n' +
  'business-service,,Customer billing,,,live,high,What the customer sees,,,,\n' +
  'application,APP-0142,Invoicing service,,,live,vital,,cmdb,ci-88213,2019-04-01,\n' +
  'actor,,Payments team,,,,,,,,,\n' +
  'business-object,,Invoice,,,,medium,,,,,\n' +
  'technology-standard,,Java 8,,retire,,,Out of support,,,,\n' +
  'goal,,Cut invoicing cost by 30%,,,,,By end 2027,,,,\n' +
  'requirement,,Invoices are archived for 10 years,,,,,Legal,,,,\n';

/** The second file: what joins what. */
export const RELATIONS_CSV_TEMPLATE =
  'relation,from,to,note\n' +
  'realizes,APP-0142,capability:Billing,\n' +
  'assigned-to,APP-0142,actor:Payments team,\n' +
  'accesses,APP-0142,business-object:Invoice,\n' +
  'uses-standard,APP-0142,technology-standard:Java 8,Migration not planned\n' +
  'realizes,business-process:Invoice a customer,business-service:Customer billing,\n' +
  'motivated-by,APP-0142,goal:Cut invoicing cost by 30%,\n';
