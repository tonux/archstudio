import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { blankArchitecture } from '../defaults';
import { buildCatalogSnapshot } from '../lego/seed-data';
import { buildOutline } from './plan';
import {
  aggregateConcerns,
  componentDescription,
  deriveGates
} from './concerns';

test('aggregateConcerns unions tags from placed components', () => {
  const doc = blankArchitecture('Test');
  doc.components = [
    { id: 'auth', name: 'Auth', group: 'core', layer: 'edge', concernTags: ['iam', 'security'] },
    { id: 'db', name: 'DB', group: 'core', layer: 'data', concernTags: ['data', 'dr'] }
  ];
  const concerns = aggregateConcerns(doc);
  assert.ok(concerns.has('iam'));
  assert.ok(concerns.has('data'));
  assert.equal(concerns.has('network'), false);
});

test('deriveGates maps iam to add-iam', () => {
  const gates = deriveGates(new Set(['iam']));
  assert.ok(gates.has('add-iam'));
  assert.equal(gates.has('add-data'), false);
});

test('deriveGates returns empty when no component tags', () => {
  assert.equal(deriveGates(new Set()).size, 0);
  assert.equal(deriveGates(aggregateConcerns(blankArchitecture('Test'))).size, 0);
});

test('buildOutline includes add-iam when identity brick placed with iam tag', () => {
  const doc = blankArchitecture('Test');
  doc.groups = [{ id: 'core', name: 'Core' }];
  doc.layers = [{ id: 'edge', name: 'Edge' }];
  doc.components = [{
    id: 'auth',
    name: 'Auth0',
    group: 'core',
    layer: 'edge',
    brick: 'identity',
    concernTags: ['iam', 'security'],
    purpose: 'Proves who callers are and issues tokens other services trust.'
  }];
  const sectionIds = buildOutline(doc).parts.flatMap(p => p.entries.flatMap(e =>
    e.body.kind === 'section' ? [e.body.section.id] : []
  ));
  assert.ok(sectionIds.includes('add-iam'));
});

test('buildOutline omits CAF preset when no components placed', () => {
  const doc = blankArchitecture('Test');
  doc.meta.intro = 'An introduction.';
  const sectionIds = buildOutline(doc).parts.flatMap(p => p.entries.flatMap(e =>
    e.body.kind === 'section' ? [e.body.section.id] : []
  ));
  assert.equal(sectionIds.some(id => id.startsWith('add-')), false);
});

test('identity seed brick exposes iam and security concern tags', () => {
  const brick = buildCatalogSnapshot('en').bricks.identity;
  assert.ok(brick.purpose?.length);
  assert.ok(brick.concernTags?.includes('iam'));
  assert.ok(brick.concernTags?.includes('security'));
});

test('Context prefers component purpose over role', () => {
  assert.equal(
    componentDescription({ purpose: 'Catalog purpose text', role: 'Generic role' }),
    'Catalog purpose text'
  );
  assert.equal(componentDescription({ role: 'Generic role' }), 'Generic role');
});

test('hydrated add-iam has no TODO placeholders', async () => {
  const { hydratePresetSection, TODO } = await import('./hydrate');
  const { presetSectionForId } = await import('./preset');
  const doc = blankArchitecture('Test');
  doc.meta.lang = 'fr';
  doc.components = [{
    id: 'auth',
    name: 'Auth0',
    group: 'core',
    layer: 'edge',
    brick: 'identity',
    concernTags: ['iam', 'security'],
    purpose: 'Prouve qui sont les appelants et émet des jetons que d’autres services font confiance.',
    features: ['Prouver qui est l’appelant (connexion, jetons)'],
    notes: ['Durée des jetons, MFA et révocation de session restent des décisions produit.'],
    tech: ['OIDC', 'JWT', 'Auth0']
  }];
  const hydrated = hydratePresetSection(presetSectionForId('add-iam', 'fr')!, doc, 'fr');
  const json = JSON.stringify(hydrated);
  assert.equal(json.includes(TODO), false);
  assert.ok(json.includes('Auth0'));
  assert.ok(json.includes('Composants concernés'));
});

test('syncGatedPresetSections adds hydrated add-iam when identity brick placed', async () => {
  const { syncGatedPresetSections } = await import('./preset');
  const { TODO } = await import('./hydrate');
  const doc = blankArchitecture('Test');
  doc.meta.lang = 'fr';
  doc.components = [{
    id: 'auth', name: 'Auth0', group: 'core', layer: 'edge', brick: 'identity',
    concernTags: ['iam', 'security'],
    purpose: 'Prouve qui sont les appelants.',
    features: ['Prouver qui est l’appelant'],
    tech: ['OIDC', 'JWT']
  }];
  const result = syncGatedPresetSections(doc);
  assert.deepEqual(result.added, ['add-iam']);
  const section = doc.sections.find(s => s.id === 'add-iam');
  assert.ok(section?.doc?.gated);
  assert.equal(JSON.stringify(section).includes(TODO), false);
});

test('syncGatedPresetSections removes gated section when last opener deleted', async () => {
  const { syncGatedPresetSections } = await import('./preset');
  const { deleteComponent } = await import('../defaults');
  const doc = blankArchitecture('Test');
  doc.components = [{
    id: 'auth', name: 'Auth0', group: 'core', layer: 'edge',
    concernTags: ['iam'], purpose: 'Auth'
  }];
  syncGatedPresetSections(doc);
  assert.ok(doc.sections.some(s => s.id === 'add-iam'));
  deleteComponent(doc, 'auth');
  assert.equal(doc.sections.some(s => s.id === 'add-iam'), false);
});

test('syncGatedPresetSections re-hydrates when a second opener is added', async () => {
  const { syncGatedPresetSections } = await import('./preset');
  const doc = blankArchitecture('Test');
  doc.meta.lang = 'fr';
  doc.components = [{
    id: 'auth', name: 'Auth0', group: 'core', layer: 'edge', brick: 'identity',
    concernTags: ['iam'], purpose: 'Auth0', tech: ['OIDC']
  }];
  syncGatedPresetSections(doc);
  doc.components.push({
    id: 'cog', name: 'Cognito', group: 'core', layer: 'edge', brick: 'identity',
    concernTags: ['iam'], purpose: 'Cognito', tech: ['JWT']
  });
  const result = syncGatedPresetSections(doc);
  assert.deepEqual(result.updated, ['add-iam']);
  const json = JSON.stringify(doc.sections.find(s => s.id === 'add-iam'));
  assert.ok(json.includes('Auth0'));
  assert.ok(json.includes('Cognito'));
});

test('syncGatedPresetSections drops removed opener from gated section text', async () => {
  const { syncGatedPresetSections } = await import('./preset');
  const { deleteComponent } = await import('../defaults');
  const doc = blankArchitecture('Test');
  doc.components = [
    { id: 'auth', name: 'Auth0', group: 'core', layer: 'edge', concernTags: ['iam'], purpose: 'Auth0' },
    { id: 'cog', name: 'Cognito', group: 'core', layer: 'edge', concernTags: ['iam'], purpose: 'Cognito' }
  ];
  syncGatedPresetSections(doc);
  deleteComponent(doc, 'cog');
  const json = JSON.stringify(doc.sections.find(s => s.id === 'add-iam'));
  assert.ok(json.includes('Auth0'));
  assert.equal(json.includes('Cognito'), false);
});


test('deriveGates ignores unknown concern tags', () => {
  const gates = deriveGates(['iam', 'bogus', '__proto__'] as unknown as import('./concerns').ConcernTag[]);
  assert.ok(gates.has('add-iam'));
  assert.equal(gates.has('bogus'), false);
});

test('gated compare and timeline chapters persist without TODO', async () => {
  const { syncGatedPresetSections } = await import('./preset');
  const { TODO } = await import('./hydrate');
  const doc = blankArchitecture('Test');
  doc.components = [{
    id: 'k8s', name: 'EKS', group: 'core', layer: 'services', brick: 'kubernetes',
    concernTags: ['ops', 'tenancy'], purpose: 'Orchestrates containers'
  }];
  syncGatedPresetSections(doc);
  const ids = doc.sections.map(s => s.id);
  assert.ok(ids.includes('add-tenancy'));
  assert.ok(ids.includes('add-scale'));
  assert.ok(ids.includes('add-cicd'));
  for (const section of doc.sections) {
    assert.equal(JSON.stringify(section).includes(TODO), false, section.id);
  }
});

test('normalizeArchitecture does not clobber edited gated section', async () => {
  const { syncGatedPresetSections } = await import('./preset');
  const { normalizeArchitecture } = await import('../defaults');
  const doc = blankArchitecture('Test');
  doc.components = [{
    id: 'auth', name: 'Auth0', group: 'core', layer: 'edge',
    concernTags: ['iam'], purpose: 'Auth0'
  }];
  syncGatedPresetSections(doc);
  const iam = doc.sections.find(s => s.id === 'add-iam')!;
  iam.title = 'Edited by hand';
  const next = normalizeArchitecture(doc);
  assert.equal(next.sections.find(s => s.id === 'add-iam')!.title, 'Edited by hand');
});


test('adopts a manual preset chapter still full of TODO when the gate opens', async () => {
  const { applyDesignDocumentPreset, syncGatedPresetSections } = await import('./preset');
  const { TODO } = await import('./hydrate');
  const doc = blankArchitecture('Test');
  doc.meta.lang = 'fr';
  applyDesignDocumentPreset(doc, 'fr');
  const raw = doc.sections.find(s => s.id === 'add-iam')!;
  assert.equal(raw.doc?.gated, undefined);
  assert.ok(JSON.stringify(raw).includes(TODO));
  doc.components = [{
    id: 'auth', name: 'Auth0', group: 'core', layer: 'edge', brick: 'identity',
    concernTags: ['iam'], purpose: 'Auth0', tech: ['OIDC']
  }];
  const result = syncGatedPresetSections(doc, 'fr', { refresh: false });
  assert.ok(result.updated?.includes('add-iam'));
  const iam = doc.sections.find(s => s.id === 'add-iam')!;
  assert.equal(iam.doc?.gated, true);
  assert.equal(JSON.stringify(iam).includes(TODO), false);
  assert.ok(JSON.stringify(iam).includes('Auth0'));
});
