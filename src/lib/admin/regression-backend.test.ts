/**
 * F-REG backend regression (R1, R4).
 * Thin, named assertions that fail loudly if orphan_variant / placeholder_section
 * gates are removed from domain publish paths.
 */
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { publishAddSections } from './add-sections';
import { variantRefIssues } from '@/lib/lego/admin-catalog';

describe('F-REG R1: catalog publish rejects orphan_variant', () => {
  test('variantRefIssues emits orphan_variant when maps_to brick is missing', () => {
    const issues = variantRefIssues(
      [{ id: 'reg-orphan-variant', maps_to: 'no-such-brick' }],
      new Set(['identity']),
    );
    assert.ok(
      issues.some(
        issue =>
          issue.code === 'orphan_variant' && issue.entityId === 'reg-orphan-variant',
      ),
      'expected orphan_variant issue — catalog publish gate must not be removed',
    );
  });

  test('variantRefIssues stays quiet when maps_to brick exists', () => {
    const issues = variantRefIssues(
      [{ id: 'ok-variant', maps_to: 'identity' }],
      new Set(['identity']),
    );
    assert.equal(issues.some(issue => issue.code === 'orphan_variant'), false);
  });
});

describe('F-REG R4: ADD/sections publish blocked on placeholder_section', () => {
  test('publishAddSections returns ok:false with placeholder_section', () => {
    const result = publishAddSections();
    assert.equal(result.ok, false, 'seed sections still contain placeholders');
    if (!result.ok) {
      assert.ok(
        result.issues.some(i => i.code === 'placeholder_section'),
        'expected placeholder_section — sections publish gate must not be removed',
      );
    }
  });
});
