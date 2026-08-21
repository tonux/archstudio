import { NextResponse } from 'next/server';
import {
  createDependency,
  deleteDependency,
  listDependencies,
  updateDependency,
  type DependencyAdminCreate,
  type DependencyAdminPatch,
} from '@/lib/lego/admin-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ dependencies: listDependencies() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const edge = createDependency(body as DependencyAdminCreate);
    return NextResponse.json({ ok: true, ...edge }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }

  const { from: _from, to: _to, ...patch } = body as { from: string; to: string } & DependencyAdminPatch;
  try {
    const edge = updateDependency(from, to, patch);
    return NextResponse.json({ ok: true, ...edge });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 });
  }

  try {
    const edge = deleteDependency(from, to);
    return NextResponse.json({ ok: true, ...edge });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
