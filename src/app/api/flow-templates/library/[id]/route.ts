import { NextResponse } from 'next/server';
import { deleteFlowPattern, renameFlowPattern } from '@/lib/flows/library';
import { requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireApi();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ library: renameFlowPattern(id, String(body.name || '')) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireApi();
  if (denied) return denied;

  const { id } = await params;
  /* Deleting something already gone is the same outcome the caller wanted, and
   * a 404 here would only make a double-click look like a failure. */
  return NextResponse.json({ library: deleteFlowPattern(id) });
}
