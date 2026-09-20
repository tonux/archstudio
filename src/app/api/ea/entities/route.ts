import { NextResponse } from 'next/server';

import { authorize } from '@/lib/auth/guard';
import {
  createEntity, deleteEntity, entity, listEntities, listResolvedRelations,
  updateEntity, usage
} from '@/lib/ea/repository';
import { isEntityKind } from '@/lib/ea/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The referential's entities.
 *
 * `?usage=<id>` answers the question the whole thing exists for — which
 * projects cite this entity, through which components.
 *
 * `?entity=<id>` is the other half: one row with everything a listing leaves
 * out — its free attributes, its relationships with both ends named, and the
 * projects citing it. One request rather than three, because they are always
 * read together and a detail panel that paints in three stages reads as broken. */
export async function GET(req: Request) {
  const denied = await authorize('read', { kind: 'referential' });
  if (denied) return denied;

  const url = new URL(req.url);
  const of = url.searchParams.get('usage');
  if (of) return NextResponse.json({ usage: usage(of) });

  const one = url.searchParams.get('entity');
  if (one) {
    const found = entity(one);
    if (!found) return NextResponse.json({ error: 'No such entity.' }, { status: 404 });
    return NextResponse.json({
      entity: found,
      relations: listResolvedRelations(one),
      usage: usage(one)
    });
  }

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
      lifecycle: body.lifecycle,
      criticality: body.criticality,
      description: body.description,
      source: body.source,
      externalId: body.externalId,
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      props: body.props
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
