import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `archstudio-architecture-templates-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;

let AT: typeof import('./architecture-templates');
let Tpl: typeof import('../templates');

before(async () => {
  AT = await import('./architecture-templates');
  Tpl = await import('../templates');
});

after(() => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
});

describe('architecture templates admin', { concurrency: 1 }, () => {
  test('seeds 6 locked hyperscaler templates', () => {
    AT.ensureArchitectureTemplatesDomain();
    const list = AT.listArchitectureTemplatesAdmin();
    assert.equal(list.filter(t => t.locked).length, 6);
    for (const id of AT.LOCKED_ARCHITECTURE_TEMPLATE_IDS) {
      assert.ok(list.some(t => t.id === id && t.locked));
    }
  });

  test('instantiate(admin serverless-mvp, agnostic, en) matches code component count', () => {
    const spec = AT.getArchitectureTemplateSpec('serverless-mvp');
    const code = Tpl.getTemplate('serverless-mvp');
    assert.ok(spec);
    assert.ok(code);
    const opts = { target: 'agnostic' as const, lang: 'en' as const, projectName: 'Count' };
    assert.equal(
      Tpl.instantiate(spec!, opts).components.length,
      Tpl.instantiate(code!, opts).components.length,
    );
  });

  test('update name persists', () => {
    AT.updateArchitectureTemplate('serverless-mvp', { nameEn: 'Serverless MVP (admin)' });
    const saved = AT.getArchitectureTemplateSpec('serverless-mvp');
    assert.equal(Tpl.t(saved!.name, 'en'), 'Serverless MVP (admin)');
    AT.updateArchitectureTemplate('serverless-mvp', {
      spec: Tpl.getTemplate('serverless-mvp')!,
    });
  });

  test('create and delete custom; locked re-seeds', () => {
    const id = AT.createArchitectureTemplate({ nameEn: 'Custom hyperscaler probe' });
    assert.ok(id);
    assert.ok(AT.getArchitectureTemplateSpec(id));
    AT.deleteArchitectureTemplate(id);
    assert.equal(AT.getArchitectureTemplateSpec(id), null);

    AT.deleteArchitectureTemplate('rag');
    AT.ensureArchitectureTemplatesDomain();
    assert.ok(AT.getArchitectureTemplateSpec('rag'));
  });

  test('publish ok when locked six are present', () => {
    AT.ensureArchitectureTemplatesDomain();
    const result = AT.publishArchitectureTemplates();
    assert.equal(result.ok, true);
    const published = AT.getPublishedArchitectureTemplates();
    assert.ok(published.length >= 6);
    assert.ok(AT.getPublishedArchitectureTemplate('monolith'));
  });

  test('snapshot: rename keeps fr when en unchanged for id', () => {
    const current = baseTemplate();
    const snap = snapFrom(current);
    snap.components = snap.components.map(c =>
      c.id === 'api' ? { ...c, name: 'API Gateway' } : c,
    );
    const next = AT.applyArchitectureSnapshotToSpec(current, snap);
    const api = next.components.find(c => c.id === 'api')!;
    assert.deepEqual(api.name, { en: 'API Gateway', fr: 'API Gateway' });

    const snapSameEn = snapFrom(current);
    // en equals previous en → fr preserved
    const nextKeep = AT.applyArchitectureSnapshotToSpec(current, snapSameEn);
    const apiKeep = nextKeep.components.find(c => c.id === 'api')!;
    assert.deepEqual(apiKeep.name, { en: 'API', fr: 'Passerelle API' });
  });

  test('snapshot: cloud.aws override survives apply', () => {
    const current = baseTemplate();
    const snap = snapFrom(current);
    snap.components = snap.components.map(c =>
      c.id === 'api' ? { ...c, name: 'API (edited)' } : c,
    );
    const next = AT.applyArchitectureSnapshotToSpec(current, snap);
    const api = next.components.find(c => c.id === 'api')!;
    assert.ok(api.cloud?.aws);
    assert.equal(api.cloud!.aws!.name, 'Amazon API Gateway');
    assert.deepEqual(api.cloud!.aws!.tech, ['API Gateway']);
  });

  test('snapshot: deleted component drops from spec and loses cloud', () => {
    const current = baseTemplate();
    const snap = snapFrom(current);
    snap.components = snap.components.filter(c => c.id !== 'db');
    const next = AT.applyArchitectureSnapshotToSpec(current, snap);
    assert.equal(next.components.some(c => c.id === 'db'), false);
    assert.ok(!next.components.some(c => c.cloud?.aws && c.id === 'db'));
  });

  test('snapshot: added component appears in spec', () => {
    const current = baseTemplate();
    const snap = snapFrom(current);
    snap.components.push({
      id: 'queue',
      name: 'Queue',
      group: 'app',
      layer: 'data',
      icon: 'queue',
      tech: ['SQS'],
      deps: [],
    });
    const next = AT.applyArchitectureSnapshotToSpec(current, snap);
    const queue = next.components.find(c => c.id === 'queue');
    assert.ok(queue);
    assert.deepEqual(queue!.name, { en: 'Queue', fr: 'Queue' });
    assert.equal(queue!.cloud, undefined);
  });

  test('snapshot: flow add/remove round-trips', () => {
    const current = baseTemplate();
    const snap = snapFrom(current);
    snap.flows = [
      {
        id: 'new-flow',
        name: 'Checkout',
        steps: [
          { component: 'api', title: 'Receive' },
          { component: 'db', title: 'Persist' },
        ],
      },
    ];
    const next = AT.applyArchitectureSnapshotToSpec(current, snap);
    assert.equal(next.flows?.length, 1);
    assert.equal(next.flows![0]!.id, 'new-flow');
    assert.deepEqual(next.flows![0]!.name, { en: 'Checkout', fr: 'Checkout' });
    assert.equal(next.flows!.some(f => f.id === 'happy'), false);

    snap.flows = [];
    const cleared = AT.applyArchitectureSnapshotToSpec(current, snap);
    assert.deepEqual(cleared.flows, []);
  });

  test('updateArchitectureTemplate accepts snapshot and preserves cloud', () => {
    AT.ensureArchitectureTemplatesDomain();
    const id = AT.createArchitectureTemplate({
      nameEn: 'Snapshot probe',
      spec: baseTemplate(),
    });
    const current = AT.getArchitectureTemplateSpec(id)!;
    const snap = snapFrom(current);
    snap.components = snap.components.map(c =>
      c.id === 'api' ? { ...c, name: 'API renamed' } : c,
    );
    AT.updateArchitectureTemplate(id, { snapshot: snap });
    const saved = AT.getArchitectureTemplateSpec(id)!;
    const api = saved.components.find(c => c.id === 'api')!;
    assert.deepEqual(api.name, { en: 'API renamed', fr: 'API renamed' });
    assert.equal(api.cloud?.aws?.name, 'Amazon API Gateway');
    AT.deleteArchitectureTemplate(id);
  });
});

function baseTemplate(): import('../templates/types').Template {
  return {
    id: 'probe',
    name: { en: 'Probe', fr: 'Sonde' },
    tagline: { en: 'Tag', fr: 'Tag FR' },
    icon: 'cube',
    accent: '#111111',
    accentDark: '#222222',
    whenToUse: [{ en: 'Use', fr: 'Utiliser' }],
    whenNotToUse: [{ en: 'Skip', fr: 'Passer' }],
    supportedTargets: ['agnostic', 'aws'],
    groups: [{ id: 'app', name: { en: 'App', fr: 'App FR' } }],
    layers: [
      { id: 'compute', name: { en: 'Compute', fr: 'Calcul' } },
      { id: 'data', name: { en: 'Data', fr: 'Données' } },
    ],
    components: [
      {
        id: 'api',
        name: { en: 'API', fr: 'Passerelle API' },
        group: 'app',
        layer: 'compute',
        icon: 'api',
        tech: ['HTTP'],
        role: { en: 'Entry', fr: 'Entrée' },
        features: [{ en: 'REST', fr: 'REST FR' }],
        notes: [{ en: 'Note', fr: 'Note FR' }],
        deps: ['db'],
        cloud: {
          aws: { name: 'Amazon API Gateway', tech: ['API Gateway'] },
        },
      },
      {
        id: 'db',
        name: { en: 'Database', fr: 'Base de données' },
        group: 'app',
        layer: 'data',
        icon: 'db',
        tech: ['SQL'],
        deps: [],
        cloud: {
          aws: { name: 'Amazon RDS', tech: ['RDS'] },
        },
      },
    ],
    flows: [
      {
        id: 'happy',
        name: { en: 'Happy path', fr: 'Chemin heureux' },
        steps: [
          { component: 'api', title: { en: 'Call', fr: 'Appel' } },
          { component: 'db', title: { en: 'Store', fr: 'Stocker' } },
        ],
      },
    ],
    sections: [
      {
        id: 'overview',
        type: 'text',
        title: { en: 'Overview', fr: 'Aperçu' },
        blocks: [{ title: { en: 'Intro', fr: 'Intro FR' }, body: { en: 'Body', fr: 'Corps' } }],
      },
    ],
    technologies: [{ name: 'HTTP', category: { en: 'Protocol', fr: 'Protocole' } }],
  };
}

function snapFrom(tpl: import('../templates/types').Template): import('../types').Architecture {
  return Tpl.instantiate(tpl, {
    target: 'agnostic',
    lang: 'en',
    projectName: 'Probe',
    today: '2026-01-01',
  });
}
