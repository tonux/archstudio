import { NextResponse } from 'next/server';

import { authorize } from '@/lib/auth/guard';
import {
  createRelation, deleteRelation, listRelations, listResolvedRelations
} from '@/lib/ea/repository';
import { isRelationKind } from '@/lib/ea/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = await authorize('read', { kind: 'referential' });
  if (denied) return denied;

  const url = new URL(req.url);
  const of = url.searchParams.get('entity') ?? undefined;
  /* Both ends named, for anything that draws a neighbourhood. The bare form
   * stays the default so nothing that reads ids pays for the two joins. */
  return NextResponse.json({
    relations: url.searchParams.get('resolved') === '1'
      ? listResolvedRelations(of)
      : listRelations(of)
  });
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  if (!isRelationKind(body.kind)) {
    return NextResponse.json({ error: 'Unknown relationship.' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      createRelation(body.kind, String(body.from ?? ''), String(body.to ?? ''), body.note)
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  deleteRelation(new URL(req.url).searchParams.get('id') ?? '');
  return NextResponse.json({ ok: true });
}
