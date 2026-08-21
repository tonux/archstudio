'use client';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { PublishWizard } from '@/components/admin/PublishWizard';

export default function AdminPublishPage() {
  return (
    <div className="workspace">
      <AdminPageHeader
        lede="Review validation, then publish catalogue and templates."
      />
      <div className="ws-body">
        <div className="cpanel" style={{ maxWidth: 720 }}>
          <PublishWizard />
        </div>
      </div>
    </div>
  );
}
