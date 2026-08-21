'use client';

import { useParams } from 'next/navigation';
import BrickEditor from '@/components/admin/BrickEditor';

export default function AdminBrickDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';

  return <BrickEditor brickId={id} />;
}
