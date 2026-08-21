import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject, duplicateProject } from '@/lib/store';
import { allowed, authorize, currentPrincipal } from '@/lib/auth/guard';
import { projectSubject } from '@/lib/auth/roles';
import { openProposal, openProposalFor, proposalData, saveProposal } from '@/lib/proposals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await authorize('read', projectSubject(id));
  if (denied) return denied;

  const p = getProject(id);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });

  /* Someone with a proposal open sees their own work, not the published
   * document. Anything else and their edits would appear to vanish on reload —
   * which is how people conclude the tool lost them. */
  const proposal = await mineOn(id);
  if (!proposal) return NextResponse.json(p);
  const data = proposalData(proposal.id);
  return NextResponse.json({ ...p, ...(data ? { data } : {}), proposal: proposal.id });
}

/** The proposal this person has open on a project, when they cannot write to
 *  it directly. Null whenever they can — an architect editing a project is
 *  editing the project. */
async function mineOn(projectId: string) {
  if (await allowed('write', projectSubject(projectId))) return null;
  const principal = await currentPrincipal();
  return principal ? openProposalFor(projectId, principal.id) : null;
}

/* The autosave path, and the one place governance is not a refusal.
 *
 * Someone who may write, writes. Someone who may only propose has the same
 * keystrokes routed into their proposal — silently, because the alternative is
 * a second editor, and a second editor is always the worse one. Someone who may
 * do neither gets a 403.
 *
 * The editor does not know which of the three happened. It sends a document and
 * gets one back. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const principal = (await currentPrincipal())?.id ?? null;
  const body = await req.json().catch(() => ({}));

  if (await allowed('write', projectSubject(id))) {
    /* `updateProject` may write a five-minute snapshot of the previous document
     * on the way through, and that snapshot belongs to whoever is typing now. */
    const updated = updateProject(id, body, principal);
    return updated
      ? NextResponse.json(updated)
      : NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const denied = await authorize('propose', projectSubject(id));
  if (denied) return denied;

  if (body.data === undefined) {
    /* Renaming a project, moving it between folders — the fields outside the
     * document. Those are not something a proposal can carry, so they are
     * refused rather than silently dropped. */
    return NextResponse.json(
      { error: 'You can propose changes to the architecture, but not rename the project.' },
      { status: 403 }
    );
  }

  const proposal = openProposalFor(id, principal!) ?? openProposal(id, principal);
  if (!proposal) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const data = saveProposal(proposal.id, body.data);
  if (!data) return NextResponse.json({ error: 'That proposal is closed.' }, { status: 409 });

  const project = getProject(id)!;
  return NextResponse.json({ ...project, data, proposal: proposal.id });
}

/** POST /api/projects/:id  → duplicate */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await authorize('write', projectSubject(id));
  if (denied) return denied;

  const copy = duplicateProject(id);
  return copy ? NextResponse.json(copy, { status: 201 }) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await authorize('write', projectSubject(id));
  if (denied) return denied;

  deleteProject(id);
  return NextResponse.json({ ok: true });
}
