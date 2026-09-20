import { NextResponse } from 'next/server';

import { authorize, currentPrincipal, requireApi } from '@/lib/auth/guard';
import { projectSubject } from '@/lib/auth/roles';
import { diffArchitecture } from '@/lib/diff';
import {
  getProposal, listProposals, mergeProposal, openProposal, proposalData,
  rejectProposal, reviewsOf, withdrawProposal, type ProposalStatus
} from '@/lib/proposals';
import { getProject, getRevisionData } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Proposals, and the verdicts on them.
 *
 * `?id=` returns one with its diff already computed — the reviewer's whole
 * question, answered in one request. The diff is `diffArchitecture` over the
 * base and the candidate, which is the same function the Versions panel has
 * always used; reviewing a change *is* comparing two documents. */

export async function GET(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (id) {
    const proposal = getProposal(id);
    if (!proposal) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const refused = await authorize('read', projectSubject(proposal.projectId));
    if (refused) return refused;

    const candidate = proposalData(id);
    /* Against the base, not against the project as it stands now. Comparing to
     * today would quietly attribute to the author every change anyone else made
     * in the meantime — which is the fastest way to make a review dishonest. */
    const base = proposal.baseRevisionId
      ? getRevisionData(proposal.projectId, proposal.baseRevisionId)
      : getProject(proposal.projectId)?.data ?? null;

    return NextResponse.json({
      proposal,
      diff: base && candidate ? diffArchitecture(base, candidate) : null,
      /* Whether the project has moved since the proposal was opened. A reviewer
       * approving a stale proposal would overwrite whatever happened in
       * between, and this is what lets the screen say so. */
      drift: base ? diffArchitecture(base, getProject(proposal.projectId)!.data).total : 0,
      reviews: reviewsOf(id)
    });
  }

  const status = (url.searchParams.get('status') ?? 'open') as ProposalStatus | 'all';
  return NextResponse.json({ proposals: listProposals(status) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = String(body.projectId ?? '');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const denied = await authorize('propose', projectSubject(projectId));
  if (denied) return denied;

  const principal = await currentPrincipal();
  const proposal = openProposal(projectId, principal?.id ?? null, body.title);
  return proposal
    ? NextResponse.json(proposal)
    : NextResponse.json({ error: 'not found' }, { status: 404 });
}

/** The verdict. `approve` and `reject` need `review`; `withdraw` is the author
 *  changing their mind and needs only that they are the author. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const verdict = String(body.verdict ?? '');

  const proposal = getProposal(id);
  if (!proposal) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const principal = await currentPrincipal();

  if (verdict === 'withdraw') {
    const mine = !principal || proposal.authorId === principal.id;
    if (!mine) {
      return NextResponse.json(
        { error: 'Only the author can withdraw a proposal.' }, { status: 403 });
    }
    return withdrawProposal(id, principal?.id ?? null)
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'That proposal is already closed.' }, { status: 409 });
  }

  const denied = await authorize('review', projectSubject(proposal.projectId));
  if (denied) return denied;

  if (verdict === 'approve') {
    const merged = mergeProposal(id, principal?.id ?? null, body.note);
    return merged
      ? NextResponse.json({ ok: true, ...merged })
      : NextResponse.json({ error: 'That proposal is already closed.' }, { status: 409 });
  }
  if (verdict === 'reject') {
    return rejectProposal(id, principal?.id ?? null, body.note)
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'That proposal is already closed.' }, { status: 409 });
  }

  return NextResponse.json(
    { error: 'Expected a verdict of approve, reject or withdraw.' }, { status: 400 });
}
