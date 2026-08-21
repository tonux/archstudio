import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `archstudio-admin-catalog-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;

let Admin: typeof import('./admin-catalog');
let Repo: typeof import('./repository');
let DB: typeof import('../db');

before(async () => {
  Admin = await import('./admin-catalog');
  Repo = await import('./repository');
  DB = await import('../db');
});

after(() => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
});

describe('admin catalog', { concurrency: 1 }, () => {
  test('ISC-A1: updateAdminBrick purposeFr is returned by legoCatalog(fr)', () => {
    Repo.ensureLegoCatalog();
    const purposeFr = 'Identité révisée pour le catalogue admin.';
    Admin.updateAdminBrick('identity', { purposeFr });

    const fr = Repo.legoCatalog('fr');
    assert.equal(fr.bricks.identity?.purpose, purposeFr);
  });

  test('updateAdminBrick persists concernTags to lego_brick_concern_tags', () => {
    Repo.ensureLegoCatalog();
    Admin.updateAdminBrick('identity', { concernTags: ['iam', 'governance'] });

    const tags = DB.plainAll<{ tag: string }>(
      DB.db.prepare(
        'SELECT tag FROM lego_brick_concern_tags WHERE catalog_version=? AND brick_id=? ORDER BY tag'
      ).all(Repo.LEGO_CATALOG_VERSION, 'identity')
    ).map(row => row.tag);

    assert.deepEqual(tags.sort(), ['governance', 'iam']);
    assert.deepEqual([...(Repo.legoCatalog('en').bricks.identity?.concernTags ?? [])].sort(), ['governance', 'iam']);
  });

  test('updateAdminBrick marks catalog dirty', () => {
    Repo.ensureLegoCatalog();
    Admin.updateAdminBrick('identity', { purposeEn: 'Revised identity purpose.' });
    const state = Admin.getCatalogAdminState();
    assert.equal(state.dirty, true);
  });

  test('ISC-A5: orphan variant maps_to missing brick is rejected at publish', () => {
    Repo.ensureLegoCatalog();
    const brickIds = new Set(['identity']);
    const orphanIssues = Admin.variantRefIssues(
      [{ id: 'orphan-test-variant', maps_to: 'missing-brick-id' }],
      brickIds,
    );
    assert.ok(orphanIssues.some(issue => issue.code === 'orphan_variant' && issue.entityId === 'orphan-test-variant'));
    assert.equal(Admin.validateCatalogPublish().some(issue => issue.code === 'orphan_variant'), false);

    const saved = DB.plain<{ role: string }>(
      DB.db.prepare(
        'SELECT role FROM lego_brick_texts WHERE catalog_version=? AND brick_id=? AND lang=?'
      ).get(Repo.LEGO_CATALOG_VERSION, 'identity', 'fr')
    );
    DB.db.prepare(
      'UPDATE lego_brick_texts SET role=? WHERE catalog_version=? AND brick_id=? AND lang=?'
    ).run('', Repo.LEGO_CATALOG_VERSION, 'identity', 'fr');

    const publishResult = Admin.publishCatalog();
    assert.equal(publishResult.ok, false);
    if (!publishResult.ok) {
      assert.ok(publishResult.issues.some(issue => issue.code === 'missing_role'));
    }

    DB.db.prepare(
      'UPDATE lego_brick_texts SET role=? WHERE catalog_version=? AND brick_id=? AND lang=?'
    ).run(saved.role, Repo.LEGO_CATALOG_VERSION, 'identity', 'fr');
  });

  test('validateCatalogPublish has no orphan dependencies on fresh seed', () => {
    Repo.ensureLegoCatalog();
    const issues = Admin.validateCatalogPublish();
    assert.equal(
      issues.filter(issue => issue.code === 'orphan_dependency').length,
      0,
      issues.map(issue => issue.message).join('; '),
    );
  });

  test('publishCatalog clears dirty flag when catalog is valid', () => {
    Repo.ensureLegoCatalog();
    Admin.updateAdminBrick('identity', { purposeFr: 'But révisé pour publication.' });
    assert.equal(Admin.getCatalogAdminState().dirty, true);

    const result = Admin.publishCatalog();
    assert.equal(result.ok, true, !result.ok ? result.issues.map(issue => issue.message).join('; ') : '');
    const state = Admin.getCatalogAdminState();
    assert.equal(state.dirty, false);
    if (result.ok) assert.ok(state.publishedAt);
  });

  test('validateAdminBrick rejects missing roles before save', () => {
    Repo.ensureLegoCatalog();
    const saved = DB.plain<{ role: string }>(
      DB.db.prepare(
        'SELECT role FROM lego_brick_texts WHERE catalog_version=? AND brick_id=? AND lang=?'
      ).get(Repo.LEGO_CATALOG_VERSION, 'identity', 'fr')
    );
    DB.db.prepare(
      'UPDATE lego_brick_texts SET role=? WHERE catalog_version=? AND brick_id=? AND lang=?'
    ).run('', Repo.LEGO_CATALOG_VERSION, 'identity', 'fr');

    const issues = Admin.validateAdminBrick('identity');
    assert.ok(issues.some(issue => issue.code === 'missing_role' && issue.field === 'roleFr'));
    assert.throws(() => Admin.updateAdminBrick('identity', { purposeFr: 'Sans rôle FR.' }));

    DB.db.prepare(
      'UPDATE lego_brick_texts SET role=? WHERE catalog_version=? AND brick_id=? AND lang=?'
    ).run(saved.role, Repo.LEGO_CATALOG_VERSION, 'identity', 'fr');
  });

  test('ensureLegoCatalog yields 40 bricks', () => {
    Repo.ensureLegoCatalog();
    const counts = Repo.legoCatalogCounts();
    assert.equal(counts.lego_bricks, 40);
  });

  test('updateScope persists and marks dirty', () => {
    Repo.ensureLegoCatalog();
    Admin.updateScope('product', { labelEn: 'Product revised', labelFr: 'Produit révisé' });
    const scope = Admin.listScopes().find(row => row.id === 'product');
    assert.equal(scope?.labelEn, 'Product revised');
    assert.equal(scope?.labelFr, 'Produit révisé');
    assert.equal(Admin.getCatalogAdminState().dirty, true);
  });

  test('create and delete custom scope; locked scope re-seeds', () => {
    Repo.ensureLegoCatalog();
    const id = Admin.createScope({ labelEn: 'Custom scope probe', labelFr: 'Scope perso' });
    assert.ok(id);
    assert.equal(Admin.isLockedScope(id), false);
    assert.ok(Admin.listScopes().some(row => row.id === id));
    Admin.deleteScope(id);
    assert.equal(Admin.listScopes().some(row => row.id === id), false);

    Admin.deleteScope('edge');
    const gone = !DB.db.prepare('SELECT 1 FROM lego_scopes WHERE catalog_version=? AND id=?')
      .get(Repo.LEGO_CATALOG_VERSION, 'edge');
    assert.equal(gone, true);
    Repo.ensureLegoCatalog();
    assert.ok(Admin.listScopes().some(row => row.id === 'edge'));
    assert.equal(Admin.isLockedScope('edge'), true);
  });

  test('create and delete custom intent; locked intent re-seeds', () => {
    Repo.ensureLegoCatalog();
    const id = Admin.createIntent({
      label: 'Custom intent probe',
      modes: ['cloud', 'selfhosted'],
      shapes: ['gateway'],
    });
    assert.ok(id);
    assert.equal(Admin.isLockedIntent(id), false);
    const created = Admin.getIntent(id);
    assert.equal(created?.label, 'Custom intent probe');
    assert.deepEqual(created?.modes, ['cloud', 'selfhosted']);
    assert.deepEqual(created?.shapes, ['gateway']);
    Admin.deleteIntent(id);
    assert.equal(Admin.getIntent(id), null);

    Admin.deleteIntent('cdn');
    const gone = !DB.db.prepare('SELECT 1 FROM lego_intents WHERE catalog_version=? AND id=?')
      .get(Repo.LEGO_CATALOG_VERSION, 'cdn');
    assert.equal(gone, true);
    Repo.ensureLegoCatalog();
    assert.ok(Admin.getIntent('cdn'));
    assert.equal(Admin.isLockedIntent('cdn'), true);
  });

  test('create and delete custom variant; locked variant re-seeds', () => {
    Repo.ensureLegoCatalog();
    const id = Admin.createVariant({
      label: 'Custom variant probe',
      intent: 'web-app',
      mode: 'client',
      maps_to: 'webApp',
    });
    assert.ok(id);
    assert.equal(Admin.isLockedVariant(id), false);
    assert.ok(Admin.listVariants().some(row => row.id === id && row.maps_to === 'webApp'));
    Admin.deleteVariant(id);
    assert.equal(Admin.listVariants().some(row => row.id === id), false);

    Admin.deleteVariant('nextjs');
    const gone = !DB.db.prepare('SELECT 1 FROM lego_variants WHERE catalog_version=? AND id=?')
      .get(Repo.LEGO_CATALOG_VERSION, 'nextjs');
    assert.equal(gone, true);
    Repo.ensureLegoCatalog();
    assert.ok(Admin.listVariants().some(row => row.id === 'nextjs'));
    assert.equal(Admin.isLockedVariant('nextjs'), true);
  });

  test('create and delete custom technology; locked technology re-seeds', () => {
    Repo.ensureLegoCatalog();
    const key = Admin.createTechnology({
      key: 'custom-tech-probe',
      en: 'Custom technology for admin CRUD.',
      fr: 'Technologie perso pour le CRUD admin.',
    });
    assert.equal(key, 'custom-tech-probe');
    assert.equal(Admin.isLockedTechnology(key), false);
    assert.equal(Admin.listTechnologyDescriptions()[key]?.en, 'Custom technology for admin CRUD.');
    Admin.deleteTechnology(key);
    assert.equal(Admin.listTechnologyDescriptions()[key], undefined);

    Admin.deleteTechnology('react');
    const gone = !DB.db.prepare(
      'SELECT 1 FROM lego_technology_descriptions WHERE catalog_version=? AND technology_key=? LIMIT 1'
    ).get(Repo.LEGO_CATALOG_VERSION, 'react');
    assert.equal(gone, true);
    Repo.ensureLegoCatalog();
    assert.ok(Admin.listTechnologyDescriptions().react?.en);
    assert.equal(Admin.isLockedTechnology('react'), true);
  });

  test('create and delete dependency edge', () => {
    Repo.ensureLegoCatalog();
    const edge = Admin.createDependency({
      from: 'webApp',
      to: 'secrets',
      strength: 'optional',
      why_en: 'Probe dependency why EN.',
      why_fr: 'Raison dépendance probe FR.',
      protocol_id: 'rest',
      kind: 'sync',
    });
    assert.deepEqual(edge, { from: 'webApp', to: 'secrets' });
    assert.ok(Admin.listDependencies().some(row => row.from === 'webApp' && row.to === 'secrets'));
    Admin.deleteDependency('webApp', 'secrets');
    assert.equal(
      Admin.listDependencies().some(row => row.from === 'webApp' && row.to === 'secrets'),
      false,
    );
  });

  test('create and delete custom brick; locked brick re-seeds', () => {
    Repo.ensureLegoCatalog();
    const id = Admin.createAdminBrick({
      id: 'customProbeBrick',
      icon: 'box',
      layer: 'services',
      defaultScope: 'product',
      roleEn: 'Custom probe brick role.',
      roleFr: 'Rôle brique probe personnalisée.',
      purposeEn: 'Purpose EN.',
      purposeFr: 'But FR.',
      concernTags: ['governance'],
    });
    assert.equal(id, 'customProbeBrick');
    assert.equal(Admin.isLockedBrick(id), false);
    assert.ok(Repo.legoCatalog('en').bricks[id]);
    Admin.deleteAdminBrick(id);
    assert.equal(Repo.legoCatalog('en').bricks[id], undefined);

    Admin.deleteAdminBrick('identity');
    const gone = !DB.db.prepare('SELECT 1 FROM lego_bricks WHERE catalog_version=? AND id=?')
      .get(Repo.LEGO_CATALOG_VERSION, 'identity');
    assert.equal(gone, true);
    Repo.ensureLegoCatalog();
    assert.ok(Repo.legoCatalog('en').bricks.identity);
    assert.equal(Admin.isLockedBrick('identity'), true);
  });

  test('createVariant rejects orphan maps_to', () => {
    Repo.ensureLegoCatalog();
    assert.throws(
      () => Admin.createVariant({
        label: 'Broken maps_to',
        intent: 'web-app',
        mode: 'client',
        maps_to: 'missing-brick-id',
      }),
      /does not exist/,
    );
  });

  test('createIntent rejects invalid hosting mode', () => {
    Repo.ensureLegoCatalog();
    assert.throws(
      () => Admin.createIntent({
        label: 'Bad mode',
        modes: ['orbital' as 'cloud'],
      }),
      /Invalid hosting mode/,
    );
  });
});

describe('F-REG R1 regression: orphan_variant', { concurrency: 1 }, () => {
  test('variantRefIssues emits orphan_variant for missing maps_to', () => {
    const issues = Admin.variantRefIssues(
      [{ id: 'freg-orphan', maps_to: 'no-brick' }],
      new Set(['identity']),
    );
    assert.ok(
      issues.some(i => i.code === 'orphan_variant' && i.entityId === 'freg-orphan'),
      'orphan_variant gate must remain',
    );
  });
});
