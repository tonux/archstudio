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
 */
import {
  ENTITY_KINDS, isEntityKind, isStandardStatus, NESTING_KINDS,
  type EntityKind, type StandardStatus
} from './types';
import { createEntity, entityByCode, listEntities, updateEntity } from './repository';

export interface CsvRow {
  line: number;
  kind?: string;
  code?: string;
  name?: string;
  parent?: string;
  status?: string;
  description?: string;
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
}

const COLUMNS = ['kind', 'code', 'name', 'parent', 'status', 'description'];

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

/** Rows keyed by column name, from a header line. Column order is the file's
 *  business, not ours. */
export function readRows(text: string): { rows: CsvRow[]; ignoredColumns: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], ignoredColumns: [] };

  const header = table[0].map(h => h.trim().toLowerCase());
  const ignoredColumns = header.filter(h => h && !COLUMNS.includes(h));

  const rows = table.slice(1).map((cells, i) => {
    const row: CsvRow = { line: i + 2 };
    header.forEach((name, col) => {
      if (!COLUMNS.includes(name)) return;
      const value = (cells[col] ?? '').trim();
      if (value) (row as unknown as Record<string, unknown>)[name] = value;
    });
    return row;
  });

  return { rows, ignoredColumns };
}

/** Apply the rows.
 *
 *  Matching is on `code` when the file gives one, and on an exact name within
 *  the same kind otherwise. Nothing fuzzier: a near-match that silently updates
 *  the wrong application is the failure mode that makes people distrust the
 *  whole referential.
 *
 *  Parents are resolved in a second pass, because a file is free to list a
 *  child before its parent and demanding otherwise would be an arbitrary rule
 *  for whoever maintains the spreadsheet. */
export function importRows(rows: CsvRow[], ignoredColumns: string[] = []): ImportReport {
  const results: RowResult[] = [];
  const byKey = new Map<string, string>();

  const key = (kind: string, code?: string, name?: string) =>
    code ? `${kind}code:${code.toLowerCase()}` : `${kind}name:${(name || '').toLowerCase()}`;

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

    const kind = row.kind.trim().toLowerCase().replace(/[\s_]+/g, '-');
    if (!isEntityKind(kind)) {
      skip(`"${row.kind}" is not a kind. Expected one of: ${ENTITY_KINDS.join(', ')}.`);
      continue;
    }

    const status: StandardStatus | undefined =
      row.status && isStandardStatus(row.status.trim().toLowerCase())
        ? (row.status.trim().toLowerCase() as StandardStatus) : undefined;
    if (row.status && !status) {
      skip(`"${row.status}" is not a status. Expected adopt, trial, hold or retire.`);
      continue;
    }
    if (status && kind !== 'technology-standard') {
      skip('Only a technology standard carries a status.');
      continue;
    }
    if (row.parent && !NESTING_KINDS.includes(kind)) {
      skip(`A ${kind} does not nest. Only ${NESTING_KINDS.join(' and ')} do.`);
      continue;
    }

    const existing = row.code
      ? entityByCode(kind, row.code)?.id ?? byKey.get(key(kind, row.code))
      : byKey.get(key(kind, undefined, row.name));

    try {
      if (existing) {
        updateEntity(existing, {
          name: row.name, code: row.code ?? null,
          status: status ?? null, description: row.description ?? null
        });
        byKey.set(key(kind, row.code, row.name), existing);
        byKey.set(key(kind, undefined, row.name), existing);
        results.push({ line: row.line, outcome: 'updated', name: row.name, id: existing });
        if (row.parent) pending.push({ row, id: existing });
      } else {
        const made = createEntity({
          kind, name: row.name, code: row.code, status, description: row.description
        });
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
    const kind = (row.kind || '').trim().toLowerCase().replace(/[\s_]+/g, '-') as EntityKind;
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

  return {
    created: results.filter(r => r.outcome === 'created').length,
    updated: results.filter(r => r.outcome === 'updated').length,
    skipped: results.filter(r => r.outcome === 'skipped').length,
    rows: results,
    ignoredColumns
  };
}

/** The header the importer reads, as a file someone can start from. */
export const CSV_TEMPLATE =
  'kind,code,name,parent,status,description\n' +
  'capability,,Sales,,,\n' +
  'capability,,Billing,Sales,,Issuing and collecting invoices\n' +
  'application,APP-0142,Invoicing service,,,\n' +
  'actor,,Payments team,,,\n' +
  'business-object,,Invoice,,,\n' +
  'technology-standard,,Java 8,,retire,Out of support\n';
