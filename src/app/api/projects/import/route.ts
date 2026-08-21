import { NextResponse } from 'next/server';
import { createProject } from '@/lib/store';
import type { Architecture } from '@/lib/types';
import { authorize } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Accepts either raw JSON, or the `window.ARCHITECTURE = {...}` data file used
 * by the standalone viewer — people paste both, so we take both.
 */
function parseDocument(text: string): Architecture {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);

  const match = trimmed.match(/window\s*\.\s*ARCHITECTURE\s*=\s*/);
  if (!match) throw new Error('Could not find a JSON object or a `window.ARCHITECTURE = …` assignment.');

  const body = trimmed.slice(match.index! + match[0].length).replace(/;\s*$/, '');
  /* The data file is JS, not JSON: it may use single quotes, trailing commas,
   * comments and string concatenation. Evaluating it in a Function with no
   * globals in scope is the pragmatic read — this is a self-hosted, single-user
   * tool importing a file the operator chose themselves. */
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const doc = new Function(`"use strict"; return (${body});`)();
  if (!doc || typeof doc !== 'object') throw new Error('The file did not evaluate to an object.');
  return doc as Architecture;
}

export async function POST(req: Request) {
  const denied = await authorize('write', { kind: 'workspace' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '');
  if (!text.trim()) return NextResponse.json({ error: 'Nothing to import.' }, { status: 400 });

  let doc: Architecture;
  try {
    doc = parseDocument(text);
  } catch (e) {
    return NextResponse.json({ error: `Could not parse the file: ${(e as Error).message}` }, { status: 400 });
  }

  const name = String(body.name || doc.meta?.name || 'Imported architecture').trim();
  const project = createProject({ name, folderId: body.folderId ?? null, data: doc });
  return NextResponse.json(project, { status: 201 });
}
