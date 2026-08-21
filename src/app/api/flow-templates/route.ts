import { NextResponse } from 'next/server';
import { resolveCatalog } from '@/lib/flows/resolve-catalog.server';
import { listFlowLibrary } from '@/lib/flows/library';
import { LIBRARY_MAX_ENTRIES } from '@/lib/flows/types';
import type { Lang } from '@/lib/templates/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const lang: Lang = new URL(req.url).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
  return NextResponse.json(
    { catalog: resolveCatalog(lang), library: listFlowLibrary(), max: LIBRARY_MAX_ENTRIES },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
