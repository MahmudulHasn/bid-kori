import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PUBLIC_ACCOUNT_TYPE_OPTIONS,
  PUBLIC_REGISTRATION_ROLES,
  buildLoginHref,
  buildRegisterPayload,
  buildSafeNextPath,
  evaluateRoleAccess,
  getRoleHome,
  hasSessionHintCookie,
  isAdmin,
  isBuyer,
  isProtectedPath,
  isRoleAllowed,
  isRoleWorkspacePath,
  isSafeNextPath,
  isSeller,
  normalizePublicRegistrationRole,
  resolvePostAuthPath,
  SESSION_HINT_COOKIE,
  LEGACY_TOKEN_COOKIE,
} from './authRouting.ts';
import type { AuthUser, UserRole } from './types.ts';

test('isProtectedPath covers dashboard, create auction, and role workspaces', () => {
  assert.equal(isProtectedPath('/dashboard'), true);
  assert.equal(isProtectedPath('/dashboard/settings'), true);
  assert.equal(isProtectedPath('/auctions/create'), true);
  assert.equal(isProtectedPath('/auctions/create/extra'), true);
  assert.equal(isProtectedPath('/buyer'), true);
  assert.equal(isProtectedPath('/buyer/my-bids'), true);
  assert.equal(isProtectedPath('/seller'), true);
  assert.equal(isProtectedPath('/seller/products'), true);
  assert.equal(isProtectedPath('/admin'), true);
  assert.equal(isProtectedPath('/admin/users'), true);
  assert.equal(isProtectedPath('/'), false);
  assert.equal(isProtectedPath('/auctions/1'), false);
  assert.equal(isProtectedPath('/auth/login'), false);
  assert.equal(isProtectedPath('/unauthorized'), false);
});

test('isSafeNextPath rejects open redirects', () => {
  assert.equal(isSafeNextPath('/dashboard'), true);
  assert.equal(isSafeNextPath('/auctions/create'), true);
  assert.equal(isSafeNextPath('/buyer'), true);
  assert.equal(isSafeNextPath('/seller?tab=1'), true);
  assert.equal(isSafeNextPath('https://evil.example'), false);
  assert.equal(isSafeNextPath('//evil.example'), false);
  assert.equal(isSafeNextPath('\\evil'), false);
  assert.equal(isSafeNextPath(null), false);
});

test('hasSessionHintCookie treats cookies as UX hints only', () => {
  assert.equal(
    hasSessionHintCookie({
      get: (name) => (name === SESSION_HINT_COOKIE ? { value: '1' } : undefined),
    }),
    true,
  );
  assert.equal(
    hasSessionHintCookie({
      get: (name) =>
        name === LEGACY_TOKEN_COOKIE ? { value: 'not-validated' } : undefined,
    }),
    true,
  );
  assert.equal(
    hasSessionHintCookie({
      get: () => undefined,
    }),
    false,
  );
});

test('UserRole / AuthUser contract accepts BUYER, SELLER, ADMIN', () => {
  const roles: UserRole[] = ['BUYER', 'SELLER', 'ADMIN'];
  const users: AuthUser[] = roles.map((role, index) => ({
    id: index + 1,
    username: `user_${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@example.com`,
    role,
    is_staff: role === 'ADMIN',
  }));

  assert.equal(users[0].role, 'BUYER');
  assert.equal(users[1].role, 'SELLER');
  assert.equal(users[2].role, 'ADMIN');
  assert.equal(users[2].is_staff, true);
  assert.equal(isBuyer(users[0]), true);
  assert.equal(isSeller(users[1]), true);
  assert.equal(isAdmin(users[2]), true);
});

test('getRoleHome maps each authoritative role', () => {
  assert.equal(getRoleHome('BUYER'), '/buyer');
  assert.equal(getRoleHome('SELLER'), '/seller');
  assert.equal(getRoleHome('ADMIN'), '/admin');
});

test('resolvePostAuthPath prefers safe next over role home', () => {
  assert.equal(resolvePostAuthPath('/dashboard', 'BUYER'), '/dashboard');
  assert.equal(resolvePostAuthPath('/auctions/create', 'SELLER'), '/auctions/create');
  assert.equal(resolvePostAuthPath(null, 'BUYER'), '/buyer');
  assert.equal(resolvePostAuthPath(undefined, 'SELLER'), '/seller');
  assert.equal(resolvePostAuthPath('', 'ADMIN'), '/admin');
});

test('resolvePostAuthPath rejects unsafe next and falls back to role home', () => {
  assert.equal(resolvePostAuthPath('https://evil.example', 'BUYER'), '/buyer');
  assert.equal(resolvePostAuthPath('//evil.example', 'SELLER'), '/seller');
  assert.equal(resolvePostAuthPath('\\evil', 'ADMIN'), '/admin');
});

test('registration payload only serializes BUYER or SELLER', () => {
  const buyerPayload = buildRegisterPayload({
    username: 'rahim',
    email: 'rahim@example.com',
    password: 'password12',
    confirmPassword: 'password12',
    role: 'BUYER',
  });
  assert.deepEqual(buyerPayload, {
    username: 'rahim',
    email: 'rahim@example.com',
    password: 'password12',
    confirm_password: 'password12',
    role: 'BUYER',
  });
  assert.equal('is_staff' in buyerPayload, false);

  const sellerPayload = buildRegisterPayload({
    username: 'seller',
    email: 'seller@example.com',
    password: 'password12',
    confirmPassword: 'password12',
    role: 'SELLER',
  });
  assert.equal(sellerPayload.role, 'SELLER');

  const defaultPayload = buildRegisterPayload({
    username: 'legacy',
    email: 'legacy@example.com',
    password: 'password12',
    confirmPassword: 'password12',
  });
  assert.equal(defaultPayload.role, 'BUYER');

  assert.equal(normalizePublicRegistrationRole('ADMIN'), 'BUYER');
  assert.equal(normalizePublicRegistrationRole('STAFF'), 'BUYER');
  assert.deepEqual([...PUBLIC_REGISTRATION_ROLES], ['BUYER', 'SELLER']);
  assert.ok(!PUBLIC_REGISTRATION_ROLES.includes('ADMIN' as never));
  assert.ok(
    PUBLIC_ACCOUNT_TYPE_OPTIONS.every((option) => option.role !== 'ADMIN'),
  );
  assert.equal(
    PUBLIC_ACCOUNT_TYPE_OPTIONS.some((option) => option.label === 'Admin'),
    false,
  );
});

test('role workspace allow-lists enforce single-role isolation', () => {
  assert.equal(isRoleAllowed('BUYER', ['BUYER']), true);
  assert.equal(isRoleAllowed('SELLER', ['SELLER']), true);
  assert.equal(isRoleAllowed('ADMIN', ['ADMIN']), true);

  assert.equal(isRoleAllowed('BUYER', ['SELLER']), false);
  assert.equal(isRoleAllowed('BUYER', ['ADMIN']), false);
  assert.equal(isRoleAllowed('SELLER', ['BUYER']), false);
  assert.equal(isRoleAllowed('SELLER', ['ADMIN']), false);
  assert.equal(isRoleAllowed('ADMIN', ['BUYER']), false);
  assert.equal(isRoleAllowed('ADMIN', ['SELLER']), false);
});

test('evaluateRoleAccess covers loading, guest, allowed, and forbidden', () => {
  assert.deepEqual(
    evaluateRoleAccess({
      isLoading: true,
      isAuthenticated: false,
      userRole: undefined,
      allowedRoles: ['BUYER'],
    }),
    { status: 'loading' },
  );

  assert.deepEqual(
    evaluateRoleAccess({
      isLoading: false,
      isAuthenticated: false,
      userRole: undefined,
      allowedRoles: ['BUYER'],
    }),
    { status: 'unauthenticated' },
  );

  assert.deepEqual(
    evaluateRoleAccess({
      isLoading: false,
      isAuthenticated: true,
      userRole: 'BUYER',
      allowedRoles: ['BUYER'],
    }),
    { status: 'allowed', role: 'BUYER' },
  );

  assert.deepEqual(
    evaluateRoleAccess({
      isLoading: false,
      isAuthenticated: true,
      userRole: 'BUYER',
      allowedRoles: ['SELLER'],
    }),
    { status: 'forbidden', role: 'BUYER' },
  );

  assert.deepEqual(
    evaluateRoleAccess({
      isLoading: false,
      isAuthenticated: true,
      userRole: 'ADMIN',
      allowedRoles: ['BUYER'],
    }),
    { status: 'forbidden', role: 'ADMIN' },
  );
});

test('unauthorized recovery uses role home for each role', () => {
  assert.equal(getRoleHome('BUYER'), '/buyer');
  assert.equal(getRoleHome('SELLER'), '/seller');
  assert.equal(getRoleHome('ADMIN'), '/admin');
});

test('safe login next generation works for role routes', () => {
  assert.equal(buildSafeNextPath('/buyer'), '/buyer');
  assert.equal(buildSafeNextPath('/seller', '?tab=1'), '/seller?tab=1');
  assert.equal(buildSafeNextPath('/admin', 'section=users'), '/admin?section=users');
  assert.equal(buildLoginHref('/buyer'), '/auth/login?next=%2Fbuyer');
  assert.equal(
    buildLoginHref('/seller?tab=1'),
    '/auth/login?next=%2Fseller%3Ftab%3D1',
  );
  assert.equal(buildLoginHref('https://evil.example'), '/auth/login');
  assert.equal(buildLoginHref('//evil.example'), '/auth/login');
  assert.equal(buildSafeNextPath('https://evil.example'), null);
});

test('isRoleWorkspacePath distinguishes workspace chrome routes', () => {
  assert.equal(isRoleWorkspacePath('/buyer'), true);
  assert.equal(isRoleWorkspacePath('/seller/products'), true);
  assert.equal(isRoleWorkspacePath('/admin'), true);
  assert.equal(isRoleWorkspacePath('/'), false);
  assert.equal(isRoleWorkspacePath('/dashboard'), false);
  assert.equal(isRoleWorkspacePath('/unauthorized'), false);
});
