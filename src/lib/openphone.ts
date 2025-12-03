const OPENPHONE_API_BASE_URL = 'https://api.openphone.com/v1';

export type OpenPhoneNumber = {
  id: string;
  phoneNumber: string;
  formattedNumber: string;
  name?: string | null;
  createdAt?: string | null;
};

type OpenPhoneApiResponse = {
  data?: unknown[];
  error?: string;
  message?: string;
};

const normalizeApiKey = (apiKey: string) => apiKey.trim().replace(/^Bearer\s+/i, '');

const toAuthHeader = (apiKey: string) => apiKey;

const parseOpenPhoneError = async (response: Response) => {
  try {
    const body = (await response.json()) as { error?: string; message?: string; errors?: Array<{ message?: string }> };
    const message = body?.error || body?.message || body?.errors?.[0]?.message;
    if (message) return message;
  } catch (error) {
    // ignore JSON parsing errors and fall through to the default message
  }

  return `OpenPhone API request failed with status ${response.status}`;
};

const openPhoneRequest = async <T>(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<T> => {
  const sanitizedKey = normalizeApiKey(apiKey);

  if (!sanitizedKey) {
    throw new Error('OpenPhone API key is required.');
  }

  const response = await fetch(`${OPENPHONE_API_BASE_URL}${path}`, {
    method: 'GET',
    ...init,
    headers: {
      Authorization: toAuthHeader(sanitizedKey),
      'X-Api-Key': sanitizedKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await parseOpenPhoneError(response);
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
};

const normalizeOpenPhoneNumber = (input: any): OpenPhoneNumber => {
  const phoneNumber = input?.phoneNumber ?? input?.phone_number ?? '';
  const formattedNumber = input?.formattedNumber ?? input?.formatted_number ?? phoneNumber ?? '';

  return {
    id: String(input?.id ?? ''),
    phoneNumber,
    formattedNumber,
    name: input?.name ?? input?.label ?? null,
    createdAt: input?.createdAt ?? input?.created_at ?? null,
  };
};

export const fetchOpenPhoneNumbers = async (apiKey: string): Promise<OpenPhoneNumber[]> => {
  const payload = await openPhoneRequest<OpenPhoneApiResponse>('/phone-numbers', apiKey);
  const numbers = Array.isArray(payload.data) ? payload.data : [];
  return numbers.map(normalizeOpenPhoneNumber);
};

export const validateOpenPhoneApiKey = async (apiKey: string): Promise<void> => {
  await openPhoneRequest('/phone-numbers', apiKey);
};

export const sendOpenPhoneMessage = async (params: {
  apiKey: string;
  from: string;
  to: string;
  content: string;
}) => {
  const { apiKey, from, to, content } = params;

  if (!from.trim()) {
    throw new Error('OpenPhone "from" number is required.');
  }

  if (!to.trim()) {
    throw new Error('Recipient phone number is required.');
  }

  if (!content.trim()) {
    throw new Error('Message content is required.');
  }

  return openPhoneRequest('/messages', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      from,
      to: [to],
      content,
    }),
  });
};

export { normalizeApiKey };
