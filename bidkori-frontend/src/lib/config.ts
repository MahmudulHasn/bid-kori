/**
 * Public runtime configuration for the BidKori frontend.
 * Only NEXT_PUBLIC_* values are available in the browser — never put secrets here.
 */

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api';
const DEFAULT_MEDIA_ORIGIN = 'http://127.0.0.1:8000';

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Django REST API root, e.g. http://127.0.0.1:8000/api */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) {
    return stripTrailingSlashes(fromEnv);
  }
  return DEFAULT_API_BASE_URL;
}

/**
 * Origin used to resolve relative media paths returned by the API.
 * Defaults to the API host with a trailing `/api` stripped.
 */
export function getMediaOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_MEDIA_ORIGIN?.trim();
  if (fromEnv) {
    return stripTrailingSlashes(fromEnv);
  }

  const apiBase = getApiBaseUrl();
  const withoutApi = apiBase.replace(/\/api$/i, '');
  if (withoutApi && withoutApi !== apiBase) {
    return withoutApi;
  }
  return DEFAULT_MEDIA_ORIGIN;
}
