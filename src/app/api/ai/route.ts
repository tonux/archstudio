import { NextResponse } from 'next/server';
import { MAX_UPLOAD_BYTES, acceptAttr } from '@/lib/ai/config';
import { providerInfo } from '@/lib/ai/providers';
import { publicAiSettings, resolveAiConfig } from '@/lib/settings';
import { requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Whether this install can analyse documents, and with what. The browser asks
 * on every mount and hides every entry point when the answer is no, so an
 * operator who has configured nothing never sees a button that would only tell
 * them off for pressing it. */
export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  const cfg = resolveAiConfig();
  const settings = publicAiSettings();
  const info = providerInfo(settings.provider);

  return NextResponse.json(
    {
      enabled: cfg !== null,
      provider: settings.provider,
      providerLabel: info.label,
      model: settings.model,
      supportsPdf: info.supportsPdf,
      /* A provider that cannot read a PDF should not offer to be given one. */
      accept: acceptAttr(info.supportsPdf),
      maxBytes: MAX_UPLOAD_BYTES,
      /* Null when no price is configured — the dialog then shows tokens only. */
      priced: settings.inputPrice !== undefined || settings.outputPrice !== undefined
    },
    /* Explicitly uncacheable. With no freshness header a browser is free to
     * reuse this answer, and it does — which leaves the buttons showing after
     * the provider is cleared, and hidden after one is configured, until a hard
     * reload. `dynamic = 'force-dynamic'` governs the server's own cache, not
     * the client's; this is the half that reaches the browser. */
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
