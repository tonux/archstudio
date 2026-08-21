/* Which phase a project is in, and where a folder sits on the continuum.
 *
 * Split from `adm.ts` because that file is imported by the new-project dialog,
 * which runs in the browser. The boundary is not tidiness — it is what keeps
 * `node:sqlite` out of the client bundle.
 */
import { db, plain } from './db';
import {
  isAdmPhase, isContinuum, type AdmPhase, type Continuum
} from './adm';

export interface AdmPosition { phase: AdmPhase; iteration: string | null }

export function projectPhase(projectId: string): AdmPosition | null {
  const row = db.prepare('SELECT phase, iteration FROM project_adm WHERE project_id = ?')
    .get(projectId);
  if (!row) return null;
  const o = plain<{ phase: string; iteration: string | null }>(row);
  return isAdmPhase(o.phase) ? { phase: o.phase, iteration: o.iteration ?? null } : null;
}

export function setProjectPhase(
  projectId: string, phase: AdmPhase | null, iteration?: string | null
): void {
  if (!phase) {
    db.prepare('DELETE FROM project_adm WHERE project_id = ?').run(projectId);
    return;
  }
  db.prepare(
    `INSERT INTO project_adm (project_id, phase, iteration) VALUES (?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET phase = excluded.phase, iteration = excluded.iteration`
  ).run(projectId, phase, iteration?.trim() || null);
}

/* ------------------------------------------------- the enterprise continuum */

/** Where a folder sits on the Enterprise Continuum.
 *
 *  Folders already nest and already hold projects, so the continuum costs one
 *  side table rather than a hierarchy of its own — which is the whole reason it
 *  is worth having at all. */
export function folderContinuum(folderId: string): Continuum | null {
  const row = db.prepare('SELECT continuum FROM folder_kinds WHERE folder_id = ?').get(folderId);
  if (!row) return null;
  const value = plain<{ continuum: string }>(row).continuum;
  return isContinuum(value) ? value : null;
}

export function setFolderContinuum(folderId: string, continuum: Continuum | null): void {
  if (!continuum) {
    db.prepare('DELETE FROM folder_kinds WHERE folder_id = ?').run(folderId);
    return;
  }
  db.prepare(
    `INSERT INTO folder_kinds (folder_id, continuum) VALUES (?, ?)
     ON CONFLICT(folder_id) DO UPDATE SET continuum = excluded.continuum`
  ).run(folderId, continuum);
}
