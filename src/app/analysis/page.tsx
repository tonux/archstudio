import { requirePage } from '@/lib/auth/guard';
import { listEntities } from '@/lib/ea/repository';
import Analysis from '@/components/ea/Analysis';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Analysis · ArchStudio',
  description: 'Impact, capability coverage and technology usage, across every project at once.'
};

export default async function AnalysisPage() {
  await requirePage();
  return <Analysis entities={listEntities()} />;
}
