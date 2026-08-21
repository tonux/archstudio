import { NextResponse } from 'next/server';
import { getFlowPatternAdmin, templateToResolvedPattern } from '@/lib/admin/flow-patterns';
import { matchSteps } from '@/lib/flows/match';
import { countMappableSteps } from '@/lib/flows/plate';
import { legoCatalog } from '@/lib/lego/repository';
import demoJson from '@/lib/seed/demo.json';
import { normalizeArchitecture } from '@/lib/defaults';
import type { Lang } from '@/lib/templates/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const lang: Lang = new URL(req.url).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
  const tpl = getFlowPatternAdmin(id);
  if (!tpl) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const pattern = templateToResolvedPattern(tpl, lang);
  const catalog = legoCatalog(lang === 'fr' ? 'fr' : 'en');
  const doc = normalizeArchitecture(demoJson as Parameters<typeof normalizeArchitecture>[0]);
  const bindings = matchSteps(pattern.steps, doc.components);
  const matched = bindings.filter(b => b.component).length;

  return NextResponse.json({
    id,
    stepCount: pattern.steps.length,
    mappableSteps: countMappableSteps(pattern, catalog),
    matchedOnDemo: matched,
  });
}
