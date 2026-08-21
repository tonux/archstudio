import { requirePage } from '@/lib/auth/guard';
import Compliance from '@/components/ea/Compliance';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Compliance · ArchStudio',
  description: 'Where the referential and the drawings disagree with the rules this organisation set.'
};

export default async function CompliancePage() {
  await requirePage();
  return <Compliance />;
}
