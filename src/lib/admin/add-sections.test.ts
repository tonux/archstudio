import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as AS from './add-sections';
import { PRESET_SECTION_IDS } from '../document/preset';

describe('add-sections admin', () => {
  test('seeds preset library on ensure', () => {
    AS.ensureAddSectionsDomain();
    const list = AS.listAddSectionsAdmin();
    assert.ok(list.length >= PRESET_SECTION_IDS.length);
    assert.ok(list.some(s => s.id === 'add-data'));
  });

  test('get and update bilingual section', () => {
    const detail = AS.getAddSectionAdmin('add-data');
    assert.ok(detail);
    const next = structuredClone(detail);
    next.en.title = 'Data architecture (admin test)';
    AS.updateAddSection('add-data', { en: next.en, fr: next.fr });
    const saved = AS.getAddSectionAdmin('add-data');
    assert.equal(saved?.en.title, 'Data architecture (admin test)');
  });

  test('publish blocked when placeholders remain', () => {
    const result = AS.publishAddSections();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.length > 0);
      assert.ok(result.issues.some(i => i.code === 'placeholder_section'));
    }
  });

  // F-REG R4 — named regression (duplicate assert so removal of the gate fails loudly)
  test('F-REG R4: publishAddSections rejects with placeholder_section', () => {
    const result = AS.publishAddSections();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.issues.some(i => i.code === 'placeholder_section'),
        'placeholder_section gate must remain on ADD/sections publish',
      );
    }
  });

  test('preview html includes section title', () => {
    const detail = AS.getAddSectionAdmin('add-scope');
    assert.ok(detail);
    const html = AS.buildSectionPreviewHtml(detail.en, 'en');
    assert.ok(html.includes(detail.en.title));
  });

  test('create and delete custom section', () => {
    const id = AS.createAddSection({
      type: 'text',
      titleEn: 'Ops runbook (test)',
      titleFr: 'Runbook ops (test)',
    });
    assert.match(id, /^ops-runbook-test$/);
    const detail = AS.getAddSectionAdmin(id);
    assert.ok(detail);
    assert.equal(detail.en.title, 'Ops runbook (test)');
    assert.equal(detail.fr.title, 'Runbook ops (test)');
    AS.deleteAddSection(id);
    assert.equal(AS.getAddSectionAdmin(id), null);
  });

  test('create rejects duplicate id', () => {
    const id = AS.createAddSection({ type: 'cards', titleEn: 'Duplicate probe' });
    assert.throws(
      () => AS.createAddSection({ id, type: 'cards', titleEn: 'Another' }),
      /already exists/,
    );
    AS.deleteAddSection(id);
  });
});
