import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `archstudio-system-copy-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;

after(() => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
});

describe('system copy admin', { concurrency: 1 }, () => {
  let SC: typeof import('./system-copy');

  before(async () => {
    SC = await import('./system-copy');
  });

  test('seed keys include flow defaults + layer.clients', () => {
    SC.ensureSystemCopyDomain();
    const list = SC.listSystemCopy();
    const keys = new Set(list.map(row => row.key));
    assert.ok(keys.has('flow.default.name'));
    assert.ok(keys.has('flow.default.firstStep'));
    assert.ok(keys.has('layer.clients'));
    assert.ok(keys.has('meta.tagline'));
    assert.equal(list.find(r => r.key === 'flow.default.name')?.seeded, true);
    assert.equal(list.find(r => r.key === 'layer.clients')?.seeded, true);
  });

  test('upsert + publish → getPublished returns new fr', () => {
    SC.ensureSystemCopyDomain();
    SC.upsertSystemCopy('flow.default.name', { en: 'New flow', fr: 'Parcours admin' });
    const result = SC.publishSystemCopy();
    assert.equal(result.ok, true);
    const published = SC.getPublishedSystemCopy();
    assert.equal(published['flow.default.name']?.fr, 'Parcours admin');
  });

  test('resolveFlowCopy returns published override when CONTENT_FROM_ADMIN=1', async () => {
    const prev = process.env.CONTENT_FROM_ADMIN;
    process.env.CONTENT_FROM_ADMIN = '1';
    try {
      SC.ensureSystemCopyDomain();
      SC.upsertSystemCopy('flow.default.name', { en: 'Admin New flow', fr: 'Parcours admin override' });
      SC.upsertSystemCopy('flow.default.sub', { en: 'Admin sub', fr: 'Sous-titre admin' });
      const published = SC.publishSystemCopy();
      assert.equal(published.ok, true);

      const { resolveFlowCopy } = await import('./system-copy.resolve.server');
      const fr = resolveFlowCopy('fr');
      assert.equal(fr.name, 'Parcours admin override');
      assert.equal(fr.sub, 'Sous-titre admin');

      const en = resolveFlowCopy('en');
      assert.equal(en.name, 'Admin New flow');
      assert.equal(en.sub, 'Admin sub');
    } finally {
      if (prev === undefined) delete process.env.CONTENT_FROM_ADMIN;
      else process.env.CONTENT_FROM_ADMIN = prev;
    }
  });

  test('resolveFlowCopy falls back to DEFAULT_FLOW_COPY when flag off', async () => {
    const prev = process.env.CONTENT_FROM_ADMIN;
    delete process.env.CONTENT_FROM_ADMIN;
    try {
      const { resolveFlowCopy } = await import('./system-copy.resolve.server');
      const { DEFAULT_FLOW_COPY } = await import('../defaults');
      const en = resolveFlowCopy('en');
      assert.equal(en.name, DEFAULT_FLOW_COPY.en.name);
    } finally {
      if (prev === undefined) delete process.env.CONTENT_FROM_ADMIN;
      else process.env.CONTENT_FROM_ADMIN = prev;
    }
  });

  test('locked/seeded keys reappear after delete+ensure', () => {
    SC.deleteSystemCopy('layer.clients');
    SC.ensureSystemCopyDomain();
    const restored = SC.getSystemCopy('layer.clients');
    assert.ok(restored);
    assert.equal(restored!.seeded, true);
    assert.ok(restored!.en.trim());
    assert.ok(restored!.fr.trim());
  });
});
