'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import FlowPatternEditor from '@/components/admin/FlowPatternEditor';

function FlowPatternEditorGate() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';
  return <FlowPatternEditor patternId={id} />;
}

export default function AdminFlowDetailPage() {
  return (
    <Suspense fallback={<div className="empty">Loading flow pattern…</div>}>
      <FlowPatternEditorGate />
    </Suspense>
  );
}
