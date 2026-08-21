import { NextResponse } from 'next/server';

import { authorize } from '@/lib/auth/guard';
import {
  createEntity, deleteEntity, listEntities, updateEntity, usage
} from '@/lib/ea/repository';
import { isEntityKind } from '@/lib/ea/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The referential's entities.
 *
 * `?usage=<id>` answers the question the whole thing exists for — which
 * projects cite this entity, through which components. */
export async function GET(req: Request) {
  const denied = await authorize('read', { kind: 'referential' });
  if (denied) return denied;

  const url = new URL(req.url);
  const of = url.searchParams.get('usage');
  if (of) return NextResponse.json({ usage: usage(of) });

  const kind = url.searchParams.get('kind');
  return NextResponse.json({
    entities: listEntities(isEntityKind(kind) ? kind : undefined)
  });
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  if (!isEntityKind(body.kind)) {
    return NextResponse.json({ error: 'Unknown kind.' }, { status: 400 });
  }
  try {
    return NextResponse.json(createEntity({
      kind: body.kind,
      name: String(body.name ?? ''),
      code: body.code,
      parent: body.parent,
      status: body.status,
      description: body.description
    }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const updated = updateEntity(String(body.id), body);
    return updated
      ? NextResponse.json(updated)
      : NextResponse.json({ error: 'No such entity.' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/* Deleting does not rewrite the documents that cite this entity — the blob is
 * the truth and nothing here touches blobs. Each of them drops the citation on
 * its own next save, which is the only direction that does not mean rewriting
 * every document at once. The response says how many will be affected, so the
 * caller can warn rather than surprise. */
export async function DELETE(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get('id') ?? '';
  const affected = new Set(usage(id).map(u => u.projectId)).size;
  deleteEntity(id);
  return NextResponse.json({ ok: true, affectedProjects: affected });
}
