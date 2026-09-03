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
  const data = (error as { response?: { data?: Record<string, unknown> } })
    ?.response?.data;
  if (!data || typeof data !== 'object') return {};

  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) {
      result[field] = value;
    } else if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) {
      result[field] = value[0];
    }
  }
  return result;
}
