// Utility for error message extraction and formatting
export function extractErrorMessage(e: any, fallback: string = 'An error occurred'): string {
  if (!e) return fallback;
  if (typeof e === 'string') return e;
  if (e.message) return e.message;
  if (e.error) return e.error;
  return fallback;
}
