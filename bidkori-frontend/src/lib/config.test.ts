import assert from 'node:assert/strict';
import test from 'node:test';

import { getApiBaseUrl, getMediaOrigin } from './config.ts';

test('getApiBaseUrl defaults for local development', () => {
  const previous = process.env.NEXT_PUBLIC_API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  assert.equal(getApiBaseUrl(), 'http://127.0.0.1:8000/api');
  if (previous === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_API_BASE_URL = previous;
  }
});

test('getApiBaseUrl reads NEXT_PUBLIC_API_BASE_URL', () => {
  const previous = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'http://api.example.test/api/';
  assert.equal(getApiBaseUrl(), 'http://api.example.test/api');
  if (previous === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_API_BASE_URL = previous;
  }
});

test('getMediaOrigin derives from API base when unset', () => {
  const previousApi = process.env.NEXT_PUBLIC_API_BASE_URL;
  const previousMedia = process.env.NEXT_PUBLIC_MEDIA_ORIGIN;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8000/api';
  delete process.env.NEXT_PUBLIC_MEDIA_ORIGIN;
  assert.equal(getMediaOrigin(), 'http://127.0.0.1:8000');
  if (previousApi === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_API_BASE_URL = previousApi;
  }
  if (previousMedia === undefined) {
    delete process.env.NEXT_PUBLIC_MEDIA_ORIGIN;
  } else {
    process.env.NEXT_PUBLIC_MEDIA_ORIGIN = previousMedia;
  }
});
