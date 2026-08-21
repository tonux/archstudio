import { NextResponse } from 'next/server';
import { PROVIDERS } from '@/lib/ai/providers';
import { publicAiSettings, saveAiSettings, type AiSettingsPatch } from '@/lib/settings';
import { requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** The configuration, minus the key — which never leaves the server. */
export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return NextResponse.json(
    { settings: publicAiSettings(), providers: PROVIDERS },
    noStore
  );
}

/** A number field the operator may legitimately want to clear. */
function price(raw: unknown): number | null | undefined {
  if (raw === null || raw === '') return null;
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function PUT(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const patch: AiSettingsPatch = {
    provider: body.provider,
    model: typeof body.model === 'string' ? body.model : undefined,
    baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
    /* Three states, and the difference matters: the field was left alone, the
     * operator typed a new key, or the operator asked for the stored one to be
     * forgotten. The browser never receives a key, so it cannot echo one back
     * — an absent field has to mean "keep what you have". */
    apiKey: body.clearKey ? null : typeof body.apiKey === 'string' && body.apiKey ? body.apiKey : undefined,
    inputPrice: price(body.inputPrice),
    outputPrice: price(body.outputPrice)
  };

  return NextResponse.json({ settings: saveAiSettings(patch) }, noStore);
}
