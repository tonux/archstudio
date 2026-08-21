import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as FP from './flow-patterns';
import { FLOW_CATALOG } from '../flows/catalog';
import { countMappableSteps } from '../flows/plate';
import { matchSteps } from '../flows/match';
import { legoCatalog } from '../lego/repository';
import demoJson from '../seed/demo.json';
import { normalizeArchitecture } from '../defaults';

function locEn(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return (v as { en?: string }).en ?? '';
}

describe('flow-patterns admin', () => {
  test('seeds locked library on ensure', () => {
    FP.ensureFlowPatternsDomain();
    const list = FP.listFlowPatternsAdmin();
    assert.ok(list.length >= FLOW_CATALOG.length);
    assert.ok(list.some(p => p.id === 'auth-login'));
    assert.equal(list.find(p => p.id === 'auth-login')?.locked, true);
  });

  test('get and update bilingual pattern', () => {
    const tpl = FP.getFlowPatternAdmin('auth-login');
    assert.ok(tpl);
    const next = structuredClone(tpl);
    next.tagline = { ...(typeof next.tagline === 'string' ? { en: next.tagline, fr: next.tagline } : next.tagline), en: 'Sign-in journey (admin test)' };
    FP.updateFlowPattern('auth-login', next);
    const saved = FP.getFlowPatternAdmin('auth-login');
    assert.equal(locEn(saved?.tagline), 'Sign-in journey (admin test)');
  });

  test('hint edit updates demo match count (ISC-A4)', () => {
    const seed = FLOW_CATALOG.find(p => p.id === 'auth-login');
    assert.ok(seed);
    FP.updateFlowPattern('auth-login', structuredClone(seed));
    const tpl = FP.getFlowPatternAdmin('auth-login');
    assert.ok(tpl);
    const doc = normalizeArchitecture(demoJson as Parameters<typeof normalizeArchitecture>[0]);
    const catalog = legoCatalog('en');

    const before = FP.templateToResolvedPattern(tpl, 'en');
    const beforeMatched = matchSteps(before.steps, doc.components).filter(b => b.component).length;

    const next = structuredClone(tpl);
    const authStep = next.steps.find(s => s.key === 'auth');
    assert.ok(authStep);
    authStep.hint = { name: ['__no_match_xyz__'], avoid: ['identity', 'auth', 'web', 'api', 'gateway'] };

    FP.updateFlowPattern('auth-login', next);
    const after = FP.templateToResolvedPattern(FP.getFlowPatternAdmin('auth-login')!, 'en');
    const afterMatched = matchSteps(after.steps, doc.components).filter(b => b.component).length;

    assert.ok(countMappableSteps(after, catalog) >= 0);
    assert.ok(beforeMatched > afterMatched, 'hint change should reduce demo bindings');
  });

  test('create and delete custom pattern', () => {
    const id = FP.createFlowPattern({
      nameEn: 'Ops handoff (test)',
      nameFr: 'Handoff ops (test)',
    });
    assert.match(id, /^ops-handoff-test$/);
    const detail = FP.getFlowPatternAdmin(id);
    assert.ok(detail);
    assert.equal(detail.steps.length, 2);
    assert.equal(FP.listFlowPatternsAdmin().find(p => p.id === id)?.locked, false);
    FP.updateFlowPattern(id, { ...detail, tagline: { en: 'Custom tagline', fr: 'Accroche' } });
    assert.equal(locEn(FP.getFlowPatternAdmin(id)!.tagline), 'Custom tagline');
    FP.deleteFlowPattern(id);
    assert.equal(FP.getFlowPatternAdmin(id), null);
  });

  test('create rejects duplicate id', () => {
    const id = FP.createFlowPattern({ nameEn: 'Duplicate probe flow' });
    assert.throws(
      () => FP.createFlowPattern({ id, nameEn: 'Another' }),
      /already exists/,
    );
    FP.deleteFlowPattern(id);
  });

  test('deleted locked pattern is re-seeded on next read', () => {
    FP.deleteFlowPattern('incident');
    const restored = FP.getFlowPatternAdmin('incident');
    assert.ok(restored);
    assert.equal(restored.id, 'incident');
  });

  test('publish succeeds for seeded patterns', () => {
    const result = FP.publishFlowPatterns();
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.publishedAt);
    const published = FP.getPublishedFlowCatalog('en');
    assert.ok(published.length >= FLOW_CATALOG.length);
    assert.equal(published[0]?.source, 'catalog');
  });
});
