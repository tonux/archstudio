import { NextResponse } from 'next/server';
import { saveFlowPattern } from '@/lib/flows/library';
import { requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The whole library comes back on every write. It is forty short records at
 * most, and returning it means the picker never has to guess what the row now
 * holds — no client-side splice that could drift from the server's ordering or
 * from the id it minted. */

export async function POST(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ library: saveFlowPattern(body) }, { status: 201 });
  } catch (e) {
    /* The caps and the "needs two steps" rule both land here, and their
     * messages are written for the person who clicked Save. */
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
