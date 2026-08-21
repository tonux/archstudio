/* Identifiers that survive a re-export.
 *
 * This is the difference between a toy exporter and one an enterprise can use.
 * Someone exports a model, opens it in Archi, adds a viewpoint. A month later
 * the diagram has changed and they export again. If the identifiers moved, the
 * second file is a *second copy* of every element: Archi merges by identifier,
 * so a random or positional id turns "update my model" into "duplicate my
 * model", and the work in between is lost.
 *
 * So an identifier is a hash of what the thing *is* — the project it belongs to,
 * what kind of thing it is, and its own id inside the document — and nothing
 * about where it sits or when it was written. Rename a component and the
 * identifier holds. Reorder the sheet and it holds. Delete and recreate a
 * component with the same id and it holds, which is the correct reading: to the
 * document, that is the same component.
 */
import { createHash } from 'node:crypto';

/** Keeps hashes from colliding with any other product that hashes the same
 *  strings, and lets this be re-namespaced if the scheme ever has to change
 *  deliberately rather than by accident. */
const NAMESPACE = 'archstudio.archimate.v1';

/** A separator no id can contain, so `("a", "b-c")` and `("a-b", "c")` cannot
 *  hash to the same value. Ids the editor makes are slugs, but an imported
 *  document's are whatever it shipped with, so neither a dash nor a space is
 *  safe. The same reasoning — and the same character, written as an escape so
 *  the file stays plain ASCII — as the edge keys in `src/lib/diff.ts`. */
const SEP = '\u0000';

/** What an identifier can name. Part of the hash input, so a zone and a
 *  component that happen to share an id stay distinct. */
export type IdKind =
  | 'model'
  | 'component'
  | 'zone'
  | 'technology'
  | 'serving'
  | 'composition'
  | 'association'
  | 'view'
  | 'node'
  | 'connection'
  | 'property';

/** A stable `xs:ID`.
 *
 *  Prefixed with `id-` because `xs:ID` must begin with a letter or an underscore
 *  and a hex digest need not; 24 hex characters is 96 bits, which is far past
 *  any collision worth reasoning about for a document with hundreds of elements. */
export function archimateId(kind: IdKind, projectId: string, ...parts: string[]): string {
  const key = [NAMESPACE, kind, projectId, ...parts].join(SEP);
  return 'id-' + createHash('sha256').update(key).digest('hex').slice(0, 24);
}

/** Property definitions are shared across every element, so they are keyed on
 *  the property's own name and not on any one project — otherwise two projects
 *  opened in the same Archi model would each define their own "Deployed on". */
export const propertyId = (name: string): string =>
  'propid-' + createHash('sha256').update(NAMESPACE + SEP + name).digest('hex').slice(0, 16);
