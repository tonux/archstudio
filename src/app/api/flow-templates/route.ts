import { NextResponse } from 'next/server';
import { resolveCatalog } from '@/lib/flows/catalog';
import { listFlowLibrary } from '@/lib/flows/library';
import { LIBRARY_MAX_ENTRIES } from '@/lib/flows/types';
import type { Lang } from '@/lib/templates/types';
import { requireApi } from '@/lib/auth/guard';

/* The catalogue is resolved to one language here rather than shipped bilingual
 * and resolved in the browser. It keeps the authoring source — which is roughly
 * twice the payload and grows with every pattern added — out of the bundle, and
 * it means the picker component contains no `t()` calls and no `L10n` type at
 * all. The library half has to come from the server regardless, so folding both
 * into one response costs nothing; the request only fires when the modal opens.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const lang: Lang = new URL(req.url).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
  return NextResponse.json(
    { catalog: resolveCatalog(lang), library: listFlowLibrary(), max: LIBRARY_MAX_ENTRIES },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
