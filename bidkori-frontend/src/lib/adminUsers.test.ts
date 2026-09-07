import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_PROTECTED_ACCOUNT_COPY,
  ADMIN_USERS_API_PATH,
  ADMIN_USERS_PAGE_SIZE,
  ADMIN_USERS_PATH,
  ADMIN_USER_ALLOWED_METHODS,
  ADMIN_USER_REACTIVATE_CONFIRM_POINTS,
  ADMIN_USER_SUSPEND_CONFIRM_POINTS,
  adminUserAllowsDeleteUi,
  adminUserAllowsGenericEditUi,
  adminUserDetailPath,
  adminUsersFiltersAreActive,
  buildAdminUserDetailApiPath,
  buildAdminUserReactivateApiPath,
  buildAdminUserSuspendApiPath,
  buildAdminUsersApiPath,
  buildAdminUsersPageHref,
  formatAdminUserRole,
  formatAdminUserStatus,
  getAdminUserAccountAction,
  isProtectedAdminAccount,
  parseAdminUserRoleFilter,
  parseAdminUsersPageParam,
  parseAdminUserStatusFilter,
} from './adminUsers.ts';
import { WORKSPACE_CONFIGS, isNavItemActive } from './workspaceNavigation.ts';
import { getRoleHome } from './authRouting.ts';
import type { AdminUser, AuthUser } from './types.ts';

const buyer: AdminUser = {
  id: 10,
  username: 'buyer1',
  email: 'buyer1@test.com',
  role: 'BUYER',
  is_active: true,
  is_staff: false,
  is_superuser: false,
  date_joined: '2026-01-01T00:00:00Z',
};

const adminActor: AuthUser = {
  id: 1,
  username: 'admin',
  email: 'admin@test.com',
  role: 'ADMIN',
  is_staff: true,
};

test('admin users paths and page size', () => {
  assert.equal(ADMIN_USERS_PATH, '/admin/users');
  assert.equal(ADMIN_USERS_API_PATH, '/admin/users/');
  assert.equal(ADMIN_USERS_PAGE_SIZE, 20);
  assert.equal(adminUserDetailPath(7), '/admin/users/7');
  assert.equal(buildAdminUserDetailApiPath(7), '/admin/users/7/');
  assert.equal(buildAdminUserSuspendApiPath(7), '/admin/users/7/suspend/');
  assert.equal(
    buildAdminUserReactivateApiPath(7),
    '/admin/users/7/reactivate/',
  );
});

test('list query builder encodes search role is_active page', () => {
  assert.equal(buildAdminUsersApiPath({}), '/admin/users/');
  assert.equal(buildAdminUsersApiPath({ page: 1 }), '/admin/users/');
  assert.equal(
    buildAdminUsersApiPath({ page: 2 }),
    '/admin/users/?page=2',
  );
  assert.match(
    buildAdminUsersApiPath({ search: 'rahim' }),
    /search=rahim/,
  );
  assert.match(
    buildAdminUsersApiPath({ role: 'BUYER' }),
    /role=BUYER/,
  );
  assert.match(
    buildAdminUsersApiPath({ role: 'SELLER' }),
    /role=SELLER/,
  );
  assert.match(
    buildAdminUsersApiPath({ role: 'ADMIN' }),
    /role=ADMIN/,
  );
  assert.match(
    buildAdminUsersApiPath({ status: 'active' }),
    /is_active=true/,
  );
  assert.match(
    buildAdminUsersApiPath({ status: 'suspended' }),
    /is_active=false/,
  );
  assert.doesNotMatch(
    buildAdminUsersApiPath({ role: 'all', status: 'all', search: '  ' }),
    /role=|is_active=|search=/,
  );
});

test('page href mirrors filters for refresh/back', () => {
  assert.equal(buildAdminUsersPageHref({}), '/admin/users');
  assert.equal(
    buildAdminUsersPageHref({
      page: 2,
      search: 'rahim',
      role: 'BUYER',
      status: 'active',
    }),
    '/admin/users?page=2&search=rahim&role=BUYER&is_active=true',
  );
});

test('query parsers', () => {
  assert.equal(parseAdminUsersPageParam(null), 1);
  assert.equal(parseAdminUsersPageParam('0'), 1);
  assert.equal(parseAdminUsersPageParam('3'), 3);
  assert.equal(parseAdminUserRoleFilter('buyer'), 'BUYER');
  assert.equal(parseAdminUserRoleFilter('nope'), 'all');
  assert.equal(parseAdminUserStatusFilter('true'), 'active');
  assert.equal(parseAdminUserStatusFilter('false'), 'suspended');
  assert.equal(parseAdminUserStatusFilter('maybe'), 'all');
  assert.equal(
    adminUsersFiltersAreActive({ search: 'a', role: 'all', status: 'all' }),
    true,
  );
  assert.equal(
    adminUsersFiltersAreActive({ search: '', role: 'all', status: 'all' }),
    false,
  );
});

test('status and role labels', () => {
  assert.equal(formatAdminUserStatus(true), 'Active');
  assert.equal(formatAdminUserStatus(false), 'Suspended');
  assert.equal(formatAdminUserRole('BUYER'), 'Buyer');
  assert.equal(formatAdminUserRole('SELLER'), 'Seller');
  assert.equal(formatAdminUserRole('ADMIN'), 'Admin');
});

test('action eligibility for buyer seller admin staff self', () => {
  assert.equal(getAdminUserAccountAction(buyer, adminActor), 'suspend');
  assert.equal(
    getAdminUserAccountAction({ ...buyer, is_active: false }, adminActor),
    'reactivate',
  );
  assert.equal(
    getAdminUserAccountAction(
      { ...buyer, role: 'SELLER', username: 'seller1' },
      adminActor,
    ),
    'suspend',
  );
  assert.equal(
    getAdminUserAccountAction(
      {
        ...buyer,
        role: 'SELLER',
        is_active: false,
      },
      adminActor,
    ),
    'reactivate',
  );

  const adminUser: AdminUser = {
    ...buyer,
    id: 99,
    role: 'ADMIN',
    is_staff: true,
    is_superuser: false,
  };
  assert.equal(isProtectedAdminAccount(adminUser), true);
  assert.equal(getAdminUserAccountAction(adminUser, adminActor), null);

  assert.equal(
    getAdminUserAccountAction(
      { ...buyer, is_staff: true, role: 'BUYER' },
      adminActor,
    ),
    null,
  );
  assert.equal(
    getAdminUserAccountAction(
      { ...buyer, is_superuser: true, role: 'BUYER' },
      adminActor,
    ),
    null,
  );
  assert.equal(
    getAdminUserAccountAction({ ...buyer, id: adminActor.id }, adminActor),
    null,
  );
});

test('confirmation copy covers access and data-preservation points', () => {
  const suspendBlob = ADMIN_USER_SUSPEND_CONFIRM_POINTS.join(' ').toLowerCase();
  assert.match(suspendBlob, /access/);
  assert.match(suspendBlob, /token/);
  assert.match(suspendBlob, /remain/);
  const reactivateBlob =
    ADMIN_USER_REACTIVATE_CONFIRM_POINTS.join(' ').toLowerCase();
  assert.match(reactivateBlob, /log in again/);
  assert.match(ADMIN_PROTECTED_ACCOUNT_COPY.toLowerCase(), /admin accounts/);
});

test('no delete or generic edit surface', () => {
  assert.equal(adminUserAllowsDeleteUi(), false);
  assert.equal(adminUserAllowsGenericEditUi(), false);
  assert.ok(ADMIN_USER_ALLOWED_METHODS.includes('GET'));
  assert.ok(ADMIN_USER_ALLOWED_METHODS.includes('POST'));
  assert.equal(ADMIN_USER_ALLOWED_METHODS.includes('DELETE' as never), false);
  assert.equal(ADMIN_USER_ALLOWED_METHODS.includes('PATCH' as never), false);
  assert.equal(ADMIN_USER_ALLOWED_METHODS.includes('PUT' as never), false);
  assert.doesNotMatch(adminUserDetailPath(1), /edit/);
});

test('Admin Users nav enabled; Categories/Reports stay disabled', () => {
  const admin = WORKSPACE_CONFIGS.ADMIN;
  const users = admin.navItems.find((item) => item.id === 'users');
  assert.equal(users?.enabled, true);
  assert.equal(users?.href, ADMIN_USERS_PATH);

  const home = getRoleHome('ADMIN');
  assert.equal(isNavItemActive('/admin/users', users!, home), true);
  assert.equal(
    isNavItemActive('/admin/users/3', users!, home),
    true,
  );

  for (const id of ['categories', 'reports']) {
    assert.equal(admin.navItems.find((item) => item.id === id)?.enabled, false);
  }

  for (const id of [
    'dashboard',
    'users',
    'products',
    'auctions',
    'bids',
    'analytics',
    'profile',
    'settings',
  ]) {
    assert.equal(admin.navItems.find((item) => item.id === id)?.enabled, true);
  }

  assert.equal(WORKSPACE_CONFIGS.BUYER.navItems.some((i) => i.id === 'users'), false);
  assert.equal(
    WORKSPACE_CONFIGS.SELLER.navItems.some((i) => i.id === 'users'),
    false,
  );
});
