import { NextResponse } from 'next/server';
import { MAX_UPLOAD_BYTES } from '@/lib/ai/config';
import { analyse, estimate, type Source, type SourceKind } from '@/lib/ai/analyze';
import { toArchitecture } from '@/lib/ai/convert';
import { providerInfo } from '@/lib/ai/providers';
import { resolveAiConfig } from '@/lib/settings';
import { getProject } from '@/lib/store';
import { requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The only route that reaches the network. It reads a file and a project, and
 * returns a *proposal* — it writes nothing. Applying the result is an ordinary
 * create or update through the routes that already existed, which is what
 * keeps the model's output on exactly the same footing as a hand-typed import:
 * normalised on the way in, snapshotted in History, undoable. */

const KINDS: SourceKind[] = ['pdf', 'text'];

/** base64 inflates by 4/3; the guard is on what was actually uploaded. */
const decodedSize = (kind: SourceKind, data: string): number =>
  kind === 'pdf' ? Math.floor((data.length * 3) / 4) : Buffer.byteLength(data, 'utf8');

export async function POST(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const cfg = resolveAiConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'No model is configured. Open Settings and choose a provider.' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const kind = body.kind as SourceKind;
  const data = String(body.data || '');
  const filename = String(body.filename || 'document');

  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
  if (kind === 'pdf' && !providerInfo(cfg.provider).supportsPdf) {
    return NextResponse.json(
      { error: `${providerInfo(cfg.provider).label} is set up for text documents here. Convert the PDF to Markdown or plain text, or switch provider in Settings.` },
      { status: 400 }
    );
  }
  if (!data) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });
  if (decodedSize(kind, data) > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `That file is over the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.` },
      { status: 413 }
    );
  }

  /* An enrichment is scoped to one project: the model is shown that project's
   * inventory and nothing else in the workspace. */
  let existing = null;
  if (body.projectId) {
    const project = getProject(String(body.projectId));
    if (!project) return NextResponse.json({ error: 'Unknown project.' }, { status: 404 });
    existing = project.data;
  }

  const source: Source = { kind, filename, data };

  try {
    if (body.estimate) {
      return NextResponse.json(await estimate(cfg, source, existing));
    }

    const { analysis, usage, reduced } = await analyse(cfg, source, existing);
    const { document, repairs } = toArchitecture(analysis.document);

    return NextResponse.json({
      document,
      repairs,
      assumptions: analysis.assumptions ?? [],
      questions: analysis.questions ?? [],
      reduced,
      usage
    });
  } catch (e) {
    /* The upstream message is the useful one — an invalid schema, a rate limit
     * and a bad key each say so precisely, and hiding that behind "analysis
     * failed" would leave the operator with nothing to act on. */
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json({ error: err.message || 'The analysis failed.' }, { status });
  }
}
