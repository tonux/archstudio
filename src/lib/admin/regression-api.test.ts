/**
 * F-REG API route contracts (R1, R2, R4).
 *
 * Admin routes under src/app/api/admin/** are thin NextResponse wrappers around
 * domain functions (publishCatalog, publishAddSections, …). Prefer exercising
 * those domain functions here — Next Request mocking is unnecessary.
 */
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { publishAddSections } from './add-sections';
import {
  publishCatalog,
  variantRefIssues,
} from '@/lib/lego/admin-catalog';
import * as Repo from '@/lib/lego/repository';
import * as DB from '@/lib/db';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const adminApiRoot = path.join(repoRoot, 'src/app/api/admin');
const adminCatalogSrc = path.join(repoRoot, 'src/lib/lego/admin-catalog.ts');

function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('F-REG R1: catalog publish contract (domain + thin route)', () => {
  test('orphan_variant issue shape is what catalog publish validation uses', () => {
    const issues = variantRefIssues(
      [{ id: 'api-reg-orphan', maps_to: 'missing-brick' }],
      new Set(['identity']),
    );
    assert.ok(issues.some(i => i.code === 'orphan_variant'));
    const src = fs.readFileSync(adminCatalogSrc, 'utf8');
    assert.match(src, /variantRefIssues/);
    assert.match(src, /if \(issues\.length > 0\) return \{ ok: false, issues \}/);
  });

  test('publishCatalog returns ok:false with issue codes when catalog is invalid', () => {
    Repo.ensureLegoCatalog();
    const saved = DB.plain<{ role: string }>(
      DB.db
        .prepare(
          'SELECT role FROM lego_brick_texts WHERE catalog_version=? AND brick_id=? AND lang=?',
        )
        .get(Repo.LEGO_CATALOG_VERSION, 'identity', 'en'),
    );
    assert.ok(saved?.role);

    DB.db
      .prepare(
        'UPDATE lego_brick_texts SET role=? WHERE catalog_version=? AND brick_id=? AND lang=?',
      )
      .run('', Repo.LEGO_CATALOG_VERSION, 'identity', 'en');

    try {
      const result = publishCatalog();
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.issues.length > 0);
        assert.ok(
          result.issues.some(i => i.code === 'missing_role'),
          `expected missing_role, got: ${result.issues.map(i => i.code).join(',')}`,
        );
      }
    } finally {
      DB.db
        .prepare(
          'UPDATE lego_brick_texts SET role=? WHERE catalog_version=? AND brick_id=? AND lang=?',
        )
        .run(saved!.role, Repo.LEGO_CATALOG_VERSION, 'identity', 'en');
    }
  });

  test('catalog publish route is thin wrapper over publishCatalog', () => {
    const route = fs.readFileSync(
      path.join(adminApiRoot, 'catalog/publish/route.ts'),
      'utf8',
    );
    assert.match(route, /from ['"]@\/lib\/lego\/admin-catalog['"]/);
    assert.match(route, /publishCatalog/);
    assert.match(route, /NextResponse\.json/);
    assert.match(route, /issues/);
  });
});

describe('F-REG R4: sections publish placeholder path', () => {
  test('publishAddSections → ok:false + placeholder_section', () => {
    const result = publishAddSections();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some(i => i.code === 'placeholder_section'));
    }
  });

  test('sections publish route is thin wrapper over publishAddSections', () => {
    const route = fs.readFileSync(
      path.join(adminApiRoot, 'sections/publish/route.ts'),
      'utf8',
    );
    assert.match(route, /publishAddSections/);
    assert.match(route, /ok:\s*false|result\.issues/);
  });
});

describe('F-REG R2: no projects CRUD under /api/admin', () => {
  test('admin API tree has no projects route or projects.data CRUD', () => {
    const files = walkTsFiles(adminApiRoot);
    assert.ok(files.length > 0, 'expected admin API routes');

    const projectPaths = files.filter(f => {
      const rel = path.relative(adminApiRoot, f).split(path.sep);
      return rel.some(seg => seg === 'projects' || seg.startsWith('projects.'));
    });
    assert.deepEqual(
      projectPaths,
      [],
      `unexpected projects paths under /api/admin: ${projectPaths.join(', ')}`,
    );

    const hits: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (
        /projects\.data/.test(text) ||
        /\b(create|update|delete|list)Project\b/.test(text) ||
        /\/api\/admin\/projects/.test(text)
      ) {
        hits.push(path.relative(repoRoot, file));
      }
    }
    assert.deepEqual(hits, [], `projects CRUD surface in admin API: ${hits.join(', ')}`);
  });
});
