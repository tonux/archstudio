import { NextResponse } from 'next/server';

import { requireApi } from '@/lib/auth/guard';
import { buildGraph } from '@/lib/ea/graph';
import {
  isQueryName, retiringStandards, runQuery,
  QUERIES, QUERY_BLURBS, QUERY_LABELS, QUERY_SUBJECT
} from '@/lib/ea/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ name: string }> };

/* One question, answered.
 *
 * `?subject=<entity id>` for the three that need one. `GET /api/ea/query/index`
 * lists what can be asked, so the screen does not have to hard-code it. */
export async function GET(req: Request, { params }: Ctx) {
  const denied = await requireApi();
  if (denied) return denied;

  const { name } = await params;

  if (name === 'index') {
    return NextResponse.json({
      queries: QUERIES.map(q => ({
        name: q, label: QUERY_LABELS[q], blurb: QUERY_BLURBS[q], subject: QUERY_SUBJECT[q]
      })),
      /* The shortcut that makes the technology question worth opening: the
       * standards someone has already decided to leave. */
      leaving: retiringStandards()
    });
  }

  if (!isQueryName(name)) {
    return NextResponse.json({ error: `Unknown question "${name}".` }, { status: 404 });
  }

  const subject = new URL(req.url).searchParams.get('subject') ?? undefined;
  const started = Date.now();
  const result = runQuery(name, subject, buildGraph());

  return NextResponse.json({ ...result, ms: Date.now() - started });
}
