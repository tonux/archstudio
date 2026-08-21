'use client';

import type { ReactNode } from 'react';

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
