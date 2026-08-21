import { NextResponse } from 'next/server';
import { deleteAdminBrick, updateAdminBrick, type BrickAdminUpdate } from '@/lib/lego/admin-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const brickId = updateAdminBrick(id, body as BrickAdminUpdate);
    return NextResponse.json({ ok: true, brickId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const brickId = deleteAdminBrick(id);
    return NextResponse.json({ ok: true, brickId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
