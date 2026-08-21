/* Three claims carry this exporter, and each of them fails silently.
 *
 *   1. A Serving relationship points provider → consumer, which is the *reverse*
 *      of `deps`. Get it wrong and the file opens perfectly and says the
 *      opposite of the diagram.
 *   2. Identifiers are stable across exports. Get it wrong and every re-export
 *      duplicates the model instead of updating it — which nobody notices until
 *      a month of someone's work is sitting next to a second copy of it.
 *   3. Text is escaped. Get it wrong and one ampersand in a role description
 *      makes the whole file unopenable.
 *
 * None of the three shows up by looking at the output, so they are asserted
 * directly rather than left to a golden file. The golden file is here too, for
 * everything else — it is what catches an accidental reordering of a schema
 * sequence, which is the other way this format breaks.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { normalizeArchitecture } from '../defaults';
import type { Architecture } from '../types';
import { buildArchimateXml } from './export';
import { archimateId } from './identity';
import { elementTypeOf } from './profile';

const PROJECT = 'p_test';

/** A document with everything the exporter reads: two scopes, two layers, a
 *  nested zone, an environment, a dependency with an annotation, a technology
 *  the stack table also names, and one component marked for removal. */
function doc(): Architecture {
  return normalizeArchitecture({
    meta: { name: 'Acme', lang: 'en', tagline: 'Two platforms, one login' },
    groups: [{ id: 'core', name: 'Core' }, { id: 'vendor', name: 'Vendors' }],
    layers: [{ id: 'edge', name: 'Edge' }, { id: 'data', name: 'Data' }],
    zones: [
      { id: 'net', name: 'Internal network', kind: 'network' },
      { id: 'ocp', name: 'OpenShift', kind: 'platform', parent: 'net' }
    ],
    environments: [{ id: 'prod', name: 'Production' }],
    technologies: [{ name: 'Postgres', category: 'Database' }],
    components: [
      {
        id: 'api', name: 'API', group: 'core', layer: 'edge', zone: 'ocp',
        role: 'Fronts everything', deployedOn: 'OpenShift', marks: ['sso'],
        tech: ['Postgres'], envs: [{ env: 'prod', url: 'api.acme.test' }],
        deps: ['db'],
        links: [{ to: 'db', kind: 'sync', protocol: 'SQL', note: 'read replica' }]
      },
      {
        id: 'db', name: 'Postgres', group: 'core', layer: 'data', zone: 'ocp',
        archimate: 'SystemSoftware', deps: []
      },
      { id: 'legacy', name: 'Legacy', group: 'vendor', layer: 'edge', state: 'removed', deps: [] }
    ]
  } as unknown as Architecture);
}

const xml = () => buildArchimateXml(doc(), { projectId: PROJECT });

/** The `xsi:type` and endpoints of every relationship in the output. */
function relationships(out: string) {
  return [...out.matchAll(/<relationship identifier="([^"]+)" source="([^"]+)" target="([^"]+)" xsi:type="([^"]+)"/g)]
    .map(m => ({ id: m[1], source: m[2], target: m[3], type: m[4] }));
}

const elementId = (id: string) => archimateId('component', PROJECT, id);

describe('direction', () => {
  test('a dependency becomes a Serving pointing callee → caller', () => {
    /* `api.deps = ['db']` — API calls Postgres, so Postgres *serves* API. */
    const serving = relationships(xml()).filter(r => r.type === 'Serving');
    assert.equal(serving.length, 1);
    assert.equal(serving[0].source, elementId('db'), 'source must be the callee');
    assert.equal(serving[0].target, elementId('api'), 'target must be the caller');
  });

  test('the view connection runs the same way as its relationship', () => {
    const out = xml();
    const serving = relationships(out).find(r => r.type === 'Serving')!;
    const conn = /<connection identifier="[^"]+" relationshipRef="([^"]+)" source="([^"]+)" target="([^"]+)"/.exec(out);
    assert.ok(conn, 'the view must carry the dependency');
    assert.equal(conn![1], serving.id);
    assert.equal(conn![2], archimateId('node', PROJECT, 'component', 'db'));
    assert.equal(conn![3], archimateId('node', PROJECT, 'component', 'api'));
  });

  test('a zone composes its members and its children, whole → part', () => {
    const comps = relationships(xml()).filter(r => r.type === 'Composition');
    const zone = (id: string) => archimateId('zone', PROJECT, id);

    assert.ok(comps.some(r => r.source === zone('net') && r.target === zone('ocp')),
      'the parent zone must compose the child zone');
    assert.ok(comps.some(r => r.source === zone('ocp') && r.target === elementId('api')),
      'the zone must compose its member');
    /* `api.zone` names only the innermost zone; the outer one is reached through
     * the zone-to-zone composition, never restated on the component. */
    assert.ok(!comps.some(r => r.source === zone('net') && r.target === elementId('api')),
      'ancestry must stay implied, not duplicated');
  });
});

describe('identity', () => {
  test('two exports of the same document are byte-identical', () => {
    assert.equal(xml(), xml());
  });

  test('renaming a component keeps its identifier', () => {
    const before = xml();
    const after = (() => {
      const d = doc();
      d.components[0].name = 'Gateway';
      return buildArchimateXml(d, { projectId: PROJECT });
    })();

    assert.ok(before.includes(elementId('api')));
    assert.ok(after.includes(elementId('api')), 'a rename must not move the identifier');
    assert.ok(after.includes('Gateway'));
  });

  test('a different project produces different identifiers', () => {
    const other = buildArchimateXml(doc(), { projectId: 'p_other' });
    assert.ok(!other.includes(elementId('api')),
      'two projects in one repository must not collide');
  });

  test('identifiers are valid xs:ID', () => {
    for (const [, id] of xml().matchAll(/identifier="([^"]+)"/g)) {
      assert.match(id, /^[A-Za-z_][\w.-]*$/, `${id} is not a valid xs:ID`);
    }
  });
});

describe('escaping', () => {
  test('markup in authored text cannot break the file', () => {
    const d = doc();
    d.meta.name = 'A & B <script>';
    d.components[0].role = 'Reads a > b & "quotes"';
    const out = buildArchimateXml(d, { projectId: PROJECT });

    assert.ok(out.includes('A &amp; B &lt;script&gt;'));
    assert.ok(out.includes('&gt; b &amp; &quot;quotes&quot;'));
    assert.ok(!/<script>/.test(out));
  });
});

describe('the model', () => {
  test('schema sequence order is respected', () => {
    const out = xml();
    const at = (tag: string) => out.indexOf(`<${tag}>`);
    /* name, documentation, elements, relationships, organizations,
     * propertyDefinitions, views — an xs:sequence, so an importer rejects any
     * other order. */
    const order = ['elements', 'relationships', 'organizations', 'propertyDefinitions', 'views']
      .map(t => at(t));
    assert.ok(order.every(i => i > 0), 'every section must be present in this fixture');
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.ok(out.indexOf('<name xml:lang') < order[0]);
  });

  test('the author\'s ArchiMate type wins, and the default is inferred otherwise', () => {
    const out = xml();
    assert.ok(out.includes(`<element identifier="${elementId('db')}" xsi:type="SystemSoftware">`),
      'the explicit type must be used');
    assert.ok(out.includes(`<element identifier="${elementId('api')}" xsi:type="ApplicationComponent">`),
      'an edge component defaults to an application component');
    /* The picker shows the same inference it would get with nothing set. */
    const api = doc().components[0];
    assert.equal(elementTypeOf({ ...api, archimate: undefined }), 'ApplicationComponent');
  });

  test('the stack table becomes elements, matched case-insensitively', () => {
    const out = xml();
    const tech = archimateId('technology', PROJECT, 'postgres');
    assert.ok(out.includes(`<element identifier="${tech}" xsi:type="SystemSoftware">`));
    assert.ok(relationships(out).some(
      r => r.type === 'Association' && r.source === elementId('api') && r.target === tech
    ));
  });

  test('a technology named by no component in the table gets no invented edge', () => {
    const d = doc();
    d.components[0].tech = ['Postgres 16'];  // close, but not the table's row
    const out = buildArchimateXml(d, { projectId: PROJECT });
    assert.ok(!relationships(out).some(r => r.type === 'Association'),
      'a near-miss must not produce a relationship');
    assert.ok(out.includes('Postgres 16'), 'but the fact stays, as a property');
  });

  test('the view is laid out, not heaped at the origin', () => {
    const nodes = [...xml().matchAll(/<node identifier="[^"]+" elementRef="[^"]+" xsi:type="Element" x="(\d+)" y="(\d+)" w="(\d+)" h="(\d+)"/g)];
    assert.ok(nodes.length >= 3, 'zones and components both get nodes');
    assert.ok(nodes.every(m => Number(m[3]) > 0 && Number(m[4]) > 0), 'every box has a size');
    assert.ok(new Set(nodes.map(m => `${m[1]},${m[2]}`)).size === nodes.length,
      'no two boxes share a position');
  });

  test('zones are painted before the components that sit on them', () => {
    const out = xml();
    const zoneNode = out.indexOf(archimateId('node', PROJECT, 'zone', 'ocp'));
    const compNode = out.indexOf(archimateId('node', PROJECT, 'component', 'api'));
    assert.ok(zoneNode > 0 && compNode > zoneNode, 'document order is paint order');
  });

  test('an empty document still produces a well-formed model', () => {
    const out = buildArchimateXml(normalizeArchitecture({} as Architecture), { projectId: PROJECT });
    assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(out.trimEnd().endsWith('</model>'));
    assert.ok(!out.includes('<elements>'), 'no elements section when there is nothing in it');
  });

  test('every referenced identifier is defined somewhere in the file', () => {
    const out = xml();
    const defined = new Set([...out.matchAll(/identifier="([^"]+)"/g)].map(m => m[1]));
    const props = new Set([...out.matchAll(/<propertyDefinition identifier="([^"]+)"/g)].map(m => m[1]));
    for (const attr of ['source', 'target', 'elementRef', 'relationshipRef', 'identifierRef']) {
      for (const [, id] of out.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))) {
        assert.ok(defined.has(id), `${attr}="${id}" points at nothing`);
      }
    }
    for (const [, id] of out.matchAll(/propertyDefinitionRef="([^"]+)"/g)) {
      assert.ok(props.has(id), `propertyDefinitionRef="${id}" has no definition`);
    }
  });
});
