import { NextResponse } from 'next/server';
import { deleteIntent, getIntent, updateIntent, type IntentAdminUpdate } from '@/lib/lego/admin-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const intent = getIntent(id);
  if (!intent) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ intent });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const intentId = updateIntent(id, body as IntentAdminUpdate);
    return NextResponse.json({ ok: true, intentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const intentId = deleteIntent(id);
    return NextResponse.json({ ok: true, intentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
