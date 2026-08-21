import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { blankArchitecture, blankManualFlow, deleteComponent, fillFlowDefaults, normalizeArchitecture, pruneUnusedLayersAndScopes } from './defaults';

test('blank architecture starts with empty layers and scopes', () => {
  const doc = blankArchitecture('Fresh');
  assert.deepEqual(doc.layers, []);
  assert.deepEqual(doc.groups, []);
  assert.equal(doc.ui.flowSpeedMs, 1500);
  assert.equal(doc.ui.flows?.title, 'Flows');
  assert.ok(doc.ui.flows?.subtitle);
  assert.equal(doc.ui.stack?.title, 'Tech stack');
  assert.ok(doc.ui.stack?.subtitle);
});

test('normalize fills missing flows and stack headings', () => {
  const doc = normalizeArchitecture({
    meta: { name: 'Legacy', lang: 'en', tagline: '', title: '', intro: '', facts: [] },
    ui: { defaultTheme: 'light', views: { overview: true, architecture: true, flows: true, stack: true } }
  });
  assert.equal(doc.ui.flowSpeedMs, 1500);
  assert.equal(doc.ui.flows?.title, 'Flows');
  assert.ok(doc.ui.flows?.subtitle);
  assert.equal(doc.ui.stack?.title, 'Tech stack');
  assert.ok(doc.ui.stack?.subtitle);
});

test('prune removes layers and scopes no component still uses', () => {
  const doc = blankArchitecture('Prune');
  doc.groups = [
    { id: 'product', name: 'Product' },
    { id: 'vendor', name: 'Vendor' }
  ];
  doc.layers = [
    { id: 'clients', name: 'Clients' },
    { id: 'edge', name: 'Edge' }
  ];
  doc.components = [
    { id: 'web', name: 'Web', group: 'product', layer: 'clients', deps: [] }
  ];
  pruneUnusedLayersAndScopes(doc);
  assert.deepEqual(doc.groups.map(g => g.id), ['product']);
  assert.deepEqual(doc.layers.map(l => l.id), ['clients']);
});

test('prune clears all structure when the last component is gone', () => {
  const doc = blankArchitecture('Empty');
  doc.groups = [{ id: 'product', name: 'Product' }];
  doc.layers = [{ id: 'clients', name: 'Clients' }];
  doc.components = [];
  pruneUnusedLayersAndScopes(doc);
  assert.deepEqual(doc.groups, []);
  assert.deepEqual(doc.layers, []);
});

test('normalize tolerates empty layers and scopes', () => {
  const doc = normalizeArchitecture({
    meta: { name: 'Bare' },
    groups: [],
    layers: [],
    components: []
  });
  assert.deepEqual(doc.groups, []);
  assert.deepEqual(doc.layers, []);
});

test('fillFlowDefaults fills subtitle, side note and step descriptions', () => {
  const filled = fillFlowDefaults({
    id: 'login', name: 'Login',
    steps: [{ component: 'web', title: 'Open' }]
  });
  assert.equal(filled.sub, 'Consumer · under an hour');
  assert.ok(filled.note);
  assert.equal(filled.steps[0].description, 'What this step does.');
});

test('fillFlowDefaults keeps authored copy', () => {
  const filled = fillFlowDefaults({
    id: 'login', name: 'Login',
    sub: 'Custom sub', note: 'Custom note',
    steps: [{ component: 'web', title: 'Open', description: 'Custom desc' }]
  });
  assert.equal(filled.sub, 'Custom sub');
  assert.equal(filled.note, 'Custom note');
  assert.equal(filled.steps[0].description, 'Custom desc');
});

test('normalize backfills flow copy on legacy documents', () => {
  const doc = normalizeArchitecture({
    meta: { name: 'Legacy', lang: 'en', tagline: '', title: '', intro: '', facts: [] },
    groups: [{ id: 'product', name: 'Product' }],
    layers: [{ id: 'clients', name: 'Clients' }],
    components: [{ id: 'web', name: 'Web', group: 'product', layer: 'clients', deps: [] }],
    flows: [{ id: 'login', name: 'Login', steps: [{ component: 'web', title: 'Open' }] }]
  });
  assert.equal(doc.flows[0].sub, 'Consumer · under an hour');
  assert.ok(doc.flows[0].note);
  assert.equal(doc.flows[0].steps[0].description, 'What this step does.');
});

test('fillFlowDefaults uses French copy when lang is fr', () => {
  const filled = fillFlowDefaults({
    id: 'login', name: 'Login',
    steps: [{ component: 'web', title: 'Open' }]
  }, 'fr');
  assert.equal(filled.sub, 'Consommateur · moins d’une heure');
  assert.match(filled.note || '', /étape/);
  assert.equal(filled.steps[0].description, 'Ce que fait cette étape.');
});

test('normalize does not force English copy onto French documents', () => {
  const doc = normalizeArchitecture({
    meta: { name: 'Héritage', lang: 'fr', tagline: '', title: '', intro: '', facts: [] },
    groups: [{ id: 'product', name: 'Produit' }],
    layers: [{ id: 'clients', name: 'Clients' }],
    components: [{ id: 'web', name: 'Web', group: 'product', layer: 'clients', deps: [] }],
    flows: [{ id: 'login', name: 'Connexion', steps: [{ component: 'web', title: 'Ouvrir' }] }]
  });
  assert.equal(doc.flows[0].sub, 'Consommateur · moins d’une heure');
  assert.equal(doc.flows[0].steps[0].description, 'Ce que fait cette étape.');
});

test('blank manual flow has no phantom step when the canvas is empty', () => {
  const flow = blankManualFlow(blankArchitecture('Empty'));
  assert.deepEqual(flow.steps, []);
});

test('prune drops unused scopes from technologies', () => {
  const doc = blankArchitecture('Stack');
  doc.groups = [
    { id: 'product', name: 'Product' },
    { id: 'vendor', name: 'Vendor' }
  ];
  doc.layers = [{ id: 'clients', name: 'Clients' }];
  doc.components = [
    { id: 'web', name: 'Web', group: 'product', layer: 'clients', deps: [] }
  ];
  doc.technologies = [
    { name: 'Auth0', groups: ['vendor', 'product'] }
  ];
  pruneUnusedLayersAndScopes(doc);
  assert.deepEqual(doc.technologies[0].groups, ['product']);
});

test('blank manual flow uses French titles on a French document', () => {
  const doc = blankArchitecture('Vide');
  doc.meta.lang = 'fr';
  const flow = blankManualFlow(doc);
  assert.equal(flow.name, 'Nouveau parcours');
  assert.deepEqual(flow.steps, []);
});

test('deleting a component keeps empty authored flows', () => {
  const doc = blankArchitecture('Keep');
  doc.groups = [{ id: 'product', name: 'Product' }];
  doc.layers = [{ id: 'clients', name: 'Clients' }];
  doc.components = [
    { id: 'web', name: 'Web', group: 'product', layer: 'clients', deps: ['auth'], links: [{ to: 'auth', protocol: 'OIDC' }] },
    { id: 'auth', name: 'Auth', group: 'product', layer: 'clients', deps: [] }
  ];
  doc.flows = [
    { id: 'draft', name: 'Draft', steps: [] },
    { id: 'login', name: 'Login', steps: [{ component: 'web', title: 'Open' }, { component: 'auth', title: 'Sign in' }] }
  ];
  deleteComponent(doc, 'auth');
  assert.equal(doc.flows.some(flow => flow.id === 'draft' && flow.steps.length === 0), true);
  assert.deepEqual(doc.flows.find(flow => flow.id === 'login')?.steps.map(step => step.component), ['web']);
  assert.equal(doc.components[0].links, undefined);
  assert.deepEqual(doc.components[0].deps, []);
});


test('backfills concernTags from brick on normalize', () => {
  const next = normalizeArchitecture({
    meta: { name: 'Legacy', lang: 'fr', tagline: '', title: '', intro: '', facts: [] },
    groups: [{ id: 'core', name: 'Core' }],
    layers: [{ id: 'edge', name: 'Edge' }],
    components: [{ id: 'auth', name: 'Auth0', group: 'core', layer: 'edge', brick: 'identity' }]
  });
  const auth = next.components[0];
  assert.ok(auth.concernTags?.includes('iam'));
  assert.ok(auth.purpose);
  assert.ok(next.sections.some(s => s.id === 'add-iam' && s.doc?.gated));
});
