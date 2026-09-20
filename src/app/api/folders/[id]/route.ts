import { NextResponse } from 'next/server';
import { updateFolder, deleteFolder, getFolder } from '@/lib/store';
import { authorize } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await authorize('write', { kind: 'workspace' });
  if (denied) return denied;

  const { id } = await params;
  if (!getFolder(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(updateFolder(id, body));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await authorize('write', { kind: 'workspace' });
  if (denied) return denied;

  const { id } = await params;
  deleteFolder(id);
  return NextResponse.json({ ok: true });
}
