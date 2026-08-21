'use client';

import { useParams } from 'next/navigation';
import SectionEditor from '@/components/admin/SectionEditor';

export default function AdminSectionDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';

  return <SectionEditor sectionId={id} />;
}
