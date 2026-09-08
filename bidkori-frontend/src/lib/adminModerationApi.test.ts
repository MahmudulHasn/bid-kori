import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModerationReasonBody } from './adminModeration.ts';
import {
  buildAdminAuctionCancelApiPath,
  buildAdminAuctionHideApiPath,
  buildAdminAuctionRestoreApiPath,
  buildAdminProductHideApiPath,
  buildAdminProductRestoreApiPath,
} from './adminModerationApi.ts';

test('product hide path', () => {
  assert.equal(buildAdminProductHideApiPath(3), '/admin/products/3/hide/');
});

test('product hide body contains only reason', () => {
  const body = buildModerationReasonBody('Policy violation');
  assert.deepEqual(body, { reason: 'Policy violation' });
  assert.deepEqual(Object.keys(body), ['reason']);
});

test('product restore path', () => {
  assert.equal(
    buildAdminProductRestoreApiPath(3),
    '/admin/products/3/restore/',
  );
});

test('product restore empty body', () => {
  assert.deepEqual(buildModerationReasonBody(''), {});
  assert.deepEqual(buildModerationReasonBody('   '), {});
});

test('auction hide path', () => {
  assert.equal(buildAdminAuctionHideApiPath(9), '/admin/auctions/9/hide/');
});

test('auction restore path', () => {
  assert.equal(
    buildAdminAuctionRestoreApiPath(9),
    '/admin/auctions/9/restore/',
  );
});

test('auction cancel path', () => {
  assert.equal(buildAdminAuctionCancelApiPath(9), '/admin/auctions/9/cancel/');
});

test('auction cancel body contains only reason', () => {
  const body = buildModerationReasonBody('Prohibited listing');
  assert.deepEqual(body, { reason: 'Prohibited listing' });
  assert.deepEqual(Object.keys(body), ['reason']);
  assert.equal('status' in body, false);
  assert.equal('is_hidden' in body, false);
  assert.equal('winner' in body, false);
});
