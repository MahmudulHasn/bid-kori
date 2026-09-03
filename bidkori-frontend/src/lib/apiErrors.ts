function firstStringError(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) {
    return value[0];
  }
  return undefined;
}

/**
 * BidKori wraps DRF validation as `{ status_code, error: <string|field map> }`.
 * Fall back to the raw body when field errors sit at the top level.
 */
function getErrorPayload(
  error: unknown,
): Record<string, unknown> | null {
  const data = (error as { response?: { data?: Record<string, unknown> } })
    ?.response?.data;
  if (!data || typeof data !== 'object') return null;
  if (
    data.error &&
    typeof data.error === 'object' &&
    !Array.isArray(data.error)
  ) {
    return data.error as Record<string, unknown>;
  }
  return data;
}

/** Extract a user-facing message from a DRF/Axios error payload. */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const data = (error as { response?: { data?: Record<string, unknown> } })
    ?.response?.data;
  if (!data) return fallback;

  if (typeof data.error === 'string' && data.error) return data.error;
  if (typeof data.detail === 'string' && data.detail) return data.detail;

  if (
    data.error &&
    typeof data.error === 'object' &&
    !Array.isArray(data.error)
  ) {
    for (const value of Object.values(data.error as Record<string, unknown>)) {
      const message = firstStringError(value);
      if (message) return message;
    }
  }

  return fallback;
}

export function getApiStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/** First DRF field error for known keys. Does not mutate the payload. */
export function getApiFieldErrors(
  error: unknown,
  fields: readonly string[],
): Record<string, string> {
  const payload = getErrorPayload(error);
  if (!payload) return {};

  const result: Record<string, string> = {};
  for (const field of fields) {
    const message = firstStringError(payload[field]);
    if (message) result[field] = message;
  }
  return result;
}

/** True when create failed because the Product already has an Auction. */
export function isAuctionProductConflictError(error: unknown): boolean {
  if (getApiStatus(error) !== 400) return false;
  const message = getApiErrorMessage(error, '').toLowerCase();
  const field = getApiFieldErrors(error, ['product']).product?.toLowerCase() ?? '';
  return (
    message.includes('already has an auction') ||
    field.includes('already has an auction')
  );
}
