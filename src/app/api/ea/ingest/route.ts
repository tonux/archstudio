import { NextResponse } from 'next/server';

import { authorize } from '@/lib/auth/guard';
import { reindexAll } from '@/lib/ea/hydrate';
import { upsertBySource } from '@/lib/ea/repository';
import { transaction } from '@/lib/db';
import { isEntityKind, type EntityKind } from '@/lib/ea/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Feeding the referential from a system that already knows.
 *
 * The CSV import is for a person with a spreadsheet. This is for a job: a
 * nightly export from a CMDB, a script somebody runs after a migration, a
 * pipeline step. The difference that matters is not the format — it is that a
 * job runs again tomorrow with mostly the same rows, so the only acceptable
 * behaviour is to converge rather than accumulate.
 *
 * Hence one required pair: `source` and, per row, `externalId`. Everything is
 * matched on that pair and nothing else. Matching on name would make a rename
 * over there a duplicate over here, which is the failure that turns a
 * referential into a list nobody trusts after six months.
 *
 * The whole batch is one transaction. A feed that half-applied would leave the
 * referential in a state no rerun corrects — the rows that landed look current
 * and the rows that did not look deleted.
 */

interface IngestRow {
  externalId?: unknown;
  kind?: unknown;
  name?: unknown;
  code?: unknown;
  status?: unknown;
  lifecycle?: unknown;
  criticality?: unknown;
  description?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  props?: unknown;
}

interface RowOutcome {
  externalId: string;
  outcome: 'created' | 'updated' | 'skipped';
  id?: string;
  reason?: string;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** Free attributes, but only the flat string pairs. A feed that sends a nested
 *  object means something this model does not hold, and storing `[object
 *  Object]` would be pretending otherwise. */
function readProps(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const source = str(body.source);
  if (!source) {
    return NextResponse.json(
      { error: 'A source is required: it is what makes a rerun an update rather than a copy.' },
      { status: 400 }
    );
  }

  const rows: IngestRow[] = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: 'No rows.' }, { status: 400 });

  /* A default kind for feeds whose rows are all one thing, which is most of
   * them: a CMDB application export does not repeat "application" ten thousand
   * times. A row may still say its own. */
  const fallbackKind: EntityKind | undefined =
    isEntityKind(body.kind) ? body.kind : undefined;

  const results: RowOutcome[] = [];
  let created = 0;
  let updated = 0;

  try {
    transaction(() => {
      for (const row of rows) {
        const externalId = str(row.externalId) ?? '';
        const skip = (reason: string) =>
          results.push({ externalId, outcome: 'skipped', reason });

        if (!externalId) { skip('No externalId.'); continue; }
        const name = str(row.name);
        if (!name) { skip('No name.'); continue; }

        const kind = isEntityKind(row.kind) ? row.kind : fallbackKind;
        if (!kind) { skip('No kind, and the batch does not name a default one.'); continue; }

        try {
          const { entity, created: isNew } = upsertBySource(source, externalId, {
            kind,
            name,
            code: str(row.code) ?? null,
            status: str(row.status) ?? null,
            lifecycle: str(row.lifecycle) ?? null,
            criticality: str(row.criticality) ?? null,
            description: str(row.description) ?? null,
            startsOn: str(row.startsOn) ?? null,
            endsOn: str(row.endsOn) ?? null,
            props: readProps(row.props) ?? null
          });
          if (isNew) created++; else updated++;
          results.push({
            externalId, outcome: isNew ? 'created' : 'updated', id: entity.id
          });
        } catch (e) {
          skip(e instanceof Error ? e.message : 'Could not be written.');
        }
      }
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  /* Same reasoning as the CSV import: new entities can give a citation that had
   * nothing behind it something to point at. */
  if (created || updated) reindexAll();

  return NextResponse.json({
    source,
    created,
    updated,
    skipped: results.filter(r => r.outcome === 'skipped').length,
    rows: results
  });
}
