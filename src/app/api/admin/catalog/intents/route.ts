import { NextResponse } from 'next/server';
import { createIntent, listIntents, type IntentAdminCreate } from '@/lib/lego/admin-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ intents: listIntents() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const intentId = createIntent(body as IntentAdminCreate);
    return NextResponse.json({ ok: true, intentId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
