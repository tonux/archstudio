import { NextResponse } from 'next/server';

import { authorize } from '@/lib/auth/guard';
import { reindexAll } from '@/lib/ea/hydrate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The escape hatch that makes the double write defensible.
 *
 * The blob is the truth and the tables are derived from it, so if the two ever
 * disagree this settles it in favour of the blobs. Nothing should need it in
 * normal use — every write already reindexes inside its own transaction — but
 * "you can always rebuild" is the sentence that makes the design safe to reason
 * about, and it has to be true. */
export async function POST() {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  return NextResponse.json({ ok: true, projects: reindexAll() });
}
