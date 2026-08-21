import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import demo from '../seed/demo.json';
import type { Architecture } from '../types';

const dbFile = path.join(os.tmpdir(), `archstudio-project-templates-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;

let PT: typeof import('./project-templates');
let Store: typeof import('../store');

before(async () => {
  PT = await import('./project-templates');
  Store = await import('../store');
});

after(() => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
});

describe('project templates', { concurrency: 1 }, () => {
  test('ISC-A6: Acme admin outline matches demo.json', () => {
    PT.ensureProjectTemplatesDomain();
    const acme = PT.getProjectTemplateAdmin('acme-v1');
    assert.ok(acme);

    const demoArch = demo as unknown as Architecture;
    const adminOutline = PT.projectTemplateOutline(acme!.snapshot);
    const demoOutline = PT.projectTemplateOutline(demoArch);

    assert.equal(adminOutline.componentCount, 22);
    assert.equal(adminOutline.componentCount, demoOutline.componentCount);
    assert.deepEqual(adminOutline.sectionIds, demoOutline.sectionIds);
    assert.equal(adminOutline.flowCount, demoOutline.flowCount);
  });

  test('ISC-A2: createProject from published template has 22 components', () => {
    PT.ensureProjectTemplatesDomain();
    const publish = PT.publishProjectTemplates();
    assert.equal(publish.ok, true);

    const tpl = PT.getPublishedProjectTemplate('acme-v1');
    assert.ok(tpl);

    const doc = PT.instantiateProjectTemplate(tpl!, 'Test Acme');
    const project = Store.createProject({
      name: 'Test Acme',
      data: doc,
    });

    assert.equal(project.data.components?.length, 22);
  });

  test('publish rejects when featured count is not exactly one', () => {
    PT.ensureProjectTemplatesDomain();
    PT.updateProjectTemplate('acme-v1', { featured: false });
    const result = PT.publishProjectTemplates();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some(i => i.code === 'featured_count'));
    }
    PT.updateProjectTemplate('acme-v1', { featured: true });
  });

  test('listAllAdminTemplates includes project and architecture templates', () => {
    PT.ensureProjectTemplatesDomain();
    const all = PT.listAllAdminTemplates();
    assert.ok(all.some(t => t.id === 'acme-v1' && t.kind === 'project'));
    assert.ok(all.some(t => t.id === 'serverless-mvp' && t.kind === 'architecture'));
    assert.equal(all.filter(t => t.kind === 'architecture').length, 6);
  });

  test('create and delete project template', () => {
    PT.ensureProjectTemplatesDomain();
    const id = PT.createProjectTemplate({ id: 'test-template', nameEn: 'Test Template' });
    assert.equal(id, 'test-template');
    const created = PT.getProjectTemplateAdmin(id);
    assert.ok(created);
    assert.equal(created!.nameEn, 'Test Template');
    PT.deleteProjectTemplate(id);
    assert.equal(PT.getProjectTemplateAdmin(id), null);
  });
});
