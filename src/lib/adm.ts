/* The ADM's vocabulary — and nothing that touches a database.
 *
 * Pure on purpose: the new-project dialog is a client component and offers this
 * list, and a helper that reached for SQLite here would drag `node:sqlite` into
 * the browser bundle. Storage lives in `src/lib/adm-store.ts`.
 *
 * Where a piece of work sits in the cycle the organisation already runs.
 *
 * The point of this is not to teach anyone TOGAF. It is that an architect who
 * is *in* phase B has a list of deliverables they are expected to produce, and
 * a tool that made them assemble that list by hand is a tool they will use for
 * the drawing and abandon for the document.
 *
 * So: a project can say which phase it is in, and that decides which outline it
 * is offered. Nothing more — no gates, no workflow, no state machine. The ADM
 * is a cycle organisations run in their own way, and an app that enforced a
 * particular way of running it would be wrong everywhere.
 */

export type AdmPhase = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const ADM_PHASES: AdmPhase[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const ADM_LABELS: Record<AdmPhase, string> = {
  A: 'A · Architecture Vision',
  B: 'B · Business Architecture',
  C: 'C · Information Systems',
  D: 'D · Technology Architecture',
  E: 'E · Opportunities & Solutions',
  F: 'F · Migration Planning',
  G: 'G · Implementation Governance',
  H: 'H · Change Management'
};

export const ADM_BLURBS: Record<AdmPhase, string> = {
  A: 'What this is for, who cares, and what "done" looks like.',
  B: 'What the business does — capabilities, actors, the processes that matter.',
  C: 'Applications and the data they hold.',
  D: 'What it runs on.',
  E: 'Which of the gaps are worth closing, and roughly how.',
  F: 'The plateaus, in order, with what changes at each.',
  G: 'Making sure what is built is what was agreed.',
  H: 'What has changed since, and whether the architecture still holds.'
};

/** Which chapters an outline offers for each phase.
 *
 *  A project in phase B is not *only* about business architecture — it still
 *  needs the vision it came from — so each phase offers its own chapters plus
 *  everything before it. Architecture is cumulative and a document that dropped
 *  phase A when it reached B would be a document with no reason in it. */
export const PHASES_UP_TO = (phase: AdmPhase): AdmPhase[] =>
  ADM_PHASES.slice(0, ADM_PHASES.indexOf(phase) + 1);

export const isAdmPhase = (v: unknown): v is AdmPhase =>
  typeof v === 'string' && (ADM_PHASES as string[]).includes(v);

/* ------------------------------------------------- the enterprise continuum */

/** Where a folder sits on the Enterprise Continuum.
 *
 *  Folders already nest and already hold projects, so the continuum costs one
 *  side table rather than a hierarchy of its own — which is the whole reason it
 *  is worth having at all. */
export type Continuum = 'foundation' | 'common' | 'industry' | 'organisation';

export const CONTINUUM: Continuum[] = ['foundation', 'common', 'industry', 'organisation'];

export const CONTINUUM_LABELS: Record<Continuum, string> = {
  foundation: 'Foundation',
  common: 'Common systems',
  industry: 'Industry',
  organisation: 'Organisation-specific'
};

export const CONTINUUM_BLURBS: Record<Continuum, string> = {
  foundation: 'Generic, reusable anywhere — the patterns and the reference material.',
  common: 'Used across this organisation, not specific to any part of it.',
  industry: 'Specific to the sector: what a bank or a hospital has and others do not.',
  organisation: 'Yours alone. Most of what a team draws lives here.'
};

export const isContinuum = (v: unknown): v is Continuum =>
  typeof v === 'string' && (CONTINUUM as string[]).includes(v);
