/**
 * ISC-A3 + Anti ISC-A8 (falsifiers).
 * A3 probe: hydrate/resolvePresetSection title (not PDF generation).
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `archstudio-isc-a3-a8-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;

const PLACEHOLDERS = ['[…]', 'À estimer', 'To be estimated'] as const;
const A3_MARKER_EN = 'ISC_A3_AUTH0_TITLE_EN_7f3c91';
const A3_MARKER_FR = 'ISC_A3_AUTH0_TITLE_FR_7f3c91';

let AS: typeof import('./add-sections');
let PS: typeof import('./preset-sections.server');
let Admin: typeof import('../lego/admin-catalog');
let Repo: typeof import('../lego/repository');
let Store: typeof import('../store');
let Hydrate: typeof import('../document/hydrate');

function scrubPlaceholders<T>(value: T): T {
  let json = JSON.stringify(value);
  for (const marker of PLACEHOLDERS) {
    json = json.split(marker).join('filled');
  }
  return JSON.parse(json) as T;
}

before(async () => {
  AS = await import('./add-sections');
  PS = await import('./preset-sections.server');
  Admin = await import('../lego/admin-catalog');
  Repo = await import('../lego/repository');
  Store = await import('../store');
  Hydrate = await import('../document/hydrate');
});

after(() => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
    fs.rmSync(f, { force: true });
  }
});

describe('ISC-A3 + Anti ISC-A8', { concurrency: 1 }, () => {
  test('ISC-A3: published add-iam title reaches hydrate when CONTENT_FROM_ADMIN=1', () => {
    // Probe: resolvePresetSection + hydratePresetSection title (PDF gated Auth0 uses same path).
    const prev = process.env.CONTENT_FROM_ADMIN;
    process.env.CONTENT_FROM_ADMIN = '1';
    try {
      AS.ensureAddSectionsDomain();

      for (const row of AS.listAddSectionsAdmin()) {
        const detail = AS.getAddSectionAdmin(row.id);
        assert.ok(detail, `missing section ${row.id}`);
        const en = scrubPlaceholders(detail.en);
        const fr = scrubPlaceholders(detail.fr);
        if (row.id === 'add-iam') {
          en.title = A3_MARKER_EN;
          fr.title = A3_MARKER_FR;
        }
        AS.updateAddSection(row.id, { en, fr });
      }

      const published = AS.publishAddSections();
      assert.equal(published.ok, true, published.ok ? '' : published.issues.map(i => i.message).join('; '));

      const draft = AS.getAddSectionAdmin('add-iam');
      assert.equal(draft?.en.title, A3_MARKER_EN);

      const resolved = PS.resolvePresetSection('add-iam', 'en');
      assert.ok(resolved, 'resolvePresetSection must return published add-iam');
      assert.equal(resolved.title, A3_MARKER_EN);

      const doc = {
        meta: { name: 'ISC-A3', lang: 'en' as const },
        groups: [{ id: 'core', name: 'Core' }],
        layers: [{ id: 'edge', name: 'Edge' }],
        components: [{
          id: 'auth0',
          name: 'Auth0',
          group: 'core',
          layer: 'edge',
          brick: 'identity' as const,
          concernTags: ['iam' as const],
          purpose: 'Auth0',
          tech: ['OIDC'],
        }],
        sections: [] as [],
        flows: [] as [],
        ui: { tabs: [] as string[] },
      };

      const hydrated = Hydrate.hydratePresetSection(resolved, doc as never, 'en');
      assert.equal(hydrated.title, A3_MARKER_EN);
      assert.match(JSON.stringify(hydrated), new RegExp(A3_MARKER_EN));
    } finally {
      if (prev === undefined) delete process.env.CONTENT_FROM_ADMIN;
      else process.env.CONTENT_FROM_ADMIN = prev;
    }
  });

  test('Anti ISC-A8: publishCatalog does not rewrite snapshotted component concernTags', () => {
    Repo.ensureLegoCatalog();

    const project = Store.createProject({
      name: 'ISC-A8 snapshot',
      data: {
        meta: { name: 'ISC-A8', lang: 'en' },
        groups: [{ id: 'core', name: 'Core' }],
        layers: [{ id: 'edge', name: 'Edge' }],
        components: [{
          id: 'auth0',
          name: 'Auth0',
          group: 'core',
          layer: 'edge',
          brick: 'identity',
          concernTags: ['iam'],
          purpose: 'Auth0',
        }],
        sections: [],
        flows: [],
        ui: { tabs: [] },
      },
    });

    const before = project.data.components.find(c => c.id === 'auth0')?.concernTags;
    assert.deepEqual(before, ['iam']);

    Admin.updateAdminBrick('identity', { concernTags: ['governance'] });
    const catalogAfterUpdate = Repo.legoCatalog('en').bricks.identity?.concernTags;
    assert.deepEqual([...(catalogAfterUpdate ?? [])].sort(), ['governance']);

    const published = Admin.publishCatalog();
    assert.equal(published.ok, true, published.ok ? '' : published.issues.map(i => i.message).join('; '));

    const reloaded = Store.getProject(project.id);
    assert.ok(reloaded);
    const after = reloaded.data.components.find(c => c.id === 'auth0')?.concernTags;
    assert.deepEqual(after, ['iam'], 'project component concernTags must stay snapshotted across catalog publish');
    assert.notDeepEqual(
      after,
      Repo.legoCatalog('en').bricks.identity?.concernTags,
      'catalog live tags diverge from snapshot',
    );
  });
});
