import { requirePage } from '@/lib/auth/guard';
import { listProposals } from '@/lib/proposals';
import Reviews from '@/components/Reviews';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Reviews · ArchStudio',
  description: 'Proposed changes waiting for an architect.'
};

export default async function ReviewsPage() {
  await requirePage();
  return <Reviews initial={listProposals('open')} />;
}
