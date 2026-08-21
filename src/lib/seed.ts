import { createFolder, createProject, isEmpty, listFolders } from './store';
import { ensureLegoCatalog } from './lego/repository';
import { contentFromAdmin } from './admin/flags';
import { getFeaturedPublishedProjectTemplate, instantiateProjectTemplate } from './admin/project-templates';
import demo from './seed/demo.json';
import type { Architecture } from './types';

/**
 * A brand-new install with an empty grid teaches nothing. First run drops one
 * real architecture in an "Examples" folder so the editor has something to
 * open — delete the folder and it is gone for good.
 */
export function ensureSeed(): void {
  ensureLegoCatalog();
  if (!isEmpty() || listFolders().length) return;

  const examples = createFolder('Examples', null, '#0099A0');

  if (contentFromAdmin()) {
    const featured = getFeaturedPublishedProjectTemplate();
    if (featured) {
      const seedName = featured.meta.seedName ?? featured.nameEn;
      createProject({
        name: seedName,
        folderId: examples.id,
        description: featured.meta.descriptionEn ?? featured.meta.taglineEn,
        accent: featured.meta.accent,
        data: instantiateProjectTemplate(featured, seedName),
      });
      return;
    }
  }

  createProject({
    name: 'Acme — two platforms',
    folderId: examples.id,
    description: 'The reference example: a consumer platform and a business platform on separate stacks.',
    accent: '#4F8AC6',
    data: demo as unknown as Architecture
  });
}
