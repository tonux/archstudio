/* The guard on the manual mirror.
 *
 * Every rule about a document exists twice: once in `src/lib`, and once by hand
 * in `viewer/engine.js`, which cannot import anything because it ships inside the
 * exported HTML. That duplication is the price of an export that opens offline
 * with no build step, and it is not going away — trying to unify the two would
 * mean putting a bundler in the export.
 *
 * What can go away is *forgetting*. A field added to `types.ts` and never
 * mirrored does not fail anything: it saves, it round-trips, and it is silently
 * missing from the file someone sends to a committee. So this test does not check
 * that the mirror is correct — no test can — it checks that every field has been
 * *classified*. Adding one to Architecture or Component fails here until it is
 * listed below, which forces the question at the only moment it is cheap to ask:
 * does the viewer need to know about this?
 *
 * When it fails, the fix is a one-line addition to one of the two sets — plus,
 * for a viewer-known field, the mirroring work in `viewer/engine.js` that the
 * addition is claiming to have done.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = dirname(fileURLToPath(import.meta.url));
const ROOT = join(LIB, '..', '..');

const TYPES = readFileSync(join(LIB, 'types.ts'), 'utf8');
/* Comments stripped before searching. A field named in a comment is not a field
 * the viewer reads, and treating the two the same makes the guard lie in both
 * directions: it would pass a key that is only *mentioned*, and fail a
 * server-only key that happens to share a word with some prose. `plan` is the
 * live example — engine.js says "trial plan" twice, about zone shelving. */
const ENGINE = readFileSync(join(ROOT, 'viewer', 'engine.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Fields the viewer reads, and that `viewer/engine.js` is therefore expected to
 *  mention. Anything drawn, listed, filtered on, or shown in the drawer. */
const VIEWER_KNOWN_KEYS = new Set([
  // Architecture
  'meta', 'theme', 'ui', 'groups', 'layers', 'zones', 'environments',
  'components', 'technologies', 'flows', 'sections',
  // Component
  'id', 'name', 'group', 'layer', 'zone', 'icon', 'badge', 'marks', 'tech',
  'deployedOn', 'url', 'envs', 'role', 'features', 'notes', 'deps', 'links',
  'state',
  /* The enterprise referential. The viewer *must* read both: the imprint is the
   * only way an exported file can name a capability offline, and dropping a
   * citation the imprint does not back up is a rule that has to hold in the
   * export as well as in the editor. Mirrored in `normalize()` and `eaBlock()`. */
  'imprint', 'ea'
]);

/** Fields the server uses and the viewer must never need.
 *
 *  A field belongs here when it carries identity or intent rather than something
 *  to draw — a catalog id, a mapping hint, a plan the projection resolves before
 *  the document is ever handed to the viewer. `normalize()` in engine.js is a
 *  `JSON.parse(JSON.stringify(raw))`, so an unknown key costs the export its
 *  bytes and nothing else. */
const SERVER_ONLY_KEYS = new Set([
  /* Lego catalog identity. `role` carries the same meaning in prose, and that is
   * what the drawer shows. */
  'brick',
  /* The ArchiMate element type. Changes nothing about how a box is drawn — it
   * exists so the model can leave for a tool that reasons in that vocabulary. */
  'archimate',
  /* The trajectory. `projectAt` turns a plateau into an ordinary document whose
   * `state` marks are already computed, and `state` is a field the viewer has
   * understood since the transition toggle existed — so the viewer never needs
   * to know that plateaus are a thing. That is the whole point of projecting
   * rather than extending: this phase costs the mirror nothing. */
  'plateaus', 'plan',
  /* The reasoning behind the architecture. A motivation section is resolved
   * into ordinary cards at export — its value is the traceability, which is a
   * list and not a picture — so the viewer never reads this either. */
  'motivation'
]);

/** Field names declared directly on an interface, by reading the source.
 *
 *  Types are erased at runtime and the fields that matter most here are the
 *  optional ones — absent from any sample document precisely when someone forgot
 *  them. So the declaration is the only honest input. */
function declaredKeys(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} {`);
  assert.notEqual(start, -1, `interface ${name} not found in types.ts`);

  const body = source.slice(source.indexOf('{', start) + 1);
  const keys: string[] = [];
  let depth = 0;

  for (const line of body.split('\n')) {
    /* Only the interface's own fields, never one nested inside an inline object
     * type. Counted before the match so a closing brace ends the interface. */
    depth += (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (depth - closes < 0) break;
    depth -= closes;

    if (depth === 0) {
      const m = /^\s*(\w+)\??\s*:/.exec(line);
      if (m) keys.push(m[1]);
    }
  }

  assert.ok(keys.length > 0, `no fields parsed from ${name}`);
  return keys;
}

/** Whether engine.js mentions a name at all. Weak on its own — `id` and `name`
 *  appear everywhere — but it is not weak in the case it exists for: a key
 *  declared viewer-known and never actually mirrored scores zero. */
const mentionedInEngine = (key: string) =>
  new RegExp(`\\b${key}\\b`).test(ENGINE);

describe('the viewer mirror', () => {
  for (const iface of ['Architecture', 'Component'] as const) {
    test(`every ${iface} field is classified`, () => {
      const unclassified = declaredKeys(TYPES, iface).filter(
        k => !VIEWER_KNOWN_KEYS.has(k) && !SERVER_ONLY_KEYS.has(k)
      );
      assert.deepEqual(
        unclassified, [],
        `Add each of these to VIEWER_KNOWN_KEYS or SERVER_ONLY_KEYS in this file. ` +
        `If it goes in VIEWER_KNOWN_KEYS, mirror it in viewer/engine.js first.`
      );
    });
  }

  test('every viewer-known field is mentioned in engine.js', () => {
    const missing = [...VIEWER_KNOWN_KEYS].filter(k => !mentionedInEngine(k));
    assert.deepEqual(
      missing, [],
      'declared as mirrored, but viewer/engine.js never names it'
    );
  });

  test('no server-only field leaks into engine.js', () => {
    const leaked = [...SERVER_ONLY_KEYS].filter(mentionedInEngine);
    assert.deepEqual(
      leaked, [],
      'engine.js reads a field the server was supposed to keep to itself — ' +
      'either it belongs in VIEWER_KNOWN_KEYS, or the viewer should not use it'
    );
  });

  test('the two sets do not overlap', () => {
    const both = [...VIEWER_KNOWN_KEYS].filter(k => SERVER_ONLY_KEYS.has(k));
    assert.deepEqual(both, []);
  });
});
