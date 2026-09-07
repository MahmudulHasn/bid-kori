import type { AuthUser } from './types.ts';

/** Canonical Admin account routes. */
export const ADMIN_PROFILE_PATH = '/admin/profile';
export const ADMIN_SETTINGS_PATH = '/admin/settings';

export const ADMIN_PROFILE_LIMITATION_COPY =
  'Admin account details are read-only in BidKori. Account editing is not available through the current API.';

export const ADMIN_SECURITY_LIMITATION_COPY =
  'Password and multi-factor authentication controls are not available through the current BidKori API.';

/**
 * Capabilities the Admin Profile/Settings UI must NOT imply.
 * There is no REST support for these actions.
 */
export const ADMIN_UNSUPPORTED_ACCOUNT_ACTIONS = [
  'role editing',
  'password change',
  '2FA',
  'platform settings',
] as const;

/** Human-readable staff flag from /users/me/ `is_staff`. */
export function formatAdminStaffStatus(
  isStaff: AuthUser['is_staff'] | null | undefined,
): string {
  if (isStaff === true) return 'Yes';
  if (isStaff === false) return 'No';
  return 'Unavailable';
}

export function adminAccountImpliesUnsupportedAction(copy: string): boolean {
  const lower = copy.toLowerCase();
  return ADMIN_UNSUPPORTED_ACCOUNT_ACTIONS.some((action) => {
    switch (action) {
      case 'role editing':
        return (
          lower.includes('change role') ||
          lower.includes('promote') ||
          lower.includes('demote')
        );
      case 'password change':
        return (
          lower.includes('change password') ||
          lower.includes('new password') ||
          lower.includes('current password')
        );
      case '2FA':
        return (
          lower.includes('2fa') ||
          lower.includes('two-factor') ||
          (lower.includes('multi-factor') && lower.includes('enable'))
        );
      case 'platform settings':
        return (
          lower.includes('commission') ||
          lower.includes('feature flag') ||
          lower.includes('auction defaults')
        );
      default:
        return false;
    }
  });
}
