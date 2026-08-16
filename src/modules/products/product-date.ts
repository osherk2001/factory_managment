/**
 * Converts a date value into the canonical UTC representation used by the
 * Product API and idempotency hash.
 *
 * A datetime-local browser value is interpreted in the browser's local
 * timezone by the Date constructor. Server callers must pass an explicit
 * timezone or offset and are validated before calling this function.
 */
export function normalizeProductTargetAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid Product target date");
  }

  return date.toISOString();
}
