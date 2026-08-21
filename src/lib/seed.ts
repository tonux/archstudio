import { createFolder, createProject, isEmpty, listFolders } from './store';
import { ensureLegoCatalog } from './lego/repository';
import { backfillIndex } from './ea/hydrate';
import demo from './seed/demo.json';
import type { Architecture } from './types';

/**
 * A brand-new install with an empty grid teaches nothing. First run drops one
 * real architecture in an "Examples" folder so the editor has something to
 * open — delete the folder and it is gone for good.
 */
export function ensureSeed(): void {
  ensureLegoCatalog();
  /* Derived tables for documents that predate them. A no-op on every run but
   * the first after an upgrade. */
  backfillIndex();
  if (!isEmpty() || listFolders().length) return;

  const examples = createFolder('Examples', null, '#0099A0');

  createProject({
    name: 'Acme — two platforms',
    folderId: examples.id,
    description: 'The reference example: a consumer platform and a business platform on separate stacks.',
    accent: '#4F8AC6',
    data: demo as unknown as Architecture
  });
}
