import { NextResponse } from 'next/server';
import { adapterFor, foreignKeyOwner, providerInfo } from '@/lib/ai/providers';
import { candidateAiConfig } from '@/lib/settings';
import { requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Trying the settings out before committing to them.
 *
 * Two actions, one route, because both answer the same question from different
 * distances: *will this configuration work?* `models` asks the provider what it
 * can serve; `test` runs an actual schema-constrained completion — the only
 * thing that proves the model will honour the contract the analysis depends on.
 * A provider that lists a hundred models and refuses `json_schema` on all of
 * them passes the first and fails the second, and it is much better to learn
 * that here than after uploading a 40-page document. */

/** The smallest possible instance of what the analysis does. */
const PING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: { ok: { type: 'string', enum: ['yes'] } }
};

export async function POST(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const cfg = candidateAiConfig(body);

  if (!cfg) {
    return NextResponse.json(
      { error: 'Choose a provider and give it a key first.' }, { status: 400 }
    );
  }

  try {
    if (body.action === 'models') {
      return NextResponse.json({ models: await adapterFor(cfg).listModels(cfg) });
    }

    if (!cfg.model) {
      return NextResponse.json({ error: 'Choose a model first.' }, { status: 400 });
    }

    const started = Date.now();
    const result = await adapterFor(cfg).complete(cfg, {
      system: 'You answer with the JSON object you are given a schema for. Nothing else.',
      parts: [{ kind: 'text', text: 'Reply with ok: yes.' }],
      schema: PING_SCHEMA,
      /* Generous for a one-word answer: on a model that thinks before it
       * writes, this budget covers the thinking too, and a truncated ping
       * would read as a failure of the provider rather than of the budget. */
      maxTokens: 2_000
    });

    const value = (result.json as { ok?: string } | null)?.ok;
    if (value !== 'yes') {
      return NextResponse.json(
        { error: `${providerInfo(cfg.provider).label} answered, but not under the schema it was given. This model probably does not support JSON-schema output.` },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      model: cfg.model,
      ms: Date.now() - started,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens
    });
  } catch (e) {
    /* The provider's own message is the useful one — a bad key, an unknown
     * model and an unsupported response format each say so precisely. */
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502;

    /* Except for one case it cannot know about: a key that belongs to another
     * vendor. "invalid x-api-key" names neither the key you pasted nor the
     * service that refused it, and the reader is left checking a perfectly
     * good key for typos. Say what it looks like instead. */
    const foreign = foreignKeyOwner(cfg.provider, cfg.apiKey);
    const hint = foreign
      ? `That key belongs to ${foreign.label} (${foreign.keyPrefixes?.[0]}…), not ${providerInfo(cfg.provider).label}`
        + `${foreign.envKey ? ` — put it in ${foreign.envKey}, or select ${foreign.label} above` : ''}.`
      : '';

    /* Two sentences from two places; the provider's rarely ends in a full stop. */
    const said = err.message || 'The provider could not be reached.';
    const message = hint ? `${said.replace(/[.\s]*$/, '')}. ${hint}` : said;

    return NextResponse.json({ error: message }, { status });
  }
}
