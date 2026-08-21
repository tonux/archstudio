import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import {
  domainsForScope,
  filterIssuesByScope,
  type PublishScope,
} from './publish';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';

const issue = (message: string): CatalogIssue => ({ code: 'test', message });

describe('publish scope helpers', () => {
  test('domainsForScope(all) lists every domain', () => {
    assert.deepEqual(domainsForScope('all'), [
      'catalog',
      'templates',
      'architecture',
      'sections',
      'flows',
      'cloud',
      'system_copy',
    ]);
  });

  test('domainsForScope(single) returns that domain only', () => {
    const scopes: PublishScope[] = [
      'catalog',
      'templates',
      'architecture',
      'sections',
      'flows',
      'cloud',
      'system_copy',
    ];
    for (const scope of scopes) {
      assert.deepEqual(domainsForScope(scope), [scope]);
    }
  });

  test('filterIssuesByScope keeps matching source / all', () => {
    const issues = [issue('a')];
    assert.equal(filterIssuesByScope(issues, 'all', 'catalog').length, 1);
    assert.equal(filterIssuesByScope(issues, 'catalog', 'catalog').length, 1);
    assert.equal(filterIssuesByScope(issues, 'templates', 'catalog').length, 0);
    assert.equal(filterIssuesByScope(issues, 'system_copy', 'system_copy').length, 1);
    assert.equal(filterIssuesByScope(issues, 'architecture', 'flows').length, 0);
  });
});
