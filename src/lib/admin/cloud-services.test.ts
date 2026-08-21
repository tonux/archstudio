import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `archstudio-cloud-services-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;

let CS: typeof import('./cloud-services');
let Svc: typeof import('../templates/services');

before(async () => {
  CS = await import('./cloud-services');
  Svc = await import('../templates/services');
});

after(() => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
});

describe('cloud services admin', { concurrency: 1 }, () => {
  test('seeds SERVICES object keys', () => {
    CS.ensureCloudServicesDomain();
    const list = CS.listCloudServicesAdmin();
    for (const key of Object.keys(Svc.SERVICES)) {
      assert.ok(list.some(s => s.roleKey === key), `missing seed ${key}`);
    }
  });

  test('cloud service update persists a cell name', () => {
    const current = CS.getCloudServiceAdmin('queue');
    assert.ok(current);
    const next = structuredClone(current!.payload);
    next.aws = { ...next.aws, name: 'Amazon SQS (admin)' };
    CS.updateCloudService('queue', next);
    const saved = CS.getCloudServiceAdmin('queue');
    assert.equal(
      typeof saved!.payload.aws.name === 'string' ? saved!.payload.aws.name : saved!.payload.aws.name.en,
      'Amazon SQS (admin)',
    );
  });

  test('create and delete custom role; seeded re-seeds', () => {
    const key = CS.createCloudService({
      roleKey: 'customProbe',
      payload: {
        aws: { name: 'AWS Probe' },
        gcp: { name: 'GCP Probe' },
        azure: { name: 'Azure Probe' },
        selfhosted: { name: 'Self Probe' },
      },
    });
    assert.equal(key, 'customProbe');
    CS.deleteCloudService(key);
    assert.equal(CS.getCloudServiceAdmin(key), null);

    CS.deleteCloudService('queue');
    CS.ensureCloudServicesDomain();
    assert.ok(CS.getCloudServiceAdmin('queue'));
  });

  test('publish ok', () => {
    CS.ensureCloudServicesDomain();
    const result = CS.publishCloudServices();
    assert.equal(result.ok, true);
    const published = CS.getPublishedServices();
    assert.ok(published);
    assert.ok(published!.services.queue);
    assert.ok(published!.verifiedOn);
  });
});
