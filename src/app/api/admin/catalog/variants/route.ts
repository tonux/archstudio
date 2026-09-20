import { NextResponse } from 'next/server';
import { createVariant, listVariants, type VariantAdminCreate } from '@/lib/lego/admin-catalog';
import { authorize, requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return NextResponse.json({ variants: listVariants() });
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const variantId = createVariant(body as VariantAdminCreate);
    return NextResponse.json({ ok: true, variantId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
