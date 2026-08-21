/**
 * F-REG UI static regression (R2 + UX anti).
 * Source-text scans only — no Playwright / RTL / Vitest.
 */
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const adminAppDir = path.join(repoRoot, 'src/app/admin');
const adminComponentsDir = path.join(repoRoot, 'src/components/admin');

const FORBIDDEN_IMPORT_RE =
  /from\s+['"](?:lucide-react|lucide|@radix-ui\/[^'"]+|@heroicons\/[^'"]+|heroicons|@\/components\/ui(?:\/[^'"]*)?)['"]|require\(\s*['"](?:lucide-react|lucide|@radix-ui\/|@heroicons\/|heroicons|@\/components\/ui)/;

const PROJECTS_CRUD_RE =
  /projects\.data|\/api\/admin\/projects\b|\b(?:create|update|delete)Project\b|admin\/projects\b/;

/** Emoji pictographic block U+1F300–U+1FAFF (same as F-UX7 / ISC-UX11). */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}]/u;

function walkSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSourceFiles(full));
    else if (entry.isFile() && /\.(tsx?|jsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function collectHits(files: string[], re: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (re.test(text)) hits.push(path.relative(repoRoot, file));
  }
  return hits;
}

describe('F-REG R2: admin UI has no projects CRUD surface', () => {
  test('0 matches for projects.data / admin project CRUD in admin app+components', () => {
    const files = [...walkSourceFiles(adminAppDir), ...walkSourceFiles(adminComponentsDir)];
    assert.ok(files.length > 0);
    const hits = collectHits(files, PROJECTS_CRUD_RE);
    assert.deepEqual(hits, [], `projects CRUD in admin UI: ${hits.join(', ')}`);
  });
});

describe('F-REG UX anti: no lucide/radix/shadcn/heroicons/ui kit', () => {
  test('0 forbidden UI-kit imports in admin app+components', () => {
    const files = [...walkSourceFiles(adminAppDir), ...walkSourceFiles(adminComponentsDir)];
    const hits = collectHits(files, FORBIDDEN_IMPORT_RE);
    assert.deepEqual(hits, [], `forbidden UI imports: ${hits.join(', ')}`);
  });
});

describe('F-REG UX anti: no emoji U+1F300–U+1FAFF', () => {
  test('0 emoji in admin app+components source', () => {
    const files = [...walkSourceFiles(adminAppDir), ...walkSourceFiles(adminComponentsDir)];
    const hits = collectHits(files, EMOJI_RE);
    assert.deepEqual(hits, [], `emoji in admin sources: ${hits.join(', ')}`);
  });
});

describe('F-REG: IssueList keys include list index', () => {
  test('IssueList key template suffixes map index (prevents duplicate keys)', () => {
    const issueListPath = path.join(adminComponentsDir, 'IssueList.tsx');
    const src = fs.readFileSync(issueListPath, 'utf8');
    // Must keep index in React key — same code+entityId can appear twice.
    const hasIndexInKey =
      /key\s*=\s*\{[^}]*\$\{i\}/.test(src) ||
      /const key = `[^`]*\$\{i\}`/.test(src) ||
      /`-\$\{i\}`|-\$\{i\}/.test(src);
    assert.ok(
      hasIndexInKey,
      'IssueList key must include list index (${i}) to avoid duplicate-key regression',
    );
  });
});
