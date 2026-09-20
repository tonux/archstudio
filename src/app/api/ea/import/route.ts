import { NextResponse } from 'next/server';

import { authorize, requireApi } from '@/lib/auth/guard';
import { CSV_TEMPLATE, RELATIONS_CSV_TEMPLATE, importCsv, readRows } from '@/lib/ea/csv';
import { reindexAll } from '@/lib/ea/hydrate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The starter files, so nobody has to guess the header.
 *
 *  `?shape=relations` for the second one. Two files rather than one wide one —
 *  see the note at the top of `lib/ea/csv.ts`. */
export async function GET(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const relations = new URL(req.url).searchParams.get('shape') === 'relations';
  return new NextResponse(relations ? RELATIONS_CSV_TEMPLATE : CSV_TEMPLATE, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="referential-${
        relations ? 'relations' : 'entities'}-template.csv"`
    }
  });
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? '');
  if (!text.trim()) return NextResponse.json({ error: 'Nothing to import.' }, { status: 400 });

  /* `preview` writes nothing and reports what would happen. It is the same code
   * path rolled back, not a prediction — see `dryRun` in lib/ea/csv.ts. */
  const preview = body.preview === true;

  const { shape, rows, relations } = readRows(text);
  if (!rows.length && !relations.length) {
    return NextResponse.json(
      {
        error: shape === 'relations'
          ? 'No rows under the header. Expected: relation,from,to,note'
          : 'No rows under the header. Expected at least: kind,name'
      },
      { status: 400 }
    );
  }

  let report;
  try {
    report = importCsv(text, { preview });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  /* A bulk write can turn a citation that had nothing behind it into one that
   * does — an entity the documents already named by an id an earlier import
   * failed to create. Rebuilding settles it, and the report is what the caller
   * is shown either way. Never after a preview: nothing was written, so there
   * is nothing to settle and the rebuild would only cost time. */
  if (!preview && (report.created || report.updated)) reindexAll();

  return NextResponse.json(report);
}
