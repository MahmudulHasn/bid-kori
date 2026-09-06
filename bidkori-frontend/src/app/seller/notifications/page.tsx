'use client';

import { Suspense } from 'react';

import NotificationListPage from '@/components/notifications/NotificationListPage';

function Fallback() {
  return (
    <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">
      Loading notifications…
    </p>
  );
}

export default function SellerNotificationsPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <NotificationListPage role="SELLER" />
    </Suspense>
  );
}
