import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildModerationReasonBody } from './adminModeration.ts';
import {
  buildAdminAuctionCancelApiPath,
  buildAdminAuctionHideApiPath,
  buildAdminAuctionRestoreApiPath,
  buildAdminProductHideApiPath,
  buildAdminProductRestoreApiPath,
} from './adminModeration.ts';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'adminModerationApi.ts'), 'utf8');

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

test('adminModerationApi wires hide/restore/cancel helpers via shared api client', () => {
  assert.match(source, /hideAdminProduct/);
  assert.match(source, /restoreAdminProduct/);
  assert.match(source, /hideAdminAuction/);
  assert.match(source, /restoreAdminAuction/);
  assert.match(source, /cancelAdminAuction/);
  assert.match(source, /api\.post/);
  assert.doesNotMatch(source, /localStorage|TOKEN_KEY/);
});
