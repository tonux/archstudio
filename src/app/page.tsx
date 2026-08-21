import { listFolders, listProjects } from '@/lib/store';
import { requirePage } from '@/lib/auth/guard';
import { ensureSeed } from '@/lib/seed';
import Workspace from '@/components/Workspace';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await requirePage();
  ensureSeed();
  return <Workspace initialFolders={listFolders()} initialProjects={listProjects()} />;
}
