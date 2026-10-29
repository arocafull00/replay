'use client';

import { AdminPanel } from '@/components/admin/admin-panel';
import { AccessGate } from '@/components/access-gate';

export default function AdminPage() {
  return <AccessGate role="admin"><AdminPanel /></AccessGate>;
}
