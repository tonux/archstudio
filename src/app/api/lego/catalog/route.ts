import { NextResponse } from 'next/server';
import { legoCatalog } from '@/lib/lego/repository';
import { requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const lang = new URL(req.url).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
  return NextResponse.json(legoCatalog(lang), { headers: { 'Cache-Control': 'no-store' } });
}
