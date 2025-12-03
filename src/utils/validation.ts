/**
 * Regular expression to validate UUID v4 format
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and sanitizes a user ID to ensure it's a valid UUID.
 * @param value - The value to validate as a user ID
 * @returns The validated UUID string, or null if invalid
 */
export const sanitizeUserId = (value: unknown): string | null => {
  if (typeof value === 'string' && UUID_REGEX.test(value)) {
    return value;
  }
  return null;
};
