import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `archstudio-bundle-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;

let Bundle: typeof import('./bundle');
let SC: typeof import('./system-copy');

before(async () => {
  SC = await import('./system-copy');
  Bundle = await import('./bundle');
});

after(() => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
});

describe('content bundle', { concurrency: 1 }, () => {
  test('export bundle includes system-copy keys', () => {
    SC.ensureSystemCopyDomain();
    const bundle = Bundle.exportContentBundle();
    assert.equal(bundle.version, 1);
    assert.ok(bundle.exportedAt);
    assert.ok(bundle.domains['system-copy']);
    assert.ok(bundle.domains['system-copy']!['flow.default.name']);
    assert.ok(bundle.domains['system-copy']!['layer.clients']);
  });

  test('import merge restores a key', () => {
    SC.ensureSystemCopyDomain();
    SC.upsertSystemCopy('flow.default.sub', { en: 'Consumer · under an hour', fr: 'Sous-titre exporté' });
    const exported = Bundle.exportContentBundle();

    SC.upsertSystemCopy('flow.default.sub', { en: 'Consumer · under an hour', fr: 'Écrasé localement' });
    assert.equal(SC.getSystemCopy('flow.default.sub')?.fr, 'Écrasé localement');

    const result = Bundle.importContentBundle(exported, { mode: 'merge' });
    assert.equal(result.ok, true);
    assert.equal(SC.getSystemCopy('flow.default.sub')?.fr, 'Sous-titre exporté');
    const state = SC.getSystemCopyState();
    assert.equal(state.dirty, true);
  });
});
