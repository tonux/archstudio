/* The capability map's layout — and nothing that touches a database.
 *
 * The one genuinely new layout this format has gained, and it is worth saying
 * why the others were not. An application landscape is the banded diagram with
 * the layers renamed; a value stream is the flows renderer; a
 * capability × application matrix is a table. Each of those cost nothing
 * because the renderer already existed. This one does not exist anywhere: a
 * capability map is a tree drawn as nested boxes, and nothing else in the
 * document is a tree drawn as nested boxes.
 *
 * It is laid out by **CSS from the tree alone** — no coordinates, no measuring
 * pass, no layout engine. That is the same constraint the banded diagram holds
 * to, and it is what lets the same markup work on screen, in the print
 * stylesheet, and inside the exported HTML.
 *
 * Pure on purpose: the printable document is a client component, and a helper
 * that reached for the referential would drag `node:sqlite` into the browser
 * bundle. Reading the tree lives in `src/lib/ea/capability-tree.ts`.
 */
import type { CapabilityNode } from '../types';

/** How deep a tree goes. The renderers use it to pick a column count, so a map
 *  of three L0s with no children does not draw as three enormous empty boxes. */
export function depthOf(nodes: CapabilityNode[]): number {
  let deepest = 0;
  const walk = (list: CapabilityNode[], depth: number) => {
    for (const n of list) {
      deepest = Math.max(deepest, depth);
      walk(n.children, depth + 1);
    }
  };
  walk(nodes, 1);
  return deepest;
}

/** How many columns to lay the roots out in.
 *
 *  Shared by every renderer so the map is the same shape on screen, on paper
 *  and in the exported file. Deliberately coarse: the point of a fixed rule is
 *  that the drawing does not move when a capability is renamed. */
export function columnsFor(nodes: CapabilityNode[]): number {
  if (nodes.length <= 2) return nodes.length || 1;
  /* Boxes with children need room; a flat list of leaves does not. */
  const wide = nodes.some(n => n.children.length > 3);
  if (wide) return 2;
  return nodes.length <= 6 ? 3 : 4;
}

/** Every box, flattened — for the print renderer's page-break hints and for
 *  counting in a test. */
export function flatten(nodes: CapabilityNode[]): CapabilityNode[] {
  return nodes.flatMap(n => [n, ...flatten(n.children)]);
}
