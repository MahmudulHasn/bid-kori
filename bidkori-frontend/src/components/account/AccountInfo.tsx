import { getRoleDisplayLabel } from '@/lib/workspaceNavigation';
import type { AuthUser } from '@/lib/types';

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'Unavailable';
}

export default function AccountInfo({ user }: { user: AuthUser | null }) {
  const roleLabel = user?.role ? getRoleDisplayLabel(user.role) : 'Unavailable';

  return (
    <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
      <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Username
        </dt>
        <dd className="text-sm font-medium text-zinc-900 dark:text-white">
          {displayValue(user?.username)}
        </dd>
      </div>
      <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Email
        </dt>
        <dd className="break-all text-sm font-medium text-zinc-900 dark:text-white">
          {displayValue(user?.email)}
        </dd>
      </div>
      <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Account Type
        </dt>
        <dd className="text-sm font-medium text-zinc-900 dark:text-white">
          {roleLabel}
        </dd>
      </div>
    </dl>
  );
}
