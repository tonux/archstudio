import { NextResponse } from 'next/server';
import { publishCatalog } from '@/lib/lego/admin-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const result = publishCatalog();
  if (!result.ok) {
    return NextResponse.json({ error: 'validation failed', issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publishedAt: result.publishedAt });
}
