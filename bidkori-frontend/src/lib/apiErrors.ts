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
