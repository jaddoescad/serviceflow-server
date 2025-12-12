/**
 * Formats a number as currency with dollar sign and two decimal places.
 * @param value - The number to format
 * @returns Formatted currency string (e.g., "$123.45")
 */
export const formatCurrency = (value: number): string => {
  return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
};

/**
 * Formats a phone number to E.164 format for SMS.
 * Handles US/Canada phone numbers.
 * @param input - Phone number in various formats
 * @returns Formatted phone number in E.164 format (+1XXXXXXXXXX), empty string if invalid
 */
export const formatSmsRecipient = (input: string): string => {
  if (!input) return '';

  const trimmed = input.trim();

  // Accept already formatted E.164
  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  // Strip all non-digits and normalize US/CA numbers
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return '';
};
