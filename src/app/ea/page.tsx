import { requirePage } from '@/lib/auth/guard';
import { listEntities } from '@/lib/ea/repository';
import Referential from '@/components/ea/Referential';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Referential · ArchStudio',
  description: 'Applications, capabilities, actors, business objects and technology standards — each of them once.'
};

export default async function ReferentialPage() {
  await requirePage();
  return <Referential initial={listEntities()} />;
}
