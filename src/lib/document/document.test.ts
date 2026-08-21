import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { blankArchitecture, normalizeArchitecture } from '../defaults';
import { instantiate, getTemplate } from '../templates';
import { tabRows } from '../tabs';
import type { Architecture, ArchitectureDecision, Flow, Section } from '../types';
import { buildOutline, partOf, slotKey, supportLayerId, toc } from './plan';
import { PRESET_SECTION_IDS, applyDesignDocumentPreset, missingPresetSections } from './preset';

const slotted = (id: string, chapter?: string): Section => ({
  id, type: 'text', title: id, blocks: [], ...(chapter ? { doc: { chapter } } : {})
});

const withSections = (sections: Section[]): Architecture => {
  const doc = blankArchitecture('Test');
  doc.meta.intro = 'An introduction.';
  doc.sections = sections;
  return doc;
};

const kindsOf = (entries: { body: { kind: string } }[]): string[] =>
  entries.map(e => e.body.kind);

const placedCanvas = (): Architecture => {
  const doc = blankArchitecture('Test');
  doc.groups = [{ id: 'core', name: 'Core' }];
  doc.layers = [{ id: 'services', name: 'Services' }];
  doc.components = [
    { id: 'web', name: 'Web app', group: 'core', layer: 'services' },
    { id: 'api', name: 'API', group: 'core', layer: 'services' }
  ];
  doc.technologies = [{ name: 'Postgres' }];
  return doc;
};

const journey = (id: string, name: string): Flow => ({
  id, name, steps: [{ component: 'web', title: 'Start' }]
});

const flowIdsOf = (entries: { body: { kind: string; flow?: Flow } }[]) =>
  entries.filter(e => e.body.kind === 'flow').map(e => e.body.flow!.id);

/* ------------------------------------------------------------------ slots */

test('slotKey parses a dotted chapter, and rejects the rest', () => {
  assert.deepEqual(slotKey('2.10'), [2, 10]);
  assert.deepEqual(slotKey('3'), [3]);
  assert.equal(slotKey(''), null);
  assert.equal(slotKey(undefined), null);
  assert.equal(slotKey('two.four'), null);
});

test('a section with no slot, or a slot outside the spine, lands in the appendices', () => {
  assert.equal(partOf(slotted('a', '2.4')), '2');
  assert.equal(partOf(slotted('b')), '6');
  assert.equal(partOf(slotted('c', '9.1')), '6');
});

/* ---------------------------------------------------------------- outline */

test('chapters are numbered from position, not from the stored slot', () => {
  const doc = withSections([
    slotted('dr', '2.5'),
    slotted('data', '2.2'),
    slotted('cicd', '4.1')
  ]);
  const outline = buildOutline(doc);
  const flat = toc(outline).filter(r => r.level === 2);

  /* No components, so part 2 has no generated inventory: the two application
   * chapters number 2.1 and 2.2 even though they are stored as 2.2 and 2.5. */
  assert.deepEqual(
    flat.map(r => `${r.number} ${r.title}`),
    ['2.1 data', '2.2 dr', '3.1 cicd']
  );
});

test('an empty part is dropped, and the parts after it shift up', () => {
  const doc = withSections([slotted('cost', '5.1')]);
  const parts = buildOutline(doc).parts;
  assert.deepEqual(parts.map(p => p.number), ['1', '2']);
  assert.equal(parts[1].entries[0].number, '2.1');
});

test('unslotted sections keep their authoring order, behind the slotted ones', () => {
  const doc = withSections([
    slotted('free-b'),
    slotted('appendix-slotted', '6.1'),
    slotted('free-a')
  ]);
  const appendix = buildOutline(doc).parts.at(-1)!;
  assert.deepEqual(appendix.entries.map(e => e.title), ['appendix-slotted', 'free-b', 'free-a']);
});

test('the diagram leads part 2 and the inventory is its first chapter', () => {
  const doc = instantiate(getTemplate('serverless-mvp')!, {
    target: 'gcp', lang: 'en', projectName: 'Demo', today: '2026-08-14'
  });
  const part = buildOutline(doc).parts.find(p => p.title.includes('Application'))!;
  assert.deepEqual(part.lead.map(b => b.kind), ['diagram']);
  assert.equal(part.entries[0].body.kind, 'inventory');
  assert.equal(part.entries[0].number, '2.1');
});

test('the environments table is a chapter of DevOps & delivery, and only when filled', () => {
  const base = () => {
    const doc = blankArchitecture('Test');
    doc.layers = [{ id: 'services', name: 'Services' }];
    doc.groups = [{ id: 'core', name: 'Core' }];
    doc.environments = [{ id: 'dev', name: 'Dev' }, { id: 'prod', name: 'Production' }];
    doc.components = [{
      id: 'api', name: 'API', group: 'core', layer: 'services', tech: [], features: [], notes: [], deps: []
    }];
    return doc;
  };

  /* Declared but never filled in: the chapter would be a grid of dashes. */
  const empty = buildOutline(normalizeArchitecture(base()));
  assert.ok(!empty.parts.some(p => p.entries.some(e => e.body.kind === 'environments')));

  const filled = base();
  filled.components[0].envs = [{ env: 'prod', url: 'api.acme.test' }];
  const outline = buildOutline(normalizeArchitecture(filled));
  const part = outline.parts.find(p => p.entries.some(e => e.body.kind === 'environments'));
  assert.ok(part, 'the environments table should earn a chapter');
  assert.equal(part!.title, 'DevOps & delivery');
});

test('flows and the stack table close the appendices', () => {
  const doc = instantiate(getTemplate('multi-service')!, {
    target: 'aws', lang: 'fr', projectName: 'Demo', today: '2026-08-14'
  });
  const kinds = kindsOf(buildOutline(doc).parts.at(-1)!.entries);
  /* multi-service has two named flows: they move to the application part. */
  assert.equal(kinds.filter(k => k === 'flow').length, 0);
  assert.equal(kinds.at(-1), 'stack');
});

test('the outline speaks the document’s language', () => {
  const doc = instantiate(getTemplate('rag')!, {
    target: 'azure', lang: 'fr', projectName: 'Demo', today: '2026-08-14'
  });
  const outline = buildOutline(doc);
  assert.equal(outline.lang, 'fr');
  assert.ok(outline.parts.some(p => p.title === 'Architecture applicative'));
});

test('the support layer follows the viewer’s rule', () => {
  const four = blankArchitecture('four');
  four.layers = [
    { id: 'clients', name: 'Clients' },
    { id: 'services', name: 'Services' },
    { id: 'data', name: 'Data' },
    { id: 'infra', name: 'Infrastructure' }
  ];
  assert.equal(supportLayerId(four), four.layers.at(-1)!.id);

  const three = normalizeArchitecture({ ...four, layers: four.layers.slice(0, 3) });
  assert.equal(supportLayerId(three), null);

  four.ui.supportLayer = false;
  assert.equal(supportLayerId(four), null);
});

test('a canvas with groups or components gets a Context chapter in the introduction', () => {
  const groupsOnly = blankArchitecture('Test');
  groupsOnly.groups = [{ id: 'core', name: 'Core' }];
  const fromGroups = buildOutline(groupsOnly);
  const introG = fromGroups.parts.find(p => p.title === 'Introduction');
  assert.ok(introG);
  assert.ok(kindsOf(introG.entries).includes('context'));
  assert.ok(introG.entries.some(e => /Context|Contexte/.test(e.title)));
  assert.equal(JSON.stringify(fromGroups).includes('[…]'), false);

  const withComponents = placedCanvas();
  const introC = buildOutline(withComponents).parts.find(p => p.title === 'Introduction');
  assert.ok(introC);
  assert.ok(kindsOf(introC.entries).includes('context'));
  assert.ok(introC.entries.some(e => /Context/.test(e.title)));

  const fr = instantiate(getTemplate('serverless-mvp')!, {
    target: 'gcp', lang: 'fr', projectName: 'Demo', today: '2026-08-14'
  });
  const introFr = buildOutline(fr).parts.find(p => p.title === 'Introduction')!;
  assert.ok(introFr.entries.some(e => /Contexte/.test(e.title)));
  assert.equal(JSON.stringify(introFr.entries.find(e => /Contexte/.test(e.title))).includes('[…]'), false);
});

test('an empty canvas omits Context, glossary, and ADR index', () => {
  const doc = blankArchitecture('Test');
  doc.meta.intro = 'An introduction.';
  const outline = buildOutline(doc);
  const kinds = outline.parts.flatMap(p => kindsOf(p.entries));
  const titles = toc(outline).map(r => r.title);
  assert.equal(kinds.includes('context'), false);
  assert.equal(kinds.includes('glossary'), false);
  assert.equal(kinds.includes('adr-index'), false);
  assert.equal(titles.some(t => /Context|Contexte/.test(t)), false);
});

test('one to five named flows sit after the inventory, not in the appendices', () => {
  for (const id of ['multi-service', 'serverless-mvp'] as const) {
    const doc = instantiate(getTemplate(id)!, {
      target: 'aws', lang: 'en', projectName: 'Demo', today: '2026-08-14'
    });
    const named = doc.flows.filter(f => f.name.trim());
    assert.ok(named.length >= 1 && named.length <= 5);
    const outline = buildOutline(doc);
    const app = outline.parts.find(p => p.title.includes('Application'))!;
    const appendix = outline.parts.at(-1)!;
    const appKinds = kindsOf(app.entries);
    assert.equal(appKinds[0], 'inventory');
    const flowCount = appKinds.filter(k => k === 'flow').length;
    assert.equal(flowCount, named.length);
    assert.ok(appKinds.slice(1, 1 + flowCount).every(k => k === 'flow'));
    assert.equal(kindsOf(appendix.entries).includes('flow'), false);
  }
});

test('named flows fall back to appendices when no components are placed', () => {
  const doc = blankArchitecture('Test');
  doc.flows = [
    journey('signup', 'Sign up'),
    journey('checkout', 'Checkout')
  ];
  const outline = buildOutline(doc);
  const appendix = outline.parts.at(-1)!;
  const app = outline.parts.find(p => p.title.includes('Application'));
  assert.equal(app, undefined);
  assert.equal(kindsOf(appendix.entries).filter(k => k === 'flow').length, 2);
  assert.ok(flowIdsOf(appendix.entries).includes('signup'));
  assert.ok(flowIdsOf(appendix.entries).includes('checkout'));
});

test('six or more named flows stay in the appendices', () => {
  const doc = placedCanvas();
  doc.flows = Array.from({ length: 6 }, (_, i) => journey(`flow-${i + 1}`, `Journey ${i + 1}`));
  const outline = buildOutline(doc);
  const app = outline.parts.find(p => p.title.includes('Application'))!;
  const appendix = outline.parts.at(-1)!;
  assert.equal(kindsOf(app.entries).includes('flow'), false);
  assert.equal(kindsOf(appendix.entries).filter(k => k === 'flow').length, 6);
});

test('unnamed flows stay in the appendices', () => {
  const doc = placedCanvas();
  doc.flows = [
    journey('checkout', 'Checkout'),
    journey('draft', ''),
    journey('spaces', '   ')
  ];
  const outline = buildOutline(doc);
  const app = outline.parts.find(p => p.title.includes('Application'))!;
  const appendix = outline.parts.at(-1)!;
  const inApp = flowIdsOf(app.entries);
  const inAppendix = flowIdsOf(appendix.entries);
  assert.ok(inApp.includes('checkout'));
  assert.equal(inApp.includes('draft'), false);
  assert.equal(inApp.includes('spaces'), false);
  assert.ok(inAppendix.includes('draft'));
  assert.ok(inAppendix.includes('spaces'));
  assert.equal(inAppendix.includes('checkout'), false);
});

test('the glossary lists every placed component and sits before the stack', () => {
  const doc = instantiate(getTemplate('serverless-mvp')!, {
    target: 'gcp', lang: 'en', projectName: 'Demo', today: '2026-08-14'
  });
  const appendix = buildOutline(doc).parts.at(-1)!;
  const kinds = kindsOf(appendix.entries);
  const gi = kinds.indexOf('glossary');
  const si = kinds.indexOf('stack');
  assert.ok(gi >= 0);
  assert.ok(si >= 0);
  assert.ok(gi < si);
  const glossary = appendix.entries[gi];
  for (const c of doc.components) {
    assert.ok(JSON.stringify(glossary).includes(c.name), c.name);
  }
  assert.equal(JSON.stringify(glossary).includes('[…]'), false);
});

test('the ADR index appears only when decisions exist and never contains a TODO', () => {
  const empty = placedCanvas();
  const emptyKinds = buildOutline(empty).parts.flatMap(p => kindsOf(p.entries));
  assert.equal(emptyKinds.includes('adr-index'), false);

  const decision: ArchitectureDecision = {
    id: 'adr-1',
    title: 'Pick a bus',
    context: 'Services must not call each other directly.',
    decision: 'Publish events.',
    consequences: 'Consumers stay independent.',
    status: 'accepted'
  };
  const withDecisions = { ...placedCanvas(), decisions: [decision] };
  const outline = buildOutline(withDecisions);
  const intro = outline.parts.find(p => p.title === 'Introduction');
  assert.ok(intro);
  const kinds = kindsOf(intro.entries);
  const ci = kinds.indexOf('context');
  const ai = kinds.indexOf('adr-index');
  assert.ok(ai >= 0);
  assert.ok(ci >= 0 && ci < ai);
  const adr = intro.entries[ai];
  assert.equal(JSON.stringify(adr).includes('TODO'), false);
  assert.equal(JSON.stringify(adr).includes('[…]'), false);
  assert.ok(JSON.stringify(adr).includes(decision.title));
});

test('a blank outline never includes the CAF preset chapters', () => {
  const outline = buildOutline(blankArchitecture('Test'));
  const sectionIds = outline.parts.flatMap(p => p.entries.flatMap(e =>
    e.body.kind === 'section' ? [e.body.section.id] : []
  ));
  assert.ok(PRESET_SECTION_IDS.every(id => !sectionIds.includes(id)));
});

/* ----------------------------------------------------------------- preset */

test('the preset adds every chapter once, and never twice', () => {
  const doc = blankArchitecture('Test');
  assert.equal(missingPresetSections(doc), PRESET_SECTION_IDS.length);

  const first = applyDesignDocumentPreset(doc);
  assert.deepEqual(first.added, PRESET_SECTION_IDS);
  assert.equal(missingPresetSections(doc), 0);

  const edited = doc.sections.find(s => s.id === 'add-dr')!;
  edited.title = 'Renamed by hand';

  const second = applyDesignDocumentPreset(doc);
  assert.deepEqual(second.added, []);
  assert.equal(doc.sections.filter(s => s.id === 'add-dr').length, 1);
  assert.equal(doc.sections.find(s => s.id === 'add-dr')!.title, 'Renamed by hand');
});

test('preset chapters stay off the viewer’s tab bar', () => {
  const doc = instantiate(getTemplate('saas-multitenant')!, {
    target: 'agnostic', lang: 'en', projectName: 'Demo', today: '2026-08-14'
  });
  const before = tabRows(doc).filter(t => t.visible).map(t => t.id);

  applyDesignDocumentPreset(doc);

  assert.deepEqual(tabRows(doc).filter(t => t.visible).map(t => t.id), before);
  assert.ok(PRESET_SECTION_IDS.every(id => !doc.ui.tabs!.includes(id)));
});

test('a document that never pinned its tabs keeps the ones it showed', () => {
  const doc = blankArchitecture('Test');
  doc.sections = [slotted('mine')];
  doc.ui.tabs = undefined;
  const before = tabRows(doc).filter(t => t.visible).map(t => t.id);

  applyDesignDocumentPreset(doc);

  assert.deepEqual(tabRows(doc).filter(t => t.visible).map(t => t.id), before);
});

test('the generated deployment table becomes the service-selection chapter', () => {
  const doc = instantiate(getTemplate('event-driven')!, {
    target: 'gcp', lang: 'en', projectName: 'Demo', today: '2026-08-14'
  });
  applyDesignDocumentPreset(doc);
  assert.equal(doc.sections.find(s => s.id === 'deployment')!.doc?.chapter, '2.1');

  const part = buildOutline(doc).parts.find(p => p.number === '2')!;
  const kinds = kindsOf(part.entries);
  assert.equal(kinds[0], 'inventory');
  const firstSection = kinds.indexOf('section');
  assert.ok(firstSection >= 2);
  assert.ok(kinds.slice(1, firstSection).every(k => k === 'flow'));
  const chapter = part.entries[firstSection];
  assert.equal(chapter.body.kind, 'section');
  if (chapter.body.kind === 'section') assert.equal(chapter.body.section.id, 'deployment');
});

test('the preset is translated, and only in the document’s language', () => {
  const fr = blankArchitecture('Test');
  fr.meta.lang = 'fr';
  applyDesignDocumentPreset(fr);
  const dr = fr.sections.find(s => s.id === 'add-dr')!;
  assert.equal(dr.title, 'Sauvegarde et reprise d’activité');
  assert.equal(JSON.stringify(dr).includes('"en":'), false);

  const en = blankArchitecture('Test');
  applyDesignDocumentPreset(en);
  assert.equal(en.sections.find(s => s.id === 'add-dr')!.title, 'Backup and disaster recovery');
});

test('a preset document survives a round trip through normalisation', () => {
  const doc = blankArchitecture('Test');
  applyDesignDocumentPreset(doc);
  const round = normalizeArchitecture(JSON.parse(JSON.stringify(doc)));
  assert.equal(missingPresetSections(round), 0);
  assert.equal(round.sections.find(s => s.id === 'add-cicd')!.doc?.chapter, '4.1');
});

test('the whole plan renders from a preset document without a hole', () => {
  const doc = instantiate(getTemplate('monolith')!, {
    target: 'selfhosted', lang: 'en', projectName: 'Demo', today: '2026-08-14'
  });
  applyDesignDocumentPreset(doc);
  const outline = buildOutline(doc);

  assert.deepEqual(outline.parts.map(p => p.number), ['1', '2', '3', '4', '5', '6']);
  toc(outline).forEach(row => {
    assert.ok(row.title.trim().length, 'every heading has a title');
    assert.match(row.number, /^\d+(\.\d+)?$/);
  });
});
