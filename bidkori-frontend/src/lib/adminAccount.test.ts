import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_PROFILE_LIMITATION_COPY,
  ADMIN_PROFILE_PATH,
  ADMIN_SECURITY_LIMITATION_COPY,
  ADMIN_SETTINGS_PATH,
  ADMIN_UNSUPPORTED_ACCOUNT_ACTIONS,
  adminAccountImpliesUnsupportedAction,
  formatAdminStaffStatus,
} from './adminAccount.ts';

test('admin account paths are canonical', () => {
  assert.equal(ADMIN_PROFILE_PATH, '/admin/profile');
  assert.equal(ADMIN_SETTINGS_PATH, '/admin/settings');
});

test('formatAdminStaffStatus is honest about /me is_staff', () => {
  assert.equal(formatAdminStaffStatus(true), 'Yes');
  assert.equal(formatAdminStaffStatus(false), 'No');
  assert.equal(formatAdminStaffStatus(undefined), 'Unavailable');
  assert.equal(formatAdminStaffStatus(null), 'Unavailable');
});

test('admin profile/settings copy does not imply unsupported capabilities', () => {
  assert.ok(ADMIN_UNSUPPORTED_ACCOUNT_ACTIONS.includes('role editing'));
  assert.ok(ADMIN_UNSUPPORTED_ACCOUNT_ACTIONS.includes('password change'));
  assert.ok(ADMIN_UNSUPPORTED_ACCOUNT_ACTIONS.includes('2FA'));
  assert.ok(ADMIN_UNSUPPORTED_ACCOUNT_ACTIONS.includes('platform settings'));
  assert.equal(
    ADMIN_UNSUPPORTED_ACCOUNT_ACTIONS.includes('user management' as never),
    false,
  );

  assert.equal(
    adminAccountImpliesUnsupportedAction(ADMIN_PROFILE_LIMITATION_COPY),
    false,
  );
  assert.equal(
    adminAccountImpliesUnsupportedAction(ADMIN_SECURITY_LIMITATION_COPY),
    false,
  );

  assert.equal(
    adminAccountImpliesUnsupportedAction('Change role to seller'),
    true,
  );
  assert.equal(
    adminAccountImpliesUnsupportedAction('Enter your new password'),
    true,
  );
  assert.equal(
    adminAccountImpliesUnsupportedAction('Enable 2FA now'),
    true,
  );
  assert.equal(
    adminAccountImpliesUnsupportedAction('Manage users in /admin/users'),
    false,
  );
  assert.equal(
    adminAccountImpliesUnsupportedAction('Set commission rate'),
    true,
  );
});
