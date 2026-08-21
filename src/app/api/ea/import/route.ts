import { NextResponse } from 'next/server';

import { authorize, requireApi } from '@/lib/auth/guard';
import { CSV_TEMPLATE, importRows, readRows } from '@/lib/ea/csv';
import { reindexAll } from '@/lib/ea/hydrate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The starter file, so nobody has to guess the header. */
export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return new NextResponse(CSV_TEMPLATE, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="referential-template.csv"'
    }
  });
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? '');
  if (!text.trim()) return NextResponse.json({ error: 'Nothing to import.' }, { status: 400 });

  const { rows, ignoredColumns } = readRows(text);
  if (!rows.length) {
    return NextResponse.json(
      { error: 'No rows under the header. Expected: kind,code,name,parent,status,description' },
      { status: 400 }
    );
  }

  const report = importRows(rows, ignoredColumns);

  /* A bulk write can turn a citation that had nothing behind it into one that
   * does — an entity the documents already named by an id an earlier import
   * failed to create. Rebuilding settles it, and the report is what the caller
   * is shown either way. */
  if (report.created || report.updated) reindexAll();

  return NextResponse.json(report);
}
