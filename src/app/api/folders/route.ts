import { NextResponse } from 'next/server';
import { listFolders, createFolder } from '@/lib/store';
import { authorize, requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return NextResponse.json(listFolders());
}

export async function POST(req: Request) {
  const denied = await authorize('write', { kind: 'workspace' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  return NextResponse.json(createFolder(name, body.parentId ?? null, body.color), { status: 201 });
}
