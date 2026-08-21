import { NextResponse } from 'next/server';
import {
  deleteTechnologyDescription,
  updateTechnologyDescription,
  type TechnologyDescriptionUpdate,
} from '@/lib/lego/admin-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ key: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { key } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const technologyKey = updateTechnologyDescription(decodeURIComponent(key), body as TechnologyDescriptionUpdate);
    return NextResponse.json({ ok: true, key: technologyKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { key } = await params;
  try {
    const technologyKey = deleteTechnologyDescription(decodeURIComponent(key));
    return NextResponse.json({ ok: true, key: technologyKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
