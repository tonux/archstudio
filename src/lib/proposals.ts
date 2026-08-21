/* A change somebody would like to make, waiting for an architect.
 *
 * The design decision that made this small: **a proposal is a whole document,
 * not a patch.** The reviewer's question is "what would this change", and this
 * app already answers that better than any patch format could — `diffArchitecture`
 * over two documents, in sentences, grouped by area. A patch would need a
 * second comparison engine and a merge algorithm, and would still have to be
 * turned back into two documents to be read.
 *
 * The second decision: **the editor is the proposal editor.** A contributor who
 * cannot write to a project has their edits routed into their open proposal
 * instead, transparently. Nothing in the canvas, the inspector or the autosave
 * knows this is happening. Building a separate "propose a change" surface would
 * have meant a second, worse editor.
 */
import { db, plain, plainAll, transaction, uid, now } from './db';
import { normalizeArchitecture } from './defaults';
import { hydrateImprint } from './ea/hydrate';
import { createRevision, freezeVersion, getProject, updateProject } from './store';
import type { Architecture } from './types';

export type ProposalStatus = 'open' | 'merged' | 'rejected' | 'withdrawn';

export interface ProposalRecord {
  id: string;
  projectId: string;
  projectName: string;
  authorId: string | null;
  authorName: string | null;
  title: string | null;
  status: ProposalStatus;
  baseRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
}

const SELECT = `
  SELECT pr.id, pr.project_id, pr.author_id, pr.title, pr.status,
         pr.base_revision_id, pr.created_at, pr.updated_at,
         p.name AS project_name, a.name AS author_name
  FROM proposals pr
  JOIN projects p ON p.id = pr.project_id
  LEFT JOIN principals a ON a.id = pr.author_id`;

const toRecord = (o: Record<string, unknown>): ProposalRecord => ({
  id: o.id as string,
  projectId: o.project_id as string,
  projectName: o.project_name as string,
  authorId: (o.author_id ?? null) as string | null,
  authorName: (o.author_name ?? null) as string | null,
  title: (o.title ?? null) as string | null,
  status: o.status as ProposalStatus,
  baseRevisionId: (o.base_revision_id ?? null) as string | null,
  createdAt: o.created_at as string,
  updatedAt: o.updated_at as string
});

/* ------------------------------------------------------------- reading */

export function getProposal(id: string): ProposalRecord | null {
  const row = db.prepare(`${SELECT} WHERE pr.id = ?`).get(id);
  return row ? toRecord(plain(row)) : null;
}

export function proposalData(id: string): Architecture | null {
  const row = db.prepare('SELECT data FROM proposals WHERE id = ?').get(id) as
    { data?: string } | undefined;
  return row?.data ? normalizeArchitecture(JSON.parse(row.data)) : null;
}

export function listProposals(status: ProposalStatus | 'all' = 'open'): ProposalRecord[] {
  const rows = status === 'all'
    ? db.prepare(`${SELECT} ORDER BY pr.updated_at DESC`).all()
    : db.prepare(`${SELECT} WHERE pr.status = ? ORDER BY pr.updated_at DESC`).all(status);
  return plainAll<Record<string, unknown>>(rows).map(toRecord);
}

/** The one this person has open on this project, if any. */
export function openProposalFor(projectId: string, authorId: string): ProposalRecord | null {
  const row = db.prepare(
    `${SELECT} WHERE pr.project_id = ? AND pr.author_id = ? AND pr.status = 'open'
     ORDER BY pr.updated_at DESC LIMIT 1`
  ).get(projectId, authorId);
  return row ? toRecord(plain(row)) : null;
}

/* ------------------------------------------------------------- writing */

/** Open a proposal on a project, seeded with what it looks like now.
 *
 *  A snapshot of the published document is taken first and recorded as the
 *  base. Without it the reviewer would be shown the difference between the
 *  proposal and *today's* project, which quietly attributes to the author every
 *  change anyone else made in the meantime. */
export function openProposal(
  projectId: string, authorId: string | null, title?: string
): ProposalRecord | null {
  const project = getProject(projectId);
  if (!project) return null;

  if (authorId) {
    const existing = openProposalFor(projectId, authorId);
    if (existing) return existing;
  }

  const base = createRevision(projectId, 'Before a proposal', authorId);
  const id = uid('pp_');
  db.prepare(
    `INSERT INTO proposals (id, project_id, author_id, base_revision_id, data, title)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, projectId, authorId, base?.id ?? null,
        JSON.stringify(project.data), title?.trim() || null);

  return getProposal(id);
}

/** Save into a proposal. The same hydrate-then-normalise order as
 *  `updateProject`, for the same reason: normalising first would drop every
 *  referential citation a moment before hydration could back it up. */
export function saveProposal(id: string, data: Architecture): Architecture | null {
  const stored = normalizeArchitecture(hydrateImprint(data));
  const result = db.prepare(
    "UPDATE proposals SET data = ?, updated_at = ? WHERE id = ? AND status = 'open'"
  ).run(JSON.stringify(stored), now(), id);
  return result.changes ? stored : null;
}

export function retitleProposal(id: string, title: string): ProposalRecord | null {
  db.prepare('UPDATE proposals SET title = ?, updated_at = ? WHERE id = ?')
    .run(title.trim() || null, now(), id);
  return getProposal(id);
}

/** Approve it: the proposal's document becomes the project's, and the moment is
 *  frozen as a version signed by whoever approved it.
 *
 *  Approving *is* `updateProject` followed by `freezeVersion` — the two
 *  operations the app already had. What governance adds is who was allowed to
 *  call them, not a third way of writing a document. */
export function mergeProposal(
  id: string, reviewerId: string | null, note?: string
): { project: string; version: string } | null {
  const proposal = getProposal(id);
  if (!proposal || proposal.status !== 'open') return null;
  const data = proposalData(id);
  if (!data) return null;

  const label = proposal.title?.trim()
    || `Proposal by ${proposal.authorName ?? 'someone'}`;

  /* All four writes or none. `updateProject` opens a transaction of its own,
   * which is exactly why `transaction` counts depth rather than nesting. */
  transaction(() => {
    updateProject(proposal.projectId, { data }, reviewerId);
    /* An empty version number means "do not renumber": approving a proposal is
     * a publication, and whether it deserves a new number is a judgement the
     * approver makes in the Versions panel, not something to invent here. */
    freezeVersion(proposal.projectId, '', label, reviewerId);
    record(id, reviewerId, 'approved', note);
    db.prepare("UPDATE proposals SET status = 'merged', updated_at = ? WHERE id = ?")
      .run(now(), id);
  });

  return { project: proposal.projectId, version: label };
}

export function rejectProposal(id: string, reviewerId: string | null, note?: string): boolean {
  const result = db.prepare(
    "UPDATE proposals SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'open'"
  ).run(now(), id);
  if (!result.changes) return false;
  record(id, reviewerId, 'rejected', note);
  return true;
}

/** The author changing their mind. Distinct from a rejection because the two
 *  are different facts about the same document, and a list that conflated them
 *  would misrepresent both people. */
export function withdrawProposal(id: string, authorId: string | null): boolean {
  const result = db.prepare(
    "UPDATE proposals SET status = 'withdrawn', updated_at = ? WHERE id = ? AND status = 'open'"
  ).run(now(), id);
  if (!result.changes) return false;
  record(id, authorId, 'withdrawn');
  return true;
}

function record(proposalId: string, reviewerId: string | null, verdict: string, note?: string): void {
  db.prepare(
    'INSERT INTO proposal_reviews (id, proposal_id, reviewer_id, verdict, note) VALUES (?, ?, ?, ?, ?)'
  ).run(uid('rv_'), proposalId, reviewerId, verdict, note?.trim() || null);
}

export interface ReviewRecord {
  verdict: string;
  note: string | null;
  at: string;
  who: string | null;
}

export function reviewsOf(proposalId: string): ReviewRecord[] {
  const rows = db.prepare(`
    SELECT r.verdict, r.note, r.created_at, p.name AS who
    FROM proposal_reviews r LEFT JOIN principals p ON p.id = r.reviewer_id
    WHERE r.proposal_id = ? ORDER BY r.created_at
  `).all(proposalId);
  return plainAll<Record<string, unknown>>(rows).map(o => ({
    verdict: o.verdict as string,
    note: (o.note ?? null) as string | null,
    at: o.created_at as string,
    who: (o.who ?? null) as string | null
  }));
}
